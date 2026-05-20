'use client';

import { Loader2 } from 'lucide-react';
import { truncateLocationDescription } from './locationConstants';

export default function LocationSidebar({
  displayedLocations,
  activeTab,
  setActiveTab,
  activeLoc,
  activeCategory,
  isGeneratingActive,
  boardCards,
  setShowCreateModal,
  setZoomCropTarget,
  handleAddHistoryToProject,
  handleDelete,
}) {
  return (
    <div className="main-header" style={{ padding: '1.125rem 2rem' }}>
      <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.875rem', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, marginRight: '0.25rem' }}>drag to board →</span>
        {displayedLocations.map((loc, i) => (
          <div
            key={loc.id || i}
            draggable={true}
            onDragStart={e => { e.dataTransfer.setData('loc-index', String(i)); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => setActiveTab(i)}
            className={`tab-pill ${activeTab === i ? 'active' : ''}${boardCards.some(c => c.locIndex === i) ? ' on-board' : ''}`}
            style={{ whiteSpace: 'nowrap', cursor: 'grab', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '0.8125rem', fontWeight: 500, letterSpacing: '-0.015em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {loc.name}
            {(loc.isGeneratingReference || loc.id === 'generating') && (
              <Loader2 size={10} className="spin" style={{ color: 'var(--cyan)', opacity: 0.8 }} />
            )}
          </div>
        ))}
        {activeCategory === 'project' && !isGeneratingActive && (
          <div onClick={() => setShowCreateModal(true)} className="tab-pill" style={{ fontSize: '0.875rem', color: 'var(--orange)', background: 'rgba(var(--violet-rgb), 0.06)', borderColor: 'rgba(var(--violet-rgb), 0.22)', cursor: 'pointer', padding: '0.3125rem 0.875rem' }}>+</div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 className="editorial-title editorial-h2" style={{ margin: '0 0 0.375rem' }}>
            {activeLoc ? <>{activeLoc.name}<span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>.</span></> : <em style={{ color: 'var(--text-muted)' }}>No locations.</em>}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {activeLoc && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5938rem', fontWeight: 500, color: activeCategory === 'project' ? 'var(--teal)' : 'var(--orange)', background: 'rgba(var(--violet-rgb), 0.1)', padding: '0.25rem 0.625rem', borderRadius: '62.4375rem', border: '0.0625rem solid rgba(var(--violet-rgb), 0.22)', letterSpacing: '0.18em' }}>
                {activeCategory === 'project' ? '◇ PROJECT' : '◆ GLOBAL'}
              </span>
            )}
            <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.8125rem', fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.01em' }}>
              {truncateLocationDescription(activeLoc?.description) || 'Select or add a location to get started.'}
            </p>
          </div>
        </div>
        {!isGeneratingActive && activeLoc && activeCategory === 'history' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleAddHistoryToProject} className="btn-secondary" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>Add to project</button>
            <button onClick={handleDelete} className="btn-action-danger" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>Delete from history</button>
          </div>
        )}
        {!isGeneratingActive && activeLoc && activeCategory === 'project' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {activeLoc.sheetUrl && (
              <button onClick={() => setZoomCropTarget({ locIdx: activeTab, imgIdx: null, url: activeLoc.sheetUrl, label: 'NEW VIEW', showLabelInput: true })} className="btn-outline" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>+ Add from Sheet</button>
            )}
            <button onClick={handleDelete} className="btn-action-danger" style={{ fontSize: '0.6875rem', padding: '0.5rem 0.875rem' }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}
