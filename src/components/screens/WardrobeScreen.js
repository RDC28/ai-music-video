'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ImagePlus, Lock, Loader2, MapPin, Shirt, Sparkles, UploadCloud, Users, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import QueueStatusBar from '../QueueStatusBar';
import { createClient } from '@/utils/supabase';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

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

function buildWardrobeUploadPath(projectId, fileName, extension = 'jpg') {
  return `${projectId}/wardrobe/${Date.now()}-${safeFileName(fileName || `outfit.${extension}`)}`;
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

export default function WardrobeScreen({ projectId, projectData = {}, onDataUpdate }) {
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
  // Always-current wardrobe ref so persistWardrobe() never captures stale closure
  const wardrobeRef = useRef(null);
  // AI generation state — keyed as `${locIndex}-${charIndex}`
  const [suggestingKey, setSuggestingKey] = useState(null);
  const [generatingImageKey, setGeneratingImageKey] = useState(null);
  const [generatingAllKey, setGeneratingAllKey] = useState(null);
  const [isSuggestingAllLocs, setIsSuggestingAllLocs] = useState(false);
  const [suggestAllProgress, setSuggestAllProgress] = useState({ done: 0, total: 0 });
  // Scope chooser menus
  const [showSuggestScope, setShowSuggestScope] = useState(false);
  const [showGenerateScope, setShowGenerateScope] = useState(false);
  const suggestScopeRef = useRef(null);
  const generateScopeRef = useRef(null);
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

  // Close scope menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (suggestScopeRef.current && !suggestScopeRef.current.contains(e.target)) setShowSuggestScope(false);
      if (generateScopeRef.current && !generateScopeRef.current.contains(e.target)) setShowGenerateScope(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keep ref current so persistWardrobe always uses latest state
  wardrobeRef.current = wardrobe;

  // Persist a wardrobe snapshot immediately — called after uploads, AI results, and text blur.
  const persistWardrobe = useCallback(async (snapshot) => {
    setIsSaving(true);
    try {
      await onDataUpdate({ wardrobe: snapshot, wardrobe_approved: true, current_step: 6 });
    } catch (err) {
      console.error('Wardrobe save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [onDataUpdate]);

  // Returns the updated wardrobe so callers can pass it directly to persistWardrobe.
  const updateOutfit = (locIndex, charIndex, updates) => {
    const next = wardrobeRef.current.map((location, index) => (
      index !== locIndex
        ? location
        : {
            ...location,
            outfits: location.outfits.map((outfit, outfitIndex) => (
              outfitIndex === charIndex ? { ...outfit, ...updates } : outfit
            )),
          }
    ));
    setWardrobe(next);
    setStatus('');
    return next;
  };

  // ── Batch wardrobe image generation ────────────────────────────────────────
  const wardrobeQueue = useGenerationQueue({ concurrency: 2 });

  // Coalescing save — prevents last-write-wins race when 2 outfit images complete simultaneously.
  const wardrobeSaveQRef = useRef({ pending: false, latest: null });
  const saveWardrobeCoalesced = useCallback(async (snapshot) => {
    wardrobeSaveQRef.current.latest = snapshot;
    if (wardrobeSaveQRef.current.pending) return;
    wardrobeSaveQRef.current.pending = true;
    while (wardrobeSaveQRef.current.latest) {
      const s = wardrobeSaveQRef.current.latest;
      wardrobeSaveQRef.current.latest = null;
      try { await onDataUpdate({ wardrobe: s, wardrobe_approved: true, current_step: 6 }); } catch (e) { console.error('[wardrobe save]', e); }
    }
    wardrobeSaveQRef.current.pending = false;
  }, [onDataUpdate]);

  // Pure worker for a single outfit image — throws on failure so queue can retry.
  const runWardrobeImageJob = useCallback(async (locIndex, charIndex) => {
    const currentWardrobe = wardrobeRef.current;
    const loc = currentWardrobe[locIndex];
    const outfit = loc?.outfits?.[charIndex];
    if (!outfit?.description) throw new Error('No outfit description');

    const characterData = characters.find(c =>
      String(c?.name || '').toUpperCase() === outfit.character_name
    ) || { name: outfit.character_name };
    const locationData = locations.find(l =>
      String(l?.name || '').toUpperCase() === loc.location_name
    ) || { name: loc.location_name };

    const res = await fetch('/api/generate-wardrobe-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        projectState: projectData,
        character: characterData,
        outfit: { outfit_name: outfit.outfit_name, description: outfit.description },
        location: locationData,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error || 'Image generation failed');
      err.status = res.status;
      throw err;
    }

    // Atomic update — read current ref so concurrent jobs don't overwrite each other.
    const patch = { image_url: data.image_url, image_path: data.image_path };
    const next = wardrobeRef.current.map((l, li) =>
      li !== locIndex ? l : {
        ...l,
        outfits: l.outfits.map((o, ci) => ci !== charIndex ? o : { ...o, ...patch }),
      }
    );
    wardrobeRef.current = next;
    setWardrobe(next);
    await saveWardrobeCoalesced(next);
    return data.image_url;
  }, [characters, locations, projectId, projectData, saveWardrobeCoalesced]);

  // Enqueue all outfit slots that have a description but no image yet.
  // Generate images for all outfits (across ALL locations) that have a description but no image.
  const handleGenerateAllWardrobeImages = useCallback(() => {
    if (wardrobeQueue.isActive) return;
    const jobs = [];
    wardrobeRef.current.forEach((loc, locIndex) => {
      (loc.outfits || []).forEach((outfit, charIndex) => {
        if (outfit.description && !outfit.image_url) {
          jobs.push({
            id: `wardrobe-${locIndex}-${charIndex}`,
            label: `${outfit.character_name} @ ${loc.location_name}`,
            run: () => runWardrobeImageJob(locIndex, charIndex),
          });
        }
      });
    });
    if (jobs.length) wardrobeQueue.enqueue(jobs);
    setShowGenerateScope(false);
  }, [wardrobeQueue, runWardrobeImageJob]);

  // Generate images for the ACTIVE location only.
  const handleGenerateLocationImages = useCallback(() => {
    if (wardrobeQueue.isActive) return;
    const loc = wardrobeRef.current[activeLocationIndex];
    if (!loc) return;
    const jobs = (loc.outfits || [])
      .map((outfit, charIndex) => ({ outfit, charIndex }))
      .filter(({ outfit }) => outfit.description && !outfit.image_url)
      .map(({ outfit, charIndex }) => ({
        id: `wardrobe-${activeLocationIndex}-${charIndex}`,
        label: `${outfit.character_name} @ ${loc.location_name}`,
        run: () => runWardrobeImageJob(activeLocationIndex, charIndex),
      }));
    if (jobs.length) wardrobeQueue.enqueue(jobs);
    setShowGenerateScope(false);
  }, [wardrobeQueue, runWardrobeImageJob, activeLocationIndex]);

  // Suggest outfits for ALL locations sequentially.
  const handleSuggestAllLocations = useCallback(async () => {
    if (suggestingKey || generatingAllKey || isSuggestingAllLocs) return;
    setShowSuggestScope(false);
    setIsSuggestingAllLocs(true);
    setSuggestAllProgress({ done: 0, total: wardrobe.length });
    setStatus('');
    for (let i = 0; i < wardrobe.length; i++) {
      const loc = wardrobeRef.current[i];
      if (!loc) continue;
      setGeneratingAllKey(`all-${i}`);
      setSuggestAllProgress({ done: i, total: wardrobe.length });
      try {
        const charDataList = (loc.outfits || []).map(outfit =>
          characters.find(c => String(c?.name || '').toUpperCase() === outfit.character_name) || { name: outfit.character_name }
        );
        const res = await fetch('/api/generate-wardrobe-outfit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectState: projectData, locationName: loc.location_name, characters: charDataList }),
        });
        const data = await res.json();
        if (res.ok && data.outfits?.length) {
          let snap = wardrobeRef.current;
          data.outfits.forEach(suggested => {
            const charIndex = (wardrobeRef.current[i]?.outfits || []).findIndex(o => o.character_name === suggested.character_name);
            if (charIndex === -1) return;
            snap = updateOutfit(i, charIndex, { outfit_name: suggested.outfit_name, description: suggested.description });
          });
          await persistWardrobe(snap);
        }
      } catch (err) {
        console.error(`[suggest-all] failed for ${loc.location_name}:`, err);
      }
    }
    setGeneratingAllKey(null);
    setIsSuggestingAllLocs(false);
    setSuggestAllProgress({ done: 0, total: 0 });
    setStatus(`AI suggested outfits for all ${wardrobe.length} locations.`);
  }, [suggestingKey, generatingAllKey, isSuggestingAllLocs, wardrobe, characters, projectData, updateOutfit, persistWardrobe]);

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

  // ── AI: suggest outfit text for a single character at the active location ──
  const handleSuggestOutfit = async (locIndex, charIndex) => {
    const key = `${locIndex}-${charIndex}`;
    if (suggestingKey || generatingAllKey) return;
    setSuggestingKey(key);
    setStatus('');
    try {
      const loc = wardrobe[locIndex];
      const outfit = loc?.outfits?.[charIndex];
      if (!outfit || !loc) return;

      const characterData = characters.find(c =>
        String(c?.name || '').toUpperCase() === outfit.character_name
      ) || { name: outfit.character_name };

      const res = await fetch('/api/generate-wardrobe-outfit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectState: projectData,
          locationName: loc.location_name,
          characters: [characterData],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setStatus(data.error || 'Outfit suggestion failed.'); return; }

      const suggested = data.outfits?.[0];
      if (suggested) {
        const next = updateOutfit(locIndex, charIndex, {
          outfit_name: suggested.outfit_name || outfit.outfit_name,
          description: suggested.description || outfit.description,
        });
        setStatus('AI outfit suggestion applied.');
        await persistWardrobe(next);
      }
    } catch (err) {
      console.error('handleSuggestOutfit error:', err);
      setStatus('Outfit suggestion failed. Try again.');
    } finally {
      setSuggestingKey(null);
    }
  };

  // ── AI: suggest outfits for all characters at the active location ──────
  const handleSuggestAllOutfits = async (locIndex) => {
    if (suggestingKey || generatingAllKey || isSuggestingAllLocs) return;
    setShowSuggestScope(false);
    setGeneratingAllKey(String(locIndex));
    setStatus('');
    try {
      const loc = wardrobe[locIndex];
      if (!loc) return;

      const charDataList = (loc.outfits || []).map(outfit => (
        characters.find(c => String(c?.name || '').toUpperCase() === outfit.character_name)
          || { name: outfit.character_name }
      ));

      const res = await fetch('/api/generate-wardrobe-outfit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectState: projectData,
          locationName: loc.location_name,
          characters: charDataList,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setStatus(data.error || 'Suggestion failed.'); return; }

      let lastWardrobe = wardrobeRef.current;
      (data.outfits || []).forEach(suggested => {
        const charIndex = (loc.outfits || []).findIndex(
          o => o.character_name === suggested.character_name
        );
        if (charIndex === -1) return;
        lastWardrobe = updateOutfit(locIndex, charIndex, {
          outfit_name: suggested.outfit_name,
          description: suggested.description,
        });
      });
      setStatus(`AI suggested ${data.outfits?.length || 0} outfits for ${loc.location_name}.`);
      await persistWardrobe(lastWardrobe);
    } catch (err) {
      console.error('handleSuggestAllOutfits error:', err);
      setStatus('Outfit suggestion failed. Try again.');
    } finally {
      setGeneratingAllKey(null);
    }
  };

  // ── AI: generate outfit image for a single character at active location ─
  const handleGenerateOutfitImage = async (locIndex, charIndex) => {
    const key = `${locIndex}-${charIndex}`;
    if (generatingImageKey) return;
    const loc = wardrobe[locIndex];
    const outfit = loc?.outfits?.[charIndex];
    if (!outfit?.description) {
      setStatus('Add an outfit description first, then generate the image.');
      return;
    }
    setGeneratingImageKey(key);
    setStatus('');
    try {
      const characterData = characters.find(c =>
        String(c?.name || '').toUpperCase() === outfit.character_name
      ) || { name: outfit.character_name };

      const locationData = locations.find(l =>
        String(l?.name || '').toUpperCase() === loc.location_name
      ) || { name: loc.location_name };

      const res = await fetch('/api/generate-wardrobe-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectState: projectData,
          character: characterData,
          outfit: { outfit_name: outfit.outfit_name, description: outfit.description },
          location: locationData,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setStatus(data.error || 'Image generation failed.'); return; }

      const next = updateOutfit(locIndex, charIndex, {
        image_url: data.image_url,
        image_path: data.image_path,
      });
      setStatus('Outfit image generated.');
      await persistWardrobe(next);
    } catch (err) {
      console.error('handleGenerateOutfitImage error:', err);
      setStatus('Outfit image generation failed. Try again.');
    } finally {
      setGeneratingImageKey(null);
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
      const path = buildWardrobeUploadPath(projectId, file.name, extension);
      const { error } = await supabase.storage.from('assets').upload(path, file, {
        contentType: file.type || (extension === 'png' ? 'image/png' : 'image/jpeg'),
        upsert: true,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      const next = updateOutfit(locIndex, charIndex, { image_url: publicUrl, image_path: path });
      await persistWardrobe(next);
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
      const path = buildWardrobeUploadPath(projectId, file.name, extension);
      const { error } = await supabase.storage.from('assets').upload(path, file, {
        contentType: file.type || (extension === 'png' ? 'image/png' : 'image/jpeg'),
        upsert: true,
      });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
      const next = updateOutfit(uploadTarget.locIndex, uploadTarget.charIndex, {
        image_url: publicUrl,
        image_path: path,
      });
      setStatus('Outfit image added.');
      await persistWardrobe(next);
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
      <WorkflowThreePaneShell
        showLeftPanel={false}
        rightTitle="Wardrobe Controls"
        storageKey="workflow-three-pane:s6"
        minRightWidth={320}
        maxRightWidth={560}
        defaultRightWidth={400}
        main={(
          <main className="main-content">

            {/* Main header */}
            <header className="main-header">
              <div className="main-header-row">
                <div>
                  <div className="flex-row gap-10" style={{ marginBottom: '0.375rem', alignItems: 'center' }}>
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
                  {/* Suggest all — scope chooser */}
                  <div ref={suggestScopeRef} style={{ position: 'relative' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => { setShowGenerateScope(false); setShowSuggestScope(v => !v); }}
                      disabled={!!suggestingKey || !!generatingAllKey || isSuggestingAllLocs || isUploading}
                      style={{ fontSize: '0.75rem' }}
                    >
                      {isSuggestingAllLocs
                        ? <><Loader2 size={13} className="spin" /> {suggestAllProgress.done}/{suggestAllProgress.total} locations…</>
                        : generatingAllKey
                          ? <><Loader2 size={13} className="spin" /> Suggesting…</>
                          : <><Sparkles size={13} /> Suggest all ▾</>}
                    </button>
                    {showSuggestScope && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 0.375rem)', right: 0, zIndex: 200, background: 'var(--surface-raised)', border: '0.0625rem solid var(--border-mid)', borderRadius: 'var(--radius)', boxShadow: 'var(--neo-raised)', minWidth: '13rem', overflow: 'hidden' }}>
                        <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', borderBottom: '0.0625rem solid var(--border)' }}>Suggest outfits for</div>
                        <button onClick={() => handleSuggestAllOutfits(activeLocationIndex)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <Sparkles size={13} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>This location</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{activeLocation?.location_name}</div>
                          </div>
                        </button>
                        <button onClick={handleSuggestAllLocations} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left', borderTop: '0.0625rem solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <Sparkles size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>All locations</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{wardrobe.length} locations · runs sequentially</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Generate all images — scope chooser */}
                  {(() => {
                    const pendingAll = (wardrobeRef.current || []).reduce((n, loc) =>
                      n + (loc.outfits || []).filter(o => o.description && !o.image_url).length, 0);
                    const pendingHere = ((wardrobeRef.current?.[activeLocationIndex]?.outfits) || [])
                      .filter(o => o.description && !o.image_url).length;
                    if (pendingAll === 0 && !wardrobeQueue.isActive) return null;
                    return (
                      <div ref={generateScopeRef} style={{ position: 'relative' }}>
                        <button
                          className="btn-action-generate"
                          onClick={() => { setShowSuggestScope(false); setShowGenerateScope(v => !v); }}
                          disabled={wardrobeQueue.isActive}
                          style={{ fontSize: '0.75rem' }}
                        >
                          {wardrobeQueue.isActive
                            ? <><Loader2 size={13} className="spin" /> {wardrobeQueue.stats.done}/{wardrobeQueue.stats.total} images…</>
                            : <><Wand2 size={13} /> Generate images ▾</>}
                        </button>
                        {showGenerateScope && (
                          <div style={{ position: 'absolute', top: 'calc(100% + 0.375rem)', right: 0, zIndex: 200, background: 'var(--surface-raised)', border: '0.0625rem solid var(--border-mid)', borderRadius: 'var(--radius)', boxShadow: 'var(--neo-raised)', minWidth: '14rem', overflow: 'hidden' }}>
                            <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', borderBottom: '0.0625rem solid var(--border)' }}>Generate outfit images for</div>
                            <button onClick={handleGenerateLocationImages} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'} disabled={pendingHere === 0}>
                              <Wand2 size={13} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: 600, color: pendingHere === 0 ? 'var(--text-muted)' : 'var(--text)' }}>This location</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{pendingHere} outfit{pendingHere === 1 ? '' : 's'} pending · {activeLocation?.location_name}</div>
                              </div>
                            </button>
                            <button onClick={handleGenerateAllWardrobeImages} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)', textAlign: 'left', borderTop: '0.0625rem solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                              <Wand2 size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>All locations</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{pendingAll} outfit{pendingAll === 1 ? '' : 's'} across {wardrobe.length} locations · runs in parallel</div>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {isSaving && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Loader2 size={10} className="spin" /> Saving…
                    </span>
                  )}
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
                    <div className="flex-between" style={{ gap: '0.75rem' }}>
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
                              border: isDragTarget ? '0.125rem dashed var(--cyan-border)' : '0.0625rem solid var(--border)',
                              borderRadius: 'var(--radius)',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              background: 'var(--bg-deep)',
                              width: '100%',
                              maxHeight: '21.25rem',
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
                              style={{ width: '100%', height: '100%', maxHeight: '21.25rem', objectFit: 'contain', display: 'block', opacity: isDragTarget ? 0.4 : 1, transition: 'opacity 160ms ease-out' }}
                            />
                            {isDragTarget && (
                              <div className="flex-col flex-center gap-6" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.06)', pointerEvents: 'none' }}>
                                <ImagePlus size={24} style={{ color: 'var(--cyan)' }} />
                                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--cyan)' }}>Drop to replace</span>
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
                            border: isDragTarget ? '0.0938rem dashed var(--cyan-border)' : '0.0938rem dashed var(--border-mid)',
                            borderRadius: 'var(--radius)',
                            minHeight: '7.5rem',
                            cursor: isUploading ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            gap: '0.5rem',
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
                          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                            {isDragTarget ? 'Drop to upload' : 'Click or drop image'}
                          </span>
                        </button>
                      );
                    })()}

                    {/* Inputs — onChange updates local state; onBlur persists to DB */}
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <input
                        className="input-inset"
                        value={outfit.outfit_name || ''}
                        onChange={event => updateOutfit(activeLocationIndex, charIndex, { outfit_name: event.target.value })}
                        onBlur={() => persistWardrobe(wardrobeRef.current)}
                        placeholder="Optional outfit name"
                      />
                      <textarea
                        className="textarea-inset"
                        value={outfit.description || ''}
                        onChange={event => updateOutfit(activeLocationIndex, charIndex, { description: event.target.value })}
                        onBlur={() => persistWardrobe(wardrobeRef.current)}
                        placeholder="Optional override. Leave blank to use the base outfit from the character reference sheet."
                        style={{ minHeight: '5.5rem' }}
                      />
                    </div>

                    {/* AI action row */}
                    {(() => {
                      const cardKey = `${activeLocationIndex}-${charIndex}`;
                      const isSuggesting = suggestingKey === cardKey;
                      const isGenImg = generatingImageKey === cardKey;
                      const busyElsewhere = !!(suggestingKey || generatingAllKey) && !isSuggesting;
                      const imgBusyElsewhere = !!generatingImageKey && !isGenImg;
                      const hasDescription = Boolean(outfit.description?.trim());
                      return (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleSuggestOutfit(activeLocationIndex, charIndex)}
                            disabled={isSuggesting || busyElsewhere || isUploading}
                            title="Ask AI to suggest an outfit for this character at this location"
                            style={{ flex: 1, fontSize: '0.6875rem', minWidth: '7rem', justifyContent: 'center' }}
                          >
                            {isSuggesting
                              ? <><Loader2 size={11} className="spin" /> Suggesting…</>
                              : <><Sparkles size={11} /> AI Suggest</>}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleGenerateOutfitImage(activeLocationIndex, charIndex)}
                            disabled={isGenImg || imgBusyElsewhere || isUploading || !hasDescription}
                            title={hasDescription ? 'Generate outfit image from description' : 'Add a description first'}
                            style={{ flex: 1, fontSize: '0.6875rem', minWidth: '7rem', justifyContent: 'center' }}
                          >
                            {isGenImg
                              ? <><Loader2 size={11} className="spin" /> Generating…</>
                              : <><Wand2 size={11} /> Generate image</>}
                          </button>
                        </div>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </section>
          </main>
        )}
        right={(
          <aside className="layout-sidebar" style={{ width: '100%' }}>
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

          <div className="sidebar-continue" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* AI action shortcuts */}
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button
                className="btn-secondary"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.6875rem', justifyContent: 'center' }}
                onClick={() => handleSuggestAllOutfits(activeLocationIndex)}
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
                    onClick={handleGenerateLocationImages}
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
        )}
      />

      <QueueStatusBar
        jobs={wardrobeQueue.jobs}
        isActive={wardrobeQueue.isActive}
        stats={wardrobeQueue.stats}
        onAbort={wardrobeQueue.abort}
        onClear={wardrobeQueue.clear}
        label="Outfit images"
      />
    </div>
  );
}
