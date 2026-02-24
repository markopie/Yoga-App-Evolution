/*
  # Create user_asanas and user_stages tables

  1. New Tables
    - `user_asanas`
      - `id` (text, primary key) - Asana ID
      - `user_id` (uuid) - Owner of the custom asana
      - `name` (text) - Pose name
      - `iast` (text) - IAST transliteration
      - `english_name` (text) - English name
      - `technique` (text) - Base technique/instructions
      - `plate_numbers` (text) - Associated plate numbers
      - `requires_sides` (boolean) - Whether sides are required
      - `page_2001` (text) - Book reference
      - `page_2015` (text) - Book reference
      - `intensity` (text) - Intensity level
      - `note` (text) - Additional notes
      - `category` (text) - Pose category
      - `description` (text) - Description
      - `hold` (text) - Hold instructions
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `user_stages`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - Owner of the custom stage
      - `parent_id` (text array) - References asana ID(s)
      - `stage_name` (text) - Stage identifier (e.g., "1", "2")
      - `title` (text) - Stage title
      - `full_technique` (text) - Full technique for this stage
      - `shorthand` (text) - Shorthand notation
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Users can only see their own asanas and stages
    - Users can create, update, and delete their own records
*/

CREATE TABLE IF NOT EXISTS user_asanas (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text DEFAULT ''::text,
  iast text DEFAULT ''::text,
  english_name text DEFAULT ''::text,
  technique text DEFAULT ''::text,
  plate_numbers text DEFAULT ''::text,
  requires_sides boolean DEFAULT false,
  page_2001 text DEFAULT ''::text,
  page_2015 text DEFAULT ''::text,
  intensity text DEFAULT ''::text,
  note text DEFAULT ''::text,
  category text DEFAULT ''::text,
  description text DEFAULT ''::text,
  hold text DEFAULT ''::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS user_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id text[] NOT NULL,
  stage_name text DEFAULT ''::text,
  title text DEFAULT ''::text,
  full_technique text DEFAULT ''::text,
  shorthand text DEFAULT ''::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_asanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own asanas"
  ON user_asanas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own asanas"
  ON user_asanas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own asanas"
  ON user_asanas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own asanas"
  ON user_asanas FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own stages"
  ON user_stages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stages"
  ON user_stages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stages"
  ON user_stages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stages"
  ON user_stages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
