import os
import re

def generate_function_index(source_dir, output_file):
    print(f"Scanning '{source_dir}' for exports and window bindings...\n")

    # Regex to catch: export function foo(), export const bar =, export class Baz
    # Uses MULTILINE to match the start of lines
    export_pattern = re.compile(r'^export\s+(?:async\s+)?(function|const|let|var|class|default)\s+([a-zA-Z0-9_]+)', re.MULTILINE)
    
    # Regex to catch: export { foo, bar } spanning multiple lines
    bracket_export_pattern = re.compile(r'^export\s+\{([^}]+)\}', re.MULTILINE)
    
    # NEW: Catch window.functionName = ...
    # Looks for 'window.something =' anywhere, even indented
    window_pattern = re.compile(r'window\.([a-zA-Z0-9_]+)\s*=', re.MULTILINE)

    index_data = {}

    for root, dirs, files in os.walk(source_dir):
        # Skip node_modules and .git
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]

        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                # Get path relative to the source directory for cleaner reading
                rel_path = os.path.relpath(file_path, source_dir).replace('\\', '/')
                
                exports = set() # Use a set to prevent duplicates

                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                        # 1. Match direct exports
                        for match in export_pattern.finditer(content):
                            export_type = match.group(1)
                            export_name = match.group(2)
                            exports.add(f"`{export_name}` ({export_type})")

                        # 2. Match multiline bracket exports
                        for match in bracket_export_pattern.finditer(content):
                            # Split by comma, strip whitespace and newlines
                            items = [item.strip() for item in match.group(1).replace('\n', '').split(',')]
                            for item in items:
                                if item:
                                    exports.add(f"`{item}` (module export)")
                                    
                        # 3. Match window.* bindings
                        for match in window_pattern.finditer(content):
                            window_name = match.group(1)
                            exports.add(f"`{window_name}` (window binding)")

                except Exception as e:
                    print(f"Could not read {file_path}: {e}")

                if exports:
                    # Sort the set before adding to dict for consistent output
                    index_data[rel_path] = sorted(list(exports))

    # Write the Markdown file
    with open(output_file, 'w', encoding='utf-8') as md:
        md.write("# 🗺️ Application Architecture & Function Index\n\n")
        md.write("> *Auto-generated map of all exported modules and window bindings.*\n\n")

        for file_path in sorted(index_data.keys()):
            md.write(f"### 📄 `{file_path}`\n")
            for item in index_data[file_path]:
                md.write(f"- {item}\n")
            md.write("\n")

    print(f"✅ Success! Map generated at: {output_file}")

if __name__ == "__main__":
    # CONFIGURATION
    SOURCE_DIRECTORY = "./src"            # Point this to your JS folder
    OUTPUT_FILENAME = "FUNCTION_INDEX.md" # The file it will create
    
    generate_function_index(SOURCE_DIRECTORY, OUTPUT_FILENAME)