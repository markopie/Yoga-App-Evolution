import os

FILE_PATH = "src/playback/timerEvents.js"
VARS_TO_CHECK = ["previewName", "mainMsg"]

def investigate():
    if not os.path.exists(FILE_PATH):
        print(f"❌ File not found: {FILE_PATH}")
        return

    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    for var_name in VARS_TO_CHECK:
        print(f"🔍 Searching for usages of: '{var_name}'")
        found_usages = []
        for i, line in enumerate(lines, 1):
            # Find the variable name but ignore the declaration lines (161, 162)
            if var_name in line and i not in [161, 162]:
                found_usages.append((i, line.strip()))
        
        if found_usages:
            for ln, content in found_usages:
                print(f"   ✅ Line {ln}: {content}")
        else:
            print(f"   ⚠️ No other usages found for '{var_name}'. It is likely dead code.")
        print("-" * 30)

if __name__ == "__main__":
    investigate()