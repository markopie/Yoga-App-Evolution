# Browser Test Harness

Yoga-App-Evolution uses Playwright for real-browser checks of the main practice flow and curriculum roadmap.

## Setup

Install Playwright browsers once on each machine:

```bash
npx playwright install
```

The harness is committed under `tests/browser/` and runs the built app through Vite preview.

## Run

```bash
npm run test:browser
```

Headed mode:

```bash
npm run test:browser:headed
```

Interactive Playwright UI:

```bash
npm run test:browser:ui
```

Open the last HTML report:

```bash
npm run test:browser:report
```

Failure artifacts are enabled in Playwright config:

- screenshots on failure
- traces retained on failure
- videos retained on failure

Generated artifacts are ignored by git: `playwright-report/`, `test-results/`, and `blob-report/`.

## Supabase Modes

Default browser tests do not require cloud or local Supabase. The Playwright web server sets:

```bash
VITE_BROWSER_TEST_MOCKS=1
```

That enables a small browser-only Supabase mock with deterministic auth, courses, curriculum nodes, rating options, and completions. It covers:

- guest sign-in
- Start Today's Practice
- completion/rating advancement
- composed practice loading
- recovery/non-sequence loading
- Curriculum Map rendering and station interaction

The optional local Supabase smoke test is skipped by default. To run it, provide a real local runtime and disable mocks:

```bash
RUN_LOCAL_SUPABASE_SMOKE=1 VITE_BROWSER_TEST_MOCKS=0 VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npm run test:browser -- tests/browser/local-supabase-smoke.spec.mjs
```

PowerShell:

```powershell
$env:RUN_LOCAL_SUPABASE_SMOKE='1'
$env:VITE_BROWSER_TEST_MOCKS='0'
$env:VITE_SUPABASE_URL='...'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='...'
npm run test:browser -- tests/browser/local-supabase-smoke.spec.mjs
```

Use local Supabase when validating database policies, RPC behavior, seed data, or end-to-end completion writes. Use the default mock harness for fast UI regression checks during normal feature work.

## Codex Workflow

During curriculum or playback changes, Codex should run:

```bash
npm run build
npm test
npm run lint
npm run test:browser
```

For roadmap UX work, inspect the browser test around `data-testid="curriculum-station-hit-target"` and add targeted checks before changing the map. Keep visible stations tasteful; enlarge the invisible hit target when touch usability is the concern.
