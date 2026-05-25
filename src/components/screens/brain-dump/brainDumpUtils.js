export function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function safeFileName(name) {
  return String(name || 'brain-ref')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'brain-ref';
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || '')
    .split(/[,;\n]/)
    .map(cleanText)
    .filter(Boolean);
}

export function uniqueList(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = cleanText(value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeImage(image, index, fallbackKind) {
  if (typeof image === 'string') {
    return { url: image, label: `REFERENCE ${index + 1}`, kind: fallbackKind };
  }
  if (!image || typeof image !== 'object') return null;
  const url = image.url || image.image_url || image.publicUrl;
  if (!url) return null;
  return {
    ...image,
    url,
    label: cleanText(image.label || image.name || `REFERENCE ${index + 1}`).toUpperCase(),
    kind: image.kind || fallbackKind,
  };
}

export function buildUploadPath(projectId, folder, ownerName, fileName) {
  const owner = safeFileName(ownerName || 'untitled');
  const file = safeFileName(fileName || 'reference');
  return `${projectId}/brain-dump/${folder}/${owner}-${Date.now()}-${file}`;
}

export function deriveMoodWords(script, analysis) {
  return uniqueList([
    ...splitList(script?.mood_keywords),
    ...splitList(script?.mood),
    ...splitList(analysis?.mood),
  ]).slice(0, 8);
}

function normalizeCharacter(character, index) {
  const images = (Array.isArray(character?.images) ? character.images : [])
    .map((image, imageIndex) => normalizeImage(image, imageIndex, 'wardrobe_brain_dump'))
    .filter(Boolean);

  return {
    id: character?.id || `character-${index + 1}`,
    name: cleanText(character?.name),
    role: cleanText(character?.role || character?.description),
    notes: cleanText(character?.brain_dump_notes || character?.fashion_style || character?.visual_prompt),
    tags: splitList(character?.brain_dump_tags),
    default_outfit: cleanText(character?.default_outfit || character?.costume || character?.wardrobe),
    signature_elements: splitList(character?.signature_elements).join(', '),
    images,
    pendingFiles: [],
    detailsOpen: false,
    source: character || null,
  };
}

function normalizeLocation(location, index) {
  const images = (Array.isArray(location?.images) ? location.images : [])
    .map((image, imageIndex) => normalizeImage(image, imageIndex, 'location_brain_dump'))
    .filter(Boolean);

  return {
    id: location?.id || `location-${index + 1}`,
    name: cleanText(location?.name),
    notes: cleanText(location?.brain_dump_notes || location?.atmosphere || location?.description),
    tags: splitList(location?.brain_dump_tags),
    color_notes: cleanText(location?.color_palette),
    time_and_light: cleanText(location?.time_and_light),
    materials: cleanText(location?.materials_and_textures),
    images,
    pendingFiles: [],
    detailsOpen: false,
    source: location || null,
  };
}

export function deriveBrainDumpForm(projectState = {}) {
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};
  const styleBible = projectState?.style_bible || {};
  const characters = Array.isArray(projectState?.characters) ? projectState.characters : [];
  const locations = Array.isArray(projectState?.locations) ? projectState.locations : [];

  return {
    scriptText: cleanText(script.raw_text || script.text || ''),
    scriptFile: null,
    scriptFileMeta: script.file_url ? {
      file_url: script.file_url,
      file_name: script.file_name || 'Uploaded script',
      file_type: script.file_type || '',
      file_uploaded_at: script.file_uploaded_at || null,
      file_extraction_status: script.file_extraction_status || '',
      file_extraction_error: script.file_extraction_error || '',
    } : null,
    storyPrompt: cleanText(script.summary || script.storyline || analysis.summary),
    moodWords: deriveMoodWords(script, analysis),
    moodDraft: '',
    globalStyleNotes: cleanText(styleBible.global_notes || styleBible.visual_tone || ''),
    characters: characters.length ? characters.map(normalizeCharacter) : [normalizeCharacter({}, 0)],
    locations: locations.length ? locations.map(normalizeLocation) : [normalizeLocation({}, 0)],
  };
}

export function serializeCharacters(rows = []) {
  return rows
    .filter(row => cleanText(row.name) || cleanText(row.notes) || row.images?.length)
    .map((row, index) => {
      const source = row.source && typeof row.source === 'object' ? row.source : {};
      const name = cleanText(row.name || source.name || `CHARACTER ${index + 1}`).toUpperCase();
      const signatureElements = splitList(row.signature_elements);
      return {
        ...source,
        id: source.id || row.id || `character-${index + 1}`,
        name,
        role: cleanText(row.role || source.role),
        description: cleanText(source.description || row.role || row.notes),
        visual_prompt: cleanText(source.visual_prompt || row.notes || source.description),
        brain_dump_notes: cleanText(row.notes),
        brain_dump_tags: uniqueList(row.tags),
        fashion_style: cleanText(source.fashion_style || row.notes),
        default_outfit: cleanText(row.default_outfit || source.default_outfit || source.costume),
        signature_elements: signatureElements,
        images: Array.isArray(row.images) ? row.images : [],
      };
    });
}

export function serializeLocations(rows = []) {
  return rows
    .filter(row => cleanText(row.name) || cleanText(row.notes) || row.images?.length)
    .map((row, index) => {
      const source = row.source && typeof row.source === 'object' ? row.source : {};
      const name = cleanText(row.name || source.name || `LOCATION ${index + 1}`).toUpperCase();
      return {
        ...source,
        id: source.id || row.id || `location-${index + 1}`,
        name,
        description: cleanText(source.description || row.notes),
        visual_prompt: cleanText(source.visual_prompt || row.notes || source.description),
        atmosphere: cleanText(source.atmosphere || row.notes),
        brain_dump_notes: cleanText(row.notes),
        brain_dump_tags: uniqueList(row.tags),
        color_palette: cleanText(row.color_notes || source.color_palette),
        time_and_light: cleanText(row.time_and_light || source.time_and_light),
        materials_and_textures: cleanText(row.materials || source.materials_and_textures),
        images: Array.isArray(row.images) ? row.images : [],
      };
    });
}
