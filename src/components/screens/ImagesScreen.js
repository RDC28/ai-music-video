'use client';

import { useEffect, useRef, useState } from 'react';
import { drawClubScene } from '@/utils/drawClubScene';

export default function ImagesScreen({ onNavigate, isActive, projectData, onDataUpdate }) {
  const canvasRefs = useRef([]);
  const modalCanvasRef = useRef(null);
  const [editModalIndex, setEditModalIndex] = useState(null);
  const [isApproving, setIsApproving] = useState(false);

  const shots = projectData || [];

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) drawClubScene(canvas, i * 3 + 7);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, shots]);

  useEffect(() => {
    if (editModalIndex !== null && modalCanvasRef.current) {
      drawClubScene(modalCanvasRef.current, editModalIndex * 3 + 7);
    }
  }, [editModalIndex]);

  const handleApproveAll = async () => {
    setIsApproving(true);
    await onDataUpdate({
      images_approved: true,
      current_step: 9
    });
    setIsApproving(false);
    onNavigate(9);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--border-mid)',
    borderRadius: '8px',
    background: 'var(--surface)',
    color: 'var(--dark)',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
    resize: 'none',
  };

  return (
    <div className="screen active" id="s6" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>

        {/* Page Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
              Generate Images
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Review and generate AI images for each shot in your list
            </p>
          </div>
          <button
            className="btn-teal"
            onClick={handleApproveAll}
            disabled={isApproving}
            style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
          >
            {isApproving ? 'Saving...' : 'Approve All'}
            {!isApproving && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            )}
          </button>
        </div>

        {/* Shot image list */}
        <div id="imgList" style={{ flex: 1, overflowY: 'auto' }}>
          {shots.length > 0 ? shots.map((shot, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 28px',
                borderBottom: '1px solid var(--border)',
                background: editModalIndex === i ? 'rgba(0,184,212,0.04)' : 'transparent',
                borderLeft: `3px solid ${editModalIndex === i ? 'var(--teal)' : 'transparent'}`,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: editModalIndex === i ? 'var(--teal)' : 'var(--dark)',
                  marginBottom: '4px',
                  letterSpacing: '-0.01em',
                }}>
                  {i + 1}. {shot.n || shot.title || `Shot ${i + 1}`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  &quot;{(shot.p || shot.prompt || 'No prompt available').substring(0, 120)}...&quot;
                </div>
              </div>

              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                <canvas
                  ref={(el) => (canvasRefs.current[i] = el)}
                  width={240}
                  height={140}
                  style={{ display: 'block' }}
                />
              </div>

              <button
                className="btn-outline"
                style={{
                  fontSize: '11px',
                  padding: '6px 14px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: editModalIndex === i ? 0.4 : 1,
                  cursor: editModalIndex === i ? 'default' : 'pointer',
                }}
                onClick={() => setEditModalIndex(i)}
              >
                {editModalIndex === i ? 'Editing...' : 'Edit & Generate'}
              </button>
            </div>
          )) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No shots generated yet.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(6)} style={{ fontSize: '12px' }}>
                ← Go Back to Shot List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Side Panel */}
      {editModalIndex !== null && (
        <div style={{
          position: 'sticky',
          top: 0,
          width: '440px',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border-mid)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>
              Edit &amp; Generate Image
            </div>
            <button
              onClick={() => setEditModalIndex(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                  Current
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/9', background: 'var(--surface)' }}>
                  <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                  New Preview
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(0,184,212,0.25)', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,184,212,0.04)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 600 }}>Not generated yet</span>
                </div>
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border)' }} />

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
              Replace With
            </div>

            {/* Upload own */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                1. Upload Your Own
              </div>
              <div style={{
                border: '1px dashed var(--border-mid)',
                borderRadius: '8px',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '20px',
                cursor: 'pointer',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Browse Files</span>
              </div>
            </div>

            {/* Generate with prompt */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                2. Generate with Prompt
              </div>
              <textarea
                defaultValue={shots[editModalIndex]?.p || shots[editModalIndex]?.prompt || ''}
                style={{ ...inputStyle, minHeight: '100px' }}
                onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
              />
              <button className="btn-orange" style={{ width: '100%', fontSize: '12px', padding: '10px', marginTop: '8px' }}>
                Generate New
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
