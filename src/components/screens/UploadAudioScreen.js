import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase';
import { Activity, ArrowRight, Music2, Pause, Play, RefreshCw, Sparkles, UploadCloud } from 'lucide-react';
import ProgressBar from '../ProgressBar';

export default function UploadAudioScreen({ onNavigate, projectId, existingAudioUrl, onUploadSuccess, projectState, onDataUpdate }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const supabase = createClient();

  const AUDIO_STEPS = [
    'Preparing track',
    'Reading song structure',
    'Mapping rhythm and lyrics',
    'Organizing lyrics',
    'Saving insights'
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
        })
      });

      setProgressStep(3);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setProgressStep(4);
      if (onUploadSuccess) onUploadSuccess(existingAudioUrl);
    } catch (err) {
      console.error("Analysis failed:", err);
      alert("Track analysis could not be completed. Please try again.");
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
      const handleEnded = () => setIsPlaying(false);

      audio.addEventListener('timeupdate', updateProgress);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('timeupdate', updateProgress);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [existingAudioUrl]);

  useEffect(() => {
    const roundedDuration = Number.isFinite(duration) && duration > 0
      ? Number(duration.toFixed(2))
      : null;

    if (!roundedDuration || !onDataUpdate) return;
    if (Math.abs((projectState?.audio_duration_seconds || 0) - roundedDuration) < 0.25) return;

    onDataUpdate({ audio_duration_seconds: roundedDuration }).catch((error) => {
      console.warn('Failed to persist audio duration:', error);
    });
  }, [duration, onDataUpdate, projectState?.audio_duration_seconds]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e) => {
    const seekTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!projectId) {
      alert("We could not find this project. Please return to the dashboard.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!file.type.startsWith('audio/')) {
      alert("Please upload a valid audio file (MP3, WAV, FLAC).");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      alert("File is too large. Please upload an audio file under 200MB.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `${projectId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('assets')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('projects')
        .update({ audio_url: publicUrl })
        .eq('id', projectId);

      if (updateError) throw updateError;

      if (onUploadSuccess) onUploadSuccess(publicUrl);

      if (existingAudioUrl) {
        try {
          const urlParts = existingAudioUrl.split('/assets/');
          let oldPath = urlParts[urlParts.length - 1];
          oldPath = decodeURIComponent(oldPath);
          if (oldPath) {
            await supabase.storage.from('assets').remove([oldPath]);
          }
        } catch (cleanupErr) {
          console.warn("Cleanup failed:", cleanupErr);
        }
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Please try again or choose a smaller audio file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="screen active" id="s2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="audio/*"
        style={{ display: 'none' }}
      />

      {existingAudioUrl && <audio ref={audioRef} src={existingAudioUrl} />}

      <div className="screen-header-modern">
        <div>
          <div className="screen-kicker">Track · Setup</div>
          <h1 className="screen-title">Bring the song.</h1>
          <p className="screen-subtitle">
            {existingAudioUrl
              ? hasAnalysis
                ? 'Your track insights are ready. Continue into the creative plan.'
                : 'Track uploaded. Create tempo, lyric, mood, and timing cues for the rest of the video.'
              : 'Drop in your music file — MP3, WAV, or FLAC, up to 200 MB. Everything downstream is built around it.'}
          </p>
        </div>
        <div className="screen-actions">
          {existingAudioUrl && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => !isAnalyzing && fileInputRef.current?.click()}
              disabled={isAnalyzing || isUploading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
            >
              <RefreshCw size={14} />
              Replace
            </button>
          )}
          {hasAnalysis && (
            <button
              type="button"
              className="btn-teal"
              onClick={() => onNavigate(3)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
            >
              Continue
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="audio-layout">
        <section className="audio-main premium-panel">
          {existingAudioUrl && !isUploading ? (
            <div className="audio-player">
              <div className="audio-player-header">
                <button
                  type="button"
                  className="audio-play-btn"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--dark)',
                      fontStyle: 'italic',
                      fontWeight: 500,
                      fontSize: '24px',
                      marginBottom: '6px',
                      fontFamily: 'var(--font-display)',
                      letterSpacing: '-0.025em',
                      lineHeight: 1.05,
                    }}
                  >
                    {hasAnalysis ? 'Song insights ready.' : 'Ready for analysis.'}
                  </div>
                  <div
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {hasAnalysis
                      ? `${projectState.analysis.genre || 'Track'} · ${projectState.analysis.mood || ''}`
                      : 'Track uploaded · awaiting analysis'}
                  </div>
                </div>
              </div>

              <div>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  aria-label="Audio timeline"
                  style={{
                    width: '100%',
                    height: '5px',
                    borderRadius: '999px',
                    background: `linear-gradient(to right, var(--violet) ${(currentTime / duration) * 100 || 0}%, rgba(255,255,255,0.1) ${(currentTime / duration) * 100 || 0}%)`,
                    appearance: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.08em',
                  }}
                >
                  <span>{formatTime(currentTime)}</span>
                  <span>—{formatTime(Math.max(0, (duration || 0) - currentTime))}</span>
                </div>
              </div>

              {hasAnalysis && (
                <div className="subtle-panel" style={{ padding: '16px' }}>
                  <div className="panel-label" style={{ marginBottom: '8px' }}>
                    Song Insights
                  </div>
                  <div style={{ color: 'var(--text-soft)', fontSize: '13px', lineHeight: 1.65 }}>
                    {projectState.analysis.summary || `This ${projectState.analysis.genre || ''} track has a ${projectState.analysis.mood || ''} mood.`}
                  </div>
                </div>
              )}

              {!hasAnalysis ? (
                <button
                  type="button"
                  className="btn-orange"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  style={{ width: '100%', padding: '14px', fontSize: '13px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  <Sparkles size={15} />
                  {isAnalyzing ? 'Analyzing your track...' : 'Analyze Track'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-teal"
                  onClick={() => onNavigate(3)}
                  style={{ width: '100%', padding: '14px', fontSize: '13px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  Continue to Story
                  <ArrowRight size={15} />
                </button>
              )}
            </div>

          ) : (
            <div
              className="audio-dropzone"
              onClick={() => !isUploading && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !isUploading) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              style={{ cursor: isUploading ? 'wait' : 'pointer' }}
            >
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '24px',
                  border: '1px solid rgba(124,58,237,0.36)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--violet)',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(109,40,217,0.04))',
                  boxShadow: '0 16px 40px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.14)',
                  position: 'relative',
                }}
              >
                {isUploading ? (
                  <Activity size={28} style={{ animation: 'pulse 1.4s ease-in-out infinite' }} />
                ) : (
                  <UploadCloud size={30} />
                )}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontSize: '24px',
                  fontWeight: 500,
                  color: 'var(--dark)',
                  letterSpacing: '-0.025em',
                  marginTop: '4px',
                }}
              >
                {isUploading ? 'Uploading…' : 'Drop a track in.'}
              </div>
              <button
                type="button"
                className="btn-orange"
                disabled={isUploading}
                style={{ fontSize: '13px', padding: '12px 34px', pointerEvents: 'none' }}
              >
                {isUploading ? 'Working…' : 'Choose audio file'}
              </button>
              <div
                className="upload-hint"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10.5px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                {isUploading ? 'Please wait' : 'MP3 · WAV · FLAC · ≤ 200 MB'}
              </div>
            </div>
          )}
        </section>

        <aside className="audio-side premium-panel">
          <div className="panel-label">── Production Readiness</div>
          <div className="audio-stat-grid">
            <div className="audio-stat subtle-panel">
              <strong>{formatTime(duration || projectState?.audio_duration_seconds || 0)}</strong>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                Duration
              </span>
            </div>
            <div className="audio-stat subtle-panel">
              <strong>{projectState?.analysis?.bpm || '—'}</strong>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                BPM
              </span>
            </div>
            <div className="audio-stat subtle-panel">
              <strong>{projectState?.analysis?.lyrics?.length || 0}</strong>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                Lyric lines
              </span>
            </div>
            <div className="audio-stat subtle-panel">
              <strong style={{ color: hasAnalysis ? 'var(--amber)' : 'var(--text-soft)' }}>{hasAnalysis ? 'Yes' : 'Open'}</strong>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                Insights
              </span>
            </div>
          </div>

          <div className="subtle-panel" style={{ padding: '14px', marginTop: 'auto' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <Music2 size={16} color="var(--violet)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
                The next screens use these insights to keep story beats, shot timing, frames, and clip durations anchored to the song.
              </p>
            </div>
          </div>

          {isAnalyzing && (
            <ProgressBar steps={AUDIO_STEPS} currentStep={progressStep} />
          )}
        </aside>
      </div>
    </div>
  );
}
