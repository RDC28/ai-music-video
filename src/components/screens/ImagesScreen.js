'use client';

import { useEffect, useRef, useState } from 'react';
import { drawClubScene } from '@/utils/drawClubScene';

export default function ImagesScreen({ onNavigate, isActive, projectData, onDataUpdate }) {
  const canvasRefs = useRef([]);
  const modalCanvasRef = useRef(null);
  const [editModalIndex, setEditModalIndex] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  
  // Use props data or fallback to empty array
  const shots = projectData || [];

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) {
          // If we have a real image URL, we would draw it here
          // For now, using the generative placeholder logic
          drawClubScene(canvas, i * 3 + 7);
        }
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
    // In a real flow, this would mark all shots as "image_ready"
    // and save any final prompts/metadata to the project state.
    await onDataUpdate({
      images_approved: true,
      current_step: 9
    });
    setIsApproving(false);
    onNavigate(9);
  };

  return (
    <div className="screen active" id="s6" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      
      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            position: 'sticky',
            top: '64px',
            zIndex: 10,
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '8px 28px',
            paddingTop: '16px',
            background: 'var(--cream)',
            margin: '0 0 12px 0'
          }}
        >
          <button 
            className="btn-approve" 
            onClick={handleApproveAll}
            disabled={isApproving}
          >
            {isApproving ? 'SAVING...' : 'APPROVE ALL'}
            {!isApproving && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"></path>
              </svg>
            )}
          </button>
        </div>

        <div className="img-layout" id="imgList">
          {shots.length > 0 ? shots.map((shot, i) => (
            <div 
              key={i} 
              className="img-item"
              style={{
                background: editModalIndex === i ? 'rgba(61, 140, 122, 0.08)' : 'transparent',
                borderLeft: editModalIndex === i ? '4px solid var(--teal)' : '4px solid transparent',
                paddingLeft: '16px',
                paddingRight: '16px',
                borderRadius: editModalIndex === i ? '0 12px 12px 0' : '0',
                transition: 'all 0.2s ease',
                borderBottomColor: editModalIndex === i ? 'transparent' : 'var(--border)'
              }}
            >
              <div className="img-info">
                <div className="shot-title" style={{ color: editModalIndex === i ? 'var(--teal)' : 'var(--dark)' }}>
                  {i + 1}. {shot.n || shot.title || `Shot ${i+1}`}
                </div>
                <div className="shot-prompt">
                  &quot;{(shot.p || shot.prompt || "No prompt available").substring(0, 120)}...&quot;
                </div>
              </div>
              <div className="img-thumb">
                <canvas
                  ref={(el) => (canvasRefs.current[i] = el)}
                  width={240}
                  height={140}
                />
              </div>
              <button
                className="btn-teal"
                style={{
                  fontSize: '10px',
                  padding: '7px 14px',
                  whiteSpace: 'nowrap',
                  opacity: editModalIndex === i ? 0.5 : 1,
                  cursor: editModalIndex === i ? 'default' : 'pointer'
                }}
                onClick={() => setEditModalIndex(i)}
              >
                {editModalIndex === i ? 'EDITING...' : 'EDIT & GENERATE'}
              </button>
            </div>
          )) : (
            <div style={{ padding: '100px', textAlign: 'center', color: '#666', width: '100%' }}>
              No shots generated yet. Please go back to the Script screen.
            </div>
          )}
        </div>
      </div>

      {/* Side Panel */}
      {editModalIndex !== null && (
        <div style={{
          position: 'sticky',
          top: '90px',
          width: '450px',
          height: 'calc(100vh - 114px)',
          background: 'var(--card)',
          border: '2px solid var(--border)',
          borderRight: 'none',
          borderRadius: '24px 0 0 24px',
          boxShadow: '-8px 0 24px rgba(42, 38, 34, 0.05)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0
        }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div className="card-title" style={{ border: 'none', padding: 0, margin: 0 }}>Edit &amp; Generate Image</div>
            <button className="auth-close" style={{ position: 'static' }} onClick={() => setEditModalIndex(null)}>×</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>
                  CURRENT IMAGE
                </label>
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border)', aspectRatio: '16/9', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#111' }}>
                  <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>
                  NEW PREVIEW
                </label>
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px dashed var(--teal)', aspectRatio: '16/9', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(61, 140, 122, 0.05)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 600 }}>Not generated yet</span>
                </div>
              </div>
            </div>

            <div style={{ height: '2px', background: 'var(--border)', width: '100%', margin: '4px 0' }}></div>

            <label style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)', letterSpacing: '0.05em' }}>
              REPLACE WITH
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)' }}>
                  1. UPLOAD YOUR OWN
                </label>
                <div style={{ border: '2px dashed var(--border)', borderRadius: '12px', background: 'rgba(42,38,34,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '24px', cursor: 'pointer', minHeight: '100px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)' }}>Browse Files</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: 'var(--dark)' }}>
                  2. GENERATE WITH PROMPT
                </label>
                <textarea 
                  defaultValue={shots[editModalIndex]?.p || shots[editModalIndex]?.prompt || ""} 
                  style={{ width: '100%', padding: '12px', border: '2px solid var(--border)', borderRadius: '12px', fontFamily: 'var(--font-body)', fontSize: '12px', resize: 'none', outline: 'none', minHeight: '120px' }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
                <button className="btn-orange" style={{ width: '100%', fontSize: '12px', padding: '10px' }}>
                  Generate New
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
