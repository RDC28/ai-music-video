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
  const [zoom, setZoom] = useState(10); // Pixels per second

  // Use props data or fallback to empty array
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

  // Canva-style Zoom Controls (Mousewheel + Pinch)
  useEffect(() => {
    const timelineContainer = timelineRef.current?.parentElement;
    if (!timelineContainer) return;

    // 1. Mouse Wheel Zoom (Ctrl + Scroll)
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -2 : 2;
        setZoom(prev => Math.min(Math.max(prev + delta, 2), 100));
      }
    };

    // 2. Pinch to Zoom (Touch)
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

  const audioFileName = audioUrl ? audioUrl.split('/').pop().split('-').slice(1).join('-') : "No Audio Loaded";

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
        <div className="editor-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* Preview Player */}
          <div className="player-preview" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#1a0a1a', borderRadius: '12px', overflow: 'hidden', margin: '5px 10px' }}>
            <canvas ref={previewCanvasRef} width={800} height={450} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>

          {/* Controls */}
          <div className="playback-controls" style={{ gap: '20px', padding: '8px 20px', background: 'white', borderBottom: '1px solid var(--border)', width: '100%', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '40px' }}>{formatTime(currentTime)}</span>
              <button 
                onClick={togglePlay}
                className="btn-outline" 
                style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', background: isPlaying ? 'var(--orange)' : 'white', color: isPlaying ? 'white' : 'black', border: '2px solid var(--border)' }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '40px', color: '#888' }}>{formatTime(duration)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
              <button 
                onClick={() => setZoom(prev => Math.max(prev - 2, 2))}
                className="btn-outline" 
                style={{ padding: '6px 12px', fontSize: '14px', fontWeight: 800, borderRadius: '8px' }}
              >
                −
              </button>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--dark)', minWidth: '50px', textAlign: 'center', letterSpacing: '0.05em' }}>
                ZOOM
              </span>
              <button 
                onClick={() => setZoom(prev => Math.min(prev + 5, 100))}
                className="btn-outline" 
                style={{ padding: '6px 12px', fontSize: '14px', fontWeight: 800, borderRadius: '8px' }}
              >
                +
              </button>
            </div>
          </div>

          {/* Independent Scrollable Timeline Container */}
          <div className="timeline-container" style={{ width: '100%', overflowX: 'auto', overflowY: 'auto', background: '#fcfaf7', padding: '0', borderTop: '1px solid var(--border)', flex: '0 1 130px' }}>
            <div 
              ref={timelineRef}
              onMouseDown={handleMouseDown}
              style={{ 
                width: `${timelineWidth}px`, 
                minHeight: '100%', 
                position: 'relative',
                padding: '0 20px 20px 20px',
                boxSizing: 'content-box',
                cursor: 'pointer'
              }}
            >
              {/* Time Ruler */}
              <div className="time-ruler" style={{ 
                display: 'flex', 
                position: 'sticky', 
                top: 0, 
                width: '100%', 
                height: '24px',
                borderBottom: '1px solid var(--border)',
                background: '#f8f4f0',
                zIndex: 5,
                pointerEvents: 'none',
                marginLeft: '-20px',
                marginRight: '-20px',
                paddingLeft: '20px',
                paddingRight: '20px',
                boxSizing: 'content-box'
              }}>
                {Array.from({ length: Math.ceil(duration / 10) + 1 }).map((_, i) => (
                  <div key={i} style={{ 
                    position: 'absolute', 
                    left: `${(i * 10 * zoom) + 20}px`, 
                    fontSize: '10px', 
                    fontWeight: 700,
                    color: '#a09890',
                    paddingLeft: '6px',
                    borderLeft: '1.5px solid #dcd4cc',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    {Math.floor(i * 10 / 60)}:{(i * 10 % 60).toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
              
              <div className="video-track" style={{ marginTop: '10px', background: 'rgba(42,38,34,0.04)', height: '50px', position: 'relative', borderRadius: '4px', border: '1px dashed #dcd4cc' }}>
                {shots.map((shot, i) => (
                  <div 
                    key={i} 
                    className="track-clip" 
                    style={{ 
                      width: `${(shot.duration || 5) * zoom}px`,
                      height: '34px',
                      top: '8px',
                      position: 'relative',
                      display: 'inline-block',
                      marginRight: '1px',
                      background: 'var(--teal)',
                      opacity: 0.9,
                      borderRadius: '6px',
                      border: '1.5px solid rgba(255,255,255,0.3)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  ></div>
                ))}
              </div>
              
              <div className="audio-track" style={{ 
                width: `${duration * zoom}px`,
                background: 'linear-gradient(90deg, var(--orange), #ff9f43)', 
                color: 'white', 
                padding: '10px 16px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                marginTop: '12px',
                borderRadius: '8px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(255, 107, 0, 0.2)',
                border: '1.5px solid rgba(255,255,255,0.2)'
              }}>
                <span style={{ fontSize: '14px' }}>🎵</span> 
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{audioFileName}</span>
              </div>

              {/* Playhead */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: `${playheadPosition}px`,
                width: '3px',
                height: '100%',
                background: 'var(--teal)',
                zIndex: 10,
                pointerEvents: 'none',
                boxShadow: '0 0 8px rgba(61, 140, 122, 0.4)'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  background: 'var(--teal)',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '18px',
                  left: '-4.5px',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0, margin: '8px 10px' }}>
             <button className="btn-teal" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => setShowExport(true)}>
                EXPORT VIDEO
             </button>
          </div>
        </div>
      </div>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '0.05em' }}>RESOLUTION</label>
              <select defaultValue="1920 × 1080 (1080p)" style={{ width: '100%', padding: '10px 14px', border: '2px solid var(--border)', borderRadius: '12px', fontFamily: 'var(--font-body)', fontSize: '13px', outline: 'none', background: 'var(--cream)', cursor: 'pointer', appearance: 'none' }}>
                <option>3840 × 2160 (4K)</option>
                <option>1920 × 1080 (1080p)</option>
                <option>1280 × 720 (720p)</option>
              </select>
            </div>

            <div style={{ background: 'rgba(42, 38, 34, 0.04)', borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.05em' }}>EST. FILE SIZE</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)' }}>~24 MB</span>
            </div>
          </div>

          <button className="btn-orange" style={{ width: '100%', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            Export & Download
          </button>
        </div>
      )}
    </div>
  );
}
