import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const HOSTED_PUBLIC_PREFIX = 'https://qrcpiyncvfmpmeuyhsha.supabase.co/storage/v1/object/public/';
const ASSET_ROOT = 'assets/supabase_storage';
const SEED_PATH = 'supabase/seed.local.sql';
const PLATE_SOURCE_DIR = 'assets/light_on_yoga_plates';

const args = new Set(process.argv.slice(2));
const shouldDownload = args.has('--download') || args.has('--all') || args.size === 0;
const shouldUpload = args.has('--upload') || args.has('--all') || args.size === 0;

function localSupabaseEnv() {
    const output = execFileSync('cmd.exe', ['/c', 'npx.cmd', 'supabase', 'status', '-o', 'env'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return Object.fromEntries(
        output
            .split(/\r?\n/)
            .map((line) => line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/))
            .filter(Boolean)
            .map((match) => [match[1], match[2]]),
    );
}

function publicSeedObjects() {
    const seed = readFileSync(SEED_PATH, 'utf8');
    const matches = [
        ...seed.matchAll(/(?:https:\/\/qrcpiyncvfmpmeuyhsha\.supabase\.co)?\/storage\/v1\/object\/public\/([^'\s)]+)/g),
    ];
    const out = new Map();
    for (const match of matches) {
        const [bucket, ...pathParts] = match[1].split('/');
        const objectPath = pathParts.join('/').replace(/^\/+/, '');
        if (!bucket || !objectPath) continue;
        out.set(`${bucket}/${objectPath}`, { bucket, objectPath });
    }
    return [...out.values()].sort((a, b) => `${a.bucket}/${a.objectPath}`.localeCompare(`${b.bucket}/${b.objectPath}`));
}

async function downloadPublicObjects(objects) {
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, object] of objects.entries()) {
        const destination = join(ASSET_ROOT, object.bucket, object.objectPath);
        if (existsSync(destination)) {
            skipped += 1;
            if ((index + 1) % 50 === 0) console.log(`[download] checked=${index + 1}/${objects.length}`);
            continue;
        }

        mkdirSync(join(ASSET_ROOT, object.bucket), { recursive: true });
        const url = `${HOSTED_PUBLIC_PREFIX}${object.bucket}/${object.objectPath}`;
        const response = await fetch(url);
        if (!response.ok) {
            failed += 1;
            console.warn(`[download] ${response.status} ${url}`);
            continue;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        mkdirSync(destination.slice(0, -basename(destination).length), { recursive: true });
        await import('node:fs/promises').then(({ writeFile }) => writeFile(destination, bytes));
        downloaded += 1;
        if ((index + 1) % 50 === 0) console.log(`[download] checked=${index + 1}/${objects.length}`);
    }

    console.log(`[download] downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
    if (failed > 0) process.exitCode = 1;
}

function contentTypeFor(path) {
    const ext = extname(path).toLowerCase();
    if (ext === '.webp') return 'image/webp';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.wav') return 'audio/wav';
    if (ext === '.ogg') return 'audio/ogg';
    if (ext === '.m4a') return 'audio/mp4';
    return 'application/octet-stream';
}

async function uploadFile(supabase, bucket, sourcePath, objectPath) {
    const { error } = await supabase.storage
        .from(bucket)
        .upload(objectPath.replace(/\\/g, '/'), readFileSync(sourcePath), {
            cacheControl: '3600',
            contentType: contentTypeFor(sourcePath),
            upsert: true,
        });
    if (error) throw error;
}

function listFiles(root) {
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = join(root, entry.name);
        if (entry.isDirectory()) return listFiles(fullPath);
        return entry.isFile() ? [fullPath] : [];
    });
}

function plateObjectPath(fileName) {
    const match = fileName.match(/^plate_(\d{3}[a-z]?)__/i);
    return match ? `plates/${match[1].toLowerCase()}.webp` : '';
}

async function uploadLocalAssets() {
    const env = localSupabaseEnv();
    const url = env.API_URL;
    const serviceRoleKey = env.SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
        throw new Error('Could not read local Supabase API_URL and SERVICE_ROLE_KEY from `npx supabase status -o env`.');
    }

    const supabase = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const uploads = [];
    for (const bucket of ['yoga-cards', 'audio-assets']) {
        for (const file of listFiles(join(ASSET_ROOT, bucket))) {
            const objectPath = file.slice(join(ASSET_ROOT, bucket).length + 1).replace(/\\/g, '/');
            uploads.push({ bucket, sourcePath: file, objectPath });
        }
    }

    for (const file of listFiles(PLATE_SOURCE_DIR)) {
        if (extname(file).toLowerCase() !== '.webp') continue;
        const objectPath = plateObjectPath(basename(file));
        if (objectPath) uploads.push({ bucket: 'light-on-yoga-plates', sourcePath: file, objectPath });
    }

    let uploaded = 0;
    for (const item of uploads) {
        await uploadFile(supabase, item.bucket, item.sourcePath, item.objectPath);
        uploaded += 1;
        if (uploaded % 100 === 0) console.log(`[upload] ${uploaded}/${uploads.length}`);
    }

    const bytes = uploads.reduce((sum, item) => sum + statSync(item.sourcePath).size, 0);
    console.log(`[upload] uploaded=${uploaded} bytes=${bytes}`);
}

const objects = publicSeedObjects();
console.log(`[seed] public storage objects=${objects.length}`);

if (shouldDownload) await downloadPublicObjects(objects);
if (shouldUpload) await uploadLocalAssets();
