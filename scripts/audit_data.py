import json
from workbench import supabase # Borrowing your active link

def audit_sanskrit_alignment(limit=20):
    # This query pulls the devanagari from BOTH the stage and the parent asana
    res = supabase.table("stages").select("""
        id,
        devanagari,
        asanas!inner ( 
            name, 
            iast, 
            devanagari 
        )
    """).limit(limit).execute()

    if not res.data:
        print("❌ No data found in the stages table.")
        return

    print(f"\n{'STAGE ID':<8} | {'PARENT ASANA':<25} | {'STAGE DEVANAGARI':<30} | {'PARENT DEVANAGARI':<30}")
    print("-" * 105)
    
    for row in res.data:
        parent = row.get('asanas', {})
        stage_id = row['id']
        asana_name = parent.get('name', 'Unknown')
        
        # This is where we spot the mismatch
        s_dev = row.get('devanagari') or "EMPTY ❌"
        p_dev = parent.get('devanagari') or "EMPTY ❌"
        
        match_status = "✅" if s_dev == p_dev else "⚠️ MISMATCH"
        
        print(f"{stage_id:<8} | {asana_name:<25} | {s_dev:<30} | {p_dev:<30} {match_status}")

if __name__ == "__main__":
    audit_sanskrit_alignment(limit=30)