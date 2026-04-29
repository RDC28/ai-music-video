import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

/**
 * Gemini Agent Orchestrator
 * This handles communication with Gemini 1.5 Pro/Flash
 */
export const geminiAgent = {
  // 1. Script Agent: Turns a raw idea into a structured script
  async generateScript(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const systemPrompt = `
      You are a professional Music Video Director. 
      Convert the user's idea into a structured JSON script.
      Return ONLY a JSON object with this structure:
      {
        "title": "Song Title",
        "mood": "Visual mood description",
        "scenes": [
          { "timestamp": "0:00", "description": "Visual scene description", "lyrics": "..." }
        ]
      }
    `;

    const result = await model.generateContent([systemPrompt, prompt]);
    const response = await result.response;
    return JSON.parse(response.text());
  },

  // 2. Character Agent: Generates consistent descriptions for characters
  async generateCharacters(scriptJson) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const systemPrompt = `
      Analyze the script and define consistent visual characters.
      Return ONLY a JSON array of character objects:
      [{ "name": "Name", "visual_prompt": "Ultra-detailed visual description for image generation" }]
    `;

    const result = await model.generateContent([systemPrompt, JSON.stringify(scriptJson)]);
    const response = await result.response;
    return JSON.parse(response.text());
  }
};
