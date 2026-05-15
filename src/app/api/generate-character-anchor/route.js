import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

const REFERENCE_IMAGE_TIMEOUT_MS = 25000;
const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const ANCHOR_MODEL_FALLBACK = "imagen-3.0-generate-002";
const TIER_1_TERMS = ["face close-up", "close-up", "portrait"];
const TIER_2_TERMS = ["full body front", "front"];
const TIER_3_TERMS = ["outfit", "wardrobe"];

const compact = (value, maxLength = 900) => {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

function normalizeLookupName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
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
    label: compact(imageData.label || imageData.name || `Reference ${index + 1}`, 120),
  };
}

function scoreLabelByTerms(label, terms, fallbackBase = 1000) {
  const lowerLabel = String(label || "").toLowerCase();
  const index = terms.findIndex((term) => lowerLabel.includes(term));
  return index === -1 ? fallbackBase : index;
}

function pickOneByTier(candidates, usedUrls, terms) {
  const tierMatches = candidates
    .filter((candidate) => !usedUrls.has(candidate.url))
    .map((candidate) => ({
      ...candidate,
      score: scoreLabelByTerms(candidate.label, terms),
    }))
    .filter((candidate) => candidate.score < 1000)
    .sort((a, b) => a.score - b.score || a.index - b.index);

  const selected = tierMatches[0] || null;
  if (!selected) return null;
  usedUrls.add(selected.url);
  return selected;
}

function collectAnchorReferenceCandidates(character = {}) {
  const panelRefs = (Array.isArray(character?.images) ? character.images : [])
    .map((image, index) => {
      const normalized = normalizeReferenceImage(image, index);
      return normalized ? { ...normalized, index } : null;
    })
    .filter(Boolean);

  if (!panelRefs.length && character?.sheetUrl && /^https?:\/\//i.test(character.sheetUrl)) {
    return [
      {
        url: character.sheetUrl,
        label: "Full reference sheet",
        index: 0,
      },
    ];
  }

  const usedUrls = new Set();
  const selected = [
    pickOneByTier(panelRefs, usedUrls, TIER_1_TERMS),
    pickOneByTier(panelRefs, usedUrls, TIER_2_TERMS),
    pickOneByTier(panelRefs, usedUrls, TIER_3_TERMS),
  ].filter(Boolean);

  return selected.slice(0, 3);
}

