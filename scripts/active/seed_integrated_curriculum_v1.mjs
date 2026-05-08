import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CURRICULUM_SLUG = 'iyengar_integrated_master_path_draft_v1';
const PROGRAM_NAME = 'Integrated Iyengar Practice Path - Draft v1';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const weeklyPlan = [
  [1, 1, 'sequence', 173, 'Start gently with How to Use Yoga Week 1 Day 1.'],
  [1, 2, 'sequence', 213, 'Yoga: The Iyengar Way Lesson 1 for lesson-based foundation work.'],
  [1, 3, 'sequence', 52, 'Light on Pranayama preparatory practice. Keep the breath quiet and unforced.'],
  [1, 4, 'sequence', 114, 'Light on Yoga Course 1 backbone sequence, Week 1 and 2.'],
  [1, 5, 'sequence', 174, 'Shorter How to Use Yoga standing foundation repeat.'],
  [1, 6, 'revision', null, 'Revision day: repeat a completed sequence marked Do Again, Concentrate, or Favourite.'],
  [1, 7, 'rest', null, 'Rest day. Optional Savasana or quiet observation only.'],

  [2, 1, 'sequence', 175, 'How to Use Yoga Week 1 Day 3 and 5 continuation.'],
  [2, 2, 'sequence', 215, 'Yoga: The Iyengar Way Lesson 2.'],
  [2, 3, 'sequence', 53, 'Light on Pranayama preparatory continuation.'],
  [2, 4, 'sequence', 115, 'Light on Yoga Course 1 Week 3 and 4.'],
  [2, 5, 'sequence', 361, 'Yoga: A Gem for Women introductory three-month course.'],
  [2, 6, 'revision', null, 'Revision day: let markers guide the repeat; otherwise repeat the most recent light foundation practice.'],
  [2, 7, 'rest', null, 'Full rest day.'],

  [3, 1, 'sequence', 178, 'How to Use Yoga Week 2 opening practice.'],
  [3, 2, 'sequence', 216, 'Yoga: The Iyengar Way Lesson 3.'],
  [3, 3, 'sequence', 54, 'Light on Pranayama Week 5 and 6.'],
  [3, 4, 'sequence', 116, 'Light on Yoga Course 1 Week 5 and 6.'],
  [3, 5, 'sequence', 176, 'How to Use Yoga Week 1 Day 6 as a steady foundation repeat.'],
  [3, 6, 'revision', null, 'Revision day: prioritize Concentrate, then Do Again, then Favourite.'],
  [3, 7, 'rest', null, 'Rest day.'],

  [4, 1, 'sequence', 179, 'How to Use Yoga Week 2 sitting-oriented practice.'],
  [4, 2, 'sequence', 217, 'Yoga: The Iyengar Way Lesson 4.'],
  [4, 3, 'sequence', 55, 'Light on Pranayama Week 7 and 8.'],
  [4, 4, 'sequence', 117, 'Light on Yoga Course 1 Week 8; Week 7 is treated as consolidation in the source logic.'],
  [4, 5, 'sequence', 362, 'Short Yoga Gem Virasana practice.'],
  [4, 6, 'revision', null, 'Revision buffer before moving into the next foundation block.'],
  [4, 7, 'rest', null, 'Full rest day.'],

  [5, 1, 'sequence', 180, 'How to Use Yoga Week 2 Day 6.'],
  [5, 2, 'sequence', 218, 'Yoga: The Iyengar Way Lesson 5.'],
  [5, 3, 'sequence', 56, 'Light on Pranayama Week 9 and 10.'],
  [5, 4, 'sequence', 118, 'Light on Yoga Course 1 Week 9 and 10.'],
  [5, 5, 'sequence', 177, 'How to Use Yoga Week 1 Day 7 backbend-focused foundation practice. Work carefully.'],
  [5, 6, 'revision', null, 'Do Again / Concentrate test node: repeat a marked earlier sequence if available.'],
  [5, 7, 'rest', null, 'Rest day.'],

  [6, 1, 'sequence', 208, 'How to Use Yoga Week 3 opening practice.'],
  [6, 2, 'sequence', 219, 'Yoga: The Iyengar Way Lesson 6.'],
  [6, 3, 'sequence', 57, 'Light on Pranayama Week 11 and 12.'],
  [6, 4, 'sequence', 119, 'Light on Yoga Course 1 Week 11 and 12.'],
  [6, 5, 'sequence', 363, 'Yoga Gem First Year Day 1 and 5. Reduce holds if needed.'],
  [6, 6, 'revision', null, 'Revision day: repeat the clearest learning edge from the previous two weeks.'],
  [6, 7, 'rest', null, 'Full rest day.'],

  [7, 1, 'sequence', 209, 'How to Use Yoga Week 3 Day 2 and 4.'],
  [7, 2, 'sequence', 220, 'Yoga: The Iyengar Way Lesson 7. Treat as slightly stronger work.'],
  [7, 3, 'sequence', 58, 'Light on Pranayama Week 13 and 15.'],
  [7, 4, 'sequence', 120, 'Light on Yoga Course 1 Week 14 and 15. Keep the overall dose moderate.'],
  [7, 5, 'sequence', 181, 'How to Use Yoga Week 2 Day 7 backbend-focused foundation practice.'],
  [7, 6, 'revision', null, 'Revision day: choose a prior practice that needs steadier understanding.'],
  [7, 7, 'rest', null, 'Rest day.'],

  [8, 1, 'sequence', 211, 'How to Use Yoga Week 3 Day 6.'],
  [8, 2, 'sequence', 221, 'Yoga: The Iyengar Way Lesson 8.'],
  [8, 3, 'sequence', 59, 'Light on Pranayama Week 16 and 18.'],
  [8, 4, 'sequence', 121, 'Light on Yoga Course 1 Week 16 and 17. Shorten if the practice runs too long.'],
  [8, 5, 'sequence', 365, 'Yoga Gem First Year Day 3. Keep intensity below strain.'],
  [8, 6, 'revision', null, 'Revision day: marker-led repeat before the reserve-alert week.'],
  [8, 7, 'rest', null, 'Full rest day.'],

  [9, 1, 'sequence', 212, 'How to Use Yoga Week 3 Day 7. Backbend-focused; keep it conservative.'],
  [9, 2, 'sequence', 222, 'Yoga: The Iyengar Way Lesson 9.'],
  [9, 3, 'sequence', 60, 'Light on Pranayama Week 19 and 22.'],
  [9, 4, 'sequence', 122, 'Light on Yoga Course 1 Week 19 to 21. Longer forward-bend sequence; reduce holds if needed.'],
  [9, 5, 'sequence', 204, 'How to Use Yoga Week 4 opening practice.'],
  [9, 6, 'choice', null, 'Reserve-alert choice: choose Do Again, Concentrate, or a light prior sequence if fatigue is accumulating.'],
  [9, 7, 'rest', null, 'Rest day.'],

  [10, 1, 'revision', null, 'Consolidation week: repeat a marked foundation sequence rather than adding new material.'],
  [10, 2, 'sequence', 223, 'Yoga: The Iyengar Way Lesson 10 as a lighter lesson anchor.'],
  [10, 3, 'sequence', 61, 'Light on Pranayama Week 23 and 25.'],
  [10, 4, 'revision', null, 'Consolidation repeat: select the Light on Yoga or How to Use Yoga practice that felt least settled.'],
  [10, 5, 'sequence', 205, 'How to Use Yoga Week 4 Day 2 and 4. Keep this as an easy forward-bend day.'],
  [10, 6, 'revision', null, 'End-of-block consolidation: repeat the most useful completed sequence from Weeks 6-9.'],
  [10, 7, 'rest', null, 'Full rest day.'],

  [11, 1, 'sequence', 206, 'How to Use Yoga Week 4 Day 6.'],
  [11, 2, 'sequence', 224, 'Yoga: The Iyengar Way Lesson 11.'],
  [11, 3, 'sequence', 62, 'Light on Pranayama Course 2 opening practice. Treat the course transition as gentle and technical.'],
  [11, 4, 'sequence', 123, 'Light on Yoga Course 1 Week 22 to 25. Longer seated sequence; reduce holds if needed.'],
  [11, 5, 'sequence', 366, 'Yoga Gem First Year Day 4. Keep the practice steady rather than ambitious.'],
  [11, 6, 'revision', null, 'Revision day: repeat a marked or recent practice after the consolidation week.'],
  [11, 7, 'rest', null, 'Rest day.'],

  [12, 1, 'sequence', 207, 'How to Use Yoga Week 4 Day 7. Backbend-focused foundation practice.'],
  [12, 2, 'sequence', 225, 'Yoga: The Iyengar Way Lesson 12.'],
  [12, 3, 'sequence', 63, 'Light on Pranayama Course 2 Week 29 to 31. Stay well within capacity.'],
  [12, 4, 'sequence', 124, 'Light on Yoga Course 1 Week 26 to 30. Longer forward-bend sequence; shorten if needed.'],
  [12, 5, 'sequence', 367, 'Yoga Gem First Year Day 6. Treat as a final foundation exposure, not a test.'],
  [12, 6, 'revision', null, 'End-of-draft revision: repeat the most important Do Again or Concentrate sequence.'],
  [12, 7, 'rest', null, 'Full rest day.'],
];

