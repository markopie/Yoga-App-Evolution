# Yoga Local AI Helper

A small local-only web UI for asking Ollama to draft read-only SQL against the local Supabase database.

## What it does

- Connects Docker to Ollama running on Windows at `host.docker.internal:11434`
- Connects Docker to local Supabase Postgres at `host.docker.internal:54322`
- Asks Ollama to draft SQL
- Blocks obvious destructive SQL
- Runs only one `SELECT` or `WITH` statement at a time
- Uses `set transaction read only` before executing SQL

## Start

From the project root:

```powershell
docker compose -f docker-compose.local-ai.yml up --build
```

Open:

```text
http://localhost:8787
```

## Stop

```powershell
docker compose -f docker-compose.local-ai.yml down
```

## Default model

The compose file uses:

```text
llama3.2:3b
```

You can change this to:

```text
llama3.2:1b
```

or:

```text
gnokit/improve-grammar:latest
```

But `llama3.2:3b` is the best first choice for SQL drafting among the models currently installed.
