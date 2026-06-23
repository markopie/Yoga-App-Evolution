import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    CONFLICT_STATUS,
    chooseMediaUrl,
    detectConflict,
    mediaAssetChanged,
    shouldDownloadAsset,
    stableSyncKey,
} from './offlineSync.js';

describe('offline sync helpers', () => {
    test('builds stable row keys from unordered primary key objects', () => {
        assert.equal(
            stableSyncKey('courses', { b: 2, a: 1 }),
            stableSyncKey('courses', { a: 1, b: 2 }),
        );
    });

    test('detects remote changes after the local base version', () => {
        assert.equal(
            detectConflict(
                { base_server_version: 10 },
                { server_version: 11, operation: 'update' },
            ),
            CONFLICT_STATUS.CONFLICT,
        );
        assert.equal(
            detectConflict(
                { base_server_version: 10 },
                { server_version: 11, operation: 'delete', deleted_at: '2026-06-22T00:00:00Z' },
            ),
            CONFLICT_STATUS.DELETED_REMOTELY,
        );
        assert.equal(
            detectConflict(
                { base_server_version: 10 },
                { server_version: 10, operation: 'update' },
            ),
            CONFLICT_STATUS.CLEAN,
        );
    });

    test('prefers offline media variants only when requested', () => {
        const asset = {
            original_url: 'https://example.test/full.webp',
            offline_url: 'file:///offline/card.webp',
        };
        assert.equal(chooseMediaUrl(asset), 'https://example.test/full.webp');
        assert.equal(chooseMediaUrl(asset, { offline: true }), 'file:///offline/card.webp');
    });

    test('detects changed media by hash before timestamps', () => {
        assert.equal(
            mediaAssetChanged(
                { content_hash: 'a', updated_at: '2026-06-22T00:00:00Z' },
                { content_hash: 'b', updated_at: '2026-06-21T00:00:00Z' },
            ),
            true,
        );
    });

    test('does not auto-download audio outside explicit packs', () => {
        const localAsset = { content_hash: 'old' };
        const remoteAudio = { media_type: 'audio', content_hash: 'new' };
        assert.equal(shouldDownloadAsset(localAsset, remoteAudio), false);
        assert.equal(shouldDownloadAsset(localAsset, remoteAudio, { explicitAudioPack: true }), true);
    });
});
