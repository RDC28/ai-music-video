import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { createAdminClient } from "@/utils/supabase-admin";
import {
  getFallbackModels,
  runWithModelFallback,
  VIDEO_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODEL_PROVIDER_SEEDANCE,
  normalizeVideoDurationForModel,
  resolveVideoModelOption,
} from "@/utils/generationModels";
import { normalizeShot } from "@/utils/shotList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

const ai = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const MAX_SUBMIT_RETRIES = 3;
const MAX_POLL_RETRIES = 4;
const VIDEO_SUBMIT_TIMEOUT_MS = 65000;
const IMAGE_FETCH_TIMEOUT_MS = 25000;
const VIDEO_OPERATION_TIMEOUT_MS = Number(process.env.GOOGLE_VIDEO_TIMEOUT_MS || 540000);
const STORAGE_UPLOAD_TIMEOUT_MS = 60000;
const SOURCE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const SEEDANCE_API_KEY_ENV_NAMES = ["BYTEDANCE_API_KEY", "SEEDANCE_API_KEY", "ARK_API_KEY"];
const SEEDANCE_VIDEO_BASE_URL = (
  process.env.SEEDANCE_VIDEO_BASE_URL ||
  process.env.BYTEDANCE_VIDEO_BASE_URL ||
  "https://seedanceapi.org/v2"
).replace(/\/+$/, "");
const TARGET_ASPECT_RATIO = 16 / 9;
const ASPECT_RATIO_TOLERANCE = 0.08;

const compact = (value, maxLength = 900) => {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const RAW_CLIP_BLOCKED_PHRASES = /\b(?:smash cut|match cut|jump cut|cut to black|cut to|fade in|fade out|fade to black|dissolve|iris wipe|wipe|transition|blackout|title card|montage|split screen|curtain reveal|curtain opens?|opening curtain|stage curtain|drapes?|black wall|black bars|letterbox|pillarbox|matte box|matte boxes|lens cap pass|camera passes through darkness|object passes close to camera)\b/gi;

const rawClipText = (value, maxLength = 900, fallback = "") => (
  compact(value, maxLength)
    .replace(RAW_CLIP_BLOCKED_PHRASES, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim() || fallback
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

function isRetryableError(error) {
  const status = Number(getErrorStatus(error));
  const message = String(error?.message || "").toLowerCase();

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
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("overloaded") ||
    message.includes("unavailable") ||
    message.includes("network") ||
    message.includes("try again")
  );
}

function serializeError(error) {
  return {
    message: error?.message || "Unknown video generation error",
    status: getErrorStatus(error) || null,
    retryable: isRetryableError(error),
  };
}

function shouldFallbackVideoModel(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("still processing")) return false;
  return isRetryableError(error);
}

async function withTimeout(promiseFactory, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
      err.retryable = true;
      err.status = 408;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(operation, { label, attempts, baseDelayMs }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      console.warn(`${label} failed on attempt ${attempt}/${attempts}:`, serializeError(error));

      if (!retryable || attempt === attempts) break;

      const jitter = Math.floor(Math.random() * 650);
      const backoff = baseDelayMs * (2 ** (attempt - 1)) + jitter;
      await sleep(backoff);
    }
  }

  throw lastError;
}

const namesFrom = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items.map(item => item?.name).filter(Boolean);
};

const selectedByName = (items = [], names = []) => {
  if (!Array.isArray(items) || !Array.isArray(names)) return [];
  const wanted = new Set(names.map(name => String(name).toLowerCase()));
  return items.filter(item => wanted.has(String(item?.name || "").toLowerCase()));
};

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

