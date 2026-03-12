-- 0. Deduplicate the base `stages` table
-- Cleans up any existing duplicated rows mathematically; otherwise, the ALTER TABLE command below will fail!
DELETE FROM stages
WHERE id IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER(PARTITION BY asana_id, stage_name ORDER BY id ASC) as row_num
        FROM stages
    ) t
    WHERE t.row_num > 1
);

-- 1. Create a Unique Constraint on `stages.asana_id` and `stages.stage_name`
-- This allows UPSERT logic to correctly resolve conflicts when moving variations over.
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_asana_stage_key;
ALTER TABLE stages ADD CONSTRAINT stages_asana_stage_key UNIQUE (asana_id, stage_name);

-- 2. Create a Sample Row in user_stages for testing
-- We use '001' (Tadasana) as the parent since it's practically guaranteed to exist.
INSERT INTO user_stages (
  asana_id, stage_name, title, shorthand, full_technique, hold
) VALUES (
  '001', 
  'TestStage', 
  'Test Migration Stage', 
  'Test shorthand', 
  'This is a sample technique created for testing the user_stages migration.', 
  'Standard: 0:30'
)
ON CONFLICT (asana_id, stage_name) DO NOTHING;

-- 3. Execute the Migration (UPSERT)
-- Migrate all data from user_stages into stages, resolving conflicts with UPDATE logic.
WITH upsert_cte AS (
  INSERT INTO stages (
      asana_id, stage_name, title, shorthand, full_technique, 
      hold, hold_json, devanagari, translation, oracle_lore, 
      symbol_prompt, is_curated, image_url, audio_url
  )
  SELECT 
      asana_id, stage_name, title, shorthand, full_technique, 
      hold, hold_json, devanagari, translation, oracle_lore, 
      symbol_prompt, is_curated, image_url, audio_url
  FROM user_stages
  WHERE asana_id IS NOT NULL AND stage_name IS NOT NULL
  ON CONFLICT (asana_id, stage_name) 
  DO UPDATE SET 
      title = EXCLUDED.title,
      shorthand = EXCLUDED.shorthand,
      full_technique = EXCLUDED.full_technique,
      hold = COALESCE(EXCLUDED.hold, stages.hold),
      hold_json = COALESCE(EXCLUDED.hold_json, stages.hold_json),
      devanagari = EXCLUDED.devanagari,
      translation = EXCLUDED.translation,
      oracle_lore = EXCLUDED.oracle_lore,
      symbol_prompt = EXCLUDED.symbol_prompt,
      is_curated = EXCLUDED.is_curated,
      image_url = EXCLUDED.image_url,
      audio_url = EXCLUDED.audio_url
  RETURNING (xmax = 0) AS is_insert
)
-- 4. Report Output 
-- This will log how many stages were updated and created when executed in the dashboard!
SELECT 
  COUNT(*) FILTER (WHERE is_insert) AS new_stages_created,
  COUNT(*) FILTER (WHERE NOT is_insert) AS stages_updated
FROM upsert_cte;

-- 5. Cleanup
-- Clears out the user_stages table to avoid duplication
TRUNCATE TABLE user_stages;
