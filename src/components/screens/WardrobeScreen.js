'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, MapPin, Shirt, Users } from 'lucide-react';
import { createClient } from '@/utils/supabase';

const emptyWardrobe = [];
const emptyList = [];
const libraryPanelStyle = {
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '8px',
  background: '#0d0d0d',
  padding: '10px',
  display: 'grid',
  gap: '8px',
};

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
      <div
        className="screen active"
        style={{
          height: '100%',
          overflow: 'hidden',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            textAlign: 'center',
            background: 'var(--surface-2)',
            boxShadow: '6px 6px 14px #09090C, -6px -6px 14px #1A1A1F',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '40px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--surface-2)',
              boxShadow: '6px 6px 14px #09090C, -6px -6px 14px #1A1A1F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Shirt size={28} style={{ color: 'var(--cyan)' }} />
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--text)',
              margin: '0 0 10px',
            }}
          >
            Wardrobe needs cast and locations.
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              margin: '0 0 22px',
            }}
          >
            Add at least one character and one location before locking outfits by set.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '18px' }}>
            <button className="btn-outline" onClick={() => onNavigate(4)}>Open cast</button>
            <button className="btn-orange" onClick={() => onNavigate(5)}>Open locations</button>
          </div>

          <div style={{ display: 'grid', gap: '10px', textAlign: 'left' }}>
            <select
              value=""
              onChange={event => {
                const item = globalCharacters.find(character => String(character.id) === event.target.value);
                if (item) addCharacterFromHistory(item);
              }}
              style={{
                background: 'var(--bg-deep)',
                boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '10px 12px',
                fontSize: '12px',
                width: '100%',
                outline: 'none',
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
              value=""
              onChange={event => {
                const item = globalLocations.find(location => String(location.id) === event.target.value);
                if (item) addLocationFromHistory(item);
              }}
              style={{
                background: 'var(--bg-deep)',
                boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '10px 12px',
                fontSize: '12px',
                width: '100%',
                outline: 'none',
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
            <div
              style={{
                marginTop: '12px',
                color: status.includes('failed') || status.includes('could not') ? 'var(--error)' : 'var(--cyan)',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {status}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="screen active"
      id="s6"
      style={{ height: '100%', overflow: 'hidden', background: 'var(--bg)' }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadImage} style={{ display: 'none' }} />

      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

        {/* SIDEBAR */}
        <aside
          style={{
            width: '292px',
            flexShrink: 0,
            background: 'var(--bg-deep)',
            boxShadow: '4px 0 16px rgba(0,0,0,0.4)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Sidebar header */}
          <div style={{ padding: '24px' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--cyan)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginBottom: '10px',
              }}
            >
              ▪ Wardrobe · Locks
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--text)',
                margin: '0 0 8px',
              }}
            >
              Dress each set.
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Optional outfit overrides by location. Blank rows use each character&apos;s base reference-sheet outfit.
            </p>
          </div>

          {/* Location buttons */}
          <div
            style={{
              padding: '0 16px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {wardrobe.map((location, index) => {
              const active = index === activeLocationIndex;
              const lockedCount = (location.outfits || []).filter(hasOutfitLock).length;
              return (
                <button
                  key={location.location_id || index}
                  type="button"
                  onClick={() => setActiveLocationIndex(index)}
                  style={{
                    background: active ? 'var(--surface-2)' : 'transparent',
                    boxShadow: active ? '3px 3px 8px #09090C, -3px -3px 8px #1A1A1F' : 'none',
                    border: active ? '1px solid var(--cyan-border)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '12px',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'all 160ms ease-out',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <MapPin size={14} style={{ color: active ? 'var(--cyan)' : 'var(--text-muted)' }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: 'var(--text)',
                      }}
                    >
                      {location.location_name}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {lockedCount}/{characters.length} outfit locks
                  </div>
                </button>
              );
            })}
          </div>

          {/* Library panels */}
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                background: 'var(--bg-deep)',
                boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Add cast from history
              </div>
              <select
                value=""
                onChange={event => {
                  const item = globalCharacters.find(character => String(character.id) === event.target.value);
                  if (item) addCharacterFromHistory(item);
                }}
                style={{
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  padding: '8px 10px',
                  fontSize: '11px',
                  width: '100%',
                  outline: 'none',
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

            <div
              style={{
                background: 'var(--bg-deep)',
                boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Add set from history
              </div>
              <select
                value=""
                onChange={event => {
                  const item = globalLocations.find(location => String(location.id) === event.target.value);
                  if (item) addLocationFromHistory(item);
                }}
                style={{
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  padding: '8px 10px',
                  fontSize: '11px',
                  width: '100%',
                  outline: 'none',
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
          <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>
            <button
              className="btn-teal"
              onClick={() => saveWardrobe(7)}
              disabled={isSaving || isUploading}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isSaving
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Check size={14} />
              }
              Continue to Shot Plan
            </button>
          </div>
        </aside>

        {/* MAIN AREA */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Main header */}
          <header
            style={{
              padding: '20px 28px',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(17,17,20,0.95)',
              backdropFilter: 'blur(12px)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '18px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <Shirt size={18} style={{ color: 'var(--cyan)' }} />
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '20px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      margin: 0,
                    }}
                  >
                    {activeLocation?.location_name || 'Wardrobe'}
                  </h2>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--text-muted)',
                    maxWidth: '720px',
                    fontSize: '13px',
                    lineHeight: 1.6,
                  }}
                >
                  Every project character stays available here. Fill only the outfits you want to override; blank rows fall back to each character&apos;s base reference-sheet outfit.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="tag-badge tag-teal" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
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
              <div
                style={{
                  marginTop: '12px',
                  color: status.includes('failed') || status.includes('could not') ? 'var(--error)' : 'var(--cyan)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {status}
              </div>
            )}
          </header>

          {/* Section grid */}
          <section style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 80px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
                alignItems: 'stretch',
              }}
            >
              {(activeLocation?.outfits || []).map((outfit, charIndex) => (
                <article
                  key={outfit.character_id || charIndex}
                  style={{
                    background: 'var(--surface-2)',
                    boxShadow: '6px 6px 14px #09090C, -6px -6px 14px #1A1A1F',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px',
                    display: 'grid',
                    gap: '14px',
                  }}
                >
                  {/* Card header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: '15px',
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {outfit.character_name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          marginTop: '3px',
                        }}
                      >
                        {hasOutfitLock(outfit) ? 'Outfit override locked' : 'Uses base character outfit'}
                      </div>
                    </div>
                    <span className={`tag-badge ${hasOutfitLock(outfit) ? 'tag-teal' : 'tag-outline'}`} style={{ flexShrink: 0 }}>
                      {hasOutfitLock(outfit) ? 'Locked' : 'Default'}
                    </span>
                  </div>

                  {/* Image area */}
                  {outfit.image_url ? (
                    <button
                      type="button"
                      onClick={() => handleUploadClick(activeLocationIndex, charIndex)}
                      style={{
                        padding: 0,
                        aspectRatio: '16/10',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                      title="Replace outfit image"
                    >
                      <img
                        src={outfit.image_url}
                        alt={`${outfit.character_name} outfit`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUploadClick(activeLocationIndex, charIndex)}
                      disabled={isUploading}
                      style={{
                        background: 'var(--bg-deep)',
                        boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                        border: '1.5px dashed var(--border-mid)',
                        borderRadius: 'var(--radius)',
                        minHeight: '120px',
                        cursor: isUploading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '8px',
                        color: 'var(--text-muted)',
                        transition: 'border-color 160ms ease-out',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--cyan-border)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
                    >
                      {isUploading && uploadTarget?.locIndex === activeLocationIndex && uploadTarget?.charIndex === charIndex
                        ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--cyan)' }} />
                        : <ImagePlus size={20} style={{ color: 'var(--cyan)' }} />
                      }
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Upload outfit image</span>
                    </button>
                  )}

                  {/* Inputs */}
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <input
                      value={outfit.outfit_name || ''}
                      onChange={event => updateOutfit(activeLocationIndex, charIndex, { outfit_name: event.target.value })}
                      placeholder="Optional outfit name"
                      style={{
                        background: 'var(--bg-deep)',
                        boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '10px 12px',
                        color: 'var(--text)',
                        fontSize: '12px',
                        width: '100%',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    <textarea
                      value={outfit.description || ''}
                      onChange={event => updateOutfit(activeLocationIndex, charIndex, { description: event.target.value })}
                      placeholder="Optional override. Leave blank to use the base outfit from the character reference sheet."
                      style={{
                        background: 'var(--bg-deep)',
                        boxShadow: 'inset 4px 4px 10px #09090C, inset -4px -4px 10px #1A1A1F',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '10px 12px',
                        color: 'var(--text)',
                        fontSize: '12px',
                        width: '100%',
                        boxSizing: 'border-box',
                        outline: 'none',
                        minHeight: '88px',
                        resize: 'vertical',
                        lineHeight: 1.5,
                        fontFamily: 'var(--font-body)',
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
