'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Loader2, Wand2 } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import ProgressBar from '../ProgressBar';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_BTN = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#bbb',
  padding: '7px 12px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.03em',
};

const PANEL_LABELS = [
  'Wide Shot', 'Close-up Detail', 'Interior View', 'Exterior View', 'Atmosphere', 'Golden Hour', 'Night Shot', 'Aerial View', 'Ground Level',
];

const LOCATION_REFERENCE_VIEWS = [
  {
    label: 'ESTABLISHING VIEW',
    prompt: 'Wide cinematic establishing view, clear full environment layout, exact architecture, materials, color palette, geography, and atmosphere.',
  },
  {
    label: 'INTERIOR WIDE',
    prompt: 'Interior wide-angle view, same architecture and material language, clear spatial layout, matching lighting logic and atmosphere.',
  },
  {
    label: 'EXTERIOR VIEW',
    prompt: 'Exterior elevation view, same building or environment identity, exact materials, signage, palette, geography, and weathering.',
  },
  {
    label: 'AERIAL VIEW',
    prompt: 'Birds-eye or high aerial view, same location footprint and surrounding context, exact geometry and environmental details.',
  },
  {
    label: 'GROUND LEVEL',
    prompt: 'Ground-level human-eye view, same location identity, matching scale, textures, props, vegetation, and lighting.',
  },
  {
    label: 'DETAIL VIEW',
    prompt: 'Close-up detail view of signature architecture, surface texture, props, signage, or environmental feature, exactly matching the location style.',
  },
  {
    label: 'ATMOSPHERE VIEW',
    prompt: 'Atmospheric cinematic view with haze, rain, dust, or sunset mood while preserving exact location architecture, palette, and geography.',
  },
  {
    label: 'NIGHT VIEW',
    prompt: 'Night lighting study of the same location, exact architecture and props, consistent palette, practical lights and shadows.',
  },
  {
    label: 'FOCAL POINT',
    prompt: 'Focused view of the most story-relevant area of the location, same set dressing, materials, and camera-ready composition.',
  },
];

const LOCATION_STEPS = [
  'Locking location identity',
  ...LOCATION_REFERENCE_VIEWS.map(view => `Creating ${view.label.toLowerCase()}`),
  'Saving to library',
];

const PINBOARD_WIDTH = 2016;
const PINBOARD_HEIGHT = 700;
const PINBOARD_PADDING = 28;
const PINBOARD_GAP = 14;
const DEFAULT_COLLAGE_RATIO = 1;
const LOCATION_DESCRIPTION_DISPLAY_LIMIT = 360;
const LOCATION_LABEL_FALLBACKS = [
  'ESTABLISHING VIEW',
  'INTERIOR VIEW',
  'EXTERIOR VIEW',
  'DETAIL VIEW',
  'ATMOSPHERE VIEW',
  'WIDE ANGLE',
  'AERIAL VIEW',
  'GROUND LEVEL',
  'NIGHT VIEW',
  'ALT VIEW',
];
const CHARACTER_STYLE_LABELS = [
  'FULL BODY',
  'MID PORTRAIT',
  'PORTRAIT',
  'FRONT VIEW',
  'BACK VIEW',
  'LEFT PROFILE',
  'RIGHT PROFILE',
  'SIDE VIEW',
  'FACE',
  '3/4',
  'CUSTOM CROP',
  'POSE',
];

const buildLocationSheetPrompt = (desc, hasRef) => {
  const locClause = hasRef
    ? 'of the environment shown in the reference image'
    : `of this location: ${desc}`;
  return `Professional location design reference sheet. A single wide 21:9 horizontal canvas with 9 clearly separated panels on a dark neutral or cinematic studio backdrop.

Panel layout:
- Far left: one large wide-angle cinematic establishing shot
- Center column: four distinct views — interior wide, exterior elevation, bird's-eye view, and ground level view
- Top right: close-up texture or architectural detail
- Middle right: atmospheric view (foggy, rainy, or sunset)
- Bottom right left: interior focal point or detail
- Bottom right right: evening or night-time lighting study

Location ${locClause}.

Maintain perfectly consistent architectural style, materials, and environmental details across all 9 panels. Clean visible spacing between panels. Cinematic lighting throughout. Professional concept art/architectural visualization quality.`;
};

function compactScriptText(value, maxLength = 700) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function truncateLocationDescription(value, maxLength = LOCATION_DESCRIPTION_DISPLAY_LIMIT) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function buildScriptLocationDescription(location = {}, projectState = {}) {
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};
  const sourceDescription = (
    location.visual_prompt ||
    location.prompt ||
    location.description ||
    location.role ||
    ''
  );

  return [
    sourceDescription,
    script.title ? `Music video title: ${script.title}` : '',
    script.storyline ? `Story context: ${compactScriptText(script.storyline, 520)}` : '',
    script.mood || analysis.mood ? `Mood and atmosphere: ${compactScriptText(script.mood || analysis.mood, 240)}` : '',
    analysis.genre || analysis.theme ? `Genre/theme: ${compactScriptText(analysis.genre || analysis.theme, 180)}` : '',
    'Create a production-ready location reference set for this music video. The place must remain stable across every view: same architecture, geography, materials, props, era, palette, weather logic, and lighting language.',
  ].filter(Boolean).join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _renderedRect(img, containerW, containerH) {
  const natAR = img.naturalWidth / img.naturalHeight;
  const cAR = containerW / containerH;
  let rendW, rendH, offX, offY;
  if (natAR > cAR) {
    rendW = containerW; rendH = containerW / natAR;
    offX = 0; offY = (containerH - rendH) / 2;
  } else {
    rendH = containerH; rendW = containerH * natAR;
    offX = (containerW - rendW) / 2; offY = 0;
  }
  return { offX, offY, rendW, rendH };
}

function getImageRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_COLLAGE_RATIO;
  return Math.max(0.2, Math.min(5, ratio));
}

function getStoredImageRatio(imageData) {
  if (!imageData || typeof imageData !== 'object') return null;

  if (Number.isFinite(imageData.width) && Number.isFinite(imageData.height) && imageData.height > 0) {
    return imageData.width / imageData.height;
  }

  if (Array.isArray(imageData.box_2d) && imageData.box_2d.length === 4) {
    const [ymin, xmin, ymax, xmax] = imageData.box_2d;
    const width = xmax - xmin;
    const height = ymax - ymin;
    if (width > 0 && height > 0) return width / height;
  }

  return null;
}

function normalizeLocationLabel(label, index) {
  const text = typeof label === 'string' ? label.trim().toUpperCase() : '';
  const isCharacterLabel = CHARACTER_STYLE_LABELS.some(term => text.includes(term));
  const isTooGeneric = !text || /^ZONE\s*\d*$/i.test(text) || /^VIEW\s*\d*$/i.test(text) || /^NEW\s+VIEW\s*\d*$/i.test(text) || /^SECTION\s*\d*$/i.test(text);

  if (isCharacterLabel || isTooGeneric) {
    return LOCATION_LABEL_FALLBACKS[index % LOCATION_LABEL_FALLBACKS.length];
  }

  return text;
}

