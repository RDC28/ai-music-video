# Aura Studio — Design System (Updated)

## 1) Product Intent

**Product name:** Aura AI Studio  
**Product type:** AI music-video production platform (script -> shots -> media -> assembly)  
**Audience:** Creators managing dense multi-step generation workflows  
**Design goal:** Premium cinematic interface with artistic character and professional clarity

This design system prioritizes:
- consistency for muscle memory
- semantic action clarity
- dense-but-readable workflows
- polished motion without visual noise

---

## 2) Non-Negotiable UX Rules

1. The left-most app panel is **StageRail only**. No per-screen content in that panel.
2. StageRail is **expanded by default** and collapses only by explicit hamburger click.
3. Top strip, StageRail, center panel, and right panel must align on shared vertical boundaries.
4. Progress/navigation controls live only in StageRail + top strip. No duplicate in-page progression CTA buttons.
5. Similar actions keep consistent placement across screens.
6. Panel resize must reflow content; no clipping/cutoff.
7. Right panel may be empty until selection; show hint copy instead of placeholder controls.
8. All icon-only controls must have minimum 44x44 hit area.

---

## 3) Color System

Hard constraint: use only these palette families unless explicitly approved.

### Ink
- `--ink-950: #090C13`
- `--ink-900: #111723`
- `--ink-800: #1A2231`

### Cyan (Primary Accent)
- `--cyan-500: #3DD6F5`
- `--cyan-400: #74E6FF`
- `--cyan-300: #B6F3FF`

### Violet (Secondary Accent)
- `--violet-500: #8071FF`
- `--violet-400: #A99FFF`

### Semantic Colors
- `--success-rgb: 52, 211, 153`
- `--warning-rgb: 251, 191, 36`
- `--error-rgb: 248, 113, 113`
- `--disabled-opacity: 0.45`

### Semantic Usage
- Success is only for completed/approved states.
- Warning is only for cautionary states.
- Error is only for failures.
- Cyan is brand/interactive, not success.

---

## 4) Typography

### Families
- `--font-display: Space Grotesk`
- `--font-body: DM Sans`
- `--font-mono: Space Mono`

### Type Scale
- `--type-xs: 0.6875rem`
- `--type-sm: 0.8125rem`
- `--type-md: 0.9375rem`
- `--type-lg: 1.125rem`
- `--type-xl: 1.5rem`
- `--type-2xl: 2.125rem`

### Text Tokens
- `--text: var(--cyan-300)`
- `--text-soft: rgba(var(--cyan-300-rgb), 0.78)`
- `--text-muted: rgba(var(--cyan-300-rgb), 0.65)`
- `--text-subtle: rgba(var(--cyan-300-rgb), 0.60)`

### Label Rules
Use monospace uppercase labels for metadata/kickers only. Avoid overusing uppercase mono for conversational form labels.

---

## 5) Spacing, Radius, Units

All CSS length values use `rem`. Media query breakpoints use `em`.

### Radius
- `--radius-sm: 0.5rem`
- `--radius: 0.75rem`
- `--radius-lg: 1rem`
- `--radius-xl: 1.25rem`
- `--radius-2xl: 1.75rem`
- `--radius-pill: 62.5rem`

### Shell Tokens
- `--stage-rail-width: 3.75rem`
- `--stage-rail-expanded: 12.5rem`
- `--topstrip-height: 2.75rem`

---

## 6) Layout Architecture

## 6.1 Global Shell

```
┌────────────────┬───────────────────────────────────────────────┐
│                │ Top Strip                                     │
│ StageRail      ├───────────────────────────────────────────────┤
│ (Panel 1)      │ Center Panel (Panel 2)  | Right Panel (Panel 3)
│                │                                                 
└────────────────┴───────────────────────────────────────────────┘
```

- Panel 1: StageRail only.
- Panel 2: Primary content workspace.
- Panel 3: Technical controls / generation / edit inspector.

## 6.2 Resize Behavior

- Dividers are draggable with min/max constraints.
- Double-click divider resets to default widths.
- Center and right panels must use responsive internals (`minmax`, wrapping, scroll containers) to prevent clipping.
- Avoid fixed internal widths when a panel is resizable.

## 6.3 Responsive Rules

- `max-width: 80em`: reduce right panel default width.
- `max-width: 64em`: right panel becomes overlay drawer for edit states.
- `max-width: 48em`: StageRail collapses by default; top strip remains primary context bar.

