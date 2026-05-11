'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Loader2, Play, RotateCcw, Upload, Video, Wand2 } from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_GENERATION_MODELS,
  getVideoDurationOptions,
  normalizeVideoDurationForModel,
  resolveVideoModelOption,
} from '@/utils/generationModels';
import { getPlannedVideoDuration, getProjectAudioDuration, normalizeShotListForVeo } from '@/utils/shotList';
import { createClient } from '@/utils/supabase';

const MAX_CLIENT_RETRIES = 2;
const CLIENT_REQUEST_TIMEOUT_MS = 650000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryableClientError(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.retryable === true ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('unavailable') ||
    message.includes('overloaded')
  );
}

function getClipErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status);

  if (error?.name === 'AbortError' || status === 408 || message.includes('timeout')) {
    return 'This clip took too long. Try again.';
  }
  if (message.includes('temporarily unavailable') || status >= 500) {
    return 'Clip creation is temporarily unavailable. Try again soon.';
  }
  if (message.includes('missing project') || message.includes('not found')) {
    return 'Project data is unavailable. Reload and try again.';
  }
  if (message.includes('must be native 16:9')) {
    return 'Regenerate the source frame as 16:9 before creating this clip.';
  }
  return 'Clip could not be created. Please try again.';
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function fetchJsonWithRetry(url, options, attempts = MAX_CLIENT_RETRIES) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const result = await readJsonResponse(response);
      if (!response.ok || result.error) {
        const error = new Error(result.error || `Request failed with ${response.status}`);
        error.status = result.status || response.status;
        error.retryable = result.retryable ?? isRetryableClientError(error);
        throw error;
      }

      return result;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (error?.name === 'AbortError') {
        lastError = new Error('Video generation request timed out. It can be retried later.');
        lastError.retryable = true;
        lastError.status = 408;
      }

      if (!isRetryableClientError(lastError) || attempt === attempts) break;
      await sleep(1600 * attempt + Math.floor(Math.random() * 700));
    }
  }

  lastError.clientAttempts = attempts;
  throw lastError;
}

function buildShotError(error, previousError) {
  return {
    message: getClipErrorMessage(error),
    retryable: isRetryableClientError(error),
    status: error?.status || null,
    attempts: (previousError?.attempts || 0) + (error?.clientAttempts || 1),
    failed_at: new Date().toISOString(),
  };
}

function compactText(value, maxLength = 700) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactAssetList(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    name: item?.name,
    role: compactText(item?.role || item?.description, 220),
    description: compactText(item?.description, 320),
    visual_prompt: compactText(item?.visual_prompt || item?.prompt || item?.description, 700),
  }));
}

function compactTranscript(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 80).map(line => ({
    start: line?.start,
    end: line?.end,
    text: compactText(line?.text || line?.lyrics || line?.line, 260),
    words: Array.isArray(line?.words)
      ? line.words.slice(0, 80).map(word => ({
          word: word?.word || word?.text,
          start: word?.start,
          end: word?.end,
        }))
      : [],
  }));
}

function buildGenerationContext(projectData, sourceShots) {
  const sourceState = Array.isArray(projectData) ? {} : (projectData || {});
  const script = sourceState.script || {};
  const analysis = sourceState.analysis || {};
  const transcript = analysis.lyrics || script.lyrics_timeline || [];

  return {
    analysis: {
      theme: compactText(analysis.theme, 300),
      mood: compactText(analysis.mood, 300),
      genre: compactText(analysis.genre, 160),
      bpm: analysis.bpm,
      summary: compactText(analysis.summary, 700),
    },
    script: {
      title: script.title,
      mood: compactText(script.mood, 500),
      storyline: compactText(script.storyline, 700),
    },
    transcript: compactTranscript(transcript),
    characters: compactAssetList(sourceState.characters),
    locations: compactAssetList(sourceState.locations),
    shot_list: sourceShots.map(shot => ({
      n: shot.n,
      p: compactText(shot.p || shot.prompt, 900),
      start: shot.start,
      end: shot.end,
      duration: shot.duration,
      veo_duration_seconds: shot.veo_duration_seconds,
      lyrics: compactText(shot.lyrics, 300),
      characters: shot.characters,
      locations: shot.locations,
      shot_size: shot.shot_size,
      camera: shot.camera,
      movement: shot.movement,
      beat: compactText(shot.beat, 260),
      image_url: shot.image_url,
      image_prompt: compactText(shot.image_prompt, 500),
    })),
  };
}

