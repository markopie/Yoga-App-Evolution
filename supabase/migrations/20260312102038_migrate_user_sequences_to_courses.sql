-- 1. Fix the Auto-Increment Counter (Resolves the Courses_pkey ERROR)
-- Since data was previously imported manually, the auto-incrementing ID sequence was unaware
-- of rows already in existence. This fast-forwards the internal counter to the actual max ID.
SELECT setval(
  pg_get_serial_sequence('public.courses', 'id'),
  COALESCE((SELECT MAX(id) FROM public.courses), 1)
);

-- The original courses table used `course_title`; later migrations and app code use `title`.
-- Keep fresh migration replay compatible with the historical create-table shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'course_title'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'title'
  ) THEN
    ALTER TABLE public.courses RENAME COLUMN course_title TO title;
  END IF;
END $$;

-- 2. Create a legacy composite unique constraint only when the legacy columns exist.
-- Current schema no longer has courses.category, so this is skipped there.
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_title_category_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'title'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_title_category_key UNIQUE (title, category);
  END IF;
END $$;

-- 3. Execute the legacy user_sequences -> courses migration only when the old schema shape exists.
-- Current schema no longer has courses.category, so this block safely skips on current replay.
DO $$
DECLARE
  legacy_shape_exists boolean;
  result_record record;
BEGIN
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courses'
        AND column_name = 'title'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courses'
        AND column_name = 'category'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courses'
        AND column_name = 'sequence_text'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_sequences'
        AND column_name = 'title'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_sequences'
        AND column_name = 'category'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_sequences'
        AND column_name = 'sequence_text'
    )
  INTO legacy_shape_exists;

  IF legacy_shape_exists THEN
    WITH upsert_cte AS (
      INSERT INTO public.courses (title, category, sequence_text)
      SELECT title, category, sequence_text
      FROM public.user_sequences
      ON CONFLICT (title, category)
      DO UPDATE SET sequence_text = EXCLUDED.sequence_text
      RETURNING (xmax = 0) AS is_insert
    )
    SELECT
      COUNT(*) FILTER (WHERE is_insert) AS new_sequences_created,
      COUNT(*) FILTER (WHERE NOT is_insert) AS sequences_updated
    INTO result_record
    FROM upsert_cte;

    RAISE NOTICE 'Legacy user_sequences migration complete: % new sequences created, % sequences updated',
      result_record.new_sequences_created,
      result_record.sequences_updated;

    -- 5. Cleanup
    -- Now that the legacy migration logic has successfully UPSERTED the sequences into courses,
    -- clear user_sequences to avoid UI confusion.
    TRUNCATE TABLE public.user_sequences;
  ELSE
    RAISE NOTICE 'Skipping legacy user_sequences -> courses migration because current schema does not include courses.category / legacy user_sequences columns.';
  END IF;
END $$;
