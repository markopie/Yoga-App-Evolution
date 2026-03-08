import os
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