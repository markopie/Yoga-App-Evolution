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

## Next Targets (Remaining in app.js)
- [ ] Extract `setPose()` and related pose rendering logic into `src/ui/posePlayer.js` (~425 lines — largest remaining block)
- [ ] Extract `getExpandedPoses()` / macro engine into `src/services/sequenceEngine.js` (~160 lines)
- [ ] Move timer event callbacks (`playbackEngine.onStart`, `onTick`, `onTransitionStart` etc.) into playback module (~300 lines)
- [ ] Extract `updateTotalAndLastUI`, `calculateTotalSequenceTime`, `getEffectiveTime` into `src/utils/sequenceUtils.js`
- [x] ~~Move `openHistoryModal` wiring into `src/ui/historyModal.js`~~ — **Done**
- [x] ~~Extract `renderGlobalHistory` / `switchHistoryTab`~~ — **Done**
- [ ] Clean up remaining stale comments and dead code
- [ ] Add `?v=28` to remaining unversioned imports (`durationDial.js`, `courseUI.js`, `renderers.js`)
