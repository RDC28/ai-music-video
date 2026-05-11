"""
Character Sheet Splitter — Python microservice
Stage 1: scikit-image / OpenCV connected-component detection (any separator color)
Stage 2: Gemini vision fallback (handles borderless / irregular collages)

Run with:  uvicorn main:app --port 8001 --reload
"""

import os, base64, json, logging
from pathlib import Path
from typing import Any
from scipy.ndimage import gaussian_filter1d

# Load .env.local from the project root if present (so `npm run py` works without export)
_env_file = Path(__file__).parent.parent / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        if _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from shotstack_editor import (
    ShotstackHelperError,
    build as build_shotstack_edit,
    render as render_shotstack_edit,
    status as shotstack_render_status,
)

# ─── Setup ────────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Character Sheet Splitter")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY", "")
_gemini_client = genai.Client(api_key=GOOGLE_AI_API_KEY) if GOOGLE_AI_API_KEY else None

# ─── Models ───────────────────────────────────────────────────────────────────

class SplitRequest(BaseModel):
    imageBase64: str
    mimeType: str = "image/jpeg"

# ─── Stage 1 helpers ─────────────────────────────────────────────────────────

def _sample_background(img_bgr: np.ndarray) -> np.ndarray:
    """
    Estimate background color by sampling the outer border of the image.
    Robust against images where corners are occupied by content.
    """
    h, w = img_bgr.shape[:2]
    border = max(8, min(h, w) // 40)

    strips = [
        img_bgr[:border, :],            # top
        img_bgr[-border:, :],           # bottom
        img_bgr[:, :border],            # left
        img_bgr[:, -border:],           # right
    ]
    pixels = np.vstack([s.reshape(-1, 3) for s in strips])
    return np.median(pixels, axis=0).astype(np.float32)


def _content_mask(img_bgr: np.ndarray, bg_bgr: np.ndarray) -> np.ndarray:
    """
    Pixels that differ from the background in LAB space → 255 (content).
    LAB is perceptually uniform, so it handles any background color.
    """
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    bg_pixel = np.array([[bg_bgr]], dtype=np.uint8)
    bg_lab = cv2.cvtColor(bg_pixel, cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)

    diff = np.sqrt(np.sum((img_lab - bg_lab) ** 2, axis=2))

    # Adaptive: keep pixels in the top 60% of diff values as "content"
    p25 = float(np.percentile(diff, 25))
    threshold = max(18.0, p25 + 8.0)
    mask = (diff > threshold).astype(np.uint8) * 255
    return mask


def _find_components(mask: np.ndarray, h: int, w: int,
                     close_px: int, min_area_frac: float) -> list[dict]:
    """
    Close small holes, find connected components, filter by area.
    """
    kernel = np.ones((close_px, close_px), np.uint8)
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Small open to remove isolated noise
    open_px = max(4, close_px // 4)
    kernel2 = np.ones((open_px, open_px), np.uint8)
    cleaned = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel2)

    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(cleaned)

    min_area = h * w * min_area_frac
    panels: list[dict] = []

    for i in range(1, num_labels):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        x  = int(stats[i, cv2.CC_STAT_LEFT])
        y  = int(stats[i, cv2.CC_STAT_TOP])
        cw = int(stats[i, cv2.CC_STAT_WIDTH])
        ch = int(stats[i, cv2.CC_STAT_HEIGHT])

        # 1-pixel inward padding to avoid hairline border bleed
        pad = 1
        x  = min(w - 1, x + pad)
        y  = min(h - 1, y + pad)
        cw = max(1, cw - 2 * pad)
        ch = max(1, ch - 2 * pad)

        panels.append({
            "label": f"Panel {len(panels) + 1}",
            "box_2d": [
                round(y / h * 1000),
                round(x / w * 1000),
                round((y + ch) / h * 1000),
                round((x + cw) / w * 1000),
            ]
        })

    return panels


def _sort_panels(panels: list[dict]) -> list[dict]:
    """Left-to-right, top-to-bottom with a 80-unit row tolerance."""
    return sorted(panels, key=lambda p: (p["box_2d"][0] // 80, p["box_2d"][1]))


def _filter_quality(panels: list[dict], img_bgr: np.ndarray, bg_bgr: np.ndarray) -> list[dict]:
    """
    Drop panels that are almost certainly background/separator artifacts:
      1. Extreme aspect ratio (< 0.12 or > 8)  → thin separator strip
      2. Too small (< 4 % of image in either dimension)
      3. < 12 % of pixels differ from background color (mostly blank)
    """
    h, w = img_bgr.shape[:2]
    kept = []
    for p in panels:
        ymin_n, xmin_n, ymax_n, xmax_n = p["box_2d"]
        pw_n = xmax_n - xmin_n
        ph_n = ymax_n - ymin_n

        # Aspect ratio check (in normalised coords)
        ar = pw_n / max(ph_n, 1)
        if ar < 0.12 or ar > 8:
            log.info(f"  Quality-filter {p['label']}: aspect ratio {ar:.2f}")
            continue

        # Minimum size
        if pw_n < 40 or ph_n < 40:
            log.info(f"  Quality-filter {p['label']}: too small ({pw_n}×{ph_n})")
            continue

        # Content check on the actual crop
        y1 = int(ymin_n / 1000 * h)
        x1 = int(xmin_n / 1000 * w)
        y2 = int(ymax_n / 1000 * h)
        x2 = int(xmax_n / 1000 * w)
        crop = img_bgr[y1:y2, x1:x2]
        if crop.size == 0:
            continue
        mask = _content_mask(crop, bg_bgr)
        content_frac = float((mask > 0).mean())
        if content_frac < 0.12:
            log.info(f"  Quality-filter {p['label']}: {content_frac:.1%} content (too blank)")
            continue

        kept.append(p)
    return kept


def _nms(panels: list[dict], iou_thresh: float = 0.4) -> list[dict]:
    """
    Remove heavily overlapping boxes (keeps the larger one).
    Prevents double-counting when two kernel sizes produce near-identical boxes.
    """
    if len(panels) < 2:
        return panels

    def area(b):
        return max(0, b[2] - b[0]) * max(0, b[3] - b[1])

    def iou(a, b):
        yi1, xi1, yi2, xi2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
        inter = max(0, yi2 - yi1) * max(0, xi2 - xi1)
        union = area(a) + area(b) - inter
        return inter / union if union > 0 else 0

    keep = []
    sorted_p = sorted(panels, key=lambda p: -area(p["box_2d"]))
    suppressed = set()

    for i, p in enumerate(sorted_p):
        if i in suppressed:
            continue
        keep.append(p)
        for j, q in enumerate(sorted_p[i + 1:], start=i + 1):
            if iou(p["box_2d"], q["box_2d"]) > iou_thresh:
                suppressed.add(j)

    return keep

# ─── Stage 1: CV detection ───────────────────────────────────────────────────

def _separator_cuts(edge_count_profile: np.ndarray, total_size: int,
                    min_gap: int, other_dim: int) -> list[int]:
    """
    Find separator cut positions from an edge-row/column-count profile.

    `edge_count_profile[i]` = number of rows (or columns) that have ANY Canny
    edge pixel at position i along the scanned axis.

    Key robustness insight vs. simple sum-based approach:
      - A smooth face inside a portrait still has edges in 60-80 % of rows
        (hair at top, jewelry, clothing at bottom) → NOT flagged as separator.
      - A true white/black/any-colour gap has edges in < 5 % of rows (only
        stray JPEG noise) → correctly flagged as separator.

    Threshold: < 5 % of the perpendicular dimension has any edges.
    """
    smooth = gaussian_filter1d(edge_count_profile.astype(float), sigma=2)
    threshold = max(3.0, other_dim * 0.05)   # < 5 % of rows/cols = separator

    cuts  = [0]
    in_sep, sep_start = False, 0

    for i, v in enumerate(smooth):
        if v < threshold and not in_sep:
            in_sep, sep_start = True, i
        elif v >= threshold and in_sep:
            in_sep = False
            mid = (sep_start + i) // 2
            if mid - cuts[-1] >= min_gap and total_size - mid >= min_gap:
                cuts.append(mid)

    if cuts[-1] != total_size:
        cuts.append(total_size)
    return cuts


def _edge_density_grid(img_bgr: np.ndarray) -> list[dict]:
    """
    Three-level hierarchical separator scan using edge-ROW-COUNT profiles.

    At each level we ask: "how many perpendicular lines have ANY edge pixel
    at this position?"  A true gap has near-zero coverage; smooth photo areas
    still have edges in the majority of rows/columns.

    Level 1 — vertical separators across the full image  (main columns)
    Level 2 — horizontal separators within each column   (stacked sub-panels)
    Level 3 — vertical sub-separators within each cell   (2-across close-ups)
    """
    h, w = img_bgr.shape[:2]
    gray  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 20, 80)

    min_pw  = int(w * 0.04)   # minimum panel width  (4 % of image)
    min_ph  = int(h * 0.04)   # minimum panel height (4 % of image)
    min_sub = int(w * 0.03)   # minimum sub-panel width

    panels: list[dict] = []

    def has_content(region: np.ndarray) -> bool:
        return bool(region.mean() > 0.5)

    # ── Level 1: vertical cuts ────────────────────────────────────────────────
    # Profile: number of rows that have any edge at each column position
    v_profile = (edges > 0).sum(axis=0).astype(float)
    v_cuts    = _separator_cuts(v_profile, w, min_gap=min_pw, other_dim=h)

    for j in range(len(v_cuts) - 1):
        x1, x2   = v_cuts[j], v_cuts[j + 1]
        col_edges = edges[:, x1:x2]

        if (x2 - x1) < min_pw or not has_content(col_edges):
            continue

        # ── Level 2: horizontal cuts within this column ───────────────────────
        # Profile: number of columns that have any edge at each row position
        h_profile = (col_edges > 0).sum(axis=1).astype(float)
        h_cuts    = _separator_cuts(h_profile, h, min_gap=min_ph, other_dim=x2 - x1)

        for i in range(len(h_cuts) - 1):
            y1, y2     = h_cuts[i], h_cuts[i + 1]
            cell_edges = col_edges[y1:y2, :]

            if (y2 - y1) < min_ph or not has_content(cell_edges):
                continue

            # ── Level 3: vertical sub-cuts within this cell ───────────────────
            sv_profile = (cell_edges > 0).sum(axis=0).astype(float)
            sv_cuts    = _separator_cuts(sv_profile, x2 - x1, min_gap=min_sub,
                                         other_dim=y2 - y1)

            if len(sv_cuts) > 2:
                for k in range(len(sv_cuts) - 1):
                    sx1, sx2  = sv_cuts[k], sv_cuts[k + 1]
                    sub_edges = cell_edges[:, sx1:sx2]
                    if (sx2 - sx1) < min_sub or not has_content(sub_edges):
                        continue
                    panels.append({
                        "label": f"Panel {len(panels) + 1}",
                        "box_2d": [
                            round(y1 / h * 1000),
                            round((x1 + sx1) / w * 1000),
                            round(y2 / h * 1000),
                            round((x1 + sx2) / w * 1000),
                        ]
                    })
            else:
                panels.append({
                    "label": f"Panel {len(panels) + 1}",
                    "box_2d": [
                        round(y1 / h * 1000), round(x1 / w * 1000),
                        round(y2 / h * 1000), round(x2 / w * 1000),
                    ]
                })

    log.info(f"  edge-grid → {len(panels)} panels")
    return panels


def detect_panels_cv(img_bgr: np.ndarray) -> list[dict]:
    """
    Two complementary strategies; picks whichever finds the most panels in [3, 20].

    Strategy A — background subtraction + connected components:
      Best when separator color is clearly distinct from photo content.

    Strategy B — edge-density hierarchical grid:
      Best when background blends with content (white veil on white bg, etc.)
      because it uses edge counts, not color distance. Also handles asymmetric
      layouts where only some columns have sub-rows (e.g. right-side close-ups).
    """
    h, w     = img_bgr.shape[:2]
    shortest = min(h, w)
    best: list[dict] = []

    def _update_best(candidate: list[dict], tag: str) -> None:
        nonlocal best
        candidate = _nms(candidate)
        log.info(f"  {tag} → {len(candidate)} panels")
        if 3 <= len(candidate) <= 20 and len(candidate) > len(best):
            best = candidate

    # ── Strategy A: background-subtraction connected components ──
    bg_bgr = _sample_background(img_bgr)
    mask   = _content_mask(img_bgr, bg_bgr)
    for k in [max(8, shortest // 100), max(15, shortest // 55), max(25, shortest // 30)]:
        _update_best(
            _find_components(mask, h, w, close_px=k, min_area_frac=0.02),
            f"bg-cc kernel={k}px"
        )

    # ── Strategy B: edge-density hierarchical grid ──
    _update_best(_edge_density_grid(img_bgr), "edge-grid")

    log.info(f"[CV] Best result: {len(best)} panels")
    return _sort_panels(best)

# ─── Label assignment (for CV-detected panels) ───────────────────────────────

_LABEL_PROMPT = """\
You are looking at a CHARACTER DESIGN REFERENCE SHEET image.
I have already detected {n} panels. Their positions (normalised 0-1000 coords [ymin,xmin,ymax,xmax]):

{panel_list}

For EACH panel in the order listed, assign a short descriptive label.
Choose from: FRONT VIEW, LEFT PROFILE, RIGHT PROFILE, BACK VIEW, 3/4 LEFT, 3/4 RIGHT, \
MID PORTRAIT, CLOSE-UP FRONT, CLOSE-UP BACK, CLOSE-UP 3/4 LEFT, CLOSE-UP 3/4 RIGHT, DETAIL SHOT, FULL BODY

Return ONLY a JSON array of exactly {n} label strings in the same order. No markdown, no explanation.
Example for 3 panels: ["FRONT VIEW","LEFT PROFILE","CLOSE-UP FRONT"]"""


def _label_panels(panels: list[dict], image_bytes: bytes, mime_type: str) -> list[dict]:
    """Call Gemini to assign descriptive labels to CV-detected (generically numbered) panels."""
    if not _gemini_client or not panels:
        return panels
    panel_list = "\n".join(f"  {i+1}: {p['box_2d']}" for i, p in enumerate(panels))
    prompt = _LABEL_PROMPT.format(n=len(panels), panel_list=panel_list)
    try:
        result = _gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime_type)],
            config=types.GenerateContentConfig(thinking_config=types.ThinkingConfig(thinking_budget=0)),
        )
        text = result.text.strip()
        labels: list[str] = json.loads(text[text.index('['):text.rindex(']') + 1])
        if len(labels) == len(panels):
            labeled = [{**p, "label": str(lbl).upper().strip()} for p, lbl in zip(panels, labels)]
            log.info(f"[Labels] {[p['label'] for p in labeled]}")
            return labeled
    except Exception as e:
        log.warning(f"[Labels] failed: {e}")
    return panels

# ─── Stage 2: Gemini fallback ────────────────────────────────────────────────

GEMINI_PROMPT = """You are analyzing a CHARACTER DESIGN REFERENCE SHEET — a single composite image that contains multiple individual photographs of the same character arranged side-by-side.

YOUR TASK: Return a bounding box for EVERY individual photograph in the image.

CRITICAL RULES:
1. ONE photograph = ONE bounding box. Never combine two photographs into one box.
2. Two photos placed side-by-side horizontally → TWO separate boxes, one for each.
3. Two photos stacked vertically → TWO separate boxes, one for each.
4. A 2×2 grid of four small photos → FOUR separate boxes.
5. Include every panel — full-body shots AND small close-up crops.
6. If a region looks like it has 2 faces or 2 distinct poses, it is 2 panels.
7. Boxes must be tight around each individual photo (do not include adjacent photos).
8. Do NOT split one continuous photograph into multiple boxes.
9. Character sheets typically have 6–12 panels. If you find fewer than 6, look again.

STEP-BY-STEP (think before outputting):
A. Count the number of distinct person-views you can see (each angle/framing = 1).
B. Locate the exact pixel boundary of each one.
C. Output a box for each.

For every panel:
  "label"  : describe the framing (e.g. "FRONT VIEW", "LEFT PROFILE", "BACK VIEW", "FACE CLOSE-UP FRONT", "FACE CLOSE-UP BACK", "3/4 LEFT", "3/4 RIGHT")
  "box_2d" : [ymin, xmin, ymax, xmax] — integers 0–1000

Return ONLY a valid JSON array, no markdown, no explanation."""


def detect_panels_gemini(image_bytes: bytes, mime_type: str) -> list[dict]:
    if not _gemini_client:
        raise RuntimeError("GOOGLE_AI_API_KEY not set — Gemini fallback unavailable")

    result = _gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            GEMINI_PROMPT,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
    )

    text = result.text.strip()
    start = text.index('[')
    end   = text.rindex(']') + 1
    panels: list[dict] = json.loads(text[start:end])

    # Clamp coordinates
    for p in panels:
        b = p["box_2d"]
        p["box_2d"] = [
            max(0, min(1000, b[0])),
            max(0, min(1000, b[1])),
            max(0, min(1000, b[2])),
            max(0, min(1000, b[3])),
        ]

    panels = _nms(panels)
    log.info(f"[Gemini] Found {len(panels)} panels")
    return _sort_panels(panels)

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/split")
async def split_sheet(req: SplitRequest):
    try:
        image_bytes = base64.b64decode(req.imageBase64)
        arr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if img_bgr is None:
            raise ValueError("Could not decode image — unsupported format?")

        h, w = img_bgr.shape[:2]
        log.info(f"[Split] Image size: {w}×{h}")
        bg_bgr = _sample_background(img_bgr)

        # ── Stage 1 ──
        panels = detect_panels_cv(img_bgr)
        stage  = "cv"

        # ── Stage 2 fallback ──
        if len(panels) < 3:
            log.info(f"[Fallback] CV found {len(panels)} — invoking Gemini")
            try:
                panels = detect_panels_gemini(image_bytes, req.mimeType)
                stage  = "gemini"
            except Exception as e:
                log.warning(f"Gemini fallback error: {e}")
                if not panels:
                    raise

        # ── Quality filter (both stages) ──
        before = len(panels)
        panels = _filter_quality(panels, img_bgr, bg_bgr)
        if len(panels) != before:
            log.info(f"[Quality] Removed {before - len(panels)} blank/artifact panels → {len(panels)} remain")

        # ── Label CV panels via Gemini (Gemini stage already returns descriptive labels) ──
        if stage == "cv" and panels:
            panels = _label_panels(panels, image_bytes, req.mimeType)

        log.info(f"[Done] stage={stage}  panels={len(panels)}")
        return {"success": True, "panels": panels, "stage": stage, "count": len(panels)}

    except Exception as e:
        log.error(f"Split failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _shotstack_http_error(error: Exception) -> HTTPException:
    if isinstance(error, ShotstackHelperError):
        return HTTPException(status_code=error.status, detail=str(error))
    return HTTPException(status_code=500, detail=str(error))


@app.post("/shotstack/build")
async def shotstack_build(req: dict[str, Any]):
    try:
        return build_shotstack_edit(req)
    except Exception as e:
        log.error(f"Shotstack build failed: {e}", exc_info=True)
        raise _shotstack_http_error(e)


@app.post("/shotstack/render")
async def shotstack_render(req: dict[str, Any]):
    try:
        return render_shotstack_edit(req)
    except Exception as e:
        log.error(f"Shotstack render failed: {e}", exc_info=True)
        raise _shotstack_http_error(e)


@app.post("/shotstack/status")
async def shotstack_status(req: dict[str, Any]):
    try:
        return shotstack_render_status(req)
    except Exception as e:
        log.error(f"Shotstack status failed: {e}", exc_info=True)
        raise _shotstack_http_error(e)


@app.get("/health")
def health():
    return {"status": "ok"}
