-- 1. Create a Unique Constraint on `asanas.id`
-- The error 42P10 indicates that `asanas.id` lacks a formal unique constraint,
-- so ON CONFLICT (id) has no index to enforce uniqueness against.
ALTER TABLE asanas DROP CONSTRAINT IF EXISTS asanas_id_key;
ALTER TABLE asanas ADD CONSTRAINT asanas_id_key UNIQUE (id);

-- 2. Execute the Migration (UPSERT)
-- Migrate all data from user_asanas into asanas, resolving conflicts with UPDATE logic.
WITH upsert_cte AS (
  INSERT INTO asanas (
      id, name, iast, english_name, technique, plate_numbers, 
      requires_sides, page_2001, page_2015, intensity, note, 
      category, description, hold
  )
  SELECT 
      id, name, iast, english_name, technique, plate_numbers, 
      requires_sides, page_2001, page_2015, intensity, note, 
      category, description, hold
  FROM user_asanas
  ON CONFLICT (id) 
  DO UPDATE SET 
      name = EXCLUDED.name,
      iast = EXCLUDED.iast,
      english_name = EXCLUDED.english_name,
      technique = EXCLUDED.technique,
      plate_numbers = EXCLUDED.plate_numbers,
      requires_sides = EXCLUDED.requires_sides,
      page_2001 = EXCLUDED.page_2001,
      page_2015 = EXCLUDED.page_2015,
      intensity = EXCLUDED.intensity,
      note = EXCLUDED.note,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      hold = EXCLUDED.hold
  RETURNING (xmax = 0) AS is_insert
)
-- 3. Report Output 
-- This will log how many asanas were updated and created when executed in the dashboard!
SELECT 
  COUNT(*) FILTER (WHERE is_insert) AS new_asanas_created,
  COUNT(*) FILTER (WHERE NOT is_insert) AS asanas_updated
FROM upsert_cte;

-- 4. Cleanup
-- Clears out the user_asanas table to avoid duplication
TRUNCATE TABLE user_asanas;
