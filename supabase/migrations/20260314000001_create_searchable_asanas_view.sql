-- Migration: Create searchable_asanas_view
-- Unifies asanas + stages into one searchable surface via UNION.
-- The Browse Screen queries this view instead of the raw asanas table,
-- so a search for "Supta" returns both base poses AND stage-level variations.

-- Compatibility for fresh migration replay from the original minimal schema.
CREATE TABLE IF NOT EXISTS public.asana_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

ALTER TABLE asanas ADD COLUMN IF NOT EXISTS category_id bigint REFERENCES public.asana_categories(id);
ALTER TABLE asanas ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE asanas ADD COLUMN IF NOT EXISTS page_primary integer;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS asana_id text;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS devanagari text;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS page_primary integer;

CREATE OR REPLACE VIEW searchable_asanas_view AS

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

  -- Arm 2: Stages — searchable by stage title / shorthand, resolves back to parent asana
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
  FROM public.stages s
  LEFT JOIN public.asanas a ON a.id = s.asana_id
  LEFT JOIN public.asana_categories ac ON ac.id = a.category_id;

-- Grant read access
GRANT SELECT ON searchable_asanas_view TO anon, authenticated;
