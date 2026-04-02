#!/usr/bin/env node
/*
  scripts/complete_sequence.js

  Usage:
    node scripts/complete_sequence.js "Sequence Title" --category "Category" --duration 120 --dry-run

  This script inserts a row into the `sequence_completions` table using Supabase.
  It reads SUPABASE_URL and SUPABASE_ANON_KEY from environment variables (or falls back to the values present in src/services/supabaseClient.js).
*/

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const FALLBACK_URL = "https://qrcpiyncvfmpmeuyhsha.supabase.co";
const FALLBACK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyY3BpeW5jdmZtcG1ldXloc2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTA2NDgsImV4cCI6MjA4NzI4NjY0OH0.7sjbfwdT_aYmrJyVFYWpfMNBQpCJAI7Vd5uNEkzD4GI";

const SUPABASE_URL = process.env.SUPABASE_URL || FALLBACK_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function usage() {

  process.exit(1);
}

function parseArgs(argv) {
  if (!argv || argv.length < 1) return null;
  const out = { title: null, category: null, duration: null, dryRun: false };
  let i = 0;
  if (argv[0] && !argv[0].startsWith('--')) {
    out.title = argv[0];
    i = 1;
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--category' && argv[i+1]) { out.category = argv[i+1]; i++; continue; }
    if (a === '--duration' && argv[i+1]) { out.duration = Number(argv[i+1]); i++; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    // allow positional title with spaces via quoting, so ignore unknown flags
  }
  return out;
}

(async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) return usage();
  // support title as first positional argument even if it contains spaces (user should quote it)
  const parsed = parseArgs(argv);
  if (!parsed || !parsed.title) return usage();

  const payload = {
    title: parsed.title,
    category: parsed.category || null,
    completed_at: new Date().toISOString()
  };
  if (parsed.duration !== null && !Number.isNaN(parsed.duration)) payload.duration_seconds = parsed.duration;

  console.log('Prepared payload:', payload);
  if (parsed.dryRun) {
    console.log('Dry-run mode - not inserting.');
    process.exit(0);
  }

  try {
    const { data, error } = await supabase
      .from('sequence_completions')
      .insert([payload])
      .select();

    if (error) throw error;
    if (data && data.length) {

      process.exit(0);
    }
    console.log('Insert returned no data but completed successfully.');
    process.exit(0);
  } catch (e) {
    console.error('Failed to insert completion:', e.message || e);
    process.exit(2);
  }
})();
