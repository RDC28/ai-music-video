import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

export async function POST(req) {
  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    const imageResp = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a professional Technical Print Editor. Your task is to analyze the character sheet for its VISUAL BORDERS and extract the individual poses.

    INSTRUCTIONS:
    1. ANALYZE BORDERS: Identify all horizontal and vertical lines that divide the images.
    2. EXTRACT CELLS: For every distinct image cell defined by these borders, provide the exact bounding box.
    3. BEST FIT: Do not force an aspect ratio. Use the bounding box that fits the image cell perfectly.
    4. NO ARTIFACTS: Shrink your box by 2 units from the border lines to ensure the lines aren't visible in the crop.

    OUTPUT: Return ONLY a valid JSON array of objects.
    Format: [{"label": "...", "box_2d": [ymin, xmin, ymax, xmax]}]
    Coordinates [0, 1000]. Order cells LEFT-to-RIGHT, TOP-to-BOTTOM.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageBuffer.toString("base64"), mimeType } }
    ]);

    const text = result.response.text().trim();
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error("Border analysis failed.");

    const poses = JSON.parse(text.substring(startIdx, endIdx + 1));

    // Sort logically for character sheets (Row first, then Column)
    const sortedPoses = poses.sort((a, b) => {
      const rowGap = Math.abs(a.box_2d[0] - b.box_2d[0]);
      if (rowGap > 100) return a.box_2d[0] - b.box_2d[0];
      return a.box_2d[1] - b.box_2d[1];
    });

    console.log(`[DETERMINISTIC BORDER SPLIT] Extracted ${sortedPoses.length} individual cells.`);
    return NextResponse.json({ success: true, poses: sortedPoses });
  } catch (error) {
    console.error("Splitter Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
