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

## [2026-04-19] - Session [01]
**Goal:** Integrate "Cycle" category (ID 56) and optimize the "Link a Sequence" modal with contextual suppression.

**Architectural Decisions:**
- **Playback Mode Differentiation:** Defined `playbackMode: 'cycle'` for Category 56. Unlike "Flow" (ID 55), "Cycle" sequences use library-standard timing and are affected by the Duration Dial. This was achieved by keeping `isFlow: false` for Cycles, allowing them to fall through to standard timing logic in `getEffectiveTime`.
- **Unified Linking Logic:** Introduced the `isMacroLinkable` flag in the data layer. This centralizes the logic for which sequences can be linked as macros, simplifying UI filtering in the Builder.
- **Redundant Label Suppression:** Implemented logic in the `dataAdapter` to simplify category strings (e.g., "Cycle > Asana Cycles" becomes simply "Cycle").
- **Contextual UI Suppression:** Updated the Link modal to hide metadata labels when a specific category filter (Flows or Cycles) is active, as the context is already provided by the tab.
- **Jobsian Typography:** Refined the search result hierarchy by removing title bolding and emphasizing IAST terms with italics to improve scannability.

**Code Changed:**
- `src/services/dataAdapter.js`: Added Cycle/Flow resolution, `isMacroLinkable` flag, and `categoryLabel` cleanup.
- `src/utils/sequenceUtils.js`: Updated `isFlowPlaybackSequence` to strictly isolate Flow-mode timing.
- `src/ui/builderUI.js`: Injected Segmented Filter UI (All/Flows/Cycles) into the Link modal; implemented contextual metadata suppression and updated typographic rendering.
- `styles/editor.css`: Reduced opacity for `.link-option-meta` to establish a clearer visual hierarchy.

**Next Steps for Next Session:**
- Verify that bilateral poses in "Cycle" sequences correctly double their duration in the Pose Player.
- Audit the "All" tab in the Link modal to ensure mixed category labels maintain consistent spacing.
---

## [2026-04-20] - Session [01]
**Goal:** Unify Flow/Cycle architectural rules, implement dismissible mobile safety notes, and enhance the Progress Summary with Jobsian Asana IDs.

**Architectural Decisions:**
- **"Protected" Sequence Status:** Unified 'Flow' (ID 55) and 'Cycle' (ID 56) types under a `isProtectedSequence` helper. This suppresses auto-injection of preparatory/recovery poses and transition padding for both, while allowing Cycles to remain scalable via the Duration Dial.
- **Mobile Vertical Optimization:** Implemented a dismissible/restorable UI for Safety Notes (`condition_notes`). This allows mobile users to regain vertical space while keeping vital safety info accessible via a high-contrast, discrete restoration icon.
- **PDF Snapshot Hardening:** Refactored the export engine to force-expand safety notes and strip out UI-only elements (buttons, icons, tooltips) during the cloning process, ensuring professional, print-ready results.
- **Jobsian Progress Summary:** Extended the typographic hierarchy to the completion summary, introducing ID badges that normalize IDs (stripping leading zeros) for a clean, technical look.

**Code Changed:**
- `src/utils/sequenceUtils.js`: Created `isProtectedSequence` and updated `getEffectiveTime` to differentiate between structural protection and timing resolution.
- `src/services/sequenceEngine.js`: Refactored the expansion loop to track "Protected" context and fixed a scoping regression for `isFlowContext`.
- `src/ui/builderUI.js`: Implemented the `toggleWarning` state, added the PDF force-expand logic, and resolved the "Infinite Print Button" duplication bug.
- `src/ui/builder.js`: Synchronized builder rendering with the new protection rules and fixed ID/Variation state clearing during row searches.
- `src/ui/progressSummaryUI.js`: Integrated `summary-id-badge` rendering into the completion table.
- `styles/editor.css`: Added styles for the dismissible warning system (22px peach restore icon) and the Jobsian ID badges.
- `index.html`: Restructured `#modalNotesRow` to accommodate the restorable warning button.

**Lessons Learned:**
- DOM ID collisions (e.g., sharing an ID between a container and a button) can "deaden" UI listeners silently. Renaming containers with a `Container` suffix is a mandatory hygiene step when wrapping buttons with initialization logic.

---