const compositionPilotBySequenceId = new Map([
  [173, {
    special_instructions: 'Start gently with How to Use Yoga Week 1 Day 1, then complete the short introductory pranayama part.',
    composed_total_duration_minutes: 47.42,
    practice_composition: [
      { role: 'primary_asana', sequence_id: 173, counts_for_source_completion: true },
      { role: 'appended_pranayama', sequence_id: 52, counts_for_source_completion: true },
    ],
  }],
  [115, {
    special_instructions: 'Light on Yoga Course 1 Week 3 and 4, followed by the short Light on Pranayama Week 3 and 4 practice.',
    composed_total_duration_minutes: 48.67,
    practice_composition: [
      { role: 'primary_asana', sequence_id: 115, counts_for_source_completion: true },
      { role: 'appended_pranayama', sequence_id: 53, counts_for_source_completion: true },
    ],
  }],
]);

const inactiveCompositionPartBySequenceId = new Map([
  [52, {
    superseded_by_curriculum_node_sequence_id: 173,
    inactive_reason: 'source_sequence_scheduled_as_composition_part',
    special_instructions: 'Inactive pilot node: Light on Pranayama Week 1 and 2 is now appended to Week 1 Day 1.',
  }],
  [53, {
    superseded_by_curriculum_node_sequence_id: 115,
    inactive_reason: 'source_sequence_scheduled_as_composition_part',
    special_instructions: 'Inactive pilot node: Light on Pranayama Week 3 and 4 is now appended to Week 2 Day 4.',
  }],
]);

