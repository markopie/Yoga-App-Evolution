# Curriculum Full Program Implementation Findings

Date: 2026-06-23

## Current Goal

`iyengar_integrated_master_path_testing_v2` now represents the full `courses` table as a complete testable program, not the old 160-row `draft_v1` spine.

Public program name:

`Integrated Iyengar Practice Path`

## Course Audit

- Total rows in `courses`: 368.
- Playable courses: 368.
- Excluded/unplayable courses: 0.
- Aliases/redirects found: 0.
- Duplicate category/title playable courses found: 0.
- Previously scheduled course references in the old Testing v2 path: 93.
- Previously unscheduled playable courses: 275.

## Category Structure

The generated curriculum uses real database category and subcategory structure from:

- `course_categories`
- `course_sub_categories`

Primary source families:

- How to Use Yoga.
- Yoga The Iyengar Way.
- Light on Yoga.
- Yoga A Gem For Women.
- Light on Pranayama.
- Yoga The Iyengar Way Remedial.
- Light on Yoga Therapeutic.
- Flow.
- Cycle.
- General.

## Ordering Rule

Courses are ordered by:

1. Source/course family progression.
2. Subcategory progression inside that family.
3. Natural numbers in course titles.
4. Title sort.
5. Course id as the final stable tie-breaker.

This replaces the artificial Foundation/Development/Deepening/Advanced grouping. The roadmap now receives `progression_group_label` from the generated rows so grouping is based on source/course families.

## Generated Curriculum Shape

- Scheduled course references: 368.
- Scheduled unique courses: 368.
- Total curriculum nodes: 430.
- Active visible nodes: 430.
- Weeks generated: 62.
- Practice days per week: 6.
- Recovery days: 62.
- Composed practices: 0.
- Invalid course references: 0.
- Unresolved composition references: 0.

The final week is intentionally partial: week 62 has two practice days, then recovery on day 7.

## Implementation Choice

Every playable course is currently scheduled exactly once as a sequence node. Light on Pranayama courses are included directly in the six-day progression rather than composed into other days, because this is the clearest way to guarantee complete course coverage and exact-once scheduling for the first full-program test pass.