## [2026-04-21] - Session [01]
**Goal:** Refine Sequence Builder table layout for structural hierarchy and alignment consistency.

**Architectural Decisions:**
- **Persistent Gridlines:** Switched from `border-top` to `box-shadow: inset 0 1px 0` for table headers. This ensures the structural "gridline" remains visible during scrolling and doesn't get swallowed by the container edges.
- **Centered UI Alignment:** Standardized `vertical-align: middle` for the Order and Info columns. This ensures that movement buttons and duration pills remain vertically centered within their rows regardless of text wrapping in the Title column.
- **Desktop Row Integrity:** Enforced `flex-wrap: nowrap` and a fixed `200px` width for the Order column to prevent movement buttons from splitting into two rows on standard displays.

**Code Changed:**
- `styles/editor.css`: Implemented inset shadows for headers, balanced vertical padding, and locked the Order column width.
- `src/ui/builder.js`: Refined cell templates to use `vertical-align: middle` and enforced nowrap flex behavior for control groups.

**Lessons Learned:**
- Table borders can be temperamental when combined with sticky headers or custom scroll containers; inset box-shadows provide a much more resilient "Jobsian" gridline effect.

**Next Steps for Next Session:**
- Audit the "All" tab in the Link modal to ensure mixed category labels maintain consistent spacing.
- Check the mobile card view to ensure the wider Order column doesn't cause horizontal overflow issues.

---

## [2026-04-21] - Session [02]
**Goal:** Enforce `hold_json` timing synchronization and implement hot-reloading for the active Pose Player.

**Architectural Decisions:**
- **Unified Timing Schema:** Standardized on `hold_json` (standard, short, long, flow) as the absolute source of truth across the Data Adapter, Asana Editor, and Browse UI.
- **Hot-Reloading UI:** Enabled reactive updates. Saving an asana now automatically refreshes the Browse Detail view and, if a sequence is active, re-scales the playback list and refreshes the current pose's timing and metadata.
- **Cache Integrity:** Hardened the editor save path to synchronize the local `window.asanaLibrary` cache immediately, preventing "split-brain" states where the DB was updated but the UI reflected stale memory.

**Code Changed:**
- `src/services/dataAdapter.js`: Hardened `normalizeAsana` and `normalizeStageRow` to prioritize JSON objects.
- `src/ui/asanaEditor.js`: Refactored save logic to write to `hold_json` and added UI/Player refresh triggers.
- `src/ui/browse.js`: Updated `showAsanaDetail` to prioritize `hold_json` for range labels and stage displays.
- `src/ui/posePlayer.js`: Standardized duration resolution to use `hold_json`.

**Next Steps for Next Session:**
- Audit `src/playback/timer.js` to ensure no legacy text-parsing logic remains in the core loop.
---

## [2026-04-21] - Session [03]
**Goal:** Implement pose-level notes with high-fidelity PDF export and Jobsian visibility logic.

**Architectural Decisions:**
- **Dual-Element Rendering:** Implemented a pattern using an `input` for Edit Mode and a `span` for View/PDF Mode. This ensures that PDF capture engines (which often miss dynamic input values) reliably grab the text content from the DOM.
- **Reactive Label Logic:** Used a conditional re-render path in `builder.js` to ensure the "Note:" prefix is surgically hidden when a note is `NULL` or cleared, maintaining a clean practice sheet.
- **PDF Reconstruction Hardening:** Updated the `createExportSnapshot` in `builderUI.js` to manually reconstruct note blocks during the snapshot process, bypassing the fragility of the live modal layout.
- **Spatial Constraints:** Enforced a 100-character limit and `overflow-wrap: break-word` to protect the 200px Order column and prevent horizontal layout drift on mobile.

**Code Changed:**
- `src/ui/builderTemplates.js`: Created `generatePoseNoteInputHTML` with baseline alignment and Jobsian labels.
- `src/ui/builder.js`: Integrated the note field and wired reactive re-renders to the `onchange` event.
- `src/ui/builderUI.js`: Hardened the PDF export loop to explicitly render pose notes.
- `styles/editor.css`: Added toggling logic for `view-only-inline` and `edit-only-inline` classes.

**Lessons Learned:**
- `html2canvas` and similar capture tools are significantly more reliable when reading from static text nodes (`span`/`div`) than from `input` values. Always mirror form data to the DOM before snapshotting for export.

