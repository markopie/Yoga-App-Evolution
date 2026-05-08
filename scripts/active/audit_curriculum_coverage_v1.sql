-- Read-only draft_v1 curriculum coverage audit.
-- This query treats practice_composition as the source-completion schedule for
-- composed nodes, while program_curriculum.sequence_id remains the anchor.

with active_nodes as (
  select *
  from public.program_curriculum
  where curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
    and is_active = true
),
composition_parts as (
  select
    pc.id as curriculum_node_id,
    pc.week_number,
    pc.day_number,
    pc.node_type,
    pc.sequence_id as primary_sequence_id,
    part.ordinality as part_number,
    part.value->>'role' as role,
    (part.value->>'sequence_id')::bigint as sequence_id,
    coalesce((part.value->>'counts_for_source_completion')::boolean, true) as counts_for_source_completion
  from active_nodes pc
  cross join lateral jsonb_array_elements(
    coalesce(pc.curriculum_payload->'practice_composition', '[]'::jsonb)
  ) with ordinality as part(value, ordinality)
),
primary_anchors as (
  select
    id as curriculum_node_id,
    sequence_id
  from active_nodes
  where sequence_id is not null
),
source_completion_schedule as (
  -- Normal single-sequence nodes count by program_curriculum.sequence_id.
  select
    pc.id as curriculum_node_id,
    pc.sequence_id,
    'primary_sequence_id'::text as placement_kind
  from active_nodes pc
  where pc.sequence_id is not null
    and not (pc.curriculum_payload ? 'practice_composition')

  union all

  -- Composed nodes count by concrete practice_composition parts.
  select
    cp.curriculum_node_id,
    cp.sequence_id,
    'practice_composition'::text as placement_kind
  from composition_parts cp
  where cp.counts_for_source_completion = true
),
required_inventory as (
  select sequence_id, source_key, source_course
  from public.source_sequence_inventory
  where is_required = true
),
coverage_by_source as (
  select
    inv.source_key,
    inv.source_course,
    count(distinct inv.sequence_id) as required_sequence_count,
    count(distinct sched.sequence_id) as placed_scheduled_sequence_count,
    count(distinct pa.sequence_id) as placed_as_primary_sequence_id_count,
    count(distinct cp.sequence_id) filter (where cp.counts_for_source_completion = true) as placed_inside_practice_composition_count
  from required_inventory inv
  left join source_completion_schedule sched
    on sched.sequence_id = inv.sequence_id
  left join primary_anchors pa
    on pa.sequence_id = inv.sequence_id
  left join composition_parts cp
    on cp.sequence_id = inv.sequence_id
  group by inv.source_key, inv.source_course
)
select
  source_key,
  source_course,
  required_sequence_count,
  placed_scheduled_sequence_count,
  placed_as_primary_sequence_id_count,
  placed_inside_practice_composition_count,
  required_sequence_count - placed_scheduled_sequence_count as remaining_required_count
from coverage_by_source
order by source_key, source_course;

-- Duplicate source-completion scheduling.
with active_nodes as (
  select *
  from public.program_curriculum
  where curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
    and is_active = true
),
composition_parts as (
  select
    pc.id as curriculum_node_id,
    pc.week_number,
    pc.day_number,
    pc.node_type,
    pc.sequence_id as primary_sequence_id,
    part.ordinality as part_number,
    part.value->>'role' as role,
    (part.value->>'sequence_id')::bigint as sequence_id,
    coalesce((part.value->>'counts_for_source_completion')::boolean, true) as counts_for_source_completion
  from active_nodes pc
  cross join lateral jsonb_array_elements(
    coalesce(pc.curriculum_payload->'practice_composition', '[]'::jsonb)
  ) with ordinality as part(value, ordinality)
),
source_completion_schedule as (
  select
    pc.id as curriculum_node_id,
    pc.week_number,
    pc.day_number,
    pc.node_type,
    pc.is_revision_node,
    pc.completion_requirement,
    pc.sequence_id,
    'primary_sequence_id'::text as placement_kind
  from active_nodes pc
  where pc.sequence_id is not null
    and not (pc.curriculum_payload ? 'practice_composition')

  union all

  select
    cp.curriculum_node_id,
    cp.week_number,
    cp.day_number,
    cp.node_type,
    false as is_revision_node,
    'attempt'::text as completion_requirement,
    cp.sequence_id,
    'practice_composition'::text as placement_kind
  from composition_parts cp
  where cp.counts_for_source_completion = true
),
required_inventory as (
  select sequence_id, source_key, source_course
  from public.source_sequence_inventory
  where is_required = true
)
select
  sched.sequence_id,
  inv.source_key,
  inv.source_course,
  count(*) as scheduled_occurrences,
  jsonb_agg(
    jsonb_build_object(
      'curriculum_node_id', sched.curriculum_node_id,
      'week', sched.week_number,
      'day', sched.day_number,
      'node_type', sched.node_type,
      'placement_kind', sched.placement_kind
    )
    order by sched.week_number, sched.day_number
  ) as occurrences
from source_completion_schedule sched
join required_inventory inv
  on inv.sequence_id = sched.sequence_id
group by sched.sequence_id, inv.source_key, inv.source_course
having count(*) > 1
order by scheduled_occurrences desc, sched.sequence_id;

-- Composed active node validation.
with active_composed_nodes as (
  select *
  from public.program_curriculum
  where curriculum_slug = 'iyengar_integrated_master_path_draft_v1'
    and is_active = true
    and curriculum_payload ? 'practice_composition'
),
composition_parts as (
  select
    pc.id as curriculum_node_id,
    pc.week_number,
    pc.day_number,
    pc.source_reference,
    pc.sequence_id as primary_sequence_id,
    pc.curriculum_payload->>'composed_total_duration_minutes' as payload_total_minutes,
    part.ordinality as part_number,
    part.value->>'role' as role,
    (part.value->>'sequence_id')::bigint as sequence_id,
    coalesce((part.value->>'counts_for_source_completion')::boolean, true) as counts_for_source_completion
  from active_composed_nodes pc
  cross join lateral jsonb_array_elements(pc.curriculum_payload->'practice_composition')
    with ordinality as part(value, ordinality)
)
select
  cp.curriculum_node_id,
  cp.week_number,
  cp.day_number,
  cp.source_reference,
  cp.primary_sequence_id,
  cp.part_number,
  cp.role,
  cp.sequence_id,
  cp.counts_for_source_completion,
  c.title as sequence_title,
  csa.total_duration_minutes as part_duration_minutes,
  cp.payload_total_minutes
from composition_parts cp
left join public.courses c
  on c.id = cp.sequence_id
left join public.course_sequence_analysis csa
  on csa.course_id = cp.sequence_id
order by cp.week_number, cp.day_number, cp.part_number;
