export const MODAL_BTN = {
  background: 'rgba(var(--cyan-300-rgb), 0.06)',
  border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.08)',
  color: 'var(--text-soft)',
  padding: '0.4375rem 0.75rem',
  borderRadius: '0.375rem',
  fontSize: '0.6875rem',
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.03em',
};

export const CHARACTER_STEPS = [
  'Designing full character sheet',
  'Saving to library',
];

export const CHARACTER_SHEET_LAYOUT_SPEC = {
  canvas: 'single 21:9 horizontal sheet',
  background: 'plain warm beige or soft neutral studio backdrop',
  panel_count: 9,
  panel_structure: [
    'large mid portrait panel on far left',
    'full-body front standing',
    'full-body left profile standing',
    'full-body right profile standing',
    'full-body back standing',
    'top-right close-up front portrait',
    'top-right close-up back head portrait',
    'bottom-right close-up left three-quarter/profile portrait',
    'bottom-right close-up right three-quarter/profile portrait',
  ],
  spacing: 'clean white/beige dividers or visible spacing between panels',
  framing_rules: 'Do not crop face or costume details. Full-body panels must show full figure head-to-toe. Close-up panels must include head and upper chest/shoulder area.',
};

export const PINBOARD_WIDTH = 2016;
export const PINBOARD_HEIGHT = 700;
export const PINBOARD_PADDING = 28;
export const PINBOARD_GAP = 14;
export const DEFAULT_COLLAGE_RATIO = 1;
export const CHARACTER_DESCRIPTION_DISPLAY_LIMIT = 360;

export const buildSheetPrompt = (desc, hasRef) => {
  const charClause = hasRef
    ? 'of the character shown in the reference image'
    : `of this character: ${desc}`;
  return `Professional character design reference sheet.

"layout_spec": ${JSON.stringify(CHARACTER_SHEET_LAYOUT_SPEC, null, 2)}

Character ${charClause}.

Output exactly one complete 21:9 horizontal image containing the whole sheet. Maintain perfectly consistent character appearance across all 9 panels: same face, body proportions, hair, skin tone, wardrobe, accessories, and age. No text labels, watermarks, extra people, or cropped panels. Studio lighting throughout. Professional concept art quality.`;
};

export function compactScriptText(value, maxLength = 700) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function truncateCharacterDescription(value, maxLength = CHARACTER_DESCRIPTION_DISPLAY_LIMIT) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

export function normalizeCharacterName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function buildScriptCharacterDescription(character = {}, projectState = {}) {
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};
  const sourceDescription = (
    character.visual_prompt ||
    character.prompt ||
    character.description ||
    character.role ||
    ''
  );

  return [
    sourceDescription,
    character.role ? `Narrative role: ${compactScriptText(character.role, 220)}` : '',
    script.title ? `Music video title: ${script.title}` : '',
    script.storyline ? `Story context: ${compactScriptText(script.storyline, 520)}` : '',
    script.mood || analysis.mood ? `Mood and performance tone: ${compactScriptText(script.mood || analysis.mood, 240)}` : '',
    analysis.genre || analysis.theme ? `Genre/theme: ${compactScriptText(analysis.genre || analysis.theme, 180)}` : '',
    'Create a production-ready character reference set for this music video. Identity must remain stable across every view: same face, body proportions, hair, skin tone, wardrobe, accessories, and age.',
  ].filter(Boolean).join('\n');
}

export function getImageRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_COLLAGE_RATIO;
  return Math.max(0.2, Math.min(5, ratio));
}

export function getStoredImageRatio(imageData) {
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

export function parseCharacterImage(img, index) {
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
  const label = imageData?.label || `POSE ${index + 1}`;

  return { imageData, src, label };
}

export function getPinboardImageSize(ratio, count, index, scale = 1) {
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

export function getPinboardCandidates() {
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

export function boxesOverlap(a, b, gap = PINBOARD_GAP) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

export function getOverlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

export function fitsPinboard(box) {
  return (
    box.x >= PINBOARD_PADDING &&
    box.y >= PINBOARD_PADDING &&
    box.x + box.width <= PINBOARD_WIDTH - PINBOARD_PADDING &&
    box.y + box.height <= PINBOARD_HEIGHT - PINBOARD_PADDING
  );
}

export function tryBuildPinboard(items, sizeScale) {
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

export function buildPinboardLayout(items) {
  if (!items.length) return [];

  for (let scale = 1; scale >= 0.58; scale -= 0.06) {
    const placed = tryBuildPinboard(items, scale);
    if (placed && placed.every((box, index) => !placed.slice(0, index).some(other => boxesOverlap(box, other)))) {
      return placed;
    }
  }

  return tryBuildPinboard(items, 0.58) || [];
}
