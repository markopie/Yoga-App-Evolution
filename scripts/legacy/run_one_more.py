import os, io
from PIL import Image
from workbench import supabase

# --- CONFIG ---
LOCAL_FOLDER = r"C:\Projects\Yoga-App-Evolution\assets\yoga_cards"
BUCKET_NAME = "yoga-cards"
# Targeted filename
TARGET_FILE = "074_021_salamba_sirsasana_corner.png"

def convert_and_sync_single():
    file_path = os.path.join(LOCAL_FOLDER, TARGET_FILE)
    
    if not os.path.exists(file_path):
        print(f"❌ Error: {TARGET_FILE} not found in {LOCAL_FOLDER}")
        return

    print(f"🚀 Starting Targeted Sync for: {TARGET_FILE}...")
    webp_cloud_name = TARGET_FILE.replace(".png", ".webp")
    
    try:
        # 1. Convert to WebP in memory
        img = Image.open(file_path)
        buffer = io.BytesIO()
        img.save(buffer, format="WEBP", quality=80, method=6) 
        file_data = buffer.getvalue() 

        # 2. Upload to Supabase Storage (Upsert handles overwrites)
        supabase.storage.from_(BUCKET_NAME).upload(
            path=webp_cloud_name, 
            file=file_data,
            file_options={"content-type": "image/webp", "upsert": "true"}
        )

        # 3. Get Public URL
        public_url = supabase.storage.from_(BUCKET_NAME).get_public_url(webp_cloud_name)

        # 4. Route to Stages Table
        # Filename: 074_021_... -> parts[1] is '021'
        parts = TARGET_FILE.split('_')
        stage_id = int(parts[1]) # ID 21
        
        res = supabase.table("stages").update({"image_url": public_url}).eq("id", stage_id).execute()
        
        if res.data:
            print(f"✅ STAGE {stage_id} -> WebP Uploaded & Linked to DB.")
            print(f"🔗 URL: {public_url}")
        else:
            print(f"⚠️ Warning: Stage ID {stage_id} not found in database table.")

    except Exception as e:
        print(f"❌ Error processing {TARGET_FILE}: {e}")

if __name__ == "__main__":
    convert_and_sync_single()