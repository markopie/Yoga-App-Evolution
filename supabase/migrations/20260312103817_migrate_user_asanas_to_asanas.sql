-- Legacy migration: user_asanas -> asanas
--
-- This migration originally copied legacy user_asanas rows into the global asanas
-- table using old columns such as category and hold.
--
-- Current schema no longer uses that shape:
-- - category was removed/replaced
-- - hold was replaced by hold_json
--
-- Therefore this migration must only run on an old schema where those legacy
-- columns still exist. On the current schema, it safely skips.
--
-- Do not add legacy category/hold columns back.

DO $$
DECLARE
  legacy_shape_exists boolean;
  result_record record;
BEGIN
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'category'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'hold'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'category'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'hold'
    )
  INTO legacy_shape_exists;

  IF legacy_shape_exists THEN
    WITH upsert_cte AS (
      INSERT INTO public.asanas (
        id,
        name,
        iast,
        english_name,
        technique,
        plate_numbers,
        requires_sides,
        page_2001,
        page_2015,
        intensity,
        note,
        category,
        description,
        hold
      )
      SELECT
        id,
        name,
        iast,
        english_name,
        technique,
        plate_numbers,
        requires_sides,
        page_2001,
        page_2015,
        intensity,
        note,
        category,
        description,
        hold
      FROM public.user_asanas
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
    SELECT
      COUNT(*) FILTER (WHERE is_insert) AS new_asanas_created,
      COUNT(*) FILTER (WHERE NOT is_insert) AS asanas_updated
    INTO result_record
    FROM upsert_cte;

    RAISE NOTICE 'Legacy user_asanas migration complete: % new asanas created, % asanas updated',
      result_record.new_asanas_created,
      result_record.asanas_updated;

    TRUNCATE TABLE public.user_asanas;
  ELSE
    RAISE NOTICE 'Skipping legacy user_asanas -> asanas migration because current schema no longer includes legacy asanas.category / asanas.hold shape.';
  END IF;
END $$;
