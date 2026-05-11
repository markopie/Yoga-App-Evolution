-- 1. Create a Unique Constraint on `asanas.id`
-- The error 42P10 indicates that `asanas.id` lacks a formal unique constraint,
-- so ON CONFLICT (id) has no index to enforce uniqueness against.
ALTER TABLE asanas DROP CONSTRAINT IF EXISTS asanas_id_key;
ALTER TABLE asanas ADD CONSTRAINT asanas_id_key UNIQUE (id);

-- 2. Execute the Migration (UPSERT)
-- Guarded block to ensure safety against the current schema where legacy columns like 'category' or 'hold' may be missing.
DO $$
DECLARE
  legacy_shape_exists boolean;
  result_record record;
BEGIN
  -- Check for all required legacy columns in both tables before running the upsert.
