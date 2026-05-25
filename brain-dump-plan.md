# Aura Studio – Context‑Aware Brain & Movie‑Scale Plan

Author: Rohit Chavda  
Project: Aura AI Studio (ai-music-video)  
Date: 2026-05-21

---

## 1. Objectives

1. Make agents behave like a coordinated film crew (director, DoP, wardrobe) instead of isolated prompt calls.
2. Capture messy creative input (script, vibe, wardrobe, locations) in an early **Brain Dump** step and turn it into a structured, per‑project knowledge base (KB).
3. Ensure all downstream agents always stay on‑context and avoid hallucinating new characters, locations, or visual styles.
4. Extend the architecture to support long‑form content (2–3 hour movies) with acts, sequences, scenes, and shots.
5. Keep the UX lightweight and non‑overwhelming so creative users actually enjoy using it.

---

## 2. Current System Summary (Baseline)

### 2.1 Tech + Workflow

- Next.js app with StageRail + three‑pane workflow shell.
- Create flow: Home → Audio → **Brain Dump (new)** → Cast → Locations → Wardrobe → Shot Plan → Shots → Clips → Editor.
- Supabase `projects` table with a `project_state` JSON blob holding script, characters, locations, wardrobe, style, etc.
- Python service + Shotstack / video generation helpers for final assembly.

### 2.2 Knowledge Base (KB) Today

- `project_state.knowledge_base` contains a **normalised KB**:
  - `project`: identity, mood keywords, visual language, color science, lighting language, editing rhythm, motifs, production rules, preamble.
  - `characters[NAME]`: personality, emotional arc, screen presence, physique, face, hair, default outfit, fashion style, signature elements, prompt_lock.
  - `locations[NAME]`: type, atmosphere, time_and_light, color_palette, materials_and_textures, spatial_layout, production_design_notes, prompt_lock.
  - `style`: cinematography, colour language, lighting philosophy, texture & grain, global_lock, do/dont rules.
- KB is built by `POST /api/build-knowledge-base` using Gemini (multimodal where possible) and project_state (script, characters, locations, wardrobe, style_bible).
- `src/utils/knowledgeBase.js` exposes helpers for reading and composing KB context (shot‑scoped, shot list, wardrobe context, summary).

### 2.3 Auto‑Rebuild Logic

- `src/app/create/[projectId]/page.js` tracks KB‑relevant keys: `characters`, `locations`, `wardrobe`, `script`, `analysis`, `style_bible`.
- Whenever project_state updates touch those keys, a debounced background KB rebuild is scheduled, with a client cooldown and server cooldown.

This means the **plumbing for a single‑source “brain” already exists**. The plan is to wire a better frontend and more disciplined agent usage on top.

---

## 3. Brain Dump Screen – UX & Data Design

### 3.1 Placement & Shell

- StageRail step 3: **Brain Dump** (between Audio and Cast).
- Uses shared three‑pane shell:
  - Left: StageRail (unchanged).
  - Center: Brain Dump content.
  - Right: Knowledge Base / Brain Status panel.

### 3.2 Center Panel Structure

Use **three tabs** (or pill toggles) to avoid overwhelming the user:

1. **Script & Theme**
   - Script upload box:
     - Drop‑zone: accepts PDF / text / doc, or direct paste into a textarea.
     - Display filename and “Last uploaded” timestamp.
   - Story prompt:
     - Textarea: “In 2–3 sentences, what is this film or video about?”
   - Mood words:
     - Chips input + free text: user picks 3–5 words (e.g., nostalgic, neon, lonely, euphoric).

2. **Characters**
   - Character list in a scrollable column; each character is a card:
     - Name and role preview (from existing cast screen where possible).
     - Image drop‑zone:
       - “Drop 1–5 reference images or a collage for this character.”
     - Free‑text field:
       - “Describe their vibe and how they dress in your own words.”
     - Optional *Refine* accordion:
       - Tags like: streetwear, Y2K, techwear, formal, vintage, etc.
       - Extra notes: “Signature accessories, hair, tattoos, etc.”

