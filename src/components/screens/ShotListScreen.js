import TopBar from '../TopBar';
import { shots } from '@/data/shots';

export default function ShotListScreen({ onNavigate }) {
  return (
    <div className="screen active" id="s5">
      <TopBar left="PRATEEK" right="MUSIC VIDEO" />

      <div className="shot-layout">
        <div className="shot-header">
          <button
            className="btn-orange"
            style={{ fontSize: '12px', padding: '10px 20px' }}
          >
            SHOT LIST
          </button>
          <button
            className="btn-teal"
            onClick={() => onNavigate(7)}
            style={{ fontSize: '11px', padding: '10px 20px' }}
          >
            APPROVE ALL
          </button>

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
          </div>
        </div>

        <div id="shotListItems">
          {shots.map((shot, i) => (
            <div key={i} className="shot-item">
              <div>
                <div className="shot-title">{shot.n}</div>
                <div className="shot-prompt">&quot;{shot.p}&quot;</div>
              </div>
              <div className="shot-actions">
                <button
                  className="btn-teal"
                  style={{ fontSize: '10px', padding: '7px 14px' }}
                  onClick={() => onNavigate(7)}
                >
                  EDIT
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
