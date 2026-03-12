# Database Schema Keys

## Database Schema (Row Level Security)
- **Unified Global Tables** (`asanas`, `courses`, `stages`, `sequence_completions`): 
  - `asanas`, `courses`, `stages` are public read-mostly, but users can upsert directly into them.
  - Custom user sequences/poses are stored globally alongside official data (leveraging unique constraints).
  - `sequence_completions`: Private; access restricted to `auth.uid() = user_id`.

## asanas
`['name', 'id', 'iast', 'plate_numbers', 'intensity', 'requires_sides', 'page_2001', 'page_2015', 'technique', 'category', 'note', 'stages', 'hold', 'english_name', 'last_edited', 'description', 'is_system', 'recovery_pose_id', 'hold_json', 'preparatory_pose_id', 'how_to_use_yoga_id', 'yoga_the_iyengar_way_id']`

## user_asanas *(DEPRECATED - Migrated to asanas)*
`['name', 'id', 'iast', 'plate_numbers', 'intensity', 'requires_sides', 'page_2001', 'page_2015', 'technique', 'category', 'note', 'stages', 'hold', 'english_name', 'last_edited', 'description', 'user_id', 'hold_json']`

## stages
`['stage_name', 'asana_id', 'title', 'shorthand', 'full_technique', 'plate_number', 'id', 'hold', 'hold_json', 'preparatory_pose_id', 'recover_pose_id']`

## user_stages *(DEPRECATED - Migrated to stages)*
`['id', 'asana_id', 'stage_name', 'shorthand', 'full_technique', 'created_at', 'title', 'hold', 'parent_id', 'user_id', 'hold_json']`

## courses
`['id', 'title', 'category', 'sequence_text', 'last_edited']`

## user_sequences *(DEPRECATED - Migrated to courses)*
`['id', 'title', 'category', 'sequence_text', 'pose_count', 'total_seconds', 'created_at', 'updated_at', 'user_id']`

## sequence_completions
`['id', 'title', 'category', 'completed_at', 'duration_seconds', 'notes', 'created_at', 'status', 'user_id']`
