import { test, describe } from 'node:test';
import assert from 'node:assert';
import { classifyOfflineObject, formatBytes } from './offline-size-report.mjs';

describe('offline size report helpers', () => {
    test('classifies offline/mobile media variants', () => {
        assert.equal(classifyOfflineObject('offline/003.webp'), true);
        assert.equal(classifyOfflineObject('cards/003.mobile.webp'), true);
        assert.equal(classifyOfflineObject('cards/003_master.webp'), false);
    });

    test('formats byte counts for report output', () => {
        assert.equal(formatBytes(0), '0 B');
        assert.equal(formatBytes(1024), '1.00 KB');
        assert.equal(formatBytes(1024 * 1024 * 12), '12.0 MB');
    });
});
