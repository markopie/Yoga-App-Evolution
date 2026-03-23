# Refactor Roadmap (Supabase-First Cleanup)

This project has moved to Supabase for data and storage concerns. The next refactor phases should remove legacy file-based pathways and continue splitting the legacy `app.js` monolith.

## What this change starts
- Removes legacy admin-mode toggles and checks that no longer match the current product direction.
- Introduces a `src/` directory with extracted modules for:
  - runtime config (`src/config/appConfig.js`)
  - Supabase client bootstrapping (`src/services/supabaseClient.js`)
  - shared DOM helpers (`src/utils/dom.js`)

## Quick wins completed in this phase
- Extracted parsing helpers from `app.js` into `src/utils/parsing.js` (`parseHoldTimes`, `buildHoldString`, `parseSequenceText`).
- Extracted generic JSON fetch helper into `src/services/http.js`.
- Kept `app.js` behavior stable by swapping to imports only.
- **Completed Data Adapters:** Extracted course/asana fetch and transform logic into `src/services/dataAdapter.js`, ensuring a single Supabase source of truth and stripping out old CSV/JSON/Airtable compatibility paths.
- **Completed Playback Engine:** Extracted timer, audio, and state transitions into `src/playback/timer.js` and `src/playback/audioEngine.js`.
- **Completed Legacy Cleanup Pass:** Removed dead legacy globals (e.g., `imageOverrides`, `audioOverrides`, legacy GitHub JSON sync tools, and the old admin editor). Adjusted the UI to rely strictly on Google Auth state rather than legacy admin toggles.
- **Completed UI rendering split:** Extracted modal, list, history, and builder rendering into `src/ui/` files (`browse.js`, `builder.js`, `historyModal.js`, `wiring.js`).
- **Completed Component/View Architecture:** Extracted specific views (Browse, Focus, Builder) and fully wired the external Playback Engine to `app.js` to eliminate legacy global timer states.
- **Completed Final Legacy cleanup pass:** Removed remaining dead comments, stale JSON override logic, unneeded config URLs, and lingering stale DOM element references (e.g. GitHub PAT Modals).

## Phase 2: Major Extraction (March 2026)
- **Completed Asana Editor extraction:** Extracted the full Asana Editor (add/edit pose via Supabase upsert) into `src/ui/asanaEditor.js`. Removed ~500 lines from `app.js`.
- **Completed Duration Dial extraction:** Extracted all dial logic (updateDialUI, applyDurationDial, dialReset, event wiring) into `src/ui/durationDial.js`. Removed ~200 lines from `app.js`.
- **Completed Course UI extraction:** Extracted `renderCollage`, `renderPlateSection`, `renderCategoryFilter`, `renderCourseUI`, `renderSequenceDropdown` into `src/ui/courseUI.js`. Removed ~200 lines from `app.js`.
- **Removed duplicate Browse/Filter block:** Purged ~700 lines of duplicate implementation from `app.js` that was already handled by `src/ui/browse.js`.
- **Removed duplicate wiring:** Removed dupicate sequence dropdown, IAST toggle, nextBtn/prevBtn/startStopBtn, and historyLink listeners from `app.js` (all handled by `src/ui/wiring.js`).
- **Net result:** `app.js` reduced from ~3,300 lines to **~1,640 lines** (50% reduction).

