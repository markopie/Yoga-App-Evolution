# Codebase Issue Review: Proposed Tasks

## 1) Typo fix task
**Task:** Correct the section numbering typo in `app.js` constants header (`// 4. Other` should be `// 3. Other`).

**Why:** The numbered headings currently jump from section 2 to section 4, which is a small but clear documentation/maintenance typo that can confuse readers scanning the top-level config layout.

**Acceptance criteria:**
- Update comment numbering to be sequential (1, 2, 3, 4...).
- Quick sanity check that no nearby references depend on the old numbering.

## 2) Bug fix task
**Task:** Unify admin mode state so checks use one source of truth.

**Why:** `window.loadAdminMode()` and `window.toggleGodMode()` update `window.adminMode`, but other logic checks the separate local `adminMode` variable, which remains `false`. This can disable admin-only UI paths even after enabling God Mode.

**Acceptance criteria:**
- Remove duplicate state or sync it consistently.
- Replace `typeof adminMode !== 'undefined' && adminMode` checks with `window.adminMode` (or equivalent single state).
- Verify admin-only controls render after toggling God Mode.

## 3) Code comment / documentation discrepancy task
**Task:** Update misleading comments around asset hosting to match actual behavior.

**Why:** The comment says static assets “stay on your host”, but the code hardcodes external CDN-style URLs (`https://arrowroad.com.au/...`). This mismatch can mislead future contributors about deployment assumptions.

**Acceptance criteria:**
- Rewrite comment to accurately describe current external-host setup.
- Optionally add short note describing how to override asset base URLs for other environments.

## 4) Test improvement task
**Task:** Add automated tests for sequence/hold parsing helpers.

**Why:** Core parsing logic (e.g., `parseHoldTimes`, CSV line parsing/normalization) drives timing and playback behavior but has no test harness in `package.json`.

**Acceptance criteria:**
- Add a test runner script (`npm test`).
- Add unit tests for edge cases:
  - Missing hold strings / malformed hold strings.
  - Mixed-case keys (`Hold` vs `hold`) where applicable.
  - CSV rows with notes, macros, and invalid duration values.
- Ensure tests run locally in CI-style non-interactive mode.
