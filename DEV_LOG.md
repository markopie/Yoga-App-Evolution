# 🧘‍♂️ Yoga App Logic - Development Log

## [2026-03-13] - Session [01]
**Goal:** Resolve the 75% width constraint on #displayNotes and #builderNotes in the Builder/Viewer modals and improve Jobsian typography hierarchy.
**Architectural Decisions:**
- Decoupled notes from the `.modal-header` flex-row to bypass side-by-side constraints with button groups.
- Implemented a dedicated `#modalNotesRow` as a direct sibling to the header to ensure 100% horizontal spanning.
- Centralized note visibility logic in `builderUI.js` to ensure sync between View and Edit modes.
- Implemented regex-based IAST (Sanskrit) term identification for automatic emphasis in safety notes.
**Code Changed:**
- `index.html`: Restructured modal markup, removed inline layout styles, and added `#modalNotesRow`.
- `src/ui/builderUI.js`: Updated `updateBuilderModeUI` for row-based visibility; added IAST regex highlighting and Jobsian label styling.
- `styles/components.css`: Defined `.modal-notes-row` and removed obsolete `:has` flex-direction overrides.
- `styles/editor.css`: Sanitized `#builderNotes` styling to ensure 100% width enforcement.
**Next Steps for Next Session:**
- Audit vertical scrolling behavior on mobile viewports to ensure the extra row doesn't push the sequence table off-screen.
- Verify theme/color contrast for the orange "Safety Note" card in Dark Mode.
---