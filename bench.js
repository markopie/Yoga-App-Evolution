import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import repl from 'repl';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log("--- 🧘 Yoga App Workbench Active ---");
console.log("Variable 'supabase' is ready. Use 'await' directly.");

// Start the interactive REPL
const r = repl.start('> ');
r.context.supabase = supabase; // This makes 'supabase' available in the console