function orderIndex(week, day) {
  return Number(`${week}.${String(day).padStart(2, '0')}`);
}

function nodePayload(kind, week, day) {
  const base = {
    draft_phase: 'v1_12_week_foundation',
    weekly_cadence: 'four_asana_one_pranayama_one_revision_one_rest',
    source_mix: 'loy_backbone_htuy_revision_gem_variety_iyengar_lessons_lop_parallel',
  };

  if (kind === 'revision' || kind === 'choice' || kind === 'consolidation') {
    return {
      ...base,
      preferred_markers: ['concentrate', 'do_again', 'favourite'],
      fallback_logic: 'repeat_most_recent_completed_light_foundation_sequence',
      requires_marker_if_available: true,
      choice_source_weeks: Array.from({ length: Math.max(week - 1, 1) }, (_, index) => index + 1),
      cadence_day: day,
    };
  }

  if (kind === 'rest') {
    return {
      ...base,
      rest_protocol: 'full_rest_optional_savasana_or_quiet_observation',
    };
  }

  return base;
}

function nonSequenceRow([week, day, nodeType, , instructions]) {
  const isAdaptive = ['revision', 'choice', 'consolidation'].includes(nodeType);
  const isRest = nodeType === 'rest';
  const isConsolidation = instructions.toLowerCase().includes('consolidation');

  return {
    sequence_id: null,
    curriculum_slug: CURRICULUM_SLUG,
    program_name: PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: isAdaptive,
    special_instructions: instructions,
    source_name: isAdaptive ? 'How to Use Yoga' : PROGRAM_NAME,
    source_reference: isRest
      ? 'Rest / Savasana'
      : nodeType === 'choice'
        ? 'Reserve alert / Do Again choice'
        : isConsolidation
          ? 'Foundation consolidation'
          : 'Do Again / Concentrate revision buffer',
    level_number: 1,
    intensity: isRest ? 'restorative' : 'light',
    primary_focus: isRest ? 'Rest' : 'Revision',
    is_active: true,
    node_type: nodeType,
    source_key: isAdaptive ? 'how_to_use_yoga' : null,
    source_rule_id: null,
    source_course: null,
    curriculum_payload: {
      ...nodePayload(nodeType, week, day),
      ...(isConsolidation ? { consolidation_protocol: true } : {}),
    },
    generated_from_rule: isAdaptive,
    is_optional: isRest,
    is_rest_day: isRest,
    requires_user_selection: isAdaptive,
    mastery_gate_required: false,
    curriculum_phase: week >= 10 ? 'foundation_consolidation' : 'foundation',
    practice_track: isRest ? 'rest' : 'revision',
    completion_requirement: isRest ? 'optional' : 'attempt',
  };
}

