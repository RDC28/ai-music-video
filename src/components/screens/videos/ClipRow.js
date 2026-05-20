'use client';

import { AlertTriangle, Loader2, Play } from 'lucide-react';

export default function ClipRow({ shot, index, editModalIndex, generatingIndex, canvasRef, onOpen }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`video-gallery-card${editModalIndex === index ? ' active' : ''}`}
      onClick={() => onOpen(index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(index); }
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'var(--ink-950)', overflow: 'hidden' }}>
        {shot.video_url ? (
          <video src={shot.video_url} poster={shot.image_url || undefined} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : shot.image_url ? (
          <img src={shot.image_url} alt={shot.n || `Shot ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <canvas ref={canvasRef} width={640} height={360} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}

        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(var(--ink-950-rgb), 0.1) 0%, transparent 40%, rgba(var(--ink-950-rgb), 0.8) 100%)', pointerEvents: 'none' }} />

        <div style={{ position: 'absolute', left: '0.75rem', right: '0.75rem', bottom: '0.625rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 0.0625rem 0.5rem rgba(var(--ink-950-rgb), 0.9)' }}>
              {index + 1}. {shot.n || shot.title || `Shot ${index + 1}`}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(var(--cyan-300-rgb), 0.78)', marginTop: '0.125rem' }}>
              {shot.video_url ? 'Clip ready' : shot.video_error ? 'Try again' : 'Ready to generate'}
            </div>
          </div>
          <div className="flex-center" style={{ width: '1.75rem', height: '1.75rem', borderRadius: '50%', background: 'rgba(var(--ink-950-rgb), 0.72)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.28)', color: 'var(--text)', flexShrink: 0 }}>
            <Play size={11} fill="var(--text)" />
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpen(index); }}
          style={{ position: 'absolute', top: '0.625rem', right: '0.625rem', background: editModalIndex === index ? 'rgba(var(--cyan-rgb), 0.24)' : 'rgba(var(--ink-950-rgb), 0.78)', border: editModalIndex === index ? '0.0625rem solid rgba(var(--cyan-rgb), 0.64)' : '0.0625rem solid rgba(var(--cyan-300-rgb), 0.28)', borderRadius: 'var(--radius)', padding: '0.375rem 0.625rem', color: editModalIndex === index ? 'var(--text)' : 'var(--text-soft)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.01em', cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: '0 0.125rem 0.625rem rgba(var(--ink-950-rgb), 0.4)' }}
        >
          {editModalIndex === index ? 'Editing' : shot.video_url ? 'Edit' : shot.video_error ? 'Retry' : 'Edit & Generate'}
        </button>

        {generatingIndex === index && (
          <div className="flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.7)', color: 'var(--cyan)', fontSize: '0.75rem', fontWeight: 700 }}>
            <Loader2 size={14} className="spin" /> Generating...
          </div>
        )}

        {!shot.video_url && shot.video_error && generatingIndex !== index && (
          <div className="flex-row gap-6" style={{ position: 'absolute', left: '0.625rem', top: '0.625rem', background: 'rgba(var(--violet-rgb), 0.8)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.3)', borderRadius: '62.5rem', padding: '0.25rem 0.5rem', alignItems: 'center', color: 'var(--error)', fontSize: '0.6875rem', fontWeight: 700 }}>
            <AlertTriangle size={10} /> Retry
          </div>
        )}
      </div>
    </div>
  );
}
