import { formatCategory } from "../utils/format.js";

export function builderPoseName(asana, poseName, showSanskrit) {
    if (!asana) return poseName || 'Unknown';
    if (showSanskrit) return asana.name || asana.iast || asana.english || poseName || 'Unknown';
    return asana.english || asana.name || poseName || 'Unknown';
}

export function generateVariationSelectHTML(asana, pose, idx) {
    const variations = asana ? (asana.variations || {}) : {};
    const hasVariations = Object.keys(variations).length > 0;
    
    let viewText = '';
    if (pose.variation && variations[pose.variation]) {
        viewText = `(${variations[pose.variation].title || `Stage ${pose.variation}`})`;
    }
    const viewSpan = viewText ? `<span class="b-var-view" style="font-weight:600; color:#005580; font-size:0.85rem; margin-left:4px;">${viewText}</span>` : '';

    if (!hasVariations) return viewSpan;

    const selectHtml = `
       <select class="b-var b-var-edit" data-idx="${idx}" style="margin-left:8px; padding:2px 4px; border:1px solid #1976d2; border-radius:4px; font-size:0.75rem; background:#e3f2fd; color:#005580; max-width: 160px;">
          <option value="">Base Pose</option>
          ${Object.entries(variations).map(([vKey, vData]) => {
              const optionTitle = vData.title || `Stage ${vKey}`;
              const sel = (pose.variation === vKey) ? 'selected' : '';
              return `<option value="${vKey}" ${sel}>${optionTitle}</option>`;
          }).join('')}
       </select>`;

    return viewSpan + selectHtml;
}

export function generateInfoCellHTML(asana, pose, idx, isSpecial) {
    if (isSpecial) return `<td class="builder-info-cell builder-info-special">—</td>`;

    const activeVar = (pose.variation && asana?.variations?.[pose.variation]) ? asana.variations[pose.variation] : null;
    const holdSrc = window.getHoldTimes ? window.getHoldTimes(activeVar || asana) : { standard: 30 };
    const stdSec = holdSrc.standard ?? 30;
    const currentTier = pose.holdTier || 'standard';

    const tierBtn = (tier, label, sec) => {
        const isActive = currentTier === tier;
        const isDisabled = sec == null || (sec === stdSec && tier !== 'standard');
        const activeStyle = 'background:#1976d2; color:#fff; border-color:#1976d2; font-weight:700;';
        const normalStyle = 'background:#f5f5f7; color:#555; border-color:#d2d2d7;';
        return `<button class="b-tier" data-idx="${idx}" data-tier="${tier}" ${isDisabled ? 'disabled' : ''}
            style="border:1px solid; border-radius:4px; padding:2px 6px; font-size:0.7rem; cursor:pointer; min-width:32px; ${isActive ? activeStyle : normalStyle}">
            ${label}${sec != null ? `<div style="font-size:0.62rem; margin-top:1px;">${sec}s</div>` : ''}
        </button>`;
    };

    const rawCat = (asana?.category || '').trim();
    let catChipHTML = '';
    if (rawCat) {
        const displayCat = formatCategory(rawCat);
        const catKey = displayCat.toLowerCase().split(/[\s/]/)[0];
        catChipHTML = `<span class="binfo-cat" data-cat="${catKey}">${displayCat}</span>`;
    }

    return `<td class="builder-info-cell">
        <div style="display:flex; gap:3px; margin-bottom:4px;">
            ${tierBtn('short', 'S', holdSrc.short)}
            ${tierBtn('standard', 'STD', stdSec)}
            ${tierBtn('long', 'L', holdSrc.long)}
        </div>
        <div>${catChipHTML}</div>
        ${(asana?.requiresSides || asana?.requires_sides) ? `<div class="binfo-sides">↔ Both sides</div>` : ''}
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
    let name = target.english || target.name || `ID ${numId}`;
    if (varSuffix && target.variations) {
        const vd = target.variations[varSuffix];
        if (vd) {
            name += ` (${vd.title || varSuffix})`;
            const vdHold = window.getHoldTimes ? window.getHoldTimes(vd) : {};
            dur = vdHold.standard ?? dur;
        }
    }
    if (target.requiresSides || target.requires_sides) dur *= 2;
    return { name, dur };
};