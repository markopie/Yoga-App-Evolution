import re

def remove_function(code, func_name):
    # Find start of function
    match = re.search(r'(async\s+)?function\s+' + func_name + r'\s*\(', code)
    if not match: return code
    start_idx = match.start()
    
    # Find the matching closing brace
    brace_count = 0
    in_function = False
    
    # We need to start counting braces from the first '{' after start_idx
    first_brace = code.find('{', start_idx)
    if first_brace == -1: return code
    
    for i in range(first_brace, len(code)):
        if code[i] == '{':
            brace_count += 1
            in_function = True
        elif code[i] == '}':
            brace_count -= 1
            
        if in_function and brace_count == 0:
            end_idx = i + 1
            return code[:start_idx] + code[end_idx:]
            
    return code

with open('app.js', 'r', encoding='utf-8') as f:
    code = f.read()

funcs = ['loadAsanaLibrary', 'normalizeAsana', 'normalizeAsanaRow', 'normalizePlate', 'parsePlates', 'normaliseAsanaId']
for func in funcs:
    code = remove_function(code, func)

# add import
import_str = 'import { loadAsanaLibrary, normalizeAsana, normalizeAsanaRow, normalizePlate, parsePlates, normaliseAsanaId } from "./src/services/dataAdapter.js";\n'
code = code.replace('import { supabase } from "./src/services/supabaseClient.js";', import_str + 'import { supabase } from "./src/services/supabaseClient.js";')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(code)
