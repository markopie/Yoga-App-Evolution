
**Yoga `AGENTS.md`**
```md
# AGENTS.md

## Project

Yoga App Evolution.
Vite app with Supabase, vanilla JavaScript modules, Playwright, and Python scripts.

## Rules

- Preserve the existing lightweight architecture.
- Do not move timing, duration, or bilateral pose logic into UI files.
- Use existing services and utilities before adding new abstractions.
- Do not commit local credentials, `.env`, Supabase temp files, backups, or generated reports.
- Avoid editing large media/assets unless the task explicitly requires it.

## Commands

Use these before finishing relevant work:

```bash
npm run lint
npm test
npm run build