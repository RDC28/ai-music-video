# Aura Studio — UI Redesign Plan
## "Director's Cut" — A Cinematic Dark Studio

> Give this document to Claude Code and instruct it to use the **Stitch MCP server**
> to generate and implement the new UI screens described below.

---

## 1. The Problem with the Current UI

The current UI has several issues worth fixing:

- **Cramped TopBar navigation:** 10 step-pills stuffed into a horizontal bar overflow, squish, and confuse. There's no visual sense of "where you are" in a production pipeline.
- **Monotone cyan-only palette:** `--orange` is literally an alias for cyan. There's nothing that feels like music, film, or creative energy.
- **Generic SaaS aesthetic:** The screens all look the same — same header, same panel, same layout. A music video studio should feel like a *studio*.
- **No breathing room:** Layouts are tight. Content areas feel like forms, not workspaces.
- **Redundant navigation:** `NavDots`, `TopBar` progress line, and `topbar-step` pills all try to do the same job.
- **Landing page lacks identity:** Feature cards and copy don't convey the premium, cinematic feel the product deserves.

---

## 2. Design Direction: "Director's Cut"

**Concept:** Think *Runway ML* meets *A24 Films* meets *Apple Final Cut Pro*.
A premium, immersive dark studio. Every screen should feel like you're in a director's edit suite.
The product makes cinematic music videos — the tool should *feel* cinematic.

**Mood words:** Cinematic · Immersive · Editorial · Focused · Premium · Atmospheric

---

## 3. New Color Palette

Replace the current all-cyan palette with a three-accent system that has warmth, depth, and creative energy.

```
/* Backgrounds */
--bg:          #060608        /* near-black, barely-violet-tinted */
--bg-deep:     #030305        /* pure deep black */
--surface:     #0C0C12        /* card base */
--surface-2:   #121218        /* elevated surface */
--surface-3:   #18181F        /* highest surface */

/* Primary accent — Electric Violet (AI / creative / generation) */
--violet:      #7C3AED        /* primary actions, active states */
--violet-soft: #6D28D9
--violet-glow: rgba(124, 58, 237, 0.35)

/* Secondary accent — Vivid Rose/Magenta (music / passion / emotion) */
--rose:        #EC4899        /* secondary actions, highlights */
--rose-soft:   #DB2777
--rose-glow:   rgba(236, 72, 153, 0.3)

/* Tertiary accent — Warm Amber (spotlight / film / export) */
--amber:       #F59E0B        /* completion states, "done" indicators */
--amber-soft:  #D97706

/* Keep one cool accent for links and mono labels */
--cyan:        #22D3EE        /* links, mono labels, data */

/* Text */
--text:        #F0F0F6        /* primary text */
--text-soft:   rgba(240,240,246,0.72)
--text-muted:  rgba(240,240,246,0.42)

/* Borders */
--border:      rgba(255,255,255,0.06)
--border-mid:  rgba(255,255,255,0.10)
--border-violet: rgba(124,58,237,0.28)
--border-rose:   rgba(236,72,153,0.22)
```

**Gradient signature** (use on CTAs, active states, branding moments):
```css
background: linear-gradient(135deg, #7C3AED 0%, #EC4899 60%, #F59E0B 100%);
```

---

## 4. Typography (keep, but use more boldly)

```
--font-display: 'Fraunces'        /* headlines — use larger, more dramatic */
--font-body:    'Geist'           /* body copy */
--font-mono:    'JetBrains Mono'  /* labels, metadata, step numbers */
```

**Changes:**
- Screen titles should be **40–52px** (currently too small at ~26px)
- Use Fraunces italic for *all* major screen headings, not just some
- Mono labels should be slightly larger: `11px` instead of `9–10px`
- Increase line-height on body copy from `1.6` to `1.75` for readability

---

## 5. New Navigation: "Stage Rail"

**Replace the cramped horizontal TopBar with a left-side vertical Stage Rail.**

### Stage Rail (left sidebar, ~64px wide collapsed, ~220px expanded)

