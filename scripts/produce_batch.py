import json
import os
import pyperclip
from workbench import supabase

# Source of Truth for Progress
PROGRESS_FILE = "data/production_progress.json"

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