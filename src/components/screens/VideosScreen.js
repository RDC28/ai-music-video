'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Loader2, Play, RotateCcw, Upload, Video, Wand2, X } from 'lucide-react';
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
  if (
    message.includes('seedance video generation requires') ||
    message.includes('bytedance_api_key') ||
    message.includes('seedance_api_key') ||
    message.includes('ark_api_key')
  ) {
    return 'Seedance needs an API key. Add BYTEDANCE_API_KEY to .env.local and restart Next.js, or choose a Veo model.';
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

function compactAssetImages(images = [], maxImages = 6) {
  if (!Array.isArray(images)) return [];

  return images
    .map((image, index) => {
      let imageData = image;
      if (typeof image === 'string') {
        const text = image.trim();
        if (text.charAt(0) === '{') {
          try {
            imageData = JSON.parse(text);
          } catch {
            imageData = { url: text };
          }
        } else {
          imageData = { url: text };
        }
      }

      if (!imageData || typeof imageData !== 'object') return null;
      const url = imageData.url || imageData.src || imageData.image_url || imageData.publicUrl;
      if (!url || !/^https?:\/\//i.test(url)) return null;

      return {
        url,
        label: compactText(imageData.label || imageData.name || `Reference ${index + 1}`, 80),
        width: Number.isFinite(imageData.width) ? imageData.width : null,
        height: Number.isFinite(imageData.height) ? imageData.height : null,
      };
    })
    .filter(Boolean)
    .slice(0, maxImages);
}

function compactAssetList(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    name: item?.name,
    role: compactText(item?.role || item?.description, 220),
    description: compactText(item?.description, 320),
    costume: compactText(item?.costume || item?.wardrobe || item?.costume_prompt || item?.outfit, 320),
    visual_prompt: compactText(item?.visual_prompt || item?.prompt || item?.description, 700),
    images: compactAssetImages(item?.images),
    sheetUrl: item?.sheetUrl || item?.sheet_url || null,
  }));
}