```
┌─────────────────────────────────────────────────────┐
│ ▌ [A]  [project name — italic]       [save & exit] │  ← slim top strip (48px)
├──────┬──────────────────────────────────────────────┤
│  01  │                                              │
│  ◉   │                                              │
│  02  │          SCREEN CONTENT AREA                │
│  ○   │                                              │
│  03  │                                              │
│  ○   │                                              │
│  ..  │                                              │
│  10  │                                              │
│  ○   │                                              │
└──────┴──────────────────────────────────────────────┘
```

**Stage Rail spec:**
- Fixed left side, full height, `64px` wide (icons + numbers only)
- Hovering expands to `220px` showing step name alongside number
- Each step is a `52px` tall row with: step number (mono, small), icon, connector line
- **Active step:** filled violet circle + violet left-border accent + name visible
- **Completed step:** checkmark icon in amber, connector line filled amber
- **Upcoming step:** dim circle, dim connector line
- Connector lines between steps form a vertical "film strip" track
- The rail has a subtle `border-right: 1px solid var(--border)` and its own `backdrop-filter`
- On mobile: collapses to a bottom tab strip (5 most relevant steps visible)

**Top strip (replaces TopBar):**
- Height: `48px` (vs current `64px` — saves vertical space)
- Left: [A] logo mark + project name italic
- Right: credits badge + "Save & Exit" ghost button
- No step pills at all — that's the Rail's job now

---

## 6. Background & Atmospheric Effects

Keep the atmospheric dark background but restyle the aurora to match the new palette.

```css
/* New aurora: violet + rose instead of cyan-only */
body::before {
  background:
    radial-gradient(ellipse 42% 38% at 15% 10%, rgba(124,58,237,0.16), transparent 64%),
    radial-gradient(ellipse 50% 40% at 90% 8%,  rgba(236,72,153,0.12), transparent 66%),
    radial-gradient(ellipse 56% 40% at 50% 108%, rgba(124,58,237,0.10), transparent 66%),
    radial-gradient(ellipse 32% 30% at 78% 72%, rgba(236,72,153,0.08), transparent 64%),
    linear-gradient(180deg, #07070C 0%, #030305 100%);
}
```

Keep:
- Aurora drift animation (`auroraDrift`) — slow, 28s
- Fine grid overlay (reduce opacity to `0.6`)
- Grain texture overlay

Add:
- A **vignette** on the edges: `radial-gradient(ellipse 85% 80% at center, transparent 50%, rgba(0,0,0,0.6) 100%)`
- On screen panels: a subtle **scan-line** effect at very low opacity for cinematic texture

---

## 7. Screen Panel Redesign

Current: all screens look the same — rounded rect with glassmorphism.

New: screens should have a **two-column layout** by default on larger viewports.

### New Screen Layout (two-column)
```
┌────────────────────────────────────────────────────────────┐
│  STAGE CONTEXT (left, ~300px)  │  ACTION AREA (right, flex) │
│                                │                            │
│  Step icon (large, 48px)       │  Form / Content / Results  │
│  Step title (Fraunces, 44px)   │                            │
│  Step subtitle (14px)          │  [primary action button]   │
│  ─────────────────             │                            │
│  Context help / tips           │                            │
│  Previous step summary         │                            │
│                                │                            │
└────────────────────────────────────────────────────────────┘
```

- **Left panel:** Provides context, orientation, and guidance. Slightly darker bg.
- **Right panel:** The actual work area — inputs, generated results, controls.
- This eliminates the need for the current `.screen-header-modern` taking up precious vertical space for every screen.
- On viewports below `900px`: stacks vertically (context collapses to a small header strip).

### Panel cards (replace `.premium-panel`)
```css
.studio-panel {
  background: rgba(12, 12, 18, 0.85);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.05) inset,
    0 24px 64px rgba(0,0,0,0.6);
  backdrop-filter: blur(16px) saturate(1.2);
}

/* Violet-accented panel variant (for active/featured cards) */
.studio-panel-violet {
  border-color: rgba(124,58,237,0.24);
  box-shadow:
    0 0 0 1px rgba(124,58,237,0.16),
    0 24px 64px rgba(0,0,0,0.5),
    0 0 60px rgba(124,58,237,0.08);
}
```

