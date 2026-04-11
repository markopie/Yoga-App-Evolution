# 📘 Project Best Practices

## 1. Project Purpose
This repository, **Yoga-App-Evolution**, contains the Yoga App Evolution web app and supporting tooling.

The main product is a browser-first yoga sequencing and playback application built with vanilla JavaScript modules, modular CSS, and Supabase-backed data/services. The repo also contains operational scripts for auditing data, migrations, asset management, and one-off maintenance tasks.

The codebase includes:
- frontend UI code for browsing, building, editing, and playing yoga sequences
- playback and timer logic
- Supabase service/adaptor code
- utility/parsing logic
- operational scripts for data cleanup, migration, and audits

## 2. Project Structure

### Top-level files
- `package.json`: project metadata and scripts
- `index.html`, `app.js`: browser app entry points
- `README.md`, `docs/`: project documentation, notes, and refactor guidance

### Key directories
- `src/`: active application code
  - `config/`: runtime configuration
  - `playback/`: timer, audio, and playback logic
  - `services/`: Supabase access, persistence, data adapters, and sequence-related services
  - `store/`: application state modules
  - `ui/`: UI modules for builder flows, browsing, playback screens, and wiring
  - `utils/`: pure helpers, parsers, DOM utilities, and formatting logic
- `styles/`: active styling system for the current app
  - use modular stylesheet files here for new styling work
  - this is the source of truth for active styling
- `scripts/`: operational scripts for audits, migration, repair jobs, and data tooling
  - these are separate CLIs and should be treated differently from browser app code
- `supabase/`: SQL migrations, policies, and related backend assets
- `legacy/`: a personal holding area for old or discarded files
  - treat this as a trash-can/archive folder, not part of the active app
  - do not use files here for implementation unless explicitly instructed

### Important structure rules
- Do not modify files under `legacy/`. They are not part of the active app.
- Do not add new styling to `style.css`. It is inactive.
- Use style modules under `styles/` for all current frontend styling work.
- Keep browser/runtime code separate from scripts/CLI code.

## 3. Current Architecture Principles

### Frontend app
The active frontend is organized by feature and responsibility:
- UI modules handle DOM rendering, event wiring, and interaction flows
- service modules handle persistence and external data access
- store modules hold shared UI/app state
- utility modules contain pure reusable logic

### Services and data access
Supabase access should be centralized through service/adaptor layers rather than scattered through UI code. This makes the code easier to reason about, test, and refactor.

### Operational scripts
Scripts under `scripts/` are maintenance tools, not app modules. They may be Node or Python. Avoid importing browser-only code into these scripts.

## 4. Styling Rules
- The active styling system lives in `styles/`.
- New styling should go into the appropriate style module in `styles/`, not into deprecated or inactive global files.
- `style.css` is inactive and should not be used for new changes.
- Avoid editing anything in `legacy/`.
- Keep styles modular and scoped by feature where practical.
- Prefer clean, minimal UI patterns and avoid one-off inline styling unless there is a strong reason.

## 5. Development Workflow
- The app is now developed and tested primarily through **VS Code Go Live**.
- Do not assume Vite is the active development workflow unless explicitly reintroduced.
- Changes should work in the current browser-first local setup.

## 6. Code Style
- Language: modern JavaScript using ES modules
- No TypeScript unless the project is intentionally migrated later
- Prefer `async/await` for asynchronous code
- Keep async boundaries explicit in services and callers
- Prefer pure functions in utility modules
- Avoid unnecessary mutation where a returned value is clearer

### Naming conventions
- files: follow existing repo conventions consistently
- functions: `camelCase`
- constants: `UPPER_SNAKE_CASE` or clear local constants as appropriate
- test files: `*.test.js`, ideally adjacent to the module being tested

### Comments and documentation
- Use comments sparingly and only where behavior is not obvious
- Prefer clear naming over explanatory comments
- Keep docs updated when architecture or workflows change
- When handling legacy or compatibility behavior, document the assumption clearly

### Error handling
- Use `try/catch` at service boundaries
- Log useful errors without hiding important failures
- Return graceful fallbacks where appropriate in UI code
- Operational scripts should fail clearly on unrecoverable errors and ideally support dry-run modes

## 7. Testing Strategy
- Prefer small, deterministic unit tests for pure logic
- Best candidates for tests:
  - parsing
  - timing logic
  - formatting/normalization
  - sequence expansion and transformation logic
- Avoid tests that require live production data
- Keep network/database access behind adapters so pure logic remains testable
- Integration-style checks can be done via dedicated scripts or controlled test environments

## 8. Common Patterns
- Adapter/service pattern for Supabase and persistence
- Small pure utilities in `src/utils/`
- State kept in store modules rather than hidden globals where possible
- UI modules should work through explicit imports and DOM queries rather than broad global coupling
- If something must be exposed on `window` for browser compatibility, keep that surface small and deliberate

## 9. Do’s and Don’ts

### Do
- Do make small, incremental changes
- Do verify import/reference chains before editing files
- Do treat `styles/` as the active styling layer
- Do keep scripts idempotent where possible
- Do keep browser code separate from Node/Python tooling
- Do preserve existing behavior unless intentionally changing it
- Do check whether a file is actually part of the active app before modifying it
- Do prefer explicit imports over implicit globals in new code

### Don’t
- Don’t edit `legacy/`
- Don’t add new styling to `style.css`
- Don’t mix browser DOM code into Node or Python operational scripts
- Don’t embed credentials in code
- Don’t assume older files are still part of the live app
- Don’t introduce heavy frameworks for small UI changes
- Don’t make broad refactors when a local fix is enough

## 10. Tools and Dependencies
- Supabase for backend persistence/data access
- Vanilla JavaScript modules for frontend logic
- Plain CSS modules/files under `styles/` for styling
- Node-based tooling for some scripts
- Python for some operational scripts and audits

### Setup
- Use environment variables for secrets and keys
- Keep `.env`-driven configuration out of committed code
- Run only the tooling relevant to the part of the repo you are changing

## 11. Notes for AI Coding Assistants
- Verify before editing: do not assume a file is active just because it exists
- Trace real imports/references before changing CSS, JS, or HTML entry points
- Prefer the active app code under `src/` and active styles under `styles/`
- Do not use `legacy/`
- Do not use `style.css`
- Keep changes minimal, focused, and production-safe
- When fixing UI/export issues, inspect the actual render path rather than guessing
- When a runtime error appears, trace the real call chain and fix the root cause rather than patching symptoms
- Do not replace active modular code with new global patterns unless explicitly requested

## 12. Domain-Specific Notes
- Sequence text parsing and formatting logic is sensitive and should be changed carefully
- Builder/editor flows often involve modal UI, dynamic DOM updates, and stateful interactions
- Export/print behavior should be handled carefully because live modal DOM is not always suitable for direct capture
- Some browser-only helpers may still be exposed globally for compatibility, but new code should prefer explicit module boundaries