# Application Architecture

## Database Schema (Row Level Security)

### `asanas` — Pose Library
Public SELECT. Admin writes via SQL editor or the Edit Asana UI (requires Google login).

| Column | Type | Notes |
|---|---|---|
| `id` | text | 3-digit zero-padded string (`"003"`) |
| `name` | text | Sanskrit name |
| `iast` | text | IAST transliteration |
| `english_name` | text | English name |
| `technique` | text | Full pose instructions |
| `description` | text | Summary / effects |
| `category` | text | Prefixed: `01_Standing_and_Basic` → displayed as `Standing and Basic` |
| `plate_numbers` | text | `Final: 274, 275 \| Int: 272, 273` |
| `hold` | text | `Standard: 0:30 \| Short: 0:15 \| Long: 1:00` |
| `hold_json` | jsonb | `{standard, short, long}` in seconds — **all timing logic reads from here** |
| `page_2001` | bigint | Mehta 2001 edition page |
| `page_2015` | bigint | Mehta 2015 edition page |
| `page_primary` | numeric(6,2) | Canonical page key (e.g. `56.1` disambiguates shared pages) |
| `requires_sides` | boolean | Doubles hold time in playback |
| `preparatory_pose_id` | text | Auto-injected before this pose |
| `recovery_pose_id` | text | Auto-injected after this pose |
| `audio_url` | text | Supabase storage URL |
| `image_url` | text | Supabase storage URL |
| `devanagari`, `translation`, `oracle_lore`, `symbol_prompt` | text | Enrichment fields |
| `yoga_the_iyengar_way_id`, `how_to_use_yoga_id` | text | Book cross-references |
| `is_system` | boolean | True = official library |
| `is_curated` | boolean | True = fully reviewed |
| `intensity` | text | Numeric string `"5"` |
| `user_id` | uuid | Owner (null for system) |

### `stages` — Pose Variations
Public SELECT. Admin writes via scripts or the Add Stage UI.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | Auto-increment |
| `asana_id` | text | Parent asana ID (e.g. `"003"`) |
| `stage_name` | text | `"I"`, `"II"`, `"WALL"`, `"BENT"` etc. |
| `title` | text | Display name e.g. `"Back against the wall"` |
| `full_technique` | text | Variation-specific instructions |
| `shorthand` | text | Brief cue |
| `hold` | text | Override hold string |
| `page_primary` | numeric(6,2) | Mehta page lookup key |
| `audio_url` | text | Audio MP3 URL |
| `audio_title` | text | Label for the audio cue |
| `image_url` | text | Supabase storage URL |
| `devanagari`, `translation`, `oracle_lore`, `symbol_prompt` | text | Enrichment |
| `preparatory_pose_id`, `recover_pose_id` | text | Override injection |
| `is_curated` | boolean | Fully reviewed |
| `user_id` | uuid | Owner (null for system) |

### `courses` — Sequences (System + User)
RLS enforced:
- Anon SELECT: `is_system = true` rows only
- Auth SELECT: `is_system = true` OR `user_id = auth.uid()`
- INSERT/UPDATE/DELETE: own rows (`user_id = auth.uid()`)
- Admin: Save → confirm "Promote to published?" → sets `is_system = true`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | Auto-increment |
| `title` | text | Sequence name |
| `category` | text | e.g. `"Course 1"`, `"Flow"` |
| `sequence_text` | text | `\n`-separated lines, `\|` separated fields per pose |
| `user_id` | uuid | Creator; NULL on legacy rows |
| `is_system` | boolean | True = visible to all users |

### `sequence_completions` — Practice History
Private: `auth.uid() = user_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | Owner |
| `title` | text | Sequence title at time of completion |
| `category` | text | |
| `completed_at` | timestamptz | |
| `duration_seconds` | integer | Actual practice duration |
| `rating` | smallint | 1–5 (RPE); NULL treated as 3 |
| `status` | text | `"completed"`, `"partial"` etc. |
| `notes` | text | |

### `user_sequences` — (Legacy/Unused in current code)
Kept in DB but not queried by the app. Sequences saved to `courses` instead.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | |
| `title`, `category` | text | |
| `pose_count` | integer | |
| `total_seconds` | integer | |

### `user_asanas`, `user_stages` — (Legacy User Copy Tables)
Exist in DB but not actively queried by the app (data merged into `asanas`/`stages`).
Key columns mirror `asanas`/`stages`.

### `enrollments` — Program Enrollment
Not yet integrated with the main app UI.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | |
| `enrolled_at` | timestamptz | |
| `last_lesson_completed` | integer | |

### `program_curriculum` — Curriculum Structure
Data collection only — not integrated with current app code.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | |
| `sequence_id` | bigint | FK to courses |
| `curriculum_slug` | text | |
| `week_number` | integer | |
| `day_number` | integer | |
| `order_index` | numeric | |
| `is_revision_node` | boolean | |

---

## Data Flow
- **Supabase**: Source of truth for all tables
- **`dataAdapter.js`**: Fetches and normalises data.
  - `loadAsanaLibrary()`: Queries `asanas` + `stages`, builds `window.asanaLibrary` map. **Self-executes at module load time** (line 150 — eager cache warm).
  - `fetchCourses()`: Queries `courses`, parses `sequence_text` into pose arrays.
  - Key normalisation: `english_name` → `english`, `audio_url` → `audio`, `hold` string → `hold_json` object. **All timing reads `hold_json.standard`.**
- **`app.js`**: App orchestrator. `init()` called by `wiring.js` after Google auth.
- **`state.js`**: Centralised state store; `window.*` proxies route bare name reads to `globalState`.

## Audio System
- `playPoseMainAudio()` in `app.js` checks `asana.audio` (mapped from `audio_url`)
- Falls back to filename guessing if direct URL missing
- Stages override with their own `audio_url` / `audio_title`

## Sequence Expansion Engine (`src/services/sequenceEngine.js`)
`getExpandedPoses(seq)` flattens a raw sequence into an ordered pose list:
1. Unpacks `MACRO:Title` references (sub-sequences)
2. Unrolls `LOOP_START` / `LOOP_END` repeat blocks
3. Injects preparatory poses (before) and recovery poses (after) from asana metadata

## Timing (`src/utils/sequenceUtils.js`)
- `getEffectiveTime(id, dur)` — canonical duration; reads `hold_json.standard`, doubles for bilateral poses
- `calculateTotalSequenceTime(seq)` — sums expanded poses via `getEffectiveTime`

## UI State & Resume Logic
- Resume: saved to localStorage with 4-hour TTL
- 90% completion gate before triggering end-of-sequence flow
- `setPose()` in `app.js` is the main pose rendering function (~425 lines, largest remaining)

## Authentication
- Google OAuth via Supabase Auth
- `wiring.js` `onAuthStateChange` → calls `window.init()` once on login
- No guest mode (removed); all features require login
- Admin (`mark.opie@gmail.com`): extra UI for "Promote to published" on sequence save

## Scripts & Tooling
- `/scripts/` — Python/Node scripts for data management
- `/supabase/migrations/` — SQL migration history
- All admin DB operations done via Supabase Dashboard SQL Editor or scripts