**Next Steps for Next Session:**
- **Phase 3:** Integrate these notes into the Pose Player (Navigator and Focus modes) so cues are visible during active practice.
---

## [2026-04-21] - Session [04]
**Goal:** Finalize Category Schema Standardization and clean up Editor legacy logic.

**Architectural Decisions:**
- **Schema Alignment:** Synchronized the UI with the new `asana_categories` standardization. Purged all logic that manually stripped numeric prefixes (e.g., `01_`) or underscores, as these are now handled at the source.
- **Helper Consolidation:** Pointed `asanaEditor.js` to the unified `formatCategory` utility in `format.js`, ensuring a single point of failure for category display logic.
- **Database Integrity:** Confirmed `category_id` mapping to the 1-12 range via `getOrCreateAsanaCategoryId` call-site.

**Code Changed:**
- `src/ui/asanaEditor.js`: Removed redundant regex logic in `getDisplayCategory` and fixed missing helper reference in the save path.

**Next Steps for Next Session:**
- **Phase 3:** Proceed with rendering pose-level notes in the Pose Player practice screen.
---

## [2026-04-21] - Session [05]
**Goal:** Implement Phase 3: Player Rendering for pose-level notes in Navigator and Focus modes.

**Architectural Decisions:**
- **Navigator Hierarchy:** Integrated pose-level notes into the technical stack below Description and Technique. Enforced "Default Open" state for the notes accordion to ensure remedial cues are prominent.
- **Sequential Audio Cues:** Appended pose notes to the `speakText` queue. Logic ensures notes are announced last, following variations and props, to maintain a logical instructional flow in Focus Mode.

**Code Changed:**
- `src/ui/wiring.js`: Added `poseNoteBody` and `poseNoteDetails` to the global reset manifest and enforced default open state.

## [2026-04-21] - Session [06]
**Goal:** Implement specialized note handling for Linked Sequences (Macros).

**Architectural Decisions:**
- **Introductory Cue Priority:** Macros now play their associated note exactly once at the boundary ("Starting linked flow..."). This converts the note field for Macros into an instructional preamble for the entire sequence block.
- **Intra-Macro Suppression:** Suppressed pose-level note speech for all poses contained within a Macro. This prevents auditory clutter during repetitive flows while preserving the Navigator's ability to show the current context.
- **Contextual Note Expansion:** Updated the expansion engine to propagate Macro notes into every constituent pose. This ensures that the instructional context remains visible in the Navigator throughout the linked sequence while the audio engine handles the one-time delivery logic.
- **Data Integrity:** Hardened `builder.js` to ensure Macro notes are persisted in `sequence_json` and protected from auto-generated text collisions when rounds are adjusted.

**Code Changed:**
- `src/services/sequenceEngine.js`: Implemented note propagation during Macro expansion.
- `src/ui/builder.js`: Updated compilation and event listeners for Macro notes.
- `src/playback/timerEvents.js`: Integrated boundary audio queuing and intra-macro speech suppression.

**Lessons Learned:**
- **Communication works well when:** Breaking implementations into distinct architectural phases (UI Skeleton -> Logic -> Viewer) allows for easier pinpointing of regressions. Providing a "Single Brain" context (centralized logic) reduces the risk of "Shadow Logic" creeping into UI files.
- **What doesn't work:** Over-relying on live DOM state for background logic (like PDF exports or Resume prompts). Hidden overlays (like the Safety Briefing) act as gatekeepers; logic must explicitly account for these UI states to avoid "locked" content.
---

## [2026-04-21] - Session [07]
**Goal:** Architectural polish, BEM refactoring, and resolution of Navigator visibility race conditions.

**Architectural Decisions:**
- **BEM Transition:** Refactored Pose Player title construction and instructional stack into BEM-compliant structures. Switched from inline string-soup to a structured array-join pattern for titles, simplifying modifiers like `__side`, `__variation`, and `__prop`.
- **Navigator Gatekeeper Fix:** Standardized `handleNext` and `handleStart` callbacks to re-trigger `setPose` after briefing dismissal. This resolves the bug where meta-panels (Technique/Note) remained hidden upon resuming a session.
- **Clean Code Cleanup:** Trimmed redundant logic in `posePlayer.js` variation matching and synchronized state caching for `window.currentActualNote` to ensure timer-event audio reliability.

