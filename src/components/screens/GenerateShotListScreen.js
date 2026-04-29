
export default function GenerateShotListScreen({ onNavigate }) {
  return (
    <div className="screen active" id="s5">

      <div className="shot-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="shot-header" style={{ justifyContent: 'flex-end', borderBottom: 'none', paddingBottom: 0 }}>
          <div className="chars-preview">
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#8B4513,#D2691E)',
                }}
              />
              <div className="char-badge">ZAIN</div>
            </div>
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#9B59B6,#E8A0BF)',
                }}
              />
              <div className="char-badge">NAISHA</div>
            </div>
            <div style={{ width: '12px' }} />
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#2E8B57,#3CB371)',
                }}
              />
              <div className="char-badge" style={{ background: '#3CB371' }}>CAFE</div>
            </div>
            <div className="char-thumb">
              <div
                className="char-avatar"
                style={{
                  background: 'linear-gradient(135deg,#556B2F,#6B8E23)',
                }}
              />
              <div className="char-badge" style={{ background: '#6B8E23' }}>PARK</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <button 
            className="btn-orange" 
            onClick={() => onNavigate(7)} 
            style={{ width: '260px', padding: '16px', fontSize: '13px' }}
          >
            GENERATE SHOT LIST
          </button>
          
          <button 
            className="btn-teal" 
            onClick={() => onNavigate(7)} 
            style={{ 
              width: '260px', 
              padding: '16px', 
              fontSize: '13px',
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            UPLOAD SHOT LIST 
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
