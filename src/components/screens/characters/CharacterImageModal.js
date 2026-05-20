'use client';

import { useState, useRef, useEffect } from 'react';
import { MODAL_BTN } from './characterConstants';

export default function CharacterImageModal({ imageUrl, label, onClose, onDelete }) {
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
