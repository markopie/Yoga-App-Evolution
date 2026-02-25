/*
  # Add duration column to user_stages table

  ## Summary
  Adds an optional integer `duration` column to the `user_stages` table to support
  per-variation duration overrides in the Asana Editor and Sequence Player.

  ## Changes
  - `user_stages`: new column `duration` (integer, nullable) — stores seconds for this variation's hold time.
    When null, the parent asana's standard hold time is used instead.

  ## Notes
  - No data loss; existing rows get NULL (fall back to parent duration).
  - No RLS change needed; existing policies already cover this table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_stages' AND column_name = 'duration'
  ) THEN
    ALTER TABLE user_stages ADD COLUMN duration integer;
  END IF;
END $$;
