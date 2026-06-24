import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  COMBINED_CURRICULUM_SLUG,
  COMBINED_PROGRAM_NAME,
  COMBINED_WEEK_COUNT,
  COMBINED_DAYS_PER_WEEK,
  EXCLUDED_CATEGORY_IDS,
  EXCLUDED_SUBCATEGORY_IDS,
  MAX_COMPOSED_DURATION_MINUTES,
} from './seed_combined_school_year_curriculum_v1.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const failures = [];

const TERM_LABELS = new Map([
  [1, 'Term 1: Foundation & Orientation'],
  [2, 'Term 2: Foundation Consolidation'],
  [3, 'Term 3: Course 1 Plateau & Range'],
  [4, 'Term 4: Integration & Readiness'],
]);

const REQUIRED_ROLES = new Set(['foundation', 'technical', 'quiet', 'anchor', 'support', 'revision', 'rest']);

function recordCheck(condition, message, details = '') {
  if (!condition) {
    const failure = details ? `${message}: ${details}` : message;
    failures.push(failure);
    console.error(`FAIL - ${failure}`);
    return;
  }
  console.log(`PASS - ${message}`);
}

async function fetchAll(table, select, query = (q) => q) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const request = query(supabase.from(table).select(select).range(from, from + pageSize - 1));
    const { data, error } = await request;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function payload(row) {
  return row.curriculum_payload || {};
}

function termForWeek(week) {
  return Math.floor((Number(week) - 1) / 10) + 1;
}

function sequenceRefs(row) {
  const refs = [];
  if (row.sequence_id != null) refs.push({ sequence_id: Number(row.sequence_id), kind: 'anchor' });
  const composition = payload(row).practice_composition;
  if (Array.isArray(composition)) {
    composition.forEach((part, index) => {
      if (part?.sequence_id != null) {
        refs.push({ sequence_id: Number(part.sequence_id), kind: `composition_${index + 1}` });
      }
    });
  }
  return refs;
}

