import os
import re

def generate_function_index(source_dir, output_file):
    print(f"Scanning '{source_dir}' for exported functions and variables...\n")
    
    # Regex to catch: export function foo(), export const bar =, export class Baz
    export_pattern = re.compile(r'^export\s+(?:async\s+)?(function|const|let|var|class|default)\s+([a-zA-Z0-9_]+)')
    # Regex to catch: export { foo, bar }
    bracket_export_pattern = re.compile(r'^export\s+\{\s*([^}]+)\s*\}')
    
    index_data = {}

    for root, dirs, files in os.walk(source_dir):
        # Skip node_modules and .git
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
        
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                # Get path relative to the source directory for cleaner reading
                rel_path = os.path.relpath(file_path, source_dir).replace('\\', '/')
                
                exports = []
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        for line in f:
                            line = line.strip()
                            
                            # Match direct exports
                            direct_match = export_pattern.match(line)
                            if direct_match:
                                export_type = direct_match.group(1)
                                export_name = direct_match.group(2)
                                exports.append(f"`{export_name}` ({export_type})")
                                continue
                            
                            # Match bracket exports
                            bracket_match = bracket_export_pattern.match(line)
                            if bracket_match:
                                items = [item.strip() for item in bracket_match.group(1).split(',')]
                                for item in items:
                                    if item: # Ignore empty strings from trailing commas
                                        exports.append(f"`{item}` (module export)")
                                        
                except Exception as e:
                    print(f"Could not read {file_path}: {e}")
                
                if exports:
                    index_data[rel_path] = exports

    # Write the Markdown file
    with open(output_file, 'w', encoding='utf-8') as md:
        md.write("# 🗺️ Application Architecture & Function Index\n\n")
        md.write("> *Auto-generated map of all exported modules in the project.*\n\n")
        
        for file_path in sorted(index_data.keys()):
            md.write(f"### 📄 `{file_path}`\n")
            for exp in index_data[file_path]:
                md.write(f"- {exp}\n")
            md.write("\n")

    print(f"✅ Success! Map generated at: {output_file}")

if __name__ == "__main__":
    # CONFIGURATION
    SOURCE_DIRECTORY = "./src"           # Point this to your JS folder
    OUTPUT_FILENAME = "FUNCTION_INDEX.md" # The file it will create
    
    generate_function_index(SOURCE_DIRECTORY, OUTPUT_FILENAME)