---

## 8. Button System Redesign

### Primary CTA (replaces `.btn-orange`)
```css
.btn-primary {
  background: linear-gradient(135deg, #7C3AED 0%, #9333EA 100%);
  color: #fff;
  border: none;
  border-radius: 12px;   /* change from pill to slightly rounded rect */
  padding: 12px 24px;
  font-weight: 700;
  font-size: 13px;
  box-shadow:
    0 0 0 1px rgba(124,58,237,0.5),
    0 12px 32px rgba(124,58,237,0.35),
    inset 0 1px 0 rgba(255,255,255,0.2);
  /* shimmer sweep on hover — keep this effect */
}
```

### Secondary CTA (replaces `.btn-teal`)
```css
.btn-secondary {
  background: linear-gradient(135deg, #EC4899 0%, #DB2777 100%);
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(236,72,153,0.4), 0 12px 28px rgba(236,72,153,0.25);
}
```

### Approve / Confirm (replaces `.btn-approve`)
```css
.btn-confirm {
  background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
  color: #0A0A0F;
  border-radius: 12px;
  font-weight: 700;
  box-shadow: 0 0 0 1px rgba(245,158,11,0.4), 0 12px 28px rgba(245,158,11,0.25);
}
```

### Ghost button (replaces `.btn-outline`)
```css
.btn-ghost {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  color: var(--text-soft);
  /* On hover: border becomes violet */
}
```

**Change all button `border-radius` from `999px` (full pill) to `10–12px` (modern rounded rect).** Pills feel playful; rounded rects feel like professional creative software.

---

## 9. Screen-by-Screen Redesign Notes

### Screen 1 — Landing (inside the studio, post-login)
- Left panel: Large "Hello, [name]." in Fraunces 52px italic, brief welcome copy
- Right panel: Single prominent CTA card "Start a Music Video" with violet gradient + ArrowRight
- Below: 3 "Coming Soon" format cards in a row — but styled as **film slate chips** (small, dark, with diagonal slate texture suggestion)
- The 4 workflow cards (Track/Plan/Generate/Assemble) move to a horizontal scrollable row at the bottom with icons

### Screen 2 — Upload Audio
- Left panel: Step context ("The foundation is the track."), tips about supported formats
- Right panel: Large drag-drop zone with animated waveform border (violet dashed border that animates) + audio player (custom-styled, not browser default)
- Progress bar: becomes a **horizontal film strip** that fills left-to-right with violet

### Screen 3 — Brain Dump (Story)
- Left panel: Show the track title + a detected lyric snippet if available
- Right panel: Large textarea (full height, minimal styling — "write anything here") with a subtle paper texture
- Generated plan view: 3-column layout — Scenes | Cast | Locations

### Screen 4 — Characters
- Left panel: Step context
- Right panel: Character cards in a **2-column grid** — each card is a "casting sheet" styled panel with name, description, image placeholder
- Add button is a violet "+ Add Character" card

### Screen 5 — Locations
- Same as Characters but with location "set cards"

### Screen 6 — Shot List (Generate)
- Left panel: Scene summary chips scrollable list
- Right panel: Full shot list with shot cards that look like **storyboard frames** — each card has a thumbnail area (16:9 aspect ratio box) + shot details

### Screen 7 — Shots (individual shot details)
- Grid of shot cards
- Each card: 16:9 thumbnail placeholder, shot name, scene label, character/location tags

### Screen 8 — Frames (Images)
- Full-width masonry or grid layout
- Each image card has hover-reveal controls (Approve / Regenerate / Full view)
- Approved images get an amber checkmark badge

### Screen 9 — Clips (Videos)
- 2-column grid of video players
- Clean minimal player controls (no browser default)

