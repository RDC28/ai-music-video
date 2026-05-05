import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase';
import ProgressBar from '../ProgressBar';

export default function UploadAudioScreen({ onNavigate, projectId, existingAudioUrl, onUploadSuccess, projectState }) {
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
    'Fetching audio file',
    'Sending to Gemini 2.5 Flash',
    'Analyzing rhythm & lyrics',
    'Processing transcript',
    'Saving to project'
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
        body: JSON.stringify({ projectId, audioUrl: existingAudioUrl })
      });

      setProgressStep(3);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setProgressStep(4);
      if (onUploadSuccess) onUploadSuccess(existingAudioUrl);
    } catch (err) {
      console.error("Analysis failed:", err);
      alert("AI Analysis failed: " + err.message);
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
      alert("No project session found. Please go back to the dashboard.");
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
      alert("Upload failed. Make sure the 'assets' bucket exists and is public.");
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

      {/* Page header */}
      <div style={{
        padding: '20px 28px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.01em', marginBottom: '3px' }}>
          Upload Your Track
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {existingAudioUrl
            ? hasAnalysis
              ? 'Your track has been analyzed. Continue to the next step.'
              : 'Track uploaded — run AI analysis to generate your video plan.'
            : 'Upload your music file. Supports MP3, WAV, FLAC up to 200 MB.'}
        </p>
      </div>

      <div className="center-content" style={{ width: '100%', maxWidth: '560px', margin: '0 auto' }}>

        {existingAudioUrl && !isUploading ? (
          <div style={{
            width: '100%',
            background: 'var(--card)',
            border: '1px solid var(--border-mid)',
            borderRadius: '14px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>

            {/* Player header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={togglePlay}
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'var(--teal)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#0A0A0A',
                  flexShrink: 0,
                  transition: 'opacity 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                onMouseOut={e => e.currentTarget.style.opacity = '1'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--dark)', fontWeight: 600, fontSize: '15px', marginBottom: '3px', fontFamily: 'var(--font-display)' }}>
                  {hasAnalysis ? 'Analysis Complete' : 'Ready to Analyze'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  {hasAnalysis
                    ? `${projectState.analysis.genre || 'Track'} · ${projectState.analysis.mood || ''}`
                    : 'Track uploaded and ready for AI analysis'}
                </div>
              </div>

              <button
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-mid)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  cursor: isAnalyzing ? 'wait' : 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--dark)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Replace
              </button>
            </div>

            {/* Scrubber */}
            <div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  background: `linear-gradient(to right, var(--teal) ${(currentTime / duration) * 100 || 0}%, rgba(255,255,255,0.1) ${(currentTime / duration) * 100 || 0}%)`,
                  appearance: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Analysis summary */}
            {hasAnalysis && (
              <div style={{
                background: 'rgba(0, 184, 212, 0.05)',
                borderRadius: '10px',
                padding: '14px 16px',
                border: '1px solid rgba(0, 184, 212, 0.15)',
              }}>
                <div style={{ color: 'var(--teal)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
                  AI Analysis Summary
                </div>
                <div style={{ color: '#ccc', fontSize: '13px', lineHeight: 1.6 }}>
                  {projectState.analysis.summary || `This ${projectState.analysis.genre || ''} track has a ${projectState.analysis.mood || ''} mood.`}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', gap: '20px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--dark)', fontWeight: 600 }}>{projectState.analysis.lyrics?.length || 0}</span> lines
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--dark)', fontWeight: 600 }}>{projectState.analysis.bpm || '—'}</span> BPM
                  </div>
                </div>
              </div>
            )}

            {/* CTA */}
            {!hasAnalysis ? (
              <button
                className="btn-orange"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                style={{ width: '100%', padding: '14px', fontSize: '13px' }}
              >
                {isAnalyzing ? 'Analyzing your track...' : 'Analyze with Gemini 2.5 Flash'}
              </button>
            ) : (
              <button
                className="btn-teal"
                onClick={() => onNavigate(3)}
                style={{ width: '100%', padding: '14px', fontSize: '13px' }}
              >
                Continue to Script Builder →
              </button>
            )}

            {isAnalyzing && (
              <ProgressBar steps={AUDIO_STEPS} currentStep={progressStep} />
            )}
          </div>

        ) : (
          <div
            className="upload-zone"
            onClick={() => !isUploading && fileInputRef.current?.click()}
            style={{
              cursor: isUploading ? 'wait' : 'pointer',
              width: '100%',
              padding: '64px 80px',
            }}
          >
            <div className="upload-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, margin: '0 auto 12px', display: 'block' }}>
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <button
              className="btn-orange"
              disabled={isUploading}
              style={{ fontSize: '13px', padding: '12px 36px', pointerEvents: 'none' }}
            >
              {isUploading ? 'Uploading...' : 'Choose Audio File'}
            </button>
            <div className="upload-hint">
              {isUploading ? 'Please wait while your file uploads' : 'MP3, WAV, FLAC · Up to 200 MB'}
            </div>
          </div>
        )}

        {/* Helper text */}
        {!isUploading && !existingAudioUrl && (
          <p style={{ fontSize: '12px', color: 'rgba(234,234,234,0.3)', textAlign: 'center', maxWidth: '360px', lineHeight: 1.6, padding: '0 16px' }}>
            Your track will be used to analyze rhythm, lyrics, and emotional beats — and generate a matching video storyboard.
          </p>
        )}
      </div>
    </div>
  );
}
