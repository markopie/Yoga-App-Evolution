# Application Architecture

## Database Schema (Row Level Security)
- **Unified Global Tables** (`asanas`, `courses`, `stages`, `sequence_completions`): 
  - `asanas`, `courses`, `stages` are public read-mostly, but users can upsert directly into them.
  - Custom user sequences/poses are stored globally alongside official data (leveraging unique constraints).
  - `sequence_completions`: Private; access restricted to `auth.uid() = user_id`.

## Data Flow
- **Supabase**: The source of truth for 4 core tables (`asanas`, `stages`, `courses`, `sequence_completions`).
- **dataAdapter.js**: Acts as the adapter pattern, fetching data from Supabase and normalizing it into the standard JSON objects the front-end app expects. It maps database columns to UI-friendly properties:
  - `english_name` → `english`, `audio_url` → `audio`, `image_url` → `image_url`
  - `category` → `category` (raw DB value, e.g. `01_Standing_and_Basic`; UI strips prefix for display)
  - `description` → `description`
  - Hold times: stored in `hold_json` (object with `standard`, `short`, `long` keys). The string `hold` column is the source string; `hold_json` is the parsed form. **All timing logic reads from `hold_json`, not `hold_data`.**
- **app.js**: The main UI controller. It relies on `window.asanaLibrary` (populated by dataAdapter) and uses `asana.hold_json.standard` (not `hold_data`) for timing. `getEffectiveTime()` is the canonical source for all duration calculations.

## Audio System
- The audio engine (`playPoseMainAudio` in `app.js`) currently looks for audio files primarily by matching IDs to a predefined manifest (`window.serverAudioFiles`), then falling back to legacy guessing (e.g., `001_Name.mp3`).
- **Mismatch Identified**: The backend schema allows an `audio_url` field, and the dataAdapter maps it to `asana.audio`, but `app.js` was historically not checking the object directly for this property before building the URL.

## "Pose" Fallback Text
- `app.js` uses `displayName(asana)` to attempt to extract a name.
- If `asana` is completely `null` (e.g., ID not found in library), or if all mapped name properties are empty strings, `setPose` falls back to the literal string `"Pose"`. 
- The text `"Pose #"` as a single literal string is *not* present in the codebase. However, `Pose ${originalRowIndex + 1}` concepts or a combination of `"Pose"` + UI counters (e.g., `focusCounter`) create the visual representation of "Pose #X".

## Course and Sequence Parsing
- The global `courses` table stores all sequences (both system and user-defined) using a `sequence_text` column.
- The `sequence_text` format uses `\n` for line breaks (each line is a pose) and `|` to separate fields within that pose (e.g., `176 | 600 | [Sirsasana (10 min)]`).
- Sequence names are consistently pulled from the `title` property, which correctly aligns with the UI (`sequence.title`).
- The parsing logic is encapsulated in `src/utils/parsing.js` and loaded dynamically into the UI sequence menus via `dataAdapter.js`'s `fetchCourses()` function.

## UI State & Resume Logic
- The `showResumePrompt` correctly accesses the active sequence via the `title` property (i.e. `sequences[state.sequenceIdx].title`), which aligns with the database's `title` column.
- To prevent unnecessary prompts for users who simply opened a sequence without starting it, the resume logic requires `state.poseIdx > 0` before triggering the banner.

## Dynamic Pose Injection (Preparatory & Recovery Poses)
- `getExpandedPoses()` in `app.js` is the canonical expansion engine. It:
  1. Unpacks MACRO references (sub-sequences)
  2. Unrolls LOOP_START/LOOP_END repeat blocks
  3. Injects preparatory and recovery poses from `asana.preparatory_pose_id` / `asana.recovery_pose_id`
- Injected poses use `hold_json.standard` for their duration.
- The Sequence Builder displays `⚡ +Prep` and `💚 +Recovery` badges showing injected pose name + duration.
- Builder footer shows both **authored time** and **runtime estimate** (incl. injections).

## Browse & Asana Editor
- **Category**: stored as `01_Standing_and_Basic` in the DB; displayed as `Standing and Basic` everywhere in the UI (prefix stripped). The editor uses a `<select>` for existing categories, with a "+ Add new" option revealing a text input.
- **IAST Toggle**: Browse sidebar has a "Show IAST" button that switches list titles between English and Sanskrit/IAST. The main sequence player uses `prefersIAST()` from `src/utils/format.js`.
- **ID Search**: Browse accepts `1`, `01`, or `001` — all match asana `001`.

## Timing & Completion Gate
- `getEffectiveTime(id, dur)` returns the canonical duration for any pose: checks `hold_json.standard` from the library, doubles if `requiresSides`, falls back to stored sequence `dur`.
- `calculateTotalSequenceTime(seq)` sums `getExpandedPoses()` results via `getEffectiveTime`.
- The **90% completion gate** in `triggerSequenceEnd()` compares `playbackEngine.totalFocusSeconds` to `calculateTotalSequenceTime`. It skips entirely if `totalFocusSeconds === 0` (timer never started).
- Timer pill shows `remaining / total` where total comes from `calculateTotalSequenceTime`.

## Scripts & Tooling
- **Utilities**: Located in `/scripts/`, providing Python-based management for backups and data prototyping. (See `docs/DEVELOPMENT.md` for usage).