# 🧘‍♂️ Yoga App Logic - Development Log

{
  "Yoga Dev Log Entry": {
    "prefix": "devlog",
    "body": [
      "## ${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE} - Session ${1:Number}",
      "**Goal:** ${2:What were we trying to achieve?}",
      "",
      "**Architectural Decisions:**",
      "- ${3:Decision 1}",
      "",
      "**Code Changed:**",
      "- ${4:File Name}: ${5:Brief description}",
      "",
      "**Next Steps for Next Session:**",
      "- ${6:Immediate task}",
      "---"
    ],
    "description": "Inserts a structured Yoga App development log entry"
  }
}


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

**Next Steps for Next Session:**
- Audit vertical scrolling behavior on mobile viewports to ensure the extra row doesn't push the sequence table off-screen.
- Verify theme/color contrast for the orange "Safety Note" card in Dark Mode.

## [2026-03-13] - Session [02]
**Goal:** Finalize Mehta (Yoga the Iyengar Way) bulk integration, ambiguity resolution, and reactive Flow-mode timing.
**Architectural Decisions:**
- **Mehta Namespace Support:** Introduced the `MEHTA:` prefix for bulk commands to explicitly target `page_primary` lookups, distinguishing them from `LOY:` (Light on Yoga) identifiers.
- **Deep Page Resolution:** Updated the parser to scan both base asanas and the `stages` (variations) table for page matches. This ensures that specific remedial variations appearing on a Mehta page are correctly identified.
- **Ambiguity Handling:** Implemented a non-blocking "Ambiguity State" in the builder. When a page number maps to multiple poses, the UI now flags the row with a warning and provides "Switch to..." options rather than failing silently.
- **Reactive Flow Timing:** Established a "Flow-First" resolution hierarchy. The builder now detects "Flow" sequences via category text or playback mode and automatically hydrates `flowHoldOverride`. These values now reactively update whenever a user changes a pose variation.
- **Briefing Persistence:** Decided to persist the default safety briefing to the `condition_notes` field upon saving if the field is empty. This "bakes" the safety data into the database, allowing users to append specific medical guidance to the standard disclaimer during future edits.
**Code Changed:**
- `src/services/dataAdapter.js`: Mapped `page_primary` into the core library object.
- `src/utils/builderParser.js`: Updated to handle `MEHTA:` prefix and resolve variation-level page numbers.
- `src/ui/builderSearch.js`: Added batch command detection for the search input.
- `src/ui/builder.js`: Integrated dynamic flow hold logic and default briefing injection on save.
- `src/ui/builderTemplates.js`: Updated to reflect resolved Mehta page info in the builder rows.
**Next Steps for Next Session:**
- Investigate a "Prop Picker" UI (briefcase icon) to manage the growing list of therapeutic props without cluttering the builder rows.
- Audit the "Ambiguity" UI on mobile to ensure the switch buttons are easily tappable.
---

## [2026-04-14] - Session [01]
**Goal:** Hardening the Data Layer, State Integrity, and Asana Editor Write-Path.

**Architectural Decisions:**
- **Schema Standardization:** Adopted `requires_sides` (snake_case) as the exclusive property for bilateral logic. Purged all `requiresSides` (camelCase) variants across the adapter and state.
- **State Consolidation:** Deleted the redundant `sequences` collection in `globalState`. All sequences (system and user) now reside in the unified `courses` array.
- **Write-Path Integrity:** Hardened the `asanaEditor.js` save logic to ensure payload sanitization. The editor now acts as a strict gatekeeper, preventing inconsistently named properties from reaching Supabase.
- **Jobsian Typographic Hierarchy:** Implemented a standardized rendering pattern for asana names: **Bold English Name** followed by *Italicized IAST (Sanskrit)*. This reduces cognitive load and improves scannability in the Editor UI.

**Code Changed:**
- `src/services/dataAdapter.js`: Hardened `normalizeAsana` and `normalizeStageRow` to enforce type safety and property naming.
- `src/store/state.js`: Performed a hygiene audit; removed dead `setSequences` logic and synchronized the `completionTracker`.
- `app.js`: Resolved syntax errors caused by state pruning; updated legacy `window` proxies and session resume logic.
- `src/ui/asanaEditor.js`: Refactored the header for typographic hierarchy and sanitized the Supabase `upsert` payload.
- `FUNCTION_INDEX.md`: Updated to reflect the removal of defunct state setters and getters.

**Next Steps for Next Session:**
- **PosePlayer Audit:** Perform a final pass on `src/ui/posePlayer.js` to remove redundant `isBilateral` helper logic now that the data source is hardened.
- **UI Consistency Pass:** Migrate the "Selected Poses" list in the Builder and the Practice History modal to the new Bold English / Italic IAST hierarchy.
---
