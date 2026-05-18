'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCcw, Wand2, X } from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
import { DEFAULT_IMAGE_MODEL, IMAGE_GENERATION_MODELS, resolveImageModelOption } from '@/utils/generationModels';
import { normalizeShotList } from '@/utils/shotList';
import { motion, AnimatePresence } from 'framer-motion';
import { sidePanel } from '@/lib/motion';

const MAX_CLIENT_RETRIES = 2;
const CLIENT_REQUEST_TIMEOUT_MS = 130000;

const DESCRIPTION_LIMIT = 120;

function ExpandableText({ text, style }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > DESCRIPTION_LIMIT;
  return (
    <div style={style}>
      {expanded || !isLong ? text : text.slice(0, DESCRIPTION_LIMIT)}
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          style={{
            background: 'none',
            border: 'none',
            padding: '0 0 0 4px',
            cursor: 'pointer',
            color: 'var(--cyan)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            verticalAlign: 'middle',
            lineHeight: 1,
          }}
        >
          {expanded ? '↑ less' : '···'}
        </button>
      )}
    </div>
  );
}

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
    message.includes('failed to fetch')
  );
}

function getFrameErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status);

  if (error?.name === 'AbortError' || status === 408 || message.includes('timeout')) {
    return 'This frame took too long. Try again.';
  }
  if (message.includes('temporarily unavailable') || status >= 500) {
    return 'Frame creation is temporarily unavailable. Try again soon.';
  }
  if (message.includes('missing project') || message.includes('not found')) {
    return 'Project data is unavailable. Reload and try again.';
  }
  return 'Frame could not be created. Please try again.';
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
        lastError = new Error('Image generation request timed out. It can be retried.');
        lastError.retryable = true;
        lastError.status = 408;
      }

      if (!isRetryableClientError(lastError) || attempt === attempts) break;
      await sleep(1200 * attempt + Math.floor(Math.random() * 500));
    }
  }

  lastError.clientAttempts = attempts;
  throw lastError;
}

