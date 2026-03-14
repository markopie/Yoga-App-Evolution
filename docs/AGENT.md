# Yoga App — Agent Reference Guide

> **Quick-nav for agents.** Read this first before exploring the codebase.

## File Map — Where to Find Things

| Thing you want to change | File |
|---|---|
| Sequence save / RLS / user_id | `src/ui/builder.js` → `builderSave()` |
| Sequence import (paste semicolons) | `src/ui/builder.js` → `processSemicolonCommand()` |
| Link Sequence modal | `src/ui/builder.js` → `openLinkSequenceModal()`; wired in `src/ui/wiring.js` |
| Stage creation / editing | `src/ui/asanaEditor.js` → `addStageToEditor()`, `wireEditorSave()` |
| Browse / asana list | `src/ui/browse.js` |
| Auth (Google login, sign out) | `src/ui/wiring.js` → `setupAuthListeners()` |
| Timer / playback | `src/playback/timer.js` (playbackEngine) |
| Audio playback | `src/playback/audio.js` |
| Sequence expansion (MACRO/LOOP/inject) | `src/services/sequenceEngine.js` → `getExpandedPoses()` |
| Timing calculations | `src/utils/sequenceUtils.js` → `getEffectiveTime()`, `calculateTotalSequenceTime()` |
| DB data fetching / normalisation | `src/services/dataAdapter.js` → `fetchCourses()`, `loadAsanaLibrary()` |
| Supabase client | `src/services/supabaseClient.js` |
| DOM helpers ($, safeListen, etc.) | `src/utils/dom.js` |
| Format helpers (displayName, formatHMS) | `src/utils/format.js` |
| Parsing (hold times, sequence text) | `src/utils/parsing.js` |
| App init, pose player logic | `app.js` |
| Global UI event wiring | `src/ui/wiring.js` |
| History modal | `src/ui/historyModal.js` |
| Duration dial | `src/ui/durationDial.js` |
| Course UI rendering | `src/ui/courseUI.js` |

## Database Tables

| Table | Purpose | RLS |
|---|---|---|
| `asanas` | Base pose library | Public SELECT; admin writes via SQL editor |
| `stages` | Pose variations (Back against wall, Bent legs, etc.) | Public SELECT; admin writes via SQL editor |
| `courses` | All sequences (system + user) | SELECT: anon=system only, auth=system+own; INSERT/UPDATE/DELETE: own rows |
| `sequence_completions` | Practice history | Private (uid = user_id) |

### courses table key columns
- `user_id` — UUID of creator; NULL for legacy system rows
- `is_system` — `true` = visible to all; `false` = private draft (owner only)
- Admin workflow: Save → `confirm("Promote to published?")` → sets `is_system=true`

## Common Admin Tasks

### Create stages for an asana via script
```js
// In a .cjs script with dotenv + @supabase/supabase-js:
const row = {
    asana_id: '003',
    stage_name: 'WALL',          // or 'I', 'II', 'BENT' etc.
    title: 'Back against the wall',
    full_technique: 'PREFIX...\n\n' + baseAsana.technique,
    audio_url: '<copy from existing stage>.mp3',
    audio_title: 'Near Wall Support',
    image_url: '<copy master image URL>',
    is_curated: true
};
await sb.from('stages').insert([row]);
```

### Copy a storage image
```js
const { data } = await sb.storage.from('yoga-cards').download('003_master_...webp');
await sb.storage.from('yoga-cards').upload('003_WALL_...webp', data, { contentType: 'image/webp', upsert: true });
```

### Promote a sequence to system (SQL)
```sql
UPDATE courses SET is_system = true WHERE id = <id>;
```

## Key Patterns

| Pattern | Where |
|---|---|
| `window.currentUserId` | Set by `wiring.js` auth listener; used in all Supabase write payloads |
| `window.currentUserEmail` | Compared to `ADMIN_EMAIL` in builder.js to show admin UI |
| `window.asanaLibrary` | In-memory map of all asanas; populated by `loadAsanaLibrary()` |
| `window.courses` | Array of all loaded sequences |
| `isAdmin()` | Util in `builder.js` — checks email against `ADMIN_EMAIL` const |
| `page_primary` | `numeric(6,2)` — use `44.1` for disambiguated pages |
| Stage `stage_name` | Free-form string ('I','II','WALL','BENT') — roman numerals for variations |

## Stage/Variation Merge in Builder
When a user types a page number like `56.1`, the bulk importer:
1. Tries `asanas.page_primary = 56.1` (fast path)
2. Falls back to `stages.page_primary = 56.1` 
3. If ambiguous (multiple hits on same page), flags row for user resolution

## Scripts (`/scripts/`)
| Script | Purpose |
|---|---|
| `fix_page_primary_overlaps.cjs` | Assign `.1/.2` suffixes to disambiguate shared page numbers |
| `audit_url_asana_mismatch.cjs` | Find asanas with missing/broken image URLs |
| `ensure_stage_storage_urls.cjs` | Verify all stages have valid storage URLs |

## What stays in app.js
- `setPose()` — main pose rendering (largest remaining block, ~425 lines)
- `nextPose()` / `prevPose()`
- `init()` — app bootstrap
- Timer engine callbacks (`playbackEngine.onStart`, `onTick`, etc.)
- `findAsanaByIdOrPlate()`, resume logic
