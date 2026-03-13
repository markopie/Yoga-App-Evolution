-- Migration: Create searchable_asanas_view
-- Unifies asanas + stages into one searchable surface via UNION.
-- The Browse Screen queries this view instead of the raw asanas table,
-- so a search for "Supta" returns both base poses AND stage-level variations.

CREATE OR REPLACE VIEW searchable_asanas_view AS

  -- Arm 1: Base asanas (no stage context)
  SELECT
    id              AS source_id,          -- asana primary key (e.g. '047')
    id              AS asana_id,           -- always the asana row
    english_name    AS display_name,
    iast,
    name,
    category,
    image_url,
    page_primary,
    NULL::text      AS stage_name,         -- no stage for base poses
    NULL::text      AS stage_title,
    NULL::text      AS stage_shorthand,
    'asana'         AS source_type
  FROM asanas

UNION ALL

  -- Arm 2: Stages — searchable by stage title / shorthand, resolves back to parent asana
  SELECT
    s.id::text      AS source_id,          -- stage row id
    s.asana_id      AS asana_id,           -- parent asana
    COALESCE(s.title, a.english_name)      AS display_name,
    s.devanagari    AS iast,
    COALESCE(s.title, a.name)              AS name,
    a.category,
    COALESCE(s.image_url, a.image_url)     AS image_url,
    s.page_primary,
    s.stage_name,
    s.title         AS stage_title,
    s.shorthand     AS stage_shorthand,
    'stage'         AS source_type
  FROM stages s
  LEFT JOIN asanas a ON a.id = s.asana_id;

-- Grant read access
GRANT SELECT ON searchable_asanas_view TO anon, authenticated;