## Phase 3: Browse / Browse Editor / Timing Fixes (March 2026)
- **Fixed `dataAdapter.js`**: Added `category` and `description` to normalized asana objects. Previously these fields were missing, causing all asanas to show as "Uncategorized".
- **Fixed `getEffectiveTime`**: Was reading `hold_data.standard` (wrong field). Library stores hold times at `hold_json.standard`. This was causing ALL timing to fall back to stored sequence durations — every timer, total, builder stat was wrong.
- **Fixed `getExpandedPoses` injected pose duration**: Injected prep/recovery poses were using `standard_seconds` (nonexistent) — fixed to use `hold_json.standard`.
- **Fixed 90% completion gate**: Now skips gracefully if `totalFocusSeconds === 0` (timer never started). Message simplified.
- **Browse enhancements**: Category filter populated from live library; plates text removed from list items; ID search normalized (`"1"` finds `001`); IAST toggle button added to browse sidebar; category dropdown in Asana Editor converted from datalist to `<select>` with "+ Add new" option.
- **Screen wipe on deselect**: Selecting blank in sequence dropdown now fully resets all UI panels.
- **History Modal cleanup**: The duplicate implementation of `switchHistoryTab`, `openHistoryModal`, `renderGlobalHistory` in `app.js` (250+ lines) has been removed. These functions now live exclusively in `src/ui/historyModal.js` and are imported via `wiring.js`.
- **Dead code removed**: `setupHistory()`, `saveSequencesLocally()`, `resetToOriginalJSON()`, duplicate `resetBtn` listener — all removed from `app.js`.
- **Net result:** `app.js` further reduced from ~1,640 to **~1,660 lines** (note: some additions offset deletions; net deletions ~300 lines).

## Target architecture
- `app.js` (entrypoint orchestration)
- `src/config/*`
- `src/services/*`
- `src/playback/*`
- `src/ui/*`
- `src/utils/*`

## Documentation & Formatting Phase
- [x] Standardize structural hierarchy with scholarly headers in app.js.
- [x] Remove informal console.logs and debug comments.
- [x] Add JSDoc to major app.js functions.
- [x] Format app.js with Prettier applying best practices.

## Testing & Stability Phase
- [x] Address `NaN:NaN` error on countdown timer (`updateTimerUI`).
- [x] Fix remaining global state errors like `running is not defined`.
- [x] Add automated unit tests for `src/utils/parsing.js`.
- [x] Ensure parsing functions gracefully handle missing or malformed inputs.

## Phase 4: Sequence Engine Extraction (March 2026)
- **Extracted `getExpandedPoses`** into `src/services/sequenceEngine.js`. Handles MACRO sub-sequence expansion, LOOP_START/LOOP_END unrolling, and preparatory/recovery pose injection.
- **Extracted `getEffectiveTime` + `calculateTotalSequenceTime`** into `src/utils/sequenceUtils.js`. Pure functions, no DOM access, unit-testable.
- **Net result:** `app.js` reduced from ~1,664 to **~1,447 lines** (−217 lines). Total reduction from 3,300 original → 56% reduction overall.
- **Created `docs/AGENT.md`** — agent-oriented quick-reference guide covering file map, DB schema, common admin scripts, and key patterns.

---

## ⚠️ Critical Lessons Learned — Read Before Any app.js Refactoring

### 1. The `window.*` Export Block Must Never Be Broken
After the `getExpandedPoses` function body, app.js has a block:
```js
// Export for Wiring
window.findAsanaByIdOrPlate = findAsanaByIdOrPlate;
window.getExpandedPoses     = getExpandedPoses;
window.init                 = init;                  // ← CRITICAL
window.getActivePlaybackList = getActivePlaybackList;
window.getCurrentSide       = getCurrentSide;
```
`window.init` is the entry point called by `wiring.js` auth listener. If it's missing, the app **silently never initialises**. When patching function removal, always verify this block is intact.

### 2. `dataAdapter.js` Self-Executes `loadAsanaLibrary()`
Line ~150 of `src/services/dataAdapter.js` has `loadAsanaLibrary();` — intentional eager cache warm. This causes the library to load twice in the console (once per module instance). This is normal and not a bug.

### 3. Module URL Deduplication
`dataAdapter.js` and `dataAdapter.js` are **different URLs = two separate Supabase client instances** in the browser. Minimise the number of distinct import URLs for the same file. Do not add new imports from modules already imported elsewhere if you can avoid it.

