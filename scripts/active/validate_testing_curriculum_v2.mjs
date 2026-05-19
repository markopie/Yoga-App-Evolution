import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CURRICULUM_SLUG = 'iyengar_integrated_master_path_testing_v2';
const EXPECTED_WEEKS = 24;
const EXPECTED_TOTAL_ROWS = 160;
const EXPECTED_ACTIVE_VISIBLE_ROWS = 145;
const EXPECTED_SOURCE_BACKED_ROWS = 93;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function assertPass(condition, message, details = '') {
  if (!condition) {
    throw new Error(details ? `${message}: ${details}` : message);
  }
  console.log(`PASS - ${message}`);
}

function hasComposition(row) {
  return Array.isArray(row.curriculum_payload?.practice_composition);
}

function adaptiveBehavior(row) {
  if (row.adaptive_behavior && typeof row.adaptive_behavior === 'object') return row.adaptive_behavior;
  if (typeof row.adaptive_behavior === 'string') {
    try {
      return JSON.parse(row.adaptive_behavior);
    } catch {
      return {};
    }
  }
  return {};
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const { data: rows, error } = await supabase
    .from('program_curriculum')
    .select('id, week_number, day_number, node_type, day_role, recovery_type, source_policy, sequence_id, is_active, is_visible, requires_user_selection, adaptive_behavior, curriculum_payload')
    .eq('curriculum_slug', CURRICULUM_SLUG)
    .order('order_index');

  if (error) throw error;

  const allRows = rows || [];
  const activeVisibleRows = allRows.filter((row) => row.is_active && row.is_visible);
  const sourceBackedRows = allRows.filter((row) => row.sequence_id != null || hasComposition(row));
  const adaptiveRows = activeVisibleRows.filter((row) =>
    ['adaptive_revision', 'adaptive_consolidation'].includes(row.source_policy)
  );
  const recoveryRows = activeVisibleRows.filter((row) => row.node_type === 'recovery');
  const placeholderRows = allRows.filter((row) =>
    row.source_policy === 'placeholder_non_sequence' || row.curriculum_payload?.placeholder_non_sequence === true
  );

  assertPass(allRows.length === EXPECTED_TOTAL_ROWS, 'testing_v2 has the full draft_v1-derived row count', `${allRows.length} found`);
  assertPass(activeVisibleRows.length === EXPECTED_ACTIVE_VISIBLE_ROWS, 'testing_v2 has the expected active visible row count', `${activeVisibleRows.length} found`);
  assertPass(sourceBackedRows.length === EXPECTED_SOURCE_BACKED_ROWS, 'testing_v2 preserves source-backed draft_v1 rows', `${sourceBackedRows.length} found`);
  assertPass(placeholderRows.length === 0, 'testing_v2 has no placeholder curriculum nodes', JSON.stringify(placeholderRows));

  const weekCounts = activeVisibleRows.reduce((acc, row) => {
    acc.set(row.week_number, (acc.get(row.week_number) || 0) + 1);
    return acc;
  }, new Map());
  assertPass(
    Array.from({ length: EXPECTED_WEEKS }, (_, index) => index + 1)
      .every((week) => weekCounts.get(week) >= 4),
    'each testing_v2 week has at least four active visible rows',
    JSON.stringify(Object.fromEntries(weekCounts)),
  );

  const duplicateKeys = [...activeVisibleRows.reduce((acc, row) => {
    const key = `W${row.week_number}D${row.day_number}`;
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map()).entries()].filter(([, count]) => count > 1);
  assertPass(duplicateKeys.length === 0, 'no duplicate active visible week/day rows', JSON.stringify(duplicateKeys));

  const visibleInactiveRows = allRows.filter((row) => !row.is_active && row.is_visible);
  assertPass(visibleInactiveRows.length === 0, 'inactive source-shadow rows are not visible on the roadmap', JSON.stringify(visibleInactiveRows));

  const invalidRecoveryRows = recoveryRows.filter((row) => row.day_role !== 'recovery' || !row.recovery_type);
  assertPass(invalidRecoveryRows.length === 0, 'recovery rows carry day_role and recovery_type', JSON.stringify(invalidRecoveryRows));

  const userSelectionRows = activeVisibleRows.filter((row) => row.requires_user_selection);
  assertPass(userSelectionRows.length === 0, 'no active visible testing_v2 rows require user curriculum selection', JSON.stringify(userSelectionRows));

  const invalidAdaptiveRows = adaptiveRows.filter((row) => row.sequence_id != null || !adaptiveBehavior(row).selector);
  assertPass(invalidAdaptiveRows.length === 0, 'adaptive rows are automatic selector nodes', JSON.stringify(invalidAdaptiveRows));

  console.table([{
    total_rows: allRows.length,
    active_visible_rows: activeVisibleRows.length,
    source_backed_rows: sourceBackedRows.length,
    adaptive_rows: adaptiveRows.length,
    recovery_rows: recoveryRows.length,
    placeholders: placeholderRows.length,
  }]);
  console.table(
    Object.entries(activeVisibleRows.reduce((acc, row) => {
      acc[row.source_policy] = (acc[row.source_policy] || 0) + 1;
      return acc;
    }, {})).map(([source_policy, count]) => ({ source_policy, count })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
