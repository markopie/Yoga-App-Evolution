-- ============================================================
-- course_pose_index
-- ============================================================
-- Derived read model for direct authored pose search.
-- V1 intentionally indexes only direct `type = "pose"` entries in courses.sequence_json.
-- It does not expand linked macro sequences or injected preparatory/recovery poses.

create table if not exists public.course_pose_index (
    course_id bigint not null references public.courses(id) on delete cascade,
    pose_id text not null,
    occurrence_count integer not null default 1 check (occurrence_count > 0),
    first_order_index integer null,
    source_type text not null default 'direct',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (course_id, pose_id, source_type),
    constraint course_pose_index_pose_id_not_blank check (btrim(pose_id) <> ''),
    constraint course_pose_index_source_type_not_blank check (btrim(source_type) <> '')
);

create index if not exists course_pose_index_pose_id_idx
    on public.course_pose_index (pose_id);

create index if not exists course_pose_index_course_id_idx
    on public.course_pose_index (course_id);

create index if not exists course_pose_index_pose_source_idx
    on public.course_pose_index (pose_id, source_type);

alter table public.course_pose_index enable row level security;

drop policy if exists "Users read visible course pose index" on public.course_pose_index;

create policy "Users read visible course pose index"
    on public.course_pose_index
    for select
    to anon, authenticated
    using (
        exists (
            select 1
            from public.courses c
            where c.id = course_pose_index.course_id
              and (
                  coalesce(c.is_system, false) = true
                  or auth.uid() = c.user_id
              )
        )
    );

grant select on public.course_pose_index to anon, authenticated;

create or replace function public.normalize_course_pose_id(p_pose_id text)
returns text
language sql
immutable
as $$
    select case
        when nullif(btrim(p_pose_id), '') is null then ''
        when lower(btrim(p_pose_id)) ~ '^[0-9]+[a-z]?$' then
            lpad(regexp_replace(lower(btrim(p_pose_id)), '^([0-9]+)[a-z]?$', '\1'), 3, '0') ||
            coalesce(
                nullif(
                    regexp_replace(lower(btrim(p_pose_id)), '^[0-9]+([a-z])$', '\1'),
                    lower(btrim(p_pose_id))
                ),
                ''
            )
        else lower(btrim(p_pose_id))
    end;
$$;

create or replace function public.refresh_course_pose_index(p_course_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.course_pose_index
    where course_id = p_course_id
      and source_type = 'direct';

    insert into public.course_pose_index (
        course_id,
        pose_id,
        occurrence_count,
        first_order_index,
        source_type,
        updated_at
    )
    with direct_pose_rows as (
        select
            c.id as course_id,
            public.normalize_course_pose_id(item.elem ->> 'pose_id') as pose_id,
            (item.ordinality - 1)::integer as order_index
        from public.courses c
        cross join lateral jsonb_array_elements(
            case
                when jsonb_typeof(c.sequence_json::jsonb) = 'array' then c.sequence_json::jsonb
                else '[]'::jsonb
            end
        ) with ordinality as item(elem, ordinality)
        where c.id = p_course_id
          and item.elem ->> 'type' = 'pose'
          and nullif(btrim(item.elem ->> 'pose_id'), '') is not null
    ),
    grouped as (
        select
            course_id,
            pose_id,
            count(*)::integer as occurrence_count,
            min(order_index)::integer as first_order_index
        from direct_pose_rows
        where pose_id <> ''
        group by course_id, pose_id
    )
    select
        course_id,
        pose_id,
        occurrence_count,
        first_order_index,
        'direct',
        now()
    from grouped
    on conflict (course_id, pose_id, source_type) do update
    set occurrence_count = excluded.occurrence_count,
        first_order_index = excluded.first_order_index,
        updated_at = now();
end;
$$;

create or replace function public.refresh_course_pose_index_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.refresh_course_pose_index(new.id);
    return new;
end;
$$;

drop trigger if exists refresh_course_pose_index_on_courses on public.courses;

create trigger refresh_course_pose_index_on_courses
    after insert or update of sequence_json
    on public.courses
    for each row
    execute function public.refresh_course_pose_index_trigger();

do $$
declare
    course_row record;
begin
    for course_row in select id from public.courses loop
        perform public.refresh_course_pose_index(course_row.id);
    end loop;
end;
$$;

revoke execute on function public.refresh_course_pose_index(bigint) from public;
revoke execute on function public.refresh_course_pose_index_trigger() from public;

-- Verification:
-- select count(*) as indexed_rows from public.course_pose_index;
-- select pose_id, count(*) as course_count from public.course_pose_index group by pose_id order by course_count desc limit 10;