### Screen 10 — Assemble (Editor)
- Three-panel layout: Clip library (left) | Timeline (center) | Preview (right)
- Timeline looks like a film strip with clip thumbnails

---

## 10. Key Animations & Transitions

### Screen transition
Replace the current `screenEnter` (fade + translateY) with a **horizontal film-frame slide**:
```css
@keyframes screenSlideIn {
  from {
    opacity: 0;
    transform: translate3d(32px, 0, 0) scale(0.98);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    filter: blur(0);
  }
}
```

### Step completion
When a step is marked complete (user advances), animate the Stage Rail step indicator:
- Circle scales up → fills with violet → morphs to checkmark → scales back down
- Duration: 600ms with `cubic-bezier(0.34, 1.56, 0.64, 1)` spring

### Loading / generation states
Replace the current animated bars with a **horizontal film-strip scanner**:
```css
/* A thin line that sweeps across the panel like a film projector beam */
@keyframes filmScan {
  from { transform: translateX(-100%); opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  to   { transform: translateX(200%); opacity: 0; }
}
```

### Card hover
```css
.studio-card:hover {
  transform: translateY(-2px);
  border-color: rgba(124,58,237,0.28);
  box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.2);
}
```

### Button press
All buttons: `transform: scale(0.97)` on `:active` — tactile, satisfying.

---

## 11. Landing Page (`/` — public homepage) Redesign

### New layout: Full-bleed "Film Poster"

**Header:**
- Logo "AURA" in Fraunces, large (60px+), left-aligned
- Right: "Sign In" ghost button

**Hero (full viewport height):**
- Giant Fraunces italic headline spanning 2 lines:
  ```
  Turn a song
  into a world.
  ```
  Size: `clamp(56px, 8vw, 110px)` — massive
- Subtitle: 15px Geist, max 480px wide
- Two CTAs: "Enter the Studio" (violet gradient, 12px rounded rect) + "See How It Works" (ghost)
- Background: the violet/rose aurora, more dramatic than in-app (aurora elements slightly larger)
- Bottom of hero: horizontally scrolling ticker of `Track · Plan · Generate · Assemble · ` (repeating) in small mono caps

**Features section:**
Replace current 3-card grid with a **stacked large feature block** — each feature takes full width, alternating text-left / image-right layout with a screenshot or visual mockup placeholder.

**Quote section:**
Keep the italic Fraunces quote but make it bigger (`clamp(28px, 3.5vw, 48px)`) and center it against a near-black panel with a subtle violet glow behind it.

**Auth modal:**
- Completely dark panel (`#0C0C12`), centered
- "AURA" logo at top of modal
- Toggle tabs for Sign In / Create Account: use a sliding pill indicator under the active tab
- Input fields: dark bg, violet focus ring (not cyan)
- Submit button: full-width violet gradient

---

## 12. Dashboard Page (`/dashboard`) Redesign

### New layout: "Project Library"

**Top bar:**
- Left: "Good [morning/afternoon/evening], [name]." in Fraunces italic
- Right: Credits badge (amber) + "New Project" violet button

**Project grid:**
- 3-column grid of **project cards** (2-col on medium, 1-col on mobile)
- Each card looks like a **film clapperboard** with:
  - Top third: gradient color block (random from a set of 6 cinematic palettes) with diagonal black "clap" stripe
  - Bottom two-thirds: white area with project title (Fraunces italic, 18px), last edited date (mono), step progress (e.g. "07 / Shots")
  - Hover: reveals an "Open" button overlay
- Empty state: single centered card with dashed border, "+" icon, "Start a new video"

**New Project modal:**
- Single input: project name
- Violet gradient submit button

---

## 13. Files to Create / Modify

When implementing this with Stitch MCP + Claude Code:

### Files to fully replace:
- `src/app/globals.css` — entire file, new design tokens and base styles
- `src/components/TopBar.js` → **rename/replace with** `src/components/StageRail.js`
- `src/components/NavDots.js` → **delete** (redundant, replaced by StageRail)
- `src/app/page.js` — new homepage layout
- `src/app/dashboard/page.js` — new dashboard layout

