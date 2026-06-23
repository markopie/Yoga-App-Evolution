'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const DEFAULT_PDF = process.env.LIGHT_ON_YOGA_PLATES_PDF || '';
const DEFAULT_OUT = path.join(ROOT, 'assets', 'light_on_yoga_plates');
const DEFAULT_MANIFEST = path.join(DEFAULT_OUT, 'manifest.csv');
const PAGE_COUNT_FALLBACK = 610;

const args = parseArgs(process.argv.slice(2));
const selectedPdf = args.pdf || DEFAULT_PDF;
if (!selectedPdf) fail('Missing PDF path. Pass --pdf or set LIGHT_ON_YOGA_PLATES_PDF.');
const pdfPath = path.resolve(selectedPdf);
const outDir = path.resolve(args.out || DEFAULT_OUT);
const manifestPath = path.resolve(args.manifest || DEFAULT_MANIFEST);
const startPage = parsePositiveInt(args.start || '1', 'start');
const endPage = parsePositiveInt(args.end || String(PAGE_COUNT_FALLBACK), 'end');
const mapName = args.map || null;
const offsetFrom = args['offset-from'] ? parsePositiveInt(args['offset-from'], 'offset-from') : null;
const sourcePageOffset = Number.parseInt(String(args['source-page-offset'] || '0'), 10);
const sourcePageOverrides = parseSourcePageOverrides(args['source-page']);
const skippedPlates = parseNumberSet(args['skip-plates'], 'skip-plates');
const quality = parsePositiveInt(args.quality || '82', 'quality');
const width = parsePositiveInt(args.width || '1200', 'width');
const overwrite = Boolean(args.overwrite);
const dryRun = Boolean(args['dry-run']);

if (startPage > endPage) fail('--start must be less than or equal to --end');
if (!Number.isInteger(sourcePageOffset)) fail('--source-page-offset must be an integer');
if (!fs.existsSync(pdfPath)) fail(`PDF not found: ${pdfPath}`);

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});

async function main() {
    const asanas = await fetchAsanas();
    const plateIndex = buildPlateIndex(asanas);
    const rows = [];

    fs.mkdirSync(outDir, { recursive: true });

    for (let page = startPage; page <= endPage; page += 1) {
        const mapped = mapPlateFromSourcePage(page, mapName);
        if (!mapped) {
            console.warn(`skipping source page ${page}: no plate mapping`);
            continue;
        }

        const sourcePage = mapped.sourcePage || sourcePageOverrides.get(page) || page + (offsetFrom && page >= offsetFrom ? sourcePageOffset : 0);
        const plateLabel = mapped.plateLabel || String(page);
        if (skippedPlates.has(parsePlateLabel(plateLabel).number)) {
            console.warn(`skipping plate ${plateLabel}: requested by --skip-plates`);
            continue;
        }

        if (sourcePage < 1 || sourcePage > PAGE_COUNT_FALLBACK) {
            console.warn(`skipping plate ${plateLabel}: source PDF page ${sourcePage} is outside 1-${PAGE_COUNT_FALLBACK}`);
            continue;
        }

        const exactMatches = plateIndex.get(plateLabel.toLowerCase()) || [];
        const numericMatches = plateIndex.get(String(parsePlateLabel(plateLabel).number)) || [];
        const matches = exactMatches.length ? exactMatches : numericMatches;
        const best = matches[0] || null;
        const plate = formatPlateLabel(plateLabel);
        const id = best ? normalizeId(best.id) : 'unknown';
        const slug = best ? slugify(best.iast || best.name || best.english_name || `plate-${plate}`) : `plate-${plate}`;
        const filename = `plate_${plate}__id_${id}__${slug}.webp`;
        const outputPath = path.join(outDir, filename);
        const status = getStatus({ best, plateLabel, exactMatches, sourcePage });

        rows.push({
            source_page: sourcePage,
            plate_label: plateLabel,
            asana_id: best ? normalizeId(best.id) : '',
            iast: best?.iast || '',
            name: best?.name || '',
            english_name: best?.english_name || '',
            plate_numbers: best?.plate_numbers || '',
            output_file: filename,
            status,
            match_count: matches.length,
            extra_matches: matches.slice(1).map((asana) => `${normalizeId(asana.id)}:${asana.iast || asana.name || ''}`).join('|'),
        });

        if (dryRun) continue;
        if (fs.existsSync(outputPath) && !overwrite) continue;

        const inputPage = `${pdfPath}[${sourcePage - 1}]`;
        const magickArgs = [
            inputPage,
            '-fuzz', '5%',
            '-trim',
            '+repage',
            '-resize', `${width}x`,
            '-quality', String(quality),
            outputPath,
        ];
        const result = spawnSync('magick', magickArgs, { encoding: 'utf8' });
        if (result.status !== 0) {
            const stderr = (result.stderr || '').trim();
            fail(`ImageMagick failed on source page ${sourcePage} / plate ${plateLabel}: ${stderr || 'unknown error'}`);
        }

        if (page % 25 === 0 || page === endPage) {
            console.log(`processed page ${page}/${endPage}`);
        }
    }

    writeCsv(manifestPath, rows);
    console.log(`${dryRun ? 'planned' : 'extracted'} ${rows.length} pages`);
    console.log(`images: ${outDir}`);
    console.log(`manifest: ${manifestPath}`);
}

