# 📘 Project Best Practices

#### 1. Project Purpose
This repository implements the Yoga App Evolution client and tooling: a browser-first web application for authoring and playing yoga sequences, plus a set of Python/Node scripts for data auditing, migration, and asset management. The codebase mixes frontend UI code (vanilla JS modules + CSS), utility libraries, playback/timing engines, and operational scripts that interact with Supabase for persistence.

#### 2. Project Structure
- Top-level files
  - package.json: npm scripts, test runner uses `node --test`, dev uses Vite.
  - index.html, app.js: application entry for the browser build.
  - README.md, docs/: project documentation and refactor notes.
- Key directories
  - src/: core application code
    - config/: runtime configuration (appConfig.js)
    - playback/: audio & timing engines (audioEngine.js, timer.js, timerEvents.js)
    - services/: data persistence and adapters (supabaseClient.js, dataAdapter.js, persistence.js, sequenceEngine.js)
    - store/: application state modules (state.js, builderState.js)
    - ui/: UI components and wiring (builder.*, courseUI.js, posePlayer.js)
    - utils/: pure helpers and parsers (parsing.js, sequenceUtils.js, dom.js)
  - scripts/: maintenance and migration scripts (Python & JS) — used for audits, bulk fixes, and data migration with Supabase.
  - styles/: CSS used by the app. No CSS-in-JS; plain stylesheet modules.
  - supabase/: SQL migrations and RLS policies.

Separation of concerns
- Frontend app is organized by feature (playback, ui, services) with utils for shared logic.
- Operational scripts live in scripts/ and may be Python or Node; treat them as separate CLIs.

#### 3. Test Strategy
- Framework: Node's built-in test runner (node --test) is used for unit tests (see src/utils/parsing.test.js).
- Location & naming: tests live adjacent to the modules they verify (src/utils/parsing.test.js). Tests use ES module imports and node:test + assert.
- Philosophy: prefer small, deterministic unit tests for pure utilities (parsers, formatters). Integration tests are manual or via scripts that call Supabase and are intentionally gated behind dry-run flags.
- Mocking: keep tests pure and avoid network calls. For services that contact Supabase or external APIs, wrap calls behind adapters (services/dataAdapter.js, supabaseClient.js) so they can be replaced by fakes in tests.
- When to add tests:
  - Always add unit tests for parsers, formatters, and math (timing) logic.
  - Add integration tests for sequence expansion, macro resolution, or persistence only when running against a dedicated test instance.

#### 4. Code Style
- Language: modern ES modules (package.json type: module) and plain JavaScript. No TypeScript in the repo currently.
- Async: use async/await for asynchronous code; services often return Promises. Keep async boundary explicit in services and callers.
- Immutability: prefer returning new objects from pure helpers (e.g., parseHoldTimes) rather than mutating inputs.
- Naming conventions:
  - files: kebab-case or camelCase under src/ (e.g., sequenceUtils.js, builderParser.js)
  - functions: camelCase
  - constants: UPPER_SNAKE or camelCase depending on context; central config lives in src/config/appConfig.js
  - test files: module.test.js adjacent to module file
- Comments & documentation:
  - Use inline comments sparingly for non-obvious behavior (e.g., normalization rules, legacy compatibility). Keep top-of-file notes for assumptions (e.g., DB formats).
  - Keep docs/ updated for architecture notes and migration instructions.
- Error handling:
  - Use try/catch at service boundaries. Log errors with console.error and return graceful fallbacks when appropriate.
  - Operational scripts should exit non-zero on unrecoverable errors and support dry-run flags.

#### 5. Common Patterns
- Adapter pattern for external services: supabaseClient.js and dataAdapter.js centralize DB calls and make it easier to mock or swap backends.
- Small pure utilities in src/utils/ that are fully unit-tested (parsing.js, sequenceUtils.js).
- UI wiring: UI modules export functions that operate on DOM nodes (dom.js helps element selection/shortcuts).
- Scripts vs app: scripts/ are separate CLIs; avoid importing runtime UI modules into these scripts to prevent browser-only assumptions.
- Global exposure: a few helpers are exposed to window when running in-browser (e.g., getHoldTimes). Prefer explicit imports over global access in new code.

#### 6. Do's and Don'ts
- ✅ Do write unit tests for all parsing and timing logic. Keep tests fast and deterministic.
- ✅ Do wrap network calls behind service adapters to enable mocking in tests.
- ✅ Do keep operational scripts idempotent and provide --dry-run modes.
- ✅ Do prefer pure functions in utils; avoid side-effects.
- ✅ Do run lint (npm run lint) and tests (npm test) before committing.

- ❌ Don't embed credentials in code. Use environment variables and dotenv in scripts.
- ❌ Don't rely on window.* globals in modules that may run in Node (keep browser-only code behind guards).
- ❌ Don't add heavy integration tests that require production data — use local or test instances.
- ❌ Don't change DB schema behavior without updating SQL migrations under supabase/migrations and docs/.

#### 7. Tools & Dependencies
- Key tooling
  - Vite: development server & build for frontend (npm run dev).
  - Node's built-in test runner: tests executed with `node --test` (npm test).
  - ESLint with @eslint/js and eslint-plugin-check-file for linting.
  - @supabase/supabase-js: Supabase client used by services.
  - Python: many operational scripts are Python-based; requirements.txt lists dependencies.
- Setup
  - Copy .env.example → .env and fill Supabase keys when running scripts that require DB access.
  - For dev: npm install, npm run dev to start the Vite dev server. Use npm run build / preview for production build.

#### 8. Other Notes (for LLMs generating code)
- Prefer small, incremental changes. The codebase mixes browser and Node contexts; ensure code intended for Node does not reference window or DOM APIs.
- Keep exports explicit and use ES module syntax. Tests rely on named exports from modules (e.g., parsing.js).
- Preserve backward-compatible behavior: many scripts are one-off operational tools expected to print human-readable output — do not remove logging there.
- Domain edge cases:
  - Sequence text parsing accepts `|`-delimited rows and expects IDs padded to 3 digits; maintain normalization rules.
  - Hold-time strings may be `MM:SS` or seconds-only and keys are case-insensitive (Standard, Short, Long, Flow).
- When adding tests, use node:test & assert to match existing test style and keep them adjacent to modules.

---
