'use client';

import { useEffect, useRef } from 'react';
import TopBar from '../TopBar';
import { shots } from '@/data/shots';
import { drawClubScene } from '@/utils/drawClubScene';

export default function ImagesScreen({ onNavigate, isActive }) {
  const canvasRefs = useRef([]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas) drawClubScene(canvas, i * 3 + 7);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive]);

  return (
    <div className="screen active" id="s6">
      <TopBar left="PRATEEK" right="MUSIC VIDEO" />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '0 28px',
          margin: '8px 0',
        }}
      >
        <button
          className="btn-orange"
          style={{ fontSize: '12px', padding: '10px 20px' }}
        >
          IMAGES
        </button>
        <button
          className="btn-teal"
          onClick={() => onNavigate(8)}
          style={{ marginLeft: 'auto', fontSize: '11px', padding: '10px 20px' }}
        >
          APPROVE ALL
        </button>
      </div>

      <div className="img-layout" id="imgList">
        {shots.map((shot, i) => (
          <div key={i} className="img-item">
            <div className="img-info">
              <div className="shot-title">{shot.n}</div>
              <div className="shot-prompt">
                &quot;{shot.p.substring(0, 120)}...&quot;
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
              }}
              onClick={() => onNavigate(8)}
            >
              EDIT &amp; GENERATE
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
