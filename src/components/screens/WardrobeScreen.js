'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, MapPin, Shirt, Users } from 'lucide-react';
import { createClient } from '@/utils/supabase';

const emptyWardrobe = [];
const emptyList = [];

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function upperName(value, fallback) {
  return (cleanText(value) || fallback).toUpperCase();
}

function locationKey(location, index) {
  return String(location?.id || location?.name || `location-${index + 1}`).toLowerCase();
}

function characterKey(character, index) {
  return String(character?.id || character?.name || `character-${index + 1}`).toLowerCase();
}

function safeFileName(name) {
  return String(name || 'wardrobe.jpg')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'wardrobe.jpg';
}

function hasOutfitLock(outfit) {
  return Boolean(cleanText(outfit?.outfit_name) || cleanText(outfit?.description) || outfit?.image_url);
}

function normalizeLibraryAsset(asset, kind) {
  const fallbackName = kind === 'location' ? 'LOCATION' : 'CHARACTER';
  return {
    ...asset,
    id: `${kind}-${asset?.id || Date.now()}-${Date.now()}`,
    name: upperName(asset?.name, fallbackName),
    description: asset?.description || asset?.visual_prompt || '',
    visual_prompt: asset?.visual_prompt || asset?.description || '',
    images: Array.isArray(asset?.images) ? asset.images : [],
    source: asset?.source || 'history',
    sheetUrl: asset?.sheetUrl || asset?.sheet_url || null,
  };
}

function hasAssetByName(items = [], name) {
  const target = cleanText(name).toLowerCase();
  return Boolean(target && items.some(item => cleanText(item?.name).toLowerCase() === target));
}

function legacyOutfitFallback(character, location) {
  const charName = upperName(character?.name, 'CHARACTER');
  const locName = upperName(location?.name, 'LOCATION');
  return `${charName} outfit for ${locName}`;
}

function normalizeWardrobe(existingWardrobe = emptyWardrobe, locations = [], characters = []) {
  const existingByLocation = new Map(
    (Array.isArray(existingWardrobe) ? existingWardrobe : []).map((entry, index) => [
      String(entry.location_id || entry.location_name || `location-${index + 1}`).toLowerCase(),
      entry,
    ])
  );

  return locations.map((location, locIndex) => {
    const locKey = locationKey(location, locIndex);
    const existingLocation = existingByLocation.get(locKey) || existingByLocation.get(String(location?.name || '').toLowerCase()) || {};
    const existingOutfits = Array.isArray(existingLocation.outfits) ? existingLocation.outfits : [];
    const outfitByCharacter = new Map(
      existingOutfits.map((outfit, index) => [
        String(outfit.character_id || outfit.character_name || `character-${index + 1}`).toLowerCase(),
        outfit,
      ])
    );

    return {
      location_id: location?.id || locKey,
      location_name: upperName(location?.name, `LOCATION ${locIndex + 1}`),
      location_index: locIndex,
      outfits: characters.map((character, charIndex) => {
        const charKey = characterKey(character, charIndex);
        const existingOutfit = outfitByCharacter.get(charKey) || outfitByCharacter.get(String(character?.name || '').toLowerCase()) || {};
        const description = existingOutfit.description ?? existingOutfit.outfit_description ?? existingOutfit.prompt ?? '';
        const savedOutfitName = existingOutfit.outfit_name || existingOutfit.name || '';
        const outfitName = cleanText(savedOutfitName).toLowerCase() === legacyOutfitFallback(character, location).toLowerCase()
          ? ''
          : savedOutfitName;
        return {
          character_id: character?.id || charKey,
          character_name: upperName(character?.name, `CHARACTER ${charIndex + 1}`),
          character_index: charIndex,
          present: true,
          outfit_name: outfitName,
          description,
          image_url: existingOutfit.image_url || existingOutfit.imageUrl || existingOutfit.url || '',
          image_path: existingOutfit.image_path || '',
          locked: existingOutfit.locked !== false,
        };
      }),
    };
  });
}

function summarizeWardrobe(wardrobe = []) {
  const locationCount = wardrobe.length;
  const outfitCount = wardrobe.reduce((total, location) => (
    total + (location.outfits || []).filter(hasOutfitLock).length
  ), 0);
  return { locationCount, outfitCount };
}

