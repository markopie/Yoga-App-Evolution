import os
import json
import time
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel
from google.api_core import exceptions
from dotenv import load_dotenv
from workbench import supabase

# 1. FINALIZED CLOUD CONFIG
load_dotenv()
PROJECT_ID = "gen-lang-client-0495696648" 
LOCATION = "us-central1"

vertexai.init(project=PROJECT_ID, location=LOCATION)

ASSET_DIR = "assets/yoga_cards"
PROGRESS_FILE = "data/production_progress.json"

def run_production_factory(limit=5):
    offset = 0
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            try: offset = json.load(f).get("last_offset", 0)
            except: offset = 0
    
    res = supabase.table("stages").select("""
        id, title, symbol_prompt, oracle_lore,
        asanas!inner ( name, iast, devanagari )
    """).range(offset, offset + limit - 1).execute()

    if not res.data:
        print("🏁 All assets generated.")
        return

    # SWITCHED: Using the high-fidelity (non-fast) model for manual-like quality
    model = ImageGenerationModel.from_pretrained("imagen-4.0-generate-001")

    for row in res.data:
        parent = row['asanas']
        stage_id = row['id']
        file_name = f"{parent['name'].replace(' ', '_')}_Stage_{stage_id}.png"
        save_path = os.path.join(ASSET_DIR, file_name)

        # Style era remains your 'source of truth'
        if stage_id < 80:
            style = "LINEAR: Straight hairline strokes and dots."
        elif stage_id < 160:
            style = "CURVILINEAR: Arcs, circles, and spirals."
        else:
            style = "POLYGONAL: Triangles, diamonds, and squares."

        # Structured for maximum typographic adherence
        prompt = f"""
        ACTUAL TEXT TO PRINT: 
        1. "{parent['devanagari']}" (Top Header)
        2. "{parent['iast']} {row['title']}" (Sub-Header)

        DESIGN: A professional, minimalist yoga oracle card.
        CANVAS: Solid flat #F9F9F7 (Light Cream). 
        INK: Solid #333333 (Charcoal).
        SYMBOL: Unique {style} sigil.
        SYMBOL LOGIC: {row['symbol_prompt']}.
        MOOD: {row['oracle_lore']}.
        """

        # Using a strict negative prompt to kill the 'Moody Slate' look
        neg_prompt = "dark background, slate, black, shadows, 3d, texture, humans, blurry, gradients"

        print(f"🎨 Factory: Rendering {file_name} (High Fidelity)...")
        
        try:
            response = model.generate_images(
                prompt=prompt,
                negative_prompt=neg_prompt,
                number_of_images=1,
                aspect_ratio="3:4",
                add_watermark=False
            )
            
            response[0].save(location=save_path, include_generation_parameters=False)
            print(f"✅ Success: {file_name}")
            
            # Quota: 20s wait between high-res generations
            time.sleep(20)

        except exceptions.ResourceExhausted:
            print(f"⚠️ Quota hit. Stopping batch.")
            break
        except Exception as e:
            print(f"❌ Error: {e}")
            break 

    with open(PROGRESS_FILE, "w") as f:
        json.dump({"last_offset": offset + len(res.data)}, f)
    print(f"🚀 Batch Complete. Next offset: {offset + len(res.data)}")

if __name__ == "__main__":
    run_production_factory(limit=2)