function parseLocationImage(img, index) {
  const text = typeof img === 'string' ? img.trim() : '';
  let parsed = null;

  if (text.charAt(0) === '{') {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  const imageData = parsed || (img && typeof img === 'object' ? img : null);
  const src = imageData ? (imageData.url || null) : (text.charAt(0) === '{' ? null : text || null);
  const label = normalizeLocationLabel(imageData?.label, index);

  return { imageData, src, label };
}

function getPinboardImageSize(ratio, count, index, scale = 1) {
  const safeRatio = getImageRatio(ratio);
  const boardArea = PINBOARD_WIDTH * PINBOARD_HEIGHT;
  const fill = count === 1 ? 0.25 : Math.min(0.13, Math.max(0.065, 0.56 / Math.max(1, count)));
  const emphasis = index === 0 ? 1.12 : index % 3 === 0 ? 1.04 : 1;
  const area = boardArea * fill * emphasis * scale * scale;
  let width = Math.sqrt(area * safeRatio);
  let height = width / safeRatio;
  const usableWidth = PINBOARD_WIDTH - PINBOARD_PADDING * 2;
  const usableHeight = PINBOARD_HEIGHT - PINBOARD_PADDING * 2;
  const maxWidth = Math.min(usableWidth, count === 1 ? 820 : index === 0 ? 620 : 560);
  const maxHeight = Math.min(usableHeight, count === 1 ? 620 : index === 0 ? 560 : 520);
  const maxScale = Math.min(1, maxWidth / width, maxHeight / height);
  width *= maxScale;
  height *= maxScale;
  const minShortSide = count <= 1 ? 150 : count <= 4 ? 118 : count <= 8 ? 92 : 74;
  const shortSide = Math.min(width, height);
  if (shortSide < minShortSide) {
    const growScale = minShortSide / shortSide;
    width *= growScale;
    height *= growScale;
  }

  return { width, height };
}

function getPinboardCandidates() {
  const cx = PINBOARD_WIDTH / 2;
  const cy = PINBOARD_HEIGHT / 2;
  const candidates = [{ x: cx, y: cy }];
  const directions = [
    0, Math.PI, -Math.PI / 2, Math.PI / 2,
    -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4,
    -Math.PI / 8, Math.PI / 8, -7 * Math.PI / 8, 7 * Math.PI / 8,
  ];

  for (let radius = 210; radius <= 980; radius += 115) {
    directions.forEach(angle => {
      candidates.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.62,
      });
    });
  }

  return candidates;
}

function boxesOverlap(a, b, gap = PINBOARD_GAP) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function getOverlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function fitsPinboard(box) {
  return (
    box.x >= PINBOARD_PADDING &&
    box.y >= PINBOARD_PADDING &&
    box.x + box.width <= PINBOARD_WIDTH - PINBOARD_PADDING &&
    box.y + box.height <= PINBOARD_HEIGHT - PINBOARD_PADDING
  );
}

function tryBuildPinboard(items, sizeScale) {
  const candidates = getPinboardCandidates();
  const placed = [];

  for (const item of items) {
    const size = getPinboardImageSize(item.ratio, items.length, item.index, sizeScale);
    let best = null;

    candidates.forEach(candidate => {
      const box = {
        ...item,
        x: candidate.x - size.width / 2,
        y: candidate.y - size.height / 2,
        width: size.width,
        height: size.height,
      };
      if (!fitsPinboard(box)) return;

      const overlap = placed.reduce((sum, placedBox) => sum + getOverlapArea(box, placedBox), 0);
      const hasOverlap = placed.some(placedBox => boxesOverlap(box, placedBox));
      const centerDistance = Math.hypot(candidate.x - PINBOARD_WIDTH / 2, candidate.y - PINBOARD_HEIGHT / 2);
      const score = overlap * 40 + (hasOverlap ? 100000 : 0) + centerDistance;

      if (!best || score < best.score) best = { ...box, score, hasOverlap };
    });

    if (!best) return null;
    placed.push(best);
  }

  if (placed.length <= 1) return placed;

  const bounds = placed.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.x),
    minY: Math.min(acc.minY, box.y),
    maxX: Math.max(acc.maxX, box.x + box.width),
    maxY: Math.max(acc.maxY, box.y + box.height),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const groupWidth = bounds.maxX - bounds.minX;
  const groupHeight = bounds.maxY - bounds.minY;
  const targetX = (PINBOARD_WIDTH - groupWidth) / 2;
  const targetY = (PINBOARD_HEIGHT - groupHeight) / 2;
  let dx = targetX - bounds.minX;
  let dy = targetY - bounds.minY;

  dx = Math.max(PINBOARD_PADDING - bounds.minX, Math.min(dx, PINBOARD_WIDTH - PINBOARD_PADDING - bounds.maxX));
  dy = Math.max(PINBOARD_PADDING - bounds.minY, Math.min(dy, PINBOARD_HEIGHT - PINBOARD_PADDING - bounds.maxY));

  return placed.map(box => ({ ...box, x: box.x + dx, y: box.y + dy }));
}

function buildPinboardLayout(items) {
  if (!items.length) return [];

  for (let scale = 1; scale >= 0.58; scale -= 0.06) {
    const placed = tryBuildPinboard(items, scale);
    if (placed && placed.every((box, index) => !placed.slice(0, index).some(other => boxesOverlap(box, other)))) {
      return placed;
    }
  }

  return tryBuildPinboard(items, 0.58) || [];
}

// ─── ZoomCropModal ────────────────────────────────────────────────────────────

