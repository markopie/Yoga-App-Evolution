# Curriculum Roadmap — Integration Plan

**Branch:** roadmap-integration-plan  
**Date:** 2026-05-10  
**Status:** Planning only — no implementation yet

---

## 1. Supabase Access Confirmation

Project: `qrcpiyncvfmpmeuyhsha` — confirmed.

All required tables and functions exist:

| Object | Type | Present |
|---|---|---|
| `program_curriculum` | table | YES |
| `sequence_completions` | table | YES |
| `completion_rating_options` | table | YES |
| `source_sequence_inventory` | table | YES |
| `courses` | table | YES |
| `course_sequence_analysis` | table | YES |
| `get_today_curriculum_practice` | function | YES |
| `get_next_curriculum_node` | function | YES |
| `resolve_revision_curriculum_node` | function | YES |

---

## 2. Prototype Findings

### What the prototype does

`prototypes/curriculum-roadmap/` is a standalone mock-data prototype (no Supabase, no app imports). It renders a curriculum journey using a **transit-map metaphor** with two switchable views:

- **Map view** — SVG lanes (asana, pranayama, revision, rest), station circles, pulsing current-node ring, selection ring, right-side detail panel
- **List view** — nested accordion: phases → weeks → nodes with status badges, stars, duration chips

A **"Today's Practice" hero card** sits above the map when a current node exists.

### Mock data shape

The prototype uses a `MOCK_ROADMAP` object structured as:

```
curriculum_slug, program_name, summary{current_node_id, week, day, total, completed, level_display}
levels[
  {level_number, label, status,
    weeks[
      {week_number, status,
        nodes[
          {id, week_number, day_number, title, node_type, source_name,
           duration_minutes, status, rating, intensity_band, primary_theme,
           curriculum_payload{
             practice_composition[
               {part_number, role, title, source_name,
                duration_minutes, counts_for_source_completion}
             ],
             total_duration_minutes
           }
          }
        ]
      }
    ]
  }
]
```

### What to keep

| Component | Keep | Notes |
|---|---|---|
| Transit-map SVG layout | YES | Lane coordinates, station symbols, pulsing ring, level separators — solid and portable |
| `roleLabel()` | YES | Maps `appended_pranayama` → "Short Pranayama" etc. |
| `nodeTypeLabel()` | YES | Derives display from `node_type` + composition |
| `intensityLabel()` | YES | Maps bands (restorative / light / moderate / strong / advanced) |
| `ratingMeta()` | YES | 1–5 → {label, subtitle} |
| `formatDuration()` | YES | Converts minutes to "1h 15m" |
| `esc()` | YES | XSS-safe HTML escaping |
| View toggle (map ↔ list) | YES | Clean, accessible, portable |
| Accessibility structure | YES | Proper ARIA, tabindex, keyboard nav |
| CSS variable system | YES | Full dark-mode-ready palette, all semantic via custom props |
| Station detail panel | YES | Composition parts, duration, source, rating display |
| Progress summary strip | YES | Position, %, stage, progress bar |

### What NOT to carry into production

| Component | Reason |
|---|---|
| `MOCK_ROADMAP` object | Replace with RPC/query data |
| `onclick="alert('Prototype only...')"` on Begin Practice button | Wire to real `startTodayPractice()` |
| Footer disclaimer `.cr-footer-note` | Remove from production |
| The `?prototype=curriculum-roadmap` DOM-replacement loader in `index.html` | The production integration will be modal-based, not a page replacement |

### Map view vs list view

Keep **both**. The map view is the primary visual — the transit metaphor works well for a 24-week curriculum with clear lanes. The list view is useful on narrow screens and for accessibility. The toggle pattern is clean.

---

## 3. Real Data Findings

### Curriculum structure (live data)

Slug: `iyengar_integrated_master_path_draft_v1`  
**138 nodes total** across at least 24 weeks.

| node_type | count | note |
|---|---|---|
| sequence | 71 | Active practice nodes |
| revision | 25 | Revision-buffer days (day 6 each week, `sequence_id: null`) |
| rest | 24 | Rest days (day 7 each week, `sequence_id: null`) |
| consolidation | 17 | Plateau/deepening weeks |
| choice | 1 | One choice node in the entire draft |

**Weekly cadence (repeating pattern):**
- Day 1: composed asana + appended pranayama (some weeks)
- Day 2: Yoga: The Iyengar Way lesson
- Day 3: LOP pranayama (inactive — composed into day 4)
- Day 4: Light on Yoga backbone (primary day, sometimes with appended LOP)
- Day 5: Yoga: A Gem for Women (from week 2+)
- Day 6: revision node (null sequence_id)
- Day 7: rest node (null sequence_id)

