-- Legacy migration: user_asanas -> asanas
-- Legacy migration: user_stages -> stages
--
-- This migration originally copied legacy user_stages rows into the global stages
-- table using old columns such as hold (text).
--
-- Current schema no longer uses that shape:
-- - hold (text) has been replaced by hold_json
--
-- Therefore this migration must only run on an old schema where those legacy
-- columns still exist. On the current schema, it safely skips.

-- 1. Ensure stages has a unique constraint for upsert if legacy shape exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stages' AND column_name = 'asana_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stages' AND column_name = 'stage_name'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'stages_asana_stage_key'
        AND conrelid = 'public.stages'::regclass
    ) THEN
      ALTER TABLE public.stages
        ADD CONSTRAINT stages_asana_stage_key UNIQUE (asana_id, stage_name);
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Execute the legacy migration only when the old column shape exists.
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
        AND column_name = 'name'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'iast'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'english_name'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'technique'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'plate_numbers'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'requires_sides'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'page_2001'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'page_2015'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'intensity'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asanas'
        AND column_name = 'note'
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
        AND column_name = 'description'
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
        AND column_name = 'name'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'iast'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'english_name'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'technique'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'plate_numbers'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'requires_sides'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'page_2001'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'page_2015'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'intensity'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_asanas'
        AND column_name = 'note'
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
        AND column_name = 'description'
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
