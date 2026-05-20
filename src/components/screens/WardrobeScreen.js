'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Shirt, Users } from 'lucide-react';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import QueueStatusBar from '../QueueStatusBar';
import { createClient } from '@/utils/supabase';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';
import {
  emptyList,
  normalizeWardrobe,
  summarizeWardrobe,
  hasAssetByName,
  normalizeLibraryAsset,
  upperName,
  buildWardrobeUploadPath,
} from './wardrobe/wardrobeConstants';
import WardrobeSidebar from './wardrobe/WardrobeSidebar';
import WardrobeEmptyState from './wardrobe/WardrobeEmptyState';
import OutfitCard from './wardrobe/OutfitCard';
import { SuggestScopeMenu, GenerateScopeMenu } from './wardrobe/WardrobeScopeMenus';

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
  const wardrobeRef = useRef(null);
  const [suggestingKey, setSuggestingKey] = useState(null);
  const [generatingImageKey, setGeneratingImageKey] = useState(null);
  const [generatingAllKey, setGeneratingAllKey] = useState(null);
  const [isSuggestingAllLocs, setIsSuggestingAllLocs] = useState(false);
  const [suggestAllProgress, setSuggestAllProgress] = useState({ done: 0, total: 0 });
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

  useEffect(() => {
    const handler = (e) => {
      if (suggestScopeRef.current && !suggestScopeRef.current.contains(e.target)) setShowSuggestScope(false);
      if (generateScopeRef.current && !generateScopeRef.current.contains(e.target)) setShowGenerateScope(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  wardrobeRef.current = wardrobe;

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

  const wardrobeQueue = useGenerationQueue({ concurrency: 2 });

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
        body: JSON.stringify({ projectState: projectData, locationName: loc.location_name, characters: [characterData] }),
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
        body: JSON.stringify({ projectState: projectData, locationName: loc.location_name, characters: charDataList }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setStatus(data.error || 'Suggestion failed.'); return; }

      let lastWardrobe = wardrobeRef.current;
      (data.outfits || []).forEach(suggested => {
        const charIndex = (loc.outfits || []).findIndex(o => o.character_name === suggested.character_name);
        if (charIndex === -1) return;
        lastWardrobe = updateOutfit(locIndex, charIndex, { outfit_name: suggested.outfit_name, description: suggested.description });
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
          projectId, projectState: projectData,
          character: characterData,
          outfit: { outfit_name: outfit.outfit_name, description: outfit.description },
          location: locationData,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setStatus(data.error || 'Image generation failed.'); return; }

      const next = updateOutfit(locIndex, charIndex, { image_url: data.image_url, image_path: data.image_path });
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
      <WardrobeEmptyState
        globalCharacters={globalCharacters}
        globalLocations={globalLocations}
        characters={characters}
        locations={locations}
        status={status}
        onAddCharacterFromHistory={addCharacterFromHistory}
        onAddLocationFromHistory={addLocationFromHistory}
      />
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

                  <SuggestScopeMenu
                    suggestScopeRef={suggestScopeRef}
                    showSuggestScope={showSuggestScope}
                    setShowSuggestScope={setShowSuggestScope}
                    setShowGenerateScope={setShowGenerateScope}
                    suggestingKey={suggestingKey}
                    generatingAllKey={generatingAllKey}
                    isSuggestingAllLocs={isSuggestingAllLocs}
                    isUploading={isUploading}
                    suggestAllProgress={suggestAllProgress}
                    activeLocation={activeLocation}
                    wardrobe={wardrobe}
                    onSuggestThisLocation={() => handleSuggestAllOutfits(activeLocationIndex)}
                    onSuggestAllLocations={handleSuggestAllLocations}
                  />

                  <GenerateScopeMenu
                    generateScopeRef={generateScopeRef}
                    showGenerateScope={showGenerateScope}
                    setShowGenerateScope={setShowGenerateScope}
                    setShowSuggestScope={setShowSuggestScope}
                    wardrobeQueue={wardrobeQueue}
                    pendingAll={(wardrobeRef.current || []).reduce((n, loc) =>
                      n + (loc.outfits || []).filter(o => o.description && !o.image_url).length, 0)}
                    pendingHere={((wardrobeRef.current?.[activeLocationIndex]?.outfits) || [])
                      .filter(o => o.description && !o.image_url).length}
                    activeLocation={activeLocation}
                    wardrobe={wardrobe}
                    onGenerateThisLocation={handleGenerateLocationImages}
                    onGenerateAllLocations={handleGenerateAllWardrobeImages}
                  />

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

            <section className="main-section">
              <div className="grid-auto-fit">
                {(activeLocation?.outfits || []).map((outfit, charIndex) => (
                  <OutfitCard
                    key={outfit.character_id || charIndex}
                    outfit={outfit}
                    charIndex={charIndex}
                    activeLocationIndex={activeLocationIndex}
                    isUploading={isUploading}
                    uploadTarget={uploadTarget}
                    draggingTarget={draggingTarget}
                    setDraggingTarget={setDraggingTarget}
                    suggestingKey={suggestingKey}
                    generatingAllKey={generatingAllKey}
                    generatingImageKey={generatingImageKey}
                    onUploadClick={handleUploadClick}
                    onDrop={handleWardrobeDrop}
                    onUpdateOutfit={updateOutfit}
                    onPersistWardrobe={persistWardrobe}
                    onSuggestOutfit={handleSuggestOutfit}
                    onGenerateOutfitImage={handleGenerateOutfitImage}
                    wardrobeRef={wardrobeRef}
                  />
                ))}
              </div>
            </section>
          </main>
        )}
        right={(
          <WardrobeSidebar
            wardrobe={wardrobe}
            activeLocationIndex={activeLocationIndex}
            setActiveLocationIndex={setActiveLocationIndex}
            characters={characters}
            locations={locations}
            suggestingKey={suggestingKey}
            generatingAllKey={generatingAllKey}
            isSuggestingAllLocs={isSuggestingAllLocs}
            suggestAllProgress={suggestAllProgress}
            wardrobeQueue={wardrobeQueue}
            wardrobeRef={wardrobeRef}
            globalCharacters={globalCharacters}
            globalLocations={globalLocations}
            onSuggestAllOutfits={handleSuggestAllOutfits}
            onGenerateLocationImages={handleGenerateLocationImages}
            onAddCharacterFromHistory={addCharacterFromHistory}
            onAddLocationFromHistory={addLocationFromHistory}
          />
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
