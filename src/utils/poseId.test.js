import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalisePoseId, poseIdFromSequenceNode } from './poseId.js';

describe('pose id helpers', () => {
    it('normalises numeric pose ids to the app pose id format', () => {
        assert.equal(normalisePoseId('5'), '005');
        assert.equal(normalisePoseId('005'), '005');
        assert.equal(normalisePoseId('5A'), '005a');
        assert.equal(normalisePoseId(' 12b '), '012b');
    });

    it('lowercases non-numeric search tokens without padding', () => {
        assert.equal(normalisePoseId('Supta'), 'supta');
        assert.equal(normalisePoseId(''), '');
        assert.equal(normalisePoseId(null), '');
    });

    it('extracts direct pose ids from parsed sequence nodes only', () => {
        assert.equal(poseIdFromSequenceNode(['5', 30]), '005');
        assert.equal(poseIdFromSequenceNode([['7A'], 30]), '007a');
        assert.equal(poseIdFromSequenceNode(['MACRO:123', 1]), '');
        assert.equal(poseIdFromSequenceNode(['LOOP_START', 2]), '');
    });
});