**Code Changed:**
- `src/ui/posePlayer.js`: Refactored `setPose` title construction and briefing dismissal logic.
- `src/ui/renderers.js`: Finalized BEM accordion classes for the instructional stack.
- `src/playback/timerEvents.js`: Hardened macro note suppression logic.

**Next Steps for Next Session:**
- Session Complete. The pose-level note system is fully integrated across Builder, PDF Export, and Practice Player.
---

## [2026-04-22] - Session [01]
**Goal:** Finalize High-Fidelity PDF Metadata Headers and stabilize capture layout.

**Architectural Decisions:**
- **Targeted Slot-Filling:** Abandoned "Blind Prepending" in favor of a slot-based injection. This ensures metadata is part of the first-class DOM before the capture engine initializes.
- **Header Targeting Fix:** Explicitly injected the meta-header into `#viewModeHeader`. This ensures the metadata is contained within a selector that the `manualExportPdf` engine is programmed to capture.
- **Rounding Protocol:** Implemented `Math.ceil` for total practice duration. This ensures the PDF aligns with the "Jobsian" principle of providing a realistic time commitment (rounding up to the next minute).

**Code Changed:**
- `src/ui/builderTemplates.js`: Added `generateExportHeaderHTML` to provide standardized slots for Date and Duration.
- `src/ui/builderUI.js`: Refactored `createExportSnapshot` to fill slots and calculate duration using the strict 8-index schema.

**Lessons Learned & Efficiency Audit:**
- **The "Ghost Element" Bug:** Dynamic manipulation of a cloned DOM often fails if the capture engine (html2canvas) triggers before layout stabilization. 
- **AI Visibility Gap:** Coding assistants lack visibility into the *execution order* of external libraries. Providing a "Capture Manifest" (a list of what the PDF engine actually captures) would have reduced a 45-minute task to 5 minutes.

**Next Steps / Improvement Proposals:**
- **Resource Refactor:** Create a `PDF_CAPTURE_MAP.md` that lists every selector the export engine targets.
- **Code Refactor:** Move the 8-index array mapping into a central utility (e.g., `prepareSequenceForTiming`) to avoid duplicating this logic in the Builder and the PDF Snapshot.
---

## [2026-04-22] - Session [02]
**Goal:** Refine Progress Summary UI for Linked Sequences (Macros).

**Architectural Decisions:**
- Implemented specific handling for `MACRO:` identifiers in Progress Summary to differentiate from standard asanas.
- Replaced generic numeric IDs for linked sequences with a specialized "Sequence link ID" badge.
- Modified subtitle logic for linked sequences to display "Starting with [First Asana] ([Variation])" instead of the last pose from the cycle.
- Ensured correct resolution of the first asana and its variation within a linked sequence by looking up the sub-sequence in `window.courses`.
- Added fallbacks for linked sequences to display "Linked Sequence" if the first pose cannot be resolved.

**Code Changed:**
- `src/ui/progressSummaryUI.js`: Modified `renderProgressSummaryModal` to correctly display linked sequence information, including specialized ID badges and contextual subtitles.

**Next Steps for Next Session:**
- Audit `styles/editor.css` for `summary-id-badge` to ensure it handles longer "Sequence link ID" text gracefully.
- Verify if the sequence unrolling engine in `sequenceEngine.js` needs to be updated to explicitly include `macroId` in the metadata.
---

## [2026-04-24] - Session [01]
**Goal:** Refactor Asana Editor write-path, harden Pose Injection Protocol with relational JSON support, and fix audio path resolution.

