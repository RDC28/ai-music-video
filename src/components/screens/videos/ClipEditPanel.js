'use client';

import { Copy, Download, Loader2, RotateCcw, Upload, Wand2, X } from 'lucide-react';
import { VIDEO_GENERATION_MODELS } from '@/utils/generationModels';

export default function ClipEditPanel({
  editModalIndex,
  selectedShot,
  shots,
  promptDraft,
  setPromptDraft,
  modelDraft,
  durationDraft,
  setDurationDraft,
  durationOptions,
  recommendedDuration,
  plannedDuration,
  generatingIndex,
  isUploading,
  isDraggingVideo,
  setIsDraggingVideo,
  isRewritingPrompt,
  generationError,
  queueSummary,
  setGenerationError,
  setQueueSummary,
  fileInputRef,
  modalCanvasRef,
  onClose,
  onModelDraftChange,
  onRewritePrompt,
  onGenerateOne,
  onUploadOwn,
  onVideoDrop,
  onDownload,
}) {
  const promptLength = promptDraft.length;
  const promptLimit = 6400;
  const promptUsage = promptLength / promptLimit;

  if (editModalIndex === null || !selectedShot) {
    return (
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="panel-flat">
          <div className="panel-meta-label">Clip Editor</div>
          <p className="body-sm">
            Click <strong>Edit</strong> on any clip card to open per-clip controls here.
          </p>
        </div>

        <div className="panel-flat">
          <div className="panel-meta-label">Model</div>
          <select className="select-model" style={{ width: '100%' }} value={modelDraft} onChange={(event) => onModelDraftChange(event.target.value)} title="Video model">
            {VIDEO_GENERATION_MODELS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="panel-flat" style={{ marginTop: 'auto' }}>
          <div className="panel-meta-label">Progress</div>
          <p className="body-sm">
            {shots.length
              ? `${String(shots.filter(s => s.video_url).length).padStart(2, '0')} / ${String(shots.length).padStart(2, '0')} ready · ${shots.filter(s => !s.video_url).length} remaining`
              : 'Create and review video clips for each shot.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-side-panel clip-edit-panel" style={{ height: '100%' }}>
      <div style={{ animation: 'editPanelContentIn 0.22s 0.18s cubic-bezier(0.2,0,0,1) both' }}>

        <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
          <div>
            <div className="sidebar-header-kicker">Edit Clip</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Edit Clip {editModalIndex + 1}
            </h3>
            <div className="field-note" style={{ marginTop: '0.25rem' }}>Shot {editModalIndex + 1} of {shots.length}</div>
          </div>
          <button className="modal-close-btn" onClick={onClose} style={{ borderRadius: '50%' }}>
            <X size={13} />
          </button>
        </div>

        <div className="flex-col gap-16">

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

          <div>
            <div className="edit-section-title">1. Upload Your Own</div>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" onChange={onUploadOwn} style={{ display: 'none' }} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!isUploading && generatingIndex === null) setIsDraggingVideo(true); }}
              onDragEnter={(e) => { e.preventDefault(); if (!isUploading && generatingIndex === null) setIsDraggingVideo(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingVideo(false); }}
              onDrop={onVideoDrop}
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
              <select className="select-std" value={modelDraft} onChange={(event) => onModelDraftChange(event.target.value)} title="Video model" style={{ height: '2.375rem', padding: '0.5rem 0.625rem' }}>
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

            <button className="btn-action-generate btn-full" onClick={onRewritePrompt} disabled={isRewritingPrompt || generatingIndex !== null}>
              {isRewritingPrompt ? <><Loader2 size={13} className="spin" /> Rewriting…</> : <><RotateCcw size={13} /> Regenerate Prompt</>}
            </button>
            <button className="btn-action-generate btn-full" onClick={async () => {
              if (selectedShot.video_url) {
                const shouldReplace = confirm(`Replace existing clip for shot ${editModalIndex + 1}?`);
                if (!shouldReplace) return;
              }
              await onGenerateOne();
            }} disabled={generatingIndex !== null || !promptDraft.trim()}>
              {generatingIndex === editModalIndex ? (
                <><Loader2 size={14} className="spin" /> Generating...</>
              ) : (
                <><Wand2 size={14} /> {selectedShot.video_error && !selectedShot.video_url ? 'Try Again' : selectedShot.video_url ? 'Replace Clip' : 'Generate New'}</>
              )}
            </button>

            {selectedShot.video_url && (
              <button className="btn-outline btn-full" onClick={() => onDownload(selectedShot, editModalIndex)}>
                <Download size={14} /> Download Clip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
