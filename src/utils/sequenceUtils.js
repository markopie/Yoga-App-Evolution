// src/utils/sequenceUtils.js
import { getHoldTimes } from './parsing.js';

export function extractTier(note) {
    if (!note || typeof note !== 'string') return '';
    const m = note.match(/\btier:(S|L|STD)\b/i);
    return m ? m[1].toUpperCase() : '';
}

function resolveTierDuration(target, tier) {
    if (!target || !tier || typeof tier !== 'string') return null;
    const hj = getHoldTimes(target);
    const t = tier.toUpperCase();
    if (t === 'S')   return hj.short    != null ? Number(hj.short)    : null;
    if (t === 'L')   return hj.long     != null ? Number(hj.long)     : null;
    if (t === 'STD') return hj.standard != null ? Number(hj.standard) : null;
    return null;
}

/**
 * Returns the canonical effective duration (in seconds) for a single pose entry.
 * @param {string}  id           - Asana ID
 * @param {number}  dur          - Authored duration
 * @param {string}  [tier]       - 'S' | 'L' | 'STD'
 * @param {string}  [varKey]     - Specific variation key
 * @param {string}  [note]       - Note string containing potential tier/stage info
 * @param {boolean} [returnPerSide=false] - If true, returns halved time for bilateral poses.
 */

export function getEffectiveTime(id, dur, tier, varKey, note, returnPerSide = false) {
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    const strId = String(rawId || "");

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
    if (!variation && note) {
        const match = note.match(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/i);
        if (match) variation = match[1].toUpperCase() + (match[2] ? match[2].toLowerCase() : "");
    }
    if (variation && asana.variations && asana.variations[variation]) {
        targetForHold = asana.variations[variation];
    }

    // --- START OF THE "BRAIN" LOGIC ---
    let duration = Number(dur) || 0;

    // RULE 1: Explicit Tiers (S/L/STD) override everything.
    if (tier && targetForHold) {
        const tierDur = resolveTierDuration(targetForHold, tier);
        if (tierDur != null) {
            return returnPerSide ? tierDur : (asana.requiresSides || asana.requires_sides ? tierDur * 2 : tierDur);
        }
    } 

    // RULE 2: Fallback to Library ONLY if duration is 0.
    if (duration === 0) {
        const hj = getHoldTimes(targetForHold);
        duration = (hj && hj.standard != null) ? Number(hj.standard) : 30;
    }

    // RULE 3: TRUST THE AUTHOR (This is why 42m works).
    // If we have an authored duration (like your 600s), we use it.
    
    const isBilateral = asana.requiresSides || asana.requires_sides;
    if (isBilateral) {
        return returnPerSide ? duration : (duration * 2);
    }

    return duration;
}
export function calculateTotalSequenceTime(seq) {
    if (!seq || !seq.poses) return 0;
    const expanded = typeof window.getExpandedPoses === "function" ? window.getExpandedPoses(seq) : seq.poses;
    return expanded.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1], extractTier(p[4]), p[3], p[4]), 0);
}

export function getPosePillTime(p) {
    const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
    const strId = String(rawId || "");
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) return 0;
    
    // Trust the dial! p[1] is already rule-enforced and scaled by the dial engine.
    const dur = Number(p[1]) || 0;
    const lib = window.asanaLibrary || {};
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];

    return (asana && (asana.requiresSides || asana.requires_sides)) ? dur * 2 : dur;
}

window.getEffectiveTime            = getEffectiveTime;
window.calculateTotalSequenceTime  = calculateTotalSequenceTime;
window.getPosePillTime             = getPosePillTime;