drop function if exists public.resolve_revision_curriculum_node(bigint, uuid);

create or replace function public.resolve_revision_curriculum_node(
  p_curriculum_node_id bigint,
  p_user_id uuid default auth.uid()
)
returns table(
  resolved_sequence_id bigint,
  resolved_course_title text,
  reason text
)
language sql
security definer
set search_path to 'public'
as $function$
  with target as (
    select
      pc.id,
      pc.curriculum_slug,
      pc.order_index,
      pc.source_policy
    from public.program_curriculum pc
    where pc.id = p_curriculum_node_id
    limit 1
  ),

  user_completion as (
    select
      sc.sequence_id,
      c.title,
      case
        when sc.rating is not null and sc.rating <= 2
        then 'Adaptive review resolved to a lower-rated completed practice.'
        else 'Adaptive review resolved to a recent completed practice.'
      end as reason,
      case
        when sc.rating is not null and sc.rating <= 2 then 0
        else 1
      end as priority,
      sc.completed_at,
      null::numeric as order_index
    from target t
    join public.sequence_completions sc
      on sc.curriculum_node_id is not null
     and sc.sequence_id is not null
     and coalesce(sc.completed, true) = true
     and (p_user_id is null or sc.user_id is null or sc.user_id = p_user_id)
    join public.program_curriculum completed_node
      on completed_node.id = sc.curriculum_node_id
     and completed_node.curriculum_slug = t.curriculum_slug
     and completed_node.order_index < t.order_index
    left join public.courses c
      on c.id = sc.sequence_id
    order by priority, sc.completed_at desc
    limit 1
  ),

  previous_source_node as (
    select
      coalesce(
        (pc.curriculum_payload->'practice_composition'->0->>'sequence_id')::bigint,
        pc.sequence_id
      ) as sequence_id,
      coalesce(c_comp.title, c.title) as title,
      'Adaptive review fell back to the previous source-backed curriculum practice.'::text as reason,
      2 as priority,
      null::timestamptz as completed_at,
      pc.order_index
    from target t
    join public.program_curriculum pc
      on pc.curriculum_slug = t.curriculum_slug
     and pc.order_index < t.order_index
     and pc.is_active = true
     and pc.is_visible = true
     and (
       pc.sequence_id is not null
       or jsonb_array_length(coalesce(pc.curriculum_payload->'practice_composition', '[]'::jsonb)) > 0
     )
    left join public.courses c
      on c.id = pc.sequence_id
    left join public.courses c_comp
      on c_comp.id = (pc.curriculum_payload->'practice_composition'->0->>'sequence_id')::bigint
    order by pc.order_index desc
    limit 1
  ),

  candidates as (
    select * from user_completion
    union all
    select * from previous_source_node
  )

  select
    candidates.sequence_id as resolved_sequence_id,
    candidates.title as resolved_course_title,
    candidates.reason
  from candidates
  where candidates.sequence_id is not null
  order by candidates.priority, candidates.completed_at desc nulls last, candidates.order_index desc nulls last
  limit 1;
$function$;

