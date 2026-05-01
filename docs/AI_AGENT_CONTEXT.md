cat > docs/AI_AGENT_CONTEXT.md <<'EOF'
# Yoga App AI Agent Context

## Core systems

- `course_sequence_analysis` is a cached course analysis table.
- `refresh_course_sequence_analysis_for_course(course_id)` recalculates one course.
- `course_analysis_refresh_queue` stores courses needing recalculation.
- `process_course_analysis_refresh_queue(limit)` processes queued courses.
- `completion_rating_options` is the canonical source for completion rating UI.

## Rules

- Do not hardcode rating labels in JS/HTML.
- Do not edit generated docs manually.
- Save all SQL changes in `supabase/migrations/`.
- Run SQL in Supabase after saving migration files.
- Keep backups out of Git.

## Course analysis logic

- Bilateral poses are doubled using `requires_sides`.
- Savasana is excluded from teaching-theme classification.
- Standard finishing inversions are excluded from teaching-theme classification.
- Finishing inversions remain in `all_theme_profile` and total duration.
EOF