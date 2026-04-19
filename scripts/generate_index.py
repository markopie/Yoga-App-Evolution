import os
import re
import shutil

def generate_function_index(source_dir, local_output, gdrive_output_dir):
    print(f"Scanning '{source_dir}' for exports and window bindings...\n")

    export_pattern = re.compile(r'^export\s+(?:async\s+)?(function|const|let|var|class|default)\s+([a-zA-Z0-9_]+)', re.MULTILINE)
    bracket_export_pattern = re.compile(r'^export\s+\{([^}]+)\}', re.MULTILINE)
    window_pattern = re.compile(r'window\.([a-zA-Z0-9_]+)\s*=', re.MULTILINE)

    index_data = {}

    for root, dirs, files in os.walk(source_dir):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, source_dir).replace('\\', '/')
                exports = set()

                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        for match in export_pattern.finditer(content):
                            exports.add(f"`{match.group(2)}` ({match.group(1)})")
                        for match in bracket_export_pattern.finditer(content):
                            items = [item.strip() for item in match.group(1).replace('\n', '').split(',')]
                            for item in items:
                                if item: exports.add(f"`{item}` (module export)")
                        for match in window_pattern.finditer(content):
                            exports.add(f"`{match.group(1)}` (window binding)")
                except Exception as e:
                    print(f"Could not read {file_path}: {e}")

                if exports:
                    index_data[rel_path] = sorted(list(exports))

    # --- PERSISTENCE LOGIC ---
    
    # 1. Generate Content Buffer
    content_lines = ["# 🗺️ Application Architecture & Function Index\n\n", "> *Auto-generated map of all exported modules and window bindings.*\n\n"]
    for file_path in sorted(index_data.keys()):
        content_lines.append(f"### 📄 `{file_path}`\n")
        for item in index_data[file_path]:
            content_lines.append(f"- {item}\n")
        content_lines.append("\n")
    
    full_content = "".join(content_lines)

    # 2. Save Locally
    with open(local_output, 'w', encoding='utf-8') as local_file:
        local_file.write(full_content)
    print(f"✅ Local copy saved: {local_output}")

    # 3. Save/Update G-Drive Copy
    try:
        if not os.path.exists(gdrive_output_dir):
            os.makedirs(gdrive_output_dir)
        
        gdrive_path = os.path.join(gdrive_output_dir, local_output)
        with open(gdrive_path, 'w', encoding='utf-8') as gdrive_file:
            gdrive_file.write(full_content)
        print(f"✅ G-Drive copy updated: {gdrive_path}")
    except Exception as e:
        print(f"⚠️ Failed to write to G-Drive: {e}")

if __name__ == "__main__":
    SOURCE_DIRECTORY = "./src"
    OUTPUT_FILENAME = "FUNCTION_INDEX.md"
    G_DRIVE_DIR = r"G:\My Drive\Personal\02_Education_Yoga\Yoga_Project_Files"
    
    generate_function_index(SOURCE_DIRECTORY, OUTPUT_FILENAME, G_DRIVE_DIR)