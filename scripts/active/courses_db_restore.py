import json
from workbench import supabase

# Your full backup path
BACKUP_PATH = r"C:\Projects\Yoga-App-Evolution\backups\courses_20260316_113154.json"

def full_restore():
    print(f"--- FULL RESTORE INITIATED ---")
    print(f"Reading from: {BACKUP_PATH}")
    
    try:
        with open(BACKUP_PATH, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
    except Exception as e:
        print(f"Error reading backup file: {e}")
        return

    total_records = len(backup_data)
    print(f"Found {total_records} courses in backup. Beginning upload...")

    # We use upsert to either update existing IDs or insert them if they were missing
    # This ensures your sequence_text returns to the exact previous state
    for i, course in enumerate(backup_data):
        # We ensure we are sending the core schema fields back
        payload = {
            "id": course["id"],
            "title": course["title"],
            "category": course["category"],
            "sequence_text": course["sequence_text"],
            "is_system": course.get("is_system", True)
        }
        
        try:
            supabase.table("courses").upsert(payload).execute()
            if (i + 1) % 10 == 0:
                print(print(f"Progress: {i + 1}/{total_records}..."))
        except Exception as e:
            print(f"Failed to restore course {course['id']}: {e}")

    print(f"\nSUCCESS: Full restoration complete. {total_records} courses reset to backup state.")

if __name__ == "__main__":
    # Safety confirmation
    confirm = input("This will overwrite all current course data with the backup. Proceed? (y/n): ")
    if confirm.lower() == 'y':
        full_restore()
    else:
        print("Restoration cancelled.")