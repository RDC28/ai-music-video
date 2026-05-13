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
    costume: compactText(character.costume || character.wardrobe || character.costume_prompt || character.outfit, 260),
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

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isLegacyWardrobeFallback(outfitName, characterName, locationName) {
  const normalizedOutfit = normalizeName(outfitName);
  if (!normalizedOutfit) return false;
  return normalizedOutfit === `${normalizeName(characterName)} outfit for ${normalizeName(locationName)}`;
}

function compactWardrobe(wardrobe = []) {
  if (!Array.isArray(wardrobe)) return [];
  return wardrobe
    .map((location, index) => ({
      location_id: location?.location_id || location?.id || `location-${index + 1}`,
      location_name: location?.location_name || location?.name || `Location ${index + 1}`,
      outfits: Array.isArray(location?.outfits)
        ? location.outfits.map((outfit, outfitIndex) => {
            const characterName = outfit?.character_name || outfit?.name || `Character ${outfitIndex + 1}`;
            const rawOutfitName = outfit?.outfit_name || outfit?.name || '';
            const outfitName = isLegacyWardrobeFallback(rawOutfitName, characterName, location?.location_name || location?.name)
              ? ''
              : compactText(rawOutfitName, 160);
            const description = compactText(outfit?.description || outfit?.outfit_description || outfit?.prompt, 420);
            const hasImageReference = Boolean(outfit?.image_url || outfit?.imageUrl || outfit?.url);
            return {
              character_id: outfit?.character_id || outfit?.id || `character-${outfitIndex + 1}`,
              character_name: characterName,
              has_outfit_override: Boolean(outfitName || description || hasImageReference),
              outfit_name: outfitName,
              description,
              has_image_reference: hasImageReference,
              image_url: outfit?.image_url || outfit?.imageUrl || outfit?.url || '',
            };
          })
        : [],
    }))
    .filter(location => location.location_name || location.outfits.length);
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
          { "name": "Character Name", "role": "Role description", "costume": "Locked wardrobe/costume details", "visual_prompt": "Highly detailed visual description for AI image generation (consistency is key)" }
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
      - Consistency between script concept, shot concepts, characters, costumes, and locations is mandatory. Treat character identity, wardrobe/costume, and location identity as locked production continuity.
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
      wardrobe: compactWardrobe(projectState.wardrobe),
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
- The approved story concept, script events, and emotional arc.
- The approved characters, using exact names, visual identity, wardrobe, costumes, age, and role.
- The approved locations, using exact names, geography, architecture, set dressing, palette, era, and environmental identity.
- The approved wardrobe map, where every location can optionally define outfit overrides for characters.
- The song analysis, including mood, genre, BPM, and emotional journey.

These are NON-NEGOTIABLE continuity locks. Do not rewrite, rename, redesign, swap, merge, or ignore them. If a shot needs variation, vary only camera angle, action, framing, lighting, movement, or performance while preserving the locked script, character, costume, wardrobe-by-location, and location facts.

Create a coherent raw-footage shot list that covers the full song in chronological order. Each shot must attach to a script scene and a vocal/timestamp cue when timing exists. Use only provided character and location names unless no usable names exist. Do not invent random cast, costumes, props, sets, or story concepts that contradict the approved plan.
When a wardrobe entry has an outfit override for a character at a location, the "costumes" field and prompt wording must use that exact outfit name/description verbatim. When a wardrobe entry has has_image_reference: true and a non-empty image_url, the image pipeline will attach the actual outfit photo as a locked reference. In that case write the shot's "costumes" field using only the exact outfit_name and description from the wardrobe entry — do not paraphrase, generalize, or invent clothing details, because the image model will receive the actual outfit photo and will cross-reference it against what the text says. When a wardrobe row is blank or has no override, do not treat that character as absent; use the character's base outfit from the approved character reference sheet.
Every shot is edited over the original song audio later. Treat lyrics as timing/emotional cues, not as a request for the video model to perform exact mouth-to-word lip sync.

Prompt depth standard:
- Every shot must include three distinct prompt fields: "p" for the master shot brief, "image_prompt" for the still frame, and "video_prompt" for the moving clip.
- "p" is the shared production brief. Keep it useful for humans reviewing the shot list, but do not rely on it as the final image or video prompt.
- "image_prompt" must describe one frozen 16:9 cinematic frame only. Include subject placement, pose, facial expression, wardrobe, location, foreground/midground/background, lighting, lens/framing, textures, and the exact visual moment to capture. Do not include dialogue, sound design, clip duration, bracketed action timing, camera moves over time, or instructions like "the video should last".
- "video_prompt" must describe the full 4-8 second source clip. Include action timing, subtle motion, camera behavior over time, dialogue only when the video model needs visible speech, and realistic environmental movement.
- Write 120-220 words in "p", 140-260 words in "image_prompt", and 180-360 words in "video_prompt" for normal shots. Complex narrative shots can be longer when needed.
- Include specific foreground subjects, background action, environment geography, set dressing, props, lighting direction, color temperature, weather/atmosphere, clothing fabric/color, facial expression, body posture, and realistic micro-actions.
- Include a clear camera grammar: static/locked-off/handheld/dolly only when appropriate, shot size, lens/framing, camera height, depth of field, and whether there is no pan/no zoom/no cut.
- Include action timing inside "video_prompt" and "action_timing" for 6-8 second clips when motion matters, using bracketed beats such as [00:00-00:02], [00:02-00:05], [00:05-00:08]. Never put those bracketed timing beats in "image_prompt".
- Keep movement subtle and filmable: small steps, eye shifts, hand movement, breathing, fabric movement, background extras working naturally. Avoid generic posing.
- Do not produce bland prompts like "character in location." The still prompt must be rich enough for a photorealistic image model; the video prompt must be rich enough for an 8-second video model.

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
      "p": "Shared master production brief for the shot. Include exact characters, exact costumes/wardrobe, exact location, story concept, camera setup, visual mood, and key continuity locks. Keep it reviewable and do not include final edit transitions.",
      "image_prompt": "Still-frame-only prompt. Describe one photorealistic 16:9 frame with exact characters, wardrobe, location, pose, expression, composition, foreground/midground/background, props, lighting, color, lens/framing, texture, and mood. No action timing, no dialogue, no sound design, no clip duration, no camera movement over time.",
      "video_prompt": "Video-only source clip prompt. Describe one continuous 4-8 second 16:9 shot with exact characters, wardrobe, location, camera behavior, subtle action timing, natural motion, environmental movement, performance/dialogue if needed, and continuity constraints. No transitions or edit instructions.",
      "start": 0.0,
      "end": 4.0,
      "duration": 4,
      "lyrics": "The lyric or vocal fragment driving this shot",
      "words": [{ "word": "lyric", "start": 0.0, "end": 0.4 }],
      "characters": ["Exact Character Name"],
      "locations": ["Exact Location Name"],
      "concept": "The locked story/script concept this shot serves",
      "costumes": "Locked wardrobe/costume continuity visible in this shot",
      "continuity": "Non-negotiable script, character, costume, and location facts preserved in this shot",
      "action_timing": "[00:00-00:02] first visual beat; [00:02-00:05] subtle subject action; [00:05-00:08] final held beat or reaction",
      "visual_style": "Photorealistic cinematic realism, specific lighting, color palette, texture, and mood",
      "negative_constraints": "No cuts, no transitions, no exaggerated gestures, no extra main characters, no distorted anatomy, no changing layout or wardrobe",
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
