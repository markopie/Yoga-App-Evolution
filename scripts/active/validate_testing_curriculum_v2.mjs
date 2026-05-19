import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CURRICULUM_SLUG = 'iyengar_integrated_master_path_testing_v2';

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

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const { data: rows, error } = await supabase
    .from('program_curriculum')
    .select('id, week_number, day_number, node_type, day_role, recovery_type, is_active, is_visible')
    .eq('curriculum_slug', CURRICULUM_SLUG)
    .order('week_number')
    .order('day_number');

  if (error) throw error;

  const activeVisibleRows = (rows || []).filter((row) => row.is_active && row.is_visible);
  const weekCounts = activeVisibleRows.reduce((acc, row) => {
    acc.set(row.week_number, (acc.get(row.week_number) || 0) + 1);
    return acc;
  }, new Map());

  assertPass(rows.length === 14, 'testing_v2 has exactly 14 rows', `${rows.length} found`);
  assertPass(
    [1, 2].every((week) => weekCounts.get(week) === 7),
    'each testing_v2 week has exactly 7 active visible rows',
    JSON.stringify(Object.fromEntries(weekCounts)),
  );

  const duplicateKeys = [...activeVisibleRows.reduce((acc, row) => {
    const key = `W${row.week_number}D${row.day_number}`;
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map()).entries()].filter(([, count]) => count > 1);
  assertPass(duplicateKeys.length === 0, 'no duplicate active visible week/day rows', JSON.stringify(duplicateKeys));

  const invalidD7Rows = activeVisibleRows.filter((row) =>
    row.day_number === 7 && (row.node_type !== 'recovery' || row.day_role !== 'recovery' || !row.recovery_type)
  );
  assertPass(invalidD7Rows.length === 0, 'D7 rows are recovery rows', JSON.stringify(invalidD7Rows));

  const invisibleActiveRows = (rows || []).filter((row) => row.is_active && !row.is_visible);
  assertPass(invisibleActiveRows.length === 0, 'no active testing_v2 rows are invisible', JSON.stringify(invisibleActiveRows));

  console.table(activeVisibleRows.map((row) => ({
    week: row.week_number,
    day: row.day_number,
    node_type: row.node_type,
    day_role: row.day_role,
    recovery_type: row.recovery_type,
  })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
