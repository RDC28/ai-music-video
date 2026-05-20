'use client';

import { Shirt } from 'lucide-react';
import { hasAssetByName } from './wardrobeConstants';

export default function WardrobeEmptyState({
  globalCharacters,
  globalLocations,
  characters,
  locations,
  status,
  onAddCharacterFromHistory,
  onAddLocationFromHistory,
}) {
  return (
    <div className="screen active screen-empty">
      <div className="panel-empty-state">
        <div className="icon-box-lg">
          <Shirt size={28} style={{ color: 'var(--cyan)' }} />
        </div>
        <h1 className="sidebar-header-title" style={{ margin: '0 0 0.625rem' }}>
          Wardrobe needs cast and locations.
        </h1>
        <p className="body-sm" style={{ margin: '0 0 1.375rem' }}>
          Add at least one character and one location before locking outfits by set.
        </p>
        <div style={{ display: 'grid', gap: '0.625rem', textAlign: 'left' }}>
          <select
            className="select-std"
            value=""
            onChange={event => {
              const item = globalCharacters.find(character => String(character.id) === event.target.value);
              if (item) onAddCharacterFromHistory(item);
            }}
          >
            <option value="">Add character from history...</option>
            {globalCharacters.map(character => (
              <option key={character.id} value={character.id} disabled={hasAssetByName(characters, character.name)}>
                {hasAssetByName(characters, character.name) ? 'Added - ' : ''}{character.name}
              </option>
            ))}
          </select>
          <select
            className="select-std"
            value=""
            onChange={event => {
              const item = globalLocations.find(location => String(location.id) === event.target.value);
              if (item) onAddLocationFromHistory(item);
            }}
          >
            <option value="">Add location from history...</option>
            {globalLocations.map(location => (
              <option key={location.id} value={location.id} disabled={hasAssetByName(locations, location.name)}>
                {hasAssetByName(locations, location.name) ? 'Added - ' : ''}{location.name}
              </option>
            ))}
          </select>
        </div>
        {status && (
          <div className={`status-message ${status.includes('failed') || status.includes('could not') ? 'status-message--error' : 'status-message--ok'}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
