-- Migration: alter page_primary from integer to numeric(6,2)
-- This allows decimal page references like 44.1, 102.1 etc.
-- All existing integer values (44, 100, etc.) are preserved exactly as-is.
-- Safe to run multiple times (the USING clause handles the cast cleanly).

ALTER TABLE asanas ADD COLUMN IF NOT EXISTS page_primary integer;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS page_primary integer;

-- Drop dependent views before altering column type to avoid dependency errors
DROP VIEW IF EXISTS searchable_asanas_view;
DROP VIEW IF EXISTS view_asanas_admin;

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

-- Recreate the Admin View using the schema available at this point in time (March 2026).
-- Modern columns not yet added are provided as NULL placeholders to preserve view shape.
-- Do not use legacy asanas.category or asanas.hold columns.
CREATE OR REPLACE VIEW view_asanas_admin AS
SELECT
    a.id,
    a.name,
    a.iast,
    a.english_name,
    a.technique,
    a.description,
    ac.name AS category,
    a.category_id,
    NULL::text AS gem_plate,
    a.plate_numbers,
    NULL::jsonb AS hold_json,
    a.page_primary,
    a.requires_sides,
    NULL::jsonb AS preparatory_pose_id,
    NULL::jsonb AS recovery_pose_id,
    NULL::text AS audio_url,
    a.image_url,
    a.intensity,
    NULL::boolean AS is_system,
    NULL::boolean AS is_curated,
    NULL::uuid AS user_id
FROM public.asanas a
LEFT JOIN public.asana_categories ac ON ac.id = a.category_id;

GRANT SELECT ON view_asanas_admin TO authenticated;

-- Recreate the Searchable View using the schema available at this point in time.
-- NULL placeholders are used for columns not yet present on stages or asanas.
CREATE OR REPLACE VIEW searchable_asanas_view AS

  -- Arm 1: Base asanas (no stage context)
  SELECT
    a.id              AS source_id,
    a.id              AS asana_id,
    a.english_name    AS display_name,
    a.iast,
    a.name,
    ac.name           AS category,
    a.image_url,
    a.page_primary,
    NULL::text      AS stage_name,
    NULL::text      AS stage_title,
    NULL::text      AS stage_shorthand,
    'asana'         AS source_type
  FROM public.asanas a
  LEFT JOIN public.asana_categories ac ON ac.id = a.category_id

UNION ALL

  -- Arm 2: Stages - searchable by stage title / shorthand, resolves back to parent asana
  SELECT
    s.id::text      AS source_id,
    s.asana_id      AS asana_id,
    COALESCE(s.title, a.english_name)      AS display_name,
    NULL::text                             AS iast,      -- s.devanagari not yet present
    COALESCE(s.title, a.name)              AS name,
    ac.name         AS category,
    COALESCE(NULL::text, a.image_url)      AS image_url, -- s.image_url not yet present
    s.page_primary,
    s.stage_name,
    s.title         AS stage_title,
    s.shorthand     AS stage_shorthand,
    'stage'         AS source_type
  FROM public.stages s
  LEFT JOIN public.asanas a ON a.id = s.asana_id
  LEFT JOIN public.asana_categories ac ON ac.id = a.category_id;

GRANT SELECT ON searchable_asanas_view TO anon, authenticated;

  -- Arm 1: Base asanas (no stage context)
  SELECT
    a.id              AS source_id,          -- asana primary key (e.g. '047')
    a.id              AS asana_id,           -- always the asana row
    a.english_name    AS display_name,
    a.iast,
    a.name,
    ac.name           AS category,
    a.image_url,
    a.page_primary,
    NULL::text      AS stage_name,         -- no stage for base poses
    NULL::text      AS stage_title,
    NULL::text      AS stage_shorthand,
    'asana'         AS source_type
  FROM public.asanas a
  LEFT JOIN public.asana_categories ac ON ac.id = a.category_id

UNION ALL

  -- Arm 2: Stages - searchable by stage title / shorthand, resolves back to parent asana
  SELECT
    s.id::text      AS source_id,          -- stage row id
    s.asana_id      AS asana_id,           -- parent asana
    COALESCE(s.title, a.english_name)      AS display_name,
    s.devanagari    AS iast,
    COALESCE(s.title, a.name)              AS name,
    ac.name         AS category,
    COALESCE(s.image_url, a.image_url)     AS image_url,
    s.page_primary,
    s.stage_name,
    s.title         AS stage_title,
    s.shorthand     AS stage_shorthand,
    'stage'         AS source_type
  FROM stages s
  LEFT JOIN public.asanas a ON a.id = s.asana_id
  LEFT JOIN public.asana_categories ac ON ac.id = a.category_id;

GRANT SELECT ON searchable_asanas_view TO anon, authenticated;
