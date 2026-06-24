import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  CURRICULUM_SLUG,
  PROGRAM_NAME,
  PRACTICE_DAYS_PER_WEEK,
  auditCurriculumCoverage,
  classifyCourse,
} from './curriculum_testing_v2_builder.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const failures = [];
const EXCLUDED_CATEGORY_IDS = new Set([1, 55, 56]);
const EXCLUDED_SUBCATEGORY_IDS = new Set([5, 235, 236]);

function recordCheck(condition, message, details = '') {
  if (!condition) {
    const failure = details ? `${message}: ${details}` : message;
    failures.push(failure);
    console.error(`FAIL - ${failure}`);
    return;
  }
  console.log(`PASS - ${message}`);
}

function playableRefs(row) {
  const refs = [];
  if (row.sequence_id != null) {
    refs.push({ node_id: row.id, sequence_id: Number(row.sequence_id), kind: 'anchor' });
  }
  const composition = row.curriculum_payload?.practice_composition;
  if (Array.isArray(composition)) {
    composition.forEach((part, index) => {
      if (part?.sequence_id != null) {
        refs.push({ node_id: row.id, sequence_id: Number(part.sequence_id), kind: `composition_${index + 1}` });
      }
    });
  }
  return refs;
}

function sequenceOrder(rows, sequenceId) {
  return rows
    .filter((row) => Number(row.sequence_id) === Number(sequenceId))
    .map((row) => Number(row.order_index))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function firstSequenceOrder(rows, sequenceId) {
  return sequenceOrder(rows, sequenceId)[0] ?? null;
}

function lastSequenceOrder(rows, sequenceId) {
  const orders = sequenceOrder(rows, sequenceId);
  return orders[orders.length - 1] ?? null;
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

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const [courses, rows] = await Promise.all([
    fetchAll(
      'courses',
      `
        *,
        course_sub_categories (
          id,
          name,
          category_id,
          course_categories ( id, name )
        )
      `,
      (q) => q.order('id'),
    ),
    fetchAll(
      'program_curriculum',
      'id, sequence_id, curriculum_slug, program_name, week_number, day_number, order_index, node_type, is_active, is_visible, is_rest_day, source_name, source_course, source_reference, curriculum_payload, requires_user_selection',
      (q) => q.eq('curriculum_slug', CURRICULUM_SLUG).order('order_index'),
    ),
  ]);

  const classifiedCourses = (courses || []).map(classifyCourse);
  const curriculumRows = rows || [];
  const audit = auditCurriculumCoverage(classifiedCourses, curriculumRows);
  const activeVisibleRows = curriculumRows.filter((row) => row.is_active && row.is_visible);
  const sequenceRows = activeVisibleRows.filter((row) => row.node_type === 'sequence');
  const recoveryRows = activeVisibleRows.filter((row) => row.node_type === 'recovery' || row.is_rest_day);
  const weeks = new Set(activeVisibleRows.map((row) => Number(row.week_number)).filter(Number.isFinite));
  const recoveryOnlyWeeks = [...weeks]
    .filter((week) => !activeVisibleRows.some((row) => row.week_number === week && row.node_type === 'sequence'))
    .sort((a, b) => a - b);
  const weeksWithoutRecoveryOrDaySevenPractice = [...weeks]
    .filter((week) => !activeVisibleRows.some((row) =>
      row.week_number === week
      && (row.node_type === 'recovery' || row.is_rest_day || (row.node_type === 'sequence' && row.day_number === 7))
    ))
    .sort((a, b) => a - b);
  const scheduledRefs = curriculumRows.flatMap(playableRefs);
  const compositionRefs = scheduledRefs.filter((ref) => ref.kind !== 'anchor');
  const courseIds = new Set(classifiedCourses.map((course) => Number(course.id)));
  const courseById = new Map(classifiedCourses.map((course) => [Number(course.id), course]));
  const unresolvedCompositionReferences = compositionRefs.filter((ref) => !courseIds.has(ref.sequence_id));
  const excludedScheduledRefs = scheduledRefs
    .map((ref) => ({ ...ref, course: courseById.get(ref.sequence_id) }))
    .filter((ref) =>
      EXCLUDED_CATEGORY_IDS.has(Number(ref.course?.categoryId))
      || EXCLUDED_SUBCATEGORY_IDS.has(Number(ref.course?.subCategoryId))
    )
    .map((ref) => ({
      node_id: ref.node_id,
      sequence_id: ref.sequence_id,
      kind: ref.kind,
      category_id: Number(ref.course?.categoryId),
      sub_category_id: Number(ref.course?.subCategoryId),
      title: ref.course?.title,
    }));
  const nonCleanProgramNames = activeVisibleRows.filter((row) => row.program_name !== PROGRAM_NAME);
  const userSelectionRows = activeVisibleRows.filter((row) => row.requires_user_selection);
  const devLabelRows = activeVisibleRows.filter((row) =>
    /testing|dev/i.test(String(row.program_name || ''))
    || /testing|dev/i.test(String(row.curriculum_payload?.progression_group_label || ''))
  );

  recordCheck(audit.totalCourses > 0, 'courses table is populated');
  recordCheck(audit.playableCourses > 0, 'playable courses exist');
  recordCheck(
    audit.unscheduledPlayableCourses.length === 0,
    'every playable course is scheduled or explicitly excluded',
    JSON.stringify(audit.unscheduledPlayableCourses.slice(0, 25)),
  );
  recordCheck(
    audit.excludedCourses.every((course) => course.exclusionReasons.length > 0),
    'excluded courses have explicit reasons',
    JSON.stringify(audit.excludedCourses.map((course) => ({ id: course.id, title: course.title, reasons: course.exclusionReasons }))),
  );
  recordCheck(
    audit.accidentalDuplicateScheduledCourses.length === 0,
    'no course is accidentally scheduled more than once',
    JSON.stringify(audit.accidentalDuplicateScheduledCourses),
  );
  recordCheck(
    audit.invalidCourseReferences.length === 0,
    'all scheduled course references are valid playable courses',
    JSON.stringify(audit.invalidCourseReferences),
  );
  recordCheck(
    excludedScheduledRefs.length === 0,
    'no excluded stable category/source IDs are scheduled',
    JSON.stringify(excludedScheduledRefs),
  );
  recordCheck(
    unresolvedCompositionReferences.length === 0,
    'all composition references resolve to courses',
    JSON.stringify(unresolvedCompositionReferences),
  );
  recordCheck(
    audit.scheduledUniqueCourses === audit.playableCourses,
    'scheduled unique course count matches playable course count',
    `${audit.scheduledUniqueCourses} scheduled, ${audit.playableCourses} playable`,
  );
  recordCheck(
    sequenceRows.length >= audit.playableCourses,
    'sequence node count covers playable courses including intentional source-week repeats',
    `${sequenceRows.length} sequence nodes, ${audit.playableCourses} playable courses`,
  );
  recordCheck(
    weeksWithoutRecoveryOrDaySevenPractice.length === 0,
    'every curriculum week has recovery or a day 7 source practice',
    JSON.stringify(weeksWithoutRecoveryOrDaySevenPractice),
  );
  recordCheck(nonCleanProgramNames.length === 0, 'curriculum uses the clean public program name', JSON.stringify(nonCleanProgramNames));
  recordCheck(userSelectionRows.length === 0, 'no rows require user curriculum selection', JSON.stringify(userSelectionRows));
  recordCheck(devLabelRows.length === 0, 'no user-facing testing/dev labels remain in curriculum rows', JSON.stringify(devLabelRows));
  recordCheck(audit.duplicateNaturalKeys.length === 0, 'no duplicate category/title playable courses were found', JSON.stringify(audit.duplicateNaturalKeys));
  recordCheck(
    [1, 2].every((week) =>
      [1, 2, 3, 4, 5, 6].every((day) =>
        activeVisibleRows.some((row) =>
          Number(row.sequence_id) === 114
          && Number(row.week_number) === week
          && Number(row.day_number) === day
        )
      )
    ),
    'Light on Yoga Course 1 Week 1 & 2 is repeated across Days 1-6 in curriculum weeks 1 and 2',
  );
  recordCheck(
    firstSequenceOrder(activeVisibleRows, 113) > lastSequenceOrder(activeVisibleRows, 124),
    'Light on Yoga Course 1 Important Asanas is after Course 1 week work',
  );
  recordCheck(
    firstSequenceOrder(activeVisibleRows, 128) > lastSequenceOrder(activeVisibleRows, 135),
    'Light on Yoga Course 2 Important Asanas is after Course 2 week work',
  );
  recordCheck(
    firstSequenceOrder(activeVisibleRows, 167) > lastSequenceOrder(activeVisibleRows, 160)
      && lastSequenceOrder(activeVisibleRows, 172) < firstSequenceOrder(activeVisibleRows, 161),
    'Light on Yoga Course 3 weekly practice is after Week 176-180 and before Week 181-190',
  );
  recordCheck(
    firstSequenceOrder(activeVisibleRows, 142) > lastSequenceOrder(activeVisibleRows, 166),
    'Light on Yoga Course 3 final practice is after Week 276-300',
  );

  console.table([{
    total_courses: audit.totalCourses,
    playable_courses: audit.playableCourses,
    excluded_courses: audit.excludedCourses.length,
    scheduled_curriculum_course_count: audit.scheduledUniqueCourses,
    unscheduled_playable_courses: audit.unscheduledPlayableCourses.length,
    duplicate_scheduled_courses: audit.duplicateScheduledCourses.length,
    accidental_duplicate_scheduled_courses: audit.accidentalDuplicateScheduledCourses.length,
    total_curriculum_nodes: audit.totalCurriculumNodes,
    active_visible_nodes: audit.activeVisibleNodes,
    week_count: audit.weekCount,
    practice_days_per_week: PRACTICE_DAYS_PER_WEEK,
    rest_recovery_days: audit.recoveryDays,
    recovery_only_source_gap_weeks: recoveryOnlyWeeks.length,
    composed_practices: audit.composedPractices,
    invalid_course_references: audit.invalidCourseReferences.length,
    excluded_scheduled_refs: excludedScheduledRefs.length,
    unresolved_composition_references: unresolvedCompositionReferences.length,
  }]);

  console.table(Array.from(
    classifiedCourses.reduce((acc, course) => {
      const key = `${course.categoryName}${course.subCategoryName ? ` > ${course.subCategoryName}` : ''}`;
      const existing = acc.get(key) || { category: key, total: 0, playable: 0, excluded: 0 };
      existing.total += 1;
      if (course.isPlayable) existing.playable += 1;
      else existing.excluded += 1;
      acc.set(key, existing);
      return acc;
    }, new Map()).values()),
  );

  if (audit.excludedCourses.length) {
    console.log('Excluded courses:');
    console.table(audit.excludedCourses.map((course) => ({
      id: Number(course.id),
      title: course.title,
      category: `${course.categoryName}${course.subCategoryName ? ` > ${course.subCategoryName}` : ''}`,
      reason: course.exclusionReasons.join('; '),
    })));
  }

  const weekCoverageIssues = audit.weekCoverage.filter((week) => {
    const weekNumber = Number(week.week);
    return weeksWithoutRecoveryOrDaySevenPractice.includes(weekNumber);
  });
  console.log(`Week coverage: ${audit.weekCoverage.length} weeks checked, ${weekCoverageIssues.length} issue(s).`);
  if (weekCoverageIssues.length) {
    console.table(weekCoverageIssues);
  }

  if (failures.length) {
    throw new Error(`Curriculum validation failed with ${failures.length} issue(s):\n- ${failures.join('\n- ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
