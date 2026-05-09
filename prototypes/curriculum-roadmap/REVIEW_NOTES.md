# Curriculum Roadmap Prototype — Review Notes

**Date:** 2026-05-09
**Status:** Read-only inspection. No production files, schema, RLS, auth, or data modified.

---

## 1. Relevant Supabase Tables / Views / Files

| Name | Type | Purpose |
|---|---|---|
| `public.courses` | Table | Source-of-truth for all sequences. Each row is one playable sequence. Fields: `id` (int), `course_title`, `category`, `sequence_text`, `created_at`. **No curriculum-layer fields here.** |
| `public.sequence_completions` | Table | Completion history. **Current live columns: `id`, `title`, `category`, `completed_at`, `duration_seconds`, `notes`, `created_at` only.** |
| `public.asanas` | Table | Asana library. |
| `public.stages` | Table | Asana variation stages. |
| `src/ui/curriculumUI.js` | JS Module | Calls `get_today_curriculum_practice` RPC, builds `window.currentCurriculumPractice`, resolves composed practices, drives the curriculum UI. The curriculum layer lives entirely here and in the RPC. |
| `src/services/historyService.js` | JS Module | Writes to `sequence_completions`. References `curriculum_node_id`, `rating`, `sequence_id`, `user_id`, `duration_scale_used`, `planned_duration_minutes`, `actual_adjusted_duration_minutes` — but **these columns do not yet exist in the live database**. |
| `src/utils/completionFlow.js` | JS Module | Detects curriculum context via `curriculum_node_id` presence to route post-completion flow. |
| `src/utils/resumeState.js` | JS Module | Manages `yoga_resume_state_v2` localStorage key. Stores `sequenceId`, `poseIdx`, `completionTracker`. No curriculum concept. |
| `src/store/state.js` | JS Module | Global runtime state: `courses`, `asanaLibrary`, `activePlaybackList`, `completionTracker`, etc. |
| `supabase/migrations/20260509000001_add_completion_duration_dial_metadata.sql` | Migration | Adds `completed`, `duration_scale_used`, `planned_duration_minutes`, `actual_adjusted_duration_minutes` to `sequence_completions` — **and references `curriculum_node_id` in an index — but this migration has NOT been applied to the live database yet.** |
| `get_today_curriculum_practice` | RPC (Supabase) | Returns current curriculum practice. **Not present in live DB.** Defined only in app code reference. Presumably defined outside the tracked migrations. |

### Key finding: the live database is behind the latest migrations.

The live `sequence_completions` table has only 7 columns. The migrations reference 11+ columns
(`rating`, `curriculum_node_id`, `sequence_id`, `user_id`, `completed`, `duration_scale_used`,
`planned_duration_minutes`, `actual_adjusted_duration_minutes`) and a `completion_rating_options`
table that is also absent from the live schema. Neither `get_today_curriculum_practice` nor any
other curriculum RPC exists in the live DB.

There is no `program_curriculum`, `curriculum_nodes`, `phases`, or roadmap table in the live schema.
The curriculum layer is managed externally (presumably a different Supabase project or a
not-yet-applied set of migrations).

---

## 2. Field Mapping: Prototype Mock vs. Real App

