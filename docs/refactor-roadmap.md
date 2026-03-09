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

## Next phases
1. **UI rendering split**
   - Move modal, list, history, and builder rendering into `src/ui/` files.
   - Keep `app.js` as an orchestration entrypoint only.

2. **Component/View Architecture**
   - Consider extracting specific views (Browse, Focus, Builder) into separate ES modules to further decouple `app.js`.

3. **Final Legacy cleanup pass**
   - Remove any remaining dead comments or stale compatibility notes.
   - Ensure no lingering stale DOM element references exist for removed functionality.

## Target architecture
- `app.js` (entrypoint orchestration)
- `src/config/*`
- `src/services/*`
- `src/playback/*`
- `src/ui/*`
- `src/utils/*`
