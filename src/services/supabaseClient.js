// src/services/supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import {
    browserTestSupabaseConfig,
    createBrowserTestSupabaseClient,
    mockNextSignInFailure,
} from './supabaseBrowserTestMock.js';

const env = import.meta.env || {};
const USE_BROWSER_TEST_MOCKS = env.VITE_BROWSER_TEST_MOCKS === '1';

const SUPABASE_URL = String(env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = String(
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '',
).trim();
const SUPABASE_TARGET = String(env.VITE_SUPABASE_TARGET || 'local').trim();
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabaseConfig = USE_BROWSER_TEST_MOCKS ? browserTestSupabaseConfig : hasSupabaseConfig ? {
    url: SUPABASE_URL,
    target: SUPABASE_TARGET,
    keyType: SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') ? 'publishable' : 'legacy-anon',
    storageKey: `yoga-evolution-${SUPABASE_TARGET}-auth`,
} : null;

if (USE_BROWSER_TEST_MOCKS) {
    console.info('[Supabase] Browser test mock enabled.');
} else if (!hasSupabaseConfig) {
    console.warn(
        '[Supabase] Missing runtime config. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local to enable cloud features.',
    );
} else {
    console.info('[Supabase] Runtime target:', supabaseConfig);
}

export const supabase = USE_BROWSER_TEST_MOCKS ? createBrowserTestSupabaseClient() : hasSupabaseConfig ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: supabaseConfig.storageKey,
    },
}) : null;

if (supabase) {
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
}

window.supabase = supabase;
window.supabaseConfig = supabaseConfig;
if (USE_BROWSER_TEST_MOCKS) {
    window.__mockNextSignInFailure = mockNextSignInFailure;
}
