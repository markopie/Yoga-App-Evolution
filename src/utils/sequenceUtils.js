// src/utils/sequenceUtils.js
// Pure utility functions for sequence timing calculations.
// No DOM access — safe to call from any context.
//
// Two timing contracts (see refactor-roadmap.md Lesson #9):
//   getEffectiveTime(id, dur) — reads hold_json.standard from library.
//                               Use for builder stats & calculateTotalSequenceTime.
//   getPosePillTime(p)        — reads p[1] which is already dial-adjusted.
//                               Use for the live timer pill & time-remaining display.

/**
 * Returns the canonical effective duration (in seconds) for a single pose entry.
 * - Reads hold_json.standard from the asana library (authoritative source)
 * - Doubles duration if the asana requires both sides
 * - Returns 0 for MACRO, LOOP_START, LOOP_END markers
 *
 * @param {string|Array} id   - Asana ID (or array-wrapped ID from pose tuple)
 * @param {number}        dur  - Fallback duration from the sequence row
 * @returns {number} Duration in seconds
 */
export function getEffectiveTime(id, dur) {
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    if (Array.isArray(rawId)) rawId = rawId[0]; // double-unwrap guard

    const strId = String(rawId || "");

    // Structural markers — no time contribution
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END"))   return 0;
    if (strId.startsWith("LOOP_START"))                                return 0;

    const lib    = window.asanaLibrary || {};
    const searchId = Number(rawId);
    const asana  = Object.values(lib).find(a => Number(a.id || a.asanaNo) === searchId);

    let duration;
    if (asana) {
        const hj = asana.hold_json || asana.hold_data;
        duration = (hj && hj.standard) ? Number(hj.standard) : (Number(dur) || 0);
    } else {
        duration = Number(dur) || 0;
    }

    // Double for bilateral poses
    if (asana && (asana.requiresSides || asana.requires_sides)) return duration * 2;
    return duration;
}

/**
 * Sums the effective time of all poses in an expanded sequence.
 * Relies on window.getExpandedPoses (sequenceEngine.js) if available.
 *
 * @param {object} seq - Sequence object with .poses array
 * @returns {number} Total duration in seconds
 */
export function calculateTotalSequenceTime(seq) {
    if (!seq || !seq.poses) return 0;
    const expanded = typeof window.getExpandedPoses === "function"
        ? window.getExpandedPoses(seq)
        : seq.poses;
    return expanded.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
}

/**
 * Returns the dial-aware duration for a single active pose entry.
 * Reads p[1] directly — already scaled by applyDurationDial().
 * Doubles for bilateral poses via a library lookup.
 *
 * ⚠️  Use this for the LIVE TIMER PILL and time-remaining display.
 *     Do NOT use for builder stats — those must always show library defaults.
 *
 * @param {Array} p  - Pose tuple from activePlaybackList / currentSequence.poses
 * @returns {number} Duration in seconds
 */
export function getPosePillTime(p) {
    const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
    const strId = String(rawId || "");
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) return 0;
    const dur = Number(p[1]) || 0;
    const lib = window.asanaLibrary || {};
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];
    return (asana && (asana.requiresSides || asana.requires_sides)) ? dur * 2 : dur;
}

// Global aliases for compatibility with app.js and wiring.js
window.getEffectiveTime            = getEffectiveTime;
window.calculateTotalSequenceTime  = calculateTotalSequenceTime;
window.getPosePillTime             = getPosePillTime;
