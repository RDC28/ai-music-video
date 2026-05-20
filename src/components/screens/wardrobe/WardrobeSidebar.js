'use client';

import { Loader2, MapPin, Sparkles, Wand2 } from 'lucide-react';
import { hasOutfitLock, hasAssetByName } from './wardrobeConstants';

export default function WardrobeSidebar({
  wardrobe,
  activeLocationIndex,
  setActiveLocationIndex,
  characters,
  locations,
  suggestingKey,
  generatingAllKey,
  isSuggestingAllLocs,
  suggestAllProgress,
  wardrobeQueue,
  wardrobeRef,
  globalCharacters,
  globalLocations,
  onSuggestAllOutfits,
  onGenerateLocationImages,
  onAddCharacterFromHistory,
  onAddLocationFromHistory,
}) {
  return (
    <aside className="layout-sidebar" style={{ width: '100%' }}>
      <div className="sidebar-header">
        <div className="sidebar-header-kicker">▪ Wardrobe · Locks</div>
        <h1 className="sidebar-header-title">Dress each set.</h1>
        <p className="sidebar-header-desc">
          Optional outfit overrides by location. Blank rows use each character&apos;s base reference-sheet outfit.
        </p>
      </div>

      <div className="sidebar-list">
        {wardrobe.map((location, index) => {
          const active = index === activeLocationIndex;
          const lockedCount = (location.outfits || []).filter(hasOutfitLock).length;
          return (
            <button
              key={location.location_id || index}
              type="button"
              className={`sidebar-list-btn${active ? ' active' : ''}`}
              onClick={() => setActiveLocationIndex(index)}
            >
              <div className="flex-row gap-8" style={{ marginBottom: '0.375rem', alignItems: 'center' }}>
                <MapPin size={14} style={{ color: active ? 'var(--cyan)' : 'var(--text-muted)' }} />
                <span className="sidebar-list-btn-name">{location.location_name}</span>
              </div>
              <div className="sidebar-list-btn-meta">
                {lockedCount}/{characters.length} outfit locks
              </div>
            </button>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-library-panel">
          <div className="sidebar-library-label">Add cast from history</div>
          <select
            className="select-sm"
            value=""
            onChange={event => {
              const item = globalCharacters.find(character => String(character.id) === event.target.value);
              if (item) onAddCharacterFromHistory(item);
            }}
          >
            <option value="">Select character...</option>
            {globalCharacters.map(character => (
              <option key={character.id} value={character.id} disabled={hasAssetByName(characters, character.name)}>
                {hasAssetByName(characters, character.name) ? 'Added - ' : ''}{character.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sidebar-library-panel">
          <div className="sidebar-library-label">Add set from history</div>
          <select
            className="select-sm"
            value=""
            onChange={event => {
              const item = globalLocations.find(location => String(location.id) === event.target.value);
              if (item) onAddLocationFromHistory(item);
            }}
          >
            <option value="">Select location...</option>
            {globalLocations.map(location => (
              <option key={location.id} value={location.id} disabled={hasAssetByName(locations, location.name)}>
                {hasAssetByName(locations, location.name) ? 'Added - ' : ''}{location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sidebar-continue" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button
            className="btn-secondary"
            style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', justifyContent: 'center' }}
            onClick={() => onSuggestAllOutfits(activeLocationIndex)}
            disabled={!!suggestingKey || !!generatingAllKey || isSuggestingAllLocs}
          >
            {isSuggestingAllLocs
              ? <><Loader2 size={11} className="spin" /> {suggestAllProgress.done}/{suggestAllProgress.total}…</>
              : generatingAllKey ? <><Loader2 size={11} className="spin" /> …</>
              : <><Sparkles size={11} /> Suggest here</>}
          </button>
          {(() => {
            const pendingHere = ((wardrobeRef.current?.[activeLocationIndex]?.outfits) || [])
              .filter(o => o.description && !o.image_url).length;
            if (pendingHere === 0 && !wardrobeQueue.isActive) return null;
            return (
              <button
                className="btn-action-generate"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', justifyContent: 'center' }}
                onClick={onGenerateLocationImages}
                disabled={wardrobeQueue.isActive}
              >
                {wardrobeQueue.isActive
                  ? <><Loader2 size={11} className="spin" /> {wardrobeQueue.stats.done}/{wardrobeQueue.stats.total}</>
                  : <><Wand2 size={11} /> Generate here</>}
              </button>
            );
          })()}
        </div>
        <div className="panel-flat">
          <div className="panel-meta-label">Hint</div>
          <p className="body-sm">
            Select a location here, then edit outfits in the center grid. Use Save Wardrobe in the center header when ready.
          </p>
        </div>
      </div>
    </aside>
  );
}