async function fetchAsanas() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
    const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !key) fail('Missing SUPABASE_URL and Supabase key in .env');

    const supabase = createClient(SUPABASE_URL, key);
    const { data, error } = await supabase
        .from('asanas')
        .select('id,iast,name,english_name,plate_numbers,page_primary,image_url')
        .order('id', { ascending: true });

    if (error) fail(`Failed to fetch asanas: ${error.message}`);
    return data || [];
}

function buildPlateIndex(asanas) {
    const index = new Map();
    for (const asana of asanas) {
        for (const plate of extractPlateLabels(asana.plate_numbers)) {
            if (!index.has(plate)) index.set(plate, []);
            index.get(plate).push(asana);
        }
    }
    return index;
}

function extractPlateLabels(value) {
    if (!value) return [];
    const out = new Set();
    const matches = String(value).match(/\d+[a-z]?/gi) || [];
    for (const match of matches) {
        const label = match.toLowerCase();
        if (Number.parseInt(label, 10) > 0) out.add(label);
    }
    return [...out].sort(comparePlateLabels);
}

function mapPlateFromSourcePage(sourcePage, selectedMap) {
    if (!selectedMap) return { sourcePage, plateLabel: String(sourcePage) };
    if (selectedMap !== 'loy-repaired-20260508') fail(`Unknown --map: ${selectedMap}`);

    if (sourcePage <= 424) return { sourcePage, plateLabel: String(sourcePage) };
    if (sourcePage === 425) return { sourcePage, plateLabel: '424a' };
    if (sourcePage === 426) return { sourcePage, plateLabel: '425' };
    if (sourcePage === 427) return { sourcePage, plateLabel: '425a' };
    if (sourcePage <= 473) return { sourcePage, plateLabel: String(sourcePage - 2) };
    if (sourcePage === 474) return { sourcePage, plateLabel: '471a' };
    if (sourcePage === 475) return { sourcePage, plateLabel: '471b' };
    if (sourcePage === 476) return { sourcePage, plateLabel: '472' };
    if (sourcePage <= 480) return { sourcePage, plateLabel: String(sourcePage - 4) };
    if (sourcePage === 481) return { sourcePage, plateLabel: '476a' };
    if (sourcePage <= 596) return { sourcePage, plateLabel: String(sourcePage - 5) };
    if (sourcePage === 597) return { sourcePage, plateLabel: '591a' };
    return { sourcePage, plateLabel: String(sourcePage - 6) };
}

function getStatus({ best, plateLabel, exactMatches, sourcePage }) {
    if (!best) return 'manual_review_needed';
    const parsed = parsePlateLabel(plateLabel);
    if (parsed.suffix && exactMatches.length === 0) return 'alpha_plate_numeric_db_match_review';
    if (sourcePage === parsed.number && !parsed.suffix) return 'page_plate_direct_db_match';
    return 'db_plate_match_review_page_offset';
}

function formatPlateLabel(value) {
    const parsed = parsePlateLabel(value);
    return `${String(parsed.number).padStart(3, '0')}${parsed.suffix}`;
}

function parsePlateLabel(value) {
    const match = String(value).toLowerCase().match(/^(\d+)([a-z]?)$/);
    if (!match) fail(`Invalid plate label: ${value}`);
    return { number: Number.parseInt(match[1], 10), suffix: match[2] || '' };
}

function comparePlateLabels(a, b) {
    const left = parsePlateLabel(a);
    const right = parsePlateLabel(b);
    if (left.number !== right.number) return left.number - right.number;
    return left.suffix.localeCompare(right.suffix);
}

function normalizeId(value) {
    const n = Number.parseInt(String(value), 10);
    return Number.isInteger(n) ? String(n).padStart(3, '0') : String(value || '').trim();
}

function slugify(value) {
    return String(value)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'unnamed';
}

function writeCsv(filePath, rows) {
    const headers = [
        'source_page',
        'plate_label',
        'asana_id',
        'iast',
        'name',
        'english_name',
        'plate_numbers',
        'output_file',
        'status',
        'match_count',
        'extra_matches',
    ];
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((header) => csvCell(row[header])).join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseArgs(argv) {
    const parsed = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            parsed[key] = true;
        } else {
            parsed[key] = next;
            i += 1;
        }
    }
    return parsed;
}

function parseSourcePageOverrides(value) {
    const overrides = new Map();
    if (!value) return overrides;

    const pairs = Array.isArray(value) ? value : [value];
    for (const item of pairs) {
        for (const pair of String(item).split(',')) {
            if (!pair.trim()) continue;
            const [plateRaw, sourceRaw] = pair.split('=');
            const plate = Number.parseInt(plateRaw, 10);
            const source = Number.parseInt(sourceRaw, 10);
            if (!Number.isInteger(plate) || !Number.isInteger(source) || plate < 1 || source < 1) {
                fail(`Invalid --source-page override: ${pair}`);
            }
            overrides.set(plate, source);
        }
    }
    return overrides;
}

function parseNumberSet(value, label) {
    const set = new Set();
    if (!value) return set;

    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
        for (const raw of String(item).split(',')) {
            if (!raw.trim()) continue;
            const n = Number.parseInt(raw, 10);
            if (!Number.isInteger(n) || n < 1) fail(`Invalid --${label} value: ${raw}`);
            set.add(n);
        }
    }
    return set;
}

function parsePositiveInt(value, label) {
    const n = Number.parseInt(String(value), 10);
    if (!Number.isInteger(n) || n < 1) fail(`--${label} must be a positive integer`);
    return n;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
