-- ════════════════════════════════════════════════════════════════
-- Migration: Add RLS write policies for stages table
-- Run this in: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════
-- Context: The stages table only had SELECT policies from the
-- original migration. The Asana Editor's save path (asanaEditor.js)
-- performs upserts to the stages table, which fail with a 400 error
-- because RLS blocks INSERT/UPDATE operations.
-- ════════════════════════════════════════════════════════════════

-- Step 1: Add INSERT policy for stages
-- Authenticated users can insert stages
DROP POLICY IF EXISTS "Authenticated users can insert stages" ON stages;
CREATE POLICY "Authenticated users can insert stages"
  ON stages FOR INSERT TO authenticated
  WITH CHECK (true);

-- Step 2: Add UPDATE policy for stages
-- Authenticated users can update any stage
DROP POLICY IF EXISTS "Authenticated users can update stages" ON stages;
CREATE POLICY "Authenticated users can update stages"
  ON stages FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Step 3: Add DELETE policy for stages
-- Authenticated users can delete any stage
DROP POLICY IF EXISTS "Authenticated users can delete stages" ON stages;
CREATE POLICY "Authenticated users can delete stages"
  ON stages FOR DELETE TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════
-- Verification queries (run after the above to confirm)
-- ════════════════════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd, permissive
-- FROM pg_policies
-- WHERE tablename = 'stages'
-- ORDER BY cmd;
