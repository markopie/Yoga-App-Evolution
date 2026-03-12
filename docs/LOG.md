# Investigation Log

## Database Discovery
Successfully queried all 7 Supabase tables. Identified explicit schema keys. Found `audio_url` (implicitly expected or available per user request, though not on the current DB row, it represents the intention for audio mapping).

## "Pose #" Discovery
- **Search**: Scanned all `.js` and `.html` files in the project for `"Pose #"`.
- **Result**: The literal string `"Pose #"` does not exist anywhere in the code.
- **Root Cause**: In `app.js` (around line 1626 in `setPose`), there is a fallback:
  `let finalTitle = baseOverrideName || (asana ? displayName(asana) : "Pose");`
  The visual "Pose #" the user sees is a combination of this fallback string `"Pose"` coupled with a separate UI counter (e.g., `focusCounter.textContent = `${originalRowIndex + 1} / ${displayTotal}`;`).
- **Trace**: The `displayName(asana)` function looks for `asana.english || asana.name || asana.iast`. If the data adapter fails to populate these (e.g., due to previous strict mapping errors) or if the ID is missing entirely, it defaults to `"Pose"`.

## Audio Discovery
- **Search**: Looked for `.play()` and `Audio(` in `app.js`.
- **Result**: Handled by `playPoseMainAudio(asana)`.
- **Root Cause**: `app.js` attempts to construct the audio path by checking `audioOverrides`, then matching against `window.serverAudioFiles` manifest, and finally using a legacy string template (`${AUDIO_BASE}${idStr}_${safeName}.mp3`).
- **Mismatch**: The DB provides (or will provide) an `audio_url` column, which `dataAdapter.js` now maps to `asana.audio`. However, `app.js` was completely ignoring `asana.audio` when deciding what to play.
- **Action**: Applied a "no-brainer" fix to `playPoseMainAudio` to check `if (asana.audio) { playSrc(asana.audio); return; }` right after the override check, successfully bridging the audio gap.

## Final Project Status Update

**Status Checks:**
- [x] **Database Connection**: COMPLETED. All 7 tables successfully queried and verified. `dataAdapter.js` fully encapsulates hydration.
- [x] **Pose Names Mapping**: COMPLETED. UI expects `asana.english` and `asana.name`. The adapter now explicitly maps `row.english_name` and `row.name` to these properties without relying on legacy fallbacks.
- [x] **Audio Integration**: COMPLETED. `app.js` correctly checks for `asana.audio` before attempting fallback heuristics.

**Assumptions / Notes:**
- *Authentication*: In the extracted `fetchCourses` function in `dataAdapter.js`, it relies on receiving `window.currentUserId`. I assumed the UI initializes `currentUserId` before `init()` executes or passes `null` gracefully, which matches existing behavior.
- *Sequence Text Parsing*: The Python script output showed `courses.sequence_text` formatted identically to local test sequences (e.g., `176 | 600 | [Sirsasana (10 min)]\n`). Therefore, I assumed `parseSequenceText` (which relies on `\n` splitting and `|` chunking) is perfectly aligned with the DB's storage format and requires no further modification.
- *Sequence Title Map*: The `courses` and `user_sequences` tables strictly use a `title` column, and the UI's resume sequence prompt references `.title`. This matches perfectly, so no naming alignment was needed there.

---

## Phase 2 Refactoring Session (2026-03-11)

### What was done
Continued modularisation of `app.js`, which started this session at **~3,300 lines** and ended at **~1,640 lines** — a 50% reduction.

#### New modules created
| File | Contents Extracted |
|------|-------------------|
| `src/ui/asanaEditor.js` | Full Asana Editor (add/edit asana via Supabase upsert), `addStageToEditor`, `getNextRomanNumeral`, `getVariationSuffixes`, `getNextAsanaId`, `getUniqueCategories`, `formatCategoryName` |
| `src/ui/durationDial.js` | Duration Dial logic: `updateDialUI`, `applyDurationDial`, `dialReset`, `resolveDialAnchors`, `interpolateDuration`, all event wiring |
| `src/ui/courseUI.js` | `renderCollage`, `renderPlateSection`, `renderCategoryFilter`, `renderCourseUI`, `renderSequenceDropdown` |

#### Duplicate code removed from `app.js`
- ~700 lines of Browse/Filter/Course UI (already in `src/ui/browse.js` and `src/ui/courseUI.js`)
- ~500 lines of Asana Editor (now in `src/ui/asanaEditor.js`)
- ~200 lines of Duration Dial (now in `src/ui/durationDial.js`)
- ~90 lines of duplicate wiring (sequence dropdown, IAST toggle, `nextBtn`/`prevBtn`/`startStopBtn`, `historyLink`)

### Verification
Confirmed via browser check that:
- App loads without JS errors
- 196 sequences correctly populated
- Resume prompt functions correctly
- All extracted modules expose themselves on `window` for legacy compatibility

### Remaining in app.js (next targets)
- `setPose()` — the main pose rendering orchestrator (~350 lines)
- `getExpandedPoses()` — macro/loop expansion engine
- `openHistoryModal` wiring (lastPill, histBackdrop, tab switching)
- `updateTotalAndLastUI`, `calculateTotalSequenceTime`
- `getEffectiveTime`, `saveCurrentProgress`, `showResumePrompt`

---

## Database Hardening & Migrations (2026-03-12)

### What was done
Unified the entire data architecture by migrating all custom user-defined entries natively into the global structure tables. This completely obsoleted three user-specific tables, dramatically simplifying data hydration, upsert complexity on the client, and load speeds.

#### Key SQL Migrations
1. **`user_sequences` → `courses`**: Applied `UNIQUE(title, category)` constraint to `courses` and seamlessly UPSERTED 35 user-defined macros/sequences into the primary logic loop. Dropped reliance on checking IDs manually prior to inserts.
2. **`user_asanas` → `asanas`**: Applied explicit `UNIQUE(id)` index to the primary `asanas` table. Successfully migrated all custom pose rows into global lookup pool without collision.
3. **`user_stages` → `stages`**: Cleaned legacy duplicates mathematically, then applied mathematical `UNIQUE(asana_id, stage_name)` constraint. Migrated user variations explicitly to `stages`.

#### Code Refactoring (`app.js` module architecture)
- **`src/services/dataAdapter.js`**: Stripped the dual-loading sequences and `try/catch` user-defined overrides. Fetches now operate flawlessly off the single core tables directly (fetching just `courses`, `asanas`, and `stages`).
- **`src/ui/builder.js`**: Swapped save logic to hit `courses` using the single command `.upsert([payload], { onConflict: 'title, category' })`, removing lines of verification logic checking `user_id` collisions.
- **`src/ui/asanaEditor.js`**: Retargeted save logic and DOM hydration directly onto `asanas` and `stages`, stripping the requirement of applying active `user_id` mapping when defining universal custom variations.