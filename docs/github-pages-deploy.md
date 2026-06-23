# GitHub Pages Deployment

The production site must serve the Vite build output from `dist/`. Do not publish the repository root directly; the source `index.html` references `/src/main.js` for local development, which GitHub Pages serves as a 404 HTML page.

The committed GitHub Actions workflow at `.github/workflows/deploy-pages.yml` builds and deploys `dist/`.

## Required Repository Settings

In GitHub, set:

- Settings -> Pages -> Source: `GitHub Actions`

Add these repository secrets or variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The deploy workflow fails fast if those values are missing, because login and account creation require Supabase config baked into the Vite production bundle.

## Local Check

```bash
npm run build
```

The generated `dist/index.html` should reference bundled assets such as `./assets/index-...js`, not `/src/main.js`.
