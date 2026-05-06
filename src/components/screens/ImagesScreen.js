'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCcw, Wand2 } from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
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
    message: error?.message || 'Image generation failed',
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
    },
    characters: compactAssetList(sourceState.characters),
    locations: compactAssetList(sourceState.locations),
    shot_list: sourceShots.map(shot => ({
      n: shot.n,
      p: compactText(shot.p || shot.prompt, 900),
      start: shot.start,
      end: shot.end,
      duration: shot.duration,
      lyrics: compactText(shot.lyrics, 300),
      characters: shot.characters,
      locations: shot.locations,
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
    p: compactText(shot.p || shot.prompt, 1800),
    prompt: compactText(shot.prompt, 1800),
    start: shot.start,
    end: shot.end,
    duration: shot.duration,
    lyrics: compactText(shot.lyrics, 500),
    words: Array.isArray(shot.words) ? shot.words.slice(0, 60) : [],
    characters: shot.characters || [],
    locations: shot.locations || [],
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
    setPromptDraft(shots[index]?.p || shots[index]?.prompt || '');
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
      }),
    });

    const updatedShot = result.shot || {
      ...shot,
      image_url: result.image_url,
      image_path: result.image_path,
      image_prompt: result.prompt,
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
      setGenerationError(`${failureCount} shot${failureCount === 1 ? '' : 's'} failed after retries. Generate Remaining will retry unfinished shots.`);
    }
    setQueueSummary(`${successCount} generated, ${failureCount} failed, ${nextShots.filter(shot => !shot.image_url).length} remaining.`);
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
      current_step: 9,
    });
    setIsApproving(false);
    onNavigate(9);
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
    <div className="screen active" id="s6" style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
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
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
              Generate Images
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {shots.length
                ? `${generatedCount}/${shots.length} generated · ${remainingCount} remaining${failedCount ? ` · ${failedCount} failed` : ''}`
                : 'Review and generate AI images for each shot in your list'}
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
                  {remainingCount === shots.length ? 'Generate with API' : `Generate Remaining (${remainingCount})`}
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
                background: editModalIndex === i ? 'rgba(0,184,212,0.04)' : 'transparent',
                borderLeft: `3px solid ${editModalIndex === i ? 'var(--teal)' : 'transparent'}`,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: editModalIndex === i ? 'var(--teal)' : 'var(--dark)',
                  marginBottom: '4px',
                  letterSpacing: '-0.01em',
                }}>
                  {i + 1}. {shot.n || shot.title || `Shot ${i + 1}`}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  &quot;{(shot.p || shot.prompt || 'No prompt available').substring(0, 150)}...&quot;
                </div>
                {!shot.image_url && shot.image_error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', color: '#ff8a8a', fontSize: '11px' }}>
                    <AlertTriangle size={13} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Failed after {shot.image_error.attempts || 1} attempt{shot.image_error.attempts === 1 ? '' : 's'}: {shot.image_error.message}
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
                    Needs retry
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
                {editModalIndex === i ? 'Editing...' : shot.image_url ? 'Edit & Re-generate' : shot.image_error ? 'Retry Generate' : 'Edit & Generate'}
              </button>
            </div>
          )) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', gap: '12px' }}>
              <ImagePlus size={28} color="var(--text-muted)" />
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No shots generated yet.
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
              Edit &amp; Generate Image
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
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
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
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'var(--font-display)' }}>
                  API Status
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(0,184,212,0.25)', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,184,212,0.04)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 600 }}>
                    {generatingIndex === editModalIndex
                      ? 'Generating now...'
                      : selectedShot.image_url
                        ? 'Generated'
                        : selectedShot.image_error
                          ? 'Failed, ready to retry'
                          : 'Not generated yet'}
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
                2. Generate with Prompt
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                style={{ ...inputStyle, minHeight: '108px', lineHeight: 1.45 }}
                onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-mid)'}
              />
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
                    {selectedShot.image_error && !selectedShot.image_url ? 'Retry Generate' : 'Generate New'}
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
