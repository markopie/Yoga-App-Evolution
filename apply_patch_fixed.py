import json
import os

with open('extracted.json', 'r', encoding='utf-8') as f:
    extracted = json.load(f)

adapter_path = os.path.join('src', 'services', 'dataAdapter.js')
app_path = 'app.js'

with open(app_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

lines = [
    "import { supabase } from './supabaseClient.js';",
    "import { parseHoldTimes } from '../utils/parsing.js';"
]

for name, body in extracted.items():
    lines.append(body)
    app_content = app_content.replace(body, '')

keys = list(extracted.keys())
lines.append("export { " + ", ".join(keys) + " };")

nl = chr(10)

with open(adapter_path, 'w', encoding='utf-8') as f:
    f.write((nl + nl).join(lines) + nl)

import_statement = "import { " + ", ".join(keys) + " } from './src/services/dataAdapter.js';" + nl
idx = app_content.find("import { supabase }")
if idx != -1:
    app_content = app_content[:idx] + import_statement + app_content[idx:]
else:
    app_content = import_statement + app_content

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(app_content)

print('Success')