3. **Locations**
   - Location list; each location is a card:
     - Name.
     - Image drop‑zone:
       - “Drop 1–5 reference stills for this place.”
     - Free‑text field:
       - “How should this place feel on screen?”
     - Optional *Refine* accordion:
       - Notes on colour, materials, time of day, weather, lighting.

### 3.3 Right Panel – Brain / KB Status

- Compact status summary to reassure the user that the system is “thinking”:
  - KB status: Not built / Building in background / Fresh (X minutes ago).
  - Characters documented: N.
  - Locations documented: M.
  - Style summary: key mood words and 1–2 visual cues.
- Show an optional “Rebuild brain now” button that calls `/api/build-knowledge-base?force=true` for power users.

### 3.4 Minimising Cognitive Load

- Each tab displays a **single primary action**:
  - Script & Theme: “Upload & Save Story”.
  - Characters: “Save Character Vibes”.
  - Locations: “Save Location Vibes”.
- All technical terms (KB, prompt_lock, etc.) are hidden from the UI.
- Clear “minimum needed” hints at top of each tab:
  - Script: “Minimum: upload script OR write 2–3 sentences.”
  - Characters: “Minimum: 1 image + 1 sentence per MAIN character.”
  - Locations: “Optional – only add visually important locations.”

---

## 4. Brain Dump → Project State → KB

### 4.1 Data Model Extensions

Extend `project_state` shape to capture brain‑dump inputs:

- `script` (object or string)
  - `raw_text` OR `file_url`.
  - `summary` (short paragraph from user or an agent).
  - `mood` (array of mood keywords).

- `characters[]`
  - Existing fields: `name`, `role`, `description`, `visual_prompt`, `physique`, `personality`, etc.
  - New / emphasised fields:
    - `images: { url, label, kind }[]` (with `kind = 'wardrobe_brain_dump' | 'headshot' | 'pose'`).
    - `fashion_style: string`.
    - `default_outfit: string`.
    - `signature_elements: string[]`.

- `locations[]`
  - Existing: `name`, `description`, `visual_prompt`, `atmosphere` etc.
  - New / emphasised fields:
    - `images: { url, label, kind }[]`.
    - `brain_dump_notes: string` (from free‑text field).

- `style_bible` / `style`
  - `global_notes`: free‑form notes from user about visual tone and cinematography.
  - Other fields can continue to be derived by the KB agent.

### 4.2 Frontend Wiring (BrainDumpScreen)

BrainDumpScreen props (already wired):

```jsx
<BrainDumpScreen 
  onNavigate={goTo} 
  projectId={projectId}
  projectState={projectData?.project_state}
  onDataUpdate={updateProjectData}
/>
```

Implementation strategy:

- Local component state mirrors relevant parts of `project_state` while editing.
- On save/action for each tab:
  - Upload any new images to Supabase storage; store URLs and labels.
  - Call `onDataUpdate({ script: { ... }, analysis: { ... }, characters: [...], locations: [...], style_bible: {...} })` with minimal patches.
  - Let `updateProjectData` merge into `project_state` and trigger KB rebuild when any of `KB_TRIGGER_KEYS` are present.

### 4.3 Wardrobe / Style Summarisation Agent

New backend route: `POST /api/process-wardrobe-brain-dump`.

Input:

```json
{
  "projectId": "uuid",
  "projectState": { ...existing project_state },
  "targets": ["characters", "locations", "style"]
}
```

Behaviour:

1. For each character with new wardrobe images or text notes:
   - Call a multimodal model with:
     - Inline image data (same pattern as `build-knowledge-base`).
     - The user’s free‑text description.
   - Ask for a JSON object with:
     - `fashion_style`: 3–4 sentence wardrobe brief.
     - `default_outfit`: canonical outfit description.
     - `signature_elements`: array of short phrases.
     - Optional refinements to `physique` and `hair` descriptions.

2. For each location with new images/notes:
   - Ask the model for:
     - `atmosphere`, `time_and_light`, `color_palette`, `materials_and_textures`, `spatial_layout`, `production_design_notes`.

3. For global style:
   - Summarise script + mood + any reference film notes into `style_bible` fields.

