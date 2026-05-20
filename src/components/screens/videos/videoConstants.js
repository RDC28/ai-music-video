export const MAX_CLIENT_RETRIES = 2;
export const CLIENT_REQUEST_TIMEOUT_MS = 650000;

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function isRetryableClientError(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.retryable === true ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('unavailable') ||
    message.includes('overloaded')
  );
}

export function getClipErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status);

  if (error?.name === 'AbortError' || status === 408 || message.includes('timeout')) {
    return 'This clip took too long. Try again.';
  }
  if (
    message.includes('seedance video generation requires') ||
    message.includes('bytedance_api_key') ||
    message.includes('seedance_api_key') ||
    message.includes('ark_api_key')
  ) {
    return 'Seedance needs an API key. Add BYTEDANCE_API_KEY to .env.local and restart Next.js, or choose a Veo model.';
  }
  if (message.includes('temporarily unavailable') || status >= 500) {
    return 'Clip creation is temporarily unavailable. Try again soon.';
  }
  if (message.includes('missing project') || message.includes('not found')) {
    return 'Project data is unavailable. Reload and try again.';
  }
  if (message.includes('must be native 16:9')) {
    return 'Regenerate the source frame as 16:9 before creating this clip.';
  }
  return 'Clip could not be created. Please try again.';
}

export async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export async function fetchJsonWithRetry(url, options, attempts = MAX_CLIENT_RETRIES) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const result = await readJsonResponse(response);
      if (!response.ok || result.error) {
        const error = new Error(result.error || `Request failed with ${response.status}`);
        error.status = result.status || response.status;
        error.retryable = result.retryable ?? isRetryableClientError(error);
        throw error;
      }

      return result;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (error?.name === 'AbortError') {
        lastError = new Error('Video generation request timed out. It can be retried later.');
        lastError.retryable = true;
        lastError.status = 408;
      }

      if (!isRetryableClientError(lastError) || attempt === attempts) break;
      await sleep(1600 * attempt + Math.floor(Math.random() * 700));
    }
  }

  lastError.clientAttempts = attempts;
  throw lastError;
}

export function buildShotError(error, previousError) {
  return {
    message: getClipErrorMessage(error),
    retryable: isRetryableClientError(error),
    status: error?.status || null,
    attempts: (previousError?.attempts || 0) + (error?.clientAttempts || 1),
    failed_at: new Date().toISOString(),
  };
}

export function compactText(value, maxLength = 700) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function compactAssetImages(images = [], maxImages = 6) {
  if (!Array.isArray(images)) return [];

  return images
    .map((image, index) => {
      let imageData = image;
      if (typeof image === 'string') {
        const text = image.trim();
        if (text.charAt(0) === '{') {
          try {
            imageData = JSON.parse(text);
          } catch {
            imageData = { url: text };
          }
        } else {
          imageData = { url: text };
        }
      }

      if (!imageData || typeof imageData !== 'object') return null;
      const url = imageData.url || imageData.src || imageData.image_url || imageData.publicUrl;
      if (!url || !/^https?:\/\//i.test(url)) return null;

      return {
        url,
        label: compactText(imageData.label || imageData.name || `Reference ${index + 1}`, 80),
        width: Number.isFinite(imageData.width) ? imageData.width : null,
        height: Number.isFinite(imageData.height) ? imageData.height : null,
      };
    })
    .filter(Boolean)
    .slice(0, maxImages);
}

export function compactAssetList(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({
    name: item?.name,
    role: compactText(item?.role || item?.description, 220),
    description: compactText(item?.description, 320),
    costume: compactText(item?.costume || item?.wardrobe || item?.costume_prompt || item?.outfit, 320),
    visual_prompt: compactText(item?.visual_prompt || item?.prompt || item?.description, 700),
    images: compactAssetImages(item?.images),
    sheetUrl: item?.sheetUrl || item?.sheet_url || null,
  }));
}

export function compactWardrobe(wardrobe = []) {
  if (!Array.isArray(wardrobe)) return [];
  return wardrobe.slice(0, 24).map((location, index) => ({
    location_id: location?.location_id || location?.id || `location-${index + 1}`,
    location_name: location?.location_name || location?.name || `Location ${index + 1}`,
    outfits: Array.isArray(location?.outfits)
      ? location.outfits.map((outfit, outfitIndex) => ({
          character_id: outfit?.character_id || outfit?.id || `character-${outfitIndex + 1}`,
          character_name: outfit?.character_name || outfit?.name || `Character ${outfitIndex + 1}`,
          has_outfit_override: Boolean(outfit?.outfit_name || outfit?.name || outfit?.description || outfit?.outfit_description || outfit?.prompt || outfit?.image_url || outfit?.imageUrl || outfit?.url),
          outfit_name: compactText(outfit?.outfit_name || outfit?.name, 160),
          description: compactText(outfit?.description || outfit?.outfit_description || outfit?.prompt, 500),
          image_url: outfit?.image_url || outfit?.imageUrl || outfit?.url || '',
          image_path: outfit?.image_path || '',
        }))
      : [],
  }));
}

