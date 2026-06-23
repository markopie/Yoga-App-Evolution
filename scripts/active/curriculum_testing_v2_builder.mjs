export const CURRICULUM_SLUG = 'iyengar_integrated_master_path_testing_v2';
export const PROGRAM_NAME = 'Integrated Iyengar Practice Path';
export const PRACTICE_DAYS_PER_WEEK = 6;

const FAMILY_ORDER = [
  'How to Use Yoga',
  'Yoga The Iyengar Way',
  'Light on Yoga',
  'Yoga A Gem For Women',
  'Light on Pranayama',
  'Yoga The Iyengar Way Remedial',
  'Light on Yoga Therapeutic',
  'Flow',
  'Cycle',
  'General',
];

const SUBCATEGORY_ORDER = new Map([
  ['How to Use Yoga|Week 1', 10],
  ['How to Use Yoga|Week 2', 20],
  ['How to Use Yoga|Week 3', 30],
  ['How to Use Yoga|Week 4', 40],
  ['How to Use Yoga|Week 6', 60],
  ['How to Use Yoga|Week 7', 70],
  ['How to Use Yoga|Week 8', 80],
  ['How to Use Yoga|Week 9', 90],
  ['How to Use Yoga|Asanas for Common Problems', 120],
  ['Yoga The Iyengar Way|Course 1', 10],
  ['Yoga The Iyengar Way|Course 2', 20],
  ['Yoga The Iyengar Way|Course 3', 30],
  ['Yoga The Iyengar Way|Course 4', 40],
  ['Yoga The Iyengar Way|Remedial Programmes', 900],
  ['Light on Yoga|Course 1', 10],
  ['Light on Yoga|Course 2', 20],
  ['Light on Yoga|Course 3', 30],
  ['Light on Yoga|Therapeutic', 900],
  ['Yoga A Gem For Women|Hygienic Habits', 5],
  ['Yoga A Gem For Women|First Year', 10],
  ['Yoga A Gem For Women|Second Year', 20],
  ['Yoga A Gem For Women|Third Year', 30],
  ['Light on Pranayama|Course 1 (Preparatory)', 10],
  ['Light on Pranayama|Course 2 (Primary)', 20],
  ['Light on Pranayama|Course 3 (Intermediate)', 30],
  ['Light on Pranayama|Course 3 (Mastery Phase)', 35],
  ['Light on Pranayama|Course 4 (Advanced)', 40],
  ['Light on Pranayama|Course 5 (Highly Intense)', 50],
  ['Light on Pranayama|Course 5 (Weekly Practice)', 55],
  ['Flow|Routines', 10],
  ['Cycle|Asana Cycles', 10],
  ['General|Miscellaneous', 10],
]);

const SOURCE_KEY_BY_CATEGORY = new Map([
  ['How to Use Yoga', 'how_to_use_yoga'],
  ['Yoga The Iyengar Way', 'yoga_the_iyengar_way'],
  ['Light on Yoga', 'light_on_yoga'],
  ['Yoga A Gem For Women', 'yoga_gem_for_women'],
  ['Light on Pranayama', 'light_on_pranayama'],
]);

