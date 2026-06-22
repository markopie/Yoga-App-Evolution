const HOSTED_STORAGE_PUBLIC_PREFIX = 'https://qrcpiyncvfmpmeuyhsha.supabase.co/storage/v1/object/public/';

function supabaseUrl() {
    return String(import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
}

export function storagePublicBase(bucket) {
    const baseUrl = supabaseUrl();
    return baseUrl && bucket
        ? `${baseUrl}/storage/v1/object/public/${bucket}/`
        : '';
}

export function resolveSupabaseStorageUrl(value, fallbackBucket = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

    let path = raw;
    if (path.startsWith(HOSTED_STORAGE_PUBLIC_PREFIX)) {
        path = `/storage/v1/object/public/${path.slice(HOSTED_STORAGE_PUBLIC_PREFIX.length)}`;
    }

    if (path.startsWith('/storage/v1/object/public/')) {
        const baseUrl = supabaseUrl();
        return baseUrl ? `${baseUrl}${path}` : path;
    }

    if (/^https?:\/\//i.test(path)) return path;
    if (!fallbackBucket) return path;

    return `${storagePublicBase(fallbackBucket)}${path.replace(/^\/+/, '')}`;
}