function compactShotForRequest(shot) {
  return {
    n: shot.n,
    p: compactText(shot.p || shot.prompt, 1800),
    prompt: compactText(shot.prompt, 1800),
    start: shot.start,
    end: shot.end,
    duration: shot.duration,
    veo_duration_seconds: shot.veo_duration_seconds,
    lyrics: compactText(shot.lyrics, 500),
    words: Array.isArray(shot.words) ? shot.words.slice(0, 80) : [],
    characters: shot.characters || [],
    locations: shot.locations || [],
    shot_size: shot.shot_size,
    camera: shot.camera,
    movement: shot.movement,
    beat: compactText(shot.beat, 500),
    image_url: shot.image_url,
    image_prompt: compactText(shot.image_prompt, 800),
    video_prompt: compactText(shot.video_prompt, 1800),
  };
}

function safeFileName(name) {
  return String(name || 'upload.mp4')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload.mp4';
}

function inferVideoExtension(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (type.includes('webm') || name.endsWith('.webm')) return 'webm';
  if (type.includes('quicktime') || name.endsWith('.mov')) return 'mov';
  return 'mp4';
}

function videoContentType(file, extension) {
  if (file?.type) return file.type;
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  return 'video/mp4';
}

export default function VideosScreen({ onNavigate, isActive, projectId, projectData, onDataUpdate }) {
  const canvasRefs = useRef([]);
  const modalCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const projectState = Array.isArray(projectData) ? {} : (projectData || {});
  const audioDuration = getProjectAudioDuration(projectState);
  const initialShots = normalizeShotListForVeo(
    Array.isArray(projectData) ? projectData : projectState?.shot_list || [],
    { audioDuration }
  );
  const [shots, setShots] = useState(() => initialShots);
  const [editModalIndex, setEditModalIndex] = useState(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [modelDraft, setModelDraft] = useState(DEFAULT_VIDEO_MODEL);
  const [durationDraft, setDurationDraft] = useState('6');
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [queueSummary, setQueueSummary] = useState('');

  const selectedShot = editModalIndex !== null ? shots[editModalIndex] : null;
  const durationOptions = getVideoDurationOptions(modelDraft);
  const handleModelDraftChange = (value) => {
    setModelDraft(value);
    setDurationDraft(previous => String(normalizeVideoDurationForModel(previous, value)));
  };

  useEffect(() => {
    const list = normalizeShotListForVeo(
      Array.isArray(projectData) ? projectData : projectState?.shot_list || [],
      { audioDuration }
    );
    if (JSON.stringify(list) !== JSON.stringify(shots)) {
      // Keep local generation state aligned when the saved project shot list changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShots(list);
    }
  }, [audioDuration, projectData, projectState?.shot_list, shots]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas && !shots[i]?.video_url && !shots[i]?.image_url) drawClubScene(canvas, i * 5 + 2);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, shots]);

  useEffect(() => {
    if (
      editModalIndex !== null &&
      modalCanvasRef.current &&
      !shots[editModalIndex]?.video_url &&
      !shots[editModalIndex]?.image_url
    ) {
      drawClubScene(modalCanvasRef.current, editModalIndex * 5 + 2);
    }
  }, [editModalIndex, shots]);

  const openEditor = (index) => {
    const shot = shots[index];
    setEditModalIndex(index);
    setPromptDraft(shot?.video_prompt || shot?.p || shot?.prompt || '');
    const nextModel = resolveVideoModelOption(shot?.video_model || modelDraft || DEFAULT_VIDEO_MODEL).value;
    setModelDraft(nextModel);
    setDurationDraft(String(normalizeVideoDurationForModel(getPlannedVideoDuration(shot, 6), nextModel)));
    setGenerationError('');
    setQueueSummary('');
  };

  const requestShotVideo = async (index, promptOverride = null, sourceShots = shots, options = {}) => {
    if (!projectId) throw new Error('Missing project id');
    const shot = sourceShots[index];
    if (!shot) throw new Error('Shot not found');
    const selectedModel = modelDraft || DEFAULT_VIDEO_MODEL;
    const requestedDuration = normalizeVideoDurationForModel(
      Number.isFinite(options.durationSeconds) ? options.durationSeconds : getPlannedVideoDuration(shot, 6),
      selectedModel
    );

    setGeneratingIndex(index);

    const result = await fetchJsonWithRetry('/api/generate-shot-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        shot: compactShotForRequest(shot),
        shotIndex: index,
        projectState: buildGenerationContext(projectData, sourceShots),
        promptOverride: promptOverride || undefined,
        model: selectedModel,
        durationSeconds: requestedDuration,
        aspectRatio: '16:9',
        resolution: requestedDuration === 8 ? '1080p' : '720p',
      }),
    });

    const updatedShot = result.shot || {
      ...shot,
      video_url: result.video_url,
      video_path: result.video_path,
      video_prompt: promptOverride || shot.video_prompt || shot.p,
      video_model: result.video_model || selectedModel,
      veo_duration_seconds: requestedDuration,
      video_duration_seconds: requestedDuration,
      video_width: result.video_width,
      video_height: result.video_height,
      video_aspect_ratio: result.video_aspect_ratio,
      video_generated_at: new Date().toISOString(),
      video_error: null,
    };
    return sourceShots.map((item, shotIndex) => shotIndex === index ? updatedShot : item);
  };

  const markShotFailure = (sourceShots, index, error) => {
    const previousError = sourceShots[index]?.video_error;
    const videoError = buildShotError(error, previousError);
    return sourceShots.map((item, shotIndex) => (
      shotIndex === index
        ? { ...item, video_error: videoError }
        : item
    ));
  };

  const runGenerationQueue = async (indices, { promptOverrides = {}, durationOverrides = {}, label = 'Video generation' } = {}) => {
    if (!indices.length) return;

    setIsGeneratingAll(indices.length > 1);
    setGenerationError('');
    setQueueSummary(`${label} started for ${indices.length} shot${indices.length === 1 ? '' : 's'}. Clips can take a few minutes each.`);

    let nextShots = [...shots];
    let successCount = 0;
    let failureCount = 0;

    for (const index of indices) {
      try {
        // Space out clip requests so long-running renders stay reliable.
        if (successCount > 0 || failureCount > 0) {
          setQueueSummary(`${label}: Preparing the next clip...`);
          await sleep(35000);
        }

        setQueueSummary(`${label}: Generating shot ${index + 1}...`);
        nextShots = await requestShotVideo(index, promptOverrides[index], nextShots, {
          durationSeconds: Number.isFinite(durationOverrides[index]) ? durationOverrides[index] : undefined,
        });
        successCount += 1;
      } catch (error) {
        console.error(`Shot ${index + 1} video generation failed:`, error);
        nextShots = markShotFailure(nextShots, index, error);
        failureCount += 1;
      }

      setShots(nextShots);
      await onDataUpdate({ shot_list: nextShots });
    }

    setGeneratingIndex(null);
    setIsGeneratingAll(false);

    if (failureCount) {
      setGenerationError(`${failureCount} shot${failureCount === 1 ? '' : 's'} need another try. Generate Remaining will retry unfinished clips.`);
    }
    setQueueSummary(`${successCount} ready, ${failureCount} need retry, ${nextShots.filter(shot => !shot.video_url).length} remaining.`);
  };

  const handleGenerateOne = async () => {
    if (editModalIndex === null) return;
    await runGenerationQueue([editModalIndex], {
      promptOverrides: { [editModalIndex]: promptDraft },
      durationOverrides: { [editModalIndex]: Number(durationDraft) || getPlannedVideoDuration(shots[editModalIndex], 6) },
      label: `Shot ${editModalIndex + 1}`,
    });
  };

  const handleGenerateAll = async () => {
    if (!shots.length || isGeneratingAll) return;
    await runGenerationQueue(shots.map((_, index) => index), { label: 'Regenerate all' });
  };

  const handleGenerateRemaining = async () => {
    if (!shots.length || isGeneratingAll) return;
    const remainingIndices = shots
      .map((shot, index) => ({ shot, index }))
      .filter(({ shot }) => !shot.video_url)
      .map(({ index }) => index);

    await runGenerationQueue(remainingIndices, { label: 'Generate remaining' });
  };

  const handleUploadOwn = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || editModalIndex === null) return;
    if (!projectId) {
      setGenerationError('Project unavailable. Please reload and try again.');
      return;
    }

    setIsUploading(true);
    setGenerationError('');

    try {
      const supabase = createClient();
      const extension = inferVideoExtension(file);
      const storagePath = `${projectId}/videos/upload-shot-${String(editModalIndex + 1).padStart(3, '0')}-${Date.now()}-${safeFileName(file.name || `clip.${extension}`)}`;
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(storagePath, file, {
          contentType: videoContentType(file, extension),
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(storagePath);
      const nextShots = shots.map((shot, index) => (
        index === editModalIndex
          ? {
              ...shot,
              video_url: publicUrl,
              video_path: storagePath,
              video_prompt: promptDraft || shot.video_prompt || shot.p,
              video_uploaded_at: new Date().toISOString(),
              video_error: null,
            }
          : shot
      ));

      setShots(nextShots);
      await onDataUpdate({ shot_list: nextShots });
      setQueueSummary(`Uploaded replacement video for shot ${editModalIndex + 1}.`);
    } catch (error) {
      console.error('Video upload failed:', error);
      setGenerationError('Upload could not be completed. Please try another clip.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleApproveAll = async () => {
    setIsApproving(true);
    await onDataUpdate({
      shot_list: shots,
      videos_approved: true,
      current_step: 10,
    });
    setIsApproving(false);
    onNavigate(10);
  };

  const handleDownload = (shot, index) => {
    if (!shot.video_url) return;
    const a = document.createElement('a');
    a.href = shot.video_url;
    a.download = `shot_${index + 1}.mp4`;
    a.click();
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--border-mid)',
    borderRadius: '8px',
    background: 'var(--surface)',
    color: 'var(--dark)',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
    resize: 'none',
  };

  const generatedCount = shots.filter(shot => shot.video_url).length;
  const remainingCount = shots.length - generatedCount;
  const failedCount = shots.filter(shot => !shot.video_url && shot.video_error).length;

  return (
    <div className="screen active" id="s7" style={{ flexDirection: 'row', alignItems: 'flex-start', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          gap: '16px',
        }}>
          <div>
            <div className="kicker kicker--orange" style={{ marginBottom: '10px' }}>Clips · Render</div>
            <h1 className="editorial-title editorial-h2" style={{ marginBottom: '8px' }}>
              Bring frames to <span className="text-grad">life.</span>
            </h1>
            <p
              style={{
                fontSize: '12.5px',
                color: 'var(--text-soft)',
                fontFamily: shots.length ? 'var(--font-mono)' : 'var(--font-body)',
                letterSpacing: shots.length ? '0.08em' : '-0.005em',
                textTransform: shots.length ? 'uppercase' : 'none',
              }}
            >
              {shots.length
                ? `${String(generatedCount).padStart(2,'0')} / ${String(shots.length).padStart(2,'0')} ready · ${remainingCount} remaining${failedCount ? ` · ${failedCount} retry` : ''}`
                : 'Create and review video clips for each shot.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <span className="tag-badge tag-teal">◇ Standard clips</span>
              <span className="tag-badge tag-outline">○ Muted · song sync</span>
            </div>
            {queueSummary && (
              <p style={{ fontSize: '11px', color: 'rgba(234,234,234,0.58)', marginTop: '5px' }}>
                {queueSummary}
              </p>
            )}
            {generationError && (
              <p style={{ fontSize: '12px', color: '#ff8a8a', marginTop: '5px' }}>
                {generationError}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <select
              value={modelDraft}
              onChange={(event) => handleModelDraftChange(event.target.value)}
              style={{ ...inputStyle, width: '176px', height: '38px', padding: '8px 10px', flexShrink: 0 }}
              title="Video model"
            >
              {VIDEO_GENERATION_MODELS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              className="btn-teal"
              onClick={handleGenerateRemaining}
              disabled={!shots.length || remainingCount === 0 || isGeneratingAll || generatingIndex !== null}
              style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}
            >
              {isGeneratingAll ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Generating {generatingIndex !== null ? `${generatingIndex + 1}/${shots.length}` : 'Videos'}
                </>
              ) : (
                <>
                  <Wand2 size={14} />
                  {remainingCount === shots.length ? 'Generate Clips' : `Generate Remaining (${remainingCount})`}
                </>
              )}
            </button>
            <button
              className="btn-outline"
              onClick={handleGenerateAll}
              disabled={!shots.length || isGeneratingAll || generatingIndex !== null}
              style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}
              title="Regenerate every shot, including completed videos"
            >
              <RotateCcw size={14} />
              Regenerate All
            </button>
            <button
              className="btn-teal"
              onClick={handleApproveAll}
              disabled={isApproving}
              style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            >
              {isApproving ? 'Saving...' : 'Approve All'}
              {!isApproving && <Check size={14} />}
            </button>
          </div>
        </div>

        <div id="vidList" className="visible-scrollbar video-gallery-grid" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 112px', display: 'grid', gap: '18px', alignContent: 'start', scrollbarGutter: 'stable' }}>
          {shots.length > 0 ? shots.map((shot, i) => (
            <div
              className="video-gallery-card"
              key={`${shot.n}-${i}`}
              role="button"
              tabIndex={0}
              onClick={() => openEditor(i)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openEditor(i);
                }
              }}
              style={{
                border: `1px solid ${editModalIndex === i ? 'rgba(124,58,237,0.58)' : 'var(--border-mid)'}`,
                borderRadius: '14px',
                background: 'var(--surface)',
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: editModalIndex === i ? '0 0 0 1px rgba(124,58,237,0.22), 0 16px 48px rgba(124,58,237,0.12)' : '0 12px 40px rgba(0,0,0,0.22)',
                transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s',
              }}
            >
              <div className="video-gallery-frame">
                {shot.video_url ? (
                  <video
                    src={shot.video_url}
                    poster={shot.image_url || undefined}
                    muted
                    playsInline
                    preload="metadata"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : shot.image_url ? (
                  <img src={shot.image_url} alt={shot.n || `Shot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <canvas
                    ref={(el) => (canvasRefs.current[i] = el)}
                    width={640}
                    height={360}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.16) 0%, transparent 42%, rgba(0,0,0,0.76) 100%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: '12px', right: '12px', bottom: '10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 10px rgba(0,0,0,0.8)' }}>
                      {i + 1}. {shot.n || shot.title || `Shot ${i + 1}`}
                    </div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                      {shot.video_url ? 'Clip ready' : shot.video_error ? 'Try again' : 'Ready to generate'}
                    </div>
                  </div>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,0,0,0.56)', border: '1px solid rgba(255,255,255,0.24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                    <Play size={12} fill="white" />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditor(i);
                  }}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    fontSize: '10px',
                    padding: '5px 9px',
                    borderColor: editModalIndex === i ? 'rgba(124,58,237,0.78)' : 'rgba(255,255,255,0.22)',
                    background: 'rgba(0,0,0,0.58)',
                    color: '#fff',
                  }}
                >
                  {editModalIndex === i ? 'Editing' : shot.video_url ? 'Edit' : shot.video_error ? 'Retry' : 'Generate'}
                </button>
                {generatingIndex === i && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)', fontSize: '11px', fontWeight: 700 }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', marginRight: '8px' }} />
                    Generating...
                  </div>
                )}
                {!shot.video_url && shot.video_error && generatingIndex !== i && (
                  <div style={{ position: 'absolute', left: '10px', top: '10px', display: 'flex', alignItems: 'center', gap: '5px', color: '#ffb0b0', background: 'rgba(82,0,0,0.68)', border: '1px solid rgba(255,138,138,0.28)', borderRadius: '999px', padding: '5px 8px', fontSize: '10px', fontWeight: 800 }}>
                    <AlertTriangle size={11} />
                    Retry
                  </div>
                )}
              </div>
            </div>
          )) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', gap: '12px' }}>
              <Video size={28} color="var(--text-muted)" />
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No shots to display. Please add shots in the Shot List step first.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(7)} style={{ fontSize: '12px' }}>
                Back to Shots
              </button>
            </div>
          )}
        </div>
      </div>

      {editModalIndex !== null && selectedShot && (
        <div style={{
          position: 'sticky',
          top: 0,
          width: '440px',
          height: '100%',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border-mid)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>
              Edit Clip
            </div>
            <button
              onClick={() => setEditModalIndex(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >x</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                Current
              </div>
              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/9', background: 'var(--surface)', position: 'relative' }}>
                {selectedShot.video_url ? (
                  <video
                    src={selectedShot.video_url}
                    poster={selectedShot.image_url || undefined}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : selectedShot.image_url ? (
                  <img src={selectedShot.image_url} alt={selectedShot.n || 'Current shot source'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {!selectedShot.video_url && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 700, background: 'rgba(0,0,0,0.52)', padding: '6px 10px', borderRadius: '6px' }}>
                      {selectedShot.image_url ? 'Source image ready' : 'Not generated yet'}
                    </span>
                  </div>
                )}
              </div>
              {!selectedShot.video_url && selectedShot.video_error && (
                <div style={{ marginTop: '8px', color: '#ff8a8a', fontSize: '11px', lineHeight: 1.45 }}>
                  {selectedShot.video_error.message}
                </div>
              )}
            </div>

            <div style={{ height: '1px', background: 'var(--border)' }} />

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
              Replace With
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                1. Upload Your Own
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*"
                onChange={handleUploadOwn}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || generatingIndex !== null}
                style={{
                  width: '100%',
                  border: '1px dashed var(--border-mid)',
                  borderRadius: '8px',
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '20px',
                  cursor: isUploading || generatingIndex !== null ? 'not-allowed' : 'pointer',
                  opacity: isUploading || generatingIndex !== null ? 0.55 : 1,
                  color: 'var(--text-muted)',
                }}
              >
                {isUploading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={20} />}
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{isUploading ? 'Uploading...' : 'Browse Files'}</span>
              </button>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                2. Generate with Prompt
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                style={{ ...inputStyle, minHeight: '120px', lineHeight: 1.45 }}
                onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: '8px', marginTop: '8px' }}>
                <select
                  value={modelDraft}
                  onChange={(event) => handleModelDraftChange(event.target.value)}
                  style={{ ...inputStyle, height: '38px', padding: '8px 10px' }}
                  title="Video model"
                >
                  {VIDEO_GENERATION_MODELS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={durationDraft}
                  onChange={(e) => setDurationDraft(e.target.value)}
                  style={{ ...inputStyle, height: '38px', padding: '8px 10px' }}
                >
                  {durationOptions.map(seconds => (
                    <option key={seconds} value={String(seconds)}>{seconds}s</option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                Available clip lengths follow the selected model. Audio stays muted so the final edit stays synced to your main track.
              </div>

              <button
                className="btn-orange"
                onClick={handleGenerateOne}
                disabled={generatingIndex !== null || !promptDraft.trim()}
                style={{ width: '100%', fontSize: '12px', padding: '10px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
              >
                {generatingIndex === editModalIndex ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    {selectedShot.video_error && !selectedShot.video_url ? 'Try Again' : 'Generate New'}
                  </>
                )}
              </button>

              {selectedShot.video_url && (
                <button
                  className="btn-outline"
                  onClick={() => handleDownload(selectedShot, editModalIndex)}
                  style={{ width: '100%', fontSize: '12px', padding: '10px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                >
                  <Download size={14} />
                  Download Clip
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
