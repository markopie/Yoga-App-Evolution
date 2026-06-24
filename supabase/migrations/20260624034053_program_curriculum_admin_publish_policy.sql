create or replace function public.is_curriculum_publish_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = any (array[
      'mark.opie@gmail.com'
    ]),
    false
  );
$$;

revoke all on function public.is_curriculum_publish_admin() from public, anon;
grant execute on function public.is_curriculum_publish_admin() to authenticated;

revoke insert, update, delete on table public.program_curriculum from anon, authenticated;
grant insert, delete on table public.program_curriculum to authenticated;

drop policy if exists "Configured admins can insert program curriculum" on public.program_curriculum;
create policy "Configured admins can insert program curriculum"
  on public.program_curriculum
  for insert
  to authenticated
  with check ((select public.is_curriculum_publish_admin()));

drop policy if exists "Configured admins can delete program curriculum" on public.program_curriculum;
create policy "Configured admins can delete program curriculum"
  on public.program_curriculum
  for delete
  to authenticated
  using ((select public.is_curriculum_publish_admin()));
