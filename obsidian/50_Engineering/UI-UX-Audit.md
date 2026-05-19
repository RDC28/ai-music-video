# UI/UX Audit — Aura Studio
*Reviewed 2026-05-19 · 60 issues · Critical → Minor*

---

## How to read this

Each entry follows:
> **Issue** — what is wrong and where  
> **Suggestion** — the fix

Severity codes: 🔴 Critical · 🟠 Significant · 🟡 Polish · 🔵 Minor

---

## 1. Colour & Semantic Tokens

### 🔴 C-01 — Warning and Error are the same colour
**Issue:** `--warning` and `--error` are both `var(--violet-400)` ([globals.css:164-165](../50_Engineering/../../../src/app/globals.css)). A failed generation and a cautionary notice look identical. Users cannot distinguish "something broke" from "something to be aware of."  
**Suggestion:** Set `--error` to a warm red (`#F87171` or similar) and `--warning` to an amber (`#FBBF24`). Violet should stay as the accent/interactive colour only.

---

### 🔴 C-02 — Success is the brand colour
**Issue:** `--success: var(--cyan-400)`. Cyan is used everywhere as the primary brand colour. Success states (completed steps, approved clips, generated frames) visually blend into ordinary UI — they are indistinguishable from "active" or "selected" states.  
**Suggestion:** Use a distinct emerald green (`#34D399`) for `--success`. It is neutral enough to work on dark backgrounds and universally read as "good."

---