export function cleanSourceName(value) {
  return String(value || 'General')
    .replace(/Prānāyāma/g, 'Pranayama')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value) {
  return cleanSourceName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function sequenceLength(course) {
  if (Array.isArray(course.sequence_json)) return course.sequence_json.length;
  return String(course.sequence_text || course.sequence_text_ARCHIVED || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
}

function courseCategoryParts(course) {
  const sub = course.course_sub_categories || null;
  const categoryName = cleanSourceName(sub?.course_categories?.name || course.category || 'General');
  const subCategoryName = String(sub?.name || course.sub_category || '').trim();
  return {
    categoryName,
    subCategoryName,
    categoryId: sub?.course_categories?.id ?? null,
    subCategoryId: sub?.id ?? course.sub_category_id ?? null,
  };
}

function progressionFamily(categoryName, subCategoryName) {
  if (categoryName === 'Yoga The Iyengar Way' && subCategoryName === 'Remedial Programmes') {
    return 'Yoga The Iyengar Way Remedial';
  }
  if (categoryName === 'Light on Yoga' && subCategoryName === 'Therapeutic') {
    return 'Light on Yoga Therapeutic';
  }
  return categoryName;
}

function titleOrder(title) {
  const text = String(title || '');
  const numbers = [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length) return numbers[0] * 1000 + (numbers[1] || 0);
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const weekdayIndex = weekdays.findIndex((day) => text.toLowerCase().includes(day));
  if (weekdayIndex >= 0) return 100000 + weekdayIndex;
  return 999999;
}

function familyOrder(family) {
  const index = FAMILY_ORDER.indexOf(family);
  return index >= 0 ? index + 1 : FAMILY_ORDER.length + 1;
}

function subcategoryOrder(categoryName, subCategoryName) {
  return SUBCATEGORY_ORDER.get(`${categoryName}|${subCategoryName}`) ?? 500;
}

export function classifyCourse(course) {
  const parts = courseCategoryParts(course);
  const family = progressionFamily(parts.categoryName, parts.subCategoryName);
  const length = sequenceLength(course);
  const title = String(course.title || course.course_title || '').trim();
  const exclusionReasons = [];

  if (!title) exclusionReasons.push('missing title');
  if (length <= 0) exclusionReasons.push('no sequence content');
  if (course.is_alias || course.redirect_id) exclusionReasons.push('alias or redirect course');

  return {
    ...course,
    ...parts,
    title,
    family,
    sequenceLength: length,
    isPlayable: exclusionReasons.length === 0,
    exclusionReasons,
    order: {
      family: familyOrder(family),
      subcategory: subcategoryOrder(parts.categoryName, parts.subCategoryName),
      title: titleOrder(title),
      id: Number(course.id),
    },
  };
}

export function sortCoursesForCurriculum(courses) {
  return [...courses].sort((a, b) =>
    a.order.family - b.order.family
    || a.order.subcategory - b.order.subcategory
    || a.order.title - b.order.title
    || a.title.localeCompare(b.title, undefined, { numeric: true })
    || Number(a.id) - Number(b.id)
  );
}

function estimatedMinutes(course) {
  const sequenceMinutes = Math.round((course.sequenceLength * 2.5) || 0);
  return Math.max(10, sequenceMinutes);
}

export function buildCurriculumRows(classifiedCourses) {
  const playableCourses = sortCoursesForCurriculum(classifiedCourses.filter((course) => course.isPlayable));
  const rows = [];

  playableCourses.forEach((course, index) => {
    const week = Math.floor(index / PRACTICE_DAYS_PER_WEEK) + 1;
    const day = (index % PRACTICE_DAYS_PER_WEEK) + 1;
    const family = course.family;
    const sourceName = course.categoryName;
    const sourceCourse = course.subCategoryName || null;
    const sourceKey = SOURCE_KEY_BY_CATEGORY.get(sourceName) || null;
    const isPranayama = sourceName === 'Light on Pranayama';
    const isFlow = sourceName === 'Flow';
    const isCycle = sourceName === 'Cycle';
    const isTherapeutic = family.includes('Therapeutic') || sourceCourse === 'Remedial Programmes';

    rows.push({
      sequence_id: Number(course.id),
      curriculum_slug: CURRICULUM_SLUG,
      program_name: PROGRAM_NAME,
      week_number: week,
      day_number: day,
      order_index: Number(`${week}.${String(day).padStart(2, '0')}`),
      is_revision_node: false,
      special_instructions: `${sourceName}${sourceCourse ? ` - ${sourceCourse}` : ''}: ${course.title}.`,
      source_name: sourceName,
      source_reference: course.title,
      level_number: course.order.family,
      intensity: isPranayama || isTherapeutic ? 'restorative' : isFlow || isCycle ? 'moderate' : 'light',
      primary_focus: sourceCourse || sourceName,
      is_active: true,
      node_type: 'sequence',
      source_key: sourceKey,
      source_rule_id: null,
      source_course: sourceCourse,
      curriculum_payload: {
        v2_contract: 'full_course_database_progression',
        progression_group_label: family,
        category_id: course.categoryId,
        sub_category_id: course.subCategoryId,
        source_category: sourceName,
        source_subcategory: sourceCourse,
        source_course_id: Number(course.id),
        sequence_length: course.sequenceLength,
        ordering_rule: 'category_family_then_subcategory_then_title_numbers_then_course_id',
        placeholder_non_sequence: false,
      },
      generated_from_rule: true,
      is_optional: false,
      is_rest_day: false,
      requires_user_selection: false,
      mastery_gate_required: false,
      curriculum_phase: family,
      practice_track: isPranayama ? 'pranayama' : isFlow ? 'flow' : isCycle ? 'cycle' : 'asana',
      completion_requirement: 'attempt',
      day_role: 'practice',
      recovery_type: null,
      is_visible: true,
      source_policy: 'course_database_sequence',
      source_sequence_order: index + 1,
      estimated_minutes: estimatedMinutes(course),
      curriculum_unit_id: slugify(family),
      adaptive_behavior: {
        status: 'fixed',
        route_by_node_type: true,
      },
    });
  });

  const weekCount = Math.ceil(playableCourses.length / PRACTICE_DAYS_PER_WEEK);
  for (let week = 1; week <= weekCount; week += 1) {
    const weekCourses = playableCourses.slice((week - 1) * PRACTICE_DAYS_PER_WEEK, week * PRACTICE_DAYS_PER_WEEK);
    const anchorCourse = weekCourses[weekCourses.length - 1] || null;
    const recoveryGroup = anchorCourse?.family || 'Weekly Recovery';
    const recoveryLevel = anchorCourse?.order.family || FAMILY_ORDER.length + 1;

    rows.push({
      sequence_id: null,
      curriculum_slug: CURRICULUM_SLUG,
      program_name: PROGRAM_NAME,
      week_number: week,
      day_number: 7,
      order_index: Number(`${week}.07`),
      is_revision_node: false,
      special_instructions: 'Recovery day. Rest, Savasana, or quiet observation.',
      source_name: PROGRAM_NAME,
      source_reference: 'Weekly recovery',
      level_number: recoveryLevel,
      intensity: 'restorative',
      primary_focus: 'Recovery',
      is_active: true,
      node_type: 'recovery',
      source_key: null,
      source_rule_id: null,
      source_course: null,
      curriculum_payload: {
        v2_contract: 'full_course_database_progression',
        progression_group_label: recoveryGroup,
        rest_protocol: 'full_rest_optional_savasana_or_quiet_observation',
        ordering_rule: 'weekly_recovery_after_six_practice_days',
        placeholder_non_sequence: false,
      },
      generated_from_rule: true,
      is_optional: true,
      is_rest_day: true,
      requires_user_selection: false,
      mastery_gate_required: false,
      curriculum_phase: recoveryGroup,
      practice_track: 'recovery',
      completion_requirement: 'optional',
      day_role: 'recovery',
      recovery_type: 'savasana_or_full_rest',
      is_visible: true,
      source_policy: 'recovery_protocol',
      source_sequence_order: null,
      estimated_minutes: 0,
      curriculum_unit_id: 'weekly_recovery',
      adaptive_behavior: {
        status: 'active',
        selector: 'recovery_protocol',
        fallback: 'acknowledge_recovery_day',
      },
    });
  }

  return rows.sort((a, b) => Number(a.order_index) - Number(b.order_index));
}

export function auditCurriculumCoverage(classifiedCourses, curriculumRows) {
  const playableCourses = classifiedCourses.filter((course) => course.isPlayable);
  const excludedCourses = classifiedCourses.filter((course) => !course.isPlayable);
  const activeVisibleRows = curriculumRows.filter((row) => row.is_active && row.is_visible);
  const scheduledRefs = curriculumRows.flatMap((row) => {
    const refs = [];
    if (row.sequence_id != null) refs.push({ node_id: row.id ?? null, sequence_id: Number(row.sequence_id), kind: 'anchor' });
    const composition = row.curriculum_payload?.practice_composition;
    if (Array.isArray(composition)) {
      composition.forEach((part, index) => {
        if (part?.sequence_id != null) {
          refs.push({ node_id: row.id ?? null, sequence_id: Number(part.sequence_id), kind: `composition_${index + 1}` });
        }
      });
    }
    return refs;
  });
  const scheduledIds = scheduledRefs.map((ref) => ref.sequence_id);
  const scheduledIdSet = new Set(scheduledIds);
  const playableIdSet = new Set(playableCourses.map((course) => Number(course.id)));
  const duplicateScheduledCourses = [...scheduledIds.reduce((acc, id) => {
    acc.set(id, (acc.get(id) || 0) + 1);
    return acc;
  }, new Map()).entries()]
    .filter(([, count]) => count > 1)
    .map(([sequence_id, count]) => ({ sequence_id, count }));

  const unscheduledPlayableCourses = playableCourses
    .filter((course) => !scheduledIdSet.has(Number(course.id)))
    .map((course) => ({
      id: Number(course.id),
      title: course.title,
      category: `${course.categoryName}${course.subCategoryName ? ` > ${course.subCategoryName}` : ''}`,
      reason: 'playable course missing from curriculum',
    }));

  const invalidCourseReferences = scheduledRefs
    .filter((ref) => !playableIdSet.has(ref.sequence_id))
    .map((ref) => ({ ...ref, reason: 'scheduled course is not a playable included course' }));

  const weekCount = Math.max(0, ...activeVisibleRows.map((row) => Number(row.week_number) || 0));
  const weekCoverage = [];
  for (let week = 1; week <= weekCount; week += 1) {
    const practiceDays = activeVisibleRows
      .filter((row) => row.week_number === week && row.node_type === 'sequence')
      .map((row) => row.day_number)
      .sort((a, b) => a - b);
    const recoveryDays = activeVisibleRows
      .filter((row) => row.week_number === week && (row.node_type === 'recovery' || row.is_rest_day))
      .map((row) => row.day_number)
      .sort((a, b) => a - b);
    const expectedPracticeDays = week === weekCount
      ? Array.from({ length: ((playableCourses.length - 1) % PRACTICE_DAYS_PER_WEEK) + 1 }, (_, index) => index + 1)
      : [1, 2, 3, 4, 5, 6];
    const missingPracticeDays = expectedPracticeDays.filter((day) => !practiceDays.includes(day));
    weekCoverage.push({
      week,
      practice_days: practiceDays.join(',') || 'none',
      expected_practice_days: expectedPracticeDays.join(','),
      missing_practice_days: missingPracticeDays.join(',') || 'none',
      recovery_days: recoveryDays.join(',') || 'none',
      has_recovery_day: recoveryDays.includes(7),
      is_full_practice_week: week < weekCount ? practiceDays.length === PRACTICE_DAYS_PER_WEEK : true,
    });
  }

  const composedPractices = activeVisibleRows.filter((row) =>
    Array.isArray(row.curriculum_payload?.practice_composition)
    && row.curriculum_payload.practice_composition.length > 1
  );

  const duplicateNaturalKeys = [...classifiedCourses.reduce((acc, course) => {
    if (!course.isPlayable) return acc;
    const key = `${course.categoryName}|${course.subCategoryName}|${course.title}`.toLowerCase();
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(Number(course.id));
    return acc;
  }, new Map()).entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids }));

  return {
    totalCourses: classifiedCourses.length,
    playableCourses: playableCourses.length,
    excludedCourses,
    scheduledCourseRefs: scheduledRefs.length,
    scheduledUniqueCourses: scheduledIdSet.size,
    unscheduledPlayableCourses,
    duplicateScheduledCourses,
    duplicateNaturalKeys,
    totalCurriculumNodes: curriculumRows.length,
    activeVisibleNodes: activeVisibleRows.length,
    weekCount,
    weekCoverage,
    recoveryDays: activeVisibleRows.filter((row) => row.node_type === 'recovery' || row.is_rest_day).length,
    composedPractices: composedPractices.length,
    invalidCourseReferences,
    unresolvedCompositionReferences: [],
  };
}
