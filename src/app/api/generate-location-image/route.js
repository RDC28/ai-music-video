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
      return NextResponse.json({ error: "GOOGLE_AI_API_KEY is not configured" }, { status: 500 });
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
        STRICT LOCATION CONSISTENCY.
        MATCH THIS ENVIRONMENT EXACTLY: I am providing a master reference image of the location.
        TARGET VIEW/ANGLE: ${angleDescription}
        LOCATION DETAILS: ${locationDescription}
        
        RULES:
        1. Preserve the exact architecture, materials, color palette, and environmental details from the reference.
        2. Change ONLY the angle/viewpoint to match "${label}".
        3. Maintain the consistent lighting and atmosphere.
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
      
      const fullPrompt = `Generate a high-end, cinematic MASTER LOCATION REFERENCE. 
      LOCATION: ${locationDescription}
      ANGLE/VIEW: ${angleDescription}
      STYLE: Photorealistic, cinematic lighting, epic composition, isolated as a pristine architectural or environmental asset.`;

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
