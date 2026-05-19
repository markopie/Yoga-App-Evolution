alter table public.program_curriculum
add column if not exists day_role text,
add column if not exists recovery_type text,
add column if not exists is_visible boolean not null default true,
add column if not exists source_policy text,
add column if not exists source_sequence_order integer,
add column if not exists estimated_minutes integer,
add column if not exists curriculum_unit_id text,
add column if not exists adaptive_behavior jsonb not null default '{}'::jsonb;

create index if not exists idx_program_curriculum_slug_visible_order
  on public.program_curriculum(curriculum_slug, order_index)
  where is_active = true and is_visible = true;

drop function if exists public.get_today_curriculum_practice(text, uuid, bigint);
drop function if exists public.get_next_curriculum_node(text);

create or replace function public.get_next_curriculum_node(
  p_curriculum_slug text default 'iyengar_integrated_master_path_draft_v0'
)
returns table(
  curriculum_node_id bigint,
  curriculum_slug text,
  program_name text,
  week_number integer,
  day_number integer,
  order_index numeric,
  node_type text,
  sequence_id bigint,
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
    pc.adaptive_behavior
  from public.program_curriculum pc
  where pc.curriculum_slug = p_curriculum_slug
    and pc.is_active = true
    and pc.is_visible = true
    and not exists (
      select 1
      from public.sequence_completions sc
      where sc.curriculum_node_id = pc.id
        and coalesce(sc.completed, true) = true
    )
  order by pc.order_index
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
      pc.adaptive_behavior
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

  revision_resolution as (
    select rr.*
    from next_node nn
    cross join lateral public.resolve_revision_curriculum_node(
      nn.curriculum_node_id,
      p_user_id
    ) rr
    where nn.node_type in ('revision', 'choice')
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
      when nn.node_type in ('revision', 'choice')
        and rr.resolved_sequence_id is not null
      then 'sequence'
      when nn.node_type in ('rest', 'recovery')
      then nn.node_type
      else nn.node_type
    end as resolved_node_type,
    case
      when nn.node_type in ('revision', 'choice')
      then rr.resolved_sequence_id
      else nn.sequence_id
    end as resolved_sequence_id,
    case
      when nn.node_type in ('revision', 'choice')
      then rr.resolved_course_title
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
      when nn.node_type in ('revision', 'choice')
        and rr.resolved_sequence_id is not null
      then rr.reason
      when nn.node_type in ('revision', 'choice')
      then 'Selection node: no completed sequence is available yet.'
      when nn.node_type = 'recovery'
      then 'Recovery node: no sequence required.'
      when nn.node_type = 'rest'
      then 'Rest node: no sequence required.'
      when nn.node_type in ('instruction', 'assessment', 'mastery_gate', 'reserve', 'consolidation')
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
    nn.adaptive_behavior
  from next_node nn
  left join revision_resolution rr
    on true
  left join public.courses c
    on c.id = nn.sequence_id;
$function$;
