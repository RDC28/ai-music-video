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
      // Simulate sending to Gemini after fetch starts
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
      // Refresh the page or update state to show analysis
      if (onUploadSuccess) onUploadSuccess(existingAudioUrl); 
    } catch (err) {
      console.error("Analysis failed:", err);
      alert("AI Analysis failed: " + err.message);
    } finally {
      setIsAnalyzing(false);
      setProgressStep(-1);
    }
  };

  // Update audio state when existingAudioUrl changes or audio plays
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
      
      // We no longer auto-navigate here as requested
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

      <div className="center-content" style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
        {existingAudioUrl && !isUploading ? (
          <div className="player-container" style={{ 
            width: '100%',
            background: 'var(--card)',
            border: '2px solid var(--border)',
            borderRadius: '24px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            animation: 'fadeIn 0.5s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div 
                onClick={togglePlay}
                style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '50%', 
                  background: 'var(--teal)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '24px',
                  color: '#0A0A0A',
                  transition: 'all 0.2s',
                  boxShadow: '0 0 20px rgba(0, 184, 212, 0.3)'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {isPlaying ? '⏸' : '▶'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--dark)', fontWeight: 700, fontSize: '18px', marginBottom: '4px' }}>
                  {hasAnalysis ? 'Song Analyzed' : 'Ready to Analyze'}
                </div>
                <div style={{ color: '#888', fontSize: '13px' }}>
                  {hasAnalysis ? `Theme: ${projectState.analysis.theme}` : 'Track uploaded and processed'}
                </div>
              </div>
              <div 
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                style={{ 
                  padding: '8px 16px', 
                  borderRadius: '12px', 
                  border: '1.5px solid var(--border)',
                  fontSize: '12px',
                  color: '#aaa',
                  cursor: isAnalyzing ? 'wait' : 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => !isAnalyzing && (e.currentTarget.style.borderColor = 'var(--teal)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                Replace
              </div>
            </div>

            <div style={{ width: '100%' }}>
              <input 
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                style={{ 
                  width: '100%', 
                  height: '6px', 
                  borderRadius: '3px',
                  background: `linear-gradient(to right, var(--teal) ${(currentTime/duration)*100 || 0}%, #333 ${(currentTime/duration)*100 || 0}%)`,
                  appearance: 'none',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {hasAnalysis && (
              <div style={{ 
                background: 'rgba(255,255,255,0.03)', 
                borderRadius: '16px', 
                padding: '16px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ color: 'var(--teal)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                  AI Analysis Summary
                </div>
                <div style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.5' }}>
                  {projectState.analysis.summary || `This ${projectState.analysis.genre} track has a ${projectState.analysis.mood} mood.`}
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    <span style={{ color: 'var(--dark)', fontWeight: 600 }}>{projectState.analysis.lyrics?.length || 0}</span> Lines
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    <span style={{ color: 'var(--dark)', fontWeight: 600 }}>{projectState.analysis.bpm || '??'}</span> BPM
                  </div>
                </div>
              </div>
            )}

            {!hasAnalysis ? (
              <button 
                className="btn-orange" 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                style={{ width: '100%', padding: '16px', borderRadius: '16px', fontSize: '15px', position: 'relative', overflow: 'hidden' }}
              >
                {isAnalyzing ? 'Analyzing Audio...' : '✨ Analyze Song with Gemini 2.5 Flash'}
              </button>
            ) : (
              <button 
                className="btn-teal" 
                onClick={() => onNavigate(3)}
                style={{ width: '100%', padding: '16px', borderRadius: '16px', fontSize: '15px' }}
              >
                Continue to Script Builder
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
              padding: '80px 100px', 
              cursor: isUploading ? 'wait' : 'pointer',
              background: isUploading ? 'rgba(255,255,255,0.02)' : 'transparent',
              width: '100%'
            }}
          >
            <div className="upload-icon" style={{ fontSize: '50px', marginBottom: '20px' }}>
              {isUploading ? '⌛' : '🎵'}
            </div>
            <button
              className="btn-orange"
              disabled={isUploading}
              style={{ fontSize: '16px', padding: '16px 50px', borderRadius: '16px' }}
            >
              {isUploading ? 'Uploading Track...' : 'Upload your Music'}
            </button>
            <div className="upload-hint" style={{ marginTop: '16px' }}>
              Supports MP3, WAV, FLAC (up to 200MB)
            </div>
          </div>
        )}
        
        {!isUploading && (
          <div style={{ fontSize: '13px', color: '#666', marginTop: '24px', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
            {existingAudioUrl 
              ? 'Preview your track above. This will determine the rhythm and emotional beats of your AI video.'
              : 'Your track will be used to analyze rhythm and generate a matching video storyboard.'}
          </div>
        )}
      </div>
    </div>
  );
}
