# Graph Report - ai-music-video  (2026-05-06)

## Corpus Check
- 48 files · ~46,650 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 236 nodes · 311 edges · 40 communities (39 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c5f57de3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `POST()` - 13 edges
2. `detect_panels_cv()` - 8 edges
3. `normalizeShot()` - 8 edges
4. `buildPrompt()` - 7 edges
5. `POST()` - 7 edges
6. `split_sheet()` - 6 edges
7. `withRetry()` - 6 edges
8. `pollVideoOperation()` - 6 edges
9. `AssembleScreen()` - 6 edges
10. `isRetryableError()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `normalizeShot()`  [INFERRED]
  src/app/api/generate-shot-video/route.js → src/utils/shotList.js
- `POST()` --calls--> `createAdminClient()`  [INFERRED]
  src/app/api/generate-shot-video/route.js → src/utils/supabase-admin.js
- `POST()` --calls--> `normalizeShot()`  [INFERRED]
  src/app/api/generate-shot-image/route.js → src/utils/shotList.js
- `POST()` --calls--> `normalizeShotList()`  [INFERRED]
  src/app/api/generate-shot-list/route.js → src/utils/shotList.js
- `POST()` --calls--> `createAdminClient()`  [INFERRED]
  src/app/api/analyze/route.js → src/utils/supabase-admin.js

## Communities (40 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (25): BaseModel, _content_mask(), detect_panels_cv(), detect_panels_gemini(), _edge_density_grid(), _filter_quality(), _find_components(), _label_panels() (+17 more)

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (21): buildPrompt(), buildTimedWords(), buildTranscriptContext(), compact(), downloadGeneratedVideo(), fetchSourceImage(), formatOperationError(), getErrorStatus() (+13 more)

### Community 2 - "Community 2"
Cohesion: 0.2
Nodes (13): POST(), buildPrompt(), compact(), getErrorStatus(), isRetryableError(), namesFrom(), POST(), selectedByName() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (13): POST(), GenerateShotListScreen(), ImagesScreen(), VideosScreen(), countTranscriptWords(), getShotTimingLabel(), normalizeShot(), normalizeShotList() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (7): buildPinboardLayout(), getImageRatio(), getPinboardCandidates(), getPinboardImageSize(), normalizeLocationLabel(), parseLocationImage(), tryBuildPinboard()

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (9): AssembleScreen(), formatSeconds(), formatTime(), getClipSourceIn(), getClipSourceOut(), readableAudioName(), shotDuration(), toFiniteNumber() (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (5): buildPinboardLayout(), getImageRatio(), getPinboardCandidates(), getPinboardImageSize(), tryBuildPinboard()

### Community 7 - "Community 7"
Cohesion: 0.23
Nodes (10): buildGenerationContext(), buildShotError(), compactAssetList(), compactShotForRequest(), compactText(), compactTranscript(), fetchJsonWithRetry(), isRetryableClientError() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.36
Nodes (9): boxArea(), callGeminiDirect(), callPythonService(), cleanPanels(), iou(), nms(), POST(), sortPanels() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (9): buildGenerationContext(), buildShotError(), compactAssetList(), compactShotForRequest(), compactText(), fetchJsonWithRetry(), isRetryableClientError(), readJsonResponse() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.46
Nodes (7): boxArea(), callGeminiDirect(), callPythonService(), iou(), nms(), POST(), sortPanels()

## Knowledge Gaps
- **11 isolated node(s):** `Character Sheet Splitter — Python microservice Stage 1: scikit-image / OpenCV co`, `Estimate background color by sampling the outer border of the image.     Robust`, `Pixels that differ from the background in LAB space → 255 (content).     LAB is`, `Close small holes, find connected components, filter by area.`, `Left-to-right, top-to-bottom with a 80-unit row tolerance.` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `normalizeShot()` connect `Community 3` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 1` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `POST()` (e.g. with `normalizeShot()` and `createAdminClient()`) actually correct?**
  _`POST()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `normalizeShot()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`normalizeShot()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `POST()` (e.g. with `normalizeShot()` and `createAdminClient()`) actually correct?**
  _`POST()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Character Sheet Splitter — Python microservice Stage 1: scikit-image / OpenCV co`, `Estimate background color by sampling the outer border of the image.     Robust`, `Pixels that differ from the background in LAB space → 255 (content).     LAB is` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._