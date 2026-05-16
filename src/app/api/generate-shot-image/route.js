import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import {
  getFallbackModels,
  IMAGE_MODEL_FALLBACKS,
  runWithModelFallback,
} from "@/utils/googleModelFallbacks";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_PROVIDER_BYTEDANCE,
  resolveImageModelOption,
} from "@/utils/generationModels";
import { normalizeShot } from "@/utils/shotList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const MAX_RETRIES = 3;
const IMAGE_GENERATION_TIMEOUT_MS = 90000;
const STORAGE_UPLOAD_TIMEOUT_MS = 30000;
const BYTEDANCE_IMAGE_TIMEOUT_MS = Number(process.env.BYTEDANCE_IMAGE_TIMEOUT_MS || 120000);
const BYTEDANCE_IMAGE_BASE_URL = (
  process.env.BYTEDANCE_IMAGE_BASE_URL ||
  process.env.BYTEDANCE_BASE_URL ||
  "https://ark.ap-southeast.bytepluses.com/api/v3"
).replace(/\/+$/, "");
const TARGET_ASPECT_RATIO = 16 / 9;
const ASPECT_RATIO_TOLERANCE = 0.08;
const REFERENCE_IMAGE_TIMEOUT_MS = 25000;
const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 12;
const MAX_REFERENCE_IMAGES_PER_CHARACTER = 3;
const MAX_REFERENCE_IMAGES_PER_LOCATION = 3;
const QUALITY_CANDIDATE_COUNT = Number(process.env.IMAGE_QUALITY_CANDIDATES || 2);
const FACE_SCORE_THRESHOLD = Number(process.env.FACE_SCORE_THRESHOLD || 6);
const OUTFIT_SCORE_THRESHOLD = Number(process.env.OUTFIT_SCORE_THRESHOLD || 5);
const QUALITY_CHECK_TIMEOUT_MS = 15000;
const QUALITY_CHECK_MODEL = process.env.GOOGLE_QUALITY_CHECK_MODEL || "gemini-2.5-flash";

const CHARACTER_REFERENCE_PRIORITY = [
  "face close-up front",
  "face close-up",
  "face front",
  "mid portrait",
  "face 3/4",
  "portrait front",
  "full body front",
  "outfit front",
  "full body",
  "portrait",
  "front",
  "outfit",
];

const LOCATION_REFERENCE_PRIORITY = [
  "establishing",
  "wide",
  "ground level",
  "interior",
  "exterior",
  "night",
  "dusk",
  "golden hour",
  "day",
  "atmosphere",
  "detail",
  "texture",
];

