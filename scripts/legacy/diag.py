import os
import re

def diagnose_yoga_logic():
    # Updated to match the actual functions and variables we use
    files_to_check = ['app.js', 'src/services/dataAdapter.js', 'src/playback/timer.js', 'src/utils/helpers.js']
    
    # Looking for how images and sequences are handled
    patterns = [
        'smartUrlsForPoseId', 
        'image_url', 
        'setPose', 
        'nextPose',
        'renderCollage',
        'focusImageWrap'
    ]
    
    print("--- Vital Signs Audit: Sequence & Image Logic ---")
    
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"\n[{file_path}]")
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
                # Keep track of printed blocks to avoid massive spam
                last_printed = -10
                
                for i, line in enumerate(lines):
                    if any(p.lower() in line.lower() for p in patterns):
                        if i < last_printed:
                            continue # Skip overlapping blocks
                            
                        start = max(0, i - 2)
                        end = min(len(lines), i + 6)
                        
                        print(f"  --- Match near line {i+1} ---")
                        for j in range(start, end):
                            prefix = ">> " if j == i else "   "
                            print(f"  {j+1:4d} {prefix}{lines[j].rstrip()}")
                        print()
                        
                        last_printed = end
        else:
            print(f"Error: {file_path} not found.")

if __name__ == "__main__":
    diagnose_yoga_logic()