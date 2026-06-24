create table if not exists public.curriculum_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  curriculum_slug text not null,
  name text not null,
  description text,
  draft_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_drafts_user_slug_unique unique (user_id, curriculum_slug)
);

create index if not exists idx_curriculum_drafts_user_updated_at
  on public.curriculum_drafts(user_id, updated_at desc);

revoke all on table public.curriculum_drafts from anon, authenticated;
grant select, insert, update, delete on table public.curriculum_drafts to authenticated;

alter table public.curriculum_drafts enable row level security;

drop policy if exists "Users can read their own curriculum drafts" on public.curriculum_drafts;
create policy "Users can read their own curriculum drafts"
  on public.curriculum_drafts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own curriculum drafts" on public.curriculum_drafts;
create policy "Users can create their own curriculum drafts"
  on public.curriculum_drafts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own curriculum drafts" on public.curriculum_drafts;
create policy "Users can update their own curriculum drafts"
  on public.curriculum_drafts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own curriculum drafts" on public.curriculum_drafts;
create policy "Users can delete their own curriculum drafts"
  on public.curriculum_drafts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.touch_curriculum_drafts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists curriculum_drafts_touch_updated_at on public.curriculum_drafts;
create trigger curriculum_drafts_touch_updated_at
  before update on public.curriculum_drafts
  for each row
  execute function public.touch_curriculum_drafts_updated_at();
