import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CURRICULUM_SLUG } from './curriculum_testing_v2_builder.mjs';

const DURATION_SCALE = 0.75;
const NOTES_MARKER = `duration-metadata-verification-${Date.now()}`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function requireEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }
}

function unwrapRpcRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function getPracticeComposition(practice) {
  const composition = practice?.curriculum_payload?.practice_composition;
  if (Array.isArray(composition) && composition.length) {
    return composition
      .filter((part) => part?.counts_for_source_completion !== false)
      .map((part, index) => ({
        part_number: index + 1,
        sequence_id: Number(part.sequence_id),
        role: part.role || null,
      }))
      .filter((part) => Number.isFinite(part.sequence_id));
  }

  const sequenceId = Number(practice?.resolved_sequence_id || practice?.sequence_id);
  if (!Number.isFinite(sequenceId)) return [];
  return [{ part_number: 1, sequence_id: sequenceId, role: practice.practice_track || 'sequence' }];
}

async function getTodayPractice(testUserId) {
  const { data, error } = await supabase.rpc('get_today_curriculum_practice', {
    p_curriculum_slug: CURRICULUM_SLUG,
    p_user_id: testUserId,
  });
  if (error) throw error;
  return unwrapRpcRow(data);
}

async function getAnalysisByCourseId(sequenceIds) {
  const { data, error } = await supabase
    .from('course_sequence_analysis')
    .select('course_id,course_title,total_duration_minutes')
    .in('course_id', sequenceIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [Number(row.course_id), row]));
}

function plannedMinutesForPractice(practice, parts, analysisByCourseId) {
  const payloadDuration = Number(practice?.curriculum_payload?.composed_total_duration_minutes);
  if (Number.isFinite(payloadDuration) && payloadDuration > 0) return round2(payloadDuration);

  const total = parts.reduce((sum, part) => {
    const duration = Number(analysisByCourseId.get(part.sequence_id)?.total_duration_minutes);
    return Number.isFinite(duration) ? sum + duration : sum;
  }, 0);
  if (total > 0) return round2(total);

  const practiceDuration = Number(practice?.curriculum_payload?.total_duration_minutes);
  if (Number.isFinite(practiceDuration) && practiceDuration > 0) return round2(practiceDuration);

  throw new Error('Could not resolve planned duration for verification practice.');
}

async function insertCompletionRows({ practice, parts, analysisByCourseId, testUserId, plannedMinutes, adjustedMinutes }) {
  const rows = parts.map((part) => {
    const analysis = analysisByCourseId.get(part.sequence_id);
    return {
      user_id: testUserId,
      title: analysis?.course_title || `Sequence ${part.sequence_id}`,
      category: practice.source_course || practice.source_key || 'Verification',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round(adjustedMinutes * 60),
      status: 'Completed',
      notes: NOTES_MARKER,
      rating: 3,
      sequence_id: part.sequence_id,
      curriculum_node_id: practice.curriculum_node_id,
      completed: true,
      duration_scale_used: DURATION_SCALE,
      planned_duration_minutes: plannedMinutes,
      actual_adjusted_duration_minutes: adjustedMinutes,
    };
  });

  const { data, error } = await supabase
    .from('sequence_completions')
    .insert(rows)
    .select('id,user_id,sequence_id,curriculum_node_id,completed,duration_scale_used,planned_duration_minutes,actual_adjusted_duration_minutes,notes');

  if (error) {
    throw new Error(
      `Completion metadata insert failed. Apply migration 20260509000001_add_completion_duration_dial_metadata.sql first. Supabase error: ${error.message}`,
    );
  }

  return data || [];
}

