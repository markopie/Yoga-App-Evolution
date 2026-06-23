import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  CURRICULUM_SLUG,
  PROGRAM_NAME,
  auditCurriculumCoverage,
  buildCurriculumRows,
  classifyCourse,
  PRACTICE_DAYS_PER_WEEK,
} from './curriculum_testing_v2_builder.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select(`
      *,
      course_sub_categories (
        id,
        name,
        category_id,
        course_categories ( id, name )
      )
    `)
    .order('id');
  if (courseError) throw courseError;

  const classifiedCourses = (courses || []).map(classifyCourse);
  const rows = buildCurriculumRows(classifiedCourses);
  const audit = auditCurriculumCoverage(classifiedCourses, rows);

  if (audit.unscheduledPlayableCourses.length) {
    throw new Error(`Refusing to seed: ${audit.unscheduledPlayableCourses.length} playable courses are unscheduled.`);
  }
  if (audit.invalidCourseReferences.length) {
    throw new Error(`Refusing to seed: ${audit.invalidCourseReferences.length} invalid course references.`);
  }

  const { data: existingNodes, error: existingNodesError } = await supabase
    .from('program_curriculum')
    .select('id')
    .eq('curriculum_slug', CURRICULUM_SLUG);
  if (existingNodesError) throw existingNodesError;

  const existingNodeIds = (existingNodes || []).map((row) => row.id);
  if (existingNodeIds.length) {
    const { error: deleteCompletionsError } = await supabase
      .from('sequence_completions')
      .delete()
      .in('curriculum_node_id', existingNodeIds);
    if (deleteCompletionsError) throw deleteCompletionsError;
  }

  const { error: deleteError } = await supabase
    .from('program_curriculum')
    .delete()
    .eq('curriculum_slug', CURRICULUM_SLUG);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from('program_curriculum')
    .insert(rows);
  if (insertError) throw insertError;

  console.log(`Inserted ${rows.length} rows for ${CURRICULUM_SLUG} (${PROGRAM_NAME}).`);
  console.table([{
    total_courses: audit.totalCourses,
    playable_courses: audit.playableCourses,
    excluded_courses: audit.excludedCourses.length,
    scheduled_course_refs: audit.scheduledCourseRefs,
    scheduled_unique_courses: audit.scheduledUniqueCourses,
    total_curriculum_nodes: rows.length,
    weeks: audit.weekCount,
    practice_days_per_week: PRACTICE_DAYS_PER_WEEK,
    recovery_days: audit.recoveryDays,
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