**Architectural Decisions:**
- **Asana Editor Rewrite:** Replaced the legacy `wireEditorSave` closure with a globally-exposed `window.setupAsanaEditorSave` pattern. This decouples the save button wiring from the DOMContentLoaded race condition, ensuring the editor works reliably regardless of module load order.
- **Relational Injection Schema:** Migrated `preparatory_pose_id` and `recovery_pose_id` from legacy string format (e.g., `"020II"`) to a JSON object format `{ asana_id, stage_id }`. This enables precise stage-level injection targeting without heuristic string parsing.
- **Injection Engine Overhaul:** Refactored `getExpandedPoses` in `sequenceEngine.js` to accept the new relational JSON objects. The engine now resolves stage-level injections via `stageId` lookup in the variations map, falling back to legacy string parsing for backward compatibility.
- **Audio Path Hardening:** Introduced `joinPath()` utility in `audioEngine.js` to prevent double-slash path concatenation. Updated all audio URL construction points (side cues, main audio, variation audio, bridge files) to use this safe joiner.
- **Pose Player Bracket Fix:** Moved bracket stripping logic in `posePlayer.js` to a unified post-processing step after all note resolution paths, ensuring variation titles are consistently extracted and brackets removed regardless of note source (JSON or legacy).
- **Global Engine Exposure:** Added `window.playbackEngine = playbackEngine` early in `app.js` to resolve static import ordering issues where `asanaEditor.js` needed access to the playback engine at module load time.

**Code Changed:**
- `src/ui/asanaEditor.js`: Complete rewrite of save logic; switched to `window.setupAsanaEditorSave` pattern; added `buildInjectionPayload` for relational JSON; added search buttons for Prep/Recovery fields in `index.html`.
- `src/services/sequenceEngine.js`: Refactored `getExpandedPoses` to accept relational injection objects; added `addInjectionTarget` helper; updated `createInjectedPose` to resolve stage-level variations via `stageId`.
- `src/playback/audioEngine.js`: Added `joinPath()` utility; updated all audio URL constructions to prevent double-slash bugs.
- `src/playback/timerEvents.js`: Updated `onStart` to use `currentPose[6]` (Label) as the spoken name for injected poses.
- `src/ui/posePlayer.js`: Unified bracket stripping logic into a single post-processing step after all note resolution paths.
- `app.js`: Added early `window.playbackEngine` assignment to resolve import ordering.
- `index.html`: Added search buttons for Prep/Recovery pose fields in Asana Editor; updated row search close handler.
- `docs/ARCHITECTURE.md`: Documented the Pose Injection Protocol and Transition/Padding Logic.

**Next Steps for Next Session:**
- Verify that the new relational injection JSON format is correctly persisted and read back from the database.
- Audit the Asana Editor to ensure stage-level Prep/Recovery fields also use the search button pattern.

---

## [2026-04-24] - Session [02]
**Goal:** Fix admin user (mark.opie@gmail.com) unable to save edits to system courses in Supabase.

**Architectural Decisions:**
- **Admin Override Flag:** Added an `isAdminOverride` parameter (3rd argument) to `saveSequence()` in `persistence.js`. When `true`, the `user_id` ownership filter is bypassed on update queries, allowing admin users to edit system courses regardless of the database owner.
- **Minimal Surface Area:** The fix required only two lines of code — one in `persistence.js` to accept and apply the override, and one in `builder.js` to pass `isAdmin()` as the override flag. This preserves the existing RLS security model for non-admin users.

**Code Changed:**
- `src/services/persistence.js`: Added `isAdminOverride` parameter to `saveSequence()`; conditionally skips `.eq('user_id', payload.user_id)` filter on update queries when override is active.
- `src/ui/builder.js`: Updated `saveSequence()` call in `builderSave()` to pass `isAdmin()` as the 3rd argument.

**Lessons Learned:**
- The "saved successfully" alert was misleading because the Supabase update query matched 0 rows (due to `user_id` mismatch) but did not throw an error. Always verify row-level effects when debugging silent save failures.
- System courses in the database have `user_id = null` or a different UUID than the admin's `currentUserId`, causing the ownership filter to silently skip the update.

---

## [2026-04-25] - Session [01]
**Goal:** Merge "Add Stage" and "Clone from Base" buttons into a single smart button; implement audio fallback via speakText when audio_url is empty.

**Architectural Decisions:**
- **Single Button Pattern:** Removed the separate `#cloneFromBaseBtn` and consolidated its logic into `#addStageBtn`. The single button now calls `window.createStageFromAsana()` which auto-fills the new stage row with:
  - **stage_name**: Auto-increments Roman numeral (I, II, III...) based on existing stages. Handles prefixes like "KI", "KII" by preserving the prefix and incrementing the RN. If no stages exist, starts at "I".
  - **full_technique**: Copies from the asana's technique field in the editor
  - **image_url**: Copies from the asana library object
  - **hold_json**: Copies from the asana editor's hold time inputs (Standard/Short/Long)
  - **sort_order**: Set to the count of existing stages (maintains display order)
  - **title**: Left empty for the user to fill in