export default function WardrobeScreen({ onNavigate, projectId, projectData = {}, onDataUpdate }) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef(null);
  const [activeLocationIndex, setActiveLocationIndex] = useState(0);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [draggingTarget, setDraggingTarget] = useState(null);
  const [wardrobe, setWardrobe] = useState(() => (
    normalizeWardrobe(projectData?.wardrobe, projectData?.locations || [], projectData?.characters || [])
  ));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [globalCharacters, setGlobalCharacters] = useState([]);
  const [globalLocations, setGlobalLocations] = useState([]);

  const characters = Array.isArray(projectData?.characters) ? projectData.characters : emptyList;
  const locations = Array.isArray(projectData?.locations) ? projectData.locations : emptyList;
  const activeLocation = wardrobe[activeLocationIndex] || null;
  const summary = summarizeWardrobe(wardrobe);

  useEffect(() => {
    // Keep the outfit matrix aligned when cast or locations are regenerated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWardrobe(previous => normalizeWardrobe(previous.length ? previous : projectData?.wardrobe, locations, characters));
    setActiveLocationIndex(index => Math.min(index, Math.max(locations.length - 1, 0)));
  }, [characters, locations, projectData?.wardrobe]);

  useEffect(() => {
    let isActive = true;
    Promise.all([
      supabase.from('characters_library').select('*').order('created_at', { ascending: false }),
      supabase.from('locations_library').select('*').order('created_at', { ascending: false }),
    ]).then(([characterResult, locationResult]) => {
      if (!isActive) return;
      if (!characterResult.error && characterResult.data) setGlobalCharacters(characterResult.data);
      if (!locationResult.error && locationResult.data) setGlobalLocations(locationResult.data);
    });
    return () => { isActive = false; };
  }, [supabase]);

  const updateOutfit = (locIndex, charIndex, updates) => {
    setWardrobe(previous => previous.map((location, index) => (
      index !== locIndex
        ? location
        : {
            ...location,
            outfits: location.outfits.map((outfit, outfitIndex) => (
              outfitIndex === charIndex ? { ...outfit, ...updates } : outfit
            )),
          }
    )));
    setStatus('');
  };

  const addCharacterFromHistory = async (character) => {
    if (!character || hasAssetByName(characters, character.name)) return;
    const updatedCharacters = [...characters, normalizeLibraryAsset(character, 'character')];
    await onDataUpdate({ characters: updatedCharacters });
    setWardrobe(previous => normalizeWardrobe(previous, locations, updatedCharacters));
    setStatus(`${upperName(character.name, 'CHARACTER')} added to project cast.`);
  };

  const addLocationFromHistory = async (location) => {
    if (!location || hasAssetByName(locations, location.name)) return;
    const updatedLocations = [...locations, normalizeLibraryAsset(location, 'location')];
    await onDataUpdate({ locations: updatedLocations });
    setWardrobe(previous => normalizeWardrobe(previous, updatedLocations, characters));
    setActiveLocationIndex(updatedLocations.length - 1);
    setStatus(`${upperName(location.name, 'LOCATION')} added to project locations.`);
  };

  const saveWardrobe = async (nextStep = null) => {
    setIsSaving(true);
    setStatus('');
    try {
      await onDataUpdate({
        wardrobe,
        wardrobe_approved: true,
        current_step: nextStep || 6,
      });
      setStatus('Wardrobe saved.');
      if (nextStep) onNavigate(nextStep);
    } catch (error) {
      console.error('Wardrobe save failed:', error);
      setStatus('Wardrobe could not be saved. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadClick = (locIndex, charIndex) => {
    setUploadTarget({ locIndex, charIndex });
    fileInputRef.current?.click();
  };

  const handleWardrobeDrop = async (e, locIndex, charIndex) => {
    e.preventDefault();
    setDraggingTarget(null);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file || !projectId) return;

    setUploadTarget({ locIndex, charIndex });
    setIsUploading(true);
    setStatus('');
    try {
      const extension = file.type?.includes('png') ? 'png' : 'jpg';
      const path = `${projectId}/wardrobe/${Date.now()}-${safeFileName(file.name || `outfit.${extension}`)}`;
      const { error } = await supabase.storage.from('assets').upload(path, file, {
        contentType: file.type || (extension === 'png' ? 'image/png' : 'image/jpeg'),
        upsert: true,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      updateOutfit(locIndex, charIndex, { image_url: publicUrl, image_path: path });
    } catch (err) {
      console.error('Wardrobe drop upload failed:', err);
      setStatus('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !uploadTarget || !projectId) return;

    setIsUploading(true);
    setStatus('');
    try {
      const extension = file.type?.includes('png') ? 'png' : 'jpg';
      const path = `${projectId}/wardrobe/${Date.now()}-${safeFileName(file.name || `outfit.${extension}`)}`;
      const { error } = await supabase.storage.from('assets').upload(path, file, {
        contentType: file.type || (extension === 'png' ? 'image/png' : 'image/jpeg'),
        upsert: true,
      });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      updateOutfit(uploadTarget.locIndex, uploadTarget.charIndex, {
        image_url: publicUrl,
        image_path: path,
      });
      setStatus('Outfit image added. Save wardrobe when ready.');
    } catch (error) {
      console.error('Outfit image upload failed:', error);
      setStatus('Image upload failed. Try another file.');
    } finally {
      setIsUploading(false);
      setUploadTarget(null);
    }
  };

  if (!locations.length || !characters.length) {
    return (
      <div className="screen active screen-empty">
        <div className="panel-empty-state">
          <div className="icon-box-lg">
            <Shirt size={28} style={{ color: 'var(--cyan)' }} />
          </div>

          <h1 className="sidebar-header-title" style={{ margin: '0 0 10px' }}>
            Wardrobe needs cast and locations.
          </h1>
          <p className="body-sm" style={{ margin: '0 0 22px' }}>
            Add at least one character and one location before locking outfits by set.
          </p>

          <div className="flex-row flex-center gap-10" style={{ marginBottom: '18px' }}>
            <button className="btn-outline" onClick={() => onNavigate(4)}>Open cast</button>
            <button className="btn-orange" onClick={() => onNavigate(5)}>Open locations</button>
          </div>

          <div style={{ display: 'grid', gap: '10px', textAlign: 'left' }}>
            <select
              className="select-std"
              value=""
              onChange={event => {
                const item = globalCharacters.find(character => String(character.id) === event.target.value);
                if (item) addCharacterFromHistory(item);
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
                if (item) addLocationFromHistory(item);
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

  return (
    <div className="screen active screen-fill" id="s6">
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf,.heic,.heif,.webp,.avif" onChange={handleUploadImage} style={{ display: 'none' }} />

      <div className="layout-sidebar-main">

        {/* SIDEBAR */}
        <aside className="layout-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-header-kicker">▪ Wardrobe · Locks</div>
            <h1 className="sidebar-header-title">Dress each set.</h1>
            <p className="sidebar-header-desc">
              Optional outfit overrides by location. Blank rows use each character&apos;s base reference-sheet outfit.
            </p>
          </div>

          {/* Location buttons */}
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
                  <div className="flex-row gap-8" style={{ marginBottom: '6px', alignItems: 'center' }}>
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

          {/* Library panels */}
          <div className="sidebar-footer">
            <div className="sidebar-library-panel">
              <div className="sidebar-library-label">Add cast from history</div>
              <select
                className="select-sm"
                value=""
                onChange={event => {
                  const item = globalCharacters.find(character => String(character.id) === event.target.value);
                  if (item) addCharacterFromHistory(item);
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
                  if (item) addLocationFromHistory(item);
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

          {/* Continue button */}
          <div className="sidebar-continue">
            <button
              className="btn-teal"
              onClick={() => saveWardrobe(7)}
              disabled={isSaving || isUploading}
            >
              {isSaving
                ? <Loader2 size={14} className="spin" />
                : <Check size={14} />
              }
              Continue to Shot Plan
            </button>
          </div>
        </aside>

        {/* MAIN AREA */}
        <main className="main-content">

          {/* Main header */}
          <header className="main-header">
            <div className="main-header-row">
              <div>
                <div className="flex-row gap-10" style={{ marginBottom: '6px', alignItems: 'center' }}>
                  <Shirt size={18} style={{ color: 'var(--cyan)' }} />
                  <h2 className="main-header-title">
                    {activeLocation?.location_name || 'Wardrobe'}
                  </h2>
                </div>
                <p className="main-header-desc">
                  Every project character stays available here. Fill only the outfits you want to override; blank rows fall back to each character&apos;s base reference-sheet outfit.
                </p>
              </div>

              <div className="flex-row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="tag-badge tag-teal flex-row gap-6" style={{ alignItems: 'center' }}>
                  <Users size={12} /> {summary.outfitCount} locked
                </span>
                <span className="tag-badge tag-outline">{summary.locationCount} locations</span>
                <button
                  className="btn-outline"
                  onClick={() => saveWardrobe()}
                  disabled={isSaving || isUploading}
                  style={{ fontSize: '12px' }}
                >
                  {isSaving ? 'Saving...' : 'Save wardrobe'}
                </button>
              </div>
            </div>

            {status && (
              <div className={`status-message ${status.includes('failed') || status.includes('could not') ? 'status-message--error' : 'status-message--ok'}`}>
                {status}
              </div>
            )}
          </header>

          {/* Outfit grid */}
          <section className="main-section">
            <div className="grid-auto-fit">
              {(activeLocation?.outfits || []).map((outfit, charIndex) => (
                <article key={outfit.character_id || charIndex} className="outfit-grid-card">
                  {/* Card header row */}
                  <div className="flex-between" style={{ gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="outfit-char-name">{outfit.character_name}</div>
                      <div className="outfit-char-status">
                        {hasOutfitLock(outfit) ? 'Outfit override locked' : 'Uses base character outfit'}
                      </div>
                    </div>
                    <span className={`tag-badge ${hasOutfitLock(outfit) ? 'tag-teal' : 'tag-outline'}`} style={{ flexShrink: 0 }}>
                      {hasOutfitLock(outfit) ? 'Locked' : 'Default'}
                    </span>
                  </div>

                  {/* Image area — border colors are state-driven so stay inline */}
                  {(() => {
                    const isDragTarget = draggingTarget?.locIndex === activeLocationIndex && draggingTarget?.charIndex === charIndex;
                    const isThisUploading = isUploading && uploadTarget?.locIndex === activeLocationIndex && uploadTarget?.charIndex === charIndex;
                    const dragHandlers = {
                      onDragOver: (e) => { e.preventDefault(); if (!isUploading) setDraggingTarget({ locIndex: activeLocationIndex, charIndex }); },
                      onDragEnter: (e) => { e.preventDefault(); if (!isUploading) setDraggingTarget({ locIndex: activeLocationIndex, charIndex }); },
                      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDraggingTarget(null); },
                      onDrop: (e) => handleWardrobeDrop(e, activeLocationIndex, charIndex),
                    };
                    return outfit.image_url ? (
                      <div {...dragHandlers} style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => handleUploadClick(activeLocationIndex, charIndex)}
                          style={{
                            padding: 0,
                            border: isDragTarget ? '2px dashed var(--cyan-border)' : '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: 'var(--bg-deep)',
                            width: '100%',
                            maxHeight: '340px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'border-color 160ms ease-out',
                          }}
                          title="Click or drop to replace outfit image"
                        >
                          <img
                            src={outfit.image_url}
                            alt={`${outfit.character_name} outfit`}
                            style={{ width: '100%', height: '100%', maxHeight: '340px', objectFit: 'contain', display: 'block', opacity: isDragTarget ? 0.4 : 1, transition: 'opacity 160ms ease-out' }}
                          />
                          {isDragTarget && (
                            <div className="flex-col flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.06)', pointerEvents: 'none' }}>
                              <ImagePlus size={24} style={{ color: 'var(--cyan)' }} />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--cyan)' }}>Drop to replace</span>
                            </div>
                          )}
                          {isThisUploading && (
                            <div className="flex-center" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-950-rgb), 0.5)' }}>
                              <Loader2 size={24} className="spin" style={{ color: 'var(--cyan)' }} />
                            </div>
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUploadClick(activeLocationIndex, charIndex)}
                        {...dragHandlers}
                        disabled={isUploading}
                        style={{
                          background: isDragTarget ? 'rgba(var(--cyan-rgb), 0.04)' : 'var(--bg-deep)',
                          boxShadow: 'var(--neo-inset)',
                          border: isDragTarget ? '1.5px dashed var(--cyan-border)' : '1.5px dashed var(--border-mid)',
                          borderRadius: 'var(--radius)',
                          minHeight: '120px',
                          cursor: isUploading ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'column',
                          gap: '8px',
                          color: 'var(--text-muted)',
                          transition: 'border-color 160ms ease-out, background 160ms ease-out',
                        }}
                        onMouseEnter={e => { if (!draggingTarget) e.currentTarget.style.borderColor = 'var(--cyan-border)'; }}
                        onMouseLeave={e => { if (!draggingTarget) e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
                      >
                        {isThisUploading
                          ? <Loader2 size={20} className="spin" style={{ color: 'var(--cyan)' }} />
                          : <ImagePlus size={20} style={{ color: 'var(--cyan)' }} />
                        }
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {isDragTarget ? 'Drop to upload' : 'Click or drop image'}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Inputs */}
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <input
                      className="input-inset"
                      value={outfit.outfit_name || ''}
                      onChange={event => updateOutfit(activeLocationIndex, charIndex, { outfit_name: event.target.value })}
                      placeholder="Optional outfit name"
                    />
                    <textarea
                      className="textarea-inset"
                      value={outfit.description || ''}
                      onChange={event => updateOutfit(activeLocationIndex, charIndex, { description: event.target.value })}
                      placeholder="Optional override. Leave blank to use the base outfit from the character reference sheet."
                      style={{ minHeight: '88px' }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