| Prototype field | Closest real field / source | Status | Notes |
|---|---|---|---|
| `curriculum_slug` | Not in live DB. Referenced in `curriculumUI.js` as a config constant. | **Missing from live DB** | Would be a param to a future RPC. |
| `curriculum_node_id` | Referenced in `historyService.js`, `completionFlow.js`, `curriculumUI.js`. Not in live DB columns. | **Missing from live DB** | Core identifier. Exists as app-side concept only. |
| `week_number` | `window.currentCurriculumPractice.week_number` | **Derived / runtime only** | Set by RPC response, not stored in any live table. |
| `day_number` | `window.currentCurriculumPractice.day_number` | **Derived / runtime only** | Same. |
| `order_index` | Not present anywhere. | **Missing** | Would be needed for sorting nodes within a week. |
| `node_type` | `window.currentCurriculumPractice.node_type` | **Runtime only** | From RPC. Not in live DB. |
| `resolved_node_type` | `window.currentCurriculumPractice.resolved_node_type` | **Runtime only** | Computed in `curriculumUI.js`. |
| `practice_track` | `window.currentCurriculumPractice.practice_track` | **Runtime only** | e.g. `'pranayama'`. From RPC. |
| `sequence_id` (node-level) | `window.currentCurriculumPractice.resolved_sequence_id` → `courses.id` (int) | **Direct (int, not string)** | In mock, used as string `"seq_loy_w1_standing"`. Real app uses numeric `courses.id`. |
| `title` (node-level) | `window.currentCurriculumPractice.resolved_course_title` or `source_reference` | **Direct** | Maps to `courses.course_title`. |
| `duration_minutes` | Derived from `course_sequence_analysis.total_duration_minutes` or `curriculum_payload.total_duration_minutes` | **Derived** | Not a stored field on nodes. |
| `source_key` | `window.currentCurriculumPractice.source_key` | **Runtime only** | From RPC payload. e.g. `"light_on_yoga"`. |
| `source_course` | `window.currentCurriculumPractice.source_course` | **Runtime only** | Human-readable source name. From RPC. |
| `source_reference` | `window.currentCurriculumPractice.source_reference` | **Direct** | Used as fallback title. From RPC. |
| `status` (complete/current/upcoming/locked) | Not stored anywhere in live DB. | **Derived** | Would be computed from completion history + current node pointer. |
| `rating` | Referenced in `historyService.js` as `sequence_completions.rating`. Column not in live DB yet. | **Missing from live DB** | Migration planned (`completion_rating_options` table seeded). |
| `is_rest_day` | `window.currentCurriculumPractice.is_rest_day` | **Runtime only** | From RPC. |
| `is_optional` | Not referenced anywhere in app code or DB. | **Missing** | Purely a prototype concept. |
| `is_locked` | Not stored. Derived from progression state. | **Derived** | Would depend on gate logic. |
| `is_revision_node` | Not referenced in app code or DB. | **Missing** | Prototype concept. |
| `curriculum_payload` | `window.currentCurriculumPractice.curriculum_payload` | **Runtime only** | JSONB from RPC. Not in live DB. |
| `practice_composition` (parts array) | `curriculum_payload.practice_composition[]` in RPC response. Roles: `primary_asana`, `appended_pranayama`, `quiet_asana`, etc. | **Runtime only** | Real `role` values differ from prototype (`main`/`supplemental`). |
| `counts_for_source_completion` | `practice_composition[].counts_for_source_completion` in RPC. Used in `curriculumUI.js`. | **Runtime only** | Concept is correct in prototype. |
| `part.role` | Real values: `primary_asana`, `appended_pranayama`, `quiet_asana`. Prototype uses `main`/`supplemental`. | **Naming mismatch** | Update mock to use real role vocabulary. |
| `phase_id` / phase grouping | Not in any live table or RPC. | **Missing** | Would be part of a future roadmap RPC. |
| `metadata.plateau_candidate` | Not in live DB or RPC response. | **Missing** | Future/planned concept. |
| `metadata.milestone_type` | Not in live DB or RPC response. | **Missing** | Future/planned concept. |
| `metadata.progression_gate` | Not in live DB or RPC response. | **Missing** | Future/planned concept. |
| `metadata.can_repeat_indefinitely` | Not in live DB or RPC response. | **Missing** | Future/planned concept. |
| Source coverage counts (`required_count`, `scheduled_count`, `completed_count`) | Would require JOIN of `program_curriculum` (non-existent) + `sequence_completions`. | **Missing** | Entirely derived. Cannot be computed from current live schema. |
| `yoga_resume_state_v2` (localStorage) | `resumeState.js`. Contains `sequenceId`, `poseIdx`, `completionTracker`, `timestamp`. | **Separate concern** | No curriculum concept. A roadmap should not read or write this key. |

---

## 3. Recommended Mock Data Adjustments

These keep the prototype honest to the real app without connecting anything live.

1. **`sequence_id` should be numeric integers**, not slug strings.
   Change `"seq_loy_w1_standing"` → `1001` (or any integer) to reflect `courses.id` being an `int`.

2. **`part.role` values** should use real vocabulary from `curriculumUI.js`:
   - `"main"` → `"primary_asana"`
   - `"supplemental"` → `"appended_pranayama"` (for pranayama parts) or `"quiet_asana"`

3. **Node `title`** should reflect real `courses.course_title` naming style
   (e.g. `"Light on Yoga – Week 1 Day 1"` rather than bespoke slugs).

4. **`source_key`** values should match real conventions used in the RPC:
   Current mock uses `"light_on_yoga"`, `"light_on_pranayama"`, `"iyengar_way"`. These appear
   correct based on app code references — keep them.

