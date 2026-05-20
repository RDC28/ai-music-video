'use client';

import { Video } from 'lucide-react';
import ClipRow from './ClipRow';

export default function ClipGallery({
  shots,
  editModalIndex,
  generatingIndex,
  undoClip,
  canvasRefs,
  onOpen,
  onUndoReplace,
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem 1.5rem 3.5rem', position: 'relative' }}>
      {shots.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(22rem, 1fr))', gap: '1rem', alignContent: 'start', width: '100%' }}>
          {shots.map((shot, i) => (
            <ClipRow
              key={`${shot.n}-${i}`}
              shot={shot}
              index={i}
              editModalIndex={editModalIndex}
              generatingIndex={generatingIndex}
              canvasRef={(el) => (canvasRefs.current[i] = el)}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="flex-col flex-center gap-16" style={{ padding: '5rem 2.5rem' }}>
          <div className="icon-box-lg" style={{ width: '3.25rem', height: '3.25rem' }}>
            <Video size={22} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
            Your clips will appear here after shot visuals are ready.
          </div>
          <p className="body-sm" style={{ textAlign: 'center', maxWidth: '26rem' }}>
            Use the StageRail on the left to open <strong>Shots</strong>, then come back here to generate clips.
          </p>
        </div>
      )}

      {undoClip && (
        <div style={{ position: 'absolute', right: '1.5rem', bottom: '1.75rem', pointerEvents: 'auto' }}>
          <button className="btn-outline-small" onClick={onUndoReplace}>
            Undo Replace
          </button>
        </div>
      )}
    </div>
  );
}