### Files to update (screen-level changes):
- `src/components/screens/LandingScreen.js`
- `src/components/screens/UploadAudioScreen.js`
- `src/components/screens/BrainDumpScreen.js`
- `src/components/screens/CharactersScreen.js`
- `src/components/screens/LocationsScreen.js`
- `src/components/screens/GenerateShotListScreen.js`
- `src/components/screens/ShotListScreen.js`
- `src/components/screens/ImagesScreen.js`
- `src/components/screens/VideosScreen.js`
- `src/components/screens/AssembleScreen.js`
- `src/components/ProgressBar.js` — restyle with film-strip metaphor
- `src/components/WorkflowBuffer.js` — restyle with film-scan animation

### Files to keep / leave alone:
- All `src/app/api/**` — no changes needed
- `src/utils/**` — no changes needed
- `src/app/create/[projectId]/page.js` — only the layout shell, update to use `StageRail` instead of `TopBar`

---

## 14. Stitch MCP Prompts

Use these prompts when calling the Stitch MCP server to generate screen designs:

### Prompt 1 — Design System + Global Styles
```
Design a dark cinema UI design system for a web app called "Aura Studio" — 
an AI music video production tool. 

Color palette:
- Background: #060608 (near-black, slight violet tint)
- Surface: #0C0C12, #121218
- Primary: Electric Violet #7C3AED
- Secondary: Vivid Rose #EC4899  
- Tertiary: Warm Amber #F59E0B
- Cool link color: Cyan #22D3EE
- Text: #F0F0F6

Typography: Fraunces (display/headings, italic), Geist (body), JetBrains Mono (labels)

Buttons should use rounded rectangles (border-radius: 12px), NOT full pills.
Panels use glassmorphism with backdrop-filter blur.
Background has a slow animated aurora gradient in violet + rose tones.
Fine grid overlay at low opacity adds depth.

Generate: CSS custom properties (design tokens), button variants, panel variants, 
input field styles, and base body/background styles.
```

### Prompt 2 — Stage Rail Navigation Component
```
Design a vertical left-sidebar navigation component for a 10-step creative 
workflow in a dark cinema web app called Aura Studio.

- 64px wide collapsed, 220px wide on hover (smooth CSS transition)
- Steps: 01 Home, 02 Audio, 03 Story, 04 Cast, 05 Sets, 06 Plan, 07 Shots, 
  08 Frames, 09 Clips, 10 Editor
- Each step row: 52px height, contains step number (JetBrains Mono, 10px), 
  step icon (lucide-react), and step name (only visible when expanded)
- Active step: violet left-border indicator, filled violet circle, name always visible
- Completed step: amber checkmark icon, amber filled line connector
- Upcoming step: dim circle, dim vertical connector line
- Vertical lines between steps look like a film-strip rail
- Top of rail: "A" logomark + project name in Fraunces italic (truncated)
- Background: rgba(6,6,10,0.9) with backdrop-filter blur
- Border-right: 1px solid rgba(255,255,255,0.06)
- On mobile (< 768px): transforms into a horizontal bottom strip showing 
  current step name + prev/next arrows
```

### Prompt 3 — Landing Screen (in-app, post-login)
```
Design the landing/home screen for a logged-in user of Aura Studio, 
a dark cinema AI music video web app.

Layout: two-column (left ~300px context panel, right flex action area)
Left panel content:
  - "── Welcome back" in JetBrains Mono, cyan, 10px, uppercase, letter-spaced
  - "Hello, [name]." in Fraunces italic, 52px, white
  - 2-line description in Geist, 14px, text-muted color
  
Right panel content:
  - Large primary CTA card with violet gradient background:
    - "── Begin · Step 01" label in mono
    - "A Music Video" in Fraunces italic, 28px
    - Short description
    - ArrowRight icon, right-aligned
    - Hover: lifts with violet glow
  - Row of 3 "Coming Soon" format chips below (Single Release, Performance Cut, Narrative Edit)
    - Small, dark, rounded, with "SOON" mono badge

Bottom: horizontal scrollable row of 4 workflow step cards 
(Track 01, Plan 02, Generate 03, Assemble 04) with lucide icons.

Color: background #060608, primary violet #7C3AED, secondary rose #EC4899
```

