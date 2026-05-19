import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isRestOrRecoveryNode,
  isSequenceReady,
  nonSequenceNodeTitle,
} from './curriculumRouting.js';

describe('curriculum routing helpers', () => {
  test('treats recovery rows as visible acknowledgement nodes, not sequences', () => {
    const recovery = {
      node_type: 'recovery',
      day_role: 'recovery',
      recovery_type: 'full_rest',
      resolved_node_type: 'recovery',
      resolved_sequence_id: null,
    };

    assert.equal(isRestOrRecoveryNode(recovery), true);
    assert.equal(isSequenceReady(recovery), false);
    assert.equal(nonSequenceNodeTitle(recovery), 'Recovery Day - Full Rest');
  });

  test('labels visible non-sequence curriculum nodes without requiring sequence ids', () => {
    const nodes = [
      [{ node_type: 'instruction', resolved_node_type: 'instruction' }, 'Instruction Day'],
      [{ node_type: 'choice', resolved_node_type: 'choice' }, 'Choice Day'],
      [{ node_type: 'revision', resolved_node_type: 'revision' }, 'Revision Day'],
      [{ node_type: 'assessment', resolved_node_type: 'assessment' }, 'Assessment Day'],
      [{ node_type: 'consolidation', resolved_node_type: 'consolidation' }, 'Consolidation Day'],
    ];

    nodes.forEach(([node, title]) => {
      assert.equal(isSequenceReady(node), false);
      assert.equal(nonSequenceNodeTitle(node), title);
    });
  });

  test('only routes resolved sequence nodes into playback', () => {
    assert.equal(isSequenceReady({ resolved_node_type: 'sequence', resolved_sequence_id: 114 }), true);
    assert.equal(isSequenceReady({ resolved_node_type: 'sequence', resolved_sequence_id: null }), false);
    assert.equal(isSequenceReady({ resolved_node_type: 'instruction', resolved_sequence_id: 114 }), false);
  });
});
