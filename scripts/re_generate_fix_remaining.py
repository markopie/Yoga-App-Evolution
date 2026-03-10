import os, shutil, json, time, re, textwrap, unicodedata
from PIL import Image, ImageDraw, ImageFont
from workbench import supabase
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel

# --- CONFIG ---
ASSET_DIR = r"C:\Projects\Yoga-App-Evolution\assets\yoga_cards"
BACKUP_DIR = os.path.join(ASSET_DIR, "not_used_overlapped")
FONT_DEV = r"C:\Projects\Yoga-App-Evolution\fonts\NotoSansDevanagari-Regular.ttf"
FONT_IAST = r"C:\Projects\Yoga-App-Evolution\fonts\NotoSerif-Regular.ttf"

os.makedirs(BACKUP_DIR, exist_ok=True)

vertexai.init(project="gen-lang-client-0495696648", location="us-central1")
model = ImageGenerationModel.from_pretrained("imagen-4.0-generate-001")

def draw_safe_text(draw, dev, iast, img_w, img_h):
    """Refined typography placement with a 10% start."""
    curr_y = img_h * 0.10 
    
    f_dev = ImageFont.truetype(FONT_DEV, 78)
    for line in textwrap.wrap(dev, width=18):
        w = draw.textbbox((0, 0), line, font=f_dev)[2]
        draw.text(((img_w - w) / 2, curr_y), line, font=f_dev, fill="#333333")
        curr_y += 88

    curr_y += 15
    f_iast = ImageFont.truetype(FONT_IAST, 42) # Restored closer to original size
    for line in textwrap.wrap(iast, width=24):
        w = draw.textbbox((0, 0), line, font=f_iast)[2]
        draw.text(((img_w - w) / 2, curr_y), line, font=f_iast, fill="#333333")
        curr_y += 50

def run_targeted_recovery():
    targets = [
        {"id": "012", "iast": "Pārśvōttānāsana", "dev": "पार्श्वोत्तानासन", "filename": "012_master_parsvottanasana.png", "prompt": "A concentric arc extends downward from a vertical hairline, mirrors it from below on the left. Right side vertical hairline only."},
        {"id": "026", "iast": "Makarāsana", "dev": "मकरासनो़", "filename": "026_master_makarasana.png", "prompt": "Equilateral triangle pointing downwards, grounding and stability."},
        {"id": "058", "iast": "Mahā Mudrā", "dev": "महामुद्रा", "filename": "058_master_maha_mudra.png", "prompt": "Two parallel lines. Concentric arcs emerging between them symbolizing contained energy."},
        {"id": "060", "iast": "Parivṛtta Jānu Śīṛsāsana", "dev": "परिवृत्तजानुशीर्षासन", "filename": "060_master_parivrtta_janu_sirsasana.png", "prompt": "Diagonal slash descending right to left. Hexagonal vertex at the base."},
        {"id": "080", "iast": "Pārśva Śīṛsāsana", "dev": "पार्श्व शीर्षासन", "filename": "080_master_parsva_sirsasana.png", "prompt": "Vertical hairline spine. Intersecting concentric arc offset from center. Bindu to the side."},
        {"id": "086", "iast": "Piṇdāsana in Śīṛsāsana", "dev": "शीर्षासने पिण्डासनम्", "filename": "086_master_pindasana_in_sirsasana.png", "prompt": "Vertical line spine. Angled lines converging from bottom. Concentric arcs illustrating containment."},
        {"id": "107", "iast": "Chakrāsana", "dev": "चक्रासन", "filename": "107_master_chakrasana.png", "prompt": "Diagonal slash bisecting an open circle centered above."},
        {"id": "113", "iast": "Bharadvājāsana II", "dev": "भरद्वाजासन", "filename": "113_master_bharadvajasana_ii.png", "prompt": "Equilateral triangle apex down. Bisected vertically and horizontally forming an X intersection."},
        {"id": "165", "iast": "Mūlabhandāsana", "dev": "मूलबन्धासन", "filename": "165_master_mulabhandasana.png", "prompt": "Single hairline within a square frame. Minimalist root engagement."},
        {"id": "166", "iast": "Vāmadevāsana I", "dev": "वामदेवासन", "filename": "166_master_vamadevasana_i.png", "prompt": "Hexagon housing three intersecting lines. Vertical bisect and acute angle pointing down."},
        {"id": "177", "iast": "Dwi Pāda Viparīta Dạṇdāsana", "dev": "द्वि पाद विपरीत दण्डासन", "filename": "177_master_dwi_pada_viparita_dandasana.png", "prompt": "Vertical axis. Two opposing semi-circles open toward each other. Bindu at center."},
        {"id": "184", "iast": "Eka Pāda Rājakapotāsana I", "dev": "एक पाद राजकपोतासन", "filename": "184_master_eka_pada_rajakapotasana_i.png", "prompt": "Offset vertical axis. Open circle sits along the line signifying abdominal twist."},
        {"id": "220", "iast": "Mūla Bandha", "dev": "मूलबन्धश्सन", "filename": "220_master_mula_bandha.png", "prompt": "Two parallel vertical lines. Three concentric semi-circular arcs facing upwards."},
        {"id": "016", "iast": "Marīchyāsana I", "dev": "मरीच्यासन", "filename": "064_016_marichyasana_i_standing.png", "prompt": "Square frame. Equilateral triangle on base. Vertical hairline from apex bending at right angle."}
    ]

    for item in targets:
        # Archive current file
        full_path = os.path.join(ASSET_DIR, item['filename'])
        if os.path.exists(full_path):
            shutil.move(full_path, os.path.join(BACKUP_DIR, item['filename']))

        # BALANCED PROMPT: 
        # Using "Small centered footer sigil" to keep it from filling the frame.
        prompt = f"""
        A minimalist yoga sigil. {item['prompt']}. 
        Composition: A small, centered sigil anchored in the bottom third of the image.
        The top half of the canvas is completely empty cream space.
        Charcoal ink on light cream background.
        """
        # AGGRESSIVE NEGATIVE PROMPT:
        # We explicitly ban 'top-heavy' and 'centered vertically'
        neg_prompt = "large, vertical stretching, centered vertically, top-heavy, full-canvas, text, numbers, borders, humans"

        try:
            res = model.generate_images(prompt=prompt, negative_prompt=neg_prompt, number_of_images=1, aspect_ratio="3:4")
            temp_file = f"temp_fix_{item['id']}.png"
            res[0].save(location=temp_file)

            img = Image.open(temp_file)
            draw = ImageDraw.Draw(img)
            draw_safe_text(draw, item['dev'], item['iast'], img.width, img.height)

            img.save(os.path.join(ASSET_DIR, item['filename']))
            os.remove(temp_file)
            print(f"✅ Regenerated: {item['filename']}")
            time.sleep(12)
        except Exception as e:
            print(f"❌ Failed ID {item['id']}: {e}")

if __name__ == "__main__":
    run_targeted_recovery()