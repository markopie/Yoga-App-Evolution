import os
import sys
import json
import glob
import time
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
    os.path.join(LOCAL_DOCS_DIR, "asana.md")
]
STAGES_PATHS = [
    os.path.join(G_DRIVE_DIR, "stages.md"),
    os.path.join(LOCAL_DOCS_DIR, "stages.md")
]

# ==========================================
# CORE LOGIC
# ==========================================

def get_all_tables() -> list:
    """Dynamically fetches all public tables via Supabase RPC."""
    try:
        res = supabase.rpc("get_tables", {}).execute()
        if res.data:
            return [table['name'] for table in res.data]
        else:
            print("❌ Fatal: RPC 'get_tables' returned no tables. Did you run the SQL script?")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Fatal: Failed to execute 'get_tables' RPC. Error: {e}")
        sys.exit(1)

def fetch_all_paginated(table_name: str, select_query: str = "*", order_by: str = "id") -> list:
    """Safely circumvents the 1,000-row limit by paginating requests."""
    all_data = []
    page_size = 1000
    start = 0

    try:
        while True:
            end = start + page_size - 1
            res = supabase.table(table_name).select(select_query).order(order_by).range(start, end).execute()
            
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

def prune_old_backups():
    """Maintains storage hygiene by removing old backups."""
    print(f"🧹 Pruning backups older than {BACKUP_RETENTION_DAYS} days...")
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
        print(f"✅ Removed {pruned_count} old backup files.")

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
                with open(filename, "w", encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                print(f"   ✅ Secured {len(data)} rows from {table}")
        except Exception as e:
            print(f"   ❌ Failed to backup {table}: {e}")
            
    print(f"🏆 Database Backup Complete.\n")

def sync_table_to_markdown(table_name: str, select_query: str, file_paths: list, title: str):
    """Generates Markdown documentation and saves to multiple file paths."""
    print(f"📡 Syncing {table_name} to Markdown...")
    try:
        headers = [h.strip() for h in select_query.split(',')]
        data = fetch_all_paginated(table_name, select_query)
        
        if data:
            # Build the Markdown string once in memory
            content = f"# {title}\n\n"
            content += f"> Last Sync: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Total Records: {len(data)}\n\n"
            content += "| " + " | ".join(headers) + " |\n"
            content += "| " + " | ".join(["---"] * len(headers)) + " |\n"
            
            for row in data:
                row_data = [str(row.get(h, "")).replace("\n", " ") for h in headers]
                content += "| " + " | ".join(row_data) + " |\n"
            
            # Write the exact same content to all requested paths
            for path in file_paths:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"✅ Written to {path}")
                
    except Exception as e:
        print(f"❌ Failed Markdown sync for {table_name}: {e}")

def run_pre_push_workflow():
    """Master workflow orchestrator."""
    prune_old_backups()
    backup_database()
    
    sync_table_to_markdown(
        'asanas', 
        'id, name, iast, requires_sides', 
        ASANA_PATHS, 
        "Primary Asana Database"
    )
    
    sync_table_to_markdown(
        'stages', 
        'id, asana_id, stage_name, title', 
        STAGES_PATHS, 
        "Asana Stages & Variations Mapping"
    )

if __name__ == "__main__":
    run_pre_push_workflow()