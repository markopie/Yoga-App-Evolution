import os
import re

# 1. Configuration
STYLES_DIR = "styles"
LEGACY_FILE = "style.css"
NEW_FILES = [
    "global-vars.css",
    "base.css",
    "layout.css",
    "components.css",
    "auth.css",
    "editor.css",
    "viewer.css",
    "playback.css",
    "asana-editor.css",
    "print.css"
]

def extract_selectors(filepath):
    """Extracts a normalized set of CSS selectors from a file."""
    if not os.path.exists(filepath):
        print(f"⚠️ Warning: Could not find {filepath}")
        return set()

    with open(filepath, 'r', encoding='utf-8') as f:
        css_text = f.read()

    # Step A: Strip all CSS comments
    css_text = re.sub(r'/\*.*?\*/', '', css_text, flags=re.DOTALL)
    
    selectors = set()
    # Step B: Find everything that comes immediately before an opening curly brace
    # This cleverly extracts selectors even if they are nested inside @media blocks
    matches = re.findall(r'([^}{;]+)\{', css_text)
    
    for match in matches:
        sel = match.strip()
        
        # Step C: Ignore @ rules (@media, @keyframes, @font-face) and animation percentages
        if sel.startswith('@') or sel == '' or re.match(r'^\d+%$', sel) or sel in ['to', 'from']:
            continue
        
        # Step D: Split comma-separated selectors (e.g., "h1, h2" -> ["h1", "h2"])
        for sub_sel in sel.split(','):
            sub_sel = sub_sel.strip()
            # Normalize whitespace (turn double spaces or newlines into a single space)
            sub_sel = re.sub(r'\s+', ' ', sub_sel)
            if sub_sel:
                selectors.add(sub_sel)
                
    return selectors

def run_audit():
    print("🔍 Starting Jobbsian CSS Audit...\n")
    
    legacy_path = os.path.join(STYLES_DIR, LEGACY_FILE)
    legacy_selectors = extract_selectors(legacy_path)
    print(f"Found {len(legacy_selectors)} unique selectors in legacy '{LEGACY_FILE}'")
    
    new_selectors = set()
    for new_file in NEW_FILES:
        filepath = os.path.join(STYLES_DIR, new_file)
        file_selectors = extract_selectors(filepath)
        new_selectors.update(file_selectors)
        
    print(f"Found {len(new_selectors)} unique selectors across {len(NEW_FILES)} new modules.\n")
    
    # Mathematical Difference: What is in Legacy but NOT in New?
    missing_selectors = legacy_selectors - new_selectors
    
    if not missing_selectors:
        print("✅ PERFECT MIGRATION! All legacy selectors are present in the new modules.")
        return

    print(f"⚠️ Found {len(missing_selectors)} selectors in legacy code that were NOT moved to the new modules:\n")
    
    # Sort them alphabetically for easier reading
    sorted_missing = sorted(list(missing_selectors))
    
    for sel in sorted_missing:
        print(f"  - {sel}")
        
    # Write to an output file so you can use it as a checklist
    with open("css_audit_report.txt", "w", encoding='utf-8') as f:
        f.write(f"MISSING SELECTORS CHECKLIST ({len(sorted_missing)} total)\n")
        f.write("="*50 + "\n\n")
        for sel in sorted_missing:
            f.write(f"[ ] {sel}\n")
            
    print("\n📝 A full checklist has been saved to 'css_audit_report.txt'")

if __name__ == "__main__":
    run_audit()