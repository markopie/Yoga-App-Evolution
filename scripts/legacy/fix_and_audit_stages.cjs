/**
 * fix_and_audit_stages.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Does TWO jobs in one run:
 *
 * JOB 1 — Fix shared/borrowed URLs (cascade risk)
 *   Copies each borrowed audio file to a NEW private copy that follows the
 *   EXISTING naming convention:  {actual_asana_id}_{stage_db_id}_{Description}.ext
 *   Updates only the "borrower" stage row — the original owner is untouched.
 *
 * JOB 2 — Missing media audit
 *   Reports every stage row that has NULL / empty image_url or audio_url.
 *
 * Usage:
 *   node scripts/fix_and_audit_stages.cjs [--dry-run]
 *
 * Flags:
 *   --dry-run   Show what would happen without making any changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DRY_RUN     = process.argv.includes('--dry-run');
const IMAGE_BUCKET = 'yoga-cards';
const AUDIO_BUCKET = 'audio-assets';

// ── The 4 "borrower" stages identified by the audit ──────────────────────────
// Format: { stageId, actualAsanaId, bucket, srcUrl, description }
// We derive the new filename from the existing convention:
//   {actual_asana_id}_{stage_db_id}_{same description from source}.ext

const FIXES = [
    // Stage 168 — IMAGE: using asana 003's master image, but belongs to asana 004
    {
        type:       'image',
        stageId:    168,
        actualAId:  '004',
        bucket:     IMAGE_BUCKET,
        srcPath:    '003_master_utthita_trikonasana.webp',
        // Keep the description from the original, swap the prefix
        newFilename: '004_168_TrikonasanaStageI_WallBrick.webp',
        field:      'image_url',
    },
    // Stage 168 — AUDIO: using asana 074's "NearWallSupport", but belongs to asana 004
    {
        type:       'audio',
        stageId:    168,
        actualAId:  '004',
        bucket:     AUDIO_BUCKET,
        srcPath:    '074_20_NearWallSupport.mp3',
        newFilename: '004_168_NearWallSupport.mp3',
        field:      'audio_url',
    },
    // Stage 169 — AUDIO: using asana 177's "SupportedonChair", but belongs to asana 016
    {
        type:       'audio',
        stageId:    169,
        actualAId:  '016',
        bucket:     AUDIO_BUCKET,
        srcPath:    '177_29_SupportedonChair.mp3',
        newFilename: '016_169_SupportedonChair.mp3',
        field:      'audio_url',
    },
    // Stage 167 — AUDIO: using asana 062's "HeadSupportedonBolster", but belongs to asana 033
    {
        type:       'audio',
        stageId:    167,
        actualAId:  '033',
        bucket:     AUDIO_BUCKET,
        srcPath:    '062_14_HeadSupportedonBolster.mp3',
        newFilename: '033_167_HeadSupportedonBolster.mp3',
        field:      'audio_url',
    },
    // Stage 166 — AUDIO: using asana 062's "SeatedonBlanket", but belongs to asana 067
    {
        type:       'audio',
        stageId:    166,
        actualAId:  '067',
        bucket:     AUDIO_BUCKET,
        srcPath:    '062_13_SeatedonBlanket.mp3',
        newFilename: '067_166_SeatedonBlanket.mp3',
        field:      'audio_url',
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function publicUrl(bucketName, storagePath) {
    const { data } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
}

async function copyFile(bucket, srcPath, destPath) {
    // Download
    const { data: blob, error: dlErr } = await supabase.storage
        .from(bucket)
        .download(srcPath);
    if (dlErr) {
        console.warn(`    ⚠️  Download failed for ${srcPath}: ${dlErr.message}`);
        return null;
    }

    // Upload to new path (upsert = safe to re-run)
    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(destPath, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (upErr) {
        console.warn(`    ⚠️  Upload failed to ${destPath}: ${upErr.message}`);
        return null;
    }

    return publicUrl(bucket, destPath);
}

// ── JOB 1: Fix shared/borrowed URLs ──────────────────────────────────────────
async function fixSharedUrls() {
    console.log('\n─────────────────────────────────────────────────────────');

    console.log(`        Dry run: ${DRY_RUN ? 'YES (no changes)' : 'NO (applying changes)'}`);
    console.log('─────────────────────────────────────────────────────────\n');

    let fixed = 0, failed = 0;

    for (const fix of FIXES) {
        const emoji = fix.type === 'image' ? '🖼 ' : '🔊';
        console.log(`${emoji} Stage ${fix.stageId} (asana ${fix.actualAId})`);
        console.log(`   src  : ${fix.bucket}/${fix.srcPath}`);
        console.log(`   dest : ${fix.bucket}/${fix.newFilename}`);

        if (DRY_RUN) {

            fixed++;
            continue;
        }

        const newUrl = await copyFile(fix.bucket, fix.srcPath, fix.newFilename);
        if (!newUrl) {

            failed++;
            continue;
        }

        const { error: dbErr } = await supabase
            .from('stages')
            .update({ [fix.field]: newUrl })
            .eq('id', fix.stageId);

        if (dbErr) {

            failed++;
        } else {

            fixed++;
        }
    }

    console.log(`Result: ${fixed} fixed, ${failed} failed.\n`);
}

// ── JOB 2: Missing media audit ────────────────────────────────────────────────
async function auditMissingMedia() {
    console.log('─────────────────────────────────────────────────────────');

    console.log('─────────────────────────────────────────────────────────\n');

    const { data: stages, error } = await supabase
        .from('stages')
        .select('id, asana_id, stage_name, title, image_url, audio_url')
        .order('asana_id', { ascending: true });

    if (error) throw new Error(`Failed to fetch stages: ${error.message}`);

    const missingImage = stages.filter(s => !s.image_url || s.image_url.trim() === '');
    const missingAudio = stages.filter(s => !s.audio_url || s.audio_url.trim() === '');
    const missingBoth  = stages.filter(s =>
        (!s.image_url || s.image_url.trim() === '') &&
        (!s.audio_url || s.audio_url.trim() === '')
    );

    // ── Missing images ──────────────────────────────────────────────────────
    if (missingImage.length === 0) {

    } else {
\n`);
        console.log('  Stage ID │ Asana ID │ Stage   │ Title');
        console.log('  ─────────┼──────────┼─────────┼──────────────────────────────────────');
        missingImage.forEach(s => {
            console.log(
                `  ${String(s.id).padEnd(8)} │ ${String(s.asana_id).padEnd(8)} │ ${String(s.stage_name || '').padEnd(7)} │ ${s.title || '(no title)'}`
            );
        });
        console.log();
    }

    // ── Missing audio ───────────────────────────────────────────────────────
    if (missingAudio.length === 0) {

    } else {
\n`);
        console.log('  Stage ID │ Asana ID │ Stage   │ Title');
        console.log('  ─────────┼──────────┼─────────┼──────────────────────────────────────');
        missingAudio.forEach(s => {
            console.log(
                `  ${String(s.id).padEnd(8)} │ ${String(s.asana_id).padEnd(8)} │ ${String(s.stage_name || '').padEnd(7)} │ ${s.title || '(no title)'}`
            );
        });
        console.log();
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('─────────────────────────────────────────────────────────');
`);
    console.log(`   Missing image_url : ${missingImage.length}`);
    console.log(`   Missing audio_url : ${missingAudio.length}`);
    console.log(`   Missing BOTH      : ${missingBoth.length}`);
    console.log('─────────────────────────────────────────────────────────\n');

    // Save detailed report
    const reportPath = path.resolve(__dirname, 'missing_media_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        totalStages: stages.length,
        missingImage: missingImage.map(s => ({ id: s.id, asana_id: s.asana_id, stage_name: s.stage_name, title: s.title })),
        missingAudio: missingAudio.map(s => ({ id: s.id, asana_id: s.asana_id, stage_name: s.stage_name, title: s.title })),
    }, null, 2));

}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {

    await fixSharedUrls();
    await auditMissingMedia();
}

main().catch(e => {
    console.error('❌  Unhandled error:', e.message);
    process.exit(1);
});