---

## 7) Motion System

Motion should be smooth, cinematic, restrained.

### Timing/Easing
- `--ease-premium: cubic-bezier(0.2, 0, 0, 1)`
- `--ease-smooth: cubic-bezier(0.16, 1, 0.3, 1)`
- `--motion-fast: 160ms`
- `--motion-med: 260ms`
- `--motion-slow: 500ms`

Avoid springy/bouncy curves for primary layout transitions.

### Scroll
- Lenis-style smooth scroll for non-input-heavy content zones.
- Disable smoothing in text-entry heavy contexts when needed.
- Always support `prefers-reduced-motion`.

### Interaction
- Hover: subtle elevation/border glow.
- Active: slight press scale (max `0.985`).
- Loading: shimmer and spinner are low-contrast and non-distracting.

---

## 8) Surface & Elevation

- `--neo-raised`: primary panel elevation
- `--neo-raised-sm`: compact elevation
- `--neo-flat`: low-elevation cards
- `--neo-inset`: inputs and sunken surfaces
- `--neo-active`: selected state glow

Keep one top-left light source assumption across all shadows.

---

## 9) Buttons and Action Semantics

## 9.1 Global Rules

- One dominant CTA per action cluster.
- Disabled state uses `--disabled-opacity` consistently.
- Destructive actions always use danger semantics.

## 9.2 Semantic Map

- **Generate / Generate Remaining:** primary generate style (`.btn-action-generate`)
- **Regenerate / Replace existing output:** outline or warned generate style
- **Approve / Continue finalization:** confirm style (`.btn-confirm`)
- **Delete / destructive:** danger style (`.btn-action-danger`)
- **Secondary utility actions:** `.btn-secondary` / `.btn-outline`

## 9.3 Placement Rules

- Batch actions stay in header/right control cluster.
- Per-item actions stay on the item row or in right edit panel.
- Do not place same action in both row and right panel unless one is quick-action and one is detailed mode, with distinct labels.

---

## 10) Forms and Inputs

- Every input/select/textarea requires visible `:hover` and `:focus` states.
- Placeholder color uses `--text-muted`.
- Textareas use `resize: vertical` with `max-height: 20rem`.
- Focus ring is mandatory and keyboard-visible.

---

## 11) Panel Content Patterns

## 11.1 Right Panel Empty State Pattern

When no selection exists for editing:
- show a calm hint block
- example copy: "Select a shot to edit prompt, model, and generation options."
- no disabled cluttered controls

## 11.2 Dense Editor Pattern

- Group controls into logical sections.
- Use section kickers and spacing rhythm.
- Keep primary action pinned near related form fields.

---

## 12) Screen-by-Screen Shell Mapping

1. **Home**
- Center: hero + format cards
- Right: quick-start/status

2. **Audio**
- Center: upload/player/analysis preview
- Right: audio controls

3. **Story**
- Center: concept/script workspace
- Right: generation + summary controls

4. **Cast**
- Center: character workspace
- Right: character technical controls

5. **Sets**
- Center: location workspace
- Right: location technical controls

6. **Looks**
- Center: wardrobe workspace
- Right: assignment/generation controls

7. **Plan**
- Center: shot plan list/editor
- Right: plan controls/status

8. **Shots**
- Center: shot list and sequence editing
- Right: shot edit/generation inspector (or hint state)

9. **Clips**
- Center: clip list/gallery
- Right: clip edit/generation inspector (or hint state)

10. **Editor**
- Center: final assembly surface
- Right: export/render controls

---

## 13) Accessibility Baseline

- Meet WCAG AA contrast for core text.
- All actionable controls keyboard reachable.
- Visible focus states on all interactive elements.
- `aria-current="step"` on active stage step.
- Respect reduced motion preferences.

---

## 14) Implementation Guardrails

1. Never introduce duplicate progression buttons inside pages.
2. Never break alignment between StageRail and top strip.
3. Never allow resize-induced content clipping.
4. Prefer reusable shell/component tokens over per-screen hardcoded styles.
5. Keep action label language consistent across screens.

---

## 15) Quality Checklist (Before Ship)

- Are similar actions visually and positionally consistent?
- Is there exactly one clear primary CTA per context?
- Does panel resizing preserve readability and controls?
- Do hover/focus/disabled/loading/error/success states all exist?
- Are empty states instructive instead of dead?
- Does mobile/tablet behavior preserve workflow clarity?