create or replace function public.get_today_curriculum_practice(
  p_curriculum_slug text default 'iyengar_integrated_master_path_draft_v0',
  p_user_id uuid default auth.uid(),
  p_repeat_node_id bigint default null
)
returns table(
  curriculum_node_id bigint,
  curriculum_slug text,
  program_name text,
  week_number integer,
  day_number integer,
  order_index numeric,
  node_type text,
  resolved_node_type text,
  resolved_sequence_id bigint,
  resolved_course_title text,
  source_name text,
  source_key text,
  source_course text,
  source_reference text,
  practice_track text,
  curriculum_phase text,
  intensity text,
  primary_focus text,
  special_instructions text,
  requires_user_selection boolean,
  is_rest_day boolean,
  completion_requirement text,
  curriculum_payload jsonb,
  resolution_reason text,
  day_role text,
  recovery_type text,
  is_visible boolean,
  source_policy text,
  source_sequence_order integer,
  estimated_minutes integer,
  curriculum_unit_id text,
  adaptive_behavior jsonb
)
language sql
security definer
set search_path to 'public'
as $function$
  with next_node as (
    select
      pc.id as curriculum_node_id,
      pc.curriculum_slug,
      pc.program_name,
      pc.week_number,
      pc.day_number,
      pc.order_index,
      pc.node_type,
      pc.sequence_id,
      pc.source_name,
      pc.source_key,
      pc.source_course,
      pc.source_reference,
      pc.practice_track,
      pc.curriculum_phase,
      pc.intensity,
      pc.primary_focus,
      pc.special_instructions,
      pc.requires_user_selection,
      pc.is_rest_day,
      pc.completion_requirement,
      pc.curriculum_payload,
      pc.day_role,
      pc.recovery_type,
      pc.is_visible,
      pc.source_policy,
      pc.source_sequence_order,
      pc.estimated_minutes,
      pc.curriculum_unit_id,
      pc.adaptive_behavior::jsonb as adaptive_behavior
    from public.program_curriculum pc
    where p_repeat_node_id is not null
      and pc.id = p_repeat_node_id
      and pc.curriculum_slug = p_curriculum_slug
      and pc.is_active = true
      and pc.is_visible = true

    union all

    select *
    from public.get_next_curriculum_node(p_curriculum_slug)
    where p_repeat_node_id is null
  ),

  adaptive_resolution as (
    select rr.*
    from next_node nn
    cross join lateral public.resolve_revision_curriculum_node(
      nn.curriculum_node_id,
      p_user_id
    ) rr
    where nn.node_type in ('revision', 'choice', 'consolidation')
       or nn.source_policy in ('adaptive_revision', 'adaptive_consolidation')
  )

  select
    nn.curriculum_node_id,
    nn.curriculum_slug,
    nn.program_name,
    nn.week_number,
    nn.day_number,
    nn.order_index,
    nn.node_type,
    case
      when (nn.node_type in ('revision', 'choice', 'consolidation')
            or nn.source_policy in ('adaptive_revision', 'adaptive_consolidation'))
        and ar.resolved_sequence_id is not null
      then 'sequence'
      when nn.node_type in ('rest', 'recovery')
      then nn.node_type
      else nn.node_type
    end as resolved_node_type,
    case
      when nn.node_type in ('revision', 'choice', 'consolidation')
        or nn.source_policy in ('adaptive_revision', 'adaptive_consolidation')
      then ar.resolved_sequence_id
      else nn.sequence_id
    end as resolved_sequence_id,
    case
      when nn.node_type in ('revision', 'choice', 'consolidation')
        or nn.source_policy in ('adaptive_revision', 'adaptive_consolidation')
      then ar.resolved_course_title
      else c.title
    end as resolved_course_title,
    nn.source_name,
    nn.source_key,
    nn.source_course,
    nn.source_reference,
    nn.practice_track,
    nn.curriculum_phase,
    nn.intensity,
    nn.primary_focus,
    nn.special_instructions,
    nn.requires_user_selection,
    nn.is_rest_day,
    nn.completion_requirement,
    nn.curriculum_payload,
    case
      when (nn.node_type in ('revision', 'choice', 'consolidation')
            or nn.source_policy in ('adaptive_revision', 'adaptive_consolidation'))
        and ar.resolved_sequence_id is not null
      then ar.reason
      when nn.node_type in ('revision', 'choice', 'consolidation')
        or nn.source_policy in ('adaptive_revision', 'adaptive_consolidation')
      then 'Adaptive node: no prior source-backed sequence is available yet.'
      when nn.node_type = 'recovery'
      then 'Recovery node: no sequence required.'
      when nn.node_type = 'rest'
      then 'Rest node: no sequence required.'
      when nn.node_type in ('instruction', 'assessment', 'mastery_gate', 'reserve')
        and nn.sequence_id is null
      then 'Non-sequence curriculum node: no sequence required.'
      when p_repeat_node_id is not null
      then 'Repeat: low rating on previous attempt.'
      else 'Fixed sequence node.'
    end as resolution_reason,
    nn.day_role,
    nn.recovery_type,
    nn.is_visible,
    nn.source_policy,
    nn.source_sequence_order,
    nn.estimated_minutes,
    nn.curriculum_unit_id,
    nn.adaptive_behavior::jsonb as adaptive_behavior
  from next_node nn
  left join adaptive_resolution ar
    on true
  left join public.courses c
    on c.id = nn.sequence_id;
$function$;
