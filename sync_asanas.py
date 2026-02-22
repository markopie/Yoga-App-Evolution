import os
import json
from pyairtable import Api

# Fetch secrets
api_key = os.environ['AIRTABLE_PAT']
base_id = os.environ['AIRTABLE_BASE_ID']

api = Api(api_key)

def get_table_data(table_name):
    table = api.table(base_id, table_name)
    # This gets all records and strips them down to just the fields + Airtable ID
    return [{"id": r["id"], **r["fields"]} for r in table.all()]

# Fetching all three tables
asanas = get_table_data('Asanas')
stages = get_table_data('Stages')
courses = get_table_data('Courses')

# 1. Create asana_library.json
# We keep them separate but in one file so your JS can cross-reference the IDs
asana_library = {
    "Asanas": asanas,
    "Stages": stages
}

# 2. Create courses.json
courses_data = courses

# Save logic
os.makedirs('data', exist_ok=True)

with open('data/asana_library.json', 'w', encoding='utf-8') as f:
    json.dump(asana_library, f, indent=4, ensure_ascii=False)

with open('data/courses.json', 'w', encoding='utf-8') as f:
    json.dump(courses_data, f, indent=4, ensure_ascii=False)

print("✅ Success: asana_library.json and courses.json updated.")
