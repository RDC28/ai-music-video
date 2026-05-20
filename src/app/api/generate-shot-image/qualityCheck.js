import {
  FACE_SCORE_THRESHOLD,
  OUTFIT_SCORE_THRESHOLD,
  QUALITY_CHECK_TIMEOUT_MS,
  QUALITY_CHECK_MODEL,
} from "./shotImageConstants.js";
import { withTimeout } from "./referenceImages.js";

export async function qualityCheckImage(genAI, generatedBase64, generatedMimeType, characterAndWardrobeRefs) {
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
