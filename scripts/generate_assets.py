import pandas as pd
import json, os, time, re, textwrap
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

# 1. ABSOLUTE PATH SETUP
PROGRESS_FILE = r"C:\Projects\Yoga-App-Evolution\data\production_progress.json"
CSV_PATH = r"C:\Projects\Yoga-App-Evolution\data\Master_Oracle_Deck.csv"
ASSET_DIR = r"C:\Projects\Yoga-App-Evolution\assets\yoga_cards"
FONT_DIR = r"C:\Projects\Yoga-App-Evolution\fonts"

FONT_DEVANAGARI = os.path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf")
FONT_IAST = os.path.join(FONT_DIR, "NotoSerif-Regular.ttf")

load_dotenv()
PROJECT_ID = "gen-lang-client-0495696648" 
LOCATION = "us-central1"
vertexai.init(project=PROJECT_ID, location=LOCATION)
model = ImageGenerationModel.from_pretrained("imagen-4.0-generate-001")

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            try: return json.load(f).get("last_offset", 0)
            except: return 0
    return 0

def save_progress(offset):
    with open(PROGRESS_FILE, "w") as f:
        json.dump({"last_offset": offset}, f)

def clean_and_split(text, is_devanagari=False):
    if is_devanagari:
        text = re.sub(r'परिवर्तित\s+[IVX\d]+|परिवर्तित', '', text).strip()
    else:
        text = re.sub(r'Modified\s+[IVX\d]+|Modified', '', text).strip()
    parts = re.split(r'(\(.*\))', text)
    base = parts[0].strip()
    variation = parts[1].strip() if len(parts) > 1 else ""
    return base, variation

def draw_balanced_text(draw, base, variation, font_path, start_size, y_pos, img_w):
    margin = img_w * 0.12
    max_w = img_w - (margin * 2)
    size = start_size
    if len(base) > 28: size -= 10 # Scale down for long Sanskrit
    
    font = ImageFont.truetype(font_path, size)
    avg_char_w = font.getlength('x') if base else 10
    max_chars = max(1, int(max_w / avg_char_w))
    lines = textwrap.wrap(base, width=max_chars)
    
    current_y = y_pos
    for line in lines:
        w = draw.textbbox((0, 0), line, font=font)[2]
        draw.text(((img_w - w) / 2, current_y), line, font=font, fill="#333333")
        current_y += (size * 1.1)

    if variation:
        v_font = ImageFont.truetype(font_path, int(size * 0.75))
        w = draw.textbbox((0, 0), variation, font=v_font)[2]
        draw.text(((img_w - w) / 2, current_y + 8), variation, font=v_font, fill="#333333")
        current_y += (size * 0.8)
    return current_y

def run_production_factory(limit=5):
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')
    offset = load_progress()
    end_point = min(offset + limit, len(df))
    
    print(f"🏭 Factory Resuming at: {offset}")

    for i in range(offset, end_point):
        row = df.iloc[i]
        temp_path = f"temp_{row['filename']}"
        final_path = os.path.join(ASSET_DIR, row['filename'])

        # THE "NO-NUMBERS" DESCRIPTIVE PROMPT
        prompt = f"""
        A very small, compact architectural yoga sigil. 
        Positioned at the very bottom edge of a plain light cream canvas.
        The entire upper area of the canvas is completely blank and untouched.
        Design: {row['symbol_prompt']}. 
        Essence: {row['lore']}.
        
        RULES: Solid dark charcoal ink. No humans.
        """
        
        # AGGRESSIVE NEGATIVE PROMPT (Banning all numbers and text concepts)
        neg_prompt = "text, labels, numbers, digits, percentages, %, 65, #F9F9F7, hex code, letters, tall, vertical stretching, full-page, borders, boxes"

        try:
            response = model.generate_images(
                prompt=prompt, 
                negative_prompt=neg_prompt,
                number_of_images=1, 
                aspect_ratio="3:4"
            )
            response[0].save(location=temp_path)

            img = Image.open(temp_path)
            draw = ImageDraw.Draw(img)
            
            b_dev, v_dev = clean_and_split(row['devanagari'], True)
            b_iast, v_iast = clean_and_split(row['iast_full'])

            # Render Typography 
            next_y = draw_balanced_text(draw, b_dev, v_dev, FONT_DEVANAGARI, 82, img.height * 0.14, img.width)
            draw_balanced_text(draw, b_iast, v_iast, FONT_IAST, 48, next_y + 25, img.width)

            img.save(final_path)
            os.remove(temp_path)
            save_progress(i + 1)
            print(f"✅ Card {i+1} Corrected: {row['filename']}")
            time.sleep(12)

        except Exception as e:
            print(f"❌ Error at index {i}: {e}")
            break

if __name__ == "__main__":
    run_production_factory(limit=5)