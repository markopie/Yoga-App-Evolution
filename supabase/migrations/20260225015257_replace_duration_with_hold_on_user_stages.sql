/*
  # Replace integer duration with hold string on user_stages

  ## Summary
  The `user_stages` table previously had an integer `duration` column added in an
  earlier migration. This migration replaces it with a `hold` text column that stores
  the same "Standard: M:SS | Short: M:SS | Long: M:SS" format used by the parent
  asanas table, enabling consistent parsing throughout the app.

  ## Changes
  - `user_stages`: drops `duration` integer column (no data yet — column was just added)
  - `user_stages`: adds `hold` text column (nullable) for the formatted hold string

  ## Notes
  - The `duration` column was added in the same session and contains no real user data.
  - All reads use the existing `parseHoldTimes()` helper which already handles this format.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_stages' AND column_name = 'duration'
  ) THEN
    ALTER TABLE user_stages DROP COLUMN duration;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_stages' AND column_name = 'hold'
  ) THEN
    ALTER TABLE user_stages ADD COLUMN hold text;
  END IF;
END $$;
