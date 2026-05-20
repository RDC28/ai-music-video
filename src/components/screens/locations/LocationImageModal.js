'use client';

import { useState, useRef, useEffect } from 'react';
import { MODAL_BTN, _renderedRect } from './locationConstants';

export default function LocationImageModal({ imageUrl, label, onClose, onApply, onDelete, initialBox, showLabelInput, recropUrl, recropBox }) {
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
