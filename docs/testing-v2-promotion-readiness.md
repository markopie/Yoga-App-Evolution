# Testing v2 Promotion Readiness

Date: 2026-05-24

## Scope

Promotion-readiness audit for `iyengar_integrated_master_path_testing_v2` after the rebuild from the `draft_v1` curriculum spine.

Autonomous limits observed:
- No Supabase remote migration push was run.
- The active curriculum slug was not changed.
- No schema, seed strategy, runtime behavior, RPC logic, or adaptive resolution changes were made.
- No curriculum rows were manually deleted outside the requested seed command.
- The previous adaptive-copy promotion blocker has now been fixed in the seed copy and locked by validation.

## Current Shape

Seed/validation currently reports:

| Metric | Count |
| --- | ---: |
| Total rows | 160 |
| Active visible roadmap rows | 145 |
| Source-backed rows | 93 |
| Active visible source-backed rows | 78 |
| Fixed sequence rows | 74 |
| Composed sequence rows | 4 |
| Adaptive revision rows | 26 |
| Adaptive consolidation rows | 17 |
| Recovery rows | 24 |
| Placeholders | 0 |

Active visible source policy counts:

| Source policy | Count |
| --- | ---: |
| `fixed_sequence` | 74 |
| `adaptive_revision` | 26 |
| `recovery_protocol` | 24 |
| `composed_sequence` | 4 |
| `adaptive_consolidation` | 17 |

## Verification Results

Commands run:

| Command | Result |
| --- | --- |
| `supabase start` | Passed; local stack started. |
| `supabase db reset` | Passed after local stack start. |
| `npm run seed:curriculum-testing-v2` | Passed; inserted 160 rows. |
| `npm run validate:curriculum-testing-v2` | Passed. |
| `npm test` | Passed; 31 tests. |
| `npm run build` | Passed. |
| `npm run lint` | Passed with existing warning-only lint output: 100 warnings, 0 errors. |

Notes:
- `.env` points at the remote project `qrcpiyncvfmpmeuyhsha.supabase.co`, so seed and validation commands were run with explicit local Supabase environment overrides.
- Local validation target: `http://127.0.0.1:54321`.
- `supabase db reset` passed locally.
- Supabase CLI reported local service version drift for Storage during `supabase start`, but this did not block replay.
- Local reset does not currently populate `draft_v1` rows or every referenced source course payload. For validation only, `draft_v1` rows were copied from remote into local, and the focused source-playability audit used remote course rows read-only. No remote writes were performed.

## Focused Audit Results

Passed checks:
- Roadmap active visible count is stable at 145.
- No active visible placeholder nodes.
- No visible `Orientation` copy.
- No visible `Revision Practice` copy; the roadmap uses `Review Practice`.
- No duplicate `Consolidation - Consolidation` label.
- No active visible user-facing copy asks the user to choose/select/pick a practice.
- Source-backed active visible rows have valid playable source sequences.
- Composed rows resolve with composition parts.
- Adaptive review and consolidation rows resolve automatically through `get_today_curriculum_practice`.
- Recovery rows resolve as non-sequence acknowledgement nodes.
- Progression is user-scoped: a temporary completion advanced only that user while guest progression remained on the first node.

Representative RPC checks:

| Case | Result |
| --- | --- |
| Early fixed sequence | W1D1 resolved to `Week 1 & 2`. |
| Composed sequence | W2D4 resolved to `Week 3 & 4` with 2 composition parts. |
| Adaptive review | W1D6 resolved automatically to `Lesson 1`. |
| Adaptive consolidation | W13D4 resolved automatically to `1A (Standing)`. |
| Recovery | W1D7 resolved as `recovery` with no sequence id. |
| Later fixed sequence | W22D1 resolved to `Day 6`. |

## Promotion Risks

### Resolved Blocker

The previous blocker is resolved. The seven adaptive revision/consolidation rows that still said the user should choose a practice now use automatic-selection language.

Rows fixed:

| Node | Policy | Current copy |
| --- | --- | --- |
| W7D6 | `adaptive_revision` | "Today's practice will revisit a prior lesson that would benefit from steadier understanding." |
| W9D6 | `adaptive_revision` | "Today's practice will revisit a suitable lighter practice if fatigue or reserve is accumulating." |
| W15D6 | `adaptive_revision` | "Today's practice will stay light, using a short marked practice or quiet recovery as appropriate." |
| W18D4 | `adaptive_consolidation` | "Today's practice will consolidate a Light on Yoga Course 1 backbone practice that needs steadier timing and ease." |
| W20D6 | `adaptive_revision` | "Today's practice will revisit an easy marked practice." |
| W22D6 | `adaptive_revision` | "Today's practice will use recovery-oriented revision after the Course 1 plateau practice." |
| W24D6 | `adaptive_revision` | "Today's practice will stay deliberately light after the Course 1 plateau practice, using a short, restorative, or quiet practice as appropriate." |

The validator now fails if active visible user-facing text contains choice-based instructions such as `choose`, `select your`, `pick`, `your choice`, or `choice`.

### Non-Blocking Review Items

- Recovery label currently renders as `Savasana Or Full Rest Recovery`. It is meaningful, but title case around `Or` is a little stiff. A later copy pass could prefer `Savasana or Full Rest`.
- Source-backed roadmap titles are focus-led (`Standing and Basic`, `Mixed`, `Forward Bends`) while the source reference appears in metadata. This keeps the map scannable, but Mark should decide whether primary station titles should expose source titles more directly.
- Composed rows show roles (`Asana Part 1`, `Short Pranayama Part 2`) rather than sequence titles in the part labels. This is understandable, but source-title detail could be richer later.

## Remaining Mark Decisions

- Decide whether `testing_v2` should remain active for local/admin review, move behind a dev-only selector, or stay active while the promotion copy pass is completed.
- Decide whether the `draft_v1`-derived seed is acceptable long term or whether a standalone source fixture is worth building later.
- Decide whether to do a final copy-polish pass on recovery/composed/source-backed roadmap labels before broader release.

## Recommendation

Promotion-ready for the next review stage.

`testing_v2` is structurally much stronger than the old 14-row fixture, the previous adaptive-copy blocker is resolved, and validation now guards against that regression. It should stay active for review unless Mark prefers moving it behind a dev-only selector before broader exposure.