function buildShotError(error, previousError) {
  return {
    message: getFrameErrorMessage(error),
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

function buildGenerationContext(projectData, sourceShots) {
  const sourceState = Array.isArray(projectData) ? {} : (projectData || {});
  const script = sourceState.script || {};
  const analysis = sourceState.analysis || {};

  return {
    analysis: {
      theme: compactText(analysis.theme, 300),
      mood: compactText(analysis.mood, 300),
      genre: compactText(analysis.genre, 160),
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
    characters: compactAssetList(sourceState.characters),
    locations: compactAssetList(sourceState.locations),
    wardrobe: compactWardrobe(sourceState.wardrobe),
    style_bible: sourceState.style_bible || null,
    shot_list: sourceShots.map(shot => ({
      n: shot.n,
      p: compactText(shot.p || shot.prompt, 2200),
      image_prompt: compactText(shot.image_prompt, 2200),
      start: shot.start,
      end: shot.end,
      duration: shot.duration,
      lyrics: compactText(shot.lyrics, 300),
      characters: shot.characters,
      locations: shot.locations,
      concept: compactText(shot.concept, 400),
      costumes: compactText(shot.costumes || shot.costume || shot.wardrobe, 360),
      continuity: compactText(shot.continuity || shot.required_continuity || shot.continuity_notes, 520),
      action_timing: compactText(shot.action_timing || shot.timing || shot.actionTiming, 900),
      visual_style: compactText(shot.visual_style || shot.style || shot.look, 700),
      negative_constraints: compactText(shot.negative_constraints || shot.constraints || shot.avoid, 700),
      source_scene: compactText(shot.source_scene, 300),
      shot_size: shot.shot_size,
      camera: shot.camera,
      movement: shot.movement,
      beat: compactText(shot.beat, 260),
    })),
  };
}

function compactShotForRequest(shot) {
  return {
    n: shot.n,
    p: compactText(shot.p || shot.prompt, 5600),
    prompt: compactText(shot.prompt, 5600),
    image_prompt: compactText(shot.image_prompt, 5600),
    video_prompt: compactText(shot.video_prompt, 1600),
    start: shot.start,
    end: shot.end,
    duration: shot.duration,
    lyrics: compactText(shot.lyrics, 500),
    words: Array.isArray(shot.words) ? shot.words.slice(0, 60) : [],
    characters: shot.characters || [],
    locations: shot.locations || [],
    concept: compactText(shot.concept, 500),
    costumes: compactText(shot.costumes || shot.costume || shot.wardrobe, 500),
    continuity: compactText(shot.continuity || shot.required_continuity || shot.continuity_notes, 700),
    action_timing: compactText(shot.action_timing || shot.timing || shot.actionTiming, 1400),
    visual_style: compactText(shot.visual_style || shot.style || shot.look, 900),
    negative_constraints: compactText(shot.negative_constraints || shot.constraints || shot.avoid, 900),
    source_scene: compactText(shot.source_scene, 400),
    shot_size: shot.shot_size,
    camera: shot.camera,
    movement: shot.movement,
    beat: compactText(shot.beat, 500),
  };
}

function normalizeSceneName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function inferSceneCharacterTagsFromText(shot, projectCharacters = []) {
  const text = [
    shot?.n,
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
    shot?.lyrics,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const tags = [];
  const seen = new Set();

  (Array.isArray(projectCharacters) ? projectCharacters : []).forEach((character) => {
    const rawName = typeof character === 'string'
      ? character
      : (character?.name || character?.character_name || '');
    const normalized = normalizeSceneName(rawName);
    if (!normalized || seen.has(normalized)) return;
    if (!text.includes(normalized)) return;
    seen.add(normalized);
    tags.push(String(rawName).replace(/\s+/g, ' ').trim());
  });

  return tags;
}

function resolveSceneCharacterTags(shot, projectCharacters = []) {
  const candidates = []
    .concat(Array.isArray(shot?.resolved_characters) ? shot.resolved_characters : [])
    .concat(Array.isArray(shot?.matched_character_names) ? shot.matched_character_names : []);

  const seen = new Set();
  const labels = [];

  candidates.forEach((candidate) => {
    const value = typeof candidate === 'string'
      ? candidate
      : (candidate?.name || candidate?.character_name || '');
    const normalized = normalizeSceneName(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    labels.push(String(value).replace(/\s+/g, ' ').trim());
  });

  if (labels.length) return labels;
  return inferSceneCharacterTagsFromText(shot, projectCharacters);
}

export default function ImagesScreen({ onNavigate, isActive, projectId, projectData, onDataUpdate }) {
  const canvasRefs = useRef([]);
  const modalCanvasRef = useRef(null);
  const initialShots = normalizeShotList(Array.isArray(projectData) ? projectData : projectData?.shot_list || []);
  const [shots, setShots] = useState(() => initialShots);
  const [editModalIndex, setEditModalIndex] = useState(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [modelDraft, setModelDraft] = useState(DEFAULT_IMAGE_MODEL);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [generationError, setGenerationError] = useState('');
  const [queueSummary, setQueueSummary] = useState('');
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);
  const projectCharacterPool = Array.isArray(projectData)
    ? []
    : (Array.isArray(projectData?.characters) ? projectData.characters : []);

  const selectedShot = editModalIndex !== null ? shots[editModalIndex] : null;

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas && !shots[i]?.image_url) drawClubScene(canvas, i * 3 + 7);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, shots]);

  useEffect(() => {
    if (editModalIndex !== null && modalCanvasRef.current && !shots[editModalIndex]?.image_url) {
      drawClubScene(modalCanvasRef.current, editModalIndex * 3 + 7);
    }
  }, [editModalIndex, shots]);

  const openEditor = (index) => {
    setEditModalIndex(index);
    setPromptDraft(shots[index]?.image_prompt || shots[index]?.p || shots[index]?.prompt || '');
    setModelDraft(resolveImageModelOption(shots[index]?.image_model || modelDraft || DEFAULT_IMAGE_MODEL).value);
    setGenerationError('');
    setQueueSummary('');
  };

  const requestShotImage = async (index, promptOverride = null, sourceShots = shots) => {
    if (!projectId) throw new Error('Missing project id');
    const shot = sourceShots[index];
    if (!shot) throw new Error('Shot not found');

    setGeneratingIndex(index);

    const result = await fetchJsonWithRetry('/api/generate-shot-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        shot: compactShotForRequest(shot),
        shotIndex: index,
        projectState: buildGenerationContext(projectData, sourceShots),
        promptOverride: promptOverride || undefined,
        model: modelDraft || DEFAULT_IMAGE_MODEL,
        previousShotImageUrl: sourceShots[index - 1]?.image_url || null,
      }),
    });

    const updatedShot = result.shot || {
      ...shot,
      image_url: result.image_url,
      image_path: result.image_path,
      image_prompt: promptOverride || shot.image_prompt || shot.p,
      image_model: result.image_model || modelDraft || DEFAULT_IMAGE_MODEL,
      image_generated_at: new Date().toISOString(),
      image_error: null,
    };
    return sourceShots.map((item, shotIndex) => shotIndex === index ? updatedShot : item);
  };

  const markShotFailure = (sourceShots, index, error) => {
    const previousError = sourceShots[index]?.image_error;
    const imageError = buildShotError(error, previousError);
    return sourceShots.map((item, shotIndex) => (
      shotIndex === index
        ? { ...item, image_error: imageError }
        : item
    ));
  };

  const runGenerationQueue = async (indices, { promptOverrides = {}, label = 'Image generation' } = {}) => {
    if (!indices.length) return;

    setIsGeneratingAll(indices.length > 1);
    setGenerationError('');
    setQueueSummary(`${label} started for ${indices.length} shot${indices.length === 1 ? '' : 's'}.`);

    let nextShots = [...shots];
    let successCount = 0;
    let failureCount = 0;

    for (const index of indices) {
      try {
        nextShots = await requestShotImage(index, promptOverrides[index], nextShots);
        successCount += 1;
      } catch (error) {
        console.error(`Shot ${index + 1} image generation failed:`, error);
        nextShots = markShotFailure(nextShots, index, error);
        failureCount += 1;
      }

      setShots(nextShots);
      await onDataUpdate({ shot_list: nextShots });
    }

    setGeneratingIndex(null);
    setIsGeneratingAll(false);

    if (failureCount) {
      setGenerationError(`${failureCount} shot${failureCount === 1 ? '' : 's'} need another try. Generate Remaining will retry unfinished frames.`);
    }
    setQueueSummary(`${successCount} ready, ${failureCount} need retry, ${nextShots.filter(shot => !shot.image_url).length} remaining.`);
  };

  const handleGenerateOne = async () => {
    if (editModalIndex === null) return;
    await runGenerationQueue([editModalIndex], {
      promptOverrides: { [editModalIndex]: promptDraft },
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
          projectState: projectData,
          mode: 'image',
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
    await runGenerationQueue(shots.map((_, index) => index), { label: 'Generate all' });
  };

  const handleGenerateRemaining = async () => {
    if (!shots.length || isGeneratingAll) return;
    const remainingIndices = shots
      .map((shot, index) => ({ shot, index }))
      .filter(({ shot }) => !shot.image_url)
      .map(({ index }) => index);

    await runGenerationQueue(remainingIndices, { label: 'Generate remaining' });
  };

  const handleApproveAll = async () => {
    setIsApproving(true);
    await onDataUpdate({
      shot_list: shots,
      images_approved: true,
      current_step: 10,
    });
    setIsApproving(false);
    onNavigate(10);
  };

  const generatedCount = shots.filter(shot => shot.image_url).length;
  const remainingCount = shots.length - generatedCount;
  const failedCount = shots.filter(shot => !shot.image_url && shot.image_error).length;

  return (
    <div className="screen active screen-row" id="s9">

      {/* LEFT PANEL */}
      <div className="layout-main">

        {/* Header */}
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="sidebar-header-kicker">▪ Frames · Render</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.1 }}>
              Paint each frame.
            </h2>
            <div className="panel-meta-label" style={{ marginBottom: queueSummary || generationError ? '4px' : 0 }}>
              {shots.length
                ? `${generatedCount}/${shots.length} ready · ${remainingCount} remaining${failedCount ? ` · ${failedCount} retry` : ''}`
                : '0/0 ready · 0 remaining'}
            </div>
            {queueSummary && <p className="queue-msg" style={{ margin: '4px 0 0' }}>{queueSummary}</p>}
            {generationError && <p className="queue-msg queue-msg--error" style={{ margin: '4px 0 0' }}>{generationError}</p>}
          </div>

          <div className="panel-header-right">
            <select className="select-model" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} title="Image model">
              {IMAGE_GENERATION_MODELS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="flex-row gap-8" style={{ alignItems: 'center' }}>
              <button
                className="btn-teal"
                onClick={handleGenerateRemaining}
                disabled={!shots.length || remainingCount === 0 || isGeneratingAll || generatingIndex !== null}
              >
                {isGeneratingAll ? (
                  <><Loader2 size={14} className="spin" /> Generating {generatingIndex !== null ? `${generatingIndex + 1}/${shots.length}` : 'Images'}</>
                ) : (
                  <><Wand2 size={14} /> {remainingCount === shots.length ? 'Generate Frames' : `Generate Remaining (${remainingCount})`}</>
                )}
              </button>
              <button
                className="btn-outline"
                onClick={handleGenerateAll}
                disabled={!shots.length || isGeneratingAll || generatingIndex !== null}
                title="Regenerate every shot, including completed images"
              >
                <RotateCcw size={14} /> Regenerate All
              </button>
              <button className="btn-teal" onClick={handleApproveAll} disabled={isApproving}>
                {isApproving ? 'Saving...' : <><Check size={14} /> Approve All</>}
              </button>
            </div>
          </div>
        </div>

        {/* Shot list */}
        <div id="imgList" className="shot-list">
          {shots.length > 0 ? shots.map((shot, i) => {
            const sceneCharacterTags = resolveSceneCharacterTags(shot, projectCharacterPool);
            return (
              <div
                key={`${shot.n}-${i}`}
                className={`shot-row ${editModalIndex === i ? 'shot-row--active' : 'shot-row--inactive'}`}
                style={{ transition: 'all 0.2s' }}
              >
                {/* Left column */}
                <div className="shot-details">
                  <div className="shot-number">{String(i + 1).padStart(2, '0')}</div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: editModalIndex === i ? 'var(--cyan)' : 'var(--text)',
                    letterSpacing: '-0.01em',
                    marginBottom: '4px',
                    lineHeight: 1.2,
                  }}>
                    {shot.n || shot.title || `Shot ${i + 1}`}
                  </div>
                  <ExpandableText
                    text={shot.p || shot.prompt || 'No prompt available'}
                    style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '8px' }}
                  />
                  <div className="flex-row" style={{ flexWrap: 'wrap', gap: '5px' }}>
                    {sceneCharacterTags.length ? sceneCharacterTags.map((tag) => (
                      <span key={`${shot.n || i}-${tag}`} className="chip chip--teal" style={{ fontSize: '9px', padding: '3px 8px' }}>
                        {tag}
                      </span>
                    )) : (
                      <span className="chip chip--ghost" style={{ fontSize: '9px', padding: '3px 8px' }}>
                        No named characters
                      </span>
                    )}
                  </div>
                  {!shot.image_url && shot.image_error && (
                    <div className="flex-row gap-6" style={{ marginTop: '7px', color: 'var(--error)', fontSize: '11px', alignItems: 'center' }}>
                      <AlertTriangle size={13} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shot.image_error.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right column — image preview */}
                <div style={{ flexShrink: 0 }}>
                  <div className="shot-thumb neo-flat" style={{ width: '220px', height: '128px', border: '1px solid var(--border)', position: 'relative' }}>
                    {shot.image_url ? (
                      <img src={shot.image_url} alt={shot.n || `Shot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <canvas ref={(el) => (canvasRefs.current[i] = el)} width={220} height={128} style={{ display: 'block' }} />
                    )}
                    {generatingIndex === i && (
                      <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.7)', color: 'var(--cyan)', fontSize: '11px', fontWeight: 700 }}>
                        <Loader2 size={13} className="spin" /> Generating...
                      </div>
                    )}
                    {!shot.image_url && shot.image_error && generatingIndex !== i && (
                      <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.7)', color: 'var(--error)', fontSize: '11px', fontWeight: 700 }}>
                        Try again
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-outline"
                    style={{ fontSize: '11px', padding: '6px 12px', marginTop: '8px', opacity: editModalIndex === i ? 0.5 : 1, cursor: editModalIndex === i ? 'default' : 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    onClick={() => openEditor(i)}
                  >
                    {editModalIndex === i ? 'Editing...' : shot.image_url ? 'Edit & Regenerate' : shot.image_error ? 'Try Again' : 'Edit & Generate'}
                  </button>
                </div>
              </div>
            );
          }) : (
            <div className="flex-col flex-center gap-16" style={{ padding: '80px 40px' }}>
              <div className="icon-box-lg" style={{ width: '52px', height: '52px' }}>
                <ImagePlus size={22} color="var(--cyan)" />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', textAlign: 'center' }}>
                No shots generated yet.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(8)} style={{ fontSize: '12px' }}>
                Back to Shots
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Edit panel */}
      <AnimatePresence>
        {editModalIndex !== null && selectedShot && (
          <motion.div
            key="edit-panel"
            variants={sidePanel}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex-col scroll-y"
            style={{ position: 'sticky', top: 0, width: '440px', height: '100%', background: 'var(--surface-2)', boxShadow: '-4px 0 20px rgba(var(--ink-950-rgb), 0.4)', borderLeft: '1px solid var(--border-mid)', padding: '24px', flexShrink: 0 }}
          >
            {/* Panel header */}
            <div className="flex-between" style={{ marginBottom: '20px' }}>
              <div>
                <div className="sidebar-header-kicker">▪ Edit Frame</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
                  Frame.
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setEditModalIndex(null)} style={{ borderRadius: '50%' }}>
                <X size={13} />
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-col gap-16">

              {/* Two-column grid: Current image + Frame Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="panel-meta-label" style={{ marginBottom: '8px' }}>Current</div>
                  <div className="panel-inset" style={{ aspectRatio: '16/9', padding: 0, flex: 'none', overflow: 'hidden' }}>
                    {selectedShot.image_url ? (
                      <img src={selectedShot.image_url} alt={selectedShot.n || 'Current shot'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                </div>
                <div>
                  <div className="panel-meta-label" style={{ marginBottom: '8px' }}>Frame Status</div>
                  <div className="panel-inset flex-col flex-center gap-6" style={{ aspectRatio: '16/9', flex: 'none', whiteSpace: 'normal' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 600, textAlign: 'center', padding: '0 8px',
                      color: generatingIndex === editModalIndex ? 'var(--cyan)' : selectedShot.image_url ? 'var(--cyan)' : selectedShot.image_error ? 'var(--error)' : 'var(--text-muted)',
                    }}>
                      {generatingIndex === editModalIndex ? 'Generating now...' : selectedShot.image_url ? 'Generated' : selectedShot.image_error ? 'Ready to try again' : 'Not created yet'}
                    </span>
                    {!selectedShot.image_url && selectedShot.image_error && (
                      <span style={{ fontSize: '10px', color: 'var(--error)', lineHeight: 1.4, textAlign: 'center', padding: '0 8px' }}>
                        {selectedShot.image_error.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--border)' }} />

              <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                Replace With
              </div>

              {/* Section 1: Upload */}
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  1. Upload Your Own
                </div>
                <div className="flex-col flex-center gap-8" style={{ background: 'var(--bg-deep)', boxShadow: 'var(--neo-inset)', border: '1.5px dashed var(--border-mid)', borderRadius: 'var(--radius)', padding: '20px', opacity: 0.55 }}>
                  <ImagePlus size={20} color="var(--text-muted)" />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Browse Files</span>
                </div>
              </div>

              {/* Section 2: Generate from Prompt */}
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  2. Generate from Prompt
                </div>
                <textarea
                  className="textarea-inset"
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                  style={{ minHeight: '108px', fontSize: '13px', padding: '12px', lineHeight: 1.45, transition: 'border-color 0.15s' }}
                />
                <select
                  className="select-model"
                  value={modelDraft}
                  onChange={(event) => setModelDraft(event.target.value)}
                  style={{ width: '100%', marginTop: '8px' }}
                  title="Image model"
                >
                  {IMAGE_GENERATION_MODELS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  className="btn-outline"
                  onClick={handleRewritePrompt}
                  disabled={isRewritingPrompt || generatingIndex !== null}
                  style={{ width: '100%', fontSize: '12px', padding: '10px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                >
                  {isRewritingPrompt ? <><Loader2 size={13} className="spin" /> Rewriting…</> : <><RotateCcw size={13} /> Regenerate Prompt</>}
                </button>
                <button
                  className="btn-orange"
                  onClick={handleGenerateOne}
                  disabled={generatingIndex !== null || !promptDraft.trim()}
                  style={{ width: '100%', fontSize: '12px', padding: '10px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
                >
                  {generatingIndex === editModalIndex ? (
                    <><Loader2 size={14} className="spin" /> Generating...</>
                  ) : (
                    <><Wand2 size={14} /> {selectedShot.image_error && !selectedShot.image_url ? 'Try Again' : 'Generate New'}</>
                  )}
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
