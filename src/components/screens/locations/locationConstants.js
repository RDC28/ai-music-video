export const MODAL_BTN = {
  background: 'rgba(var(--cyan-300-rgb), 0.06)',
  border: '0.0625rem solid rgba(var(--cyan-300-rgb), 0.08)',
  color: 'var(--text-soft)',
  padding: '0.4375rem 0.75rem',
  borderRadius: '0.375rem',
  fontSize: '0.6875rem',
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.03em',
};

export const LOCATION_STEPS = [
  'Generating location reference sheet',
  'Saving to library',
];

export const LOCATION_DESCRIPTION_DISPLAY_LIMIT = 360;

export const LOCATION_LABEL_FALLBACKS = [
  'ESTABLISHING VIEW',
  'INTERIOR VIEW',
  'EXTERIOR VIEW',
  'DETAIL VIEW',
  'ATMOSPHERE VIEW',
  'WIDE ANGLE',
  'AERIAL VIEW',
  'GROUND LEVEL',
  'NIGHT VIEW',
  'ALT VIEW',
];

export const CHARACTER_STYLE_LABELS = [
  'FULL BODY',
  'MID PORTRAIT',
  'PORTRAIT',
  'FRONT VIEW',
  'BACK VIEW',
  'LEFT PROFILE',
  'RIGHT PROFILE',
  'SIDE VIEW',
  'FACE',
  '3/4',
  'CUSTOM CROP',
  'POSE',
];

export function compactScriptText(value, maxLength = 700) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function truncateLocationDescription(value, maxLength = LOCATION_DESCRIPTION_DISPLAY_LIMIT) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

export function buildScriptLocationDescription(location = {}, projectState = {}) {
  const script = projectState?.script || {};
  const analysis = projectState?.analysis || {};
  const sourceDescription = (
    location.visual_prompt ||
    location.prompt ||
    location.description ||
    location.role ||
    ''
  );

  const characterNames = Array.isArray(projectState?.characters)
    ? projectState.characters.map(c => c?.name).filter(Boolean)
    : [];

  let storyline = script.storyline ? compactScriptText(script.storyline, 520) : '';
  if (storyline && characterNames.length) {
    const namePattern = new RegExp(`\\b(${characterNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
    storyline = storyline.replace(namePattern, 'someone').replace(/\btheir\b/gi, 'the').trim();
  }

  return [
    sourceDescription,
    script.title ? `Music video title: ${script.title}` : '',
    storyline ? `Story context (setting and mood only): ${storyline}` : '',
    script.mood || analysis.mood ? `Mood and atmosphere: ${compactScriptText(script.mood || analysis.mood, 240)}` : '',
    analysis.genre || analysis.theme ? `Genre/theme: ${compactScriptText(analysis.genre || analysis.theme, 180)}` : '',
    'Create a production-ready location reference set for this music video. Show only the environment — no specific named people, no character faces, no story actors. Generic crowd or ambient figures are acceptable if the location calls for it. The place must remain stable across every view: same architecture, geography, materials, props, era, palette, weather logic, and lighting language.',
  ].filter(Boolean).join('\n');
}

export function _renderedRect(img, containerW, containerH) {
  const natAR = img.naturalWidth / img.naturalHeight;
  const cAR = containerW / containerH;
  let rendW, rendH, offX, offY;
  if (natAR > cAR) {
    rendW = containerW; rendH = containerW / natAR;
    offX = 0; offY = (containerH - rendH) / 2;
  } else {
    rendH = containerH; rendW = containerH * natAR;
    offX = (containerW - rendW) / 2; offY = 0;
  }
  return { offX, offY, rendW, rendH };
}

export function normalizeLocationLabel(label, index) {
  const text = typeof label === 'string' ? label.trim().toUpperCase() : '';
  const isCharacterLabel = CHARACTER_STYLE_LABELS.some(term => text.includes(term));
  const isTooGeneric = !text || /^ZONE\s*\d*$/i.test(text) || /^VIEW\s*\d*$/i.test(text) || /^NEW\s+VIEW\s*\d*$/i.test(text) || /^SECTION\s*\d*$/i.test(text);

  if (isCharacterLabel || isTooGeneric) {
    return LOCATION_LABEL_FALLBACKS[index % LOCATION_LABEL_FALLBACKS.length];
  }

  return text;
}