**Plateau/gate nodes:** 3 nodes (weeks 22–24, day 4) — `light_on_yoga_course_1_major_plateau`, `progression_gate: user_readiness_required_not_completion_only`, `can_repeat_indefinitely: true`.

**Composition nodes:** 4 nodes with `practice_composition` arrays (weeks 2, 10, 11, 12 day 4 — LOY backbone + appended LOP pranayama).

### Completion data

- All completions linked via `curriculum_node_id` (FK to `program_curriculum.id`)
- `duration_seconds` is always 0 — actual duration tracked via `planned_duration_minutes` + `duration_scale_used` → `actual_adjusted_duration_minutes`
- Composed nodes fire **two rows at the same timestamp** (one per component sequence) — de-duplication by `curriculum_node_id` required
- Rest nodes fire **one row with null sequence_id** and notes "Rest day acknowledged"
- Plateau node 935 was tested with ratings 1, 2, 3 in quick succession — system correctly repeats

### curriculum_payload keys (32 total — key ones for roadmap)

| Key | Roadmap use |
|---|---|
| `practice_composition` | Part-by-part breakdown in detail panel |
| `total_duration_minutes` | Duration display |
| `composed_total_duration_minutes` | Composed practice total |
| `plateau_candidate` | Node status badge |
| `can_repeat_indefinitely` | Status badge |
| `progression_gate` | Status badge |
| `milestone_type` | Status badge |
| `exploratory_next_allowed` | Informational |
| `suggested_consolidation_weeks` | Informational |
| `long_day_acknowledged` | Flag warning icon in detail panel |
| `curriculum_role` | Secondary display |
| `planned_phase` | Secondary display |
| `inactive_reason` | Suppress node from roadmap if `is_active: false` |
| `rest_protocol` | Rest day note |

Keys to **ignore** in roadmap display:  
`candidate_inventory_id`, `source_week_min/max`, `composition_rationale`, `draft_phase`, `weekly_cadence`, `source_mix`, `superseded_by_curriculum_node_sequence_id`.

---

## 4. Source-Label Cleanup Recommendations

### Canonical user-facing source names

All five source names are **already clean and consistent** in the live data:

| source_name (live) | source_key | User-facing display |
|---|---|---|
| `Light on Yoga` | `light_on_yoga` | Light on Yoga |
| `Light on Pranayama` | `light_on_pranayama` | Light on Pranayama |
| `Yoga: The Iyengar Way` | `yoga_the_iyengar_way` | Yoga: The Iyengar Way |
| `Yoga: A Gem for Women` | `yoga_gem_for_women` | Yoga: A Gem for Women |
| `How to Use Yoga` | `how_to_use_yoga` | How to Use Yoga |
| `Integrated Iyengar Practice Path - Draft v1` | null | *(internal — do not surface)* |

**"Yoga Dipika" does not appear anywhere** in the database. Zero matches in `program_curriculum`, zero in `courses`. This concern is resolved.

### Source-reference confusion risk

The `source_reference` field contains values like "Week 1 and 2", "Lesson 1", "Day 1, 3, 5", "Day 2 and 4". Some of these **look like curriculum day labels** but are actually chapter/lesson labels from the source books.

The recommended three-tier display model:

```
[Curriculum position]  Week 1 · Day 2 — Foundation Practice
[Node type badge]      Practice
  [Source label]       Yoga: The Iyengar Way — Lesson 1
```

**Rules:**
- Never show `source_reference` as a headline or primary label
- Always prefix with source name: `"Yoga: The Iyengar Way — Lesson 1"` (not just `"Lesson 1"`)
- For composed nodes, show per-part source: `Part 1 — Light on Yoga · Week 3 & 4`
- Never show: `source_key`, `sequence_id`, `curriculum_node_id`, `order_index` raw values
- Never show: "Integrated Iyengar Practice Path - Draft v1" as a source name
- For revision nodes: show "Revision — Catch-up / Consolidation" without a source label
- For rest nodes: show "Rest · Savasana" without a source label

### Revision node source inconsistency

`revision` nodes have `source_name: 'How to Use Yoga'` and `source_reference: 'Do Again / Concentrate revision buffer'`. The source_name here is **misleading** — a revision day is not a HTUY lesson. In the roadmap UI, revision nodes should show their type label only ("Revision day"), not the How to Use Yoga source attribution.

---

## 5. Proposed Roadmap Status Model

