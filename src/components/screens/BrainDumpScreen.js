import TopBar from '../TopBar';

export default function BrainDumpScreen({ onNavigate }) {
  return (
    <div className="screen active" id="s3">
      <TopBar left="PRATEEK" right="MUSIC VIDEO" />

      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
        <button className="btn-orange">BRAIN DUMP</button>
      </div>

      <div className="brain-content">
        <div>
          <div className="option-label">OPTION 1</div>
          <div className="option-desc">
            Please tell me about your idea or would you like to brainstorm?
          </div>
          <div className="text-input-row">
            <textarea
              rows="2"
              placeholder="Describe your music video concept, mood, story..."
            />
            <div className="mic-btn">🎙</div>
          </div>
        </div>

        <div className="divider" />

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
            <span style={{ fontSize: '22px', cursor: 'pointer' }}>📎</span>
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
