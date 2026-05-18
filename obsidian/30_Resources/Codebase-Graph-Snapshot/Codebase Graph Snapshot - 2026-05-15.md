---
type: note
status: archived
owner: "@team"
created: 2026-05-18
updated: 2026-05-18
tags: [architecture, codebase, snapshot]
---

# Codebase Graph Snapshot - 2026-05-15

This note replaces Graphify as the in-repo memory source for cross-module relationships.

## Snapshot Status
- Built date: 2026-05-15
- Built commit: `e5aa54eb`
- Current repo commit at migration: `802c2b0`
- Freshness: stale (source graph is older than current code)

## Corpus + Graph Size
- Corpus: 63 files, ~83,842 words
- Graph: 520 nodes, 868 edges, 50 communities
- Edge quality: 94% EXTRACTED, 6% INFERRED

## God Nodes (Most Connected)
1. `POST()` (21 edges)
2. `POST()` (21 edges)
3. `buildPrompt()` (17 edges)
4. `buildPrompt()` (14 edges)
5. `getFallbackModels()` (13 edges)
6. `runWithModelFallback()` (13 edges)
7. `build_edit()` (11 edges)
8. `toNumber()` (11 edges)
9. `ShotstackHelperError` (10 edges)
10. `compact()` (10 edges)

## Community Readout (High-Level)
- Prompt construction and shot-context generation dominate the largest communities.
- API `POST()` handlers are key bridge nodes across generation, model-resolution, and normalization layers.
- Image/video model option resolution appears as a tight utility cluster.
- Shotstack/Python integration appears as a distinct integration cluster.
- Reference-image loading and style/anchor prompt building form dedicated subgraphs.

## Inferred Edges To Verify In Live Code
- `POST()` -> `resolveVideoModelOption()`
- `POST()` -> `normalizeShot()`
- `POST()` -> `normalizeVideoDurationForModel()`
- `POST()` -> `runWithModelFallback()`
- `SplitRequest` -> `ShotstackHelperError`

## Gaps Called Out By Snapshot
- 22 isolated nodes were reported.
- 2 thin communities were omitted in the report.
- These likely represent documentation or extraction blind spots, especially in image/panel-splitting flows.

## Migration Outcome
- Graphify output is preserved under Obsidian at:
  - `raw/GRAPH_REPORT_2026-05-15.md`
  - `raw/graph_2026-05-15.json`
  - `raw/graph_2026-05-15.html`
  - `raw/manifest_2026-05-15.json`
- This vault now serves as the long-term architecture memory.

## Linked System Notes
- [[50_Engineering/Architecture]]
- [[50_Engineering/Runbooks/Runbook - Architecture Memory Refresh]]
