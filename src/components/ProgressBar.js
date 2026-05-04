'use client';

export default function ProgressBar({ steps = [], currentStep = -1 }) {
  if (currentStep < 0 || steps.length === 0) return null;

  const progress = Math.min(100, Math.max(0, ((currentStep + 1) / steps.length) * 100));
  const currentLabel = steps[currentStep] || 'Processing...';

  return (
    <div style={{ padding: '12px 0', width: '100%', animate: 'fadeIn 0.3s ease' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#00B8D4' }}>
          {currentLabel}
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontWeight: 600 }}>
          STEP {currentStep + 1} OF {steps.length}
        </div>
      </div>

      <div style={{ height: '4px', borderRadius: '9999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
        <div 
          style={{ 
            height: '100%', 
            borderRadius: '9999px', 
            background: '#00B8D4', 
            width: `${progress}%`,
            transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 10px rgba(0, 184, 212, 0.3)'
          }} 
        />
      </div>
    </div>
  );
}
