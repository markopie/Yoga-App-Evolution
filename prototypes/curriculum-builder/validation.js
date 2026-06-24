export const VALID_NODE_TYPES = [
  'sequence',
  'composed_sequence',
  'revision',
  'choice',
  'recovery',
  'consolidation',
  'mastery_gate',
  'instruction',
  'assessment',
  'reserve',
  'rest',
];

export const VALID_COMPLETION_REQUIREMENTS = [
  'none',
  'attempt',
  'complete',
  'complete_all_parts',
  'repeat_until_ready',
  'optional',
  'choose_one',
  'acknowledge',
];

const SOURCE_OPTIONAL_NODE_TYPES = new Set([
  'rest',
  'recovery',
  'instruction',
  'assessment',
  'mastery_gate',
  'reserve',
  'consolidation',
]);

const STRONG_INTENSITIES = new Set(['strong', 'advanced']);

const VALID_DAY_KINDS = new Set([
  'practice',
  'combined_practice',
  'rest_day',
  'recovery_day',
  'revision',
  'student_choice',
  'teaching_note',
  'checkpoint',
]);

const PRACTICE_DAY_KINDS = new Set([
  'practice',
  'combined_practice',
  'revision',
  'student_choice',
]);

const DAY_KIND_LABELS = {
  practice: 'Practice',
  combined_practice: 'Combined practice',
  rest_day: 'Rest day',
  recovery_day: 'Recovery day',
  revision: 'Revision',
  student_choice: 'Student chooses',
  teaching_note: 'Teaching note',
  checkpoint: 'Checkpoint',
};

export function slugIsValid(slug) {
  return /^[a-z0-9_]+$/.test(String(slug || ''));
}

export function computeOrderIndex(sectionIndex, weekIndex, itemIndex) {
  return (Number(sectionIndex) * 100000) + (Number(weekIndex) * 1000) + (Number(itemIndex) * 100);
}

export function courseIdSet(courses = []) {
  return new Set((courses || []).map((course) => Number(course.id)).filter(Number.isFinite));
}

function pushError(result, path, message) {
  result.errors.push({ level: 'error', path, message });
}

function pushWarning(result, path, message) {
  result.warnings.push({ level: 'warning', path, message });
}

function parsePayload(item) {
  if (typeof item.curriculum_payload_raw !== 'string' || !item.curriculum_payload_raw.trim()) {
    return { payload: item.curriculum_payload || {}, invalid: false };
  }
  try {
    return { payload: JSON.parse(item.curriculum_payload_raw), invalid: false };
  } catch {
    return { payload: item.curriculum_payload || {}, invalid: true };
  }
}

function dayKindFromItem(item = {}) {
  if (item.day_kind) return item.day_kind;
  if (item.is_rest_day) return 'rest_day';
  if (item.is_revision_node) return 'revision';
  if (item.node_type === 'composed_sequence') return 'combined_practice';
  if (item.node_type === 'recovery') return 'recovery_day';
  if (item.node_type === 'choice') return 'student_choice';
  if (item.node_type === 'instruction') return 'teaching_note';
  if (item.node_type === 'mastery_gate') return 'checkpoint';
  if (item.node_type === 'rest') return 'rest_day';
  return 'practice';
}

function positionLabel(ref) {
  const weekNumber = ref.week?.weekNumber ?? ref.item?.week_number ?? '?';
  const dayNumber = ref.item?.day_number ?? (Number.isFinite(ref.itemIndex) ? ref.itemIndex + 1 : '?');
  return `Day [W${weekNumber} D${dayNumber}]`;
}

export function getDraftItems(draft = {}) {
  const items = [];
  (draft.sections || []).forEach((section, sectionIndex) => {
    (section.weeks || []).forEach((week, weekIndex) => {
      (week.items || []).forEach((item, itemIndex) => {
        items.push({
          section,
          week,
          item,
          sectionIndex,
          weekIndex,
          itemIndex,
          path: `sections[${sectionIndex}].weeks[${weekIndex}].items[${itemIndex}]`,
        });
      });
    });
  });
  return items;
}

