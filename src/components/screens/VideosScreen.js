'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Wand2 } from 'lucide-react';
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
import {
  buildShotError,
  buildGenerationContext,
  compactShotForRequest,
  fetchJsonWithRetry,
  safeFileName,
  inferVideoExtension,
  videoContentType,
} from './videos/videoConstants';
import ClipGallery from './videos/ClipGallery';
import ClipEditPanel from './videos/ClipEditPanel';

const VIDEO_BATCH_CONCURRENCY = 2;

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
  const [isRewritingPrompt, setIsRewritingPrompt] = useState(false);
  const [undoClip, setUndoClip] = useState(null);
  const [generationError, setGenerationError] = useState('');
  const [queueSummary, setQueueSummary] = useState('');

  const videoQueue = useGenerationQueue({ concurrency: VIDEO_BATCH_CONCURRENCY });

  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);

  useEffect(() => {
    if (!videoQueue.isActive) setGeneratingIndex(null);
  }, [videoQueue.isActive]);

  useEffect(() => {
    if (videoQueue.isActive || videoQueue.stats.total === 0) return;
    const failed = videoQueue.stats.failed;
    const done = videoQueue.stats.done;
    const total = videoQueue.stats.total;
    setQueueSummary(`${done}/${total} clips complete${failed ? ` · ${failed} need retry` : ''}.`);
    setGenerationError(failed ? `${failed} clip${failed === 1 ? '' : 's'} need another try.` : '');
  }, [videoQueue.isActive, videoQueue.stats.done, videoQueue.stats.failed, videoQueue.stats.total]);

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

  const selectedShot = editModalIndex !== null ? shots[editModalIndex] : null;
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
      shotIndex === index ? { ...item, video_error: videoError } : item
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
    if (!target) { setUndoClip(null); return; }
    const restored = shots.map((shot, index) => (
      index === undoClip.index
        ? { ...shot, video_url: undoClip.video_url, video_path: undoClip.video_path, video_error: null }
        : shot
    ));
    setShots(restored);
    await onDataUpdate({ shot_list: restored });
    setQueueSummary(`Restored previous clip for shot ${undoClip.index + 1}.`);
    setUndoClip(null);
  };

  const runGenerationQueue = (indices, { promptOverrides = {}, durationOverrides = {} } = {}) => {
    if (!indices.length) return;
    if (!videoQueue.isActive) videoQueue.clear();
    setGenerationError('');
    setQueueSummary(`Clip generation started for ${indices.length} shot${indices.length === 1 ? '' : 's'}.`);
    videoQueue.enqueue(
      indices.map(index => ({
        id: `vid-${index}-${Date.now()}`,
        label: `Shot ${index + 1}`,
        run: async () => {
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
        body: JSON.stringify({ shot, projectState, mode: 'video', currentPrompt: promptDraft }),
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
    await onDataUpdate({ shot_list: shots, videos_approved: true, current_step: 10 });
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
        main={(
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
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

            <ClipGallery
              shots={shots}
              editModalIndex={editModalIndex}
            generatingIndex={generatingIndex}
            undoClip={undoClip}
            canvasRefs={canvasRefs}
            onOpen={openEditor}
            onUndoReplace={handleUndoReplace}
          />
        </div>
      )}
        right={(
          <ClipEditPanel
            editModalIndex={editModalIndex}
            selectedShot={selectedShot}
            shots={shots}
            promptDraft={promptDraft}
            setPromptDraft={setPromptDraft}
            modelDraft={modelDraft}
            durationDraft={durationDraft}
            setDurationDraft={setDurationDraft}
            durationOptions={durationOptions}
            recommendedDuration={recommendedDuration}
            plannedDuration={plannedDuration}
            generatingIndex={generatingIndex}
            isUploading={isUploading}
            isDraggingVideo={isDraggingVideo}
            setIsDraggingVideo={setIsDraggingVideo}
            isRewritingPrompt={isRewritingPrompt}
            generationError={generationError}
            queueSummary={queueSummary}
            setGenerationError={setGenerationError}
            setQueueSummary={setQueueSummary}
            fileInputRef={fileInputRef}
            modalCanvasRef={modalCanvasRef}
            onClose={() => setEditModalIndex(null)}
            onModelDraftChange={handleModelDraftChange}
            onRewritePrompt={handleRewritePrompt}
            onGenerateOne={handleGenerateOne}
            onUploadOwn={handleUploadOwn}
            onVideoDrop={handleVideoDrop}
            onDownload={handleDownload}
          />
        )}
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
