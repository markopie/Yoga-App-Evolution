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

function normalizePoseId(id) {
    const rawId = Array.isArray(id) ? id[0] : id;
    return String(rawId || "");
}

function getAsanaForId(id) {
    const strId = normalizePoseId(id);
    const lib = window.asanaLibrary || {};
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    return { strId, asana: lib[key] || null };
}

function resolveVariationKey(varKey, note) {
    if (varKey) return String(varKey).trim();
    if (!note || typeof note !== 'string') return '';
    const match = note.match(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/i);
    return match ? match[1].toUpperCase() + (match[2] ? match[2].toLowerCase() : "") : '';
}

function resolveTimingTarget(asana, variation) {
    if (!asana) return null;
    if (!variation || !asana.variations) return asana;
    if (asana.variations[variation]) return asana.variations[variation];

    const normVar = String(variation).toLowerCase().replace(/\s+/g, "");
    for (const [vk, vd] of Object.entries(asana.variations)) {
        const title = (vd && typeof vd === 'object' && (vd.title || vd.Title)) || "";
        if (vk.toLowerCase() === normVar || title.toLowerCase().replace(/\s+/g, "").includes(normVar)) {
            return vd;
        }
    }

    return asana;
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
    const strId = normalizePoseId(id);

    // Macros and Loops carry no duration themselves
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP")) return 0;

    const { asana } = getAsanaForId(strId);

    if (!asana) {
        if (strId) console.warn(`⚠️ Timing Logic: ID ${strId} not found.`);
        return Number(dur) || 30;
    }

    const variation = resolveVariationKey(varKey, note);
    const targetForHold = resolveTimingTarget(asana, variation);
    const hj = getHoldTimes(targetForHold);
    const baseHj = targetForHold === asana ? hj : getHoldTimes(asana);
    const libStandard = (hj && hj.standard != null) ? Number(hj.standard) :
        ((baseHj && baseHj.standard != null) ? Number(baseHj.standard) : 30);
    const idNum = parseInt(strId.replace(/\D/g, ''), 10);
    const isPranayama = idNum >= 203 && idNum <= 230;

    // RULE 1: Explicit Tiers (S/L/STD) override everything.
    if (tier) {
        const tierDur = resolveTierDuration(targetForHold, tier);
        if (tierDur != null) {
            return returnPerSide ? tierDur : (asana.requiresSides || asana.requires_sides ? tierDur * 2 : tierDur);
        }
    }

    // RULE 2: Pranayama without explicit tier respects authored sequence time.
    if (isPranayama) {
        const pranayamaDuration = Number(dur) || libStandard;
        return returnPerSide ? pranayamaDuration : (asana.requiresSides || asana.requires_sides ? pranayamaDuration * 2 : pranayamaDuration);
    }

    // RULE 3: Standard asana timing prefers library standard, with authored fallback only if missing.
    let duration = libStandard;
    if (!(duration > 0)) {
        duration = Number(dur) || 30;
    }
    

    // RULE 4: Bilateral Logic
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
    const strId = normalizePoseId(p[0]);
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP")) return 0;
    
    const dur = Number(p[1]) || 0;
    const { asana } = getAsanaForId(strId);

    return (asana && (asana.requiresSides || asana.requires_sides)) ? dur * 2 : dur;
}

// Global Exports
Object.assign(window, {
    getEffectiveTime,
    calculateTotalSequenceTime,
    getPosePillTime
});