5. **`duration_minutes`** should be shown as a derived/estimated field, not a stored one.
   Add a note in mock data comments that this comes from `course_sequence_analysis.total_duration_minutes`.

6. **Add a `composition_parts` enriched array** to composed-day mock nodes (in addition to
   `curriculum_payload.practice_composition`), since `curriculumUI.js` enriches the raw payload
   into `composition_parts` with full `course` objects and `part_number`. The prototype currently
   shows only the raw `practice_composition` shape.

7. **Remove or comment out `metadata` flags** (`plateau_candidate`, `progression_gate`, etc.) in
   the mock, or clearly label them as "future / speculative fields" since none of these exist in
   the current RPC or DB.

8. **Phase structure**: the prototype's 3-phase model is plausible but entirely speculative.
   Mark it clearly as a UI grouping concept, not a stored DB field.

---

## 4. Things Not to Connect Yet

Do not attempt live integration until these are resolved:

| Item | Reason |
|---|---|
| `get_today_curriculum_practice` RPC | Does not exist in the live DB. Cannot call it. |
| `sequence_completions.rating` | Column not in live DB. Migration planned but not applied. |
| `sequence_completions.curriculum_node_id` | Same — migration not applied. |
| `sequence_completions.user_id` | Not in live schema. RLS policies use `USING (true)` — no per-user isolation currently. |
| `completion_rating_options` table | Referenced in migration but does not exist in live DB. |
| Source coverage calculations | No `program_curriculum` table. Cannot derive `required_count`/`scheduled_count`. |
| Phase / week / node graph | No curriculum graph tables exist in live DB at all. |
| `yoga_resume_state_v2` localStorage | Resume state is a playback concern. The roadmap should not touch it. |
| Auth / user_id isolation | App currently uses anon RLS with `USING (true)`. Multi-user is not enforced. Any roadmap integration must wait for proper per-user RLS. |

---

## 5. Safety / Integration Risks

| Risk | Description |
|---|---|
| **No per-user RLS** | `sequence_completions` uses `USING (true)` for anon. If the roadmap reads completions directly, it reads all users' data. Must not integrate until `user_id` column and per-user policies are in place. |
| **Duplicate completion rows** | Composed days write one row per `counts_for_source_completion` part. A naive "count completions by curriculum_node_id" would double-count. The roadmap must group by `curriculum_node_id` and deduplicate. |
| **Composed-node rating ambiguity** | `historyService.js` stores a batch of pending row IDs and applies one rating to all. A roadmap showing "the rating for this day" would need to pick one representative row per `curriculum_node_id`. |
| **Missing columns in live DB** | `rating`, `curriculum_node_id`, `sequence_id` do not exist in live DB. Any code that reads those columns will silently get nulls or throw. |
| **No curriculum graph** | There is no `program_curriculum` table. A roadmap cannot render real nodes until this is built and seeded. |
| **Guest/anon contamination** | Anon completions are not isolated. A future authenticated roadmap would see all past anon completions unless backfilled with a `user_id`. |

---

## 6. Recommended Next Prompt for Codex

```
Context:
- Prototype at prototypes/curriculum-roadmap/ uses mock data only.
- Review notes at prototypes/curriculum-roadmap/REVIEW_NOTES.md explain what is real vs. missing.
- The live Supabase DB (qrcpiyncvfmpmeuyhsha) has sequence_completions with only 7 columns.
  The migrations in supabase/migrations/ that add rating, curriculum_node_id, sequence_id, user_id,
  completion_rating_options, etc. have NOT been applied to the live database yet.
- No program_curriculum table or get_today_curriculum_practice RPC exists in the live DB.

Task:
Update the prototype mock data in prototypes/curriculum-roadmap/roadmap.js to be more honest
to the real app data shapes. Specifically:
  1. Change all mock sequence_id values from slug strings to integers (e.g. 1001, 1002...).
  2. Change practice_composition part roles from "main"/"supplemental" to the real vocabulary:
     "primary_asana", "appended_pranayama", "quiet_asana".
  3. Add a note block at the top of MOCK_ROADMAP clarifying which fields are real (from RPC),
     which are planned-but-not-live (rating, curriculum_node_id), and which are
     speculative/future (phases, metadata flags, source coverage).
  4. Do not change any production files. Work only in prototypes/curriculum-roadmap/.
  5. Run npm run build after to confirm no breakage.
```
