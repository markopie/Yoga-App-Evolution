import { formatCategory } from "../utils/format.js";
import { isFlowSequence } from '../store/builderState.js';

export function builderPoseName(asana, poseName, showSanskrit) {
    if (!asana) return poseName || 'Unknown';
    if (showSanskrit) return asana.devanagari || asana.iast || asana.english || poseName || 'Unknown';
    return asana.english || asana.devanagari || poseName || 'Unknown';
}


export function generateVariationSelectHTML(asana, pose, idx) {
    const variations = asana ? (asana.variations || {}) : {};
    const hasVariations = Object.keys(variations).length > 0;
    
    let viewText = '';
    if (pose.variation && variations[pose.variation]) {
        viewText = `(${variations[pose.variation].title || `Stage ${pose.variation}`})`;
    }
    const viewSpan = viewText ? `<span class="b-var-view">${viewText}</span>` : '';

    if (!hasVariations) return viewSpan;

    const selectHtml = `
       <select class="b-var b-var-edit" data-idx="${idx}">
          <option value="">Base Pose</option>
          ${Object.entries(variations)
              // 🌟 NEW: Sort numerically using our new Supabase column
              .sort(([, aData], [, bData]) => (aData.sort_order ?? 0) - (bData.sort_order ?? 0))
              .map(([vKey, vData]) => {
                  const optionTitle = vData.title || `Stage ${vKey}`;
                  const sel = (pose.variation === vKey) ? 'selected' : '';
                  return `<option value="${vKey}" ${sel}>${optionTitle}</option>`;
              }).join('')}
       </select>`;

    return viewSpan + selectHtml;
}

function formatCompactDuration(seconds = 0) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins && secs) return `~${mins}m ${secs}s`;
    if (mins) return `~${mins}m`;
    return `~${secs}s`;
}

export function buildMacroInfoHTML({ oneRoundSecs = 0, rounds = 1, note = '' } = {}) {
    const safeRounds = Math.max(1, Number(rounds) || 1);
    const perRound = Math.max(0, Math.round(Number(oneRoundSecs) || 0));
    const total = perRound * safeRounds;
    const noteHtml = note ? `<div class="builder-macro-note">${note}</div>` : '';

    return `<td class="builder-info-cell builder-info-macro">
        <div class="builder-macro-info-line"><strong>${formatCompactDuration(perRound)}</strong> per round</div>
        <div class="builder-macro-info-line">× ${safeRounds} round${safeRounds !== 1 ? 's' : ''}</div>
        <div class="builder-macro-info-line"><strong>${formatCompactDuration(total)}</strong> total</div>
        ${noteHtml}
    </td>`;
}

export function generateInfoCellHTML(asana, pose, idx, options = {}) {
    const { isSpecial = false, isFlow = false } = options;
    if (isSpecial) return `<td class="builder-info-cell builder-info-special">—</td>`;

    const activeVar = (pose.variation && asana?.variations?.[pose.variation]) ? asana.variations[pose.variation] : null;
    const holdSrc = window.getHoldTimes ? window.getHoldTimes(activeVar || asana) : { standard: 30, flow: 5 };
    const currentTier = pose.holdTier || 'standard';
    const currentFlow = Number(pose.flowHoldOverride ?? pose.duration ?? holdSrc.flow ?? holdSrc.standard ?? 5) || 5;

    const tierBtn = (tier, label, sec) => {
        const isActive = currentTier === tier;
        const isDisabled = sec == null || (sec === holdSrc.standard && tier !== 'standard');
        const activeStyle = 'background:#1976d2; color:#fff; border-color:#1976d2; font-weight:700;';
        const normalStyle = 'background:#f5f5f7; color:#555; border-color:#d2d2d7;';
        return `<button class="b-tier" data-idx="${idx}" data-tier="${tier}" ${isDisabled ? 'disabled' : ''}
            style="border:1px solid; border-radius:4px; padding:2px 6px; font-size:0.7rem; cursor:pointer; min-width:32px; ${isActive ? activeStyle : normalStyle}">
            ${label}${sec != null ? `<div style="font-size:0.62rem; margin-top:1px;">${sec}s</div>` : ''}
        </button>`;
    };

    let catChipHTML = '';
    const rawCat = (asana?.category || '').trim();
    if (rawCat) {
        const displayCat = formatCategory(rawCat);
        const catKey = displayCat.toLowerCase().split(/[\s/]/)[0];
        catChipHTML = `<span class="binfo-cat" data-cat="${catKey}">${displayCat}</span>`;
    }
    const sideSelector = isFlowSequence() ? `
    <div class="side-selector" style="display:inline-flex; gap:2px; margin-left:8px; vertical-align:middle;">
        <button class="tiny b-side ${pose.side === 'L' ? 'active' : ''}" data-idx="${idx}" data-side="L" style="${pose.side === 'L' ? 'background:#007aff; color:#fff; border-color:#007aff;' : ''}">L</button>
        <button class="tiny b-side ${pose.side === 'R' ? 'active' : ''}" data-idx="${idx}" data-side="R" style="${pose.side === 'R' ? 'background:#007aff; color:#fff; border-color:#007aff;' : ''}">R</button>
    </div>` : '';
    if (isFlow) {
        return `<td class="builder-info-cell builder-info-flow">
            <div class="builder-flow-info-block">
                <label class="builder-flow-label" for="flowHold-${idx}">Flow hold</label>
                <input id="flowHold-${idx}" type="number" min="1" step="1" class="b-flow-hold" data-idx="${idx}" value="${currentFlow}">
                <span class="builder-flow-unit">secs</span>
            </div>
            <div>${catChipHTML}</div>
            ${asana?.requires_sides ? `<div class="binfo-sides">↔ Both sides</div>` : ''}
        </td>`;
    }

    const stdSec = holdSrc.standard ?? 30;
    return `<td class="builder-info-cell">
        <div style="display:flex; gap:3px; margin-bottom:4px;">
            ${tierBtn('short', 'S', holdSrc.short)}
            ${tierBtn('standard', 'STD', stdSec)}
            ${tierBtn('long', 'L', holdSrc.long)}
        </div>
        <div>${catChipHTML}</div>
        ${asana?.requires_sides ? `<div class="binfo-sides">↔ Both sides</div>` : ''}
    </td>`;
}

export const resolvePoseInfo = (rawId, lib) => {
    if (!rawId || rawId === 'NULL' || rawId === 'null') return null;
    const cleanId = String(rawId).trim().replace(/\|/g, '').replace(/\s+/g, '');
    const parsed = cleanId.match(/^(\d+)(.*)?$/);
    if (!parsed) return null;
    const numId = parsed[1].padStart(3, '0');
    const varSuffix = (parsed[2] || '').toUpperCase();
    const target = lib[numId];
    if (!target) return null;
    const targetHold = window.getHoldTimes ? window.getHoldTimes(target) : {};
    let dur = targetHold.standard ?? target.standard_seconds ?? 30;
    let name = target.english || target.devanagari || `ID ${numId}`;
    if (varSuffix && target.variations) {
        const vd = target.variations[varSuffix];
        if (vd) {
            name += ` (${vd.title || varSuffix})`;
            const vdHold = window.getHoldTimes ? window.getHoldTimes(vd) : {};
            dur = vdHold.standard ?? dur;
        }
    }
    if (target.requires_sides) dur *= 2;
    return { name, dur };
};
