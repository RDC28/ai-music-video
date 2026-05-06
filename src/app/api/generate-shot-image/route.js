import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";
import { normalizeShot } from "@/utils/shotList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

const MAX_RETRIES = 3;
const IMAGE_GENERATION_TIMEOUT_MS = 90000;
const STORAGE_UPLOAD_TIMEOUT_MS = 30000;

const compact = (value, maxLength = 900) => {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

function isRetryableError(error) {
  const status = Number(getErrorStatus(error));
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

  return `
Generate one production-ready 16:9 cinematic still image for an AI music video shot.

SHOT TITLE:
${shot.n}

SHOT PROMPT:
${compact(promptOverride || shot.p || shot.prompt, 1800)}

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
- Shot size: ${shot.shot_size || 'cinematic music-video framing'}
- Camera: ${shot.camera || '16:9 cinematic composition'}
- Movement implied by still: ${shot.movement || 'clear directional motion'}
- Story beat: ${shot.beat || 'match the shot prompt'}
- Overall project mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 500)}
- Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 300)}

Rules:
1. Output exactly one photorealistic, high-end cinematic still. No text, captions, labels, watermarks, borders, UI, or split panels.
2. Preserve character and location continuity from the provided context.
3. Make the frame usable as the source image for a video model: clear subject, readable action, strong depth, cinematic lighting.
4. Do not invent extra main characters unless the shot clearly needs background extras.
`;
}

export async function POST(req) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured" }, { status: 500 });
    }

    const { projectId, shot, shotIndex = 0, projectState = {}, promptOverride } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
    const prompt = buildPrompt({ shot: normalizedShot, projectState, promptOverride });

    let generatedImage = await withRetry(async () => {
      const result = await withTimeout(
        () => model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        IMAGE_GENERATION_TIMEOUT_MS,
        "Image model request"
      );

      const response = await result.response;
      const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
      const generatedBase64 = imagePart?.inlineData?.data;

      if (!generatedBase64) {
        const reason = response.candidates?.[0]?.finishReason;
        const err = new Error(reason ? `Image model returned no image data (${reason})` : "Image model returned no image data");
        err.retryable = reason !== "SAFETY";
        throw err;
      }

      return {
        imageBase64: generatedBase64,
        mimeType: imagePart.inlineData.mimeType || "image/png",
      };
    }, {
      label: `Shot ${shotIndex + 1} image generation`,
      attempts: MAX_RETRIES,
      baseDelayMs: 1100,
    });

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
