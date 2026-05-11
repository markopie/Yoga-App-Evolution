-- Fix Security Advisor findings:
-- - security_definer_view on public view surfaces
-- - rls_disabled_in_public on reference/curriculum/maintenance tables

alter view public.view_asanas_admin
  set (security_invoker = true);

alter view public.searchable_asanas_view
  set (security_invoker = true);

alter table public.asana_categories enable row level security;
alter table public.program_curriculum enable row level security;
alter table public.course_analysis_refresh_queue enable row level security;

grant select on table public.asana_categories to anon, authenticated;
grant select on table public.program_curriculum to anon, authenticated;
revoke all on table public.course_analysis_refresh_queue from anon, authenticated;

do $$
declare
  queue_policy record;
begin
  for queue_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'course_analysis_refresh_queue'
      and roles && array['anon', 'authenticated', 'public']::name[]
  loop
    execute format(
      'drop policy if exists %I on public.course_analysis_refresh_queue',
      queue_policy.policyname
    );
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asana_categories'
      and policyname = 'Public read access to asana categories'
  ) then
    create policy "Public read access to asana categories"
      on public.asana_categories
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'program_curriculum'
      and policyname = 'Public read access to program curriculum'
  ) then
    create policy "Public read access to program curriculum"
      on public.program_curriculum
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;