4. Merge outputs into `project_state` and write back to Supabase.
5. Optionally call `/api/build-knowledge-base` (force=true) to immediately refresh KB.

This route should be called either explicitly from BrainDumpScreen (a “Refine brain” button) or automatically after major changes.

---

## 5. Shot Context & Agent Orchestration

### 5.1 Canonical `ShotContext` Type

Define an internal TypeScript type for agent orchestration:

```ts
type ShotContext = {
  projectId: string;
  kb: KnowledgeBase;               // snapshot from project_state.knowledge_base
  sceneId: string;
  shotId: string;
  timecode: { startBeat: number; durationBeats: number };
  characters: {
    name: string;
    roleInShot: string;
    emotionalState: string;
    relationshipBeats: string[];
  }[];
  location: {
    name: string;
    timeOfDay: string;
    weather: string;
  };
  wardrobeOverrides?: { [characterName: string]: string };
  musicalMoment: {
    lyric: string;
    beatType: 'hook' | 'verse' | 'drop' | 'bridge' | 'ambient';
  };
};
```

Shot and scene data will live in `project_state.shot_plan` / `project_state.scenes` and be editable in your Shot Plan and Shots screens.

### 5.2 Shot Brain Context Builder

Add a helper in `src/utils/knowledgeBase.js`:

```js
export function getShotBrainContext(kb, shot, scene) {
  // Compose:
  // - project preamble
  // - character prompt_locks and wardrobe context
  // - location prompt_lock + location wardrobe context
  // - style.global_lock
  // - scene story beat + emotional beats
  // - per-shot wardrobe overrides
}
```

Output is a multi‑section text block with labelled sections, e.g.:

```text
[KB PROJECT CONTEXT]
...

[KB CHARACTER LOCKS]
...

[CHARACTER WARDROBE CONTEXT]
...

[KB LOCATION LOCK]
...

[KB VISUAL STYLE LOCK]
...

[SHOT STORY BEAT]
...

[WARDROBE OVERRIDES]
...
```

### 5.3 Updating Generation Routes

- For any API that builds prompts for images or videos (shot stills, video clips, thumbnails, etc.):
  - Fetch `project_state` and `knowledge_base`.
  - Build `ShotContext` from Supabase.
  - Call `getShotBrainContext(kb, shot, scene)`.
  - Append a short task instruction, e.g. “Generate a single frame that matches this description.”
  - Add hard rules in the prompt:
    - “Do NOT invent new characters or locations; only use ones in the sections above.”
    - “Outfits must follow the character’s fashion identity and default outfit unless a wardrobe override is specified for this shot.”
    - “Use relationship dynamics to determine poses and reactions; do not invent random relationships.”

### 5.4 Multi‑Agent Orchestration Layer

Introduce a small orchestration module (Node or Python) that:

- Exposes high‑level operations:
  - `planShot(projectId, sceneId, shotId)`.
  - `generateShotStoryboard(projectId, sceneId, shotId)`.
  - `generateShotVideo(projectId, sceneId, shotId)`.
- For each operation:
  - Loads `project_state` and `knowledge_base`.
  - Constructs `ShotContext`.
  - Calls the appropriate specialist agents (script/beat agent, wardrobe agent, director agent, prompt builder, referee agent).
  - Validates their JSON outputs against schemas.
  - Writes approved outputs back into `project_state`.

Agents **never** talk directly to raw user input; they always receive structured context objects and KB.

### 5.5 Consistency Referee Agent

Add a “referee” agent that checks for KB violations:

- Input: `ShotContext`, KB, and a proposed shot description or prompt.
- Responsibilities:
  - Reject: new character names, new locations, obvious contradictions to wardrobe or style rules.
  - Return either:
    - `{ status: 'ok' }` or
    - `{ status: 'requires_fix', corrected: {...} }`.

Run this agent as a filter before expensive video generations.

---

## 6. Scaling to Long‑Form Movies

### 6.1 Hierarchical Story Model

Extend `project_state` to include hierarchy:

- `acts[]`: high‑level thematic divisions.
- `sequences[]`: grouped under acts; major set‑pieces.
- `scenes[]`: grouped under sequences; each scene has:
  - `scene_id`, `act_id`, `sequence_id`.
  - `description`, `emotional_focus`, `location_name`, `time_of_day`.
