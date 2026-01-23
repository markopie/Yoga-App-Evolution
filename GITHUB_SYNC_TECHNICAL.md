# GitHub Sync - Technical Implementation

## Architecture Overview

The GitHub sync feature is implemented as a client-side JavaScript module that:
1. Manages GitHub Personal Access Token (PAT) storage
2. Fetches file metadata (SHA) from GitHub API
3. Encodes course data to Base64
4. Performs PUT request to GitHub API
5. Provides UI feedback throughout the process

## File Modifications

### 1. index.html

**New Elements Added:**

- **Sync Button** (line 119):
  ```html
  <button id="syncGitHubBtn" type="button" style="padding: 10px 16px; background:#24292e; color:#fff;">
    Sync to GitHub
  </button>
  ```

- **Status Display** (line 122):
  ```html
  <div id="gitHubStatus" class="muted" style="margin-top:8px; display:none;"></div>
  ```

- **PAT Input Modal** (lines 145-176):
  - Backdrop: `#gitHubPatBackdrop`
  - Input field: `#gitHubPatInput` (password type)
  - Remember checkbox: `#gitHubRememberPat`
  - Buttons: Submit & Cancel

### 2. styles/style.css

**New CSS Classes Added:**

- `.btn-loading` - Button state during sync with spinner animation
- `.btn-loading::after` - Animated spinner using CSS borders
- `@keyframes spin` - 360° rotation animation
- `.notification-success` - Green success notification
- `.notification-error` - Red error notification

### 3. app.js

**New Functions Implemented:**

```javascript
// Token Management
getStoredGitHubPAT()           // Retrieve from localStorage
storeGitHubPAT(token, remember) // Store conditionally
clearStoredGitHubPAT()          // Remove from storage

// UI Functions
showGitHubPatPrompt(callback)  // Display PAT input modal
showGitHubStatus(message, isError) // Show status notification
setGitHubButtonLoading(loading) // Toggle loading state

// API Functions
fetchGitHubFileSha(token)       // GET current file SHA
encodeToBase64(str)             // Base64 encode courses JSON
syncCoursesToGitHub(token)      // Main sync logic (PUT request)

// Entry Point
initiateSyncToGitHub()           // Handle click → flow control
```

**Constants Defined:**

```javascript
const GITHUB_REPO = "markopie/Yoga-App-Evolution"
const GITHUB_FILE = "courses.json"
const GITHUB_API_URL = "https://api.github.com/repos/..." // Full URL
const GH_PAT_STORAGE_KEY = "gh_pat"
```

## Flow Diagram

```
User clicks "Sync to GitHub"
        ↓
   initiateSyncToGitHub()
        ↓
   Check localStorage for PAT
        ├─ Yes → syncCoursesToGitHub(token)
        └─ No  → showGitHubPatPrompt()
                        ↓
                   User enters PAT
                        ↓
                   storeGitHubPAT()
                        ↓
                   syncCoursesToGitHub(token)
                        ↓
         setGitHubButtonLoading(true)
         showGitHubStatus("Fetching...")
                        ↓
         fetchGitHubFileSha(token)
                        ├─ Success → Continue
                        └─ Error → Show error, clearStoredGitHubPAT()
                        ↓
         JSON.stringify(courses, null, 2)
         encodeToBase64(JSON.string)
                        ↓
         showGitHubStatus("Uploading...")
                        ↓
         fetch(GITHUB_API_URL, PUT)
                ├─ 200 OK → showGitHubStatus("✓ Success!")
                ├─ 401 → clearStoredGitHubPAT(), show error
                ├─ 422 → show error
                └─ Other → show error
                        ↓
         setGitHubButtonLoading(false)
```

## Data Transformation

### Input
```javascript
// Global variable: window.courses
[
  {
    "title": "Ashtanga Primary Series",
    "category": "",
    "poses": [
      [["1"], 30, "Samasthiti (Focus)", "", ""],
      [["18"], 30, "Padangusthasana", "", ""]
    ]
  }
]
```

### Step 1: Stringify with Formatting
```javascript
JSON.stringify(courses, null, 2)
```
Produces: JSON string with 2-space indentation

### Step 2: Base64 Encode
```javascript
btoa(unescape(encodeURIComponent(str)))
```
Preserves UTF-8 characters, converts to Base64

### Output to GitHub
```json
{
  "message": "Update sequences via Yoga App UI",
  "content": "W3sgInRpdGxlIjogIkFzaHRhbmdh...",
  "sha": "e3b0c44298fc1c149afbf4c8996fb924"
}
```

## GitHub API Details

### Endpoint
```
PUT /repos/{owner}/{repo}/contents/{path}
```

### Authentication
```
Header: Authorization: token {PAT}
```
Must have `repo` scope

