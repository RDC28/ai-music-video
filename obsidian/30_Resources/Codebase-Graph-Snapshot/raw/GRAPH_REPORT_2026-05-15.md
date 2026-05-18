# Graph Report - ai-music-video  (2026-05-15)

## Corpus Check
- 63 files · ~83,842 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 520 nodes · 868 edges · 50 communities (48 shown, 2 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e5aa54eb`
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
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `POST()` - 21 edges
2. `POST()` - 21 edges
3. `buildPrompt()` - 17 edges
4. `buildPrompt()` - 14 edges
5. `getFallbackModels()` - 13 edges
6. `runWithModelFallback()` - 13 edges
7. `build_edit()` - 11 edges
8. `toNumber()` - 11 edges
9. `ShotstackHelperError` - 10 edges
10. `compact()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `SplitRequest` --uses--> `ShotstackHelperError`  [INFERRED]
  python-service/main.py → python-service/shotstack_editor.py
- `POST()` --calls--> `resolveVideoModelOption()`  [INFERRED]
  src/app/api/generate-shot-video/route.js → src/utils/generationModels.js
- `POST()` --calls--> `normalizeShot()`  [INFERRED]
  src/app/api/generate-shot-video/route.js → src/utils/shotList.js
- `POST()` --calls--> `normalizeVideoDurationForModel()`  [INFERRED]
  src/app/api/generate-shot-video/route.js → src/utils/generationModels.js
- `POST()` --calls--> `runWithModelFallback()`  [INFERRED]
  src/app/api/generate-shot-video/route.js → src/utils/googleModelFallbacks.js

## Communities (50 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (54): applyCharLabel(), assertNativeWidescreenImage(), buildBackgroundGroupContext(), buildCharacterImageCrossRef(), buildCharacterLabelMap(), buildLocationImageCrossRef(), buildLockedShotFacts(), buildPrompt() (+46 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (46): applyCharLabel(), assertWidescreenDimensions(), buildCharacterLabelMap(), buildLockedShotFacts(), buildPrompt(), buildScriptSceneContext(), buildShotDetailContext(), buildTimedWords() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (39): BaseModel, _content_mask(), detect_panels_cv(), detect_panels_gemini(), _edge_density_grid(), _filter_quality(), _find_components(), _label_panels() (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (29): POST(), normalizeDuration(), cleanName(), GenerateShotListScreen(), hasWardrobeOverride(), isLegacyWardrobeFallback(), ImagesScreen(), ShotListScreen() (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (25): POST(), generateImage(), POST(), generateImage(), POST(), generateBestCandidate(), generateGoogleImage(), loadReferenceImages() (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (25): Exception, build(), build_edit(), build_visual_clip(), clean_url(), configuration(), finite_float(), hosted_asset_for_render() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (21): compactSnippet(), dedupeModels(), extractModels(), fetchJson(), getEnvValue(), joinUrl(), loadLocalEnv(), looksLikeModelId() (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (10): buildDefaultCharacterDescription(), buildPinboardLayout(), buildScriptCharacterDescription(), CharactersScreen(), compactScriptText(), getImageRatio(), getPinboardCandidates(), getPinboardImageSize() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (12): buildDefaultLocationDescription(), buildPinboardLayout(), buildScriptLocationDescription(), compactScriptText(), getImageRatio(), getPinboardCandidates(), getPinboardImageSize(), LocationsScreen() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (11): AssembleScreen(), formatSeconds(), formatTime(), getClipSourceIn(), getClipSourceOut(), isShotstackWorking(), readableAudioName(), shotDuration() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (15): buildAnchorPrompt(), collectAnchorReferenceCandidates(), compact(), fetchReferenceImage(), inferImageMimeType(), loadReferenceImages(), normalizeLookupName(), normalizeReferenceImage() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (14): buildStyleBiblePrompt(), collectStyleBibleReferenceImages(), compact(), dedupeReferenceImages(), extractJsonObject(), fetchReferenceImage(), inferImageMimeType(), loadReferenceImages() (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (12): buildGenerationContext(), buildShotError(), compactAssetList(), compactShotForRequest(), compactText(), compactTranscript(), compactWardrobe(), fetchJsonWithRetry() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (13): buildGenerationContext(), buildShotError(), compactAssetList(), compactShotForRequest(), compactText(), compactWardrobe(), fetchJsonWithRetry(), getFrameErrorMessage() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (9): cleanText(), hasAssetByName(), hasOutfitLock(), legacyOutfitFallback(), normalizeLibraryAsset(), outfitFallback(), summarizeWardrobe(), upperName() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.27
Nodes (8): buildTrainingZipBuffer(), buildTriggerWord(), collectTrainingImageUrls(), normalizeLookupName(), POST(), safePathPart(), updateProjectCharacterLora(), uploadTrainingZip()

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (7): POST(), serializeError(), GET(), serializeError(), actionPath(), readJsonResponse(), runShotstackPython()

### Community 18 - "Community 18"
Cohesion: 0.46
Nodes (7): boxArea(), callGeminiDirect(), callPythonService(), iou(), nms(), POST(), sortPanels()

### Community 19 - "Community 19"
Cohesion: 0.46
Nodes (7): findOption(), getVideoDurationOptions(), isByteDanceImageModel(), isSeedanceVideoModel(), normalizeVideoDurationForModel(), resolveImageModelOption(), resolveVideoModelOption()

## Knowledge Gaps
- **22 isolated node(s):** `Character Sheet Splitter — Python microservice Stage 1: scikit-image / OpenCV co`, `Estimate background color by sampling the outer border of the image.     Robust`, `Pixels that differ from the background in LAB space → 255 (content).     LAB is`, `Close small holes, find connected components, filter by area.`, `Left-to-right, top-to-bottom with a 80-unit row tolerance.` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `POST()` connect `Community 1` to `Community 3`, `Community 10`, `Community 19`, `Community 4`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 4` to `Community 0`, `Community 19`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `createAdminClient()` connect `Community 10` to `Community 1`, `Community 11`, `Community 4`, `Community 15`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `POST()` (e.g. with `resolveVideoModelOption()` and `normalizeShot()`) actually correct?**
  _`POST()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `POST()` (e.g. with `normalizeShot()` and `resolveImageModelOption()`) actually correct?**
  _`POST()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `getFallbackModels()` (e.g. with `POST()` and `callGeminiDirect()`) actually correct?**
  _`getFallbackModels()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Character Sheet Splitter — Python microservice Stage 1: scikit-image / OpenCV co`, `Estimate background color by sampling the outer border of the image.     Robust`, `Pixels that differ from the background in LAB space → 255 (content).     LAB is` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._