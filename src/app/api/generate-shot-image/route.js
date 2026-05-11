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

async function generateGoogleImage({ prompt, modelName, shotIndex }) {
  if (!genAI) {
    throw createProviderError("Frame generation is temporarily unavailable.", { status: 500 });
  }

  return runWithModelFallback({
    label: `Shot ${shotIndex + 1} image generation`,
    models: getFallbackModels(modelName || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
    operation: async (activeModelName) => withRetry(async () => {
      const result = await withTimeout(
        () => genAI.models.generateContent({
          model: activeModelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
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

const namesFrom = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items.map(item => item?.name).filter(Boolean);
};

const selectedByName = (items = [], names = []) => {
  if (!Array.isArray(items) || !Array.isArray(names)) return [];
  const wanted = new Set(names.map(name => String(name).toLowerCase()));
  return items.filter(item => wanted.has(String(item?.name || '').toLowerCase()));
};

function buildPrompt({ shot, projectState, promptOverride }) {
  const characters = projectState?.characters || [];
  const locations = projectState?.locations || [];
  const shotCharacters = shot.characters?.length ? shot.characters : namesFrom(characters);
  const shotLocations = shot.locations?.length ? shot.locations : namesFrom(locations);
  const matchedCharacters = selectedByName(characters, shotCharacters);
  const matchedLocations = selectedByName(locations, shotLocations);

  const characterContext = matchedCharacters.map(character => (
    `- ${character.name}: ${compact(character.visual_prompt || character.description || character.role, 450)}`
  )).join('\n');

  const locationContext = matchedLocations.map(location => (
    `- ${location.name}: ${compact(location.visual_prompt || location.description, 450)}`
  )).join('\n');

  const shotPrompt = rawShotText(
    promptOverride || shot.p || shot.prompt,
    1800,
    'Raw source frame matching the shot title and project context.'
  );
  const safeCamera = rawShotText(shot.camera, 300, 'plain 16:9 source-footage framing');
  const safeMovement = rawShotText(shot.movement, 300, 'clear simple motion direction');

  return `
Generate one raw 16:9 source frame for a later music video edit.
This is not a poster, title card, collage, transition frame, or finished music-video effect.
The image must be native widescreen 16:9 with no vertical, square, letterboxed, pillarboxed, split-screen, collage, or bordered framing.

SHOT TITLE:
${shot.n}

RAW SOURCE SHOT PROMPT:
${shotPrompt}

TIMING AND VOCAL CUE:
${shot.start ?? 'unknown'}s to ${shot.end ?? 'unknown'}s, duration ${shot.duration || 5}s
Lyrics: ${compact(shot.lyrics || '', 500)}
Timed words: ${Array.isArray(shot.words) ? shot.words.map(word => `${word.word}(${word.start ?? '?'}-${word.end ?? '?'})`).join(', ') : 'none'}

CHARACTER CONTINUITY:
Use only these named characters when characters are visible:
${shotCharacters.join(', ') || 'No visible character required'}
${characterContext || 'No character visual reference text provided.'}

LOCATION CONTINUITY:
Use only these named locations/sets:
${shotLocations.join(', ') || 'No specific location required'}
${locationContext || 'No location visual reference text provided.'}

CAMERA AND STYLE:
- Shot size: ${shot.shot_size || 'plain source-footage framing'}
- Camera: ${safeCamera}
- Movement implied by still: ${safeMovement}
- Story beat: ${shot.beat || 'match the shot prompt'}
- Overall project mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 500)}
- Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 300)}

Rules:
1. Output exactly one photorealistic raw source frame. No text, captions, labels, watermarks, borders, UI, split panels, title cards, black bars, wipes, or transition devices.
2. Preserve character and location continuity from the provided context.
3. Make the frame usable as source footage for a video model: clear subject, readable action, natural depth, and clean lighting.
4. Do not invent extra main characters unless the shot clearly needs background extras.
5. Keep the main subject inside a 16:9 center-safe composition so the follow-up video generation and final render do not crop faces or bodies awkwardly.
6. Do not frame a close-up mouth singing a lyric; use performance posture, gesture, profile, silhouette, dance, reaction, or atmosphere instead.
7. Keep the tone grounded, natural, and serious unless the user explicitly requested a different tone.
`;
}

export async function POST(req) {
  try {
    const { projectId, shot, shotIndex = 0, projectState = {}, promptOverride, model } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    const prompt = buildPrompt({ shot: normalizedShot, projectState, promptOverride });
    const selectedModel = resolveImageModelOption(model || process.env.GOOGLE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
    const imageGeneration = selectedModel.provider === IMAGE_MODEL_PROVIDER_BYTEDANCE
      ? await generateByteDanceImage({ prompt, modelName: selectedModel.value, shotIndex })
      : await generateGoogleImage({ prompt, modelName: selectedModel.value, shotIndex });
    let generatedImage = imageGeneration.result;

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
        p: promptOverride || normalizedShot.p,
        image_url: publicUrl,
        image_path: storagePath,
        image_prompt: compact(promptOverride || normalizedShot.p, 1800),
        image_model: imageGeneration.model,
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
