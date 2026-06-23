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
- auth UI error messages (bad password, sign-in errors)

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

## Authentication Guide

### Using Guest mode for development

Click **Continue as Guest** on the login screen. The app starts an anonymous Supabase session and loads immediately. Guest mode is the fastest way to develop and test UI without a real email account.

Guest progress is stored in the cloud just like a named account but is tied to an anonymous user ID that is local to the device.

### Creating or resetting a cloud email account

1. Open the **Email and password** panel on the login screen.
2. Enter your email and a password (minimum 6 characters).
3. Click **Create email account**.
   - If Supabase email confirmation is enabled, you will receive a confirmation email. Click the link in that email before trying to sign in.
   - If sign-ups are disabled in the Supabase project settings, the app will show a clear message — contact the project administrator.
4. To reset a forgotten password: enter your email, click **Reset password**, and follow the link sent to your inbox.

### Distinguishing cloud from local Supabase

Open the browser console. On startup the app logs one of:

- `[Supabase] Browser test mock enabled.` — running with `VITE_BROWSER_TEST_MOCKS=1`
- `[Supabase] Runtime target: { url: "https://…supabase.co", target: "cloud", … }` — using cloud Supabase
- `[Supabase] Runtime target: { url: "http://127.0.0.1:54321", target: "local", … }` — using local Supabase
- `[Supabase] Missing runtime config.` — no Supabase configured; login will show a configuration notice

The `target` value is set by `VITE_SUPABASE_TARGET` in your `.env.local` file (`local` or `cloud`).

### What "Invalid login credentials" means

Supabase returns HTTP 400 with "Invalid login credentials" in two situations:

1. **Wrong password** — the email exists but the password is incorrect.
2. **No account** — no user with that email exists in the Supabase project.

Supabase intentionally gives the same response for both to prevent email enumeration. If you are unsure whether an account exists, use **Create email account** first. If you already created an account but are getting this error, use **Reset password**.

Other common causes:
- You created the account via Google and never set a password — use **Continue with Google** instead.
- You are pointing at the wrong Supabase project (check `VITE_SUPABASE_TARGET` and `VITE_SUPABASE_URL`).
- Email confirmation is required but you have not clicked the confirmation link yet.

### Cloud-only Playwright tests

Tests in `tests/browser/auth-ui.spec.mjs` run with the mock by default. The `mock-only auth tests` group is skipped when `VITE_BROWSER_TEST_MOCKS=0`.

Tests that require a real cloud Supabase user are not committed. To add them locally, gate them on an env var and never hardcode credentials:

```js
test.skip(!process.env.CLOUD_TEST_EMAIL, 'Set CLOUD_TEST_EMAIL and CLOUD_TEST_PASSWORD to run');
```

## Codex Workflow

During curriculum or playback changes, Codex should run:

```bash
npm run build
npm test
npm run lint
npm run test:browser
```

For roadmap UX work, inspect the browser test around `data-testid="curriculum-station-hit-target"` and add targeted checks before changing the map. Keep visible stations tasteful; enlarge the invisible hit target when touch usability is the concern.
