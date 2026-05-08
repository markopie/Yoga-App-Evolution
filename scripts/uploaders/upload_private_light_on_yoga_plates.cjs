'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const BUCKET = 'light-on-yoga-plates';
const SOURCE_DIR = path.join(ROOT, 'assets', 'light_on_yoga_plates');
const MANIFEST = path.join(SOURCE_DIR, 'manifest.csv');
const DRY_RUN = process.argv.includes('--dry-run');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});

async function main() {
    if (!fs.existsSync(MANIFEST)) throw new Error(`Manifest not found: ${MANIFEST}`);

    await ensurePrivateBucket();

    const rows = readManifest(MANIFEST);
    let uploaded = 0;
    let missing = 0;

    for (const row of rows) {
        const sourcePath = path.join(SOURCE_DIR, row.output_file);
        const targetPath = `plates/${formatPlateLabel(row.plate_label)}.webp`;

        if (!fs.existsSync(sourcePath)) {
            missing += 1;
            console.warn(`missing local file: ${row.output_file}`);
            continue;
        }

        if (DRY_RUN) {
            console.log(`${sourcePath} -> ${BUCKET}/${targetPath}`);
            uploaded += 1;
            continue;
        }

        const { error } = await supabase.storage.from(BUCKET).upload(
            targetPath,
            fs.readFileSync(sourcePath),
            {
                contentType: 'image/webp',
                upsert: true,
            },
        );

        if (error) throw new Error(`Upload failed for ${targetPath}: ${error.message}`);
        uploaded += 1;
        if (uploaded % 50 === 0) console.log(`uploaded ${uploaded}/${rows.length}`);
    }

    console.log(`${DRY_RUN ? 'planned' : 'uploaded'} ${uploaded} private plate images`);
    if (missing) console.log(`missing local files: ${missing}`);
}

async function ensurePrivateBucket() {
    if (DRY_RUN) return;

    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) {
        if (data.public) {
            const { error } = await supabase.storage.updateBucket(BUCKET, { public: false });
            if (error) throw new Error(`Failed to make ${BUCKET} private: ${error.message}`);
        }
        return;
    }

    const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        allowedMimeTypes: ['image/webp'],
        fileSizeLimit: 5242880,
    });
    if (error) throw new Error(`Failed to create ${BUCKET}: ${error.message}`);
}

function readManifest(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
    const headers = splitCsvLine(lines.shift());
    return lines.map((line) => {
        const values = splitCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    });
}

function splitCsvLine(line) {
    const cells = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted && char === '"' && line[i + 1] === '"') {
            cell += '"';
            i += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            cells.push(cell);
            cell = '';
        } else {
            cell += char;
        }
    }

    cells.push(cell);
    return cells;
}

function formatPlateLabel(value) {
    const match = String(value || '').toLowerCase().match(/^0*(\d+)([a-z]?)$/);
    if (!match) throw new Error(`Invalid plate label: ${value}`);
    return `${String(Number.parseInt(match[1], 10)).padStart(3, '0')}${match[2] || ''}`;
}