- **Stage Hold Inputs:** Added Standard/Short/Long number inputs to each stage row in `addStageToEditor()`, matching the pattern from the asana editor's hold time section. The save logic now persists `hold_json` for each stage.
- **Audio Fallback Protocol:** Modified `playPoseMainAudio()` in `audioEngine.js` to use `speakText()` when no audio file is available:
  - For asanas: speaks `asana.english_name || asana.name`
  - For stages/variations: speaks `v.title || variationKey`
  - Bridge audio is skipped when there's no variation audio file (since we're speaking instead)
- **Documentation Cleanup:** Updated `docs/AGENT.md` and `docs/ARCHITECTURE.md` to remove outdated examples referencing "WALL", "BENT", "Back against the wall" etc., replacing them with current data patterns like "I", "II", "KI", "KII", "On a bolster", "Forward Bend".

**Code Changed:**
- `index.html`: Removed `#cloneFromBaseBtn` wrapper div; kept only `#addStageBtn`
- `src/ui/asanaEditor.js`: Added `toRoman()`, `fromRoman()`, `getNextStageName()`, `createStageFromAsana()`, `buildStageHoldJson()`; enhanced `addStageToEditor()` with hold time inputs; updated `setupAsanaEditorSave()` to persist `hold_json`, `sort_order`; wired `#addStageBtn` to `createStageFromAsana`
- `src/playback/audioEngine.js`: Added `speakText()` fallback in `playPoseMainAudio()` for both asana main audio and variation audio when `audio_url` is empty
- `docs/AGENT.md`: Updated stage_name/title examples to reflect current data
- `docs/ARCHITECTURE.md`: Updated stage_name/title column descriptions

**Lessons Learned:**
- Roman numeral parsing/incrementing needs to handle edge cases like suffixes ("Ia", "IIb") and prefixes ("KI", "KII"). The regex `^([A-Za-z]*)([IVXLCDM]+)([a-z]?)$` handles this by capturing prefix, RN, and suffix separately.
- When adding audio fallback, the bridge step should be skipped when there's no variation audio file — otherwise the bridge plays but then nothing follows it, creating an awkward silence.
- Documentation drift happens quickly when schema examples are hardcoded in docs. The "WALL" and "BENT" examples were from an older schema design and no longer reflect actual data.

**Next Steps for Next Session:**
- Verify that the new stage creation flow works end-to-end in the live app (create stage → edit fields → save → reload)
- Audit any remaining references to `stage_name` examples like "WALL" or "BENT" in other docs or code comments
- Consider adding a "Delete Stage" confirmation dialog to prevent accidental removal

---

## [2026-04-25] - Session [02]
**Goal:** Fix 400 error when saving stages (column name mismatch), resolve Chrome aria-hidden warning, populate Category/Intensity fields in Asana Editor, and remove unused Plate/Page fields.

**Architectural Decisions:**
- **Column Rename Migration:** Created a migration to rename `recover_pose_id` → `recovery_pose_id` in the `stages` table, matching the payload sent by the save handler. Removed all `recover_pose_id` fallback logic from the data adapter and sequence engine since the column will now match.
- **aria-hidden Removal:** Removed `aria-hidden="true"` from all three modal backdrops (`asanaEditorBackdrop`, `browseBackdrop`, `historyBackdrop`). The `role="dialog"` + `aria-modal="true"` pattern on the inner modal divs is the correct ARIA pattern — it tells assistive tech to ignore content outside the dialog without needing `aria-hidden` on the backdrop, which conflicts with focused elements inside the modal.
- **Category Select Hydration:** Added `populateCategorySelect()` which fetches categories from the `asana_categories` table on first editor open. The editor now selects the matching option, or shows a custom text input for categories not yet in the database.
- **Intensity Field Wiring:** The Intensity field now reads from `asana.intensity` on open and persists to the database on save. Added a ⓘ tooltip explaining "Light on Yoga pose number — lower numbers are less difficult".
- **Field Cleanup:** Removed `plate_numbers`, `page_2001`, and `page_2015` fields from the editor UI as they are not used anywhere in the app.