### 🟠 C-03 — `--text-subtle` likely fails WCAG AA contrast
**Issue:** `--text-subtle: rgba(var(--cyan-300-rgb), 0.42)` ([globals.css:100](../../../src/app/globals.css)). At 42% opacity of cyan-300 on `--bg-deep` (#090C13), this is well below the 4.5:1 ratio required for normal text. It appears in metadata labels, helper text, and empty state copy.  
**Suggestion:** Raise to `rgba(var(--cyan-300-rgb), 0.60)` minimum. Better: map it to a named opacity step in the palette system rather than a magic number.

---

### 🟠 C-04 — `.tag-orange` renders cyan
**Issue:** The class is named `tag-orange` but styled with `background: var(--cyan-dim); color: var(--cyan)` ([globals.css:1511-1523](../../../src/app/globals.css)). This is a leftover from the alias era (`--orange: var(--violet-400)`). Every screen using `tag-orange` expecting a warm colour gets blue-green.  
**Suggestion:** Rename to `tag-accent` or `tag-cyan`, or restyle it with the violet colour to create actual visual differentiation from `tag-teal`.

---

### 🟠 C-05 — `.tag-teal` and `.tag-orange` are identical
**Issue:** Both render with `background: var(--cyan-dim); color: var(--cyan); border: var(--cyan-border)`. Two names for one style.  
**Suggestion:** Consolidate into one class (`tag-accent`). If two badge variants are needed they must differ visually.

---

### 🟡 C-06 — `--border` is nearly invisible
**Issue:** `--border: rgba(var(--cyan-300-rgb), 0.06)` ([globals.css:103](../../../src/app/globals.css)). At 6% opacity, card borders are often imperceptible — cards blend into their background. Users lose structural separation between panels.  
**Suggestion:** Raise `--border` to `0.09` opacity minimum. `--border-mid` at `0.11` is the practical minimum for readable separation. Reserve the near-invisible value for truly decorative outlines only.

---

### 🟡 C-07 — `--border-bright` and `--cyan-border` are identical values
**Issue:** `--border-bright: rgba(var(--cyan-rgb), 0.30)` and `--cyan-border: rgba(var(--cyan-rgb), 0.30)` ([globals.css:84,105](../../../src/app/globals.css)). Same value, two names. Developers are forced to guess which to use where.  
**Suggestion:** Delete `--border-bright` and use `--cyan-border` consistently for all active/focused border contexts.

---

### 🔵 C-08 — Danger button loses its danger signal on hover
**Issue:** `.btn-action-danger:hover` sets `color: var(--text)` ([globals.css:1150](../../../src/app/globals.css)), switching from the violet danger colour to the full-brightness text colour. The button looks *less* threatening at the moment of click — backwards affordance.  
**Suggestion:** Keep `color: var(--violet-400)` on hover. Only intensify `border-color` and `background` for feedback; never remove the semantic colour.

---

## 2. Typography & Text Visibility

### 🔴 T-01 — Step numbers in StageRail are unreadably small
**Issue:** `.stage-rail-step-num { font-size: 0.5rem }` ([globals.css:812](../../../src/app/globals.css)). At 8px equivalent, two-digit step numbers like "10" are illegible at any browser zoom below 125%. The information value of step numbering is lost.  
**Suggestion:** Raise to `0.6875rem` minimum. At this size in a monospace font, "10" reads clearly at 100% zoom.

---

### 🟠 T-02 — Input and textarea have no focus state
**Issue:** `.input-inset` and `.textarea-inset` both set `outline: none` ([components.css:1221,1234](../../../src/app/components.css)) with no replacement focus style. Only `.brain-textarea` has a custom `:focus` state. Clicking into any other input gives zero visual confirmation that it is active.  
**Suggestion:** Add to both classes:
```css
.input-inset:focus, .textarea-inset:focus {
  border-color: var(--cyan-border);
  box-shadow: var(--neo-inset), 0 0 0 0.0625rem var(--cyan-border);
}
```

---

### 🟠 T-03 — Inputs and selects have no hover state
**Issue:** `.input-inset`, `.textarea-inset`, `.select-std`, `.select-model` — none define a `:hover` style. On a dark interface, text fields are hard to spot. With no hover response, users cannot tell if an element is interactive before clicking.  
**Suggestion:** Add a subtle border brightening on hover: `border-color: var(--border-mid)` → `border-color: rgba(var(--cyan-300-rgb), 0.18)`. One line, significant improvement in affordance.

---

### 🟠 T-04 — No placeholder colour on general inputs
**Issue:** Only `.brain-textarea::placeholder` defines a placeholder colour ([globals.css:1779](../../../src/app/globals.css)). `.input-inset` and `.textarea-inset` inherit browser default placeholder colour (typically grey-50% white), which clashes with the dark neomorphic surface and breaks the design language.  
**Suggestion:** Add to both input classes: `::placeholder { color: var(--text-muted); }`.

---

### 🟠 T-05 — `.field-note` text at 0.6875rem is too small for creative guidance
**Issue:** `.field-note { font-size: 0.6875rem }` ([components.css:2259](../../../src/app/components.css)). This is the helper text under form controls — for a creative tool it often contains critical instructions ("Audio stays muted so the edit stays synced"). At 11px equivalent it is advisory text that gets ignored.  
**Suggestion:** Raise to `0.75rem`. The content justifies readability.

---

### 🟡 T-06 — `.form-label` at 0.75rem uppercase mono is visually heavy
**Issue:** Form labels use `font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em` ([components.css:1995-2003](../../../src/app/components.css)). Space Mono in all-caps with 0.1em tracking reads as shouting in a tool meant for creative flow. Labels dominate the forms more than the inputs themselves.  
**Suggestion:** Either use the display font at normal case, or reduce letter-spacing to `0.05em`. Mono uppercase is fine for data labels (counters, codes) but not for conversational form fields like "Video Prompt" or "Shot Description."

---

### 🟡 T-07 — Textarea `resize: vertical` has no `max-height`
**Issue:** `.textarea-inset { resize: vertical }` ([components.css:1235](../../../src/app/components.css)) with no `max-height` constraint. A user dragging a prompt textarea can grow it to fill the entire panel, pushing all action buttons off screen.  
**Suggestion:** Add `max-height: 20rem` to `.textarea-inset`. This allows comfortable resizing without breaking surrounding layout.

---

### 🟡 T-08 — `font-weight: 650` is a non-standard value
**Issue:** `font-weight: 650` appears across `.btn-teal`, `.btn-outline`, `.btn-outline-small` ([globals.css:1008,1174,1215](../../../src/app/globals.css)). CSS variable fonts support arbitrary weights, but Space Grotesk and DM Sans will round to 600 or 700 depending on the browser. The intent is ambiguous.  
**Suggestion:** Replace `650` with either `600` (semi-bold) or `700` (bold) explicitly. Pick whichever is visually correct and commit to it.

---

### 🟡 T-09 — `--font-serif` is not a serif font
**Issue:** `--font-serif: var(--font-grotesk)` ([globals.css:111](../../../src/app/globals.css)). Space Grotesk is a geometric sans-serif. Any component reaching for `--font-serif` to add editorial weight or typographic contrast gets the same grotesque as the display title — zero differentiation.  
**Suggestion:** Either load a real serif (e.g., DM Serif Display for editorial headings), or delete the `--font-serif` token and replace any uses with `--font-display`.

---

### 🔵 T-10 — `--text-muted` at 56% is borderline for small text
**Issue:** `--text-muted: rgba(var(--cyan-300-rgb), 0.56)` ([globals.css:99](../../../src/app/globals.css)). Used extensively for step numbers, metadata labels, and secondary content at `0.6875rem–0.75rem` font sizes. At these sizes and opacity on `--ink-900`, the 4.5:1 WCAG AA contrast ratio may not be met.  
**Suggestion:** Raise to `0.65` opacity at minimum, or reserve `--text-muted` only for sizes ≥ `1rem`.

---

### 🔵 T-11 — The edit panel heading "Clip." is orphaned punctuation
**Issue:** [VideosScreen.js:791](../../../src/components/screens/VideosScreen.js). The heading inside the clips edit panel is the single word `"Clip."` — a trailing period on a one-word heading. It reads as a placeholder that was never finished.  
**Suggestion:** Make it contextual: `Shot {n+1}` or `Edit Clip {n+1}`. The user needs to know *which* clip they are editing, especially if the list has scrolled away.

---

## 3. Buttons — Placement, Visibility, Hierarchy

### 🔴 B-01 — "Approve All" and "Regenerate All" have no confirmation
**Issue:** [VideosScreen.js:679-682](../../../src/components/screens/VideosScreen.js). Both "Approve All" (advances to the final step) and "Regenerate All" (overwrites every generated clip) are single-click with no dialog. A creative person reviewing clips can lose all their approved work with one misclick.  
**Suggestion:** Both need a confirmation step. "Approve All" should show a count (`Approve all 33 clips and continue?`). "Regenerate All" needs a destructive warning since it replaces completed clips.

---

### 🔴 B-02 — "Generate New" in the edit panel has no confirmation when overwriting
**Issue:** [VideosScreen.js:901](../../../src/components/screens/VideosScreen.js). If a clip already has a generated video, "Generate New" silently overwrites it. The button label changes to "Try Again" only on error — not on replace. Creatives lose approved takes accidentally.  
**Suggestion:** When `selectedShot.video_url` exists, change the button to `"Replace Clip"` and add a single confirmation step or at minimum a visual warning (`"This will replace your existing clip"`).

---

### 🟠 B-03 — Model selector is duplicated with no sync feedback
**Issue:** The video model selector appears both in the clips page header and inside each clip's edit panel ([VideosScreen.js:664](../../../src/components/screens/VideosScreen.js)). Changing the header dropdown doesn't visually update the panel dropdown. Users believe they can set a per-clip model but they're setting a global one.  
**Suggestion:** Remove the header model selector. Keep it only in the edit panel per-clip. If a global default is needed, put it in a settings page — not competing with per-clip controls.

---

### 🟠 B-04 — "Regenerate Prompt" is below "Generate New" — wrong order
**Issue:** [VideosScreen.js:898-905](../../../src/components/screens/VideosScreen.js). The creative flow is: refine prompt → generate. But in the panel, "Generate New" (the final action) appears *above* "Regenerate Prompt" (the refinement action). Users will click Generate before refining.  
**Suggestion:** Reorder: Regenerate Prompt first, then Generate New below. The panel should read top-to-bottom as the creative workflow.

---

### 🟠 B-05 — All action buttons in the clips header have equal visual weight
**Issue:** [VideosScreen.js:666-684](../../../src/components/screens/VideosScreen.js). Four buttons — model select, Generate Remaining, Regenerate All, Approve All — appear at the same visual weight. There is no primary action. Creatives scanning the header cannot instantly find what to press next.  
**Suggestion:** "Generate Remaining" (most common next action) should be the primary button. "Regenerate All" (destructive) should be outline/ghost. "Approve All" (final step) should use the confirm/green variant. One dominant CTA, two supporting options.

---

### 🟠 B-06 — `.modal-close-btn` is 1.75rem (28px equivalent) — below minimum touch target
**Issue:** [components.css:1007-1008](../../../src/app/components.css). The `×` button on panels is 28px. WCAG 2.5.5 recommends 44×44px minimum. On a MacBook trackpad or any touch device this is frustrating to hit precisely.  
**Suggestion:** Increase to `2.75rem × 2.75rem` (44px equivalent). The visual icon size stays at 13px; only the clickable area grows.

---

### 🟠 B-07 — `.icon-btn` is 2rem (32px equivalent) — still below minimum touch target
**Issue:** [components.css:2012-2013](../../../src/app/components.css). All icon buttons (move up/down, delete, duplicate in the shots screen) are 32px. Used extensively in dense row layouts where precise clicking is already harder.  
**Suggestion:** Minimum `2.75rem`. If space is tight, use `padding` to grow the hit area while keeping the visual size with `width/height` on the inner icon.

---

### 🟠 B-08 — "Generate" button on each clip card opens a panel instead of generating
**Issue:** [VideosScreen.js:739-741](../../../src/components/screens/VideosScreen.js). The card label says `"Generate"` but clicking it opens the edit panel — it does not start generation. Meanwhile the header has a "Generate Remaining" that actually generates. Two Generate affordances with different behaviours.  
**Suggestion:** Rename the card button to `"Edit & Generate"` or `"Configure"` to set accurate expectations. Or make it truly generate with the current prompt without opening the panel (add a ⚡ quick-generate icon button separately).

---

### 🟡 B-09 — Five different disabled opacities across button variants
**Issue:** `.btn-primary:disabled` → `0.48`, `.btn-teal:disabled` → `0.46`, `.btn-confirm:disabled` → `0.4`, `.btn-action-generate:disabled` → `0.46`, `.btn-outline:disabled` → `0.46` ([globals.css:990-1200](../../../src/app/globals.css)). Disabled buttons appear at slightly different brightness levels, creating a jagged disabled state.  
**Suggestion:** Use one value: `opacity: 0.45`. Define it as a CSS variable `--disabled-opacity: 0.45` and reference it in every disabled rule.

---

### 🟡 B-10 — `.btn-primary`, `.btn-confirm`, and `.btn-action-generate` are visually identical
**Issue:** Three separate class names, same gradient, same border colour, same shadow, same hover ([globals.css:951-1123](../../../src/app/globals.css)). Any design intent (primary vs confirm vs generate) is invisible to the user.  
**Suggestion:** Collapse to two: `.btn-primary` (cyan gradient, for main CTAs) and `.btn-confirm` (green-tinted, for final approvals). Delete `.btn-action-generate` or alias it to one of the above.

---

### 🟡 B-11 — `.btn-outline` and `.btn-ghost` are identical
**Issue:** [globals.css:1163-1203](../../../src/app/globals.css). Same background, same border, same hover. Pick one name, delete the other.  
**Suggestion:** Keep `.btn-outline`. Remove every instance of `.btn-ghost` and replace with `.btn-outline`.

---

### 🟡 B-12 — `.btn-teal` and `.btn-secondary` are identical
**Issue:** [globals.css:997-1038](../../../src/app/globals.css). Same styling, two names. `btn-teal` implies a teal colour that does not exist in this palette.  
**Suggestion:** Keep `.btn-secondary`, delete `.btn-teal`. The teal/cyan distinction in the token system (`--teal = --cyan-500`) should not leak into button class names.

---

### 🔵 B-13 — `will-change: transform` on every button, always
**Issue:** All six button variants declare `will-change: transform` at rest ([globals.css:973,1017,1061,1104,1143,1182](../../../src/app/globals.css)). This permanently promotes every button to its own GPU compositing layer. A screen with 20 buttons holds 20 compositor layers at all times.  
**Suggestion:** Remove `will-change: transform` from the default state. Add it only on `:hover` or `:active` via a transition, or apply it dynamically in JS only during interactions.

---

## 4. Inputs, Textboxes & Form Controls

### 🟠 I-01 — All form selects (`select-std`, `select-model`, `select-sm`) have no focus state
**Issue:** All three select variants set `outline: none` ([components.css:740,751,765](../../../src/app/components.css)) with no replacement focus style. A creative tabbing through form fields has no visual anchor when a dropdown is focused.  
**Suggestion:** Add `:focus` styling matching the input focus style: `border-color: var(--cyan-border); box-shadow: 0 0 0 0.0625rem var(--cyan-border)`.

---

### 🟠 I-02 — Duration select in clips edit panel offers no context
**Issue:** [VideosScreen.js:876](../../../src/components/screens/VideosScreen.js). The duration dropdown shows `"5s"`, `"6s"`, `"8s"` with no indication of what those durations mean in the context of the shot (e.g., the shot's planned duration from the shot list). A creative may not know if their planned 4-second shot needs a 5s or 6s clip.  
**Suggestion:** Show the shot's planned duration next to the select: `Shot planned: 4.2s`. Highlight the recommended duration option.

---

### 🟠 I-03 — No character counter on the prompt textarea
**Issue:** The video prompt textarea in the clips edit panel ([VideosScreen.js:862](../../../src/components/screens/VideosScreen.js)) has a `max` of approximately 6400 chars in the backend logic but the UI shows nothing. A creative who writes a long detailed prompt has no idea if they're within bounds.  
**Suggestion:** Add a live character counter below the textarea: `"843 / 6400"`. Show it in `--text-muted` colour; turn orange at 80% full, red at 95%.

---

### 🟡 I-04 — Prompt textarea in the edit panel is too short for detailed creative direction
**Issue:** `minHeight: '7.5rem'` ([VideosScreen.js:866](../../../src/components/screens/VideosScreen.js)). The video prompt for a single shot can be several paragraphs (character direction, camera movement, lighting, action timing). At 7.5rem the user sees 3-4 lines and must scroll the textarea constantly.  
**Suggestion:** Increase `minHeight` to `12rem`. The panel scrolls independently so this does not break any outer layout.

---

### 🟡 I-05 — No "Copy Prompt" action on generated prompts
**Issue:** Creatives working iteratively want to copy a working prompt to use as a base for another shot. There is no clipboard button on the prompt textarea.  
**Suggestion:** Add a small copy icon (`Clipboard size={12}`) in the top-right corner of the textarea area, visible on hover. One click copies the current prompt text to clipboard.

---

### 🟡 I-06 — The audio upload drop zone uses near-invisible dashed border
**Issue:** `.audio-drop-zone { border: 0.125rem dashed var(--border-mid) }` ([components.css:2073](../../../src/app/components.css)). `--border-mid` is 11% opacity cyan. A dashed line at 11% opacity on a dark surface is barely visible — the primary upload CTA disappears on first load.  
**Suggestion:** Use `var(--border-bright)` (30% opacity) for the dashed border. On hover/drag use `var(--cyan-border)` for strong feedback.

---

### 🔵 I-07 — `.textarea-inset` `resize: vertical` can destroy layout
**Issue:** [components.css:1235](../../../src/app/components.css). With no `max-height`, the vertical resize handle lets users drag the textarea to cover the entire panel, pushing buttons out of view.  
**Suggestion:** Add `max-height: 20rem`. Creative users resize for comfort, not to fill the screen.

---

## 5. Navigation & Layout

### 🟠 N-01 — StageRail connector lines never render (clipped by overflow)
**Issue:** The `::after` connector line between steps is positioned at `top: calc(100% + 0.125rem)` — below the button's own box — but the button has `overflow: hidden` ([globals.css:873](../../../src/app/globals.css)). The connectors are defined but permanently clipped. Users see no visual link between steps.  
**Suggestion:** Either remove `overflow: hidden` from `.stage-rail-step` (use `overflow: visible` and clip only on `.stage-rail-steps` wrapper), or move the connector to a pseudo on `.stage-rail-steps` container instead.

---

### 🟠 N-02 — `--stage-rail-current-width` defaults to the expanded width
**Issue:** `--stage-rail-current-width: 12.5rem` ([globals.css:140](../../../src/app/globals.css)). If JavaScript fails to run or hydrate before first paint, the sidebar renders fully expanded, causing a layout flash on every page load.  
**Suggestion:** Set the default to `3.75rem` (collapsed). The JS then expands it when the saved state is read.

---

### 🟡 N-03 — Project name in topstrip truncates too early
**Issue:** `.topstrip-project { max-width: 13.75rem }` ([globals.css:484](../../../src/app/globals.css)). A project name like "Batein Teri v4 — Final Cut Mix" truncates at 220px equivalent — and there's no tooltip. The user loses track of which project they're in on every screen.  
**Suggestion:** Remove the `max-width` or raise it to `25rem`. Add a `title` attribute (or Radix Tooltip) so the full name is accessible on hover.

---

### 🟡 N-04 — Screen kicker uses inconsistent decorators
**Issue:** Across screens, the kicker line (small label above the title) uses `"▪ Clips · Render"`, `"• Story"`, `"◈ Planning"` — three different bullet/symbol styles with no standard.  
**Suggestion:** Pick one: `▸` or `·` or nothing. Apply it from a shared constant or CSS pseudo, not hardcoded per-screen.

---

### 🟡 N-05 — Tag badges in shot rows show no hover state despite being filters
**Issue:** Shot row tags (shot size, movement, character) appear as `.tag-badge` chips. They look clickable (and appear to be used as filters in some screens) but have no `:hover`, no `cursor: pointer`, no active state.  
**Suggestion:** Add `cursor: pointer; transition: border-color 120ms ease, background 120ms ease` and a hover border-colour lift. If not clickable in that screen, use a slightly different style to distinguish non-interactive labels.

---

### 🔵 N-06 — Mobile fallback is a completely separate navigation component
**Issue:** `.stage-rail-mobile` ([globals.css:908](../../../src/app/globals.css)) is a second, independent bottom-strip navigation. It duplicates step prev/next controls that already exist in the desktop topstrip. On tablet-sized windows both can appear simultaneously.  
**Suggestion:** Use a single source of navigation truth. The desktop topstrip should collapse into a mobile variant at the same breakpoint the sidebar is hidden. Delete `.stage-rail-mobile` and adapt `.workflow-topstrip` for mobile.

---

## 6. Status, Feedback & Generation UX

### 🟠 F-01 — Generation status messages live inside the page header
**Issue:** `queueSummary` and `generationError` render inside `.clips-header-status` ([VideosScreen.js:689-692](../../../src/components/screens/VideosScreen.js)). During a long queue run the header grows taller, visually compressing the gallery. The gallery jumps. Messages compete with the title hierarchy.  
**Suggestion:** Implement a toast/notification system. Status messages should slide in from the bottom-right (out of the way of content) and auto-dismiss for informational updates. Errors should stay visible until dismissed.

---

### 🟠 F-02 — Error messages and queue messages have identical visual weight
**Issue:** `.queue-msg` and `.queue-msg--error` differ only in text colour ([components.css:1130-1138](../../../src/app/components.css)). No icon, no border, no background difference. During a queue run with partial failures, users must read every line to find the error.  
**Suggestion:** Give error messages: a `var(--error)` left border, a subtle red background tint (`rgba(var(--error-rgb), 0.06)`), and a `<AlertTriangle>` icon prefix.

---

### 🟠 F-03 — No time estimate on generation progress
**Issue:** The BrainDump progress bar ([BrainDumpScreen.js](../../../src/components/screens/BrainDumpScreen.js)) shows step names but no time estimate. Veo video generation can take 3–8 minutes per clip. Users don't know if they should wait or leave.  
**Suggestion:** Show elapsed time (`Generating · 0:42`) alongside the status message. Even a rough estimate ("typically 3–6 min") reduces anxiety.

---

### 🟠 F-04 — Clips page "Editing" state indicator is on the card, not the panel
**Issue:** [VideosScreen.js:739](../../../src/components/screens/VideosScreen.js). When a clip is being edited, the card shows `"Editing"` as the top-right label. But the panel has no breadcrumb showing which shot it belongs to. If the gallery has scrolled away, there's no context for what you're editing.  
**Suggestion:** Add `Shot {i+1} of {total}` as a subtitle in the edit panel header, directly below "Edit Clip."

---

### 🟡 F-05 — "Generate Remaining" shows count but "Regenerate All" does not
**Issue:** [VideosScreen.js:676-681](../../../src/components/screens/VideosScreen.js). "Generate Remaining (32)" tells you how many clips will be processed. "Regenerate All" gives no count. A user with 33 clips doesn't know if "all" means 3 or 33.  
**Suggestion:** Change to `"Regenerate All ({shots.length})"` to set consistent expectations.

---

### 🟡 F-06 — BrainDump generation error shows a JS `alert()`
**Issue:** [BrainDumpScreen.js](../../../src/components/screens/BrainDumpScreen.js). If generation fails, the screen calls `alert("We could not create the plan...")`. Native browser alerts are jarring, modal blocking, and styled in the OS — completely breaking the Aura Studio aesthetic.  
**Suggestion:** Replace with an in-screen error state: show the error in the same region as the progress bar, with a "Try Again" button. No JS alert.

---

### 🔵 F-07 — Spin animation is linear — feels mechanical
**Issue:** `.spin { animation: spin 1s linear infinite }` ([components.css:1047-1049](../../../src/app/components.css)). Linear rotation is the most robotic-feeling loader. It doesn't match the `ease-premium` motion language used elsewhere.  
**Suggestion:** Change to `animation: spin 0.8s cubic-bezier(0.5, 0, 0.5, 1) infinite` for a subtle ease-in/ease-out feel that reads as organic, not mechanical.

---

## 7. Creative Workflow Friction

### 🟠 W-01 — No undo for any generation action
**Issue:** Every generation, regeneration, and upload permanently overwrites the previous result with no undo. A creative who accidentally clicks "Generate New" on an approved clip loses it.  
**Suggestion:** Store the previous `video_url` in shot state as `previous_video_url`. Show an "Undo" link for 30 seconds after overwrite. This is a one-line state change that saves hours of re-generation.

---

### 🟠 W-02 — No way to batch-select specific shots for generation
**Issue:** The clips page has "Generate Remaining" (all incomplete) or per-card generation. There's no multi-select to queue, say, shots 3, 7, and 12 specifically.  
**Suggestion:** Add checkbox multi-select on cards (visible on hover). Replace header button with "Generate Selected" when any cards are checked, "Generate Remaining" otherwise.

---

### 🟡 W-03 — Model capabilities are invisible in the dropdown
**Issue:** The model selector shows names: "Veo 3.1", "Veo 2", "Kling", "Seedance". No indication of resolution, quality, max duration, or cost. Creatives have to remember outside of the tool what each model can do.  
**Suggestion:** Add a subtle `option` group description or a separate `<select>` tooltip/badge showing: `Veo 3.1 · 1080p · up to 8s` for the selected model.

---

### 🟡 W-04 — Shot prompt is truncated to 2 lines in the shot list
**Issue:** Shot prompts in the shots screen are clamped at `-webkit-line-clamp: 2`. These prompts are the primary creative direction for each shot — 2 lines hides almost all of a detailed prompt.  
**Suggestion:** On hover, expand to show the full prompt (tooltip or smooth height animation). Alternatively, add an `"expand"` toggle per row. Creatives need to read the direction to evaluate it.

---

### 🟡 W-05 — No empty-state guidance when no shots exist on the Clips screen
**Issue:** [VideosScreen.js:759-767](../../../src/components/screens/VideosScreen.js). The empty state shows a `<Video>` icon and `"No shots to display. Please add shots in the Shot List step first."` — functional but cold. A creative landing here without shots gets no warmth or context.  
**Suggestion:** Make the empty state encouraging: `"Your clips will live here. Head to Shots to plan your sequence first."` with a direct `"Go to Shots →"` button. This is a creative tool, not a spreadsheet.

---

### 🔵 W-06 — "Bring frames to life." title is the same regardless of project state
**Issue:** [VideosScreen.js:653](../../../src/components/screens/VideosScreen.js). The screen title is static. Whether a project has 0 clips or 32 generated clips, it says the same thing. The title is not responsive to context.  
**Suggestion:** When `generatedCount > 0`, change to something like `"33 moments. Let's make them move."` — it costs nothing and makes the tool feel alive.

---

## 8. Design System Debt

### 🟡 D-01 — `@keyframes ellipsisDance` modifies `content:` — only works on pseudo-elements
**Issue:** [globals.css:326-331](../../../src/app/globals.css). This animation changes `content:` values. `content` is only animatable on `::before`/`::after` pseudo-elements; applying it to real elements does nothing.  
**Suggestion:** Either wrap uses in a `::after` pseudo-element, or replace with a JS-driven `.` `.`.` animation on a real element.

---

### 🟡 D-02 — `--stage-rail-current-width` defaults to the wrong value
Already covered in N-02 — but the root variable being wrong also means that any `calc()` using it in initial layout gets the wrong number before JS runs.

---

### 🟡 D-03 — Body renders 4 compositing layers permanently
**Issue:** `body` has a 3-layer background (2 radials + 1 linear gradient) plus a `position: fixed; body::before` dot-grid pseudo. That's 4 GPU layers on the background before any content renders.  
**Suggestion:** Merge the dot grid into one of the body gradient layers using a combined `background-image`. Reduces to 2 layers with no visual difference.

---

### 🟡 D-04 — `body { scroll-behavior: smooth }` on `html` without a reduced-motion guard
**Issue:** [globals.css:172](../../../src/app/globals.css). Set unconditionally. The `@media (prefers-reduced-motion: reduce)` block exists further down but `scroll-behavior: smooth` must be inside it.  
**Suggestion:** Move to: `@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }`.

---

### 🔵 D-05 — Neo-shadow offsets are too large for small elements
**Issue:** `--neo-raised` uses `0.85rem` X/Y offsets ([globals.css:123](../../../src/app/globals.css)). On a small button or tag badge, the shadow footprint is larger than the element itself. At high browser zoom, shadows become cartoonishly large.  
**Suggestion:** Introduce a smaller shadow scale: `--neo-raised-sm` with `0.35rem` offsets for use on compact components (tags, icon buttons, small cards).

---

### 🔵 D-06 — `999rem` border-radius is excessive
**Issue:** `border-radius: 999rem` appears on scrollbar thumbs and pill-shaped elements ([globals.css:26,31](../../../src/app/globals.css)). While harmless, it is a signal of defensive code.  
**Suggestion:** `62.5rem` is sufficient to guarantee a pill shape on any realistic element. More importantly, set a `--radius-pill: 62.5rem` token and use it consistently instead of repeating a magic number.

---

*End of audit — 60 issues total.*  
*Priority order for a sprint: C-01, C-02, T-02, B-01, B-02, F-01, I-03, N-01.*
