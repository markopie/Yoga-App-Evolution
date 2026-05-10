/*
  # Backfill protected curriculum source-block metadata

  ## Summary
  Adds missing metadata keys to existing `program_curriculum.curriculum_payload`
  rows for the integrated draft curriculum. This is a narrow data repair only:
  it does not reseed, reorder, create, delete, or reactivate curriculum rows,
  and it does not touch completions or progression RPCs.

  ## Scope
  - Light on Yoga Course 1 backbone: sequences 114-124
  - Light on Yoga Course 1 weekly plateau practices: sequences 125-127
  - Light on Yoga important asanas reference collection: sequence 113
  - Light on Pranayama Course 1 parallel thread: sequences 52-66
    - inactive standalone rows are marked `composed_part_only`
    - existing composed-practice parts are annotated where present

  ## Rollback
  To reverse this repair, remove these keys from `curriculum_payload` for the
  same sequence IDs in the same slug, and remove the same keys from matching
  `practice_composition` part objects:
  `sequence_block_type`, `block_id`, `block_position`, `block_total`,
  `source_week_label`.
*/

begin;

with metadata(sequence_id, sequence_block_type, block_id, block_position, block_total) as (
  values
    (113, 'reference_collection', null, null, null),

    (114, 'authored_weekly_practice', 'loy_course1_backbone', 1, 11),
    (115, 'authored_weekly_practice', 'loy_course1_backbone', 2, 11),
    (116, 'authored_weekly_practice', 'loy_course1_backbone', 3, 11),
    (117, 'authored_weekly_practice', 'loy_course1_backbone', 4, 11),
    (118, 'authored_weekly_practice', 'loy_course1_backbone', 5, 11),
    (119, 'authored_weekly_practice', 'loy_course1_backbone', 6, 11),
    (120, 'authored_weekly_practice', 'loy_course1_backbone', 7, 11),
    (121, 'authored_weekly_practice', 'loy_course1_backbone', 8, 11),
    (122, 'authored_weekly_practice', 'loy_course1_backbone', 9, 11),
    (123, 'authored_weekly_practice', 'loy_course1_backbone', 10, 11),
    (124, 'authored_weekly_practice', 'loy_course1_backbone', 11, 11),

    (125, 'authored_weekly_practice', 'loy_course1_weekly_practices', 1, 3),
    (126, 'authored_weekly_practice', 'loy_course1_weekly_practices', 2, 3),
    (127, 'authored_weekly_practice', 'loy_course1_weekly_practices', 3, 3),

    (52, 'composed_part_only', 'lop_course1_parallel', 1, 15),
    (53, 'composed_part_only', 'lop_course1_parallel', 2, 15),
    (54, 'composed_part_only', 'lop_course1_parallel', 3, 15),
    (55, 'composed_part_only', 'lop_course1_parallel', 4, 15),
    (56, 'composed_part_only', 'lop_course1_parallel', 5, 15),
    (57, 'composed_part_only', 'lop_course1_parallel', 6, 15),
    (58, 'composed_part_only', 'lop_course1_parallel', 7, 15),
    (59, 'composed_part_only', 'lop_course1_parallel', 8, 15),
    (60, 'composed_part_only', 'lop_course1_parallel', 9, 15),
    (61, 'composed_part_only', 'lop_course1_parallel', 10, 15),
    (62, 'composed_part_only', 'lop_course1_parallel', 11, 15),
    (63, 'composed_part_only', 'lop_course1_parallel', 12, 15),
    (64, 'composed_part_only', 'lop_course1_parallel', 13, 15),
    (65, 'composed_part_only', 'lop_course1_parallel', 14, 15),
    (66, 'composed_part_only', 'lop_course1_parallel', 15, 15)
)
update public.program_curriculum pc
set curriculum_payload = coalesce(pc.curriculum_payload, '{}'::jsonb)
  || jsonb_build_object(
    'sequence_block_type', metadata.sequence_block_type,
    'block_id', metadata.block_id,
    'block_position', metadata.block_position,
    'block_total', metadata.block_total,
    'source_week_label', pc.source_reference
  )
from metadata
where pc.curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
  and pc.sequence_id = metadata.sequence_id;

with metadata(sequence_id, block_position, source_week_label) as (
  values
    (52, 1, 'Week 1 and 2'),
    (53, 2, 'Week 3 and 4'),
    (54, 3, 'Week 5 and 6'),
    (55, 4, 'Week 7 and 8'),
    (56, 5, 'Week 9 and 10'),
    (57, 6, 'Week 11 and 12'),
    (58, 7, 'Week 13 and 15'),
    (59, 8, 'Week 16 and 18'),
    (60, 9, 'Week 19 and 22'),
    (61, 10, 'Week 23 and 25'),
    (62, 11, 'Week 26 to 28'),
    (63, 12, 'Week 29 to 31'),
    (64, 13, 'Week 32 to 34'),
    (65, 14, 'Week 35 to 38'),
    (66, 15, 'Week 39 to 42')
)
update public.program_curriculum pc
set curriculum_payload = jsonb_set(
  coalesce(pc.curriculum_payload, '{}'::jsonb),
  '{practice_composition}',
  (
    select jsonb_agg(
      case
        when metadata.sequence_id is not null
        then part.value || jsonb_build_object(
          'sequence_block_type', 'authored_weekly_practice',
          'block_id', 'lop_course1_parallel',
          'block_position', metadata.block_position,
          'block_total', 15,
          'source_week_label', metadata.source_week_label
        )
        else part.value
      end
      order by part.ordinality
    )
    from jsonb_array_elements(pc.curriculum_payload->'practice_composition') with ordinality as part(value, ordinality)
    left join metadata
      on metadata.sequence_id = (part.value->>'sequence_id')::integer
  )
)
where pc.curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
  and pc.curriculum_payload ? 'practice_composition'
  and exists (
    select 1
    from jsonb_array_elements(pc.curriculum_payload->'practice_composition') as part(value)
    join metadata
      on metadata.sequence_id = (part.value->>'sequence_id')::integer
  );

commit;
