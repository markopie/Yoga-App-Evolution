-- Migration: alter page_primary from integer to numeric(6,2)
-- This allows decimal page references like 44.1, 102.1 etc.
-- All existing integer values (44, 100, etc.) are preserved exactly as-is.
-- Safe to run multiple times (the USING clause handles the cast cleanly).

ALTER TABLE asanas
    ALTER COLUMN page_primary TYPE numeric(6,2)
    USING page_primary::numeric(6,2);

ALTER TABLE stages
    ALTER COLUMN page_primary TYPE numeric(6,2)
    USING page_primary::numeric(6,2);

-- Verify the change
SELECT
    table_name,
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE column_name = 'page_primary'
  AND table_name IN ('asanas', 'stages');
