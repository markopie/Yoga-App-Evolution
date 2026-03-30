/**
 * ensure_stage_storage_urls.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Maintenance script: Ensures every `stages` row has a UNIQUE file path in
 * Supabase Storage following the naming convention:
 *
 *   asana_{asana_id}_stage_{stage_name}.jpg   (image)
 *   asana_{asana_id}_stage_{stage_name}.mp3   (audio)
 *
 * If a stage re-uses the base asana image/audio URL it copies the file to the
 * unique path so that every DB row has a 1-to-1 relationship with a Storage file,
 * protecting against "Broken Link Cascade" (where deleting one base file would
 * silently break many stages).
 *
 * Usage:
 *   node scripts/ensure_stage_storage_urls.cjs [--dry-run] [--bucket images|audio]
 *
 * Flags:
 *   --dry-run   Print what would happen without making any changes.
 *   --bucket    Restrict to only 'images' or only 'audio' (default: both).
 *
 * Requirements:
 *   npm install @supabase/supabase-js dotenv
 *   .env must contain SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const BUCKET_FILTER = args.includes('--bucket') ? args[args.indexOf('--bucket') + 1] : 'both';

// ── Env ───────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

// Use Service Role key so we can read + write Storage
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Bucket names — must match your actual Supabase Storage buckets ───────────
const IMAGE_BUCKET = 'yoga-cards';    // ← where stage images are stored
const AUDIO_BUCKET = 'audio-assets';  // ← where stage audio is stored
const IMAGE_EXT    = '.webp';         // ← extension used in yoga-cards
const AUDIO_EXT    = '.mp3';          // ← extension used in audio-assets

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive the canonical storage path for a stage.
 * E.g.  asana_047_stage_I.jpg
 */
function canonicalImagePath(asanaId, stageName) {
    const safeAsana = String(asanaId).replace(/[^a-zA-Z0-9]/g, '').padStart(3, '0');
    const safeStage = String(stageName).replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    return `asana_${safeAsana}_stage_${safeStage}${IMAGE_EXT}`;
}

function canonicalAudioPath(asanaId, stageName) {
    const safeAsana = String(asanaId).replace(/[^a-zA-Z0-9]/g, '').padStart(3, '0');
    const safeStage = String(stageName).replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    return `asana_${safeAsana}_stage_${safeStage}${AUDIO_EXT}`;
}

/**
 * Extract just the storage path from a full Supabase public URL.
 * e.g. https://<project>.supabase.co/storage/v1/object/public/yoga-images/001/main.jpg
 *      → 001/main.jpg
 */
function storagePathFromUrl(url, bucketName) {
    if (!url) return null;
    try {
        // Handle both single and double slashes after bucket name
        // e.g. /object/public/audio-assets//file.mp3  (double slash is a known Supabase quirk)
        const marker = `/object/public/${bucketName}/`;
        let idx = url.indexOf(marker);
        if (idx === -1) return null;
        let path = decodeURIComponent(url.slice(idx + marker.length));
        // Strip any leading slashes that sneak through (double-slash case)
        path = path.replace(/^\/+/, '');
        return path || null;
    } catch {
        return null;
    }
}

/**
 * Build the public URL for a given storage path.
 */
function publicUrl(bucketName, storagePath) {
    const { data } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
}

/**
 * Copy a file within Storage (download → upload to new path).
 * Returns the new public URL on success, null on failure.
 */
