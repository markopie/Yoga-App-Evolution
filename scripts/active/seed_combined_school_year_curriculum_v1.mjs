import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const COMBINED_CURRICULUM_SLUG = 'iyengar_combined_school_year_v1';
export const COMBINED_PROGRAM_NAME = 'Integrated Iyengar School-Year Path';
export const COMBINED_NODE_ID_BASE = 910000;
export const COMBINED_WEEK_COUNT = 40;
export const COMBINED_DAYS_PER_WEEK = 7;
export const MAX_COMPOSED_DURATION_MINUTES = 65;

export const CATEGORY_IDS = {
  GENERAL: 1,
  LIGHT_ON_PRANAYAMA: 2,
  LIGHT_ON_YOGA: 5,
  HOW_TO_USE_YOGA: 10,
  YOGA_THE_IYENGAR_WAY: 13,
  FLOW: 55,
  CYCLE: 56,
  YOGA_A_GEM_FOR_WOMEN: 232,
};

export const EXCLUDED_CATEGORY_IDS = new Set([
  CATEGORY_IDS.GENERAL,
  CATEGORY_IDS.FLOW,
  CATEGORY_IDS.CYCLE,
]);

export const EXCLUDED_SUBCATEGORY_IDS = new Set([
  5,   // Light on Yoga > Therapeutic
  235, // Yoga The Iyengar Way > Remedial Programmes
  236, // Yoga A Gem For Women > Hygienic Habits
]);

export const INCLUDED_CATEGORY_IDS = new Set([
  CATEGORY_IDS.LIGHT_ON_YOGA,
  CATEGORY_IDS.YOGA_THE_IYENGAR_WAY,
  CATEGORY_IDS.HOW_TO_USE_YOGA,
  CATEGORY_IDS.YOGA_A_GEM_FOR_WOMEN,
  CATEGORY_IDS.LIGHT_ON_PRANAYAMA,
]);

const TERM_DEFS = [
  { term: 1, level: 1, weeks: [1, 10], phase: 'foundation_orientation', label: 'Term 1: Foundation & Orientation' },
  { term: 2, level: 2, weeks: [11, 20], phase: 'foundation_consolidation', label: 'Term 2: Foundation Consolidation' },
  { term: 3, level: 3, weeks: [21, 30], phase: 'course_1_plateau_range', label: 'Term 3: Course 1 Plateau & Range' },
  { term: 4, level: 4, weeks: [31, 40], phase: 'integration_readiness', label: 'Term 4: Integration & Readiness' },
];

const DAY_ROLE = {
  1: 'foundation',
  2: 'technical',
  3: 'quiet',
  4: 'anchor',
  5: 'support',
  6: 'revision',
  7: 'rest',
};

const SOURCE_KEY_BY_CATEGORY_ID = new Map([
  [CATEGORY_IDS.LIGHT_ON_PRANAYAMA, 'light_on_pranayama'],
  [CATEGORY_IDS.LIGHT_ON_YOGA, 'light_on_yoga'],
  [CATEGORY_IDS.HOW_TO_USE_YOGA, 'how_to_use_yoga'],
  [CATEGORY_IDS.YOGA_THE_IYENGAR_WAY, 'yoga_the_iyengar_way'],
  [CATEGORY_IDS.YOGA_A_GEM_FOR_WOMEN, 'yoga_gem_for_women'],
]);

const DAY_SOURCE_PLAN = {
  1: [
    173, 174, 175, 176, 177, 178, 179, 180, 181, 208,
    209, 211, 212, 204, 205, 206, 207, 200, 201, 202,
    203, 196, 198, 199, 210, 193, 194, 195, 197, 189,
    190, 191, 192, 271, 301, 303, 304, 305, 361, 363,
  ],
  2: [
    213, 215, 216, 217, 218, 219, 220, 221, 222, 223,
    224, 225, 226, 227, 228, 230, 231, 233, 234, 235,
    238, 240, 241, 242, 244, 245, 246, 248, 249, 250,
    252, 253, 254, 256, 264, 265, 267, 268, 269, 272,
  ],
  3: [
    229, 232, 239, 243, 247, 251, 255, 266,
    52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
    62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
    72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
    82, 83, 84, 85, 86, 87, 88, 89, 90, 91,
  ],
  4: [
    114, 115, 116, 117, 118, 119, 120, 121, 122, 123,
    124, 125, 126, 127, 113, 129, 130, 131, 132, 133,
    134, 135, 136, 137, 138, 139, 140, 141, 128, 149,
    150, 151, 152, 153, 154, 155, 156, 157, 158, 159,
  ],
  5: [
    364, 365, 366, 367, 368, 369, 370, 371, 372, 373,
    374, 375, 376, 377, 378, 379, 380, 381, 270, 273,
    274, 275, 276, 277, 278, 279, 280, 281, 282, 289,
    290, 291, 292, 293, 294, 296, 297, 298, 299, 300,
  ],
};

