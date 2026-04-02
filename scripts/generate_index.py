import os
import re
import random
import sys
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

try:
    from workbench import supabase
    print("🔎 Step 1: Workbench Client Found.")
except Exception as e:
    print(f"❌ Step 1 Failed: {e}")
    sys.exit(1)

PROJECT_ROOT = "."
SOURCE_DIRECTORY = "./src"
OUTPUT_FILENAME = r"G:\My Drive\Personal\02_Education_Yoga\Yoga_Project_Files\FUNCTION_INDEX.md" 

# Config for the Tree Generator
IGNORE_DIRS = {'.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', 'assets', 'audio', 'images', 'backups', 'legacy', 'data'}
IGNORE_FILES = {'.DS_Store'}

TABLE_QUERIES = {
    'asanas': 'id, name, english_name, iast, variation_code, requires_sides, intensity, category',
    'stages': 'id, asana_id, stage_name, title, shorthand, hold, sort_order',
    'courses': 'id, title, sequence_text, is_system, sub_category_id',
    'course_categories': 'id, name',
    'course_sub_categories': 'id, name, category_id',
    'sequence_completions': 'id, title, status, duration_seconds, rating, category'
}

def generate_repo_tree(startpath):
    print("🌳 Generating Physical Architecture Tree...")
    tree_str = "```text\n"
    for root, dirs, files in os.walk(startpath):
        # Mutate the dirs list in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
        
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * level
        basename = os.path.basename(root)
        
        if basename: # Skip the root '.' display name
            tree_str += f"{indent}📁 {basename}/\n"
            
        subindent = ' ' * 4 * (level + 1) if basename else ""
        for f in sorted(files):
            if f not in IGNORE_FILES and not f.startswith('.'):
                # Optionally, skip media files to save tokens
                if not f.endswith(('.mp3', '.wav', '.png', '.jpg', '.ico')):
                    tree_str += f"{subindent}📄 {f}\n"
    tree_str += "```\n\n"
    return tree_str

def get_random_samples(table_name, select_query):
    print(f"📡 Pulse Check: {table_name}...", end="", flush=True)
    try:
        res = supabase.table(table_name).select(select_query).limit(10).execute()
        if res.data:
            print(" [OK]")
            samples = random.sample(res.data, min(len(res.data), 2))
            for row in samples:
                for k, v in row.items():
                    if isinstance(v, str) and len(v) > 100:
                        row[k] = v[:100] + "... [TRUNCATED]"
            return samples
        print(" [EMPTY]")
        return None
    except Exception as e:
        print(f" [FAILED] -> {e}")
        return None

def generate_function_index():
    print(f"🚀 Starting Architecture Sync...")
    
    repo_tree_md = generate_repo_tree(PROJECT_ROOT)
    
    print(f"📂 Scanning JS files in {SOURCE_DIRECTORY}...")
    export_pattern = re.compile(r'^export\s+(?:async\s+)?(function|const|let|var|class|default)\s+([a-zA-Z0-9_]+)', re.MULTILINE)
    window_pattern = re.compile(r'window\.([a-zA-Z0-9_]+)\s*=', re.MULTILINE)
    
    code_map = {}
    for root, _, files in os.walk(SOURCE_DIRECTORY):
        for file in files:
            if file.endswith('.js'):
                rel_path = os.path.relpath(os.path.join(root, file), SOURCE_DIRECTORY).replace('\\', '/')
                exports = set()
                try:
                    with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                        content = f.read()
                        for m in export_pattern.finditer(content): exports.add(f"`{m.group(2)}` ({m.group(1)})")
                        for m in window_pattern.finditer(content): exports.add(f"`{m.group(1)}` (window binding)")
                    if exports: code_map[rel_path] = sorted(list(exports))
                except Exception:
                    pass

    print(f"✍️ Writing Data Contract to {OUTPUT_FILENAME}...")
    os.makedirs(os.path.dirname(OUTPUT_FILENAME), exist_ok=True)

    with open(OUTPUT_FILENAME, 'w', encoding='utf-8') as md:
        md.write("# 🗺️ Application Architecture & Data Contract\n\n")
        md.write(f"> *Auto-generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n\n")
        
        md.write("## 🗂️ Physical Architecture (Repo Tree)\n")
        md.write("> Defines the strict separation of concerns and file locations.\n\n")
        md.write(repo_tree_md)
        
        md.write("---\n\n## 🛠️ Logical Architecture (JS Modules)\n\n")
        for path, exps in sorted(code_map.items()):
            md.write(f"### 📄 `{path}`\n")
            for e in exps: md.write(f"- {e}\n")
            md.write("\n")

        md.write("---\n\n## 📊 Data Architecture (Supabase Contract)\n")
        md.write("> **Strict Rule for AI:** Use ONLY these field names and JSON structures.\n\n")

        for table, query in TABLE_QUERIES.items():
            samples = get_random_samples(table, query)
            if samples:
                md.write(f"### 🗄️ Table: `{table}`\n```json\n")
                md.write(json.dumps(samples, indent=2))
                md.write("\n```\n\n")

    print(f"✨ Sync Complete!")

if __name__ == "__main__":
    generate_function_index()