# Development Guide

## Environment Management
We use a Python Virtual Environment to keep dependencies isolated.
- **Location:** `.venv/` (Root)
- **Activation (Windows):** `.\.venv\Scripts\activate`
- **Activation (Mac/Linux):** `source .venv/bin/activate`

## Dependency Workflow
1. **Installing:** When adding a new package, use `pip install <package_name>`.
2. **Persisting:** After installation, update the master list: `pip freeze > requirements.txt`.
3. **Cleanup:** If the environment becomes unstable, delete `.venv` and rebuild using `pip install -r requirements.txt`.

## Tooling & Scripts
- **/scripts/backup.py**: Run this to pull a local snapshot of Supabase tables.
- **/scripts/workbench.py**: Use this as a scratchpad for testing database connections and data manipulation.
- **Supabase Policies:** All Row Level Security (RLS) logic is documented in `docs/DATABASE.md`.