- `shots[]`: grouped under scenes; holds `ShotContext`‑relevant fields.

### 6.2 Micro‑KB Overlays

- `act_kb[actId]`: small overlays describing thematic and visual shifts per act.
- `sequence_kb[sequenceId]`: set‑piece specific motifs.
- `scene_kb[sceneId]`: scene‑level emotional notes and constraints.

These overlays are short paragraphs merged into shot prompts alongside the global KB, helping the system maintain coherence across thousands of shots.

### 6.3 Batch Orchestration & Queueing

- Introduce a job queue (Supabase functions, a worker, or a simple cron‑driven worker) that processes scenes one by one, shots in small batches:
  - Each job: “generate storyboards for scene X” or “generate preview clips for scene X”.
- Cache KB snapshots by version:
  - Store `kb_version` on scenes/shots.
  - Rebuild KB only when character/location/wardrobe/style change.

### 6.4 Continuity Tracking

- Add `wardrobe_state` per character per scene (outfit variants, dirt, damage).
- Add `physical_state` per character per act (haircut changes, scars, props).
- Enforce continuity inside orchestration layer by feeding these states into `ShotContext` and `getShotBrainContext`.

---

## 7. Implementation Phases

### Phase 0 – Harden Existing KB Usage (1–2 days)

- Audit all prompt‑building routes and utilities.
- Replace any ad‑hoc string prompts with KB‑aware context:
  - Use `getKBContextForShot` / `getKBContextForShotList` where appropriate.
- Add simple constraints (no new character/location names) at the prompt level.

### Phase 1 – Brain Dump Screen (Frontend) (3–5 days)

- Implement `BrainDumpScreen` using the three‑pane shell pattern.
- Add the three tabs: Script & Theme, Characters, Locations.
- Wire file uploads to Supabase storage and store URLs in `project_state`.
- Implement `onDataUpdate` integration so script/mood/characters/locations/style_bible updates are persisted and trigger KB rebuilds.

### Phase 2 – Wardrobe & Style Summarisation Agent (Backend) (3–5 days)

- Implement `/api/process-wardrobe-brain-dump`.
- For characters and locations, call multimodal model to summarise wardrobe and visual style.
- Merge results into `project_state.characters` and `project_state.locations`.
- Optionally trigger `/api/build-knowledge-base` (force) after a successful summarisation.

### Phase 3 – Shot Brain Context + Prompt Refactor (5–7 days)

- Extend shot and scene schema to include story beats, emotional beats, and per‑shot wardrobe overrides.
- Implement `getShotBrainContext(kb, shot, scene)` in `knowledgeBase.js`.
- Refactor shot/video generation routes to use `ShotContext` + `getShotBrainContext`.
- Add hard prompt rules (no new entities, wardrobe/style adherence).

### Phase 4 – Orchestration & Referee Agent (7–10 days)

- Implement an orchestration module that builds `ShotContext` and coordinates specialist agents.
- Define JSON schemas for each agent’s input/output and add validation.
- Implement the consistency referee agent and integrate it into generation flows.

### Phase 5 – Movie‑Scale Extensions (Longer‑Term, Iterative)

- Introduce acts/sequences/scenes hierarchy in `project_state` and the UI.
- Add micro‑KB overlays for acts/sequences/scenes.
- Build a queue‑based scene/shot processing pipeline.
- Add wardrobe and physical continuity tracking across acts and scenes.

---

## 8. Working Principles

1. **Single source of truth**: All agents must read from `project_state.knowledge_base` + structured Shot/Scene context, never inventing new core entities.
2. **Progressive disclosure in UI**: The Brain Dump screen stays visually simple; advanced controls remain behind accordions.
3. **Schema‑first outputs**: Every agent returns strictly validated JSON, not free‑form text.
4. **Film‑brain quality bar**: KB content should read like a director’s visual bible + costume breakdown + cinematography lookbook, not generic prompts.
5. **Iterate from music videos to movies**: Stabilize on high‑quality short‑form flows first, then layer on acts/sequences/continuity for long‑form.