### Request Structure
```javascript
fetch(url, {
  method: "PUT",
  headers: {
    "Authorization": `token ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message: "Update sequences via Yoga App UI",
    content: encodedContent,  // Base64 string
    sha: currentFileSha        // From GET request
  })
})
```

### Response Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 200 | Success | Show success notification |
| 201 | Created | (Shouldn't happen for existing file) |
| 401 | Unauthorized | Clear token, show error |
| 404 | Not Found | Show error (file missing) |
| 422 | Validation Failed | Show error (SHA mismatch likely) |

## Error Handling Strategy

### Network Errors
- Try/catch wrapper catches network failures
- User sees: `Error: Failed to fetch` (or specific message)
- Button loading state always reset in finally block

### Authentication Errors (401)
- Token is cleared from localStorage
- User prompted to re-enter on next sync attempt
- Message: "GitHub token expired or invalid. Please re-enter."

### File Errors (404, 422)
- Descriptive error message provided
- Button remains available for retry
- User can check GitHub repository access

### Encoding Errors
- Base64 encoding wrapped in try/catch
- UTF-8 characters handled with encodeURIComponent
- Shows: "Failed to encode data"

## Data Integrity

### Preservation Guarantees

1. **Array Structure** - 5-element arrays strictly maintained
   ```
   [asanaId, timing, label, variation, notes]
   ```

2. **JSON Formatting** - Consistent 2-space indentation
   ```javascript
   JSON.stringify(courses, null, 2)
   ```

3. **Character Encoding** - UTF-8 preserved through Base64
   ```javascript
   btoa(unescape(encodeURIComponent(str)))
   ```

4. **Metadata** - Course title/category preserved
   - No transformation of original data
   - Only Base64 encoding/decoding

### No Data Modification

- Courses loaded from GitHub are used as-is
- Edits happen in-memory (window.courses)
- Export/sync sends exact copy

## localStorage Security

### Storage Key
```
'gh_pat' → GitHub Personal Access Token
```

### Storage Scope
- **Same Origin**: Only accessible from same domain
- **No Encryption**: Stored as plain text (browser native encryption)
- **User Control**: User decides whether to enable "Remember"

### Security Notes
- Tokens CAN be extracted via browser DevTools
- Only use on personal/trusted devices
- Consider rotating tokens periodically
- Browser clear/reset also clears stored token

## Browser Compatibility

### Required Features
- `localStorage` API - [IE8+]
- `fetch` API - [Chrome 40+, Firefox 39+, Safari 10.1+]
- `btoa()` / `encodeURIComponent()` - [All modern browsers]
- `Promise` / `async-await` - [ES2017 standard]

### Fallback Behavior
- No fallback implemented (requires modern browser)
- Gracefully fails with console errors if unsupported
- No silent failures

## Testing Checklist

- [ ] First sync with new PAT (prompts for token)
- [ ] Second sync with stored token (no prompt)
- [ ] Clear token and retry (prompts again)
- [ ] Invalid token (shows 401 error, clears storage)
- [ ] Network offline (shows fetch error)
- [ ] Very large courses.json (encoding/upload)
- [ ] Special characters in labels/notes (UTF-8)
- [ ] Rapid clicks (button disabled during sync)
- [ ] Close modal during sync (cleanup)
- [ ] Token with wrong scope (shows error)

## Performance Considerations

### File Size Limits
- GitHub API request limit: ~25MB
- Typical courses.json: ~100KB
- No issues expected for reasonable course sizes

### Network Time
- Typical sync: 1-3 seconds
  - 200ms: Fetch SHA
  - 800ms: PUT request
  - Delays: Network latency, GitHub processing

### Memory Usage
- Single Base64 copy in memory during encoding
- Temporary during fetch operations
- No memory leaks (proper cleanup)

## Debugging

### Console Logging

```javascript
// Enable detailed logging
localStorage.setItem('debug_github_sync', 'true');

// View logs in browser console (F12)
// Messages logged at each step:
// "GitHub sync completed successfully"
// "Error fetching SHA: ..."
```

### Check Stored Token

```javascript
// View first 10 chars of token
const token = localStorage.getItem('gh_pat');
console.log(token ? token.substring(0, 10) : 'No token');
```

### Inspect Request

```javascript
// In DevTools Network tab, look for:
// 1. GET https://api.github.com/repos/... (fetch SHA)
// 2. PUT https://api.github.com/repos/... (update file)
```

## Integration Points

### With Existing Features

1. **Edit Current Course** → Modified data in window.courses
2. **Export as JSON** → Same data exported locally
3. **Sync to GitHub** → Sends window.courses to GitHub

### No Breaking Changes
- Existing course loading unchanged
- Export functionality independent
- Edit modal remains separate

## Future Architecture

### Potential Improvements
- Supabase sync option (alternate to GitHub)
- Multiple repo support (config parameter)
- Commit message customization UI
- Sync history tracking
- Conflict resolution
- Automatic periodic syncs (background)

### Minimal Refactoring Needed
- Extract constants to config object
- Parameterize repository details
- Add event system for sync notifications
