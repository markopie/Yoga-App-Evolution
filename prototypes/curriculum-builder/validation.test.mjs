import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDraft } from './validation.js';

const courses = [
  { id: 101, title: 'Course One' },
  { id: 202, title: 'Course Two' },
];

function item(overrides = {}) {
  return {
    node_type: 'sequence',
    sequence_id: 101,
    completion_requirement: 'complete',
    primary_focus: 'Standing poses',
    day_role: 'foundation',
    estimated_minutes: 35,
    is_revision_node: false,
    curriculum_payload: {},
    ...overrides,
  };
}

function draft(items, overrides = {}) {
  return {
    slug: 'test_curriculum',
    programName: 'Test Curriculum',
    sections: [
      {
        name: 'Foundation',
        levelNumber: 1,
        weeks: [
          {
            weekNumber: 1,
            items,
          },
        ],
      },
    ],
    ...overrides,
  };
}

test('valid minimal draft passes with no errors', () => {
  const result = validateDraft(draft([item()]), courses);
  assert.deepEqual(result.errors, []);
});

test('invalid sequence_id produces error', () => {
  const result = validateDraft(draft([item({ sequence_id: 999 })]), courses);
  assert.equal(result.errors.some((entry) => entry.path.endsWith('.sequence_id')), true);
});

test('invalid node_type produces error', () => {
  const result = validateDraft(draft([item({ node_type: 'flow' })]), courses);
  assert.equal(result.errors.some((entry) => entry.path.endsWith('.node_type')), true);
});

test('duplicate order_index produces error', () => {
  const result = validateDraft(draft([
    item({ order_index: 100 }),
    item({ sequence_id: 202, order_index: 100 }),
  ]), courses);
  assert.equal(result.errors.some((entry) => entry.path.endsWith('.order_index')), true);
});

test('high-duration item produces warning only', () => {
  const result = validateDraft(draft([item({ estimated_minutes: 120 })]), courses);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.some((entry) => entry.path.endsWith('.estimated_minutes')), true);
});

test('duplicate source use produces warning', () => {
  const result = validateDraft(draft([
    item(),
    item({ primary_focus: 'Forward bends', day_role: 'technical' }),
  ]), courses);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.some((entry) => entry.path.endsWith('.sequence_id')), true);
});
