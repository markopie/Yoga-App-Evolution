-- ============================================================
-- SEED + RLS: completion_rating_options
-- ============================================================
-- Ensures the lookup table has data and is readable by the app.
-- Uses INSERT ... ON CONFLICT to be idempotent (safe to re-run).

-- ============================================================
-- STEP 1: Enable RLS (safe to re-run)
-- ============================================================
alter table public.completion_rating_options enable row level security;

-- ============================================================
-- STEP 2: Drop any existing policies to start clean
-- ============================================================
drop policy if exists "Anyone can read active rating options" on public.completion_rating_options;
drop policy if exists "Only authenticated users can insert rating options" on public.completion_rating_options;
drop policy if exists "Only authenticated users can update rating options" on public.completion_rating_options;
drop policy if exists "Only authenticated users can delete rating options" on public.completion_rating_options;

-- ============================================================
-- STEP 3: SELECT policy — anyone (anon + authenticated) can read active rows
-- ============================================================
create policy "Anyone can read active rating options"
    on public.completion_rating_options
    for select
    using (is_active = true);

-- ============================================================
-- STEP 4: INSERT/UPDATE/DELETE — only authenticated users (admin)
-- ============================================================
create policy "Only authenticated users can insert rating options"
    on public.completion_rating_options
    for insert
    with check (auth.role() = 'authenticated');

create policy "Only authenticated users can update rating options"
    on public.completion_rating_options
    for update
    using (auth.role() = 'authenticated');

create policy "Only authenticated users can delete rating options"
    on public.completion_rating_options
    for delete
    using (auth.role() = 'authenticated');

-- ============================================================
-- STEP 5: Seed default rating options (idempotent)
-- ============================================================
insert into public.completion_rating_options (rating, feedback_key, label, subtitle, emoji, progression_score, sort_order, is_active)
values
    (1, 'too_much',       'Too Much',       'Heavy',       '🪨', -2, 1, true),
    (2, 'challenging',    'Challenging',    'Effortful',   '🧗', -1, 2, true),
    (3, 'balanced',       'Balanced',       'Right level', '⚖️',  0, 3, true),
    (4, 'comfortable',    'Comfortable',    'Fluid',       '🌊',  1, 4, true),
    (5, 'ready_for_more', 'Ready for More', 'Strong',      '⚡',  2, 5, true)
on conflict (rating) do nothing;
