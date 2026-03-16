// src/utils/sequenceUtils.js
// Pure utility functions for sequence timing calculations.
// No DOM access — safe to call from any context.
//
// Timing contracts (see refactor-roadmap.md Lesson #9):
//   getEffectiveTime(id, dur, tier) — resolves duration from hold column; honours tier keyword.
//                                     Use for builder stats & calculateTotalSequenceTime.
//   getPosePillTime(p)              — reads p[1] (dial-adjusted); honours tier from p[4] note.
//                                     Use for the live timer pill & time-remaining display.
//
// Tier persistence:
//   Tier overrides are stored as "tier:S" or "tier:L" in p[4] (the note field).
//   p[5] is reserved for originalIdx (set by getExpandedPoses) — do NOT use for tier.
//   Consumers call extractTier(p[4]) to get the tier string.

import { getHoldTimes } from './parsing.js';

/** Extracts a hold-tier keyword ('S', 'L', 'STD') from a note string, or '' if none. */
function extractTier(note) {
    if (!note || typeof note !== 'string') return '';
    const m = note.match(/\btier:(S|L|STD)\b/i);
    return m ? m[1].toUpperCase() : '';
}

/**
 * Resolves the actual seconds for a given hold tier ('S', 'L', 'STD') by doing a
 * LIVE lookup in window.asanaLibrary. If an asana's short/long value changes in the
 * database, all sequences using that tier keyword automatically pick up the new value.
 *
 * @param {object} asana - Asana object from asanaLibrary
 * @param {string} tier  - 'S' | 'L' | 'STD'
 * @returns {number|null} - Resolved seconds, or null if not found
 */
function resolveTierDuration(asana, tier) {
    if (!asana || !tier || typeof tier !== 'string') return null;
    const hj = getHoldTimes(asana);
    const t = tier.toUpperCase();
    if (t === 'S')   return hj.short    != null ? Number(hj.short)    : null;
    if (t === 'L')   return hj.long     != null ? Number(hj.long)     : null;
    if (t === 'STD') return hj.standard != null ? Number(hj.standard) : null;
    return null;
}

/**
 * Returns the canonical effective duration (in seconds) for a single pose entry.
 * - If a tier keyword is present in p[4] (note), resolves LIVE from library.
 * - Otherwise reads hold standard from the asana library.
 * - Doubles duration if the asana requires both sides.
 * - Returns 0 for MACRO, LOOP_START, LOOP_END markers.
 *
 /**
 * Returns the canonical effective duration (in seconds) for a single pose entry.
 * * PRIORITY RULES:
 * 1. Use authored duration ONLY if:
 * - The ID is a protected stage (31-131)
 * - OR an explicit tier (S, L, STD) is present.
 * 2. DEFAULT: Use library 'standard' duration for everything else.
 * * @param {string|Array} id   - Asana ID
 * @param {number}       dur  - Authored duration from the sequence row
 * @param {string}       [tier] - Optional tier keyword: 'S' | 'L' | 'STD'
 * @returns {number} Duration in seconds
 */
export function getEffectiveTime(id, dur, tier) {
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    if (Array.isArray(rawId)) rawId = rawId[0]; // double-unwrap guard

    const strId = String(rawId || "");

    // Structural markers — no time contribution
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) {
        return 0;
    }

    const lib      = window.asanaLibrary || {};
    // Ensure we handle numeric comparison for the range check
    const idNum    = parseInt(strId.replace(/\D/g, ''), 10);
    const key      = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana    = lib[key];
    const hj       = getHoldTimes(asana);

    let duration;

    // RULE 1: Protected Stages (31-131) or Explicit Tiers use the authored sequence time
    if ((idNum >= 31 && idNum <= 131) || tier) {
        // If a tier is present, we try to resolve that specific tier value from the library first
        if (tier && asana) {
            const tierDur = resolveTierDuration(asana, tier);
            duration = tierDur ?? Number(dur) ?? 0;
        } else {
            duration = Number(dur) || (hj ? hj.standard : 0);
        }
    } 
    // RULE 2: Global Default - Use library standard, ignoring authored duration
    else {
        duration = (hj && hj.standard != null) ? Number(hj.standard) : (Number(dur) || 0);
    }

    // Final side calculation
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
    return expanded.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1], extractTier(p[4])), 0);
}

/**
 * Returns the dial-aware duration for a single active pose entry.
 * Reads p[1] directly — already scaled by applyDurationDial().
 * Doubles for bilateral poses via a library lookup.
 * Respects tier keyword embedded in p[4] (note) for live library resolution.
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

    const lib   = window.asanaLibrary || {};
    const key   = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];

    // Read tier from the note field (p[4]) — p[5] is originalIdx, not tier.
    const tier  = extractTier(p[4]);

    let dur;
    if (tier && asana) {
        const tierDur = resolveTierDuration(asana, tier);
        dur = tierDur ?? Number(p[1]) ?? 0;
    } else {
        dur = Number(p[1]) || 0;
    }

    return (asana && (asana.requiresSides || asana.requires_sides)) ? dur * 2 : dur;
}

// Global aliases for compatibility with app.js and wiring.js
window.getEffectiveTime            = getEffectiveTime;
window.calculateTotalSequenceTime  = calculateTotalSequenceTime;
window.getPosePillTime             = getPosePillTime;
