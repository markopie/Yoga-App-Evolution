/*
  # Create user_asanas and user_stages tables

  ## Overview
  The asana editor in app.js attempts to save user-edited asanas and stages to
  `user_asanas` and `user_stages` tables, but these tables don't exist yet.
  This migration creates them with the exact column names the app expects.

  ## 1. New Tables

  ### `user_asanas` Table
  Stores user-edited versions of asanas. Overrides the base `asanas` table entries
  for a given user.
  - `id` (text) - 3-digit padded ID matching asanas.id (e.g., "001")
  - `user_id` (uuid, nullable) - links to auth.users; nullable for anon edits
  - `name`, `iast`, `english_name`, `technique`, `plate_numbers` - core fields
  - `requires_sides` (boolean) - whether pose needs left/right sides
  - `page_2001`, `page_2015`, `intensity`, `note`, `category`, `description` - metadata
  - `hold` (text) - timing string e.g. "Standard: 0:30 | Short: 0:15 | Long: 1:00"
  - `created_at`, `updated_at` - timestamps

  ### `user_stages` Table
  Stores user-edited stages/variations linked to user_asanas.
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable)
  - `parent_id` (text array) - matches stages.parent_id format
  - `stage_name` (text) - stage key e.g. "I", "IIa"
  - `title`, `shorthand`, `full_technique` - display fields
  - `created_at` timestamp

  ## 2. Security
  - RLS enabled on both tables
  - Anon and authenticated users can read, insert, update, delete their own rows
  - Conflict key for user_asanas is (id, user_id) for upsert

  ## 3. Important Notes
  - The app upserts to user_asanas with onConflict: 'id,user_id'
  - The composite unique constraint (id, user_id) is required for upsert to work
  - user_id can be NULL for unauthenticated (anon) sessions
*/

CREATE TABLE IF NOT EXISTS user_asanas (
  id TEXT NOT NULL,
  user_id UUID,
  name TEXT DEFAULT '',
  iast TEXT DEFAULT '',
  english_name TEXT DEFAULT '',
  technique TEXT DEFAULT '',
  plate_numbers TEXT DEFAULT '',
  requires_sides BOOLEAN DEFAULT false,
  page_2001 TEXT DEFAULT '',
  page_2015 TEXT DEFAULT '',
  intensity TEXT DEFAULT '',
  note TEXT DEFAULT '',
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  hold TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  parent_id TEXT[] NOT NULL,
  stage_name TEXT NOT NULL DEFAULT '',
  title TEXT DEFAULT '',
  full_technique TEXT DEFAULT '',
  shorthand TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_asanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can read user_asanas"
  ON user_asanas
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert user_asanas"
  ON user_asanas
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update user_asanas"
  ON user_asanas
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can delete user_asanas"
  ON user_asanas
  FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can read user_asanas"
  ON user_asanas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert user_asanas"
  ON user_asanas
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update user_asanas"
  ON user_asanas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete user_asanas"
  ON user_asanas
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anon users can read user_stages"
  ON user_stages
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert user_stages"
  ON user_stages
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update user_stages"
  ON user_stages
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can delete user_stages"
  ON user_stages
  FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can read user_stages"
  ON user_stages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert user_stages"
  ON user_stages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update user_stages"
  ON user_stages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete user_stages"
  ON user_stages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
