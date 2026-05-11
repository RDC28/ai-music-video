import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getFallbackModels,
  runWithModelFallback,
  TEXT_MODEL_FALLBACKS,
} from "@/utils/googleModelFallbacks";
import { getProjectAudioDuration, normalizeShotList } from "@/utils/shotList";

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
    const audioDuration = getProjectAudioDuration(projectState);
    const context = {
      audio_duration_seconds: audioDuration,
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
You are a practical shot planner preparing raw source-footage prompts for a music video editor.
The app generates raw clips only. The user will add transitions, cuts, effects, title cards, overlays, stylization, and final edit choices later.

The shot list must treat these as unavoidable inputs:
- Transcript/vocal timing and every available word timestamp.
- The approved script scenes and their time ranges.
- The approved characters, using exact names and visual identity.
- The approved locations, using exact names and environmental identity.
- The song analysis, including mood, genre, BPM, and emotional journey.

Create a coherent raw-footage shot list that covers the full song in chronological order. Each shot must attach to a script scene and a vocal/timestamp cue when timing exists. Use only provided character and location names unless no usable names exist. Do not invent random cast or sets.
Every shot is edited over the original song audio later. Treat lyrics as timing/emotional cues, not as a request for the video model to perform exact mouth-to-word lip sync.

Shot count guidance:
- Do not mirror the script scene count. A single script scene can and should become multiple smaller shots when that improves image/video quality.
- Never create a shot longer than 8 seconds.
- Use 4 second shots for dense word/vocal moments, 6 second shots for standard narrative beats, and 8 second shots only for atmospheric or establishing beats.
- Shorter durations under 4 seconds are allowed only when needed to fit the exact music timing at the start/end of a phrase or the end of the song. The generation system will trim a Veo clip down to that exact timeline length.
- Split any script scene, lyric phrase, or instrumental beat longer than 8 seconds into multiple raw source shots with distinct subject action.
- Avoid gaps and overlapping time ranges when timestamps are available.
- Start lyric-driven shots exactly on a transcript line or word boundary when possible, and include only the words whose timestamps fall inside that shot.
- When timing exists, set end = start + duration.
- If audio_duration_seconds is available, the entire shot list must stay within that exact track length. The final shot end must never be later than audio_duration_seconds.
- If transcript timings stop before the file ends, use instrumental/performance shots to cover the remaining music without exceeding audio_duration_seconds.
- Keep every prompt explicitly plain 16:9 widescreen: no vertical phone framing, no square framing, no letterbox, no pillarbox, no black bars, no black wall transitions, no collage, no split screen.
- Describe only raw source footage, not an edit between shots. Do not request wipes, cut-to-black moments, fades, dissolves, smash cuts, match cuts, jump cuts, curtains, title cards, scene-change devices, montage, split screen, or camera passes into darkness.
- Keep prompts grounded and usable: one scene, one camera setup, one continuous action, simple stable movement, natural tone, and no novelty visual tricks.
- Avoid close-up visible mouth singing/rapping unless the shot can be treated as a loose performance moment. Prefer dance, gesture, silhouette, profile, crowd, hands, environment, and reaction cutaways for lyric timing.

Return STRICTLY one JSON object:
{
  "coverage_notes": "Short note explaining how the shots cover transcript, script, characters, and locations.",
  "shots": [
    {
      "n": "Short raw source shot title",
      "p": "Plain raw source-footage prompt with exact characters, exact location, one continuous action, lighting, lens/framing, mood, and continuity details. No transitions or edit instructions.",
      "start": 0.0,
      "end": 4.0,
      "duration": 4,
      "lyrics": "The lyric or vocal fragment driving this shot",
      "words": [{ "word": "lyric", "start": 0.0, "end": 0.4 }],
      "characters": ["Exact Character Name"],
      "locations": ["Exact Location Name"],
      "shot_size": "establishing | wide | medium | close-up | insert",
      "camera": "Simple 16:9 lens/framing direction",
      "movement": "Simple stable camera movement",
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
