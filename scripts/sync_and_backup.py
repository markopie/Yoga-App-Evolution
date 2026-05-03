import os
import sys
import json
import glob
import time
import urllib.request
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# ==========================================
# CONFIGURATION & INITIALIZATION
# ==========================================
load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    print("❌ Fatal: Missing Supabase credentials in .env")
    sys.exit(1)

supabase: Client = create_client(URL, KEY)

# Define Output Directories
G_DRIVE_DIR = r"G:\My Drive\Personal\02_Education_Yoga\Yoga_Project_Files"
LOCAL_DOCS_DIR = os.path.join(os.getcwd(), "docs")
BACKUP_DIR = "backups"

BACKUP_RETENTION_DAYS = 14

# Define Dual-Write Paths
ASANA_PATHS = [
    os.path.join(G_DRIVE_DIR, "asana.md"),
    os.path.join(LOCAL_DOCS_DIR, "asana.md"),
]
STAGES_PATHS = [
    os.path.join(G_DRIVE_DIR, "stages.md"),
    os.path.join(LOCAL_DOCS_DIR, "stages.md"),
]
SCHEMA_PATH = r"G:\My Drive\Personal\02_Education_Yoga\Yoga_Project_Files"

# ==========================================
# CORE LOGIC
# ==========================================


def extract_supabase_schema():
    """Fetches the PostgREST OpenAPI spec and saves a static contract file."""
    print("\n🔍 Extracting Database Schema (OpenAPI Spec)...")

    req = urllib.request.Request(f"{URL}/rest/v1/")
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")

    try:
        with urllib.request.urlopen(req) as response:
            schema_data = json.loads(response.read().decode())

            # Static filename for easy indexing and LLM context
            filename = "supabase_schema.json"
            full_path = os.path.join(SCHEMA_PATH, filename)

            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                json.dump(schema_data, f, indent=4)

            print(f"  ✅ Schema contract secured: {full_path}")

    except Exception as e:
        print(f"  ❌ Failed to extract schema: {e}")


def get_all_tables() -> list:
    """Dynamically fetches all public tables via Supabase RPC."""
    try:
        res = supabase.rpc("get_tables", {}).execute()
        if res.data:
            return [table["name"] for table in res.data]
        else:
            print(
                "❌ Fatal: RPC 'get_tables' returned no tables. Did you run the SQL script?"
            )
            sys.exit(1)
    except Exception as e:
        print(f"❌ Fatal: Failed to execute 'get_tables' RPC. Error: {e}")
        sys.exit(1)


def fetch_all_paginated(
    table_name: str, select_query: str = "*", order_by: str = "id"
) -> list:
    """Safely circumvents the 1000-row limit by paginating requests."""
    all_data = []
    page_size = 1000
    start = 0

    try:
        while True:
            end = start + page_size - 1
            res = (
                supabase.table(table_name)
                .select(select_query)
                .order(order_by)
                .range(start, end)
                .execute()
            )

            data = res.data
            if not data:
                break

            all_data.extend(data)

            if len(data) < page_size:
                break

            start += page_size

        return all_data
    except Exception as e:
        if "order" in str(e).lower() or "id" in str(e).lower():
            res = supabase.table(table_name).select(select_query).execute()
            return res.data
        raise e


def generate_schema_markdown(schema_json_path, output_md_path):
    """Parses the OpenAPI JSON to create a scannable architectural map."""
    print(f"📊 Generating scannable Schema Map...")

    with open(schema_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    definitions = data.get("definitions", {})
    content = "# 🏗️ Database Architecture & Data Contract\n\n"
    content += f"> Generated from active Supabase Schema | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

    for table_name, details in definitions.items():
        content += f"## 📋 Table: `{table_name}`\n"
        content += "| Column | Type | Format | Notes |\n"
        content += "| :--- | :--- | :--- | :--- |\n"

        properties = details.get("properties", {})
        required = details.get("required", [])

        for col_name, col_info in properties.items():
            col_type = col_info.get("type", "unknown")
            col_format = col_info.get("format", "-")

            # Identify Keys and Requirements
            prefix = "🔑 " if col_name == "id" else ""
            req_suffix = " **(Required)**" if col_name in required else ""

            # Clean up descriptions (strip HTML tags PostgREST adds)
            desc = (
                col_info.get("description", "")
                .replace("<pk/>", "[PK]")
                .replace("\n", " ")
            )

            content += f"| {prefix}`{col_name}` | {col_type} | {col_format} | {desc}{req_suffix} |\n"
        content += "\n"

    with open(output_md_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✅ Schema Map secured: {output_md_path}")


def prune_old_backups():
    """Maintains storage hygiene by removing old backups."""
    print(f"\n🧹 Pruning backups older than {BACKUP_RETENTION_DAYS} days...")
    now = time.time()
    cutoff_time = now - (BACKUP_RETENTION_DAYS * 86400)

    os.makedirs(BACKUP_DIR, exist_ok=True)
    files = glob.glob(os.path.join(BACKUP_DIR, "*.json"))

    pruned_count = 0
    for file in files:
        if os.path.getmtime(file) < cutoff_time:
            os.remove(file)
            pruned_count += 1

    if pruned_count > 0:
        print(f"  ✅ Removed {pruned_count} old backup files.")
    else:
        print("  ✅ Storage clean. No pruning required.")


def backup_database():
    """Executes a fully dynamic JSON backup."""
    print("\n🔗 Starting Dynamic Supabase JSON Backup...")
    tables = get_all_tables()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for table in tables:
        try:
            data = fetch_all_paginated(table)
            if data is not None:
                filename = os.path.join(BACKUP_DIR, f"{table}_{timestamp}.json")
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=4)
                print(f"  ✅ Secured {len(data)} rows from {table}")
        except Exception as e:
            print(f"  ❌ Failed to backup {table}: {e}")

    print("🏆 Database Backup Complete.\n")


def sync_table_to_markdown(
    table_name: str,
    select_query: str,
    file_paths: list,
    title: str,
    rules_text: str = "",
):
    """Generates Markdown documentation and saves to multiple file paths."""
    print(f"📡 Syncing {table_name} to Markdown...")
    try:
        headers = [h.strip() for h in select_query.split(",")]
        data = fetch_all_paginated(table_name, select_query)

        if data:
            # Build the Markdown string once in memory
            content = f"# {title}\n\n"
            content += f"> Last Sync: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Total Records: {len(data)}\n\n"

            # Inject Agent Rules if provided
            if rules_text:
                content += f"{rules_text}\n\n"

            content += "| " + " | ".join(headers) + " |\n"
            content += "| " + " | ".join(["---"] * len(headers)) + " |\n"

            for row in data:
                row_data = [str(row.get(h, "")).replace("\n", " ") for h in headers]
                content += "| " + " | ".join(row_data) + " |\n"

            # Write the exact same content to all requested paths
            for path in file_paths:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"  ✅ Written to {path}")

    except Exception as e:
        print(f"  ❌ Failed Markdown sync for {table_name}: {e}")


def run_pre_push_workflow():
    """Master workflow orchestrator."""
    prune_old_backups()
    extract_supabase_schema()
    backup_database()

    print("\n📝 Updating Markdown Documentation...")

    # Define AI Guardrails for the Asana map
    asana_rules = (
        "### 🤖 AI Agent Guidelines\n"
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
