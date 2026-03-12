-- 1. Fix the Auto-Increment Counter (Resolves the Courses_pkey ERROR)
-- Since data was previously imported manually, the auto-incrementing ID sequence was unaware
-- of the 170 rows already in existence. This fast-forwards the internal counter to the actual max ID!
SELECT setval(pg_get_serial_sequence('courses', 'id'), coalesce(max(id), 1)) FROM courses;

-- 2. Create a Composite Unique Constraint (Idempotent)
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_title_category_key;
ALTER TABLE courses ADD CONSTRAINT courses_title_category_key UNIQUE (title, category);

-- 3. Execute the Migration (UPSERT)
-- Migrate all data from user_sequences into courses, resolving conflicts with UPDATE logic
WITH upsert_cte AS (
  INSERT INTO courses (title, category, sequence_text)
  SELECT title, category, sequence_text
  FROM user_sequences
  ON CONFLICT (title, category) 
  DO UPDATE SET sequence_text = EXCLUDED.sequence_text
  RETURNING (xmax = 0) AS is_insert
)
-- 4. Report 
-- This will log how many sequences were updated and created when executed in the dashboard!
SELECT 
  COUNT(*) FILTER (WHERE is_insert) AS new_sequences_created,
  COUNT(*) FILTER (WHERE NOT is_insert) AS sequences_updated
FROM upsert_cte;

-- 5. Cleanup
-- Now that the migration logic has successfully UPSERTED the sequences into courses,
-- we clear the user_sequences table to avoid UI confusion.
TRUNCATE TABLE user_sequences;
