import glob
import json
import os
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client


load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    print("Fatal: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

supabase: Client = create_client(URL, KEY)

ROOT_DIR = Path.cwd()
DOCS_DIR = ROOT_DIR / "docs"
SCHEMA_DIR = DOCS_DIR / "schemas"
BACKUP_DIR = ROOT_DIR / "backups"
BACKUP_RETENTION_DAYS = 14

ASANA_PATHS = [DOCS_DIR / "asana.md"]
STAGES_PATHS = [DOCS_DIR / "stages.md"]


def extract_supabase_schema():
    """Fetch the PostgREST OpenAPI spec and save a local contract file."""
    print("\nExtracting database schema...")

    req = urllib.request.Request(f"{URL}/rest/v1/")
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")

    try:
        with urllib.request.urlopen(req) as response:
            schema_data = json.loads(response.read().decode())

        SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
        full_path = SCHEMA_DIR / "supabase_schema.json"
        full_path.write_text(json.dumps(schema_data, indent=4), encoding="utf-8")
        print(f"Schema contract saved: {full_path}")
    except Exception as error:
        print(f"Failed to extract schema: {error}")


def get_all_tables() -> list:
    """Fetch all public table names via the project RPC."""
    try:
        result = supabase.rpc("get_tables", {}).execute()
        if result.data:
            return [table["name"] for table in result.data]

        print("Fatal: RPC 'get_tables' returned no tables. Did you run the SQL script?")
        sys.exit(1)
    except Exception as error:
        print(f"Fatal: failed to execute 'get_tables' RPC. Error: {error}")
        sys.exit(1)


def fetch_all_paginated(table_name: str, select_query: str = "*", order_by: str = "id") -> list:
    """Fetch a full table by paging around Supabase's default row limit."""
    all_data = []
    page_size = 1000
    start = 0

    try:
        while True:
            end = start + page_size - 1
            result = (
                supabase.table(table_name)
                .select(select_query)
                .order(order_by)
                .range(start, end)
                .execute()
            )

            data = result.data
            if not data:
                break

            all_data.extend(data)

            if len(data) < page_size:
                break

            start += page_size

        return all_data
    except Exception as error:
        if "order" in str(error).lower() or "id" in str(error).lower():
            result = supabase.table(table_name).select(select_query).execute()
            return result.data
        raise error


def prune_old_backups():
    """Remove old local JSON backup files."""
    print(f"\nPruning backups older than {BACKUP_RETENTION_DAYS} days...")
    now = time.time()
    cutoff_time = now - (BACKUP_RETENTION_DAYS * 86400)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    files = glob.glob(str(BACKUP_DIR / "*.json"))

    pruned_count = 0
    for file_path in files:
        if os.path.getmtime(file_path) < cutoff_time:
            os.remove(file_path)
            pruned_count += 1

    if pruned_count:
        print(f"Removed {pruned_count} old backup files.")
    else:
        print("Storage clean. No pruning required.")


def backup_database():
    """Write a dynamic JSON backup for every public table."""
    print("\nStarting dynamic Supabase JSON backup...")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    tables = get_all_tables()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for table in tables:
        try:
            data = fetch_all_paginated(table)
            if data is None:
                continue

            filename = BACKUP_DIR / f"{table}_{timestamp}.json"
            filename.write_text(json.dumps(data, indent=4), encoding="utf-8")
            print(f"Backed up {len(data)} rows from {table}")
        except Exception as error:
            print(f"Failed to back up {table}: {error}")

    print("Database backup complete.\n")


def sync_table_to_markdown(
    table_name: str,
    select_query: str,
    file_paths: list[Path],
    title: str,
    rules_text: str = "",
):
    """Generate markdown documentation for a table."""
    print(f"Syncing {table_name} to markdown...")
    try:
        headers = [header.strip() for header in select_query.split(",")]
        data = fetch_all_paginated(table_name, select_query)

        if not data:
            print(f"No data returned for {table_name}.")
            return

        content = f"# {title}\n\n"
        content += f"> Last Sync: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Total Records: {len(data)}\n\n"

        if rules_text:
            content += f"{rules_text}\n\n"

        content += "| " + " | ".join(headers) + " |\n"
        content += "| " + " | ".join(["---"] * len(headers)) + " |\n"

        for row in data:
            row_data = [str(row.get(header, "")).replace("\n", " ") for header in headers]
            content += "| " + " | ".join(row_data) + " |\n"

        for path in file_paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print(f"Written to {path}")
    except Exception as error:
        print(f"Failed markdown sync for {table_name}: {error}")


def run_pre_push_workflow():
    """Run the local backup and documentation sync workflow."""
    prune_old_backups()
    extract_supabase_schema()
    backup_database()

    print("\nUpdating markdown documentation...")

    asana_rules = (
        "### AI Agent Guidelines\n"
        "- **Bilateral Logic:** Poses marked `requires_sides: True` are automatically played on both sides by the engine. "
        "Do NOT assign `side: R` or `side: L` in sequence JSON unless explicitly restricting the pose to ONE side.\n"
        "- **Valid IDs:** Only use `id` values explicitly listed in this table."
    )

    sync_table_to_markdown(
        "asanas",
        "id, name, iast, requires_sides",
        ASANA_PATHS,
        "Primary Asana Database",
        rules_text=asana_rules,
    )

    sync_table_to_markdown(
        "stages",
        "id, asana_id, stage_name, title",
        STAGES_PATHS,
        "Asana Stages & Variations Mapping",
    )


if __name__ == "__main__":
    run_pre_push_workflow()
