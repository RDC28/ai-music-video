# Advanced Queries

Requires Dataview plugin.

## Active Projects
```dataview
TABLE status, owner, priority, target_date
FROM "10_Projects"
WHERE type = "project" AND status != "done"
SORT priority ASC
```

## Open Incidents
```dataview
TABLE severity, owner, started_at
FROM "50_Engineering/Incidents"
WHERE type = "incident" AND status != "resolved"
SORT started_at DESC
```
