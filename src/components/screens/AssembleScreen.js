'use client';

import { useEffect, useRef, useState } from 'react';
import { drawClubScene } from '@/utils/drawClubScene';

export default function AssembleScreen({ onNavigate, isActive, audioUrl, projectData }) {
  const canvasRefs = useRef([]);
  const previewCanvasRef = useRef(null);
  const audioRef = useRef(null);
  const timelineRef = useRef(null);

  const [showExport, setShowExport] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(10);

  const shots = projectData?.shot_list || Array.from({ length: 10 });

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

  useEffect(() => {
    let interval;
    if (isPlaying && audioRef.current) {
      interval = setInterval(() => {
        setCurrentTime(audioRef.current.currentTime);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); }
    else { audioRef.current.play(); }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const timelineContainer = timelineRef.current?.parentElement;
    if (!timelineContainer) return;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -2 : 2;
        setZoom(prev => Math.min(Math.max(prev + delta, 2), 100));
      }
    };

    let initialDist = 0;
    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        initialDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        const delta = (dist - initialDist) / 10;
        setZoom(prev => Math.min(Math.max(prev + delta, 2), 100));
        initialDist = dist;
      }
    };

    timelineContainer.addEventListener('wheel', handleWheel, { passive: false });
    timelineContainer.addEventListener('touchstart', handleTouchStart);
    timelineContainer.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      timelineContainer.removeEventListener('wheel', handleWheel);
      timelineContainer.removeEventListener('touchstart', handleTouchStart);
      timelineContainer.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const handleSeek = (e) => {
    if (!timelineRef.current || !audioRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 20;
    const seekTime = Math.min(Math.max(x / zoom, 0), duration);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleMouseDown = (e) => {
    handleSeek(e);
    const onMouseMove = (moveEvent) => handleSeek(moveEvent);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const audioFileName = audioUrl ? audioUrl.split('/').pop().split('-').slice(1).join('-') : 'No Audio Loaded';

  const timelineWidth = Math.max((duration || 60) * zoom, 800);
  const playheadPosition = currentTime * zoom;

  return (
    <div className="screen active" id="s8" style={{ height: 'calc(100vh - 150px)', overflow: 'hidden', flexDirection: 'row', width: '100%' }}>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="editor-layout" style={{ height: '100%', paddingBottom: '10px', flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>

        {/* Left Panel: Clips Library */}
        <div className="editor-sidebar" style={{ width: '220px', flexShrink: 0 }}>
          <div className="sidebar-title">Generated Clips</div>
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

        {/* Main Panel */}
        <div className="editor-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Preview Player */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#080010', borderRadius: '10px', overflow: 'hidden', margin: '8px 10px 0' }}>
            <canvas ref={previewCanvasRef} width={800} height={450} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>

          {/* Playback Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '8px 20px',
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            width: '100%',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '40px', color: 'var(--dark)', fontFamily: 'monospace' }}>{formatTime(currentTime)}</span>
              <button
                onClick={togglePlay}
                style={{
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  background: isPlaying ? 'var(--orange)' : 'var(--surface)',
                  color: isPlaying ? '#0A0A0A' : 'var(--dark)',
                  border: '1px solid var(--border-mid)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '40px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{formatTime(duration)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
              <button
                onClick={() => setZoom(prev => Math.max(prev - 2, 2))}
                style={{
                  padding: '4px 10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid var(--border-mid)',
                  background: 'transparent',
                  color: 'var(--dark)',
                  cursor: 'pointer',
                }}
              >−</button>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', minWidth: '40px', textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
                Zoom
              </span>
              <button
                onClick={() => setZoom(prev => Math.min(prev + 5, 100))}
                style={{
                  padding: '4px 10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid var(--border-mid)',
                  background: 'transparent',
                  color: 'var(--dark)',
                  cursor: 'pointer',
                }}
              >+</button>
            </div>
          </div>

          {/* Timeline Container */}
          <div style={{ width: '100%', overflowX: 'auto', overflowY: 'auto', background: 'var(--bg)', padding: '0', borderTop: '1px solid var(--border)', flex: '0 1 130px' }}>
            <div
              ref={timelineRef}
              onMouseDown={handleMouseDown}
              style={{
                width: `${timelineWidth}px`,
                minHeight: '100%',
                position: 'relative',
                padding: '0 20px 20px 20px',
                boxSizing: 'content-box',
                cursor: 'pointer',
              }}
            >
              {/* Time Ruler */}
              <div style={{
                display: 'flex',
                position: 'sticky',
                top: 0,
                width: '100%',
                height: '24px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--card)',
                zIndex: 5,
                pointerEvents: 'none',
                marginLeft: '-20px',
                marginRight: '-20px',
                paddingLeft: '20px',
                paddingRight: '20px',
                boxSizing: 'content-box',
              }}>
                {Array.from({ length: Math.ceil(duration / 10) + 1 }).map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${(i * 10 * zoom) + 20}px`,
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    paddingLeft: '6px',
                    borderLeft: '1px solid rgba(255,255,255,0.07)',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'monospace',
                  }}>
                    {Math.floor(i * 10 / 60)}:{(i * 10 % 60).toString().padStart(2, '0')}
                  </div>
                ))}
              </div>

              {/* Video Track */}
              <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.03)', height: '50px', position: 'relative', borderRadius: '4px', border: '1px dashed rgba(255,255,255,0.08)' }}>
                {shots.map((shot, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${(shot?.duration || 5) * zoom}px`,
                      height: '34px',
                      top: '8px',
                      position: 'relative',
                      display: 'inline-block',
                      marginRight: '1px',
                      background: 'var(--teal)',
                      opacity: 0.85,
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  />
                ))}
              </div>

              {/* Audio Track */}
              <div style={{
                width: `${duration * zoom}px`,
                background: 'linear-gradient(90deg, var(--orange), rgba(0,229,255,0.7))',
                color: '#0A0A0A',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
                borderRadius: '6px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-display)' }}>{audioFileName}</span>
              </div>

              {/* Playhead */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: `${playheadPosition + 20}px`,
                width: '2px',
                height: '100%',
                background: 'var(--teal)',
                zIndex: 10,
                pointerEvents: 'none',
              }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  background: 'var(--teal)',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '20px',
                  left: '-4px',
                  border: '1.5px solid rgba(0,0,0,0.5)',
                }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0, margin: '8px 10px' }}>
            <button className="btn-teal" style={{ padding: '7px 16px', fontSize: '12px' }} onClick={() => setShowExport(true)}>
              Export Video
            </button>
          </div>
        </div>
      </div>

      {/* Export Panel */}
      {showExport && (
        <div style={{
          width: '300px',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border-mid)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>Export Settings</div>
            <button
              onClick={() => setShowExport(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '2px 6px',
              }}
            >×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                Resolution
              </label>
              <select
                defaultValue="1920 × 1080 (1080p)"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid var(--border-mid)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  outline: 'none',
                  background: 'var(--surface)',
                  color: 'var(--dark)',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                <option>3840 × 2160 (4K)</option>
                <option>1920 × 1080 (1080p)</option>
                <option>1280 × 720 (720p)</option>
              </select>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Est. File Size</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)' }}>~24 MB</span>
            </div>
          </div>

          <button className="btn-orange" style={{ width: '100%', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            Export &amp; Download
          </button>
        </div>
      )}
    </div>
  );
}
