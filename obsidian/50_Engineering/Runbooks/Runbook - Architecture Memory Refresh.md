---
type: runbook
status: active
owner: "@team"
created: 2026-05-18
updated: 2026-05-18
tags: [runbook, architecture, knowledge]
---

# Runbook: Architecture Memory Refresh

## Trigger
After meaningful code changes or before architecture review.

## Preconditions
- Run from repo root.

## Steps
1. Review current architecture notes in `[[50_Engineering/Architecture]]`.
2. Review latest API routes and utility hubs using targeted code reads (`rg`, route files, utility modules).
3. Update `[[50_Engineering/Architecture]]` module map and critical paths.
4. If introducing major direction changes, create/update an ADR in `[[50_Engineering/ADRs/ADRs Index]]`.
5. If proposing significant future work, create/update an RFC in `[[50_Engineering/RFCs/RFCs Index]]`.
6. If a one-time structural analysis is run, store its snapshot under `[[30_Resources/Codebase-Graph-Snapshot/Codebase Graph Snapshot - 2026-05-15]]` pattern.

## Verification
- Architecture note reflects latest module boundaries and bridge modules.
- ADR/RFC links are present where applicable.
