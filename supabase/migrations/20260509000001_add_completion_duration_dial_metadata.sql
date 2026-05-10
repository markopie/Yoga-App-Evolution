-- Add optional curriculum/day completion metadata for duration-dial adjusted practices.
alter table public.sequence_completions
  add column if not exists completed boolean not null default true,
  add column if not exists user_id uuid,
  add column if not exists sequence_id bigint,
  add column if not exists curriculum_node_id bigint,
  add column if not exists status text,
  add column if not exists rating integer,
  add column if not exists difficulty_feedback text,
  add column if not exists duration_scale_used numeric(6, 3),
  add column if not exists planned_duration_minutes numeric(8, 2),
  add column if not exists actual_adjusted_duration_minutes numeric(8, 2);

create index if not exists idx_seq_completions_curriculum_completed
  on public.sequence_completions(curriculum_node_id, completed_at desc)
  where curriculum_node_id is not null and completed = true;

notify pgrst, 'reload schema';
