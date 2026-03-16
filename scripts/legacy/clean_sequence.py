import re
import json
import argparse
from workbench import supabase

# 1. DEFENSIVE ROMAN NUMERAL REGEX
# Matches standalone Roman numerals (I-XX) with optional lowercase suffix (a-z).
# Uses word boundaries \b to prevent matching letters inside words like "Viloma".
ROMAN_REGEX = re.compile(r'\b(I{1,3}|IV|V|VI{0,3}|IX|X{1,2}|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX)([a-z]?)\b', re.IGNORECASE)

# 2. THE BLACKLIST
# Words that the regex might catch but are definitely NOT variations.
BLACKLIST = ["in", "a", "i", "to"] 

def clean_note_text(text):
    """Scrub punctuation, legacy brackets, and excess whitespace."""
    text = re.sub(r'[:\(\)\-\[\]]', '', text)
    return re.sub(r'\s+', ' ', text).strip()

# 1. Add an explicit Blacklist for common false matches
BLACKLIST = ["in", "a", "to", "at", "on"] 

def process_sequence_text(raw_text, library):
    if not raw_text: return raw_text, False
    lines = raw_text.split('\n')
    new_lines = []
    has_changes = False

    for line in lines:
        line = line.strip()
        if not line or '|' not in line:
            new_lines.append(line)
            continue

        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 2:
            new_lines.append(line)
            continue

        # 🛑 GUARD: Skip structural markers
        if any(marker in parts[0] for marker in ["LOOP", "MACRO"]):
            new_lines.append(line)
            continue

        pose_id = parts[0].zfill(3)
        duration = parts[1]
        note_area = " ".join(parts[2:]).strip()

        # STEP A: SHIELD THE TIER
        tier_match = re.search(r'\btier:[SL]\b', note_area, re.I)
        tier_str = tier_match.group(0) if tier_match else ""
        working_note = re.sub(r'\btier:[SL]\b', '', note_area, flags=re.I).strip()

        # STEP B: STRIP ASANA NAMES
        asana = library.get(pose_id, {})
        names_to_strip = filter(None, [asana.get('english_name'), asana.get('name'), asana.get('iast')])
        for name in names_to_strip:
            working_note = re.sub(rf'\b{re.escape(name)}\b', '', working_note, flags=re.I).strip()

        # STEP C: EXTRACT VARIATION
        roman_match = ROMAN_REGEX.search(working_note)
        new_variation = ""
        if roman_match:
            raw_match = roman_match.group(0).lower()
            if raw_match not in BLACKLIST:
                # 🛑 FIX: Preserve Case for standard RNs, lower for suffixes
                roman_part = roman_match.group(1).upper()
                # Only lowercase if it's a known single-letter suffix (a, b, c)
                suffix_part = roman_match.group(2).lower() if roman_match.group(2) else ""
                new_variation = f"{roman_part}{suffix_part}"
                
                # Remove ONLY the matched numeral from the note
                working_note = re.sub(rf'\b{re.escape(roman_match.group(0))}\b', '', working_note, count=1, flags=re.I)

        # STEP D: FINAL SCRUB
        final_desc = clean_note_text(working_note)
        
        # STEP E: RECONSTRUCT
        # Format: ID | DUR | [VAR] NOTE TIER
        var_brackets = f"[{new_variation}]"
        # Ensure description and tier are separated by a single space if they exist
        combined_note = " ".join(filter(None, [var_brackets, final_desc, tier_str])).strip()
        
        new_line = f"{pose_id} | {duration} | {combined_note}"
        
        if new_line != line:
            has_changes = True
            new_lines.append(new_line)
        else:
            new_lines.append(line)

    return "\n".join(new_lines), has_changes
    if not raw_text: return raw_text, False
    lines = raw_text.split('\n')
    new_lines = []
    has_changes = False

    for line in lines:
        if not line.strip() or '|' not in line:
            new_lines.append(line)
            continue

        parts = [p.strip() for p in line.split('|')]
        
        # 🛑 FIX 3: Structural Guard - Skip Loop and Macro markers
        if any(marker in parts[0] for marker in ["LOOP", "MACRO"]):
            new_lines.append(line)
            continue

        pose_id = parts[0].zfill(3)
        duration = parts[1]
        note_area = " ".join(parts[2:]).strip()

        # STEP A: Extract Tier
        tier_match = re.search(r'\btier:[SL]\b', note_area, re.I)
        tier_str = tier_match.group(0) if tier_match else ""
        working_note = re.sub(r'\btier:[SL]\b', '', note_area, flags=re.I).strip()

        # STEP B: Strip Asana Names
        asana = library.get(pose_id, {})
        names_to_strip = filter(None, [asana.get('english_name'), asana.get('name'), asana.get('iast')])
        for name in names_to_strip:
            working_note = re.sub(rf'\b{re.escape(name)}\b', '', working_note, flags=re.I).strip()

        # STEP C: Extract Variation with Blacklist Guard
        roman_match = ROMAN_REGEX.search(working_note)
        new_variation = ""
        if roman_match:
            raw_match = roman_match.group(0).lower()
            # 🛑 FIX 1: Blacklist "In" and other false positives
            if raw_match not in BLACKLIST:
                roman_part = roman_match.group(1).upper()
                suffix_part = roman_match.group(2).lower() if roman_match.group(2) else ""
                new_variation = f"{roman_part}{suffix_part}"
                
                # 🛑 FIX 2: Clean remaining Roman Numerals from the description
                # Aggressively remove all Roman Numerals matching the capture from working_note
                working_note = re.sub(rf'\b{re.escape(roman_match.group(0))}\b', '', working_note, flags=re.I)

        # STEP D: Final Scrub and Reconstruction
        final_desc = clean_note_text(working_note)
        var_brackets = f"[{new_variation}]"
        note_part = f"{var_brackets} {final_desc} {tier_str}".replace("  ", " ").strip()
        
        new_line = f"{pose_id} | {duration} | {note_part}"
        if new_line != line:
            has_changes = True
            new_lines.append(new_line)
        else:
            new_lines.append(line)

    return "\n".join(new_lines), has_changes
    if not raw_text:
        return raw_text, False

    lines = raw_text.split('\n')
    new_lines = []
    has_changes = False

    for line in lines:
        line = line.strip()
        if not line or '|' not in line:
            new_lines.append(line)
            continue

        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 2:
            new_lines.append(line)
            continue

        pose_id_raw = parts[0]
        duration = parts[1]
        
        # Guard structural markers
        if any(x in pose_id_raw for x in ["LOOP", "MACRO"]):
            new_lines.append(line)
            continue

        pose_id = pose_id_raw.zfill(3)
        note_area = " ".join(parts[2:]).strip()

        # STEP A: SHIELD THE TIER
        # We extract tier:S/tier:L first and hide it so the regex can't touch it.
        tier_match = re.search(r'\btier:[SL]\b', note_area, re.I)
        tier_str = tier_match.group(0) if tier_match else ""
        working_note = re.sub(r'\btier:[SL]\b', '', note_area, flags=re.I).strip()

        # STEP B: DESTROY ASANA NAMES (Using Library Metadata)
        asana = library.get(pose_id, {})
        # We strip name, english_name, and iast to ensure the note is name-free.
        names_to_strip = filter(None, [asana.get('english_name'), asana.get('name'), asana.get('iast')])
        for name in names_to_strip:
            working_note = re.sub(rf'\b{re.escape(name)}\b', '', working_note, flags=re.I).strip()

        # STEP C: EXTRACT TRUE VARIATION
        roman_match = ROMAN_REGEX.search(working_note)
        new_variation = ""
        if roman_match:
            raw_match = roman_match.group(0).lower()
            if raw_match not in BLACKLIST:
                roman_part = roman_match.group(1).upper()
                suffix_part = roman_match.group(2).lower() if roman_match.group(2) else ""
                new_variation = f"{roman_part}{suffix_part}"
                # Remove the numeral from the note so it doesn't double-up
                working_note = working_note.replace(roman_match.group(0), "")

        # STEP D: FINAL SCRUB
        final_desc = clean_note_text(working_note)
        
        # STEP E: RECONSTRUCT STRICT 3-COLUMN FORMAT
        # Logic: [Variation] Note tier:X
        var_brackets = f"[{new_variation}]"
        note_part = f"{var_brackets} {final_desc} {tier_str}".replace("  ", " ").strip()
        
        new_line = f"{pose_id} | {duration} | {note_part}"
        
        if new_line != line:
            has_changes = True
            new_lines.append(new_line)
        else:
            new_lines.append(line)

    return "\n".join(new_lines), has_changes

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()

    print("Loading Asana Names from Library...")
    # Fetching only needed columns based on schema
    asanas = supabase.table("asanas").select("id, name, english_name, iast").execute().data
    library = {a['id'].zfill(3): a for a in asanas}

    print("Fetching Courses...")
    courses = supabase.table("courses").select("id, title, sequence_text").execute().data

    report = []
    updates = []

    for course in courses:
        old_text = course.get("sequence_text", "")
        new_text, changed = process_sequence_text(old_text, library)
        if changed:
            updates.append({"id": course["id"], "sequence_text": new_text})
            diffs = [{"old": o, "new": n} for o, n in zip(old_text.split('\n'), new_text.split('\n')) if o.strip() != n.strip()]
            report.append({"title": course["title"], "changes": diffs})

    with open("dry_run_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"Analysis complete. {len(updates)} courses requiring updates.")
    if args.commit:
        for u in updates:
            supabase.table("courses").update({"sequence_text": u["sequence_text"]}).eq("id", u["id"]).execute()
            print(f"Updated course {u['id']}")
    else:
        print("Review 'dry_run_report.json' then run with --commit.")

if __name__ == "__main__":
    main()