const PRANAYAMA_PLAN = [
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
  62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
  72, 73, 74, 75, 76, 77, 78, 79, 80, 81,
  82, 83, 84, 85, 86, 87, 88, 89, 90, 91,
  92, 93,
];

function normaliseSourceName(value) {
  return String(value || '')
    .replace(/PrÄnÄyÄma/g, 'Pranayama')
    .replace(/Prānāyāma/g, 'Pranayama')
    .trim();
}

function termForWeek(week) {
  return TERM_DEFS.find((term) => week >= term.weeks[0] && week <= term.weeks[1]) || TERM_DEFS[0];
}

function orderIndex(week, day) {
  return week * 10 + day;
}

function nodeId(week, day) {
  return COMBINED_NODE_ID_BASE + orderIndex(week, day);
}

function courseCategoryParts(course) {
  const sub = course.course_sub_categories || {};
  const category = sub.course_categories || {};
  return {
    categoryId: Number(category.id ?? sub.category_id ?? course.category_id),
    categoryName: normaliseSourceName(category.name || course.category || ''),
    subCategoryId: Number(sub.id ?? course.sub_category_id),
    subCategoryName: String(sub.name || course.sub_category || '').trim(),
  };
}

function sourceKeyForCourse(course) {
  const parts = courseCategoryParts(course);
  return SOURCE_KEY_BY_CATEGORY_ID.get(parts.categoryId)
    || parts.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isAllowedCourse(course) {
  const parts = courseCategoryParts(course);
  if (!INCLUDED_CATEGORY_IDS.has(parts.categoryId)) return false;
  if (EXCLUDED_CATEGORY_IDS.has(parts.categoryId)) return false;
  if (EXCLUDED_SUBCATEGORY_IDS.has(parts.subCategoryId)) return false;
  return true;
}

function sequenceLength(course) {
  if (Array.isArray(course.sequence_json)) return course.sequence_json.length;
  return String(course.sequence_text || course.sequence_text_ARCHIVED || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
}

function analysisFor(course, analysisByCourseId) {
  return analysisByCourseId.get(Number(course.id)) || {};
}

function estimatedMinutes(course, analysisByCourseId) {
  const analysisMinutes = Number(analysisFor(course, analysisByCourseId).total_duration_minutes);
  if (Number.isFinite(analysisMinutes) && analysisMinutes > 0) return Math.round(analysisMinutes);
  return Math.max(10, Math.round(sequenceLength(course) * 2.5));
}

function primaryTheme(course, analysisByCourseId) {
  return analysisFor(course, analysisByCourseId).effective_primary_theme || course.course_sub_categories?.name || 'Mixed';
}

function intensity(course, analysisByCourseId) {
  const band = String(analysisFor(course, analysisByCourseId).effective_intensity_band || '').toLowerCase();
  if (['restorative', 'light', 'moderate', 'strong', 'advanced'].includes(band)) return band;
  const parts = courseCategoryParts(course);
  if (parts.categoryId === CATEGORY_IDS.LIGHT_ON_PRANAYAMA) return 'restorative';
  return estimatedMinutes(course, analysisByCourseId) > 75 ? 'moderate' : 'light';
}

function isDemandingForAppend(course, analysisByCourseId) {
  const minutes = estimatedMinutes(course, analysisByCourseId);
  const band = intensity(course, analysisByCourseId);
  const theme = String(primaryTheme(course, analysisByCourseId)).toLowerCase();
  const title = String(course.title || '').toLowerCase();
  return minutes > 45
    || ['strong', 'advanced'].includes(band)
    || /backbend|inverted|inversion|sirsasana|sarvangasana/.test(`${theme} ${title}`);
}

function sourceExposure(course, role, analysisByCourseId) {
  const parts = courseCategoryParts(course);
  return {
    role,
    sequence_id: Number(course.id),
    source_name: parts.categoryName,
    source_course: parts.subCategoryName,
    source_reference: course.title,
    category_id: parts.categoryId,
    sub_category_id: parts.subCategoryId,
    estimated_duration_minutes: estimatedMinutes(course, analysisByCourseId),
    estimated_intensity: intensity(course, analysisByCourseId),
  };
}

function basePayload(term, week, day, role, extras = {}) {
  return {
    v1_contract: 'combined_school_year_guided_path',
    term_number: term.term,
    practice_role: role,
    progression_group_label: term.label,
    ordering_rule: 'term_week_day',
    conservative_beginner: true,
    ...extras,
  };
}

function sequenceRow({ week, day, course, role, analysisByCourseId, composition = null, revision = null }) {
  const term = termForWeek(week);
  const parts = courseCategoryParts(course);
  const exposure = composition?.sourceExposure || [sourceExposure(course, role, analysisByCourseId)];
  const duration = composition?.totalMinutes || estimatedMinutes(course, analysisByCourseId);
  const estimatedIntensity = composition?.estimatedIntensity || intensity(course, analysisByCourseId);

  return {
    id: nodeId(week, day),
    sequence_id: Number(course.id),
    curriculum_slug: COMBINED_CURRICULUM_SLUG,
    program_name: COMBINED_PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: role === 'revision',
    special_instructions: revision?.revision_reason || `${term.label}. ${parts.categoryName}: ${course.title}.`,
    source_name: parts.categoryName,
    source_reference: course.title,
    level_number: term.level,
    intensity: estimatedIntensity,
    primary_focus: primaryTheme(course, analysisByCourseId),
    is_active: true,
    node_type: 'sequence',
    source_key: sourceKeyForCourse(course),
    source_rule_id: null,
    source_course: parts.subCategoryName,
    curriculum_payload: basePayload(term, week, day, role, {
      term_label: term.label,
      estimated_intensity: estimatedIntensity,
      estimated_duration_minutes: duration,
      source_exposure: exposure,
      source_category_id: parts.categoryId,
      source_subcategory_id: parts.subCategoryId,
      practice_composition: composition?.practiceComposition,
      composed_total_duration_minutes: composition?.totalMinutes,
      composition_guardrails: composition?.guardrails,
      revises_node_id: revision?.revises_node_id ?? null,
      revision_reason: revision?.revision_reason ?? null,
    }),
    generated_from_rule: true,
    is_optional: false,
    is_rest_day: false,
    requires_user_selection: false,
    mastery_gate_required: false,
    curriculum_phase: term.phase,
    practice_track: composition ? 'combined' : parts.categoryId === CATEGORY_IDS.LIGHT_ON_PRANAYAMA ? 'pranayama' : 'asana',
    completion_requirement: 'attempt',
    day_role: role,
    recovery_type: null,
    is_visible: true,
    source_policy: 'curated_combined_school_year',
    source_sequence_order: orderIndex(week, day),
    estimated_minutes: duration,
    curriculum_unit_id: `term_${term.term}_${term.phase}`,
    adaptive_behavior: { status: role === 'revision' ? 'adaptive_revision' : 'fixed' },
  };
}

function revisionRow(week) {
  const day = 6;
  const term = termForWeek(week);
  const revisesNodeId = nodeId(week, 4);
  return {
    id: nodeId(week, day),
    sequence_id: null,
    curriculum_slug: COMBINED_CURRICULUM_SLUG,
    program_name: COMBINED_PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: true,
    special_instructions: 'Repeat the most useful completed practice from this week, prioritising Do Again, Concentrate, or Favourite markers.',
    source_name: COMBINED_PROGRAM_NAME,
    source_reference: 'Revision / consolidation',
    level_number: term.level,
    intensity: 'light',
    primary_focus: 'Revision',
    is_active: true,
    node_type: 'revision',
    source_key: null,
    source_rule_id: null,
    source_course: null,
    curriculum_payload: basePayload(term, week, day, 'revision', {
      term_label: term.label,
      estimated_intensity: 'light',
      estimated_duration_minutes: 30,
      source_exposure: [],
      revises_node_id: revisesNodeId,
      revision_reason: 'Weekly consolidation and marker-led repeat.',
      preferred_markers: ['concentrate', 'do_again', 'favourite'],
    }),
    generated_from_rule: true,
    is_optional: false,
    is_rest_day: false,
    requires_user_selection: false,
    mastery_gate_required: false,
    curriculum_phase: term.phase,
    practice_track: 'revision',
    completion_requirement: 'attempt',
    day_role: 'revision',
    recovery_type: null,
    is_visible: true,
    source_policy: 'adaptive_revision',
    source_sequence_order: orderIndex(week, day),
    estimated_minutes: 30,
    curriculum_unit_id: `term_${term.term}_${term.phase}`,
    adaptive_behavior: {
      status: 'active',
      selector: 'marked_or_recent_prior_practice',
      preferred_markers: ['concentrate', 'do_again', 'favourite'],
    },
  };
}

function restRow(week) {
  const day = 7;
  const term = termForWeek(week);
  return {
    id: nodeId(week, day),
    sequence_id: null,
    curriculum_slug: COMBINED_CURRICULUM_SLUG,
    program_name: COMBINED_PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: false,
    special_instructions: 'Rest day. Optional Savasana or quiet observation only.',
    source_name: COMBINED_PROGRAM_NAME,
    source_reference: 'Rest',
    level_number: term.level,
    intensity: 'restorative',
    primary_focus: 'Rest',
    is_active: true,
    node_type: 'recovery',
    source_key: null,
    source_rule_id: null,
    source_course: null,
    curriculum_payload: basePayload(term, week, day, 'rest', {
      term_label: term.label,
      estimated_intensity: 'restorative',
      estimated_duration_minutes: 0,
      source_exposure: [],
      rest_protocol: 'full_rest_optional_savasana_or_quiet_observation',
    }),
    generated_from_rule: true,
    is_optional: true,
    is_rest_day: true,
    requires_user_selection: false,
    mastery_gate_required: false,
    curriculum_phase: term.phase,
    practice_track: 'recovery',
    completion_requirement: 'optional',
    day_role: 'rest',
    recovery_type: 'savasana_or_full_rest',
    is_visible: true,
    source_policy: 'weekly_rest_inside_term',
    source_sequence_order: orderIndex(week, day),
    estimated_minutes: 0,
    curriculum_unit_id: `term_${term.term}_${term.phase}`,
    adaptive_behavior: { status: 'active', selector: 'recovery_protocol' },
  };
}

function composedQuietDay(primary, pranayama, analysisByCourseId) {
  if (!pranayama) return null;
  const primaryMinutes = estimatedMinutes(primary, analysisByCourseId);
  const pranayamaMinutes = estimatedMinutes(pranayama, analysisByCourseId);
  const totalMinutes = primaryMinutes + pranayamaMinutes;
  if (isDemandingForAppend(primary, analysisByCourseId)) return null;
  if (totalMinutes > MAX_COMPOSED_DURATION_MINUTES) return null;

  const primaryExposure = sourceExposure(primary, 'quiet_asana', analysisByCourseId);
  const pranayamaExposure = sourceExposure(pranayama, 'appended_pranayama', analysisByCourseId);
  return {
    totalMinutes,
    estimatedIntensity: 'light',
    sourceExposure: [primaryExposure, pranayamaExposure],
    practiceComposition: [
      {
        role: 'quiet_asana',
        sequence_id: Number(primary.id),
        counts_for_source_completion: true,
        title: primary.title,
        source_name: primaryExposure.source_name,
        source_reference: primary.title,
      },
      {
        role: 'appended_pranayama',
        sequence_id: Number(pranayama.id),
        counts_for_source_completion: true,
        title: pranayama.title,
        source_name: pranayamaExposure.source_name,
        source_reference: pranayama.title,
      },
    ],
    guardrails: {
      max_composed_duration_minutes: MAX_COMPOSED_DURATION_MINUTES,
      no_append_to_long_or_heavy_day: true,
      no_append_after_backbend_or_inversion: true,
      conservative_beginner: true,
    },
  };
}

export function buildCombinedCurriculumRows(courses, analysis = []) {
  const courseById = new Map(
    courses
      .filter(isAllowedCourse)
      .map((course) => [Number(course.id), course]),
  );
  const analysisByCourseId = new Map(analysis.map((row) => [Number(row.course_id), row]));
  const rows = [];
  const usedAnchorIds = new Set();
  const usedCompositionIds = new Set();

  const pickUnusedCourse = (ids, label, required = true) => {
    const selectedId = ids.find((id) =>
      courseById.has(id)
      && !usedAnchorIds.has(id)
      && !usedCompositionIds.has(id)
    );
    if (!selectedId) {
      if (required) throw new Error(`No unused course remains for ${label}.`);
      return null;
    }
    usedAnchorIds.add(selectedId);
    return courseById.get(selectedId);
  };

  const pickUnusedPranayama = () => {
    const selectedId = PRANAYAMA_PLAN.find((id) =>
      courseById.has(id) && !usedAnchorIds.has(id) && !usedCompositionIds.has(id)
    );
    if (!selectedId) return null;
    usedCompositionIds.add(selectedId);
    return courseById.get(selectedId);
  };

  const pickUnusedPranayamaAnchor = () => {
    const selectedId = PRANAYAMA_PLAN.find((id) =>
      courseById.has(id) && !usedAnchorIds.has(id) && !usedCompositionIds.has(id)
    );
    if (!selectedId) return null;
    usedAnchorIds.add(selectedId);
    return courseById.get(selectedId);
  };

  for (let week = 1; week <= COMBINED_WEEK_COUNT; week += 1) {
    for (let day = 1; day <= COMBINED_DAYS_PER_WEEK; day += 1) {
      const role = DAY_ROLE[day];
      if (role === 'revision') {
        rows.push(revisionRow(week));
        continue;
      }
      if (role === 'rest') {
        rows.push(restRow(week));
        continue;
      }

      let course = pickUnusedCourse(DAY_SOURCE_PLAN[day], `week ${week} day ${day}`, day !== 3);
      if (!course && day === 3) {
        course = pickUnusedPranayamaAnchor();
        if (!course) throw new Error(`No unused quiet or pranayama course remains for week ${week} day ${day}.`);
      }

      let composition = null;
      if (day === 3) {
        const courseParts = courseCategoryParts(course);
        const pranayama = courseParts.categoryId === CATEGORY_IDS.LIGHT_ON_PRANAYAMA || week > 8
          ? null
          : pickUnusedPranayama();
        composition = composedQuietDay(course, pranayama, analysisByCourseId);
        if (!composition && pranayama) {
          usedCompositionIds.delete(Number(pranayama.id));
          usedAnchorIds.add(Number(pranayama.id));
          course = pranayama;
        }
      }

      rows.push(sequenceRow({
        week,
        day,
        course,
        role,
        analysisByCourseId,
        composition,
      }));
    }
  }

  return rows.sort((a, b) => Number(a.order_index) - Number(b.order_index));
}

async function fetchAll(supabase, table, select) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const json = process.argv.includes('--json');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const [courses, analysis] = await Promise.all([
    fetchAll(supabase, 'courses', '*,course_sub_categories(id,name,category_id,course_categories(id,name))'),
    fetchAll(supabase, 'course_sequence_analysis', 'course_id,total_duration_minutes,effective_intensity_band,effective_primary_theme'),
  ]);

  const rows = buildCombinedCurriculumRows(courses, analysis);

  if (dryRun) {
    if (json) console.log(JSON.stringify(rows, null, 2));
    else {
      console.log(`Dry run: ${rows.length} rows for ${COMBINED_CURRICULUM_SLUG}.`);
      console.table(rows.slice(0, 14).map((row) => ({
        id: row.id,
        week: row.week_number,
        day: row.day_number,
        role: row.curriculum_payload.practice_role,
        sequence_id: row.sequence_id,
        title: row.source_reference,
        group: row.curriculum_payload.progression_group_label,
      })));
    }
    return;
  }

  const desiredIds = rows.map((row) => row.id);
  const { data: existing, error: existingError } = await supabase
    .from('program_curriculum')
    .select('id')
    .eq('curriculum_slug', COMBINED_CURRICULUM_SLUG);
  if (existingError) throw existingError;

  const obsoleteIds = (existing || [])
    .map((row) => Number(row.id))
    .filter((id) => !desiredIds.includes(id));
  if (obsoleteIds.length) {
    const { error: deleteError } = await supabase
      .from('program_curriculum')
      .delete()
      .in('id', obsoleteIds);
    if (deleteError) throw deleteError;
  }

  const { error: upsertError } = await supabase
    .from('program_curriculum')
    .upsert(rows, { onConflict: 'id' });
  if (upsertError) throw upsertError;

  console.log(`Upserted ${rows.length} rows for ${COMBINED_CURRICULUM_SLUG} (${COMBINED_PROGRAM_NAME}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
