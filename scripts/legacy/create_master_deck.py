import pandas as pd
from workbench import supabase
import json

def generate_master_csv():
    print("📡 Fetching data from Supabase...")
    
    # 1. Pull Asanas (The Base)
    asanas_res = supabase.table("asanas").select("id, name, iast, devanagari, symbol_prompt, oracle_lore").execute()
    asanas_df = pd.DataFrame(asanas_res.data)

    # 2. Pull Stages (The Variations)
    stages_res = supabase.table("stages").select("id, asana_id, title, symbol_prompt, oracle_lore, devanagari").execute()
    stages_df = pd.DataFrame(stages_res.data)

    master_list = []

    for _, asana in asanas_df.iterrows():
        # Check if this is a Pranayama
        is_pranayama = "Prāṇāyāma" in (asana['iast'] or "")
        
        # Get stages for this asana
        related_stages = stages_df[stages_df['asana_id'] == asana['id']]
        
        if is_pranayama:
            # PRANAYAMA LOGIC: Just take the first stage or the base asana
            source = related_stages.iloc[0] if not related_stages.empty else asana
            master_list.append(build_row(asana, source, is_variant=False))
        
        elif not related_stages.empty:
            # ASANA VARIATIONS: Add each unique modification
            for _, stage in related_stages.iterrows():
                master_list.append(build_row(asana, stage, is_variant=True))
        
        else:
            # BASE ASANA: No stages exist
            master_list.append(build_row(asana, asana, is_variant=False))

    # Save to CSV with UTF-8-SIG (the secret to keeping diacritics in Excel)
    final_df = pd.DataFrame(master_list)
    final_df.to_csv("Master_Oracle_Deck.csv", index=False, encoding="utf-8-sig")
    print(f"✅ Created Master_Oracle_Deck.csv with {len(final_df)} cards.")

def build_row(asana, source, is_variant):
    # Logic to merge symbol and lore from stage vs asana
    return {
        "asana_id": asana['id'],
        "stage_id": source.get('id', 'BASE'),
        "devanagari": source.get('devanagari') or asana['devanagari'],
        "iast_full": f"{asana['iast']} {source.get('title', '')}".strip(),
        "symbol_prompt": source.get('symbol_prompt') or asana['symbol_prompt'],
        "lore": source.get('oracle_lore') or asana['oracle_lore'],
        "filename": f"{asana['name'].replace(' ', '_')}_{source.get('id', 'BASE')}.png"
    }

if __name__ == "__main__":
    generate_master_csv()