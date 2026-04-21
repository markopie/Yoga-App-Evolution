/**
 * builderViewV2.js
 *
 * Entry point for the V2 Sequence Builder. Triggered by the "Review V2" button.
 *
 * Architecture:
 *  - Pure class-based CSS (styles/builder-v2.css) — zero inline styles.
 *  - Unidirectional data flow: state mutations always call render().
 *  - All business logic lives in pure functions, never in the DOM.
 *  - PDF export is handled by a headless engine (no hidden DOM cloning tricks).
 *
 * Public API:
 *  openBuilderV2(mode, seq)  — opens the modal
 *  builderV2SaveAndClose()   — save then close (bound to Save button in HTML)
 */

import { $, normaliseText } from '../utils/dom.js';
import { normalizePlate } from '../services/dataAdapter.js';
import { supabase } from '../services/supabaseClient.js';
import { saveSequence } from '../services/persistence.js';
import { parseSemicolonCommand } from '../utils/builderParser.js';
import { formatCategory, displayName } from '../utils/format.js';
import { PROP_REGISTRY } from '../config/propRegistry.js';
import {
    builderState,
    addPoseToBuilder,
    removePose,
    movePose,
    movePoseToIndex,
    setPoseSide,
    isFlowSequence,
} from '../store/builderState.js';
import { builderPoseName, resolvePoseInfo } from './builderTemplates.js';
import { setupBuilderSearch } from './builderSearch.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'mark.opie@gmail.com';
const isAdmin = () => window.currentUserEmail === ADMIN_EMAIL;

const MODAL_ID    = 'builderV2Backdrop';
const TBODY_ID    = 'bv2TableBody';
const STATS_ID    = 'bv2Stats';
const SEARCH_ID   = 'bv2Search';
const RESULTS_ID  = 'bv2SearchResults';

// ---------------------------------------------------------------------------
// Pure utility functions (no DOM side effects)
// ---------------------------------------------------------------------------

function getLib()      { return window.asanaLibrary || {}; }
function getLibArray() { return Object.values(getLib()); }

function resolveAsana(idStr) {
    const normId = normalizePlate(String(idStr).match(/^\d+/)?.[0] || idStr);
    const arr = getLibArray();
    return getLib()[normId] || arr.find(a => String(a.id || a.asanaNo) === String(normId)) || null;
}

function getHoldTimes(asana, variation) {
    if (!asana) return { standard: 30, short: 15, long: 60, flow: 5 };
    if (window.getHoldTimes) return window.getHoldTimes(asana, variation);
    const src = (variation && asana.variations?.[variation]) || asana;
    return src.hold_json || src.holdTimes || { standard: 30, short: 15, long: 60, flow: 5 };
}

function isProtected() {
    if (window.isProtectedSequence?.()) return true;
    const catEl = document.getElementById('bv2Category');
    const val = (catEl ? catEl.value : '').toLowerCase();
    return val.includes('flow') || val.includes('cycle');
}

function isFlowNow() {
    if (isFlowSequence()) return true;
    const catEl = document.getElementById('bv2Category');
    return (builderState.currentPlaybackMode === 'flow') ||
           (!builderState.currentPlaybackMode && (catEl?.value || '').toLowerCase().includes('flow'));
}

