/*
  # Make Light on Yoga Course 1 the first active curriculum node

  ## Summary
  Moves the existing active Light on Yoga Course 1 Week 1 & 2 curriculum row
  (sequence 114) to Week 1 Day 1 / order_index 1.01 for draft_v1.

  Also removes the stale inactive Light on Pranayama 52 placeholder reference
  to the removed How to Use Yoga host sequence 173. Sequence 52 remains
  inactive pending a future pranayama scheduling decision.

  ## Scope
  - program_curriculum row for sequence 114 in draft_v1
  - inactive program_curriculum row for sequence 52 in draft_v1
  - no sequence_completions changes
  - no RPC, roadmap, completion, or adaptive progression changes
*/

begin;

update public.program_curriculum
set
  week_number = 1,
  day_number = 1,
  order_index = 1.01
where curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
  and sequence_id = 114
  and is_active = true;

update public.program_curriculum
set
  special_instructions = 'Inactive deferred pranayama node: Light on Pranayama Week 1 and 2 is deferred pending future pranayama scheduling.',
  curriculum_payload = jsonb_set(
    jsonb_set(
      coalesce(curriculum_payload, '{}'::jsonb) #- '{superseded_by_curriculum_node_sequence_id}',
      '{inactive_reason}',
      to_jsonb('deferred_pending_pranayama_scheduling'::text),
      true
    ),
    '{composition_strategy}',
    to_jsonb('deferred_pending_pranayama_scheduling'::text),
    true
  )
where curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
  and sequence_id = 52
  and is_active = false
  and curriculum_payload->>'superseded_by_curriculum_node_sequence_id' = '173';

commit;
