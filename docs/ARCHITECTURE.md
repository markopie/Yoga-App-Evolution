# Application Architecture

## Database Schema (Row Level Security)
- **Unified Global Tables** (`asanas`, `courses`, `stages`, `sequence_completions`): 
  - `asanas`, `courses`, `stages` are public read-mostly, but users can upsert directly into them.
  - Custom user sequences/poses are stored globally alongside official data (leveraging unique constraints).
  - `sequence_completions`: Private; access restricted to `auth.uid() = user_id`.

## Data Flow
- **Supabase**: The source of truth for 4 core tables (`asanas`, `stages`, `courses`, `sequence_completions`).
- **dataAdapter.js**: Acts as the adapter pattern, fetching data from Supabase and normalizing it into the standard JSON objects the front-end app expects. It explicitly maps database columns like `english_name` and `audio_url` to UI-friendly properties like `english` and `audio`.
- **app.js**: The main UI controller. It relies heavily on `window.asanaLibrary` (populated by the dataAdapter) and uses specific keys (`asana.name`, `asana.english`, `asana.iast`) to render UI text and logic. 

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

## Scripts & Tooling
- **Utilities**: Located in `/scripts/`, providing Python-based management for backups and data prototyping. (See `docs/DEVELOPMENT.md` for usage).