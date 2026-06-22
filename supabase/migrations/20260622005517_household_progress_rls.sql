-- Require signed-in household users for saved practice progress.
-- Anonymous Supabase Auth users are still authenticated and get their own auth.uid().

alter table public.sequence_completions
  add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sequence_completions_user_id_fkey'
      and conrelid = 'public.sequence_completions'::regclass
  ) then
    alter table public.sequence_completions
      add constraint sequence_completions_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade
      not valid;
  end if;
end $$;

create index if not exists idx_seq_completions_user_completed_at
  on public.sequence_completions(user_id, completed_at desc);

drop policy if exists "Allow anon read of completions" on public.sequence_completions;
drop policy if exists "Allow anon insert of completions" on public.sequence_completions;
drop policy if exists "Allow anon delete of completions" on public.sequence_completions;
drop policy if exists "Allow authenticated read of completions" on public.sequence_completions;
drop policy if exists "Allow authenticated insert of completions" on public.sequence_completions;
drop policy if exists "Allow authenticated delete of completions" on public.sequence_completions;
drop policy if exists "Users read own completions" on public.sequence_completions;
drop policy if exists "Users insert own completions" on public.sequence_completions;
drop policy if exists "Users update own completions" on public.sequence_completions;
drop policy if exists "Users delete own completions" on public.sequence_completions;

create policy "Users read own completions"
  on public.sequence_completions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own completions"
  on public.sequence_completions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own completions"
  on public.sequence_completions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own completions"
  on public.sequence_completions
  for delete
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
