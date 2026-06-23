import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { Client } = pg;

const DEFAULT_ASSET_ROOT = 'assets/supabase_storage';
const IMAGE_BUCKETS = new Set(['yoga-cards', 'light-on-yoga-plates']);
const AUDIO_BUCKETS = new Set(['audio-assets']);

export function classifyOfflineObject(path) {
    return /(^|\/)(offline|variants|mobile)(\/|$)|[-_.](offline|mobile)\./i.test(path);
}

export function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    for (const unit of units) {
        if (size < 1024 || unit === 'GB') return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
        size /= 1024;
    }
    return `${value} B`;
}

function listLocalFiles(root) {
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = join(root, entry.name);
        if (entry.isDirectory()) return listLocalFiles(fullPath);
        return entry.isFile() ? [fullPath] : [];
    });
}

function addObjectTotals(totals, bucket, name, size) {
    const isImage = IMAGE_BUCKETS.has(bucket);
    const isAudio = AUDIO_BUCKETS.has(bucket);
    const isOffline = classifyOfflineObject(name);

    if (isImage) {
        totals.fullImageBytes += size;
        if (isOffline) totals.offlineImageBytes += size;
    }
    if (isAudio) {
        totals.fullAudioBytes += size;
        if (isOffline) totals.offlineAudioBytes += size;
    }
}

async function databaseSizeBytes() {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || localDbUrl();
    if (!connectionString) return null;

    const client = new Client({ connectionString });
    await client.connect();
    try {
        const result = await client.query('select pg_database_size(current_database())::bigint as bytes');
        return Number(result.rows[0]?.bytes || 0);
    } finally {
        await client.end();
    }
}

function localDbUrl() {
    try {
        const output = execSync('npx supabase status -o env', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const env = Object.fromEntries(
            output
                .split(/\r?\n/)
                .map((line) => line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/))
                .filter(Boolean)
                .map((match) => [match[1], match[2]]),
        );
        return env.DB_URL || '';
    } catch {
        return '';
    }
}

async function listBucketObjects(supabase, bucket, prefix = '') {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;

    const out = [];
    for (const item of data || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
            out.push(...await listBucketObjects(supabase, bucket, path));
        } else {
            out.push({ bucket, name: path, size: Number(item.metadata?.size || 0) });
        }
    }
    return out;
}

async function storageTotalsFromSupabase() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const totals = emptyTotals();
    for (const bucket of [...IMAGE_BUCKETS, ...AUDIO_BUCKETS]) {
        try {
            const objects = await listBucketObjects(supabase, bucket);
            for (const object of objects) addObjectTotals(totals, object.bucket, object.name, object.size);
        } catch (error) {
            console.warn(`[storage] Could not inspect ${bucket}: ${error.message}`);
        }
    }
    return totals;
}

function storageTotalsFromLocalAssets(assetRoot = DEFAULT_ASSET_ROOT) {
    const totals = emptyTotals();
    for (const bucket of [...IMAGE_BUCKETS, ...AUDIO_BUCKETS]) {
        const bucketRoot = join(assetRoot, bucket);
        for (const file of listLocalFiles(bucketRoot)) {
            const name = file.slice(bucketRoot.length + 1).replace(/\\/g, '/');
            addObjectTotals(totals, bucket, name, statSync(file).size);
        }
    }
    return totals;
}

function emptyTotals() {
    return {
        offlineImageBytes: 0,
        fullImageBytes: 0,
        offlineAudioBytes: 0,
        fullAudioBytes: 0,
    };
}

export async function buildOfflineSizeReport() {
    const dbBytes = await databaseSizeBytes().catch((error) => {
        console.warn(`[database] Could not calculate database size: ${error.message}`);
        return null;
    });
    const storageTotals = await storageTotalsFromSupabase() || storageTotalsFromLocalAssets();

    return {
        databaseBytes: dbBytes,
        ...storageTotals,
    };
}

function printReport(report) {
    console.log('Offline size report');
    console.log(`database size: ${report.databaseBytes === null ? 'unavailable' : formatBytes(report.databaseBytes)}`);
    console.log(`offline image total size: ${formatBytes(report.offlineImageBytes)}`);
    console.log(`full image total size: ${formatBytes(report.fullImageBytes)}`);
    console.log(`offline audio total size: ${formatBytes(report.offlineAudioBytes)}`);
    console.log(`full audio total size: ${formatBytes(report.fullAudioBytes)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    printReport(await buildOfflineSizeReport());
}
