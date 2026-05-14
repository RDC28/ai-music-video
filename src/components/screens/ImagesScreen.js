'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCcw, Wand2 } from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
import { DEFAULT_IMAGE_MODEL, IMAGE_GENERATION_MODELS, resolveImageModelOption } from '@/utils/generationModels';
import { normalizeShotList } from '@/utils/shotList';

const MAX_CLIENT_RETRIES = 2;
const CLIENT_REQUEST_TIMEOUT_MS = 130000;

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

  const generatedCount = shots.filter(shot => shot.image_url).length;
  const remainingCount = shots.length - generatedCount;
  const failedCount = shots.filter(shot => !shot.image_url && shot.image_error).length;

  return (
    <div className="screen active" id="s9" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
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
            <div className="kicker" style={{ marginBottom: '10px' }}>Frames · Render</div>
            <h1 className="editorial-title editorial-h2" style={{ marginBottom: '8px' }}>
              Paint each <span className="text-grad">frame.</span>
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
                : 'Review and create a visual frame for each shot in your list.'}
            </p>
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
              onChange={(event) => setModelDraft(event.target.value)}
              style={{ ...inputStyle, width: '190px', height: '38px', padding: '8px 10px', flexShrink: 0 }}
              title="Image model"
            >
              {IMAGE_GENERATION_MODELS.map(option => (
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
                  Generating {generatingIndex !== null ? `${generatingIndex + 1}/${shots.length}` : 'Images'}
                </>
              ) : (
                <>
                  <Wand2 size={14} />
                  {remainingCount === shots.length ? 'Generate Frames' : `Generate Remaining (${remainingCount})`}
                </>
              )}
            </button>
            <button
              className="btn-outline"
              onClick={handleGenerateAll}
              disabled={!shots.length || isGeneratingAll || generatingIndex !== null}
              style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}
              title="Regenerate every shot, including completed images"
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

        <div id="imgList" style={{ flex: 1, overflowY: 'auto' }}>
          {shots.length > 0 ? shots.map((shot, i) => (
            <div
              key={`${shot.n}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 28px',
                borderBottom: '1px solid var(--border)',
                background: editModalIndex === i ? 'rgba(124,58,237,0.04)' : 'transparent',
                borderLeft: `3px solid ${editModalIndex === i ? 'var(--teal)' : 'transparent'}`,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '12px',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontSize: '17px',
                      fontWeight: 500,
                      color: editModalIndex === i ? 'var(--teal)' : 'var(--dark)',
                      letterSpacing: '-0.022em',
                      lineHeight: 1.15,
                    }}
                  >
                    {shot.n || shot.title || `Shot ${i + 1}`}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  &quot;{(shot.p || shot.prompt || 'No prompt available').substring(0, 150)}...&quot;
                </div>
                {!shot.image_url && shot.image_error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', color: '#ff8a8a', fontSize: '11px' }}>
                    <AlertTriangle size={13} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Needs another try: {shot.image_error.message}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, width: '240px', height: '140px', background: 'var(--surface)', position: 'relative' }}>
                {shot.image_url ? (
                  <img src={shot.image_url} alt={shot.n || `Shot ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <canvas
                    ref={(el) => (canvasRefs.current[i] = el)}
                    width={240}
                    height={140}
                    style={{ display: 'block' }}
                  />
                )}
                {generatingIndex === i && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.56)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)', fontSize: '11px', fontWeight: 700 }}>
                    Generating...
                  </div>
                )}
                {!shot.image_url && shot.image_error && generatingIndex !== i && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff8a8a', fontSize: '11px', fontWeight: 700 }}>
                    Try again
                  </div>
                )}
              </div>

              <button
                className="btn-outline"
                style={{
                  fontSize: '11px',
                  padding: '6px 14px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: editModalIndex === i ? 0.4 : 1,
                  cursor: editModalIndex === i ? 'default' : 'pointer',
                }}
                onClick={() => openEditor(i)}
              >
                {editModalIndex === i ? 'Editing...' : shot.image_url ? 'Edit & Regenerate' : shot.image_error ? 'Try Again' : 'Edit & Generate'}
              </button>
            </div>
          )) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', gap: '12px' }}>
              <ImagePlus size={28} color="var(--text-muted)" />
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No shots generated yet.
              </div>
              <button className="btn-outline" onClick={() => onNavigate(8)} style={{ fontSize: '12px' }}>
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
              Edit Frame
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                  Current
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/9', background: 'var(--surface)' }}>
                  {selectedShot.image_url ? (
                    <img src={selectedShot.image_url} alt={selectedShot.n || 'Current shot'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                  Frame Status
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(124,58,237,0.25)', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,58,237,0.04)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 600 }}>
                    {generatingIndex === editModalIndex
                      ? 'Generating now...'
                      : selectedShot.image_url
                        ? 'Generated'
                        : selectedShot.image_error
                          ? 'Ready to try again'
                          : 'Not created yet'}
                  </span>
                </div>
                {!selectedShot.image_url && selectedShot.image_error && (
                  <div style={{ marginTop: '8px', color: '#ff8a8a', fontSize: '11px', lineHeight: 1.45 }}>
                    {selectedShot.image_error.message}
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border)' }} />

            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
              Replace With
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                1. Upload Your Own
              </div>
              <div style={{
                border: '1px dashed var(--border-mid)',
                borderRadius: '8px',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '20px',
                cursor: 'default',
                opacity: 0.55,
              }}>
                <ImagePlus size={20} color="var(--text-muted)" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Browse Files</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                2. Generate from Prompt
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                style={{ ...inputStyle, minHeight: '108px', lineHeight: 1.45 }}
                onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
              />
              <select
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                style={{ ...inputStyle, height: '38px', padding: '8px 10px', marginTop: '8px' }}
                title="Image model"
              >
                {IMAGE_GENERATION_MODELS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
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
                    {selectedShot.image_error && !selectedShot.image_url ? 'Try Again' : 'Generate New'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
