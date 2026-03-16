// src/utils/sequenceUtils.js
import { getHoldTimes } from './parsing.js';

/**
 * Extracts the tier from a pose note (e.g., "tier:S").
 */
export function extractTier(note) {
    if (!note || typeof note !== 'string') return '';
    const m = note.match(/\btier:(S|L|STD)\b/i);
    return m ? m[1].toUpperCase() : '';
}

/**
 * Resolves duration based on library tiers.
 */
function resolveTierDuration(target, tier) {
    if (!target || !tier) return null;
    const hj = getHoldTimes(target);
    const t = String(tier).toUpperCase();
    
    if (t === 'S')   return hj.short    != null ? Number(hj.short)    : null;
    if (t === 'L')   return hj.long     != null ? Number(hj.long)     : null;
    if (t === 'STD') return hj.standard != null ? Number(hj.standard) : null;
    return null;
}

/**
 * The "Brain" Logic for pose timing.
 */
export function getEffectiveTime(id, dur, tier, varKey, note, returnPerSide = false) {
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    const strId = String(rawId || "");

    // Macros and Loops carry no duration themselves
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP")) return 0;

    const lib = window.asanaLibrary || {};
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];

    if (!asana) {
        if (strId) console.warn(`⚠️ Timing Logic: ID ${strId} not found.`);
        return Number(dur) || 30;
    }

    let targetForHold = asana;
    let variation = varKey;
    
    // Auto-detect variation from note if not explicitly provided
    if (!variation && note) {
        const match = note.match(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/i);
        if (match) variation = match[1].toUpperCase() + (match[2] ? match[2].toLowerCase() : "");
    }
    
    if (variation && asana.variations && asana.variations[variation]) {
        targetForHold = asana.variations[variation];
    }

    // RULE 1: Explicit Tiers (S/L/STD) override everything.
    if (tier) {
        const tierDur = resolveTierDuration(targetForHold, tier);
        if (tierDur != null) {
            return returnPerSide ? tierDur : (asana.requiresSides || asana.requires_sides ? tierDur * 2 : tierDur);
        }
    } 

    // RULE 2: Fallback to Library ONLY if authored duration is missing/zero.
    let duration = Number(dur) || 0;
    if (duration === 0) {
        const hj = getHoldTimes(targetForHold);
        duration = (hj && hj.standard != null) ? Number(hj.standard) : 30;
    }

    // RULE 3: Trust the Author / Bilateral Logic
    const isBilateral = asana.requiresSides || asana.requires_sides;
    if (isBilateral) {
        return returnPerSide ? duration : (duration * 2);
    }

    return duration;
}

/**
 * Sums the entire sequence time.
 */
export function calculateTotalSequenceTime(seq) {
    if (!seq || !seq.poses) return 0;
    const expanded = typeof window.getExpandedPoses === "function" 
        ? window.getExpandedPoses(seq) 
        : seq.poses;
        
    return expanded.reduce((acc, p) => {
        const time = getEffectiveTime(p[0], p[1], extractTier(p[4]), p[3], p[4]);
        return acc + time;
    }, 0);
}

/**
 * Simple getter used by the UI (Pills/Dial Estimate).
 */
export function getPosePillTime(p) {
    const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
    const strId = String(rawId || "");
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP")) return 0;
    
    const dur = Number(p[1]) || 0;
    const lib = window.asanaLibrary || {};
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];

    return (asana && (asana.requiresSides || asana.requires_sides)) ? dur * 2 : dur;
}

// Global Exports
Object.assign(window, {
    getEffectiveTime,
    calculateTotalSequenceTime,
    getPosePillTime
});