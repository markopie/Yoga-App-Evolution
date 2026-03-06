import re
import json

filepath = 'app.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

def extract_function(name, content):
    pattern = re.compile(rf'(?:async\s+)?function\s+{name}\s*\([^)]*\)\s*{{', re.MULTILINE)
    match = pattern.search(content)
    if not match:
        pattern = re.compile(rf'(?:const|let|var|window\.)\s*{name}\s*=\s*(?:async\s+)?(?:function)?\s*\([^)]*\)\s*(?:=>\s*)?{{', re.MULTILINE)
        match = pattern.search(content)
    
    if not match:
        return None
        
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
                    return content[start_idx:end_idx]
                    
    return None

funcs_to_extract = ['loadAsanaLibrary', 'normalizeAsana', 'normalizeAsanaRow', 'normalizePlate', 'parsePlates', 'normaliseAsanaId', 'normalizeText']

extracted = {}
for func in funcs_to_extract:
    body = extract_function(func, content)
    if body:
        extracted[func] = body

with open('extracted.json', 'w', encoding='utf-8') as f:
    json.dump(extracted, f, indent=2)

print(f"Extracted {len(extracted)} functions.")
