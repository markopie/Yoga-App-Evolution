/*
  # Create Sequence Completions Table

  ## Overview
  Stores the user's yoga practice completion history. Each row represents
  one completed practice session for a named sequence/course.

  ## New Table: `sequence_completions`
  - `id` (uuid, primary key) - Unique record ID
  - `title` (text, not null) - The course/sequence name as displayed in the app
  - `category` (text) - The course category (e.g. "Light on Yoga > Course 1")
  - `completed_at` (timestamptz, not null) - When the session was completed
  - `duration_seconds` (integer) - Total practice duration in seconds (optional, for future use)
  - `notes` (text) - Optional personal note about the session
  - `created_at` (timestamptz) - Row insert timestamp

  ## Security
  - RLS enabled
  - Public anon users can read and insert (app has no login, data is per-device)
  - No user-specific isolation since the app is single-user/local
*/

CREATE TABLE IF NOT EXISTS sequence_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seq_completions_title ON sequence_completions(title);
CREATE INDEX IF NOT EXISTS idx_seq_completions_completed_at ON sequence_completions(completed_at DESC);

ALTER TABLE sequence_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read of completions"
  ON sequence_completions
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert of completions"
  ON sequence_completions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon delete of completions"
  ON sequence_completions
  FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read of completions"
  ON sequence_completions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert of completions"
  ON sequence_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete of completions"
  ON sequence_completions
  FOR DELETE
  TO authenticated
  USING (true);