export function compactTranscript(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 80).map(line => ({
    start: line?.start,
    end: line?.end,
    text: compactText(line?.text || line?.lyrics || line?.line, 260),
    words: Array.isArray(line?.words)
      ? line.words.slice(0, 80).map(word => ({
          word: word?.word || word?.text,
          start: word?.start,
          end: word?.end,
        }))
      : [],
  }));
}

export function buildGenerationContext(projectData, sourceShots) {
  const sourceState = Array.isArray(projectData) ? {} : (projectData || {});
  const script = sourceState.script || {};
  const analysis = sourceState.analysis || {};
  const transcript = analysis.lyrics || script.lyrics_timeline || [];

  return {
    analysis: {
      theme: compactText(analysis.theme, 300),
      mood: compactText(analysis.mood, 300),
      genre: compactText(analysis.genre, 160),
      bpm: analysis.bpm,
      summary: compactText(analysis.summary, 700),
    },
    script: {
      title: script.title,
      mood: compactText(script.mood, 500),
      storyline: compactText(script.storyline, 700),
      scenes: Array.isArray(script.scenes)
        ? script.scenes.slice(0, 24).map(scene => ({
            start: scene?.start,
            end: scene?.end,
            visual: compactText(scene?.visual || scene?.description, 420),
            lyrics: compactText(scene?.lyrics, 220),
          }))
        : [],
    },
    transcript: compactTranscript(transcript),
    characters: compactAssetList(sourceState.characters),
    locations: compactAssetList(sourceState.locations),
    wardrobe: compactWardrobe(sourceState.wardrobe),
    shot_list: sourceShots.map(shot => ({
      n: shot.n,
      p: compactText(shot.p || shot.prompt, 2200),
      start: shot.start,
      end: shot.end,
      duration: shot.duration,
      veo_duration_seconds: shot.veo_duration_seconds,
      lyrics: compactText(shot.lyrics, 300),
      characters: shot.characters,
      locations: shot.locations,
      concept: compactText(shot.concept, 400),
      costumes: compactText(shot.costumes || shot.costume || shot.wardrobe, 360),
      continuity: compactText(shot.continuity || shot.required_continuity || shot.continuity_notes, 520),
      action_timing: compactText(shot.action_timing || shot.timing || shot.actionTiming, 1200),
      visual_style: compactText(shot.visual_style || shot.style || shot.look, 800),
      sound_design: compactText(shot.sound_design || shot.soundDesign || shot.audio_notes, 500),
      negative_constraints: compactText(shot.negative_constraints || shot.constraints || shot.avoid, 900),
      source_scene: compactText(shot.source_scene, 300),
      shot_size: shot.shot_size,
      camera: shot.camera,
      movement: shot.movement,
      beat: compactText(shot.beat, 260),
      image_url: shot.image_url,
      image_prompt: compactText(shot.image_prompt, 1200),
      video_prompt: compactText(shot.video_prompt, 2200),
    })),
  };
}

export function compactShotForRequest(shot) {
  return {
    n: shot.n,
    p: compactText(shot.p || shot.prompt, 6400),
    prompt: compactText(shot.prompt, 6400),
    start: shot.start,
    end: shot.end,
    duration: shot.duration,
    veo_duration_seconds: shot.veo_duration_seconds,
    lyrics: compactText(shot.lyrics, 500),
    words: Array.isArray(shot.words) ? shot.words.slice(0, 80) : [],
    characters: shot.characters || [],
    locations: shot.locations || [],
    concept: compactText(shot.concept, 500),
    costumes: compactText(shot.costumes || shot.costume || shot.wardrobe, 500),
    continuity: compactText(shot.continuity || shot.required_continuity || shot.continuity_notes, 700),
    action_timing: compactText(shot.action_timing || shot.timing || shot.actionTiming, 1600),
    visual_style: compactText(shot.visual_style || shot.style || shot.look, 1000),
    sound_design: compactText(shot.sound_design || shot.soundDesign || shot.audio_notes, 700),
    negative_constraints: compactText(shot.negative_constraints || shot.constraints || shot.avoid, 1000),
    source_scene: compactText(shot.source_scene, 400),
    shot_size: shot.shot_size,
    camera: shot.camera,
    movement: shot.movement,
    beat: compactText(shot.beat, 500),
    image_url: shot.image_url,
    image_prompt: compactText(shot.image_prompt, 2000),
    video_prompt: compactText(shot.video_prompt, 6400),
  };
}

export function safeFileName(name) {
  return String(name || 'upload.mp4')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload.mp4';
}

export function inferVideoExtension(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (type.includes('webm') || name.endsWith('.webm')) return 'webm';
  if (type.includes('quicktime') || name.endsWith('.mov')) return 'mov';
  return 'mp4';
}

export function videoContentType(file, extension) {
  if (file?.type) return file.type;
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  return 'video/mp4';
}
