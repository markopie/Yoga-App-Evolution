/*
  # Sequence Completions Table

  1. New Tables
    - `sequence_completions`
      - `id` (uuid, primary key) - Unique completion record ID
      - `title` (text) - Sequence title (e.g., "Week 1 & 2")
      - `category` (text, nullable) - Sequence category (e.g., "Light on Yoga > Course 1")
      - `completed_at` (timestamptz) - When the sequence was completed
      - `created_at` (timestamptz) - Record creation timestamp
      
  2. Indexes
    - Index on `completed_at` for efficient time-based queries
    - Index on `title` for filtering by sequence
    
  3. Security
    - Enable RLS on `sequence_completions` table
    - Public read access (no auth required for this yoga app)
    - Public insert access (no auth required)
    
  ## Notes
  - This table tracks each time a user completes a yoga sequence
  - Category field allows grouping completions by course/program
  - Timestamps stored in UTC for consistency
*/

-- Create the completions table
CREATE TABLE IF NOT EXISTS sequence_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_completions_completed_at 
  ON sequence_completions(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_completions_title 
  ON sequence_completions(title);

-- Enable Row Level Security
ALTER TABLE sequence_completions ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anyone can view completion history)
CREATE POLICY "Anyone can view completions"
  ON sequence_completions
  FOR SELECT
  TO public
  USING (true);

-- Allow public insert (anyone can log a completion)
CREATE POLICY "Anyone can log completions"
  ON sequence_completions
  FOR INSERT
  TO public
  WITH CHECK (true);