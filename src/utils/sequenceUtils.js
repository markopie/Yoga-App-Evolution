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

export function getEffectiveTime(id, dur, tier, varKey, note) {
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    if (Array.isArray(rawId)) rawId = rawId[0]; 

    const strId = String(rawId || "");
    if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) return 0;

    const lib = window.asanaLibrary || {};
    const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
    const asana = lib[key];

    let targetForHold = asana;
    let variation = varKey;
    
    if (!variation && note) {
        const match = note.match(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/i);
        if (match) variation = match[1].toUpperCase() + (match[2] ? match[2].toLowerCase() : "");
    }

    if (variation && asana.variations) {
        if (asana.variations[variation]) {
            targetForHold = asana.variations[variation];
        } else {
            const normVar = variation.toLowerCase().replace(/\s+/g, "");
            for (const [vk, vd] of Object.entries(asana.variations)) {
                const title = (vd && typeof vd === 'object' && (vd.title || vd.Title)) || "";
                if (vk.toLowerCase() === normVar || title.toLowerCase().replace(/\s+/g, "").includes(normVar)) {
                    targetForHold = vd;
                    break;
                }
            }
        }
    }

    let duration = Number(dur) || 0;

    // RULE 1: Explicit Tier Overrides ALWAYS win (dynamic library lookup)
    if (tier && targetForHold) {
        const tierDur = resolveTierDuration(targetForHold, tier);
        if (tierDur != null) duration = tierDur;
    } 
    // RULE 2: If duration is missing/0, fallback to library
    else if (duration === 0) {
        const hj = getHoldTimes(targetForHold);
        let libStandard = (hj && hj.standard != null) ? Number(hj.standard) : null;
        if (libStandard == null) {
            const baseHj = getHoldTimes(asana);
            libStandard = (baseHj && baseHj.standard != null) ? Number(baseHj.standard) : 30;
        }
        duration = libStandard;
    }
    // RULE 3: Otherwise, TRUST THE WRITTEN SEQUENCE TEXT (600, 180, etc.)

    if (asana && (asana.requiresSides || asana.requires_sides)) return duration * 2;
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