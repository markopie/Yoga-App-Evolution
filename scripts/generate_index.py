import os
import re
import sys
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

try:
    from workbench import supabase
except Exception as e:
    print(f"❌ Connection Error: {e}")
    sys.exit(1)

# Configuration
OUTPUT_DIR = r"G:\My Drive\Personal\02_Education_Yoga\Yoga_Project_Files"
ASANA_FILE = os.path.join(OUTPUT_DIR, "asana.md")
STAGES_FILE = os.path.join(OUTPUT_DIR, "stages.md")

def sync_table_to_markdown(table_name, select_query, file_path, title):
    """Fetches data and creates a Markdown table with exact column headers."""
    print(f"📡 Syncing {table_name}...")
    try:
        # Extract headers from the select query (handles spaces/commas)
        headers = [h.strip() for h in select_query.split(',')]
        
        res = supabase.table(table_name).select(select_query).order('id').execute()
        
        if res.data:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(f"# {title}\n\n")
                f.write(f"> Last Sync: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                
                # Generate Markdown Table Header
                f.write("| " + " | ".join(headers) + " |\n")
                f.write("| " + " | ".join(["---"] * len(headers)) + " |\n")
                
                # Generate Rows
                for row in res.data:
                    row_data = [str(row.get(h, "")) for h in headers]
                    f.write("| " + " | ".join(row_data) + " |\n")
            print(f"✅ Created {os.path.basename(file_path)}")
    except Exception as e:
        print(f"❌ Failed {table_name}: {e}")

def run_sync():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Sync Asanas: Focus on ID, Name, and Side requirements
    sync_table_to_markdown(
        'asanas', 
        'id, name, iast, requires_sides', 
        ASANA_FILE, 
        "Primary Asana Database"
    )
    
    # Sync Stages: Direct mapping of variation IDs to base Asanas
    sync_table_to_markdown(
        'stages', 
        'id, asana_id, stage_name, title', 
        STAGES_FILE, 
        "Asana Stages & Variations Mapping"
    )

if __name__ == "__main__":
    run_sync()