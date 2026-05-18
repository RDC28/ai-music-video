# Metadata Schema

Use frontmatter in project-critical notes.

## Common Fields
```yaml
---
type: project | adr | rfc | runbook | incident | postmortem | note
status: draft | active | blocked | done | archived
owner: "@name"
created: 2026-05-18
updated: 2026-05-18
tags: [engineering]
---
```

## Project Fields
```yaml
priority: p0 | p1 | p2 | p3
target_date: 2026-06-01
```

## Incident Fields
```yaml
severity: sev1 | sev2 | sev3
started_at: 2026-05-18T10:00:00+05:30
resolved_at: 2026-05-18T11:30:00+05:30
```