**Code Changed:**
- `supabase/migrations/20260425000002_rename_recover_pose_id_to_recovery_pose_id.sql`: New migration to rename column
- `src/services/sequenceEngine.js`: Removed `recover_pose_id` fallback lookups
- `src/services/dataAdapter.js`: Removed `recover_pose_id` fallback in `normalizeAsana` and `normalizeStageRow`
- `src/ui/asanaEditor.js`: Removed `recover_pose_id` fallback in stage template; added `populateCategorySelect()`; wired category and intensity in `openAsanaEditor()` and save handler
- `index.html`: Removed `aria-hidden` from all three backdrops; removed Plate Numbers, Page 2001, Page 2015 fields; added ⓘ tooltip to Intensity label
- `docs/KEYS.md`: Updated to reflect actual live schema for `stages` and `courses` tables

**Lessons Learned:**
- PostgREST returns a 400 when a column in the upsert payload doesn't exist in the table. The `recover_pose_id` vs `recovery_pose_id` mismatch was silently failing because the column name in the migration had a typo.
- `aria-hidden="true"` on a backdrop that wraps a modal with focusable elements triggers Chrome's accessibility warning. The fix is to remove `aria-hidden` entirely — `aria-modal="true"` on the dialog element is sufficient.
- The category select in the Asana Editor was defined in HTML but never populated from the database. Any module that renders a `<select>` backed by a DB table needs an explicit fetch-and-populate step.

---

## [2026-04-25] - Session [03]
**Goal:** Fix 400 error when saving category — the `asanas` table uses `category_id` (FK to `asana_categories`), not a `category` text column.

**Architectural Decisions:**
- **category_id Resolution:** The save handler now calls `getOrCreateAsanaCategoryId(categoryName)` to resolve the selected category name to its numeric ID before upserting. This function (already in `persistence.js`) looks up or creates the row in `asana_categories` and returns the ID.
- **Payload Correction:** Changed the upsert payload from `category: "string"` to `category_id: <number>`, matching the actual database schema.
- **Documentation Sync:** Updated `docs/KEYS.md` to reflect that `asanas` uses `category_id` (FK) rather than a `category` text column, and removed references to the defunct `plate_numbers`, `page_2001`, `page_2015` columns.

**Code Changed:**
- `src/ui/asanaEditor.js`: Added import of `getOrCreateAsanaCategoryId` from `persistence.js`; save handler now resolves category name to ID and sends `category_id`
- `docs/KEYS.md`: Updated `asanas` column list to match live schema (removed `plate_numbers`, `page_2001`, `page_2015`, `category`; added `category_id` with FK note)

**Lessons Learned:**
- The `asanas` table migrated from a `category` text column to a `category_id` FK referencing `asana_categories(id)` at some point, but the Asana Editor was never updated to match. Always verify the actual database schema (via migrations or Supabase dashboard) rather than assuming the UI's mental model is correct.
- `getOrCreateAsanaCategoryId` already existed in `persistence.js` for the course builder's category handling, but the Asana Editor was writing directly to a non-existent `category` column. Reusing existing helpers prevents duplicate logic.

---

## [2026-04-25] - Session [04]
**Goal:** Audit and inject missing intensity values into the `asanas` table from backup data.

**Architectural Decisions:**
- **Name-Based Matching:** Used normalized name matching (lowercase, trimmed) to cross-reference backup data with DB rows, since IDs may not align between the backup and live database.
- **Fuzzy Match Correction:** Detected and corrected a false positive where "Setu Bandhasana Sarvangasana" (098) was incorrectly matched to "Setu Bandhasana" (intensity 14) instead of "Setu Bandha Sarvangasana" (intensity 10). The fuzzy match was too aggressive — corrected with an explicit override.
- **Non-Asana Handling:** Pranayama, meditation, bandha, and mudra poses not in the backup data were assigned `-` (not applicable), consistent with existing pranayama entries. Simple seated poses (Sukhasana, Paschima Namaskarasana, Pavanamuktasana) were assigned intensity `1`, and Viparita Karani was assigned `2`.

**Code Changed:**
- `scripts/update_intensity.js`: Script to match backup data by name and inject intensity values (20 rows updated)
- `scripts/fix_remaining_intensity.js`: Script to correct fuzzy match error and handle remaining 9 rows not in backup data

