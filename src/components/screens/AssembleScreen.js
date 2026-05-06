'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, GripHorizontal, Music, Pause, Play, Scissors, ZoomIn, ZoomOut } from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
import { normalizeShotList } from '@/utils/shotList';

const TIMELINE_PADDING = 20;
const MIN_ZOOM = 5;
const MAX_ZOOM = 90;

const toFiniteNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const snapTime = (value) => Math.max(0, Math.round(value * 10) / 10);

const formatTime = (time) => {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const mins = Math.floor(safeTime / 60);
  const secs = Math.floor(safeTime % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatSeconds = (time) => `${(Number(time) || 0).toFixed(1)}s`;

function shotDuration(shot) {
  const explicitDuration = toFiniteNumber(shot?.duration);
  if (explicitDuration !== null && explicitDuration > 0) return explicitDuration;

  const start = toFiniteNumber(shot?.start);
  const end = toFiniteNumber(shot?.end);
  if (start !== null && end !== null && end > start) return Number((end - start).toFixed(2));

  return 5;
}

function buildInitialTimeline(shots) {
  let cursor = 0;

  return shots.map((shot, index) => {
    const duration = shotDuration(shot);
    const start = toFiniteNumber(shot?.start, cursor);
    cursor = start + duration;

    return {
      id: `shot-${index}-${shot?.video_url || shot?.image_url || 'placeholder'}`,
      shotIndex: index,
      start,
      duration,
    };
  });
}

function getClipSourceIn(clip, sourceDuration) {
  if (!clip || !sourceDuration || sourceDuration <= clip.duration) return 0;
  return Number(((sourceDuration - clip.duration) / 2).toFixed(2));
}

function getClipSourceOut(clip, sourceDuration) {
  if (!clip) return 0;
  const sourceIn = getClipSourceIn(clip, sourceDuration);
  return Number((sourceIn + Math.min(clip.duration, sourceDuration || clip.duration)).toFixed(2));
}

function readableAudioName(audioUrl) {
  if (!audioUrl) return 'No Audio Loaded';
  try {
    return decodeURIComponent(audioUrl.split('/').pop().split('-').slice(1).join('-')) || 'Audio Track';
  } catch {
    return 'Audio Track';
  }
}

export default function AssembleScreen({ isActive, audioUrl, projectData }) {
  const libraryCanvasRefs = useRef([]);
  const fallbackPreviewCanvasRef = useRef(null);
  const previewVideoRef = useRef(null);
  const audioRef = useRef(null);
  const timelineRef = useRef(null);
  const timelineScrollRef = useRef(null);

  const shots = useMemo(() => normalizeShotList(projectData?.shot_list || []), [projectData?.shot_list]);
  const [showExport, setShowExport] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [zoom, setZoom] = useState(12);
  const [clipStarts, setClipStarts] = useState({});
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [videoDurations, setVideoDurations] = useState({});

  const baseTimelineClips = useMemo(() => buildInitialTimeline(shots), [shots]);

  const timelineClips = useMemo(
    () => baseTimelineClips.map(clip => ({
      ...clip,
      start: clipStarts[clip.id] ?? clip.start,
    })),
    [baseTimelineClips, clipStarts]
  );

  const sortedClips = useMemo(
    () => [...timelineClips].sort((a, b) => a.start - b.start),
    [timelineClips]
  );

  const timelineEnd = useMemo(
    () => sortedClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0),
    [sortedClips]
  );

  const displayDuration = Math.max(audioDuration || 0, timelineEnd, 60);
  const timelineWidth = Math.max(displayDuration * zoom, 960);
  const activeClip = sortedClips.find(clip => currentTime >= clip.start && currentTime < clip.start + clip.duration)
    || sortedClips.find(clip => clip.id === selectedClipId)
    || sortedClips[0]
    || null;
  const activeShot = activeClip ? shots[activeClip.shotIndex] : null;
  const selectedClip = sortedClips.find(clip => clip.id === selectedClipId) || activeClip;
  const selectedShot = selectedClip ? shots[selectedClip.shotIndex] : null;
  const generatedCount = shots.filter(shot => shot.video_url).length;
  const audioFileName = readableAudioName(audioUrl);

  useEffect(() => {
    if (!isActive) return;

    const timer = setTimeout(() => {
      libraryCanvasRefs.current.forEach((canvas, index) => {
        if (canvas && !shots[index]?.video_url && !shots[index]?.image_url) {
          drawClubScene(canvas, index * 2 + 1);
        }
      });

      if (fallbackPreviewCanvasRef.current && !activeShot?.video_url && !activeShot?.image_url) {
        drawClubScene(fallbackPreviewCanvasRef.current, (activeClip?.shotIndex || 0) * 2 + 1);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isActive, shots, activeShot, activeClip]);

  useEffect(() => {
    let interval;

    if (isPlaying) {
      interval = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          return;
        }

        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= displayDuration) {
            setIsPlaying(false);
            return displayDuration;
          }
          return next;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [isPlaying, displayDuration]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !activeClip || !activeShot?.video_url) return;

    const sourceDuration = videoDurations[activeClip.shotIndex] || video.duration || 0;
    const sourceIn = getClipSourceIn(activeClip, sourceDuration);
    const localTime = clamp(currentTime - activeClip.start, 0, activeClip.duration);
    const targetTime = sourceIn + localTime;

    if (Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.35) {
      video.currentTime = targetTime;
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [activeClip, activeShot, currentTime, isPlaying, videoDurations]);

  const seekTo = (time) => {
    const safeTime = clamp(time, 0, displayDuration);
    if (audioRef.current) audioRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      previewVideoRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    previewVideoRef.current?.play().catch(() => {});
    setIsPlaying(true);
  };

  const handleTimelineSeek = (event) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - TIMELINE_PADDING;
    seekTo(x / zoom);
  };

  const handleMouseDown = (event) => {
    if (event.target.closest('[data-timeline-clip="true"]')) return;
    handleTimelineSeek(event);

    const onMouseMove = (moveEvent) => handleTimelineSeek(moveEvent);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const eventToTimelineTime = (event) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    return snapTime((event.clientX - rect.left - TIMELINE_PADDING) / zoom);
  };

  const handleLibraryDragStart = (event, shotIndex) => {
    const shot = shots[shotIndex];
    if (!shot?.video_url) return;

    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: 'library-shot',
      shotIndex,
    }));
  };

  const handleTimelineClipDragStart = (event, clipId) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: 'timeline-clip',
      clipId,
    }));
  };

  const handleTimelineDrop = (event) => {
    event.preventDefault();

    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData('application/json'));
    } catch {
      return;
    }

    const start = eventToTimelineTime(event);

    if (payload.type === 'timeline-clip') {
      setClipStarts(prev => ({ ...prev, [payload.clipId]: start }));
      setSelectedClipId(payload.clipId);
      seekTo(start);
      return;
    }

    if (payload.type === 'library-shot') {
      const shot = shots[payload.shotIndex];
      if (!shot?.video_url) return;

      const existingClip = timelineClips.find(clip => clip.shotIndex === payload.shotIndex);
      if (!existingClip) return;

      setClipStarts(prev => ({ ...prev, [existingClip.id]: start }));
      setSelectedClipId(existingClip.id);
      seekTo(start);
    }
  };

  const handleVideoMetadata = (shotIndex, event) => {
    const sourceDuration = event.currentTarget.duration;
    if (!Number.isFinite(sourceDuration)) return;

    setVideoDurations(prev => ({
      ...prev,
      [shotIndex]: sourceDuration,
    }));
  };

  const handleDownload = () => {
    if (!selectedShot?.video_url) return;
    const a = document.createElement('a');
    a.href = selectedShot.video_url;
    a.download = `shot_${(selectedClip?.shotIndex || 0) + 1}.mp4`;
    a.click();
  };

  const tickStep = zoom < 8 ? 20 : 10;
  const ticks = Array.from({ length: Math.ceil(displayDuration / tickStep) + 1 });
  const playheadPosition = currentTime * zoom + TIMELINE_PADDING;

  return (
    <div className="screen active" id="s8" style={{ height: 'calc(100vh - 162px)', overflow: 'hidden', flexDirection: 'row', width: '100%', minHeight: 0 }}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(event) => setAudioDuration(event.target.duration || 0)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div style={{ width: '260px', height: '100%', flexShrink: 0, background: 'var(--card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
            Generated Clips
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>
            {generatedCount}/{shots.length || 0} videos ready
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignContent: 'start' }}>
          {shots.map((shot, index) => {
            const isReady = Boolean(shot.video_url);
            return (
              <div
                key={`${shot.n}-${index}`}
                draggable={isReady}
                onDragStart={(event) => handleLibraryDragStart(event, index)}
                onClick={() => {
                  const clip = timelineClips.find(item => item.shotIndex === index);
                  if (clip) {
                    setSelectedClipId(clip.id);
                    seekTo(clip.start);
                  }
                }}
                style={{
                  border: `1px solid ${isReady ? 'var(--border-mid)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: 'var(--surface)',
                  cursor: isReady ? 'grab' : 'default',
                  opacity: isReady ? 1 : 0.58,
                }}
              >
                <div style={{ aspectRatio: '16/9', position: 'relative', background: '#050505' }}>
                  {shot.video_url ? (
                    <video
                      src={shot.video_url}
                      poster={shot.image_url || undefined}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(event) => handleVideoMetadata(index, event)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : shot.image_url ? (
                    <img src={shot.image_url} alt={shot.n || `Shot ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <canvas ref={(element) => (libraryCanvasRefs.current[index] = element)} width={160} height={90} style={{ width: '100%', height: '100%', display: 'block' }} />
                  )}
                  <div style={{ position: 'absolute', left: '6px', bottom: '5px', fontSize: '9px', fontWeight: 800, color: isReady ? '#0A0A0A' : 'var(--text-muted)', background: isReady ? 'var(--teal)' : 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-display)' }}>
                    {isReady ? 'READY' : 'MISSING'}
                  </div>
                </div>
                <div style={{ padding: '7px 8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--dark)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {index + 1}. {shot.n || `Shot ${index + 1}`}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {formatSeconds(shotDuration(shot))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, padding: '12px 16px 10px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: '14px' }}>
          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080010', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
            {activeShot?.video_url ? (
              <video
                key={`${activeClip?.id}-${activeShot.video_url}`}
                ref={previewVideoRef}
                src={activeShot.video_url}
                poster={activeShot.image_url || undefined}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => handleVideoMetadata(activeClip.shotIndex, event)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#050505' }}
              />
            ) : activeShot?.image_url ? (
              <img src={activeShot.image_url} alt={activeShot.n || 'Preview source'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            ) : (
              <canvas ref={fallbackPreviewCanvasRef} width={800} height={450} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            )}
            <div style={{ position: 'absolute', left: '14px', top: '12px', background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '8px 10px', maxWidth: '62%' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 800, color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeClip ? `${activeClip.shotIndex + 1}. ${activeShot?.n || 'Timeline Clip'}` : 'Timeline Preview'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {activeClip ? `${formatTime(activeClip.start)} - ${formatTime(activeClip.start + activeClip.duration)} · trimmed to ${formatSeconds(activeClip.duration)}` : 'Drop clips onto the timeline'}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-display)', marginBottom: '12px' }}>
              Clip Inspector
            </div>
            {selectedClip ? (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)', lineHeight: 1.25, marginBottom: '8px' }}>
                  {selectedClip.shotIndex + 1}. {selectedShot?.n || 'Selected Clip'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                  {selectedShot?.video_prompt || selectedShot?.p || selectedShot?.prompt || 'No prompt available'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '14px' }}>
                  <InfoPill label="Start" value={formatTime(selectedClip.start)} />
                  <InfoPill label="Duration" value={formatSeconds(selectedClip.duration)} />
                  <InfoPill label="Source In" value={formatSeconds(getClipSourceIn(selectedClip, videoDurations[selectedClip.shotIndex]))} />
                  <InfoPill label="Source Out" value={formatSeconds(getClipSourceOut(selectedClip, videoDurations[selectedClip.shotIndex]))} />
                </div>

                <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,184,212,0.2)', background: 'rgba(0,184,212,0.06)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Scissors size={15} color="var(--teal)" style={{ marginTop: '1px', flexShrink: 0 }} />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    The clip is fit to the exact shot duration by trimming evenly from the head and tail when the generated video is longer.
                  </div>
                </div>

                <button
                  className="btn-outline"
                  onClick={handleDownload}
                  disabled={!selectedShot?.video_url}
                  style={{ marginTop: 'auto', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                >
                  <Download size={14} />
                  Download Clip
                </button>
              </>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Drop generated clips onto the timeline to build the final edit.
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '10px 18px',
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '42px', color: 'var(--dark)', fontFamily: 'monospace' }}>{formatTime(currentTime)}</span>
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
              background: isPlaying ? 'var(--orange)' : 'var(--surface)',
              color: isPlaying ? '#0A0A0A' : 'var(--dark)',
              border: '1px solid var(--border-mid)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
          </button>
          <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '42px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{formatTime(displayDuration)}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginLeft: 'auto', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
            <button className="btn-outline" onClick={() => setZoom(prev => Math.max(prev - 3, MIN_ZOOM))} style={{ width: '32px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Zoom out">
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', minWidth: '40px', textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
              Zoom
            </span>
            <button className="btn-outline" onClick={() => setZoom(prev => Math.min(prev + 5, MAX_ZOOM))} style={{ width: '32px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Zoom in">
              <ZoomIn size={14} />
            </button>
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: '10px 16px 12px', background: 'rgba(0,0,0,0.18)', borderTop: '1px solid var(--border)' }}>
          <div style={{ height: '210px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--card)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 800, color: 'var(--dark)', fontFamily: 'var(--font-display)' }}>
                <Film size={14} color="var(--teal)" />
                Timeline
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Drag clips from the left or move clips inside the timeline
              </div>
            </div>

            <div ref={timelineScrollRef} style={{ flex: 1, overflow: 'auto' }}>
              <div
                ref={timelineRef}
                onMouseDown={handleMouseDown}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleTimelineDrop}
                style={{
                  width: `${timelineWidth + TIMELINE_PADDING * 2}px`,
                  minHeight: '100%',
                  position: 'relative',
                  padding: `0 ${TIMELINE_PADDING}px 16px`,
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                }}
              >
                <div style={{ position: 'sticky', top: 0, height: '28px', background: 'var(--card)', borderBottom: '1px solid var(--border)', zIndex: 8 }}>
                  {ticks.map((_, index) => (
                    <div
                      key={index}
                      style={{
                        position: 'absolute',
                        left: `${TIMELINE_PADDING + index * tickStep * zoom}px`,
                        top: 0,
                        height: '100%',
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                        paddingLeft: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '10px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      {formatTime(index * tickStep)}
                    </div>
                  ))}
                </div>

                <div style={{ height: '70px', marginTop: '10px', position: 'relative', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <TrackLabel icon={<Film size={13} />} label="Video" />
                  {sortedClips.map(clip => {
                    const shot = shots[clip.shotIndex];
                    const isSelected = selectedClipId === clip.id;
                    const clipWidth = Math.max(clip.duration * zoom, 26);
                    const left = clip.start * zoom;
                    return (
                      <div
                        key={clip.id}
                        data-timeline-clip="true"
                        draggable
                        onDragStart={(event) => handleTimelineClipDragStart(event, clip.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedClipId(clip.id);
                          seekTo(clip.start);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${left}px`,
                          top: '26px',
                          width: `${clipWidth}px`,
                          height: '34px',
                          borderRadius: '6px',
                          background: shot?.video_url ? 'linear-gradient(90deg, rgba(0,184,212,0.95), rgba(0,229,255,0.75))' : 'rgba(255,255,255,0.12)',
                          border: `1px solid ${isSelected ? 'var(--dark)' : 'rgba(255,255,255,0.18)'}`,
                          boxShadow: isSelected ? '0 0 0 2px rgba(0,184,212,0.25)' : 'none',
                          color: '#061014',
                          overflow: 'hidden',
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '0 8px',
                        }}
                      >
                        <GripHorizontal size={13} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '10px', fontWeight: 900, fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {clip.shotIndex + 1}. {shot?.n || 'Clip'} · {formatSeconds(clip.duration)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ height: '52px', marginTop: '8px', position: 'relative', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <TrackLabel icon={<Music size={13} />} label="Audio" />
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: '22px',
                    width: `${Math.max((audioDuration || displayDuration) * zoom, 160)}px`,
                    height: '22px',
                    borderRadius: '5px',
                    background: 'linear-gradient(90deg, var(--orange), rgba(0,229,255,0.7))',
                    color: '#0A0A0A',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0 10px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}>
                    <Music size={12} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {audioFileName}
                    </span>
                  </div>
                </div>

                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: `${playheadPosition}px`,
                  width: '2px',
                  height: '100%',
                  background: 'var(--teal)',
                  zIndex: 12,
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    background: 'var(--teal)',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '24px',
                    left: '-4px',
                    border: '1.5px solid rgba(0,0,0,0.5)',
                  }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0, padding: '0 16px 12px' }}>
          <button className="btn-teal" style={{ padding: '8px 18px', fontSize: '12px' }} onClick={() => setShowExport(true)}>
            Export Video
          </button>
        </div>
      </div>

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
            >x</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                Resolution
              </label>
              <select
                defaultValue="1920 x 1080 (1080p)"
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
                <option>3840 x 2160 (4K)</option>
                <option>1920 x 1080 (1080p)</option>
                <option>1280 x 720 (720p)</option>
              </select>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Edit Length</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)' }}>{formatTime(displayDuration)}</span>
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

function InfoPill({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', padding: '8px 9px' }}>
      <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-display)' }}>
        {label}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--dark)', fontWeight: 800, marginTop: '3px', fontFamily: 'monospace' }}>
        {value}
      </div>
    </div>
  );
}

function TrackLabel({ icon, label }) {
  return (
    <div style={{
      position: 'absolute',
      left: '8px',
      top: '5px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '10px',
      fontWeight: 800,
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      pointerEvents: 'none',
    }}>
      {icon}
      {label}
    </div>
  );
}
