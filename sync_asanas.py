import os
import json
from pyairtable import Api

# Fetch secrets from GitHub
api_key = os.environ['AIRTABLE_PAT']
base_id = os.environ['AIRTABLE_BASE_ID']
api = Api(api_key)

print("Fetching data from Airtable...")

# 1. Fetch all records
# Use Table IDs to prevent 404 errors if names change slightly
asanas_raw = api.table(base_id, 'tblTR2xvN5jDifCSz').all() # Asanas
stages_raw = api.table(base_id, 'Stages').all()
courses_raw = api.table(base_id, 'Courses').all()

# Helper function to turn "Final: 1, 2" or "Intermediate: 3" into an array ["1", "2"]
def parse_plates(plate_str, prefix):
    if not plate_str:
        return []
    # e.g., "Final: 1, 2" -> "1, 2"
    clean_str = str(plate_str).replace(prefix, '').replace(':', '').strip()
    if not clean_str:
        return []
    # Split by comma or space
    import re
    tokens = re.split(r'[,\s]+', clean_str)
    return [t.strip() for t in tokens if t.strip()]

legacy_asana_library = {}
airtable_id_to_custom_id = {}

# ---------------------------------------------------------
# STEP 1: Process Base Asanas
# ---------------------------------------------------------
for record in asanas_raw:
    fields = record['fields']
    
    # Use your 'ID' column (e.g., '001')
    asana_id = str(fields.get('ID', '')).strip()
    if not asana_id:
        continue # Skip if no ID
        
    # Store the mapping so we can link Stages later
    airtable_id_to_custom_id[record['id']] = asana_id
    
    plate_raw = str(fields.get('Plate_Numbers', ''))
    
    # Map to Legacy JS fields
    legacy_asana_library[asana_id] = {
        "name": fields.get('Name', ''),
        "iast": fields.get('IAST', ''),
        "page2001": str(fields.get('Page_2001', '')),
        "page2015": str(fields.get('Page_2015', '')),
        "intensity": str(fields.get('Intensity', '')),
        "note": fields.get('Note', ''),
        "category": fields.get('Category', ''),
        "description": fields.get('Description', ''), # Fallback if Description field is used
        "technique": fields.get('Technique', ''),
        "requiresSides": fields.get('Requires_Sides', False), # Adjust if your checkbox is named differently
        "plates": {
            "intermediate": parse_plates(plate_raw, 'Intermediate'), # Simplistic parse, adjust if you separate these in Airtable
            "final": parse_plates(plate_raw, 'Final')
        },
        "variations": {},
        "id": asana_id
    }

# ---------------------------------------------------------
# STEP 2: Process Stages (Variations) and inject them
# ---------------------------------------------------------
for record in stages_raw:
    fields = record['fields']
    
    # Link back to Asanas table
    parent_links = fields.get('Parent_ID') 
    if not parent_links:
        continue
        
    parent_airtable_id = parent_links[0]
    parent_custom_id = airtable_id_to_custom_id.get(parent_airtable_id)
    
    # If the parent asana exists, inject this stage into its variations object
    if parent_custom_id and parent_custom_id in legacy_asana_library:
        var_key = str(fields.get('Stage_Name', '')).strip()
        
        if var_key:
            legacy_asana_library[parent_custom_id]["variations"][var_key] = {
                "title": fields.get('Title', f"Stage {var_key}"),
                "technique": fields.get('Full_Technique', ''),
                "shorthand": fields.get('Shorthand', '')
            }

# ---------------------------------------------------------
# STEP 3: Process Courses
# ---------------------------------------------------------
legacy_courses = []
for record in courses_raw:
    fields = record['fields']
    legacy_courses.append({
        "Course_ID": fields.get('Course_ID', ''),
        "Course_Title": fields.get('Course_Title', ''),
        "Category": fields.get('Category', ''),
        "Sequence_Text": fields.get('Sequence_Text', '')
    })

# ---------------------------------------------------------
# STEP 4: Save Files
# ---------------------------------------------------------
os.makedirs('data', exist_ok=True)

with open('data/asana_library.json', 'w', encoding='utf-8') as f:
    json.dump(legacy_asana_library, f, indent=2, ensure_ascii=False)
    
with open('data/courses.json', 'w', encoding='utf-8') as f:
    json.dump(legacy_courses, f, indent=2, ensure_ascii=False)

print(f"✅ Smart Sync Complete. Processed {len(legacy_asana_library)} Asanas and {len(legacy_courses)} Courses.")
