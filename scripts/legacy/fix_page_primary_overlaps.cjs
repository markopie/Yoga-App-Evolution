/**
 * fix_page_primary_overlaps.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Finds every stage row whose page_primary matches a base asana's page_primary
 * and updates it to page + 0.1, 0.2, 0.3 ... (per overlap group).
 *
 * PREREQUISITE: Run the migration first in Supabase SQL Editor:
 *   supabase/migrations/20260314000002_alter_page_primary_to_numeric.sql
 *   (converts page_primary from integer to numeric(6,2))
 *
 * Usage:
 *   node scripts/fix_page_primary_overlaps.cjs [--dry-run]
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log(`\n🔢  Page Primary Overlap Fixer`);
    console.log(`   Dry run: ${DRY_RUN ? 'YES (no changes)' : 'NO (applying updates)'}\n`);

    // 1. Fetch all asana page_primaries
    const { data: asanas, error: aErr } = await supabase
        .from('asanas')
        .select('id, english_name, page_primary')
        .not('page_primary', 'is', null);
    if (aErr) throw new Error('asanas fetch failed: ' + aErr.message);

    const asanaPageSet = new Set(asanas.map(a => Number(a.page_primary)));

    // 2. Fetch stages whose page_primary is in the asana set
    const { data: stages, error: sErr } = await supabase
        .from('stages')
        .select('id, asana_id, stage_name, title, page_primary')
        .not('page_primary', 'is', null)
        .order('page_primary', { ascending: true })
        .order('id',          { ascending: true });
    if (sErr) throw new Error('stages fetch failed: ' + sErr.message);

    // Group conflicting stages by their current page_primary
    const conflicts = {};
    stages.forEach(s => {
        const p = Number(s.page_primary);
        if (asanaPageSet.has(p)) {
            if (!conflicts[p]) conflicts[p] = [];
            conflicts[p].push(s);
        }
    });

    const conflictPages = Object.keys(conflicts).map(Number).sort((a, b) => a - b);

    if (conflictPages.length === 0) {
        console.log('✅  No overlapping page_primary values found — nothing to do.');
        return;
    }

    console.log(`Found ${conflictPages.length} page(s) with asana↔stage overlap:\n`);

    let updated = 0, failed = 0;

    for (const page of conflictPages) {
        const stageGroup = conflicts[page];
        const asana = asanas.find(a => Number(a.page_primary) === page);

        console.log(`  Page ${page} — base asana: ${asana?.id} (${asana?.english_name})`);

        stageGroup.forEach((stage, groupIdx) => {
            const newPage = Math.round((page + (groupIdx + 1) * 0.1) * 100) / 100; // e.g. 44.1, 44.2
            console.log(`    Stage ${stage.id} (asana ${stage.asana_id} ${stage.stage_name})`);
            console.log(`      "${stage.title || '(no title)'}"`);
            console.log(`      ${page} → ${newPage}`);
            stage._newPage = newPage;
        });
        console.log();
    }

    if (DRY_RUN) {
        console.log('🔷  DRY RUN — no changes made. Remove --dry-run to apply.\n');
        return;
    }

    // Apply updates
    for (const page of conflictPages) {
        for (const stage of conflicts[page]) {
            const { error } = await supabase
                .from('stages')
                .update({ page_primary: stage._newPage })
                .eq('id', stage.id);

            if (error) {
                console.error(`  ❌  Stage ${stage.id}: ${error.message}`);
                failed++;
            } else {
                console.log(`  ✅  Stage ${stage.id}: ${page} → ${stage._newPage}`);
                updated++;
            }
        }
    }

    console.log(`\n─────────────────────────────────────────────────────────`);
    console.log(`✅  Done. ${updated} updated, ${failed} failed.`);
    console.log(`─────────────────────────────────────────────────────────\n`);
}

main().catch(e => {
    if (e.message?.includes('invalid input syntax') || e.message?.includes('numeric')) {
        console.error('\n❌  ERROR: The page_primary column is still an integer type.');
        console.error('   Please run the migration first in Supabase SQL Editor:');
        console.error('   supabase/migrations/20260314000002_alter_page_primary_to_numeric.sql\n');
    } else {
        console.error('❌  Unhandled error:', e.message);
    }
    process.exit(1);
});
