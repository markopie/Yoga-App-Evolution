import re
import json
import argparse
import sys
import os

# Ensure we can find workbench.py regardless of where the script is run
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from workbench import supabase

# Matches Roman numerals in brackets, same logic as your JS parsing
ROMAN_REGEX = re.compile(r'\[.*?\b(I{1,3}|IV|V|VI{0,3}|IX|X{1,2}|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX)([a-z]?)\b.*?\]', re.IGNORECASE)

def normalize_id(id_str):
    """Ensure IDs are 3-digit strings for matching."""
    return id_str.strip().zfill(3)

def get_stage_mapping():
    """Builds a map of (asana_id, stage_name) -> stage_id_bigint."""
    print("Building Stage ID Mapping...")
    stages = supabase.table("stages").select("id, asana_id, stage_name").execute().data
    
    mapping = {}
    for s in stages:
        # Key is (asana_id, stage_name), Value is the bigint stage ID
        key = (normalize_id(s['asana_id']), s['stage_name'].strip())
        mapping[key] = str(s['id'])
    
    print(f"Mapped {len(mapping)} stages.")
    return mapping

def process_course(sequence_text, mapping):
    if not sequence_text:
        return None, False

    lines = sequence_text.split('\n')
    new_lines = []
    has_changes = False

    for line in lines:
        if not line.strip() or '|' not in line:
            new_lines.append(line)
            continue

        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 3:
            new_lines.append(line)
            continue

        current_id = normalize_id(parts[0])
        duration = parts[1]
        note_area = " ".join(parts[2:]).strip()

        # Try to find a Roman numeral variation in the brackets
        match = ROMAN_REGEX.search(note_area)
        if match:
            # Reconstruct the variation name (e.g., "VIIa")
            roman = match.group(1).upper()
            suffix = match.group(2).lower() if match.group(2) else ""
            variation_key = roman + suffix
            
            # Lookup the matching Stage ID
            lookup_key = (current_id, variation_key)
            stage_id = mapping.get(lookup_key)

            if stage_id:
                # SUCCESS: Replace the Asana ID with the Stage ID
                new_line = f"{stage_id} | {duration} | {note_area}"
                new_lines.append(new_line)
                has_changes = True
                continue
        
        new_lines.append(line)

    return "\n".join(new_lines), has_changes

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Apply changes to Supabase")
    args = parser.parse_args()

    mapping = get_stage_mapping()
    print("Fetching courses...")
    courses = supabase.table("courses").select("id, title, sequence_text").execute().data

    updates = []
    report = []

    for course in courses:
        new_text, changed = process_course(course['sequence_text'], mapping)
        if changed:
            updates.append({"id": course["id"], "sequence_text": new_text})
            
            # Create a summary of changes
            diffs = [{"old": o, "new": n} for o, n in zip(course['sequence_text'].split('\n'), new_text.split('\n')) if o.strip() != n.strip()]
            report.append({
                "course_id": course["id"],
                "course_title": course["title"],
                "changes": diffs
            })

    # Save local record
    with open("stage_linkage_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"Analysis complete. Found {len(updates)} courses with linkable stages.")

    if args.commit:
        for u in updates:
            supabase.table("courses").update({"sequence_text": u["sequence_text"]}).eq("id", u["id"]).execute()
            print(f"Linked stages in course {u['id']}")
    else:
        print("Review 'stage_linkage_report.json' and run with --commit to apply.")

if __name__ == "__main__":
    main()