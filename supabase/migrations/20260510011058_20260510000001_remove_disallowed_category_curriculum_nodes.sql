/*
  # Remove disallowed category nodes from curriculum

  ## Summary
  The curriculum slug `iyengar_integrated_master_path_draft_v1` contained
  nodes whose primary sequences belong to course categories that are not
  permitted in the curriculum:

  - category 10 (How to Use Yoga) — 29 nodes across weeks 1–24
  - category 56 (Cycle) — 1 node (week 4, day 5, sequence 362 "Virasana")

  Allowed categories are: 2, 5, 13, 19, 232.

  ## Changes

  1. sequence_completions
     - Delete any completion rows referencing the removed curriculum nodes
       (FK is NO ACTION so completions must go first).
     - Affects 9 nodes that had test completion rows (1.01, 1.05, 2.01,
       3.01, 3.05, 4.01, 4.05, 5.01, 5.05). These are draft-phase test rows.

  2. program_curriculum
     - Delete 30 nodes whose `sequence_id` maps to a course in a disallowed
       category (10 or 56).

  ## Notes
  - No allowed-category nodes are touched.
  - No schema changes; data-only cleanup.
*/

-- Step 1: remove completion rows that reference the nodes being deleted
DELETE FROM public.sequence_completions
WHERE curriculum_node_id IN (
  SELECT pc.id
  FROM public.program_curriculum pc
  JOIN public.courses c ON c.id = pc.sequence_id
  JOIN public.course_sub_categories csc ON csc.id = c.sub_category_id
  WHERE pc.curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
    AND csc.category_id NOT IN (2, 5, 13, 19, 232)
);

-- Step 2: remove the curriculum nodes themselves
DELETE FROM public.program_curriculum
WHERE id IN (
  SELECT pc.id
  FROM public.program_curriculum pc
  JOIN public.courses c ON c.id = pc.sequence_id
  JOIN public.course_sub_categories csc ON csc.id = c.sub_category_id
  WHERE pc.curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
    AND csc.category_id NOT IN (2, 5, 13, 19, 232)
);
