# Architecture

## System Context
- Product: AI music video generation platform (script -> shots -> media -> assembly).
- Primary users: creators operating multi-step generation workflows.
- Constraints: model-provider variance, media normalization, credit/account enforcement, and reliability across Python + Next.js boundaries.

## Module Map
- Frontend: workflow screens and shared layout components (dashboard/create flow, progress/nav surfaces).
- API: multiple `POST()` route handlers bridging generation steps and orchestration.
- Data: Supabase-backed project and asset state, plus helper utilities for model and shot normalization.
- Infra/Services: Python service integration (including Shotstack/editor flows), plus fallback model execution utilities.

## Critical Paths
- Generation orchestration:
  - route `POST()` handlers -> prompt builders (`buildPrompt()`) -> model option resolution -> fallback execution.
- Media normalization:
  - shot normalization + duration normalization + utility compaction helpers.
- Render/integration:
  - Python Shotstack editor helpers (`build_edit()` and related wrappers) with error translation (`ShotstackHelperError`).

## Cross-Module Bridges (From Snapshot)
- `POST()` is the largest bridge node across prompt, normalization, model-resolution, and fallback communities.
- `getFallbackModels()` and `runWithModelFallback()` are central in resilience behavior.
- `buildPrompt()` is a dominant coordination node in the generation context.

## Quality Notes
- Snapshot source: [[30_Resources/Codebase-Graph-Snapshot/Codebase Graph Snapshot - 2026-05-15]]
- Snapshot is stale versus current HEAD at migration time; verify inferred edges before using as implementation truth.

## Change Log
- 2026-05-18: Migrated Graphify architecture memory into Obsidian snapshot + normalized architecture map.
- 2026-05-18: Embedded frame generation directly into the Shots workflow (thumbnail previews + shot+frame editing in one panel) while preserving step 9 for dedicated frame operations.
- 2026-05-18: Reworked Shots row interaction layout and expanded the edit panel information density (grouped controls, improved action placement) without removing any shot or frame operations.
- 2026-05-18: Fixed Shots edit-mode split layout collapse by enforcing balanced flex sizing between main list and edit panel; added responsive breakpoints to prevent right-side dead space on wide screens and stacked mode on narrower screens.
- 2026-05-18: Converted Shots edit-open mode to a strict two-column containerized workspace (main list + editor), with screen-level overflow disabled and scroll delegated to bounded internal containers (`shot-list-viewport`, edit panel).
- 2026-05-18: Reorganized the Shots screen information architecture to reduce wasted space: header now uses explicit containers (context block, action cluster, status strip), coverage notes are bounded in their own scrollable container, and shot rows were resized for better text/thumbnail balance.
- 2026-05-18: Refined Shots header hierarchy again so the main title stays on a dedicated full-width line (no squeeze/wrap from action controls), with action controls moved to their own row for cleaner scan and lower visual clutter.
- 2026-05-18: Fixed dashboard project library layout regression by replacing multicolumn masonry (`columns`) with deterministic responsive CSS grid and expanding the dashboard content max width for better use of widescreen space.
- 2026-05-18: Removed the standalone Frames workflow step from navigation and flow control; production path is now `Shots (with integrated frame generation) -> Clips -> Editor`, with legacy step-state remapping to prevent users from landing on the retired Frames screen.
- 2026-05-18: Smoothed StageRail expand/collapse motion by replacing spring-like `all` transitions with explicit `ease-in-out` transitions (rail width, labels, and connector fade), eliminating wobble during sidebar hover open/close.
- 2026-05-18: Corrected StageRail collapsed/expanded layout logic after animation tuning: restored centered compact step geometry in collapsed mode, expanded row layout on hover, and anchored status dots to a dedicated right-side lane to prevent icon overlap.
- 2026-05-18: Reworked StageRail row composition to stabilize hover animation math: introduced a dedicated `stage-rail-step-main` container, constrained label width with `max-width` transitions instead of layout jumps, and kept dot lane independent of icon/label flow.
- 2026-05-18: Reorganized Clips tab container architecture: structured header into explicit copy/actions/status regions, converted clip gallery to full-width adaptive grid containers, and added bounded split-layout behavior for open clip editor panels.
- 2026-05-18: Fixed Clips screen blank right-side space. Root cause: CSS cascade conflicts (globals.css loaded after components.css, same-specificity rules winning) meant grid layout properties couldn't be reliably set via CSS classes. Final fix: rewrote VideosScreen JSX return to use inline styles for all layout-critical properties (flex container, grid template, overflow, padding) — same pattern as ShotListScreen. CSS classes are now used only for visual styles (shadows, borders, colors). Also deleted the dead `.video-gallery-grid` block from globals.css that was the source of cascade conflicts.
- 2026-05-18: Fixed StageRail status dot overlap in collapsed mode. Root cause: rail is 3.75rem wide, step inner width ~2.25rem — not enough room for num+gap+icon (≈2.125rem) AND an absolutely-positioned right dot (0.5rem) without overlap. Fix: dot is hidden (opacity:0) in collapsed state and revealed only on hover/expand, where the rail has room. Collapsed active state is communicated by the cyan ::before bar + tinted icon/num. All stage-rail px values converted to rem throughout.
- 2026-05-18: Replaced static home workflow info cards with four large actionable cards (`Track`, `Plan`, `Generate`, `Assemble`) plus a centered hero panel, aligned to Aura styling and wired to real workflow navigation steps.
- 2026-05-18: Updated Home format selection cards per product scope: replaced workflow-step cards with `Music Video`, `Short`, `Movie`, `TV Series`; only `Music Video` is active/navigable, while other formats are explicitly disabled as coming-soon.
- 2026-05-18: Introduced a unified triadic color-token system for UX consistency across screens (Ink + Cyan + Violet, 8 controlled shades) and rewired glow/scroll/progress/gradient accents to palette-driven CSS variables.
- 2026-05-18: Completed palette hardening pass across app UI surfaces: replaced remaining hardcoded hex/RGB colors in frontend screens, dashboards, auth/billing/profile/payment views, and shared CSS with the fixed 8-shade token system; updated style-bible fallback palette defaults to the same system.
