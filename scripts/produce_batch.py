import json
import os
import pyperclip
<<<<<<< HEAD
import time
from PIL import ImageGrab
from workbench import supabase

# Paths
PROGRESS_FILE = "data/production_progress.json"
ASSET_DIR = "assets/yoga_cards"
os.makedirs(ASSET_DIR, exist_ok=True)
=======
from workbench import supabase

# Source of Truth for Progress
PROGRESS_FILE = "data/production_progress.json"
>>>>>>> main

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

<<<<<<< HEAD
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
=======
def get_next_manual_batch(limit=5):
    current_offset = load_progress()
    
    # FETCH: Accessing the specific instructions we collected in Supabase
    res = supabase.table("stages").select("""
        id,
        title,
        symbol_prompt,
        oracle_lore,
        asanas!inner ( name, iast, devanagari )
    """).range(current_offset, current_offset + limit - 1).execute()

    if not res.data:
        print("🏁 MISSION COMPLETE: No more rows in Supabase.")
        return

    batch_payload = []
    print(f"\n--- 🗃️ EXTRACTING INSTRUCTIONS (Offset: {current_offset}) ---")
    
    for row in res.data:
        parent = row.get('asanas', {})
        stage_id = row['id']
        
        # Determine Era based on ID
        if stage_id < 80:
            era = "LINEAR (Bauhaus / Precise lines)"
        elif stage_id < 160:
            era = "CURVILINEAR (Pranic / Spirals)"
        else:
            era = "POLYGONAL (Architectural / Triangles)"

        batch_payload.append({
            "filename": f"{parent.get('name').replace(' ', '_')}_Stage_{stage_id}.png",
            "text_top": parent.get('devanagari'),
            "text_sub": f"{parent.get('iast')} {row.get('title')}".strip(),
            "design_era": era,
            "instruction_sigil": row.get('symbol_prompt'),
            "instruction_lore": row.get('oracle_lore')
        })
    
    # Create the Prompt Wrapper
    json_data = json.dumps(batch_payload, indent=2, ensure_ascii=False)
    
    # This 'Super-Prompt' uses the Lore and Sigil fields to guide the AI
    final_clipboard_content = f"""
    ROLE: Senior Iyengar Yoga Scholar & Bauhaus Graphic Designer.
    TASK: Create {len(batch_payload)} minimalist cards using the provided JSON instructions.
    
    DESIGN RULES:
    - Background: Solid flat #F9F9F7 (Cream).
    - Ink: Solid #333333 (Charcoal).
    - Aspect Ratio: 3:4.
    - Mandatory Negative Prompt: No dark backgrounds, no slate, no 3D textures, no humans.
    
    INSTRUCTION SET:
    {json_data}
    
    For each item, use 'instruction_sigil' for the geometry and 'instruction_lore' for the overall meditative mood.
    """
    
    pyperclip.copy(final_clipboard_content)
    print(f"🚀 {len(batch_payload)} instructions copied to clipboard!")
    
    confirm = input("Confirm successful generation in Gemini to advance progress? (y/n): ")
    if confirm.lower() == 'y':
        save_progress(current_offset + len(res.data))

if __name__ == "__main__":
    get_next_manual_batch(limit=5)
>>>>>>> main