function assertInsertedRows(rows, { practice, parts, plannedMinutes, adjustedMinutes }) {
  if (rows.length !== parts.length) {
    throw new Error(`Expected ${parts.length} completion row(s), found ${rows.length}.`);
  }

  for (const row of rows) {
    if (row.completed !== true) throw new Error(`Row ${row.id} did not store completed=true.`);
    if (round3(row.duration_scale_used) !== DURATION_SCALE) {
      throw new Error(`Row ${row.id} stored duration_scale_used=${row.duration_scale_used}, expected ${DURATION_SCALE}.`);
    }
    if (round2(row.planned_duration_minutes) !== plannedMinutes) {
      throw new Error(`Row ${row.id} stored planned_duration_minutes=${row.planned_duration_minutes}, expected ${plannedMinutes}.`);
    }
    if (round2(row.actual_adjusted_duration_minutes) !== adjustedMinutes) {
      throw new Error(`Row ${row.id} stored actual_adjusted_duration_minutes=${row.actual_adjusted_duration_minutes}, expected ${adjustedMinutes}.`);
    }
    if (Number(row.curriculum_node_id) !== Number(practice.curriculum_node_id)) {
      throw new Error(`Row ${row.id} did not store curriculum_node_id=${practice.curriculum_node_id}.`);
    }
  }
}

async function cleanup(testUserId) {
  const { error } = await supabase
    .from('sequence_completions')
    .delete()
    .eq('user_id', testUserId)
    .eq('notes', NOTES_MARKER);
  if (error) throw error;
}

async function createTemporaryAuthUser() {
  const suffix = randomUUID();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `duration-metadata-${suffix}@example.invalid`,
    password: `DurationMetadata-${suffix}`,
    email_confirm: true,
    user_metadata: {
      purpose: 'verify_completion_duration_metadata',
      cleanup_marker: NOTES_MARKER,
    },
  });

  if (error) {
    throw new Error(`Could not create temporary auth user for verification: ${error.message}`);
  }
  if (!data?.user?.id) {
    throw new Error('Supabase did not return a temporary auth user id.');
  }

  return data.user.id;
}

async function deleteTemporaryAuthUser(testUserId) {
  if (!testUserId) return;
  const { error } = await supabase.auth.admin.deleteUser(testUserId);
  if (error) {
    console.warn(`Could not delete temporary auth user ${testUserId}: ${error.message}`);
  }
}

async function main() {
  requireEnv();

  const testUserId = await createTemporaryAuthUser();
  let insertedRows = [];

  try {
    const practice = await getTodayPractice(testUserId);
    if (!practice?.curriculum_node_id) {
      throw new Error('get_today_curriculum_practice did not return a curriculum node.');
    }

    const parts = getPracticeComposition(practice);
    if (!parts.length) throw new Error('Verification practice has no completion parts.');

    const analysisByCourseId = await getAnalysisByCourseId(parts.map((part) => part.sequence_id));
    const plannedMinutes = plannedMinutesForPractice(practice, parts, analysisByCourseId);
    const adjustedMinutes = round2(plannedMinutes * DURATION_SCALE);

    insertedRows = await insertCompletionRows({
      practice,
      parts,
      analysisByCourseId,
      testUserId,
      plannedMinutes,
      adjustedMinutes,
    });
    assertInsertedRows(insertedRows, { practice, parts, plannedMinutes, adjustedMinutes });

    const nextPractice = await getTodayPractice(testUserId);
    if (!nextPractice?.curriculum_node_id) {
      throw new Error('get_today_curriculum_practice did not return a next node after completion.');
    }
    if (Number(nextPractice.curriculum_node_id) === Number(practice.curriculum_node_id)) {
      throw new Error('Curriculum tracker still returned the completed node after metadata completion insert.');
    }

    console.log('Completion duration metadata verification passed.');
    console.table({
      completed_node_id: practice.curriculum_node_id,
      next_node_id: nextPractice.curriculum_node_id,
      completion_rows: insertedRows.length,
      duration_scale_used: DURATION_SCALE,
      planned_duration_minutes: plannedMinutes,
      actual_adjusted_duration_minutes: adjustedMinutes,
      cleanup_marker: NOTES_MARKER,
    });
  } finally {
    if (insertedRows.length) {
      await cleanup(testUserId);
      console.log(`Cleaned up ${insertedRows.length} verification completion row(s).`);
    }
    await deleteTemporaryAuthUser(testUserId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