function sequenceRow(planRow, candidate) {
  const [week, day, nodeType, sequenceId, instructions] = planRow;
  const compositionPilot = compositionPilotBySequenceId.get(sequenceId);
  const inactivePilot = inactiveCompositionPartBySequenceId.get(sequenceId);

  return {
    sequence_id: sequenceId,
    curriculum_slug: CURRICULUM_SLUG,
    program_name: PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: false,
    special_instructions: inactivePilot?.special_instructions || compositionPilot?.special_instructions || instructions,
    source_name: candidate.source_title,
    source_reference: candidate.source_reference,
    level_number: week <= 10 ? 1 : 2,
    intensity: candidate.effective_intensity_band ?? candidate.intensity_band ?? 'light',
    primary_focus: candidate.effective_primary_theme ?? candidate.primary_theme ?? 'Mixed',
    is_active: !inactivePilot,
    node_type: nodeType,
    source_key: candidate.source_key,
    source_rule_id: null,
    source_course: candidate.source_course,
    curriculum_payload: {
      ...nodePayload(nodeType, week, day),
      candidate_inventory_id: candidate.inventory_id,
      curriculum_role: candidate.curriculum_role,
      planned_phase: candidate.planned_phase,
      total_duration_minutes: candidate.total_duration_minutes,
      course_style: candidate.course_style,
      ...(compositionPilot ? {
        composition_strategy: 'primary_asana_plus_appendable_pranayama',
        practice_composition: compositionPilot.practice_composition,
        composed_total_duration_minutes: compositionPilot.composed_total_duration_minutes,
        composition_test_pilot: true,
      } : {}),
      ...(inactivePilot ? {
        inactive_reason: inactivePilot.inactive_reason,
        superseded_by_curriculum_node_sequence_id: inactivePilot.superseded_by_curriculum_node_sequence_id,
        composition_test_pilot: true,
      } : {}),
    },
    generated_from_rule: true,
    is_optional: false,
    is_rest_day: false,
    requires_user_selection: false,
    mastery_gate_required: false,
    curriculum_phase: week === 10
      ? 'foundation_consolidation'
      : candidate.suggested_curriculum_phase ?? candidate.curriculum_phase ?? 'foundation',
    practice_track: candidate.suggested_practice_track ?? candidate.curriculum_practice_track ?? 'asana',
    completion_requirement: 'attempt',
  };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const sequenceIds = weeklyPlan
    .filter((row) => row[2] === 'sequence')
    .map((row) => row[3]);

  const { data: candidates, error: candidateError } = await supabase
    .from('v_master_curriculum_candidate_pool')
    .select('*')
    .in('sequence_id', sequenceIds);

  if (candidateError) throw candidateError;

  const candidateBySequenceId = new Map(
    candidates.map((candidate) => [candidate.sequence_id, candidate]),
  );

  const missing = sequenceIds.filter((sequenceId) => !candidateBySequenceId.has(sequenceId));
  if (missing.length > 0) {
    throw new Error(`Missing candidate rows for sequence IDs: ${missing.join(', ')}`);
  }

  const rows = weeklyPlan.map((planRow) => {
    if (planRow[2] !== 'sequence') return nonSequenceRow(planRow);
    return sequenceRow(planRow, candidateBySequenceId.get(planRow[3]));
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

  const { data: inserted, error: insertedError } = await supabase
    .from('program_curriculum')
    .select('node_type,source_key,source_course,sequence_id')
    .eq('curriculum_slug', CURRICULUM_SLUG)
    .order('order_index');

  if (insertedError) throw insertedError;

  const coverage = new Map();
  for (const row of inserted.filter((item) => item.sequence_id !== null)) {
    const key = `${row.source_key} | ${row.source_course}`;
    coverage.set(key, (coverage.get(key) ?? 0) + 1);
  }

  console.log(`Inserted ${inserted.length} rows for ${CURRICULUM_SLUG}.`);
  console.log('Node types:');
  console.table(
    Object.entries(
      inserted.reduce((acc, row) => {
        acc[row.node_type] = (acc[row.node_type] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([node_type, count]) => ({ node_type, count })),
  );
  console.log('Sequence coverage:');
  console.table(
    [...coverage.entries()].map(([source_course, placed_sequences]) => ({
      source_course,
      placed_sequences,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
