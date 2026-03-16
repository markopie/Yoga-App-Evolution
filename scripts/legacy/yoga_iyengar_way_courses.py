from workbench import supabase
import pandas as pd
import re

# 1. Fetch the data from Supabase
# We join asanas and stages to get a flat map of possibilities
query = """
SELECT 
    a.id as asana_id, 
    a.name as asana_name, 
    a.yoga_the_iyengar_way_id,
    s.id as stage_id,
    s.stage_name
FROM asanas a
LEFT JOIN stages s ON a.id = s.asana_id
"""
# Assuming 'supabase' client is already authenticated in your workbench
response = supabase.table("asanas").select("id, name, yoga_the_iyengar_way_id, stages(id, stage_name)").execute()

# Flatten the nested response for easier processing
flattened_data = []
for record in response.data:
    stages = record.get('stages', [])
    if not stages:
        flattened_data.append({
            "asana_id": record['id'],
            "asana_name": record['name'],
            "page": str(record['yoga_the_iyengar_way_id']),
            "stage_id": None,
            "stage_name": None
        })
    else:
        for stage in stages:
            flattened_data.append({
                "asana_id": record['id'],
                "asana_name": record['name'],
                "page": str(record['yoga_the_iyengar_way_id']),
                "stage_id": stage['id'],
                "stage_name": stage['stage_name']
            })

df = pd.DataFrame(flattened_data)

# 2. Parse and Map the Sequence
raw_sequence = "53,51,18,19,21,22,24,28,40II,44,53,108,110,85,150"
parsed_course = []

steps = raw_sequence.split(',')
for idx, s in enumerate(steps):
    match = re.match(r"(\d+)([IVX]*)", s)
    if match:
        page_num = match.group(1)
        var_name = match.group(2) if match.group(2) else None
        
        # Filter logic
        # We look for the page. If var_name exists, we match it. 
        # If not, we look for stage_name is None or 'I'.
        mask = (df['page'].str.contains(page_num, na=False))
        if var_name:
            mask &= (df['stage_name'] == var_name)
        else:
            mask &= (df['stage_name'].isna() | (df['stage_name'] == 'I'))
            
        matches = df[mask]
        
        if not matches.empty:
            # We take the first match to avoid duplicates if page spans multiple asanas
            res = matches.iloc[0]
            parsed_course.append({
                "sequence_order": idx + 1,
                "asana_id": res['asana_id'],
                "stage_id": res['stage_id'],
                "display_name": f"{res['asana_name']} ({res['stage_name']})" if res['stage_name'] else res['asana_name']
            })
        else:
            print(f"⚠️ Warning: No match found for {s}")

# View the mapped sequence
mapped_df = pd.DataFrame(parsed_course)
print(mapped_df)