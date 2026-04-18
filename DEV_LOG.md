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

## [2026-04-18] - Session [01]
**Goal:** Resolve "Unknown" label in Asana Editor and synchronize naming conventions across the UI.

**Architectural Decisions:**
- **Naming Normalization:** Confirmed `english` as the runtime standard for English pose names. Updated `asanaEditor.js` to prioritize `english` over the database-native `english_name`.
- **State Syncing:** Updated the editor's save callback to explicitly map `english_name` back to `english` in the local cache immediately after a successful Supabase upsert. This prevents UI "flicker" where a saved pose would revert to "Unknown" until a page refresh.
- **Resilient Rendering:** Replaced manual fallback strings in `builder.js` with calls to the central `displayName()` utility to ensure consistent naming logic across different app modules.

**Code Changed:**
- `src/ui/asanaEditor.js`: Standardized label rendering and hardened the cache-sync logic on save.
- `src/ui/builder.js`: Replaced inconsistent property lookups with standardized `displayName()` helper.

**Lessons Learned:**
- Normalization drift occurs when the `dataAdapter.js` maps database snake_case to app-friendly keys, but UI components are built targeting the raw database names. Standardizing on the normalized key (e.g., `english`) across the entire UI layer is critical.

**Next Steps for Next Session:**
- Audit `src/ui/historyModal.js` and `src/ui/posePlayer.js` for any lingering references to `english_name`.
- Investigate if `stages` variations require similar normalization (e.g., `full_technique` vs `technique`).
---

## [2026-04-16] - Session [01]
**Goal:** Implement support for the new `hold_json` columns to harden timing logic.
**Architectural Decisions:**
- Established `hold_json` (containing standard, short, long, and flow durations) as the primary source of truth for all pose timing.
- Implemented a resilient fallback to legacy text `hold` field parsing in `getHoldTimes` to ensure backward compatibility.
- Integrated `hold_json` hydration into the `dataAdapter.js` normalization path for both base asanas and stages (variations).
**Code Changed:**
- `src/services/dataAdapter.js`: Added JSON-based duration mapping and implemented null-safety checks in `parseSequenceJSON`.
- `src/utils/parsing.js`: Refactored `getHoldTimes` to prioritize the JSON timing object.
**Next Steps for Next Session:**
- Audit the database for any asanas or stages where `hold_json` might be missing or inconsistent with the legacy text field.
---
