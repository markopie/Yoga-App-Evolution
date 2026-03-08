import os
import json
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# 1. Load Keys from your local .env
load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def get_all_tables(supabase):
    """Fetches all table names from the public schema."""
    # This query looks into the postgres internal schema to find your tables
    res = supabase.rpc("get_tables", {}).execute()
    
    # If the RPC doesn't exist yet, we'll use a fallback list or a direct query
    if hasattr(res, 'error') and res.error:
        print("⚠️ Note: 'get_tables' RPC not found. Falling back to manual list.")
        return ["courses", "sequences"] # Add others here if RPC fails
    
    return [table['name'] for table in res.data]

def backup_database():
    try:
        if not url or not key:
            raise ValueError("Keys missing from .env file!")
            
        supabase = create_client(url, key)
        print("🔗 Connected to Supabase...")

        # 2. Automatically find all tables
        # NOTE: If this fails, see the SQL step below!
        tables = get_all_tables(supabase)
        
        os.makedirs("backups", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        print(f"📂 Found {len(tables)} tables. Starting download...")

        for table in tables:
            data = supabase.table(table).select("*").execute()
            filename = f"backups/{table}_{timestamp}.json"
            with open(filename, "w") as f:
                json.dump(data.data, f, indent=4)
            print(f"   ✅ {table} -> {filename}")

        print(f"\n🏆 SUCCESS. {len(tables)} tables secured.")
    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    backup_database()