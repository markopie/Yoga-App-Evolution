import os
import json
from pyairtable import Api

# Access secrets from GitHub Environment
api_key = os.environ['AIRTABLE_PAT']
base_id = os.environ['AIRTABLE_BASE_ID']

api = Api(api_key)

# List your 3 tables
tables = ['Asanas', 'Durations', 'Categories']
exported_data = {}

for table_name in tables:
    table = api.table(base_id, table_name)
    # Fetch all records
    records = table.all()
    # We only care about the 'fields' part of the record
    exported_data[table_name] = [r['fields'] for r in records]

# Ensure the data folder exists
os.makedirs('data', exist_ok=True)

# Write to JSON
with open('data/asanas.json', 'w', encoding='utf-8') as f:
    json.dump(exported_data, f, indent=4, ensure_ascii=False)

print("Sync Complete!")
