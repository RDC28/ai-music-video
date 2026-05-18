'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import ProgressBar from '../ProgressBar';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_BTN = {
  background: 'rgba(var(--cyan-300-rgb), 0.06)',
  border: '1px solid rgba(var(--cyan-300-rgb), 0.08)',
  color: 'var(--text-soft)',
  padding: '7px 12px',
  borderRadius: '6px',
  fontSize: '11px',
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
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(var(--ink-950-rgb), 0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: 'var(--ink-800)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', marginRight: '4px' }}>{label?.toUpperCase()}</span>
        <span style={{ color: 'var(--ink-800)', fontSize: '11px', marginRight: '4px' }}>Scroll to zoom · Drag to pan</span>
        <div style={{ width: '1px', height: '18px', background: 'var(--ink-800)' }} />
        {onDelete && (
          <button onClick={onDelete} style={{ ...MODAL_BTN, color: 'var(--violet-400)', border: '1px solid rgba(var(--violet-rgb), 0.3)' }}>
            Delete Image
          </button>
        )}
        <button onClick={onClose} style={{ ...MODAL_BTN, color: 'var(--text-soft)', border: '1px solid rgba(var(--cyan-300-rgb), 0.1)' }}>Close</button>
      </div>

      {/* Viewport */}
      <div
        ref={containerRef}
        style={{ width: '86vw', height: '78vh', overflow: 'hidden', position: 'relative', background: 'var(--ink-950)', borderRadius: '12px', border: '1px solid var(--ink-800)', cursor: drag ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <img
          ref={imgRef} src={imageUrl} alt={label} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center center', userSelect: 'none', pointerEvents: 'none', display: 'block' }}
        />
        <div style={{ position: 'absolute', bottom: '14px', left: '50%', transform: 'translateX(-50%)', color: 'var(--ink-800)', fontSize: '11px', pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center' }}>
          Scroll to zoom · Drag to pan
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CharactersScreen({ onNavigate, projectData = [], projectState = {}, onDataUpdate, projectId }) {
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

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);
  const collageRef = useRef(null);
  const projectCharacters = useMemo(() => (Array.isArray(projectData) ? projectData : []), [projectData]);
  const anchorInFlightRef = useRef(new Set());
  const latestCharactersRef = useRef(projectCharacters);
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
      setShowEditModal(false);
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

  return (
    <div className="screen active screen-fill" id="s4">
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,var(--bg-deep) 25%,var(--surface-2) 50%,var(--bg-deep) 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .img-card {
          --board-card-scale: 1;
          transition: transform 0.16s ease, filter 0.16s ease;
        }
        .img-card:hover {
          --board-card-scale: 1.06;
          z-index: 20;
          filter: brightness(1.1);
        }
      `}</style>

      <div className="layout-sidebar-main">

        {/* ── Sidebar ── */}
        <div className="layout-sidebar scroll-y" style={{ width: '256px', minWidth: '256px', padding: '24px', height: '100%' }}>

          <div style={{ marginBottom: '26px' }}>
            <div className="kicker" style={{ marginBottom: '12px' }}>Character · Studio</div>
            <h2 className="editorial-title editorial-h2" style={{ marginBottom: '10px' }}>
              Build your <span className="text-grad">cast.</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.6 }}>
              {busy && generatingChar
                ? `Saving ${generatingChar.images.filter(x => x.url).length}/${generatingChar.images.length} sheet…`
                : busy ? 'Processing sheet…' : 'Upload a full sheet or create one.'}
            </p>
          </div>

          {/* Category toggle */}
          <div className="neo-inset" style={{ display: 'flex', padding: '4px', marginBottom: '22px' }}>
            {['project', 'global'].map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setActiveTab(0); }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '7px',
                  border: activeCategory === cat ? '1px solid var(--cyan-border)' : '1px solid transparent',
                  background: activeCategory === cat ? 'var(--surface-2)' : 'transparent',
                  boxShadow: activeCategory === cat ? 'var(--neo-flat)' : 'none',
                  color: activeCategory === cat ? 'var(--cyan)' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  transition: 'background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out',
                }}
              >
                {cat === 'project' ? 'Project' : 'History'}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input type="file" ref={fileInputRef} onChange={handleSheetUpload} style={{ display: 'none' }} accept="image/*" />
            <button
              className="btn-orange"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', outline: isDraggingSheet ? '2px dashed var(--cyan-border)' : 'none', outlineOffset: '2px', transition: 'outline 120ms ease-out' }}
              onClick={() => {
                setSheetReplaceTarget(null);
                fileInputRef.current.click();
              }}
              onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
              onDragEnter={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingSheet(false); }}
              onDrop={handleSheetDrop}
              disabled={busy}
            >
              <Upload size={14} />
              {isDraggingSheet ? 'Drop to upload' : isProcessingSheet ? 'Reading sheet...' : 'Upload Full Sheet'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={busy}
              className="btn-outline"
              style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
            >
              Create new
            </button>
            <button
              onClick={handleGenerateFromScript}
              disabled={busy}
              className="btn-outline"
              title="Generate references for the next character described in the script"
              style={{ width: '100%', padding: '12px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '7px' }}
            >
              <FileText size={14} />
              Generate from Script
            </button>

            {isGenerating && (
              <ProgressBar steps={CHARACTER_STEPS} currentStep={charProgressStep} />
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            {anyAnchorsGenerating && (
              <div style={{ marginBottom: '10px', color: 'var(--violet-400)', fontSize: '11px', lineHeight: 1.5 }}>
                Identity anchors still processing — shot consistency will be better if you wait.
              </div>
            )}
            <button className="btn-teal" style={{ width: '100%', padding: '13px', borderRadius: '8px', fontSize: '12px' }} onClick={() => onNavigate(5)}>
              Continue to Locations →
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="main-content" style={{ background: 'var(--bg)' }}>

          {/* Header */}
          <div className="main-header" style={{ padding: '18px 32px' }}>
            {/* Character tabs */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '14px' }}>
              {displayedCharacters.map((char, i) => (
                <div
                  key={char.id || i}
                  onClick={() => setActiveTab(i)}
                  className={`tab-pill ${activeTab === i ? 'active' : ''}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {char.name}
                  </span>
                  {(char.isGeneratingReference || char.id === 'generating') && (
                    <span style={{ marginLeft: '5px', opacity: 0.55, fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                      {char.images.filter(x => x.url).length}/{char.images.length}
                    </span>
                  )}
                  {!char.isGeneratingReference && anchorStatus[char.name] === 'generating' && (
                    <span style={{ marginLeft: '6px', opacity: 0.75, fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Loader2 size={10} className="spin" />
                      ANCHOR
                    </span>
                  )}
                  {!char.isGeneratingReference && (anchorStatus[char.name] === 'done' || char?.anchor_image_url) && (
                    <span style={{ marginLeft: '6px', color: 'var(--cyan-400)', fontSize: '9px' }}>✓</span>
                  )}
                  {!char.isGeneratingReference && anchorStatus[char.name] === 'failed' && (
                    <span style={{ marginLeft: '6px', color: 'var(--violet-400)', fontSize: '9px' }}>!</span>
                  )}
                </div>
              ))}
              {activeCategory === 'project' && !isGeneratingActive && (
                <div
                  onClick={() => setShowCreateModal(true)}
                  className="tab-pill"
                  style={{
                    fontSize: '14px',
                    color: 'var(--orange)',
                    background: 'rgba(var(--violet-rgb), 0.06)',
                    borderColor: 'rgba(var(--violet-rgb), 0.22)',
                    cursor: 'pointer',
                    padding: '5px 14px',
                  }}
                >
                  +
                </div>
              )}
            </div>

            {/* Character info row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9.5px',
                      fontWeight: 500,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: activeCategory === 'global' ? 'rgba(var(--violet-rgb), 0.1)' : 'rgba(var(--violet-rgb), 0.1)',
                      color: activeCategory === 'global' ? 'var(--orange)' : 'var(--teal)',
                      border: `1px solid ${activeCategory === 'global' ? 'rgba(var(--violet-rgb), 0.22)' : 'rgba(var(--violet-rgb), 0.22)'}`,
                      letterSpacing: '0.18em',
                    }}
                  >
                    {activeCategory === 'global' ? '◆ GLOBAL' : '◇ PROJECT'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.015em' }}>
                    {truncateCharacterDescription(activeChar?.description) || 'No notes yet.'}
                  </span>
                  {activeCategory === 'project' && activeChar?.name && activeAnchorState === 'generating' && (
                    <span style={{ color: 'var(--cyan-400)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Loader2 size={12} className="spin" />
                      Building identity anchor…
                    </span>
                  )}
                  {activeCategory === 'project' && activeChar?.name && activeAnchorState === 'failed' && (
                    <span style={{ color: 'var(--violet-400)', fontSize: '11px' }}>
                      Anchor failed — will use reference panels
                    </span>
                  )}
                </div>
              </div>
              {activeChar && !isGeneratingActive && activeCategory === 'global' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={handleAddGlobalToProject}
                    className="btn-teal"
                    style={{ padding: '8px 14px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                  >
                    Add to project
                  </button>
                  <button
                    onClick={() => { setEditName(activeChar.name); setEditDesc(activeChar.description || ''); setShowEditModal(true); }}
                    className="btn-outline"
                    style={{ padding: '8px 14px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                  >
                    Rename
                  </button>
                  <button
                    onClick={handleDelete}
                    className="btn-outline"
                    style={{ padding: '8px 14px', fontSize: '11.5px', color: 'var(--violet-400)', borderColor: 'rgba(var(--violet-rgb), 0.2)' }}
                  >
                    Delete from history
                  </button>
                </div>
              )}
              {activeChar && !isGeneratingActive && activeCategory === 'project' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {activeAnchorState === 'done' && activeChar.anchor_image_url && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '8px' }}>
                      <img
                        src={activeChar.anchor_image_url}
                        alt={`${activeChar.name} anchor`}
                        style={{ width: '160px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(var(--cyan-300-rgb), 0.14)' }}
                      />
                      <div style={{ color: 'var(--cyan-400)', fontSize: '10px', fontWeight: 600 }}>
                        Identity anchor ready ✓
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { setEditName(activeChar.name); setEditDesc(activeChar.description || ''); setShowEditModal(true); }}
                    className="btn-outline"
                    style={{ padding: '8px 14px', fontSize: '11.5px' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    style={{
                      background: 'rgba(var(--violet-rgb), 0.06)',
                      border: '1px solid rgba(var(--violet-rgb), 0.2)',
                      color: 'var(--violet-400)',
                      padding: '8px 14px',
                      borderRadius: '999px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      letterSpacing: '-0.005em',
                      transition: 'background 0.18s, transform 0.3s var(--ease-spring)',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--violet-rgb), 0.12)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'rgba(var(--violet-rgb), 0.06)')}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Image collage */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', padding: '8px 24px 18px', boxSizing: 'border-box' }}>
            <div className="studio-board" ref={collageRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-deep)', boxShadow: 'var(--neo-inset)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxSizing: 'border-box', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeChar?.images?.length > 0 ? (() => {
                const charIdx = activeCategory === 'project' ? activeTab : -1;
                const collageItems = activeChar.images.map((img, i) => {
                  const { imageData, src, label } = parseCharacterImage(img, i);
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
                    border: `${Math.max(2, 4 * boardScale)}px solid var(--ink-800)`,
                    borderRadius: `${Math.max(6, 12 * boardScale)}px`,
                    backgroundColor: 'var(--ink-950)',
                    backgroundImage: 'radial-gradient(rgba(var(--cyan-300-rgb), 0.04) 1px, transparent 1px)',
                    backgroundPosition: '0 0',
                    backgroundSize: `${Math.max(10, 20 * boardScale)}px ${Math.max(10, 20 * boardScale)}px`,
                    boxShadow: '0 28px 80px rgba(var(--ink-950-rgb), 0.8), inset 0 0 0 1px rgba(var(--cyan-300-rgb), 0.02)',
                    boxSizing: 'border-box',
                  }}>
                    <div style={{ position: 'absolute', inset: `${18 * boardScale}px`, border: '1px solid rgba(var(--cyan-300-rgb), 0.06)', pointerEvents: 'none' }} />
                    {boxes.map(item => {
                      const cardPadding = Math.max(1, 2 * boardScale);
                      return (
                        <div
                          key={item.key}
                          className="img-card"
                          onClick={e => {
                            e.stopPropagation();
                            if (item.loading || charIdx < 0) return;
                            setPreviewTarget({
                              charIdx,
                              imgIdx: item.index,
                              url: item.src,
                              label: item.label,
                            });
                          }}
                          style={{
                            background: 'rgba(var(--cyan-300-rgb), 0.9)',
                            borderRadius: `${Math.max(2, 3 * boardScale)}px`,
                            boxShadow: '0 8px 24px rgba(var(--ink-950-rgb), 0.5)',
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
                            cursor: !item.loading && charIdx >= 0 ? 'pointer' : 'default',
                            transform: 'scale(var(--board-card-scale))',
                            transformOrigin: 'center center',
                          }}>
                          {item.loading
                            ? <div className="skeleton-shimmer" style={{ width: '100%', height: '100%' }} />
                            : <img
                              key={item.src}
                              src={item.src}
                              alt={item.label}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'var(--cyan-300)' }}
                              onLoad={e => {
                                const ratio = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                                setImgRatios(prev => prev[item.src] === ratio ? prev : { ...prev, [item.src]: ratio });
                              }}
                            />
                          }
                          {/* Label badge */}
                          <div style={{ position: 'absolute', top: '8px', right: '8px', maxWidth: 'calc(100% - 16px)' }}>
                            {renamingPanel?.charIdx === charIdx && renamingPanel?.imgIdx === item.index ? (
                              <input
                                autoFocus
                                defaultValue={item.label}
                                onBlur={e => handleRenameLabel(charIdx, item.index, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleRenameLabel(charIdx, item.index, e.target.value);
                                  if (e.key === 'Escape') setRenamingPanel(null);
                                }}
                                onClick={e => e.stopPropagation()}
                                style={{ background: 'rgba(var(--ink-950-rgb), 0.92)', border: '1px solid var(--teal)', color: 'var(--text)', borderRadius: '4px', padding: '2px 7px', fontSize: '8px', fontWeight: 700, outline: 'none', width: '100px', maxWidth: '100%', letterSpacing: '0.05em' }}
                              />
                            ) : (
                              <div
                                onClick={e => {
                                  e.stopPropagation();
                                  if (!item.loading && charIdx >= 0) {
                                    setRenamingPanel({ charIdx, imgIdx: item.index });
                                  }
                                }}
                                title={charIdx >= 0 ? 'Click to rename' : ''}
                                style={{ padding: '2px 7px', background: 'rgba(var(--ink-950-rgb), 0.75)', borderRadius: '3px', fontSize: '8px', color: item.loading ? 'var(--ink-800)' : 'var(--text-soft)', backdropFilter: 'blur(8px)', fontWeight: 700, cursor: charIdx >= 0 ? 'text' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-display)' }}
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
                <div style={{ width: `${Math.min(PINBOARD_WIDTH, collageSize.width - 24)}px`, aspectRatio: `${PINBOARD_WIDTH} / ${PINBOARD_HEIGHT}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--border-mid)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-deep)' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--surface-2)', boxShadow: 'var(--neo-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                  </div>
                  <div style={{ color: 'var(--text)', fontSize: '15px', fontWeight: '700', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: '6px' }}>No character sheet yet</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-body)' }}>Upload a full character sheet or create one</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>{/* end layout-sidebar-main */}

      {/* ── Create Modal ── */}
      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div className="kicker" style={{ marginBottom: '10px' }}>── Create New</div>
            <div className="editorial-title editorial-h2" style={{ marginBottom: '10px' }}>
              Sketch the <span className="text-grad">cast.</span>
            </div>
            <div style={{ color: 'var(--text-soft)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.6 }}>
              Generate one full 21:9 character sheet for later shots.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>CHARACTER NAME</label>
                <input type="text" placeholder="e.g. VIKRAM" value={createName} onChange={e => setCreateName(e.target.value)} className="input-inset" style={{ padding: '10px 13px', background: 'var(--ink-900)', fontSize: '13px', borderRadius: '8px' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea placeholder="Ancient Indian warrior, 40s, grey beard, dark red dhoti, gold jewellery..." value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                  className="textarea-inset" style={{ padding: '10px 13px', background: 'var(--ink-900)', fontSize: '13px', borderRadius: '8px', minHeight: '90px' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>

              {/* Reference image */}
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  REFERENCE IMAGE <span style={{ color: 'var(--ink-800)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: 'var(--ink-950)', border: '1px solid rgba(var(--cyan-300-rgb), 0.07)', borderRadius: '8px' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '56px', height: '56px', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '6px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-soft)', fontSize: '11px', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>The sheet will match this character</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'rgba(var(--violet-rgb), 0.1)', border: '1px solid rgba(var(--violet-rgb), 0.2)', color: 'var(--violet-400)', borderRadius: '5px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                  </div>
                ) : (
                  <button
                    onClick={() => refFileInputRef.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingRef(false); }}
                    onDrop={handleRefDrop}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: isDraggingRef ? 'rgba(var(--cyan-rgb), 0.06)' : 'rgba(var(--cyan-300-rgb), 0.04)', border: isDraggingRef ? '1px dashed var(--cyan-border)' : '1px dashed rgba(var(--cyan-300-rgb), 0.22)', color: 'var(--text-soft)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'border-color 120ms ease-out, background 120ms ease-out' }}>
                    {isDraggingRef ? 'Drop image here' : 'Upload Reference Image'}
                  </button>
                )}
              </div>

              <button className="btn-orange" style={{ width: '100%', padding: '13px', fontSize: '12px' }} onClick={handleGenerateAngles}>
                Create new
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && activeChar && (
        <div className="auth-overlay" onClick={() => setShowEditModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '440px', background: 'var(--ink-900)' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowEditModal(false)}>×</button>
            <div style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, marginBottom: '20px', letterSpacing: '-0.01em' }}>
              {activeCategory === 'global' ? 'Rename Character' : 'Edit Character'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>NAME</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-inset" style={{ padding: '10px 13px', background: 'var(--ink-900)', fontSize: '13px', borderRadius: '8px' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="textarea-inset" style={{ padding: '10px 13px', background: 'var(--ink-900)', fontSize: '13px', borderRadius: '8px', minHeight: '72px' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              {activeCategory === 'project' && (
                <div style={{ borderTop: '1px solid rgba(var(--cyan-300-rgb), 0.05)', paddingTop: '14px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>REPLACE SHEET</label>
                  <button onClick={() => {
                    setSheetReplaceTarget({
                      index: activeTab,
                      name: (editName || activeChar.name || '').trim().toUpperCase(),
                      description: editDesc.trim(),
                    });
                    setShowEditModal(false);
                    fileInputRef.current.click();
                  }}
                    style={{ width: '100%', padding: '10px', borderRadius: '7px', background: 'rgba(var(--cyan-300-rgb), 0.04)', border: '1px solid rgba(var(--cyan-300-rgb), 0.14)', color: 'var(--text-soft)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                    Upload New Character Sheet
                  </button>
                </div>
              )}
              <button className="btn-teal" style={{ width: '100%', padding: '13px', fontSize: '12px' }} onClick={handleEditSave}>
                {activeCategory === 'global' ? 'Rename' : 'Save Changes'}
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
          <div className="modal-panel flex-col gap-16" style={{ maxWidth: '560px' }}>
            <div>
              <div className="panel-meta-label" style={{ marginBottom: '6px' }}>▪ Generate from Script</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{scriptPromptPreview.name}</div>
            </div>
            <div className="panel-inset" style={{ maxHeight: '260px', fontSize: '12.5px' }}>
              {scriptPromptPreview.description}
            </div>
            <p className="body-sm">
              This prompt will be sent to the image model to generate character reference angles. Edit the description in the character card first if you need to adjust it.
            </p>
            <div className="flex-row gap-10">
              <button onClick={handleConfirmScriptGenerate} className="btn-orange" style={{ flex: 1, padding: '13px', fontWeight: 700 }}>Generate References</button>
              <button onClick={() => setScriptPromptPreview(null)} className="btn-outline" style={{ flex: 1, padding: '13px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="flex-row gap-16" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 10001, background: 'var(--ink-950)', border: '1px solid var(--cyan)', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 8px 32px rgba(var(--ink-950-rgb), 0.5)', alignItems: 'center' }}>
          <Loader2 size={24} className="spin" style={{ color: 'var(--cyan)' }} />
          <div>
            <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 600 }}>{isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Creating character sheet...'}</div>
            <div style={{ color: 'var(--cyan)', fontSize: '10px', fontWeight: 700, marginTop: '2px', letterSpacing: '0.05em' }}>Please keep this page open</div>
          </div>
        </div>
      )}
    </div>
  );
}
