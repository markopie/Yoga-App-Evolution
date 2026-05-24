import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SOURCE_CURRICULUM_SLUG = 'iyengar_integrated_master_path_draft_v1';
const CURRICULUM_SLUG = 'iyengar_integrated_master_path_testing_v2';
const PROGRAM_NAME = 'Integrated Iyengar Practice Path - Testing v2';

const AUTOMATIC_ADAPTIVE_INSTRUCTIONS = {
  '7:6': 'Today\'s practice will revisit a prior lesson that would benefit from steadier understanding.',
  '9:6': 'Today\'s practice will revisit a suitable lighter practice if fatigue or reserve is accumulating.',
  '15:6': 'Today\'s practice will stay light, using a short marked practice or quiet recovery as appropriate.',
  '18:4': 'Today\'s practice will consolidate a Light on Yoga Course 1 backbone practice that needs steadier timing and ease.',
  '20:6': 'Today\'s practice will revisit an easy marked practice.',
  '22:6': 'Today\'s practice will use recovery-oriented revision after the Course 1 plateau practice.',
  '24:6': 'Today\'s practice will stay deliberately light after the Course 1 plateau practice, using a short, restorative, or quiet practice as appropriate.',
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function v2NodeType(row) {
  if (row.node_type === 'rest') return 'recovery';
  if (row.node_type === 'choice') return 'revision';
  return row.node_type;
}

function v2DayRole(row) {
  if (row.node_type === 'sequence') return 'practice';
  if (row.node_type === 'rest') return 'recovery';
  if (row.node_type === 'choice' || row.node_type === 'revision') return 'review';
  if (row.node_type === 'consolidation') return 'consolidation';
  return row.node_type || 'practice';
}

function isAdaptive(row) {
  return ['revision', 'choice', 'consolidation'].includes(row.node_type);
}

function isRecovery(row) {
  return row.node_type === 'rest';
}

function sourcePolicy(row) {
  if (!row.is_active) return 'composition_part_only';
  if (row.sequence_id && Array.isArray(row.curriculum_payload?.practice_composition)) return 'composed_sequence';
  if (row.sequence_id) return 'fixed_sequence';
  if (row.node_type === 'consolidation') return 'adaptive_consolidation';
  if (row.node_type === 'revision' || row.node_type === 'choice') return 'adaptive_revision';
  if (row.node_type === 'rest') return 'recovery_protocol';
  return 'curriculum_note';
}

function estimatedMinutes(row) {
  const payload = row.curriculum_payload || {};
  const duration = payload.composed_total_duration_minutes || payload.total_duration_minutes;
  if (Number.isFinite(Number(duration))) return Math.round(Number(duration));
  if (row.node_type === 'rest') return 0;
  if (row.node_type === 'consolidation') return 30;
  if (row.node_type === 'revision' || row.node_type === 'choice') return 25;
  return null;
}

function primaryFocus(row) {
  if (row.node_type === 'rest') return 'Recovery';
  if (row.node_type === 'choice' || row.node_type === 'revision') return 'Review';
  if (row.node_type === 'consolidation') return 'Consolidation';
  return row.primary_focus || 'Mixed';
}

function recoveryType(row) {
  if (row.node_type !== 'rest') return null;
  const text = `${row.source_reference || ''} ${row.special_instructions || ''}`.toLowerCase();
  if (text.includes('savasana')) return 'savasana_or_full_rest';
  return 'full_rest';
}

function adaptiveBehavior(row) {
  if (!row.is_active) {
    return {
      status: 'inactive_source_shadow',
      reason: row.curriculum_payload?.inactive_reason || 'source sequence scheduled elsewhere',
    };
  }

  if (row.sequence_id) {
    return {
      status: 'fixed',
      route_by_node_type: true,
    };
  }

  if (row.node_type === 'consolidation') {
    return {
      status: 'active',
      selector: 'best_prior_source_backed_practice',
      use_progress_and_ratings: true,
      fallback: 'most_recent_completed_or_previous_source_sequence',
    };
  }

  if (row.node_type === 'revision' || row.node_type === 'choice') {
    return {
      status: 'active',
      selector: 'marked_or_recent_prior_practice',
      preferred_markers: ['concentrate', 'do_again', 'favourite'],
      use_progress_and_ratings: true,
      fallback: 'most_recent_completed_or_previous_source_sequence',
    };
  }

  if (row.node_type === 'rest') {
    return {
      status: 'active',
      selector: 'recovery_protocol',
      fallback: 'acknowledge_recovery_day',
    };
  }

  return {
    status: 'active',
    selector: 'curriculum_metadata',
  };
}

function sourceReference(row) {
  if (row.node_type === 'choice') return 'Do Again / Concentrate revision buffer';
  return row.source_reference;
}

function specialInstructions(row) {
  const automaticInstruction = AUTOMATIC_ADAPTIVE_INSTRUCTIONS[`${row.week_number}:${row.day_number}`];
  if (automaticInstruction && ['choice', 'revision', 'consolidation'].includes(row.node_type)) {
    return automaticInstruction;
  }

  if (row.node_type === 'choice') {
    return row.special_instructions.replace(/^Reserve-alert choice:/, 'Reserve-alert review:');
  }
  return row.special_instructions;
}

async function hasProgramCurriculumColumn(columnName) {
  const { error } = await supabase
    .from('program_curriculum')
    .select(columnName)
    .limit(1);

  return !error;
}

function rowFromDraft(row, sourceSequenceOrder, options = {}) {
  const { id, ...draftValues } = row;
  const active = row.is_active === true;
  const policy = sourcePolicy(row);
  const dayRole = v2DayRole(row);

  return {
    ...draftValues,
    curriculum_slug: CURRICULUM_SLUG,
    program_name: PROGRAM_NAME,
    node_type: v2NodeType(row),
    day_role: dayRole,
    recovery_type: recoveryType(row),
    is_visible: active,
    source_policy: policy,
    source_sequence_order: row.sequence_id ? sourceSequenceOrder : null,
    estimated_minutes: estimatedMinutes(row),
    curriculum_unit_id: `testing_v2_w${row.week_number}`,
    adaptive_behavior: adaptiveBehavior(row),
    is_revision_node: isAdaptive(row),
    ...(options.hasIsOptional ? { is_optional: isRecovery(row) } : {}),
    is_rest_day: isRecovery(row),
    requires_user_selection: false,
    completion_requirement: isRecovery(row) ? 'optional' : 'attempt',
    primary_focus: primaryFocus(row),
    source_reference: sourceReference(row),
    special_instructions: specialInstructions(row),
    practice_track: isRecovery(row) ? 'recovery' : row.node_type === 'choice' ? 'revision' : row.practice_track,
    curriculum_payload: {
      ...(row.curriculum_payload || {}),
      v2_contract: 'testing_v2_from_draft_v1_source_spine',
      placeholder_non_sequence: false,
      source_curriculum_slug: SOURCE_CURRICULUM_SLUG,
      original_node_type: row.node_type,
      day_role: dayRole,
      source_policy: policy,
    },
  };
}

function summariseRows(rows) {
  const sourceBacked = rows.filter((row) =>
    row.sequence_id != null || Array.isArray(row.curriculum_payload?.practice_composition)
  );
  const adaptive = rows.filter((row) =>
    ['adaptive_revision', 'adaptive_consolidation'].includes(row.source_policy)
  );
  const recovery = rows.filter((row) => row.node_type === 'recovery');
  const placeholders = rows.filter((row) => row.curriculum_payload?.placeholder_non_sequence === true);

  return {
    total: rows.length,
    active_visible: rows.filter((row) => row.is_active && row.is_visible).length,
    source_backed: sourceBacked.length,
    adaptive: adaptive.length,
    recovery: recovery.length,
    placeholders: placeholders.length,
  };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const { data: draftRows, error: draftError } = await supabase
    .from('program_curriculum')
    .select('*')
    .eq('curriculum_slug', SOURCE_CURRICULUM_SLUG)
    .order('order_index');
  if (draftError) throw draftError;
  if (!draftRows?.length) throw new Error(`No source rows found for ${SOURCE_CURRICULUM_SLUG}.`);

  const hasIsOptional = await hasProgramCurriculumColumn('is_optional');

  let sourceSequenceOrder = 0;
  const rows = draftRows.map((row) => {
    if (row.sequence_id != null) sourceSequenceOrder += 1;
    return rowFromDraft(row, row.sequence_id != null ? sourceSequenceOrder : null, { hasIsOptional });
  });

  const { error: deleteError } = await supabase
    .from('program_curriculum')
    .delete()
    .eq('curriculum_slug', CURRICULUM_SLUG);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from('program_curriculum')
    .insert(rows);
  if (insertError) throw insertError;

  console.log(`Inserted ${rows.length} rows for ${CURRICULUM_SLUG}.`);
  console.table([summariseRows(rows)]);
  console.table(
    Object.entries(rows.reduce((acc, row) => {
      acc[row.source_policy] = (acc[row.source_policy] || 0) + 1;
      return acc;
    }, {})).map(([source_policy, count]) => ({ source_policy, count })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
