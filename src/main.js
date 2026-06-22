if (!new URLSearchParams(window.location.search).get('prototype')) {
    await import('./services/supabaseClient.js');
    await import('./services/dataAdapter.js');
    await import('../app.js');
}
