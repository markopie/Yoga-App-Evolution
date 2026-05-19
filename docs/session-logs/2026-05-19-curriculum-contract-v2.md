# Curriculum Contract v2 Session Log

Date: 2026-05-19
Branch: main

## Goal

Redesign the curriculum contract so the app can support a coherent 7-day weekly curriculum rhythm, including sequence days, revision days, choice days, recovery/restorative/pranayama days, and future adaptive progression.

## Current decision

We are not patching draft v1 row-by-row.
We are creating a cleaner v2 curriculum contract and testing it in small slices before rebuilding the larger curriculum.

## Completed

- [x] Added new program_curriculum fields:
  - day_role
  - recovery_type
  - is_visible
  - source_policy
  - source_sequence_order
  - estimated_minutes
  - curriculum_unit_id
  - adaptive_behavior

- [x] Created migration:
  - supabase/migrations/20260519022632_update_program_curriculum_contract_v2.sql

- [x] Ran local Supabase reset successfully with Docker running:
  - supabase db reset

## Current task

Confirm the curriculum contract migration works locally, then create a tiny testing v2 curriculum seed.

## Next steps

1. Verify the migration file contains the intended constraint updates.
2. Verify local database accepts new node_type values:
   - composed_sequence
   - recovery
   - assessment
   - reserve
3. Verify local database accepts new completion_requirement values:
   - none
   - complete_all_parts
   - choose_one
   - acknowledge
4. Create a tiny 2-week testing curriculum:
   - slug: iyengar_integrated_master_path_testing_v2
   - program name: Integrated Iyengar Practice Path - Testing v2
   - 14 rows
   - every week has D1-D7
   - every row active and visible
   - D7 uses node_type = recovery
5. Run validation queries:
   - exactly 7 visible active days per week
   - no duplicate week/day rows
   - D7 is always recovery
   - no hidden ordinary days
6. Then update UI/runtime:
   - roadmap query uses is_active + is_visible
   - roadmap displays day_role and recovery_type
   - Today’s Practice routes by node_type instead of assuming every node is a sequence

## Do not do yet

- [ ] Do not delete draft v1.
- [ ] Do not generate the full curriculum.
- [ ] Do not ask Codex to implement until the contract and test slice are agreed.
- [ ] Do not use is_active=false to hide optional/rest/revision days.

## Notes

The existing draft v1 showed 145 active rows in UI even though program_curriculum had 160 rows. This indicates the UI is reading active rows, and that inactive/missing rows caused the visible weekly gaps.

The new rule is:

is_active = valid/current row
is_visible = shown in roadmap

Optional, rest, recovery, revision, and choice days should normally be both active and visible.
