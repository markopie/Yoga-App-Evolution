/*
  # Align restored How to Use Yoga Day 1 curriculum metadata

  ## Summary
  The previous repair migration restored missing category 10 / How to Use Yoga
  Day 1 curriculum nodes. This migration aligns their metadata with the
  original seed script definitions.

  Fixes:
  - program_name consistency
  - special_instructions restored from seed intent
  - level_number follows week-based seed logic
  - curriculum_payload includes standard metadata fields
*/

DO $$
BEGIN
  IF to_regclass('public.program_curriculum') IS NOT NULL THEN

    WITH restored_metadata AS (
      SELECT *
      FROM (VALUES
        (2,  1, 175, 'How to Use Yoga Week 1 Day 3 and 5 continuation.'),
        (3,  1, 178, 'How to Use Yoga Week 2 opening practice.'),
        (4,  1, 179, 'How to Use Yoga Week 2 sitting-oriented practice.'),
        (5,  1, 180, 'How to Use Yoga Week 2 Day 6.'),
        (6,  1, 208, 'How to Use Yoga Week 3 opening practice.'),
        (7,  1, 209, 'How to Use Yoga Week 3 Day 2 and 4.'),
        (8,  1, 211, 'How to Use Yoga Week 3 Day 6.'),
        (9,  1, 212, 'How to Use Yoga Week 3 Day 7. Backbend-focused; keep it conservative.'),
        (11, 1, 206, 'How to Use Yoga Week 4 Day 6.'),
        (12, 1, 207, 'How to Use Yoga Week 4 Day 7. Backbend-focused foundation practice.'),
        (13, 1, 200, 'How to Use Yoga Week 6 opening standing practice, followed by Light on Pranayama Week 32 to 34.'),
        (14, 1, 201, 'How to Use Yoga Week 6 forward-bend practice without new pranayama.'),
        (15, 1, 202, 'How to Use Yoga Week 6 short standing practice without new pranayama.'),
        (16, 1, 203, 'How to Use Yoga Week 6 mixed practice, followed by Light on Pranayama Week 35 to 38.'),
        (17, 1, 196, 'How to Use Yoga Week 7 opening standing practice without new pranayama.'),
        (18, 1, 193, 'How to Use Yoga Week 8 short standing practice without new pranayama.'),
        (19, 1, 198, 'How to Use Yoga Week 7 seated practice, followed by Light on Pranayama Week 39 to 42.'),
        (20, 1, 199, 'How to Use Yoga Week 7 forward-bend practice without new pranayama.'),
        (21, 1, 194, 'How to Use Yoga Week 8 forward-bend practice without new pranayama.'),
        (22, 1, 195, 'How to Use Yoga Week 8 Day 6 consolidation without new pranayama.'),
        (23, 1, 190, 'How to Use Yoga Week 9 Day 6 consolidation without new pranayama.'),
        (24, 1, 191, 'How to Use Yoga Week 9 Day 2 and 4 consolidation without new pranayama.')
      ) AS v(week_number, day_number, sequence_id, special_instructions)
    )
    UPDATE public.program_curriculum pc
    SET
      program_name = 'Integrated Iyengar Practice Path - Draft v1',
      special_instructions = rm.special_instructions,
      level_number = CASE WHEN rm.week_number <= 10 THEN 1 ELSE 2 END,
      curriculum_payload = COALESCE(pc.curriculum_payload, '{}'::jsonb)
        || jsonb_build_object(
          'repair_migration', true,
          'restored_after_incorrect_category_cleanup', true,
          'source_sequence_id', rm.sequence_id,
          'category_id', 10,
          'reason', 'Category 10 / How to Use Yoga is allowed in the integrated curriculum',
          'draft_phase', CASE
            WHEN rm.week_number <= 12 THEN 'v1_12_week_foundation'
            ELSE 'v1_24_week_foundation_to_early_intermediate'
          END,
          'weekly_cadence', 'composed_asana_pranayama_with_revision_and_rest',
          'source_mix', 'loy_backbone_htuy_revision_gem_variety_iyengar_lessons_lop_parallel'
        )
    FROM restored_metadata rm
    WHERE pc.curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
      AND pc.week_number = rm.week_number
      AND pc.day_number = rm.day_number
      AND pc.sequence_id = rm.sequence_id
      AND pc.is_active = true;

  END IF;
END $$;
