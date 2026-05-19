import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase';
import { Music2, Pause, Play, RefreshCw, Sparkles, UploadCloud, Loader2 } from 'lucide-react';
import ProgressBar from '../ProgressBar';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

export default function UploadAudioScreen({ projectId, existingAudioUrl, onUploadSuccess, projectState, onDataUpdate }) {
  const [isUploading, setIsUploading]   = useState(false);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [isDragging, setIsDragging]     = useState(false);
  const fileInputRef                    = useRef(null);
  const audioRef                        = useRef(null);
  const supabase                        = createClient();

  const AUDIO_STEPS = [
    'Preparing track',
    'Reading song structure',
    'Mapping rhythm and lyrics',
    'Organizing lyrics',
    'Saving insights',
  ];

  const hasAnalysis = projectState?.analysis;

  const handleAnalyze = async () => {
    if (!existingAudioUrl || !projectId) return;
    setIsAnalyzing(true);
    setProgressStep(0);
    try {
      setTimeout(() => setProgressStep(1), 400);
      setTimeout(() => setProgressStep(2), 1500);
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          audioUrl: existingAudioUrl,
          audioDurationSeconds: Number.isFinite(duration) && duration > 0
            ? Number(duration.toFixed(2))
            : projectState?.audio_duration_seconds,
        }),
      });
      setProgressStep(3);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setProgressStep(4);
      if (onUploadSuccess) onUploadSuccess(existingAudioUrl);
    } catch (err) {
      console.error('Analysis failed:', err);
      alert('Track analysis could not be completed. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setProgressStep(-1);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      const updateProgress = () => setCurrentTime(audio.currentTime);
      const updateDuration = () => setDuration(audio.duration);
      const handleEnded    = () => setIsPlaying(false);
      audio.addEventListener('timeupdate',    updateProgress);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('ended',          handleEnded);
      return () => {
        audio.removeEventListener('timeupdate',     updateProgress);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('ended',           handleEnded);
      };
    }
  }, [existingAudioUrl]);

  useEffect(() => {
    const rounded = Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(2)) : null;
    if (!rounded || !onDataUpdate) return;
    if (Math.abs((projectState?.audio_duration_seconds || 0) - rounded) < 0.25) return;
    onDataUpdate({ audio_duration_seconds: rounded }).catch(err => console.warn('Failed to persist audio duration:', err));
  }, [duration, onDataUpdate, projectState?.audio_duration_seconds]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const seekTime = parseFloat(e.target.value);
    if (audioRef.current) { audioRef.current.currentTime = seekTime; }
    setCurrentTime(seekTime);
  };

  const formatTime = (time) => {
    if (!Number.isFinite(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!projectId) { alert('We could not find this project. Please return to the dashboard.'); fileInputRef.current.value = ''; return; }
    if (!file.type.startsWith('audio/')) { alert('Please upload a valid audio file (MP3, WAV, FLAC).'); fileInputRef.current.value = ''; return; }
    if (file.size > 200 * 1024 * 1024) { alert('File is too large. Please upload an audio file under 200MB.'); fileInputRef.current.value = ''; return; }

    setIsUploading(true);
    try {
      const fileName = `${projectId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from('assets').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(fileName);
      const { error: updateError } = await supabase.from('projects').update({ audio_url: publicUrl }).eq('id', projectId);
      if (updateError) throw updateError;
      if (onUploadSuccess) onUploadSuccess(publicUrl);
      if (existingAudioUrl) {
        try {
          const urlParts = existingAudioUrl.split('/assets/');
          const oldPath = decodeURIComponent(urlParts[urlParts.length - 1]);
          if (oldPath) await supabase.storage.from('assets').remove([oldPath]);
        } catch (cleanupErr) { console.warn('Cleanup failed:', cleanupErr); }
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Please try again or choose a smaller audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const syntheticEvent = { target: { files: [file], value: '' } };
    handleFileChange(syntheticEvent);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="screen active screen-fill" id="s2">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" style={{ display: 'none' }} />
      {existingAudioUrl && <audio ref={audioRef} src={existingAudioUrl} />}

      <WorkflowThreePaneShell
        showLeftPanel={false}
        sidebarTitle="Track"
        rightTitle="Actions"
        storageKey="workflow-three-pane:s2"
        sidebar={null}
        main={(
          <div className="flex-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <div className="screen-header-modern">
              <div>
                <div className="screen-kicker">Track · Setup</div>
                <h1 className="screen-title">Bring the song.</h1>
                <p className="screen-subtitle">
                  {existingAudioUrl
                    ? hasAnalysis
                      ? 'Your track insights are ready. Continue into the creative plan.'
                      : 'Track uploaded. Analyze it to extract tempo, lyrics, and mood cues.'
                    : 'Drop in your music file — MP3, WAV, or FLAC up to 200 MB.'}
                </p>
              </div>
            </div>

            <div style={{ padding: '0 1.5rem 1.5rem', flex: 1, minHeight: 0 }}>
              <section style={{
                background: 'var(--surface-2)',
                boxShadow: 'var(--neo-raised)',
                border: '0.0625rem solid var(--border)',
                borderRadius: 'var(--radius-xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
              }}>
                {existingAudioUrl && !isUploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.75rem', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.125rem' }}>
                      <button
                        type="button"
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        style={{
                          width: '3.25rem',
                          height: '3.25rem',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          boxShadow: isPlaying ? 'var(--neo-active)' : 'var(--neo-raised)',
                          border: `0.0625rem solid ${isPlaying ? 'var(--cyan-border)' : 'var(--border-mid)'}`,
                          color: isPlaying ? 'var(--cyan)' : 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'box-shadow 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out',
                        }}
                      >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '1.375rem',
                          fontWeight: '700',
                          color: 'var(--text)',
                          letterSpacing: '-0.025em',
                          marginBottom: '0.25rem',
                        }}>
                          {hasAnalysis ? 'Insights ready.' : 'Ready for analysis.'}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.625rem',
                          color: 'var(--text-muted)',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}>
                          {hasAnalysis
                            ? `${projectState.analysis.genre || 'Track'} · ${projectState.analysis.mood || ''}`
                            : 'Track uploaded · awaiting analysis'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{
                        position: 'relative',
                        height: '0.25rem',
                        borderRadius: '62.4375rem',
                        background: 'var(--bg-deep)',
                        boxShadow: 'var(--neo-inset)',
                        overflow: 'hidden',
                        marginBottom: '0.625rem',
                      }}>
                        <div style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          height: '100%',
                          width: `${progressPct}%`,
                          background: 'var(--cyan)',
                          borderRadius: '62.4375rem',
                          transition: 'width 100ms linear',
                        }} />
                        <input
                          type="range"
                          min="0"
                          max={duration || 0}
                          value={currentTime}
                          onChange={handleSeek}
                          aria-label="Audio timeline"
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            opacity: 0,
                            cursor: 'pointer',
                            margin: 0,
                          }}
                        />
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.625rem',
                        color: 'var(--text-muted)',
                        letterSpacing: '0.06em',
                      }}>
                        <span>{formatTime(currentTime)}</span>
                        <span>−{formatTime(Math.max(0, (duration || 0) - currentTime))}</span>
                      </div>
                    </div>

                    {hasAnalysis && (
                      <div style={{
                        background: 'var(--bg-deep)',
                        boxShadow: 'var(--neo-inset)',
                        border: '0.0625rem solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '1rem',
                      }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.625rem',
                          fontWeight: '700',
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          marginBottom: '0.5rem',
                        }}>
                          ▪ Song Insights
                        </div>
                        <p style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.8125rem',
                          color: 'var(--text-soft)',
                          lineHeight: 1.65,
                        }}>
                          {projectState.analysis.summary || `This ${projectState.analysis.genre || ''} track has a ${projectState.analysis.mood || ''} mood.`}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isUploading) { e.preventDefault(); fileInputRef.current?.click(); } }}
                    onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); if (!isUploading) setIsDragging(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={0}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '1.25rem',
                      padding: '3rem',
                      background: isDragging ? 'rgba(var(--cyan-rgb), 0.04)' : 'var(--bg-deep)',
                      boxShadow: 'var(--neo-inset)',
                      borderRadius: 'var(--radius-xl)',
                      margin: '1rem',
                      cursor: isUploading ? 'wait' : 'pointer',
                      border: isDragging ? '0.0938rem dashed var(--cyan-border)' : '0.0938rem dashed var(--border-mid)',
                      transition: 'border-color 160ms ease-out, background 160ms ease-out',
                      textAlign: 'center',
                    }}
                    onMouseEnter={e => { if (!isUploading && !isDragging) e.currentTarget.style.borderColor = 'var(--cyan-border)'; }}
                    onMouseLeave={e => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
                  >
                    <div style={{
                      width: '4rem',
                      height: '4rem',
                      borderRadius: '1.125rem',
                      background: 'var(--surface)',
                      boxShadow: 'var(--neo-raised)',
                      border: '0.0625rem solid var(--border-mid)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--cyan)',
                    }}>
                      {isUploading
                        ? <Loader2 size={26} className="spin" />
                        : <UploadCloud size={26} />}
                    </div>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.375rem',
                        fontWeight: '700',
                        color: 'var(--text)',
                        letterSpacing: '-0.025em',
                        marginBottom: '0.375rem',
                      }}>
                        {isUploading ? 'Uploading…' : 'Drop a track in.'}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.625rem',
                        color: 'var(--text-muted)',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}>
                        {isUploading ? 'Please wait' : 'MP3 · WAV · FLAC · ≤ 200 MB'}
                      </div>
                    </div>
                    {!isUploading && (
                      <div style={{
                        padding: '0.5625rem 1.25rem',
                        background: 'var(--surface)',
                        boxShadow: 'var(--neo-raised)',
                        border: '0.0625rem solid var(--cyan-border)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--cyan)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        pointerEvents: 'none',
                      }}>
                        Choose audio file
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
        right={(
          <aside style={{
            height: '100%',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div className="panel-flat">
              <div className="panel-meta-label">▪ Actions</div>
              <div className="flex-col gap-8">
                {existingAudioUrl && (
                  <button type="button" className="btn-outline" onClick={() => !isAnalyzing && fileInputRef.current?.click()} disabled={isAnalyzing || isUploading} style={{ width: '100%', justifyContent: 'center' }}>
                    <RefreshCw size={13} />
                    Replace Track
                  </button>
                )}
                {!hasAnalysis ? (
                  <button type="button" className="btn-orange" onClick={handleAnalyze} disabled={isAnalyzing || !existingAudioUrl} style={{ width: '100%', justifyContent: 'center' }}>
                    {isAnalyzing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                    {isAnalyzing ? 'Analyzing…' : 'Analyze Track'}
                  </button>
                ) : (
                  <div className="panel-inset" style={{ flex: 'none', whiteSpace: 'normal', padding: '0.875rem' }}>
                    <p className="body-sm">
                      Analysis is ready. Use the left step bar to open <strong>Story</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="panel-flat">
              <div className="panel-meta-label">▪ Production Readiness</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                {[
                  { label: 'Duration', value: formatTime(duration || projectState?.audio_duration_seconds || 0) },
                  { label: 'BPM', value: projectState?.analysis?.bpm || '—' },
                  { label: 'Lyrics', value: projectState?.analysis?.lyrics?.length || 0 },
                  { label: 'Insights', value: hasAnalysis ? 'Ready' : 'Pending', highlight: hasAnalysis },
                ].map(({ label, value, highlight }) => (
                  <div key={label} style={{
                    background: 'var(--bg-deep)',
                    boxShadow: 'var(--neo-inset)',
                    border: '0.0625rem solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.75rem 0.875rem',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.125rem',
                      fontWeight: '700',
                      color: highlight ? 'var(--cyan)' : 'var(--text)',
                      letterSpacing: '-0.02em',
                      marginBottom: '0.25rem',
                    }}>
                      {value}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.5625rem',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-flat" style={{ marginTop: 'auto' }}>
              <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                <Music2 size={14} color="var(--cyan)" style={{ marginTop: '0.125rem', flexShrink: 0 }} />
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.6,
                }}>
                  The next screens use these insights to keep story beats, shot timing, and clip durations anchored to the song.
                </p>
              </div>
            </div>

            {isAnalyzing && <ProgressBar steps={AUDIO_STEPS} currentStep={progressStep} />}
          </aside>
        )}
      />
    </div>
  );
}
