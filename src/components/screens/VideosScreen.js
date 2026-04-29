'use client';

import { useEffect, useRef } from 'react';
import { shots } from '@/data/shots';
import { drawClubScene } from '@/utils/drawClubScene';

export default function VideosScreen({ onNavigate, isActive }) {
  const canvasRefs = useRef([]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) drawClubScene(canvas, i * 5 + 2);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive]);

  const videoShots = shots.slice(0, 4);

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
        <button className="btn-approve" onClick={() => onNavigate(10)}>
          APPROVE ALL
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7"></path>
          </svg>
        </button>
      </div>

      <div className="vid-layout" id="vidGrid">
        {videoShots.map((shot, i) => (
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
              PROMPT: {shot.p.substring(0, 80)}...
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
              }}
            >
              DOWNLOAD
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
