import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CURRICULUM_SLUG = 'iyengar_integrated_master_path_testing_v2';
const PROGRAM_NAME = 'Integrated Iyengar Practice Path - Testing v2';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const plan = [
  {
    week: 1,
    day: 1,
    nodeType: 'instruction',
    dayRole: 'orientation',
    completionRequirement: 'acknowledge',
    primaryFocus: 'Orientation',
    sourceReference: 'Testing v2 orientation',
    instructions: 'Read the week intention and prepare a quiet practice space.',
    estimatedMinutes: 5,
  },
  {
    week: 1,
    day: 2,
    nodeType: 'sequence',
    dayRole: 'practice',
    sequenceId: 114,
    completionRequirement: 'attempt',
    instructions: 'Light on Yoga Course 1 backbone practice for the test path.',
    estimatedMinutes: 40,
    sourceSequenceOrder: 1,
  },
  {
    week: 1,
    day: 3,
    nodeType: 'revision',
    dayRole: 'revision',
    completionRequirement: 'attempt',
    primaryFocus: 'Revision',
    sourceReference: 'Marker-led revision',
    instructions: 'Repeat a recently completed light foundation sequence if one is available.',
    estimatedMinutes: 25,
  },
  {
    week: 1,
    day: 4,
    nodeType: 'choice',
    dayRole: 'choice',
    completionRequirement: 'choose_one',
    primaryFocus: 'Choice',
    sourceReference: 'Student choice',
    instructions: 'Choose a light prior practice, pranayama preparation, or quiet standing review.',
    estimatedMinutes: 30,
  },
  {
    week: 1,
    day: 5,
    nodeType: 'sequence',
    dayRole: 'practice',
    sequenceId: 213,
    completionRequirement: 'attempt',
    instructions: 'Yoga: The Iyengar Way Lesson 1 as a second playable node.',
    estimatedMinutes: 35,
    sourceSequenceOrder: 2,
  },
  {
    week: 1,
    day: 6,
    nodeType: 'consolidation',
    dayRole: 'consolidation',
    completionRequirement: 'acknowledge',
    primaryFocus: 'Consolidation',
    sourceReference: 'Week 1 consolidation',
    instructions: 'Notice what felt steady this week; no new source sequence is required.',
    estimatedMinutes: 10,
  },
  {
    week: 1,
    day: 7,
    nodeType: 'recovery',
    dayRole: 'recovery',
    recoveryType: 'full_rest',
    completionRequirement: 'optional',
    primaryFocus: 'Recovery',
    sourceReference: 'Full rest',
    instructions: 'Full rest day. Optional Savasana or quiet observation only.',
    estimatedMinutes: 0,
  },
  {
    week: 2,
    day: 1,
    nodeType: 'instruction',
    dayRole: 'orientation',
    completionRequirement: 'acknowledge',
    primaryFocus: 'Orientation',
    sourceReference: 'Week 2 orientation',
    instructions: 'Review the Week 1 notes and set a simple intention for steadiness.',
    estimatedMinutes: 5,
  },
  {
    week: 2,
    day: 2,
    nodeType: 'sequence',
    dayRole: 'practice',
    sequenceId: 52,
    completionRequirement: 'attempt',
    instructions: 'Light on Pranayama preparatory practice as a gentle playable node.',
    estimatedMinutes: 20,
    sourceSequenceOrder: 3,
  },
  {
    week: 2,
    day: 3,
    nodeType: 'revision',
    dayRole: 'revision',
    completionRequirement: 'attempt',
    primaryFocus: 'Revision',
    sourceReference: 'Marker-led revision',
    instructions: 'Repeat the clearest learning edge from the previous playable node.',
    estimatedMinutes: 25,
  },
  {
    week: 2,
    day: 4,
    nodeType: 'sequence',
    dayRole: 'practice',
    sequenceId: 115,
    completionRequirement: 'attempt',
    instructions: 'Light on Yoga Course 1 Week 3 and 4 for continued playable coverage.',
    estimatedMinutes: 45,
    sourceSequenceOrder: 4,
  },
  {
    week: 2,
    day: 5,
    nodeType: 'assessment',
    dayRole: 'assessment',
    completionRequirement: 'acknowledge',
    primaryFocus: 'Readiness Check',
    sourceReference: 'Testing v2 readiness check',
    instructions: 'Record whether the current pace feels too much, balanced, or ready for more.',
    estimatedMinutes: 5,
  },
  {
    week: 2,
    day: 6,
    nodeType: 'choice',
    dayRole: 'choice',
    completionRequirement: 'choose_one',
    primaryFocus: 'Choice',
    sourceReference: 'Recovery-oriented choice',
    instructions: 'Choose quiet asana, short pranayama preparation, or a favourite light practice.',
    estimatedMinutes: 20,
  },
  {
    week: 2,
    day: 7,
    nodeType: 'recovery',
    dayRole: 'recovery',
    recoveryType: 'savasana',
    completionRequirement: 'optional',
    primaryFocus: 'Recovery',
    sourceReference: 'Savasana recovery',
    instructions: 'Recovery day. Keep it to Savasana, quiet breath observation, or full rest.',
    estimatedMinutes: 10,
  },
];

