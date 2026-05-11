'use client';

export default function ProgressBar({ steps = [], currentStep = -1 }) {
  if (currentStep < 0 || steps.length === 0) return null;

  const progress = Math.min(100, Math.max(0, ((currentStep + 1) / steps.length) * 100));
  const currentLabel = steps[currentStep] || 'Working...';

  return (
    <div style={{ padding: '16px 0', width: '100%', animation: 'fadeIn 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '15px', fontWeight: 500, color: 'var(--dark)', letterSpacing: '-0.015em' }}>
          <span aria-hidden style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--violet)', boxShadow: '0 0 12px rgba(124,58,237,0.7)', animation: 'pulse 1.4s ease-in-out infinite' }} />
          {currentLabel}…
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 500, letterSpacing: '0.14em' }}>
          {String(currentStep + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </div>
      </div>

      {/* Film-strip progress bar */}
      <div style={{ height: '5px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' }}>
        <div style={{
          height: '100%',
          borderRadius: '4px',
          background: 'linear-gradient(90deg, var(--violet), var(--rose))',
          width: `${progress}%`,
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: '0 0 18px rgba(124,58,237,0.55)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Shimmer sweep */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)', animation: 'shimmerSweep 1.6s ease-in-out infinite' }} />
        </div>
        {/* Film scan line */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'filmScan 1.4s ease-in-out infinite', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
