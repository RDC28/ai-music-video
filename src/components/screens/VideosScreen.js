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

  // Use first 4 shots or all if less
  const videoShots = shots.slice(0, Math.max(shots.length, 4));

  return (
    <div className="screen active" id="s7">

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
        <button className="btn-approve" onClick={handleApproveAll}>
          APPROVE ALL
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7"></path>
          </svg>
        </button>
      </div>

      <div className="vid-layout" id="vidGrid">
        {videoShots.length > 0 ? (
          videoShots.map((shot, i) => (
            <div key={i} className="vid-card">
              <div className="vid-thumb">
                <canvas
                  ref={(el) => (canvasRefs.current[i] = el)}
                  width={560}
                  height={315}
                />
                <div className="play-overlay">
                  <div className="play-btn">▶</div>
                </div>
              </div>
              <div className="prompt-box">
                PROMPT: {(shot.p || shot.prompt || "No prompt").substring(0, 80)}...
              </div>
              <div className="vid-btn-row">
                <button
                  className="btn-outline"
                  style={{ fontSize: '10px', padding: '6px 12px' }}
                >
                  CHANGE PROMPT
                </button>
                <button
                  className="btn-outline"
                  style={{ fontSize: '10px', padding: '6px 12px' }}
                >
                  CHANGE MODEL
                </button>
                <button
                  className="btn-orange"
                  style={{ fontSize: '10px', padding: '6px 12px' }}
                  onClick={() => alert("Video generation requires the Gemini/Veo API key to be configured.")}
                >
                  RE-GENERATE
                </button>
              </div>
              <button
                className="btn-teal"
                style={{
                  fontSize: '11px',
                  padding: '8px 20px',
                  alignSelf: 'flex-start',
                  opacity: shot.video_url ? 1 : 0.5,
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
                DOWNLOAD
              </button>
            </div>
          ))
        ) : (
          <div style={{ padding: '100px', textAlign: 'center', color: '#666', width: '100%', gridColumn: '1 / -1' }}>
            No shots generated yet. Please go back to the Shot List screen to add shots first.
          </div>
        )}
      </div>
    </div>
  );
}