async function copyStorageFile(bucketName, srcPath, destPath) {
    // 1. Download source
    const { data: blob, error: dlErr } = await supabase.storage
        .from(bucketName)
        .download(srcPath);
    if (dlErr) {
        console.warn(`    ⚠️  Could not download ${srcPath}: ${dlErr.message}`);
        return null;
    }

    // 2. Upload to destination (upsert so we don't fail on re-runs)
    const { error: upErr } = await supabase.storage
        .from(bucketName)
        .upload(destPath, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });

    if (upErr) {
        console.warn(`    ⚠️  Could not upload to ${destPath}: ${upErr.message}`);
        return null;
    }

    return publicUrl(bucketName, destPath);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {

    console.log(`   Dry run: ${DRY_RUN ? 'YES — no changes will be made' : 'NO — changes will be applied'}`);
    console.log(`   Bucket filter: ${BUCKET_FILTER}\n`);

    // 1. Fetch all stages
    const { data: stages, error: stErr } = await supabase
        .from('stages')
        .select('id, asana_id, stage_name, image_url, audio_url');

    if (stErr) throw new Error(`Failed to fetch stages: ${stErr.message}`);


    let imageFixed = 0, audioFixed = 0, imageSkipped = 0, audioSkipped = 0;

    for (const stage of stages) {
        const { id, asana_id, stage_name, image_url, audio_url } = stage;
        const label = `  [Stage ${id}] asana=${asana_id} stage=${stage_name}`;

        const imageUpdates = {};
        const audioUpdates = {};

        // ── Image ─────────────────────────────────────────────────────────────
        if (BUCKET_FILTER !== 'audio') {
            const targetImagePath = canonicalImagePath(asana_id, stage_name);
            const targetImageUrl  = publicUrl(IMAGE_BUCKET, targetImagePath);

            if (image_url && image_url === targetImageUrl) {
                // Already correct — nothing to do
                imageSkipped++;
            } else if (image_url) {
                // Has an image URL but not yet unique → copy to canonical path
                const srcPath = storagePathFromUrl(image_url, IMAGE_BUCKET);
                console.log(`${label}`);

                console.log(`        current : ${image_url}`);
                console.log(`        target  : ${targetImageUrl}`);

                if (!srcPath) {

                    imageSkipped++;
                } else if (DRY_RUN) {

                    imageFixed++;
                } else {
                    const newUrl = await copyStorageFile(IMAGE_BUCKET, srcPath, targetImagePath);
                    if (newUrl) {
                        await supabase.from('stages').update({ image_url: newUrl }).eq('id', id);

                        imageFixed++;
                    } else {
                        imageSkipped++;
                    }
                }
            } else {
                // No image at all — skip
                imageSkipped++;
            }
        }

        // ── Audio ─────────────────────────────────────────────────────────────
        if (BUCKET_FILTER !== 'images') {
            const targetAudioPath = canonicalAudioPath(asana_id, stage_name);
            const targetAudioUrl  = publicUrl(AUDIO_BUCKET, targetAudioPath);

            if (audio_url && audio_url === targetAudioUrl) {
                audioSkipped++;
            } else if (audio_url) {
                const srcPath = storagePathFromUrl(audio_url, AUDIO_BUCKET);
                console.log(`${label}`);

                console.log(`        current : ${audio_url}`);
                console.log(`        target  : ${targetAudioUrl}`);

                if (!srcPath) {

                    audioSkipped++;
                } else if (DRY_RUN) {

                    audioFixed++;
                } else {
                    const newUrl = await copyStorageFile(AUDIO_BUCKET, srcPath, targetAudioPath);
                    if (newUrl) {
                        await supabase.from('stages').update({ audio_url: newUrl }).eq('id', id);

                        audioFixed++;
                    } else {
                        audioSkipped++;
                    }
                }
            } else {
                audioSkipped++;
            }
        }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n─────────────────────────────────────────────────────────');

    if (BUCKET_FILTER !== 'audio')  console.log(`   Images  : ${imageFixed} updated, ${imageSkipped} already OK / skipped`);
    if (BUCKET_FILTER !== 'images') console.log(`   Audio   : ${audioFixed} updated, ${audioSkipped} already OK / skipped`);
    if (DRY_RUN) console.log('\n   (Dry run — no changes were applied. Remove --dry-run to apply.)');
    console.log('─────────────────────────────────────────────────────────\n');
}

main().catch(e => {
    console.error('❌  Unhandled error:', e.message);
    process.exit(1);
});
