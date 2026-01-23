# GitHub Sync - Quick Start (30 seconds)

## TL;DR

1. **Get Token**: Go to https://github.com/settings/tokens → Generate → Select "repo" scope → Copy token
2. **Edit Course**: Click "Edit Current Course" → Make changes → Click "Save Changes"
3. **Sync**: Click "Sync to GitHub" → Paste token → Check "Remember" (optional) → Click "Continue" → Done!

## One-Time Setup

```
GitHub Settings > Personal Access Tokens > Generate new token
├─ Name: "Yoga App"
├─ Scope: ☑ repo
└─ Copy: ghp_...
```

## Sync Flow

```
Edit Course
    ↓
Save Changes
    ↓
Sync to GitHub
    ↓
Enter PAT (first time only)
    ↓
✓ Done! Check GitHub for new commit
```

## Common Issues

| Problem | Solution |
|---------|----------|
| "Please select course first" | Select a course from dropdown |
| "Invalid token (401)" | Generate new token, try again |
| "File not found (404)" | Check GitHub repo URL is correct |
| Spinner won't stop | Check internet, refresh page |

## Next Steps

- Read **GITHUB_SYNC_GUIDE.md** for detailed instructions
- Read **GITHUB_SYNC_TECHNICAL.md** for architecture details
- Check browser console (F12) for troubleshooting info

## Pro Tips

- Check "Remember token" to skip entering it next time
- Verify commit on GitHub after sync
- Use "Export as JSON" to backup before syncing
- Clear token with: `localStorage.removeItem('gh_pat')` in console

---

**That's it! You're now syncing to GitHub from the app UI.**