function duplicateSourceRows(rows) {
  const occurrences = new Map();
  rows.forEach((row) => {
    const refs = sequenceRefs(row);
    const compositionSequenceIds = new Set(
      refs
        .filter((ref) => ref.kind.startsWith('composition_'))
        .map((ref) => ref.sequence_id),
    );
    refs
      .filter((ref) => !(ref.kind === 'anchor' && compositionSequenceIds.has(ref.sequence_id)))
      .forEach((ref) => {
      if (!occurrences.has(ref.sequence_id)) occurrences.set(ref.sequence_id, []);
      occurrences.get(ref.sequence_id).push({ row, kind: ref.kind });
    });
  });

  return [...occurrences.entries()]
    .filter(([, refs]) => refs.length > 1)
    .filter(([, refs]) => !refs.every(({ row, kind }) =>
      payload(row).practice_role === 'revision' || kind.startsWith('composition_')
    ))
    .map(([sequence_id, refs]) => ({
      sequence_id,
      occurrences: refs.map(({ row, kind }) => `W${row.week_number}D${row.day_number}:${kind}:${payload(row).practice_role}`),
    }));
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const [rows, courses] = await Promise.all([
    fetchAll(
      'program_curriculum',
      'id,sequence_id,curriculum_slug,program_name,week_number,day_number,order_index,node_type,is_active,is_visible,is_rest_day,source_reference,level_number,curriculum_phase,curriculum_unit_id,curriculum_payload,estimated_minutes,day_role,recovery_type,source_name,source_course',
      (q) => q.eq('curriculum_slug', COMBINED_CURRICULUM_SLUG).order('order_index'),
    ),
    fetchAll(
      'courses',
      'id,title,course_sub_categories(id,name,category_id,course_categories(id,name))',
    ),
  ]);

  const activeRows = rows.filter((row) => row.is_active && row.is_visible);
  const courseById = new Map(courses.map((course) => [Number(course.id), course]));

  recordCheck(rows.length > 0, 'combined curriculum rows exist');
  recordCheck(activeRows.length === COMBINED_WEEK_COUNT * COMBINED_DAYS_PER_WEEK, 'combined path has exactly 40 weeks and 280 visible nodes', `${activeRows.length} rows`);
  recordCheck(activeRows.every((row) => row.program_name === COMBINED_PROGRAM_NAME), 'rows use combined public program name');

  const weeks = new Map();
  activeRows.forEach((row) => {
    if (!weeks.has(row.week_number)) weeks.set(row.week_number, []);
    weeks.get(row.week_number).push(row);
  });
  recordCheck(weeks.size === COMBINED_WEEK_COUNT, 'exactly 40 curriculum weeks exist', `${weeks.size} weeks`);

  for (let week = 1; week <= COMBINED_WEEK_COUNT; week += 1) {
    const weekRows = (weeks.get(week) || []).sort((a, b) => a.day_number - b.day_number);
    const days = weekRows.map((row) => row.day_number).join(',');
    recordCheck(days === '1,2,3,4,5,6,7', `week ${week} has Days 1-7`, days);

    const rest = weekRows.find((row) => row.day_number === 7);
    const first = weekRows.find((row) => row.day_number === 1);
    const firstPayload = payload(first);
    const restPayload = payload(rest);
    recordCheck(!!rest && (rest.is_rest_day || rest.node_type === 'recovery'), `week ${week} Day 7 is rest/recovery`);
    recordCheck(rest?.level_number === first?.level_number, `week ${week} Day 7 shares level_number`);
    recordCheck(rest?.curriculum_phase === first?.curriculum_phase, `week ${week} Day 7 shares curriculum_phase`);
    recordCheck(rest?.curriculum_unit_id === first?.curriculum_unit_id, `week ${week} Day 7 shares curriculum_unit_id`);
    recordCheck(restPayload.progression_group_label === firstPayload.progression_group_label, `week ${week} Day 7 shares progression_group_label`);
  }

  for (let term = 1; term <= 4; term += 1) {
    const termWeeks = [...weeks.keys()].filter((week) => termForWeek(week) === term);
    const label = TERM_LABELS.get(term);
    const termRows = activeRows.filter((row) => payload(row).term_number === term);
    recordCheck(termWeeks.length === 10, `term ${term} has 10 weeks`, termWeeks.join(','));
    recordCheck(termRows.every((row) => payload(row).progression_group_label === label), `term ${term} label is correct`);
  }

  const malformedRows = activeRows.filter((row) => {
    const p = payload(row);
    return !p.term_number
      || !REQUIRED_ROLES.has(p.practice_role)
      || p.estimated_intensity == null
      || p.estimated_duration_minutes == null
      || !Array.isArray(p.source_exposure)
      || row.is_rest_day == null;
  });
  recordCheck(malformedRows.length === 0, 'every row has required combined metadata', JSON.stringify(malformedRows.map((row) => row.id)));

  const sectionLabels = new Set(activeRows.map((row) => payload(row).progression_group_label || ''));
  recordCheck(![...sectionLabels].some((label) => /weekly recovery/i.test(label)), 'no section label contains Weekly Recovery');

  const refs = activeRows.flatMap(sequenceRefs);
  const unresolvedRefs = refs.filter((ref) => !courseById.has(ref.sequence_id));
  recordCheck(unresolvedRefs.length === 0, 'all anchor and composition sequence refs resolve', JSON.stringify(unresolvedRefs));

  const excludedRefs = refs
    .map((ref) => {
      const course = courseById.get(ref.sequence_id);
      const sub = course?.course_sub_categories || {};
      const category = sub.course_categories || {};
      return {
        sequence_id: ref.sequence_id,
        category_id: Number(category.id ?? sub.category_id),
        sub_category_id: Number(sub.id),
        title: course?.title,
      };
    })
    .filter((ref) => EXCLUDED_CATEGORY_IDS.has(ref.category_id) || EXCLUDED_SUBCATEGORY_IDS.has(ref.sub_category_id));
  recordCheck(excludedRefs.length === 0, 'excluded stable category/source IDs do not appear', JSON.stringify(excludedRefs));

  const composedRows = activeRows.filter((row) => Array.isArray(payload(row).practice_composition) && payload(row).practice_composition.length > 1);
  const invalidComposedRows = composedRows.filter((row) =>
    Number(payload(row).composed_total_duration_minutes) > MAX_COMPOSED_DURATION_MINUTES
    || payload(row).composition_guardrails?.conservative_beginner !== true
  );
  recordCheck(invalidComposedRows.length === 0, 'composed pranayama rows obey duration and beginner guardrails', JSON.stringify(invalidComposedRows.map((row) => row.id)));

  const duplicateViolations = duplicateSourceRows(activeRows);
  recordCheck(
    duplicateViolations.length === 0,
    'duplicate source placements are only revision or composition usage',
    JSON.stringify(duplicateViolations),
  );

  const orderIssues = activeRows.filter((row) => Number(row.order_index) !== (row.week_number * 10) + row.day_number);
  recordCheck(orderIssues.length === 0, 'roadmap sort order is term -> week -> day via deterministic order_index', JSON.stringify(orderIssues.map((row) => row.id)));

  console.table([{
    rows: rows.length,
    active_visible_rows: activeRows.length,
    weeks: weeks.size,
    composed_rows: composedRows.length,
    excluded_refs: excludedRefs.length,
    duplicate_violations: duplicateViolations.length,
  }]);

  if (failures.length) {
    throw new Error(`Combined curriculum validation failed with ${failures.length} issue(s):\n- ${failures.join('\n- ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
