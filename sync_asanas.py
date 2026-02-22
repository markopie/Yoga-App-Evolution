import os
import json
from pyairtable import Api

# Access secrets from GitHub Environment
api_key = os.environ['AIRTABLE_PAT']
base_id = os.environ['AIRTABLE_BASE_ID']

api = Api(api_key)

# 1. Fetch data from all three tables
asana_records = api.table(base_id, 'Asanas').all()
stage_records = api.table(base_id, 'Stages').all()
course_records = api.table(base_id, 'Courses').all()

# 2. Format for asana_library.json (Combined Asanas and Stages)
asana_library = {
    "Asanas": [r['fields'] for r in asana_records],
    "Stages": [r['fields'] for r in stage_records]
}

# 3. Format for courses.json (List of courses)
courses_data = [r['fields'] for r in course_records]

# Ensure the data folder exists (or wherever your JSONs are housed)
os.makedirs('data', exist_ok=True)

# 4. Save files
with open('data/asana_library.json', 'w', encoding='utf-8') as f:
    json.dump(asana_library, f, indent=4, ensure_ascii=False)

with open('data/courses.json', 'w', encoding='utf-8') as f:
    json.dump(courses_data, f, indent=4, ensure_ascii=False)

print("Sync Complete: generated asana_library.json and courses.json")
