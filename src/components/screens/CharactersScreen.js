'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import QueueStatusBar from '../QueueStatusBar';
import { createClient } from '@/utils/supabase';
import WorkflowThreePaneShell from '../WorkflowThreePaneShell';

import {
  CHARACTER_STEPS,
  normalizeCharacterName,
  buildScriptCharacterDescription,
  buildSheetPrompt,
  parseCharacterImage,
  getStoredImageRatio,
} from './characters/characterConstants';
import CharacterImageModal from './characters/CharacterImageModal';
import CharacterSidebar from './characters/CharacterSidebar';
import CharacterFormPanel from './characters/CharacterFormPanel';

export default function CharactersScreen({ projectData = [], projectState = {}, onDataUpdate, projectId }) {
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
  const [generatingChar, setGeneratingChar] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [activeCategory, setActiveCategory] = useState('project');
  const [renamingPanel, setRenamingPanel] = useState(null);

  const [scriptPromptPreview, setScriptPromptPreview] = useState(null);
  const [sheetReplaceTarget, setSheetReplaceTarget] = useState(null);
  const [sheetProcessStatus, setSheetProcessStatus] = useState('');
  const [charProgressStep, setCharProgressStep] = useState(-1);
  const [imgRatios, setImgRatios] = useState({});
  const [anchorStatus, setAnchorStatus] = useState({});

  const [boardCards, setBoardCards] = useState([]);
  const [cardZOrder, setCardZOrder] = useState([]);
  const [isDragOverBoard, setIsDragOverBoard] = useState(false);
  const dragState = useRef(null);
  const resizeState = useRef(null);
  const boardRef = useRef(null);

  const CARD_DEFAULT_W = 220;
  const CARD_MIN_W     = 140;
  const CARD_MAX_W     = 700;

  const fileInputRef = useRef(null);
  const refFileInputRef = useRef(null);
  const collageRef = useRef(null);
  const projectCharacters = useMemo(() => (Array.isArray(projectData) ? projectData : []), [projectData]);
  const anchorInFlightRef = useRef(new Set());
  const latestCharactersRef = useRef(projectCharacters);
  const anchorQueue = useGenerationQueue({ concurrency: 2 });

  const anchorSaveQRef = useRef({ pending: false, latest: null });
  const saveCharList = useCallback(async (characters) => {
    anchorSaveQRef.current.latest = { characters };
    if (anchorSaveQRef.current.pending) return;
    anchorSaveQRef.current.pending = true;
    while (anchorSaveQRef.current.latest) {
      const d = anchorSaveQRef.current.latest;
      anchorSaveQRef.current.latest = null;
      try { await onDataUpdate(d); } catch (e) { console.error('[anchor save]', e); }
    }
    anchorSaveQRef.current.pending = false;
  }, [onDataUpdate]);

  const supabase = useMemo(() => createClient(), []);
  const generatingReplaceIndex = Number.isInteger(generatingChar?.replaceIndex)
    ? generatingChar.replaceIndex
    : null;
  const displayedCharacters = activeCategory === 'project'
    ? [
        ...projectCharacters.map((char, index) => (
          generatingReplaceIndex === index ? generatingChar : char
        )),
        ...(generatingChar && generatingReplaceIndex === null ? [generatingChar] : []),
      ]
    : globalLibrary;
  const activeChar = displayedCharacters[activeTab] || null;
  const isGeneratingActive = Boolean(activeChar?.isGeneratingReference || activeChar?.id === 'generating');
  const activeAnchorState = activeChar?.name
    ? (anchorStatus[activeChar.name] || (activeChar?.anchor_image_url ? 'done' : undefined))
    : undefined;
  const anyAnchorsGenerating = Object.values(anchorStatus).some(status => status === 'generating');
  const busy = isProcessingSheet || isGenerating;

  const loadGlobalLibrary = useCallback(async () => {
    const { data, error } = await supabase.from('characters_library').select('*').order('created_at', { ascending: false });
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

  useEffect(() => {
    const node = collageRef.current;
    if (!node) return;
    let frame = null;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {});
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!activeChar?.images?.length) return undefined;
    const sources = activeChar.images
      .map((img, index) => parseCharacterImage(img, index))
      .filter(item => item.src);
    if (!sources.length) return undefined;
    let cancelled = false;
    sources.forEach(({ src, imageData }) => {
      if (imgRatios[src] || getStoredImageRatio(imageData)) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        setImgRatios(prev => prev[src] === ratio ? prev : { ...prev, [src]: ratio });
      };
      img.src = src;
    });
    return () => { cancelled = true; };
  }, [activeChar?.images, imgRatios]);

  useEffect(() => {
    latestCharactersRef.current = projectCharacters;
  }, [projectCharacters]);

  const generateAnchorForCharacter = useCallback(async (character, projectStateSnapshot = projectState) => {
    if (!projectId || !character?.name) return;
    const normalizedName = normalizeCharacterName(character.name);
    if (!normalizedName || anchorInFlightRef.current.has(normalizedName)) return;
    if (character?.anchor_image_url) {
      setAnchorStatus(prev => (prev[character.name] === 'done' ? prev : { ...prev, [character.name]: 'done' }));
      return;
    }
    anchorInFlightRef.current.add(normalizedName);
    setAnchorStatus(prev => ({ ...prev, [character.name]: 'generating' }));
    try {
      const res = await fetch('/api/generate-character-anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, character, projectState: projectStateSnapshot }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.anchor_image_url) {
        setAnchorStatus(prev => ({ ...prev, [character.name]: 'done' }));
        const anchorGeneratedAt = new Date().toISOString();
        const baseCharacters = Array.isArray(latestCharactersRef.current) ? latestCharactersRef.current : [];
        let matched = false;
        const updatedChars = baseCharacters.map(existingChar => {
          if (normalizeCharacterName(existingChar?.name) !== normalizedName) return existingChar;
          matched = true;
          return { ...existingChar, anchor_image_url: data.anchor_image_url, anchor_generated_at: anchorGeneratedAt };
        });
        if (!matched) return;
        await onDataUpdate({ characters: updatedChars });
      } else {
        setAnchorStatus(prev => ({ ...prev, [character.name]: 'failed' }));
      }
    } catch (error) {
      console.error('Anchor generation failed for', character?.name, error);
      setAnchorStatus(prev => ({ ...prev, [character.name]: 'failed' }));
    } finally {
      anchorInFlightRef.current.delete(normalizedName);
    }
  }, [onDataUpdate, projectId, projectState]);

  const forceRefreshAnchor = useCallback(async (character) => {
    if (!character?.name) return;
    const normalizedName = normalizeCharacterName(character.name);
    anchorInFlightRef.current.delete(normalizedName);
    const stripped = { ...character, anchor_image_url: null, anchor_generated_at: null };
    await generateAnchorForCharacter(stripped, projectState);
  }, [generateAnchorForCharacter, projectState]);

  const runAnchorJobForQueue = useCallback(async (char) => {
    const normalizedName = normalizeCharacterName(char.name);
    anchorInFlightRef.current.delete(normalizedName);
    anchorInFlightRef.current.add(normalizedName);
    const stripped = { ...char, anchor_image_url: null, anchor_generated_at: null };
    setAnchorStatus(prev => ({ ...prev, [char.name]: 'generating' }));
    try {
      const res = await fetch('/api/generate-character-anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, character: stripped, projectState }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.anchor_image_url) {
        const err = new Error(data?.reason || `Anchor generation failed for ${char.name}`);
        err.status = res.status;
        throw err;
      }
      setAnchorStatus(prev => ({ ...prev, [char.name]: 'done' }));
      const updatedChars = (Array.isArray(latestCharactersRef.current) ? latestCharactersRef.current : []).map(c =>
        normalizeCharacterName(c?.name) === normalizedName
          ? { ...c, anchor_image_url: data.anchor_image_url, anchor_generated_at: new Date().toISOString() }
          : c
      );
      latestCharactersRef.current = updatedChars;
      await saveCharList(updatedChars);
      return data.anchor_image_url;
    } catch (err) {
      setAnchorStatus(prev => ({ ...prev, [char.name]: 'failed' }));
      throw err;
    } finally {
      anchorInFlightRef.current.delete(normalizedName);
    }
  }, [projectId, projectState, saveCharList]);

  const refreshAllAnchors = useCallback(() => {
    const chars = projectCharacters.filter(c => c?.name);
    if (!chars.length) return;
    anchorQueue.enqueue(
      chars.map(char => ({
        id: `anchor-${char.name}`,
        label: char.name,
        run: () => runAnchorJobForQueue(char),
      }))
    );
  }, [projectCharacters, anchorQueue, runAnchorJobForQueue]);

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

  const callCharacterGenerator = async (payload) => {
    const res = await fetch('/api/generate-character-pose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  };

  const saveToGlobalLibrary = async (charObj, source) => {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error(userErr?.message || 'No user found');
      const { error: insErr } = await supabase.from('characters_library').insert({
        user_id: user.id,
        name: charObj.name,
        description: charObj.description,
        images: charObj.images,
        source: source,
        sheet_url: charObj.sheetUrl || null
      });
      if (insErr) throw insErr;
      await refreshGlobalLibrary();
    } catch (err) {
      console.error('Failed to save to global library:', err);
    }
  };

  const handleAddGlobalToProject = async () => {
    if (!activeChar || activeCategory !== 'global') return;
    const exists = projectCharacters.some(character => (
      String(character?.name || '').trim().toLowerCase() === String(activeChar.name || '').trim().toLowerCase()
    ));
    if (exists) {
      setActiveCategory('project');
      setActiveTab(Math.max(0, projectCharacters.findIndex(character => (
        String(character?.name || '').trim().toLowerCase() === String(activeChar.name || '').trim().toLowerCase()
      ))));
      return;
    }
    const newChar = {
      ...activeChar,
      id: `character-${activeChar.id || Date.now()}-${Date.now()}`,
      name: String(activeChar.name || 'CHARACTER').trim().toUpperCase(),
      description: activeChar.description || activeChar.visual_prompt || '',
      visual_prompt: activeChar.visual_prompt || activeChar.description || '',
      images: Array.isArray(activeChar.images) ? activeChar.images : [],
      source: activeChar.source || 'history',
      sheetUrl: activeChar.sheetUrl || activeChar.sheet_url || null,
    };
    const updatedChars = [...projectCharacters, newChar];
    await onDataUpdate({ characters: updatedChars });
    if (newChar.images?.length && !newChar.anchor_image_url) {
      void generateAnchorForCharacter(newChar, { ...projectState, characters: updatedChars });
    }
    setActiveCategory('project');
    setActiveTab(updatedChars.length - 1);
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
    void processSheetFile(file);
  };

  const handleSheetDrop = (e) => {
    e.preventDefault();
    setIsDraggingSheet(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setSheetReplaceTarget(null);
    void processSheetFile(file);
  };

  const handleRefDrop = (e) => {
    e.preventDefault();
    setIsDraggingRef(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleRefImageSelect({ target: { files: [file], value: '' } });
  };

  const processSheetFile = async (file) => {
    if (!file) return;
    setIsProcessingSheet(true);
    setSheetProcessStatus('Uploading full sheet...');
    try {
      const sheetPath = `${projectId}/sheets/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('assets').upload(sheetPath, file);
      if (upErr) throw upErr;
      const { data: { publicUrl: sheetUrl } } = supabase.storage.from('assets').getPublicUrl(sheetPath);
      const replaceIndex = Number.isInteger(sheetReplaceTarget?.index) && sheetReplaceTarget.index >= 0 && sheetReplaceTarget.index < projectCharacters.length
        ? sheetReplaceTarget.index
        : null;
      const existingChar = replaceIndex !== null ? projectCharacters[replaceIndex] : null;
      const charName = existingChar
        ? (sheetReplaceTarget?.name || existingChar.name || file.name.split('.')[0]).trim().toUpperCase()
        : file.name.split('.')[0].toUpperCase();
      const charDescription = existingChar
        ? (sheetReplaceTarget?.description ?? existingChar.description ?? 'Uploaded from character sheet')
        : 'Uploaded from character sheet';
      const sheetImage = { url: sheetUrl, label: 'CHARACTER SHEET' };
      setGeneratingChar({
        ...(existingChar || {}),
        id: existingChar?.id || 'generating',
        name: charName,
        description: charDescription,
        images: [sheetImage],
        isGeneratingReference: true,
        replaceIndex,
      });
      setActiveTab(replaceIndex !== null ? replaceIndex : projectCharacters.length);
      setActiveCategory('project');
      setSheetProcessStatus('Saving character sheet...');
      const newChar = {
        ...(existingChar || {}),
        id: existingChar?.id || Date.now(),
        name: charName,
        description: charDescription,
        images: [sheetImage],
        source: 'upload',
        sheetUrl,
      };
      const updatedChars = [...projectCharacters];
      if (replaceIndex !== null) {
        updatedChars[replaceIndex] = newChar;
      } else {
        updatedChars.push(newChar);
      }
      await onDataUpdate({ characters: updatedChars });
      if (newChar.images?.length && !newChar.anchor_image_url) {
        void generateAnchorForCharacter(newChar, { ...projectState, characters: updatedChars });
      }
      setActiveTab(replaceIndex !== null ? replaceIndex : updatedChars.length - 1);
      if (replaceIndex === null) saveToGlobalLibrary(newChar, 'upload');
    } catch (err) {
      console.error('Sheet processing failed:', err);
      alert('We could not process that character sheet. Please try another image.');
    } finally {
      setIsProcessingSheet(false);
      setGeneratingChar(null);
      setSheetProcessStatus('');
      setSheetReplaceTarget(null);
    }
  };

  const generateCharacterReferences = async ({ name, description, refImage = null, replaceIndex = null }) => {
    const charName = name.trim().toUpperCase();
    const desc = description.trim();
    setShowCreateModal(false);
    setCreateName('');
    setCreateDesc('');
    setCreateRefImage(null);
    setIsGenerating(true);
    setCharProgressStep(0);
    try {
      const tempId = Date.now();
      const isReplacing = Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < projectCharacters.length;
      const existingChar = isReplacing ? projectCharacters[replaceIndex] : null;
      setGeneratingChar({
        ...(existingChar || {}),
        id: existingChar?.id || tempId,
        name: charName,
        description: desc,
        images: [{ label: 'CHARACTER SHEET', url: null }],
        isGeneratingReference: true,
        replaceIndex: isReplacing ? replaceIndex : null,
      });
      setActiveTab(isReplacing ? replaceIndex : projectCharacters.length);
      setActiveCategory('project');
      const payload = {
        characterDescription: desc,
        sheetPrompt: buildSheetPrompt(desc, Boolean(refImage?.base64)),
        label: 'CHARACTER SHEET',
      };
      if (refImage?.base64) {
        payload.base64 = refImage.base64;
        payload.mimeType = refImage.mimeType || 'image/png';
      }
      const { imageBase64, error } = await callCharacterGenerator(payload);
      if (error) throw new Error(error);
      if (!imageBase64) throw new Error('Character sheet generation returned no image.');
      const blob = base64ToBlob(imageBase64, 'image/png');
      const url = await uploadBlob(blob, 'image/png', `${projectId}/generated/${Date.now()}-character-sheet.png`);
      const sheetImage = { url, label: 'CHARACTER SHEET' };
      setGeneratingChar(prev => prev ? { ...prev, images: [sheetImage] } : prev);
      setCharProgressStep(CHARACTER_STEPS.length - 1);
      const newChar = {
        ...(existingChar || {}),
        id: existingChar?.id || tempId,
        name: charName,
        description: desc,
        visual_prompt: existingChar?.visual_prompt || desc,
        images: [sheetImage],
        source: 'ai',
        sheetUrl: url,
      };
      const updatedChars = [...projectCharacters];
      if (isReplacing) {
        updatedChars[replaceIndex] = newChar;
      } else {
        updatedChars.push(newChar);
      }
      await onDataUpdate({ characters: updatedChars });
      if (newChar.images?.length && !newChar.anchor_image_url) {
        void generateAnchorForCharacter(newChar, { ...projectState, characters: updatedChars });
      }
      setActiveTab(isReplacing ? replaceIndex : updatedChars.length - 1);
      if (!isReplacing) saveToGlobalLibrary(newChar, 'ai');
    } catch (err) {
      console.error('Generation failed:', err);
      alert('Character could not be created. Please try again.');
    } finally {
      setIsGenerating(false);
      setCharProgressStep(-1);
      setGeneratingChar(null);
    }
  };

  const handleGenerateAngles = async () => {
    if (!createName.trim()) return alert('Enter a character name');
    if (!createDesc.trim()) return alert('Describe the character');
    await generateCharacterReferences({ name: createName, description: createDesc, refImage: createRefImage });
  };

  const handleGenerateFromScript = () => {
    const targetIndex = activeCategory === 'project' && activeChar && activeChar.id !== 'generating'
      ? activeTab
      : -1;
    const scriptCharacters = Array.isArray(projectState?.characters) ? projectState.characters : [];
    const sourceCharacter = targetIndex >= 0
      ? projectCharacters[targetIndex]
      : scriptCharacters.find(character => character?.name || character?.visual_prompt || character?.description);
    if (!sourceCharacter) {
      alert('Generate or approve the script first so I can pull a character brief from it.');
      return;
    }
    const name = sourceCharacter.name || 'SCRIPT CHARACTER';
    const description = buildScriptCharacterDescription(sourceCharacter, projectState);
    if (!description.trim()) {
      alert('The script does not include enough character detail yet.');
      return;
    }
    setScriptPromptPreview({ name, description, replaceIndex: targetIndex >= 0 ? targetIndex : null });
  };

  const handleConfirmScriptGenerate = async () => {
    if (!scriptPromptPreview) return;
    const { name, description, replaceIndex } = scriptPromptPreview;
    setScriptPromptPreview(null);
    await generateCharacterReferences({ name, description, replaceIndex });
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return alert('Name cannot be empty');
    try {
      if (activeCategory === 'global') {
        const { error } = await supabase
          .from('characters_library')
          .update({ name: editName.trim().toUpperCase(), description: editDesc.trim() })
          .eq('id', activeChar.id);
        if (error) throw error;
        await refreshGlobalLibrary();
      } else {
        const updatedChars = [...projectCharacters];
        updatedChars[activeTab] = { ...projectCharacters[activeTab], name: editName.trim().toUpperCase(), description: editDesc.trim() };
        await onDataUpdate({ characters: updatedChars });
      }
      setIsPanelEditing(false);
    } catch (error) {
      console.error('Character rename failed:', error);
      alert('Character could not be renamed. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!activeChar || activeChar.id === 'generating') return;
    if (!confirm(`Delete ${activeChar.name}?`)) return;
    try {
      if (activeCategory === 'project') {
        await onDataUpdate({ characters: projectCharacters.filter((_, i) => i !== activeTab) });
        setActiveTab(Math.max(0, activeTab - 1));
      } else {
        const { error } = await supabase.from('characters_library').delete().eq('id', activeChar.id);
        if (error) throw error;
        await refreshGlobalLibrary();
        setActiveTab(Math.max(0, activeTab - 1));
      }
    } catch { alert('Delete could not be completed. Please try again.'); }
  };

  const handleDeleteImage = async (charIdx, imgIdx) => {
    if (!confirm('Remove this image?')) return;
    const char = projectCharacters[charIdx];
    const images = char.images.filter((_, i) => i !== imgIdx);
    const updatedChars = [...projectCharacters];
    updatedChars[charIdx] = { ...char, images };
    await onDataUpdate({ characters: updatedChars });
  };

  const handleRenameLabel = async (charIdx, imgIdx, newLabel) => {
    setRenamingPanel(null);
    if (charIdx < 0 || !newLabel.trim()) return;
    const char = projectCharacters[charIdx];
    if (!char) return;
    const images = [...char.images];
    const existing = images[imgIdx];
    images[imgIdx] = { ...(typeof existing === 'object' ? existing : { url: existing }), label: newLabel.trim().toUpperCase() };
    const updatedChars = [...projectCharacters];
    updatedChars[charIdx] = { ...char, images };
    await onDataUpdate({ characters: updatedChars });
  };

  const bringToFront = useCallback((id) => {
    setCardZOrder(prev => [...prev.filter(z => z !== id), id]);
  }, []);

  const addCardToBoard = useCallback((charIndex, dropX, dropY) => {
    const existing = boardCards.find(c => c.charIndex === charIndex);
    if (existing) { bringToFront(existing.id); setActiveTab(charIndex); return; }
    const id = `card-${Date.now()}-${charIndex}`;
    setBoardCards(prev => [...prev, { id, charIndex, x: Math.max(0, dropX - 110), y: Math.max(0, dropY - 60), width: CARD_DEFAULT_W }]);
    setCardZOrder(prev => [...prev, id]);
    setActiveTab(charIndex);
  }, [boardCards, bringToFront]);

  const removeCardFromBoard = useCallback((id) => {
    setBoardCards(prev => prev.filter(c => c.id !== id));
    setCardZOrder(prev => prev.filter(z => z !== id));
  }, []);

  const handleCardMouseDown = useCallback((e, card) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(card.id);
    setActiveTab(card.charIndex);
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
    const charIndex = parseInt(e.dataTransfer.getData('char-index'), 10);
    if (isNaN(charIndex)) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    addCardToBoard(charIndex, e.clientX - rect.left, e.clientY - rect.top);
  }, [addCardToBoard]);

  const getCharPreviewImage = useCallback((char) => {
    if (!char) return null;
    if (char.anchor_image_url) return { src: char.anchor_image_url, isAnchor: true };
    const firstImg = char.images?.[0];
    if (firstImg) {
      const { src } = parseCharacterImage(firstImg, 0);
      if (src) return { src, isAnchor: false };
    }
    return null;
  }, []);

  useEffect(() => { setIsPanelEditing(false); }, [activeTab, activeCategory]);

  const openPanelEdit = useCallback(() => {
    if (!activeChar) return;
    setEditName(activeChar.name || '');
    setEditDesc(activeChar.description || '');
    setIsPanelEditing(true);
  }, [activeChar]);

  return (
    <div className="screen active screen-fill" id="s4">
      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skeleton-shimmer { background:linear-gradient(90deg,var(--bg-deep) 25%,var(--surface-2) 50%,var(--bg-deep) 75%); background-size:200% 100%; animation:shimmer 1.4s ease-in-out infinite; }
        .tab-pill.on-board::after {
          content: '';
          display: inline-block;
          width: 0.375rem;
          height: 0.375rem;
          border-radius: 50%;
          background: var(--cyan);
          margin-left: 0.375rem;
          vertical-align: middle;
          box-shadow: 0 0 0.375rem rgba(var(--cyan-rgb), 0.6);
        }
      `}</style>

      <WorkflowThreePaneShell
        showLeftPanel={false}
        rightTitle="Character Controls"
        storageKey="workflow-three-pane:s4"
        minRightWidth={320}
        maxRightWidth={540}
        defaultRightWidth={384}
        main={(
          <div className="main-content" style={{ background: 'var(--bg)' }}>
            <CharacterSidebar
              displayedCharacters={displayedCharacters}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              activeChar={activeChar}
              activeCategory={activeCategory}
              isGeneratingActive={isGeneratingActive}
              activeAnchorState={activeAnchorState}
              anchorStatus={anchorStatus}
              boardCards={boardCards}
              setShowCreateModal={setShowCreateModal}
              handleAddGlobalToProject={handleAddGlobalToProject}
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
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                    </div>
                    <div style={{ color: isDragOverBoard ? 'var(--cyan)' : 'var(--text-muted)', fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', marginBottom: '0.375rem', transition: 'color 120ms ease' }}>
                      {isDragOverBoard ? 'Drop to add to board' : 'Drag characters here to compare'}
                    </div>
                    <div style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>
                      Drag character tabs from the bar above onto this board
                    </div>
                  </div>
                )}
                {boardCards.length > 0 && isDragOverBoard && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--cyan-rgb), 0.04)', border: '0.125rem dashed var(--cyan-border)', borderRadius: 'var(--radius-lg)', pointerEvents: 'none', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--cyan)' }}>Drop to add character</span>
                  </div>
                )}
                {boardCards.map(card => {
                  const char = displayedCharacters[card.charIndex];
                  if (!char) return null;
                  const preview = getCharPreviewImage(char);
                  const zIndex = cardZOrder.indexOf(card.id) + 1;
                  const isSelected = activeTab === card.charIndex;
                  const isGeneratingThis = (char.isGeneratingReference || char.id === 'generating');
                  return (
                    <div
                      key={card.id}
                      onMouseDown={e => handleCardMouseDown(e, card)}
                      onClick={e => { e.stopPropagation(); setActiveTab(card.charIndex); bringToFront(card.id); }}
                      style={{ position: 'absolute', left: card.x, top: card.y, width: card.width ?? CARD_DEFAULT_W, background: 'var(--surface-2)', border: `0.0625rem solid ${isSelected ? 'var(--cyan-border)' : 'rgba(var(--cyan-300-rgb), 0.1)'}`, borderRadius: 'var(--radius-lg)', boxShadow: isSelected ? 'var(--neo-active)' : 'var(--neo-raised)', overflow: 'visible', cursor: dragState.current?.cardId === card.id ? 'grabbing' : 'grab', userSelect: 'none', zIndex, transition: 'border-color 120ms ease, box-shadow 120ms ease' }}
                    >
                      <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <div style={{ position: 'relative', width: '100%', background: 'var(--bg-deep)', aspectRatio: preview?.isAnchor ? '4/5' : '21/9', overflow: 'hidden' }}>
                          {preview ? (
                            <img src={preview.src} alt={char.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                          ) : isGeneratingThis ? (
                            <div className="skeleton-shimmer" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Loader2 size={20} className="spin" style={{ color: 'var(--cyan)', opacity: 0.6 }} />
                            </div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--cyan-300-rgb), 0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                            </div>
                          )}
                          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeCardFromBoard(card.id); }} style={{ position: 'absolute', top: '0.375rem', right: '0.375rem', width: '1.375rem', height: '1.375rem', borderRadius: '50%', background: 'rgba(var(--ink-950-rgb), 0.75)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.15)', color: 'var(--text-soft)', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, backdropFilter: 'blur(0.25rem)' }}>×</button>
                        </div>
                        <div style={{ padding: '0.5rem 0.625rem 0.4375rem', borderTop: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.06)' }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 700, color: isSelected ? 'var(--cyan)' : 'var(--text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 120ms ease' }}>{char.name}</div>
                          {char.description && (
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>{char.description.slice(0, 55)}</div>
                          )}
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
          <CharacterFormPanel
            activeChar={activeChar}
            isGeneratingActive={isGeneratingActive}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            setActiveTab={setActiveTab}
            activeAnchorState={activeAnchorState}
            anyAnchorsGenerating={anyAnchorsGenerating}
            anchorStatus={anchorStatus}
            busy={busy}
            isGenerating={isGenerating}
            isProcessingSheet={isProcessingSheet}
            isPanelEditing={isPanelEditing}
            setIsPanelEditing={setIsPanelEditing}
            generatingChar={generatingChar}
            charProgressStep={charProgressStep}
            editName={editName}
            setEditName={setEditName}
            editDesc={editDesc}
            setEditDesc={setEditDesc}
            fileInputRef={fileInputRef}
            setShowCreateModal={setShowCreateModal}
            setSheetReplaceTarget={setSheetReplaceTarget}
            activeTab={activeTab}
            projectCharacters={projectCharacters}
            getCharPreviewImage={getCharPreviewImage}
            setPreviewTarget={setPreviewTarget}
            forceRefreshAnchor={forceRefreshAnchor}
            refreshAllAnchors={refreshAllAnchors}
            handleGenerateFromScript={handleGenerateFromScript}
            handleEditSave={handleEditSave}
            handleSheetUpload={handleSheetUpload}
            openPanelEdit={openPanelEdit}
          />
        )}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="auth-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="auth-modal" style={{ maxWidth: '28.75rem' }} onClick={e => e.stopPropagation()}>
            <button className="auth-close" onClick={() => setShowCreateModal(false)}>×</button>
            <div className="kicker" style={{ marginBottom: '0.625rem' }}>── Create New</div>
            <div className="editorial-title editorial-h2" style={{ marginBottom: '1.25rem' }}>
              Sketch the <span className="text-grad">cast.</span>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>Upload existing sheet</div>
              <button
                className="btn-outline"
                style={{ width: '100%', padding: '0.6875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem', fontSize: '0.8125rem', outline: isDraggingSheet ? '0.125rem dashed var(--cyan-border)' : 'none', outlineOffset: '0.125rem' }}
                onClick={() => { setSheetReplaceTarget(null); setShowCreateModal(false); fileInputRef.current.click(); }}
                onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                onDragEnter={(e) => { e.preventDefault(); if (!busy) setIsDraggingSheet(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingSheet(false); }}
                onDrop={(e) => { setShowCreateModal(false); handleSheetDrop(e); }}
                disabled={busy}
              >
                <Upload size={14} />
                {isDraggingSheet ? 'Drop to upload' : isProcessingSheet ? 'Reading sheet…' : 'Upload Full Sheet'}
              </button>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>Generate from script</div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
              <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>or describe from scratch</span>
              <div style={{ flex: 1, height: '0.0625rem', background: 'rgba(var(--cyan-300-rgb), 0.07)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ fontSize: '0.6562rem', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>CHARACTER NAME</label>
                <input type="text" placeholder="e.g. VIKRAM" value={createName} onChange={e => setCreateName(e.target.value)} className="input-inset" style={{ padding: '0.625rem 0.8125rem', background: 'var(--ink-900)', fontSize: '0.8125rem', borderRadius: '0.5rem' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '0.6562rem', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>DESCRIPTION</label>
                <textarea placeholder="Ancient Indian warrior, 40s, grey beard, dark red dhoti, gold jewellery..." value={createDesc} onChange={e => setCreateDesc(e.target.value)} className="textarea-inset" style={{ padding: '0.625rem 0.8125rem', background: 'var(--ink-900)', fontSize: '0.8125rem', borderRadius: '0.5rem', minHeight: '4.5rem' }} onFocus={e => e.target.style.borderColor = 'rgba(var(--violet-rgb), 0.5)'} onBlur={e => e.target.style.borderColor = 'var(--border-mid)'} />
              </div>
              <div>
                <label style={{ fontSize: '0.6562rem', fontWeight: 500, color: 'var(--teal)', letterSpacing: '0.16em', display: 'block', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  REFERENCE IMAGE <span style={{ color: 'var(--text-subtle)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input type="file" ref={refFileInputRef} onChange={handleRefImageSelect} style={{ display: 'none' }} accept="image/*" />
                {createRefImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', background: 'var(--ink-950)', border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.07)', borderRadius: '0.5rem' }}>
                    <img src={createRefImage.previewUrl} alt="Reference" style={{ width: '3.5rem', height: '3.5rem', objectFit: 'contain', background: 'var(--ink-950)', borderRadius: '0.375rem', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600 }}>Reference uploaded</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.625rem', marginTop: '0.125rem' }}>The sheet will match this character</div>
                    </div>
                    <button onClick={() => setCreateRefImage(null)} style={{ background: 'rgba(var(--violet-rgb), 0.1)', border: '0.0625rem solid rgba(var(--violet-rgb), 0.2)', color: 'var(--violet-400)', borderRadius: '0.3125rem', padding: '0.25rem 0.5rem', fontSize: '0.625rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                  </div>
                ) : (
                  <button
                    onClick={() => refFileInputRef.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setIsDraggingRef(true); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingRef(false); }}
                    onDrop={handleRefDrop}
                    style={{ width: '100%', padding: '0.625rem', borderRadius: '0.5rem', background: isDraggingRef ? 'rgba(var(--cyan-rgb), 0.06)' : 'rgba(var(--cyan-300-rgb), 0.04)', border: isDraggingRef ? '0.0625rem dashed var(--cyan-border)' : '0.0625rem dashed rgba(var(--cyan-300-rgb), 0.22)', color: 'var(--text-soft)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'border-color 120ms ease-out, background 120ms ease-out' }}>
                    {isDraggingRef ? 'Drop image here' : 'Upload Reference Image'}
                  </button>
                )}
              </div>
              <button className="btn-action-generate" style={{ width: '100%', padding: '0.8125rem', fontSize: '0.75rem' }} onClick={handleGenerateAngles}>
                Generate Character Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewTarget && (
        <CharacterImageModal
          imageUrl={previewTarget.url}
          label={previewTarget.label}
          onClose={() => setPreviewTarget(null)}
          onDelete={() => {
            handleDeleteImage(previewTarget.charIdx, previewTarget.imgIdx);
            setPreviewTarget(null);
          }}
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
              This prompt will be sent to the image model to generate character reference angles. Edit the description in the character card first if you need to adjust it.
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
            <div style={{ color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 600 }}>{isProcessingSheet ? (sheetProcessStatus || 'Reading sheet...') : 'Creating character sheet...'}</div>
            <div style={{ color: 'var(--cyan)', fontSize: '0.625rem', fontWeight: 700, marginTop: '0.125rem', letterSpacing: '0.05em' }}>Please keep this page open</div>
          </div>
        </div>
      )}

      <QueueStatusBar
        jobs={anchorQueue.jobs}
        isActive={anchorQueue.isActive}
        stats={anchorQueue.stats}
        onAbort={anchorQueue.abort}
        onClear={anchorQueue.clear}
        label="Identity anchors"
      />
    </div>
  );
}
