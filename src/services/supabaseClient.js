// src/services/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = "https://qrcpiyncvfmpmeuyhsha.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyY3BpeW5jdmZtcG1ldXloc2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTA2NDgsImV4cCI6MjA4NzI4NjY0OH0.7sjbfwdT_aYmrJyVFYWpfMNBQpCJAI7Vd5uNEkzD4GI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// THIS IS THE BRIDGE: It makes the worker global for your app.js
window.supabase = supabase;