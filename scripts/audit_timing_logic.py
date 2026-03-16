import os
import re

# We want all duration math to happen ONLY in sequenceUtils.js
CENTRAL_LOGIC_FILE = "sequenceUtils.js"
# Patterns that indicate local timing math is happening
RISKY_PATTERNS = [
    (re.compile(r'\.duration\s*\*'), "Manual duration multiplication"),
    (re.compile(r'p\[1\]\s*\*'), "Manual array-index multiplication"),
    (re.compile(r'requiresSides\s*\?'), "Local bilateral logic"),
    (re.compile(r'Math\.round\(.*?\/\s*2\)'), "Manual bilateral halving")
]

def audit_files(src_dir):
    issues_found = 0
    for root, _, files in os.walk(src_dir):
        for file in files:
            if not file.endswith('.js') or file == CENTRAL_LOGIC_FILE:
                continue
            
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    for pattern, desc in RISKY_PATTERNS:
                        if pattern.search(line):
                            print(f"🚩 {desc} in {filepath}:{line_num}")
                            print(f"   Line: {line.strip()}\n")
                            issues_found += 1
    return issues_found

if __name__ == "__main__":
    print("🔍 Auditing JavaScript for decentralized timing logic...\n")
    count = audit_files("src")
    if count == 0:
        print("✅ Clean! All timing math appears to be centralized.")
    else:
        print(f"❌ Found {count} instances of decentralized math. Move these to sequenceUtils.js!")