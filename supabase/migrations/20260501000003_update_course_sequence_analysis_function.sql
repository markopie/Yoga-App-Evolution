create or replace function public.refresh_course_sequence_analysis_for_course(
    p_course_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.course_sequence_analysis (
    course_id,
    course_title,

    primary_theme,
    secondary_theme,
    top_theme_share,
    second_theme_share,

    weighted_intensity,
    max_intensity,
    intensity_band,

    total_duration_seconds,
    total_duration_minutes,

    theme_classification_seconds,
    theme_classification_minutes,

    pose_count,

    restorative_seconds,
    restorative_minutes,
    restorative_share,

    theme_profile,
    all_theme_profile,
    restorative_theme_profile,

    missing_pose_ids,
    missing_stage_ids,

    analysed_at
  )

  with recursive expanded_items as (
    -- Base case: root course items
    select
      c.id                                 as root_course_id,
      c.title                              as root_course_title,
      c.id                                 as source_course_id,
      c.sub_category_id                    as source_course_sub_category_id,
      x.item,
      x.item->>'type'                      as item_type,
      array[x.ordinality]                  as order_path,
      0                                    as expansion_depth,
      array[c.id]::bigint[]                as visited_course_ids,
      1::integer                           as macro_multiplier
    from public.courses c
    cross join lateral jsonb_array_elements(c.sequence_json)
      with ordinality as x(item, ordinality)
    where c.id = p_course_id
      and c.sequence_json is not null
      and jsonb_typeof(c.sequence_json) = 'array'
      and x.item is not null
      and x.item->>'type' is not null

    union all

    -- Recursive case: expand macro items
    select
      ei.root_course_id,
      ei.root_course_title,
      linked.id                            as source_course_id,
      linked.sub_category_id               as source_course_sub_category_id,
      x.item,
      x.item->>'type'                      as item_type,
      ei.order_path || x.ordinality        as order_path,
      ei.expansion_depth + 1               as expansion_depth,
      ei.visited_course_ids || linked.id   as visited_course_ids,
      ei.macro_multiplier
        * coalesce(nullif(ei.item->>'rounds', '')::integer, 1) as macro_multiplier
    from expanded_items ei
    inner join lateral (
      select c.*
      from public.courses c
      where c.id = (ei.item->>'sequence_id')::bigint
        and c.sequence_json is not null
        and jsonb_typeof(c.sequence_json) = 'array'
    ) linked on true
    cross join lateral jsonb_array_elements(linked.sequence_json)
      with ordinality as x(item, ordinality)
    where ei.item_type = 'macro'
      and ei.expansion_depth < 12
      and not ((ei.item->>'sequence_id')::bigint = any(ei.visited_course_ids))
  ),

  -- Assign final ordinality based on expanded order_path
  expanded_ordered as (
    select
      ei.*,
      row_number() over (order by ei.order_path) as ordinality
    from expanded_items ei
  ),

  loop_ranges as (
    select
      eo.root_course_id,
      eo.ordinality as loop_start_ord,
      (
        select min(eo2.ordinality)
        from expanded_ordered eo2
        where eo2.root_course_id = eo.root_course_id
          and eo2.ordinality > eo.ordinality
          and eo2.item_type = 'loop_end'
      ) as loop_end_ord,
      coalesce(nullif(eo.item->>'rounds', '')::integer, 1) as rounds
    from expanded_ordered eo
    where eo.item_type = 'loop_start'
  ),

  pose_items as (
    select
      eo.root_course_id as course_id,
      eo.root_course_title as course_title,
      eo.source_course_id,
      eo.source_course_sub_category_id,
      eo.ordinality,
      row_number() over (
        partition by eo.root_course_id
        order by eo.ordinality
      ) as pose_index,

      eo.item,
      eo.item->>'pose_id' as pose_id_raw,
      nullif(eo.item->>'stage_id', '')::bigint as stage_id,
      lower(coalesce(nullif(eo.item->>'tier', ''), 'standard')) as hold_tier,
      nullif(eo.item->>'side', '') as side_raw,

      eo.macro_multiplier,

      coalesce(
        round(exp(sum(ln(lr.rounds::numeric))))::integer,
        1
      ) as loop_multiplier

    from expanded_ordered eo
    left join loop_ranges lr
      on lr.root_course_id = eo.root_course_id
     and lr.loop_end_ord is not null
     and eo.ordinality > lr.loop_start_ord
     and eo.ordinality < lr.loop_end_ord
    where eo.item_type = 'pose'
    group by
      eo.root_course_id,
      eo.root_course_title,
      eo.source_course_id,
      eo.source_course_sub_category_id,
      eo.ordinality,
      eo.item,
      eo.macro_multiplier
  ),


  course_pose_positions as (
    select
      course_id,
      max(pose_index) as last_pose_index,
      max(pose_index) filter (where pose_id_raw = '200') as last_savasana_pose_index
    from pose_items
    group by course_id
  ),

  resolved_base as (
    select
      pi.course_id,
      pi.course_title,
      pi.source_course_sub_category_id,
      pi.ordinality,
      pi.pose_index,
      pi.pose_id_raw,
      pi.stage_id,
      pi.hold_tier,
      pi.side_raw,
      pi.loop_multiplier,
      pi.macro_multiplier,


      a.id as asana_id,
      a.name as asana_name,
      a.category_id as base_category_id,
      ac_base.name as base_category_name,

      nullif(nullif(a.intensity::text, '-'), '')::numeric as base_intensity,
      coalesce(a.is_restorative, false) as base_is_restorative,
      coalesce(a.requires_sides, false) as requires_sides,

      st.id as resolved_stage_id,
      st.title as stage_title,
      st.category_id_override,
      ac_stage.name as stage_category_override_name,
      st.intensity_override,
      coalesce(st.is_restorative, false) as stage_is_restorative,

      coalesce(st.category_id_override, a.category_id) as effective_category_id,
      coalesce(ac_stage.name, ac_base.name) as effective_category_name,

      coalesce(
        st.intensity_override,
        nullif(nullif(a.intensity::text, '-'), '')::numeric
      ) as effective_intensity,

      (
        coalesce(a.is_restorative, false)
        or coalesce(st.is_restorative, false)
      ) as effective_is_restorative,

      case
        when coalesce(a.requires_sides, false)
          and (
            pi.side_raw is null
            or lower(pi.side_raw) in ('both', 'all', 'null')
          )
        then 2
        else 1
      end as side_multiplier,

      case
        -- Flow courses: authored duration first, then flow hold, then standard hold.
        -- Use source_course_sub_category_id so linked courses use their own Flow/Cycle status.
        when pi.source_course_sub_category_id = 55 then

          coalesce(
            case
              when nullif(pi.item->>'duration', '') is not null then
                case
                  when (pi.item->>'duration') ~ '^\s*\d+(\.\d+)?\s*$'
                  then round((pi.item->>'duration')::numeric)::integer
                  else public.yoga_parse_hold_seconds(pi.item->>'duration')
                end
              else null
            end,
            public.yoga_parse_hold_seconds(st.hold_json ->> 'flow'),
            public.yoga_parse_hold_seconds(a.hold_json ->> 'flow'),
            public.yoga_parse_hold_seconds(st.hold_json ->> 'standard'),
            public.yoga_parse_hold_seconds(a.hold_json ->> 'standard'),
            0
          )

        -- Cycle and normal courses: ignore sequence_json.duration.
        -- Use selected tier first, then standard.
        else
          coalesce(
            public.yoga_parse_hold_seconds(st.hold_json ->> pi.hold_tier),
            public.yoga_parse_hold_seconds(a.hold_json ->> pi.hold_tier),
            public.yoga_parse_hold_seconds(st.hold_json ->> 'standard'),
            public.yoga_parse_hold_seconds(a.hold_json ->> 'standard'),
            0
          )
      end as base_duration_seconds,

      case
        -- Savasana should not decide the teaching theme.
        when pi.pose_id_raw = '200' then true

        -- Standard finishing inversions should remain in all_theme_profile and total duration,
        -- but should not dominate the teaching-theme classification when they appear
        -- immediately before Savasana.
        when pi.pose_id_raw in ('074', '087', '091', '234')
        and cpp.last_savasana_pose_index is not null
        and pi.pose_index between cpp.last_savasana_pose_index - 5
                                and cpp.last_savasana_pose_index - 1
        then true

        else false
      end as exclude_from_teaching_theme

    from pose_items pi
    left join course_pose_positions cpp
      on cpp.course_id = pi.course_id
    left join public.asanas a
      on a.id::text = pi.pose_id_raw::text
    left join public.asana_categories ac_base
      on ac_base.id = a.category_id
    left join public.stages st
      on st.id = pi.stage_id
    left join public.asana_categories ac_stage
      on ac_stage.id = st.category_id_override
  ),

  resolved as (
    select
      rb.*,
      rb.base_duration_seconds
      * rb.loop_multiplier
      * rb.side_multiplier
      * rb.macro_multiplier as duration_seconds
    from resolved_base rb
  ),


  course_totals as (
    select
      course_id,
      course_title,

      sum(duration_seconds)::integer as total_duration_seconds,
      count(*)::integer as pose_count,

      sum(duration_seconds) filter (
        where exclude_from_teaching_theme = false
      )::integer as theme_classification_seconds,

      sum(duration_seconds) filter (
        where effective_is_restorative
      )::integer as restorative_seconds,

      sum(duration_seconds * effective_intensity)
        / nullif(
            sum(duration_seconds) filter (where effective_intensity is not null),
            0
          ) as weighted_intensity,

      max(effective_intensity) as max_intensity

    from resolved
    group by course_id, course_title
  ),

  theme_category_totals as (
    select
      course_id,
      course_title,
      effective_category_name,
      sum(duration_seconds)::integer as category_seconds
    from resolved
    where effective_category_name is not null
      and exclude_from_teaching_theme = false
    group by course_id, course_title, effective_category_name
  ),

  ranked_theme_categories as (
    select
      tct.*,
      ctot.theme_classification_seconds,
      round(
        100.0 * tct.category_seconds
        / nullif(ctot.theme_classification_seconds, 0),
        2
      ) as category_share_pct,
      row_number() over (
        partition by tct.course_id
        order by tct.category_seconds desc, tct.effective_category_name
      ) as rn
    from theme_category_totals tct
    join course_totals ctot
      on ctot.course_id = tct.course_id
  ),

  theme_summary as (
    select
      course_id,
      max(case when rn = 1 then effective_category_name end) as top_theme,
      max(case when rn = 1 then category_share_pct end) as top_theme_share,
      max(case when rn = 2 then effective_category_name end) as second_theme,
      max(case when rn = 2 then category_share_pct end) as second_theme_share,

      jsonb_object_agg(
        effective_category_name,
        jsonb_build_object(
          'seconds', category_seconds,
          'share_pct', category_share_pct
        )
        order by category_seconds desc
      ) as theme_profile
    from ranked_theme_categories
    group by course_id
  ),

  all_category_totals as (
    select
      course_id,
      effective_category_name,
      sum(duration_seconds)::integer as category_seconds
    from resolved
    where effective_category_name is not null
    group by course_id, effective_category_name
  ),

  all_theme_profile as (
    select
      act.course_id,
      jsonb_object_agg(
        act.effective_category_name,
        jsonb_build_object(
          'seconds', act.category_seconds,
          'share_pct', round(
            100.0 * act.category_seconds
            / nullif(ctot.total_duration_seconds, 0),
            2
          )
        )
        order by act.category_seconds desc
      ) as all_theme_profile
    from all_category_totals act
    join course_totals ctot
      on ctot.course_id = act.course_id
    group by act.course_id
  ),

  restorative_category_totals as (
    select
      course_id,
      effective_category_name,
      sum(duration_seconds)::integer as category_seconds
    from resolved
    where effective_category_name is not null
      and effective_is_restorative
    group by course_id, effective_category_name
  ),

  restorative_theme_profile as (
    select
      rct.course_id,
      jsonb_object_agg(
        rct.effective_category_name,
        jsonb_build_object(
          'seconds', rct.category_seconds,
          'share_pct', round(
            100.0 * rct.category_seconds
            / nullif(ctot.restorative_seconds, 0),
            2
          )
        )
        order by rct.category_seconds desc
      ) as restorative_theme_profile
    from restorative_category_totals rct
    join course_totals ctot
      on ctot.course_id = rct.course_id
    group by rct.course_id
  ),

  missing_pose_ids as (
    select
      course_id,
      jsonb_agg(distinct pose_id_raw order by pose_id_raw) as missing_pose_ids
    from resolved
    where pose_id_raw is not null
      and asana_id is null
    group by course_id
  ),

  missing_stage_ids as (
    select
      course_id,
      jsonb_agg(distinct stage_id order by stage_id) as missing_stage_ids
    from resolved
    where stage_id is not null
      and resolved_stage_id is null
    group by course_id
  )

  select
    ctot.course_id,
    ctot.course_title,

    case
      when ts.top_theme is null then null
      when ts.top_theme_share < 45 then 'Mixed'
      else ts.top_theme
    end as primary_theme,

    case
      when ts.second_theme_share >= 20 then ts.second_theme
      else null
    end as secondary_theme,

    ts.top_theme_share,
    ts.second_theme_share,

    round(ctot.weighted_intensity, 2) as weighted_intensity,
    ctot.max_intensity,

    case
      when ctot.weighted_intensity is null then null
      when ctot.weighted_intensity <= 1.5 then 'restorative'
      when ctot.weighted_intensity <= 4 then 'light'
      when ctot.weighted_intensity <= 8 then 'moderate'
      when ctot.weighted_intensity <= 15 then 'strong'
      else 'advanced'
    end as intensity_band,

    ctot.total_duration_seconds,
    round(ctot.total_duration_seconds / 60.0, 2) as total_duration_minutes,

    ctot.theme_classification_seconds,
    round(ctot.theme_classification_seconds / 60.0, 2) as theme_classification_minutes,

    ctot.pose_count,

    coalesce(ctot.restorative_seconds, 0) as restorative_seconds,
    round(coalesce(ctot.restorative_seconds, 0) / 60.0, 2) as restorative_minutes,
    round(
      100.0 * coalesce(ctot.restorative_seconds, 0)
      / nullif(ctot.total_duration_seconds, 0),
      2
    ) as restorative_share,

    ts.theme_profile,
    atp.all_theme_profile,
    rtp.restorative_theme_profile,

    mpi.missing_pose_ids,
    msi.missing_stage_ids,

    now() as analysed_at

  from course_totals ctot
  left join theme_summary ts
    on ts.course_id = ctot.course_id
  left join all_theme_profile atp
    on atp.course_id = ctot.course_id
  left join restorative_theme_profile rtp
    on rtp.course_id = ctot.course_id
  left join missing_pose_ids mpi
    on mpi.course_id = ctot.course_id
  left join missing_stage_ids msi
    on msi.course_id = ctot.course_id

  on conflict (course_id) do update set
    course_title = excluded.course_title,

    primary_theme = excluded.primary_theme,
    secondary_theme = excluded.secondary_theme,
    top_theme_share = excluded.top_theme_share,
    second_theme_share = excluded.second_theme_share,

    weighted_intensity = excluded.weighted_intensity,
    max_intensity = excluded.max_intensity,
    intensity_band = excluded.intensity_band,

    total_duration_seconds = excluded.total_duration_seconds,
    total_duration_minutes = excluded.total_duration_minutes,

    theme_classification_seconds = excluded.theme_classification_seconds,
    theme_classification_minutes = excluded.theme_classification_minutes,

    pose_count = excluded.pose_count,

    restorative_seconds = excluded.restorative_seconds,
    restorative_minutes = excluded.restorative_minutes,
    restorative_share = excluded.restorative_share,

    theme_profile = excluded.theme_profile,
    all_theme_profile = excluded.all_theme_profile,
    restorative_theme_profile = excluded.restorative_theme_profile,

    missing_pose_ids = excluded.missing_pose_ids,
    missing_stage_ids = excluded.missing_stage_ids,

    analysed_at = excluded.analysed_at;

end;
$$;