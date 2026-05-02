import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

export async function POST(req) {
  try {
    const { 
      base64, 
      mimeType, 
      label, 
      characterDescription, 
      angleDescription 
    } = await req.json();

    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

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

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/png", data: base64 } }
          ]
        }],
        generationConfig: { responseModalities: ["IMAGE"] }
      });
      
      const response = await result.response;
      const generatedB64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

      if (!generatedB64) throw new Error("NB Pro reference-locked generation failed.");
      return NextResponse.json({ success: true, imageBase64: generatedB64 });
    }

    // 2. MASTER FRONT VIEW GENERATION (First Angle)
    if (characterDescription && angleDescription) {
      console.log(`NB Pro generating master front view: ${label}`);
      
      const fullPrompt = `Generate a high-end, studio-quality MASTER CHARACTER REFERENCE. 
      CHARACTER: ${characterDescription}
      ANGLE: ${angleDescription}
      STYLE: Photorealistic, cinematic studio lighting, isolated on a clean white studio background. 
      Ensure the character is standing and clearly visible.`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] }
      });
      
      const response = await result.response;
      const generatedB64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

      if (!generatedB64) throw new Error("NB Pro master generation failed.");
      return NextResponse.json({ success: true, imageBase64: generatedB64 });
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

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [
            { text: refinementPrompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: base64 } }
          ]
        }],
        generationConfig: { responseModalities: ["IMAGE"] }
      });
      
      const response = await result.response;
      const refinedB64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

      if (!refinedB64) throw new Error("NB Pro solo refinement failed.");
      return NextResponse.json({ success: true, imageBase64: refinedB64 });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  } catch (error) {
    console.error("NB Pro API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