The smallest useful set — seven statuses, each directly derivable from available data:

| Status | Label | Derivation | Visual |
|---|---|---|---|
| `current` | Today | `curriculum_node_id` matches current node from `get_today_curriculum_practice` | Pulsing teal ring |
| `completed` | Done | Has ≥1 completion row with `rating >= 3` (or rest/revision node with any completion) | Filled circle, green chip |
| `repeated` | Repeated | Has >1 completion row for same `curriculum_node_id` | Filled circle, amber chip |
| `rest` | Rest | `node_type = 'rest'` | Open circle, stone colour |
| `plateau` | Plateau | `curriculum_payload.plateau_candidate = true` | Filled circle + gate icon |
| `revision` | Revision | `node_type = 'revision'` | Open circle, blue colour |
| `upcoming` | Upcoming | No completions, not current | Empty circle, muted |

**Intentionally excluded:**
- `locked/future` — the prototype considered this but it is not supported by the data. Every upcoming node is reachable; there is no locked state.
- `protected block` — this is an internal composition concept, not a user-facing status
- `choice` — only 1 choice node exists; handle as a special case within `upcoming`

**Double-count protection for composed nodes:**  
A composed node (e.g. week 2 day 4) fires two completion rows. Status must be derived from `COUNT(DISTINCT curriculum_node_id)`, not `COUNT(*)`. A node is "completed" if any of its completion rows exists, not if every component row exists.

---

## 6. Recommended Integration Options

### Option A — Load real data into the existing prototype

Keep prototype at `prototypes/curriculum-roadmap/`, replace `MOCK_ROADMAP` with a read-only Supabase query.

| | |
|---|---|
| Files likely to change | `prototypes/curriculum-roadmap/roadmap.js` only |
| Risk | Low — no production code touched |
| User value | Dev/admin only — not accessible to end users |
| New RPCs needed | NO — client-side join of `program_curriculum` + `sequence_completions` |
| New tables/views needed | NO |
| Can be built read-only first | YES |
| Could break player | NO |

**Verdict:** Fast to ship as a dev tool. Does not integrate into the production app UX.

---

### Option B — Dev-only production-style screen inside the app

Add a roadmap screen inside `index.html` behind a dev-only button (like the existing `markCurriculumCompleteBtn`). Uses the real data, real app state, but hidden from regular users.

| | |
|---|---|
| Files likely to change | `index.html`, `app.js` (1 call), new `src/ui/curriculumRoadmapUI.js`, new CSS |
| Risk | Low — dev-only, no changes to progression logic |
| User value | Dev/testing value; allows validation before full launch |
| New RPCs needed | NO |
| New tables/views needed | NO (or optionally a read-only view — see section 9) |
| Can be built read-only first | YES |
| Could break player | NO — roadmap is passive, read-only |

**Verdict:** Safest production path. Validate the data model and visual before adding to the public UI.

---

### Option C — "Curriculum Map" button in curriculum practice panel (production)

Visible to all users. A button next to "Start Today's Practice" opens a roadmap modal.

| | |
|---|---|
| Files likely to change | `index.html` (+1 button, +1 modal), `app.js` (+1 init call), new `src/ui/curriculumRoadmapUI.js`, new CSS |
| Risk | Low — purely additive; modal pattern is established |
| User value | HIGH — users can see their position and full path |
| New RPCs needed | NO (or optionally a view for performance) |
| New tables/views needed | NO |
| Can be built read-only first | YES |
| Could break player | NO |

**Verdict:** The right end state. Should follow Option B (dev-only validation first).

---

### Option D — Replace or modify Today's Practice flow

Integrate roadmap into the existing curriculum practice panel or replace it.

| | |
|---|---|
| Files likely to change | `src/ui/curriculumUI.js`, `index.html`, `app.js`, all CSS that styles the panel |
| Risk | HIGH — directly modifies the existing progression entry point |
| User value | Medium — tighter integration but more complexity |
| New RPCs needed | Possibly |
| New tables/views needed | Possibly |
| Can be built read-only first | NO — restructuring the panel affects progression |
| Could break player | YES — possible if panel lifecycle is disrupted |

**Verdict:** Do not pursue. Too high risk. The curriculum practice panel is a critical entry point.

---

### Recommendation

**Build in two steps:**

1. **Step 1 — Option B** (dev-only): Add a dev-only "Roadmap" button inside `#curriculumPracticePanel` next to the existing dev test buttons. Create `src/ui/curriculumRoadmapUI.js` with read-only data queries. Validate the visual and data model.

