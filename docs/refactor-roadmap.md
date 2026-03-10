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
