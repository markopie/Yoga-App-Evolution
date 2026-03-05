# Refactor Roadmap (Supabase-First Cleanup)

This project has moved to Supabase for data and storage concerns. The next refactor phases should remove legacy file-based pathways and continue splitting the legacy `app.js` monolith.

## What this change starts
- Removes legacy admin-mode toggles and checks that no longer match the current product direction.
- Introduces a `src/` directory with extracted modules for:
  - runtime config (`src/config/appConfig.js`)
  - Supabase client bootstrapping (`src/services/supabaseClient.js`)
  - shared DOM helpers (`src/utils/dom.js`)

## Next phases
1. **Data adapters**
   - Extract course/asana fetch + transform logic into `src/services/` modules.
   - Keep a single Supabase source of truth (remove old CSV/JSON/Airtable compatibility branches).

2. **Playback engine**
   - Extract timer/audio/state transitions into `src/playback/` modules.
   - Add unit tests for hold parsing + elapsed/remaining calculations.

3. **UI rendering split**
   - Move modal, list, history, and builder rendering into `src/ui/` files.
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
