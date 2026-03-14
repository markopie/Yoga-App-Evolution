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
- **Completed Playback Engine:** Extracted timer, audio, and state transitions into `src/playback/timer.js` and `src/playback/audio.js`.
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
`dataAdapter.js` and `dataAdapter.js?v=29` are **different URLs = two separate Supabase client instances** in the browser. Minimise the number of distinct import URLs for the same file. Do not add new imports from modules already imported elsewhere if you can avoid it.

### 4. `sequenceEngine.js` Must Not Import External Modules
`src/services/sequenceEngine.js` deliberately has **no imports** — using `window.*` lookups only. Adding imports risks creating duplicate module instances and breaking Supabase auth. Any helper it needs must be accessed via `window.*`.

### 5. Debug Cleanup Must Be Atomic
When adding temporary `console.log` with new variables (e.g. `const { error: myErr } = ...`), ensure the cleanup script removes BOTH the variable reference AND the declaration. A partial cleanup leaves `ReferenceError` in production.

---

## Next Targets (Remaining in app.js)
- [ ] Extract `setPose()` and related pose rendering logic into `src/ui/posePlayer.js` (~425 lines — largest remaining block)
- [ ] Move timer event callbacks (`playbackEngine.onStart`, `onTick`, `onTransitionStart` etc.) into playback module (~300 lines)
- [ ] Extract `updateTotalAndLastUI` into `src/ui/courseUI.js` or `src/ui/statsUI.js`
- [ ] Remove unused `COURSES_URL` import (dead since Supabase migration)
- [ ] Add `?v=` cache bust to `sequenceEngine.js` and `sequenceUtils.js`

