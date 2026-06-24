/*
  # Create Asanas, Stages, and Courses Tables

  ## Overview
  This migration creates the core tables needed for the yoga app to store asana (pose) data,
  stage variations, and course sequences.

  ## 1. New Tables

  ### `asanas` Table
  Stores the base asana (yoga pose) information:
  - `id` (text, primary key) - 3-digit padded ID (e.g., "001", "215")
  - `name` (text) - Sanskrit name of the pose
  - `iast` (text) - IAST transliteration
  - `english_name` (text) - English name
  - `technique` (text) - Full technique description
  - `plate_numbers` (text) - Plate reference string (e.g., "Final: 1, 2")
  - `requires_sides` (boolean) - Whether the pose requires left/right sides
  - `page_2001` (text) - Page reference from 2001 edition
  - `page_2015` (text) - Page reference from 2015 edition
  - `intensity` (text) - Intensity level
  - `note` (text) - Additional notes
  - `category` (text) - Category classification
  - `description` (text) - Detailed description
  - `created_at` (timestamptz) - Record creation timestamp

  ### `stages` Table
  Stores variations/stages of asanas:
  - `id` (uuid, primary key) - Unique identifier
  - `asana_id` (text) - Links to parent asana in asanas table
  - `stage_name` (text) - Stage identifier (e.g., "I", "IIa", "IVb")
  - `title` (text) - Display title for the stage
  - `full_technique` (text) - Complete technique description
  - `shorthand` (text) - Abbreviated technique
  - `hold_json` (jsonb) - Timing durations (standard, short, long, flow)
  - `sort_order` (integer) - Display ordering index
  - `image_url` (text) - Image reference
  - `preparatory_pose_id` (jsonb) - Prep pose relation {asana_id, stage_id}
  - `recovery_pose_id` (jsonb) - Recovery pose relation {asana_id, stage_id}
  - `created_at` (timestamptz) - Record creation timestamp

  ### `courses` Table
  Stores course/sequence information:
  - `id` (serial, primary key) - Auto-incrementing ID
  - `course_id` (integer) - Original course ID from source data
  - `course_title` (text) - Course name
  - `category` (text) - Course category/classification
  - `sequence_text` (text) - Raw sequence data (multiline format)
  - `created_at` (timestamptz) - Record creation timestamp

  ## 2. Security
  - Enable RLS on all tables
  - Add policies for public read access (since this is a yoga instruction app)
  - No write access through policies (data managed through admin tools)

  ## 3. Indexes
  - Primary key indexes created automatically
  - Optional legacy index on courses.course_id when that column exists.
  ## 4. Important Notes
  - The app expects specific data formats; transformation logic is in app.js
  - plate_numbers is stored as text and parsed by the client
  - sequence_text follows format: "ID | Time | [Note with Variation]"
  - asana_id in stages links to the parent asana's id (text, 3-digit padded)
  - Additional columns (hold_json, sort_order, image_url, preparatory_pose_id, recovery_pose_id, page_primary, etc.) were added in later migrations
*/

-- Create asanas table
CREATE TABLE IF NOT EXISTS asanas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
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
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create stages table
CREATE TABLE IF NOT EXISTS stages (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  parent_id TEXT[] NOT NULL,
  stage_name TEXT NOT NULL DEFAULT '',
  title TEXT DEFAULT '',
  full_technique TEXT DEFAULT '',
  shorthand TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  course_id INTEGER,
  course_title TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  sequence_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster course lookups
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'course_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_courses_course_id
      ON public.courses(course_id);
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE asanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
-- (This is a yoga instruction app, so data is publicly readable)

CREATE POLICY "Allow public read access to asanas"
  ON asanas
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to asanas"
  ON asanas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow public read access to stages"
  ON stages
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to stages"
  ON stages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow public read access to courses"
  ON courses
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to courses"
  ON courses
  FOR SELECT
  TO authenticated
  USING (true);