function ZoomCropModal({ imageUrl, label, onClose, onApply, onDelete, initialBox, showLabelInput, recropUrl, recropBox }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [cropBox, setCropBox] = useState(null);
  const [cropMode, setCropMode] = useState(!!initialBox);
  const [applying, setApplying] = useState(false);
  const [editorImageUrl, setEditorImageUrl] = useState(imageUrl);
  const [editorInitialBox, setEditorInitialBox] = useState(initialBox || null);
  const [showEditorLabel, setShowEditorLabel] = useState(!!showLabelInput);
  const [labelInput, setLabelInput] = useState(label || '');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!editorInitialBox) return;
    const img = imgRef.current;
    if (!img) return;

    const apply = () => {
      const cRect = containerRef.current?.getBoundingClientRect();
      if (!cRect || !img.naturalWidth) return;
      const { offX, offY, rendW, rendH } = _renderedRect(img, cRect.width, cRect.height);
      const [ymin, xmin, ymax, xmax] = editorInitialBox;
      setCropBox({
        x: offX + (xmin / 1000) * rendW,
        y: offY + (ymin / 1000) * rendH,
        w: ((xmax - xmin) / 1000) * rendW,
        h: ((ymax - ymin) / 1000) * rendH,
      });
    };

    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  }, [editorInitialBox, editorImageUrl]);

  const onWheel = (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => Math.max(0.5, Math.min(10, z * f)));
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (cropMode) {
      setDrag({ type: 'crop', startX: x, startY: y });
      setCropBox({ x, y, w: 0, h: 0 });
    } else {
      setDrag({ type: 'pan', startX: e.clientX - pan.x, startY: e.clientY - pan.y });
    }
  };

  const onMouseMove = (e) => {
    if (!drag) return;
    if (drag.type === 'pan') {
      setPan({ x: e.clientX - drag.startX, y: e.clientY - drag.startY });
    } else {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCropBox({
        x: Math.min(x, drag.startX), y: Math.min(y, drag.startY),
        w: Math.abs(x - drag.startX), h: Math.abs(y - drag.startY),
      });
    }
  };

  const onMouseUp = () => setDrag(null);

  const applyCrop = () => {
    if (!cropBox || cropBox.w < 4 || cropBox.h < 4 || !imgRef.current) return;
    setApplying(true);
    const img = imgRef.current;
    const cRect = containerRef.current.getBoundingClientRect();
    const cw = cRect.width;
    const ch = cRect.height;
    const { offX, offY, rendW, rendH } = _renderedRect(img, cw, ch);

    const toImg = (px, py) => ({
      x: (cw / 2 + (px - cw / 2 - pan.x) / zoom - offX) / rendW * img.naturalWidth,
      y: (ch / 2 + (py - ch / 2 - pan.y) / zoom - offY) / rendH * img.naturalHeight,
    });

    const tl = toImg(cropBox.x, cropBox.y);
    const br = toImg(cropBox.x + cropBox.w, cropBox.y + cropBox.h);

    const natX = Math.max(0, tl.x);
    const natY = Math.max(0, tl.y);
    const natW = Math.min(img.naturalWidth - natX, br.x - tl.x);
    const natH = Math.min(img.naturalHeight - natY, br.y - tl.y);
    if (natW < 1 || natH < 1) { setApplying(false); return; }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(natW);
    canvas.height = Math.round(natH);
    const tmp = new Image();
    tmp.crossOrigin = 'anonymous';
    tmp.onload = () => {
      canvas.getContext('2d').drawImage(tmp, Math.round(natX), Math.round(natY), Math.round(natW), Math.round(natH), 0, 0, Math.round(natW), Math.round(natH));
      canvas.toBlob(blob => {
        onApply(blob, labelInput.trim() || label, { width: canvas.width, height: canvas.height });
        setApplying(false);
      }, 'image/jpeg', 0.95);
    };
    tmp.src = editorImageUrl;
  };

  const canApply = cropBox && cropBox.w > 4 && cropBox.h > 4;
  const viewingRecropSource = recropUrl && editorImageUrl === recropUrl;
  const openRecropSource = () => {
    setEditorImageUrl(recropUrl);
    setEditorInitialBox(recropBox || null);
    setShowEditorLabel(true);
    setCropMode(true);
    setCropBox(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const openCurrentImage = () => {
    setEditorImageUrl(imageUrl);
    setEditorInitialBox(null);
    setShowEditorLabel(false);
    setCropMode(false);
    setCropBox(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: '#444', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', marginRight: '4px' }}>{label?.toUpperCase()}</span>
        <span style={{ color: '#333', fontSize: '11px', marginRight: '4px' }}>Scroll to zoom · Drag to pan</span>
        <div style={{ width: '1px', height: '18px', background: '#222' }} />
        {recropUrl && (
          viewingRecropSource ? (
            <button onClick={openCurrentImage} style={MODAL_BTN}>View Image</button>
          ) : (
            <button onClick={openRecropSource} style={{ ...MODAL_BTN, background: 'var(--teal)', color: '#000', border: '1px solid var(--teal)' }}>
              Re-crop
            </button>
          )
        )}
        <button onClick={() => { setCropMode(m => !m); if (cropMode) setCropBox(null); }} style={cropMode ? { ...MODAL_BTN, background: '#7C3AED', color: '#000', border: '1px solid #7C3AED' } : MODAL_BTN}>
          {cropMode ? 'Draw New Selection' : 'Crop Mode'}
        </button>
        {canApply && showEditorLabel && (
          <input
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder="Label (e.g. AERIAL VIEW)"
            onClick={e => e.stopPropagation()}
            style={{ ...MODAL_BTN, width: '160px', outline: 'none', caretColor: '#fff', background: 'rgba(255,255,255,0.04)', color: '#fff' }}
          />
        )}
        {canApply && (
          <button onClick={applyCrop} disabled={applying} style={{ ...MODAL_BTN, background: 'var(--orange)', color: '#000', border: 'none' }}>
            {applying ? 'Saving...' : 'Save Crop'}
          </button>
        )}
        <div style={{ width: '1px', height: '18px', background: '#222' }} />
        {onDelete && (
          <button onClick={onDelete} style={{ ...MODAL_BTN, color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
            Delete Image
          </button>
        )}
        <button onClick={onClose} style={{ ...MODAL_BTN, color: '#bbb', border: '1px solid rgba(255,255,255,0.1)' }}>Close</button>
      </div>

      {/* Viewport */}
      <div
        ref={containerRef}
        style={{ width: '86vw', height: '78vh', overflow: 'hidden', position: 'relative', background: '#0c0c0c', borderRadius: '12px', border: '1px solid #1a1a1a', cursor: cropMode ? 'crosshair' : drag?.type === 'pan' ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <img
          ref={imgRef} src={editorImageUrl} alt={label} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center center', userSelect: 'none', pointerEvents: 'none', display: 'block' }}
        />
        {cropBox && cropBox.w > 0 && (
          <div style={{ position: 'absolute', left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h, border: '1px solid #7C3AED', background: 'rgba(124,58,237,0.08)', pointerEvents: 'none', boxSizing: 'border-box' }} />
        )}
        <div style={{ position: 'absolute', bottom: '14px', left: '50%', transform: 'translateX(-50%)', color: '#2a2a2a', fontSize: '11px', pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center' }}>
          {cropMode
            ? 'Drag to select the zone · Draw a new box to change selection'
            : 'Scroll to zoom · Drag to pan · Enable Crop Mode to select zone'}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LocationsScreen({ onNavigate, projectData = [], projectState = {}, onDataUpdate, projectId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [globalLibrary, setGlobalLibrary] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createRefImage, setCreateRefImage] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isProcessingSheet, setIsProcessingSheet] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLockingStyle, setIsLockingStyle] = useState(false);
  const [generatingLoc, setGeneratingLoc] = useState(null);
  const [zoomCropTarget, setZoomCropTarget] = useState(null);
  const [activeCategory, setActiveCategory] = useState('project');
  const [renamingPanel, setRenamingPanel] = useState(null);

  const [pendingSheetFile, setPendingSheetFile] = useState(null);
  const [sheetReplaceTarget, setSheetReplaceTarget] = useState(null);
  const [showSheetCropModal, setShowSheetCropModal] = useState(false);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState(null);
  const [sheetWarning, setSheetWarning] = useState(null);
  const [sheetProcessStatus, setSheetProcessStatus] = useState('');
  const [locProgressStep, setLocProgressStep] = useState(-1);
  const [imgRatios, setImgRatios] = useState({});

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);
  const collageRef = useRef(null);
  const [collageSize, setCollageSize] = useState({ width: PINBOARD_WIDTH, height: PINBOARD_HEIGHT });
  const supabase = useMemo(() => createClient(), []);
  const projectLocations = projectData || [];
  const generatingReplaceIndex = Number.isInteger(generatingLoc?.replaceIndex)
    ? generatingLoc.replaceIndex
    : null;
  const displayedLocations = activeCategory === 'project'
    ? [
        ...projectLocations.map((loc, index) => (
          generatingReplaceIndex === index ? generatingLoc : loc
        )),
        ...(generatingLoc && generatingReplaceIndex === null ? [generatingLoc] : []),
      ]
    : globalLibrary;
  const activeLoc = displayedLocations[activeTab] || null;
  const isGeneratingActive = Boolean(activeLoc?.isGeneratingReference || activeLoc?.id === 'generating');
  const busy = isProcessingSheet || isGenerating || isLockingStyle;

  const loadGlobalLibrary = useCallback(async () => {
    const { data, error } = await supabase.from('locations_library').select('*').order('created_at', { ascending: false });
    return !error && data ? data : null;
  }, [supabase]);

  const refreshGlobalLibrary = useCallback(async () => {
    const data = await loadGlobalLibrary();
    if (data) setGlobalLibrary(data);
  }, [loadGlobalLibrary]);

  useEffect(() => {
    let isActive = true;
    loadGlobalLibrary().then(data => {
      if (isActive && data) setGlobalLibrary(data);
    });
    return () => { isActive = false; };
  }, [loadGlobalLibrary]);

  useEffect(() => {
    const node = collageRef.current;
    if (!node) return;

    let frame = null;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const nextSize = {
          width: Math.round(rect.width) || PINBOARD_WIDTH,
          height: Math.round(rect.height) || PINBOARD_HEIGHT,
        };
        setCollageSize(prev => (
          prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize
        ));
      });
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    measure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!activeLoc?.images?.length) return undefined;

    const sources = activeLoc.images
      .map((img, index) => parseLocationImage(img, index))
      .filter(item => item.src);

    if (!sources.length) return undefined;

    let cancelled = false;
    sources.forEach(({ src, imageData }) => {
      if (imgRatios[src] || getStoredImageRatio(imageData)) return;

      const img = new Image();
      img.onload = () => {
        if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        setImgRatios(prev => prev[src] === ratio ? prev : { ...prev, [src]: ratio });
      };
      img.src = src;
    });

    return () => { cancelled = true; };
  }, [activeLoc?.images, imgRatios]);

  const base64ToBlob = (b64, mime) => {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const uploadBlob = async (blob, _mime, path) => {
    const { error } = await supabase.storage.from('assets').upload(path, blob);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
    return publicUrl;
  };

  const callNBPro = async (payload) => {
    const res = await fetch('/api/generate-location-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  };

  const saveToGlobalLibrary = async (locObj, source) => {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error(userErr?.message || 'No user found');

      const { error: insErr } = await supabase.from('locations_library').insert({
        user_id: user.id,
        name: locObj.name,
        description: locObj.description,
        images: locObj.images,
        source: source,
        sheet_url: locObj.sheetUrl || null
      });

      if (insErr) throw insErr;
      await refreshGlobalLibrary();
    } catch (err) {
      console.error('Failed to save to global library:', err);
    }
  };

  const handleAddHistoryToProject = async () => {
    if (!activeLoc || activeCategory !== 'history') return;
    const existingIndex = projectLocations.findIndex(location => (
      String(location?.name || '').trim().toLowerCase() === String(activeLoc.name || '').trim().toLowerCase()
    ));
    if (existingIndex >= 0) {
      setActiveCategory('project');
      setActiveTab(existingIndex);
      return;
    }

    const newLoc = {
      ...activeLoc,
      id: `location-${activeLoc.id || Date.now()}-${Date.now()}`,
      name: String(activeLoc.name || 'LOCATION').trim().toUpperCase(),
      description: activeLoc.description || activeLoc.visual_prompt || '',
      visual_prompt: activeLoc.visual_prompt || activeLoc.description || '',
      images: Array.isArray(activeLoc.images) ? activeLoc.images : [],
      source: activeLoc.source || 'history',
      sheetUrl: activeLoc.sheetUrl || activeLoc.sheet_url || null,
    };
    const updatedLocs = [...projectLocations, newLoc];
    await onDataUpdate({ locations: updatedLocs });
    setActiveCategory('project');
    setActiveTab(updatedLocs.length - 1);
  };

  const handleRefImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const [prefix, base64] = dataUrl.split(',');
      const mimeType = prefix.match(/:(.*?);/)[1];
      setCreateRefImage({ base64, mimeType, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSheetUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const previewUrl = URL.createObjectURL(file);
    setSheetPreviewUrl(previewUrl);
    setSheetWarning(null);
    setSheetProcessStatus('');
    setPendingSheetFile(file);
    setShowSheetCropModal(true);
  };

  const handleCloseSheetCropModal = () => {
    if (isProcessingSheet) return;
    if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
    setSheetPreviewUrl(null);
    setSheetWarning(null);
    setSheetProcessStatus('');
    setPendingSheetFile(null);
    setSheetReplaceTarget(null);
    setShowSheetCropModal(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processSheetFile = async (file) => {
    if (!file) return;
    setIsProcessingSheet(true);
    setSheetProcessStatus('Uploading sheet...');

    try {
      const sheetPath = `${projectId}/sheets/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, file);
      if (upErr) throw upErr;
      const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);

      setSheetProcessStatus('Detecting location views...');
      const { poses, error: splitErr, warning } = await fetch('/api/split-location-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sheetUrl }),
      }).then(r => r.json());
      if (splitErr) throw new Error(splitErr);
      if (!poses?.length) throw new Error('No location views were detected in this sheet.');

      if (warning) setSheetWarning(warning);

      const replaceIndex = Number.isInteger(sheetReplaceTarget?.index) && sheetReplaceTarget.index >= 0 && sheetReplaceTarget.index < projectLocations.length
        ? sheetReplaceTarget.index
        : null;
      const existingLoc = replaceIndex !== null ? projectLocations[replaceIndex] : null;
      const locName = existingLoc
        ? (sheetReplaceTarget?.name || existingLoc.name || file.name.split('.')[0]).trim().toUpperCase()
        : file.name.split('.')[0].toUpperCase();
      const locDescription = existingLoc
        ? (sheetReplaceTarget?.description ?? existingLoc.description ?? 'Uploaded from location sheet')
        : 'Uploaded from location sheet';
      setGeneratingLoc({
        ...(existingLoc || {}),
        id: existingLoc?.id || 'generating',
        name: locName,
        description: locDescription,
        images: poses.map((p, i) => ({ label: normalizeLocationLabel(p.label, i), url: null })),
        isGeneratingReference: true,
        replaceIndex,
      });
      setActiveTab(replaceIndex !== null ? replaceIndex : projectLocations.length);
      setActiveCategory('project');
      setSheetProcessStatus(`Detected ${poses.length} views. Refining crops...`);
      setShowSheetCropModal(false);

      const img = await new Promise((res, rej) => {
        const el = new Image(); el.crossOrigin = 'anonymous';
        el.onload = () => res(el); el.onerror = rej; el.src = sheetUrl;
      });

      const finalImages = new Array(poses.length).fill(null);

      await Promise.all(poses.map(async (pose, i) => {
        setSheetProcessStatus(`Refining view ${i + 1} of ${poses.length}...`);
        const label = normalizeLocationLabel(pose.label, i);
        const [ymin, xmin, ymax, xmax] = pose.box_2d;
        const sx = Math.max(0, (xmin / 1000) * img.width);
        const sy = Math.max(0, (ymin / 1000) * img.height);
        const sw = Math.min((xmax / 1000) * img.width, img.width) - sx;
        const sh = Math.min((ymax / 1000) * img.height, img.height) - sy;

        if (sw <= 0 || sh <= 0) return;

        const cv = document.createElement('canvas');
        cv.width = sw; cv.height = sh;
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const cropB64 = cv.toDataURL('image/jpeg', 0.95).split(',')[1];

        let finalB64 = cropB64, finalMime = 'image/jpeg';
        try {
          const nb = await callNBPro({ base64: cropB64, mimeType: 'image/jpeg', label });
          if (nb.success && nb.base64) {
            finalB64 = nb.base64;
            finalMime = 'image/png';
          }
        } catch (e) {
          console.warn("NB Pro refinement failed for zone, using raw crop", e);
        }

        const blob = base64ToBlob(finalB64, finalMime);
        const ext = finalMime.split('/')[1] || 'png';
        const url = await uploadBlob(blob, finalMime, `${projectId}/generated/${Date.now()}-zone-${i}.${ext}`);

        const imageData = { url, label, box_2d: pose.box_2d, width: Math.round(sw), height: Math.round(sh) };
        finalImages[i] = imageData;
        setGeneratingLoc(prev => {
          if (!prev) return prev;
          const newImgs = [...prev.images];
          newImgs[i] = imageData;
          return { ...prev, images: newImgs };
        });
      }));

      const newLoc = {
        ...(existingLoc || {}),
        id: existingLoc?.id || Date.now(),
        name: locName,
        description: locDescription,
        images: finalImages.filter(Boolean),
        source: 'upload',
        sheetUrl,
        warning: warning || null,
      };
      const updatedLocs = [...projectLocations];
      if (replaceIndex !== null) {
        updatedLocs[replaceIndex] = newLoc;
      } else {
        updatedLocs.push(newLoc);
      }
      await onDataUpdate({ locations: updatedLocs });
      setActiveTab(replaceIndex !== null ? replaceIndex : updatedLocs.length - 1);
      if (replaceIndex === null) saveToGlobalLibrary(newLoc, 'upload');
      if (warning) alert(warning);
    } catch (err) {
      console.error('Sheet processing failed:', err);
      alert('We could not process that location sheet. Please try another image.');
    } finally {
      setIsProcessingSheet(false);
      setGeneratingLoc(null);
      if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
      setSheetPreviewUrl(null);
      setSheetWarning(null);
      setSheetProcessStatus('');
      setPendingSheetFile(null);
      setSheetReplaceTarget(null);
      setShowSheetCropModal(false);
    }
  };

  const generateLocationReferences = async ({ name, description, refImage = null, replaceIndex = null }) => {
    const locName = name.trim().toUpperCase();
    const desc = description.trim();
    setShowCreateModal(false);
    setCreateName('');
    setCreateDesc('');
    setCreateRefImage(null);
    setIsGenerating(true);
    setLocProgressStep(0);

    try {
      const tempId = Date.now();
      const isReplacing = Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < projectLocations.length;
      const existingLoc = isReplacing ? projectLocations[replaceIndex] : null;
      setGeneratingLoc({
        ...(existingLoc || {}),
        id: existingLoc?.id || tempId,
        name: locName,
        description: desc,
        images: LOCATION_REFERENCE_VIEWS.map(view => ({ label: view.label, url: null })),
        isGeneratingReference: true,
        replaceIndex: isReplacing ? replaceIndex : null,
      });
      setActiveTab(isReplacing ? replaceIndex : projectLocations.length);
      setActiveCategory('project');

      const finalImages = [];
      const hasUserReference = Boolean(refImage?.base64);
      let referenceBase64 = refImage?.base64 || null;
      let referenceMimeType = refImage?.mimeType || 'image/png';

      for (let i = 0; i < LOCATION_REFERENCE_VIEWS.length; i++) {
        setLocProgressStep(i + 1);
        const view = LOCATION_REFERENCE_VIEWS[i];
        try {
          const payload = {
            locationDescription: desc,
            angleDescription: view.prompt,
            label: view.label
          };

          if (referenceBase64) {
            payload.base64 = referenceBase64;
            payload.mimeType = referenceMimeType;
          }

          const resp = await fetch('/api/generate-location-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const { imageBase64, error } = await resp.json();
          if (error) throw new Error(error);

          if (!hasUserReference && !referenceBase64) {
            referenceBase64 = imageBase64;
            referenceMimeType = 'image/png';
          }

          const blob = base64ToBlob(imageBase64, 'image/png');
          const url = await uploadBlob(blob, 'image/png', `${projectId}/generated/${Date.now()}-${view.label.replace(/\s+/g, '_')}.png`);

          const imageData = { url, label: view.label };
          finalImages[i] = imageData;

          setGeneratingLoc(prev => {
            if (!prev) return prev;
            const newImgs = [...prev.images];
            newImgs[i] = imageData;
            return { ...prev, images: newImgs };
          });

        } catch (e) {
          console.error(`Failed ${view.label}:`, e);
        }
      }

      const savedImages = finalImages.filter(Boolean);
      if (savedImages.length < 7) {
        throw new Error(`Only ${savedImages.length} location references were generated.`);
      }

      setLocProgressStep(LOCATION_STEPS.length - 1);
      const newLoc = {
        ...(existingLoc || {}),
        id: existingLoc?.id || tempId,
        name: locName,
        description: desc,
        visual_prompt: existingLoc?.visual_prompt || desc,
        images: savedImages,
        source: 'ai',
      };
      const updatedLocs = [...projectLocations];
      if (isReplacing) {
        updatedLocs[replaceIndex] = newLoc;
      } else {
        updatedLocs.push(newLoc);
      }
      await onDataUpdate({ locations: updatedLocs });
      setActiveTab(isReplacing ? replaceIndex : updatedLocs.length - 1);
      if (!isReplacing) saveToGlobalLibrary(newLoc, 'ai');
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Location could not be created. Please try again.');
    } finally {
      setIsGenerating(false);
      setLocProgressStep(-1);
      setGeneratingLoc(null);
    }
  };

  const handleGenerateAngles = async () => {
    if (!createName.trim()) return alert('Enter a location name');
    if (!createDesc.trim()) return alert('Describe the location');
    await generateLocationReferences({
      name: createName,
      description: createDesc,
      refImage: createRefImage,
    });
  };

  const handleGenerateFromScript = async () => {
    const projectIndex = activeCategory === 'project' && activeLoc && activeLoc.id !== 'generating'
      ? activeTab
      : -1;
    const activeNeedsImages = projectIndex >= 0 && !projectLocations[projectIndex]?.images?.length;
    const firstMissingIndex = projectLocations.findIndex(location => !location?.images?.length);
    const targetIndex = activeNeedsImages ? projectIndex : firstMissingIndex;
    const scriptLocations = Array.isArray(projectState?.locations) ? projectState.locations : [];
    const sourceLocation = targetIndex >= 0
      ? projectLocations[targetIndex]
      : scriptLocations.find(location => location?.name || location?.visual_prompt || location?.description);

    if (!sourceLocation) {
      alert('Generate or approve the script first so I can pull a location brief from it.');
      return;
    }

    const name = sourceLocation.name || 'SCRIPT LOCATION';
    const description = buildScriptLocationDescription(sourceLocation, projectState);
    if (!description.trim()) {
      alert('The script does not include enough location detail yet.');
      return;
    }

    await generateLocationReferences({
      name,
      description,
      replaceIndex: targetIndex >= 0 ? targetIndex : null,
    });
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    const updatedLocs = [...projectLocations];
    updatedLocs[activeTab] = { ...projectLocations[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
    await onDataUpdate({ locations: updatedLocs });
    setShowEditModal(false);
  };

  const lockStyleBibleIfNeeded = async () => {
    if (!projectId) return null;
    if (projectState?.style_bible) return projectState.style_bible;

    const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
    const locations = Array.isArray(projectLocations) ? projectLocations : [];
    const hasCharacterRefs = characters.some(character => (
      Array.isArray(character?.images) && character.images.length > 0
    ));
    const hasLocationRefs = locations.some(location => (
      Array.isArray(location?.images) && location.images.length > 0
    ));

    if (!hasCharacterRefs || !hasLocationRefs) return null;

    const mergedState = {
      ...projectState,
      locations,
    };

    setIsLockingStyle(true);
    try {
      const response = await fetch('/api/generate-style-bible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectState: mergedState,
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok || result.error || !result.style_bible) {
        throw new Error(result.error || 'Style bible generation failed');
      }

      await onDataUpdate({ style_bible: result.style_bible });
      return result.style_bible;
    } finally {
      setIsLockingStyle(false);
    }
  };

  const handleContinueToWardrobe = async () => {
    if (busy) return;
    try {
      await lockStyleBibleIfNeeded();
      onNavigate(6);
    } catch (error) {
      console.error('Style bible lock failed:', error);
      alert('Could not lock the visual style yet. Please try again.');
    }
  };

  const handleApplyCrop = async (blob, newLabel, cropMeta = null) => {
    if (!zoomCropTarget) return;
    const { locIdx, imgIdx } = zoomCropTarget;
    try {
      const url = await uploadBlob(blob, 'image/jpeg', `${projectId}/crops/${Date.now()}-crop.jpg`);
      const loc = projectLocations[locIdx];
      const images = [...loc.images];
      const sizeMeta = cropMeta?.width && cropMeta?.height
        ? { width: cropMeta.width, height: cropMeta.height }
        : {};
      if (imgIdx === null) {
        images.push({ url, label: normalizeLocationLabel(newLabel || 'CUSTOM VIEW', images.length), ...sizeMeta });
      } else {
        const existing = images[imgIdx];
        images[imgIdx] = { url, label: normalizeLocationLabel(newLabel || (typeof existing === 'string' ? `View ${imgIdx + 1}` : existing.label), imgIdx), ...sizeMeta };
      }
      const updatedLocs = [...projectLocations];
      updatedLocs[locIdx] = { ...loc, images };
      await onDataUpdate({ locations: updatedLocs });
      setZoomCropTarget(null);
    } catch { alert('Crop could not be saved. Please try again.'); }
  };

  const handleDelete = async () => {
    if (!activeLoc || activeLoc.id === 'generating') return;
    if (!confirm(`Delete ${activeLoc.name}?`)) return;
    try {
      if (activeCategory === 'project') {
        await onDataUpdate({ locations: projectLocations.filter((_, i) => i !== activeTab) });
        setActiveTab(Math.max(0, activeTab - 1));
      } else {
        const { error } = await supabase.from('locations_library').delete().eq('id', activeLoc.id);
        if (error) throw error;
        await refreshGlobalLibrary();
        setActiveTab(Math.max(0, activeTab - 1));
      }
    } catch { alert('Delete could not be completed. Please try again.'); }
  };

  const handleDeleteImage = async (locIdx, imgIdx) => {
    if (!confirm('Remove this view?')) return;
    const loc = projectLocations[locIdx];
    const images = loc.images.filter((_, i) => i !== imgIdx);
    const updatedLocs = [...projectLocations];
    updatedLocs[locIdx] = { ...loc, images };
    await onDataUpdate({ locations: updatedLocs });
  };

  const handleRenameLabel = async (locIdx, imgIdx, newLabel) => {
    setRenamingPanel(null);
    if (locIdx < 0 || !newLabel.trim()) return;
    const loc = projectLocations[locIdx];
    if (!loc) return;
    const images = [...loc.images];
    const existing = images[imgIdx];
    images[imgIdx] = { ...(typeof existing === 'object' ? existing : { url: existing }), label: normalizeLocationLabel(newLabel, imgIdx) };
    const updatedLocs = [...projectLocations];
    updatedLocs[locIdx] = { ...loc, images };
    await onDataUpdate({ locations: updatedLocs });
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 13px',
    border: '1px solid var(--border-mid)',
    borderRadius: '8px',
    background: '#0f0f0f',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  return (
    <div className="screen active" id="s5" style={{ height: '100%', overflow: 'hidden', background: '#080808' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,#111 25%,#1a1a1a 50%,#111 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .img-card {
          --board-card-scale: 1;
          transition: transform 0.16s ease, filter 0.16s ease;
        }
        .img-card:hover {
          --board-card-scale: 1.06;
          z-index: 20;
          filter: brightness(1.04);
        }
      `}</style>

      <div className="studio-shell" style={{ display: 'flex', height: '100%' }}>
        {/* Sidebar */}
        <div className="studio-sidebar" style={{ width: '280px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
          <div style={{ padding: '26px' }}>
            <div className="kicker kicker--orange" style={{ marginBottom: '12px' }}>Location · Studio</div>
            <h2 className="editorial-title editorial-h2" style={{ margin: 0, marginBottom: '10px' }}>
              Build your <span className="text-grad">set.</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginTop: '8px', lineHeight: '1.6' }}>
              Upload a location sheet or create cinematic environment references.
            </p>
          </div>

          <div style={{ padding: '0 26px 26px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Category Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.025)',
                borderRadius: '999px',
                padding: '4px',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <button
                onClick={() => { setActiveCategory('project'); setActiveTab(0); }}
                style={{
                  flex: 1,
                  padding: '9px',
                  border: 'none',
                  borderRadius: '999px',
                  background: activeCategory === 'project'
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(124,58,237,0.06))'
                    : 'transparent',
                  color: activeCategory === 'project' ? 'var(--teal)' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '-0.005em',
                  boxShadow: activeCategory === 'project' ? '0 0 0 1px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                }}
              >
                Project
              </button>
              <button
                onClick={() => { setActiveCategory('history'); setActiveTab(0); }}
                style={{
                  flex: 1,
                  padding: '9px',
                  border: 'none',
                  borderRadius: '999px',
                  background: activeCategory === 'history'
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(124,58,237,0.04))'
                    : 'transparent',
                  color: activeCategory === 'history' ? 'var(--orange)' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  letterSpacing: '-0.005em',
                  boxShadow: activeCategory === 'history' ? '0 0 0 1px rgba(124,58,237,0.28), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                }}
              >
                History
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => {
                setSheetReplaceTarget(null);
                fileInputRef.current?.click();
              }} disabled={busy} className="btn-orange" style={{ width: '100%', padding: '12px', fontSize: '12.5px', justifyContent: 'center' }}>
                Upload reference sheet
              </button>
              <input type="file" ref={fileInputRef} onChange={handleSheetUpload} style={{ display: 'none' }} accept="image/*" />

              <button onClick={() => { setShowCreateModal(true); setCreateRefImage(null); }} disabled={busy} className="btn-outline" style={{ width: '100%', padding: '12px', fontSize: '12.5px', justifyContent: 'center' }}>
                Create location
              </button>
              <button
                onClick={handleGenerateFromScript}
                disabled={busy}
                className="btn-outline"
                title="Generate references for the next location described in the script"
                style={{ width: '100%', padding: '12px', fontSize: '12.5px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '7px' }}
              >
                <FileText size={14} />
                Generate from Script
              </button>
            </div>

            {isGenerating && (
              <ProgressBar steps={LOCATION_STEPS} currentStep={locProgressStep} />
            )}
          </div>

          <div style={{ padding: '24px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={handleContinueToWardrobe}
              disabled={busy}
              className="btn-teal"
              style={{ width: '100%', padding: '14px', fontSize: '13px', fontWeight: 600, opacity: busy ? 0.8 : 1 }}
            >
              {isLockingStyle ? 'Locking style...' : 'Continue to Wardrobe →'}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="studio-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header row with tabs */}
          <div style={{ height: '64px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 24px', background: '#0d0d0d' }}>
            <div style={{ flex: 1, display: 'flex', gap: '8px', overflowX: 'auto', paddingRight: '20px', scrollbarWidth: 'none' }}>
              {displayedLocations.map((loc, i) => (
                <button
                  key={loc.id || i}
                  onClick={() => setActiveTab(i)}
                  className={`tab-pill ${activeTab === i ? 'active' : ''}`}
                  style={{
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: '13px',
                    fontWeight: 500,
                    letterSpacing: '-0.015em',
                  }}
                >
                  {loc.name}
                  {(loc.isGeneratingReference || loc.id === 'generating') && (
                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal)', animation: 'pulse 1.5s infinite', boxShadow: '0 0 10px rgba(124,58,237,0.7)' }} />
                  )}
                </button>
              ))}
              {activeCategory === 'project' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="tab-pill"
                  style={{
                    width: '36px',
                    height: '32px',
                    flexShrink: 0,
                    color: 'var(--orange)',
                    background: 'rgba(124,58,237,0.06)',
                    borderColor: 'rgba(124,58,237,0.22)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    padding: 0,
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>

          {/* Location details & actions */}
          <div style={{ padding: '32px 36px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <h1 className="editorial-title editorial-h2" style={{ margin: 0 }}>
                    {activeLoc?.name || <em style={{ color: 'var(--text-muted)' }}>No locations.</em>}
                  </h1>
                  {activeLoc && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9.5px',
                        fontWeight: 500,
                        color: activeCategory === 'project' ? 'var(--teal)' : 'var(--orange)',
                        background: activeCategory === 'project' ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.1)',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        border: `1px solid ${activeCategory === 'project' ? 'rgba(124,58,237,0.22)' : 'rgba(124,58,237,0.22)'}`,
                        letterSpacing: '0.18em',
                      }}
                    >
                      {activeCategory === 'project' ? '◇ PROJECT' : '◆ GLOBAL'}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '14px', maxWidth: '640px', lineHeight: 1.65, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.01em' }}>
                  {truncateLocationDescription(activeLoc?.description) || 'Select or add a location to get started.'}
                </p>
                {activeLoc?.warning && (
                  <div style={{ marginTop: '10px', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: '7px', padding: '7px 10px', fontSize: '11px', fontWeight: 600, maxWidth: '720px' }}>
                    {activeLoc.warning}
                  </div>
                )}
              </div>

              {!isGeneratingActive && activeLoc && activeCategory === 'history' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleAddHistoryToProject} className="btn-teal" style={{ fontSize: '11px', padding: '8px 14px' }}>Add to project</button>
                  <button onClick={handleDelete} className="btn-outline" style={{ fontSize: '11px', padding: '8px 14px', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>Delete from history</button>
                </div>
              )}
              {!isGeneratingActive && activeLoc && activeCategory === 'project' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  {activeLoc.sheetUrl && (
                    <button onClick={() => setZoomCropTarget({ locIdx: activeTab, imgIdx: null, url: activeLoc.sheetUrl, label: 'NEW VIEW', showLabelInput: true })} className="btn-outline" style={{ fontSize: '11px', padding: '8px 14px' }}>+ Add from Sheet</button>
                  )}
                  <button onClick={() => { setEditName(activeLoc.name); setEditDesc(activeLoc.description); setShowEditModal(true); }} className="btn-outline" style={{ fontSize: '11px', padding: '8px 14px' }}>Edit</button>
                  <button onClick={handleDelete} className="btn-outline" style={{ fontSize: '11px', padding: '8px 14px', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>Delete</button>
                </div>
              )}
            </div>
          </div>

          {/* Image collage */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', padding: '8px 24px 18px', boxSizing: 'border-box' }}>
            <div className="studio-board" ref={collageRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#080808', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', boxSizing: 'border-box', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeLoc?.images?.length > 0 ? (() => {
                const locIdx = activeCategory === 'project' ? activeTab : -1;
                const collageItems = activeLoc.images.map((img, i) => {
                  const { imageData, src, label } = parseLocationImage(img, i);
                  const loading = !src;
                  return {
                    key: `${src || 'loading'}-${i}`,
                    raw: imageData || img,
                    index: i,
                    src,
                    label,
                    loading,
                    ratio: src ? (imgRatios[src] || getStoredImageRatio(imageData) || DEFAULT_COLLAGE_RATIO) : DEFAULT_COLLAGE_RATIO,
                  };
                });
                const boxes = buildPinboardLayout(collageItems);
                const boardScale = Math.max(
                  0.1,
                  Math.min(
                    collageSize.width / PINBOARD_WIDTH,
                    collageSize.height / PINBOARD_HEIGHT,
                  ),
                );
                const boardWidth = PINBOARD_WIDTH * boardScale;
                const boardHeight = PINBOARD_HEIGHT * boardScale;

                return (
                  <div style={{
                    width: `${boardWidth}px`,
                    height: `${boardHeight}px`,
                    position: 'relative',
                    overflow: 'hidden',
                    border: `${Math.max(2, 4 * boardScale)}px solid #1a1a1a`,
                    borderRadius: `${Math.max(6, 12 * boardScale)}px`,
                    backgroundColor: '#050505',
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundPosition: '0 0',
                    backgroundSize: `${Math.max(10, 20 * boardScale)}px ${Math.max(10, 20 * boardScale)}px`,
                    boxShadow: '0 28px 80px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.02)',
                    boxSizing: 'border-box',
                  }}>
                    <div style={{ position: 'absolute', inset: `${18 * boardScale}px`, border: '1px solid rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
                    {boxes.map(item => {
                      const cardPadding = Math.max(1, 2 * boardScale);
                      return (
                        <div
                          key={item.key}
                          className="img-card"
                          onClick={e => {
                            e.stopPropagation();
                            if (item.loading || locIdx < 0) return;
                            setZoomCropTarget({
                              locIdx,
                              imgIdx: item.index,
                              url: item.src,
                              label: item.label,
                              recropUrl: activeLoc?.sheetUrl || null,
                              recropBox: item.raw && typeof item.raw === 'object' ? item.raw.box_2d : null,
                            });
                          }}
                          style={{
                          background: 'rgba(255,255,255,0.9)',
                          borderRadius: `${Math.max(2, 3 * boardScale)}px`,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                          overflow: 'hidden',
                          position: 'absolute',
                          left: `${item.x * boardScale}px`,
                          top: `${item.y * boardScale}px`,
                          width: `${item.width * boardScale}px`,
                          height: `${item.height * boardScale}px`,
                          minWidth: 0,
                          minHeight: 0,
                          boxSizing: 'border-box',
                          padding: `${cardPadding}px`,
                          cursor: !item.loading && locIdx >= 0 ? 'pointer' : 'default',
                          transform: 'scale(var(--board-card-scale))',
                          transformOrigin: 'center center',
                        }}>
                          {item.loading
                            ? <div className="skeleton-shimmer" style={{ width: '100%', height: '100%' }} />
                            : <img
                                key={item.src}
                                src={item.src}
                                alt={item.label}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#f7f7f7' }}
                                onLoad={e => {
                                  const ratio = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                                  setImgRatios(prev => prev[item.src] === ratio ? prev : { ...prev, [item.src]: ratio });
                                }}
                              />
                          }
                          {/* Label badge */}
                          <div style={{ position: 'absolute', top: '8px', right: '8px', maxWidth: 'calc(100% - 16px)' }}>
                            {renamingPanel?.locIdx === locIdx && renamingPanel?.imgIdx === item.index ? (
                              <input
                                autoFocus
                                defaultValue={item.label}
                                onBlur={e => handleRenameLabel(locIdx, item.index, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleRenameLabel(locIdx, item.index, e.target.value);
                                  if (e.key === 'Escape') setRenamingPanel(null);
                                }}
                                onClick={e => e.stopPropagation()}
                                style={{ background: 'rgba(0,0,0,0.92)', border: '1px solid var(--teal)', color: '#fff', borderRadius: '4px', padding: '2px 7px', fontSize: '8px', fontWeight: 700, outline: 'none', width: '100px', maxWidth: '100%', letterSpacing: '0.05em' }}
                              />
                            ) : (
                              <div
                                onClick={e => {
                                  e.stopPropagation();
                                  if (!item.loading && locIdx >= 0) {
                                    setRenamingPanel({ locIdx, imgIdx: item.index });
                                  }
                                }}
                                title={locIdx >= 0 ? 'Click to rename' : ''}
                                style={{ padding: '2px 7px', background: 'rgba(0,0,0,0.75)', borderRadius: '3px', fontSize: '8px', color: item.loading ? '#222' : '#ddd', backdropFilter: 'blur(8px)', fontWeight: 700, cursor: locIdx >= 0 ? 'text' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-display)' }}
                              >
                                {item.label.toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
              <div style={{ width: `${Math.min(PINBOARD_WIDTH, collageSize.width - 24)}px`, aspectRatio: `${PINBOARD_WIDTH} / ${PINBOARD_HEIGHT}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '8px', background: '#0a0a0a' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ color: '#fff', fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>No reference views yet</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Upload a location sheet or create a reference set</div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sheet Crop Choice Modal */}
      {showSheetCropModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ width: '560px', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '24px', padding: '32px', textAlign: 'center' }}>
            <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: 600, margin: '0 0 12px' }}>Choose Crop Method</h3>
            <p style={{ color: isProcessingSheet ? 'var(--teal)' : '#666', fontSize: '13px', margin: '0 0 24px' }}>
              {isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Automatically detect and crop each view from your sheet.'}
            </p>
            {sheetWarning && (
              <div style={{ marginBottom: '16px', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', lineHeight: 1.5, textAlign: 'left' }}>
                {sheetWarning}
              </div>
            )}

            {sheetPreviewUrl && (
              <img src={sheetPreviewUrl} alt="Preview" style={{ width: '100%', height: '200px', objectFit: 'contain', background: '#050505', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }} />
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => processSheetFile(pendingSheetFile)}
                disabled={isProcessingSheet}
                className="btn-orange"
                style={{ flex: 1, padding: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isProcessingSheet ? 0.82 : 1, cursor: isProcessingSheet ? 'wait' : 'pointer' }}
              >
                {isProcessingSheet && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                {isProcessingSheet ? 'Detecting Views...' : 'Auto-detect Views'}
              </button>
              <div style={{ flex: 1 }}>
                <button disabled={isProcessingSheet} onClick={handleCloseSheetCropModal} className="btn-outline" style={{ width: '100%', padding: '16px', opacity: isProcessingSheet ? 0.45 : 1, cursor: isProcessingSheet ? 'not-allowed' : 'pointer' }}>Cancel Upload</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ width: '500px', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '24px', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: 600, margin: 0 }}>Create Location</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'transparent', border: 'none', color: '#444', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '10.5px', fontWeight: 500, marginBottom: '10px', letterSpacing: '0.16em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>LOCATION NAME</label>
                <input style={inputStyle} value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. CYBERPUNK BAR" />
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '10.5px', fontWeight: 500, marginBottom: '10px', letterSpacing: '0.16em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea style={{ ...inputStyle, height: '100px', resize: 'none' }} value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Neon-lit interior with rain-slicked windows, holographic advertisements, and crowded seating..." />
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '10.5px', fontWeight: 500, marginBottom: '10px', letterSpacing: '0.16em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>REFERENCE IMAGE (OPTIONAL)</label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '56px', height: '56px', objectFit: 'contain', background: '#050505', borderRadius: '6px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#bbb', fontSize: '11px', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: '#333', fontSize: '10px', marginTop: '2px' }}>Consistency will match this scene</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => refFileInputRef.current?.click()} style={{ width: '100%', padding: '12px', background: '#111', border: '1px dashed #222', borderRadius: '8px', color: '#555', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Upload Reference View
                  </button>
                )}
              </div>

              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(124,58,237,0.03)', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.08)' }}>
                <div style={{ color: 'var(--teal)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '8px' }}>SET PREVIEW</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['WIDE', 'DETAIL', 'INTERIOR', 'ATMOS'].map(tag => (
                    <span key={tag} style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--teal)', fontSize: '8px', fontWeight: 800, padding: '2px 6px', borderRadius: '3px' }}>{tag}</span>
                  ))}
                </div>
              </div>

              <button onClick={handleGenerateAngles} className="btn-orange" style={{ padding: '16px', fontWeight: 700, marginTop: '10px' }}>
                Create Location Set
              </button>
              <button
                onClick={handleGenerateFromScript}
                className="btn-outline"
                style={{ padding: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
              >
                <Wand2 size={14} />
                Generate from Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ width: '460px', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '24px', padding: '32px' }}>
            <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 600, margin: '0 0 24px' }}>Edit Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>LOCATION NAME</label>
                <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>DESCRIPTION</label>
                <textarea style={{ ...inputStyle, height: '100px', resize: 'none' }} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              </div>
              <button onClick={() => {
                setSheetReplaceTarget({
                  index: activeTab,
                  name: (editName || activeLoc?.name || '').trim().toUpperCase(),
                  description: editDesc.trim(),
                });
                setShowEditModal(false);
                fileInputRef.current?.click();
              }} style={{ padding: '12px', background: '#111', border: '1px solid #222', borderRadius: '8px', color: '#bbb', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                Upload New Location Sheet
              </button>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button onClick={handleEditSave} className="btn-orange" style={{ flex: 1, padding: '14px', fontWeight: 700 }}>Save Changes</button>
                <button onClick={() => setShowEditModal(false)} className="btn-outline" style={{ flex: 1, padding: '14px' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zoom/Crop Modal */}
      {zoomCropTarget && (
        <ZoomCropModal
          imageUrl={zoomCropTarget.url}
          label={zoomCropTarget.label}
          onClose={() => setZoomCropTarget(null)}
          onApply={handleApplyCrop}
          onDelete={() => {
            handleDeleteImage(zoomCropTarget.locIdx, zoomCropTarget.imgIdx);
            setZoomCropTarget(null);
          }}
          initialBox={zoomCropTarget.initialBox || null}
          showLabelInput={zoomCropTarget.showLabelInput || false}
          recropUrl={zoomCropTarget.recropUrl || null}
          recropBox={zoomCropTarget.recropBox || null}
        />
      )}

      {busy && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 10001, background: '#000', border: '1px solid var(--teal)', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Loader2 size={24} style={{ color: 'var(--teal)', animation: 'spin 1s linear infinite' }} />
            <div>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
              {isProcessingSheet
                ? (sheetProcessStatus || 'Reading sheet...')
                : isLockingStyle
                  ? 'Locking visual style...'
                  : 'Creating references...'}
            </div>
            <div style={{ color: 'var(--teal)', fontSize: '10px', fontWeight: 700, marginTop: '2px', letterSpacing: '0.05em' }}>Please keep this page open</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}
