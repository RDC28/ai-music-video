import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

/**
 * Gemini Agent Orchestrator
 * This handles communication with Gemini 1.5 Pro/Flash
 */
export const geminiAgent = {
  // 1. Script Agent: Turns a raw idea into a structured script and seeds characters/locations
  async generateScript(prompt, transcript = null) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const context = transcript ? `Here is the song transcript for timing and context: ${JSON.stringify(transcript)}` : '';

    const systemPrompt = `
      You are a high-end Music Video Director and Creative Strategist.
      Based on the user's idea and the provided transcript, generate a complete creative plan.
      
      Return STRICTLY a JSON object with this exact structure:
      {
        "script": {
          "title": "Song Title",
          "mood": "Overall visual mood/aesthetic",
          "storyline": "Brief narrative overview",
          "lyrics_timeline": [
            { 
              "text": "Full line", 
              "words": [{ "word": "word", "start": 0.0, "end": 0.5 }] 
            }
          ],
          "scenes": [
            { "start": 0.0, "end": 5.0, "visual": "Visual description", "lyrics": "associated lyrics if any" }
          ]
        },
        "characters": [
          { "name": "Character Name", "role": "Role description", "visual_prompt": "Highly detailed visual description for AI image generation (consistency is key)" }
        ],
        "locations": [
          { "name": "Location Name", "description": "Atmospheric description", "visual_prompt": "Highly detailed environment description for AI image generation" }
        ],
        "shot_list": [
          { "shot_number": 1, "description": "Cinematic shot description", "character_id": "Name of character involved", "location_id": "Name of location", "movement": "Camera movement", "duration": "4s" }
        ]
      }
      
      Requirements:
      - Cinematic and high-end creative direction.
      - Consistency between characters/locations and the script.
      - Ensure the 'lyrics_timeline' is populated with the word-by-word timestamps from the provided transcript.
    `;

    const result = await model.generateContent([systemPrompt, context, prompt]);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Failed to generate structured script");
  },

  // ... (keep generateCharacters for backward compatibility or individual edits)
  async generateCharacters(scriptJson) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    // ... logic remains similar but updated model
    const systemPrompt = `Analyze the script and define consistent visual characters. Return ONLY a JSON array of character objects: [{ "name": "Name", "visual_prompt": "description" }]`;
    const result = await model.generateContent([systemPrompt, JSON.stringify(scriptJson)]);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }
};
