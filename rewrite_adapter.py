import re

with open('src/services/dataAdapter.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Strict Mapping in loadAsanaLibrary
content = re.sub(
    r"iast:\s*row\.IAST\s*\?\?\s*row\.iast\s*\?\?\s*'',",
    r"iast: row.iast ?? '',",
    content
)

# Strict Mapping in normalizeAsanaRow
content = re.sub(
    r"name:\s*row\.name\s*\?\?\s*row\.Name\s*\?\?\s*existingData\.name,",
    r"name: row.name ?? '',",
    content
)
content = re.sub(
    r"english:\s*row\.english_name\s*\?\?\s*row\.English\s*\?\?\s*existingData\.english,",
    "english: row.english_name ?? '',\n        iast: row.iast ?? '',",
    content
)

# 2. ID Integrity in loadAsanaLibrary
content = re.sub(
    r"const rawId = row\.ID \?\? row\.id \?\? '';\s*const paddedId = String\(rawId\)\.trim\(\)\.replace\(/\^0\+/, ''\) \|\| '';\s*if \(!paddedId\) return;\s*const key = paddedId\.padStart\(3, '0'\);",
    "const rawId = row.ID ?? row.id ?? '';\n                const key = normaliseAsanaId(String(rawId));\n                if (!key) return;",
    content
)

# ID Integrity in user_asanas logic
content = re.sub(
    r"const key = String\(userRow\.id\)\.trim\(\)\.replace\(/\^0\+/, ''\)\.padStart\(3, '0'\);\s*if \(normalized\[key\]\) \{",
    "const key = normaliseAsanaId(String(userRow.id || userRow.ID || ''));\n            if (key) {",
    content
)

# ID Integrity in stages logic
content = re.sub(
    r"const numPart = String\(parentIdStr\)\.match\(/\^\(\\d\+\)/\);\s*if \(!numPart\) return;\s*const parentKey = numPart\[1\]\.replace\(/\^0\+/, ''\)\.padStart\(3, '0'\) \+ String\(parentIdStr\)\.replace\(/\^\\d\+/, ''\);",
    "const parentKey = normaliseAsanaId(String(parentIdStr));",
    content
)

# ID Integrity in normalizeAsanaRow
content = re.sub(
    r"id:\s*existingData\.id\s*\|\|\s*String\(row\.id\s*\|\|\s*row\.ID\s*\|\|\s*''\)\.trim\(\)\.replace\(/\^0\+/, ''\)\.padStart\(3, '0'\),",
    "id: existingData.id || normaliseAsanaId(String(row.id || row.ID || '')),",
    content
)

with open('src/services/dataAdapter.js', 'w', encoding='utf-8') as f:
    f.write(content)
