'use client';

export default function ProgressBar({ steps = [], currentStep = -1 }) {
  if (currentStep < 0 || steps.length === 0) return null;

  const progress = Math.min(100, Math.max(0, ((currentStep + 1) / steps.length) * 100));
  const currentLabel = steps[currentStep] || 'Working...';

  return (
    <div className="progress-bar-wrap">
      <div className="progress-bar-header">
        <div className="progress-bar-label">
          <span aria-hidden className="progress-bar-dot" />
          {currentLabel}…
        </div>
        <div className="progress-bar-count">
          {String(currentStep + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </div>
      </div>

      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }}>
          <div className="progress-bar-shimmer" />
        </div>
      </div>
    </div>
  );
}
