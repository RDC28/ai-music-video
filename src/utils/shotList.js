const toText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
};

const toNumber = (value, fallback = null) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return fallback;
};

const toStringList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') return toText(item.name || item.id || item.label || item.title);
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const label = toText(value.name || value.id || value.label || value.title);
    return label ? [label] : [];
  }
  return [];
};

const toWordList = (words) => {
  if (!Array.isArray(words)) return [];
  return words
    .map(word => {
      if (typeof word === 'string') return { word };
      if (!word || typeof word !== 'object') return null;
      const text = toText(word.word || word.text || word.value);
      if (!text) return null;
      const start = toNumber(word.start);
      const end = toNumber(word.end);
      return {
        word: text,
        ...(start !== null ? { start } : {}),
        ...(end !== null ? { end } : {}),
      };
    })
    .filter(Boolean);
};

const pickDuration = (shot, start, end) => {
  const duration = toNumber(shot.duration ?? shot.length ?? shot.seconds);
  if (duration !== null) return duration;
  if (start !== null && end !== null && end >= start) {
    return Number((end - start).toFixed(2));
  }
  return 5;
};

export function normalizeShot(shot, index = 0) {
  const source = shot && typeof shot === 'object' ? shot : {};
  const start = toNumber(source.start ?? source.start_time ?? source.startTime);
  const end = toNumber(source.end ?? source.end_time ?? source.endTime);
  const duration = pickDuration(source, start, end);
  const characters = toStringList(
    source.characters ||
    source.character_ids ||
    source.character_id ||
    source.character ||
    source.cast
  );
  const locations = toStringList(
    source.locations ||
    source.location_ids ||
    source.location_id ||
    source.location ||
    source.set
  );
  const words = toWordList(source.words || source.key_words || source.vocal_words);
  const n = toText(
    source.n ||
    source.name ||
    source.title ||
    source.shot_title ||
    source.shotTitle
  ) || `Shot ${index + 1}`;
  const p = toText(
    source.p ||
    source.prompt ||
    source.description ||
    source.visual ||
    source.image_prompt ||
    source.video_prompt
  );
  const lyrics = toText(source.lyrics || source.lyric || source.lyric_line || source.vocal_cue);

  return {
    ...source,
    n,
    p,
    duration,
    ...(start !== null ? { start } : {}),
    ...(end !== null ? { end } : {}),
    ...(lyrics ? { lyrics } : {}),
    ...(words.length ? { words } : {}),
    ...(characters.length ? { characters } : {}),
    ...(locations.length ? { locations } : {}),
    ...(toText(source.camera) ? { camera: toText(source.camera) } : {}),
    ...(toText(source.movement) ? { movement: toText(source.movement) } : {}),
    ...(toText(source.shot_size || source.shotSize) ? { shot_size: toText(source.shot_size || source.shotSize) } : {}),
    ...(toText(source.beat || source.story_beat) ? { beat: toText(source.beat || source.story_beat) } : {}),
    ...(toText(source.source_scene || source.scene) ? { source_scene: toText(source.source_scene || source.scene) } : {}),
  };
}

export function normalizeShotList(input) {
  const raw = Array.isArray(input)
    ? input
    : input?.shots || input?.shot_list || input?.shotList || [];

  if (!Array.isArray(raw)) return [];
  return raw
    .map((shot, index) => normalizeShot(shot, index))
    .filter(shot => shot.n || shot.p);
}

export function getShotTimingLabel(shot) {
  const start = toNumber(shot?.start);
  const end = toNumber(shot?.end);
  if (start !== null && end !== null) return `${start}s - ${end}s`;
  if (start !== null) return `${start}s`;
  return `${toNumber(shot?.duration, 5)}s`;
}

export function countTranscriptWords(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((total, line) => total + (Array.isArray(line?.words) ? line.words.length : 0), 0);
}