function formatDur(secs) {
    const s = Math.max(0, Math.round(Number(secs) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m && r) return `~${m}m ${r}s`;
    if (m) return `~${m}m`;
    return `~${r}s`;
}

function sanitizeFilename(title) {
    return (String(title || 'Yoga-Sequence').trim()
        .replace(/\.pdf$/i, '')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'Yoga-Sequence') + '.pdf';
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// State helpers (read from DOM only at save time, never during render)
// ---------------------------------------------------------------------------

function getTitle()    { return (document.getElementById('bv2Title')?.value || '').trim(); }
function getNotes()    { return (document.getElementById('bv2Notes')?.value || '').trim(); }
function getCategory() {
    const sel = document.getElementById('bv2Category');
    return (sel?.value || '').trim();
}

// ---------------------------------------------------------------------------
// Toolbar state
// ---------------------------------------------------------------------------

function updateToolbar() {
    const checked = document.querySelectorAll('.bv2-row-select:checked').length;
    const del = document.getElementById('bv2BtnDelete');
    const rep = document.getElementById('bv2BtnRepeat');
    if (del) del.classList.toggle('bv2-btn--hidden', checked === 0);
    if (rep) rep.classList.toggle('bv2-btn--hidden', checked === 0);
}

function getInsertionIndex() {
    const first = document.querySelector('.bv2-row-select:checked');
    return first ? parseInt(first.dataset.idx, 10) : -1;
}

function clearSelection() {
    document.querySelectorAll('.bv2-row-select:checked').forEach(cb => (cb.checked = false));
    updateToolbar();
}

// ---------------------------------------------------------------------------
// Compile state → JSON schema (persisted to Supabase)
// ---------------------------------------------------------------------------

function compileJSON() {
    return builderState.poses.map(p => {
        const idStr = String(p.id);
        if (idStr.startsWith('MACRO:')) {
            return { type: 'macro', sequence_id: idStr.replace('MACRO:', ''), rounds: Math.max(1, Number(p.duration) || 1) };
        }
        if (idStr === 'LOOP_START') return { type: 'loop_start', rounds: Math.max(2, Number(p.duration) || 2) };
        if (idStr === 'LOOP_END')   return { type: 'loop_end' };

        const props = [...(Array.isArray(p.props) ? p.props : [])].filter(pr => !pr.startsWith('side:'));
        Object.keys(PROP_REGISTRY).forEach(k => {
            if (p.note?.toLowerCase().includes(`:${k}`) && !props.includes(k)) props.push(k);
        });

        let stageId = null;
        if (p.variation) {
            const asana = getLib()[normalizePlate(p.id)];
            if (asana?.variations?.[p.variation]) stageId = asana.variations[p.variation].id;
        }

        let cleanNote = (p.note || '')
            .replace(/\btier:[SL]\b/gi, '')
            .replace(/\bside:[LR]\b/gi, '');
        Object.keys(PROP_REGISTRY).forEach(k => {
            cleanNote = cleanNote.replace(new RegExp(`:${k}`, 'gi'), '');
        });

        return {
            type: 'pose',
            pose_id: normalizePlate(p.id),
            stage_id: stageId,
            duration: Number(p.duration) || 0,
            tier: p.holdTier === 'short' ? 'S' : (p.holdTier === 'long' ? 'L' : null),
            side: p.side || null,
            props,
            note: cleanNote.trim(),
        };
    });
}

// ---------------------------------------------------------------------------
// Load sequence poses into builderState
// ---------------------------------------------------------------------------

function loadPoses(seq) {
    builderState.poses = [];
    if (!seq) return;

    const libArray = getLibArray();
    const seqIsFlow = builderState.currentPlaybackMode === 'flow';
    const rawPoses = (window.currentSequenceOriginalPoses && seq === window.currentSequence)
        ? window.currentSequenceOriginalPoses
        : (seq.poses || []);

    const isNativeSource = seq.isNativeJson || (rawPoses.length > 0 && rawPoses[0]?.[7]?.originalJson);

    rawPoses.forEach(p => {
        const rawId = Array.isArray(p[0]) ? p[0][0] : p[0] || '';
        const idStr = String(rawId);

        if (idStr === 'LOOP_START' || idStr === 'LOOP_END') {
            builderState.poses.push({
                id: idStr,
                name: idStr === 'LOOP_START' ? `Repeat Block (${p[1]} Rounds)` : 'End Repeat Block',
                duration: idStr === 'LOOP_START' ? Number(p[1]) || 2 : 0,
                variation: '', note: '',
            });
            return;
        }

        if (idStr.startsWith('MACRO:')) {
            const identifier = idStr.replace('MACRO:', '').trim();
            const sub = window.courses?.find(c =>
                String(c.title || '').trim().toLowerCase() === identifier.toLowerCase() ||
                String(c.id || '').trim() === identifier
            );
            builderState.poses.push({
                id: idStr,
                name: `[Sequence] ${sub ? sub.title : identifier}`,
                duration: Number(p[1]) || 1,
                variation: '', note: p[4] || '',
            });
            return;
        }

        const id = idStr.padStart(3, '0');
        const asana = libArray.find(a => String(a.id) === id);

        let variation = p[3] || '';
        let holdTier = 'standard';
        let rawExtras = '';
        let extractedLabel = '';
        const initialProps = [...(p[7]?.props || [])];

        if (isNativeSource && p[7]?.originalJson) {
            rawExtras = p[7].originalJson.note || '';
            const jt = p[7].originalJson.tier;
            holdTier = jt === 'S' ? 'short' : (jt === 'L' ? 'long' : 'standard');
        } else {
            rawExtras = [p[2], p[4]].filter(Boolean).join(' | ').trim();
            const bracketMatch = rawExtras.match(/\[(.*?)\]/);
            if (bracketMatch) {
                extractedLabel = bracketMatch[1].trim();
                rawExtras = rawExtras.replace(bracketMatch[0], '').replace(/^[\s|]+/, '').trim();
            } else {
                extractedLabel = rawExtras;
                rawExtras = '';
            }
            const tierMatch = (rawExtras || p[4] || '').match(/\btier:(S|L|STD)\b/i);
            if (tierMatch) {
                holdTier = tierMatch[1].toUpperCase() === 'S' ? 'short' : (tierMatch[1].toUpperCase() === 'L' ? 'long' : 'standard');
                rawExtras = rawExtras.replace(tierMatch[0], '').trim();
            }
            rawExtras = rawExtras.replace(/\bside:(L|R)\b/i, '').trim();
            Object.keys(PROP_REGISTRY).forEach(k => {
                if (rawExtras.toLowerCase().includes(`:${k}`)) {
                    rawExtras = rawExtras.replace(new RegExp(`:${k}`, 'gi'), '').trim();
                    if (!initialProps.includes(k)) initialProps.push(k);
                }
            });
            if (!variation && asana?.variations && extractedLabel) {
                const sorted = Object.keys(asana.variations).sort((a, b) => b.length - a.length);
                for (const vKey of sorted) {
                    const vData = asana.variations[vKey];
                    if (extractedLabel.toLowerCase() === (vData?.title || '').toLowerCase() ||
                        new RegExp(`\\b${vKey}\\b`, 'i').test(extractedLabel)) {
                        variation = vKey;
                        extractedLabel = '';
                        break;
                    }
                }
            } else if (variation && extractedLabel === variation) {
                extractedLabel = '';
            }
            if (extractedLabel && !variation) {
                rawExtras = (extractedLabel + (rawExtras ? ' | ' + rawExtras : '')).trim();
            }
        }

        const holdTimes = getHoldTimes(asana, variation || null);
        const parsedDuration = Number(p[1]) || (seqIsFlow ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30));

        builderState.poses.push({
            id,
            name: asana ? (asana.name || displayName(asana)) : id,
            duration: parsedDuration,
            variation,
            note: rawExtras,
            holdTier,
            flowHoldOverride: seqIsFlow ? parsedDuration : null,
            side: p[7]?.explicitSide || '',
            props: initialProps,
        });
    });
}

// ---------------------------------------------------------------------------
// Row HTML renderers (return strings, no DOM side effects)
// ---------------------------------------------------------------------------

function renderInjectionBadges(asana, pose) {
    if (!asana) return '';
    let prepId = asana.preparatory_pose_id;
    let recovId = asana.recovery_pose_id;
    const vd = pose.variation && asana.variations?.[pose.variation];
    if (vd) {
        prepId  = (vd.preparatory_pose_id  === undefined || vd.preparatory_pose_id  === '') ? null : vd.preparatory_pose_id;
        recovId = (vd.recovery_pose_id     === undefined || vd.recovery_pose_id     === '') ? null : vd.recovery_pose_id;
    }
    const lib = getLib();
    const prep  = resolvePoseInfo(prepId,  lib);
    const recov = resolvePoseInfo(recovId, lib);
    if (!prep && !recov) return '';
    const badges = [];
    if (prep)  badges.push(`<span class="bv2-badge bv2-badge--prep"  title="Auto-injected before this pose at runtime">+ Prep: ${prep.name} (${prep.dur}s)</span>`);
    if (recov) badges.push(`<span class="bv2-badge bv2-badge--recov" title="Auto-injected after this pose at runtime">+ Recovery: ${recov.name} (${recov.dur}s)</span>`);
    return `<div class="bv2-injection-badges">${badges.join('')}</div>`;
}

function renderVariationSelect(asana, pose, idx) {
    const vars = asana?.variations || {};
    const hasVars = Object.keys(vars).length > 0;
    const viewText = (pose.variation && vars[pose.variation])
        ? `(${vars[pose.variation].title || `Stage ${pose.variation}`})`
        : '';
    const viewSpan = viewText ? `<span class="bv2-var-view bv2-view-only">${viewText}</span>` : '';
    if (!hasVars) return viewSpan;

    const options = Object.entries(vars)
        .sort(([, a], [, b]) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(([k, v]) => `<option value="${k}" ${pose.variation === k ? 'selected' : ''}>${v.title || `Stage ${k}`}</option>`)
        .join('');

    return `${viewSpan}<select class="bv2-var bv2-edit-only" data-idx="${idx}"><option value="">Base Pose</option>${options}</select>`;
}

function renderSideSelector(asana, pose, idx) {
    if (!asana?.requires_sides && !asana?.requiresSides) return '';
    const s = pose.side || '';
    if (!isProtected()) {
        return `<span class="bv2-badge bv2-badge--sides">L+R</span>`;
    }
    return `<div class="bv2-side-selector bv2-edit-only">
        <button class="bv2-side${s === 'L'  ? ' bv2-side--active' : ''}" data-idx="${idx}" data-side="L">L</button>
        <button class="bv2-side${s === ''   ? ' bv2-side--active' : ''}" data-idx="${idx}" data-side="">L+R</button>
        <button class="bv2-side${s === 'R'  ? ' bv2-side--active' : ''}" data-idx="${idx}" data-side="R">R</button>
    </div>`;
}

function renderPropsDisplay(pose) {
    if (!pose.props?.length) return '';
    const chips = pose.props.map(pid => {
        const p = PROP_REGISTRY[pid];
        return `<span class="bv2-prop-chip bv2-view-only" data-prop="${pid}">${p ? p.icon : '?'} ${p ? p.label : pid}</span>`;
    }).join('');
    return `<div class="bv2-props-display bv2-view-only">${chips}</div>`;
}

function renderInfoCell(asana, pose, idx) {
    const idStr = String(pose.id);
    const isMacro     = idStr.startsWith('MACRO:');
    const isLoopStart = idStr === 'LOOP_START';
    const isLoopEnd   = idStr === 'LOOP_END';
    const isSpecial   = isMacro || isLoopStart || isLoopEnd;
    const flow        = isFlowNow();

    if (isSpecial && !isMacro) {
        return `<td class="bv2-col-info bv2-info--special">—</td>`;
    }

    if (isMacro) {
        const identifier = idStr.replace('MACRO:', '').trim();
        const sub = window.courses?.find(c =>
            String(c.title || '').trim().toLowerCase() === identifier.toLowerCase() ||
            String(c.id || '').trim() === identifier
        );
        let oneRound = 0;
        if (sub?.poses) {
            if (typeof window.getExpandedPoses === 'function' && typeof window.getPosePillTime === 'function') {
                const synth = { poses: [[`MACRO:${sub.id || identifier}`, 1, '', '', 'Linked Sequence: 1 Round']] };
                oneRound = window.getExpandedPoses(synth).reduce((a, p) => a + window.getPosePillTime(p), 0);
            } else {
                const eff = window.getEffectiveTime || ((id, d) => d);
                oneRound = sub.poses.reduce((a, sp) => a + eff(sp[0], sp[1], '', sp[3], sp[4], false, sub, sp[7] || null), 0);
            }
        }
        const total = oneRound * (Number(pose.duration) || 1);
        return `<td class="bv2-col-info bv2-info--macro">
            <div class="bv2-macro-timing">
                <span class="bv2-macro-timing__per">${formatDur(oneRound)} per round</span>
                <span class="bv2-macro-timing__x">× ${pose.duration || 1}</span>
                <span class="bv2-macro-timing__total">${formatDur(total)} total</span>
            </div>
        </td>`;
    }

    const ht = getHoldTimes(asana, pose.variation);
    const tier = pose.holdTier || 'standard';
    const currentFlow = Number(pose.flowHoldOverride ?? pose.duration ?? ht.flow ?? ht.standard ?? 5) || 5;

    const rawCat = (asana?.category || '').trim();
    const catChip = rawCat
        ? `<span class="bv2-cat-chip" data-cat="${formatCategory(rawCat).toLowerCase().split(/[\s/]/)[0]}">${formatCategory(rawCat)}</span>`
        : '';
    const bothSides = (asana?.requires_sides || asana?.requiresSides)
        ? `<span class="bv2-badge bv2-badge--both-sides">Both sides</span>` : '';

    if (flow) {
        return `<td class="bv2-col-info bv2-info--flow">
            <div class="bv2-flow-input bv2-edit-only">
                <label class="bv2-flow-input__label" for="bv2Flow${idx}">Flow hold</label>
                <input id="bv2Flow${idx}" class="bv2-flow-hold" type="number" min="1" step="1" data-idx="${idx}" value="${currentFlow}">
                <span class="bv2-flow-input__unit">secs</span>
            </div>
            <div class="bv2-info-meta">${catChip}${bothSides}</div>
        </td>`;
    }

    const mkTier = (t, label, sec) => {
        const active    = tier === t;
        const disabled  = sec == null || (sec === ht.standard && t !== 'standard');
        return `<button class="bv2-tier${active ? ' bv2-tier--active' : ''} bv2-edit-only"
                    data-idx="${idx}" data-tier="${t}"
                    ${disabled ? 'disabled' : ''}>
            ${label}<span class="bv2-tier__secs">${sec != null ? sec + 's' : '—'}</span>
        </button>`;
    };

    return `<td class="bv2-col-info">
        <div class="bv2-tier-group bv2-edit-only">
            ${mkTier('short',    'S',   ht.short)}
            ${mkTier('standard', 'STD', ht.standard ?? 30)}
            ${mkTier('long',     'L',   ht.long)}
        </div>
        <div class="bv2-info-meta">${catChip}${bothSides}</div>
    </td>`;
}

function renderRow(pose, idx) {
    const idStr = String(pose.id);
    const isMacro     = idStr.startsWith('MACRO:');
    const isLoopStart = idStr === 'LOOP_START';
    const isLoopEnd   = idStr === 'LOOP_END';
    const isSpecial   = isMacro || isLoopStart || isLoopEnd;
    const asana       = isSpecial ? null : resolveAsana(idStr);
    const devanagari  = asana?.devanagari || '';
    const iast        = asana?.iast || '';
    const idDisplay   = isMacro ? 'LINKED' : (isLoopStart || isLoopEnd ? 'BLOCK' : `ID ${idStr}`);
    const isFirst = idx === 0;
    const isLast  = idx === builderState.poses.length - 1;

    const roundsHTML = (isMacro || isLoopStart)
        ? `<div class="bv2-rounds bv2-edit-only">
            <label class="bv2-rounds__label">Rounds:
                <input type="number" class="bv2-dur" data-idx="${idx}" value="${pose.duration || 1}" min="1">
            </label>
           </div>`
        : '';

    const propsBtnHTML = (!isSpecial)
        ? `<button class="bv2-prop-btn bv2-edit-only" data-idx="${idx}"
                title="${(pose.props || []).length ? 'Props: ' + pose.props.map(p => PROP_REGISTRY[p]?.label).join(', ') : 'Add Props'}"
                aria-label="Manage props">
                <span class="bv2-prop-btn__icon${(pose.props || []).length ? ' bv2-prop-btn__icon--active' : ''}">&#x1F9F0;</span>
           </button>`
        : '';

    const idInputHTML = isLoopStart || isLoopEnd
        ? `<span class="bv2-system-block-label">System Block</span>`
        : isMacro
            ? `<span class="bv2-macro-id bv2-edit-only">${escHtml(idStr.replace('MACRO:', ''))}</span>
               <button class="bv2-macro-swap-btn bv2-edit-only" data-idx="${idx}">Swap</button>`
            : `<input type="text" class="bv2-id bv2-edit-only" data-idx="${idx}" value="${pose.id}">`;

    const injectBadges = (!isSpecial && asana && !isProtected()) ? renderInjectionBadges(asana, pose) : '';

    const rowClass = ['bv2-row',
        isMacro     ? 'bv2-row--macro'      : '',
        isLoopStart ? 'bv2-row--loop-start' : '',
        isLoopEnd   ? 'bv2-row--loop-end'   : '',
        pose._ambiguous ? 'bv2-row--ambiguous' : '',
    ].filter(Boolean).join(' ');

    return `<tr class="${rowClass}" draggable="true" data-idx="${idx}">
        <td class="bv2-col-id">
            <div class="bv2-col-id__inner">
                <div class="bv2-row-meta">
                    <input type="checkbox" class="bv2-row-select" data-idx="${idx}">
                    <span class="bv2-row-num">${idx + 1}</span>
                </div>
                <span class="bv2-id-label">${idDisplay}</span>
                ${devanagari ? `<span class="bv2-devanagari">${devanagari}</span>` : ''}
            </div>
        </td>

        <td class="bv2-col-details">
            <div class="bv2-pose-name-row">
                <span class="bv2-pose-name">${isSpecial ? escHtml(pose.name || 'Unknown') : builderPoseName(asana, pose.name, builderState.showSanskrit)}</span>
                ${renderVariationSelect(asana, pose, idx)}
                ${renderSideSelector(asana, pose, idx)}
            </div>
            ${iast ? `<div class="bv2-iast">${iast}</div>` : ''}
            ${renderPropsDisplay(pose)}
            <div class="bv2-edit-row bv2-edit-only">
                ${idInputHTML}
                ${propsBtnHTML}
                ${!isSpecial ? `<button class="bv2-row-search-btn bv2-edit-only" data-idx="${idx}" title="Search pose">&#x1F50D;</button>` : ''}
            </div>
            ${injectBadges}
            ${roundsHTML}
        </td>

        ${renderInfoCell(asana, pose, idx)}

        <td class="bv2-col-controls bv2-edit-only">
            <div class="bv2-order-controls">
                <button class="bv2-move bv2-move--top"  data-idx="${idx}" title="Top"    ${isFirst ? 'disabled' : ''}>&uarr;&uarr;</button>
                <button class="bv2-move bv2-move--up"   data-idx="${idx}" title="Up"     ${isFirst ? 'disabled' : ''}>&uarr;</button>
                <button class="bv2-move bv2-move--down" data-idx="${idx}" title="Down"   ${isLast  ? 'disabled' : ''}>&darr;</button>
                <button class="bv2-move bv2-move--bot"  data-idx="${idx}" title="Bottom" ${isLast  ? 'disabled' : ''}>&darr;&darr;</button>
            </div>
        </td>
    </tr>${renderAmbiguityRow(pose, idx)}`;
}

function renderAmbiguityRow(pose, idx) {
    if (!pose._ambiguous || !pose._alternatives?.length) return '';
    const alts = pose._alternatives.map(alt =>
        `<button class="bv2-amb-switch" data-idx="${idx}" data-alt-id="${alt.id}" data-alt-name="${escHtml(alt.name)}">
            Switch to ${escHtml(alt.name)}
        </button>`
    ).join('');
    return `<tr class="bv2-row--ambiguity-detail" data-ambiguous-for="${idx}">
        <td colspan="4" class="bv2-ambiguity-cell">
            <strong>Page ${pose._pageNum} has multiple matches.</strong> Currently: <em>${escHtml(pose.name)}</em>
            ${alts}
            <button class="bv2-amb-keep" data-idx="${idx}">Keep ${escHtml(pose.name)}</button>
        </td>
    </tr>`;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function renderStats() {
    const el = document.getElementById(STATS_ID);
    if (!el) return;

    const tempPoses = builderState.poses.map(p => {
        const tierTag = (!p.holdTier || p.holdTier === 'standard') ? '' : ` tier:${p.holdTier === 'short' ? 'S' : 'L'}`;
        const clean   = (p.note || '').replace(/\btier:[SL]\b/gi, '').trim();
        const meta = { explicitSide: p.side || null };
        return [p.id, p.duration, p.variation || '', p.variation || '', (clean + tierTag).trim(), null, null, meta];
    });

    if (typeof window.getExpandedPoses !== 'function') {
        el.textContent = `${builderState.poses.length} poses`;
        return;
    }

    const expanded = window.getExpandedPoses({ poses: tempPoses });
    const poseTime = p => typeof window.getPosePillTime === 'function' ? window.getPosePillTime(p) : Number(p?.[1]) || 0;
    const authored  = expanded.filter(p => !String(p[4] || '').includes('Auto-Injected'));
    const injected  = expanded.filter(p =>  String(p[4] || '').includes('Auto-Injected'));
    const authSecs  = authored.reduce((a, p) => a + poseTime(p), 0);
    const injSecs   = injected.reduce((a, p) => a + poseTime(p), 0);

    if (injSecs > 0) {
        el.innerHTML = `<span>${authored.length} poses · <strong>${formatDur(authSecs)}</strong> authored</span>
            <span class="bv2-stats__injected">+ ~${formatDur(injSecs)} injected → <strong>~${formatDur(authSecs + injSecs)} runtime</strong></span>`;
    } else {
        el.textContent = `${authored.length} poses · ${formatDur(authSecs)} total`;
    }
}

// ---------------------------------------------------------------------------
// Main render function — pure DOM sync from builderState
// ---------------------------------------------------------------------------

function render() {
    const tbody = document.getElementById(TBODY_ID);
    if (!tbody) return;

    tbody.innerHTML = builderState.poses.map(renderRow).join('');

    const empty = document.getElementById('bv2EmptyMsg');
    if (empty) empty.classList.toggle('bv2-hidden', builderState.poses.length > 0);

    const saveBtn = document.getElementById('bv2SaveBtn');
    if (saveBtn) {
        const hasAmb = builderState.poses.some(p => p._ambiguous);
        saveBtn.disabled = hasAmb;
        saveBtn.title = hasAmb ? 'Resolve all ambiguous pages before saving' : '';
    }

    bindRowEvents(tbody);
    renderStats();
    updateToolbar();
}

// ---------------------------------------------------------------------------
// Event binding (called after each render)
// ---------------------------------------------------------------------------

function findLoopRange(idx) {
    const pose = builderState.poses[idx];
    if (!pose) return null;
    if (pose.id === 'LOOP_START') {
        for (let j = idx + 1; j < builderState.poses.length; j++)
            if (builderState.poses[j].id === 'LOOP_END') return [idx, j];
    } else if (pose.id === 'LOOP_END') {
        for (let j = idx - 1; j >= 0; j--)
            if (builderState.poses[j].id === 'LOOP_START') return [j, idx];
    }
    return null;
}

function moveBlock(range, dir) {
    const [start, end] = range;
    if (dir === -1 && start > 0) {
        const block = builderState.poses.splice(start, end - start + 1);
        builderState.poses.splice(start - 1, 0, ...block);
    } else if (dir === 1 && end < builderState.poses.length - 1) {
        const block = builderState.poses.splice(start, end - start + 1);
        builderState.poses.splice(start + 1, 0, ...block);
    }
}

function bindRowEvents(tbody) {
    // Checkboxes
    tbody.querySelectorAll('.bv2-row-select').forEach(cb => {
        cb.onchange = () => {
            const idx = parseInt(cb.dataset.idx, 10);
            const pose = builderState.poses[idx];
            if (pose && (pose.id === 'LOOP_START' || pose.id === 'LOOP_END')) {
                let pairIdx = -1;
                if (pose.id === 'LOOP_START') {
                    for (let j = idx + 1; j < builderState.poses.length; j++)
                        if (builderState.poses[j].id === 'LOOP_END') { pairIdx = j; break; }
                } else {
                    for (let j = idx - 1; j >= 0; j--)
                        if (builderState.poses[j].id === 'LOOP_START') { pairIdx = j; break; }
                }
                if (pairIdx !== -1) {
                    const pair = tbody.querySelector(`.bv2-row-select[data-idx="${pairIdx}"]`);
                    if (pair) pair.checked = cb.checked;
                }
            }
            updateToolbar();
        };
    });

    // Variation select
    tbody.querySelectorAll('.bv2-var').forEach(el => {
        el.onchange = () => {
            const i = parseInt(el.dataset.idx, 10);
            builderState.poses[i].variation = el.value;
            const asana = resolveAsana(builderState.poses[i].id);
            if (asana) {
                const ht = getHoldTimes(asana, el.value);
                const dur = isFlowNow() ? (ht.flow || ht.standard || 5) : (ht.standard || 30);
                builderState.poses[i].duration = dur;
                builderState.poses[i].flowHoldOverride = isFlowNow() ? dur : null;
            }
            render();
        };
    });

    // ID input
    tbody.querySelectorAll('.bv2-id').forEach(el => {
        el.onchange = () => {
            const i = parseInt(el.dataset.idx, 10);
            let val = el.value.trim();
            if (!val.startsWith('MACRO:')) val = val.padStart(3, '0');
            if (builderState.poses[i].id !== val) builderState.poses[i].variation = '';
            builderState.poses[i].id = val;
            const asana = resolveAsana(val);
            if (asana) {
                builderState.poses[i].name = displayName(asana);
                const ht = getHoldTimes(asana, builderState.poses[i].variation || null);
                const dur = isFlowNow() ? (ht.flow || ht.standard || 5) : (ht.standard || 30);
                builderState.poses[i].duration = dur;
                builderState.poses[i].flowHoldOverride = isFlowNow() ? dur : null;
            }
            render();
        };
    });

    // Duration (rounds) input
    tbody.querySelectorAll('.bv2-dur').forEach(el => {
        el.onchange = () => {
            const i = parseInt(el.dataset.idx, 10);
            const val = Math.max(1, parseInt(el.value, 10) || 1);
            builderState.poses[i].duration = val;
            if (String(builderState.poses[i].id).startsWith('MACRO:'))
                builderState.poses[i].note = `Linked Sequence: ${val} Round${val !== 1 ? 's' : ''}`;
            else if (builderState.poses[i].id === 'LOOP_START')
                builderState.poses[i].name = `Repeat Block (${val} Rounds)`;
            render();
        };
    });

    // Flow hold input
    tbody.querySelectorAll('.bv2-flow-hold').forEach(el => {
        el.onchange = () => {
            const i = parseInt(el.dataset.idx, 10);
            const val = Math.max(1, parseInt(el.value, 10) || 1);
            builderState.poses[i].flowHoldOverride = val;
            builderState.poses[i].duration = val;
            render();
        };
    });

    // Tier buttons
    tbody.querySelectorAll('.bv2-tier').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            const i = parseInt(btn.dataset.idx, 10);
            const t = btn.dataset.tier;
            const pose = builderState.poses[i];
            if (!pose) return;
            const asana = resolveAsana(pose.id);
            const activeVar = pose.variation && asana?.variations?.[pose.variation] ? asana.variations[pose.variation] : null;
            const ht = getHoldTimes(activeVar || asana);
            const dur = { short: ht.short ?? ht.standard, standard: ht.standard ?? 30, long: ht.long ?? ht.standard }[t] ?? pose.duration;
            pose.holdTier = t;
            pose.duration = Number(dur) || pose.duration;
            render();
        };
    });

    // Side selector
    tbody.querySelectorAll('.bv2-side').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            setPoseSide(parseInt(btn.dataset.idx, 10), btn.dataset.side);
            render();
        };
    });

    // Prop picker button
    tbody.querySelectorAll('.bv2-prop-btn').forEach(btn => {
        btn.onclick = e => { e.preventDefault(); e.stopPropagation(); openPropPicker(parseInt(btn.dataset.idx, 10)); };
    });

    // Row search button
    tbody.querySelectorAll('.bv2-row-search-btn').forEach(btn => {
        btn.onclick = e => { e.preventDefault(); e.stopPropagation(); triggerRowSearch(parseInt(btn.dataset.idx, 10)); };
    });

    // Macro swap
    tbody.querySelectorAll('.bv2-macro-swap-btn').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            builderState.activeMacroSwapIdx = parseInt(btn.dataset.idx, 10);
            openLinkModal();
        };
    });

    // Move buttons
    tbody.querySelectorAll('.bv2-move--top').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            const i = parseInt(btn.dataset.idx, 10);
            if (i > 0) { const it = builderState.poses.splice(i, 1)[0]; builderState.poses.unshift(it); render(); }
        };
    });
    tbody.querySelectorAll('.bv2-move--up').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            const i = parseInt(btn.dataset.idx, 10);
            const range = findLoopRange(i);
            if (range) moveBlock(range, -1); else movePose(i, -1);
            render();
        };
    });
    tbody.querySelectorAll('.bv2-move--down').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            const i = parseInt(btn.dataset.idx, 10);
            const range = findLoopRange(i);
            if (range) moveBlock(range, 1); else movePose(i, 1);
            render();
        };
    });
    tbody.querySelectorAll('.bv2-move--bot').forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            const i = parseInt(btn.dataset.idx, 10);
            if (i < builderState.poses.length - 1) { const it = builderState.poses.splice(i, 1)[0]; builderState.poses.push(it); render(); }
        };
    });

    // Ambiguity
    tbody.querySelectorAll('.bv2-amb-keep').forEach(btn => {
        btn.onclick = () => {
            const i = parseInt(btn.dataset.idx, 10);
            builderState.poses[i]._ambiguous = false;
            builderState.poses[i]._alternatives = [];
            render();
        };
    });
    tbody.querySelectorAll('.bv2-amb-switch').forEach(btn => {
        btn.onclick = () => {
            const i = parseInt(btn.dataset.idx, 10);
            const altId = btn.dataset.altId;
            const altName = btn.dataset.altName;
            const altAsana = getLibArray().find(a => String(a.id) === String(altId) || String(a.asanaNo) === String(altId));
            builderState.poses[i].id = altId;
            builderState.poses[i].name = altName;
            builderState.poses[i].asana = altAsana || { id: altId };
            builderState.poses[i]._ambiguous = false;
            builderState.poses[i]._alternatives = [];
            render();
        };
    });

    // Drag and drop
    tbody.querySelectorAll('tr[draggable]').forEach(tr => {
        tr.ondragstart = e => {
            e.dataTransfer.setData('text/plain', tr.dataset.idx);
            tr.classList.add('bv2-row--dragging');
        };
        tr.ondragend = () => tr.classList.remove('bv2-row--dragging');
        tr.ondragover = e => { e.preventDefault(); tr.classList.add('bv2-row--drag-over'); };
        tr.ondragleave = () => tr.classList.remove('bv2-row--drag-over');
        tr.ondrop = e => {
            e.preventDefault();
            tr.classList.remove('bv2-row--drag-over');
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const to   = parseInt(tr.dataset.idx, 10);
            if (from !== to) { movePoseToIndex(from, to); render(); }
        };
    });
}

// ---------------------------------------------------------------------------
// Prop picker modal (self-contained, injected once)
// ---------------------------------------------------------------------------

function openPropPicker(idx) {
    const pose = builderState.poses[idx];
    if (!pose) return;

    let overlay = document.getElementById('bv2PropOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'bv2PropOverlay';
        overlay.className = 'bv2-overlay';
        overlay.innerHTML = `
            <div class="bv2-modal bv2-modal--sm">
                <header class="bv2-modal__header">
                    <strong>Prop Toolbox</strong>
                    <button class="bv2-modal__close" id="bv2PropClose">&#x2715;</button>
                </header>
                <div class="bv2-modal__body" id="bv2PropList"></div>
                <details class="bv2-prop-custom" id="bv2PropAccordion">
                    <summary class="bv2-prop-custom__summary">+ Add Custom Prop</summary>
                    <div class="bv2-prop-custom__form">
                        <div class="bv2-prop-custom__row">
                            <input type="text" id="bv2CustomIcon"  placeholder="Icon" class="bv2-input bv2-input--icon">
                            <input type="text" id="bv2CustomLabel" placeholder="Prop Name" class="bv2-input">
                        </div>
                        <input type="text" id="bv2CustomAudio"  placeholder="Audio cue" class="bv2-input">
                        <input type="text" id="bv2CustomBanner" placeholder="Banner title" class="bv2-input">
                        <textarea id="bv2CustomHtml" placeholder="Banner details (HTML OK)" class="bv2-textarea"></textarea>
                        <button id="bv2CustomSave" class="bv2-btn bv2-btn--primary">Create Prop</button>
                    </div>
                </details>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('bv2PropClose').onclick = () => (overlay.style.display = 'none');
        overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
    }

    const list = document.getElementById('bv2PropList');
    list.innerHTML = Object.values(PROP_REGISTRY).map(p => {
        const active = pose.props?.includes(p.id);
        return `<label class="bv2-prop-item${active ? ' bv2-prop-item--active' : ''}">
            <input type="checkbox" class="bv2-prop-cb" data-pid="${p.id}" ${active ? 'checked' : ''}>
            <span class="bv2-prop-item__icon">${p.icon}</span>
            <span class="bv2-prop-item__label">${p.label}</span>
        </label>`;
    }).join('');

    list.querySelectorAll('.bv2-prop-cb').forEach(cb => {
        cb.onchange = () => {
            const pid = cb.dataset.pid;
            if (!pose.props) pose.props = [];
            if (cb.checked) { if (!pose.props.includes(pid)) pose.props.push(pid); }
            else             { pose.props = pose.props.filter(id => id !== pid); }
            cb.closest('label').classList.toggle('bv2-prop-item--active', cb.checked);
            render();
        };
    });

    const saveCustom = document.getElementById('bv2CustomSave');
    // Clone to prevent stacking listeners
    const newSave = saveCustom.cloneNode(true);
    saveCustom.replaceWith(newSave);
    newSave.onclick = async () => {
        const icon   = document.getElementById('bv2CustomIcon').value.trim() || '🩹';
        const label  = document.getElementById('bv2CustomLabel').value.trim();
        const audio  = document.getElementById('bv2CustomAudio').value.trim()  || `Using ${label}.`;
        const btitle = document.getElementById('bv2CustomBanner').value.trim() || label;
        const bhtml  = document.getElementById('bv2CustomHtml').value.trim()   || `Instructions for ${label}.`;
        if (!label) { alert('Please enter a prop name.'); return; }
        const pid = label.toLowerCase().replace(/\s+/g, '_');
        if (PROP_REGISTRY[pid]) { alert('This prop already exists.'); return; }
        const { error } = await supabase.from('props').upsert({ id: pid, label, icon, color: '#007aff', audio_cue: audio, banner_title: btitle, banner_html: bhtml });
        if (error) { alert('Save failed: ' + error.message); return; }
        PROP_REGISTRY[pid] = { id: pid, label, icon, color: '#007aff', audioCue: audio, bannerTitle: btitle, bannerHtml: bhtml };
        if (!pose.props) pose.props = [];
        pose.props.push(pid);
        ['bv2CustomIcon','bv2CustomLabel','bv2CustomAudio','bv2CustomBanner','bv2CustomHtml'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('bv2PropAccordion').open = false;
        openPropPicker(idx);
        render();
    };

    overlay.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Row search modal
// ---------------------------------------------------------------------------

function triggerRowSearch(idx) {
    builderState.activeRowSearchIdx = idx;
    const overlay = document.getElementById('bv2RowSearchOverlay');
    const input   = document.getElementById('bv2RowSearchInput');
    const results = document.getElementById('bv2RowSearchResults');
    if (!overlay) return;
    if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
    if (input)   { input.value = ''; }
    if (results) { results.innerHTML = ''; }
    overlay.style.display = 'flex';
    setTimeout(() => input?.focus(), 80);
}

function bindRowSearch() {
    const input   = document.getElementById('bv2RowSearchInput');
    const results = document.getElementById('bv2RowSearchResults');
    const overlay = document.getElementById('bv2RowSearchOverlay');
    if (!input || !results) return;

    input.oninput = () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 1) { results.innerHTML = ''; return; }
        const norm = typeof normaliseText === 'function' ? normaliseText(q) : q;
        const lib  = getLibArray();

        const scored = lib.map(a => {
            let s = 0;
            const id  = String(a.id || '').toLowerCase();
            const eng = typeof normaliseText === 'function' ? normaliseText(a.english || a.name || '') : (a.english || a.name || '').toLowerCase();
            const ia  = typeof normaliseText === 'function' ? normaliseText(a.iast || '') : (a.iast || '').toLowerCase();
            if (id === norm || id.replace(/^0+/, '') === norm) s += 200;
            else if (id.startsWith(norm)) s += 100;
            if (eng.startsWith(norm) || ia.startsWith(norm)) s += 100;
            else if (eng.split(/[\s-]/).some(w => w.startsWith(norm)) || ia.split(/[\s-]/).some(w => w.startsWith(norm))) s += 80;
            else if (eng.includes(norm) || ia.includes(norm)) s += 30;
            if (eng.endsWith(' i') || ia.endsWith(' i')) s += 25;
            const mods = (eng + ' ' + ia).match(/\b(parivrtta|parsva|eka|dwi|baddha|urdhva|pinda|supta|ardha|ii|iii|iv|v|vi)\b/g) || [];
            s -= mods.length * 12;
            if (s > 0) s -= eng.length * 0.1;
            return { a, s };
        }).filter(m => m.s > 0).sort((a, b) => b.s - a.s).slice(0, 15);

        results.innerHTML = scored.map(({ a }) => `
            <div class="bv2-search-item" data-id="${a.id}">
                <span class="bv2-search-item__id">${a.id}</span>
                <div class="bv2-search-item__text">
                    <div class="bv2-search-item__name">${a.english || a.name}</div>
                    <div class="bv2-search-item__iast">${a.iast || ''}</div>
                </div>
            </div>`).join('') || `<div class="bv2-search-empty">No matches for "${q}"</div>`;

        results.querySelectorAll('.bv2-search-item').forEach(item => {
            item.onclick = () => {
                const id  = item.dataset.id;
                const idx = builderState.activeRowSearchIdx;
                if (idx >= 0 && builderState.poses[idx]) {
                    const val = String(id).padStart(3, '0');
                    const target = builderState.poses[idx];
                    if (target.id !== val) target.variation = '';
                    target.id = val;
                    const asana = resolveAsana(val);
                    if (asana) {
                        target.name = displayName(asana);
                        const ht = getHoldTimes(asana);
                        const dur = isFlowNow() ? (ht.flow || ht.standard || 5) : (ht.standard || 30);
                        target.duration = dur;
                        target.flowHoldOverride = isFlowNow() ? dur : null;
                    }
                    render();
                }
                if (overlay) overlay.style.display = 'none';
            };
        });
    };
}

// ---------------------------------------------------------------------------
// Link sequence modal
// ---------------------------------------------------------------------------

function openLinkModal() {
    const overlay = document.getElementById('bv2LinkOverlay');
    const input   = document.getElementById('bv2LinkInput');
    const results = document.getElementById('bv2LinkResults');
    const reps    = document.getElementById('bv2LinkReps');
    if (!overlay) return;

    if (input) { input.value = ''; input.oninput = handleLinkSearch; }
    if (reps)  reps.value = '1';
    if (results) { results.innerHTML = ''; }

    overlay.style.display = 'flex';
    setTimeout(() => { input?.focus(); handleLinkSearch(); }, 60);
}

function handleLinkSearch(e) {
    const term = ((e?.target?.value) || '').toLowerCase();
    const container = document.getElementById('bv2LinkResults');
    if (!container) return;

    const filterEl  = document.querySelector('#bv2LinkFilterGroup .bv2-filter-btn--active');
    const filter    = filterEl?.dataset.filter || 'all';
    const all       = [...(window.courses || [])];

    const matchesFilter = c =>
        filter === 'flow' ? c.isFlow :
        filter === 'cycle' ? c.isCycle :
        c.isMacroLinkable;

    let filtered = term
        ? all.filter(c =>
            (c.title || '').toLowerCase().includes(term) ||
            (c.category || '').toLowerCase().includes(term)
          ).sort((a, b) => Number(matchesFilter(b)) - Number(matchesFilter(a)))
        : all.filter(matchesFilter);

    const display = filtered.slice(0, 50);
    if (!display.length) {
        container.innerHTML = `<div class="bv2-search-empty">No sequences found.</div>`;
        return;
    }
    container.innerHTML = display.map(c => {
        const cat = c.categoryLabel || c.category || (c.isFlow ? 'Flow' : c.isCycle ? 'Cycle' : 'General');
        return `<div class="bv2-link-item" data-title="${escHtml(c.title || '')}">
            <span class="bv2-link-item__title">${escHtml(c.title || '')}</span>
            ${filter === 'all' ? `<span class="bv2-link-item__meta">${escHtml(cat)}</span>` : ''}
        </div>`;
    }).join('');

    container.querySelectorAll('.bv2-link-item').forEach(item => {
        item.onclick = () => {
            const inp = document.getElementById('bv2LinkInput');
            if (inp) inp.value = item.dataset.title;
            container.innerHTML = '';
        };
    });
}

function confirmLink() {
    const input   = document.getElementById('bv2LinkInput');
    const repsEl  = document.getElementById('bv2LinkReps');
    const overlay = document.getElementById('bv2LinkOverlay');
    const title   = (input?.value || '').trim();
    const reps    = parseInt(repsEl?.value || '1', 10) || 1;
    if (!title) { alert('Please select or type a sequence name.'); return; }
    const seq = (window.courses || []).find(c => c.title.trim().toLowerCase() === title.toLowerCase());
    if (!seq)  { alert('Sequence not found. Choose from the list.'); return; }

    const macro = {
        id: `MACRO:${seq.id}`,
        name: `[Sequence] ${seq.title}`,
        duration: reps,
        variation: '',
        note: `Linked Sequence: ${reps} Round${reps !== 1 ? 's' : ''}`,
    };

    const swapIdx = builderState.activeMacroSwapIdx;
    if (swapIdx !== undefined && swapIdx >= 0) {
        builderState.poses[swapIdx] = macro;
        builderState.activeMacroSwapIdx = -1;
    } else {
        addPoseToBuilder(macro, getInsertionIndex());
    }
    clearSelection();
    render();
    if (overlay) overlay.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Repeat group modal
// ---------------------------------------------------------------------------

function openRepeatModal() {
    const checks = document.querySelectorAll('.bv2-row-select:checked');
    if (!checks.length) { alert('Please select at least one pose.'); return; }
    const idxs = Array.from(checks).map(c => parseInt(c.dataset.idx)).sort((a, b) => a - b);
    const start = idxs[0];
    const end   = idxs[idxs.length - 1];
    for (let i = start; i <= end; i++) {
        const id = String(builderState.poses[i].id);
        if (id.startsWith('MACRO:') || id.startsWith('LOOP_')) {
            alert('Cannot create a repeat group that intersects with Macros or other loops.'); return;
        }
    }

    const overlay = document.getElementById('bv2RepeatOverlay');
    const input   = document.getElementById('bv2RepeatInput');
    const confirm = document.getElementById('bv2RepeatConfirm');
    if (!overlay) return;

    overlay.style.display = 'flex';
    setTimeout(() => { input?.focus(); input?.select(); }, 50);

    const fresh = confirm.cloneNode(true);
    confirm.replaceWith(fresh);
    fresh.onclick = () => {
        const reps = parseInt(input?.value, 10);
        if (isNaN(reps) || reps < 2) { alert('Please enter 2 or more.'); return; }
        overlay.style.display = 'none';
        builderState.poses.splice(end + 1, 0, { id: 'LOOP_END',   name: 'End Repeat Block', duration: 0,    variation: '', note: '' });
        builderState.poses.splice(start,   0, { id: 'LOOP_START', name: `Repeat Block (${reps} Rounds)`, duration: reps, variation: '', note: '' });
        checks.forEach(c => (c.checked = false));
        render();
    };
}

// ---------------------------------------------------------------------------
// Mode switching (View ↔ Edit)
// ---------------------------------------------------------------------------

function syncModeUI() {
    const backdrop = document.getElementById(MODAL_ID);
    const toggleBtn  = document.getElementById('bv2ModeBtn');
    const saveBtn    = document.getElementById('bv2SaveBtn');
    const cancelBtn  = document.getElementById('bv2CancelBtn');
    const exportWrap = document.getElementById('bv2ExportWrap');
    const editHeader = document.getElementById('bv2EditHeader');
    const viewHeader = document.getElementById('bv2ViewHeader');
    const notesRow   = document.getElementById('bv2NotesRow');
    const notesInput = document.getElementById('bv2Notes');
    const notesView  = document.getElementById('bv2NotesView');
    const titleInput = document.getElementById('bv2Title');
    const titleView  = document.getElementById('bv2TitleView');
    const catInput   = document.getElementById('bv2Category');
    const catView    = document.getElementById('bv2CategoryView');
    const restoreBtn = document.getElementById('bv2WarningRestore');
    const searchArea = document.getElementById('bv2SearchArea');
    const toolsPanel = document.getElementById('bv2ToolsPanel');

    if (!backdrop) return;

    if (builderState.isViewMode) {
        backdrop.classList.add('bv2-view-mode');
        if (editHeader) editHeader.classList.add('bv2-hidden');
        if (viewHeader) viewHeader.classList.remove('bv2-hidden');
        if (searchArea) searchArea.classList.add('bv2-hidden');
        if (toolsPanel) toolsPanel.classList.add('bv2-hidden');
        if (notesInput) notesInput.classList.add('bv2-hidden');
        if (saveBtn)    saveBtn.classList.add('bv2-hidden');
        if (exportWrap) exportWrap.classList.remove('bv2-hidden');
        if (toggleBtn)  { toggleBtn.textContent = 'Edit'; toggleBtn.className = 'bv2-btn bv2-btn--edit-mode'; }
        if (cancelBtn)  { cancelBtn.textContent = 'Close'; cancelBtn.className = 'bv2-btn bv2-btn--primary'; }

        // Sync view-mode displays
        if (titleView && titleInput) titleView.textContent = titleInput.value.trim() || 'Untitled Sequence';
        if (catView && catInput) {
            const raw = catInput.value.trim();
            if (!raw) {
                catView.innerHTML = '';
                catView.classList.add('bv2-hidden');
            } else {
                catView.classList.remove('bv2-hidden');
                catView.innerHTML = raw.split('>').map((p, i, arr) => {
                    const isFirst = i === 0;
                    return `<span class="bv2-cat-pill${isFirst ? ' bv2-cat-pill--main' : ''}">${escHtml(p.trim())}</span>` +
                           (i < arr.length - 1 ? `<span class="bv2-cat-sep">›</span>` : '');
                }).join('');
            }
        }

        const notesVal = notesInput?.value.trim() || '';
        if (notesRow) notesRow.classList.toggle('bv2-hidden', !notesVal);
        if (notesView && notesVal) {
            const emph = escHtml(notesVal).replace(/\b([A-Z][a-z\u0100-\u017Fāīūṛḷṅñṭḍṇśṣḥ]+( [IVX]+)?)\b/g, '<em>$1</em>');
            notesView.innerHTML = `
                <button class="bv2-warning-dismiss" id="bv2WarnDismiss" title="Dismiss">&#x2715;</button>
                <div class="bv2-notes-label"><strong>Safety Note</strong></div>
                <div class="bv2-notes-text">${emph}</div>`;
            document.getElementById('bv2WarnDismiss')?.addEventListener('click', () => {
                notesRow?.classList.add('bv2-hidden');
                builderState.isWarningDismissed = true;
                if (restoreBtn) restoreBtn.classList.remove('bv2-hidden');
            });
        }
        if (restoreBtn) restoreBtn.classList.toggle('bv2-hidden', !builderState.isWarningDismissed || !notesVal);
    } else {
        backdrop.classList.remove('bv2-view-mode');
        if (editHeader) editHeader.classList.remove('bv2-hidden');
        if (viewHeader) viewHeader.classList.add('bv2-hidden');
        if (searchArea) searchArea.classList.remove('bv2-hidden');
        if (toolsPanel) toolsPanel.classList.remove('bv2-hidden');
        if (notesInput) notesInput.classList.remove('bv2-hidden');
        if (notesRow)   { notesRow.classList.remove('bv2-hidden'); notesRow.classList.remove('bv2-collapsed'); }
        if (saveBtn)    saveBtn.classList.remove('bv2-hidden');
        if (exportWrap) exportWrap.classList.add('bv2-hidden');
        if (restoreBtn) restoreBtn.classList.add('bv2-hidden');
        if (toggleBtn)  { toggleBtn.textContent = 'View'; toggleBtn.className = 'bv2-btn bv2-btn--view-mode'; }
        if (cancelBtn)  { cancelBtn.textContent = 'Cancel'; cancelBtn.className = 'bv2-btn bv2-btn--secondary'; }
    }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function builderV2Save() {
    const title    = getTitle();
    const category = getCategory();
    let notes      = getNotes();
    const json     = compileJSON();

    if (!title) { alert('Please enter a title.'); return; }

    if (!notes) {
        notes = 'Welcome to your practice. Work within your limits. Ensure props are ready and the space is clear. Press Start to begin.';
    }

    const original = window.courses?.find(c => String(c.id || c.supabaseId) === String(builderState.editingSupabaseId));
    if (original && original.category !== category) {
        if (!confirm(`Moving from "${original.category || 'Uncategorized'}" to "${category}". Continue?`)) return;
    }

    if (!window.currentUserId) { alert('You must be signed in to save.'); return; }
    if (window.isGuestMode) { alert('Guest sessions cannot save sequences. Sign in to keep your work.'); return; }

    const payload = {
        title, category, condition_notes: notes, sequence_json: json,
        last_edited: new Date().toISOString(), user_id: window.currentUserId,
    };
    if (isAdmin()) payload.is_system = true;

    try {
        const { id: savedId } = await saveSequence(payload, builderState.editingSupabaseId);
        if (savedId) builderState.editingSupabaseId = savedId;

        await window.loadCourses();

        const filterEl = document.getElementById('categoryFilter');
        if (filterEl) filterEl.value = 'ALL';
        if (typeof window.renderCourseUI === 'function') window.renderCourseUI();

        const sel = document.getElementById('sequenceSelect');
        if (sel) {
            const ni = window.courses.findIndex(c => String(c.id) === String(savedId));
            if (ni !== -1) { sel.value = String(ni); sel.dispatchEvent(new Event('change')); }
        }

        builderState.isViewMode = true;
        syncModeUI();
        document.getElementById(MODAL_ID).style.display = 'none';
        document.body.classList.remove('modal-open');
        document.body.style.cursor = '';
        alert(`"${title}" saved!`);
    } catch (err) {
        console.error('[V2] Save failed:', err);
        alert('Save failed: ' + (err.message?.replace(/https?:\/\/\S+/g, '').trim() || 'Unknown error'));
    }
}

// ---------------------------------------------------------------------------
// PDF Export (headless engine — no hidden-DOM clone hacks)
// ---------------------------------------------------------------------------

async function loadExportLibs() {
    const libs = [
        { name: 'html2canvas', url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', check: () => typeof window.html2canvas !== 'undefined' },
        { name: 'jspdf',       url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',        check: () => typeof window.jspdf !== 'undefined' },
    ];
    for (const lib of libs) {
        if (!lib.check()) {
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = lib.url; s.onload = res; s.onerror = rej;
                document.head.appendChild(s);
            });
        }
    }
}

function showProgress(msg) {
    let el = document.getElementById('bv2PdfProgress');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bv2PdfProgress';
        el.className = 'bv2-pdf-progress';
        document.body.appendChild(el);
    }
    el.innerHTML = `<div class="bv2-pdf-progress__card">
        <div class="bv2-pdf-progress__spinner"></div>
        <div class="bv2-pdf-progress__msg">${msg}</div>
    </div>`;
    document.body.style.cursor = 'progress';
}

function hideProgress() {
    document.getElementById('bv2PdfProgress')?.remove();
    document.body.style.cursor = '';
}

async function downloadPdf() {
    await loadExportLibs();
    showProgress('Preparing PDF…');

    // Build a clean offscreen snapshot
    const snapshot = buildPdfSnapshot();
    document.body.appendChild(snapshot);

    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const W = pdf.internal.pageSize.getWidth();
        const H = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const cw = W - margin * 2;
        let y = margin;

        const capture = async el => {
            try {
                const old = el.style.width;
                el.style.setProperty('width', '800px', 'important');
                const c = await html2canvas(el, { scale: 2, width: 800, useCORS: true, backgroundColor: '#ffffff', logging: false });
                el.style.width = old;
                return c;
            } catch { return null; }
        };

        const addCanvas = (canvas, addPage) => {
            if (!canvas) return;
            const h = canvas.height * (cw / canvas.width);
            if (!isFinite(h) || h <= 0) return;
            if (addPage && y + h > H - margin) { pdf.addPage(); y = margin; }
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', margin, y, cw, h);
            y += h;
        };

        // Header components
        for (const sel of ['.bv2-pdf-header', '.bv2-pdf-notes', '.bv2-pdf-date']) {
            const el = snapshot.querySelector(sel);
            if (el && !el.classList.contains('bv2-hidden')) addCanvas(await capture(el), true);
        }

        // Table header (reusable for new pages)
        const thead = snapshot.querySelector('.bv2-pdf-table thead');
        const theadCanvas = thead ? await capture(thead) : null;
        const theadH = theadCanvas ? theadCanvas.height * (cw / theadCanvas.width) : 0;
        const drawThead = () => {
            if (theadCanvas && theadH > 0) {
                pdf.addImage(theadCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', margin, y, cw, theadH);
                y += theadH;
            }
        };
        drawThead();

        // Table rows
        const rows = Array.from(snapshot.querySelectorAll('.bv2-pdf-table tbody tr'));
        for (let i = 0; i < rows.length; i++) {
            showProgress(`Rendering row ${i + 1} of ${rows.length}…`);
            const rc = await capture(rows[i]);
            if (!rc) continue;
            const rh = rc.height * (cw / rc.width);
            if (y + rh > H - margin) { pdf.addPage(); y = margin; drawThead(); }
            pdf.addImage(rc.toDataURL('image/jpeg', 0.98), 'JPEG', margin, y, cw, rh);
            y += rh;
        }

        pdf.save(sanitizeFilename(getTitle() || 'Yoga-Sequence'));
    } catch (err) {
        console.error('[V2 PDF]', err);
        window.print();
    } finally {
        snapshot.remove();
        hideProgress();
    }
}

function buildPdfSnapshot() {
    const wrap = document.createElement('div');
    wrap.className = 'bv2-pdf-snapshot';

    const title    = getTitle() || 'Untitled Sequence';
    const category = getCategory();
    const notes    = getNotes();
    const dateStr  = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const catHtml = category
        ? category.split('>').map((p, i, arr) =>
            `<span class="bv2-cat-pill${i === 0 ? ' bv2-cat-pill--main' : ''}">${escHtml(p.trim())}</span>` +
            (i < arr.length - 1 ? `<span class="bv2-cat-sep">›</span>` : '')
          ).join('')
        : '';

    wrap.innerHTML = `
        <div class="bv2-pdf-header">
            ${catHtml ? `<div class="bv2-cat-breadcrumb">${catHtml}</div>` : ''}
            <h1 class="bv2-pdf-title">${escHtml(title)}</h1>
        </div>
        ${notes ? `<div class="bv2-pdf-notes"><strong>Safety Note</strong><p>${escHtml(notes)}</p></div>` : ''}
        <div class="bv2-pdf-date">Practice Date: ${dateStr}</div>
        <table class="bv2-pdf-table">
            <thead>
                <tr>
                    <th class="bv2-pdf-col-id"># / ID</th>
                    <th class="bv2-pdf-col-details">Pose Details</th>
                    <th class="bv2-pdf-col-info">Info</th>
                </tr>
            </thead>
            <tbody>${buildPdfRows()}</tbody>
        </table>`;

    document.body.appendChild(wrap);
    return wrap;
}

function buildPdfRows() {
    return builderState.poses.map((pose, idx) => {
        const idStr   = String(pose.id);
        const isMacro = idStr.startsWith('MACRO:');
        const isLoop  = idStr.startsWith('LOOP_');
        const asana   = (!isMacro && !isLoop) ? resolveAsana(idStr) : null;
        const devHTML = asana?.devanagari ? `<div class="bv2-devanagari">${asana.devanagari}</div>` : '';
        const idLabel = isMacro ? 'LINK' : (isLoop ? 'BLOCK' : `ID ${idStr}`);

        const varText = (pose.variation && asana?.variations?.[pose.variation])
            ? `<span class="bv2-var-view">(${asana.variations[pose.variation].title || `Stage ${pose.variation}`})</span>` : '';
        const name = (isMacro || isLoop) ? escHtml(pose.name || 'Unknown') : builderPoseName(asana, pose.name, builderState.showSanskrit);
        const iast = (!isMacro && !isLoop && asana?.iast) ? `<div class="bv2-iast">${asana.iast}</div>` : '';

        const rowClass = [
            'bv2-pdf-row',
            isMacro ? 'bv2-row--macro' : '',
            isLoop  ? 'bv2-row--loop-start' : '',
        ].filter(Boolean).join(' ');

        return `<tr class="${rowClass}">
            <td class="bv2-pdf-col-id">
                <div class="bv2-row-num">${idx + 1}</div>
                <div class="bv2-id-label">${idLabel}</div>
                ${devHTML}
            </td>
            <td class="bv2-pdf-col-details">
                <div class="bv2-pose-name">${name} ${varText}</div>
                ${iast}
            </td>
            ${renderInfoCell(asana, pose, idx)}
        </tr>`;
    }).join('');
}

// ---------------------------------------------------------------------------
// Category initialisation
// ---------------------------------------------------------------------------

function initCategory(seq) {
    const el      = document.getElementById('bv2Category');
    const datalist = document.getElementById('bv2CategoryList');
    if (!el) return;

    const cats = [...new Set((window.courses || []).map(c => c.category).filter(Boolean))].sort();
    if (datalist) datalist.innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');

    el.value = seq?.category || '';
    el.onchange = () => render();
    el.oninput  = () => render();
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
}

// ---------------------------------------------------------------------------
// Open / bootstrap
// ---------------------------------------------------------------------------

export function openBuilderV2(mode, seq) {
    const backdrop = document.getElementById(MODAL_ID);
    if (!backdrop) { console.error('[V2] Modal #bv2Backdrop not found in DOM.'); return; }

    if (window.speechSynthesis) window.speechSynthesis.cancel();

    builderState.mode = mode;
    builderState.editingCourseIndex = -1;
    builderState.poses = [];
    builderState.isViewMode = (mode === 'edit');
    builderState.editingSupabaseId = seq ? (seq.supabaseId || seq.id) : null;
    builderState.isWarningDismissed = false;

    // Title
    const titleInput = document.getElementById('bv2Title');
    if (titleInput) titleInput.value = (mode === 'edit') ? (seq?.title || '') : '';

    // Notes
    const notesInput = document.getElementById('bv2Notes');
    if (notesInput) notesInput.value = (mode === 'edit') ? (seq?.condition_notes || '') : '';

    // Category
    initCategory(seq);

    // Mode label
    const modeLabel = document.getElementById('bv2ModeLabel');
    if (modeLabel) modeLabel.textContent = (mode === 'new') ? 'New Sequence' : 'Sequence Review';

    // Playback mode
    if (mode === 'edit' && seq) {
        builderState.currentPlaybackMode = seq.playbackMode || (seq.isFlow ? 'flow' : 'standard');
    } else {
        builderState.currentPlaybackMode = null;
    }

    // Load poses
    if (mode === 'edit' && seq) loadPoses(seq);

    // Sanskrit toggle
    const nameToggle = document.getElementById('bv2NameToggle');
    if (nameToggle) {
        nameToggle.classList.toggle('bv2-btn--active', !!builderState.showSanskrit);
        nameToggle.onclick = () => {
            builderState.showSanskrit = !builderState.showSanskrit;
            nameToggle.classList.toggle('bv2-btn--active', builderState.showSanskrit);
            render();
        };
    }

    document.body.classList.add('modal-open');
    syncModeUI();
    render();
    backdrop.style.display = 'flex';
    setTimeout(() => document.getElementById(SEARCH_ID)?.focus(), 60);
}

// ---------------------------------------------------------------------------
// Wire global events (runs once at module load time)
// ---------------------------------------------------------------------------

function wireV2() {
    // Mode toggle
    const modeBtn = document.getElementById('bv2ModeBtn');
    if (modeBtn) {
        modeBtn.onclick = () => {
            builderState.isViewMode = !builderState.isViewMode;
            syncModeUI();
        };
    }

    // Save
    const saveBtn = document.getElementById('bv2SaveBtn');
    if (saveBtn) saveBtn.onclick = builderV2Save;

    // Cancel / Close
    const cancelBtn = document.getElementById('bv2CancelBtn');
    const closeBtn  = document.getElementById('bv2CloseBtn');
    const closeModal = () => {
        document.getElementById(MODAL_ID).style.display = 'none';
        document.body.classList.remove('modal-open');
    };
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (closeBtn)  closeBtn.onclick  = closeModal;

    // Delete selected
    const delBtn = document.getElementById('bv2BtnDelete');
    if (delBtn) {
        delBtn.onclick = () => {
            const cbs = document.querySelectorAll('.bv2-row-select:checked');
            if (!cbs.length) { alert('Check the poses you want to delete.'); return; }
            if (!confirm(`Remove ${cbs.length} selected pose(s)?`)) return;
            Array.from(cbs).map(c => parseInt(c.dataset.idx)).sort((a, b) => b - a).forEach(i => removePose(i));
            render();
        };
    }

    // Repeat
    const repBtn = document.getElementById('bv2BtnRepeat');
    if (repBtn) repBtn.onclick = openRepeatModal;

    // Link modal
    const linkBtn = document.getElementById('bv2BtnLink');
    if (linkBtn) linkBtn.onclick = openLinkModal;

    const linkConfirm = document.getElementById('bv2LinkConfirm');
    if (linkConfirm) linkConfirm.onclick = confirmLink;

    const linkClose = document.getElementById('bv2LinkClose');
    if (linkClose) linkClose.onclick = () => { document.getElementById('bv2LinkOverlay').style.display = 'none'; };

    const linkOverlay = document.getElementById('bv2LinkOverlay');
    if (linkOverlay) {
        linkOverlay.onclick = e => { if (e.target === linkOverlay) linkOverlay.style.display = 'none'; };
        // Filter buttons
        const filterGrp = document.getElementById('bv2LinkFilterGroup');
        if (filterGrp) {
            filterGrp.onclick = e => {
                const btn = e.target.closest('.bv2-filter-btn');
                if (!btn) return;
                filterGrp.querySelectorAll('.bv2-filter-btn').forEach(b => b.classList.remove('bv2-filter-btn--active'));
                btn.classList.add('bv2-filter-btn--active');
                handleLinkSearch();
            };
        }
    }

    // Repeat modal close
    const repClose = document.getElementById('bv2RepeatClose');
    const repOverlay = document.getElementById('bv2RepeatOverlay');
    if (repClose)   repClose.onclick = () => { if (repOverlay) repOverlay.style.display = 'none'; };
    if (repOverlay) repOverlay.onclick = e => { if (e.target === repOverlay) repOverlay.style.display = 'none'; };

    // Row search modal close
    const rsClose = document.getElementById('bv2RowSearchClose');
    const rsOverlay = document.getElementById('bv2RowSearchOverlay');
    if (rsClose)   rsClose.onclick = () => { if (rsOverlay) rsOverlay.style.display = 'none'; };
    if (rsOverlay) rsOverlay.onclick = e => { if (e.target === rsOverlay) rsOverlay.style.display = 'none'; };

    bindRowSearch();

    // Add blank
    const addBlank = document.getElementById('bv2BtnAddBlank');
    if (addBlank) {
        addBlank.onclick = () => {
            const insertAt = getInsertionIndex();
            addPoseToBuilder({ id: '', duration: 30, variation: '', note: '', holdTier: 'standard', props: [] }, insertAt);
            clearSelection();
            render();
            setTimeout(() => {
                const tbody = document.getElementById(TBODY_ID);
                const target = insertAt >= 0
                    ? tbody?.querySelector(`tr[data-idx="${insertAt}"]`)
                    : tbody?.lastElementChild;
                target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        };
    }

    // Export
    const pdfBtn = document.getElementById('bv2BtnPdf');
    if (pdfBtn) pdfBtn.onclick = downloadPdf;
    const printBtn = document.getElementById('bv2BtnPrint');
    if (printBtn) printBtn.onclick = () => window.print();

    // Restore warning
    const restoreBtn = document.getElementById('bv2WarningRestore');
    if (restoreBtn) {
        restoreBtn.onclick = () => {
            builderState.isWarningDismissed = false;
            restoreBtn.classList.add('bv2-hidden');
            const nr = document.getElementById('bv2NotesRow');
            if (nr) nr.classList.remove('bv2-hidden');
        };
    }

    // Search (uses existing setupBuilderSearch logic but scoped to V2 IDs)
    setupBuilderSearch(
        () => Object.values(window.asanaLibrary || {}).filter(Boolean),
        asma => {
            const ht  = getHoldTimes(asma);
            const dur = isFlowNow() ? (ht.flow || ht.standard || 5) : (ht.standard || 30);
            addPoseToBuilder({
                id: asma.id, name: displayName(asma), duration: dur,
                variation: '', note: '', holdTier: 'standard',
                flowHoldOverride: isFlowNow() ? dur : null, props: [],
            }, getInsertionIndex());
            clearSelection();
            render();
        },
        async cmdStr => {
            const result = await parseSemicolonCommand(cmdStr, Object.values(window.asanaLibrary || {}).filter(Boolean), window.asanaLibrary);
            if (!result) return;
            const { title, category, validItems } = result;
            if (title) { const el = document.getElementById('bv2Title'); if (el) el.value = title; }
            if (category) { const el = document.getElementById('bv2Category'); if (el) el.value = category; }
            if (!validItems.length) return;
            let insertAt = getInsertionIndex();
            validItems.forEach(item => {
                const ht = item.asana
                    ? (window.getHoldTimes ? window.getHoldTimes(item.asana, item.stageKey || null) : (item.asana.hold_json || { standard: 30, flow: 5 }))
                    : { standard: 30, flow: 5 };
                const dur = isFlowNow() ? (ht.flow || ht.standard || 5) : (ht.standard || 30);
                addPoseToBuilder({
                    id: item.id, name: item.name, duration: dur,
                    variation: item.stageKey || '', note: item.stageKey ? `[${item.stageKey}]` : '',
                    holdTier: 'standard', flowHoldOverride: isFlowNow() ? dur : null, props: [],
                    _ambiguous: item._ambiguous || false, _pageNum: item._pageNum || null, _alternatives: item._alternatives || [],
                }, insertAt);
                if (insertAt >= 0) insertAt++;
            });
            clearSelection();
            render();
        }
    );

    // The search box ID used by setupBuilderSearch must be 'builderSearch'.
    // V2 uses a different ID (bv2Search), so we redirect search events.
    // We monkeypatch by pointing the search module at V2 IDs after it sets up.
    const origSearch = document.getElementById('builderSearch');
    const v2Search   = document.getElementById(SEARCH_ID);
    const origResults = document.getElementById('builderSearchResults');
    const v2Results  = document.getElementById(RESULTS_ID);

    if (v2Search && origSearch) {
        // Intercept keydown/input on V2 search box, forwarding to orig handlers
        const forwardKey = e => {
            // Temporarily swap IDs so setupBuilderSearch targets can work
            origSearch.style.display = 'none';
            v2Search.id = 'builderSearch';
            if (v2Results) v2Results.id = 'builderSearchResults';
            v2Search.dispatchEvent(new KeyboardEvent(e.type, e));
            v2Search.id = SEARCH_ID;
            if (v2Results) v2Results.id = RESULTS_ID;
        };
        // Simpler: just rewire the already-set handlers directly
        if (origSearch.onkeydown) {
            v2Search.onkeydown = e => {
                const tmp = document.getElementById('builderSearch');
                v2Search.id = 'builderSearch';
                if (v2Results) v2Results.id = 'builderSearchResults';
                origSearch.onkeydown?.call(v2Search, e);
                v2Search.id = SEARCH_ID;
                if (v2Results) v2Results.id = RESULTS_ID;
            };
        }
        if (origSearch.oninput) {
            v2Search.oninput = e => {
                v2Search.id = 'builderSearch';
                if (v2Results) v2Results.id = 'builderSearchResults';
                origSearch.oninput?.call(v2Search, e);
                v2Search.id = SEARCH_ID;
                if (v2Results) v2Results.id = RESULTS_ID;
            };
        }
        if (origSearch.onblur) {
            v2Search.onblur = e => {
                v2Search.id = 'builderSearch';
                if (v2Results) v2Results.id = 'builderSearchResults';
                origSearch.onblur?.call(v2Search, e);
                v2Search.id = SEARCH_ID;
                if (v2Results) v2Results.id = RESULTS_ID;
            };
        }
    }
}

// Bootstrap once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireV2);
} else {
    wireV2();
}
