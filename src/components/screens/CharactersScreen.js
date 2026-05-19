'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Loader2, RefreshCw, Upload } from 'lucide-react';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import QueueStatusBar from '../QueueStatusBar';
import { createClient } from '@/utils/supabase';
import ProgressBar from '../ProgressBar';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_BTN = {
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

const CHARACTER_STEPS = [
  'Designing full character sheet',
  'Saving to library',
];

const CHARACTER_SHEET_LAYOUT_SPEC = {
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

const PINBOARD_WIDTH = 2016;
const PINBOARD_HEIGHT = 700;
const PINBOARD_PADDING = 28;
const PINBOARD_GAP = 14;
const DEFAULT_COLLAGE_RATIO = 1;
const CHARACTER_DESCRIPTION_DISPLAY_LIMIT = 360;

const buildSheetPrompt = (desc, hasRef) => {
  const charClause = hasRef
    ? 'of the character shown in the reference image'
    : `of this character: ${desc}`;
  return `Professional character design reference sheet.

"layout_spec": ${JSON.stringify(CHARACTER_SHEET_LAYOUT_SPEC, null, 2)}

Character ${charClause}.

Output exactly one complete 21:9 horizontal image containing the whole sheet. Maintain perfectly consistent character appearance across all 9 panels: same face, body proportions, hair, skin tone, wardrobe, accessories, and age. No text labels, watermarks, extra people, or cropped panels. Studio lighting throughout. Professional concept art quality.`;
};

function compactScriptText(value, maxLength = 700) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function truncateCharacterDescription(value, maxLength = CHARACTER_DESCRIPTION_DISPLAY_LIMIT) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function normalizeCharacterName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildScriptCharacterDescription(character = {}, projectState = {}) {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function parseCharacterImage(img, index) {
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

// ─── ImagePreviewModal ───────────────────────────────────────────────────────

function ImagePreviewModal({ imageUrl, label, onClose, onDelete }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onWheel = (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => Math.max(0.5, Math.min(10, z * f)));
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    setDrag({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
  };

  const onMouseMove = (e) => {
    if (!drag) return;
    setPan({ x: e.clientX - drag.startX, y: e.clientY - drag.startY });
  };

  const onMouseUp = () => setDrag(null);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(var(--ink-950-rgb), 0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.875rem' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: 'var(--ink-800)', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', marginRight: '0.25rem' }}>{label?.toUpperCase()}</span>
        <span style={{ color: 'var(--ink-800)', fontSize: '0.6875rem', marginRight: '0.25rem' }}>Scroll to zoom · Drag to pan</span>
        <div style={{ width: '0.0625rem', height: '1.125rem', background: 'var(--ink-800)' }} />
        {onDelete && (
          <button onClick={onDelete} className="btn-action-danger" style={{ ...MODAL_BTN }}>
            Delete Image
          </button>
        )}
        <button onClick={onClose} style={{ ...MODAL_BTN, color: 'var(--text-soft)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.1)' }}>Close</button>
      </div>

      {/* Viewport */}
      <div
        ref={containerRef}
        style={{ width: '86vw', height: '78vh', overflow: 'hidden', position: 'relative', background: 'var(--ink-950)', borderRadius: '0.75rem', border: '0.0625rem solid var(--ink-800)', cursor: drag ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <img
          ref={imgRef} src={imageUrl} alt={label} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center center', userSelect: 'none', pointerEvents: 'none', display: 'block' }}
        />
        <div style={{ position: 'absolute', bottom: '0.875rem', left: '50%', transform: 'translateX(-50%)', color: 'var(--ink-800)', fontSize: '0.6875rem', pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center' }}>
          Scroll to zoom · Drag to pan
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CharactersScreen({ projectData = [], projectState = {}, onDataUpdate, projectId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [globalLibrary, setGlobalLibrary] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isPanelEditing, setIsPanelEditing] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createRefImage, setCreateRefImage] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isProcessingSheet, setIsProcessingSheet] = useState(false);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingChar, setGeneratingChar] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [activeCategory, setActiveCategory] = useState('project');
  const [renamingPanel, setRenamingPanel] = useState(null);

  const [scriptPromptPreview, setScriptPromptPreview] = useState(null); // { name, description, replaceIndex }
  const [sheetReplaceTarget, setSheetReplaceTarget] = useState(null);
  const [sheetProcessStatus, setSheetProcessStatus] = useState('');
  const [charProgressStep, setCharProgressStep] = useState(-1);
  const [imgRatios, setImgRatios] = useState({});
  const [anchorStatus, setAnchorStatus] = useState({});

  // ── Comparison board state ────────────────────────────────────────────────
  const [boardCards, setBoardCards] = useState([]);   // { id, charIndex, x, y }
  const [cardZOrder, setCardZOrder] = useState([]);   // card IDs bottom→top
  const [isDragOverBoard, setIsDragOverBoard] = useState(false);
  const dragState = useRef(null);   // { cardId, startX, startY, startCardX, startCardY }
  const resizeState = useRef(null); // { cardId, startX, startWidth }
  const boardRef = useRef(null);

  const CARD_DEFAULT_W = 220; // px
  const CARD_MIN_W     = 140;
  const CARD_MAX_W     = 700;

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);
  const collageRef = useRef(null);
  const projectCharacters = useMemo(() => (Array.isArray(projectData) ? projectData : []), [projectData]);
  const anchorInFlightRef = useRef(new Set());
  const latestCharactersRef = useRef(projectCharacters);
  const anchorQueue = useGenerationQueue({ concurrency: 2 });

  // Coalescing save — prevents last-write-wins race when 2 anchors complete simultaneously.
  const anchorSaveQRef = useRef({ pending: false, latest: null });
  const saveCharList = useCallback(async (characters) => {
    anchorSaveQRef.current.latest = { characters };
    if (anchorSaveQRef.current.pending) return;
    anchorSaveQRef.current.pending = true;
    while (anchorSaveQRef.current.latest) {
      const d = anchorSaveQRef.current.latest;
      anchorSaveQRef.current.latest = null;
      try { await onDataUpdate(d); } catch (e) { console.error('[anchor save]', e); }
    }
    anchorSaveQRef.current.pending = false;
  }, [onDataUpdate]);
  const [collageSize, setCollageSize] = useState({ width: PINBOARD_WIDTH, height: PINBOARD_HEIGHT });
  const supabase = useMemo(() => createClient(), []);
  const generatingReplaceIndex = Number.isInteger(generatingChar?.replaceIndex)
    ? generatingChar.replaceIndex
    : null;
  const displayedCharacters = activeCategory === 'project'
    ? [
        ...projectCharacters.map((char, index) => (
          generatingReplaceIndex === index ? generatingChar : char
        )),
        ...(generatingChar && generatingReplaceIndex === null ? [generatingChar] : []),
      ]
    : globalLibrary;
  const activeChar = displayedCharacters[activeTab] || null;
  const isGeneratingActive = Boolean(activeChar?.isGeneratingReference || activeChar?.id === 'generating');
  const activeAnchorState = activeChar?.name
    ? (anchorStatus[activeChar.name] || (activeChar?.anchor_image_url ? 'done' : undefined))
    : undefined;
  const anyAnchorsGenerating = Object.values(anchorStatus).some(status => status === 'generating');
  const busy = isProcessingSheet || isGenerating;

  const loadGlobalLibrary = useCallback(async () => {
    const { data, error } = await supabase.from('characters_library').select('*').order('created_at', { ascending: false });
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
    if (!activeChar?.images?.length) return undefined;

    const sources = activeChar.images
      .map((img, index) => parseCharacterImage(img, index))
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
  }, [activeChar?.images, imgRatios]);

  useEffect(() => {
    latestCharactersRef.current = projectCharacters;
  }, [projectCharacters]);

  const generateAnchorForCharacter = useCallback(async (character, projectStateSnapshot = projectState) => {
    if (!projectId || !character?.name) return;
    const normalizedName = normalizeCharacterName(character.name);
    if (!normalizedName || anchorInFlightRef.current.has(normalizedName)) return;
    if (character?.anchor_image_url) {
      setAnchorStatus(prev => (prev[character.name] === 'done' ? prev : { ...prev, [character.name]: 'done' }));
      return;
    }

    anchorInFlightRef.current.add(normalizedName);
    setAnchorStatus(prev => ({ ...prev, [character.name]: 'generating' }));

    try {
      const res = await fetch('/api/generate-character-anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, character, projectState: projectStateSnapshot }),
      });
      const data = await res.json();

      if (res.ok && data?.success && data?.anchor_image_url) {
        setAnchorStatus(prev => ({ ...prev, [character.name]: 'done' }));
        const anchorGeneratedAt = new Date().toISOString();
        const baseCharacters = Array.isArray(latestCharactersRef.current) ? latestCharactersRef.current : [];
        let matched = false;
        const updatedChars = baseCharacters.map(existingChar => {
          if (normalizeCharacterName(existingChar?.name) !== normalizedName) return existingChar;
          matched = true;
          return {
            ...existingChar,
            anchor_image_url: data.anchor_image_url,
            anchor_generated_at: anchorGeneratedAt,
          };
        });
        if (!matched) return;
        await onDataUpdate({ characters: updatedChars });
      } else {
        setAnchorStatus(prev => ({ ...prev, [character.name]: 'failed' }));
      }
    } catch (error) {
      console.error('Anchor generation failed for', character?.name, error);
      setAnchorStatus(prev => ({ ...prev, [character.name]: 'failed' }));
    } finally {
      anchorInFlightRef.current.delete(normalizedName);
    }
  }, [onDataUpdate, projectId, projectState]);

  // Force-refresh: strips the existing anchor URL then delegates to the same
  // function used on page load — guarantees identical code path, no duplicate logic.
  const forceRefreshAnchor = useCallback(async (character) => {
    if (!character?.name) return;
    const normalizedName = normalizeCharacterName(character.name);
    // Clear any stuck in-flight entry so a previously failed attempt doesn't block retries.
    anchorInFlightRef.current.delete(normalizedName);
    // Strip anchor URL so generateAnchorForCharacter doesn't skip.
    const stripped = { ...character, anchor_image_url: null, anchor_generated_at: null };
    await generateAnchorForCharacter(stripped, projectState);
  }, [generateAnchorForCharacter, projectState]);

  // Queue-aware anchor job — throws on failure so the queue can retry on rate limits.
  const runAnchorJobForQueue = useCallback(async (char) => {
    const normalizedName = normalizeCharacterName(char.name);
    anchorInFlightRef.current.delete(normalizedName);
    anchorInFlightRef.current.add(normalizedName);
    const stripped = { ...char, anchor_image_url: null, anchor_generated_at: null };
    setAnchorStatus(prev => ({ ...prev, [char.name]: 'generating' }));
    try {
      const res = await fetch('/api/generate-character-anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, character: stripped, projectState }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.anchor_image_url) {
        const err = new Error(data?.reason || `Anchor generation failed for ${char.name}`);
        err.status = res.status;
        throw err;
      }
      setAnchorStatus(prev => ({ ...prev, [char.name]: 'done' }));
      // Update ref immediately so concurrent jobs see the latest characters array.
      const updatedChars = (Array.isArray(latestCharactersRef.current) ? latestCharactersRef.current : []).map(c =>
        normalizeCharacterName(c?.name) === normalizedName
          ? { ...c, anchor_image_url: data.anchor_image_url, anchor_generated_at: new Date().toISOString() }
          : c
      );
      latestCharactersRef.current = updatedChars;
      await saveCharList(updatedChars);
      return data.anchor_image_url;
    } catch (err) {
      setAnchorStatus(prev => ({ ...prev, [char.name]: 'failed' }));
      throw err; // queue handles retry
    } finally {
      anchorInFlightRef.current.delete(normalizedName);
    }
  }, [projectId, projectState, saveCharList]);

  // Batch-refresh all anchors via the concurrent queue (2 at a time).
  const refreshAllAnchors = useCallback(() => {
    const chars = projectCharacters.filter(c => c?.name);
    if (!chars.length) return;
    anchorQueue.enqueue(
      chars.map(char => ({
        id: `anchor-${char.name}`,
        label: char.name,
        run: () => runAnchorJobForQueue(char),
      }))
    );
  }, [projectCharacters, anchorQueue, runAnchorJobForQueue]);

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

  const callCharacterGenerator = async (payload) => {
    const res = await fetch('/api/generate-character-pose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  };

  const saveToGlobalLibrary = async (charObj, source) => {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error(userErr?.message || 'No user found');

      const { error: insErr } = await supabase.from('characters_library').insert({
        user_id: user.id,
        name: charObj.name,
        description: charObj.description,
        images: charObj.images,
        source: source,
        sheet_url: charObj.sheetUrl || null
      });

      if (insErr) throw insErr;
      await refreshGlobalLibrary();
    } catch (err) {
      console.error('Failed to save to global library:', err);
    }
  };

  const handleAddGlobalToProject = async () => {
    if (!activeChar || activeCategory !== 'global') return;
    const exists = projectCharacters.some(character => (
      String(character?.name || '').trim().toLowerCase() === String(activeChar.name || '').trim().toLowerCase()
    ));
    if (exists) {
      setActiveCategory('project');
      setActiveTab(Math.max(0, projectCharacters.findIndex(character => (
        String(character?.name || '').trim().toLowerCase() === String(activeChar.name || '').trim().toLowerCase()
      ))));
      return;
    }

    const newChar = {
      ...activeChar,
      id: `character-${activeChar.id || Date.now()}-${Date.now()}`,
      name: String(activeChar.name || 'CHARACTER').trim().toUpperCase(),
      description: activeChar.description || activeChar.visual_prompt || '',
      visual_prompt: activeChar.visual_prompt || activeChar.description || '',
      images: Array.isArray(activeChar.images) ? activeChar.images : [],
      source: activeChar.source || 'history',
      sheetUrl: activeChar.sheetUrl || activeChar.sheet_url || null,
    };
    const updatedChars = [...projectCharacters, newChar];
    await onDataUpdate({ characters: updatedChars });
    if (newChar.images?.length && !newChar.anchor_image_url) {
      void generateAnchorForCharacter(
        newChar,
        { ...projectState, characters: updatedChars }
      );
    }
    setActiveCategory('project');
    setActiveTab(updatedChars.length - 1);
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
    void processSheetFile(file);
  };

  const handleSheetDrop = (e) => {
    e.preventDefault();
    setIsDraggingSheet(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setSheetReplaceTarget(null);
    void processSheetFile(file);
  };

  const handleRefDrop = (e) => {
    e.preventDefault();
    setIsDraggingRef(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleRefImageSelect({ target: { files: [file], value: '' } });
  };

  const processSheetFile = async (file) => {
    if (!file) return;
    setIsProcessingSheet(true);
    setSheetProcessStatus('Uploading full sheet...');

    try {
      const sheetPath = `${projectId}/sheets/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, file);
      if (upErr) throw upErr;
      const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);
      const replaceIndex = Number.isInteger(sheetReplaceTarget?.index) && sheetReplaceTarget.index >= 0 && sheetReplaceTarget.index < projectCharacters.length
        ? sheetReplaceTarget.index
        : null;
      const existingChar = replaceIndex !== null ? projectCharacters[replaceIndex] : null;
      const charName = existingChar
        ? (sheetReplaceTarget?.name || existingChar.name || file.name.split('.')[0]).trim().toUpperCase()
        : file.name.split('.')[0].toUpperCase();
      const charDescription = existingChar
        ? (sheetReplaceTarget?.description ?? existingChar.description ?? 'Uploaded from character sheet')
        : 'Uploaded from character sheet';
      const sheetImage = { url: sheetUrl, label: 'CHARACTER SHEET' };

      setGeneratingChar({
        ...(existingChar || {}),
        id: existingChar?.id || 'generating',
        name: charName,
        description: charDescription,
        images: [sheetImage],
        isGeneratingReference: true,
        replaceIndex,
      });
      setActiveTab(replaceIndex !== null ? replaceIndex : projectCharacters.length);
      setActiveCategory('project');
      setSheetProcessStatus('Saving character sheet...');

      const newChar = {
        ...(existingChar || {}),
        id: existingChar?.id || Date.now(),
        name: charName,
        description: charDescription,
        images: [sheetImage],
        source: 'upload',
        sheetUrl,
      };
      const updatedChars = [...projectCharacters];
      if (replaceIndex !== null) {
        updatedChars[replaceIndex] = newChar;
      } else {
        updatedChars.push(newChar);
      }
      await onDataUpdate({ characters: updatedChars });
      if (newChar.images?.length && !newChar.anchor_image_url) {
        void generateAnchorForCharacter(
          newChar,
          { ...projectState, characters: updatedChars }
        );
      }
      setActiveTab(replaceIndex !== null ? replaceIndex : updatedChars.length - 1);
      if (replaceIndex === null) saveToGlobalLibrary(newChar, 'upload');
    } catch (err) {
      console.error('Sheet processing failed:', err);
      alert('We could not process that character sheet. Please try another image.');
    } finally {
      setIsProcessingSheet(false);
      setGeneratingChar(null);
      setSheetProcessStatus('');
      setSheetReplaceTarget(null);
    }
  };

  const generateCharacterReferences = async ({ name, description, refImage = null, replaceIndex = null }) => {
    const charName = name.trim().toUpperCase();
    const desc = description.trim();
    setShowCreateModal(false);
    setCreateName('');
    setCreateDesc('');
    setCreateRefImage(null);
    setIsGenerating(true);
    setCharProgressStep(0);

    try {
      const tempId = Date.now();
      const isReplacing = Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < projectCharacters.length;
      const existingChar = isReplacing ? projectCharacters[replaceIndex] : null;
      setGeneratingChar({
        ...(existingChar || {}),
        id: existingChar?.id || tempId,
        name: charName,
        description: desc,
        images: [{ label: 'CHARACTER SHEET', url: null }],
        isGeneratingReference: true,
        replaceIndex: isReplacing ? replaceIndex : null,
      });
      setActiveTab(isReplacing ? replaceIndex : projectCharacters.length);
      setActiveCategory('project');

      const payload = {
        characterDescription: desc,
        sheetPrompt: buildSheetPrompt(desc, Boolean(refImage?.base64)),
        label: 'CHARACTER SHEET',
      };

      if (refImage?.base64) {
        payload.base64 = refImage.base64;
        payload.mimeType = refImage.mimeType || 'image/png';
      }

      const { imageBase64, error } = await callCharacterGenerator(payload);
      if (error) throw new Error(error);
      if (!imageBase64) throw new Error('Character sheet generation returned no image.');

      const blob = base64ToBlob(imageBase64, 'image/png');
      const url = await uploadBlob(blob, 'image/png', `${projectId}/generated/${Date.now()}-character-sheet.png`);
      const sheetImage = { url, label: 'CHARACTER SHEET' };
      setGeneratingChar(prev => prev ? { ...prev, images: [sheetImage] } : prev);
      setCharProgressStep(CHARACTER_STEPS.length - 1);
      const newChar = {
        ...(existingChar || {}),
        id: existingChar?.id || tempId,
        name: charName,
        description: desc,
        visual_prompt: existingChar?.visual_prompt || desc,
        images: [sheetImage],
        source: 'ai',
        sheetUrl: url,
      };
      const updatedChars = [...projectCharacters];
      if (isReplacing) {
        updatedChars[replaceIndex] = newChar;
      } else {
        updatedChars.push(newChar);
      }
      await onDataUpdate({ characters: updatedChars });
      if (newChar.images?.length && !newChar.anchor_image_url) {
        void generateAnchorForCharacter(
          newChar,
          { ...projectState, characters: updatedChars }
        );
      }
      setActiveTab(isReplacing ? replaceIndex : updatedChars.length - 1);
      if (!isReplacing) saveToGlobalLibrary(newChar, 'ai');
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Character could not be created. Please try again.');
    } finally {
      setIsGenerating(false);
      setCharProgressStep(-1);
      setGeneratingChar(null);
    }
  };

  const handleGenerateAngles = async () => {
    if (!createName.trim()) return alert('Enter a character name');
    if (!createDesc.trim()) return alert('Describe the character');
    await generateCharacterReferences({
      name: createName,
      description: createDesc,
      refImage: createRefImage,
    });
  };

  const handleGenerateFromScript = () => {
    const targetIndex = activeCategory === 'project' && activeChar && activeChar.id !== 'generating'
      ? activeTab
      : -1;
    const scriptCharacters = Array.isArray(projectState?.characters) ? projectState.characters : [];
    const sourceCharacter = targetIndex >= 0
      ? projectCharacters[targetIndex]
      : scriptCharacters.find(character => character?.name || character?.visual_prompt || character?.description);

    if (!sourceCharacter) {
      alert('Generate or approve the script first so I can pull a character brief from it.');
      return;
    }

    const name = sourceCharacter.name || 'SCRIPT CHARACTER';
    const description = buildScriptCharacterDescription(sourceCharacter, projectState);
    if (!description.trim()) {
      alert('The script does not include enough character detail yet.');
      return;
    }

    setScriptPromptPreview({ name, description, replaceIndex: targetIndex >= 0 ? targetIndex : null });
  };

  const handleConfirmScriptGenerate = async () => {
    if (!scriptPromptPreview) return;
    const { name, description, replaceIndex } = scriptPromptPreview;
    setScriptPromptPreview(null);
    await generateCharacterReferences({ name, description, replaceIndex });
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    try {
      if (activeCategory === 'global') {
        const { error } = await supabase
          .from('characters_library')
          .update({ name: editName.trim().toUpperCase(), description: editDesc.trim() })
          .eq('id', activeChar.id);
        if (error) throw error;
        await refreshGlobalLibrary();
      } else {
        const updatedChars = [...projectCharacters];
        updatedChars[activeTab] = { ...projectCharacters[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
        await onDataUpdate({ characters: updatedChars });
      }
      setIsPanelEditing(false);
    } catch (error) {
      console.error('Character rename failed:', error);
      alert('Character could not be renamed. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!activeChar || activeChar.id === 'generating') return;
    if (!confirm(`Delete ${activeChar.name}?`)) return;
    try {
      if (activeCategory === 'project') {
        await onDataUpdate({ characters: projectCharacters.filter((_, i) => i !== activeTab) });
        setActiveTab(Math.max(0, activeTab - 1));
      } else {
        const { error } = await supabase.from('characters_library').delete().eq('id', activeChar.id);
        if (error) throw error;
        await refreshGlobalLibrary();
        setActiveTab(Math.max(0, activeTab - 1));
      }
    } catch { alert('Delete could not be completed. Please try again.'); }
  };

  const handleDeleteImage = async (charIdx, imgIdx) => {
    if (!confirm('Remove this image?')) return;
    const char = projectCharacters[charIdx];
    const images = char.images.filter((_, i) => i !== imgIdx);
    const updatedChars = [...projectCharacters];
    updatedChars[charIdx] = { ...char, images };
    await onDataUpdate({ characters: updatedChars });
  };

  const handleRenameLabel = async (charIdx, imgIdx, newLabel) => {
    setRenamingPanel(null);
    if (charIdx < 0 || !newLabel.trim()) return;
    const char = projectCharacters[charIdx];
    if (!char) return;
    const images = [...char.images];
    const existing = images[imgIdx];
    images[imgIdx] = { ...(typeof existing === 'object' ? existing : { url: existing }), label: newLabel.trim().toUpperCase() };
    const updatedChars = [...projectCharacters];
    updatedChars[charIdx] = { ...char, images };
    await onDataUpdate({ characters: updatedChars });
  };

  // ── Comparison board helpers ──────────────────────────────────────────────

  const bringToFront = useCallback((id) => {
    setCardZOrder(prev => [...prev.filter(z => z !== id), id]);
  }, []);

  const addCardToBoard = useCallback((charIndex, dropX, dropY) => {
    const existing = boardCards.find(c => c.charIndex === charIndex);
    if (existing) { bringToFront(existing.id); setActiveTab(charIndex); return; }
    const id = `card-${Date.now()}-${charIndex}`;
    setBoardCards(prev => [...prev, { id, charIndex, x: Math.max(0, dropX - 110), y: Math.max(0, dropY - 60), width: CARD_DEFAULT_W }]);
    setCardZOrder(prev => [...prev, id]);
    setActiveTab(charIndex);
  }, [boardCards, bringToFront]);

  const removeCardFromBoard = useCallback((id) => {
    setBoardCards(prev => prev.filter(c => c.id !== id));
    setCardZOrder(prev => prev.filter(z => z !== id));
  }, []);

  const handleCardMouseDown = useCallback((e, card) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(card.id);
    setActiveTab(card.charIndex);
    dragState.current = { cardId: card.id, startX: e.clientX, startY: e.clientY, startCardX: card.x, startCardY: card.y };
  }, [bringToFront]);

  const handleResizeMouseDown = useCallback((e, card) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { cardId: card.id, startX: e.clientX, startWidth: card.width ?? CARD_DEFAULT_W };
  }, []);

  // Global mouse handlers — shared by both drag-move and resize
  useEffect(() => {
    const onMove = (e) => {
      if (dragState.current) {
        const { cardId, startX, startY, startCardX, startCardY } = dragState.current;
        setBoardCards(prev => prev.map(c => c.id === cardId
          ? { ...c, x: Math.max(0, startCardX + e.clientX - startX), y: Math.max(0, startCardY + e.clientY - startY) }
          : c));
      } else if (resizeState.current) {
        const { cardId, startX, startWidth } = resizeState.current;
        const newW = Math.max(CARD_MIN_W, Math.min(CARD_MAX_W, startWidth + e.clientX - startX));
        setBoardCards(prev => prev.map(c => c.id === cardId ? { ...c, width: newW } : c));
      }
    };
    const onUp = () => { dragState.current = null; resizeState.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const handleBoardDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOverBoard(false);
    const charIndex = parseInt(e.dataTransfer.getData('char-index'), 10);
    if (isNaN(charIndex)) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    addCardToBoard(charIndex, e.clientX - rect.left, e.clientY - rect.top);
  }, [addCardToBoard]);

  // Helper: get best preview image for a character
  const getCharPreviewImage = useCallback((char) => {
    if (!char) return null;
    if (char.anchor_image_url) return { src: char.anchor_image_url, isAnchor: true };
    const firstImg = char.images?.[0];
    if (firstImg) {
      const { src } = parseCharacterImage(firstImg, 0);
      if (src) return { src, isAnchor: false };
    }
    return null;
  }, []);

  useEffect(() => { setIsPanelEditing(false); }, [activeTab, activeCategory]);

  const openPanelEdit = useCallback(() => {
    if (!activeChar) return;
    setEditName(activeChar.name || '');
    setEditDesc(activeChar.description || '');
    setIsPanelEditing(true);
  }, [activeChar]);

  return (
    <div className="screen active screen-fill" id="s4">
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,var(--bg-deep) 25%,var(--surface-2) 50%,var(--bg-deep) 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .tab-pill.on-board::after {
          content: '';
          display: inline-block;
          width: 0.375rem;
          height: 0.375rem;
          border-radius: 50%;
          background: var(--cyan);
          margin-left: 0.375rem;
          vertical-align: middle;
          box-shadow: 0 0 0.375rem rgba(var(--cyan-rgb), 0.6);
        }
      `}</style>

      <WorkflowThreePaneShell
        showLeftPanel={false}
        rightTitle="Character Controls"
        storageKey="workflow-three-pane:s4"
        minRightWidth={320}
        maxRightWidth={540}
        defaultRightWidth={384}
        main={(
          <div className="main-content" style={{ background: 'var(--bg)' }}>
            {/* Header */}
            <div className="main-header" style={{ padding: '1.125rem 2rem' }}>
              {/* Character tabs — draggable onto the comparison board */}
              <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.875rem', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, marginRight: '0.25rem' }}>drag to board →</span>
                {displayedCharacters.map((char, i) => (
                  <div
                    key={char.id || i}
                    draggable={true}
                    onDragStart={e => { e.dataTransfer.setData('char-index', String(i)); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => setActiveTab(i)}
                    className={`tab-pill ${activeTab === i ? 'active' : ''}${boardCards.some(c => c.charIndex === i) ? ' on-board' : ''}`}
                    style={{ whiteSpace: 'nowrap', cursor: 'grab' }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                      {char.name}
                    </span>
                    {(char.isGeneratingReference || char.id === 'generating') && (
                      <span style={{ marginLeft: '0.3125rem', opacity: 0.55, fontSize: '0.5625rem', fontFamily: 'var(--font-mono)' }}>
                        {char.images.filter(x => x.url).length}/{char.images.length}
                      </span>
                    )}
                    {!char.isGeneratingReference && anchorStatus[char.name] === 'generating' && (
                      <span style={{ marginLeft: '0.375rem', opacity: 0.75, fontSize: '0.5625rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Loader2 size={10} className="spin" />
                        ANCHOR
                      </span>
                    )}
                    {!char.isGeneratingReference && (anchorStatus[char.name] === 'done' || char?.anchor_image_url) && (
                      <span style={{ marginLeft: '0.375rem', color: 'var(--cyan-400)', fontSize: '0.5625rem' }}>✓</span>
                    )}
                    {!char.isGeneratingReference && anchorStatus[char.name] === 'failed' && (
                      <span style={{ marginLeft: '0.375rem', color: 'var(--violet-400)', fontSize: '0.5625rem' }}>!</span>
                    )}
                  </div>
                ))}
                {activeCategory === 'project' && !isGeneratingActive && (
                  <div
                    onClick={() => setShowCreateModal(true)}
                    className="tab-pill"
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--orange)',
                      background: 'rgba(var(--violet-rgb), 0.06)',
                      borderColor: 'rgba(var(--violet-rgb), 0.22)',
                      cursor: 'pointer',
                      padding: '0.3125rem 0.875rem',
                    }}
                  >
                    +
                  </div>
                )}
              </div>

              {/* Character info row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h1 className="editorial-title editorial-h2">
                    {activeChar ? (
                      <>
                        {activeChar.name}
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>.</span>
                      </>
                    ) : (
                      <>Cast <span className="text-grad">library.</span></>
                    )}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.5938rem',
                        fontWeight: 500,
                        padding: '0.25rem 0.625rem',
                        borderRadius: '62.4375rem',
                        background: activeCategory === 'global' ? 'rgba(var(--violet-rgb), 0.1)' : 'rgba(var(--violet-rgb), 0.1)',
                        color: activeCategory === 'global' ? 'var(--orange)' : 'var(--teal)',
                        border: `0.0625rem solid ${activeCategory === 'global' ? 'rgba(var(--violet-rgb), 0.22)' : 'rgba(var(--violet-rgb), 0.22)'}`,
                        letterSpacing: '0.18em',
                      }}
                    >
                      {activeCategory === 'global' ? '◆ GLOBAL' : '◇ PROJECT'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.015em' }}>
                      {truncateCharacterDescription(activeChar?.description) || 'No notes yet.'}
                    </span>
                    {activeCategory === 'project' && activeChar?.name && activeAnchorState === 'generating' && (
                      <span style={{ color: 'var(--cyan-400)', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Loader2 size={12} className="spin" />
                        Building identity anchor…
                      </span>
                    )}
                    {activeCategory === 'project' && activeChar?.name && activeAnchorState === 'failed' && (
                      <span style={{ color: 'var(--violet-400)', fontSize: '0.6875rem' }}>
                        Anchor failed — will use reference panels
                      </span>
                    )}
                  </div>
                </div>
                {activeChar && !isGeneratingActive && activeCategory === 'global' && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={handleAddGlobalToProject} className="btn-secondary" style={{ padding: '0.5rem 0.875rem', fontSize: '0.7188rem', whiteSpace: 'nowrap' }}>Add to project</button>
                    <button onClick={handleDelete} className="btn-action-danger" style={{ padding: '0.5rem 0.875rem', fontSize: '0.7188rem' }}>Delete from history</button>
                  </div>
                )}
                {activeChar && !isGeneratingActive && activeCategory === 'project' && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={handleDelete} className="btn-action-danger" style={{ padding: '0.5rem 0.875rem', fontSize: '0.7188rem', fontWeight: 600 }}>Delete</button>
                  </div>
                )}
              </div>
            </div>

            {/* Comparison board — drag character tabs from above onto this canvas */}
            <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', padding: '0.5rem 1.5rem 1.125rem', boxSizing: 'border-box' }}>
              <div
                ref={boardRef}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOverBoard(true); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOverBoard(false); }}
                onDrop={handleBoardDrop}
                style={{
                  width: '100%', height: '100%',
                  background: 'var(--bg-deep)',
                  boxShadow: isDragOverBoard ? 'inset 0 0 0 0.125rem var(--cyan-border)' : 'var(--neo-inset)',
                  border: `0.0625rem solid ${isDragOverBoard ? 'var(--cyan-border)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color 120ms ease, box-shadow 120ms ease',
                  backgroundImage: 'radial-gradient(rgba(var(--cyan-300-rgb), 0.035) 0.0625rem, transparent 0.0625rem)',
                  backgroundSize: '1.5rem 1.5rem',
                }}
              >
                {/* Empty state */}
                {boardCards.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: '3.25rem', height: '3.25rem', borderRadius: '0.875rem', background: 'var(--surface-2)', boxShadow: 'var(--neo-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', opacity: isDragOverBoard ? 1 : 0.6 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                    </div>
                    <div style={{ color: isDragOverBoard ? 'var(--cyan)' : 'var(--text-muted)', fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: '0.375rem', transition: 'color 120ms ease' }}>
                      {isDragOverBoard ? 'Drop to add to board' : 'Drag characters here to compare'}
                    </div>
                    <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>
                      Drag character tabs from the bar above onto this board
                    </div>
                  </div>
                )}

                {/* Drop hint overlay when dragging over non-empty board */}
                {boardCards.length > 0 && isDragOverBoard && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.04)', border: '0.125rem dashed var(--cyan-border)', borderRadius: 'var(--radius-lg)', pointerEvents: 'none', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--cyan)' }}>Drop to add character</span>
                  </div>
                )}

                {/* Character cards */}
                {boardCards.map(card => {
                  const char = displayedCharacters[card.charIndex];
                  if (!char) return null;
                  const preview = getCharPreviewImage(char);
                  const zIndex = cardZOrder.indexOf(card.id) + 1;
                  const isSelected = activeTab === card.charIndex;
                  const isGeneratingThis = (char.isGeneratingReference || char.id === 'generating');

                  return (
                    <div
                      key={card.id}
                      onMouseDown={e => handleCardMouseDown(e, card)}
                      onClick={e => { e.stopPropagation(); setActiveTab(card.charIndex); bringToFront(card.id); }}
                      style={{
                        position: 'absolute',
                        left: card.x,
                        top: card.y,
                        width: card.width ?? CARD_DEFAULT_W,
                        background: 'var(--surface-2)',
                        border: `0.0625rem solid ${isSelected ? 'var(--cyan-border)' : 'rgba(var(--cyan-300-rgb), 0.1)'}`,
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: isSelected ? 'var(--neo-active)' : 'var(--neo-raised)',
                        overflow: 'visible',
                        cursor: dragState.current?.cardId === card.id ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        zIndex,
                        transition: 'border-color 120ms ease, box-shadow 120ms ease',
                      }}
                    >
                      {/* Clip inner content (image + name) to the card boundary) */}
                      <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                      {/* Image area */}
                      <div style={{ position: 'relative', width: '100%', background: 'var(--bg-deep)', aspectRatio: preview?.isAnchor ? '4/5' : '21/9', overflow: 'hidden' }}>
                        {preview ? (
                          <img
                            src={preview.src}
                            alt={char.name}
                            draggable={false}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                          />
                        ) : isGeneratingThis ? (
                          <div className="skeleton-shimmer" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Loader2 size={20} className="spin" style={{ color: 'var(--cyan)', opacity: 0.6 }} />
                          </div>
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--cyan-300-rgb), 0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                          </div>
                        )}
                        {/* Remove button */}
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); removeCardFromBoard(card.id); }}
                          style={{ position: 'absolute', top: '0.375rem', right: '0.375rem', width: '1.375rem', height: '1.375rem', borderRadius: '50%', background: 'rgba(var(--ink-950-rgb), 0.75)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.15)', color: 'var(--text-soft)', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, backdropFilter: 'blur(0.25rem)' }}
                        >×</button>
                      </div>
                      {/* Name strip */}
                      <div style={{ padding: '0.5rem 0.625rem 0.4375rem', borderTop: `0.0625rem solid rgba(var(--cyan-300-rgb), 0.06)` }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700, color: isSelected ? 'var(--cyan)' : 'var(--text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 120ms ease' }}>
                          {char.name}
                        </div>
                        {char.description && (
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
                            {char.description.slice(0, 55)}
                          </div>
                        )}
                      </div>
                      </div>{/* end inner clip wrapper */}

                      {/* Resize handle — bottom-right corner */}
                      <div
                        onMouseDown={e => handleResizeMouseDown(e, card)}
                        title="Drag to resize"
                        style={{
                          position: 'absolute',
                          bottom: -1,
                          right: -1,
                          width: '1.125rem',
                          height: '1.125rem',
                          cursor: 'nwse-resize',
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'flex-end',
                          padding: '0.1875rem',
                          borderBottomRightRadius: 'var(--radius-lg)',
                          zIndex: 2,
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="rgba(var(--cyan-300-rgb),0.45)" strokeWidth="1.25" strokeLinecap="round"/>
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        right={(
          <div className="layout-sidebar scroll-y" style={{ width: '100%', minWidth: 0, padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <input type="file" ref={fileInputRef} onChange={handleSheetUpload} style={{ display: 'none' }} accept="image/*" />

            {isPanelEditing && activeChar ? (
              /* ── Edit form ── */
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <div className="kicker" style={{ marginBottom: '0.25rem' }}>Edit Character</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '13rem' }}>{activeChar.name}</div>
                  </div>
                  <button onClick={() => setIsPanelEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.375rem', cursor: 'pointer', padding: '0.125rem 0.375rem', lineHeight: 1, borderRadius: '0.375rem' }}>×</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: '1 1 auto' }}>
                  <div>
                    <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.375rem' }}>NAME</label>
                    <input className="input-inset" value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '0.5625rem 0.75rem', fontSize: '0.8125rem', borderRadius: '0.5rem', width: '100%', boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.375rem' }}>DESCRIPTION</label>
                    <textarea className="textarea-inset" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ padding: '0.5625rem 0.75rem', fontSize: '0.8125rem', borderRadius: '0.5rem', height: '6rem', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                  </div>

                  {activeCategory === 'project' && (
                    <div>
                      <div className="panel-meta-label" style={{ marginBottom: '0.5rem' }}>REPLACE SHEET</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4375rem' }}>
                        <button className="btn-outline" style={{ padding: '0.5625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', fontSize: '0.75rem', width: '100%' }}
                          onClick={() => {
                            setSheetReplaceTarget({ index: activeTab, name: (editName || activeChar?.name || '').trim().toUpperCase(), description: editDesc.trim() });
                            setIsPanelEditing(false);
                            fileInputRef.current?.click();
                          }}
                        >
                          <Upload size={13} /> Upload New Sheet
                        </button>
                        <button className="btn-action-generate" style={{ padding: '0.5625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', fontSize: '0.75rem', width: '100%' }}
                          disabled={busy}
                          onClick={() => { setIsPanelEditing(false); handleGenerateFromScript(); }}
                        >
                          <FileText size={13} /> Regenerate from Script
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '1rem', marginTop: 'auto' }}>
                  <button className="btn-orange" style={{ flex: 1, padding: '0.75rem', fontWeight: 700, fontSize: '0.8125rem' }} onClick={handleEditSave}>
                    {activeCategory === 'global' ? 'Rename' : 'Save Changes'}
                  </button>
                  <button className="btn-outline" style={{ flex: 1, padding: '0.75rem', fontSize: '0.8125rem' }} onClick={() => setIsPanelEditing(false)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              /* ── Normal view ── */
              <>
                <div style={{ marginBottom: '1.25rem' }}>
                  <div className="kicker" style={{ marginBottom: '0.5rem' }}>Character · Studio</div>
                  <h2 className="editorial-title editorial-h2" style={{ marginBottom: '0.375rem' }}>
                    Build your <span className="text-grad">cast.</span>
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.7188rem', lineHeight: 1.5 }}>
                    {busy && generatingChar
                      ? `Saving ${generatingChar.images.filter(x => x.url).length}/${generatingChar.images.length} sheet…`
                      : busy ? 'Processing sheet…' : 'Upload a full sheet or create one.'}
                  </p>
                </div>

                {/* Active character image preview */}
                {(() => {
                  const preview = getCharPreviewImage(activeChar);
                  if (!preview) return null;
                  return (
                    <div style={{ marginBottom: '0.5rem', borderRadius: 'var(--radius)', overflow: 'hidden', border: '0.0625rem solid var(--border-mid)', background: 'var(--bg-deep)', cursor: 'pointer' }}
                      onClick={() => setPreviewTarget({ charIdx: activeCategory === 'project' ? activeTab : -1, imgIdx: 0, url: preview.src, label: activeChar.name })}
                      title="Click to enlarge"
                    >
                      <img src={preview.src} alt={activeChar?.name} style={{ width: '100%', display: 'block', aspectRatio: preview.isAnchor ? '16/9' : '21/9', objectFit: 'cover' }} />
                      <div style={{ padding: '0.375rem 0.625rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          {anchorStatus[activeChar?.name] === 'generating'
                            ? <><Loader2 size={9} className="spin" /> Refreshing anchor…</>
                            : preview.isAnchor ? '✓ Identity anchor' : 'Character sheet'}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); forceRefreshAnchor(activeChar); }} disabled={anchorStatus[activeChar?.name] === 'generating'} title="Regenerate identity anchor" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <RefreshCw size={9} />
                          </button>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--cyan)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>view ↗</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Edit button — shown when a character is selected */}
                {activeChar && !isGeneratingActive && (
                  <button onClick={openPanelEdit} className="btn-outline" style={{ width: '100%', padding: '0.5rem', fontSize: '0.6875rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
                    {activeCategory === 'global' ? 'Rename Character' : 'Edit Character'}
                  </button>
                )}

                {/* Category toggle */}
                <div className="neo-inset" style={{ display: 'flex', padding: '0.25rem', marginBottom: '1.375rem' }}>
                  {['project', 'global'].map(cat => (
                    <button key={cat} onClick={() => { setActiveCategory(cat); setActiveTab(0); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4375rem', border: activeCategory === cat ? '0.0625rem solid var(--cyan-border)' : '0.0625rem solid transparent', background: activeCategory === cat ? 'var(--surface-2)' : 'transparent', boxShadow: activeCategory === cat ? 'var(--neo-flat)' : 'none', color: activeCategory === cat ? 'var(--cyan)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out' }}>
                      {cat === 'project' ? 'Project' : 'History'}
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button onClick={() => setShowCreateModal(true)} disabled={busy} className="btn-orange" style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
                    Create new
                  </button>
                  {isGenerating && <ProgressBar steps={CHARACTER_STEPS} currentStep={charProgressStep} />}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {activeCategory === 'project' && projectCharacters.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Identity Anchors</div>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        {activeChar && !activeChar.isGeneratingReference && (
                          <button className="btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem' }} onClick={() => forceRefreshAnchor(activeChar)} disabled={anchorStatus[activeChar?.name] === 'generating' || anyAnchorsGenerating}>
                            {anchorStatus[activeChar?.name] === 'generating' ? <><Loader2 size={11} className="spin" /> Refreshing…</> : <><RefreshCw size={11} /> Refresh anchor</>}
                          </button>
                        )}
                        <button className="btn-outline" style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem' }} onClick={refreshAllAnchors} disabled={anyAnchorsGenerating}>
                          {anyAnchorsGenerating ? <><Loader2 size={11} className="spin" /> Running…</> : <><RefreshCw size={11} /> Refresh all</>}
                        </button>
                      </div>
                    </div>
                  )}
                  {anyAnchorsGenerating && (
                    <div style={{ color: 'var(--violet-400)', fontSize: '0.6875rem', lineHeight: 1.5 }}>
                      Identity anchors processing — wait before generating shots for best consistency.
                    </div>
                  )}
                  <div className="panel-flat">
                    <div className="panel-meta-label">What is an identity anchor?</div>
                    <p className="body-sm">An anchor is a single locked portrait generated from the character sheet. Every shot and clip generation uses it to keep the character's face, body, and outfit consistent across the entire video. Refresh it after uploading a new sheet or changing the character description.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      />

      {/* ── Create Modal ── */}
      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '28.75rem' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div className="kicker" style={{ marginBottom: '0.625rem' }}>── Create New</div>
            <div className="editorial-title editorial-h2" style={{ marginBottom: '1.25rem' }}>
              Sketch the <span className="text-grad">cast.</span>
            </div>

            {/* ── Option 1: Upload Full Sheet ── */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>Upload existing sheet</div>
              <button
                className="btn-outline"
                style={{ width: '100%', padding: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem', fontSize: '0.8125rem', outline: isDraggingSheet ? '0.125rem dashed var(--cyan-border)' : 'none', outlineOffset: '0.125rem' }}
                onClick={() => { setSheetReplaceTarget(null); setShowCreateModal(false); fileInputRef.current.click(); }}
                onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                onDragEnter={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingSheet(false); }}
                onDrop={(e) => { setShowCreateModal(false); handleSheetDrop(e); }}
                disabled={busy}
              >
                <Upload size={14} />
                {isDraggingSheet ? 'Drop to upload' : isProcessingSheet ? 'Reading sheet…' : 'Upload Full Sheet'}
              </button>
            </div>

            {/* ── Option 2: Generate from Script ── */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>Generate from script</div>
              <button
                className="btn-action-generate"
                style={{ width: '100%', padding: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem', fontSize: '0.8125rem' }}
                onClick={() => { setShowCreateModal(false); handleGenerateFromScript(); }}
                disabled={busy}
              >
                <FileText size={14} />
                Generate from Script
              </button>
            </div>

            {/* ── Divider ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
              <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>or describe from scratch</span>
              <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
            </div>

            {/* ── Option 3: Generate from description ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ fontSize: '0.6562rem', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>CHARACTER NAME</label>
                <input type="text" placeholder="e.g. VIKRAM" value={createName} onChange={e => setCreateName(e.target.value)} className="input-inset" style={{ padding: '0.625rem 0.8125rem', background: 'var(--ink-900)', fontSize: '0.8125rem', borderRadius: '0.5rem' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '0.6562rem', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea placeholder="Ancient Indian warrior, 40s, grey beard, dark red dhoti, gold jewellery..." value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                  className="textarea-inset" style={{ padding: '0.625rem 0.8125rem', background: 'var(--ink-900)', fontSize: '0.8125rem', borderRadius: '0.5rem', minHeight: '4.5rem' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>

              {/* Reference image */}
              <div>
                <label style={{ fontSize: '0.6562rem', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  REFERENCE IMAGE <span style={{ color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', background: 'var(--ink-950)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.07)', borderRadius: '0.5rem' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '3.5rem', height: '3.5rem', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '0.375rem', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.625rem', marginTop: '0.125rem' }}>The sheet will match this character</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'rgba(var(--violet-rgb), 0.1)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.2)', color: 'var(--violet-400)', borderRadius: '0.3125rem', padding: '0.25rem 0.5rem', fontSize: '0.625rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                  </div>
                ) : (
                  <button
                    onClick={() => refFileInputRef.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingRef(false); }}
                    onDrop={handleRefDrop}
                    style={{ width: '100%', padding: '0.625rem', borderRadius: '0.5rem', background: isDraggingRef ? 'rgba(var(--cyan-rgb), 0.06)' : 'rgba(var(--cyan-300-rgb), 0.04)', border: isDraggingRef ? '0.0625rem dashed var(--cyan-border)' : '0.0625rem dashed rgba(var(--cyan-300-rgb), 0.22)', color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'border-color 120ms ease-out, background 120ms ease-out' }}>
                    {isDraggingRef ? 'Drop image here' : 'Upload Reference Image'}
                  </button>
                )}
              </div>

              <button className="btn-action-generate" style={{ width: '100%', padding: '0.8125rem', fontSize: '0.75rem' }} onClick={handleGenerateAngles}>
                Generate Character Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Preview Modal ── */}
      {previewTarget && (
        <ImagePreviewModal
          imageUrl={previewTarget.url}
          label={previewTarget.label}
          onClose={() => setPreviewTarget(null)}
          onDelete={() => {
            handleDeleteImage(previewTarget.charIdx, previewTarget.imgIdx);
            setPreviewTarget(null);
          }}
        />
      )}

      {/* Script prompt preview modal */}
      {scriptPromptPreview && (
        <div className="modal-overlay">
          <div className="modal-panel flex-col gap-16" style={{ maxWidth: '35rem' }}>
            <div>
              <div className="panel-meta-label" style={{ marginBottom: '0.375rem' }}>▪ Generate from Script</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{scriptPromptPreview.name}</div>
            </div>
            <div className="panel-inset" style={{ maxHeight: '16.25rem', fontSize: '0.7812rem' }}>
              {scriptPromptPreview.description}
            </div>
            <p className="body-sm">
              This prompt will be sent to the image model to generate character reference angles. Edit the description in the character card first if you need to adjust it.
            </p>
            <div className="flex-row gap-10">
              <button onClick={handleConfirmScriptGenerate} className="btn-action-generate" style={{ flex: 1, padding: '0.8125rem', fontWeight: 700 }}>Generate References</button>
              <button onClick={() => setScriptPromptPreview(null)} className="btn-outline" style={{ flex: 1, padding: '0.8125rem' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="flex-row gap-16" style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 10001, background: 'var(--ink-950)', border: '0.0625rem solid var(--cyan)', borderRadius: '0.75rem', padding: '1rem 1.25rem', boxShadow: '0 0.5rem 2rem rgba(var(--ink-950-rgb), 0.5)', alignItems: 'center' }}>
          <Loader2 size={24} className="spin" style={{ color: 'var(--cyan)' }} />
          <div>
            <div style={{ color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 600 }}>{isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Creating character sheet...'}</div>
            <div style={{ color: 'var(--cyan)', fontSize: '0.625rem', fontWeight: 700, marginTop: '0.125rem', letterSpacing: '0.05em' }}>Please keep this page open</div>
          </div>
        </div>
      )}

      <QueueStatusBar
        jobs={anchorQueue.jobs}
        isActive={anchorQueue.isActive}
        stats={anchorQueue.stats}
        onAbort={anchorQueue.abort}
        onClear={anchorQueue.clear}
        label="Identity anchors"
      />
    </div>
  );
}
