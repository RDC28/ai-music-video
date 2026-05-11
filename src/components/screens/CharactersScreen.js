'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  'Mid Portrait', 'Full Body Front', 'Full Body Left', 'Full Body Right', 'Full Body Back',
  'Face Close-up Front', 'Face Close-up Back', 'Face 3/4 Left', 'Face 3/4 Right',
];

const PINBOARD_WIDTH = 2016;
const PINBOARD_HEIGHT = 700;
const PINBOARD_PADDING = 28;
const PINBOARD_GAP = 14;
const DEFAULT_COLLAGE_RATIO = 1;

const buildSheetPrompt = (desc, hasRef) => {
  const charClause = hasRef
    ? 'of the character shown in the reference image'
    : `of this character: ${desc}`;
  return `Professional character design reference sheet. A single wide 21:9 horizontal canvas with 9 clearly separated panels on a warm beige or soft neutral studio backdrop.

Panel layout:
- Far left: one large mid-body portrait panel (waist and above)
- Center column: four full-body standing panels — front view, left profile, right profile, back view — each showing the complete figure head-to-toe
- Top right: close-up front portrait (head and upper chest/shoulders)
- Middle right: close-up back-of-head portrait (head and upper shoulders from behind)
- Bottom right left: close-up left three-quarter portrait (head and upper chest)
- Bottom right right: close-up right three-quarter portrait (head and upper chest)

Character ${charClause}.

Do not crop any face or costume details. Maintain perfectly consistent character appearance across all 9 panels. Clean visible spacing between panels. Studio lighting throughout. Professional concept art quality.`;
};

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
            placeholder="Label (e.g. BACK VIEW)"
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
            ? 'Drag to select the panel · Draw a new box to change selection'
            : 'Scroll to zoom · Drag to pan · Enable Crop Mode to select area'}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CharactersScreen({ onNavigate, projectData = [], onDataUpdate, projectId }) {
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
  const [generatingChar, setGeneratingChar] = useState(null);
  const [zoomCropTarget, setZoomCropTarget] = useState(null);
  const [activeCategory, setActiveCategory] = useState('project');
  const [renamingPanel, setRenamingPanel] = useState(null);

  const [pendingSheetFile, setPendingSheetFile] = useState(null);
  const [showSheetCropModal, setShowSheetCropModal] = useState(false);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState(null);
  const [charProgressStep, setCharProgressStep] = useState(-1);
  const [imgRatios, setImgRatios] = useState({});

  const CHARACTER_STEPS = [
    'Preparing character profile',
    'Creating front view',
    'Creating side view',
    'Creating back view',
    'Creating face close-up',
    'Saving to library'
  ];

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);
  const collageRef = useRef(null);
  const [collageSize, setCollageSize] = useState({ width: PINBOARD_WIDTH, height: PINBOARD_HEIGHT });
  const supabase = useMemo(() => createClient(), []);
  const projectCharacters = projectData || [];
  const displayedCharacters = activeCategory === 'project'
    ? [...projectCharacters, ...(generatingChar ? [generatingChar] : [])]
    : globalLibrary;
  const activeChar = displayedCharacters[activeTab] || null;
  const isGeneratingActive = activeChar?.id === 'generating';
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

  const pushSlot = (i, url, label) => {
    setGeneratingChar(prev => {
      if (!prev) return prev;
      const images = [...prev.images];
      images[i] = { url, label };
      return { ...prev, images };
    });
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
    setPendingSheetFile(file);
    setShowSheetCropModal(true);
  };

  const handleCloseSheetCropModal = () => {
    if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
    setSheetPreviewUrl(null);
    setPendingSheetFile(null);
    setShowSheetCropModal(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processSheetFile = async (file) => {
    if (!file) return;
    setIsProcessingSheet(true);

    try {
      const sheetPath = `${projectId}/sheets/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, file);
      if (upErr) throw upErr;
      const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);

      const { poses, error: splitErr } = await fetch('/api/split-character-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sheetUrl }),
      }).then(r => r.json());
      if (splitErr) throw new Error(splitErr);

      const charName = file.name.split('.')[0].toUpperCase();
      setGeneratingChar({ id: 'generating', name: charName, images: poses.map(p => ({ label: p.label || 'Section', url: null })) });
      setActiveTab(projectCharacters.length);
      setActiveCategory('project');

      const img = await new Promise((res, rej) => {
        const el = new Image(); el.crossOrigin = 'anonymous';
        el.onload = () => res(el); el.onerror = rej; el.src = sheetUrl;
      });

      const finalImages = new Array(poses.length).fill(null);

      await Promise.all(poses.map(async (pose, i) => {
        const label = pose.label || `Section ${i + 1}`;
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
          console.warn("NB Pro refinement failed for pose, using raw crop", e);
        }

        const blob = base64ToBlob(finalB64, finalMime);
        const ext = finalMime.split('/')[1] || 'png';
        const url = await uploadBlob(blob, finalMime, `${projectId}/generated/${Date.now()}-section-${i}.${ext}`);

        const imageData = { url, label, box_2d: pose.box_2d, width: Math.round(sw), height: Math.round(sh) };
        finalImages[i] = imageData;
        setGeneratingChar(prev => {
          const newImgs = [...prev.images];
          newImgs[i] = imageData;
          return { ...prev, images: newImgs };
        });
      }));

      const newChar = { id: Date.now(), name: charName, description: 'Uploaded from character sheet', images: finalImages.filter(Boolean), source: 'upload', sheetUrl };
      const updatedChars = [...projectCharacters, newChar];
      await onDataUpdate({ characters: updatedChars });
      setActiveTab(updatedChars.length - 1);
      saveToGlobalLibrary(newChar, 'upload');
    } catch (err) {
      console.error('Sheet processing failed:', err);
      alert('We could not process that character sheet. Please try another image.');
    } finally {
      setIsProcessingSheet(false);
      setGeneratingChar(null);
      if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
      setSheetPreviewUrl(null);
      setPendingSheetFile(null);
      setShowSheetCropModal(false);
    }
  };

  const handleGenerateAngles = async () => {
    if (!createName.trim()) return alert('Enter a character name');
    if (!createDesc.trim()) return alert('Describe the character');
    const charName = createName.trim().toUpperCase();
    const desc = createDesc.trim();
    setShowCreateModal(false);
    setCreateName(''); setCreateDesc('');
    setIsGenerating(true);
    setCharProgressStep(0);

    const angles = [
      { label: 'FRONT VIEW', prompt: 'Front view portrait, standing, full body, professional studio lighting, clean white background, cinematic high detail.' },
      { label: 'SIDE VIEW', prompt: 'Side profile view, standing, full body, matching character features and outfit, studio lighting, white background.' },
      { label: 'BACK VIEW', prompt: 'Back view, standing, full body, matching character features and outfit, studio lighting, white background.' },
      { label: 'FACE CLOSE-UP', prompt: 'Cinematic face close-up, highly detailed facial features, jewelry, neutral expression, matching the character exactly.' }
    ];

    try {
      const tempId = Date.now();
      setGeneratingChar({ id: tempId, name: charName, images: angles.map(a => ({ label: a.label, url: null })) });
      setActiveTab(projectCharacters.length);
      setActiveCategory('project');

      const finalImages = [];
      let referenceBase64 = null;

      for (let i = 0; i < angles.length; i++) {
        setCharProgressStep(i + 1);
        const angle = angles[i];
        try {
          const payload = {
            characterDescription: desc,
            angleDescription: angle.prompt,
            label: angle.label
          };

          if (referenceBase64) {
            payload.base64 = referenceBase64;
            payload.mimeType = 'image/png';
          }

          const resp = await fetch('/api/generate-character-pose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const { imageBase64, error } = await resp.json();
          if (error) throw new Error(error);

          if (i === 0) referenceBase64 = imageBase64;

          const blob = base64ToBlob(imageBase64, 'image/png');
          const url = await uploadBlob(blob, 'image/png', `${projectId}/generated/${Date.now()}-${angle.label.replace(' ', '_')}.png`);

          const imageData = { url, label: angle.label };
          finalImages[i] = imageData;

          setGeneratingChar(prev => {
            if (!prev) return prev;
            const newImgs = [...prev.images];
            newImgs[i] = imageData;
            return { ...prev, images: newImgs };
          });

        } catch (e) {
          console.error(`Failed ${angle.label}:`, e);
        }
      }

      setCharProgressStep(5);
      const newChar = { id: tempId, name: charName, description: desc, images: finalImages.filter(Boolean), source: 'ai' };
      const updatedChars = [...projectCharacters, newChar];
      await onDataUpdate({ characters: updatedChars });
      setActiveTab(updatedChars.length - 1);
      saveToGlobalLibrary(newChar, 'ai');
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Character could not be created. Please try again.');
    } finally {
      setIsGenerating(false);
      setCharProgressStep(-1);
      setGeneratingChar(null);
    }
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    const updatedChars = [...projectCharacters];
    updatedChars[activeTab] = { ...projectCharacters[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
    await onDataUpdate({ characters: updatedChars });
    setShowEditModal(false);
  };

  const handleApplyCrop = async (blob, newLabel, cropMeta = null) => {
    if (!zoomCropTarget) return;
    const { charIdx, imgIdx } = zoomCropTarget;
    try {
      const url = await uploadBlob(blob, 'image/jpeg', `${projectId}/crops/${Date.now()}-crop.jpg`);
      const char = projectCharacters[charIdx];
      const images = [...char.images];
      const sizeMeta = cropMeta?.width && cropMeta?.height
        ? { width: cropMeta.width, height: cropMeta.height }
        : {};
      if (imgIdx === null) {
        images.push({ url, label: newLabel || 'CUSTOM CROP', ...sizeMeta });
      } else {
        const existing = images[imgIdx];
        images[imgIdx] = { url, label: newLabel || (typeof existing === 'string' ? `Section ${imgIdx + 1}` : existing.label), ...sizeMeta };
      }
      const updatedChars = [...projectCharacters];
      updatedChars[charIdx] = { ...char, images };
      await onDataUpdate({ characters: updatedChars });
      setZoomCropTarget(null);
    } catch { alert('Crop could not be saved. Please try again.'); }
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
    <div className="screen active" id="s4" style={{ height: '100%', overflow: 'hidden', background: '#080808' }}>
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

        {/* ── Sidebar ── */}
        <div className="studio-sidebar" style={{ width: '256px', minWidth: '256px', background: '#0D0D0D', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '24px', height: '100%', overflowY: 'auto' }}>

          <div style={{ marginBottom: '26px' }}>
            <div className="kicker" style={{ marginBottom: '12px' }}>Character · Studio</div>
            <h2 className="editorial-title editorial-h2" style={{ marginBottom: '10px' }}>
              Build your <span className="text-grad">cast.</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.6 }}>
              {busy && generatingChar
                ? `Creating ${generatingChar.images.filter(x => x.url).length}/${generatingChar.images.length} references…`
                : busy ? 'Finding poses…' : 'Upload a sheet or create a reference set.'}
            </p>
          </div>

          {/* Category toggle */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.025)',
              borderRadius: '999px',
              padding: '4px',
              marginBottom: '22px',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {['project', 'global'].map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setActiveTab(0); }}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '999px',
                  border: 'none',
                  background: activeCategory === cat
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(124,58,237,0.06))'
                    : 'transparent',
                  color: activeCategory === cat
                    ? (cat === 'project' ? 'var(--teal)' : 'var(--orange)')
                    : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  letterSpacing: '-0.005em',
                  fontFamily: 'var(--font-body)',
                  transition: 'background 0.18s, color 0.18s',
                  boxShadow: activeCategory === cat ? '0 0 0 1px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
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
              style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
              onClick={() => fileInputRef.current.click()}
              disabled={busy}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              {isProcessingSheet ? 'Reading sheet...' : 'Upload Reference Sheet'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={busy}
              className="btn-outline"
              style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
            >
              Create character
            </button>

            {isGenerating && (
              <ProgressBar steps={CHARACTER_STEPS} currentStep={charProgressStep} />
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
            <button className="btn-teal" style={{ width: '100%', padding: '13px', borderRadius: '8px', fontSize: '12px' }} onClick={() => onNavigate(5)}>
              Continue to Locations →
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="studio-main" style={{ flex: 1, background: '#080808', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Header */}
          <div style={{ flexShrink: 0, background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(16px)', padding: '18px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {/* Character tabs */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '14px' }}>
              {displayedCharacters.map((char, i) => (
                <div
                  key={char.id || i}
                  onClick={() => setActiveTab(i)}
                  className={`tab-pill ${activeTab === i ? 'active' : ''}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.015em' }}>
                    {char.name}
                  </span>
                  {char.id === 'generating' && (
                    <span style={{ marginLeft: '5px', opacity: 0.55, fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                      {char.images.filter(x => x.url).length}/{char.images.length}
                    </span>
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
                    background: 'rgba(124,58,237,0.06)',
                    borderColor: 'rgba(124,58,237,0.22)',
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
                      background: activeCategory === 'global' ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.1)',
                      color: activeCategory === 'global' ? 'var(--orange)' : 'var(--teal)',
                      border: `1px solid ${activeCategory === 'global' ? 'rgba(124,58,237,0.22)' : 'rgba(124,58,237,0.22)'}`,
                      letterSpacing: '0.18em',
                    }}
                  >
                    {activeCategory === 'global' ? '◆ GLOBAL' : '◇ PROJECT'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.015em' }}>
                    {activeChar?.description || 'No notes yet.'}
                  </span>
                </div>
              </div>
              {activeChar && !isGeneratingActive && activeCategory === 'project' && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {activeChar.sheetUrl && (
                    <button
                      onClick={() => setZoomCropTarget({ charIdx: activeTab, imgIdx: null, url: activeChar.sheetUrl, label: '', showLabelInput: true })}
                      className="btn-outline"
                      style={{ padding: '8px 14px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                    >
                      Add from sheet
                    </button>
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
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#ff7a7a',
                      padding: '8px 14px',
                      borderRadius: '999px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      letterSpacing: '-0.005em',
                      transition: 'background 0.18s, transform 0.3s var(--ease-spring)',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Image collage */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', padding: '8px 24px 18px', boxSizing: 'border-box' }}>
            <div className="studio-board" ref={collageRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#080808', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', boxSizing: 'border-box', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                            if (item.loading || charIdx < 0) return;
                            setZoomCropTarget({
                              charIdx,
                              imgIdx: item.index,
                              url: item.src,
                              label: item.label,
                              recropUrl: activeChar?.sheetUrl || null,
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
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#f7f7f7' }}
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
                                style={{ background: 'rgba(0,0,0,0.92)', border: '1px solid var(--teal)', color: '#fff', borderRadius: '4px', padding: '2px 7px', fontSize: '8px', fontWeight: 700, outline: 'none', width: '100px', maxWidth: '100%', letterSpacing: '0.05em' }}
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
                                style={{ padding: '2px 7px', background: 'rgba(0,0,0,0.75)', borderRadius: '3px', fontSize: '8px', color: item.loading ? '#222' : '#ddd', backdropFilter: 'blur(8px)', fontWeight: 700, cursor: charIdx >= 0 ? 'text' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-display)' }}
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: '4px' }}>No reference images yet</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Upload a character sheet or create a reference set</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div className="kicker" style={{ marginBottom: '10px' }}>── New Character</div>
            <div className="editorial-title editorial-h2" style={{ marginBottom: '10px' }}>
              Sketch the <span className="text-grad">cast.</span>
            </div>
            <div style={{ color: 'var(--text-soft)', fontSize: '13px', marginBottom: '24px', lineHeight: 1.6 }}>
              Generate a full reference sheet and keep each pose organized for later shots.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>CHARACTER NAME</label>
                <input type="text" placeholder="e.g. VIKRAM" value={createName} onChange={e => setCreateName(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea placeholder="Ancient Indian warrior, 40s, grey beard, dark red dhoti, gold jewellery..." value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                  style={{ ...inputStyle, minHeight: '90px', resize: 'none' }} onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>

              {/* Reference image */}
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  REFERENCE IMAGE <span style={{ color: '#333', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '56px', height: '56px', objectFit: 'contain', background: '#050505', borderRadius: '6px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#bbb', fontSize: '11px', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: '#333', fontSize: '10px', marginTop: '2px' }}>All angles will match this character</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '5px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                  </div>
                ) : (
                  <button onClick={() => refFileInputRef.current.click()}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.08)', color: '#444', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                    Upload Reference Image
                  </button>
                )}
              </div>

              {/* Panel labels */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {PANEL_LABELS.map(label => (
                  <span key={label} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '3px', background: 'rgba(124,58,237,0.06)', color: 'var(--teal)', border: '1px solid rgba(124,58,237,0.1)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{label}</span>
                ))}
              </div>

              <button className="btn-orange" style={{ width: '100%', padding: '13px', fontSize: '12px' }} onClick={handleGenerateAngles}>
                Create Reference Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && activeChar && (
        <div className="auth-overlay" onClick={() => setShowEditModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '440px', background: '#0e0e0e' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowEditModal(false)}>×</button>
            <div style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, marginBottom: '20px', letterSpacing: '-0.01em' }}>Edit Character</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>NAME</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ ...inputStyle, minHeight: '72px', resize: 'none' }} onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: '#2a2a2a', letterSpacing: '0.1em', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>REPLACE IMAGES</label>
                <button onClick={() => { setShowEditModal(false); fileInputRef.current.click(); }}
                  style={{ width: '100%', padding: '10px', borderRadius: '7px', background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', color: '#444', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                  Upload New Character Sheet
                </button>
              </div>
              <button className="btn-teal" style={{ width: '100%', padding: '13px', fontSize: '12px' }} onClick={handleEditSave}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zoom / Crop Modal ── */}
      {zoomCropTarget && (
        <ZoomCropModal
          imageUrl={zoomCropTarget.url}
          label={zoomCropTarget.label}
          onClose={() => setZoomCropTarget(null)}
          onApply={handleApplyCrop}
          onDelete={() => {
            handleDeleteImage(zoomCropTarget.charIdx, zoomCropTarget.imgIdx);
            setZoomCropTarget(null);
          }}
          initialBox={zoomCropTarget.initialBox || null}
          showLabelInput={zoomCropTarget.showLabelInput || false}
          recropUrl={zoomCropTarget.recropUrl || null}
          recropBox={zoomCropTarget.recropBox || null}
        />
      )}

      {/* ── Sheet Crop Choice Modal ── */}
      {showSheetCropModal && sheetPreviewUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={handleCloseSheetCropModal}>
          <div style={{ background: '#0c0c0c', width: '100%', maxWidth: '500px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={handleCloseSheetCropModal} style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', color: '#444', fontSize: '18px', cursor: 'pointer', zIndex: 10 }}>✕</button>
            <div style={{ padding: '28px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>Crop Selection</div>
              <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '6px', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>Choose Crop Method</h3>
              <p style={{ color: '#444', fontSize: '12px', marginBottom: '20px', lineHeight: 1.6 }}>Automatically detect and refine character poses from your sheet.</p>

              <div style={{ width: '100%', height: '260px', background: '#080808', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' }}>
                <img src={sheetPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Preview" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => processSheetFile(pendingSheetFile)}
                  style={{ ...MODAL_BTN, background: 'var(--teal)', color: '#000', border: 'none', padding: '16px', borderRadius: '9px', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-display)' }}
                >
                  Auto-detect Poses
                </button>
                <div>
                  <button onClick={handleCloseSheetCropModal} style={{ ...MODAL_BTN, width: '100%', padding: '16px', borderRadius: '9px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    Cancel Upload
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
