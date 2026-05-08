import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CURRICULUM_SLUG = 'iyengar_integrated_master_path_draft_v1';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function requireEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }
}

async function fetchAll(table, select, query = (q) => q) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  for (;;) {
    const request = query(supabase.from(table).select(select).range(from, from + pageSize - 1));
    const { data, error } = await request;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function getCompositionParts(row) {
  const parts = row.curriculum_payload?.practice_composition;
  if (!Array.isArray(parts)) return [];
  return parts
    .map((part, index) => ({
      curriculum_node_id: row.id,
      week_number: row.week_number,
      day_number: row.day_number,
      source_reference: row.source_reference,
      node_type: row.node_type,
      primary_sequence_id: row.sequence_id,
      part_number: index + 1,
      role: part.role || null,
      sequence_id: Number(part.sequence_id),
      counts_for_source_completion: part.counts_for_source_completion !== false,
    }))
    .filter((part) => Number.isFinite(part.sequence_id));
}

function groupKey(row) {
  return `${row.source_key || ''}|||${row.source_course || ''}`;
}

function fmt(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  return value;
}

function coverageRows(requiredInventory, activeNodes, compositionParts) {
  const requiredByKey = new Map();
  const requiredBySequenceId = new Map();

  for (const inv of requiredInventory) {
    requiredBySequenceId.set(Number(inv.sequence_id), inv);
    const key = groupKey(inv);
    if (!requiredByKey.has(key)) {
      requiredByKey.set(key, {
        source_key: inv.source_key,
        source_course: inv.source_course,
        required: new Set(),
        scheduled: new Set(),
        primary: new Set(),
        composition: new Set(),
      });
    }
    requiredByKey.get(key).required.add(Number(inv.sequence_id));
  }

  const sourceCompletionOccurrences = [];

  for (const node of activeNodes) {
    const hasComposition = getCompositionParts(node).length > 0;
    const sequenceId = Number(node.sequence_id);
    if (Number.isFinite(sequenceId) && requiredBySequenceId.has(sequenceId)) {
      const inv = requiredBySequenceId.get(sequenceId);
      requiredByKey.get(groupKey(inv))?.primary.add(sequenceId);

      if (!hasComposition) {
        requiredByKey.get(groupKey(inv))?.scheduled.add(sequenceId);
        sourceCompletionOccurrences.push({
          sequence_id: sequenceId,
          placement_kind: 'primary_sequence_id',
          curriculum_node_id: node.id,
          week_number: node.week_number,
          day_number: node.day_number,
          node_type: node.node_type,
          is_revision_node: !!node.is_revision_node,
          completion_requirement: node.completion_requirement,
        });
      }
    }
  }

  for (const part of compositionParts.filter((item) => item.counts_for_source_completion)) {
    if (!requiredBySequenceId.has(part.sequence_id)) continue;
    const inv = requiredBySequenceId.get(part.sequence_id);
    const bucket = requiredByKey.get(groupKey(inv));
    bucket?.composition.add(part.sequence_id);
    bucket?.scheduled.add(part.sequence_id);
    sourceCompletionOccurrences.push({
      ...part,
      placement_kind: 'practice_composition',
      is_revision_node: false,
      completion_requirement: 'attempt',
    });
  }

  const coverage = [...requiredByKey.values()]
    .map((bucket) => ({
      source_key: bucket.source_key,
      source_course: bucket.source_course,
      required_sequence_count: bucket.required.size,
      placed_scheduled_sequence_count: bucket.scheduled.size,
      placed_as_primary_sequence_id_count: bucket.primary.size,
      placed_inside_practice_composition_count: bucket.composition.size,
      remaining_required_count: bucket.required.size - bucket.scheduled.size,
    }))
    .sort((a, b) =>
      String(a.source_key).localeCompare(String(b.source_key)) ||
      String(a.source_course).localeCompare(String(b.source_course)));

  return { coverage, sourceCompletionOccurrences, requiredBySequenceId };
}

function duplicateRows(sourceCompletionOccurrences, requiredBySequenceId) {
  const grouped = new Map();

  for (const occ of sourceCompletionOccurrences) {
    if (!grouped.has(occ.sequence_id)) grouped.set(occ.sequence_id, []);
    grouped.get(occ.sequence_id).push(occ);
  }

  return [...grouped.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([sequenceId, occurrences]) => {
      const inv = requiredBySequenceId.get(sequenceId);
      const kinds = new Set(occurrences.map((occ) => occ.placement_kind));
      const intentional = occurrences.some((occ) =>
        occ.is_revision_node ||
        ['revision', 'choice', 'consolidation'].includes(occ.node_type) ||
        occ.completion_requirement === 'repeat_until_ready');
      const duplicate_type = intentional
        ? 'intentional_revision_or_repeat'
        : kinds.has('primary_sequence_id') && kinds.has('practice_composition')
          ? 'active_standalone_and_appended'
          : 'accidental_duplicate_required_placement';

      return {
        sequence_id: sequenceId,
        source_key: inv?.source_key || '',
        source_course: inv?.source_course || '',
        scheduled_occurrences: occurrences.length,
        duplicate_type,
        occurrences: occurrences
          .sort((a, b) => (a.week_number - b.week_number) || (a.day_number - b.day_number))
          .map((occ) => `node ${occ.curriculum_node_id} W${occ.week_number}D${occ.day_number} ${occ.placement_kind}`),
      };
    })
    .sort((a, b) => b.scheduled_occurrences - a.scheduled_occurrences || a.sequence_id - b.sequence_id);
}

function composedNodeRows(activeNodes, compositionParts, analysisByCourseId, courseById) {
  const partsByNode = new Map();
  for (const part of compositionParts) {
    if (!partsByNode.has(part.curriculum_node_id)) partsByNode.set(part.curriculum_node_id, []);
    partsByNode.get(part.curriculum_node_id).push(part);
  }

  return activeNodes
    .filter((node) => partsByNode.has(node.id))
    .flatMap((node) => {
      const parts = partsByNode.get(node.id).sort((a, b) => a.part_number - b.part_number);
      const totalCalculated = parts.reduce((sum, part) => {
        const duration = Number(analysisByCourseId.get(part.sequence_id)?.total_duration_minutes);
        return Number.isFinite(duration) ? sum + duration : sum;
      }, 0);
      const playable = parts.every((part) => {
        const course = courseById.get(part.sequence_id);
        return !!course && Array.isArray(course.sequence_json) && course.sequence_json.length > 0;
      });

      return parts.map((part) => ({
        curriculum_node_id: node.id,
        week_day: `W${node.week_number}D${node.day_number}`,
        title: node.source_reference,
        primary_program_sequence_id: node.sequence_id,
        part_number: part.part_number,
        role: part.role,
        sequence_id: part.sequence_id,
        sequence_title: courseById.get(part.sequence_id)?.title || '',
        counts_for_source_completion: part.counts_for_source_completion,
        part_duration_minutes: fmt(analysisByCourseId.get(part.sequence_id)?.total_duration_minutes),
        node_total_calculated_minutes: fmt(totalCalculated),
        payload_total_minutes: fmt(Number(node.curriculum_payload?.composed_total_duration_minutes)),
        playable_by_synthetic_macro: playable,
      }));
    });
}

function inactiveReplacementRows(inactiveNodes, compositionParts, courseById) {
  const activePartsBySequenceId = new Map();
  for (const part of compositionParts) {
    if (!part.counts_for_source_completion) continue;
    if (!activePartsBySequenceId.has(part.sequence_id)) activePartsBySequenceId.set(part.sequence_id, []);
    activePartsBySequenceId.get(part.sequence_id).push(part);
  }

  return inactiveNodes
    .filter((node) => activePartsBySequenceId.has(Number(node.sequence_id)))
    .map((node) => ({
      inactive_node_id: node.id,
      old_week_day: `W${node.week_number}D${node.day_number}`,
      sequence_id: node.sequence_id,
      sequence_title: courseById.get(Number(node.sequence_id))?.title || '',
      inactive_reason: node.curriculum_payload?.inactive_reason || '',
      now_scheduled_in: activePartsBySequenceId.get(Number(node.sequence_id))
        .map((part) => `node ${part.curriculum_node_id} W${part.week_number}D${part.day_number} part ${part.part_number} ${part.role}`)
        .join('; '),
    }))
    .sort((a, b) => Number(a.sequence_id) - Number(b.sequence_id));
}

async function main() {
  requireEnv();

  const [inventory, nodes, analysis, courses] = await Promise.all([
    fetchAll(
      'source_sequence_inventory',
      'sequence_id,source_key,source_course,is_required',
      (q) => q.eq('is_required', true),
    ),
    fetchAll(
      'program_curriculum',
      'id,sequence_id,curriculum_slug,week_number,day_number,order_index,is_revision_node,source_reference,is_active,node_type,source_key,source_course,curriculum_payload,practice_track,completion_requirement',
      (q) => q.eq('curriculum_slug', CURRICULUM_SLUG).order('order_index'),
    ),
    fetchAll('course_sequence_analysis', 'course_id,course_title,total_duration_minutes,effective_intensity_band,effective_primary_theme,course_style'),
    fetchAll('courses', 'id,title,sequence_json'),
  ]);

  const activeNodes = nodes.filter((node) => node.is_active);
  const inactiveNodes = nodes.filter((node) => !node.is_active);
  const compositionParts = activeNodes.flatMap(getCompositionParts);
  const analysisByCourseId = new Map(analysis.map((row) => [Number(row.course_id), row]));
  const courseById = new Map(courses.map((row) => [Number(row.id), row]));

  const { coverage, sourceCompletionOccurrences, requiredBySequenceId } = coverageRows(
    inventory,
    activeNodes,
    compositionParts,
  );
  const duplicates = duplicateRows(sourceCompletionOccurrences, requiredBySequenceId);
  const composed = composedNodeRows(activeNodes, compositionParts, analysisByCourseId, courseById);
  const inactiveReplacements = inactiveReplacementRows(inactiveNodes, compositionParts, courseById);

  console.log(`Curriculum coverage audit: ${CURRICULUM_SLUG}`);
  console.log(`Nodes: ${nodes.length} total, ${activeNodes.length} active, ${inactiveNodes.length} inactive`);
  console.log(`Required inventory rows: ${inventory.length}`);
  console.log(`Source-completion scheduled occurrences: ${sourceCompletionOccurrences.length}`);

  console.log('\nCoverage by source/course');
  console.table(coverage);

  console.log('\nDuplicate required source-completion scheduling');
  if (duplicates.length) console.table(duplicates);
  else console.log('None found.');

  console.log('\nActive composed node validation');
  if (composed.length) console.table(composed);
  else console.log('No active composed nodes found.');

  console.log('\nInactive nodes replaced by practice_composition');
  if (inactiveReplacements.length) console.table(inactiveReplacements);
  else console.log('None found.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
