
export default function BrainDumpScreen({ onNavigate }) {
  return (
    <div className="screen active" id="s3">

      <div className="brain-content">
        <div>
          <div className="option-label">OPTION 1</div>
          <div className="option-desc">
            Please tell me about your idea or would you like to brainstorm?
          </div>
          <div className="text-input-row">
            <textarea
              rows="5"
              placeholder="Describe your music video concept, mood, story..."
            />
            <button className="btn-orange" onClick={() => onNavigate(4)} style={{ padding: '10px 24px', fontSize: '12px', flexShrink: 0 }}>BRAIN DUMP</button>
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '12px', marginLeft: '16px', fontFamily: 'var(--font-body)' }}>
            * This prompt box will be used to generate a script.
          </div>
        </div>

        <div className="divider" style={{ margin: '24px 0' }} />

        <div>
          <div className="option-label">OPTION 2</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginTop: '8px',
            }}
          >
            <button className="btn-orange" onClick={() => onNavigate(4)}>
              UPLOAD SCRIPT
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn-teal" onClick={() => onNavigate(4)}>
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
