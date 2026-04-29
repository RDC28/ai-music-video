
export default function UploadAudioScreen({ onNavigate }) {
  return (
    <div className="screen active" id="s2">

      <div className="center-content">
        <div
          className="upload-zone"
          onClick={() => onNavigate(3)}
          style={{ padding: '70px 120px' }}
        >
          <div className="upload-icon">🎵</div>
          <button
            className="btn-orange"
            style={{ fontSize: '15px', padding: '14px 40px' }}
          >
            Upload Audio
          </button>
          <div className="upload-hint">MP3, WAV, FLAC · max 200MB</div>
        </div>
        <div
          style={{
            fontSize: '12px',
            color: '#aaa',
            fontFamily: 'var(--font-body)',
          }}
        >
          or drag &amp; drop your track here
        </div>
      </div>
    </div>
  );
}