async function fetchReferenceImage(reference) {
  const response = await fetch(reference.url, {
    signal: AbortSignal.timeout(REFERENCE_IMAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Reference image download failed with ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error("Reference image is too large for anchor generation");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error("Reference image is too large for anchor generation");
  }

  return {
    mimeType: inferImageMimeType(reference.url, response.headers.get("content-type")),
    imageBase64: Buffer.from(arrayBuffer).toString("base64"),
  };
}

async function loadReferenceImages(references = []) {
  const loaded = await Promise.all(references.map(async (reference) => {
    try {
      const data = await fetchReferenceImage(reference);
      return {
        ...reference,
        ...data,
      };
    } catch (error) {
      console.warn(`Skipping anchor reference ${reference.label}:`, error?.message || error);
      return null;
    }
  }));

  return loaded.filter(Boolean);
}

function buildAnchorPrompt(character = {}) {
  const triggerCharLabel = "CHAR_ANCHOR";
  return `Generate a single clean character portrait for a music video production.
This is a locked identity reference frame — it will be used to maintain character
consistency across all shots in the music video.

Anonymous production label: ${triggerCharLabel}

CHARACTER IDENTITY (from attached reference images):
- Attached Image 1 is the primary face reference: copy exact face shape, skin tone,
  eye colour, nose, lips, hairline, hair colour and style, age, and body proportions.
- If Image 2 is attached: copy exact outfit, clothing colour, fabric, silhouette,
  accessories, and footwear.
- If Image 3 is attached: use as secondary outfit/body confirmation only.

CHARACTER DESCRIPTION (use only if reference images are insufficient):
${compact(character.visual_prompt || character.description, 400)}
Costume: ${compact(character.costume, 300)}

ANCHOR FRAME RULES:
1. Medium-close shot (waist to top of head), slight 3/4 angle toward camera
2. Plain neutral background — dark charcoal or deep blue-grey, no patterns, no locations
3. Soft diffused frontal lighting — face must be fully lit with no harsh shadows
4. Natural relaxed standing pose, neutral expression looking slightly off-camera
5. Full outfit visible from waist up — clothing details must be sharp and clear
6. No text, no labels, no borders, no watermarks, no split panels
7. Photorealistic, sharp focus on face and upper body
8. This is a production reference frame, not a movie scene — clean studio feel
9. Native 16:9 widescreen, subject centered in safe zone

OUTPUT: One photorealistic character portrait that could serve as the definitive
visual identity reference for this character throughout an entire film production.`;
}

function parseGeneratedImage(result) {
  const imagePart = result?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);
  const generatedBase64 = imagePart?.inlineData?.data;
  if (!generatedBase64) {
    const reason = result?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Anchor model returned no image data (${reason})` : "Anchor model returned no image data");
  }

  return {
    imageBase64: generatedBase64,
    mimeType: imagePart?.inlineData?.mimeType || "image/png",
  };
}

function toSafeSlug(value, fallback = "character") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

async function persistAnchorToProject({ projectId, character, projectState, anchorImageUrl }) {
  if (!projectId) {
    const sourceCharacters = Array.isArray(projectState?.characters) ? projectState.characters : [];
    const normalizedTarget = normalizeLookupName(character?.name);
    const updatedCharacters = sourceCharacters.map((item) => {
      if (normalizeLookupName(item?.name) !== normalizedTarget) return item;
      return {
        ...item,
        anchor_image_url: anchorImageUrl,
        anchor_generated_at: new Date().toISOString(),
      };
    });

    return {
      ...(projectState || {}),
      characters: updatedCharacters,
    };
  }

  const supabase = createAdminClient();
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("project_state")
    .eq("id", projectId)
    .single();

  if (fetchError) throw fetchError;

  const normalizedTarget = normalizeLookupName(character?.name);
  const sourceState = project?.project_state || projectState || {};
  const sourceCharacters = Array.isArray(sourceState?.characters) ? sourceState.characters : [];
  let found = false;
  const updatedCharacters = sourceCharacters.map((item) => {
    if (normalizeLookupName(item?.name) !== normalizedTarget) return item;
    found = true;
    return {
      ...item,
      anchor_image_url: anchorImageUrl,
      anchor_generated_at: new Date().toISOString(),
    };
  });

  const mergedState = {
    ...sourceState,
    characters: found
      ? updatedCharacters
      : [
          ...updatedCharacters,
          {
            ...(character || {}),
            anchor_image_url: anchorImageUrl,
            anchor_generated_at: new Date().toISOString(),
          },
        ],
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update({ project_state: mergedState })
    .eq("id", projectId);

  if (updateError) throw updateError;
  return mergedState;
}

export async function POST(req) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "Character anchor generation is temporarily unavailable." }, { status: 500 });
    }

    const { projectId, character = {}, projectState = {} } = await req.json();
    if (!projectId || !character?.name) {
      return NextResponse.json({ error: "Missing projectId or character.name" }, { status: 400 });
    }

    const referenceCandidates = collectAnchorReferenceCandidates(character);
    const hasTextFallback = Boolean(compact(character.visual_prompt || character.description, 40));
    if (!referenceCandidates.length && !hasTextFallback) {
      return NextResponse.json({ error: "Character needs reference images or a visual prompt for anchor generation." }, { status: 400 });
    }

    const loadedRefs = await loadReferenceImages(referenceCandidates);
    if (!loadedRefs.length && !hasTextFallback) {
      return NextResponse.json({ error: "Character references could not be loaded and no visual prompt was provided." }, { status: 400 });
    }

    try {
      const anchorPrompt = buildAnchorPrompt(character);
      const anchorModelName =
        process.env.GOOGLE_ANCHOR_MODEL ||
        process.env.GOOGLE_IMAGE_MODEL ||
        ANCHOR_MODEL_FALLBACK;
      const parts = [
        { text: anchorPrompt },
        ...loadedRefs.map((ref) => ({
          inlineData: { mimeType: ref.mimeType, data: ref.imageBase64 },
        })),
      ];

      const result = await genAI.models.generateContent({
        model: anchorModelName,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
        },
      });

      const generated = parseGeneratedImage(result);
      const extension = generated.mimeType.includes("jpeg") || generated.mimeType.includes("jpg") ? "jpg" : "png";
      const storagePath = `${projectId}/anchors/${toSafeSlug(character.name)}-anchor-${Date.now()}.${extension}`;
      const buffer = Buffer.from(generated.imageBase64, "base64");
      const supabase = createAdminClient();

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(storagePath, buffer, {
          contentType: extension === "jpg" ? "image/jpeg" : "image/png",
          upsert: true,
        });

      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(storagePath);

      await persistAnchorToProject({
        projectId,
        character,
        projectState,
        anchorImageUrl: publicUrl,
      });

      return NextResponse.json({
        success: true,
        character_name: character.name,
        anchor_image_url: publicUrl,
      });
    } catch (error) {
      console.error("Character anchor generation failed:", error);
      return NextResponse.json({
        success: false,
        reason: error?.message || "Anchor generation failed.",
      });
    }
  } catch (error) {
    console.error("Character Anchor API Error:", error);
    return NextResponse.json({ error: error?.message || "Character anchor route failed." }, { status: 500 });
  }
}
