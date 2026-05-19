'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Loader2, Upload, Wand2 } from 'lucide-react';
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

const LOCATION_STEPS = [
  'Generating location reference sheet',
  'Saving to library',
];

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

  // Collect character names so we can strip them from the storyline
  const characterNames = Array.isArray(projectState?.characters)
    ? projectState.characters.map(c => c?.name).filter(Boolean)
    : [];

  // Remove named character references from storyline — keep setting/mood context only
  let storyline = script.storyline ? compactScriptText(script.storyline, 520) : '';
  if (storyline && characterNames.length) {
    const namePattern = new RegExp(`\\b(${characterNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
    storyline = storyline.replace(namePattern, 'someone').replace(/\btheir\b/gi, 'the').trim();
  }

  return [
    sourceDescription,
    script.title ? `Music video title: ${script.title}` : '',
    storyline ? `Story context (setting and mood only): ${storyline}` : '',
    script.mood || analysis.mood ? `Mood and atmosphere: ${compactScriptText(script.mood || analysis.mood, 240)}` : '',
    analysis.genre || analysis.theme ? `Genre/theme: ${compactScriptText(analysis.genre || analysis.theme, 180)}` : '',
    'Create a production-ready location reference set for this music video. Show only the environment — no specific named people, no character faces, no story actors. Generic crowd or ambient figures are acceptable if the location calls for it. The place must remain stable across every view: same architecture, geography, materials, props, era, palette, weather logic, and lighting language.',
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

function normalizeLocationLabel(label, index) {
  const text = typeof label === 'string' ? label.trim().toUpperCase() : '';
  const isCharacterLabel = CHARACTER_STYLE_LABELS.some(term => text.includes(term));
  const isTooGeneric = !text || /^ZONE\s*\d*$/i.test(text) || /^VIEW\s*\d*$/i.test(text) || /^NEW\s+VIEW\s*\d*$/i.test(text) || /^SECTION\s*\d*$/i.test(text);

  if (isCharacterLabel || isTooGeneric) {
    return LOCATION_LABEL_FALLBACKS[index % LOCATION_LABEL_FALLBACKS.length];
  }

  return text;
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
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(var(--ink-950-rgb), 0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.875rem' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: 'var(--ink-800)', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', marginRight: '0.25rem' }}>{label?.toUpperCase()}</span>
        <span style={{ color: 'var(--ink-800)', fontSize: '0.6875rem', marginRight: '0.25rem' }}>Scroll to zoom · Drag to pan</span>
        <div style={{ width: '0.0625rem', height: '1.125rem', background: 'var(--ink-800)' }} />
        {recropUrl && (
          viewingRecropSource ? (
            <button onClick={openCurrentImage} style={MODAL_BTN}>View Image</button>
          ) : (
            <button onClick={openRecropSource} style={{ ...MODAL_BTN, background: 'var(--teal)', color: 'var(--ink-950)', border: '0.0625rem solid var(--teal)' }}>
              Re-crop
            </button>
          )
        )}
        <button onClick={() => { setCropMode(m => !m); if (cropMode) setCropBox(null); }} style={cropMode ? { ...MODAL_BTN, background: 'var(--violet-500)', color: 'var(--ink-950)', border: '0.0625rem solid var(--violet-500)' } : MODAL_BTN}>
          {cropMode ? 'Draw New Selection' : 'Crop Mode'}
        </button>
        {canApply && showEditorLabel && (
          <input
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder="Label (e.g. AERIAL VIEW)"
            onClick={e => e.stopPropagation()}
            style={{ ...MODAL_BTN, width: '10rem', outline: 'none', caretColor: 'var(--text)', background: 'rgba(var(--cyan-300-rgb), 0.04)', color: 'var(--text)' }}
          />
        )}
        {canApply && (
          <button onClick={applyCrop} disabled={applying} style={{ ...MODAL_BTN, background: 'var(--orange)', color: 'var(--ink-950)', border: 'none' }}>
            {applying ? 'Saving...' : 'Save Crop'}
          </button>
        )}
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
        style={{ width: '86vw', height: '78vh', overflow: 'hidden', position: 'relative', background: 'var(--ink-950)', borderRadius: '0.75rem', border: '0.0625rem solid var(--border-mid)', cursor: cropMode ? 'crosshair' : drag?.type === 'pan' ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <img
          ref={imgRef} src={editorImageUrl} alt={label} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center center', userSelect: 'none', pointerEvents: 'none', display: 'block' }}
        />
        {cropBox && cropBox.w > 0 && (
          <div style={{ position: 'absolute', left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h, border: '0.0625rem solid var(--violet-500)', background: 'rgba(var(--violet-rgb), 0.08)', pointerEvents: 'none', boxSizing: 'border-box' }} />
        )}
        <div style={{ position: 'absolute', bottom: '0.875rem', left: '50%', transform: 'translateX(-50%)', color: 'var(--ink-800)', fontSize: '0.6875rem', pointerEvents: 'none', whiteSpace: 'nowrap', textAlign: 'center' }}>
          {cropMode
            ? 'Drag to select the zone · Draw a new box to change selection'
            : 'Scroll to zoom · Drag to pan · Enable Crop Mode to select zone'}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LocationsScreen({ projectData = [], projectState = {}, onDataUpdate, projectId }) {
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
  const [generatingLoc, setGeneratingLoc] = useState(null);
  const [zoomCropTarget, setZoomCropTarget] = useState(null);
  const [activeCategory, setActiveCategory] = useState('project');
  const [scriptPromptPreview, setScriptPromptPreview] = useState(null); // { name, description, replaceIndex }
  const [pendingSheetFile, setPendingSheetFile] = useState(null);
  const [sheetReplaceTarget, setSheetReplaceTarget] = useState(null);
  const [showSheetCropModal, setShowSheetCropModal] = useState(false);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState(null);
  const [sheetWarning, setSheetWarning] = useState(null);
  const [sheetProcessStatus, setSheetProcessStatus] = useState('');
  const [locProgressStep, setLocProgressStep] = useState(-1);

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);

  // ── Comparison board ──────────────────────────────────────────────────────
  const [boardCards, setBoardCards] = useState([]);
  const [cardZOrder, setCardZOrder] = useState([]);
  const [isDragOverBoard, setIsDragOverBoard] = useState(false);
  const dragState = useRef(null);
  const resizeState = useRef(null);
  const boardRef = useRef(null);
  const CARD_DEFAULT_W = 280;
  const CARD_MIN_W = 160;
  const CARD_MAX_W = 800;
  const supabase = useMemo(() => createClient(), []);
  const projectLocations = projectData || [];

  // ── Batch location generation queue (concurrency=1 — each sheet is expensive) ──
  // Declared after projectLocations so the useRef initializer can reference it.
  const locationQueue = useGenerationQueue({ concurrency: 1 });
  const projectLocationsRef = useRef(projectLocations);
  useEffect(() => { projectLocationsRef.current = projectLocations; }, [projectLocations]);
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
  const busy = isProcessingSheet || isGenerating;

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

  const handleSheetDrop = (e) => {
    e.preventDefault();
    setIsDraggingSheet(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || busy) return;
    setSheetReplaceTarget(null);
    handleSheetUpload({ target: { files: [file], value: '' } });
  };

  const handleRefDrop = (e) => {
    e.preventDefault();
    setIsDraggingRef(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleRefImageSelect({ target: { files: [file], value: '' } });
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
        images: [{ label: 'LOCATION SHEET', url: null }],
        isGeneratingReference: true,
        replaceIndex: isReplacing ? replaceIndex : null,
      });
      setActiveTab(isReplacing ? replaceIndex : projectLocations.length);
      setActiveCategory('project');

      // Single call — generates a full 21:9 location reference sheet in one image
      setLocProgressStep(1);
      const payload = {
        locationDescription: desc,
        locationName: locName,
        label: 'LOCATION SHEET',
        projectState,
      };
      // If user provided a reference image, pass it so the sheet locks to it
      if (refImage?.base64) {
        payload.base64 = refImage.base64;
        payload.mimeType = refImage.mimeType || 'image/png';
        payload.angleDescription = 'Full 360° location reference sheet';
      }

      const resp = await fetch('/api/generate-location-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const { imageBase64, error: genError } = await resp.json();
      if (genError) throw new Error(genError);
      if (!imageBase64) throw new Error('No image data returned from location sheet generation.');

      const blob = base64ToBlob(imageBase64, 'image/png');
      const sheetPath = `${projectId}/generated/${Date.now()}-${locName.replace(/\s+/g, '_')}-sheet.png`;
      const sheetUrl = await uploadBlob(blob, 'image/png', sheetPath);

      const sheetImage = { url: sheetUrl, label: 'LOCATION SHEET' };
      setGeneratingLoc(prev => prev ? { ...prev, images: [sheetImage] } : prev);

      setLocProgressStep(LOCATION_STEPS.length - 1);
      const newLoc = {
        ...(existingLoc || {}),
        id: existingLoc?.id || tempId,
        name: locName,
        description: desc,
        visual_prompt: existingLoc?.visual_prompt || desc,
        images: [sheetImage],
        sheetUrl,
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

  // Pure worker for one location sheet — throws on failure so queue can retry.
  const runLocationSheetJob = useCallback(async (loc, replaceIndex) => {
    const locName = String(loc.name || '').trim().toUpperCase();
    const desc = buildScriptLocationDescription(loc, projectState);
    if (!desc.trim()) throw new Error(`No description for ${locName}`);

    const res = await fetch('/api/generate-location-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationDescription: desc,
        locationName: locName,
        label: 'LOCATION SHEET',
        projectState,
      }),
    });
    const result = await res.json();
    if (!res.ok || result.error || !result.imageBase64) {
      const err = new Error(result.error || 'Location sheet generation failed');
      err.status = res.status;
      throw err;
    }

    // Upload sheet
    const bytes = atob(result.imageBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    const sheetPath = `${projectId}/generated/${Date.now()}-${locName.replace(/\s+/g, '_')}-sheet.png`;
    const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, blob);
    if (upErr) throw upErr;
    const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);

    const newLoc = { ...loc, images: [{ url: sheetUrl, label: 'LOCATION SHEET' }], sheetUrl, source: 'ai' };

    // Use ref for latest — sequential jobs (concurrency=1) see each other's writes.
    const locs = [...projectLocationsRef.current];
    locs[replaceIndex] = newLoc;
    projectLocationsRef.current = locs;
    await onDataUpdate({ locations: locs });
    return sheetUrl;
  }, [projectState, projectId, supabase, onDataUpdate]);

  // Enqueue all project locations that don't have a sheet yet.
  const handleGenerateAllLocationSheets = useCallback(() => {
    if (locationQueue.isActive) return;
    const jobs = projectLocations
      .map((loc, index) => ({ loc, index }))
      .filter(({ loc }) => !loc.sheetUrl && !loc.isGeneratingReference && loc.name)
      .map(({ loc, index }) => ({
        id: `loc-sheet-${index}`,
        label: loc.name,
        run: () => runLocationSheetJob(loc, index),
      }));
    if (jobs.length) locationQueue.enqueue(jobs);
  }, [projectLocations, locationQueue, runLocationSheetJob]);

  const handleGenerateAngles = async () => {
    if (!createName.trim()) return alert('Enter a location name');
    if (!createDesc.trim()) return alert('Describe the location');
    await generateLocationReferences({
      name: createName,
      description: createDesc,
      refImage: createRefImage,
    });
  };

  const handleGenerateFromScript = () => {
    const targetIndex = activeCategory === 'project' && activeLoc && activeLoc.id !== 'generating'
      ? activeTab
      : -1;
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

    setScriptPromptPreview({ name, description, replaceIndex: targetIndex >= 0 ? targetIndex : null });
  };

  const handleConfirmScriptGenerate = async () => {
    if (!scriptPromptPreview) return;
    const { name, description, replaceIndex } = scriptPromptPreview;
    setScriptPromptPreview(null);
    await generateLocationReferences({ name, description, replaceIndex });
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    try {
      if (activeCategory === 'history') {
        const { error } = await supabase
          .from('locations_library')
          .update({ name: editName.trim().toUpperCase(), description: editDesc.trim() })
          .eq('id', activeLoc.id);
        if (error) throw error;
        await refreshGlobalLibrary();
      } else {
        const updatedLocs = [...projectLocations];
        updatedLocs[activeTab] = { ...projectLocations[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
        await onDataUpdate({ locations: updatedLocs });
      }
      setIsPanelEditing(false);
    } catch (error) {
      console.error('Location rename failed:', error);
      alert('Location could not be renamed. Please try again.');
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

  // ── Comparison board helpers ──────────────────────────────────────────────
  const bringToFront = useCallback((id) => {
    setCardZOrder(prev => [...prev.filter(z => z !== id), id]);
  }, []);

  const addCardToBoard = useCallback((locIndex, dropX, dropY) => {
    const existing = boardCards.find(c => c.locIndex === locIndex);
    if (existing) { bringToFront(existing.id); setActiveTab(locIndex); return; }
    const id = `loc-card-${Date.now()}-${locIndex}`;
    setBoardCards(prev => [...prev, { id, locIndex, x: Math.max(0, dropX - 140), y: Math.max(0, dropY - 60), width: CARD_DEFAULT_W }]);
    setCardZOrder(prev => [...prev, id]);
    setActiveTab(locIndex);
  }, [boardCards, bringToFront]);

  const removeCardFromBoard = useCallback((id) => {
    setBoardCards(prev => prev.filter(c => c.id !== id));
    setCardZOrder(prev => prev.filter(z => z !== id));
  }, []);

  const handleCardMouseDown = useCallback((e, card) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(card.id);
    setActiveTab(card.locIndex);
    dragState.current = { cardId: card.id, startX: e.clientX, startY: e.clientY, startCardX: card.x, startCardY: card.y };
  }, [bringToFront]);

  const handleResizeMouseDown = useCallback((e, card) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { cardId: card.id, startX: e.clientX, startWidth: card.width ?? CARD_DEFAULT_W };
  }, []);

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
    const locIndex = parseInt(e.dataTransfer.getData('loc-index'), 10);
    if (isNaN(locIndex)) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    addCardToBoard(locIndex, e.clientX - rect.left, e.clientY - rect.top);
  }, [addCardToBoard]);

  const getLocPreviewImage = useCallback((loc) => {
    if (!loc) return null;
    const first = loc.images?.[0];
    const src = typeof first === 'string' ? first : first?.url;
    if (src) return src;
    if (loc.sheetUrl) return loc.sheetUrl;
    return null;
  }, []);

  useEffect(() => { setIsPanelEditing(false); }, [activeTab, activeCategory]);

  const openPanelEdit = useCallback(() => {
    if (!activeLoc) return;
    setEditName(activeLoc.name || '');
    setEditDesc(activeLoc.description || '');
    setIsPanelEditing(true);
  }, [activeLoc]);

  return (
    <div className="screen active screen-fill" id="s5">
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,var(--bg-deep) 25%,var(--surface-2) 50%,var(--bg-deep) 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .tab-pill.on-board::after { content:''; display:inline-block; width:0.375rem; height:0.375rem; border-radius:50%; background:var(--cyan); margin-left:0.375rem; vertical-align:middle; box-shadow:0 0 0.375rem rgba(var(--cyan-rgb),0.6); }
      `}</style>

      <WorkflowThreePaneShell
        showLeftPanel={false}
        rightTitle="Location Controls"
        storageKey="workflow-three-pane:s5"
        minRightWidth={320}
        maxRightWidth={540}
        defaultRightWidth={384}
        main={(
          <div className="main-content" style={{ background: 'var(--bg)' }}>
            {/* Header */}
            <div className="main-header" style={{ padding: '1.125rem 2rem' }}>
              {/* Draggable location tabs */}
              <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.875rem', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, marginRight: '0.25rem' }}>drag to board →</span>
                {displayedLocations.map((loc, i) => (
                  <div
                    key={loc.id || i}
                    draggable={true}
                    onDragStart={e => { e.dataTransfer.setData('loc-index', String(i)); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => setActiveTab(i)}
                    className={`tab-pill ${activeTab === i ? 'active' : ''}${boardCards.some(c => c.locIndex === i) ? ' on-board' : ''}`}
                    style={{ whiteSpace: 'nowrap', cursor: 'grab', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '0.8125rem', fontWeight: 500, letterSpacing: '-0.015em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {loc.name}
                    {(loc.isGeneratingReference || loc.id === 'generating') && (
                      <Loader2 size={10} className="spin" style={{ color: 'var(--cyan)', opacity: 0.8 }} />
                    )}
                  </div>
                ))}
                {activeCategory === 'project' && !isGeneratingActive && (
                  <div onClick={() => setShowCreateModal(true)} className="tab-pill" style={{ fontSize: '0.875rem', color: 'var(--orange)', background: 'rgba(var(--violet-rgb), 0.06)', borderColor: 'rgba(var(--violet-rgb), 0.22)', cursor: 'pointer', padding: '0.3125rem 0.875rem' }}>+</div>
                )}
              </div>

              {/* Location info + actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h1 className="editorial-title editorial-h2" style={{ margin: '0 0 0.375rem' }}>
                    {activeLoc ? <>{activeLoc.name}<span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>.</span></> : <em style={{ color: 'var(--text-muted)' }}>No locations.</em>}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {activeLoc && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5938rem', fontWeight: 500, color: activeCategory === 'project' ? 'var(--teal)' : 'var(--orange)', background: 'rgba(var(--violet-rgb), 0.1)', padding: '0.25rem 0.625rem', borderRadius: '62.4375rem', border: '0.0625rem solid rgba(var(--violet-rgb), 0.22)', letterSpacing: '0.18em' }}>
                        {activeCategory === 'project' ? '◇ PROJECT' : '◆ GLOBAL'}
                      </span>
                    )}
                    <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.8125rem', fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.01em' }}>
                      {truncateLocationDescription(activeLoc?.description) || 'Select or add a location to get started.'}
                    </p>
                  </div>
                </div>
                {!isGeneratingActive && activeLoc && activeCategory === 'history' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleAddHistoryToProject} className="btn-secondary" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>Add to project</button>
                    <button onClick={handleDelete} className="btn-action-danger" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>Delete from history</button>
                  </div>
                )}
                {!isGeneratingActive && activeLoc && activeCategory === 'project' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {activeLoc.sheetUrl && (
                      <button onClick={() => setZoomCropTarget({ locIdx: activeTab, imgIdx: null, url: activeLoc.sheetUrl, label: 'NEW VIEW', showLabelInput: true })} className="btn-outline" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>+ Add from Sheet</button>
                    )}
                    <button onClick={handleDelete} className="btn-action-danger" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>Delete</button>
                  </div>
                )}
              </div>
            </div>

            {/* Comparison board */}
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
                {boardCards.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: '3.25rem', height: '3.25rem', borderRadius: '0.875rem', background: 'var(--surface-2)', boxShadow: 'var(--neo-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', opacity: isDragOverBoard ? 1 : 0.6 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                    </div>
                    <div style={{ color: isDragOverBoard ? 'var(--cyan)' : 'var(--text-muted)', fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: '0.375rem', transition: 'color 120ms ease' }}>
                      {isDragOverBoard ? 'Drop to add to board' : 'Drag locations here to compare'}
                    </div>
                    <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>Drag location tabs from the bar above</div>
                  </div>
                )}
                {boardCards.length > 0 && isDragOverBoard && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.04)', border: '0.125rem dashed var(--cyan-border)', borderRadius: 'var(--radius-lg)', pointerEvents: 'none', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--cyan)' }}>Drop to add location</span>
                  </div>
                )}
                {boardCards.map(card => {
                  const loc = displayedLocations[card.locIndex];
                  if (!loc) return null;
                  const imgSrc = getLocPreviewImage(loc);
                  const zIndex = cardZOrder.indexOf(card.id) + 1;
                  const isSelected = activeTab === card.locIndex;
                  const isGeneratingThis = loc.isGeneratingReference || loc.id === 'generating';
                  return (
                    <div
                      key={card.id}
                      onMouseDown={e => handleCardMouseDown(e, card)}
                      onClick={e => { e.stopPropagation(); setActiveTab(card.locIndex); bringToFront(card.id); }}
                      style={{ position: 'absolute', left: card.x, top: card.y, width: card.width ?? CARD_DEFAULT_W, background: 'var(--surface-2)', border: `0.0625rem solid ${isSelected ? 'var(--cyan-border)' : 'rgba(var(--cyan-300-rgb), 0.1)'}`, borderRadius: 'var(--radius-lg)', boxShadow: isSelected ? 'var(--neo-active)' : 'var(--neo-raised)', overflow: 'visible', cursor: dragState.current?.cardId === card.id ? 'grabbing' : 'grab', userSelect: 'none', zIndex, transition: 'border-color 120ms ease, box-shadow 120ms ease' }}
                    >
                      <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <div style={{ position: 'relative', width: '100%', background: 'var(--bg-deep)', aspectRatio: '21/9', overflow: 'hidden' }}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={loc.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                          ) : isGeneratingThis ? (
                            <div className="skeleton-shimmer" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Loader2 size={20} className="spin" style={{ color: 'var(--cyan)', opacity: 0.6 }} />
                            </div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--cyan-300-rgb), 0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                            </div>
                          )}
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeCardFromBoard(card.id); }} style={{ position: 'absolute', top: '0.375rem', right: '0.375rem', width: '1.375rem', height: '1.375rem', borderRadius: '50%', background: 'rgba(var(--ink-950-rgb), 0.75)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.15)', color: 'var(--text-soft)', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, backdropFilter: 'blur(0.25rem)' }}>×</button>
                        </div>
                        <div style={{ padding: '0.5rem 0.625rem 0.4375rem', borderTop: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.06)' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700, color: isSelected ? 'var(--cyan)' : 'var(--text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 120ms ease' }}>{loc.name}</div>
                          {loc.description && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.description.slice(0, 55)}</div>}
                        </div>
                      </div>
                      {/* Resize handle */}
                      <div onMouseDown={e => handleResizeMouseDown(e, card)} title="Drag to resize" style={{ position: 'absolute', bottom: -1, right: -1, width: '1.125rem', height: '1.125rem', cursor: 'nwse-resize', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '0.1875rem', borderBottomRightRadius: 'var(--radius-lg)', zIndex: 2 }}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="rgba(var(--cyan-300-rgb),0.45)" strokeWidth="1.25" strokeLinecap="round"/></svg>
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

            {isPanelEditing && activeLoc ? (
              /* ── Edit form ── */
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <div className="kicker" style={{ marginBottom: '0.25rem' }}>Edit Location</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '13rem' }}>{activeLoc.name}</div>
                  </div>
                  <button onClick={() => setIsPanelEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.375rem', cursor: 'pointer', padding: '0.125rem 0.375rem', lineHeight: 1, borderRadius: '0.375rem' }}>×</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: '1 1 auto' }}>
                  <div>
                    <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.375rem' }}>LOCATION NAME</label>
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
                            setSheetReplaceTarget({ index: activeTab, name: (editName || activeLoc?.name || '').trim().toUpperCase(), description: editDesc.trim() });
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
                    Save Changes
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
                  <div className="kicker" style={{ marginBottom: '0.5rem' }}>Location · Studio</div>
                  <h2 className="editorial-title editorial-h2" style={{ marginBottom: '0.375rem' }}>
                    Build your <span className="text-grad">set.</span>
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.7188rem', lineHeight: 1.5 }}>
                    {busy ? (isProcessingSheet ? 'Processing sheet…' : 'Generating references…') : 'Upload a location sheet or create one.'}
                  </p>
                </div>

                {/* Location image preview */}
                {(() => {
                  const imgSrc = getLocPreviewImage(activeLoc);
                  if (!imgSrc) return null;
                  return (
                    <div style={{ marginBottom: '0.5rem', borderRadius: 'var(--radius)', overflow: 'hidden', border: '0.0625rem solid var(--border-mid)', background: 'var(--bg-deep)', cursor: 'pointer' }}
                      onClick={() => activeLoc?.sheetUrl && setZoomCropTarget({ locIdx: activeCategory === 'project' ? activeTab : -1, imgIdx: null, url: activeLoc.sheetUrl, label: 'LOCATION SHEET', showLabelInput: false })}
                      title="Click to view sheet"
                    >
                      <img src={imgSrc} alt={activeLoc?.name} style={{ width: '100%', display: 'block', aspectRatio: '21/9', objectFit: 'cover' }} />
                      <div style={{ padding: '0.375rem 0.625rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Location sheet</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--cyan)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>view ↗</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Edit button — shown when a project location is selected */}
                {activeLoc && !isGeneratingActive && (
                  <button
                    onClick={openPanelEdit}
                    className="btn-outline"
                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.6875rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
                  >
                    Edit {activeCategory === 'history' ? 'Details' : 'Location'}
                  </button>
                )}

                {/* Category toggle */}
                <div className="neo-inset" style={{ display: 'flex', padding: '0.25rem', marginBottom: '1.375rem' }}>
                  {['project', 'history'].map(cat => (
                    <button key={cat} onClick={() => { setActiveCategory(cat); setActiveTab(0); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4375rem', border: activeCategory === cat ? '0.0625rem solid var(--cyan-border)' : '0.0625rem solid transparent', background: activeCategory === cat ? 'var(--surface-2)' : 'transparent', boxShadow: activeCategory === cat ? 'var(--neo-flat)' : 'none', color: activeCategory === cat ? 'var(--cyan)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out' }}>
                      {cat === 'project' ? 'Project' : 'History'}
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button onClick={() => { setShowCreateModal(true); setCreateRefImage(null); }} disabled={busy} className="btn-orange" style={{ width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
                    Create new
                  </button>
                  {/* Generate sheets for all locations that don't have one yet */}
                  {activeCategory === 'project' && (() => {
                    const pending = projectLocations.filter(l => l?.name && !l.sheetUrl && !l.isGeneratingReference).length;
                    if (pending === 0 && !locationQueue.isActive) return null;
                    return (
                      <button
                        className="btn-action-generate"
                        style={{ width: '100%', padding: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 700 }}
                        onClick={handleGenerateAllLocationSheets}
                        disabled={locationQueue.isActive || busy}
                      >
                        {locationQueue.isActive
                          ? <><Loader2 size={13} className="spin" /> {locationQueue.stats.done}/{locationQueue.stats.total} sheets…</>
                          : <><Wand2 size={13} /> Generate all sheets ({pending})</>}
                      </button>
                    );
                  })()}
                  {isGenerating && <ProgressBar steps={LOCATION_STEPS} currentStep={locProgressStep} />}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
                  <div className="panel-flat">
                    <div className="panel-meta-label">Hint</div>
                    <p className="body-sm">Drag location tabs onto the board to compare sets side by side. Click a card to select it and see controls here.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      />


      {/* Sheet Crop Choice Modal */}
      {showSheetCropModal && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxWidth: '35rem', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--text)', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Choose Crop Method</h3>
            <p style={{ color: isProcessingSheet ? 'var(--cyan)' : 'var(--text-muted)', fontSize: '0.8125rem', margin: '0 0 1.5rem' }}>
              {isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Automatically detect and crop each view from your sheet.'}
            </p>
            {sheetWarning && (
              <div style={{ marginBottom: '1rem', color: 'var(--violet-400)', background: 'rgba(var(--violet-rgb), 0.08)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.18)', borderRadius: '0.625rem', padding: '0.625rem 0.75rem', fontSize: '0.75rem', lineHeight: 1.5, textAlign: 'left' }}>
                {sheetWarning}
              </div>
            )}
            {sheetPreviewUrl && (
              <img src={sheetPreviewUrl} alt="Preview" style={{ width: '100%', height: '12.5rem', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.05)' }} />
            )}
            <div className="flex-row gap-12">
              <button
                onClick={() => processSheetFile(pendingSheetFile)}
                disabled={isProcessingSheet}
                className="btn-action-generate"
                style={{ flex: 1, padding: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: isProcessingSheet ? 0.82 : 1, cursor: isProcessingSheet ? 'wait' : 'pointer' }}
              >
                {isProcessingSheet && <Loader2 size={15} className="spin" />}
                {isProcessingSheet ? 'Detecting Views...' : 'Auto-detect Views'}
              </button>
              <button disabled={isProcessingSheet} onClick={handleCloseSheetCropModal} className="btn-outline" style={{ flex: 1, padding: '1rem', opacity: isProcessingSheet ? 0.45 : 1 }}>Cancel Upload</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxWidth: '31.25rem' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--text)', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Create New</h3>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <div className="flex-col gap-16">

              {/* Option 1: Upload existing sheet */}
              <div>
                <div className="panel-meta-label" style={{ marginBottom: '0.5rem' }}>Upload existing sheet</div>
                <button
                  className="btn-outline"
                  style={{ width: '100%', padding: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem', fontSize: '0.8125rem', outline: isDraggingSheet ? '0.125rem dashed var(--cyan-border)' : 'none', outlineOffset: '0.125rem' }}
                  onClick={() => { setSheetReplaceTarget(null); setShowCreateModal(false); fileInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                  onDragEnter={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingSheet(false); }}
                  onDrop={(e) => { setShowCreateModal(false); handleSheetDrop(e); }}
                  disabled={busy}
                >
                  <Upload size={14} />
                  {isDraggingSheet ? 'Drop to upload' : 'Upload Reference Sheet'}
                </button>
              </div>

              {/* Option 2: Generate from script */}
              <div>
                <div className="panel-meta-label" style={{ marginBottom: '0.5rem' }}>Generate from script</div>
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

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>or describe from scratch</span>
                <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
              </div>

              {/* Option 3: Generate from description */}
              <div>
                <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.625rem' }}>LOCATION NAME</label>
                <input className="input-inset" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. CYBERPUNK BAR" style={{ padding: '0.625rem 0.8125rem', fontSize: '0.8125rem', borderRadius: '0.5rem' }} />
              </div>
              <div>
                <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.625rem' }}>DESCRIPTION</label>
                <textarea className="textarea-inset" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Neon-lit interior with rain-slicked windows, holographic advertisements, and crowded seating..." style={{ padding: '0.625rem 0.8125rem', fontSize: '0.8125rem', borderRadius: '0.5rem', height: '5.5rem' }} />
              </div>

              <div>
                <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.625rem' }}>REFERENCE IMAGE <span style={{ color: 'var(--text-subtle)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div className="flex-row gap-12" style={{ padding: '0.625rem', background: 'var(--bg-deep)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.07)', borderRadius: '0.5rem', alignItems: 'center' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '3.5rem', height: '3.5rem', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '0.375rem', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.625rem', marginTop: '0.125rem' }}>Consistency will match this scene</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'transparent', border: 'none', color: 'var(--violet-400)', fontSize: '1rem', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => refFileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingRef(false); }}
                    onDrop={handleRefDrop}
                    style={{ width: '100%', padding: '0.75rem', background: isDraggingRef ? 'rgba(var(--cyan-rgb), 0.06)' : 'rgba(var(--cyan-300-rgb), 0.04)', border: isDraggingRef ? '0.0625rem dashed var(--cyan-border)' : '0.0625rem dashed rgba(var(--cyan-300-rgb), 0.22)', borderRadius: '0.5rem', color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', transition: 'border-color 120ms ease-out, background 120ms ease-out' }}>
                    {isDraggingRef ? 'Drop image here' : 'Upload Reference View'}
                  </button>
                )}
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--cyan-dim)', borderRadius: '0.75rem', border: '0.0625rem solid var(--cyan-border)' }}>
                <div className="panel-meta-label panel-meta-label--cyan" style={{ marginBottom: '0.5rem' }}>SET PREVIEW</div>
                <div className="flex-row gap-6">
                  {['WIDE', 'DETAIL', 'INTERIOR', 'ATMOS'].map(tag => (
                    <span key={tag} className="tag-badge tag-teal" style={{ fontSize: '0.5rem' }}>{tag}</span>
                  ))}
                </div>
              </div>

              <button onClick={handleGenerateAngles} className="btn-action-generate" style={{ padding: '1rem', fontWeight: 700 }}>
                Generate Location References
              </button>
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
          onDelete={() => { handleDeleteImage(zoomCropTarget.locIdx, zoomCropTarget.imgIdx); setZoomCropTarget(null); }}
          initialBox={zoomCropTarget.initialBox || null}
          showLabelInput={zoomCropTarget.showLabelInput || false}
          recropUrl={zoomCropTarget.recropUrl || null}
          recropBox={zoomCropTarget.recropBox || null}
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
              This prompt will be sent to the image model to generate location reference angles. Edit the description in the location card first if you need to adjust it.
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
            <div style={{ color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 600 }}>
              {isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Creating references...'}
            </div>
            <div style={{ color: 'var(--cyan)', fontSize: '0.625rem', fontWeight: 700, marginTop: '0.125rem', letterSpacing: '0.05em' }}>Please keep this page open</div>
          </div>
        </div>
      )}

      <QueueStatusBar
        jobs={locationQueue.jobs}
        isActive={locationQueue.isActive}
        stats={locationQueue.stats}
        onAbort={locationQueue.abort}
        onClear={locationQueue.clear}
        label="Location sheets"
      />
    </div>
  );
}
