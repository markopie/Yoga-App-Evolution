import os
import json
from pyairtable import Api

# Fetch secrets from GitHub
api_key = os.environ['AIRTABLE_PAT']
base_id = os.environ['AIRTABLE_BASE_ID']

api = Api(api_key)

def get_table_data(table_id_or_name):
    table = api.table(base_id, table_id_or_name)
    # Returns fields + the unique Airtable record ID
    return [{"id": r["id"], **r["fields"]} for r in table.all()]

try:
    # Use the Table ID from your URL for 'Asanas' to avoid 404s
    asanas = get_table_data('tblTR2xvN5jDifCSz') 
    stages = get_table_data('Stages')
    courses = get_table_data('Courses')

    # Structure 1: asana_library.json (Combined Asanas and Stages)
    asana_library = {
        "Asanas": asanas,
        "Stages": stages
    }

    # Structure 2: courses.json
    courses_data = courses

    # Ensure directory exists
    os.makedirs('data', exist_ok=True)

    # Save files
    with open('data/asana_library.json', 'w', encoding='utf-8') as f:
        json.dump(asana_library, f, indent=4, ensure_ascii=False)

    with open('data/courses.json', 'w', encoding='utf-8') as f:
        json.dump(courses_data, f, indent=4, ensure_ascii=False)

    print("✅ Files generated: asana_library.json and courses.json")

except Exception as e:
    print(f"❌ Sync failed: {e}")
    exit(1) # Forces GitHub Action to show a failure if Airtable fails
