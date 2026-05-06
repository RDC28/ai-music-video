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
    models: getFallbackModels(process.env.GOOGLE_CHARACTER_IMAGE_MODEL || process.env.GOOGLE_IMAGE_MODEL, IMAGE_MODEL_FALLBACKS),
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
      characterDescription, 
      angleDescription 
    } = await req.json();

    // 1. REFERENCE-LOCKED GENERATION (Sequential Flow)
    if (base64 && characterDescription && angleDescription) {
      console.log(`NB Pro generating reference-locked angle: ${label}`);
      
      const prompt = `
        STRICT CHARACTER CONSISTENCY.
        MATCH THIS CHARACTER EXACTLY: I am providing a master reference image.
        TARGET ANGLE: ${angleDescription}
        CHARACTER DETAILS: ${characterDescription}
        
        RULES:
        1. Preserve the exact face, hair, outfit, and jewelry from the reference.
        2. Change ONLY the angle/pose to match "${label}".
        3. Maintain the professional studio lighting and clean white background.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/png", data: base64 } }
          ]
        }], `Character reference-locked angle (${label || "angle"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    // 2. MASTER FRONT VIEW GENERATION (First Angle)
    if (characterDescription && angleDescription) {
      console.log(`NB Pro generating master front view: ${label}`);
      
      const fullPrompt = `Generate a high-end, studio-quality MASTER CHARACTER REFERENCE. 
      CHARACTER: ${characterDescription}
      ANGLE: ${angleDescription}
      STYLE: Photorealistic, cinematic studio lighting, isolated on a clean white studio background. 
      Ensure the character is standing and clearly visible.`;

      const { generatedB64, model } = await generateImage(
        [{ role: "user", parts: [{ text: fullPrompt }] }],
        `Character master generation (${label || "front"})`
      );

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    } 

    // 3. REFINEMENT MODE (From Sheet Crops)
    if (base64 && mimeType) {
      console.log(`NB Pro performing solo refinement on: ${label}`);
      
      const refinementPrompt = `
        STRICT SOLO SUBJECT ISOLATION.
        Clean up this character sheet crop into a professional standalone asset.
        1. Identify the central character and erase all neighboring parts or grid lines.
        2. Re-render the character in a pristine white studio background.
        3. Output exactly ONE single character body.
      `;

      const { generatedB64, model } = await generateImage([{
          role: "user",
          parts: [
            { text: refinementPrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } }
          ]
        }], `Character crop refinement (${label || "crop"})`);

      return NextResponse.json({ success: true, imageBase64: generatedB64, image_model: model });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  } catch (error) {
    console.error("NB Pro API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
