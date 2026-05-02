# Yoga App Workflow

## Standard workflow

Use this for all code changes.

```bash
npm run save -- "Describe the change"
npm run push
npm run db:refresh-analysis
```

## Course analysis cache

`course_sequence_analysis` is a cached table. It is **not** refreshed by `npm run save` or `npm run push`.

After changing:
- asana or stage durations / intensities
- course-analysis SQL (e.g. `refresh_course_sequence_analysis_for_course`)
- any Supabase function that affects theme classification

Run:

```bash
npm run db:refresh-analysis
```

This calls `process_course_analysis_refresh_queue(50)` repeatedly until the queue is empty.

> **Note:** `npm run push` may run a database backup when migrations have changed (via the pre-push hook), but it does **not** refresh the analysis cache. Git hooks are intentionally kept fast and safe — production DB refreshes are not hidden inside commit or push hooks.

## Related commands

| Command | Description |
|---------|-------------|
| `npm run save -- "msg"` | Stage all changes and commit |
| `npm run push` | Push to remote (may trigger backup) |
| `npm run db:refresh-analysis` | Process the course-analysis refresh queue |
| `npm run backup` | Manual Supabase JSON backup + schema sync |
