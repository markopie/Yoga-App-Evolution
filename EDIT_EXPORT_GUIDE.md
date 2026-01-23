# Course Editing & Export Guide

## Overview

This feature allows you to edit course details directly in the UI and export the updated master list as a new `courses.json` file. Perfect for adjusting timing, labels, and notes for individual poses within a course.

## Features

### 1. Edit Current Course
- Open any course and click **Edit Current Course** button
- A modal appears showing all poses in a table format
- Edit 4 fields for each pose:
  - **Timing** (seconds) - Duration to hold the pose
  - **Label** - Custom name/description for the pose
  - **Notes** - Any additional information

### 2. Instant Saving
- Click **Save Changes** to apply edits to the current session
- Changes are stored in memory and ready for export
- No data is lost if you close the modal without saving

### 3. Export as JSON
- Click **Export as JSON** to download an updated `courses.json` file
- The file includes all modifications made during the session
- Supports multiple course edits in one session

## How It Works

### Step 1: Select a Course
In the main app interface, select a course from the dropdown menu.

### Step 2: Open Edit Modal
Click the **Edit Current Course** button (under "Edit & Export Course" section).

### Step 3: Edit Poses
The modal displays a table with all poses:

| Column | Purpose | Notes |
|--------|---------|-------|
| Pose | Asana name (read-only) | Shows the pose name from library |
| Timing (sec) | Duration in seconds | 0-3600 range supported |
| Label | Custom description | Overrides default pose name in displays |
| Notes | Additional info | Private notes, not shown in playback |

### Step 4: Save Changes
Click **Save Changes** to apply your edits to memory.

### Step 5: Export
Click **Export as JSON** to download the modified `courses.json` file.

## Data Structure

Each pose in a course is stored as an array:
```javascript
[
  [asanaId],      // Array containing pose ID (e.g., ["003"])
  timing,         // Duration in seconds
  label,          // Custom label/name
  "",             // Reserved field (currently unused)
  notes           // Notes/additional info
]
```

After editing, this structure is preserved in the exported JSON.

## Example Workflow

### Before Edit
```json
[["003"], 30, "Utthita Trikonasana (Big Side Stretch)", "", ""]
```

### Edit Form
- Timing: 45 (changed from 30)
- Label: "Extended Triangle Pose"
- Notes: "Focus on spinal rotation"

### After Export
```json
[["003"], 45, "Extended Triangle Pose", "", "Focus on spinal rotation"]
```

## Technical Details

### In-Memory Editing
- Changes exist in JavaScript memory during the session
- No server communication required
- Fast and responsive interface

### Export Format
- Standard JSON with 2-space indentation
- Fully compatible with the app's course loading system
- Can be directly uploaded to replace `courses.json`

### Data Preservation
- Course title and category are preserved
- Course structure and pose order are maintained
- All other course metadata is kept intact

## Tips & Tricks

### Batch Editing
- Edit multiple courses in one session
- Save each course separately
- Export once at the end to get all changes

### Quick Timing Adjustments
- Common adjustments:
  - Standing poses: 30-60 seconds
  - Seated poses: 45-90 seconds
  - Inversions: 20-45 seconds
  - Deep stretches: 60-120 seconds

### Label Best Practices
- Keep labels short and descriptive
- Include modifications (e.g., "Extended Hold")
- Match your personal notation style

### Notes Field
- Store personal cues ("Focus on alignment")
- Reference section of book/sequence
- Track difficulty notes for later sessions

## Limitations & Notes

1. **Single Course at a Time**: Edit one course per modal opening
2. **No Undo**: Changes are committed when saved (can re-edit if needed)
3. **Browser Storage**: Edits exist in memory; refresh page to reset
4. **Backup**: Always keep a backup of original `courses.json`

## Troubleshooting

### "Please select a course first"
- Make sure to select a course from the dropdown before clicking Edit

### Export button doesn't work
- Verify at least one course is loaded
- Check browser console for errors (F12 → Console)

### Changes not appearing in exported file
- Click **Save Changes** in the modal before exporting
- Watch for the confirmation alert

### Numbers won't save
- Timing field accepts 0-3600 seconds only
- Check for non-numeric characters in the field

## Integration Notes

### Supabase Integration
- Edits are local to your browser session
- Optional: Implement server sync to save to Supabase
- Currently maintains backward compatibility with existing system

### File Upload
After exporting `courses.json`:
1. Replace the original file in your project directory
2. Refresh the app to load updated courses
3. Or upload through any admin interface if implemented

## Future Enhancements

Potential improvements:
- Multi-course batch editing UI
- Undo/redo functionality
- Cloud sync to Supabase
- Keyboard shortcuts (Tab between fields)
- Pose search/filter in edit modal
- History of edits with timestamps
- Revert to saved version

## Support

For issues or feature requests, check:
1. Browser console (F12) for error messages
2. Verify course data structure matches expected format
3. Test with simple edits first to isolate issues