### Prompt 4 — Dashboard (Project Library)
```
Design the project dashboard page for Aura Studio, a dark cinema AI music 
video web app.

Top header bar (64px):
  - Left: "Good morning, Rohit." in Fraunces italic, 22px
  - Right: Credits badge (amber #F59E0B, pill, "120 credits") + 
    "New Project" button (violet gradient, 12px border-radius)

Project grid:
  - 3-column CSS grid, gap 20px
  - Each project card (aspect ~3:4):
    - Top third: gradient color block — one of 6 cinematic palettes:
      (violet→rose, indigo→cyan, amber→red, teal→emerald, slate→violet, rose→amber)
      with a diagonal stripe pattern suggesting a film clapperboard
    - Bottom portion: dark bg with project title (Fraunces italic, 18px),
      "Updated 2 days ago" (mono, 10px, muted), step progress chip "07 / Shots"
    - Hover: overlay with "Open" button centered + violet border glow
    - Top-right: subtle delete icon (×) on hover
  - First card (empty state, or "new project"): dashed border, centered + icon, 
    "New project" in Geist 14px muted

Background: #060608 with violet/rose aurora, same as rest of app
```

### Prompt 5 — Upload Audio Screen (Step 02)
```
Design the audio upload screen (Step 02) for Aura Studio dark cinema web app.

Two-column layout:
Left context panel (300px):
  - Step kicker: "02 · Audio" in mono cyan
  - Title: "The track is the foundation." in Fraunces italic, 40px
  - Subtitle: 13px body copy about uploading a song
  - "Supported: MP3, WAV, M4A · up to 50MB" in mono muted

Right action panel:
  - Large drag-and-drop zone (full height, dashed violet border that 
    slowly pulses/rotates), with:
    - Upload icon (centered, violet, 40px)
    - "Drop your track here" in Fraunces italic, 18px
    - "or click to browse" in mono 11px muted
    - On file selected: shows filename + waveform visualization 
      (simplified SVG bars, violet colored)
  
  - If audio loaded: custom audio player with:
    - Play/Pause button (violet circle, 44px)
    - Scrubber bar (violet fill, #surface track)
    - Current time / total time in mono
    - "Analyse Track" primary violet button below player
  
  - Generation progress: horizontal film-strip scanner line 
    (thin violet beam sweeping left-to-right) with step labels below

Background: #060608, violet aurora faint
```

---

## 15. Implementation Notes for Claude Code

1. **Install no new npm packages** unless absolutely necessary. The project already has `lucide-react`, `clsx`, `tailwind-merge`, and Next.js.

2. **The StageRail component** must accept the same props as the current `TopBar`:
   ```js
   <StageRail 
     activeScreen={activeScreen} 
     onNavigate={onNavigate} 
     userName={userName} 
     projectName={projectName} 
   />
   ```
   Update `src/app/create/[projectId]/page.js` to import `StageRail` instead of `TopBar`.

3. **CSS approach:** Keep all styling in `globals.css` (the project doesn't use Tailwind component classes). Replace/add CSS classes wholesale.

4. **The `workflow-app` and `workflow-shell` layout classes** need to be updated to accommodate the StageRail:
   ```css
   .workflow-app { 
     display: grid;
     grid-template-columns: 64px 1fr;  /* rail + content */
     grid-template-rows: 48px 1fr;     /* topstrip + main */
     height: 100dvh;
   }
   ```

5. **Keep all API calls, state management, and business logic unchanged.** Only visual components need updating.

6. **Test each screen** after implementing to ensure the layout doesn't break any existing form/action behavior.

7. **Stitch MCP usage:** Use Stitch to generate the visual design for each screen, then translate Stitch's output into the actual React/CSS code for each component file.