### 4. `sequenceEngine.js` Must Not Import External Modules
`src/services/sequenceEngine.js` deliberately has **no imports** — using `window.*` lookups only. Adding imports risks creating duplicate module instances and breaking Supabase auth. Any helper it needs must be accessed via `window.*`.

### 5. Debug Cleanup Must Be Atomic
When adding temporary `console.log` with new variables (e.g. `const { error: myErr } = ...`), ensure the cleanup script removes BOTH the variable reference AND the declaration. A partial cleanup leaves `ReferenceError` in production.

### 6. Extracted Modules Must Use Zero Imports + Dynamic Loading
`posePlayer.js` and `timerEvents.js` follow the same pattern as `sequenceEngine.js` (Lesson #4): **no ES imports**, all helpers via `window.*`. They are loaded with dynamic `import()` in `app.js` (not static `import` statements) because static ES module imports execute depth-first **before** the importing module's body runs. The `window.*` bindings in `app.js` must be set first.

### 7. `courses` Save Must Use UPDATE for Edits, INSERT for New
**Never use `.upsert()` on `courses`.** The RLS INSERT policy checks `user_id = auth.uid()` on the **new row** — and upsert always triggers the INSERT pathway first. For system sequences with `user_id = NULL` or a different UUID, this is rejected before conflict resolution runs. Use:
- **Editing**: `.update(payload).eq('id', id)` — triggers UPDATE RLS only
- **New**: `.insert([payload])` — clean INSERT with current `user_id`
- **Admin saves**: include `is_system: true` in payload automatically
- **UPDATE payload must NOT include `user_id`** — preserves ownership of system rows

### 8. User UUID Can Drift Between Sessions
Supabase OAuth can create multiple user records for the same email (e.g. after re-authentication). Rows created under an old UUID become inaccessible via `user_id = auth.uid()` RLS. The UPDATE RLS policy on `courses` includes `OR is_system = true` to ensure published sequences remain editable regardless of which UUID created them.

---

## Next Targets (Remaining in app.js)
- [x] Extract `setPose()` and related pose rendering logic into `src/ui/posePlayer.js` (~425 lines — largest remaining block)
- [x] Move timer event callbacks (`playbackEngine.onStart`, `onTick`, `onTransitionStart` etc.) into playback module (~300 lines)
- [x] Extract `updateTotalAndLastUI` into `src/ui/courseUI.js` or `src/ui/statsUI.js`
- [x] Remove unused `COURSES_URL` import (dead since Supabase migration)
- [x] Add `?v=` cache bust to `sequenceEngine.js` and `sequenceUtils.js`

### 9. Timer Pill Must Use Dial-Adjusted `p[1]`, Not `getEffectiveTime()`
`getEffectiveTime()` (in `sequenceUtils.js`) always reads `hold_json.standard` from the library — the authoritative default. This is correct for the **builder stats** (which always show standard library times).

But the **live pill** (`updateTimerUI` in `app.js`) works off `activePlaybackList`, where `applyDurationDial()` has already written the dial-scaled duration into `p[1]`. If the pill uses `getEffectiveTime()`, it overrides those values and the dial has no visible effect on the pill.

**Rule**: The pill must read `p[1]` directly and only apply bilateral doubling from the library lookup. Never call `getEffectiveTime()` for the live timer pill.


**Status**: The checked-off items in "Next Targets" above were checked off prematurely — the extraction was done but never wired in.

**To complete the refactor**, for each extracted file:
1. Add a `<script type="module" src="...">` tag to `index.html` (or dynamic `import()` in `app.js` after all `window.*` bindings are set)
2. Remove the corresponding inline block from `app.js`
3. Verify the `window.*` exports in the extracted file match what `app.js` expects

**Priority order**:
- `src/playback/timerEvents.js` — already in sync with `app.js` fixes (bilateral, dial-aware)
- `src/ui/posePlayer.js` — depends on many `window.*` bindings being set first

**Do not wire them in during a bug fix session** — allocate a dedicated refactoring session with full test coverage.
