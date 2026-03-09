import os
<<<<<<< HEAD
import json
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# 1. Load Keys from your local .env
load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def backup_database():
    try:
        if not url or not key:
            raise ValueError("Keys missing from .env file!")
            
        supabase = create_client(url, key)
        print("🔗 Connected to Supabase...")

        tables = ["courses", "sequences"] # Add your table names here
        os.makedirs("backups", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for table in tables:
            data = supabase.table(table).select("*").execute()
            filename = f"backups/{table}_{timestamp}.json"
            with open(filename, "w") as f:
                json.dump(data.data, f, indent=4)
            print(f"✅ Saved {table} to {filename}")

        print("\n🏆 DATA SECURED. Ready for refactor.")
    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    backup_database()
=======
from dotenv import load_dotenv
from supabase import create_client

# 1. Load keys (looking one folder up if this is in /scripts)
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# 2. Initialize the client
supabase = create_client(url, key)
print("✅ Supabase Link Active.")

# --- WORKBENCH AREA ---
# You can highlight these lines below and run them to explore:
# res = supabase.table("courses").select("*").limit(5).execute()
# print(res.data)
>>>>>>> main
