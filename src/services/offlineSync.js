export const CONFLICT_STATUS = Object.freeze({
    CLEAN: 'clean',
    CONFLICT: 'conflict',
    DELETED_REMOTELY: 'deleted_remotely',
});

export function normalizeSyncPk(pk) {
    if (!pk || typeof pk !== 'object' || Array.isArray(pk)) return {};
    return Object.fromEntries(
        Object.entries(pk)
            .filter(([, value]) => value !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
    );
}

export function stableSyncKey(tableName, pk) {
    return `${String(tableName || '').trim()}:${JSON.stringify(normalizeSyncPk(pk))}`;
}

export function detectConflict(localMutation, remoteEntity) {
    if (!localMutation || !remoteEntity) return CONFLICT_STATUS.CLEAN;

    const baseVersion = Number(localMutation.base_server_version || 0);
    const remoteVersion = Number(remoteEntity.server_version || 0);
    if (!remoteVersion || remoteVersion <= baseVersion) return CONFLICT_STATUS.CLEAN;
    if (remoteEntity.deleted_at || remoteEntity.operation === 'delete') {
        return CONFLICT_STATUS.DELETED_REMOTELY;
    }
    return CONFLICT_STATUS.CONFLICT;
}

export function chooseMediaUrl(asset, options = {}) {
    if (!asset) return '';
    const preferOffline = options.offline === true || options.preferOffline === true;
    const offlinePath = asset.offline_url || asset.offline_path || '';
    const originalPath = asset.original_url || asset.original_path || '';

    if (preferOffline && offlinePath) return offlinePath;
    if (originalPath) return originalPath;
    return offlinePath;
}

export function mediaAssetChanged(localAsset, remoteAsset) {
    if (!remoteAsset) return false;
    if (!localAsset) return true;

    const localHash = localAsset.content_hash || localAsset.hash || '';
    const remoteHash = remoteAsset.content_hash || remoteAsset.hash || '';
    if (localHash && remoteHash) return localHash !== remoteHash;

    const localUpdated = Date.parse(localAsset.updated_at || '');
    const remoteUpdated = Date.parse(remoteAsset.updated_at || '');
    if (Number.isFinite(localUpdated) && Number.isFinite(remoteUpdated)) {
        return remoteUpdated > localUpdated;
    }

    return false;
}

export function shouldDownloadAsset(localAsset, remoteAsset, options = {}) {
    if (!remoteAsset || remoteAsset.deleted_at) return false;
    if (remoteAsset.media_type === 'audio' && options.explicitAudioPack !== true) return false;
    return mediaAssetChanged(localAsset, remoteAsset);
}

export function buildMutation({ tableName, pk, operation, payload, baseServerVersion, clientMutationId }) {
    if (!tableName) throw new Error('tableName is required');
    if (!operation || !['insert', 'update', 'delete'].includes(operation)) {
        throw new Error('operation must be insert, update, or delete');
    }

    return {
        client_mutation_id: clientMutationId || crypto.randomUUID(),
        table_name: tableName,
        pk: normalizeSyncPk(pk),
        operation,
        base_server_version: baseServerVersion ?? null,
        payload: payload || {},
    };
}
