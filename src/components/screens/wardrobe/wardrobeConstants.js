export const emptyWardrobe = [];
export const emptyList = [];

export function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function upperName(value, fallback) {
  return (cleanText(value) || fallback).toUpperCase();
}

export function locationKey(location, index) {
  return String(location?.id || location?.name || `location-${index + 1}`).toLowerCase();
}

export function characterKey(character, index) {
  return String(character?.id || character?.name || `character-${index + 1}`).toLowerCase();
}

export function safeFileName(name) {
  return String(name || 'wardrobe.jpg')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'wardrobe.jpg';
}

export function buildWardrobeUploadPath(projectId, fileName, extension = 'jpg') {
  return `${projectId}/wardrobe/${Date.now()}-${safeFileName(fileName || `outfit.${extension}`)}`;
}

export function hasOutfitLock(outfit) {
  return Boolean(cleanText(outfit?.outfit_name) || cleanText(outfit?.description) || outfit?.image_url);
}

export function normalizeLibraryAsset(asset, kind) {
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

export function hasAssetByName(items = [], name) {
  const target = cleanText(name).toLowerCase();
  return Boolean(target && items.some(item => cleanText(item?.name).toLowerCase() === target));
}

export function legacyOutfitFallback(character, location) {
  const charName = upperName(character?.name, 'CHARACTER');
  const locName = upperName(location?.name, 'LOCATION');
  return `${charName} outfit for ${locName}`;
}

export function normalizeWardrobe(existingWardrobe = emptyWardrobe, locations = [], characters = []) {
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

export function summarizeWardrobe(wardrobe = []) {
  const locationCount = wardrobe.length;
  const outfitCount = wardrobe.reduce((total, location) => (
    total + (location.outfits || []).filter(hasOutfitLock).length
  ), 0);
  return { locationCount, outfitCount };
}