function compactWardrobe(wardrobe = []) {
  if (!Array.isArray(wardrobe)) return [];
  return wardrobe.slice(0, 24).map((location, index) => ({
    location_id: location?.location_id || location?.id || `location-${index + 1}`,
    location_name: location?.location_name || location?.name || `Location ${index + 1}`,
    outfits: Array.isArray(location?.outfits)
      ? location.outfits.map((outfit, outfitIndex) => ({
          character_id: outfit?.character_id || outfit?.id || `character-${outfitIndex + 1}`,
          character_name: outfit?.character_name || outfit?.name || `Character ${outfitIndex + 1}`,
          has_outfit_override: Boolean(outfit?.outfit_name || outfit?.name || outfit?.description || outfit?.outfit_description || outfit?.prompt || outfit?.image_url || outfit?.imageUrl || outfit?.url),
          outfit_name: compactText(outfit?.outfit_name || outfit?.name, 160),
          description: compactText(outfit?.description || outfit?.outfit_description || outfit?.prompt, 500),
          image_url: outfit?.image_url || outfit?.imageUrl || outfit?.url || '',
          image_path: outfit?.image_path || '',
        }))
      : [],
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
      scenes: Array.isArray(script.scenes)
        ? script.scenes.slice(0, 24).map(scene => ({
            start: scene?.start,
            end: scene?.end,
            visual: compactText(scene?.visual || scene?.description, 420),
            lyrics: compactText(scene?.lyrics, 220),
          }))
        : [],
    },
    transcript: compactTranscript(transcript),
    characters: compactAssetList(sourceState.characters),
    locations: compactAssetList(sourceState.locations),
    wardrobe: compactWardrobe(sourceState.wardrobe),
    shot_list: sourceShots.map(shot => ({
      n: shot.n,
      p: compactText(shot.p || shot.prompt, 2200),
      start: shot.start,
      end: shot.end,
      duration: shot.duration,
      veo_duration_seconds: shot.veo_duration_seconds,
      lyrics: compactText(shot.lyrics, 300),
      characters: shot.characters,
      locations: shot.locations,
      concept: compactText(shot.concept, 400),
      costumes: compactText(shot.costumes || shot.costume || shot.wardrobe, 360),
      continuity: compactText(shot.continuity || shot.required_continuity || shot.continuity_notes, 520),
      action_timing: compactText(shot.action_timing || shot.timing || shot.actionTiming, 1200),
      visual_style: compactText(shot.visual_style || shot.style || shot.look, 800),
      sound_design: compactText(shot.sound_design || shot.soundDesign || shot.audio_notes, 500),
      negative_constraints: compactText(shot.negative_constraints || shot.constraints || shot.avoid, 900),
      source_scene: compactText(shot.source_scene, 300),
      shot_size: shot.shot_size,
      camera: shot.camera,
      movement: shot.movement,
      beat: compactText(shot.beat, 260),
      image_url: shot.image_url,
      image_prompt: compactText(shot.image_prompt, 1200),
      video_prompt: compactText(shot.video_prompt, 2200),
    })),
  };
}

function compactShotForRequest(shot) {
  return {
    n: shot.n,
    p: compactText(shot.p || shot.prompt, 6400),
    prompt: compactText(shot.prompt, 6400),
    start: shot.start,
    end: shot.end,
    duration: shot.duration,
    veo_duration_seconds: shot.veo_duration_seconds,
    lyrics: compactText(shot.lyrics, 500),
    words: Array.isArray(shot.words) ? shot.words.slice(0, 80) : [],
    characters: shot.characters || [],
    locations: shot.locations || [],
    concept: compactText(shot.concept, 500),
    costumes: compactText(shot.costumes || shot.costume || shot.wardrobe, 500),
    continuity: compactText(shot.continuity || shot.required_continuity || shot.continuity_notes, 700),
    action_timing: compactText(shot.action_timing || shot.timing || shot.actionTiming, 1600),
    visual_style: compactText(shot.visual_style || shot.style || shot.look, 1000),
    sound_design: compactText(shot.sound_design || shot.soundDesign || shot.audio_notes, 700),
    negative_constraints: compactText(shot.negative_constraints || shot.constraints || shot.avoid, 1000),
    source_scene: compactText(shot.source_scene, 400),
    shot_size: shot.shot_size,
    camera: shot.camera,
    movement: shot.movement,
    beat: compactText(shot.beat, 500),
    image_url: shot.image_url,
    image_prompt: compactText(shot.image_prompt, 2000),
    video_prompt: compactText(shot.video_prompt, 6400),
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
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [queueSummary, setQueueSummary] = useState('');
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);

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
        console.warn(`Shot ${index + 1} video generation failed:`, error);
        nextShots = markShotFailure(nextShots, index, error);
        failureCount += 1;
      }

      setShots(nextShots);
      await onDataUpdate({ shot_list: nextShots });
    }

    setGeneratingIndex(null);
    setIsGeneratingAll(false);

    if (failureCount) {
      const setupFailureCount = nextShots.filter(shot => !shot.video_url && shot.video_error && !shot.video_error.retryable).length;
      setGenerationError(
        setupFailureCount
          ? `${setupFailureCount} shot${setupFailureCount === 1 ? '' : 's'} need setup before retrying. Open the shot for details.`
          : `${failureCount} shot${failureCount === 1 ? '' : 's'} need another try. Generate Remaining will retry unfinished clips.`
      );
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

  const handleRewritePrompt = async () => {
    if (editModalIndex === null || isRewritingPrompt) return;
    setIsRewritingPrompt(true);
    try {
      const shot = shots[editModalIndex];
      const res = await fetch('/api/rewrite-shot-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shot,
          projectState,
          mode: 'video',
          currentPrompt: promptDraft,
        }),
      });
      const data = await res.json();
      if (data.prompt) setPromptDraft(data.prompt);
    } catch (err) {
      console.error('Prompt rewrite failed:', err);
    } finally {
      setIsRewritingPrompt(false);
    }
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

  const handleVideoDrop = (e) => {
    e.preventDefault();
    setIsDraggingVideo(false);
    if (isUploading || generatingIndex !== null) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleUploadOwn({ target: { files: [file], value: '' } });
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
      current_step: 11,
    });
    setIsApproving(false);
    onNavigate(11);
  };

  const handleDownload = (shot, index) => {
    if (!shot.video_url) return;
    const a = document.createElement('a');
    a.href = shot.video_url;
    a.download = `shot_${index + 1}.mp4`;
    a.click();
  };

  const generatedCount = shots.filter(shot => shot.video_url).length;
  const remainingCount = shots.length - generatedCount;
  const failedCount = shots.filter(shot => !shot.video_url && shot.video_error).length;

  return (
    <div className="screen active screen-row" id="s10">

      {/* LEFT PANEL */}
      <div className="layout-main">

        {/* Header */}
        <div className="panel-header" style={{ flexWrap: 'wrap' }}>
          <div className="panel-header-left">
            <div className="sidebar-header-kicker">▪ Clips · Render</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.1 }}>
              Bring frames to life.
            </h2>
            <div className="panel-meta-label">
              {shots.length
                ? `${String(generatedCount).padStart(2, '0')} / ${String(shots.length).padStart(2, '0')} ready · ${remainingCount} remaining${failedCount ? ` · ${failedCount} retry` : ''}`
                : 'Create and review video clips for each shot.'}
            </div>
            <div className="flex-row gap-8" style={{ marginTop: '8px' }}>
              <span className="tag-badge tag-teal">◇ Standard clips</span>
              <span className="tag-badge tag-outline">○ Muted · song sync</span>
            </div>
            {queueSummary && <p className="queue-msg" style={{ marginTop: '6px', marginBottom: 0 }}>{queueSummary}</p>}
            {generationError && <p className="queue-msg queue-msg--error" style={{ marginTop: '6px', marginBottom: 0 }}>{generationError}</p>}
          </div>

          <div className="panel-header-right">
            <select className="select-model" style={{ width: '176px' }} value={modelDraft} onChange={(event) => handleModelDraftChange(event.target.value)} title="Video model">
              {VIDEO_GENERATION_MODELS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="flex-row gap-8">
              <button className="btn-teal" onClick={handleGenerateRemaining} disabled={!shots.length || remainingCount === 0 || isGeneratingAll || generatingIndex !== null}>
                {isGeneratingAll ? (
                  <><Loader2 size={14} className="spin" /> Generating {generatingIndex !== null ? `${generatingIndex + 1}/${shots.length}` : 'Videos'}</>
                ) : (
                  <><Wand2 size={14} /> {remainingCount === shots.length ? 'Generate Clips' : `Generate Remaining (${remainingCount})`}</>
                )}
              </button>
              <button className="btn-outline" onClick={handleGenerateAll} disabled={!shots.length || isGeneratingAll || generatingIndex !== null} title="Regenerate every shot, including completed videos">
                <RotateCcw size={14} /> Regenerate All
              </button>
              <button className="btn-teal" onClick={handleApproveAll} disabled={isApproving}>
                {isApproving ? 'Saving...' : <><Check size={14} /> Approve All</>}
              </button>
            </div>
          </div>
        </div>

        {/* Video Gallery */}
        <div id="vidList" className="video-gallery">
          {shots.length > 0 ? (
            <div className="video-gallery-grid">
              {shots.map((shot, i) => (
                <div
                  key={`${shot.n}-${i}`}
                  role="button"
                  tabIndex={0}
                  className={`video-gallery-card${editModalIndex === i ? ' active' : ''}`}
                  onClick={() => openEditor(i)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEditor(i); }
                  }}
                >
                  <div className="video-gallery-frame">
                    {shot.video_url ? (
                      <video src={shot.video_url} poster={shot.image_url || undefined} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : shot.image_url ? (
                      <img src={shot.image_url} alt={shot.n || `Shot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <canvas ref={(el) => (canvasRefs.current[i] = el)} width={640} height={360} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}

                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none' }} />

                    <div style={{ position: 'absolute', left: '12px', right: '12px', bottom: '10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
                          {i + 1}. {shot.n || shot.title || `Shot ${i + 1}`}
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
                          {shot.video_url ? 'Clip ready' : shot.video_error ? 'Try again' : 'Ready to generate'}
                        </div>
                      </div>
                      <div className="flex-center" style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', flexShrink: 0 }}>
                        <Play size={10} fill="white" />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openEditor(i); }}
                      style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.65)', border: editModalIndex === i ? '1px solid var(--cyan-border)' : '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius)', padding: '5px 9px', color: editModalIndex === i ? 'var(--cyan)' : '#fff', fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    >
                      {editModalIndex === i ? 'Editing' : shot.video_url ? 'Edit' : shot.video_error ? 'Retry' : 'Generate'}
                    </button>

                    {generatingIndex === i && (
                      <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', color: 'var(--cyan)', fontSize: '11px', fontWeight: 700 }}>
                        <Loader2 size={14} className="spin" /> Generating...
                      </div>
                    )}

                    {!shot.video_url && shot.video_error && generatingIndex !== i && (
                      <div className="flex-row gap-6" style={{ position: 'absolute', left: '10px', top: '10px', background: 'rgba(60,0,0,0.8)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '999px', padding: '4px 8px', alignItems: 'center', color: 'var(--error)', fontSize: '10px', fontWeight: 700 }}>
                        <AlertTriangle size={10} /> Retry
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-col flex-center gap-16" style={{ padding: '80px 40px' }}>
              <div className="icon-box-lg" style={{ width: '52px', height: '52px' }}>
                <Video size={22} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
                No shots to display. Please add shots in the Shot List step first.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(8)} style={{ fontSize: '12px' }}>Back to Shots</button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Edit panel */}
      {editModalIndex !== null && selectedShot && (
        <div className="edit-side-panel" style={{ animation: 'slideInRight 0.22s cubic-bezier(0.2,0,0,1)' }}>

          <div className="flex-between" style={{ marginBottom: '20px' }}>
            <div>
              <div className="sidebar-header-kicker">▪ Edit Clip</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Clip.</h3>
            </div>
            <button className="modal-close-btn" onClick={() => setEditModalIndex(null)} style={{ borderRadius: '50%' }}>
              <X size={13} />
            </button>
          </div>

          <div className="flex-col gap-16">

            {/* Current clip preview */}
            <div>
              <div className="panel-meta-label" style={{ marginBottom: '6px' }}>Current</div>
              <div className="panel-inset" style={{ aspectRatio: '16/9', padding: 0, flex: 'none', overflow: 'hidden', position: 'relative' }}>
                {selectedShot.video_url ? (
                  <video src={selectedShot.video_url} poster={selectedShot.image_url || undefined} controls muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : selectedShot.image_url ? (
                  <img src={selectedShot.image_url} alt={selectedShot.n || 'Current shot source'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {!selectedShot.video_url && (
                  <div className="flex-center" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    <span style={{ background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, color: 'var(--cyan)' }}>
                      {selectedShot.image_url ? 'Source image ready' : 'Not generated yet'}
                    </span>
                  </div>
                )}
              </div>
              {!selectedShot.video_url && selectedShot.video_error && (
                <div style={{ marginTop: '8px', color: 'var(--error)', fontSize: '12px', lineHeight: 1.45 }}>
                  {selectedShot.video_error.message}
                </div>
              )}
            </div>

            <div style={{ height: '1px', background: 'var(--border)' }} />
            <div className="replace-heading">Replace With</div>

            {/* Section 1: Upload */}
            <div>
              <div className="edit-section-title">1. Upload Your Own</div>
              <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" onChange={handleUploadOwn} style={{ display: 'none' }} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!isUploading && generatingIndex === null) setIsDraggingVideo(true); }}
                onDragEnter={(e) => { e.preventDefault(); if (!isUploading && generatingIndex === null) setIsDraggingVideo(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingVideo(false); }}
                onDrop={handleVideoDrop}
                disabled={isUploading || generatingIndex !== null}
                style={{
                  background: isDraggingVideo ? 'rgba(0,210,200,0.04)' : 'var(--bg-deep)',
                  boxShadow: 'var(--neo-inset)',
                  border: isDraggingVideo ? '1.5px dashed var(--cyan-border)' : '1.5px dashed var(--border-mid)',
                  borderRadius: 'var(--radius)',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  cursor: isUploading || generatingIndex !== null ? 'wait' : 'pointer',
                  opacity: isUploading || generatingIndex !== null ? 0.55 : 1,
                  color: 'var(--text-soft)',
                  boxSizing: 'border-box',
                  transition: 'border-color 160ms ease-out, background 160ms ease-out',
                }}
              >
                {isUploading
                  ? <Loader2 size={20} color="var(--cyan)" className="spin" />
                  : <Upload size={20} color={generatingIndex !== null ? 'var(--text-muted)' : 'var(--cyan)'} />
                }
                <span style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                  {isUploading ? 'Uploading...' : 'Browse Files'}
                </span>
              </button>
            </div>

            {/* Section 2: Generate */}
            <div>
              <div className="edit-section-title">2. Generate with Prompt</div>
              <textarea
                className="textarea-inset"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                style={{ minHeight: '120px', fontSize: '13px', padding: '12px', lineHeight: 1.45, transition: 'border-color 0.15s' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: '8px', marginTop: '8px' }}>
                <select className="select-std" value={modelDraft} onChange={(event) => handleModelDraftChange(event.target.value)} title="Video model" style={{ height: '38px', padding: '8px 10px' }}>
                  {VIDEO_GENERATION_MODELS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select className="select-std" value={durationDraft} onChange={(e) => setDurationDraft(e.target.value)} style={{ height: '38px', padding: '8px 10px' }}>
                  {durationOptions.map(seconds => (
                    <option key={seconds} value={String(seconds)}>{seconds}s</option>
                  ))}
                </select>
              </div>

              <div className="field-note">
                Available clip lengths follow the selected model. Audio stays muted so the final edit stays synced to your main track.
              </div>

              <button className="btn-outline btn-full" onClick={handleRewritePrompt} disabled={isRewritingPrompt || generatingIndex !== null}>
                {isRewritingPrompt ? <><Loader2 size={13} className="spin" /> Rewriting…</> : <><RotateCcw size={13} /> Regenerate Prompt</>}
              </button>
              <button className="btn-orange btn-full" onClick={handleGenerateOne} disabled={generatingIndex !== null || !promptDraft.trim()}>
                {generatingIndex === editModalIndex ? (
                  <><Loader2 size={14} className="spin" /> Generating...</>
                ) : (
                  <><Wand2 size={14} /> {selectedShot.video_error && !selectedShot.video_url ? 'Try Again' : 'Generate New'}</>
                )}
              </button>

              {selectedShot.video_url && (
                <button className="btn-outline btn-full" onClick={() => handleDownload(selectedShot, editModalIndex)}>
                  <Download size={14} /> Download Clip
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
