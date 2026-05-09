# Curriculum Roadmap Prototype - Review Notes

**Date:** 2026-05-09
**Status:** Corrected after Supabase environment reconciliation. No production files, schema, RLS, auth, migrations, or data were changed.

## Environment Correction

The earlier review notes in this file were based on a wrong/old Bolt MCP Supabase project and must not be used for implementation decisions.

- Actual app runtime project: `qrcpiyncvfmpmeuyhsha`
- Runtime source of truth: `src/services/supabaseClient.js`

The app imports `src/services/supabaseClient.js` directly. Local `.env` `VITE_SUPABASE_URL` values used by Bolt did not control the app runtime target.

## Confirmed App Runtime Project

The real app target remains:

```text
https://qrcpiyncvfmpmeuyhsha.supabase.co
```

Project ref:

```text
qrcpiyncvfmpmeuyhsha
```

## Confirmed Runtime Schema

In the actual app project, `public.sequence_completions` includes:

```text
id
title
category
completed_at
duration_seconds
notes
created_at
status
user_id
rating
sequence_id
curriculum_node_id
difficulty_feedback
completed
duration_scale_used
planned_duration_minutes
actual_adjusted_duration_minutes
```

Also confirmed present in the app project:

- `public.completion_rating_options`
- `public.program_curriculum`
- `public.source_sequence_inventory`
- `public.v_source_sequence_inventory_enriched`
- RPC `get_today_curriculum_practice`
- RPC `get_next_curriculum_node`
- RPC `resolve_revision_curriculum_node`

## Invalidated Findings

Any claim that the live app database only has the original seven-column `sequence_completions` table was a wrong-project finding. It did not apply to the app runtime project `qrcpiyncvfmpmeuyhsha`.

Specifically, these claims are invalid for the real app project:

- `sequence_completions.rating` is missing.
- `sequence_completions.curriculum_node_id` is missing.
- `sequence_completions.sequence_id` is missing.
- `sequence_completions.user_id` is missing.
- `completion_rating_options` is missing.
- `program_curriculum` is missing.
- `get_today_curriculum_practice` is missing.

## Prototype Boundary

The roadmap prototype remains mock-data only:

- Do not connect it to Supabase.
- Do not add migrations.
- Do not change schema, RLS, auth, RPCs, or data.
- Do not modify curriculum runtime, resume logic, rating flow, player flow, or production roadmap integration.
- Keep prototype work isolated under `prototypes/curriculum-roadmap/`.

## Future Roadmap Integration Note

The prototype can continue to model a future read-only roadmap RPC, but it should use the confirmed app project shape in `roadmap.js` as its reference. A future production implementation would likely need a read-only `get_curriculum_roadmap` RPC that returns denormalized curriculum nodes, completion/rating state, composed practice parts, and source coverage.
