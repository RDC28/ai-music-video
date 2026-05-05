'use client';

import { useEffect, useRef } from 'react';
import { drawClubScene } from '@/utils/drawClubScene';

export default function VideosScreen({ onNavigate, isActive, projectData, onDataUpdate }) {
  const canvasRefs = useRef([]);

  const shots = projectData?.shot_list || [];

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) drawClubScene(canvas, i * 5 + 2);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, shots]);

  const handleApproveAll = async () => {
    if (onDataUpdate) {
      await onDataUpdate({
        videos_approved: true,
        current_step: 10
      });
    }
    onNavigate(10);
  };

  const videoShots = shots.slice(0, Math.max(shots.length, 4));

  return (
    <div className="screen active" id="s7">

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
            Generate Videos
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Generate and review AI video clips for each shot
          </p>
        </div>
        <button
          className="btn-teal"
          onClick={handleApproveAll}
          style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          Approve All
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7"/>
          </svg>
        </button>
      </div>

      {/* Video grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {videoShots.length > 0 ? (
          <div id="vidGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {videoShots.map((shot, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Thumbnail */}
                <div style={{ position: 'relative', background: '#0a0010' }}>
                  <canvas
                    ref={(el) => (canvasRefs.current[i] = el)}
                    width={560}
                    height={315}
                    style={{ width: '100%', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.2)',
                  }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)',
                      border: '1.5px solid rgba(255,255,255,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '14px',
                      backdropFilter: 'blur(4px)',
                    }}>▶</div>
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  <div style={{ fontSize: '12px', fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--dark)' }}>
                    Shot {i + 1}{shot.n ? ` — ${shot.n}` : ''}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {(shot.p || shot.prompt || 'No prompt').substring(0, 100)}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' }}>
                    <button className="btn-outline" style={{ fontSize: '10px', padding: '5px 10px' }}>
                      Change Prompt
                    </button>
                    <button className="btn-outline" style={{ fontSize: '10px', padding: '5px 10px' }}>
                      Change Model
                    </button>
                    <button
                      className="btn-orange"
                      style={{ fontSize: '10px', padding: '5px 10px' }}
                      onClick={() => alert("Video generation requires the Gemini/Veo API key to be configured.")}
                    >
                      Re-generate
                    </button>
                  </div>

                  <button
                    className="btn-teal"
                    style={{
                      fontSize: '11px',
                      padding: '7px 16px',
                      opacity: shot.video_url ? 1 : 0.4,
                      cursor: shot.video_url ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!shot.video_url}
                    onClick={() => {
                      if (shot.video_url) {
                        const a = document.createElement('a');
                        a.href = shot.video_url;
                        a.download = `shot_${i + 1}.mp4`;
                        a.click();
                      }
                    }}
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px', padding: '80px 40px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No shots to display. Please add shots in the Shot List step first.
            </div>
            <button className="btn-outline" onClick={() => onNavigate(7)} style={{ fontSize: '12px' }}>
              ← Back to Shot List
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
