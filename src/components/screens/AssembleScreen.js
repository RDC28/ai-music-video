'use client';

import { useEffect, useRef, useState } from 'react';
import TopBar from '../TopBar';
import { shots } from '@/data/shots';
import { drawClubScene } from '@/utils/drawClubScene';

export default function AssembleScreen({ onNavigate, isActive }) {
  const canvasRefs = useRef([]);
  const [assembling, setAssembling] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) drawClubScene(canvas, i * 2 + 1);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startAssemble = () => {
    setAssembling(true);
    setProgress(0);
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(intervalRef.current);
          return 100;
        }
        return prev + 2;
      });
    }, 60);
  };

  return (
    <div className="screen active" id="s8">
      <TopBar left="PRATEEK" right="MUSIC VIDEO" />

      <div className="assemble-content">
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#999',
          }}
        >
          ALL CLIPS READY
        </div>

        <div className="clip-strip" id="clipStrip">
          {shots.map((_, i) => (
            <div key={i} className="clip-thumb">
              <canvas
                ref={(el) => (canvasRefs.current[i] = el)}
                width={200}
                height={120}
              />
              <div className="clip-num">{i + 1}</div>
            </div>
          ))}
        </div>

        <div
          className="progress-bar"
          id="progressBar"
          style={{ display: assembling ? 'block' : 'none' }}
        >
          <div
            className="progress-fill"
            id="progressFill"
            style={{
              width: `${progress}%`,
              background: progress >= 100 ? 'var(--teal)' : 'var(--orange)',
            }}
          />
        </div>

        <button
          className="btn-orange"
          style={{ fontSize: '16px', padding: '16px 48px' }}
          onClick={startAssemble}
        >
          Assemble
        </button>

        <button
          className="btn-teal"
          style={{ fontSize: '13px', padding: '12px 32px' }}
          id="dlAllBtn"
          onClick={() => onNavigate(1)}
        >
          DOWNLOAD ALL CLIPS
        </button>

        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '8px' }}>
          Google Veo · 10 clips · ~4.2GB
        </div>
      </div>
    </div>
  );
}
