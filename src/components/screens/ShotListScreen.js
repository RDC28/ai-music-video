'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Wand2,
} from 'lucide-react';
import { drawClubScene } from '@/utils/drawClubScene';
import { DEFAULT_IMAGE_MODEL, IMAGE_GENERATION_MODELS, resolveImageModelOption } from '@/utils/generationModels';
import { getPlannedVideoDuration, getProjectAudioDuration, getShotTimingLabel, normalizeShot, normalizeShotListForVeo } from '@/utils/shotList';

// Styles moved to components.css as .input-inset, .form-label, .icon-btn

const splitTags = (value) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const CLIENT_REQUEST_TIMEOUT_MS = 130000;

function getFrameErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status);
  if (error?.name === 'AbortError' || status === 408 || message.includes('timeout')) {
    return 'This frame took too long. Try again.';
  }
  if (message.includes('temporarily unavailable') || status >= 500) {
    return 'Frame creation is temporarily unavailable. Try again soon.';
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

export default function ShotListScreen({
  onNavigate,
  projectId,
  isActive,
  projectData,
  onDataUpdate,
  onContinueToFrames,
  continueLabel = 'Continue to Clips',
}) {
  const audioDuration = useMemo(() => getProjectAudioDuration(projectData), [projectData]);
  const shots = useMemo(
    () => normalizeShotListForVeo(projectData?.shot_list || [], { audioDuration }),
    [audioDuration, projectData?.shot_list]
  );
  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [modelDraft, setModelDraft] = useState(DEFAULT_IMAGE_MODEL);
  const [generatingIndex, setGeneratingIndex] = useState(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [queueSummary, setQueueSummary] = useState('');
  const canvasRefs = useRef([]);
  const modalCanvasRef = useRef(null);
  const hasActiveEdit = editingIndex !== null && Boolean(shots[editingIndex]) && Boolean(editDraft);

  const commitShots = async (nextShots, extra = {}) => {
    await onDataUpdate({
      shot_list: nextShots.map((shot, index) => normalizeShot(shot, index)),
      ...extra,
    });
  };

  const startEditing = (index) => {
    setEditingIndex(index);
    setModelDraft(resolveImageModelOption(shots[index]?.image_model || modelDraft || DEFAULT_IMAGE_MODEL).value);
    setGenerationError('');
    setQueueSummary('');
    setEditDraft({
      ...shots[index],
      charactersText: (shots[index].characters || []).join(', '),
      locationsText: (shots[index].locations || []).join(', '),
    });
  };

  const closeEditing = () => {
    setEditingIndex(null);
    setEditDraft(null);
  };

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      canvasRefs.current.forEach((canvas, index) => {
        if (canvas && !shots[index]?.image_url) drawClubScene(canvas, index * 3 + 7);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isActive, shots]);

  useEffect(() => {
    if (editingIndex !== null && modalCanvasRef.current && !shots[editingIndex]?.image_url) {
      drawClubScene(modalCanvasRef.current, editingIndex * 3 + 7);
    }
  }, [editingIndex, shots]);

  const handleMove = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= shots.length) return;
    const next = [...shots];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    await commitShots(next);
    if (editingIndex === index) {
      setEditingIndex(target);
    }
  };

  const handleDuplicate = async (index) => {
    const next = [...shots];
    const duplicate = {
      ...shots[index],
      n: `${shots[index].n} Copy`,
    };
    next.splice(index + 1, 0, duplicate);
    await commitShots(next);
    setEditingIndex(index + 1);
    setEditDraft({
      ...duplicate,
      charactersText: (duplicate.characters || []).join(', '),
      locationsText: (duplicate.locations || []).join(', '),
    });
  };

  const handleDelete = async (index) => {
    const next = shots.filter((_, shotIndex) => shotIndex !== index);
    await commitShots(next);
    closeEditing();
  };

  const handleAddShot = async () => {
    const nextShot = {
      n: `Shot ${shots.length + 1}`,
      p: '',
      image_prompt: '',
      video_prompt: '',
      duration: 6,
      veo_duration_seconds: 6,
      characters: [],
      locations: [],
      movement: 'static',
      camera: 'plain 16:9 source-footage framing',
    };
    const next = [...shots, nextShot];
    await commitShots(next);
    setEditingIndex(next.length - 1);
    setEditDraft({
      ...nextShot,
      charactersText: '',
      locationsText: '',
    });
  };

  const handleSave = async () => {
    if (editingIndex === null || !editDraft) return;
    const { charactersText, locationsText, ...draftFields } = editDraft;
    const start = editDraft.start === '' ? undefined : Number(editDraft.start);
    const end = editDraft.end === '' ? undefined : Number(editDraft.end);
    const requestedDuration = editDraft.duration === '' ? shots[editingIndex].duration : Number(editDraft.duration);
    const duration = Number(Math.min(Math.max(requestedDuration, 0.1), 8).toFixed(2));
    const veoDuration = getPlannedVideoDuration({ ...shots[editingIndex], ...draftFields, duration }, 6);
    const next = [...shots];
    next[editingIndex] = normalizeShot({
      ...shots[editingIndex],
      ...draftFields,
      image_model: modelDraft || draftFields.image_model || shots[editingIndex].image_model,
      start: Number.isFinite(start) ? start : undefined,
      end: Number.isFinite(start) ? Number((start + duration).toFixed(2)) : (Number.isFinite(end) ? end : undefined),
      duration: Number.isFinite(duration) ? duration : 6,
      veo_duration_seconds: veoDuration,
      characters: splitTags(charactersText || ''),
      locations: splitTags(locationsText || ''),
    }, editingIndex);
    await commitShots(next);
    closeEditing();
  };

  const requestShotImage = async (index, promptOverride = null, sourceShots = shots) => {
    if (!projectId) throw new Error('Missing project id');
    const shot = sourceShots[index];
    if (!shot) throw new Error('Shot not found');

    setGeneratingIndex(index);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('/api/generate-shot-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          projectId,
          shot,
          shotIndex: index,
          projectState: projectData || {},
          promptOverride: promptOverride || undefined,
          model: modelDraft || DEFAULT_IMAGE_MODEL,
          previousShotImageUrl: sourceShots[index - 1]?.image_url || null,
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok || result.error) {
        const error = new Error(result.error || `Request failed with ${response.status}`);
        error.status = result.status || response.status;
        throw error;
      }

      const updatedShot = result.shot || {
        ...shot,
        image_url: result.image_url,
        image_path: result.image_path,
        image_prompt: promptOverride || shot.image_prompt || shot.p,
        image_model: modelDraft || DEFAULT_IMAGE_MODEL,
        image_generated_at: new Date().toISOString(),
        image_error: null,
      };
      return sourceShots.map((item, shotIndex) => (shotIndex === index ? updatedShot : item));
    } finally {
      clearTimeout(timeout);
    }
  };

  const runGenerationQueue = async (indices, { promptOverrides = {}, label = 'Frame generation' } = {}) => {
    if (!indices.length || !projectId) return;
    setGenerationError('');
    setQueueSummary(`${label} started for ${indices.length} shot${indices.length === 1 ? '' : 's'}.`);
    setIsGeneratingAll(indices.length > 1);

    let nextShots = [...shots];
    let successCount = 0;
    let failureCount = 0;

    for (const index of indices) {
      try {
        nextShots = await requestShotImage(index, promptOverrides[index], nextShots);
        successCount += 1;
      } catch (error) {
        failureCount += 1;
        nextShots = nextShots.map((item, shotIndex) => (
          shotIndex === index
            ? {
                ...item,
                image_error: {
                  message: getFrameErrorMessage(error),
                  status: error?.status || null,
                  failed_at: new Date().toISOString(),
                },
              }
            : item
        ));
      }
    }

    await commitShots(nextShots);
    if (editingIndex !== null && nextShots[editingIndex]) {
      setEditDraft((prev) => prev ? ({
        ...nextShots[editingIndex],
        charactersText: (nextShots[editingIndex].characters || []).join(', '),
        locationsText: (nextShots[editingIndex].locations || []).join(', '),
      }) : prev);
    }

    setGeneratingIndex(null);
    setIsGeneratingAll(false);
    setQueueSummary(`${successCount} ready, ${failureCount} need retry, ${nextShots.filter(shot => !shot.image_url).length} remaining.`);
    if (failureCount) {
      setGenerationError(`${failureCount} shot${failureCount === 1 ? '' : 's'} need another try.`);
    }
  };

  const handleGenerateOne = async () => {
    if (editingIndex === null || !editDraft) return;
    await runGenerationQueue([editingIndex], {
      promptOverrides: { [editingIndex]: editDraft.image_prompt || editDraft.p || '' },
      label: `Shot ${editingIndex + 1}`,
    });
  };

  const handleGenerateAll = async () => {
    if (!shots.length || isGeneratingAll) return;
    await runGenerationQueue(shots.map((_, index) => index), { label: 'Generate all frames' });
  };

  const handleGenerateRemaining = async () => {
    if (!shots.length || isGeneratingAll) return;
    const remainingIndices = shots
      .map((shot, index) => ({ shot, index }))
      .filter(({ shot }) => !shot.image_url)
      .map(({ index }) => index);
    await runGenerationQueue(remainingIndices, { label: 'Generate remaining frames' });
  };

  const handleContinue = async () => {
    await commitShots(shots, { shots_arranged: true, current_step: 9 });
    if (typeof onContinueToFrames === 'function') {
      onContinueToFrames();
      return;
    }
    onNavigate(9);
  };

  const generatedCount = shots.filter((shot) => shot.image_url).length;
  const remainingCount = Math.max(shots.length - generatedCount, 0);
  const failedCount = shots.filter((shot) => !shot.image_url && shot.image_error).length;

  return (
    <div className={`screen active screen-row${hasActiveEdit ? ' shot-edit-open' : ''}`} id="s8">

      {/* LEFT PANEL */}
      <div className="layout-main">

        {/* Header */}
        <div className="panel-header shot-header">
          <div className="shot-header-top">
            <div className="shot-header-copy">
              <div className="sidebar-header-kicker">▪ Shots · Sequence</div>
              <h1 className="shot-screen-title">
                Arrange the cuts.
              </h1>
              {shots.length > 0 && (
                <p className="body-sm shot-screen-subtitle">
                  {`${shots.length} approved shots ready to reorder, edit, and generate frames.`}
                </p>
              )}
            </div>
          </div>

          <div className="shot-header-actions">
            <button className="btn-outline" onClick={() => onNavigate(7)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>← Shot Plan</button>
            <button className="btn-outline" onClick={handleAddShot} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> + Add shot
            </button>
            <select className="select-model" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} title="Image model">
              {IMAGE_GENERATION_MODELS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              className="btn-teal"
              onClick={handleGenerateRemaining}
              disabled={!shots.length || remainingCount === 0 || isGeneratingAll || generatingIndex !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
            >
              {isGeneratingAll ? <><Loader2 size={14} className="spin" /> Generating</> : <><Wand2 size={14} /> {remainingCount === shots.length ? 'Generate Frames' : `Generate Remaining (${remainingCount})`}</>}
            </button>
            <button
              className="btn-outline"
              onClick={handleGenerateAll}
              disabled={!shots.length || isGeneratingAll || generatingIndex !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={14} /> Regenerate All
            </button>
            <button className="btn-orange" onClick={handleContinue} disabled={!shots.length} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
              {continueLabel} <CheckCircle2 size={14} />
            </button>
          </div>

          <div className="shot-header-status">
            <div className="panel-meta-label shot-screen-progress">
              {`${generatedCount}/${shots.length} frames ready · ${remainingCount} remaining${failedCount ? ` · ${failedCount} retry` : ''}`}
            </div>
            {queueSummary && <p className="queue-msg shot-screen-feedback">{queueSummary}</p>}
            {generationError && <p className="queue-msg queue-msg--error shot-screen-feedback">{generationError}</p>}
          </div>
        </div>

        {/* Coverage notes */}
        {projectData?.shot_list_meta?.coverage_notes && (
          <div className="shot-coverage-notes">
            <p>{projectData.shot_list_meta.coverage_notes}</p>
          </div>
        )}

        {/* Shots list */}
        <div id="shotListItems" className="shot-list-viewport" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {shots.length > 0 ? (
            shots.map((shot, index) => (
              <div
                key={`${shot.n}-${index}`}
                style={{
                  padding: '12px 24px',
                  borderBottom: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: '42px 84px minmax(0, 1fr) 228px',
                  gap: '12px',
                  alignItems: 'start',
                  background: editingIndex === index ? 'var(--cyan-dim)' : 'transparent',
                  borderLeft: `3px solid ${editingIndex === index ? 'var(--cyan)' : 'transparent'}`,
                  transition: 'background 0.2s',
                }}
              >
                {/* Col 1: Shot number badge */}
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface-2)',
                  boxShadow: editingIndex === index ? 'var(--neo-active)' : 'var(--neo-flat)',
                  border: editingIndex === index ? '1px solid var(--cyan-border)' : '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: editingIndex === index ? 'var(--cyan)' : 'var(--text-soft)',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}>
                  {String(index + 1).padStart(2, '0')}
                </div>

                {/* Col 2: Timing */}
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--cyan-400)',
                  paddingTop: '8px',
                  letterSpacing: '0.06em',
                }}>
                  {getShotTimingLabel(shot, audioDuration)}
                </div>

                {/* Col 3: Content */}
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: editingIndex === index ? 'var(--cyan)' : 'var(--text)',
                    marginBottom: '4px',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}>
                    {shot.n}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    marginBottom: '6px',
                  }}>
                    {shot.p || 'No prompt supplied yet.'}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {[shot.shot_size, shot.movement, (shot.characters || [])[0], (shot.locations || [])[0]]
                      .filter(Boolean)
                      .map((tag) => (
                        <span
                          key={tag}
                          className="tag-badge"
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Col 4: Frame preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                  <div className="shot-thumb neo-flat" style={{ width: '208px', height: '118px', border: '1px solid var(--border)', position: 'relative' }}>
                    {shot.image_url ? (
                      <Image
                        src={shot.image_url}
                        alt={shot.n || `Shot ${index + 1}`}
                        fill
                        sizes="208px"
                        style={{ objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <canvas ref={(el) => (canvasRefs.current[index] = el)} width={208} height={118} style={{ display: 'block' }} />
                    )}
                    {generatingIndex === index && (
                      <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.68)', color: 'var(--cyan)', fontSize: '12px', fontWeight: 700 }}>
                        <Loader2 size={13} className="spin" /> Generating...
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: shot.image_url ? 'var(--cyan)' : 'var(--text-soft)', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                    {shot.image_url ? 'Frame ready' : 'No frame yet'}
                  </div>
                  {!shot.image_url && shot.image_error?.message && (
                    <div className="flex-row gap-6" style={{ fontSize: '11px', color: 'var(--error)', alignItems: 'center' }}>
                      <AlertTriangle size={12} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.image_error.message}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="icon-btn" style={{ opacity: index === 0 ? 0.46 : 1 }} onClick={() => handleMove(index, -1)} disabled={index === 0} title="Move up">
                        <ArrowUp size={13} />
                      </button>
                      <button className="icon-btn" style={{ opacity: index === shots.length - 1 ? 0.46 : 1 }} onClick={() => handleMove(index, 1)} disabled={index === shots.length - 1} title="Move down">
                        <ArrowDown size={13} />
                      </button>
                      <button className="icon-btn" onClick={() => handleDuplicate(index)} title="Duplicate">
                        <Copy size={13} />
                      </button>
                      <button className="icon-btn" style={{ color: 'var(--error)' }} onClick={() => handleDelete(index)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <button
                      className={editingIndex === index ? 'btn-primary' : 'btn-outline'}
                      onClick={() => startEditing(index)}
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        padding: '7px 14px',
                        minHeight: '32px',
                        borderRadius: 'var(--radius)',
                        fontFamily: 'var(--font-body)',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.2,
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              padding: '80px 40px',
              gap: '16px',
            }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                boxShadow: 'var(--neo-raised)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-2)',
              }}>
                <SlidersHorizontal size={22} color="var(--cyan)" />
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text)',
                textAlign: 'center',
              }}>
                No approved shots yet.
              </div>
              <button className="btn-teal" onClick={() => onNavigate(7)}>
                Generate or Import Shot List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Edit sidebar */}
      {hasActiveEdit && (
        <div className="edit-side-panel shot-edit-panel" style={{ animation: 'slideInRight 0.22s cubic-bezier(0.2, 0, 0, 1)' }}>
          {/* Sidebar header */}
          <div style={{ position: 'relative', marginBottom: '0' }}>
            <div className="sidebar-header-kicker" style={{ marginBottom: '6px' }}>
              ▪ Editing · Shot {String(editingIndex + 1).padStart(2, '0')}
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Shot details.
            </h3>
            <button
              onClick={closeEditing}
              className="modal-close-btn"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                color: 'var(--text-soft)',
                fontSize: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, marginTop: '16px' }}>

            {/* Shot Title */}
            <div>
              <label className="form-label">Shot Title</label>
              <input
                type="text"
                value={editDraft.n || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, n: e.target.value }))}
                className="input-inset"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Start / End / Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Start</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.start ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, start: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">End</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.end ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, end: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">Duration</label>
                <input
                  type="number"
                  step="0.1"
                  value={editDraft.duration ?? ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, duration: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
                <div className="field-note" style={{ marginTop: '4px' }}>
                  Timeline duration up to 8s. Clip: {getPlannedVideoDuration(editDraft, 6)}s.
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Characters</label>
                <input
                  type="text"
                  value={editDraft.charactersText || ''}
                  placeholder="THE ARTIST, THE MUSE"
                  onChange={(e) => setEditDraft(prev => ({ ...prev, charactersText: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">Locations</label>
                <input
                  type="text"
                  value={editDraft.locationsText || ''}
                  placeholder="Winter Desolation"
                  onChange={(e) => setEditDraft(prev => ({ ...prev, locationsText: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
            </div>

            {/* Shot Size + Movement */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Shot Size</label>
                <input
                  type="text"
                  value={editDraft.shot_size || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, shot_size: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">Movement</label>
                <input
                  type="text"
                  value={editDraft.movement || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, movement: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Camera</label>
                <input
                  type="text"
                  value={editDraft.camera || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, camera: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
              <div>
                <label className="form-label">Vocal Cue</label>
                <input
                  type="text"
                  value={editDraft.lyrics || ''}
                  onChange={(e) => setEditDraft(prev => ({ ...prev, lyrics: e.target.value }))}
                  className="input-inset"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
            </div>

            {/* Textareas */}
            <div>
              <label className="form-label">Master Shot Brief</label>
              <textarea
                className="textarea-inset"
                value={editDraft.p || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, p: e.target.value }))}
                style={{ minHeight: '96px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <div style={{ height: '1px', background: 'var(--border)' }} />

            <div>
              <div className="panel-meta-label" style={{ marginBottom: '8px' }}>Frame Preview</div>
              <div className="panel-inset" style={{ aspectRatio: '16/9', padding: 0, overflow: 'hidden', position: 'relative' }}>
                {shots[editingIndex]?.image_url ? (
                  <Image
                    src={shots[editingIndex].image_url}
                    alt={editDraft.n || 'Frame preview'}
                    fill
                    sizes="(max-width: 1024px) 100vw, 360px"
                    style={{ objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <canvas ref={modalCanvasRef} width={560} height={315} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {generatingIndex === editingIndex && (
                  <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.68)', color: 'var(--cyan)', fontSize: '12px', fontWeight: 700 }}>
                    <Loader2 size={14} className="spin" /> Generating...
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="form-label">Still Image Prompt</label>
              <textarea
                className="textarea-inset"
                value={editDraft.image_prompt || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, image_prompt: e.target.value }))}
                style={{ minHeight: '112px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
              <select
                className="select-model"
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                style={{ width: '100%', marginTop: '8px' }}
                title="Image model"
              >
                {IMAGE_GENERATION_MODELS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                className="btn-teal"
                onClick={handleGenerateOne}
                disabled={generatingIndex !== null || !(editDraft.image_prompt || editDraft.p || '').trim()}
                style={{ width: '100%', marginTop: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
              >
                {generatingIndex === editingIndex ? <><Loader2 size={14} className="spin" /> Generating...</> : <><Wand2 size={14} /> Generate Frame</>}
              </button>
              {shots[editingIndex]?.image_error?.message && (
                <div className="flex-row gap-6" style={{ marginTop: '8px', color: 'var(--error)', fontSize: '11px', alignItems: 'center' }}>
                  <AlertTriangle size={13} />
                  <span>{shots[editingIndex].image_error.message}</span>
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Video Prompt</label>
              <textarea
                className="textarea-inset"
                value={editDraft.video_prompt || ''}
                onChange={(e) => setEditDraft(prev => ({ ...prev, video_prompt: e.target.value }))}
                style={{ minHeight: '112px' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--cyan-border)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
              />
            </div>

            <button
              className="btn-orange"
              style={{ width: '100%', marginTop: 'auto' }}
              onClick={handleSave}
            >
              Save Shot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
