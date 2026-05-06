import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getFallbackModels,
  runWithModelFallback,
  TEXT_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import { normalizeShotList } from "@/utils/shotList";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

function getModel(modelName) {
  if (!genAI) {
    throw new Error("GOOGLE_AI_API_KEY is not configured. Add it to your environment before using AI generation.");
  }
  return genAI.getGenerativeModel({ model: modelName });
}

async function generateText(parts, label, primaryModel = process.env.GOOGLE_TEXT_MODEL) {
  const models = getFallbackModels(primaryModel, TEXT_MODEL_FALLBACKS);
  const { result, model } = await runWithModelFallback({
    label,
    models,
    operation: async (modelName) => {
      const activeModel = getModel(modelName);
      return activeModel.generateContent(parts);
    },
  });
  const response = await result.response;
  return { text: response.text(), model };
}

function extractJsonObject(text, label = "Gemini response") {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in ${label}`);
  }
  return JSON.parse(jsonMatch[0]);
}

function compactText(value, maxLength = 600) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactTranscript(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines.map(line => ({
    text: compactText(line.text || line.lyrics || line.line, 220),
    start: line.start,
    end: line.end,
    words: Array.isArray(line.words)
      ? line.words.map(word => ({
        word: word.word || word.text,
        start: word.start,
        end: word.end,
      }))
      : [],
  }));
}

function compactCharacters(characters = []) {
  if (!Array.isArray(characters)) return [];
  return characters.map(character => ({
    name: character.name,
    role: compactText(character.role || character.description, 180),
    visual_prompt: compactText(character.visual_prompt || character.prompt || character.description, 420),
  }));
}

function compactLocations(locations = []) {
  if (!Array.isArray(locations)) return [];
  return locations.map(location => ({
    name: location.name,
    description: compactText(location.description, 220),
    visual_prompt: compactText(location.visual_prompt || location.prompt || location.description, 420),
  }));
}

/**
 * Gemini Agent Orchestrator
 * This handles communication with Gemini 1.5 Pro/Flash
 */
export const geminiAgent = {
  // 1. Script Agent: Turns a raw idea into a structured script and seeds characters/locations
  async generateScript(prompt, transcript = null) {
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

    const { text } = await generateText(
      [systemPrompt, context, prompt],
      "Script generation"
    );
    
    return extractJsonObject(text, "script generation response");
  },

  async generateShotList(projectState = {}) {
    const transcript = projectState.analysis?.lyrics || projectState.script?.lyrics_timeline || [];
    const script = projectState.script || {};
    const context = {
      audio_analysis: {
        theme: projectState.analysis?.theme,
        mood: projectState.analysis?.mood,
        genre: projectState.analysis?.genre,
        bpm: projectState.analysis?.bpm,
        summary: compactText(projectState.analysis?.summary, 900),
      },
      transcript: compactTranscript(transcript),
      script: {
        title: script.title,
        mood: compactText(script.mood, 500),
        storyline: compactText(script.storyline, 900),
        scenes: Array.isArray(script.scenes)
          ? script.scenes.map(scene => ({
            start: scene.start,
            end: scene.end,
            visual: compactText(scene.visual || scene.description, 600),
            lyrics: compactText(scene.lyrics, 260),
          }))
          : [],
      },
      characters: compactCharacters(projectState.characters),
      locations: compactLocations(projectState.locations),
      existing_draft_shots: normalizeShotList(projectState.shot_list).map((shot, index) => ({
        shot_number: index + 1,
        n: shot.n,
        p: compactText(shot.p, 360),
        start: shot.start,
        end: shot.end,
        characters: shot.characters,
        locations: shot.locations,
      })),
    };

    const systemPrompt = `
You are a senior music video director building a production shot list.

The shot list must treat these as unavoidable inputs:
- Transcript/vocal timing and every available word timestamp.
- The approved script scenes and their time ranges.
- The approved characters, using exact names and visual identity.
- The approved locations, using exact names and environmental identity.
- The song analysis, including mood, genre, BPM, and emotional journey.

Create a coherent shot list that covers the full song in chronological order. Each shot must attach to a script scene and a vocal/timestamp cue when timing exists. Use only provided character and location names unless no usable names exist. Do not invent random cast or sets.

Shot count guidance:
- Do not mirror the script scene count. A single script scene can and should become multiple smaller shots when that improves image/video quality.
- Every shot duration must be exactly one of these Veo-friendly lengths: 4, 6, or 8 seconds. Never create a shot longer than 8 seconds.
- Split any script scene, lyric phrase, or instrumental beat longer than 8 seconds into multiple shots with fresh prompts and distinct camera/action beats.
- Use 4 second shots for dense word/vocal moments, 6 second shots for standard narrative beats, and 8 second shots only for atmospheric or establishing beats.
- Avoid gaps and overlapping time ranges when timestamps are available.
- When timing exists, set end = start + duration. If exact lyrical boundaries do not fit perfectly, prefer a clean 4/6/8 second shot over preserving the original scene length.

Return STRICTLY one JSON object:
{
  "coverage_notes": "Short note explaining how the shots cover transcript, script, characters, and locations.",
  "shots": [
    {
      "n": "Short production shot title",
      "p": "Detailed cinematic image/video prompt with exact characters, exact location, action, lighting, lens/framing, mood, and continuity details",
      "start": 0.0,
      "end": 4.0,
      "duration": 4,
      "lyrics": "The lyric or vocal fragment driving this shot",
      "words": [{ "word": "lyric", "start": 0.0, "end": 0.4 }],
      "characters": ["Exact Character Name"],
      "locations": ["Exact Location Name"],
      "shot_size": "establishing | wide | medium | close-up | insert",
      "camera": "Specific lens/framing direction",
      "movement": "Specific camera movement",
      "beat": "Story, performance, or vocal beat",
      "source_scene": "The script scene/time range this shot comes from"
    }
  ]
}
`;

    const { text } = await generateText(
      [
        systemPrompt,
        `PROJECT CONTEXT JSON:\n${JSON.stringify(context)}`
      ],
      "Shot list generation"
    );
    return extractJsonObject(text, "shot list generation response");
  },

  // ... (keep generateCharacters for backward compatibility or individual edits)
  async generateCharacters(scriptJson) {
    // ... logic remains similar but updated model
    const systemPrompt = `Analyze the script and define consistent visual characters. Return ONLY a JSON array of character objects: [{ "name": "Name", "visual_prompt": "description" }]`;
    const { text } = await generateText(
      [systemPrompt, JSON.stringify(scriptJson)],
      "Character JSON generation"
    );
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }
};