function describeReferenceSet(items = [], fallbackLabel, charLabelMap = new Map()) {
  if (!Array.isArray(items) || !items.length) return "";
  const isCharacter = String(fallbackLabel || "").toLowerCase().includes("character");
  const extractionHint = isCharacter
    ? "COPY the face, hair, skin tone, body proportions, age, and any visible clothing exactly from these reference views. These are the ONLY valid sources for character identity."
    : "COPY the architecture, materials, color palette, spatial layout, set dressing, and environmental atmosphere from these views. IGNORE any people visible inside these location images — they are irrelevant background extras with zero identity relevance to the main characters.";
  return items
    .map(item => {
      const refs = Array.isArray(item?.images)
        ? item.images
            .map((image, index) => {
              const label = typeof image === "object" && image
                ? image.label || image.name || `Reference ${index + 1}`
                : `Reference ${index + 1}`;
              return compact(label, 70);
            })
            .filter(Boolean)
            .slice(0, 5)
        : [];
      if (!refs.length) return "";
      // Use anonymous label for character names to prevent celebrity lookup
      const displayName = isCharacter
        ? applyCharLabel(item?.name || fallbackLabel, charLabelMap)
        : (item?.name || fallbackLabel);
      return `- ${displayName} [${isCharacter ? "CHARACTER IDENTITY" : "LOCATION ENVIRONMENT"}]: approved reference views include ${refs.join(", ")}. ${extractionHint}`;
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeAspectRatio() {
  return "16:9";
}

function normalizeResolution(value, durationSeconds) {
  if (value === "1080p" && durationSeconds === 8) return "1080p";
  return "720p";
}

function buildTimedWords(words) {
  if (!Array.isArray(words) || !words.length) return "none";
  return words
    .slice(0, 80)
    .map(word => `${word.word || word.text || ""}(${word.start ?? "?"}-${word.end ?? "?"})`)
    .join(", ");
}

function buildTranscriptContext(lines) {
  if (!Array.isArray(lines) || !lines.length) return "No transcript lines provided.";
  return lines
    .slice(0, 30)
    .map(line => {
      const timing = line.start !== undefined || line.end !== undefined
        ? `${line.start ?? "?"}-${line.end ?? "?"}s`
        : "untimed";
      return `- ${timing}: ${compact(line.text || line.lyrics || line.line, 240)}`;
    })
    .join("\n");
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
      const imageNote = item.image_url ? " [WARDROBE REFERENCE IMAGE EXISTS — preserve it exactly in this clip]" : " [no image: use this text description as the outfit lock]";
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
    timeOfDay ? `Time of day: ${timeOfDay} — maintain this lighting condition throughout the full clip` : "",
  ].filter(Boolean);
  const fallback = "- Use the shot prompt, approved script, named characters, base character reference outfits, and locations as locked facts. Blank wardrobe rows are not absence notes.";
  return facts.length ? facts.map(fact => `- ${fact}`).join("\n") : fallback;
}

// Parses "[MM:SS.ss-MM:SS.ss]" or "[MM:SS-MM:SS]" style timestamps from action_timing text.
// Returns array of { start, end, body } in seconds.
function parseTimestampBlocks(text) {
  const blocks = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)-(\d+):(\d+(?:\.\d+)?)\]/g;
  let match;
  let lastIndex = 0;
  const parts = [];
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    const start = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
    const end = parseInt(match[3], 10) * 60 + parseFloat(match[4]);
    parts.push({ type: 'ts', start, end, value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}

function formatTimestamp(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

// Re-scales existing timestamps to fit videoDuration, or injects evenly-spaced
// ones if the text has none but contains multiple beat-lines.
function injectRelativeTimestamps(text, videoDuration) {
  if (!text || !videoDuration) return text;
  const parts = parseTimestampBlocks(text);
  const tsParts = parts.filter(p => p.type === 'ts');

  if (tsParts.length > 0) {
    // Find original span and rescale proportionally to videoDuration
    const originalEnd = Math.max(...tsParts.map(p => p.end));
    const originalStart = Math.min(...tsParts.map(p => p.start));
    const originalSpan = originalEnd - originalStart || originalEnd || 1;
    const scale = videoDuration / originalSpan;
    return parts.map(p => {
      if (p.type === 'text') return p.value;
      const newStart = Math.max(0, (p.start - originalStart) * scale);
      const newEnd = Math.min(videoDuration, (p.end - originalStart) * scale);
      return `[${formatTimestamp(newStart)}-${formatTimestamp(newEnd)}]`;
    }).join('');
  }

  // No existing timestamps — detect shot/beat lines and inject evenly-spaced ones
  const lines = text.split('\n');
  const shotLineRe = /^(SHOT\s*\d+|shot\s*\d+|BEAT\s*\d+|\[\d)/i;
  const beatIndices = lines.reduce((acc, line, i) => {
    if (shotLineRe.test(line.trim())) acc.push(i);
    return acc;
  }, []);

  if (beatIndices.length < 2) return text; // Not enough structure to inject

  const interval = videoDuration / beatIndices.length;
  const newLines = [...lines];
  beatIndices.forEach((lineIdx, i) => {
    const start = parseFloat((i * interval).toFixed(2));
    const end = parseFloat(Math.min((i + 1) * interval, videoDuration).toFixed(2));
    newLines[lineIdx] = `[${formatTimestamp(start)}-${formatTimestamp(end)}] ${newLines[lineIdx]}`;
  });
  return newLines.join('\n');
}

function buildShotDetailContext(shot, videoDuration) {
  const rawTiming = shot.action_timing || shot.timing || shot.actionTiming;
  const timedTiming = rawTiming ? injectRelativeTimestamps(rawTiming, videoDuration) : null;
  const details = [
    timedTiming ? `Action timing (timestamps relative to this ${videoDuration}s clip): ${compact(timedTiming, 2000)}` : "",
    shot.visual_style || shot.style || shot.look ? `Visual style: ${compact(shot.visual_style || shot.style || shot.look, 1000)}` : "",
    shot.sound_design || shot.soundDesign || shot.audio_notes ? `Sound/ambience note for visual mood only; do not generate audio: ${compact(shot.sound_design || shot.soundDesign || shot.audio_notes, 700)}` : "",
    shot.negative_constraints || shot.constraints || shot.avoid ? `Avoid/constraints: ${compact(shot.negative_constraints || shot.constraints || shot.avoid, 1200)}` : "",
  ].filter(Boolean);

  if (!details.length) {
    return `No separate action-timing fields provided; infer subtle realistic micro-actions across the full ${videoDuration || 5}s clip and preserve the source frame.`;
  }

  return details.map(detail => `- ${detail}`).join("\n");
}

function selectVideoPrompt(shot, promptOverride) {
  return (
    promptOverride ||
    shot.video_prompt ||
    shot.motion_prompt ||
    shot.clip_prompt ||
    shot.p ||
    shot.prompt
  );
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

function buildPrompt({ shot, projectState, promptOverride, usedSourceImage, videoDuration }) {
  const characters = projectState?.characters || [];
  const locations = projectState?.locations || [];
  const shotCharacters = shot.characters?.length ? shot.characters : namesFrom(characters);
  const shotLocations = shot.locations?.length ? shot.locations : namesFrom(locations);
  const matchedCharacters = selectedByName(characters, shotCharacters);
  const matchedLocations = selectedByName(locations, shotLocations);

  // Map real character names → anonymous labels to prevent celebrity name lookup
  const charLabelMap = buildCharacterLabelMap(shotCharacters);

  const anonymousCharacterList = shotCharacters.map(n => applyCharLabel(n, charLabelMap)).join(", ") || "No visible character required";

  const characterContext = matchedCharacters.map(character => {
    const label = applyCharLabel(character.name, charLabelMap);
    const costumeText = character.costume ? ` Costume/wardrobe: ${compact(character.costume, 260)}` : "";
    return `- ${label}: ${compact(character.visual_prompt || character.description || character.role, 500)}${costumeText}`;
  }).join("\n");

  const locationContext = matchedLocations.map(location => (
    `- ${location.name}: ${compact(location.visual_prompt || location.description, 500)}`
  )).join("\n");
  const characterReferenceContext = describeReferenceSet(matchedCharacters, "Character", charLabelMap);
  const locationReferenceContext = describeReferenceSet(matchedLocations, "Location", charLabelMap);

  const shotAction = rawClipText(
    selectVideoPrompt(shot, promptOverride),
    6400,
    "Raw uninterrupted source-footage shot matching the shot title and project context."
  );
  const safeCamera = rawClipText(shot.camera, 300, "plain 16:9 source-footage framing");
  const safeMovement = rawClipText(shot.movement, 300, "simple stable camera movement");
  const safeImagePrompt = rawClipText(shot.image_prompt, 1600);

  return `
Generate one raw source-footage video shot for a music video editor.
This is not the final music video edit. The user will add cuts, transitions, stylization, titles, overlays, and effects later.
The clip must be native 16:9 widescreen with normal full-frame composition. Do not create vertical, square, letterboxed, pillarboxed, split-screen, bordered, framed, matted, or wall-like compositions.

SHOT TITLE:
${shot.n}

RAW SOURCE SHOT ACTION:
${shotAction}

SHOT DETAIL FIELDS:
${buildShotDetailContext(shot, videoDuration)}

TIMING AND VOCAL CUE:
Song time: ${shot.start ?? "unknown"}s to ${shot.end ?? "unknown"}s, planned shot duration ${shot.duration || 5}s
Lyrics: ${compact(shot.lyrics || "", 650)}
Timed words: ${buildTimedWords(shot.words)}
Use the lyric timing only as a timing and emotional cue. This generator is not receiving the song audio, so do not stage exact mouth-to-word lip sync.

PROJECT STORY CONTEXT:
Title: ${projectState?.script?.title || "Untitled music video"}
Mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 650)}
Storyline: ${compact(projectState?.script?.storyline || projectState?.analysis?.summary, 900)}
Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 400)}
BPM: ${projectState?.analysis?.bpm || "unknown"}
Script scenes:
${buildScriptSceneContext(projectState?.script?.scenes)}

VOCAL TRANSCRIPT CONTEXT:
${buildTranscriptContext(projectState?.transcript)}

SHOT NON-NEGOTIABLES:
${buildLockedShotFacts(shot, projectState, shotCharacters, shotLocations, charLabelMap)}

CHARACTER CONTINUITY:
Characters are referred to by anonymous production labels below. These labels carry no real-world name association. Do NOT look up any label or associate it with any celebrity, athlete, politician, actor, musician, or public figure. Appearance comes ONLY from the CHARACTER reference sets and description text.
Use only these characters when characters are visible:
${anonymousCharacterList}
${characterContext || "No character visual reference text provided."}

LOCATION CONTINUITY:
Use only these named locations/sets:
${shotLocations.join(", ") || "No specific location required"}
${locationContext || "No location visual reference text provided."}

APPROVED VISUAL REFERENCE SETS:
${characterReferenceContext || locationReferenceContext ? [characterReferenceContext, locationReferenceContext].filter(Boolean).join("\n") : "No approved character/location reference sets listed."}
When a source image is provided, treat it as the approved first frame. Preserve subject identity, clothing, location, and lighting palette exactly for the full clip duration — the reference sets above confirm what those should look like.

CAMERA, MOTION, AND STYLE:
- Shot size: ${shot.shot_size || "plain source-footage framing"}
- Camera/lens: ${safeCamera}
- Movement: ${safeMovement}
- Story beat: ${shot.beat || "match the shot action and lyric emotion"}
- Still-image continuity prompt: ${safeImagePrompt}
- Source image provided: ${usedSourceImage ? "yes, it has verified native 16:9 dimensions; preserve subject identity, location, lighting, palette, and full-width composition" : "no, infer continuity from the text context and generate native 16:9 from scratch"}

Rules:
1. Output one plain continuous photorealistic source clip. No cuts, no edits, no simulated transitions, no text, no captions, no labels, no watermarks, no borders, no UI, no split screens, no title cards, no matte boxes, no black panels, and no visible transition devices.
2. Treat the approved script, shot concept, named characters, explicit wardrobe-by-location overrides, costume/outfit images from the source frame, base character reference outfits, named locations, and source frame as non-negotiable production locks. Do not rename, redesign, replace, merge, or contradict them.
3. Preserve continuity with the named characters, locations, source image, wardrobe, lighting, lens language, and emotional arc.
4. CHARACTER IDENTITY — CRITICAL: Main character faces, skin tone, hair, and body must match the CHARACTER reference set only. Any people visible inside LOCATION reference images are irrelevant background extras. Do NOT carry their faces, skin tone, hair, or clothing into the main characters at any point in the clip.
5. Make the clip visually rich and grounded: foreground, midground, background, props, texture, clothing fabric, facial expression, body posture, environment geography, and practical lighting must remain readable.
5. Follow action timing when present. The timestamps in the action timing block are relative to this clip's duration (0s to ${videoDuration || 5}s). Stage each beat at exactly the indicated moment, keeping movement subtle, natural, and realistic.
6. Keep camera motion simple, stable, and usable as raw footage. If the prompt says static, locked-off, no zoom, no pan, or no camera movement, obey it exactly for the full clip.
7. Do not invent extra main characters unless the shot explicitly asks for background extras.
8. GENERATE SILENT VIDEO. Do not include sound, ambient noise, dialogue, or music. The video will be layered over a separate audio track.
9. AVOID: black walls, black wipes, black bars, iris wipes, curtains, scene-change transitions, text, subtitles, captions, logo, watermark, title card, UI, split screen, deformed hands, warped face, extra limbs, face morphing, flicker, or bad anatomy.
10. Make the clip ready for the user to edit later: clear first frame, readable action, stable composition, natural depth, and consistent lighting.
11. Start the readable action immediately in the first second. Do not add slow pre-roll, delayed entrances, or empty establishing time before the beat.
12. Avoid close-up visible mouths forming specific lyrics. For singer/rapper shots, use loose performance energy, side/profile angles, silhouette, microphone movement, dance, reactions, or cutaways so imperfect lip sync is not visible.
13. Compose safely for 16:9 center crop with the main subject inside the central safe area for the full clip.
14. Keep the shot as a single scene and camera setup. Do not simulate an edit, wipe, curtain, blackout, lens cap pass, or object passing close to camera as a transition.
15. If any shot text implies a transition, montage, or final edited music-video moment, ignore that part and reinterpret it as plain continuous raw action within the same 16:9 shot.
16. Do not imitate a square photo, album cover, portrait frame, theatrical curtain reveal, stage drape, vignette, or bordered picture-in-picture inside the 16:9 canvas.
17. Keep the tone grounded, natural, and serious unless the user explicitly requested a different tone.
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

function assertWidescreenDimensions(dimensions, label, { retryable = false } = {}) {
  const ratio = dimensions?.height ? dimensions.width / dimensions.height : null;

  if (!ratio || Math.abs(ratio - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
    const actual = dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown dimensions";
    const err = new Error(`${label} must be native 16:9, but got ${actual}.`);
    err.status = 422;
    err.retryable = retryable;
    err.fatal = true;
    throw err;
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: Number(ratio.toFixed(3)),
  };
}

function readMp4BoxHeader(buffer, offset) {
  if (offset + 8 > buffer.length) return null;
  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > buffer.length) return null;
    const largeSize = buffer.readBigUInt64BE(offset + 8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(largeSize);
    headerSize = 16;
  } else if (size === 0) {
    size = buffer.length - offset;
  }

  if (size < headerSize || offset + size > buffer.length) return null;
  return { size, type, headerSize };
}

function parseMp4VideoDimensions(buffer) {
  const stack = [{ start: 0, end: buffer.length }];
  const containerTypes = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

  while (stack.length) {
    const { start, end } = stack.pop();
    let offset = start;

    while (offset < end - 8) {
      const header = readMp4BoxHeader(buffer, offset);
      if (!header) {
        offset += 1;
        continue;
      }

      const contentStart = offset + header.headerSize;
      const boxEnd = offset + header.size;
      if (header.type === "tkhd") {
        const version = buffer[contentStart];
        const widthOffset = contentStart + (version === 1 ? 88 : 76);
        if (widthOffset + 8 <= boxEnd) {
          const width = buffer.readUInt32BE(widthOffset) / 65536;
          const height = buffer.readUInt32BE(widthOffset + 4) / 65536;
          if (width > 0 && height > 0) return { width, height };
        }
      } else if (containerTypes.has(header.type)) {
        stack.push({ start: contentStart, end: boxEnd });
      }

      offset = boxEnd;
    }
  }

  return null;
}

async function fetchSourceImage(imageUrl) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;

  return withTimeout(async () => {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      const err = new Error(`Source image fetch failed with ${response.status}`);
      err.status = response.status;
      err.retryable = response.status >= 500;
      throw err;
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > SOURCE_IMAGE_MAX_BYTES) {
      const err = new Error("Source image is too large for video conditioning");
      err.status = 413;
      err.retryable = false;
      throw err;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > SOURCE_IMAGE_MAX_BYTES) {
      const err = new Error("Source image is too large for video conditioning");
      err.status = 413;
      err.retryable = false;
      throw err;
    }

    const imageBuffer = Buffer.from(arrayBuffer);
    const dimensions = parsePngDimensions(imageBuffer) || parseJpegDimensions(imageBuffer);
    const verifiedDimensions = assertWidescreenDimensions(dimensions, "Source image for video conditioning");

    return {
      imageBytes: imageBuffer.toString("base64"),
      mimeType: inferImageMimeType(imageUrl, response.headers.get("content-type")),
      dimensions: verifiedDimensions,
    };
  }, IMAGE_FETCH_TIMEOUT_MS, "Source image fetch");
}

function formatOperationError(error) {
  if (!error) return "Video operation failed";
  if (typeof error === "string") return error;
  return error.message || error.details || error.status || JSON.stringify(error);
}

function getByteDanceApiKey() {
  return SEEDANCE_API_KEY_ENV_NAMES.map(name => process.env[name]).find(Boolean) || "";
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
    payload.error_message ||
    payload.error?.message ||
    payload.error ||
    payload.message ||
    payload.msg ||
    payload.code ||
    fallback
  );
}

async function pollVideoOperation(initialOperation) {
  let operation = initialOperation;
  let pollDelayMs = 9000;
  const startedAt = Date.now();

  while (!operation.done) {
    if (Date.now() - startedAt > VIDEO_OPERATION_TIMEOUT_MS) {
      const err = new Error("Video generation is still processing. Retry Generate Remaining later to resume this shot.");
      err.status = 408;
      err.retryable = true;
      throw err;
    }

    await sleep(pollDelayMs);
    operation = await withRetry(
      () => ai.operations.getVideosOperation({ operation }),
      {
        label: "Veo operation poll",
        attempts: MAX_POLL_RETRIES,
        baseDelayMs: 1200,
      }
    );
    pollDelayMs = Math.min(18000, pollDelayMs + 1500);
  }

  if (operation.error) {
    const err = new Error(formatOperationError(operation.error));
    err.status = operation.error.code || operation.error.status || 500;
    err.retryable = isRetryableError(err);
    throw err;
  }

  const generatedVideo = operation.response?.generatedVideos?.[0];
  if (!generatedVideo?.video) {
    const filteredReasons = operation.response?.raiMediaFilteredReasons;
    const err = new Error(
      filteredReasons?.length
        ? `Video was filtered: ${filteredReasons.join(", ")}`
        : "Video model completed but returned no video"
    );
    err.status = filteredReasons?.length ? 422 : 502;
    err.retryable = !filteredReasons?.length;
    throw err;
  }

  return operation;
}

async function submitSeedanceTask({ apiKey, modelName, prompt, imageUrl, durationSeconds }) {
  const response = await withRetry(
    () => withTimeout(
      () => fetch(`${SEEDANCE_VIDEO_BASE_URL}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: compact(prompt, 6000),
          duration: durationSeconds,
          model: modelName,
          public: false,
          ...(imageUrl ? { images: [imageUrl] } : { aspect_ratio: "16:9" }),
        }),
      }),
      VIDEO_SUBMIT_TIMEOUT_MS,
      `Seedance video submission (${modelName})`
    ),
    {
      label: `Seedance video submission (${modelName})`,
      attempts: MAX_SUBMIT_RETRIES,
      baseDelayMs: 1800,
    }
  );
  const payload = await readJsonOrText(response);

  if (!response.ok || payload?.code >= 400 || payload?.error) {
    throw createProviderError(providerErrorMessage(payload, `Seedance video submission failed with ${response.status}`), {
      status: response.status || payload?.code || 500,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  const taskId = payload?.data?.task_id || payload?.task_id || payload?.id;
  if (!taskId) {
    throw createProviderError("Seedance video submission did not return a task id", {
      status: 502,
      retryable: true,
    });
  }

  return {
    taskId,
    consumedCredits: payload?.data?.consumed_credits || payload?.consumed_credits || null,
  };
}

async function pollSeedanceTask({ apiKey, taskId }) {
  let pollDelayMs = 9000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= VIDEO_OPERATION_TIMEOUT_MS) {
    await sleep(pollDelayMs);
    const response = await withRetry(
      () => withTimeout(
        () => fetch(`${SEEDANCE_VIDEO_BASE_URL}/status?task_id=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        VIDEO_SUBMIT_TIMEOUT_MS,
        "Seedance video status"
      ),
      {
        label: "Seedance video status",
        attempts: MAX_POLL_RETRIES,
        baseDelayMs: 1400,
      }
    );
    const payload = await readJsonOrText(response);

    if (!response.ok || payload?.code >= 400 || payload?.error) {
      throw createProviderError(providerErrorMessage(payload, `Seedance status failed with ${response.status}`), {
        status: response.status || payload?.code || 500,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const data = payload?.data || payload;
    const status = String(data?.status || "").toUpperCase();
    if (status === "SUCCESS" || status === "COMPLETED" || status === "SUCCEEDED") {
      const videoUrl = Array.isArray(data?.response)
        ? data.response[0]
        : data?.video_url || data?.url || data?.output?.[0];

      if (!videoUrl) {
        throw createProviderError("Seedance completed but returned no video URL", {
          status: 502,
          retryable: true,
        });
      }

      return {
        name: taskId,
        response: {
          generatedVideos: [
            {
              video: {
                uri: videoUrl,
                mimeType: "video/mp4",
              },
            },
          ],
        },
        seedance: data,
      };
    }

    if (status === "FAILED" || status === "ERROR" || status === "CANCELED") {
      throw createProviderError(data?.error_message || "Seedance video generation failed", {
        status: 422,
        retryable: false,
      });
    }

    pollDelayMs = Math.min(18000, pollDelayMs + 1500);
  }

  throw createProviderError("Seedance video generation is still processing. Retry Generate Remaining later to resume this shot.", {
    status: 408,
    retryable: true,
  });
}

async function runSeedanceVideoGeneration({ modelName, prompt, imageUrl, durationSeconds }) {
  const apiKey = getByteDanceApiKey();
  if (!apiKey) {
    throw createProviderError(`Seedance video generation requires ${SEEDANCE_API_KEY_ENV_NAMES.join(", ")}, or select a Veo model. Add the key to .env.local and restart Next.js.`, {
      status: 503,
      retryable: false,
    });
  }

  const submitted = await submitSeedanceTask({
    apiKey,
    modelName,
    prompt,
    imageUrl,
    durationSeconds,
  });
  const operation = await pollSeedanceTask({ apiKey, taskId: submitted.taskId });
  operation.seedance = {
    ...(operation.seedance || {}),
    consumed_credits: operation.seedance?.consumed_credits || submitted.consumedCredits,
  };
  return {
    result: operation,
    model: modelName,
    attempts: [],
  };
}

function videoExtension(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
  return "mp4";
}

async function downloadGeneratedVideo(generatedVideo, tmpPath) {
  const video = generatedVideo?.video;
  if (!video) throw new Error("Generated video payload is empty");

  if (video.videoBytes) {
    await writeFile(tmpPath, Buffer.from(video.videoBytes, "base64"));
    return;
  }

  if (video.uri && /^https?:\/\//i.test(video.uri)) {
    const isGoogleApi = video.uri.includes("generativelanguage.googleapis.com") || video.uri.includes("googleapis.com");
    const authenticatedUrl = isGoogleApi && !video.uri.includes("key=")
      ? `${video.uri}${video.uri.includes("?") ? "&" : "?"}key=${process.env.GOOGLE_AI_API_KEY}`
      : video.uri;

    const response = await withTimeout(
      () => fetch(authenticatedUrl, {
        headers: isGoogleApi ? { "x-goog-api-key": process.env.GOOGLE_AI_API_KEY } : {},
      }),
      60000,
      "Generated video download"
    );

    if (!response.ok) {
      const err = new Error(`Generated video download failed with ${response.status}`);
      err.status = response.status;
      err.retryable = response.status >= 500;
      throw err;
    }
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(arrayBuffer));
    return;
  }

  if (video.uri && !video.uri.startsWith("gs://")) {
    await ai.files.download({ file: video.uri, downloadPath: tmpPath });
    return;
  }

  await ai.files.download({ file: generatedVideo, downloadPath: tmpPath });
}

export async function POST(req) {
  let tmpDir;

  try {
    const {
      projectId,
      shot,
      shotIndex = 0,
      projectState = {},
      promptOverride,
      model,
      durationSeconds,
      resolution,
    } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const selectedModel = resolveVideoModelOption(model || process.env.GOOGLE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL);
    if (selectedModel.provider !== VIDEO_MODEL_PROVIDER_SEEDANCE && !ai) {
      return NextResponse.json({ error: "Clip generation is temporarily unavailable." }, { status: 500 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    const selectedVideoPrompt = selectVideoPrompt(normalizedShot, promptOverride);
    let sourceImage = null;
    let sourceImageDimensions = null;
    try {
      sourceImage = await fetchSourceImage(normalizedShot.image_url);
      sourceImageDimensions = sourceImage?.dimensions || null;
    } catch (error) {
      if (error?.fatal) throw error;
      console.warn(`Shot ${shotIndex + 1} source image could not be used:`, serializeError(error));
    }

    const sourceImageWasUsed = Boolean(sourceImage);
    const requestedDuration = normalizeVideoDurationForModel(
      durationSeconds || normalizedShot.veo_duration_seconds || normalizedShot.duration,
      selectedModel.value
    );

    const prompt = buildPrompt({
      shot: normalizedShot,
      projectState,
      promptOverride,
      usedSourceImage: sourceImageWasUsed,
      videoDuration: requestedDuration,
    });
    const requestConfig = {
      numberOfVideos: 1,
      durationSeconds: requestedDuration,
      aspectRatio: normalizeAspectRatio(),
      resolution: normalizeResolution(resolution, requestedDuration),
    };

    const videoGeneration = selectedModel.provider === VIDEO_MODEL_PROVIDER_SEEDANCE
      ? await runSeedanceVideoGeneration({
          modelName: selectedModel.value,
          prompt,
          imageUrl: sourceImageWasUsed ? normalizedShot.image_url : null,
          durationSeconds: requestedDuration,
        })
      : await runWithModelFallback({
          label: `Shot ${shotIndex + 1} video generation`,
          models: getFallbackModels(selectedModel.value, VIDEO_MODEL_FALLBACKS),
          shouldFallback: shouldFallbackVideoModel,
          operation: async (modelName) => {
            const request = {
              model: modelName,
              prompt,
              config: requestConfig,
            };
            if (sourceImage) {
              request.image = {
                imageBytes: sourceImage.imageBytes,
                mimeType: sourceImage.mimeType,
              };
            }

            const submittedOperation = await withRetry(
              () => withTimeout(
                () => ai.models.generateVideos(request),
                VIDEO_SUBMIT_TIMEOUT_MS,
                `Video model submission (${modelName})`
              ),
              {
                label: `Shot ${shotIndex + 1} video submission (${modelName})`,
                attempts: MAX_SUBMIT_RETRIES,
                baseDelayMs: 1800,
              }
            );

            return pollVideoOperation(submittedOperation);
          },
        });
    sourceImage = null;

    const completedOperation = videoGeneration.result;
    const generatedVideo = completedOperation.response?.generatedVideos?.[0];
    const mimeType = generatedVideo?.video?.mimeType || "video/mp4";
    const extension = videoExtension(mimeType);

    tmpDir = path.join(os.tmpdir(), `ai-music-video-${projectId}-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `shot-${String(shotIndex + 1).padStart(3, "0")}.${extension}`);

    await withRetry(
      () => downloadGeneratedVideo(generatedVideo, tmpPath),
      {
        label: `Shot ${shotIndex + 1} video download`,
        attempts: 2,
        baseDelayMs: 1200,
      }
    );
    if (generatedVideo?.video?.videoBytes) generatedVideo.video.videoBytes = undefined;

    const videoBuffer = await readFile(tmpPath);
    const videoDimensions = assertWidescreenDimensions(
      parseMp4VideoDimensions(videoBuffer),
      `Shot ${shotIndex + 1} generated video`
    );
    const storagePath = `${projectId}/videos/shot-${String(shotIndex + 1).padStart(3, "0")}-${Date.now()}.${extension}`;
    const supabase = createAdminClient();

    await withRetry(
      () => withTimeout(
        async () => {
          const { error: uploadError } = await supabase.storage
            .from("assets")
            .upload(storagePath, videoBuffer, {
              contentType: mimeType,
              upsert: true,
            });

          if (uploadError) throw uploadError;
        },
        STORAGE_UPLOAD_TIMEOUT_MS,
        "Supabase video upload"
      ),
      {
        label: `Shot ${shotIndex + 1} video upload`,
        attempts: 2,
        baseDelayMs: 900,
      }
    );

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      video_url: publicUrl,
      video_path: storagePath,
      video_width: videoDimensions.width,
      video_height: videoDimensions.height,
      video_aspect_ratio: videoDimensions.aspectRatio,
      operation: completedOperation.name,
      shot: {
        ...normalizedShot,
        p: normalizedShot.p,
        video_url: publicUrl,
        video_path: storagePath,
        video_prompt: compact(selectedVideoPrompt, 6400),
        video_model: videoGeneration.model,
        veo_duration_seconds: requestConfig.durationSeconds,
        video_duration_seconds: requestConfig.durationSeconds,
        video_operation: completedOperation.name || null,
        video_source_image_used: sourceImageWasUsed,
        video_source_image_width: sourceImageDimensions?.width || null,
        video_source_image_height: sourceImageDimensions?.height || null,
        video_width: videoDimensions.width,
        video_height: videoDimensions.height,
        video_aspect_ratio: videoDimensions.aspectRatio,
        video_generated_at: new Date().toISOString(),
        video_error: null,
      },
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error("Shot Video Generation API Error:", serialized);
    const status = Number(serialized.status);
    return NextResponse.json(
      {
        error: serialized.message,
        retryable: serialized.retryable,
        status: serialized.status,
      },
      { status: status >= 400 && status <= 599 ? status : (serialized.retryable ? 503 : 500) }
    );
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
