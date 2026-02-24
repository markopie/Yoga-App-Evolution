/*
  # Create User Sequences Table

  ## Overview
  Stores custom yoga sequences/courses created by the user via the Sequence Builder.
  Each row is one saved sequence with its compiled pose string and metadata.

  ## New Table: `user_sequences`
  - `id` (uuid, primary key) - Unique record ID
  - `title` (text, not null) - User-provided sequence title
  - `category` (text) - Optional category label
  - `sequence_text` (text) - Compiled pose string in format: "001 | 60 | [Note]\n..."
  - `pose_count` (integer) - Number of poses (for quick display)
  - `total_seconds` (integer) - Estimated total duration
  - `created_at` (timestamptz) - When created
  - `updated_at` (timestamptz) - Last modified

  ## Security
  - RLS enabled
  - Anon and authenticated users can read, insert, update, and delete
    (single-user app, no multi-tenancy needed)
*/

CREATE TABLE IF NOT EXISTS user_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  sequence_text TEXT NOT NULL DEFAULT '',
  pose_count INTEGER DEFAULT 0,
  total_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sequences_title ON user_sequences(title);
CREATE INDEX IF NOT EXISTS idx_user_sequences_created ON user_sequences(created_at DESC);

ALTER TABLE user_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read user_sequences"
  ON user_sequences FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert user_sequences"
  ON user_sequences FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update user_sequences"
  ON user_sequences FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete user_sequences"
  ON user_sequences FOR DELETE TO anon USING (true);

CREATE POLICY "Allow auth read user_sequences"
  ON user_sequences FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow auth insert user_sequences"
  ON user_sequences FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow auth update user_sequences"
  ON user_sequences FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow auth delete user_sequences"
  ON user_sequences FOR DELETE TO authenticated USING (true);
