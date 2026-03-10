import json
import os
import pyperclip
import time
from PIL import ImageGrab
from workbench import supabase

# Paths
PROGRESS_FILE = "data/production_progress.json"
ASSET_DIR = "assets/yoga_cards"
os.makedirs(ASSET_DIR, exist_ok=True)

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            try: return json.load(f).get("last_offset", 0)
            except: return 0
    return 0

def save_progress(offset):
    os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump({"last_offset": offset}, f)

def run_production_manager():
    # 1. Integrity Check: Count total stages for progress tracking
    count_res = supabase.table("stages").select("id", count="exact").execute()
    total_stages = count_res.count

    while True:
        current_offset = load_progress()
        
        # 2. Fetch Source of Truth from Supabase
        res = supabase.table("stages").select("""
            id, title, symbol_prompt, oracle_lore,
            asanas!inner ( name, iast, devanagari )
        """).range(current_offset, current_offset).execute()

        if not res.data:
            print("\n🏁 MISSION COMPLETE: All poses processed.")
            break

        row = res.data[0]
        parent = row.get('asanas', {})
        stage_id = row['id']
        
        # 3. Era Logic & Filename
        era = "LINEAR" if stage_id < 80 else "CURVILINEAR" if stage_id < 160 else "POLYGONAL"
        clean_name = f"{parent.get('name').replace(' ', '_')}_Stage_{stage_id}.png"
        save_path = os.path.join(ASSET_DIR, clean_name)

        # 4. Build Prompt for Gemini Ultra
        prompt = f"""Role: Asana Production Engine v2.5. Use Nano Banana 2.
Background: Solid #F9F9F7. Ink: Solid #333333 Charcoal.
Top Center: "{parent.get('devanagari')}". Sub-header: "{parent.get('iast')} {row.get('title')}".
Iconography: {era} style. Logic: {row.get('symbol_prompt')}. Lore: {row.get('oracle_lore')}.
Negative Prompt: No dark backgrounds, no slate, no 3D, no humans. Aspect: 3:4."""
        
        pyperclip.copy(prompt)
        
        print(f"\n--- 🏭 [{current_offset + 1}/{total_stages}] PROCESSING: {clean_name} ---")
        print(f"🚀 PROMPT COPIED. Generate in Gemini, COPY THE IMAGE, then return here.")

        # 5. The "Image Catch" Loop
        while True:
            action = input("Action: [v] Paste from Clipboard / [s] Skip / [q] Quit: ").lower()
            
            if action == 'v':
                img = ImageGrab.grabclipboard()
                if img:
                    img.save(save_path, "PNG")
                    print(f"✅ SAVED: {save_path}")
                    save_progress(current_offset + 1)
                    break # Success! Loop to next stage.
                else:
                    print("❌ CLIPBOARD EMPTY. Did you right-click 'Copy Image' in Gemini?")
            elif action == 's':
                print("⏭️ Skipping...")
                save_progress(current_offset + 1)
                break
            elif action == 'q':
                print("👋 Progress preserved. Session ended.")
                return

if __name__ == "__main__":
    run_production_manager()
