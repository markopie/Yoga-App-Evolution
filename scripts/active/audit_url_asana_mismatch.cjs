/**
 * audit_url_asana_mismatch.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds every `stages` row where the asana_id embedded in the filename
 * of `image_url` or `audio_url` does NOT match the row's actual `asana_id`.
 *
 * Filename convention in your storage:  {asana_id}_{stage_db_id}_{desc}.ext
 *   e.g.  177_29_SupportedonChair.mp3   → embedded asana = 177, embedded stage = 29
 *
 * A mismatch means the file was originally created for a DIFFERENT asana/stage
 * and was later re-used (copy-pasted) for this row.
 *
 * Output: a clean table of every mismatch, plus a recommendation.
 *
 * Usage:
 *   node scripts/audit_url_asana_mismatch.cjs [--verbose]
 *
 * Flags:
 *   --verbose   Also print the rows where the URL matches (for full audit trail)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const VERBOSE = process.argv.includes('--verbose');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the bare filename from a Supabase Storage URL.
 * Handles the double-slash quirk: /audio-assets//filename.mp3
 */
function filenameFromUrl(url) {
    if (!url) return null;
    try {
        // Grab everything after the last '/' (ignoring trailing slashes)
        const parts = url.split('/').filter(p => p.length > 0);
        return parts[parts.length - 1] || null;
    } catch {
        return null;
    }
}

/**
 * Parse the leading `asana_id` from a filename like:
 *   177_29_SupportedonChair.mp3   → "177"
 *   062_013_trianga_...webp        → "062"
 *   asana_047_stage_I.webp         → null  (canonical format, no embedded id)
 *
 * Returns the raw leading numeric string (may have leading zeros or not).
 */
function embeddedAsanaFromFilename(filename) {
    if (!filename) return null;
    // Skip already-canonical names (asana_XXX_stage_YYY.ext)
    if (/^asana_\d+_stage_/i.test(filename)) return null;
    // Match leading digits before first underscore
    const m = filename.match(/^(\d+)_/);
    return m ? m[1] : null;
}

/**
 * Normalise an asana id to a zero-padded 3-char string for comparison.
 * "16" → "016",  "177" → "177"
 */
