export function normalisePoseId(value) {
    const token = String(value ?? '').trim();
    if (!token) return '';
    const match = token.match(/^(\d+)([a-z]?)$/i);
    if (!match) return token.toLowerCase();
    return match[1].padStart(3, '0') + (match[2] || '').toLowerCase();
}

export function poseIdFromSequenceNode(node) {
    const rawId = Array.isArray(node?.[0]) ? node[0][0] : node?.[0];
    if (!rawId || String(rawId).startsWith('LOOP') || String(rawId).startsWith('MACRO:')) return '';
    return normalisePoseId(rawId);
}