2. **Step 2 — Option C** (production): Move the button to a user-visible position in the panel header. Remove the dev-only guard. Ship.

Both steps build the same module — the only difference is whether the button is visible to regular users.

---

## 7. Data/API Recommendation

### What we need from the database

For a full roadmap the client needs:
1. All nodes for the curriculum slug (ordered)
2. All completion rows for the current user + this slug
3. The current node (from `get_today_curriculum_practice`)

### Client-side join vs new RPC

**Recommendation: start with client-side joins (read-only queries), no new RPC.**

```javascript
// Query 1 — all nodes
supabase.from('program_curriculum')
  .select('id, week_number, day_number, order_index, node_type, sequence_id, is_active, is_rest_day, source_name, source_key, source_course, source_reference, intensity, primary_focus, curriculum_payload, completion_requirement')
  .eq('curriculum_slug', CURRICULUM_SLUG)
  .eq('is_active', true)
  .order('order_index')

// Query 2 — completions for user + this slug (via join)
supabase.from('sequence_completions')
  .select('curriculum_node_id, sequence_id, rating, completed_at, duration_scale_used, planned_duration_minutes, actual_adjusted_duration_minutes')
  .eq('user_id', currentUserId)
  .not('curriculum_node_id', 'is', null)
  .order('completed_at')

// Query 3 — today's node (already available via window.currentCurriculumPractice)
// Reuse; do not re-fetch.
```

**De-duplication rule for composed nodes:** Group completions by `curriculum_node_id`. A node is "completed" if the group is non-empty. Count repeats as `group.length > 1`. Use `MAX(rating)` for the displayed star rating.

### Optional later: `v_curriculum_roadmap` view

A read-only Supabase view that joins `program_curriculum` with aggregated completions per user would reduce client logic. Consider after the read-only client-side version is validated. Do not build it in the first integration step.

---

## 8. Proposed Production Data Model (roadmap node shape)

This is the shape the roadmap UI will work with after client-side assembly:

```javascript
{
  // From program_curriculum
  id: bigint,
  week_number: integer,
  day_number: integer,
  order_index: numeric,
  node_type: 'sequence'|'revision'|'rest'|'consolidation'|'choice',
  sequence_id: bigint|null,
  source_name: string|null,
  source_key: string|null,
  source_course: string|null,
  source_reference: string|null,
  intensity: string|null,
  primary_focus: string|null,
  completion_requirement: 'attempt'|'complete'|'repeat_until_ready'|'optional',
  is_rest_day: boolean,
  curriculum_payload: {
    plateau_candidate: boolean,
    can_repeat_indefinitely: boolean,
    progression_gate: string|null,
    milestone_type: string|null,
    practice_composition: [
      { role, sequence_id, counts_for_source_completion }
    ]|null,
    total_duration_minutes: number|null,
    composed_total_duration_minutes: number|null,
    long_day_acknowledged: boolean,
    exploratory_next_allowed: boolean,
    suggested_consolidation_weeks: number|null,
  },

  // Derived from sequence_completions (client-side join)
  status: 'current'|'completed'|'repeated'|'rest'|'plateau'|'revision'|'upcoming',
  completion_count: integer,         // 0 = not done, >1 = repeated
  best_rating: 1|2|3|4|5|null,
  last_completed_at: ISO string|null,

  // From window.currentCurriculumPractice
  is_current: boolean,
}
```

---

## 9. Files Likely to Change (implementation step)

| File | Change |
|---|---|
| `index.html` | Add roadmap button (1 line), add modal container (~15 lines) |
| `app.js` | Add `setupCurriculumRoadmapUI()` call to init block (1 line) |
| `src/ui/curriculumRoadmapUI.js` | NEW — ~400 lines (data fetch, node assembly, SVG render, list render, modal open/close) |
| `styles/components.css` | Add roadmap-specific CSS classes (~100 lines, all namespaced `.cr-*`) |
| `prototypes/curriculum-roadmap/roadmap.css` | Extract `.cr-*` CSS to `styles/components.css` (or import) |
| `prototypes/curriculum-roadmap/roadmap.js` | Optionally extract helper functions to `src/utils/` |

**Files that must NOT change:**
- `src/ui/curriculumUI.js`
- `src/services/historyService.js`
- `src/playback/timerEvents.js`
- `src/playback/timer.js`
- `src/playback/audioEngine.js`
- Any Supabase migration files
- `src/store/state.js`

---

## 10. Risks

