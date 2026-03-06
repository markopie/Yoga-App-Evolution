import re
import os

app_js_path = 'app.js'
adapter_js_path = os.path.join('src', 'services', 'dataAdapter.js')

with open(app_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

def extract_function(name, content):
    pattern = re.compile(rf'(?:async\s+)?function\s+{name}\s*\([^)]*\)\s*{{', re.MULTILINE)
    match = pattern.search(content)
    if not match:
        pattern = re.compile(rf'(?:const|let|var|window\.)\s*{name}\s*=\s*(?:async\s+)?(?:function)?\s*\([^)]*\)\s*(?:=>\s*)?{{', re.MULTILINE)
        match = pattern.search(content)
    
    if not match:
        return None, content
        
    start_idx = match.start()
    brace_count = 0
    in_string = False
    string_char = ''
    escape = False
    
    for i in range(match.end() - 1, len(content)):
        char = content[i]
        
        if escape:
            escape = False
            continue
            
        if char == '':
            escape = True
            continue
            
        if in_string:
            if char == string_char:
                in_string = False
        else:
            if char in ["'", '"', '`']:
                in_string = True
                string_char = char
            elif char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_idx = i + 1
                    func_body = content[start_idx:end_idx]
                    new_content = content[:start_idx] + content[end_idx:]
                    return func_body, new_content
                    
    return None, content

funcs_to_move = [
    'loadAsanaLibrary', 
    'normalizeAsana', 
    'normalizeAsanaRow', 
    'normalizePlate', 
    'parsePlates', 
    'normaliseAsanaId'
]

extracted_funcs = []
for func in funcs_to_move:
    body, content = extract_function(func, content)
    if body:
        extracted_funcs.append(body)

# Write to dataAdapter.js
adapter_code = """import { supabase } from './supabaseClient.js';
import { parseHoldTimes } from '../utils/parsing.js';

""" + "

".join(extracted_funcs) + "

"

# Export the functions
exports = ", ".join([f for f in funcs_to_move if any(f in body for body in extracted_funcs)])
adapter_code += f"export {{ {exports} }};
"

with open(adapter_js_path, 'w', encoding='utf-8') as f:
    f.write(adapter_code)

# Update app.js
import_statement = f"import {{ {exports} }} from './src/services/dataAdapter.js';
"
# Find a good place to insert the import in app.js
import_insert_pos = content.find("import { supabase } from")
if import_insert_pos != -1:
    content = content[:import_insert_pos] + import_statement + content[import_insert_pos:]
else:
    content = import_statement + content

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Successfully moved {len(extracted_funcs)} functions to {adapter_js_path}")
