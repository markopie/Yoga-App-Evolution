// src/utils/sequenceUtils.js
// Pure utility functions for sequence timing calculations.
// No DOM access — safe to call from any context.

import { getHoldTimes } from './parsing.js';

/** Extracts a hold-tier keyword ('S', 'L', 'STD') from a note string, or '' if none. */
export function extractTier(note) {
    if (!note || typeof note !== 'string') return '';
    const m = note.match(/\btier:(S|L|STD)\b/i);
    return m ? m[1].toUpperCase() : '';
}

/**
 * Resolves the actual seconds for a given hold tier.
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
 * * TIMING HIERARCHY:
 * 1. PRANAYAMA (Asana IDs 203-230): Always uses the sequence duration (dur).
 * 2. TIER OVERRIDE (tier:S/L): Uses resolved tier time, falling back to sequence dur.
 * 3. GLOBAL DEFAULT: Uses the library's 'standard' time, ignoring the sequence dur.
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

    const lib = window.asanaLibrary || {};
    const idNum = parseInt(strId.replace(/\D/g, ''), 10);
    
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];
    
    const hj = getHoldTimes(asana);
    const libStandard = (hj && hj.standard != null) ? Number(hj.standard) : 30;

    let duration;
    const isPranayama = idNum >= 203 && idNum <= 230;

    // RULE 1: Pranayama Protection Zone OR Explicit Tier
    if (isPranayama || (tier && tier !== '')) {
        if (tier && asana) {
            const tierDur = resolveTierDuration(asana, tier);
            duration = tierDur ?? Number(dur) ?? libStandard;
        } else {
            // Pranayama without a tier -> use sequence time
            duration = Number(dur) || libStandard;
        }
    } 
    // RULE 2: Global Default
    else {
        // Not a Pranayama, no Tier -> STRICTLY use library standard
        duration = libStandard;
    }

    // Final bilateral calculation
    if (asana && (asana.requiresSides || asana.requires_sides)) {
        return duration * 2;
    }
    
    return duration;
}

/**
 * Sums the effective time of all poses in an expanded sequence.
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
 * Uses getEffectiveTime to ensure rules are strictly followed in the live player.
 */
export function getPosePillTime(p) {
    const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
    const strId = String(rawId || "");
    
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) {
        return 0;
    }

    const tier = extractTier(p[4]);
    // 🛑 THIS IS THE FIX: The Live Player now routes through the same strict hierarchy
    return getEffectiveTime(rawId, p[1], tier);
}

// Global aliases
window.getEffectiveTime            = getEffectiveTime;
window.calculateTotalSequenceTime  = calculateTotalSequenceTime;
window.getPosePillTime             = getPosePillTime;