function orderIndex(week, day) {
  return Number(`${week}.${String(day).padStart(2, '0')}`);
}

function basePayload(row) {
  return {
    test_contract: 'curriculum_contract_v2_visible_non_sequence_week',
    placeholder_non_sequence: !row.sequenceId,
    adaptive_progression_future: true,
  };
}

function rowFromPlan(row, candidateBySequenceId) {
  const candidate = row.sequenceId ? candidateBySequenceId.get(row.sequenceId) : null;

  return {
    sequence_id: row.sequenceId ?? null,
    curriculum_slug: CURRICULUM_SLUG,
    program_name: PROGRAM_NAME,
    week_number: row.week,
    day_number: row.day,
    order_index: orderIndex(row.week, row.day),
    is_revision_node: ['revision', 'choice', 'consolidation'].includes(row.nodeType),
    special_instructions: row.instructions,
    source_name: candidate?.source_title || PROGRAM_NAME,
    source_reference: candidate?.source_reference || row.sourceReference,
    level_number: 1,
    intensity: row.nodeType === 'recovery' ? 'restorative' : candidate?.effective_intensity_band || 'light',
    primary_focus: candidate?.effective_primary_theme || row.primaryFocus || 'Mixed',
    is_active: true,
    node_type: row.nodeType,
    source_key: candidate?.source_key || null,
    source_rule_id: null,
    source_course: candidate?.source_course || null,
    curriculum_payload: basePayload(row),
    generated_from_rule: false,
    is_optional: ['choice', 'recovery'].includes(row.nodeType),
    is_rest_day: row.nodeType === 'recovery',
    requires_user_selection: ['choice', 'revision'].includes(row.nodeType),
    mastery_gate_required: false,
    curriculum_phase: 'testing_v2_contract',
    practice_track: row.dayRole,
    completion_requirement: row.completionRequirement,
    day_role: row.dayRole,
    recovery_type: row.recoveryType || null,
    is_visible: true,
    source_policy: row.sequenceId ? 'fixed_sequence' : 'placeholder_non_sequence',
    source_sequence_order: row.sourceSequenceOrder ?? null,
    estimated_minutes: row.estimatedMinutes,
    curriculum_unit_id: `testing_v2_w${row.week}`,
    adaptive_behavior: {
      status: 'future_placeholder',
      route_by_node_type: true,
    },
  };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const sequenceIds = plan
    .map((row) => row.sequenceId)
    .filter((sequenceId) => sequenceId != null);

  const { data: candidates, error: candidateError } = await supabase
    .from('v_master_curriculum_candidate_pool')
    .select('*')
    .in('sequence_id', sequenceIds);

  if (candidateError) throw candidateError;

  const candidateBySequenceId = new Map(
    (candidates || []).map((candidate) => [candidate.sequence_id, candidate]),
  );
  const missing = sequenceIds.filter((sequenceId) => !candidateBySequenceId.has(sequenceId));
  if (missing.length > 0) {
    throw new Error(`Missing candidate rows for sequence IDs: ${missing.join(', ')}`);
  }

  const rows = plan.map((row) => rowFromPlan(row, candidateBySequenceId));

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
  console.table(rows.map((row) => ({
    week: row.week_number,
    day: row.day_number,
    node_type: row.node_type,
    day_role: row.day_role,
    recovery_type: row.recovery_type,
    sequence_id: row.sequence_id,
  })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