function normaliseId(idStr) {
    if (!idStr) return null;
    return String(parseInt(idStr, 10) || 0).padStart(3, '0');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {


    // Fetch all stages with enough columns to cross-reference
    const { data: stages, error } = await supabase
        .from('stages')
        .select('id, asana_id, stage_name, title, image_url, audio_url')
        .order('asana_id', { ascending: true });

    if (error) throw new Error(`Failed to fetch stages: ${error.message}`);


    const imageMismatches = [];
    const audioMismatches = [];

    // Track cases where it's the SAME file re-used across multiple rows
    const imageUrlIndex = {};  // url → [stage_ids]
    const audioUrlIndex = {};

    for (const s of stages) {
        const actualId = normaliseId(String(s.asana_id));

        // ── Build URL-to-row index for duplicate detection ─────────────────
        if (s.image_url) {
            if (!imageUrlIndex[s.image_url]) imageUrlIndex[s.image_url] = [];
            imageUrlIndex[s.image_url].push(s.id);
        }
        if (s.audio_url) {
            if (!audioUrlIndex[s.audio_url]) audioUrlIndex[s.audio_url] = [];
            audioUrlIndex[s.audio_url].push(s.id);
        }

        // ── Image URL check ───────────────────────────────────────────────
        const imgFile    = filenameFromUrl(s.image_url);
        const imgEmbedId = embeddedAsanaFromFilename(imgFile);
        const imgNormId  = normaliseId(imgEmbedId);

        if (imgEmbedId !== null) {
            const isMatch = imgNormId === actualId;
            if (!isMatch) {
                imageMismatches.push({
                    stageId:    s.id,
                    actualAId:  actualId,
                    stageName:  s.stage_name,
                    title:      s.title || '',
                    embeddedId: imgNormId,
                    filename:   imgFile,
                    url:        s.image_url,
                });
            } else if (VERBOSE) {
: ${imgFile}`);
            }
        }

        // ── Audio URL check ───────────────────────────────────────────────
        const audFile    = filenameFromUrl(s.audio_url);
        const audEmbedId = embeddedAsanaFromFilename(audFile);
        const audNormId  = normaliseId(audEmbedId);

        if (audEmbedId !== null) {
            const isMatch = audNormId === actualId;
            if (!isMatch) {
                audioMismatches.push({
                    stageId:    s.id,
                    actualAId:  actualId,
                    stageName:  s.stage_name,
                    title:      s.title || '',
                    embeddedId: audNormId,
                    filename:   audFile,
                    url:        s.audio_url,
                });
            } else if (VERBOSE) {
: ${audFile}`);
            }
        }
    }

    // ── Print Image Mismatches ────────────────────────────────────────────────
    if (imageMismatches.length === 0) {

    } else {
\n`);
        console.log('  Stage ID  │ Actual AsanaID │ Embedded AsanaID │ Stage Name     │ Filename');
        console.log('  ──────────┼────────────────┼──────────────────┼────────────────┼──────────────────────────────────────');
        imageMismatches.forEach(r => {
            const shared = imageUrlIndex[r.url]?.length > 1
                ? ` ⚠️  [SHARED by ${imageUrlIndex[r.url].length} rows: ${imageUrlIndex[r.url].join(', ')}]`
                : '';
            console.log(
                `  ${String(r.stageId).padEnd(9)} │ ${r.actualAId.padEnd(14)} │ ${r.embeddedId.padEnd(16)} │ ${String(r.stageName||'').padEnd(14)} │ ${r.filename}${shared}`
            );
        });
        console.log();
    }

    // ── Print Audio Mismatches ────────────────────────────────────────────────
    if (audioMismatches.length === 0) {

    } else {
\n`);
        console.log('  Stage ID  │ Actual AsanaID │ Embedded AsanaID │ Stage Name     │ Filename');
        console.log('  ──────────┼────────────────┼──────────────────┼────────────────┼──────────────────────────────────────');
        audioMismatches.forEach(r => {
            const shared = audioUrlIndex[r.url]?.length > 1
                ? ` ⚠️  [SHARED by ${audioUrlIndex[r.url].length} rows: ${audioUrlIndex[r.url].join(', ')}]`
                : '';
            console.log(
                `  ${String(r.stageId).padEnd(9)} │ ${r.actualAId.padEnd(14)} │ ${r.embeddedId.padEnd(16)} │ ${String(r.stageName||'').padEnd(14)} │ ${r.filename}${shared}`
            );
        });
        console.log();
    }

    // ── Shared URL detection (same file referenced by multiple rows) ──────────
    const sharedImages = Object.entries(imageUrlIndex).filter(([, ids]) => ids.length > 1);
    const sharedAudios = Object.entries(audioUrlIndex).filter(([, ids]) => ids.length > 1);

    if (sharedImages.length > 0) {
\n`);
        sharedImages.forEach(([url, ids]) => {
            const fname = filenameFromUrl(url);
            console.log(`  File: ${fname}`);
            console.log(`    Used by stage IDs: ${ids.join(', ')}`);
            console.log(`    URL: ${url}\n`);
        });
    } else {

    }

    if (sharedAudios.length > 0) {
\n`);
        sharedAudios.forEach(([url, ids]) => {
            const fname = filenameFromUrl(url);
            console.log(`  File: ${fname}`);
            console.log(`    Used by stage IDs: ${ids.join(', ')}`);
            console.log(`    URL: ${url}\n`);
        });
    } else {

    }

    // ── Summary + Recommendation ──────────────────────────────────────────────
    const totalIssues = imageMismatches.length + audioMismatches.length + sharedImages.length + sharedAudios.length;

    console.log('─────────────────────────────────────────────────────────');

    console.log(`   Image ID mismatches : ${imageMismatches.length}`);
    console.log(`   Audio ID mismatches : ${audioMismatches.length}`);
    console.log(`   Shared image files  : ${sharedImages.length}`);
    console.log(`   Shared audio files  : ${sharedAudios.length}`);
    console.log(`   Total issues        : ${totalIssues}`);
    console.log('─────────────────────────────────────────────────────────\n');

    // Emit JSON sidecar for further scripting
    const report = {
        generatedAt: new Date().toISOString(),
        imageMismatches,
        audioMismatches,
        sharedImageUrls: sharedImages.map(([url, ids]) => ({ url, stageIds: ids })),
        sharedAudioUrls: sharedAudios.map(([url, ids]) => ({ url, stageIds: ids })),
    };
    const reportPath = path.resolve(__dirname, 'url_mismatch_report.json');
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

}

main().catch(e => {
    console.error('❌  Unhandled error:', e.message);
    process.exit(1);
});