**Results:**
- 237 total asanas in database
- 29 rows had NULL/empty intensity before the audit
- 20 rows injected from backup data (matched by name)
- 9 rows handled manually (pranayama/bandha/meditation → `-`, seated poses → `1`, Viparita Karani → `2`)
- 1 fuzzy match corrected (Setu Bandhasana Sarvangasana: 14 → 10)
- **Final: 0 NULL/empty intensity rows remaining**

**Lessons Learned:**
- Fuzzy name matching is dangerous when names share common substrings (e.g., "Setu Bandhasana" vs "Setu Bandhasana Sarvangasana"). Always verify fuzzy matches or use exact matching with explicit overrides for edge cases.
- The `intensity` column is stored as TEXT, not numeric, so values like `-` and `Low`/`Medium` are valid alongside numeric values. This means the column serves dual purpose — numeric difficulty ratings for asanas and categorical labels for non-asanas.

---

## [2026-04-25] - Session [05]
**Goal:** Fix blank Intensity field in Asana Editor — intensity values exist in DB but don't appear in the editor UI.

**Architectural Decisions:**
- **Data Adapter Gap:** The `normalizeAsana()` function in `dataAdapter.js` was not mapping the `intensity` column from the database row into the normalized asana object. This meant `window.asanaLibrary` (the in-memory cache) never contained intensity data, even though the DB had it.
- **Redundant Expression Bug:** The editor's intensity population line had `asana?.intensity || asana?.intensity || ""` — the same fallback repeated twice, so if the first `asana?.intensity` was `undefined`, the second identical expression also returned `undefined`, falling through to `""`.

**Code Changed:**
- `src/services/dataAdapter.js`: Added `intensity: row.intensity ?? existingData.intensity ?? ''` to the `normalizeAsana()` output object
- `src/ui/asanaEditor.js`: Fixed redundant expression `asana?.intensity || asana?.intensity || ""` → `asana?.intensity || ""`

**Lessons Learned:**
- When a DB column is added or populated after the data adapter was written, the adapter's normalization function must be updated to include the new field. The `window.asanaLibrary` cache is only as complete as the `normalizeAsana()` output object.
- Redundant fallback expressions (`a || a || ""`) are a code smell — they indicate a copy-paste error where the second term was meant to be a different fallback source but never got updated.

---

## [2026-04-25] - Session [06]
**Goal:** Replace LOY/MEHTA batch entry logic with GEM plate support in the Sequence Builder.

**Architectural Decisions:**
- **GEM Plate Field:** The new `gem_plate` column in the `asanas` table stores comma-separated GEM index numbers (e.g., "113,114") that map to our internal asana IDs. This allows multiple GEM IDs to reference the same asana.
- **Scoring Replacement:** Removed `yoga_the_iyengar_way_id` and `page_primary` from the builder search scoring. Replaced with `gem_plate` lookup — when a user types a number, it checks if that number appears in the comma-separated `gem_plate` list (score 90, just below exact ID match at 100).
- **Batch Command Migration:** Replaced `LOY:` and `MEHTA:` shorthand prefixes with `GEM:`. The parser now looks up tokens against the `gem_plate` field across all asanas. If multiple GEM IDs map to the same asana (e.g., "113,114" both map to our id 105), entering either one adds our asana once.
- **Data Adapter Hygiene:** Added `gem_plate` to the normalized asana object in `dataAdapter.js`. Removed `yoga_the_iyengar_way_id` from the normalized output since it's no longer needed.

**Code Changed:**
- `src/ui/builderSearch.js`: Replaced `yoga_the_iyengar_way_id`/`page_primary` scoring with `gem_plate` scoring; replaced `LOY:`/`MEHTA:` batch detection with `GEM:`
- `src/utils/builderParser.js`: Replaced LOY/MEHTA batch parsing with GEM plate lookup logic; tokens now filter `libraryArray` by `gem_plate` field
- `src/services/dataAdapter.js`: Added `gem_plate` to normalized asana object; removed `yoga_the_iyengar_way_id`

**Next Steps for Next Session:**
- Verify GEM batch commands work end-to-end in the live builder (e.g., `GEM:113` adds our id 105)
- Populate `gem_plate` values in the database for asanas that have GEM index numbers
- Consider adding `gem_plate` to the Asana Editor UI for easy data entry
