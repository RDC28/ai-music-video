'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase';
import ProgressBar from '../ProgressBar';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODAL_BTN = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#bbb',
  padding: '8px 14px',
  borderRadius: '8px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.04em',
};

const PANEL_LABELS = [
  'Mid Portrait', 'Full Body Front', 'Full Body Left', 'Full Body Right', 'Full Body Back',
  'Face Close-up Front', 'Face Close-up Back', 'Face 3/4 Left', 'Face 3/4 Right',
];

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

// Returns the rendered image rect (accounting for objectFit:contain letterboxing)
// in the coordinate space of the container (all values in px, relative to container top-left).
function _renderedRect(img, containerW, containerH) {
  const natAR = img.naturalWidth / img.naturalHeight;
  const cAR   = containerW / containerH;
  let rendW, rendH, offX, offY;
  if (natAR > cAR) {
    rendW = containerW; rendH = containerW / natAR;
    offX  = 0;          offY  = (containerH - rendH) / 2;
  } else {
    rendH = containerH; rendW = containerH * natAR;
    offX  = (containerW - rendW) / 2; offY = 0;
  }
  return { offX, offY, rendW, rendH };
}

// ─── ZoomCropModal ────────────────────────────────────────────────────────────

function ZoomCropModal({ imageUrl, label, onClose, onApply, initialBox, showLabelInput }) {
  const containerRef = useRef(null);
  const imgRef      = useRef(null);
  const [zoom, setZoom]         = useState(1);
  const [pan,  setPan]          = useState({ x: 0, y: 0 });
  const [drag, setDrag]         = useState(null);
  const [cropBox,   setCropBox] = useState(null);
  const [cropMode,  setCropMode]  = useState(!!initialBox);
  const [applying,  setApplying]  = useState(false);
  const [labelInput, setLabelInput] = useState(label || '');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Pre-select the crop region from normalised box_2d coords once the image renders
  useEffect(() => {
    if (!initialBox) return;
    const img = imgRef.current;
    if (!img) return;

    const apply = () => {
      const cRect = containerRef.current?.getBoundingClientRect();
      if (!cRect || !img.naturalWidth) return;
      const { offX, offY, rendW, rendH } = _renderedRect(img, cRect.width, cRect.height);
      const [ymin, xmin, ymax, xmax] = initialBox;
      setCropBox({
        x: offX + (xmin / 1000) * rendW,
        y: offY + (ymin / 1000) * rendH,
        w: ((xmax - xmin) / 1000) * rendW,
        h: ((ymax - ymin) / 1000) * rendH,
      });
    };

    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  }, [initialBox]);

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
    const img   = imgRef.current;
    const cRect = containerRef.current.getBoundingClientRect();
    const cw    = cRect.width;
    const ch    = cRect.height;
    const { offX, offY, rendW, rendH } = _renderedRect(img, cw, ch);

    // cropBox is in container coords. Account for zoom/pan:
    // CSS transform `scale(zoom) translate(pan.x/zoom, pan.y/zoom)` at center means
    // container point (px,py) → rendered image point:
    //   rx = cw/2 + (px - cw/2 - pan.x) / zoom
    //   ry = ch/2 + (py - ch/2 - pan.y) / zoom
    const toImg = (px, py) => ({
      x: (cw / 2 + (px - cw / 2 - pan.x) / zoom - offX) / rendW * img.naturalWidth,
      y: (ch / 2 + (py - ch / 2 - pan.y) / zoom - offY) / rendH * img.naturalHeight,
    });

    const tl = toImg(cropBox.x, cropBox.y);
    const br = toImg(cropBox.x + cropBox.w, cropBox.y + cropBox.h);

    const natX = Math.max(0, tl.x);
    const natY = Math.max(0, tl.y);
    const natW = Math.min(img.naturalWidth  - natX, br.x - tl.x);
    const natH = Math.min(img.naturalHeight - natY, br.y - tl.y);
    if (natW < 1 || natH < 1) { setApplying(false); return; }

    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(natW);
    canvas.height = Math.round(natH);
    const tmp = new Image();
    tmp.crossOrigin = 'anonymous';
    tmp.onload = () => {
      canvas.getContext('2d').drawImage(tmp, Math.round(natX), Math.round(natY), Math.round(natW), Math.round(natH), 0, 0, Math.round(natW), Math.round(natH));
      canvas.toBlob(blob => { onApply(blob, labelInput.trim() || label); setApplying(false); }, 'image/jpeg', 0.95);
    };
    tmp.src = imageUrl;
  };

  const canApply = cropBox && cropBox.w > 4 && cropBox.h > 4;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: '#555', fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', marginRight: '4px' }}>{label?.toUpperCase()}</span>
        <button onClick={() => setZoom(z => Math.min(10, z * 1.25))} style={MODAL_BTN}>+ ZOOM</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={MODAL_BTN}>{Math.round(zoom * 100)}% · RESET</button>
        <button onClick={() => setZoom(z => Math.max(0.5, z * 0.8))} style={MODAL_BTN}>− ZOOM</button>
        <div style={{ width: '1px', height: '18px', background: '#252525' }} />
        <button onClick={() => { setCropMode(m => !m); if (cropMode) setCropBox(null); }} style={{ ...MODAL_BTN, background: cropMode ? '#00B8D4' : undefined, color: cropMode ? '#000' : undefined, borderColor: cropMode ? '#00B8D4' : undefined }}>
          ✂ {cropMode ? 'DRAW NEW SELECTION' : 'CROP MODE'}
        </button>
        {canApply && showLabelInput && (
          <input
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder="Label (e.g. BACK VIEW)"
            onClick={e => e.stopPropagation()}
            style={{ ...MODAL_BTN, width: '170px', outline: 'none', caretColor: '#fff', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
          />
        )}
        {canApply && (
          <button onClick={applyCrop} disabled={applying} style={{ ...MODAL_BTN, background: '#FF6F00', color: '#fff', border: 'none' }}>
            {applying ? 'SAVING...' : '✓ SAVE CROP'}
          </button>
        )}
        <div style={{ width: '1px', height: '18px', background: '#252525' }} />
        <button onClick={onClose} style={{ ...MODAL_BTN, color: '#ff6666', borderColor: 'rgba(255,100,100,0.2)' }}>✕ CLOSE</button>
      </div>

      {/* Viewport */}
      <div
        ref={containerRef}
        style={{ width: '86vw', height: '78vh', overflow: 'hidden', position: 'relative', background: '#0c0c0c', borderRadius: '16px', border: '1px solid #1a1a1a', cursor: cropMode ? 'crosshair' : drag?.type === 'pan' ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
      >
        <img
          ref={imgRef} src={imageUrl} alt={label} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`, transformOrigin: 'center center', userSelect: 'none', pointerEvents: 'none', display: 'block' }}
        />
        {cropBox && cropBox.w > 0 && (
          <div style={{ position: 'absolute', left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h, border: '2px solid #00B8D4', background: 'rgba(0,184,212,0.1)', pointerEvents: 'none', boxSizing: 'border-box' }} />
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
  const [activeTab,      setActiveTab]      = useState(0);
  const [globalLibrary,  setGlobalLibrary]  = useState([]);
  const [showCreateModal,setShowCreateModal] = useState(false);
  const [showEditModal,  setShowEditModal]   = useState(false);
  const [createName,     setCreateName]      = useState('');
  const [createDesc,     setCreateDesc]      = useState('');
  const [createRefImage, setCreateRefImage]  = useState(null); // { base64, mimeType, previewUrl }
  const [editName,       setEditName]        = useState('');
  const [editDesc,       setEditDesc]        = useState('');
  const [isProcessingSheet, setIsProcessingSheet] = useState(false);
  const [isGenerating,   setIsGenerating]    = useState(false);
  const [generatingChar, setGeneratingChar]  = useState(null);
  const [zoomCropTarget, setZoomCropTarget]  = useState(null);
  const [activeCategory, setActiveCategory]  = useState('project');
  const [renamingPanel,  setRenamingPanel]   = useState(null); // { charIdx, imgIdx }

  const [pendingSheetFile, setPendingSheetFile] = useState(null);
  const [showSheetCropModal, setShowSheetCropModal] = useState(false);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState(null);
  const [charProgressStep, setCharProgressStep] = useState(-1);

  const CHARACTER_STEPS = [
    'Preparing character profile',
    'Generating Front View',
    'Generating Side View',
    'Generating Back View',
    'Generating Face Close-up',
    'Uploading to library'
  ];

  const fileInputRef    = useRef(null);
  const refFileInputRef = useRef(null);
  const supabase = createClient();
  const projectCharacters = projectData || [];

  useEffect(() => { fetchGlobalLibrary(); }, []);

  const fetchGlobalLibrary = async () => {
    const { data, error } = await supabase.from('characters_library').select('*').order('created_at', { ascending: false });
    if (!error && data) setGlobalLibrary(data);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

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
    const res  = await fetch('/api/generate-character-pose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
        images: charObj.images, // JSONB array
        source: source,
        sheet_url: charObj.sheetUrl || null
      });

      if (insErr) throw insErr;
      await fetchGlobalLibrary();
      console.log(`Character ${charObj.name} saved to global library.`);
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

  // ── Upload sheet flow ────────────────────────────────────────────────────────

  const handleSheetUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Reset input immediately
    e.target.value = '';
    
    const previewUrl = URL.createObjectURL(file);
    setSheetPreviewUrl(previewUrl);
    setPendingSheetFile(file);
    setShowSheetCropModal(true);
  };

  const handleCloseSheetCropModal = () => {
    if (sheetPreviewUrl) {
      URL.revokeObjectURL(sheetPreviewUrl);
    }
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
        const sw = Math.min((xmax / 1000) * img.width,  img.width)  - sx;
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
        const ext  = finalMime.split('/')[1] || 'png';
        const url  = await uploadBlob(blob, finalMime, `${projectId}/generated/${Date.now()}-section-${i}.${ext}`);
        
        finalImages[i] = { url, label, box_2d: pose.box_2d };
        setGeneratingChar(prev => {
          const newImgs = [...prev.images];
          newImgs[i] = { url, label, box_2d: pose.box_2d };
          return { ...prev, images: newImgs };
        });
      }));

      const newChar = { id: Date.now(), name: charName, description: 'Uploaded from character sheet', images: finalImages.filter(Boolean), source: 'upload', sheetUrl };
      const updatedChars = [...projectCharacters, newChar];
      await onDataUpdate({ characters: updatedChars });
      setActiveTab(updatedChars.length - 1);

      // Save to global library independently
      saveToGlobalLibrary(newChar, 'upload');
    } catch (err) {
      console.error('Sheet processing failed:', err);
      alert('Failed to process sheet: ' + err.message);
    } finally {
      setIsProcessingSheet(false);
      setGeneratingChar(null);
      
      // Cleanup preview state
      if (sheetPreviewUrl) {
        URL.revokeObjectURL(sheetPreviewUrl);
      }
      setSheetPreviewUrl(null);
      setPendingSheetFile(null);
      setShowSheetCropModal(false);
    }
  };

  // ── Generate character sheet flow ─────────────────────────────────────────────

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

      // Generate SEQUENTIALLY to maintain character consistency via reference image
      for (let i = 0; i < angles.length; i++) {
        setCharProgressStep(i + 1);
        const angle = angles[i];
        try {
          const payload = { 
            characterDescription: desc,
            angleDescription: angle.prompt,
            label: angle.label
          };

          // Use the FIRST generated image as a reference for all others
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

          // Lock this character's look using the first generated image
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

      // Save to global library independently
      saveToGlobalLibrary(newChar, 'ai');
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Failed: ' + err.message);
    } finally {
      setIsGenerating(false);
      setCharProgressStep(-1);
      setGeneratingChar(null);
    }
  };

  // ── Edit save ─────────────────────────────────────────────────────────────────

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    const updatedChars = [...projectCharacters];
    updatedChars[activeTab] = { ...projectCharacters[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
    await onDataUpdate({ characters: updatedChars });
    setShowEditModal(false);
  };

  // ── Apply crop ────────────────────────────────────────────────────────────────

  const handleApplyCrop = async (blob, newLabel) => {
    if (!zoomCropTarget) return;
    const { charIdx, imgIdx } = zoomCropTarget;
    try {
      const url = await uploadBlob(blob, 'image/jpeg', `${projectId}/crops/${Date.now()}-crop.jpg`);
      const char = projectCharacters[charIdx];
      const images = [...char.images];
      if (imgIdx === null) {
        // Add new panel from sheet
        images.push({ url, label: newLabel || 'CUSTOM CROP' });
      } else {
        // Replace existing panel
        const existing = images[imgIdx];
        images[imgIdx] = { url, label: newLabel || (typeof existing === 'string' ? `Section ${imgIdx + 1}` : existing.label) };
      }
      const updatedChars = [...projectCharacters];
      updatedChars[charIdx] = { ...char, images };
      await onDataUpdate({ characters: updatedChars });
      setZoomCropTarget(null);
    } catch (err) { alert('Crop upload failed: ' + err.message); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

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
        await fetchGlobalLibrary();
        setActiveTab(Math.max(0, activeTab - 1));
      }
    } catch (err) { alert('Delete failed: ' + err.message); }
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

  // ── Derived state ─────────────────────────────────────────────────────────────

  const displayedCharacters = activeCategory === 'project'
    ? [...projectCharacters, ...(generatingChar ? [generatingChar] : [])]
    : globalLibrary;
  const activeChar = displayedCharacters[activeTab] || null;
  const isGeneratingActive = activeChar?.id === 'generating';
  const busy = isProcessingSheet || isGenerating;
  const _n        = activeChar?.images?.length || 0;
  const gridCols  = Math.max(2, Math.ceil(Math.sqrt(_n)));

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="screen active" id="s4" style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#080808' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,#111 25%,#1e1e1e 50%,#111 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .img-card-actions { opacity:0; transition:opacity 0.15s; }
        .img-card:hover .img-card-actions { opacity:1; }
        .img-card-delete { opacity:0; transition:opacity 0.15s; }
        .img-card:hover .img-card-delete { opacity:1; }
      `}</style>

      <div style={{ display: 'flex', height: '100%' }}>

        {/* ── Sidebar ── */}
        <div style={{ width: '272px', minWidth: '272px', background: '#0D0D0D', borderRight: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column', padding: '28px', height: '100%', overflowY: 'auto' }}>
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--teal)' }} />
              <span style={{ color: 'var(--teal)', fontSize: '10px', fontWeight: 800, letterSpacing: '0.15em' }}>CHARACTER STUDIO</span>
            </div>
            <h2 style={{ color: '#FFF', fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, lineHeight: 1.1 }}>
              Build your <span style={{ color: 'var(--teal)' }}>Cast</span>
            </h2>
            <p style={{ color: '#555', fontSize: '12px', marginTop: '10px', lineHeight: 1.5 }}>
              {busy && generatingChar
                ? `Generating ${generatingChar.images.filter(x => x.url).length}/${generatingChar.images.length}...`
                : busy ? 'Detecting sections...' : 'Upload a sheet or generate with AI.'}
            </p>
          </div>

          <div style={{ display: 'flex', background: '#151515', borderRadius: '12px', padding: '4px', marginBottom: '24px', border: '1px solid #1e1e1e' }}>
            {['project', 'global'].map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setActiveTab(0); }} style={{
                flex: 1, padding: '9px', borderRadius: '8px', border: 'none',
                background: activeCategory === cat ? '#222' : 'transparent',
                color: activeCategory === cat ? (cat === 'project' ? 'var(--teal)' : 'var(--orange)') : '#555',
                fontWeight: 700, fontSize: '10px', cursor: 'pointer', letterSpacing: '0.04em',
              }}>
                {cat === 'project' ? 'PROJECT CAST' : 'GLOBAL HISTORY'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="file" ref={fileInputRef} onChange={handleSheetUpload} style={{ display: 'none' }} accept="image/*" />
            <button className="btn-orange" style={{ width: '100%', padding: '15px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', fontWeight: 700 }}
              onClick={() => fileInputRef.current.click()} disabled={busy}>
              {isProcessingSheet ? '⌛ PROCESSING...' : '📁 UPLOAD SHEET'}
            </button>
            <button onClick={() => setShowCreateModal(true)} disabled={busy}
              style={{ width: '100%', padding: '15px', borderRadius: '12px', background: 'transparent', border: '1px solid #252525', color: '#777', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              ✨ GENERATE NEW
            </button>
 
            {isGenerating && (
              <ProgressBar steps={CHARACTER_STEPS} currentStep={charProgressStep} />
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '32px' }}>
            <button className="btn-teal" style={{ width: '100%', padding: '16px', borderRadius: '14px', fontWeight: 800, fontSize: '13px' }} onClick={() => onNavigate(5)}>
              CONTINUE TO LOCATIONS →
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, background: '#080808', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Header */}
          <div style={{ flexShrink: 0, zIndex: 10, background: 'rgba(8,8,8,0.92)', backdropFilter: 'blur(20px)', padding: '22px 40px', borderBottom: '1px solid #1A1A1A' }}>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '14px' }}>
              {displayedCharacters.map((char, i) => (
                <div key={char.id || i} onClick={() => setActiveTab(i)} style={{
                  whiteSpace: 'nowrap', borderRadius: '100px', padding: '7px 18px',
                  fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  background: activeTab === i ? 'var(--teal)' : '#151515',
                  color: activeTab === i ? '#000' : '#666',
                  border: activeTab === i ? 'none' : '1px solid #1e1e1e',
                }}>
                  {char.name}
                  {char.id === 'generating' && (
                    <span style={{ marginLeft: '6px', opacity: 0.6, fontSize: '9px' }}>
                      {char.images.filter(x => x.url).length}/{char.images.length}
                    </span>
                  )}
                </div>
              ))}
              {activeCategory === 'project' && !isGeneratingActive && (
                <div onClick={() => setShowCreateModal(true)} style={{ borderRadius: '100px', padding: '7px 14px', background: 'rgba(0,184,212,0.07)', color: 'var(--teal)', fontSize: '14px', cursor: 'pointer' }}>+</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div>
                <h1 style={{ color: '#FFF', fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {activeChar ? activeChar.name : 'Ready for Casting'}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: activeCategory === 'global' ? 'var(--orange)' : 'var(--teal)', color: '#000' }}>
                    {activeCategory === 'global' ? 'GLOBAL' : 'PROJECT'}
                  </span>
                  <span style={{ color: '#3a3a3a', fontSize: '12px' }}>{activeChar?.description || 'No description'}</span>
                </div>
              </div>
              {activeChar && !isGeneratingActive && activeCategory === 'project' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {activeChar.sheetUrl && (
                    <button
                      onClick={() => setZoomCropTarget({ charIdx: activeTab, imgIdx: null, url: activeChar.sheetUrl, label: '', showLabelInput: true })}
                      style={{ background: 'rgba(0,184,212,0.07)', border: '1px solid rgba(0,184,212,0.2)', color: 'var(--teal)', padding: '8px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      + ADD FROM SHEET
                    </button>
                  )}
                  <button onClick={() => { setEditName(activeChar.name); setEditDesc(activeChar.description || ''); setShowEditModal(true); }}
                    style={{ background: 'transparent', border: '1px solid #222', color: '#777', padding: '8px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={handleDelete}
                    style={{ background: 'rgba(255,0,0,0.04)', border: '1px solid rgba(255,0,0,0.1)', color: '#ff4444', padding: '8px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Image grid */}
          <div style={{ height: 'calc(100vh - 280px)', overflow: 'hidden', padding: '16px 28px', boxSizing: 'border-box', flexShrink: 0 }}>
            {activeChar?.images?.length > 0 ? (
              activeCategory === 'global' ? (
                <div style={{ height: '100%', display: 'flex', flexWrap: 'wrap', gap: '8px', overflowY: 'auto', alignContent: 'flex-start' }}>
                  {activeChar.images.map((img, i) => {
                    const _imgObj = (typeof img === 'string' && img.charAt(0) === '{') ? (() => { try { return JSON.parse(img); } catch { return null; } })() : null;
                    const src   = _imgObj ? (_imgObj.url || null) : (typeof img === 'string' ? img : img?.url);
                    const label = _imgObj ? (_imgObj.label || `POSE ${i + 1}`) : (typeof img === 'string' ? `POSE ${i + 1}` : img?.label);
                    if (!src) return null;
                    return (
                      <div key={i} className="img-card" style={{
                        height: '160px', flexShrink: 0, background: '#0f0f0f',
                        borderRadius: '10px', border: '1px solid #1c1c1c',
                        overflow: 'hidden', position: 'relative', boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                      }}>
                        <img src={src} alt={label} style={{ height: '100%', width: 'auto', display: 'block' }} />
                        <div style={{ position: 'absolute', top: '6px', right: '6px' }}>
                          <div style={{ padding: '3px 6px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '8px', color: '#bbb', backdropFilter: 'blur(8px)', fontWeight: 800, border: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' }}>
                            {label.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div style={{ height: '100%', overflow: 'hidden', columnCount: gridCols, columnGap: '8px' }}>
                {activeChar.images.map((img, i) => {
                  const _imgObj = (typeof img === 'string' && img.charAt(0) === '{') ? (() => { try { return JSON.parse(img); } catch { return null; } })() : null;
                  const src     = _imgObj ? (_imgObj.url || null) : (typeof img === 'string' ? img : img?.url);
                  const label   = _imgObj ? (_imgObj.label || `POSE ${i + 1}`) : (typeof img === 'string' ? `POSE ${i + 1}` : img?.label);
                  const loading = src === null;
                  const charIdx = activeCategory === 'project' ? activeTab : -1;
                  return (
                    <div key={i} className="img-card" style={{
                      breakInside: 'avoid', marginBottom: '8px', background: '#0f0f0f', borderRadius: '14px',
                      border: `1px solid ${loading ? '#161616' : '#1c1c1c'}`,
                      overflow: 'hidden', position: 'relative', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    }}>
                      {loading
                        ? <div className="skeleton-shimmer" style={{ width: '100%', paddingBottom: '133%' }} />
                        : <img key={src} src={src} alt={label} style={{ width: '100%', height: 'auto', display: 'block' }} />
                      }
                      {/* Label badge — click to rename */}
                      <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                        {renamingPanel?.charIdx === charIdx && renamingPanel?.imgIdx === i ? (
                          <input
                            autoFocus
                            defaultValue={label}
                            onBlur={e => handleRenameLabel(charIdx, i, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameLabel(charIdx, i, e.target.value);
                              if (e.key === 'Escape') setRenamingPanel(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'rgba(0,0,0,0.92)', border: '1px solid #00B8D4', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '9px', fontWeight: 800, outline: 'none', width: '110px', letterSpacing: '0.06em' }}
                          />
                        ) : (
                          <div
                            onClick={() => !loading && charIdx >= 0 && setRenamingPanel({ charIdx, imgIdx: i })}
                            title={charIdx >= 0 ? 'Click to rename' : ''}
                            style={{ padding: '4px 9px', background: 'rgba(0,0,0,0.7)', borderRadius: '6px', fontSize: '9px', color: loading ? '#2a2a2a' : '#bbb', backdropFilter: 'blur(8px)', fontWeight: 800, border: '1px solid rgba(255,255,255,0.05)', cursor: charIdx >= 0 ? 'text' : 'default', whiteSpace: 'nowrap' }}
                          >
                            {label.toUpperCase()}
                          </div>
                        )}
                      </div>
                      {/* Delete button (top-left, visible on hover) */}
                      {!loading && charIdx >= 0 && (
                        <button
                          className="img-card-delete"
                          onClick={() => handleDeleteImage(charIdx, i)}
                          style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,40,40,0.85)', border: 'none', color: '#fff', borderRadius: '6px', width: '26px', height: '26px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      )}
                      {/* Action buttons (visible on hover) */}
                      {!loading && charIdx >= 0 && (
                        <div className="img-card-actions" style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                          {/* Re-crop from original sheet */}
                          {activeChar?.sheetUrl && (
                            <button
                              onClick={() => setZoomCropTarget({
                                charIdx, imgIdx: i, url: activeChar.sheetUrl, label,
                                initialBox: typeof img === 'object' ? img.box_2d : null,
                                showLabelInput: true,
                              })}
                              style={{ background: 'rgba(0,184,212,0.85)', border: 'none', color: '#000', borderRadius: '8px', padding: '6px 10px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}
                            >
                              ✂ RE-CROP
                            </button>
                          )}
                          {/* Zoom / free-crop on the already-cropped image */}
                          <button
                            onClick={() => setZoomCropTarget({ charIdx, imgIdx: i, url: src, label })}
                            style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc', borderRadius: '8px', padding: '6px 10px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
                          >
                            ⤢ ZOOM / CROP
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #161616', borderRadius: '28px' }}>
                <div style={{ fontSize: '44px', marginBottom: '18px', filter: 'grayscale(1) opacity(0.2)' }}>🎭</div>
                <h3 style={{ color: '#2e2e2e', fontSize: '17px', fontWeight: 700 }}>No images yet</h3>
                <p style={{ color: '#232323', fontSize: '13px', marginTop: '6px' }}>Upload a character sheet or generate with AI.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '440px', background: '#0e0e0e', border: '1px solid #222', borderRadius: '24px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Generate Character</div>
            <div style={{ color: '#3a3a3a', fontSize: '12px', marginBottom: '22px' }}>Generates a 9-panel 21:9 reference sheet, then splits and refines each panel.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.1em', display: 'block', marginBottom: '7px' }}>CHARACTER NAME</label>
                <input type="text" placeholder="e.g. VIKRAM" value={createName} onChange={e => setCreateName(e.target.value)}
                  style={{ width: '100%', padding: '13px', border: '1px solid #222', borderRadius: '11px', background: '#0a0a0a', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.1em', display: 'block', marginBottom: '7px' }}>CHARACTER DESCRIPTION</label>
                <textarea placeholder="Ancient Indian warrior, 40s, grey beard, dark red dhoti, gold jewellery..." value={createDesc} onChange={e => setCreateDesc(e.target.value)}
                  style={{ width: '100%', minHeight: '100px', padding: '13px', border: '1px solid #222', borderRadius: '11px', background: '#0a0a0a', color: '#fff', fontSize: '13px', resize: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
              </div>

              {/* Reference image */}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.1em', display: 'block', marginBottom: '7px' }}>
                  REFERENCE IMAGE <span style={{ color: '#444', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(optional — locks character appearance)</span>
                </label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '11px' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#bbb', fontSize: '11px', fontWeight: 700 }}>Reference uploaded</div>
                      <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>All angles will match this character</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', color: '#ff6666', borderRadius: '7px', padding: '5px 9px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✕ REMOVE</button>
                  </div>
                ) : (
                  <button onClick={() => refFileInputRef.current.click()}
                    style={{ width: '100%', padding: '11px', borderRadius: '10px', background: 'transparent', border: '1px dashed #252525', color: '#555', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    + Upload Reference Image
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {PANEL_LABELS.map(label => (
                  <span key={label} style={{ fontSize: '10px', padding: '3px 9px', borderRadius: '20px', background: 'rgba(0,184,212,0.07)', color: 'var(--teal)', border: '1px solid rgba(0,184,212,0.12)' }}>{label}</span>
                ))}
              </div>
              <button className="btn-orange" style={{ width: '100%', padding: '14px', borderRadius: '11px', fontWeight: 700, fontSize: '13px' }} onClick={handleGenerateAngles}>
                ✨ GENERATE 9-PANEL SHEET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && activeChar && (
        <div className="auth-overlay" onClick={() => setShowEditModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '440px', background: '#0e0e0e', border: '1px solid #222', borderRadius: '24px' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowEditModal(false)}>×</button>
            <div style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, marginBottom: '22px' }}>Edit Character</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.1em', display: 'block', marginBottom: '7px' }}>NAME</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  style={{ width: '100%', padding: '13px', border: '1px solid #222', borderRadius: '11px', background: '#0a0a0a', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.1em', display: 'block', marginBottom: '7px' }}>DESCRIPTION</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  style={{ width: '100%', minHeight: '80px', padding: '13px', border: '1px solid #222', borderRadius: '11px', background: '#0a0a0a', color: '#fff', fontSize: '13px', resize: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ borderTop: '1px solid #181818', paddingTop: '16px' }}>
                <label style={{ fontSize: '10px', fontWeight: 800, color: '#333', letterSpacing: '0.1em', display: 'block', marginBottom: '8px' }}>REPLACE IMAGES</label>
                <button onClick={() => { setShowEditModal(false); fileInputRef.current.click(); }}
                  style={{ width: '100%', padding: '11px', borderRadius: '10px', background: 'transparent', border: '1px solid #252525', color: '#555', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  📁 Upload New Character Sheet
                </button>
              </div>
              <button className="btn-teal" style={{ width: '100%', padding: '14px', borderRadius: '11px', fontWeight: 700, fontSize: '13px' }} onClick={handleEditSave}>
                SAVE CHANGES
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
          initialBox={zoomCropTarget.initialBox || null}
          showLabelInput={zoomCropTarget.showLabelInput || false}
        />
      )}

      {/* ── Sheet Crop Choice Modal ── */}
      {showSheetCropModal && sheetPreviewUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={handleCloseSheetCropModal}>
          <div style={{ background: '#0c0c0c', width: '100%', maxWidth: '520px', borderRadius: '16px', border: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={handleCloseSheetCropModal} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#555', fontSize: '20px', cursor: 'pointer', zIndex: 10 }}>✕</button>
            <div style={{ padding: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--teal)' }} />
                <span style={{ color: 'var(--teal)', fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em' }}>CROP SELECTION</span>
              </div>
              <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>How would you like to crop?</h3>
              <p style={{ color: '#555', fontSize: '12px', marginBottom: '24px', lineHeight: 1.5 }}>Our AI can automatically detect and refine 9+ character poses from your sheet, or you can do it yourself.</p>
              
              <div style={{ width: '100%', height: '280px', background: '#080808', borderRadius: '12px', overflow: 'hidden', border: '1px solid #151515', marginBottom: '28px' }}>
                <img src={sheetPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Preview" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  onClick={() => processSheetFile(pendingSheetFile)} 
                  style={{ ...MODAL_BTN, background: '#00B8D4', color: '#000', border: 'none', padding: '18px', borderRadius: '14px', fontSize: '13px', fontWeight: 800 }}
                >
                  ✨ CROP WITH AI (AUTO-DETECT)
                </button>
                <div style={{ position: 'relative' }}>
                  <button disabled style={{ ...MODAL_BTN, opacity: 0.45, width: '100%', padding: '18px', borderRadius: '14px', fontSize: '13px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    ✂ CROP MANUALLY
                  </button>
                  <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: '#1a1a1a', color: '#444', fontSize: '9px', fontWeight: 900, padding: '3px 8px', borderRadius: '5px', letterSpacing: '0.06em' }}>COMING SOON</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
