'use client';

import { Loader2 } from 'lucide-react';
import { truncateCharacterDescription } from './characterConstants';

export default function CharacterSidebar({
  displayedCharacters,
  activeTab,
  setActiveTab,
  activeChar,
  activeCategory,
  isGeneratingActive,
  activeAnchorState,
  anchorStatus,
  boardCards,
  setShowCreateModal,
  handleAddGlobalToProject,
  handleDelete,
}) {
  return (
    <div className="main-header" style={{ padding: '1.125rem 2rem' }}>
      <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.875rem', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, marginRight: '0.25rem' }}>drag to board →</span>
        {displayedCharacters.map((char, i) => (
          <div
            key={char.id || i}
            draggable={true}
            onDragStart={e => { e.dataTransfer.setData('char-index', String(i)); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => setActiveTab(i)}
            className={`tab-pill ${activeTab === i ? 'active' : ''}${boardCards.some(c => c.charIndex === i) ? ' on-board' : ''}`}
            style={{ whiteSpace: 'nowrap', cursor: 'grab' }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {char.name}
            </span>
            {(char.isGeneratingReference || char.id === 'generating') && (
              <span style={{ marginLeft: '0.3125rem', opacity: 0.55, fontSize: '0.5625rem', fontFamily: 'var(--font-mono)' }}>
                {char.images.filter(x => x.url).length}/{char.images.length}
              </span>
            )}
            {!char.isGeneratingReference && anchorStatus[char.name] === 'generating' && (
              <span style={{ marginLeft: '0.375rem', opacity: 0.75, fontSize: '0.5625rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Loader2 size={10} className="spin" />
                ANCHOR
              </span>
            )}
            {!char.isGeneratingReference && (anchorStatus[char.name] === 'done' || char?.anchor_image_url) && (
              <span style={{ marginLeft: '0.375rem', color: 'var(--cyan-400)', fontSize: '0.5625rem' }}>✓</span>
            )}
            {!char.isGeneratingReference && anchorStatus[char.name] === 'failed' && (
              <span style={{ marginLeft: '0.375rem', color: 'var(--violet-400)', fontSize: '0.5625rem' }}>!</span>
            )}
          </div>
        ))}
        {activeCategory === 'project' && !isGeneratingActive && (
          <div
            onClick={() => setShowCreateModal(true)}
            className="tab-pill"
            style={{
              fontSize: '0.875rem',
              color: 'var(--orange)',
              background: 'rgba(var(--violet-rgb), 0.06)',
              borderColor: 'rgba(var(--violet-rgb), 0.22)',
              cursor: 'pointer',
              padding: '0.3125rem 0.875rem',
            }}
          >
            +
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 className="editorial-title editorial-h2">
            {activeChar ? (
              <>
                {activeChar.name}
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>.</span>
              </>
            ) : (
              <>Cast <span className="text-grad">library.</span></>
            )}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.5938rem',
                fontWeight: 500,
                padding: '0.25rem 0.625rem',
                borderRadius: '62.4375rem',
                background: 'rgba(var(--violet-rgb), 0.1)',
                color: activeCategory === 'global' ? 'var(--orange)' : 'var(--teal)',
                border: '0.0625rem solid rgba(var(--violet-rgb), 0.22)',
                letterSpacing: '0.18em',
              }}
            >
              {activeCategory === 'global' ? '◆ GLOBAL' : '◇ PROJECT'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.015em' }}>
              {truncateCharacterDescription(activeChar?.description) || 'No notes yet.'}
            </span>
            {activeCategory === 'project' && activeChar?.name && activeAnchorState === 'generating' && (
              <span style={{ color: 'var(--cyan-400)', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Loader2 size={12} className="spin" />
                Building identity anchor…
              </span>
            )}
            {activeCategory === 'project' && activeChar?.name && activeAnchorState === 'failed' && (
              <span style={{ color: 'var(--violet-400)', fontSize: '0.6875rem' }}>
                Anchor failed — will use reference panels
              </span>
            )}
          </div>
        </div>
        {activeChar && !isGeneratingActive && activeCategory === 'global' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={handleAddGlobalToProject} className="btn-secondary" style={{ padding: '0.5rem 0.875rem', fontSize: '0.7188rem', whiteSpace: 'nowrap' }}>Add to project</button>
            <button onClick={handleDelete} className="btn-action-danger" style={{ padding: '0.5rem 0.875rem', fontSize: '0.7188rem' }}>Delete from history</button>
          </div>
        )}
        {activeChar && !isGeneratingActive && activeCategory === 'project' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={handleDelete} className="btn-action-danger" style={{ padding: '0.5rem 0.875rem', fontSize: '0.7188rem', fontWeight: 600 }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}
