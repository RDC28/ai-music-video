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
const DEFAULT_VIDEO_MODEL = process.env.GOOGLE_VIDEO_MODEL || "veo-3.1-generate-preview";

const compact = (value, maxLength = 900) => {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getErrorStatus(error) {
  return error?.status || error?.code || error?.cause?.status || error?.cause?.code;
}

function isRetryableError(error) {
  const status = Number(getErrorStatus(error));
  const message = String(error?.message || "").toLowerCase();

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

function normalizeDuration(value) {
  const requested = Number(value);
  const allowed = [4, 6, 8];
  if (!Number.isFinite(requested)) return 6;
  return allowed.reduce((best, option) => (
    Math.abs(option - requested) < Math.abs(best - requested) ? option : best
  ), 6);
}

function normalizeAspectRatio(value) {
  return value === "9:16" ? "9:16" : "16:9";
}

function normalizeResolution(value) {
  return value === "1080p" ? "1080p" : "720p";
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

function buildPrompt({ shot, projectState, promptOverride, usedSourceImage }) {
  const characters = projectState?.characters || [];
  const locations = projectState?.locations || [];
  const shotCharacters = shot.characters?.length ? shot.characters : namesFrom(characters);
  const shotLocations = shot.locations?.length ? shot.locations : namesFrom(locations);
  const matchedCharacters = selectedByName(characters, shotCharacters);
  const matchedLocations = selectedByName(locations, shotLocations);

  const characterContext = matchedCharacters.map(character => (
    `- ${character.name}: ${compact(character.visual_prompt || character.description || character.role, 500)}`
  )).join("\n");

  const locationContext = matchedLocations.map(location => (
    `- ${location.name}: ${compact(location.visual_prompt || location.description, 500)}`
  )).join("\n");

  return `
Generate one production-ready cinematic video clip for an AI music video.

SHOT TITLE:
${shot.n}

SHOT ACTION:
${compact(promptOverride || shot.video_prompt || shot.p || shot.prompt, 2000)}

TIMING AND VOCAL CUE:
Song time: ${shot.start ?? "unknown"}s to ${shot.end ?? "unknown"}s, planned shot duration ${shot.duration || 5}s
Lyrics: ${compact(shot.lyrics || "", 650)}
Timed words: ${buildTimedWords(shot.words)}

PROJECT STORY CONTEXT:
Title: ${projectState?.script?.title || "Untitled music video"}
Mood: ${compact(projectState?.script?.mood || projectState?.analysis?.mood, 650)}
Storyline: ${compact(projectState?.script?.storyline || projectState?.analysis?.summary, 900)}
Genre/theme: ${compact(projectState?.analysis?.genre || projectState?.analysis?.theme, 400)}
BPM: ${projectState?.analysis?.bpm || "unknown"}

VOCAL TRANSCRIPT CONTEXT:
${buildTranscriptContext(projectState?.transcript)}

CHARACTER CONTINUITY:
Use only these named characters when characters are visible:
${shotCharacters.join(", ") || "No visible character required"}
${characterContext || "No character visual reference text provided."}

LOCATION CONTINUITY:
Use only these named locations/sets:
${shotLocations.join(", ") || "No specific location required"}
${locationContext || "No location visual reference text provided."}

CAMERA, MOTION, AND STYLE:
- Shot size: ${shot.shot_size || "cinematic music-video framing"}
- Camera/lens: ${shot.camera || "16:9 cinematic composition, high-end music video camera language"}
- Movement: ${shot.movement || "smooth controlled movement that clearly supports the action"}
- Story beat: ${shot.beat || "match the shot action and lyric emotion"}
- Still-image continuity prompt: ${compact(shot.image_prompt || "", 650)}
- Source image provided: ${usedSourceImage ? "yes, treat it as the first frame and preserve subject identity, location, lighting, palette, and composition" : "no, infer continuity from the text context"}

Rules:
1. Output a single continuous photorealistic clip. No text, captions, labels, watermarks, borders, UI, split screens, or title cards.
2. Preserve continuity with the named characters, locations, source image, wardrobe, lighting, lens language, and emotional arc.
3. Keep camera motion believable and editorially useful. Avoid morphing faces, extra limbs, warped hands, flicker, and impossible geometry.
4. Do not invent extra main characters unless the shot explicitly asks for background extras.
5. GENERATE SILENT VIDEO. Do not include sound, ambient noise, dialogue, or music. The video will be layered over a separate audio track.
6. AVOID: text, subtitles, captions, logo, watermark, title card, UI, split screen, deformed hands, warped face, extra limbs, face morphing, flicker, or bad anatomy.
7. Make the clip ready to cut into a music video: clear first frame, readable action, stable composition, cinematic depth, and consistent color grade.
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

    return {
      imageBytes: Buffer.from(arrayBuffer).toString("base64"),
      mimeType: inferImageMimeType(imageUrl, response.headers.get("content-type")),
    };
  }, IMAGE_FETCH_TIMEOUT_MS, "Source image fetch");
}

function formatOperationError(error) {
  if (!error) return "Video operation failed";
  if (typeof error === "string") return error;
  return error.message || error.details || error.status || JSON.stringify(error);
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
    if (!ai) {
      return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured" }, { status: 500 });
    }

    const {
      projectId,
      shot,
      shotIndex = 0,
      projectState = {},
      promptOverride,
      model,
      durationSeconds,
      aspectRatio,
      resolution,
      generateAudio = false,
    } = await req.json();

    if (!projectId || !shot) {
      return NextResponse.json({ error: "Missing projectId or shot" }, { status: 400 });
    }

    const normalizedShot = normalizeShot(shot, shotIndex);
    let sourceImage = null;
    try {
      sourceImage = await fetchSourceImage(normalizedShot.image_url);
    } catch (error) {
      console.warn(`Shot ${shotIndex + 1} source image could not be used:`, serializeError(error));
    }

    const sourceImageWasUsed = Boolean(sourceImage);
    const prompt = buildPrompt({
      shot: normalizedShot,
      projectState,
      promptOverride,
      usedSourceImage: sourceImageWasUsed,
    });

    const requestConfig = {
      numberOfVideos: 1,
      durationSeconds: normalizeDuration(durationSeconds || normalizedShot.duration),
      aspectRatio: normalizeAspectRatio(aspectRatio),
      resolution: normalizeResolution(resolution),
    };

    const videoGeneration = await runWithModelFallback({
      label: `Shot ${shotIndex + 1} video generation`,
      models: getFallbackModels(compact(model, 120) || DEFAULT_VIDEO_MODEL, VIDEO_MODEL_FALLBACKS),
      shouldFallback: shouldFallbackVideoModel,
      operation: async (modelName) => {
        const request = {
          model: modelName,
          prompt,
          config: requestConfig,
        };
        if (sourceImage) request.image = sourceImage;

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
      operation: completedOperation.name,
      shot: {
        ...normalizedShot,
        p: promptOverride || normalizedShot.p,
        video_url: publicUrl,
        video_path: storagePath,
        video_prompt: compact(promptOverride || normalizedShot.video_prompt || normalizedShot.p, 2000),
        video_model: videoGeneration.model,
        video_duration_seconds: requestConfig.durationSeconds,
        video_operation: completedOperation.name || null,
        video_source_image_used: sourceImageWasUsed,
        video_generated_at: new Date().toISOString(),
        video_error: null,
      },
    });
  } catch (error) {
    const serialized = serializeError(error);
    console.error("Shot Video Generation API Error:", serialized);
    return NextResponse.json(
      {
        error: serialized.message,
        retryable: serialized.retryable,
        status: serialized.status,
      },
      { status: serialized.retryable ? 503 : 500 }
    );
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
