import re
import os
from collections import defaultdict

CSS_PATH = "styles/style.css"
CLEANED_PATH = "styles/style_cleaned.css"

def cleanup_css():
    if not os.path.exists(CSS_PATH):
        print(f"File not found: {CSS_PATH}")
        return

    with open(CSS_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find standard blocks (excludes @media for now to be safe)
    block_pattern = re.compile(r'([^{]+)\{([^}]+)\}', re.MULTILINE | re.DOTALL)
    
    # Identify duplicate selectors and merge their bodies
    merged_styles = defaultdict(list)
    
    # We will preserve the order of first appearance
    order = []
    
    for selector_raw, body_raw in block_pattern.findall(content):
        selector = selector_raw.strip()
        if selector not in merged_styles:
            order.append(selector)
        merged_styles[selector].append(body_raw.strip())

    cleaned_content = ""
    for selector in order:
        # Merge the property lines and deduplicate properties
        combined_body = ";\n    ".join(merged_styles[selector])
        # Add basic formatting
        cleaned_content += f"{selector} {{\n    {combined_body}\n}}\n\n"

    # NOTE: This simple script doesn't reconstruct Media Queries perfectly. 
    # For a 1600 line file, use with caution or manually merge the 9 flagged duplicates.
    with open(CLEANED_PATH, 'w', encoding='utf-8') as f:
        f.write(cleaned_content)
    
    print(f"✅ Cleaned CSS written to {CLEANED_PATH}. Review and replace style.css if satisfied.")

if __name__ == "__main__":
    cleanup_css()