import re
import json
import sys
import os

# Add parent directory to path so workbench imports correctly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from workbench import supabase

# Regex matches Roman numerals in brackets, e.g., [I], [VIIa], [Stage IV]
ROMAN_REGEX = re.compile(r'\[.*?\b([IVX]+)([a-z]?)\b.*?\]', re.IGNORECASE)

def clean_sequence_text(sequence_text):
    if not sequence_text:
        return sequence_text, False

    lines = sequence_text.split('\n')
    new_lines = []
    changed = False

    for line in lines:
        parts = [p.strip() for p in line.split('|')]
        
        # Only process standard pose lines (skip MACRO, LOOP, etc.)
        if len(parts) >= 3 and not parts[0].startswith("MACRO") and not parts[0].startswith("LOOP"):
            id_part = parts[0]
            dur_part = parts[1]
            note_part = " | ".join(parts[2:])

            # 1. Find the FIRST valid Roman numeral bracket (this is the one the app uses)
            match = ROMAN_REGEX.search(note_part)
            
            if match:
                # Reconstruct the clean variation bracket (e.g., "VIIa")
                roman = match.group(1).upper()
                suffix = match.group(2).lower() if match.group(2) else ""
                clean_bracket = f"[{roman}{suffix}]"

                # 2. Strip ALL Roman numeral brackets out of the note
                stripped_note = ROMAN_REGEX.sub('', note_part)
                
                # Clean up multiple spaces left behind
                stripped_note = re.sub(r'\s+', ' ', stripped_note).strip()

                # 3. Put the clean bracket at the very front
                final_note = f"{clean_bracket} {stripped_note}".strip()
                
                new_line = f"{id_part} | {dur_part} | {final_note}"
                
                if new_line != line:
                    changed = True
                    new_lines.append(new_line)
                    continue

        new_lines.append(line)

    return "\n".join(new_lines), changed

def main():
    print("Fetching courses from Supabase...")
    courses = supabase.table("courses").select("id, title, sequence_text").execute().data

    updates_count = 0

    for course in courses:
        clean_text, was_changed = clean_sequence_text(course['sequence_text'])
        
        if was_changed:
            print(f"Cleaning double-ups in: {course['title']}")
            # Uncomment the next line to actually commit to the database
            supabase.table("courses").update({"sequence_text": clean_text}).eq("id", course["id"]).execute()
            updates_count += 1

    print(f"\nDone. Found and cleaned {updates_count} sequences.")
    print("NOTE: Database update is commented out for safety. Uncomment to apply.")

if __name__ == "__main__":
    main()