const compact = (value, maxLength = 900) => {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const RAW_SHOT_BLOCKED_PHRASES = /\b(?:smash cut|match cut|jump cut|cut to black|cut to|fade in|fade out|fade to black|dissolve|iris wipe|wipe|transition|blackout|title card|montage|split screen|curtain reveal|black wall|black bars|letterbox|pillarbox|lens cap pass|camera passes through darkness|object passes close to camera)\b/gi;

const rawShotText = (value, maxLength = 900, fallback = '') => (
  compact(value, maxLength)
    .replace(RAW_SHOT_BLOCKED_PHRASES, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim() || fallback
);

function normalizeStyleBibleForPrompt(styleBible) {
  let source = styleBible;
  if (typeof source === "string") {
    const text = source.trim();
    if (!text) return null;
    try {
      source = JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (!source || typeof source !== "object") return null;
  const colourGrade = source.colour_grade && typeof source.colour_grade === "object"
    ? source.colour_grade
    : {};

  const primaryPalette = Array.isArray(colourGrade.primary_palette)
    ? colourGrade.primary_palette
      .map((value) => compact(value, 40))
      .filter(Boolean)
    : [];

  return {
    colour_grade: {
      primary_palette: primaryPalette.length ? primaryPalette : ["unspecified"],
      shadow_tone: compact(colourGrade.shadow_tone || "unspecified", 220),
      highlight_tone: compact(colourGrade.highlight_tone || "unspecified", 220),
      saturation: compact(colourGrade.saturation || "unspecified", 60),
      contrast: compact(colourGrade.contrast || "unspecified", 60),
    },
    lighting_style: compact(source.lighting_style || "unspecified", 260),
    camera_rules: compact(source.camera_rules || "unspecified", 260),
    visual_tone: compact(source.visual_tone || "unspecified", 280),
    negative_constraints: compact(source.negative_constraints || "none provided", 420),
    reference_summary: compact(source.reference_summary || "No style summary provided.", 460),
  };
}

function buildStyleBibleContext(styleBible) {
  const normalized = normalizeStyleBibleForPrompt(styleBible);
  if (!normalized) return "";

  return `━━━ STYLE BIBLE — APPLY TO EVERY SHOT ━━━
These are locked visual rules for the entire music video. Every frame must conform.

Colour grade:
- Primary palette: ${normalized.colour_grade.primary_palette.join(", ")}
- Shadows: ${normalized.colour_grade.shadow_tone}
- Highlights: ${normalized.colour_grade.highlight_tone}
- Saturation: ${normalized.colour_grade.saturation}
- Contrast: ${normalized.colour_grade.contrast}

Lighting: ${normalized.lighting_style}
Camera rules: ${normalized.camera_rules}
Visual tone: ${normalized.visual_tone}

STRICTLY AVOID in every shot: ${normalized.negative_constraints}

Reference aesthetic: ${normalized.reference_summary}

These style rules override any conflicting aesthetic suggestion in the shot prompt.
Every generated frame must look like it belongs to the same film as every other frame.
`;
}

function inferImageMimeType(url, headerValue) {
  const header = String(headerValue || "").split(";")[0].trim().toLowerCase();
  if (header.startsWith("image/")) return header;
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")) return "image/jpeg";
  if (lowerUrl.includes(".webp")) return "image/webp";
  return "image/png";
}

function normalizeReferenceImage(image, index) {
  let imageData = image;
  if (typeof image === "string") {
    const text = image.trim();
    if (text.charAt(0) === "{") {
      try {
        imageData = JSON.parse(text);
      } catch {
        imageData = { url: text };
      }
    } else {
      imageData = { url: text };
    }
  }

  if (!imageData || typeof imageData !== "object") return null;
  const url = imageData.url || imageData.src || imageData.image_url || imageData.publicUrl;
  if (!url || !/^https?:\/\//i.test(url)) return null;

  return {
    url,
    label: compact(imageData.label || imageData.name || `Reference ${index + 1}`, 80),
  };
}

function scoreReferenceLabel(kind, label, index) {
  const lowerLabel = String(label || "").toLowerCase();
  const priorities = kind === "character" ? CHARACTER_REFERENCE_PRIORITY : LOCATION_REFERENCE_PRIORITY;
  const priorityIndex = priorities.findIndex(term => lowerLabel.includes(term));
  const priorityScore = priorityIndex === -1 ? priorities.length + 1 : priorityIndex;
  return priorityScore * 100 + index;
}

function getAssetReferenceImages(asset, kind, perAssetLimit) {
  const images = Array.isArray(asset?.images) ? asset.images : [];
  const references = images
    .map((image, index) => {
      const ref = normalizeReferenceImage(image, index);
      if (!ref) return null;
      return {
        ...ref,
        kind,
        name: asset?.name || (kind === "character" ? "Character" : "Location"),
        score: scoreReferenceLabel(kind, ref.label, index),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, perAssetLimit);

  if (!references.length && asset?.sheetUrl && /^https?:\/\//i.test(asset.sheetUrl)) {
    references.push({
      kind,
      name: asset?.name || (kind === "character" ? "Character" : "Location"),
      label: "Full reference sheet",
      url: asset.sheetUrl,
      score: 999,
    });
  }

  return references;
}

function normalizeLookupName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function wantedSet(names = []) {
  return new Set((Array.isArray(names) ? names : []).map(normalizeLookupName).filter(Boolean));
}

function matchesWanted(value, wanted) {
  if (!wanted.size) return true;
  return wanted.has(normalizeLookupName(value));
}

function isLegacyOutfitFallback(outfitName, characterName, locationName) {
  const normalizedName = normalizeLookupName(outfitName);
  if (!normalizedName) return false;
  return normalizedName === `${normalizeLookupName(characterName)} outfit for ${normalizeLookupName(locationName)}`;
}

function hasWardrobeOverride(outfit, characterName, locationName) {
  const outfitName = compact(outfit?.outfit_name || outfit?.name, 160);
  const description = compact(outfit?.description || outfit?.outfit_description || outfit?.prompt, 360);
  const hasImage = Boolean(outfit?.image_url || outfit?.imageUrl || outfit?.url);
  const onlyLegacyName = outfitName && !description && !hasImage && isLegacyOutfitFallback(outfitName, characterName, locationName);
  return Boolean(
    !onlyLegacyName && (
      outfitName ||
      description ||
      hasImage
    )
  );
}

function collectWardrobeItems(wardrobe = [], shotCharacters = [], shotLocations = []) {
  if (!Array.isArray(wardrobe)) return [];
  const wantedCharacters = wantedSet(shotCharacters);
  const wantedLocations = wantedSet(shotLocations);
  // If a shot has no named main characters, do not attach wardrobe references.
  if (!wantedCharacters.size) return [];

  return wardrobe.flatMap((location, locationIndex) => {
    const locationName = location?.location_name || location?.name || `Location ${locationIndex + 1}`;
    const locationId = location?.location_id || location?.id || "";
    const locationMatches = matchesWanted(locationName, wantedLocations) || matchesWanted(locationId, wantedLocations);
    if (!locationMatches) return [];

    return (Array.isArray(location?.outfits) ? location.outfits : [])
      .filter(outfit => {
        const characterName = outfit?.character_name || outfit?.name;
        const characterId = outfit?.character_id || outfit?.id;
        if (!hasWardrobeOverride(outfit, characterName, locationName)) return false;
        return matchesWanted(characterName, wantedCharacters) || matchesWanted(characterId, wantedCharacters);
      })
      .map(outfit => ({
        location_name: locationName,
        character_name: outfit?.character_name || outfit?.name || "Character",
        outfit_name: isLegacyOutfitFallback(outfit?.outfit_name || outfit?.name, outfit?.character_name || outfit?.name, locationName) ? "" : (outfit?.outfit_name || outfit?.name || ""),
        description: outfit?.description || outfit?.outfit_description || outfit?.prompt || "",
        image_url: outfit?.image_url || outfit?.imageUrl || outfit?.url || "",
      }));
  });
}

function getWardrobeReferenceImages(wardrobe, shotCharacters, shotLocations) {
  return collectWardrobeItems(wardrobe, shotCharacters, shotLocations)
    .map((item, index) => {
      if (!item.image_url || !/^https?:\/\//i.test(item.image_url)) return null;
      return {
        kind: "wardrobe",
        name: `${item.character_name} @ ${item.location_name}`,
        label: compact(item.outfit_name || `Outfit reference ${index + 1}`, 80),
        url: item.image_url,
        score: index,
      };
    })
    .filter(Boolean);
}

function dedupeReferenceImages(references = []) {
  const seen = new Set();
  return references
    .filter(reference => {
      if (seen.has(reference.url)) return false;
      seen.add(reference.url);
      return true;
    })
    .slice(0, MAX_REFERENCE_IMAGES);
}

function collectFocusedReferenceImages(matchedCharacters, matchedLocations, wardrobe = [], shotCharacters = [], shotLocations = []) {
  const references = [];

  const characterByName = new Map(
    (Array.isArray(matchedCharacters) ? matchedCharacters : [])
      .map(character => [normalizeLookupName(character?.name), character])
      .filter(([name]) => Boolean(name))
  );
  const orderedCharacter = (Array.isArray(shotCharacters) ? shotCharacters : [])
    .map(name => characterByName.get(normalizeLookupName(name)))
    .find(Boolean);
  const primaryCharacter = orderedCharacter || (Array.isArray(matchedCharacters) ? matchedCharacters[0] : null);
  const hasNamedMainCharacter = Boolean(primaryCharacter);

  // IMAGE 1: Character anchor (identity lock). If missing, fall back to best face panel.
  if (primaryCharacter) {
    if (primaryCharacter.anchor_image_url && /^https?:\/\//i.test(primaryCharacter.anchor_image_url)) {
      references.push({
        kind: "character",
        name: primaryCharacter.name,
        label: "Character anchor — identity lock",
        url: primaryCharacter.anchor_image_url,
        score: 0,
      });
    } else {
      const images = Array.isArray(primaryCharacter?.images) ? primaryCharacter.images : [];
      const facePriority = [
        "face close-up front",
        "face close-up",
        "close-up",
        "face front",
        "portrait front",
        "mid portrait",
        "full body front",
        "front",
      ];
      const bestFace = images
        .map((image, index) => {
          const ref = normalizeReferenceImage(image, index);
          if (!ref) return null;
          const lowerLabel = ref.label.toLowerCase();
          const score = facePriority.findIndex((term) => lowerLabel.includes(term));
          return {
            ...ref,
            kind: "character",
            name: primaryCharacter.name,
            score: score === -1 ? 99 : score,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)[0];

      if (bestFace) references.push(bestFace);
    }
  }

  // IMAGE 2: Wardrobe reference (single best outfit image).
  const wardrobeItems = hasNamedMainCharacter
    ? collectWardrobeItems(wardrobe, shotCharacters, shotLocations)
    : [];
  const bestWardrobe = wardrobeItems.find((item) => (
    item.image_url &&
    /^https?:\/\//i.test(item.image_url) &&
    normalizeLookupName(item.character_name) === normalizeLookupName(primaryCharacter?.name)
  )) || wardrobeItems.find((item) => item.image_url && /^https?:\/\//i.test(item.image_url));
  if (bestWardrobe) {
    references.push({
      kind: "wardrobe",
      name: `${bestWardrobe.character_name} @ ${bestWardrobe.location_name}`,
      label: compact(bestWardrobe.outfit_name || "Outfit reference", 80),
      url: bestWardrobe.image_url,
      score: 1,
    });
  }

  // IMAGE 3: Location reference (single best establishing/wide frame).
  const primaryLocation = Array.isArray(matchedLocations) ? matchedLocations[0] : null;
  if (primaryLocation) {
    const images = Array.isArray(primaryLocation?.images) ? primaryLocation.images : [];
    const locationPriority = [
      "establishing",
      "wide",
      "wide shot",
      "interior wide",
      "exterior",
      "ground level",
      "atmosphere",
    ];
    const bestLocation = images
      .map((image, index) => {
        const ref = normalizeReferenceImage(image, index);
        if (!ref) return null;
        const lowerLabel = ref.label.toLowerCase();
        const score = locationPriority.findIndex((term) => lowerLabel.includes(term));
        return {
          ...ref,
          kind: "location",
          name: primaryLocation.name,
          score: score === -1 ? 99 : score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)[0];
    if (bestLocation) references.push(bestLocation);
  }

  const seen = new Set();
  return references.filter((reference) => {
    if (seen.has(reference.url)) return false;
    seen.add(reference.url);
    return true;
  }).slice(0, 3);
}

// LEGACY - replaced by collectFocusedReferenceImages
function collectShotReferenceImages(matchedCharacters, matchedLocations, wardrobe = [], shotCharacters = [], shotLocations = []) {
  // Wardrobe refs are reserved first so they are never crowded out by character/location refs
  const wardrobeRefs = getWardrobeReferenceImages(wardrobe, shotCharacters, shotLocations);
  const remaining = Math.max(MAX_REFERENCE_IMAGES - wardrobeRefs.length, 0);

  // 60% of remaining budget for characters (identity-critical), 40% for locations
  const charBudget = Math.ceil(remaining * 0.6);
  const locBudget = remaining - charBudget;
  const perChar = matchedCharacters.length ? Math.max(Math.floor(charBudget / matchedCharacters.length), 1) : 0;
  const perLoc = matchedLocations.length ? Math.max(Math.floor(locBudget / matchedLocations.length), 1) : 0;

  const charRefs = matchedCharacters.flatMap(c => getAssetReferenceImages(c, "character", perChar));
  const locRefs = matchedLocations.flatMap(l => getAssetReferenceImages(l, "location", perLoc));

  // Order: identity first, outfit second, environment third
  return dedupeReferenceImages([...charRefs, ...wardrobeRefs, ...locRefs]);
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + length;
  }

  return null;
}

function assertNativeWidescreenImage(buffer, label) {
  const dimensions = parsePngDimensions(buffer) || parseJpegDimensions(buffer);
  const ratio = dimensions?.height ? dimensions.width / dimensions.height : null;

  if (!ratio || Math.abs(ratio - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
    const actual = dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown dimensions";
    const err = new Error(`${label} must be native 16:9, but got ${actual}.`);
    err.status = 502;
    err.retryable = true;
    throw err;
  }

  return dimensions;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

function isRetryableError(error) {
  const status = Number(getErrorStatus(error));
  const message = String(error?.message || '').toLowerCase();

  if (error?.retryable === false) return false;

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
    message.includes('timed out') ||
    message.includes('temporarily') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('overloaded') ||
    message.includes('unavailable') ||
    message.includes('network')
  );
}

function serializeError(error) {
  return {
    message: error?.message || 'Unknown image generation error',
    status: getErrorStatus(error) || null,
    retryable: isRetryableError(error),
  };
}

async function withTimeout(promiseFactory, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.retryable = true;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(operation, { label, attempts = MAX_RETRIES, baseDelayMs = 900 }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      console.warn(`${label} failed on attempt ${attempt}/${attempts}:`, serializeError(error));

      if (!retryable || attempt === attempts) break;

      const jitter = Math.floor(Math.random() * 450);
      const backoff = baseDelayMs * (2 ** (attempt - 1)) + jitter;
      await sleep(backoff);
    }
  }

  throw lastError;
}

function getByteDanceApiKey() {
  return process.env.BYTEDANCE_API_KEY || process.env.ARK_API_KEY || process.env.SEEDANCE_API_KEY || "";
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createProviderError(message, { status = 500, retryable = false } = {}) {
  const err = new Error(message);
  err.status = status;
  err.retryable = retryable;
  return err;
}

function providerErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  return (
    payload.error?.message ||
    payload.error ||
    payload.message ||
    payload.msg ||
    payload.code ||
    fallback
  );
}

async function fetchRemoteImageBuffer(url) {
  const response = await withTimeout(
    () => fetch(url),
    STORAGE_UPLOAD_TIMEOUT_MS,
    "ByteDance image download"
  );

  if (!response.ok) {
    throw createProviderError(`Generated image download failed with ${response.status}`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

async function fetchReferenceImage(reference, shotIndex) {
  const response = await withTimeout(
    () => fetch(reference.url),
    REFERENCE_IMAGE_TIMEOUT_MS,
    `Shot ${shotIndex + 1} reference image download`
  );

  if (!response.ok) {
    throw createProviderError(`Reference image download failed with ${response.status}`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw createProviderError("Reference image is too large for prompt conditioning", {
      status: 413,
      retryable: false,
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw createProviderError("Reference image is too large for prompt conditioning", {
      status: 413,
      retryable: false,
    });
  }

  const mimeType = inferImageMimeType(reference.url, response.headers.get("content-type"));
  return {
    ...reference,
    mimeType,
    imageBase64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

async function loadReferenceImages(references, shotIndex) {
  if (!Array.isArray(references) || !references.length) return [];

  const loaded = await Promise.all(references.map(async (reference) => {
    try {
      return await fetchReferenceImage(reference, shotIndex);
    } catch (error) {
      console.warn(`Shot ${shotIndex + 1} skipped ${reference.kind} reference ${reference.name}:`, serializeError(error));
      return null;
    }
  }));

  return loaded.filter(Boolean).slice(0, MAX_REFERENCE_IMAGES);
}

async function generateGoogleImage({ prompt, modelName, shotIndex, referenceImages = [] }) {
  if (!genAI) {
    throw createProviderError("Frame generation is temporarily unavailable.", { status: 500 });
  }

  return runWithModelFallback({
    label: `Shot ${shotIndex + 1} image generation`,
    models: getFallbackModels(modelName || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
    operation: async (activeModelName) => withRetry(async () => {
      const parts = [
        { text: prompt },
        ...referenceImages.map(reference => ({
          inlineData: {
            mimeType: reference.mimeType,
            data: reference.imageBase64,
          },
        })),
      ];

      const result = await withTimeout(
        () => genAI.models.generateContent({
          model: activeModelName,
          contents: [{ role: "user", parts }],
          config: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "16:9",
              imageSize: "1K",
            },
          },
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        `Image model request (${activeModelName})`
      );

      const imagePart = result.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
      const generatedBase64 = imagePart?.inlineData?.data;

      if (!generatedBase64) {
        const reason = result.candidates?.[0]?.finishReason;
        const err = new Error(reason ? `Image model returned no image data (${reason})` : "Image model returned no image data");
        err.retryable = reason !== "SAFETY";
        throw err;
      }

      assertNativeWidescreenImage(
        Buffer.from(generatedBase64, "base64"),
        `Shot ${shotIndex + 1} source frame`
      );

      return {
        imageBase64: generatedBase64,
        mimeType: imagePart.inlineData.mimeType || "image/png",
      };
    }, {
      label: `Shot ${shotIndex + 1} image generation (${activeModelName})`,
      attempts: MAX_RETRIES,
      baseDelayMs: 1100,
    }),
  });
}

async function generateByteDanceImage({ prompt, modelName, shotIndex }) {
  const apiKey = getByteDanceApiKey();
  if (!apiKey) {
    throw createProviderError("BYTEDANCE_API_KEY is not configured for Seedream image generation.", {
      status: 500,
      retryable: false,
    });
  }

  const response = await withRetry(
    () => withTimeout(
      () => fetch(`${BYTEDANCE_IMAGE_BASE_URL}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          prompt,
          size: process.env.BYTEDANCE_IMAGE_SIZE || "1280x720",
          response_format: "b64_json",
          sequential_image_generation: "disabled",
          stream: false,
          watermark: false,
        }),
      }),
      BYTEDANCE_IMAGE_TIMEOUT_MS,
      `Seedream image request (${modelName})`
    ),
    {
      label: `Shot ${shotIndex + 1} Seedream image generation`,
      attempts: MAX_RETRIES,
      baseDelayMs: 1600,
    }
  );
  const payload = await readJsonOrText(response);

  if (!response.ok || payload?.error) {
    throw createProviderError(providerErrorMessage(payload, `Seedream image request failed with ${response.status}`), {
      status: response.status || 500,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  const item = payload?.data?.[0] || payload?.result?.data?.[0] || payload?.result?.[0];
  const b64Json = item?.b64_json || item?.b64 || item?.base64 || item?.image_base64;
  const imageUrl = item?.url || item?.image_url || item?.image;
  let buffer;
  let mimeType = "image/jpeg";

  if (b64Json) {
    buffer = Buffer.from(String(b64Json).replace(/^data:image\/\w+;base64,/, ""), "base64");
  } else if (imageUrl) {
    const fetchedImage = await fetchRemoteImageBuffer(imageUrl);
    buffer = fetchedImage.buffer;
    mimeType = fetchedImage.mimeType;
  } else {
    throw createProviderError("Seedream image model returned no image data", {
      status: 502,
      retryable: true,
    });
  }

  assertNativeWidescreenImage(buffer, `Shot ${shotIndex + 1} Seedream source frame`);

  return {
    result: {
      imageBase64: buffer.toString("base64"),
      mimeType,
    },
    model: modelName,
    attempts: [],
  };
}

async function qualityCheckImage(generatedBase64, generatedMimeType, characterAndWardrobeRefs) {
  if (!genAI || !characterAndWardrobeRefs.length) {
    return { faceScore: 10, outfitScore: 10, pass: true, issues: [] };
  }

  try {
    const hasWardrobeRef = characterAndWardrobeRefs.some(r => r.kind === "wardrobe");
    const refParts = characterAndWardrobeRefs.map(ref => ({
      inlineData: { mimeType: ref.mimeType, data: ref.imageBase64 },
    }));
    const candidatePart = {
      inlineData: { mimeType: generatedMimeType || "image/png", data: generatedBase64 },
    };
    const textPart = {
      text: `You are a quality-control inspector for an AI music video pipeline.

The first ${refParts.length} image${refParts.length > 1 ? "s are" : " is"} approved reference${refParts.length > 1 ? "s" : ""} showing character identity (faces, hair, skin tone, body) and wardrobe/outfits.
The LAST image is a generated shot candidate to evaluate.

Score the candidate out of 10:
- face_score: How closely the main character's face, skin tone, hair, and body match the character references. 10 = perfect match, 1 = completely different person.
- outfit_score: How closely the clothing/outfit matches the wardrobe references${hasWardrobeRef ? "" : " (no wardrobe references provided — set to 10)"}. 10 = exact match.

PASS requires face_score >= ${FACE_SCORE_THRESHOLD} AND outfit_score >= ${hasWardrobeRef ? OUTFIT_SCORE_THRESHOLD : 0}.

Respond with ONLY this JSON, no other text:
{"face_score": <0-10>, "outfit_score": <0-10>, "pass": <true|false>, "issues": ["brief issue"]}`,
    };

    const result = await withTimeout(
      () => genAI.models.generateContent({
        model: QUALITY_CHECK_MODEL,
        contents: [{ role: "user", parts: [...refParts, candidatePart, textPart] }],
      }),
      QUALITY_CHECK_TIMEOUT_MS,
      "Image quality check"
    );

    const text = result.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("Could not parse quality check JSON");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      faceScore: Number(parsed.face_score ?? 5),
      outfitScore: Number(parsed.outfit_score ?? 10),
      pass: Boolean(parsed.pass),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (error) {
    console.warn(`Quality check failed, accepting candidate (${error.message})`);
    return { faceScore: 10, outfitScore: 10, pass: true, issues: [] };
  }
}

async function generateBestCandidate({ prompt, modelName, shotIndex, referenceImages = [] }) {
  const charWardrobeRefs = referenceImages.filter(r => r.kind === "character" || r.kind === "wardrobe");

  if (!charWardrobeRefs.length || QUALITY_CANDIDATE_COUNT <= 1) {
    return generateGoogleImage({ prompt, modelName, shotIndex, referenceImages });
  }

  return new Promise((resolve, reject) => {
    let settled = 0;
    let bestGeneration = null;
    let bestScore = -1;
    let resolved = false;
    const total = QUALITY_CANDIDATE_COUNT;

    const onFail = (candidateIndex, err) => {
      console.warn(`Shot ${shotIndex + 1} candidate ${candidateIndex + 1} failed:`, err?.message);
      settled++;
      if (settled === total && !resolved) {
        resolved = true;
        if (bestGeneration) {
          resolve(bestGeneration);
        } else {
          generateGoogleImage({ prompt, modelName, shotIndex, referenceImages }).then(resolve).catch(reject);
        }
      }
    };

    for (let i = 0; i < total; i++) {
      const candidateIndex = i;
      generateGoogleImage({ prompt, modelName, shotIndex, referenceImages })
        .then(async (generation) => {
          if (resolved) return;
          const { imageBase64, mimeType } = generation.result;
          const qc = await qualityCheckImage(imageBase64, mimeType, charWardrobeRefs);
          const score = (qc.faceScore ?? 0) + (qc.outfitScore ?? 0);
          console.log(`Shot ${shotIndex + 1} candidate ${candidateIndex + 1}: face=${qc.faceScore} outfit=${qc.outfitScore} pass=${qc.pass}${qc.issues?.length ? ` issues=${qc.issues.join("; ")}` : ""}`);
          if (score > bestScore) {
            bestScore = score;
            bestGeneration = generation;
          }
          settled++;
          if (!resolved && qc.pass) {
            resolved = true;
            resolve(generation);
            return;
          }
          if (settled === total && !resolved) {
            resolved = true;
            resolve(bestGeneration);
          }
        })
        .catch((err) => onFail(candidateIndex, err));
    }
  });
}

const namesFrom = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => compact(item?.name, 120))
    .filter(Boolean);
};

function normalizeProvidedNames(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === "string") return compact(value, 120);
      if (value && typeof value === "object") {
        return compact(value.name || value.character_name || value.location_name, 120);
      }
      return "";
    })
    .filter(Boolean);
}

const selectedByName = (items = [], names = []) => {
  if (!Array.isArray(items) || !Array.isArray(names)) return [];
  const wanted = new Set(names.map(normalizeLookupName).filter(Boolean));
  return items.filter(item => wanted.has(normalizeLookupName(item?.name)));
};

function inferShotCharactersFromText(shot, characters = []) {
  // Only infer from visual fields — narrative/context fields (p, source_scene, concept, lyrics)
  // frequently name characters who appear in surrounding context but not in the actual frame.
  const text = [
    shot?.image_prompt,
    shot?.prompt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (Array.isArray(characters) ? characters : [])
    .filter(character => {
      const name = normalizeLookupName(character?.name);
      return name && text.includes(name);
    })
    .map(character => character.name);
}

function isExplicitEnsembleShot(shot) {
  const text = [
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (shot?.ensemble === true || shot?.group_shot === true) return true;

  return [
    "all characters",
    "entire group",
    "full ensemble",
    "everyone together",
    "the whole group",
    "all of them together",
  ].some(phrase => text.includes(phrase));
}

function isLikelyEnvironmentOnlyShot(shot, inferredCharacters = []) {
  if (Array.isArray(inferredCharacters) && inferredCharacters.length > 0) return false;

  const text = [
    shot?.n,
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const explicitNoLeadCues = [
    "no character",
    "no characters",
    "without character",
    "without characters",
    "without main character",
    "no lead character",
    "empty frame",
    "location only",
    "set only",
    "b-roll",
  ];
  if (explicitNoLeadCues.some(phrase => text.includes(phrase))) return true;

  const environmentCues = [
    "establishing shot",
    "establishing",
    "atmosphere shot",
    "environment shot",
    "wide environment",
    "street atmosphere",
    "location atmosphere",
    "set atmosphere",
  ];

  return environmentCues.some(phrase => text.includes(phrase));
}

function extractBackgroundGroups(shot) {
  const explicit = []
    .concat(shot?.background_group ?? [])
    .concat(shot?.background_groups ?? [])
    .concat(shot?.extras ?? [])
    .concat(shot?.supporting_cast ?? [])
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map(value => String(value).trim());

  const text = [
    shot?.p,
    shot?.image_prompt,
    shot?.prompt,
    shot?.source_scene,
    shot?.concept,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const inferred = [];
  const knownGroups = [
    "friends",
    "gang",
    "crew",
    "classmates",
    "party crowd",
    "dancers",
    "villagers",
    "bar patrons",
    "club crowd",
    "wedding guests",
    "students",
    "office staff",
  ];

  for (const group of knownGroups) {
    if (text.includes(group)) inferred.push(group);
  }

  const seen = new Set();
  return [...explicit, ...inferred].filter(group => {
    const normalized = normalizeLookupName(group);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function resolveShotAssets(shot, projectState) {
  const characters = projectState?.characters || [];
  const locations = projectState?.locations || [];
  const explicitShotCharacters = normalizeProvidedNames(shot?.characters);
  const inferredCharacters = inferShotCharactersFromText(shot, characters);
  let shotCharacters = [];

  if (explicitShotCharacters.length > 0) {
    shotCharacters = (!isExplicitEnsembleShot(shot) && isLikelyEnvironmentOnlyShot(shot, inferredCharacters))
      ? inferredCharacters
      : explicitShotCharacters;
  } else if (isExplicitEnsembleShot(shot)) {
    shotCharacters = namesFrom(characters);
  } else {
    shotCharacters = inferredCharacters;
  }

  const explicitShotLocations = normalizeProvidedNames(shot?.locations);
  const shotLocations = explicitShotLocations.length ? explicitShotLocations : namesFrom(locations);
  const matchedCharacters = selectedByName(characters, shotCharacters);
  const matchedLocations = selectedByName(locations, shotLocations);

  return {
    characters,
    locations,
    shotCharacters,
    shotLocations,
    matchedCharacters,
    matchedLocations,
  };
}

function buildReferenceContext(referenceImages, charLabelMap = new Map()) {
  if (!referenceImages.length) return "No visual reference images attached.";

  const characterAndWardrobeRefs = referenceImages
    .map((ref, i) => ({ ref, number: i + 1 }))
    .filter(({ ref }) => ref.kind === "character" || ref.kind === "wardrobe");
  const locationRefs = referenceImages
    .map((ref, i) => ({ ref, number: i + 1 }))
    .filter(({ ref }) => ref.kind === "location");
  const continuityRefs = referenceImages
    .map((ref, i) => ({ ref, number: i + 1 }))
    .filter(({ ref }) => ref.kind === "continuity");

  const charImageNumbers = characterAndWardrobeRefs.map(r => r.number);
  const locImageNumbers = locationRefs.map(r => r.number);
  const continuityImageNumbers = continuityRefs.map(r => r.number);

  const manifestLines = [];
  if (charImageNumbers.length) {
    manifestLines.push(`CHARACTER + OUTFIT IDENTITY — Image${charImageNumbers.length > 1 ? "s" : ""} ${charImageNumbers.join(", ")}: use ONLY these for main character faces, bodies, clothing, and accessories.`);
  }
  if (locImageNumbers.length) {
    manifestLines.push(`LOCATION ENVIRONMENT — Image${locImageNumbers.length > 1 ? "s" : ""} ${locImageNumbers.join(", ")}: use ONLY these for architecture, set, materials, lighting, and atmosphere. ANY people visible inside these images are irrelevant production extras — NEVER copy their faces, hair, skin tone, or clothing to the main characters.`);
  }
  if (continuityImageNumbers.length) {
    manifestLines.push(`CONTINUITY — Image ${continuityImageNumbers.join(", ")}: match colour grade and lighting ONLY. Do not copy characters or composition.`);
  }

  const imageLines = referenceImages.map((reference, index) => {
    const number = index + 1;
    // Use anonymous label for character/wardrobe names to prevent celebrity name lookup
    let displayName = reference.name;
    if (reference.kind === "character") {
      displayName = applyCharLabel(reference.name, charLabelMap);
    } else if (reference.kind === "wardrobe") {
      const parts = reference.name.split(" @ ");
      displayName = `${applyCharLabel(parts[0], charLabelMap)}${parts[1] ? ` @ ${parts[1]}` : ""}`;
    }

    const base = `  Image ${number} [${reference.kind.toUpperCase()}] "${displayName}"${reference.label ? ` — ${reference.label}` : ""}`;
    if (reference.kind === "character") {
      return `${base}\n    → COPY from this image: exact face shape, skin tone, eye color, nose, lips, hairline, hair color/style, body proportions, age. This is the authoritative face reference.`;
    }
    if (reference.kind === "wardrobe") {
      return `${base}\n    → COPY from this image: exact outfit color, cut, fabric texture, silhouette, accessories, footwear, and styling. Apply this clothing to ${displayName.split(" @ ")[0]}. Do not invent or substitute clothing.`;
    }
    if (reference.kind === "location") {
      return `${base}\n    → COPY from this image: architecture, materials, color palette, spatial layout, set dressing, signage, era markers, atmosphere.\n    → IGNORE: any people or faces inside this image — they are background extras with zero identity relevance.`;
    }
    if (reference.kind === "continuity") {
      return `  Image ${number} [CONTINUITY] — Previous shot reference\n    → MATCH from this image: overall colour grade, lighting direction, ambient light colour, shadow depth, and atmosphere.\n    → DO NOT copy: characters, character faces, outfits, or scene composition from this image.\n    → USE ONLY FOR: ensuring this shot feels like it belongs to the same film as the previous shot.`;
    }
    return base;
  });

  return [
    "━━━ ATTACHED REFERENCE IMAGES — MANIFEST ━━━",
    ...manifestLines,
    "",
    "━━━ PER-IMAGE INSTRUCTIONS (images attached in this exact order) ━━━",
    ...imageLines,
    "",
    "━━━ EXTRACTION RULES — NON-NEGOTIABLE ━━━",
    "1. Main character identity (face, hair, skin tone, age, body) comes ONLY from CHARACTER images. Never from LOCATION images.",
    "2. Outfit details come ONLY from WARDROBE images (if present) or CHARACTER images. Never from LOCATION images.",
    "3. Background people visible in any LOCATION image are irrelevant production extras. Do not use them as character identity.",
    "4. CHARACTER images override any text character description when they conflict. Copy the face, not words about a face.",
    "5. WARDROBE images override any text costume description. Copy the outfit, not a summary of it.",
    "6. LOCATION images override any text location description for environment/atmosphere only — not for character identity.",
    "7. Do not copy reference-sheet backdrops, studio white fills, grid lines, borders, crop boxes, labels, or watermarks.",
    "8. When multiple CHARACTER images show the same person, the face close-up or portrait is the primary identity anchor.",
  ].join("\n");
}

function buildScriptSceneContext(scenes = []) {
  if (!Array.isArray(scenes) || !scenes.length) return "No script scenes provided.";
  return scenes
    .slice(0, 24)
    .map(scene => {
      const timing = scene?.start !== undefined || scene?.end !== undefined
        ? `${scene.start ?? "?"}-${scene.end ?? "?"}s`
        : "untimed";
      return `- ${timing}: ${compact(scene?.visual || scene?.description, 260)}${scene?.lyrics ? ` | lyrics: ${compact(scene.lyrics, 140)}` : ""}`;
    })
    .join("\n");
}

function buildWardrobeLockContext(wardrobe, shotCharacters, shotLocations, charLabelMap = new Map()) {
  const items = collectWardrobeItems(wardrobe, shotCharacters, shotLocations);
  if (!items.length) return "";
  return items
    .map(item => {
      const label = applyCharLabel(item.character_name, charLabelMap);
      const description = item.description ? ` — exact outfit description: ${compact(item.description, 420)}` : "";
      const imageNote = item.image_url ? " [WARDROBE REFERENCE IMAGE ATTACHED — use it as the visual authority for this outfit]" : " [no image: use this text description as the outfit lock]";
      const outfitName = compact(item.outfit_name, 140) || "base character wardrobe";
      return `${item.location_name}: ${label} wears "${outfitName}"${description}${imageNote}`;
    })
    .join("\n");
}

function buildLockedShotFacts(shot, projectState, shotCharacters, shotLocations, charLabelMap = new Map()) {
  const wardrobeLock = buildWardrobeLockContext(projectState?.wardrobe, shotCharacters, shotLocations, charLabelMap);
  const timeOfDay = (() => {
    const text = `${shot.beat || ''} ${shot.visual_style || ''} ${shot.source_scene || ''} ${shot.p || ''}`.toLowerCase();
    if (text.includes('night')) return 'night';
    if (text.includes('dusk') || text.includes('sunset')) return 'dusk/sunset';
    if (text.includes('golden hour')) return 'golden hour';
    if (text.includes('dawn') || text.includes('morning')) return 'dawn/morning';
    return null;
  })();
  const facts = [
    shot.source_scene ? `Source script scene: ${compact(shot.source_scene, 360)}` : "",
    shot.concept ? `Shot concept: ${compact(shot.concept, 520)}` : "",
    shot.costumes || shot.costume || shot.wardrobe ? `Costume/wardrobe lock: ${compact(shot.costumes || shot.costume || shot.wardrobe, 520)}` : "",
    wardrobeLock ? `Wardrobe by location lock: ${wardrobeLock}` : "",
    shot.continuity || shot.required_continuity || shot.continuity_notes ? `Continuity lock: ${compact(shot.continuity || shot.required_continuity || shot.continuity_notes, 700)}` : "",
    timeOfDay ? `Time of day: ${timeOfDay} — use location references that match this lighting condition` : "",
  ].filter(Boolean);
  const fallback = "- Use the shot prompt, approved script, named characters, base character reference outfits, and locations as locked facts. Blank wardrobe rows are not absence notes.";
  return facts.length ? facts.map(fact => `- ${fact}`).join("\n") : fallback;
}

function selectImagePrompt(shot, promptOverride) {
  return (
    promptOverride ||
    shot.image_prompt ||
    shot.still_prompt ||
    shot.frame_prompt ||
    shot.keyframe_prompt ||
    shot.p ||
    shot.prompt
  );
}

function buildShotDetailContext(shot) {
  const videoPrompt = shot.video_prompt || shot.motion_prompt || shot.clip_prompt;
  const details = [
    videoPrompt ? `VIDEO CLIP THIS IMAGE ANCHORS:\n${compact(videoPrompt, 2400)}\nThis still frame is the first frame (t=0.00) of the above clip. The video model will use it as the source anchor and begin motion from this exact position. Camera setup, environment layers, character poses, and lighting must match the [00:00.00-...] beat of the video prompt exactly. Do not choose a different moment.` : "",
    shot.visual_style || shot.style || shot.look ? `Visual style: ${compact(shot.visual_style || shot.style || shot.look, 900)}` : "",
    shot.negative_constraints || shot.constraints || shot.avoid ? `Avoid/constraints: ${compact(shot.negative_constraints || shot.constraints || shot.avoid, 1000)}` : "",
    !videoPrompt && (shot.action_timing || shot.timing || shot.actionTiming) ? "Motion timing exists for the later video clip; freeze the opening position from the first beat and do not render timing text, motion trails, or sequential action." : "",
  ].filter(Boolean);

  if (!details.length) {
    return "No separate still-frame detail fields provided; infer a rich still composition from the image prompt, master shot brief, and locked context. The image will be used as the first frame of a video clip.";
  }

  return details.map(detail => `- ${detail}`).join("\n");
}

function buildCharacterLabelMap(shotCharacters) {
  const map = new Map();
  (Array.isArray(shotCharacters) ? shotCharacters : []).forEach((name, index) => {
    const normalized = normalizeLookupName(name);
    if (normalized) map.set(normalized, `CHAR_${String.fromCharCode(65 + index)}`);
  });
  return map;
}

function applyCharLabel(name, charLabelMap) {
  return charLabelMap.get(normalizeLookupName(name)) || name;
}

function buildCharacterImageCrossRef(referenceImages, shotCharacters, charLabelMap = new Map()) {
  const lines = [];
  shotCharacters.forEach(characterName => {
    const normalizedName = normalizeLookupName(characterName);
    const label = applyCharLabel(characterName, charLabelMap);
    const charRefs = referenceImages
      .map((ref, index) => ({ ref, number: index + 1 }))
      .filter(({ ref }) => ref.kind === "character" && normalizeLookupName(ref.name) === normalizedName);
    const wardrobeRefs = referenceImages
      .map((ref, index) => ({ ref, number: index + 1 }))
      .filter(({ ref }) => ref.kind === "wardrobe" && normalizeLookupName(ref.name.split(" @ ")[0]) === normalizedName);
    if (charRefs.length)
      lines.push(`IDENTITY LOCK for ${label}: copy face from Image${charRefs.length > 1 ? "s" : ""} ${charRefs.map(r => r.number).join(", ")}`);
    if (wardrobeRefs.length)
      lines.push(`OUTFIT LOCK for ${label}: copy clothing from Image${wardrobeRefs.length > 1 ? "s" : ""} ${wardrobeRefs.map(r => r.number).join(", ")}`);
  });
  return lines.join("\n");
}

function buildLocationImageCrossRef(referenceImages, shotLocations) {
  const lines = [];
  shotLocations.forEach(locationName => {
    const normalizedName = normalizeLookupName(locationName);
    const locRefs = referenceImages
      .map((ref, index) => ({ ref, number: index + 1 }))
      .filter(({ ref }) => ref.kind === "location" && normalizeLookupName(ref.name) === normalizedName);
    if (locRefs.length)
      lines.push(`ENVIRONMENT LOCK for ${locationName}: copy architecture and atmosphere from Image${locRefs.length > 1 ? "s" : ""} ${locRefs.map(r => r.number).join(", ")}`);
  });
  return lines.join("\n");
}

function buildBackgroundGroupContext(shot, projectState) {
  const activeGroups = extractBackgroundGroups(shot);
  if (!activeGroups.length) return "No recurring background group required.";

  const memory = projectState?.background_groups || {};
  const memoryEntries = Object.entries(memory).map(([key, value]) => ({
    key,
    normalized: normalizeLookupName(key),
    profile: value,
  }));

  const lines = activeGroups.map(group => {
    const key = String(group).trim();
    const normalized = normalizeLookupName(key);
    const directProfile = memory[key] || memory[key.toLowerCase()];
    const entryMatch = memoryEntries.find(entry => entry.normalized === normalized)?.profile;
    const profile = directProfile || entryMatch || null;

    if (!profile || typeof profile !== "object") {
      return `- ${key}: recurring social group, keep casting and styling broadly consistent across scenes, but visually secondary to the leads.`;
    }

    return `- ${key}: ${profile.count_range || "small group"}, ${profile.gender_mix || "mixed gender"}, ${profile.age_range || "young adults"}, ${profile.style_summary || "cohesive everyday styling"}, ${profile.ethnicity_note || "consistent social-group appearance"}, ${profile.continuity_note || "recurs across scenes as the same social circle"}`;
  });

  return [
    "Use background extras only if the shot naturally requires them.",
    "",
    "Active recurring background groups in this shot:",
    ...lines,
    "",
    "Rules for background groups:",
    "1. Background groups are NOT the main subject unless explicitly stated.",
    "2. Keep them visually subordinate to named main characters.",
    "3. Maintain approximate count, age vibe, styling, and social identity across shots.",
    "4. Do NOT make background extras look like the named lead characters.",
    "5. Do NOT copy faces from location references.",
    "6. If a recurring group appears again, they should feel like the same social circle, but not require exact face-perfect identity lock.",
    "7. Use natural variation within the same group identity, not random unrelated people.",
    "8. If no active background group is specified, keep extras minimal or omit them.",
  ].join("\n");
}

function buildPrompt({ shot, projectState, promptOverride, shotAssets = null, referenceImages = [] }) {
  const {
    shotCharacters,
    shotLocations,
    matchedCharacters,
    matchedLocations,
  } = shotAssets || resolveShotAssets(shot, projectState);

  // Map real character names → anonymous labels (CHAR_A, CHAR_B…) to prevent celebrity name lookup.
  // The image model must NEVER see the real character name — only the label and the reference images.
  const charLabelMap = buildCharacterLabelMap(shotCharacters);

  const anonymousCharacterList = shotCharacters.map(n => applyCharLabel(n, charLabelMap)).join(', ') || 'No visible character required';

  const characterContext = matchedCharacters.map(character => {
    const label = applyCharLabel(character.name, charLabelMap);
    const costumeText = character.costume ? ` Costume/wardrobe: ${compact(character.costume, 260)}` : '';
    return `- ${label}: ${compact(character.visual_prompt || character.description || character.role, 450)}${costumeText}`;
  }).join('\n');

  const locationContext = matchedLocations.map(location => (
    `- ${location.name}: ${compact(location.visual_prompt || location.description, 450)}`
  )).join('\n');

  const shotPrompt = rawShotText(
    selectImagePrompt(shot, promptOverride),
    5600,
    'Photorealistic still frame matching the shot title and project context.'
  );
  const hasAnchor = matchedCharacters.some((character) => (
    character?.anchor_image_url && /^https?:\/\//i.test(character.anchor_image_url)
  ));
  const openingInstruction = hasAnchor
    ? `You are editing and adapting a character anchor frame for a specific music video shot.
You have 3-4 reference images attached (in order):
- Image 1 is the CHARACTER ANCHOR: the definitive identity lock for this character.
  PRESERVE EXACTLY: face shape, skin tone, eye colour, hair colour/style, nose, lips,
  body proportions, and outfit details. These must be IDENTICAL to Image 1 in the output.
- Image 2 (if present) is the WARDROBE reference: copy exact clothing details.
- Image 3 (if present) is the LOCATION reference: use for environment, architecture,
  atmosphere, and background only. NEVER copy faces from this image.
- Image 4 (if present) is the PREVIOUS SHOT continuity reference: match colour grade
  and lighting ONLY.

You are NOT generating from scratch. You are placing this specific character (from
Image 1) into the shot described below, while preserving their identity completely.`
    : `Generate one raw 16:9 source frame for a later music video edit.
This is not a poster, title card, collage, transition frame, or finished music-video effect.
The image must be native widescreen 16:9 with no vertical, square, letterboxed, pillarboxed, split-screen, collage, or bordered framing.`;
  const safeCamera = rawShotText(shot.camera, 300, 'plain 16:9 source-footage framing');
  const safeMovement = rawShotText(shot.movement, 300, 'clear simple motion direction');

  return `
${openingInstruction}

SHOT TITLE:
${shot.n}

STILL FRAME PROMPT:
${shotPrompt}

SHOT DETAIL FIELDS:
${buildShotDetailContext(shot)}

NONVISUAL TIMING AND VOCAL CONTEXT:
${shot.start ?? 'unknown'}s to ${shot.end ?? 'unknown'}s, duration ${shot.duration || 5}s
Lyrics: ${compact(shot.lyrics || '', 500)}
Timed words: ${Array.isArray(shot.words) ? shot.words.map(word => `${word.word}(${word.start ?? '?'}-${word.end ?? '?'})`).join(', ') : 'none'}
Use this only for mood and story placement. Do not render lyrics, subtitles, speech, sound, time markers, or sequential timing in the image.

PROJECT STORY AND SCRIPT LOCKS:
Title: ${projectState?.script?.title || 'Untitled music video'}
Mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 500)}
Storyline/concept: ${compact(projectState?.script?.storyline || projectState?.analysis?.summary || projectState?.analysis?.theme, 900)}
Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 360)}
Script scenes:
${buildScriptSceneContext(projectState?.script?.scenes)}

SHOT NON-NEGOTIABLES:
${buildLockedShotFacts(shot, projectState, shotCharacters, shotLocations, charLabelMap)}

CHARACTER CONTINUITY:
Characters in this shot are referred to by anonymous production labels below. These labels carry no real-world name association. Do NOT look up any label or associate it with any celebrity, athlete, politician, actor, musician, or public figure. Appearance comes ONLY from the CHARACTER reference images and description text.
Use only these characters when characters are visible:
${anonymousCharacterList}
${characterContext || 'No character visual reference text provided.'}
${referenceImages.length ? buildCharacterImageCrossRef(referenceImages, shotCharacters, charLabelMap) : ''}
Only the named shot characters listed in this shot may be rendered as identifiable foreground or midground characters.
Characters not listed for this shot must NOT appear as recognisable people.
If the scene includes extras, they must be generic or belong only to the active background groups for this shot.
Never import characters from other scenes just because reference images exist elsewhere in the project.
If zero named characters are assigned to this shot, do not invent a lead character.

BACKGROUND GROUP CONTINUITY:
${buildBackgroundGroupContext(shot, projectState)}

LOCATION CONTINUITY:
Use only these named locations/sets:
${shotLocations.join(', ') || 'No specific location required'}
${locationContext || 'No location visual reference text provided.'}
${referenceImages.length ? buildLocationImageCrossRef(referenceImages, shotLocations) : ''}

ATTACHED VISUAL REFERENCES:
${buildReferenceContext(referenceImages, charLabelMap)}

CAMERA AND STYLE:
- Shot size: ${shot.shot_size || 'plain source-footage framing'}
- Camera: ${safeCamera}
- Movement implied by still: ${safeMovement}
- Story beat: ${shot.beat || 'match the shot prompt'}
- Overall project mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 500)}
- Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 300)}

${buildStyleBibleContext(projectState?.style_bible)}

Still-frame rules:
1. Output exactly one photorealistic raw source frame. No text, captions, labels, watermarks, borders, UI, split panels, title cards, black bars, wipes, or transition devices.
2. Treat the approved script, shot concept, named characters, explicit wardrobe-by-location overrides, costume/outfit images, base character reference outfits, and named locations as non-negotiable production locks. Do not rename, redesign, replace, merge, or contradict them.
3. Preserve character and location continuity from the provided context and attached reference images. When text and reference images disagree, follow the attached reference images.
4. CHARACTER IDENTITY — CRITICAL: Main characters' faces, skin tone, hair, and body must come ONLY from CHARACTER and WARDROBE reference images. Any people visible inside LOCATION reference images are irrelevant background extras — do NOT use them as the basis for any main character's appearance. This is the single most common generation error and must be treated as a hard, inviolable constraint.
5. Make the frame visually rich and specific: foreground, midground, background, props, texture, clothing fabric, facial expression, body posture, environment geography, and practical lighting must all feel intentionally designed.
6. This frame is the first frame (t=0.00) of the video clip described in SHOT DETAIL FIELDS. The video model receives this image as its source anchor and generates motion starting from it. If a video prompt is provided, derive this frame from the [00:00.00-...] beat only — same camera setup, same character position, same lighting. A frame that contradicts the video prompt's opening beat will cause the video model to deviate immediately.
7. If the still-frame prompt is short, expand internally using the locked context instead of generating a generic image.
8. Do not invent extra main characters unless the shot clearly needs background extras.
9. Keep the main subject inside a 16:9 center-safe composition so the follow-up video generation and final render do not crop faces or bodies awkwardly.
10. Do not frame a close-up mouth singing a lyric; use performance posture, gesture, profile, silhouette, dance, reaction, or atmosphere instead.
11. Keep the tone grounded, natural, and serious unless the user explicitly requested a different tone.
12. Ignore video-only instructions such as clip duration, dialogue, sound design, bracketed action timing, camera motion over time, or "the video should last". Freeze the single most cinematic moment.
13. Only render named main characters that are explicitly assigned to this shot. Do not include any other project characters unless this is an explicit ensemble shot.
14. If background extras are needed, use only the declared recurring background groups for this shot or generic non-hero extras.
15. Never turn background extras into lookalikes of the lead characters.
`;
}

export async function POST(req) {
  try {
    const {
      projectId,
      shot,
      shotIndex = 0,
      projectState = {},
      promptOverride,
      model,
      previousShotImageUrl = null,
    } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    const selectedImagePrompt = selectImagePrompt(normalizedShot, promptOverride);
    const selectedModel = resolveImageModelOption(model || process.env.GOOGLE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
    const shotAssets = resolveShotAssets(normalizedShot, projectState);
    const safeMatchedCharacters = shotAssets.matchedCharacters.filter(character =>
      shotAssets.shotCharacters.some(
        shotName => normalizeLookupName(shotName) === normalizeLookupName(character.name)
      )
    );
    const safeShotAssets = {
      ...shotAssets,
      matchedCharacters: safeMatchedCharacters,
    };

    console.log("Shot character resolution", {
      shotIndex,
      shotTitle: normalizedShot?.n,
      explicitShotCharacters: normalizedShot?.characters || [],
      resolvedShotCharacters: shotAssets.shotCharacters,
      matchedCharacters: shotAssets.matchedCharacters.map(c => c.name),
      backgroundGroups: extractBackgroundGroups(normalizedShot),
    });

    const referenceCandidates = collectFocusedReferenceImages(
      safeMatchedCharacters,
      shotAssets.matchedLocations,
      projectState?.wardrobe,
      shotAssets.shotCharacters,
      shotAssets.shotLocations
    );
    let referenceImages = selectedModel.provider === IMAGE_MODEL_PROVIDER_BYTEDANCE
      ? []
      : await loadReferenceImages(referenceCandidates, shotIndex);

    if (selectedModel.provider !== IMAGE_MODEL_PROVIDER_BYTEDANCE && previousShotImageUrl && /^https?:\/\//i.test(previousShotImageUrl)) {
      const continuityReference = {
        kind: "continuity",
        name: "Previous shot",
        label: "Continuity reference — match colour grade and lighting to this frame",
        url: previousShotImageUrl,
      };
      const continuityImages = await loadReferenceImages([continuityReference], shotIndex);
      if (continuityImages.length) {
        // Continuity reference must be appended last so it never displaces character identity refs.
        referenceImages = [...referenceImages, ...continuityImages];
      }
    }
    const prompt = buildPrompt({
      shot: normalizedShot,
      projectState,
      promptOverride,
      shotAssets: safeShotAssets,
      referenceImages,
    });
    let imageGeneration = selectedModel.provider === IMAGE_MODEL_PROVIDER_BYTEDANCE
      ? await generateByteDanceImage({ prompt, modelName: selectedModel.value, shotIndex })
      : await generateBestCandidate({ prompt, modelName: selectedModel.value, shotIndex, referenceImages });
    let generatedImage = imageGeneration.result;

    if (selectedModel.provider !== IMAGE_MODEL_PROVIDER_BYTEDANCE) {
      const hasAnchor = safeMatchedCharacters.some((character) => (
        character?.anchor_image_url && /^https?:\/\//i.test(character.anchor_image_url)
      ));
      const charWardrobeRefs = referenceImages.filter((reference) => (
        reference.kind === "character" || reference.kind === "wardrobe"
      ));

      if (hasAnchor && charWardrobeRefs.length) {
        const qcResult = await qualityCheckImage(
          generatedImage.imageBase64,
          generatedImage.mimeType,
          charWardrobeRefs
        );

        if (!qcResult.pass) {
          const anchorRef = referenceImages.find((reference) => reference.kind === "character");
          if (anchorRef) {
            try {
              const repairPrompt = `You are correcting a generated image that failed character identity QC.

The FIRST attached image is the approved character anchor — the correct face, skin tone,
hair, and outfit for this character.
The SECOND attached image is the generated shot that needs correction.

FIX ONLY: face shape, skin tone, hair colour/style, eye colour, and outfit details
to exactly match Image 1 (the anchor).
PRESERVE: all framing, composition, background, environment, lighting, colour grade,
and camera angle from Image 2 (the generated shot).

Output the corrected frame as a native 16:9 photorealistic image.
Do not change anything except what is needed to fix character identity.`;

              const repairGeneration = await generateGoogleImage({
                prompt: repairPrompt,
                modelName: selectedModel.value,
                shotIndex,
                referenceImages: [
                  anchorRef,
                  {
                    kind: "generated",
                    name: "Failed shot",
                    label: "Generated shot to repair",
                    mimeType: generatedImage.mimeType || "image/png",
                    imageBase64: generatedImage.imageBase64,
                  },
                ],
              });

              const repairQcResult = await qualityCheckImage(
                repairGeneration.result.imageBase64,
                repairGeneration.result.mimeType,
                charWardrobeRefs
              );

              if (repairQcResult.pass) {
                imageGeneration = repairGeneration;
                generatedImage = repairGeneration.result;
              }
            } catch (repairError) {
              console.warn(`Shot ${shotIndex + 1} repair pass failed:`, serializeError(repairError));
            }
          }
        }
      }
    }

    const extension = generatedImage.mimeType.includes("jpeg") || generatedImage.mimeType.includes("jpg") ? "jpg" : "png";
    const storagePath = `${projectId}/images/shot-${String(shotIndex + 1).padStart(3, "0")}-${Date.now()}.${extension}`;
    const supabase = createAdminClient();
    const buffer = Buffer.from(generatedImage.imageBase64, "base64");
    generatedImage = null;

    await withRetry(async () => {
      const { error: uploadError } = await withTimeout(
        () => supabase.storage
          .from("assets")
          .upload(storagePath, buffer, {
            contentType: extension === "jpg" ? "image/jpeg" : "image/png",
            upsert: true,
          }),
        STORAGE_UPLOAD_TIMEOUT_MS,
        "Supabase image upload"
      );

      if (uploadError) throw uploadError;
    }, {
      label: `Shot ${shotIndex + 1} image upload`,
      attempts: 2,
      baseDelayMs: 700,
    });

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      image_url: publicUrl,
      image_path: storagePath,
      shot: {
        ...normalizedShot,
        p: normalizedShot.p,
        image_url: publicUrl,
        image_path: storagePath,
        image_prompt: compact(selectedImagePrompt, 5600),
        image_model: imageGeneration.model,
        resolved_characters: safeShotAssets.shotCharacters,
        resolved_locations: safeShotAssets.shotLocations,
        matched_character_names: safeMatchedCharacters.map((character) => character.name),
        background_groups: extractBackgroundGroups(normalizedShot),
        image_reference_count: referenceImages.length,
        image_reference_names: referenceImages.map(reference => `${reference.kind}:${reference.name}:${reference.label}`),
        image_generated_at: new Date().toISOString(),
        image_error: null,
      },
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error("Shot Image Generation API Error:", serialized);
    return NextResponse.json(
      {
        error: serialized.message,
        retryable: serialized.retryable,
        status: serialized.status,
      },
      { status: serialized.retryable ? 503 : 500 }
    );
  }
}
