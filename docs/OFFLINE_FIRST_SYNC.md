# Offline-First Sync Model

## 1. Current Architecture Summary

The app is a Vite/browser JavaScript application backed by local or hosted Supabase. Supabase is the source of truth for relational data and Storage assets. Runtime data is loaded through `src/services/dataAdapter.js`, which fetches `asanas`, `stages`, and `courses`, normalizes inconsistent row shapes, and builds the in-memory pose and course models used by the UI. Practice history is handled by `src/services/historyService.js`, with localStorage fallback and server persistence in `sequence_completions`.

The database has grown beyond the older architecture notes. In addition to `asanas`, `stages`, `courses`, and `sequence_completions`, the migrations include category tables, props, curriculum tables, rating options, a course pose index, and storage buckets. RLS is already used heavily. Storage currently has public buckets for yoga cards and audio assets plus a private Light on Yoga plates bucket.

## 2. Recommended Android Offline Storage Option

Use Room over SQLite for Android database rows, plus app-private file storage for media. This is the simplest maintainable fit because the app needs a complete local relational read model, durable local writes, explicit conflict handling, and predictable cleanup of media files.

Recommended Android local tables:
- `local_rows`: table name, primary-key JSON, payload JSON, server version, hash, deleted flag, timestamps.
- `local_outbox`: pending insert/update/delete mutations, base server version, payload, retry/error state.
- `local_media_assets`: metadata mirrored from `media_assets`, plus local file path and download status.
- `offline_download_packs`: selected course/week/session/favourites audio packs.

Do not store full-size originals unless the user explicitly opens or downloads them. Images should use offline WebP variants, roughly 600-900px long edge, quality 65-75. Audio should use explicit packs and compressed voice-friendly variants where acceptable, such as AAC or Opus at 32-64 kbps.

## 3. Sync Strategy

The server now exposes a general sync contract in `20260622100930_offline_first_sync_v1.sql`:
- `sync_tables` registers every public table with a primary key, excluding sync metadata tables.
- `sync_entities` tracks row primary keys, server versions, row hashes, delete markers, owner IDs where present, and changed timestamps.
- A generic trigger records inserts, updates, and deletes for registered tables.
- `sync_mutations` stores client mutation attempts for audit/retry/conflict tracking.
- `media_assets` stores source/original/offline media paths, hashes, sizes, dimensions, duration, format, quality, and update/delete timestamps.
- `offline_download_packs` stores per-user explicit offline pack choices.

Android sync flow:
1. Initial full pull: fetch `sync_tables`, then read allowed rows from each table through normal Supabase APIs under RLS. Store the payload, primary key, latest `sync_entities.server_version`, and hash locally.
2. Incremental pull: request `sync_entities` where `server_version > last_synced_version`, then fetch changed rows from the named tables. If `deleted_at` is set, mark the local row deleted instead of hard-deleting immediately.
3. Local writes: write to Room first and append to `local_outbox` with the row's base server version.
4. Replay: when on the home network and Supabase is reachable, check `sync_has_conflict(table, pk, base_version)`. If clean, write through the normal table API/RLS path. Record or update `sync_mutations` for traceability.
5. Media: mirror `media_assets`; download image offline variants eagerly for required rows; download audio variants only for explicit packs. Compare hashes first, then `updated_at` as a fallback. Reuse unchanged files and garbage-collect replaced/deleted files after no local row or pack references them.

## 4. Conflict Strategy

Use optimistic concurrency with server-version checks.

Conflict states:
- Clean: remote version is missing or not newer than the local mutation base version.
- Conflict: remote row changed after the local base version.
- Deleted remotely: the row was deleted or replaced remotely after the local base version.

Default resolution:
- User-owned additive rows, such as practice completions, can usually append safely.
- Updates to user-owned rows should pause and present local vs remote values.
- Deletes are soft locally until confirmed synced.
- System/admin content should be server-wins for non-admin clients.
- Media conflicts are versioned by hash/path. Keep old local files until the new file verifies successfully, then clean up.

## 5. Security/RLS Implications

The model intentionally does not add a privileged generic "apply any mutation to any table" RPC. Android should replay writes through normal Supabase table APIs so existing RLS still decides whether the user can insert, update, or delete.

The new metadata tables use RLS:
- Authenticated users can read table and row version manifests.
- Users can manage only their own `sync_mutations` and `offline_download_packs`.
- Authenticated users can read non-deleted `media_assets`.

RLS policies on existing tables still matter for full local reads. Any table that should be available offline must have an appropriate SELECT policy for the current user. Any table created later should have a primary key and should be registered with `public.sync_register_table('table_name')`.

## 6. Migration Plan

