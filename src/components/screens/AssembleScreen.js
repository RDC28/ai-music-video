'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Film, GripHorizontal, Loader2, Music, Pause, Play, Scissors, X, ZoomIn, ZoomOut } from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
import { getProjectAudioDuration, normalizeShotListForVeo } from '@/utils/shotList';

const TIMELINE_PADDING = 20;
const MIN_ZOOM = 5;
const MAX_ZOOM = 90;
const SHOTSTACK_WORKING_STATUSES = new Set(['queued', 'fetching', 'preprocessing', 'rendering', 'saving', 'pending']);

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

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function isShotstackWorking(status) {
  return SHOTSTACK_WORKING_STATUSES.has(String(status || '').toLowerCase());
}

function shotstackStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  if (!normalized) return 'Not Exported';
  if (normalized === 'done') return 'Ready';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getExportErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('timeout') || message.includes('temporarily unavailable')) {
    return 'Export is temporarily unavailable. Please try again soon.';
  }
  return 'Export could not be completed. Please try again.';
}

function shotDuration(shot) {
  const start = toFiniteNumber(shot?.start);
  const end = toFiniteNumber(shot?.end);
  if (start !== null && end !== null && end > start) return Number((end - start).toFixed(2));

  const explicitDuration = toFiniteNumber(shot?.duration);
  if (explicitDuration !== null && explicitDuration > 0) return explicitDuration;

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
  return 0;
}

function getClipSourceOut(clip, sourceDuration) {
  if (!clip) return 0;
  const sourceIn = getClipSourceIn(clip, sourceDuration);
  return Number((sourceIn + Math.min(clip.duration, sourceDuration || clip.duration)).toFixed(2));
}

function readableAudioName(audioUrl) {
  if (!audioUrl) return 'No Song Loaded';
  try {
    return decodeURIComponent(audioUrl.split('/').pop().split('-').slice(1).join('-')) || 'Audio Track';
  } catch {
    return 'Audio Track';
  }
}

