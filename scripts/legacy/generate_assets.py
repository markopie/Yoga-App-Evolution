import os, json, time, re, textwrap, unicodedata
from PIL import Image, ImageDraw, ImageFont
from workbench import supabase
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel

# --- CONFIG ---
PROGRESS_FILE_ASANAS = r"C:\Projects\Yoga-App-Evolution\data\production_progress_asanas.json"
ASSET_DIR = r"C:\Projects\Yoga-App-Evolution\assets\yoga_cards"
FONT_DEV = r"C:\Projects\Yoga-App-Evolution\fonts\NotoSansDevanagari-Regular.ttf"
FONT_IAST = r"C:\Projects\Yoga-App-Evolution\fonts\NotoSerif-Regular.ttf"

vertexai.init(project="gen-lang-client-0495696648", location="us-central1")
model = ImageGenerationModel.from_pretrained("imagen-4.0-generate-001")

def slugify(text):
    if not text: return ""
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower().strip()
    return re.sub(r'[^a-z0-9]+', '_', text).strip('_')

def draw_asana_text(draw, devanagari, iast, img_w, img_h):
    margin = img_w * 0.12
    max_w = img_w - (margin * 2)

    # 1. DEVANAGARI (Pure Root)
    dev_size = 90
    if len(devanagari) > 12: dev_size = 70 # Scale down for long Sanskrit roots
    f_dev = ImageFont.truetype(FONT_DEV, dev_size)
    curr_y = img_h * 0.14
    
    # Wrap Devanagari if needed (rare, but handles compound roots)
    dev_lines = textwrap.wrap(devanagari, width=15)
    for line in dev_lines:
        w = draw.textbbox((0, 0), line, font=f_dev)[2]
        draw.text(((img_w - w) / 2, curr_y), line, font=f_dev, fill="#333333")
        curr_y += (dev_size * 1.1)
    
    # 2. IAST (Phonetic Name with Smart Wrap)
    curr_y += 30 # Spacer
    iast_size = 48
    if len(iast) > 25: iast_size = 38 # First stage shrink
    if len(iast) > 40: iast_size = 32 # Deep shrink for Trianga...
    
    f_iast = ImageFont.truetype(FONT_IAST, iast_size)
    
    # Calculate wrapping based on font size
    # Approx 1.8 chars per unit of width for Serif fonts
    wrap_width = int(max_w / (iast_size * 0.5)) 
    lines = textwrap.wrap(iast, width=wrap_width)
    
    for line in lines:
        w = draw.textbbox((0, 0), line, font=f_iast)[2]
        draw.text(((img_w - w) / 2, curr_y), line, font=f_iast, fill="#333333")
        curr_y += (iast_size * 1.2)

def run_asana_production(limit=5):
    res = supabase.table("asanas") \
        .select("id, iast, devanagari, symbol_prompt, oracle_lore") \
        .eq("is_curated", True) \
        .order("id") \
        .execute()
    
    records = res.data
    offset = 0
    if os.path.exists(PROGRESS_FILE_ASANAS):
        with open(PROGRESS_FILE_ASANAS, "r") as f:
            offset = json.load(f).get("last_offset", 0)

    print(f"🚀 Master Asana Pass: {len(records)} records. Resuming from {offset}...")

    for i in range(offset, min(offset + limit, len(records))):
        row = records[i]
        
        a_id = str(row['id']).zfill(3)
        name_slug = slugify(row['iast'])
        filename = f"{a_id}_master_{name_slug}.png"
        
        prompt = f"""
        A compact architectural yoga sigil restricted to the BOTTOM THIRD of a plain light cream canvas.
        Design: {row['symbol_prompt']}. Essence: {row['oracle_lore']}.
        SPATIAL RULES: Top 65% must be EMPTY. Charcoal ink. No humans.
        """
        neg_prompt = "tall, stretching, full-page, text, labels, numbers, hex, borders, humans"

        try:
            images = model.generate_images(prompt=prompt, negative_prompt=neg_prompt, number_of_images=1, aspect_ratio="3:4")
            temp = f"temp_{filename}"
            images[0].save(location=temp)

            img = Image.open(temp)
            draw = ImageDraw.Draw(img)
            draw_asana_text(draw, row['devanagari'], row['iast'], img.width, img.height)

            img.save(os.path.join(ASSET_DIR, filename))
            os.remove(temp)
            
            with open(PROGRESS_FILE_ASANAS, "w") as f: json.dump({"last_offset": i + 1}, f)
            print(f"✅ {filename}")
            time.sleep(12)

        except Exception as e:
            print(f"❌ Error at ID {row['id']}: {e}"); break

if __name__ == "__main__":
    # Start with 5 to verify the 'Trianga' wrapping looks good
    run_asana_production(limit=300)