1. Apply `20260622100930_offline_first_sync_v1.sql` locally.
2. Backfill `media_assets` from current `image_url` and `audio_url` values.
3. Generate offline image variants and compressed audio variants into Storage paths, then update `media_assets` with hash, size, dimensions, duration, and timestamps.
4. Build the Android Room schema and initial full-pull worker.
5. Add outbox replay with conflict checks.
6. Add media pack selection and cleanup jobs.
7. Gradually move browser-side persistence helpers toward the same sync rules so web and Android do not diverge.

Current local estimate from `npm run offline:size-report` after v5:
- Database: 17.6 MB.
- Full images: 18.1 MB.
- Offline image variants: 0 B, not generated yet.
- Full audio: 16.9 MB.
- Offline audio variants: 0 B, not generated yet.

## 7. Risks And Open Questions

- The repo does not currently contain an Android project, so Room implementation is specified but not shipped here.
- Existing tables do not all have consistent `updated_at` columns. The generic `sync_entities.server_version` becomes the stable change cursor.
- `media_assets` needs a backfill/generation job before phones can benefit from offline variants.
- Some current category RLS policies are broad for authenticated users. Offline sync will faithfully mirror what RLS permits, so policy tightening should happen before shipping to multiple households.
- Storage object hashes may need a convention, because Supabase Storage metadata is not always a reliable content hash source.
- The full initial dataset size should be measured on the target local server with `npm run offline:size-report`.

## Iteration Log

### v1

Design changes: Chose Room/SQLite plus file storage, generic server sync manifests, optimistic concurrency, and no privileged generic mutation applier.

Implementation changes: Added `sync_tables`, `sync_entities`, generic row-change trigger registration, `sync_mutations`, `media_assets`, and `offline_download_packs`.

Tests run: SQL reviewed statically before later command-line checks.

Failures found: The primary-key helper initially had an ambiguous table-name parameter.

Fixes made: Renamed the function parameter to `target_table`.

Remaining risks: Media metadata is empty until backfilled.

Good enough to keep: Yes, as the server contract foundation.

### v2

Design changes: Added explicit media rules: offline WebP image variants by default for required images, audio only through selected packs.

Implementation changes: Added `media_assets` fields for offline path, original path, hash, byte size, dimensions, duration, format, quality, and delete/update timestamps. Added `offline_download_packs`.

Tests run: Added helper tests for audio non-download defaults and media variant choice.

Failures found: None in helper design.

Fixes made: None.

Remaining risks: Variant generation is still a follow-up script/job.

Good enough to keep: Yes, because it prevents blind full-media downloads.

### v3

Design changes: Added storage-size estimation as a first-class verification step.

Implementation changes: Added `scripts/offline-size-report.mjs` and npm script `offline:size-report`. The report calculates database size when a DB URL is available and storage totals from Supabase or local mirrored assets.

Tests run: Added pure helper tests for offline object classification and byte formatting.

Failures found: Windows command entrypoint needed a safer file URL comparison.

Fixes made: Switched to `pathToFileURL`.

Remaining risks: Supabase Storage listings may report zero bytes for objects without size metadata; local mirrored assets provide a fallback.

Good enough to keep: Yes.

### v4

Design changes: Centralized client helper rules for conflict status, stable row keys, media choice, and download decisions.

Implementation changes: Added `src/services/offlineSync.js`.

Tests run: Added `src/services/offlineSync.test.js`.

Failures found: None so far.

Fixes made: None.

Remaining risks: Browser integration is not complete; Android should implement equivalent logic in Kotlin.

Good enough to keep: Yes.

### v5

Design changes: Hardened the final recommendation around conservative replay through RLS rather than bypassing policies.

Implementation changes: Documented migration and operational workflow in this file.

Tests run: `npm test`, `npm run offline:size-report`, `npx supabase migration up --local`, and a transactional trigger probe against local Postgres.

Failures found: The trigger probe found a PL/pgSQL ambiguity where the trigger variable `pk` conflicted with the `sync_entities.pk` column.

Fixes made: Renamed the trigger variable to `entity_pk`, refreshed the idempotent migration SQL locally, and reran verification. The probe now reports 15 registered sync tables, 18 `media_assets` columns, and a successful `props` update manifest row inside a rolled-back transaction.

Remaining risks: Android code and media variant generation/backfill remain the next real delivery steps.

Good enough to keep: Yes, as v1 server/client contract for offline sync.

## Final Recommendation

Keep this v1 contract and build Android against it. The safest next increment is a media backfill/generation script that creates offline WebP image variants, optional compressed audio variants, and populates `media_assets`. After that, implement Android Room full-pull and outbox replay with the conflict states defined here.
