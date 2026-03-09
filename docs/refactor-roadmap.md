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
- Kept `app.js` behavior stable by swapping to imports only (no feature rewrite in this phase).

## Next phases
1. **Data adapters**
   - Extract course/asana fetch + transform logic into `src/services/` modules.
   - Keep a single Supabase source of truth (remove old CSV/JSON/Airtable compatibility branches).

2. **Playback engine**
   - Extract timer/audio/state transitions into `src/playback/` modules.
   - Add unit tests for hold parsing + elapsed/remaining calculations.

3. **UI rendering split**
   - Move modal, list, history, and builder rendering into `src/ui/` files.
     - **Completed:** Extracted Browse UI logic into `src/ui/browse.js`.
     - **Completed:** Extracted Sequence Builder logic into `src/ui/builder.js`.
     - **Completed:** Extracted History Modal logic into `src/ui/historyModal.js`.
     - **Completed:** Extracted Event Wiring into `src/ui/wiring.js`.
   - Keep `app.js` as an orchestration entrypoint only.

4. **Legacy cleanup pass**
   - Remove dead comments and stale compatibility notes.
   - Remove unused helper functions and stale globals.

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