export function validateDraft(draft, courses = []) {
  const result = { errors: [], warnings: [] };
  const knownCourseIds = courseIdSet(courses);
  const usedOrderIndexes = new Map();
  const sequenceUse = new Map();
  const itemRefs = getDraftItems(draft);

  if (!slugIsValid(draft?.slug)) {
    pushError(result, 'slug', 'This curriculum needs a valid internal key before publishing.');
  }

  (draft.sections || []).forEach((section, sectionIndex) => {
    if (section.levelNumber == null || section.levelNumber === '') {
      pushWarning(result, `sections[${sectionIndex}].levelNumber`, `Section '${section.name || 'Untitled section'}' has no level number set`);
    }
  });

  itemRefs.forEach((ref) => {
    const { item, path, sectionIndex, weekIndex, itemIndex } = ref;
    const label = positionLabel(ref);
    const dayKind = dayKindFromItem(item);
    const dayKindLabel = DAY_KIND_LABELS[dayKind] || 'Practice';
    const nodeType = item.node_type || '';
    const completionRequirement = item.completion_requirement || '';
    const computedOrderIndex = item.order_index ?? computeOrderIndex(sectionIndex, weekIndex, itemIndex);

    if (item.day_kind && !VALID_DAY_KINDS.has(item.day_kind)) {
      pushError(result, `${path}.day_kind`, `${label} has an invalid day kind`);
    }

    if (!VALID_NODE_TYPES.includes(nodeType)) {
      pushError(result, `${path}.node_type`, `${label} has an invalid day kind`);
    }

    if (!VALID_COMPLETION_REQUIREMENTS.includes(completionRequirement)) {
      pushError(result, `${path}.completion_requirement`, `${label} has an invalid completion rule`);
    }

    if (usedOrderIndexes.has(computedOrderIndex)) {
      pushError(result, `${path}.order_index`, `${label} has the same position as another day. Move one of them and check again.`);
    } else {
      usedOrderIndexes.set(computedOrderIndex, path);
    }

    if (item.sequence_id != null && item.sequence_id !== '' && !knownCourseIds.has(Number(item.sequence_id))) {
      pushError(result, `${path}.sequence_id`, `${label} uses a practice that could not be found in the Practice Library`);
    }

    const { payload, invalid } = parsePayload(item);
    if (invalid) {
      pushWarning(result, `${path}.curriculum_payload`, `${label} has notes data that could not be read`);
    }

    const composition = Array.isArray(payload?.practice_composition) ? payload.practice_composition : [];
    composition.forEach((part, partIndex) => {
      if (part?.sequence_id != null && part.sequence_id !== '' && !knownCourseIds.has(Number(part.sequence_id))) {
        pushError(
          result,
          `${path}.curriculum_payload.practice_composition[${partIndex}].sequence_id`,
          `${label} uses a second practice that could not be found in the Practice Library`,
        );
      }
    });

    if (!item.sequence_id && PRACTICE_DAY_KINDS.has(dayKind) && !SOURCE_OPTIONAL_NODE_TYPES.has(nodeType)) {
      pushError(result, `${path}.sequence_id`, `${label} is a ${dayKindLabel} day but has no practice assigned`);
    }

    if (item.sequence_id) {
      const sequenceId = Number(item.sequence_id);
      if (!sequenceUse.has(sequenceId)) sequenceUse.set(sequenceId, []);
      sequenceUse.get(sequenceId).push({ item, path });
    }

    if (Number(item.estimated_minutes) > 90) {
      pushWarning(result, `${path}.estimated_minutes`, `${label} has a target duration over 90 minutes`);
    }

    if (PRACTICE_DAY_KINDS.has(dayKind) && item.sequence_id && (item.estimated_minutes == null || item.estimated_minutes === '')) {
      pushWarning(result, `${path}.estimated_minutes`, `${label} has no target duration set -- students will use the default length`);
    }

    if (PRACTICE_DAY_KINDS.has(dayKind) && (!String(item.primary_focus || '').trim() || !String(item.intensity || '').trim())) {
      pushWarning(result, `${path}.primary_focus`, `${label} has no focus or intensity -- students will see minimal context`);
    }
  });

  sequenceUse.forEach((uses) => {
    const nonRevisionUses = uses.filter(({ item }) => !item.is_revision_node);
    if (nonRevisionUses.length > 1) {
      nonRevisionUses.forEach(({ path }) => {
        pushWarning(result, `${path}.sequence_id`, `The same practice is used more than once outside revision days`);
      });
    }
  });

  itemRefs.forEach((ref, index) => {
    const nextTwo = itemRefs.slice(index, index + 3).map(({ item }) => String(item.intensity || '').toLowerCase());
    if (nextTwo.length === 3 && nextTwo.every((intensity) => STRONG_INTENSITIES.has(intensity))) {
      pushWarning(result, ref.path, `${positionLabel(ref)} begins three or more consecutive strong or advanced days`);
    }
  });

  return result;
}

export function materializePayload(item) {
  const parsed = parsePayload(item);
  return parsed.invalid ? (item.curriculum_payload || {}) : (parsed.payload || {});
}
