# Yoga App Workflow

## Standard workflow

Use this for code changes.

```bash
npm run save -- "Describe the change"
npm run push
npm run db:refresh-analysis
```

## Course analysis cache

`course_sequence_analysis` is a cached table. It is **not** refreshed by `npm run save` or `npm run push`.

After changing:
- asana or stage durations / intensities
- course-analysis SQL, such as `refresh_course_sequence_analysis_for_course`
- any Supabase function that affects theme classification

Run:

```bash
npm run db:refresh-analysis
```

This calls `process_course_analysis_refresh_queue(50)` repeatedly until the queue is empty.

## Hook behavior

Pre-commit is local and deterministic:
- checks staged whitespace
- checks merge conflict markers
- checks staged diffs for obvious Supabase service-role/JWT leaks
- regenerates `FUNCTION_INDEX.md` only when staged `src/**/*.js` files or `scripts/generate_index.py` changed

Pre-push runs `scripts/sync_and_backup.py` only when migration files changed, or when `RUN_DB_BACKUP_ON_PUSH=1` is set. Backups, schema snapshots, and generated docs are written inside this repo only.

Git hooks do not refresh production caches or write to external sync folders.

## Related commands

| Command | Description |
|---------|-------------|
| `npm run save -- "msg"` | Stage all changes and commit |
| `npm run push` | Push to remote; may trigger a local backup |
| `npm run db:refresh-analysis` | Process the course-analysis refresh queue |
| `npm run backup` | Manual local Supabase JSON backup and schema sync |
| `npm run index` | Regenerate `FUNCTION_INDEX.md` locally |
