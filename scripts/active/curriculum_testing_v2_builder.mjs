export const CURRICULUM_SLUG = 'iyengar_integrated_master_path_testing_v2';
export const PROGRAM_NAME = 'Integrated Iyengar Practice Path';
export const PRACTICE_DAYS_PER_WEEK = 6;
const WEEKLY_RECOVERY_DAY = 7;

function orderIndex(week, day, slot = 0) {
  return (Number(week) * 100) + (Number(day) * 10) + Number(slot);
}

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

const EXCLUDED_SOURCE_SUBCATEGORY_IDS = new Map([
  [236, 'Yoga A Gem For Women > Hygienic Habits'],
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

function sourceWeekRange(title) {
  const text = String(title || '').toLowerCase();
  const match = text.match(
    /\b(?:week|weeks|wk|wks)\s+(\d+)(?:\s*(?:to|through|thru|&|and|-)\s*(\d+))?/i,
  );
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function practiceDayNumber(title) {
  const match = String(title || '').match(/\bday\s+(\d+)\b/i);
  if (!match) return null;
  const day = Number(match[1]);
  return Number.isFinite(day) ? day : null;
}

function lightOnYogaCourseNumber(course) {
  if (course.categoryName !== 'Light on Yoga') return null;
  const match = String(course.subCategoryName || '').match(/^Course\s+(\d+)$/i);
  if (!match) return null;
  return Number(match[1]);
}

function lightOnYogaTitleKind(course) {
  const title = String(course.title || '').toLowerCase();
  if (sourceWeekRange(title)) return 'source_week';
  if (/important\s+asanas/.test(title)) return 'important_asanas';
  if (/weekly\s+practice\s+day/.test(title)) return 'weekly_practice';
  if (/final\s+practice\s+day/.test(title)) return 'final_practice';
  return null;
}

function lightOnYogaBaseOrder(course) {
  const courseNumber = lightOnYogaCourseNumber(course);
  const titleKind = lightOnYogaTitleKind(course);
  const range = sourceWeekRange(course.title);
  const day = practiceDayNumber(course.title) || 0;

  if (!courseNumber) return null;
  if (titleKind === 'source_week') {
    const course3WeeklyPracticeSplit = courseNumber === 3 && range.start >= 181 ? 45 : 10;
    return courseNumber * 100000 + course3WeeklyPracticeSplit * 1000 + range.start;
  }
  if (titleKind === 'weekly_practice') {
    if (courseNumber === 3) return courseNumber * 100000 + 30 * 1000 + day;
    return courseNumber * 100000 + 80 * 1000 + day;
  }
  if (titleKind === 'important_asanas') return courseNumber * 100000 + 90 * 1000;
  if (titleKind === 'final_practice') return courseNumber * 100000 + 95 * 1000 + day;
  return courseNumber * 100000 + 99 * 1000 + titleOrder(course.title);
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
  const stableSubCategoryId = Number(parts.subCategoryId);
  if (EXCLUDED_SOURCE_SUBCATEGORY_IDS.has(stableSubCategoryId)) {
    exclusionReasons.push(`excluded source category: ${EXCLUDED_SOURCE_SUBCATEGORY_IDS.get(stableSubCategoryId)}`);
  }

  const classified = {
    ...course,
    ...parts,
    title,
    family,
    sequenceLength: length,
    isPlayable: exclusionReasons.length === 0,
    exclusionReasons,
    sourceWeekRange: sourceWeekRange(title),
    practiceDayNumber: practiceDayNumber(title),
    lightOnYogaCourseNumber: null,
    lightOnYogaTitleKind: null,
    order: {
      family: familyOrder(family),
      subcategory: subcategoryOrder(parts.categoryName, parts.subCategoryName),
      title: titleOrder(title),
      id: Number(course.id),
    },
  };

  classified.lightOnYogaCourseNumber = lightOnYogaCourseNumber(classified);
  classified.lightOnYogaTitleKind = lightOnYogaTitleKind(classified);
  classified.order.lightOnYoga = lightOnYogaBaseOrder(classified);
  return classified;
}

export function sortCoursesForCurriculum(courses) {
  return [...courses].sort((a, b) =>
    a.order.family - b.order.family
    || a.order.subcategory - b.order.subcategory
    || (a.order.lightOnYoga ?? a.order.title) - (b.order.lightOnYoga ?? b.order.title)
    || a.order.title - b.order.title
    || a.title.localeCompare(b.title, undefined, { numeric: true })
    || Number(a.id) - Number(b.id)
  );
}

function estimatedMinutes(course) {
  const sequenceMinutes = Math.round((course.sequenceLength * 2.5) || 0);
  return Math.max(10, sequenceMinutes);
}

function expandLightOnYogaOccurrences(course) {
  const courseNumber = course.lightOnYogaCourseNumber;
  const titleKind = course.lightOnYogaTitleKind;
  if (!courseNumber || !titleKind) return null;

  if (titleKind === 'source_week') {
    const range = course.sourceWeekRange;
    const occurrences = [];
    for (let week = range.start; week <= range.end; week += 1) {
      occurrences.push({
        course,
        week,
        day: 4,
        sortOrderIndex: orderIndex(week, 4),
        orderOffset: 0,
        sourceWeekNumber: week,
        repeatLabel: `source week ${week}`,
        orderingRule: 'light_on_yoga_source_week_range_expansion',
      });
    }
    return occurrences;
  }

  if (titleKind === 'weekly_practice') {
    const day = course.practiceDayNumber;
    if (!day) return [{ course, fixed: false }];

    const supplementalWeek = courseNumber === 1
      ? 30
      : courseNumber === 2
        ? 73
        : 180;
    const mappedDay = courseNumber === 1 && day <= 3 ? day : day;
    const occurrences = [{
      course,
      week: supplementalWeek,
      day: mappedDay,
      orderOffset: 0.001,
      sortOrderIndex: orderIndex(supplementalWeek, 4, mappedDay),
      repeatLabel: `weekly practice day ${mappedDay}`,
      orderingRule: 'light_on_yoga_weekly_practice_end_block',
    }];

    if (courseNumber === 1 && day <= 3) {
      occurrences.push({
        course,
        week: supplementalWeek,
        day: day + 3,
        orderOffset: 0.001,
        sortOrderIndex: orderIndex(supplementalWeek, 4, day + 3),
        repeatLabel: `weekly practice repeated day ${day + 3}`,
        orderingRule: 'light_on_yoga_course_1_weekly_practice_day_1_to_3_repeated_as_day_4_to_6',
      });
    }

    return occurrences;
  }

  if (titleKind === 'important_asanas') {
    const supplementalWeek = courseNumber === 1 ? 30 : courseNumber === 2 ? 73 : 300;
    return [{
      course,
      week: supplementalWeek,
      day: 6,
      orderOffset: 0.002,
      sortOrderIndex: orderIndex(supplementalWeek, 4, 7),
      repeatLabel: 'important asanas end reference',
      orderingRule: 'light_on_yoga_important_asanas_after_course_work',
    }];
  }

  if (titleKind === 'final_practice') {
    const day = course.practiceDayNumber || 1;
    return [{
      course,
      week: 300,
      day,
      orderOffset: 0,
      sortOrderIndex: orderIndex(300, 4, day),
      repeatLabel: `final practice day ${day}`,
      orderingRule: 'light_on_yoga_course_3_final_practice_after_week_300',
    }];
  }

  return null;
}

function buildCourseOccurrences(playableCourses) {
  const fixed = [];
  const flexible = [];

  for (const course of playableCourses) {
    const loyOccurrences = expandLightOnYogaOccurrences(course);
    if (loyOccurrences) {
      loyOccurrences.forEach((occurrence) => fixed.push(occurrence));
      continue;
    }
    flexible.push({ course, fixed: false });
  }

  const occupied = new Map();
  fixed.forEach((occurrence) => {
    const key = `${occurrence.week}.${occurrence.day}`;
    occupied.set(key, (occupied.get(key) || 0) + 1);
  });

  let week = 1;
  let day = 1;
  const allocatedFlexible = flexible.map((occurrence) => {
    while (occupied.has(`${week}.${day}`)) {
      day += 1;
      if (day > PRACTICE_DAYS_PER_WEEK) {
        day = 1;
        week += 1;
      }
    }
    const allocated = { ...occurrence, week, day, orderOffset: 0, orderingRule: 'category_family_then_subcategory_then_title_numbers_then_course_id' };
    occupied.set(`${week}.${day}`, 1);
    day += 1;
    if (day > PRACTICE_DAYS_PER_WEEK) {
      day = 1;
      week += 1;
    }
    return allocated;
  });

  const occurrenceOrder = (occurrence) =>
    occurrence.sortOrderIndex ?? orderIndex(occurrence.week, occurrence.day);

  return [...fixed, ...allocatedFlexible].sort((a, b) =>
    occurrenceOrder(a) - occurrenceOrder(b)
    || (a.orderOffset || 0) - (b.orderOffset || 0)
    || a.course.order.family - b.course.order.family
    || a.course.order.subcategory - b.course.order.subcategory
    || (a.course.order.lightOnYoga ?? a.course.order.title) - (b.course.order.lightOnYoga ?? b.course.order.title)
    || Number(a.course.id) - Number(b.course.id)
  );
}

export function buildCurriculumRows(classifiedCourses) {
  const playableCourses = sortCoursesForCurriculum(classifiedCourses.filter((course) => course.isPlayable));
  const courseOccurrences = buildCourseOccurrences(playableCourses);
  const rows = [];

  courseOccurrences.forEach((occurrence, index) => {
    const course = occurrence.course;
    const week = occurrence.week;
    const day = occurrence.day;
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
      order_index: occurrence.sortOrderIndex
        ?? (orderIndex(week, day) + (occurrence.orderOffset || 0)),
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
        source_week_min: course.sourceWeekRange?.start ?? null,
        source_week_max: course.sourceWeekRange?.end ?? null,
        source_week_number: occurrence.sourceWeekNumber ?? null,
        repeat_label: occurrence.repeatLabel ?? null,
        sequence_length: course.sequenceLength,
        ordering_rule: occurrence.orderingRule,
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

  const weekCount = Math.max(0, ...rows.map((row) => Number(row.week_number) || 0));
  for (let week = 1; week <= weekCount; week += 1) {
    const weekRows = rows.filter((row) => row.week_number === week);
    const anchorRow = weekRows[weekRows.length - 1] || null;
    const anchorCourse = anchorRow?.curriculum_payload?.progression_group_label
      ? { family: anchorRow.curriculum_payload.progression_group_label, order: { family: anchorRow.level_number } }
      : null;
    const recoveryGroup = anchorCourse?.family || 'Weekly Recovery';
    const recoveryLevel = anchorCourse?.order.family || FAMILY_ORDER.length + 1;
    const hasDaySevenPractice = weekRows.some((row) => row.day_number === WEEKLY_RECOVERY_DAY && !row.is_rest_day);

    if (hasDaySevenPractice) continue;
    rows.push({
      sequence_id: null,
      curriculum_slug: CURRICULUM_SLUG,
      program_name: PROGRAM_NAME,
      week_number: week,
      day_number: WEEKLY_RECOVERY_DAY,
      order_index: orderIndex(week, WEEKLY_RECOVERY_DAY),
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
    .map(([sequence_id, count]) => {
      const occurrences = curriculumRows.filter((row) =>
        Number(row.sequence_id) === sequence_id
        || (row.curriculum_payload?.practice_composition || []).some((part) => Number(part?.sequence_id) === sequence_id)
      );
      const intentional = occurrences.every((row) => {
        const payload = row.curriculum_payload || {};
        return payload.source_week_number != null
          || /^light_on_yoga_/i.test(String(payload.ordering_rule || ''));
      });
      return { sequence_id, count, intentional };
    });
  const accidentalDuplicateScheduledCourses = duplicateScheduledCourses.filter((row) => !row.intentional);

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
    accidentalDuplicateScheduledCourses,
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
