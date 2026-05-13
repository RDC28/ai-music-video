import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getFallbackModels,
  IMAGE_MODEL_FALLBACKS,
  runWithModelFallback,
} from "@/utils/googleModelFallbacks";
import { NextResponse } from "next/server";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

async function generateImage(contents, label) {
  const { result, model } = await runWithModelFallback({
    label,
    models: getFallbackModels(process.env.GOOGLE_LOCATION_IMAGE_MODEL || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
    operation: async (modelName) => {
      const activeModel = genAI.getGenerativeModel({ model: modelName });
      return activeModel.generateContent({
        contents,
        generationConfig: { responseModalities: ["IMAGE"] }
      });
    },
  });

  const response = await result.response;
  const generatedB64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  if (!generatedB64) {
    const reason = response.candidates?.[0]?.finishReason;
    const err = new Error(reason ? `${label} returned no image data (${reason})` : `${label} returned no image data`);
    err.retryable = reason !== "SAFETY";
    throw err;
  }

  return { generatedB64, model };
}

export async function POST(req) {
  try {
    if (!genAI) {
      return NextResponse.json({ error: "Location generation is temporarily unavailable." }, { status: 500 });
    }

    const { 
      base64, 
      mimeType, 
      label, 
      locationDescription, 
      angleDescription 
    } = await req.json();

    // 1. REFERENCE-LOCKED GENERATION (Sequential Flow)
    if (base64 && locationDescription && angleDescription) {
      console.log(`NB Pro generating reference-locked location angle: ${label}`);
      
      const prompt = `
        STRICT LOCATION IDENTITY LOCK.
        MATCH THIS EXACT ENVIRONMENT from the provided master reference image.
        TARGET VIEW/ANGLE: ${angleDescription}
        LOCATION DETAILS: ${locationDescription}
        
        RULES:
        1. Preserve the exact architecture, geography, materials, props, signage, color palette, weather logic, and environmental details.
        2. Change ONLY the camera angle/viewpoint/framing needed for "${label}".
        3. Output one clean cinematic environment reference, not a collage or moodboard.
        4. No text, labels, split panels, borders, watermarks, or unrelated locations.
        5. Keep this view consistent enough to sit beside the other reference images as the same place.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/png", data: base64 } }
          ]
        }], `Location reference-locked view (${label || "view"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    // 2. MASTER WIDE SHOT GENERATION (First Angle)
    if (locationDescription && angleDescription) {
      console.log(`NB Pro generating master wide shot: ${label}`);
      
      const fullPrompt = `Generate a high-end, cinematic MASTER LOCATION IDENTITY REFERENCE.
LOCATION BRIEF:
${locationDescription}

TARGET VIEW:
${angleDescription}

STRICT OUTPUT RULES:
- One coherent location only, no collage, no split panels, no text or labels.
- Photorealistic cinematic lighting and a clear production-design presentation.
- Make the architecture, layout, materials, set dressing, palette, geography, and atmosphere distinctive and repeatable for later reference-locked views.
- Ensure the requested view is clearly readable and not cropped awkwardly.`;

      const { generatedB64, model } = await generateImage(
        [{ role: "user", parts: [{ text: fullPrompt }] }],
        `Location master generation (${label || "wide"})`
      );

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    } 

    // 3. REFINEMENT MODE (From Sheet Crops)
    if (base64 && mimeType) {
      console.log(`NB Pro performing location refinement on: ${label}`);
      
      const refinementPrompt = `
        Clean up this location sheet crop into a professional standalone asset.
        1. Identify the central view and erase all neighboring parts or grid lines.
        2. Re-render the environment in a pristine, cinematic presentation.
        3. Output exactly ONE single high-quality view.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: refinementPrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } }
          ]
        }], `Location crop refinement (${label || "crop"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  } catch (error) {
    console.error("NB Pro Location API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
