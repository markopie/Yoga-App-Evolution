-- ════════════════════════════════════════════════════════════════
-- Migration: User/Admin Architecture for courses table
-- Run this in: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

-- Step 1: Add user_id column (the courses table originally had none)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 2: Add is_system column (safe to re-run)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Step 3: Mark all existing rows that have no user_id as official system content
UPDATE courses SET is_system = true WHERE user_id IS NULL;

-- Step 3: Replace old read-only policies with correct ones
DROP POLICY IF EXISTS "Allow public read access to courses" ON courses;
DROP POLICY IF EXISTS "Allow authenticated read access to courses" ON courses;

-- Guests (anon) only see system-promoted sequences
CREATE POLICY "Guests read system sequences"
  ON courses FOR SELECT TO anon
  USING (is_system = true);

-- Authenticated users see system sequences + their own private ones
CREATE POLICY "Users read system and own sequences"
  ON courses FOR SELECT TO authenticated
  USING (is_system = true OR auth.uid() = user_id);

-- Step 4: Add write policies (these were missing entirely)
-- Authenticated users can insert rows tagged with their own user_id
CREATE POLICY "Users insert own sequences"
  ON courses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own rows
CREATE POLICY "Users update own sequences"
  ON courses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can delete their own rows
CREATE POLICY "Users delete own sequences"
  ON courses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- Verification queries (run after the above to confirm)
-- ════════════════════════════════════════════════════════════════
-- SELECT is_system, COUNT(*) FROM courses GROUP BY is_system;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'courses';
