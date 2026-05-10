-- ============================================================
-- FIX: course_analysis_refresh_queue (type + RLS safe version)
-- ============================================================

-- ============================================================
-- STEP 0: Drop processor function (return type changed earlier)
-- ============================================================

drop function if exists public.process_course_analysis_refresh_queue(integer);

-- ============================================================
-- STEP 1: Ensure queue table exists
-- ============================================================

create table if not exists public.course_analysis_refresh_queue (
    course_id bigint primary key references public.courses(id) on delete cascade,
    reason text not null default 'trigger',
    requested_at timestamptz not null default now(),
    processed_at timestamptz,
    attempts integer not null default 0,
    last_error text
);

-- Fresh migration replay starts from the original minimal schema. These columns
-- are watched by the refresh triggers below, so they must exist before trigger
-- creation even if the live database already had them from manual evolution.
alter table public.asanas add column if not exists category_id bigint;
alter table public.asanas add column if not exists is_restorative boolean default false;
alter table public.asanas add column if not exists hold_json jsonb;

alter table public.courses add column if not exists sequence_json jsonb;

-- ============================================================
-- STEP 2: Queue helper (SECURITY DEFINER = RLS fix)
-- ============================================================

create or replace function public.queue_course_analysis_refresh(
    p_course_id bigint,
    p_reason text default 'trigger'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.course_analysis_refresh_queue (
        course_id,
        reason,
        requested_at,
        processed_at,
        attempts,
        last_error
    )
    values (
        p_course_id,
        p_reason,
        now(),
        null::timestamptz,
        0,
        null::text
    )
    on conflict (course_id)
    do update set
        reason = excluded.reason,
        requested_at = now(),
        processed_at = null::timestamptz,
        attempts = 0,
        last_error = null::text;
end;
$$;

-- ============================================================
-- STEP 3: Queue processor (also SECURITY DEFINER)
-- ============================================================

create or replace function public.process_course_analysis_refresh_queue(
    limit_count integer default 50
)
returns table(
    course_id bigint,
    success boolean,
    error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
begin
    for r in
        select q.course_id
        from public.course_analysis_refresh_queue q
        where q.processed_at is null
        order by q.requested_at asc
        limit limit_count
        for update skip locked
    loop
        begin
            perform public.refresh_course_sequence_analysis_for_course(r.course_id);

            update public.course_analysis_refresh_queue
            set processed_at = now(),
                last_error = null::text
            where course_id = r.course_id;

            course_id := r.course_id;
            success := true;
            error_message := null::text;
            return next;

        exception when others then
            update public.course_analysis_refresh_queue
            set last_error = sqlerrm,
                attempts = attempts + 1
            where course_id = r.course_id;

            course_id := r.course_id;
            success := false;
            error_message := sqlerrm;
            return next;
        end;
    end loop;
end;
$$;

-- ============================================================
-- STEP 4: Trigger functions
-- ============================================================

create or replace function public.queue_courses_for_asana_change()
returns trigger
language plpgsql
as $$
declare
    affected_course_id bigint;
begin
    for affected_course_id in
        select distinct c.id
        from public.courses c
        where c.sequence_json is not null
          and jsonb_typeof(c.sequence_json) = 'array'
          and exists (
              select 1
              from jsonb_array_elements(c.sequence_json) as item
              where item->>'type' = 'pose'
                and item->>'pose_id' = new.id::text
          )
    loop
        perform public.queue_course_analysis_refresh(
            affected_course_id,
            'asana_change: ' || new.id
        );
    end loop;

    return new;
end;
$$;


create or replace function public.queue_courses_for_stage_change()
returns trigger
language plpgsql
as $$
declare
    affected_course_id bigint;
    target_stage_id bigint;
begin
    target_stage_id := coalesce(new.id, old.id);

    for affected_course_id in
        select distinct c.id
        from public.courses c
        where c.sequence_json is not null
          and jsonb_typeof(c.sequence_json) = 'array'
          and exists (
              select 1
              from jsonb_array_elements(c.sequence_json) as item
              where item->>'type' = 'pose'
                and item->>'stage_id' is not null
                and item->>'stage_id' <> ''
                and (item->>'stage_id')::bigint = target_stage_id
          )
    loop
        perform public.queue_course_analysis_refresh(
            affected_course_id,
            'stage_change: ' || target_stage_id
        );
    end loop;

    return coalesce(new, old);
end;
$$;


create or replace function public.queue_course_for_self_change()
returns trigger
language plpgsql
as $$
begin
    perform public.queue_course_analysis_refresh(new.id, 'course_change');
    return new;
end;
$$;

-- ============================================================
-- STEP 5: Drop ALL possible old triggers
-- ============================================================

drop trigger if exists trg_queue_courses_on_asana_change on public.asanas;
drop trigger if exists trg_queue_courses_on_stage_change on public.stages;
drop trigger if exists trg_queue_course_on_self_change on public.courses;

drop trigger if exists queue_course_analysis_from_asana on public.asanas;
drop trigger if exists queue_course_analysis_from_stage on public.stages;
drop trigger if exists queue_course_analysis_from_course on public.courses;

-- ============================================================
-- STEP 6: Recreate triggers
-- ============================================================

create trigger trg_queue_courses_on_asana_change
after insert or update of intensity, category_id, is_restorative, hold_json
on public.asanas
for each row
execute function public.queue_courses_for_asana_change();


create trigger trg_queue_courses_on_stage_change
after insert or update or delete
on public.stages
for each row
execute function public.queue_courses_for_stage_change();


create trigger trg_queue_course_on_self_change
after update of sequence_json, title
on public.courses
for each row
execute function public.queue_course_for_self_change();

-- ============================================================
-- STEP 7: Optional cleanup
-- ============================================================

update public.course_analysis_refresh_queue
set processed_at = null::timestamptz,
    last_error = null::text
where processed_at is null;