| Risk | Level | Mitigation |
|---|---|---|
| Composed node double-counting | Medium | Group by `curriculum_node_id`; derive status from group, not individual rows |
| `window.currentCurriculumPractice` mutation | Low | Roadmap only reads this value, never writes |
| Modal z-index conflict | Low | New modal uses z-index 2000 (same as Browse/History) |
| SVG rendering perf on 138+ nodes | Low | 138 nodes is small; SVG is fine. Add `loading` state for async fetch |
| Revision node source label confusion | Low | Don't show source_name for revision/rest nodes; show type label only |
| `is_active: false` nodes showing in roadmap | Low | Filter to `is_active = true` in query |
| Rating display before any completions | Low | Default to no stars; show "Not started" |
| Prototype `?prototype=curriculum-roadmap` loader interfering | None | That route bypasses the app entirely; production module never touches it |

---

## 11. Manual Test Plan

1. **Open roadmap with no completions** — all nodes show as "upcoming"; current node shows pulsing ring
2. **Complete a regular sequence node** — node status updates to "completed" with rating stars
3. **Complete a composed node** (e.g. week 2 day 4) — shows as "completed" despite two completion rows; de-duplication works
4. **Complete a rest node** — rest node shows "rest" status; no rating stars
5. **Complete a revision node** — revision node shows "revision" status; no source label shown
6. **Trigger plateau repeat** (rating 1, 2, or 3 on plateau node) — plateau node shows repeated status (amber chip)
7. **View station detail** — click a node; detail panel shows correct source label, duration, composition parts
8. **Composed node detail** — part-by-part breakdown shows correct role labels and durations
9. **Map ↔ List toggle** — switches cleanly; state preserved (same node selected)
10. **Dark mode** — all colours invert correctly; no contrast failures
11. **Mobile viewport** — map is scrollable; list view readable; detail panel accessible

---

## 12. Implementation Prompt for Next Step

When approved, use this prompt:

---

**Implement the Curriculum Roadmap screen (dev-only, read-only).**

Context:
- Planning document: `docs/ROADMAP_INTEGRATION_PLAN.md`
- Prototype to extract from: `prototypes/curriculum-roadmap/roadmap.js` and `roadmap.css`
- Curriculum slug: `iyengar_integrated_master_path_draft_v1`
- Supabase project: `qrcpiyncvfmpmeuyhsha` — all tables and functions confirmed

Build:

1. **`src/ui/curriculumRoadmapUI.js`** (new file)
   - `setupCurriculumRoadmapUI()` — wires button click to open modal
   - `openCurriculumRoadmap()` — fetches nodes + completions, assembles node shape (see ROADMAP_INTEGRATION_PLAN.md §8), renders SVG map and list view into `#curriculumMapBody`
   - `closeCurriculumRoadmap()` — hides modal
   - Re-use `roleLabel()`, `nodeTypeLabel()`, `intensityLabel()`, `ratingMeta()`, `formatDuration()`, `esc()` from the prototype (copy inline or into shared util)
   - Status derivation: group completions by `curriculum_node_id`; apply rules from §5
   - De-duplicate composed nodes: status from group, not individual rows
   - Revision/rest nodes: show type label only, no source attribution
   - Current node: read from `window.currentCurriculumPractice` — do NOT re-fetch

2. **`index.html`**
   - Add `<button id="curriculumMapBtn" class="btn-tiny">Map</button>` inside `#curriculumPracticePanel` after `#startTodayPracticeBtn` — wrapped in dev-only guard (`class="dev-only"` style or `if (isAdmin())`)
   - Add modal: `<div class="modal-backdrop" id="curriculumMapBackdrop" style="display:none;">` following the pattern of `#historyBackdrop`; inner `<div class="modal" role="dialog">` with header and `<div id="curriculumMapBody">`

3. **`styles/components.css`**
   - Port `.cr-*` CSS from `prototypes/curriculum-roadmap/roadmap.css` — all namespaced under `.cr-` prefix. No purple/indigo hues.
   - Map stream colors: teal (asana), blue (pranayama), stone (rest), light-blue (revision)
   - Re-use `--color-*` CSS variables from `styles/theme.css`

4. **`app.js`**
   - Add one line: `setupCurriculumRoadmapUI()` in the init block, after `setupCurriculumUI()`

Constraints:
- Do NOT modify `curriculumUI.js`, `historyService.js`, `timerEvents.js`, or any Supabase migrations
- Do NOT write to Supabase from the roadmap module
- Do NOT add new RPC functions — client-side queries only
- All roadmap queries are SELECT only
- Test: `npm run build` must pass; `npm run lint` must not add new errors

---