export default function AssembleScreen({ isActive, projectId, audioUrl, projectData, onDataUpdate }) {
  const libraryCanvasRefs = useRef([]);
  const fallbackPreviewCanvasRef = useRef(null);
  const previewVideoRef = useRef(null);
  const audioRef = useRef(null);
  const timelineRef = useRef(null);
  const timelineScrollRef = useRef(null);

  const projectAudioDuration = useMemo(() => getProjectAudioDuration(projectData), [projectData]);
  const shots = useMemo(
    () => normalizeShotListForVeo(projectData?.shot_list || [], { audioDuration: projectAudioDuration }),
    [projectAudioDuration, projectData?.shot_list]
  );
  const [showExport, setShowExport] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [zoom, setZoom] = useState(12);
  const [clipStarts, setClipStarts] = useState({});
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [videoDurations, setVideoDurations] = useState({});
  const [exportResolution, setExportResolution] = useState(projectData?.shotstack_export?.resolution || '1080');
  const [exportQuality, setExportQuality] = useState(projectData?.shotstack_export?.quality || 'high');
  const [exportRender, setExportRender] = useState(projectData?.shotstack_export || null);
  const [exportStatusMessage, setExportStatusMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [isSubmittingExport, setIsSubmittingExport] = useState(false);

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

  const displayDuration = Math.max(audioDuration || projectAudioDuration || 0, timelineEnd, 60);
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
  const exportRenderId = exportRender?.renderId || exportRender?.id || null;
  const exportRenderStatus = exportRender?.status || '';
  const exportVideoUrl = exportRender?.hostedUrl || exportRender?.url || null;
  const isShotstackRendering = isSubmittingExport || isShotstackWorking(exportRenderStatus);

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

  useEffect(() => {
    if (!exportRenderId || !isShotstackWorking(exportRenderStatus)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/shotstack/render/${encodeURIComponent(exportRenderId)}`);
        const result = await readJsonResponse(response);
        if (!response.ok || result.error) {
          const error = new Error(result.error || `Export status failed with ${response.status}`);
          error.status = result.status || response.status;
          throw error;
        }
        if (cancelled) return;

        const nextRender = {
          ...exportRender,
          ...result,
          renderId: result.renderId || exportRenderId,
          resolution: exportResolution,
          quality: exportQuality,
          checkedAt: new Date().toISOString(),
        };

        setExportRender(nextRender);
        setExportStatusMessage(result.status === 'done' ? 'Export ready.' : `Export ${shotstackStatusLabel(result.status).toLowerCase()}...`);
        if (result.status === 'done') {
          await onDataUpdate?.({ shotstack_export: nextRender });
        }
      } catch (error) {
        if (cancelled) return;
        setExportError(getExportErrorMessage(error));
      }
    }, exportRenderStatus === 'queued' ? 6000 : 9000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [exportRender, exportRenderId, exportRenderStatus, exportQuality, exportResolution, onDataUpdate]);

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

  const setTimelineZoom = (nextZoom, anchorClientX = null) => {
    const scrollContainer = timelineScrollRef.current;
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (clampedZoom === zoom) return;

    let nextScrollLeft = null;
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const anchorOffset = anchorClientX !== null
        ? clamp(anchorClientX - rect.left, 0, scrollContainer.clientWidth)
        : scrollContainer.clientWidth / 2;
      const anchorTime = Math.max(0, (scrollContainer.scrollLeft + anchorOffset - TIMELINE_PADDING) / zoom);
      const nextTimelineWidth = Math.max(displayDuration * clampedZoom, 960) + TIMELINE_PADDING * 2;
      const maxScrollLeft = Math.max(0, nextTimelineWidth - scrollContainer.clientWidth);
      nextScrollLeft = clamp(anchorTime * clampedZoom - anchorOffset + TIMELINE_PADDING, 0, maxScrollLeft);
    }

    setZoom(clampedZoom);

    if (nextScrollLeft !== null) {
      requestAnimationFrame(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollLeft = nextScrollLeft;
        }
      });
    }
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

  const handleTimelineWheel = (event) => {
    const scrollContainer = timelineScrollRef.current;
    if (!scrollContainer) return;

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const zoomDelta = event.deltaY < 0 ? 4 : -4;
      setTimelineZoom(zoom + zoomDelta, event.clientX);
      return;
    }

    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!Number.isFinite(dominantDelta) || dominantDelta === 0) return;

    event.preventDefault();
    scrollContainer.scrollLeft += dominantDelta;
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

  const buildShotstackExportClips = () => sortedClips
    .map((clip) => {
      const shot = shots[clip.shotIndex];
      const sourceUrl = shot?.video_url || shot?.image_url;
      if (!sourceUrl) return null;

      const sourceType = shot.video_url ? 'video' : 'image';
      const knownDuration = videoDurations[clip.shotIndex] || toFiniteNumber(shot.video_duration_seconds, clip.duration);

      return {
        id: clip.id,
        shotIndex: clip.shotIndex,
        name: shot?.n || `Shot ${clip.shotIndex + 1}`,
        sourceUrl,
        sourceType,
        start: Number(clip.start.toFixed(3)),
        length: Number(clip.duration.toFixed(3)),
        trim: sourceType === 'video' ? getClipSourceIn(clip, knownDuration) : 0,
      };
    })
    .filter(Boolean);

  const saveExportRender = async (renderState) => {
    setExportRender(renderState);
    await onDataUpdate?.({ shotstack_export: renderState });
  };

  const handleShotstackExport = async () => {
    setExportError('');
    const clips = buildShotstackExportClips();
    if (!clips.length) {
      setExportError('Add at least one generated clip or source image before exporting.');
      return;
    }

    setIsSubmittingExport(true);
    setExportStatusMessage('Preparing final export...');

    try {
      const response = await fetch('/api/shotstack/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          audioUrl,
          resolution: exportResolution,
          quality: exportQuality,
          aspectRatio: '16:9',
          fps: 25,
          allowEffects: false,
          allowTransitions: false,
          clips,
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok || result.error) {
        const error = new Error(result.error || `Export failed with ${response.status}`);
        error.status = result.status || response.status;
        throw error;
      }

      const renderState = {
        renderId: result.renderId,
        status: result.status || 'queued',
        message: result.message,
        resolution: exportResolution,
        quality: exportQuality,
        submittedAt: new Date().toISOString(),
      };

      await saveExportRender(renderState);
      setExportStatusMessage('Export queued.');
    } catch (error) {
      setExportError(getExportErrorMessage(error));
      setExportStatusMessage('');
    } finally {
      setIsSubmittingExport(false);
    }
  };

  const handleExportDownload = () => {
    if (!exportVideoUrl) return;
    const a = document.createElement('a');
    a.href = exportVideoUrl;
    a.download = `music-video-${projectId || 'final'}.mp4`;
    a.click();
  };

  const tickStep = zoom < 8 ? 20 : 10;
  const ticks = Array.from({ length: Math.ceil(displayDuration / tickStep) + 1 });
  const playheadPosition = currentTime * zoom + TIMELINE_PADDING;

  return (
    <div className="screen active" id="s11" style={{ height: '100%', overflow: 'hidden', flexDirection: 'row', width: '100%', minHeight: 0 }}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(event) => setAudioDuration(event.target.duration || 0)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div style={{ width: '260px', height: '100%', flexShrink: 0, background: 'var(--card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div className="kicker" style={{ marginBottom: '8px' }}>── Library</div>
          <div className="editorial-title editorial-h3" style={{ fontSize: '20px' }}>
            Generated clips.
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {String(generatedCount).padStart(2,'0')} / {String(shots.length || 0).padStart(2,'0')} ready
          </div>
        </div>

        <div className="visible-scrollbar editor-clip-library">
          {shots.map((shot, index) => {
            const isReady = Boolean(shot.video_url);
            return (
              <div
                className="editor-clip-card"
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
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: 'var(--surface)',
                  cursor: isReady ? 'grab' : 'default',
                  opacity: isReady ? 1 : 0.58,
                  position: 'relative',
                  boxShadow: '0 8px 22px rgba(0,0,0,0.24)',
                }}
              >
                <div className="editor-clip-frame">
                  <div style={{ position: 'absolute', inset: 0 }}>
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
                    <canvas ref={(element) => (libraryCanvasRefs.current[index] = element)} width={320} height={180} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                  </div>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.76) 100%)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: '8px', right: '8px', bottom: '7px', minWidth: 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 8px rgba(0,0,0,0.78)' }}>
                      {index + 1}. {shot.n || `Shot ${index + 1}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <span style={{ fontSize: '8px', fontWeight: 900, color: isReady ? '#071012' : 'rgba(255,255,255,0.68)', background: isReady ? 'var(--teal)' : 'rgba(0,0,0,0.58)', padding: '2px 5px', borderRadius: '4px', fontFamily: 'var(--font-display)' }}>
                        {isReady ? 'READY' : 'MISSING'}
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.68)' }}>
                        {formatSeconds(shotDuration(shot))}
                      </span>
                    </div>
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
              <img src={activeShot.image_url} alt={activeShot.n || 'Preview source'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#050505' }} />
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

          <div
            style={{
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)), var(--card)',
              border: '1px solid rgba(255,255,255,0.085)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              boxShadow: 'var(--shadow-card)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="kicker" style={{ marginBottom: '14px' }}>── Inspector</div>
            {selectedClip ? (
              <>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: '20px',
                    fontWeight: 500,
                    color: 'var(--dark)',
                    lineHeight: 1.1,
                    marginBottom: '10px',
                    letterSpacing: '-0.022em',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontStyle: 'normal', color: 'var(--text-muted)', marginRight: '8px', letterSpacing: '0.08em' }}>
                    {String(selectedClip.shotIndex + 1).padStart(2, '0')}
                  </span>
                  {selectedShot?.n || 'Selected clip'}
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

                <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.2)', background: 'rgba(124,58,237,0.06)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
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
          <span style={{ fontSize: '12.5px', fontWeight: 500, minWidth: '46px', color: 'var(--dark)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>{formatTime(currentTime)}</span>
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
          <span style={{ fontSize: '12.5px', fontWeight: 500, minWidth: '46px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>{formatTime(displayDuration)}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginLeft: 'auto', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
            <button className="btn-outline" onClick={() => setTimelineZoom(zoom - 3)} style={{ width: '32px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Zoom out">
              <ZoomOut size={14} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '180px' }}>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="1"
                value={zoom}
                onChange={(event) => setTimelineZoom(Number(event.target.value))}
                aria-label="Timeline zoom"
                style={{ flex: 1, accentColor: 'var(--teal)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', minWidth: '52px', textAlign: 'right', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
                {zoom}px/s
              </span>
            </div>
            <button className="btn-outline" onClick={() => setTimelineZoom(zoom + 5)} style={{ width: '32px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Zoom in">
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
                Drag clips, scroll to pan, pinch or Ctrl+wheel to zoom
              </div>
            </div>

            <div
              ref={timelineScrollRef}
              className="visible-scrollbar"
              onWheel={handleTimelineWheel}
              style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', overscrollBehavior: 'contain', scrollbarGutter: 'stable both-edges' }}
            >
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
                          background: shot?.video_url ? 'linear-gradient(90deg, rgba(124,58,237,0.95), rgba(236,72,153,0.75))' : 'rgba(255,255,255,0.12)',
                          border: `1px solid ${isSelected ? 'var(--dark)' : 'rgba(255,255,255,0.18)'}`,
                          boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.25)' : 'none',
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
                    background: 'linear-gradient(90deg, var(--violet), rgba(236,72,153,0.7))',
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
            <div className="editorial-title editorial-h3" style={{ fontSize: '24px' }}>
              Final <span className="text-grad">export.</span>
            </div>
            <button
              onClick={() => setShowExport(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Close export settings"
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                Resolution
              </label>
              <select
                value={exportResolution}
                onChange={(event) => setExportResolution(event.target.value)}
                disabled={isShotstackRendering}
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
                <option value="4k">3840 x 2160 (4K)</option>
                <option value="1080">1920 x 1080 (1080p)</option>
                <option value="hd">1280 x 720 (720p)</option>
                <option value="sd">1024 x 576 (SD)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                Quality
              </label>
              <select
                value={exportQuality}
                onChange={(event) => setExportQuality(event.target.value)}
                disabled={isShotstackRendering}
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
                  cursor: isShotstackRendering ? 'not-allowed' : 'pointer',
                  appearance: 'none',
                }}
              >
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Edit Length</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 800, color: 'var(--dark)' }}>{formatTime(displayDuration)}</span>
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Export Status</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: exportRenderStatus === 'done' ? 'var(--teal)' : 'var(--dark)' }}>
                  {isShotstackRendering ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : exportRenderStatus === 'done' ? <CheckCircle2 size={12} /> : <Film size={12} />}
                  {shotstackStatusLabel(exportRenderStatus)}
                </span>
              </div>
              {exportRenderId && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {exportRenderId}
                </div>
              )}
              {exportStatusMessage && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.45 }}>
                  {exportStatusMessage}
                </div>
              )}
              {exportError && (
                <div style={{ marginTop: '9px', color: '#ff9d9d', display: 'flex', gap: '7px', fontSize: '11px', lineHeight: 1.45 }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{exportError}</span>
                </div>
              )}
            </div>
          </div>

          <button
            className="btn-orange"
            onClick={exportVideoUrl ? handleExportDownload : handleShotstackExport}
            disabled={isShotstackRendering}
            style={{ width: '100%', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isShotstackRendering ? 0.72 : 1 }}
          >
            {isShotstackRendering ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Rendering
              </>
            ) : exportVideoUrl ? (
              <>
                <Download size={14} />
                Download Video
              </>
            ) : (
              <>
                <Film size={14} />
                Start Export
              </>
            )}
          </button>
          {exportVideoUrl && (
            <button
              className="btn-outline"
              onClick={handleShotstackExport}
              disabled={isShotstackRendering}
              style={{ width: '100%', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px' }}
            >
              <Film size={13} />
              Export Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', padding: '8px 9px' }}>
      <div style={{ fontSize: '9.5px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--dark)', fontWeight: 500, marginTop: '4px', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
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
