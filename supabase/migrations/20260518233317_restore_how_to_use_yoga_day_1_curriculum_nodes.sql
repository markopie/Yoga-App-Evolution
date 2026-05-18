/*
  # Restore How to Use Yoga Day 1 curriculum nodes

  ## Summary
  A previous cleanup migration incorrectly removed category 10 / How to Use Yoga
  nodes from the integrated curriculum.

  Intended disallowed categories are:
  - 1  General
  - 55 Flow
  - 56 Cycle

  Category 10 / How to Use Yoga is intended to remain part of the curriculum.

  This migration restores the missing Week 2+ Day 1 curriculum nodes for
  iyengar_integrated_master_path_draft_v1.

  Insert-only and idempotent:
  - inserts only missing week/day/sequence rows
  - does not touch existing valid rows
  - does not restore deleted draft/test sequence_completions
*/

DO $$
BEGIN
  IF to_regclass('public.program_curriculum') IS NOT NULL
    AND to_regclass('public.courses') IS NOT NULL
    AND to_regclass('public.course_sub_categories') IS NOT NULL
    AND to_regclass('public.program_curriculum_id_seq') IS NOT NULL
  THEN

    WITH restore_nodes AS (
      SELECT *
      FROM (VALUES
        (2,  1, 2.01::numeric, 175),
        (3,  1, 3.01::numeric, 178),
        (4,  1, 4.01::numeric, 179),
        (5,  1, 5.01::numeric, 180),
        (6,  1, 6.01::numeric, 208),
        (7,  1, 7.01::numeric, 209),
        (8,  1, 8.01::numeric, 211),
        (9,  1, 9.01::numeric, 212),
        (11, 1, 11.01::numeric, 206),
        (12, 1, 12.01::numeric, 207),
        (13, 1, 13.01::numeric, 200),
        (14, 1, 14.01::numeric, 201),
        (15, 1, 15.01::numeric, 202),
        (16, 1, 16.01::numeric, 203),
        (17, 1, 17.01::numeric, 196),
        (18, 1, 18.01::numeric, 193),
        (19, 1, 19.01::numeric, 198),
        (20, 1, 20.01::numeric, 199),
        (21, 1, 21.01::numeric, 194),
        (22, 1, 22.01::numeric, 195),
        (23, 1, 23.01::numeric, 190),
        (24, 1, 24.01::numeric, 191)
      ) AS v(week_number, day_number, order_index, sequence_id)
    ),
    rows_to_insert AS (
      SELECT
        rn.*
      FROM restore_nodes rn
      JOIN public.courses c ON c.id = rn.sequence_id
      JOIN public.course_sub_categories csc ON csc.id = c.sub_category_id
      WHERE csc.category_id = 10
        AND NOT EXISTS (
          SELECT 1
          FROM public.program_curriculum pc
          WHERE pc.curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
            AND pc.week_number = rn.week_number
            AND pc.day_number = rn.day_number
            AND pc.sequence_id = rn.sequence_id
        )
    )
    INSERT INTO public.program_curriculum (
      id,
      sequence_id,
      curriculum_slug,
      program_name,
      week_number,
      day_number,
      order_index,
      is_revision_node,
      special_instructions,
      source_name,
      source_reference,
      level_number,
      intensity,
      primary_focus,
      is_active,
      node_type,
      source_key,
      source_rule_id,
      source_course,
      curriculum_payload,
      generated_from_rule,
      is_optional,
      is_rest_day,
      requires_user_selection,
      mastery_gate_required,
      curriculum_phase,
      practice_track,
      completion_requirement
    )
    SELECT
      nextval('public.program_curriculum_id_seq'),
      rti.sequence_id,
      'iyengar_integrated_master_path_draft_v1',
      'Iyengar Integrated Master Path - Draft v1',
      rti.week_number,
      rti.day_number,
      rti.order_index,
      false,
      NULL,
      'How to Use Yoga',
      'How to Use Yoga',
      1,
      NULL,
      'Foundational practice',
      true,
      'sequence',
      'how_to_use_yoga',
      NULL,
      'How to Use Yoga',
      jsonb_build_object(
        'repair_migration', true,
        'restored_after_incorrect_category_cleanup', true,
        'source_sequence_id', rti.sequence_id,
        'category_id', 10,
        'reason', 'Category 10 / How to Use Yoga is allowed in the integrated curriculum'
      ),
      true,
      false,
      false,
      false,
      false,
      'foundation',
      'asana',
      'attempt'
    FROM rows_to_insert rti;

  END IF;
END $$;
