'use client';

import { useEffect, useRef, useState } from 'react';
import { shots } from '@/data/shots';
import { drawClubScene } from '@/utils/drawClubScene';

export default function AssembleScreen({ onNavigate, isActive }) {
  const canvasRefs = useRef([]);
  const previewCanvasRef = useRef(null);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) drawClubScene(canvas, i * 2 + 1);
      });
      if (previewCanvasRef.current) {
        drawClubScene(previewCanvasRef.current, 1);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive]);

  return (
    <div className="screen active" id="s8" style={{ height: 'calc(100vh - 150px)', overflow: 'hidden', flexDirection: 'row' }}>

      <div className="editor-layout" style={{ height: '100%', paddingBottom: '10px', flex: 1, minWidth: 0 }}>
        {/* Left Panel: Clips Library */}
        <div className="editor-sidebar">
          <div className="sidebar-title">GENERATED CLIPS</div>
          <div className="clips-grid">
            {shots.map((_, i) => (
              <div key={i} className="clip-thumb-sm">
                <canvas
                  ref={(el) => (canvasRefs.current[i] = el)}
                  width={160}
                  height={90}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Main Panel: Player & Timeline */}
        <div className="editor-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Preview Player */}
          <div className="player-preview" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#1a0a1a', borderRadius: '12px', overflow: 'hidden' }}>
            <canvas ref={previewCanvasRef} width={800} height={450} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>

          {/* Controls */}
          <div className="playback-controls">
            <span>0:00</span>
            <button className="btn-outline" style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
              ▶
            </button>
            <span>0:05</span>
          </div>

          {/* Timeline Area */}
          <div className="timeline-container">
            <div className="time-ruler">
              <span>| 0s</span>
              <span>| 10s</span>
              <span>| 20s</span>
              <span>| 30s</span>
              <span>| 40s</span>
              <span>| 50s</span>
              <span>| 1:00</span>
              <span>| 1:10</span>
              <span>| 1:20</span>
              <span>| 1:30</span>
            </div>
            
            <div className="video-track">
              {/* Fake dropped clips for demo */}
              <div className="track-clip" style={{ width: '120px' }}></div>
              <div className="track-clip" style={{ width: '90px' }}></div>
              <div className="track-clip" style={{ width: '150px' }}></div>
            </div>
            
            <div className="audio-track">
              🎵 Uploaded_Audio_Track.mp3
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
             <button className="btn-teal" onClick={() => setShowExport(true)}>
               EXPORT VIDEO
             </button>
          </div>
        </div>
      </div>

      {/* Export Side Panel */}
      {showExport && (
        <div style={{
          width: '320px',
          height: '100%',
          background: 'var(--card)',
          border: '2px solid var(--border)',
          borderRight: 'none',
          borderRadius: '24px 0 0 24px',
          boxShadow: '-8px 0 24px rgba(42, 38, 34, 0.05)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0
        }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
            <div className="card-title" style={{ border: 'none', padding: 0, margin: 0, fontSize: '16px' }}>Export Settings</div>
            <button className="auth-close" style={{ position: 'static' }} onClick={() => setShowExport(false)}>×</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>

            {/* Resolution */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>RESOLUTION</label>
              <select defaultValue="1920 × 1080 (1080p)" style={{
                width: '100%', padding: '10px 14px', border: '2px solid var(--border)', borderRadius: '12px',
                fontFamily: 'var(--font-body)', fontSize: '13px', outline: 'none', background: 'var(--cream)',
                cursor: 'pointer', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'%232A2622\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center'
              }}>
                <option>3840 × 2160 (4K)</option>
                <option>1920 × 1080 (1080p)</option>
                <option>1280 × 720 (720p)</option>
                <option>854 × 480 (480p)</option>
              </select>
            </div>

            {/* Frame Rate */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>FRAME RATE</label>
              <select defaultValue="24 fps" style={{
                width: '100%', padding: '10px 14px', border: '2px solid var(--border)', borderRadius: '12px',
                fontFamily: 'var(--font-body)', fontSize: '13px', outline: 'none', background: 'var(--cream)',
                cursor: 'pointer', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'%232A2622\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center'
              }}>
                <option>24 fps</option>
                <option>30 fps</option>
                <option>60 fps</option>
              </select>
            </div>

            {/* Codec */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>CODEC</label>
              <select defaultValue="H.264 (MP4)" style={{
                width: '100%', padding: '10px 14px', border: '2px solid var(--border)', borderRadius: '12px',
                fontFamily: 'var(--font-body)', fontSize: '13px', outline: 'none', background: 'var(--cream)',
                cursor: 'pointer', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'%232A2622\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center'
              }}>
                <option>H.264 (MP4)</option>
                <option>H.265 / HEVC</option>
                <option>ProRes 422</option>
                <option>VP9 (WebM)</option>
              </select>
            </div>

            {/* Format */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>FORMAT</label>
              <select defaultValue=".mp4" style={{
                width: '100%', padding: '10px 14px', border: '2px solid var(--border)', borderRadius: '12px',
                fontFamily: 'var(--font-body)', fontSize: '13px', outline: 'none', background: 'var(--cream)',
                cursor: 'pointer', appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'%232A2622\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center'
              }}>
                <option>.mp4</option>
                <option>.mov</option>
                <option>.webm</option>
                <option>.avi</option>
              </select>
            </div>

            {/* Estimated Size */}
            <div style={{ background: 'rgba(42, 38, 34, 0.04)', borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.05em' }}>EST. FILE SIZE</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)' }}>~24 MB</span>
            </div>

          </div>

          {/* Export Button */}
          <button className="btn-orange" style={{ width: '100%', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export &amp; Download
          </button>
        </div>
      )}

    </div>
  );
}
