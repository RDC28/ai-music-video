'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Loader2, Play, RotateCcw, Upload, Video, Wand2, X } from 'lucide-react';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import QueueStatusBar from '../QueueStatusBar';
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
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

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
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  // ── Queue (concurrency=1 — Veo renders are long-running; space them out) ──
  const videoQueue = useGenerationQueue({ concurrency: 1 });

  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);

  // Reset generatingIndex when the queue finishes so buttons re-enable.
  useEffect(() => {
    if (!videoQueue.isActive) setGeneratingIndex(null);
  }, [videoQueue.isActive]);

  const saveQRef = useRef({ pending: false, latest: null });
  const saveShotList = useCallback(async (data) => {
    saveQRef.current.latest = { shot_list: data };
    if (saveQRef.current.pending) return;
    saveQRef.current.pending = true;
    while (saveQRef.current.latest) {
      const d = saveQRef.current.latest;
      saveQRef.current.latest = null;
      try { await onDataUpdate(d); } catch (e) { console.error('[shots save]', e); }
    }
    saveQRef.current.pending = false;
  }, [onDataUpdate]);
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);
  const [undoClip, setUndoClip] = useState(null);

  const selectedShot = editModalIndex !== null ? shots[editModalIndex] : null;
  const promptLength = promptDraft.length;
  const promptLimit = 6400;
  const promptUsage = promptLength / promptLimit;
  const plannedDuration = selectedShot ? getPlannedVideoDuration(selectedShot, 6) : 6;
  const recommendedDuration = normalizeVideoDurationForModel(plannedDuration, modelDraft);
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

  useEffect(() => {
    if (!undoClip?.expiresAt) return;
    const ttl = Math.max(0, undoClip.expiresAt - Date.now());
    const timer = setTimeout(() => setUndoClip(null), ttl);
    return () => clearTimeout(timer);
  }, [undoClip]);

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

  const rememberUndoForShot = (sourceShots, index) => {
    const previous = sourceShots[index];
    if (!previous?.video_url) return;
    setUndoClip({
      index,
      video_url: previous.video_url,
      video_path: previous.video_path || null,
      expiresAt: Date.now() + 30000,
    });
  };

  const handleUndoReplace = async () => {
    if (!undoClip) return;
    const target = shots[undoClip.index];
    if (!target) {
      setUndoClip(null);
      return;
    }
    const restored = shots.map((shot, index) => (
      index === undoClip.index
        ? {
            ...shot,
            video_url: undoClip.video_url,
            video_path: undoClip.video_path,
            video_error: null,
          }
        : shot
    ));
    setShots(restored);
    await onDataUpdate({ shot_list: restored });
    setQueueSummary(`Restored previous clip for shot ${undoClip.index + 1}.`);
    setUndoClip(null);
  };

  // Enqueues video jobs — concurrency=1 preserving the 35s inter-clip spacing
  // that keeps Veo's long-running renders reliable.
  const runGenerationQueue = (indices, { promptOverrides = {}, durationOverrides = {} } = {}) => {
    if (!indices.length) return;
    // Closure counter so only the 2nd+ job adds the pre-generation delay.
    let clipsStarted = 0;
    videoQueue.enqueue(
      indices.map(index => ({
        id: `vid-${index}-${Date.now()}`,
        label: `Shot ${index + 1}`,
        run: async () => {
          if (clipsStarted > 0) await sleep(35000);
          clipsStarted++;
          rememberUndoForShot(shotsRef.current, index);
          const source = shotsRef.current;
          try {
            const updatedShots = await requestShotVideo(
              index,
              promptOverrides[index] ?? null,
              source,
              { durationSeconds: Number.isFinite(durationOverrides[index]) ? durationOverrides[index] : undefined }
            );
            const updatedShot = updatedShots[index];
            setShots(prev => prev.map((s, i) => i === index ? updatedShot : s));
            shotsRef.current = shotsRef.current.map((s, i) => i === index ? updatedShot : s);
            await saveShotList(shotsRef.current);
            return updatedShot;
          } catch (err) {
            const failed = markShotFailure(shotsRef.current, index, err);
            setShots(prev => markShotFailure(prev, index, err));
            shotsRef.current = failed;
            try { await saveShotList(failed); } catch { /* best-effort */ }
            throw err;
          }
        },
      }))
    );
  };

  const handleGenerateOne = () => {
    if (editModalIndex === null) return;
    runGenerationQueue([editModalIndex], {
      promptOverrides: { [editModalIndex]: promptDraft },
      durationOverrides: { [editModalIndex]: Number(durationDraft) || getPlannedVideoDuration(shots[editModalIndex], 6) },
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

  const handleGenerateAll = () => {
    if (!shots.length || videoQueue.isActive) return;
    if (!confirm(`Regenerate all ${shots.length} clips? This will replace existing generated clips.`)) return;
    runGenerationQueue(shots.map((_, index) => index));
  };

  const handleGenerateRemaining = () => {
    if (!shots.length || videoQueue.isActive) return;
    const remainingIndices = shots
      .map((shot, index) => ({ shot, index }))
      .filter(({ shot }) => !shot.video_url)
      .map(({ index }) => index);
    runGenerationQueue(remainingIndices);
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
      rememberUndoForShot(shots, editModalIndex);
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
    if (!shots.length) return;
    if (!confirm(`Approve all ${shots.length} clips and continue to Editor?`)) return;
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

  const generatedCount = shots.filter(shot => shot.video_url).length;
  const remainingCount = shots.length - generatedCount;
  const failedCount = shots.filter(shot => !shot.video_url && shot.video_error).length;
  const screenTitle = generatedCount > 0 ? `${generatedCount} moments. Let's make them move.` : 'Bring frames to life.';

  const mainPanel = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

        {/* Header */}
        <div className="panel-header clips-header">
          <div className="clips-header-top">
            <div className="clips-header-copy">
              <div className="sidebar-header-kicker">Clips · Render</div>
              <h2 className="clips-screen-title">{screenTitle}</h2>
              <div className="panel-meta-label">
                {shots.length
                  ? `${String(generatedCount).padStart(2, '0')} / ${String(shots.length).padStart(2, '0')} ready · ${remainingCount} remaining${failedCount ? ` · ${failedCount} retry` : ''}`
                  : 'Create and review video clips for each shot.'}
              </div>
              <div className="clips-mode-tags">
                <span className="tag-badge tag-teal">◇ Standard clips</span>
                <span className="tag-badge tag-outline">○ Muted · song sync</span>
              </div>
            </div>

            <div className="clips-header-actions">
              <button className="btn-action-generate" onClick={handleGenerateRemaining} disabled={!shots.length || remainingCount === 0 || videoQueue.isActive || generatingIndex !== null}>
                {videoQueue.isActive ? (
                  <><Loader2 size={14} className="spin" /> {generatingIndex !== null ? `Shot ${generatingIndex + 1}` : `${videoQueue.stats.done}/${videoQueue.stats.total} done`}</>
                ) : (
                  <><Wand2 size={14} /> {remainingCount === shots.length ? 'Generate Clips' : `Generate Remaining (${remainingCount})`}</>
                )}
              </button>
              <button className="btn-outline" onClick={handleGenerateAll} disabled={!shots.length || videoQueue.isActive || generatingIndex !== null} title="Regenerate every shot, including completed videos">
                <RotateCcw size={14} /> Regenerate All ({shots.length})
              </button>
              <button className="btn-confirm" onClick={handleApproveAll} disabled={isApproving}>
                {isApproving ? 'Saving...' : <><Check size={14} /> Approve All</>}
              </button>
            </div>
          </div>
        </div>

        {/* Gallery — flex:1 + overflow-y:auto fills remaining height, width follows parent */}
        <div id="vidList" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem 1.5rem 3.5rem' }}>
          {shots.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(22rem, 1fr))', gap: '1rem', alignContent: 'start', width: '100%' }}>
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
                  {/* Frame — aspect ratio drives card height */}
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'var(--ink-950)', overflow: 'hidden' }}>
                    {shot.video_url ? (
                      <video src={shot.video_url} poster={shot.image_url || undefined} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : shot.image_url ? (
                      <img src={shot.image_url} alt={shot.n || `Shot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <canvas ref={(el) => (canvasRefs.current[i] = el)} width={640} height={360} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}

                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(var(--ink-950-rgb), 0.1) 0%, transparent 40%, rgba(var(--ink-950-rgb), 0.8) 100%)', pointerEvents: 'none' }} />

                    <div style={{ position: 'absolute', left: '0.75rem', right: '0.75rem', bottom: '0.625rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 0.0625rem 0.5rem rgba(var(--ink-950-rgb), 0.9)' }}>
                          {i + 1}. {shot.n || shot.title || `Shot ${i + 1}`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(var(--cyan-300-rgb), 0.78)', marginTop: '0.125rem' }}>
                          {shot.video_url ? 'Clip ready' : shot.video_error ? 'Try again' : 'Ready to generate'}
                        </div>
                      </div>
                      <div className="flex-center" style={{ width: '1.75rem', height: '1.75rem', borderRadius: '50%', background: 'rgba(var(--ink-950-rgb), 0.72)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.28)', color: 'var(--text)', flexShrink: 0 }}>
                        <Play size={11} fill="var(--text)" />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openEditor(i); }}
                      style={{ position: 'absolute', top: '0.625rem', right: '0.625rem', background: editModalIndex === i ? 'rgba(var(--cyan-rgb), 0.24)' : 'rgba(var(--ink-950-rgb), 0.78)', border: editModalIndex === i ? '0.0625rem solid rgba(var(--cyan-rgb), 0.64)' : '0.0625rem solid rgba(var(--cyan-300-rgb), 0.28)', borderRadius: 'var(--radius)', padding: '0.375rem 0.625rem', color: editModalIndex === i ? 'var(--text)' : 'var(--text-soft)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: '0 0.125rem 0.625rem rgba(var(--ink-950-rgb), 0.4)' }}
                    >
                      {editModalIndex === i ? 'Editing' : shot.video_url ? 'Edit' : shot.video_error ? 'Retry' : 'Edit & Generate'}
                    </button>

                    {generatingIndex === i && (
                      <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.7)', color: 'var(--cyan)', fontSize: '0.75rem', fontWeight: 700 }}>
                        <Loader2 size={14} className="spin" /> Generating...
                      </div>
                    )}

                    {!shot.video_url && shot.video_error && generatingIndex !== i && (
                      <div className="flex-row gap-6" style={{ position: 'absolute', left: '0.625rem', top: '0.625rem', background: 'rgba(var(--violet-rgb), 0.8)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.3)', borderRadius: '62.5rem', padding: '0.25rem 0.5rem', alignItems: 'center', color: 'var(--error)', fontSize: '0.6875rem', fontWeight: 700 }}>
                        <AlertTriangle size={10} /> Retry
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-col flex-center gap-16" style={{ padding: '5rem 2.5rem' }}>
              <div className="icon-box-lg" style={{ width: '3.25rem', height: '3.25rem' }}>
                <Video size={22} />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
                Your clips will live here. Head to Shots to plan your sequence first.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(8)}>Go to Shots →</button>
            </div>
          )}
        </div>

        {undoClip && (
          <div style={{ position: 'absolute', right: '1.5rem', bottom: '5.25rem', pointerEvents: 'auto' }}>
            <button className="btn-outline-small" onClick={handleUndoReplace}>
              Undo Replace
            </button>
          </div>
        )}
    </div>
  );

  const rightPanel = (
    <div className="edit-side-panel clip-edit-panel" style={{ height: '100%' }}>
      {editModalIndex !== null && selectedShot ? (
        <div style={{ animation: 'editPanelContentIn 0.22s 0.18s cubic-bezier(0.2,0,0,1) both' }}>

          <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
            <div>
              <div className="sidebar-header-kicker">Edit Clip</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Edit Clip {editModalIndex + 1}
              </h3>
              <div className="field-note" style={{ marginTop: '0.25rem' }}>Shot {editModalIndex + 1} of {shots.length}</div>
            </div>
            <button className="modal-close-btn" onClick={() => setEditModalIndex(null)} style={{ borderRadius: '50%' }}>
              <X size={13} />
            </button>
          </div>

          <div className="flex-col gap-16">

            {/* Current clip preview */}
            <div>
              <div className="panel-meta-label" style={{ marginBottom: '0.375rem' }}>Current</div>
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
                    <span style={{ background: 'rgba(var(--ink-950-rgb), 0.6)', padding: '0.375rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--cyan)' }}>
                      {selectedShot.image_url ? 'Source image ready' : 'Not generated yet'}
                    </span>
                  </div>
                )}
              </div>
              {!selectedShot.video_url && selectedShot.video_error && (
                <div style={{ marginTop: '0.5rem', color: 'var(--error)', fontSize: '0.8125rem', lineHeight: 1.45 }}>
                  {selectedShot.video_error.message}
                </div>
              )}
            </div>

            <div style={{ height: '0.0625rem', background: 'var(--border)' }} />
            <div className="replace-heading">Replace With</div>

            {/* Upload */}
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
                  background: isDraggingVideo ? 'rgba(var(--cyan-rgb), 0.04)' : 'var(--bg-deep)',
                  boxShadow: 'var(--neo-inset)',
                  border: isDraggingVideo ? '0.0938rem dashed var(--cyan-border)' : '0.0938rem dashed var(--border-mid)',
                  borderRadius: 'var(--radius)',
                  padding: '1.125rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
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
                <span style={{ fontSize: '0.8125rem', fontWeight: 650, fontFamily: 'var(--font-body)' }}>
                  {isUploading ? 'Uploading...' : 'Browse Files'}
                </span>
              </button>
            </div>

            {/* Generate */}
            <div>
              <div className="edit-section-title">2. Generate with Prompt</div>
              <textarea
                className="textarea-inset"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                style={{ minHeight: '12rem', fontSize: '0.8125rem', padding: '0.75rem', lineHeight: 1.45, transition: 'border-color 0.15s' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem' }}>
                <button type="button" className="btn-outline-small" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(promptDraft || '');
                    setQueueSummary(`Prompt copied from shot ${editModalIndex + 1}.`);
                  } catch {
                    setGenerationError('Could not copy prompt to clipboard.');
                  }
                }}>
                  <Copy size={12} /> Copy Prompt
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6562rem', color: promptUsage >= 0.95 ? 'var(--error)' : promptUsage >= 0.8 ? 'var(--warning)' : 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {promptLength} / {promptLimit}
                </span>
              </div>

              <div className="panel-form-grid panel-form-grid--narrow" style={{ marginTop: '0.5rem' }}>
                <select className="select-std" value={modelDraft} onChange={(event) => handleModelDraftChange(event.target.value)} title="Video model" style={{ height: '2.375rem', padding: '0.5rem 0.625rem' }}>
                  {VIDEO_GENERATION_MODELS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select className="select-std" value={durationDraft} onChange={(e) => setDurationDraft(e.target.value)} style={{ height: '2.375rem', padding: '0.5rem 0.625rem' }}>
                  {durationOptions.map(seconds => (
                    <option key={seconds} value={String(seconds)}>
                      {seconds}s{seconds === recommendedDuration ? ' (recommended)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-note">
                Shot planned: {plannedDuration.toFixed(1)}s. Recommended clip length: {recommendedDuration}s.
              </div>
              <div className="field-note">
                Available clip lengths follow the selected model. Audio stays muted so the final edit stays synced to your main track.
              </div>

              <button className="btn-action-generate btn-full" onClick={handleRewritePrompt} disabled={isRewritingPrompt || generatingIndex !== null}>
                {isRewritingPrompt ? <><Loader2 size={13} className="spin" /> Rewriting…</> : <><RotateCcw size={13} /> Regenerate Prompt</>}
              </button>
              <button className="btn-action-generate btn-full" onClick={async () => {
                if (selectedShot.video_url) {
                  const shouldReplace = confirm(`Replace existing clip for shot ${editModalIndex + 1}?`);
                  if (!shouldReplace) return;
                }
                await handleGenerateOne();
              }} disabled={generatingIndex !== null || !promptDraft.trim()}>
                {generatingIndex === editModalIndex ? (
                  <><Loader2 size={14} className="spin" /> Generating...</>
                ) : (
                  <><Wand2 size={14} /> {selectedShot.video_error && !selectedShot.video_url ? 'Try Again' : selectedShot.video_url ? 'Replace Clip' : 'Generate New'}</>
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
      ) : (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="panel-flat">
            <div className="panel-meta-label">Clip Editor</div>
            <p className="body-sm">
              Click <strong>Edit</strong> on any clip card to open per-clip controls here.
            </p>
          </div>

          <div className="panel-flat">
            <div className="panel-meta-label">Model</div>
            <select className="select-model" style={{ width: '100%' }} value={modelDraft} onChange={(event) => handleModelDraftChange(event.target.value)} title="Video model">
              {VIDEO_GENERATION_MODELS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="panel-flat" style={{ marginTop: 'auto' }}>
            <div className="panel-meta-label">Progress</div>
            <p className="body-sm">
              {shots.length
                ? `${String(generatedCount).padStart(2, '0')} / ${String(shots.length).padStart(2, '0')} ready · ${remainingCount} remaining${failedCount ? ` · ${failedCount} retry` : ''}`
                : 'Create and review video clips for each shot.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="screen active screen-fill" id="s9">
      <WorkflowThreePaneShell
        showLeftPanel={false}
        sidebarTitle="Clips"
        rightTitle={editModalIndex !== null ? 'Edit Clip' : 'Actions'}
        storageKey="workflow-three-pane:s9"
        sidebar={(
          <div style={{ padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="panel-flat">
              <div className="panel-meta-label">Clip Render</div>
              <p className="body-sm">Turn approved frames into shot clips, then approve all clips for the editor step.</p>
            </div>
            <div className="panel-flat">
              <div className="metric-large">{generatedCount}<span className="metric-small-label">ready</span></div>
              <p className="body-sm body-sm--mt">{remainingCount} clips remaining.</p>
            </div>
          </div>
        )}
        main={mainPanel}
        right={rightPanel}
      />

      <QueueStatusBar
        jobs={videoQueue.jobs}
        isActive={videoQueue.isActive}
        stats={videoQueue.stats}
        onAbort={videoQueue.abort}
        onClear={videoQueue.clear}
        label="Shot videos"
      />
    </div>
  );
}
