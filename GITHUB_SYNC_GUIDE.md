# GitHub Sync Guide

## Overview

The GitHub Sync feature allows you to commit your edited `courses.json` directly to your GitHub repository without leaving the app. This keeps your repository up-to-date with your latest yoga sequence modifications.

## Prerequisites

- A GitHub account
- Push access to the `markopie/Yoga-App-Evolution` repository
- A GitHub Personal Access Token (PAT) with `repo` scope

## Getting Your GitHub Personal Access Token

### Step 1: Create a PAT

1. Go to [GitHub Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Yoga App UI Sync")
4. Under "Select scopes," check **`repo`** (Full control of private repositories)
5. Scroll to the bottom and click "Generate token"
6. Copy the token (it starts with `ghp_`) - you won't see it again!

### Step 2: Store Securely

When prompted by the app, paste your token. You can optionally check "Remember token in browser" to save it locally for future syncs.

**Security Note:** The token is stored in your browser's localStorage. Only enable this on personal/trusted devices.

## How to Sync to GitHub

### Quick Start

1. Make edits to your courses using "Edit Current Course"
2. Click "Save Changes" to apply edits
3. Click "Sync to GitHub" button
4. If it's your first sync, the PAT prompt appears
5. Paste your GitHub Personal Access Token
6. Check "Remember token" if desired (optional)
7. Click "Continue"
8. Watch for the success notification

### What Happens Behind the Scenes

1. **Fetches Current SHA**: The app retrieves the current file's metadata from GitHub to get its SHA (required for updates)
2. **Encodes Data**: Your `courses` data is converted to JSON with 2-space indentation and Base64 encoded
3. **Creates Commit**: A PUT request is sent to GitHub with:
   - Commit message: "Update sequences via Yoga App UI"
   - New content (Base64 encoded)
   - Current file SHA
4. **Confirmation**: On success, a green notification confirms the sync

## Data Structure Preserved

The sync operation strictly preserves the 5-element pose array structure:

```javascript
[
  asanaId,      // Asana ID(s) as array (e.g., ["003"])
  timing,       // Duration in seconds
  label,        // Custom label/name
  variation,    // Reserved field (currently unused)
  notes         // Personal notes
]
```

**Example:**
```json
[["003"], 45, "Extended Triangle Pose", "", "Focus on spinal rotation"]
```

## Features

### Automatic SHA Fetching
- No manual SHA management needed
- The app fetches it fresh before each sync

### Token Management
- **First Use**: Enter your PAT when prompted
- **Remember Option**: Optionally store token in localStorage
- **Logout**: Clear stored token anytime (currently manual via browser dev tools)

### Real-Time Feedback
- **Loading State**: Button shows spinner while syncing
- **Status Messages**: Clear status messages show each step
  - "Fetching current file..."
  - "Uploading to GitHub..."
  - "✓ Successfully synced to GitHub!"
- **Error Handling**: Descriptive error messages if something fails

### Error Recovery
- **Invalid Token**: Automatically clears stored token on 401 errors
- **Retry-Friendly**: Can retry immediately after fixing issues
- **No Data Loss**: Failed sync doesn't affect your local edits

## Common Scenarios

### First-Time Sync

```
1. Click "Sync to GitHub"
2. PAT prompt appears
3. Enter token, optionally remember it
4. Click "Continue"
5. Success notification appears
6. Check GitHub - your courses.json is updated!
```

### Subsequent Syncs (with Stored Token)

```
1. Click "Sync to GitHub"
2. Sync happens automatically (no PAT needed)
3. Status updates show progress
4. Success notification
```

### Token Expired/Revoked

```
1. Click "Sync to GitHub"
2. Sync starts but fails with "Invalid token" error
3. Stored token is automatically cleared
4. Click "Sync to GitHub" again
5. PAT prompt reappears
6. Enter new token
7. Sync completes successfully
```

### Forget Token

If you want to clear a stored token:

1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Run: `localStorage.removeItem('gh_pat')`
4. Next sync will prompt for PAT again

## API Details

### GitHub API Endpoint

```
PUT https://api.github.com/repos/markopie/Yoga-App-Evolution/contents/courses.json
```

### Request Headers

```
Authorization: token {YOUR_PAT}
Accept: application/vnd.github.v3+json
Content-Type: application/json
```

### Request Body

```json
{
  "message": "Update sequences via Yoga App UI",
  "content": "{BASE64_ENCODED_COURSES}",
  "sha": "{CURRENT_FILE_SHA}"
}
```

## Troubleshooting

### "Invalid GitHub token (401 Unauthorized)"

**Cause:** Token is invalid, expired, or has insufficient permissions

**Solution:**
1. Generate a new PAT with `repo` scope
2. Clear stored token (F12 → Console → `localStorage.removeItem('gh_pat')`)
3. Try sync again with new token

### "File not found on GitHub (404)"

**Cause:** The file path is incorrect or the file doesn't exist

**Solution:**
- Verify the repository is `markopie/Yoga-App-Evolution`
- Ensure `courses.json` exists at the root of that repository
- Check repository access permissions

### "Failed to update file on GitHub (422)"

**Cause:** SHA mismatch or file conflict

**Solution:**
1. Refresh the browser
2. Try syncing again (app will fetch fresh SHA)
3. If persists, check GitHub for recent changes

### Loading spinner never stops

**Cause:** Network issue or API timeout

**Solution:**
1. Check internet connection
2. Refresh the page
3. Try again

### Token not being remembered

**Cause:** Browser localStorage is disabled or in private/incognito mode

**Solution:**
- Use normal browsing mode
- Enable localStorage in browser settings
- Manually enter token each session if needed

## Security Best Practices

1. **Use Repository-Scoped Token**: Create token with minimal required scope (`repo`)
2. **Keep Token Private**: Never share your token in logs, screenshots, or version control
3. **Use on Trusted Devices**: Only enable "Remember token" on personal computers
4. **Rotate Tokens**: Regenerate tokens periodically for better security
5. **Monitor Usage**: Check GitHub's Personal Access Tokens page for suspicious activity

## Workflow Integration

### Typical Editing Session

```
┌─ Select Course
│
├─ Click "Edit Current Course"
│
├─ Make changes to timing/labels/notes
│
├─ Click "Save Changes"
│
├─ (Optional) Export as JSON for backup
│
├─ Click "Sync to GitHub"
│
└─ ✓ Changes committed to GitHub
```

### Multi-Course Updates

```
1. Edit Course A → Save Changes
2. Edit Course B → Save Changes
3. Edit Course C → Save Changes
4. Click "Sync to GitHub" → All changes committed in one commit
```

## Advanced Usage

### Viewing Commit History

After syncing, view your commits on GitHub:
1. Go to [repository](https://github.com/markopie/Yoga-App-Evolution)
2. Check "Commits" tab
3. Look for "Update sequences via Yoga App UI" messages

### Manual Token Management

Check/clear stored token via browser console:

```javascript
// View token (first 10 chars)
const token = localStorage.getItem('gh_pat');
console.log(token ? token.substring(0, 10) + '...' : 'No token stored');

// Clear token
localStorage.removeItem('gh_pat');

// Check all app storage
console.log(localStorage);
```

### Troubleshooting via Console

Monitor sync process:

```javascript
// Open browser console (F12)
// All sync operations log messages like:
// "GitHub sync completed successfully"
// "Error fetching SHA: ..."
```

## Limitations & Notes

1. **Single Repository**: Currently syncs to `markopie/Yoga-App-Evolution` only
2. **Linear Workflow**: No branching/PR support (direct main branch commits)
3. **Atomic Commits**: All edited courses committed together
4. **No Undo in App**: Use GitHub to revert if needed
5. **Network Required**: Sync requires active internet connection

## Future Enhancements

Potential improvements:
- Support multiple repositories
- Branch selection UI
- Commit message customization
- Sync history viewer
- Conflict resolution UI
- OAuth authentication
- Automatic periodic syncs

## Support

For issues:
1. Check the Troubleshooting section above
2. View browser console (F12) for detailed error messages
3. Verify GitHub repository URL and permissions
4. Test token with `curl`:
   ```bash
   curl -H "Authorization: token YOUR_PAT" https://api.github.com/user
   ```

## Related Features

- **Edit Current Course** - Modify course details before syncing
- **Export as JSON** - Download backup before syncing
- **Browse Asanas** - View and understand pose data
