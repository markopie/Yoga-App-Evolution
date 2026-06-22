// src/services/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const env = import.meta.env || {};

const SUPABASE_URL = String(env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = String(
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '',
).trim();
const SUPABASE_TARGET = String(env.VITE_SUPABASE_TARGET || 'local').trim();

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
        'Missing Supabase runtime config. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    );
}

export const supabaseConfig = {
    url: SUPABASE_URL,
    target: SUPABASE_TARGET,
    keyType: SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') ? 'publishable' : 'legacy-anon',
    storageKey: `yoga-evolution-${SUPABASE_TARGET}-auth`,
};

console.info('[Supabase] Runtime target:', supabaseConfig);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: supabaseConfig.storageKey,
    },
});

supabase.auth.getSession().then(({ error }) => {
    if (!error) return;
    if (!/refresh token/i.test(error.message || '')) return;
    console.warn('[Supabase] Clearing stale local auth session after reset:', error.message);
    return supabase.auth.signOut({ scope: 'local' });
}).catch((error) => {
    if (/refresh token/i.test(error?.message || '')) {
        console.warn('[Supabase] Clearing stale local auth session after reset:', error.message);
        return supabase.auth.signOut({ scope: 'local' });
    }
    console.warn('[Supabase] Session check failed:', error);
});

window.supabase = supabase;
window.supabaseConfig = supabaseConfig;
