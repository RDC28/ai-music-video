'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import QueueStatusBar from '../QueueStatusBar';
import { createClient } from '@/utils/supabase';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

import {
  LOCATION_STEPS,
  buildScriptLocationDescription,
  normalizeLocationLabel,
} from './locations/locationConstants';
import LocationImageModal from './locations/LocationImageModal';
import LocationSidebar from './locations/LocationSidebar';
import LocationFormPanel from './locations/LocationFormPanel';

export default function LocationsScreen({ projectData = [], projectState = {}, onDataUpdate, projectId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [globalLibrary, setGlobalLibrary] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isPanelEditing, setIsPanelEditing] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createRefImage, setCreateRefImage] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isProcessingSheet, setIsProcessingSheet] = useState(false);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingLoc, setGeneratingLoc] = useState(null);
  const [zoomCropTarget, setZoomCropTarget] = useState(null);
  const [activeCategory, setActiveCategory] = useState('project');
  const [scriptPromptPreview, setScriptPromptPreview] = useState(null);
  const [pendingSheetFile, setPendingSheetFile] = useState(null);
  const [sheetReplaceTarget, setSheetReplaceTarget] = useState(null);
  const [showSheetCropModal, setShowSheetCropModal] = useState(false);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState(null);
  const [sheetWarning, setSheetWarning] = useState(null);
  const [sheetProcessStatus, setSheetProcessStatus] = useState('');
  const [locProgressStep, setLocProgressStep] = useState(-1);

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);

  const [boardCards, setBoardCards] = useState([]);
  const [cardZOrder, setCardZOrder] = useState([]);
  const [isDragOverBoard, setIsDragOverBoard] = useState(false);
  const dragState = useRef(null);
  const resizeState = useRef(null);
  const boardRef = useRef(null);
  const CARD_DEFAULT_W = 280;
  const CARD_MIN_W = 160;
  const CARD_MAX_W = 800;
  const supabase = useMemo(() => createClient(), []);
  const projectLocations = projectData || [];

  const locationQueue = useGenerationQueue({ concurrency: 1 });
  const projectLocationsRef = useRef(projectLocations);
  useEffect(() => { projectLocationsRef.current = projectLocations; }, [projectLocations]);
  const generatingReplaceIndex = Number.isInteger(generatingLoc?.replaceIndex)
    ? generatingLoc.replaceIndex
    : null;
  const displayedLocations = activeCategory === 'project'
    ? [
        ...projectLocations.map((loc, index) => (
          generatingReplaceIndex === index ? generatingLoc : loc
        )),
        ...(generatingLoc && generatingReplaceIndex === null ? [generatingLoc] : []),
      ]
    : globalLibrary;
  const activeLoc = displayedLocations[activeTab] || null;
  const isGeneratingActive = Boolean(activeLoc?.isGeneratingReference || activeLoc?.id === 'generating');
  const busy = isProcessingSheet || isGenerating;

  const loadGlobalLibrary = useCallback(async () => {
    const { data, error } = await supabase.from('locations_library').select('*').order('created_at', { ascending: false });
    return !error && data ? data : null;
  }, [supabase]);

  const refreshGlobalLibrary = useCallback(async () => {
    const data = await loadGlobalLibrary();
    if (data) setGlobalLibrary(data);
  }, [loadGlobalLibrary]);

  useEffect(() => {
    let isActive = true;
    loadGlobalLibrary().then(data => {
      if (isActive && data) setGlobalLibrary(data);
    });
    return () => { isActive = false; };
  }, [loadGlobalLibrary]);

  const base64ToBlob = (b64, mime) => {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const uploadBlob = async (blob, _mime, path) => {
    const { error } = await supabase.storage.from('assets').upload(path, blob);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
    return publicUrl;
  };

  const callNBPro = async (payload) => {
    const res = await fetch('/api/generate-location-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  };

  const saveToGlobalLibrary = async (locObj, source) => {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error(userErr?.message || 'No user found');
      const { error: insErr } = await supabase.from('locations_library').insert({
        user_id: user.id,
        name: locObj.name,
        description: locObj.description,
        images: locObj.images,
        source: source,
        sheet_url: locObj.sheetUrl || null
      });
      if (insErr) throw insErr;
      await refreshGlobalLibrary();
    } catch (err) {
      console.error('Failed to save to global library:', err);
    }
  };

  const handleAddHistoryToProject = async () => {
    if (!activeLoc || activeCategory !== 'history') return;
    const existingIndex = projectLocations.findIndex(location => (
      String(location?.name || '').trim().toLowerCase() === String(activeLoc.name || '').trim().toLowerCase()
    ));
    if (existingIndex >= 0) {
      setActiveCategory('project');
      setActiveTab(existingIndex);
      return;
    }
    const newLoc = {
      ...activeLoc,
      id: `location-${activeLoc.id || Date.now()}-${Date.now()}`,
      name: String(activeLoc.name || 'LOCATION').trim().toUpperCase(),
      description: activeLoc.description || activeLoc.visual_prompt || '',
      visual_prompt: activeLoc.visual_prompt || activeLoc.description || '',
      images: Array.isArray(activeLoc.images) ? activeLoc.images : [],
      source: activeLoc.source || 'history',
      sheetUrl: activeLoc.sheetUrl || activeLoc.sheet_url || null,
    };
    const updatedLocs = [...projectLocations, newLoc];
    await onDataUpdate({ locations: updatedLocs });
    setActiveCategory('project');
    setActiveTab(updatedLocs.length - 1);
  };

  const handleRefImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const [prefix, base64] = dataUrl.split(',');
      const mimeType = prefix.match(/:(.*?);/)[1];
      setCreateRefImage({ base64, mimeType, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleSheetUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const previewUrl = URL.createObjectURL(file);
    setSheetPreviewUrl(previewUrl);
    setSheetWarning(null);
    setSheetProcessStatus('');
    setPendingSheetFile(file);
    setShowSheetCropModal(true);
  };

  const handleSheetDrop = (e) => {
    e.preventDefault();
    setIsDraggingSheet(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || busy) return;
    setSheetReplaceTarget(null);
    handleSheetUpload({ target: { files: [file], value: '' } });
  };

  const handleRefDrop = (e) => {
    e.preventDefault();
    setIsDraggingRef(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleRefImageSelect({ target: { files: [file], value: '' } });
  };

  const handleCloseSheetCropModal = () => {
    if (isProcessingSheet) return;
    if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
    setSheetPreviewUrl(null);
    setSheetWarning(null);
    setSheetProcessStatus('');
    setPendingSheetFile(null);
    setSheetReplaceTarget(null);
    setShowSheetCropModal(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processSheetFile = async (file) => {
    if (!file) return;
    setIsProcessingSheet(true);
    setSheetProcessStatus('Uploading sheet...');
    try {
      const sheetPath = `${projectId}/sheets/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, file);
      if (upErr) throw upErr;
      const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);
      setSheetProcessStatus('Detecting location views...');
      const { poses, error: splitErr, warning } = await fetch('/api/split-location-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sheetUrl }),
      }).then(r => r.json());
      if (splitErr) throw new Error(splitErr);
      if (!poses?.length) throw new Error('No location views were detected in this sheet.');
      if (warning) setSheetWarning(warning);
      const replaceIndex = Number.isInteger(sheetReplaceTarget?.index) && sheetReplaceTarget.index >= 0 && sheetReplaceTarget.index < projectLocations.length
        ? sheetReplaceTarget.index
        : null;
      const existingLoc = replaceIndex !== null ? projectLocations[replaceIndex] : null;
      const locName = existingLoc
        ? (sheetReplaceTarget?.name || existingLoc.name || file.name.split('.')[0]).trim().toUpperCase()
        : file.name.split('.')[0].toUpperCase();
      const locDescription = existingLoc
        ? (sheetReplaceTarget?.description ?? existingLoc.description ?? 'Uploaded from location sheet')
        : 'Uploaded from location sheet';
      setGeneratingLoc({
        ...(existingLoc || {}),
        id: existingLoc?.id || 'generating',
        name: locName,
        description: locDescription,
        images: poses.map((p, i) => ({ label: normalizeLocationLabel(p.label, i), url: null })),
        isGeneratingReference: true,
        replaceIndex,
      });
      setActiveTab(replaceIndex !== null ? replaceIndex : projectLocations.length);
      setActiveCategory('project');
      setSheetProcessStatus(`Detected ${poses.length} views. Refining crops...`);
      setShowSheetCropModal(false);
      const img = await new Promise((res, rej) => {
        const el = new Image(); el.crossOrigin = 'anonymous';
        el.onload = () => res(el); el.onerror = rej; el.src = sheetUrl;
      });
      const finalImages = new Array(poses.length).fill(null);
      await Promise.all(poses.map(async (pose, i) => {
        setSheetProcessStatus(`Refining view ${i + 1} of ${poses.length}...`);
        const label = normalizeLocationLabel(pose.label, i);
        const [ymin, xmin, ymax, xmax] = pose.box_2d;
        const sx = Math.max(0, (xmin / 1000) * img.width);
        const sy = Math.max(0, (ymin / 1000) * img.height);
        const sw = Math.min((xmax / 1000) * img.width, img.width) - sx;
        const sh = Math.min((ymax / 1000) * img.height, img.height) - sy;
        if (sw <= 0 || sh <= 0) return;
        const cv = document.createElement('canvas');
        cv.width = sw; cv.height = sh;
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const cropB64 = cv.toDataURL('image/jpeg', 0.95).split(',')[1];
        let finalB64 = cropB64, finalMime = 'image/jpeg';
        try {
          const nb = await callNBPro({ base64: cropB64, mimeType: 'image/jpeg', label });
          if (nb.success && nb.base64) { finalB64 = nb.base64; finalMime = 'image/png'; }
        } catch (e) {
          console.warn("NB Pro refinement failed for zone, using raw crop", e);
        }
        const blob = base64ToBlob(finalB64, finalMime);
        const ext = finalMime.split('/')[1] || 'png';
        const url = await uploadBlob(blob, finalMime, `${projectId}/generated/${Date.now()}-zone-${i}.${ext}`);
        const imageData = { url, label, box_2d: pose.box_2d, width: Math.round(sw), height: Math.round(sh) };
        finalImages[i] = imageData;
        setGeneratingLoc(prev => {
          if (!prev) return prev;
          const newImgs = [...prev.images];
          newImgs[i] = imageData;
          return { ...prev, images: newImgs };
        });
      }));
      const newLoc = {
        ...(existingLoc || {}),
        id: existingLoc?.id || Date.now(),
        name: locName,
        description: locDescription,
        images: finalImages.filter(Boolean),
        source: 'upload',
        sheetUrl,
        warning: warning || null,
      };
      const updatedLocs = [...projectLocations];
      if (replaceIndex !== null) {
        updatedLocs[replaceIndex] = newLoc;
      } else {
        updatedLocs.push(newLoc);
      }
      await onDataUpdate({ locations: updatedLocs });
      setActiveTab(replaceIndex !== null ? replaceIndex : updatedLocs.length - 1);
      if (replaceIndex === null) saveToGlobalLibrary(newLoc, 'upload');
      if (warning) alert(warning);
    } catch (err) {
      console.error('Sheet processing failed:', err);
      alert('We could not process that location sheet. Please try another image.');
    } finally {
      setIsProcessingSheet(false);
      setGeneratingLoc(null);
      if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
      setSheetPreviewUrl(null);
      setSheetWarning(null);
      setSheetProcessStatus('');
      setPendingSheetFile(null);
      setSheetReplaceTarget(null);
      setShowSheetCropModal(false);
    }
  };

  const generateLocationReferences = async ({ name, description, refImage = null, replaceIndex = null }) => {
    const locName = name.trim().toUpperCase();
    const desc = description.trim();
    setShowCreateModal(false);
    setCreateName('');
    setCreateDesc('');
    setCreateRefImage(null);
    setIsGenerating(true);
    setLocProgressStep(0);
    try {
      const tempId = Date.now();
      const isReplacing = Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < projectLocations.length;
      const existingLoc = isReplacing ? projectLocations[replaceIndex] : null;
      setGeneratingLoc({
        ...(existingLoc || {}),
        id: existingLoc?.id || tempId,
        name: locName,
        description: desc,
        images: [{ label: 'LOCATION SHEET', url: null }],
        isGeneratingReference: true,
        replaceIndex: isReplacing ? replaceIndex : null,
      });
      setActiveTab(isReplacing ? replaceIndex : projectLocations.length);
      setActiveCategory('project');
      setLocProgressStep(1);
      const payload = { locationDescription: desc, locationName: locName, label: 'LOCATION SHEET', projectState };
      if (refImage?.base64) {
        payload.base64 = refImage.base64;
        payload.mimeType = refImage.mimeType || 'image/png';
        payload.angleDescription = 'Full 360° location reference sheet';
      }
      const resp = await fetch('/api/generate-location-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const { imageBase64, error: genError } = await resp.json();
      if (genError) throw new Error(genError);
      if (!imageBase64) throw new Error('No image data returned from location sheet generation.');
      const blob = base64ToBlob(imageBase64, 'image/png');
      const sheetPath = `${projectId}/generated/${Date.now()}-${locName.replace(/\s+/g, '_')}-sheet.png`;
      const sheetUrl = await uploadBlob(blob, 'image/png', sheetPath);
      const sheetImage = { url: sheetUrl, label: 'LOCATION SHEET' };
      setGeneratingLoc(prev => prev ? { ...prev, images: [sheetImage] } : prev);
      setLocProgressStep(LOCATION_STEPS.length - 1);
      const newLoc = {
        ...(existingLoc || {}),
        id: existingLoc?.id || tempId,
        name: locName,
        description: desc,
        visual_prompt: existingLoc?.visual_prompt || desc,
        images: [sheetImage],
        sheetUrl,
        source: 'ai',
      };
      const updatedLocs = [...projectLocations];
      if (isReplacing) {
        updatedLocs[replaceIndex] = newLoc;
      } else {
        updatedLocs.push(newLoc);
      }
      await onDataUpdate({ locations: updatedLocs });
      setActiveTab(isReplacing ? replaceIndex : updatedLocs.length - 1);
      if (!isReplacing) saveToGlobalLibrary(newLoc, 'ai');
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Location could not be created. Please try again.');
    } finally {
      setIsGenerating(false);
      setLocProgressStep(-1);
      setGeneratingLoc(null);
    }
  };

  const runLocationSheetJob = useCallback(async (loc, replaceIndex) => {
    const locName = String(loc.name || '').trim().toUpperCase();
    const desc = buildScriptLocationDescription(loc, projectState);
    if (!desc.trim()) throw new Error(`No description for ${locName}`);
    const res = await fetch('/api/generate-location-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationDescription: desc, locationName: locName, label: 'LOCATION SHEET', projectState }),
    });
    const result = await res.json();
    if (!res.ok || result.error || !result.imageBase64) {
      const err = new Error(result.error || 'Location sheet generation failed');
      err.status = res.status;
      throw err;
    }
    const bytes = atob(result.imageBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    const sheetPath = `${projectId}/generated/${Date.now()}-${locName.replace(/\s+/g, '_')}-sheet.png`;
    const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, blob);
    if (upErr) throw upErr;
    const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);
    const newLoc = { ...loc, images: [{ url: sheetUrl, label: 'LOCATION SHEET' }], sheetUrl, source: 'ai' };
    const locs = [...projectLocationsRef.current];
    locs[replaceIndex] = newLoc;
    projectLocationsRef.current = locs;
    await onDataUpdate({ locations: locs });
    return sheetUrl;
  }, [projectState, projectId, supabase, onDataUpdate]);

  const handleGenerateAllLocationSheets = useCallback(() => {
    if (locationQueue.isActive) return;
    const jobs = projectLocations
      .map((loc, index) => ({ loc, index }))
      .filter(({ loc }) => !loc.sheetUrl && !loc.isGeneratingReference && loc.name)
      .map(({ loc, index }) => ({
        id: `loc-sheet-${index}`,
        label: loc.name,
        run: () => runLocationSheetJob(loc, index),
      }));
    if (jobs.length) locationQueue.enqueue(jobs);
  }, [projectLocations, locationQueue, runLocationSheetJob]);

  const handleGenerateAngles = async () => {
    if (!createName.trim()) return alert('Enter a location name');
    if (!createDesc.trim()) return alert('Describe the location');
    await generateLocationReferences({ name: createName, description: createDesc, refImage: createRefImage });
  };

  const handleGenerateFromScript = () => {
    const targetIndex = activeCategory === 'project' && activeLoc && activeLoc.id !== 'generating'
      ? activeTab
      : -1;
    const scriptLocations = Array.isArray(projectState?.locations) ? projectState.locations : [];
    const sourceLocation = targetIndex >= 0
      ? projectLocations[targetIndex]
      : scriptLocations.find(location => location?.name || location?.visual_prompt || location?.description);
    if (!sourceLocation) {
      alert('Generate or approve the script first so I can pull a location brief from it.');
      return;
    }
    const name = sourceLocation.name || 'SCRIPT LOCATION';
    const description = buildScriptLocationDescription(sourceLocation, projectState);
    if (!description.trim()) {
      alert('The script does not include enough location detail yet.');
      return;
    }
    setScriptPromptPreview({ name, description, replaceIndex: targetIndex >= 0 ? targetIndex : null });
  };

  const handleConfirmScriptGenerate = async () => {
    if (!scriptPromptPreview) return;
    const { name, description, replaceIndex } = scriptPromptPreview;
    setScriptPromptPreview(null);
    await generateLocationReferences({ name, description, replaceIndex });
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    try {
      if (activeCategory === 'history') {
        const { error } = await supabase
          .from('locations_library')
          .update({ name: editName.trim().toUpperCase(), description: editDesc.trim() })
          .eq('id', activeLoc.id);
        if (error) throw error;
        await refreshGlobalLibrary();
      } else {
        const updatedLocs = [...projectLocations];
        updatedLocs[activeTab] = { ...projectLocations[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
        await onDataUpdate({ locations: updatedLocs });
      }
      setIsPanelEditing(false);
    } catch (error) {
      console.error('Location rename failed:', error);
      alert('Location could not be renamed. Please try again.');
    }
  };

  const handleApplyCrop = async (blob, newLabel, cropMeta = null) => {
    if (!zoomCropTarget) return;
    const { locIdx, imgIdx } = zoomCropTarget;
    try {
      const url = await uploadBlob(blob, 'image/jpeg', `${projectId}/crops/${Date.now()}-crop.jpg`);
      const loc = projectLocations[locIdx];
      const images = [...loc.images];
      const sizeMeta = cropMeta?.width && cropMeta?.height ? { width: cropMeta.width, height: cropMeta.height } : {};
      if (imgIdx === null) {
        images.push({ url, label: normalizeLocationLabel(newLabel || 'CUSTOM VIEW', images.length), ...sizeMeta });
      } else {
        const existing = images[imgIdx];
        images[imgIdx] = { url, label: normalizeLocationLabel(newLabel || (typeof existing === 'string' ? `View ${imgIdx + 1}` : existing.label), imgIdx), ...sizeMeta };
      }
      const updatedLocs = [...projectLocations];
      updatedLocs[locIdx] = { ...loc, images };
      await onDataUpdate({ locations: updatedLocs });
      setZoomCropTarget(null);
    } catch { alert('Crop could not be saved. Please try again.'); }
  };

  const handleDelete = async () => {
    if (!activeLoc || activeLoc.id === 'generating') return;
    if (!confirm(`Delete ${activeLoc.name}?`)) return;
    try {
      if (activeCategory === 'project') {
        await onDataUpdate({ locations: projectLocations.filter((_, i) => i !== activeTab) });
        setActiveTab(Math.max(0, activeTab - 1));
      } else {
        const { error } = await supabase.from('locations_library').delete().eq('id', activeLoc.id);
        if (error) throw error;
        await refreshGlobalLibrary();
        setActiveTab(Math.max(0, activeTab - 1));
      }
    } catch { alert('Delete could not be completed. Please try again.'); }
  };

  const handleDeleteImage = async (locIdx, imgIdx) => {
    if (!confirm('Remove this view?')) return;
    const loc = projectLocations[locIdx];
    const images = loc.images.filter((_, i) => i !== imgIdx);
    const updatedLocs = [...projectLocations];
    updatedLocs[locIdx] = { ...loc, images };
    await onDataUpdate({ locations: updatedLocs });
  };

  const bringToFront = useCallback((id) => {
    setCardZOrder(prev => [...prev.filter(z => z !== id), id]);
  }, []);

  const addCardToBoard = useCallback((locIndex, dropX, dropY) => {
    const existing = boardCards.find(c => c.locIndex === locIndex);
    if (existing) { bringToFront(existing.id); setActiveTab(locIndex); return; }
    const id = `loc-card-${Date.now()}-${locIndex}`;
    setBoardCards(prev => [...prev, { id, locIndex, x: Math.max(0, dropX - 140), y: Math.max(0, dropY - 60), width: CARD_DEFAULT_W }]);
    setCardZOrder(prev => [...prev, id]);
    setActiveTab(locIndex);
  }, [boardCards, bringToFront]);

  const removeCardFromBoard = useCallback((id) => {
    setBoardCards(prev => prev.filter(c => c.id !== id));
    setCardZOrder(prev => prev.filter(z => z !== id));
  }, []);

  const handleCardMouseDown = useCallback((e, card) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(card.id);
    setActiveTab(card.locIndex);
    dragState.current = { cardId: card.id, startX: e.clientX, startY: e.clientY, startCardX: card.x, startCardY: card.y };
  }, [bringToFront]);

  const handleResizeMouseDown = useCallback((e, card) => {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { cardId: card.id, startX: e.clientX, startWidth: card.width ?? CARD_DEFAULT_W };
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (dragState.current) {
        const { cardId, startX, startY, startCardX, startCardY } = dragState.current;
        setBoardCards(prev => prev.map(c => c.id === cardId
          ? { ...c, x: Math.max(0, startCardX + e.clientX - startX), y: Math.max(0, startCardY + e.clientY - startY) }
          : c));
      } else if (resizeState.current) {
        const { cardId, startX, startWidth } = resizeState.current;
        const newW = Math.max(CARD_MIN_W, Math.min(CARD_MAX_W, startWidth + e.clientX - startX));
        setBoardCards(prev => prev.map(c => c.id === cardId ? { ...c, width: newW } : c));
      }
    };
    const onUp = () => { dragState.current = null; resizeState.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const handleBoardDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOverBoard(false);
    const locIndex = parseInt(e.dataTransfer.getData('loc-index'), 10);
    if (isNaN(locIndex)) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    addCardToBoard(locIndex, e.clientX - rect.left, e.clientY - rect.top);
  }, [addCardToBoard]);

  const getLocPreviewImage = useCallback((loc) => {
    if (!loc) return null;
    const first = loc.images?.[0];
    const src = typeof first === 'string' ? first : first?.url;
    if (src) return src;
    if (loc.sheetUrl) return loc.sheetUrl;
    return null;
  }, []);

  useEffect(() => { setIsPanelEditing(false); }, [activeTab, activeCategory]);

  const openPanelEdit = useCallback(() => {
    if (!activeLoc) return;
    setEditName(activeLoc.name || '');
    setEditDesc(activeLoc.description || '');
    setIsPanelEditing(true);
  }, [activeLoc]);

  return (
    <div className="screen active screen-fill" id="s5">
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,var(--bg-deep) 25%,var(--surface-2) 50%,var(--bg-deep) 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .tab-pill.on-board::after { content:''; display:inline-block; width:0.375rem; height:0.375rem; border-radius:50%; background:var(--cyan); margin-left:0.375rem; vertical-align:middle; box-shadow:0 0 0.375rem rgba(var(--cyan-rgb),0.6); }
      `}</style>

      <WorkflowThreePaneShell
        showLeftPanel={false}
        rightTitle="Location Controls"
        storageKey="workflow-three-pane:s5"
        minRightWidth={320}
        maxRightWidth={540}
        defaultRightWidth={384}
        main={(
          <div className="main-content" style={{ background: 'var(--bg)' }}>
            <LocationSidebar
              displayedLocations={displayedLocations}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              activeLoc={activeLoc}
              activeCategory={activeCategory}
              isGeneratingActive={isGeneratingActive}
              boardCards={boardCards}
              setShowCreateModal={setShowCreateModal}
              setZoomCropTarget={setZoomCropTarget}
              handleAddHistoryToProject={handleAddHistoryToProject}
              handleDelete={handleDelete}
            />

            {/* Comparison board */}
            <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', padding: '0.5rem 1.5rem 1.125rem', boxSizing: 'border-box' }}>
              <div
                ref={boardRef}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOverBoard(true); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOverBoard(false); }}
                onDrop={handleBoardDrop}
                style={{
                  width: '100%', height: '100%',
                  background: 'var(--bg-deep)',
                  boxShadow: isDragOverBoard ? 'inset 0 0 0 0.125rem var(--cyan-border)' : 'var(--neo-inset)',
                  border: `0.0625rem solid ${isDragOverBoard ? 'var(--cyan-border)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color 120ms ease, box-shadow 120ms ease',
                  backgroundImage: 'radial-gradient(rgba(var(--cyan-300-rgb), 0.035) 0.0625rem, transparent 0.0625rem)',
                  backgroundSize: '1.5rem 1.5rem',
                }}
              >
                {boardCards.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: '3.25rem', height: '3.25rem', borderRadius: '0.875rem', background: 'var(--surface-2)', boxShadow: 'var(--neo-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', opacity: isDragOverBoard ? 1 : 0.6 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                    </div>
                    <div style={{ color: isDragOverBoard ? 'var(--cyan)' : 'var(--text-muted)', fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: '0.375rem', transition: 'color 120ms ease' }}>
                      {isDragOverBoard ? 'Drop to add to board' : 'Drag locations here to compare'}
                    </div>
                    <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>Drag location tabs from the bar above</div>
                  </div>
                )}
                {boardCards.length > 0 && isDragOverBoard && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.04)', border: '0.125rem dashed var(--cyan-border)', borderRadius: 'var(--radius-lg)', pointerEvents: 'none', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--cyan)' }}>Drop to add location</span>
                  </div>
                )}
                {boardCards.map(card => {
                  const loc = displayedLocations[card.locIndex];
                  if (!loc) return null;
                  const imgSrc = getLocPreviewImage(loc);
                  const zIndex = cardZOrder.indexOf(card.id) + 1;
                  const isSelected = activeTab === card.locIndex;
                  const isGeneratingThis = loc.isGeneratingReference || loc.id === 'generating';
                  return (
                    <div
                      key={card.id}
                      onMouseDown={e => handleCardMouseDown(e, card)}
                      onClick={e => { e.stopPropagation(); setActiveTab(card.locIndex); bringToFront(card.id); }}
                      style={{ position: 'absolute', left: card.x, top: card.y, width: card.width ?? CARD_DEFAULT_W, background: 'var(--surface-2)', border: `0.0625rem solid ${isSelected ? 'var(--cyan-border)' : 'rgba(var(--cyan-300-rgb), 0.1)'}`, borderRadius: 'var(--radius-lg)', boxShadow: isSelected ? 'var(--neo-active)' : 'var(--neo-raised)', overflow: 'visible', cursor: dragState.current?.cardId === card.id ? 'grabbing' : 'grab', userSelect: 'none', zIndex, transition: 'border-color 120ms ease, box-shadow 120ms ease' }}
                    >
                      <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <div style={{ position: 'relative', width: '100%', background: 'var(--bg-deep)', aspectRatio: '21/9', overflow: 'hidden' }}>
                          {imgSrc ? (
                            <img src={imgSrc} alt={loc.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                          ) : isGeneratingThis ? (
                            <div className="skeleton-shimmer" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Loader2 size={20} className="spin" style={{ color: 'var(--cyan)', opacity: 0.6 }} />
                            </div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--cyan-300-rgb), 0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                            </div>
                          )}
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeCardFromBoard(card.id); }} style={{ position: 'absolute', top: '0.375rem', right: '0.375rem', width: '1.375rem', height: '1.375rem', borderRadius: '50%', background: 'rgba(var(--ink-950-rgb), 0.75)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.15)', color: 'var(--text-soft)', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, backdropFilter: 'blur(0.25rem)' }}>×</button>
                        </div>
                        <div style={{ padding: '0.5rem 0.625rem 0.4375rem', borderTop: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.06)' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700, color: isSelected ? 'var(--cyan)' : 'var(--text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 120ms ease' }}>{loc.name}</div>
                          {loc.description && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.description.slice(0, 55)}</div>}
                        </div>
                      </div>
                      <div onMouseDown={e => handleResizeMouseDown(e, card)} title="Drag to resize" style={{ position: 'absolute', bottom: -1, right: -1, width: '1.125rem', height: '1.125rem', cursor: 'nwse-resize', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '0.1875rem', borderBottomRightRadius: 'var(--radius-lg)', zIndex: 2 }}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="rgba(var(--cyan-300-rgb),0.45)" strokeWidth="1.25" strokeLinecap="round"/></svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        right={(
          <LocationFormPanel
            activeLoc={activeLoc}
            isGeneratingActive={isGeneratingActive}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            setActiveTab={setActiveTab}
            busy={busy}
            isGenerating={isGenerating}
            isProcessingSheet={isProcessingSheet}
            isPanelEditing={isPanelEditing}
            setIsPanelEditing={setIsPanelEditing}
            sheetProcessStatus={sheetProcessStatus}
            locProgressStep={locProgressStep}
            editName={editName}
            setEditName={setEditName}
            editDesc={editDesc}
            setEditDesc={setEditDesc}
            fileInputRef={fileInputRef}
            setShowCreateModal={setShowCreateModal}
            setSheetReplaceTarget={setSheetReplaceTarget}
            setZoomCropTarget={setZoomCropTarget}
            activeTab={activeTab}
            projectLocations={projectLocations}
            locationQueue={locationQueue}
            getLocPreviewImage={getLocPreviewImage}
            handleGenerateFromScript={handleGenerateFromScript}
            handleEditSave={handleEditSave}
            handleDelete={handleDelete}
            handleSheetUpload={handleSheetUpload}
            handleGenerateAllLocationSheets={handleGenerateAllLocationSheets}
            openPanelEdit={openPanelEdit}
          />
        )}
      />

      {/* Sheet Crop Choice Modal */}
      {showSheetCropModal && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxWidth: '35rem', textAlign: 'center' }}>
            <h3 style={{ color: 'var(--text)', fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Choose Crop Method</h3>
            <p style={{ color: isProcessingSheet ? 'var(--cyan)' : 'var(--text-muted)', fontSize: '0.8125rem', margin: '0 0 1.5rem' }}>
              {isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Automatically detect and crop each view from your sheet.'}
            </p>
            {sheetWarning && (
              <div style={{ marginBottom: '1rem', color: 'var(--violet-400)', background: 'rgba(var(--violet-rgb), 0.08)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.18)', borderRadius: '0.625rem', padding: '0.625rem 0.75rem', fontSize: '0.75rem', lineHeight: 1.5, textAlign: 'left' }}>
                {sheetWarning}
              </div>
            )}
            {sheetPreviewUrl && (
              <img src={sheetPreviewUrl} alt="Preview" style={{ width: '100%', height: '12.5rem', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.05)' }} />
            )}
            <div className="flex-row gap-12">
              <button onClick={() => processSheetFile(pendingSheetFile)} disabled={isProcessingSheet} className="btn-action-generate" style={{ flex: 1, padding: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: isProcessingSheet ? 0.82 : 1, cursor: isProcessingSheet ? 'wait' : 'pointer' }}>
                {isProcessingSheet && <Loader2 size={15} className="spin" />}
                {isProcessingSheet ? 'Detecting Views...' : 'Auto-detect Views'}
              </button>
              <button disabled={isProcessingSheet} onClick={handleCloseSheetCropModal} className="btn-outline" style={{ flex: 1, padding: '1rem', opacity: isProcessingSheet ? 0.45 : 1 }}>Cancel Upload</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-panel" style={{ maxWidth: '31.25rem' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--text)', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Create New</h3>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="flex-col gap-16">
              <div>
                <div className="panel-meta-label" style={{ marginBottom: '0.5rem' }}>Upload existing sheet</div>
                <button
                  className="btn-outline"
                  style={{ width: '100%', padding: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem', fontSize: '0.8125rem', outline: isDraggingSheet ? '0.125rem dashed var(--cyan-border)' : 'none', outlineOffset: '0.125rem' }}
                  onClick={() => { setSheetReplaceTarget(null); setShowCreateModal(false); fileInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                  onDragEnter={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingSheet(false); }}
                  onDrop={(e) => { setShowCreateModal(false); handleSheetDrop(e); }}
                  disabled={busy}
                >
                  <Upload size={14} />
                  {isDraggingSheet ? 'Drop to upload' : 'Upload Reference Sheet'}
                </button>
              </div>
              <div>
                <div className="panel-meta-label" style={{ marginBottom: '0.5rem' }}>Generate from script</div>
                <button
                  className="btn-action-generate"
                  style={{ width: '100%', padding: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem', fontSize: '0.8125rem' }}
                  onClick={() => { setShowCreateModal(false); handleGenerateFromScript(); }}
                  disabled={busy}
                >
                  <FileText size={14} />
                  Generate from Script
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>or describe from scratch</span>
                <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
              </div>
              <div>
                <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.625rem' }}>LOCATION NAME</label>
                <input className="input-inset" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. CYBERPUNK BAR" style={{ padding: '0.625rem 0.8125rem', fontSize: '0.8125rem', borderRadius: '0.5rem' }} />
              </div>
              <div>
                <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.625rem' }}>DESCRIPTION</label>
                <textarea className="textarea-inset" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Neon-lit interior with rain-slicked windows, holographic advertisements, and crowded seating..." style={{ padding: '0.625rem 0.8125rem', fontSize: '0.8125rem', borderRadius: '0.5rem', height: '5.5rem' }} />
              </div>
              <div>
                <label className="panel-meta-label" style={{ display: 'block', marginBottom: '0.625rem' }}>REFERENCE IMAGE <span style={{ color: 'var(--text-subtle)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div className="flex-row gap-12" style={{ padding: '0.625rem', background: 'var(--bg-deep)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.07)', borderRadius: '0.5rem', alignItems: 'center' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '3.5rem', height: '3.5rem', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '0.375rem', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.625rem', marginTop: '0.125rem' }}>Consistency will match this scene</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'transparent', border: 'none', color: 'var(--violet-400)', fontSize: '1rem', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => refFileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingRef(false); }}
                    onDrop={handleRefDrop}
                    style={{ width: '100%', padding: '0.75rem', background: isDraggingRef ? 'rgba(var(--cyan-rgb), 0.06)' : 'rgba(var(--cyan-300-rgb), 0.04)', border: isDraggingRef ? '0.0625rem dashed var(--cyan-border)' : '0.0625rem dashed rgba(var(--cyan-300-rgb), 0.22)', borderRadius: '0.5rem', color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', transition: 'border-color 120ms ease-out, background 120ms ease-out' }}>
                    {isDraggingRef ? 'Drop image here' : 'Upload Reference View'}
                  </button>
                )}
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--cyan-dim)', borderRadius: '0.75rem', border: '0.0625rem solid var(--cyan-border)' }}>
                <div className="panel-meta-label panel-meta-label--cyan" style={{ marginBottom: '0.5rem' }}>SET PREVIEW</div>
                <div className="flex-row gap-6">
                  {['WIDE', 'DETAIL', 'INTERIOR', 'ATMOS'].map(tag => (
                    <span key={tag} className="tag-badge tag-teal" style={{ fontSize: '0.5rem' }}>{tag}</span>
                  ))}
                </div>
              </div>
              <button onClick={handleGenerateAngles} className="btn-action-generate" style={{ padding: '1rem', fontWeight: 700 }}>
                Generate Location References
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom/Crop Modal */}
      {zoomCropTarget && (
        <LocationImageModal
          imageUrl={zoomCropTarget.url}
          label={zoomCropTarget.label}
          onClose={() => setZoomCropTarget(null)}
          onApply={handleApplyCrop}
          onDelete={() => { handleDeleteImage(zoomCropTarget.locIdx, zoomCropTarget.imgIdx); setZoomCropTarget(null); }}
          initialBox={zoomCropTarget.initialBox || null}
          showLabelInput={zoomCropTarget.showLabelInput || false}
          recropUrl={zoomCropTarget.recropUrl || null}
          recropBox={zoomCropTarget.recropBox || null}
        />
      )}

      {/* Script prompt preview modal */}
      {scriptPromptPreview && (
        <div className="modal-overlay">
          <div className="modal-panel flex-col gap-16" style={{ maxWidth: '35rem' }}>
            <div>
              <div className="panel-meta-label" style={{ marginBottom: '0.375rem' }}>▪ Generate from Script</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{scriptPromptPreview.name}</div>
            </div>
            <div className="panel-inset" style={{ maxHeight: '16.25rem', fontSize: '0.7812rem' }}>
              {scriptPromptPreview.description}
            </div>
            <p className="body-sm">
              This prompt will be sent to the image model to generate location reference angles. Edit the description in the location card first if you need to adjust it.
            </p>
            <div className="flex-row gap-10">
              <button onClick={handleConfirmScriptGenerate} className="btn-action-generate" style={{ flex: 1, padding: '0.8125rem', fontWeight: 700 }}>Generate References</button>
              <button onClick={() => setScriptPromptPreview(null)} className="btn-outline" style={{ flex: 1, padding: '0.8125rem' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="flex-row gap-16" style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 10001, background: 'var(--ink-950)', border: '0.0625rem solid var(--cyan)', borderRadius: '0.75rem', padding: '1rem 1.25rem', boxShadow: '0 0.5rem 2rem rgba(var(--ink-950-rgb), 0.5)', alignItems: 'center' }}>
          <Loader2 size={24} className="spin" style={{ color: 'var(--cyan)' }} />
          <div>
            <div style={{ color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 600 }}>
              {isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Creating references...'}
            </div>
            <div style={{ color: 'var(--cyan)', fontSize: '0.625rem', fontWeight: 700, marginTop: '0.125rem', letterSpacing: '0.05em' }}>Please keep this page open</div>
          </div>
        </div>
      )}

      <QueueStatusBar
        jobs={locationQueue.jobs}
        isActive={locationQueue.isActive}
        stats={locationQueue.stats}
        onAbort={locationQueue.abort}
        onClear={locationQueue.clear}
        label="Location sheets"
      />
    </div>
  );
}
