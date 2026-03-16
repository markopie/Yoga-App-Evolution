import { $, safeListen, normaliseText } from "../utils/dom.js";
import { parseHoldTimes, parseSequenceText, buildHoldString } from "../utils/parsing.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { formatHMS, displayName } from "../utils/format.js";
import { parseSemicolonCommand } from "../utils/builderParser.js";
import { setupBuilderSearch } from "./builderSearch.js";

const getEffectiveTime = (id, time) => window.getEffectiveTime ? window.getEffectiveTime(id, time) : time;
const getAsanaIndex = () => {
    return Object.values(window.asanaLibrary || {}).filter(Boolean);
};

let builderPoses = [];
let builderMode = "edit";
let builderEditingCourseIndex = -1;
let builderEditingSupabaseId = null;

// ── Admin identity ────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'mark.opie@gmail.com';
const isAdmin = () => window.currentUserEmail === ADMIN_EMAIL;

// ── Sanskrit / English name toggle ────────────────────────────────────────────
let builderShowSanskrit = false;

function builderPoseName(asana, fallback) {
    if (!asana) return fallback || 'Unknown';
    if (builderShowSanskrit) {
        return asana.name || asana.iast || asana.english || fallback || 'Unknown';
    }
    return asana.english || asana.name || fallback || 'Unknown';
}

function builderRender() {
    const tbody = document.getElementById("builderTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const emptyMsg = document.getElementById("builderEmptyMsg");
    if (emptyMsg) emptyMsg.style.display = builderPoses.length ? "none" : "block";
 
    let totalSec = 0;
    const libraryArray = Object.values(window.asanaLibrary || {});
    const currentCategory = (document.getElementById("builderCategory")?.value || "").toLowerCase(); 
    const isFlow = currentCategory.includes("flow");
 
    builderPoses.forEach((pose, idx) => {
        const idStr = String(pose.id);
        const durOrReps = Number(pose.duration) || 0;
        const isMacro = idStr.startsWith("MACRO:");
        const isLoopStart = idStr === "LOOP_START";
        const isLoopEnd = idStr === "LOOP_END";
        let asana = null;
    
        // --- 1. TIME CALCULATION (Using Helper & Override) ---
        if (isMacro) {
            const targetTitle = idStr.replace("MACRO:", "").trim(); 
            const subCourse = window.courses ? window.courses.find(c => c.title === targetTitle) : null;
            
            if (subCourse && subCourse.poses) {
                const oneRoundSecs = subCourse.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1]), 0);
                totalSec += (oneRoundSecs * durOrReps); 
            }
        } else if (!isLoopStart && !isLoopEnd) {
            const normId = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
            asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
            const libraryStd = asana ? (window.getHoldTimes(asana).standard || 30) : 30;
            const activeTime = isFlow ? durOrReps : libraryStd;
            totalSec += getEffectiveTime(idStr, activeTime);
        }
    
        // --- 2. ROW CREATION & DRAG EVENTS ---
        const tr = document.createElement("tr");
        tr.draggable = true;
        tr.dataset.idx = idx;
        if (isMacro) tr.className = "builder-macro-row";
        if (isLoopStart || isLoopEnd) tr.className = "builder-loop-row";

        tr.ondragstart = (e) => {
            e.dataTransfer.setData("text/plain", idx);
            tr.style.opacity = "0.4";
        };
        tr.ondragend = () => tr.style.opacity = "1";
        tr.ondragover = (e) => {
            e.preventDefault();
            tr.style.borderTop = "2px solid #007aff";
        };
        tr.ondragleave = () => tr.style.borderTop = "none";
        tr.ondrop = (e) => {
            e.preventDefault();
            tr.style.borderTop = "none";
            const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
            const toIdx = idx;
            if (fromIdx !== toIdx) {
                const item = builderPoses.splice(fromIdx, 1)[0];
                builderPoses.splice(toIdx, 0, item);
                builderRender();
            }
        };
    
        // --- 3. UI RENDERING PREP ---
        const hasSides = asana && (asana.requires_sides || asana.requiresSides);
        const sideBadge = (!isMacro && hasSides) 
            ? `<span style="color:#2e7d32; font-size:0.7rem; font-weight:bold; margin-left:4px;">[Sides ×2]</span>` 
            : '';
    
        let varSelectHTML = '';
        const variations = asana ? (asana.variations || {}) : {};
        if (!isMacro && Object.keys(variations).length > 0) {
            varSelectHTML = `
               <select class="b-var" data-idx="${idx}" style="margin-left:8px; padding:2px 4px; border:1px solid #1976d2; border-radius:4px; font-size:0.75rem; background:#e3f2fd; color:#005580; max-width: 160px;">
                  <option value="">Base Pose</option>
                  ${Object.entries(variations).map(([vKey, vData]) => {
                      let optionTitle = vData.title || `Stage ${vKey}`;
                      const sel = (pose.variation === vKey) ? 'selected' : '';
                      return `<option value="${vKey}" ${sel}>${optionTitle}</option>`;
                  }).join('')}
               </select>`;
        }

        const isSpecial = isMacro || isLoopStart || isLoopEnd;
        let roundsHTML = '';
        if (isMacro || isLoopStart) {
            roundsHTML = `<div style="font-size:0.75rem; color:#0d47a1; margin-top:4px;">
                <label style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                    Rounds:
                    <input type="number" class="b-dur" data-idx="${idx}" value="${durOrReps}" min="1" style="width:50px; padding:2px 4px; border:1px solid #ccc; border-radius:4px;">
                </label>
            </div>`;
        }

        // --- INJECTED POSE BADGES ---
        let injectionBadgesHTML = '';
        if (!isSpecial && asana) {
            const lib = window.asanaLibrary || {};

            const resolvePose = (rawId) => {
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

            let prepId = asana.preparatory_pose_id;
            let recovId = asana.recovery_pose_id;

            const selectedVar = pose.variation;
            if (selectedVar && asana.variations && asana.variations[selectedVar]) {
                const vd = asana.variations[selectedVar];
                if (vd.preparatory_pose_id) prepId = vd.preparatory_pose_id;
                if (vd.recovery_pose_id)    recovId = vd.recovery_pose_id;
            }

            const prepInfo  = resolvePose(prepId);
            const recovInfo = resolvePose(recovId);

            if (prepInfo || recovInfo) {
                const badges = [];
                if (prepInfo) {
                    badges.push(`<span title="Auto-injected before this pose at runtime" style="
                        display:inline-flex; align-items:center; gap:3px;
                        background:#fff8e1; color:#f57f17; border:1px solid #ffe082;
                        border-radius:10px; padding:1px 7px; font-size:0.7rem; font-weight:600; white-space:nowrap;">
                        ⚡ +Prep: ${prepInfo.name} (${prepInfo.dur}s)
                    </span>`);
                }
                if (recovInfo) {
                    badges.push(`<span title="Auto-injected after this pose at runtime" style="
                        display:inline-flex; align-items:center; gap:3px;
                        background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7;
                        border-radius:10px; padding:1px 7px; font-size:0.7rem; font-weight:600; white-space:nowrap;">
                        💚 +Recovery: ${recovInfo.name} (${recovInfo.dur}s)
                    </span>`);
                }
                injectionBadgesHTML = `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;">${badges.join('')}</div>`;
            }
        }

        // --- 4. BUILD INFO CELL ---
        let infoHTML = '';
        if (isSpecial) {
            infoHTML = `<td class="builder-info-cell builder-info-special">—</td>`;
        } else {
            const activeVar = (pose.variation && asana?.variations?.[pose.variation]) ? asana.variations[pose.variation] : null;
            const holdSrc = window.getHoldTimes ? window.getHoldTimes(activeVar || asana) : {};
            const stdSec   = holdSrc.standard ?? null;
            const shortSec = holdSrc.short    ?? null;
            const longSec  = holdSrc.long     ?? null;

            const currentTier = pose.holdTier || 'standard';

            const tierBtn = (tier, label, sec) => {
                const isActive   = currentTier === tier;
                const isDisabled = sec == null || sec === stdSec && tier !== 'standard';
                const activeStyle  = 'background:#1976d2; color:#fff; border-color:#1976d2; font-weight:700;';
                const normalStyle  = 'background:#f5f5f5; color:#555; border-color:#ccc;';
                const disabledStyle = 'background:#f5f5f5; color:#bbb; border-color:#e0e0e0; cursor:not-allowed; opacity:0.5;';
                const style = isActive ? activeStyle : (isDisabled ? disabledStyle : normalStyle);
                const secLabel = sec != null ? `<div style="font-size:0.62rem; margin-top:1px; opacity:0.85;">${sec}s</div>` : '';
                return `<button class="b-tier" data-idx="${idx}" data-tier="${tier}"
                    ${isDisabled ? 'disabled' : ''}
                    style="border:1px solid; border-radius:4px; padding:2px 6px; font-size:0.7rem;
                           line-height:1.2; cursor:pointer; min-width:32px; ${style}">
                    ${label}${secLabel}
                </button>`;
            };

            const tierControlHTML = (stdSec != null) ? `
                <div style="display:flex; gap:3px; margin-bottom:4px;">
                    ${tierBtn('short',    'S',   shortSec)}
                    ${tierBtn('standard', 'STD', stdSec)}
                    ${tierBtn('long',     'L',   longSec)}
                </div>` : '';

            const rawCat = (asana?.category || '').trim();
            let catChipHTML = '';
            if (rawCat) {
                const catKey = rawCat.toLowerCase().split(/[\s/]/)[0];
                catChipHTML = `<span class="binfo-cat" data-cat="${catKey}">${rawCat}</span>`;
            }

            const sidesHTML = (asana?.requiresSides)
                ? `<span class="binfo-sides">↔ Both sides</span>`
                : '';

            infoHTML = `<td class="builder-info-cell">
                ${tierControlHTML}
                ${catChipHTML ? `<div>${catChipHTML}</div>` : ''}
                ${sidesHTML   ? `<div>${sidesHTML}</div>`   : ''}
            </td>`;
        }

        // --- 5. INJECT HTML ---
        tr.innerHTML = `
           <td style="padding:8px; text-align:center; color:#888;">
              <input type="checkbox" class="b-row-select" data-idx="${idx}" style="margin-bottom: 4px;" ${isSpecial ? 'disabled' : ''}><br>
              ${idx + 1}
           </td>
           <td style="padding:8px;">
              <div style="font-weight:bold; margin-bottom:4px; line-height: 1.2;">
                 ${isSpecial ? (pose.name || 'Unknown') : builderPoseName(asana, pose.name)} ${sideBadge}
              </div>
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" ${isSpecial ? 'readonly' : ''} style="width:${isSpecial ? 'auto' : '50px'}; padding:2px; border:1px solid #ccc; border-radius:4px; ${isSpecial ? 'background:#f0f0f0;' : ''}">
                 ${varSelectHTML}
              </div>
              ${injectionBadgesHTML}
              ${roundsHTML}
           </td>
           ${infoHTML}
           <td style="padding:8px; text-align:center; white-space:nowrap;">
              <button class="tiny b-move-top" data-idx="${idx}" title="Move to Top" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤒</button>
              <button class="tiny b-move-bot" data-idx="${idx}" title="Move to Bottom" ${idx === builderPoses.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤓</button>
              <button class="tiny b-move-up" data-idx="${idx}">▲</button>
              <button class="tiny b-move-dn" data-idx="${idx}">▼</button>
              <button class="tiny warn b-remove" data-idx="${idx}">✕</button>
           </td>`;
           
        tbody.appendChild(tr);

        // ── Ambiguous page warning banner ──────────────────────────────────────
        if (pose._ambiguous && pose._alternatives && pose._alternatives.length > 0) {
            const warnRow = document.createElement('tr');
            warnRow.dataset.ambiguousFor = idx;
            const altButtons = pose._alternatives.map(alt =>
                `<button class="b-amb-switch tiny" data-idx="${idx}" data-alt-id="${alt.id}" data-alt-name="${alt.name}"
                    style="background:#e65100; color:#fff; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:0.72rem; margin-left:4px;">
                    Switch to ${alt.name}
                </button>`
            ).join('');
            warnRow.innerHTML = `
                <td colspan="4" style="
                    background:#fff3e0; border-left:4px solid #ff6d00;
                    padding:6px 12px; font-size:0.78rem; color:#bf360c;">
                    ⚠️ <strong>Page ${pose._pageNum} has multiple asanas.</strong>
                    Currently using: <em>${pose.name}</em>.
                    <span style="margin-left:4px;">
                        ${altButtons}
                    </span>
                    <button class="b-amb-keep tiny" data-idx="${idx}"
                        style="background:#2e7d32; color:#fff; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:0.72rem; margin-left:8px;">
                        ✓ Keep ${pose.name}
                    </button>
                </td>`;
            tbody.appendChild(warnRow);
        }

        if (idx === 0 && builderPoses.length > 1) {
            tr.style.backgroundColor = "#fff9c4"; 
            setTimeout(() => { tr.style.transition = "background 1s"; tr.style.backgroundColor = ""; }, 100);
        }
    }); 
 
    // --- 5. LISTENERS ---
    const qS = (sel) => tbody.querySelectorAll(sel);
    qS('.b-id').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        let val = e.target.value.trim();
        if(!val.startsWith("MACRO:")) val = val.padStart(3, '0');
        builderPoses[i].id = val;
        const normId = typeof normalizePlate === "function" ? normalizePlate(val) : val;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch) {
            builderPoses[i].name = asanaMatch.name;
            if (asanaMatch && window.getHoldTimes) { const ah = window.getHoldTimes(asanaMatch); if (ah.standard) builderPoses[i].duration = ah.standard; }
        }
        builderRender();
    });

    qS('.b-std-time').forEach(el => el.onclick = () => {
        const i = el.dataset.idx;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderPoses[i].id) : builderPoses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch && window.getHoldTimes) { const ah = window.getHoldTimes(asanaMatch); if (ah.standard) { builderPoses[i].duration = ah.standard; builderRender(); } }
    });

    qS('.b-var').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        builderPoses[i].variation = e.target.value;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderPoses[i].id) : builderPoses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        const vHold = asanaMatch?.variations?.[e.target.value]?.hold;
        if (vHold) { 
            const hd = parseHoldTimes(vHold); 
            if(hd.standard) builderPoses[i].duration = hd.standard; 
        }
        builderRender();
    });

    qS('.b-dur').forEach(el => {
        el.onchange = (e) => {
            const idx = e.target.dataset.idx;
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 1) {
                val = 1;
                e.target.value = 1;
            }
            builderPoses[idx].duration = val;
            builderRender(); 
        };
    });
    qS('.b-move-up').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), -1));
    qS('.b-move-dn').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), 1));
    qS('.b-remove').forEach(el => el.onclick = () => removePose(parseInt(el.dataset.idx)));

    qS('.b-amb-keep').forEach(el => el.onclick = () => {
        const i = parseInt(el.dataset.idx);
        builderPoses[i]._ambiguous = false;
        builderPoses[i]._alternatives = [];
        builderRender();
    });

    qS('.b-amb-switch').forEach(el => el.onclick = () => {
        const i = parseInt(el.dataset.idx);
        const altId   = el.dataset.altId;
        const altName = el.dataset.altName;
        const libArray2 = Object.values(window.asanaLibrary || {});
        const altAsana = libArray2.find(a => String(a.id) === String(altId) || String(a.asanaNo) === String(altId));
        builderPoses[i].id         = altId;
        builderPoses[i].name       = altName;
        builderPoses[i].asana      = altAsana || { id: altId };
        builderPoses[i]._ambiguous = false;
        builderPoses[i]._alternatives = [];
        builderRender();
    });

    const saveBtn = document.getElementById('editCourseSaveBtn');
    if (saveBtn) {
        const hasAmbiguous = builderPoses.some(p => p._ambiguous);
        saveBtn.disabled = hasAmbiguous;
        saveBtn.title = hasAmbiguous ? 'Resolve all ⚠️ ambiguous pages before saving' : '';
        saveBtn.style.opacity = hasAmbiguous ? '0.45' : '';
    }

    qS('.b-move-top').forEach(el => el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        if (idx > 0) {
            const item = builderPoses.splice(idx, 1)[0];
            builderPoses.unshift(item);
            builderRender();
        }
    });

    qS('.b-move-bot').forEach(el => el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        if (idx < builderPoses.length - 1) {
            const item = builderPoses.splice(idx, 1)[0];
            builderPoses.push(item);
            builderRender();
        }
    });

    qS('.b-tier').forEach(el => el.onclick = () => {
        const i    = parseInt(el.dataset.idx);
        const tier = el.dataset.tier;
        const pose = builderPoses[i];
        if (!pose) return;

        const libraryArr = Object.values(window.asanaLibrary || {});
        const normId = typeof normalizePlate === 'function' ? normalizePlate(String(pose.id)) : String(pose.id);
        const asana  = libraryArr.find(a => String(a.id || a.asanaNo) === String(normId));
        const activeVar = (pose.variation && asana?.variations?.[pose.variation]) ? asana.variations[pose.variation] : null;
        const holdSrc = window.getHoldTimes ? window.getHoldTimes(activeVar || asana) : {};

        const tierDur = {
            short:    holdSrc.short    ?? holdSrc.standard ?? pose.duration,
            standard: holdSrc.standard ?? pose.duration,
            long:     holdSrc.long     ?? holdSrc.standard ?? pose.duration,
        }[tier];

        pose.holdTier = tier;
        pose.duration = Number(tierDur) || pose.duration;
        builderRender();
    });

   // --- 6. STATS UPDATER (Builder Modal) ---
    const statsEl = document.getElementById("builderStats");
    if (statsEl) {
        const tempPoses = builderPoses.map(p => {
            const tierTag = (!p.holdTier || p.holdTier === 'standard') ? '' : ` tier:${p.holdTier === 'short' ? 'S' : 'L'}`;
            const cleanNote = (p.note || '').replace(/\btier:[SL]\b/gi, '').trim();
            const noteWithTier = (cleanNote + tierTag).trim();
            // Format for getExpandedPoses
            return [p.id, p.duration, p.variation || "", p.variation || "", noteWithTier];
        });
        
        const tempSeq = { poses: tempPoses };
        const expanded = (typeof window.getExpandedPoses === "function") ? window.getExpandedPoses(tempSeq) : builderPoses;
        
        const authoredPoses  = expanded.filter(p => !String(p[4] || "").includes("Auto-Injected"));
        const injectedPoses  = expanded.filter(p =>  String(p[4] || "").includes("Auto-Injected"));

        // Central logic: use window.getEffectiveTime to match the Live Pill
        const extractTierLocal = (note) => { 
            const m = String(note||'').match(/\btier:(S|L|STD)\b/i); 
            return m ? m[1].toUpperCase() : ''; 
        };

        // 🌟 Use same args as durationDial.js to ensure 42m match
        const authoredSecs  = authoredPoses.reduce((acc, p) => 
            acc + getEffectiveTime(p[0], p[1], extractTierLocal(p[4]), p[3], p[4]), 0);
        
        const injectedSecs  = injectedPoses.reduce((acc, p) => 
            acc + getEffectiveTime(p[0], p[1], extractTierLocal(p[4]), p[3], p[4]), 0);

        const runtimeSecs   = authoredSecs + injectedSecs;
        const fmt = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

        if (injectedSecs > 0) {
            statsEl.innerHTML = `
                <span>${authoredPoses.length} poses · <strong>${fmt(authoredSecs)}</strong> authored</span>
                <span style="margin-left:10px; color:#f57f17; font-size:0.85em;" title="Additional time from auto-injected preparatory/recovery poses">
                    + ~${fmt(injectedSecs)} injected → 
                    <strong>~${fmt(runtimeSecs)} runtime</strong>
                </span>`;
        } else {
            statsEl.textContent = `${authoredPoses.length} poses · ${fmt(authoredSecs)} total (incl. reps & sides)`;
        }
    }
}

function movePose(idx, dir) {
    if (idx + dir < 0 || idx + dir >= builderPoses.length) return;
    const temp = builderPoses[idx];
    builderPoses[idx] = builderPoses[idx + dir];
    builderPoses[idx + dir] = temp;
    builderRender();
}

function removePose(idx) {
    builderPoses.splice(idx, 1);
    builderRender();
}

async function processSemicolonCommand(commandString) {
    const result = await parseSemicolonCommand(commandString, getAsanaIndex(), window.asanaLibrary);
    if (!result) return;

    const { title, category, validItems } = result;

    const titleEl = document.getElementById('builderTitle');
    const catEl   = document.getElementById('builderCategory');
    if (titleEl && title)    titleEl.value = title;
    if (catEl   && category) catEl.value   = category;

    if (validItems.length === 0) {
        console.warn('⚠️ processSemicolonCommand: no valid poses resolved');
        return;
    }

    validItems.forEach(item => {
        const duration = (item.asana && window.getHoldTimes) ? (window.getHoldTimes(item.asana).standard || 30) : 30;
        builderPoses.push({
            id: item.id, name: item.name, duration, variation: item.stageKey || '', note: item.stageKey ? `[${item.stageKey}]` : '', holdTier: 'standard',
            _ambiguous: item._ambiguous || false, _pageNum: item._pageNum || null, _alternatives: item._alternatives || []
        });
    });

    builderRender();
}

function openLinkSequenceModal() {
    const overlay   = document.getElementById('linkSequenceOverlay');
    const input     = document.getElementById('linkSequenceInput');
    const datalist  = document.getElementById('linkSequenceList');
    const repsInput = document.getElementById('linkSequenceReps');
    if (!overlay) return;

    const allCourses = [...(window.courses || [])];
    const sorted = [
        ...allCourses.filter(c => (c.category || '').toLowerCase().includes('flow')),
        ...allCourses.filter(c => !(c.category || '').toLowerCase().includes('flow'))
    ];
    if (datalist) {
        datalist.innerHTML = sorted.map(c => `<option value="${c.title}">${c.category ? '(' + c.category + ')' : ''}</option>`).join('');
    }
    if (input)     input.value     = '';
    if (repsInput) repsInput.value = '1';

    overlay.style.display = 'flex';
    setTimeout(() => { if (input) input.focus(); }, 50);
}

function openEditCourse() {
   if (!window.currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", window.currentSequence);
}

function builderOpen(mode, seq) {
    builderMode = mode;
    builderEditingCourseIndex = -1;
    builderPoses = []; 
    let targetId = seq ? (seq.supabaseId || seq.id) : null;

    const catInput = $("builderCategory"); 
    const titleEl = $("builderTitle");
    const modeLabel = $("builderModeLabel");
    const datalist = $("builderCategoryList");

    if (catInput) catInput.oninput = () => builderRender(); 

    builderEditingSupabaseId = targetId;
    document.body.classList.add("modal-open");
    
    // Initialize the Search UI component
    setupBuilderSearch(
        getAsanaIndex, 
        (asma) => { // onResultSelected
            addPoseToBuilder({
                id: asma.id,
                name: asma.name || asma.english,
                duration: (window.getHoldTimes ? window.getHoldTimes(asma).standard : null) || 30,
                variation: "",
                note: ""
            });
        },
        (val) => { // onSemicolonCommand
            processSemicolonCommand(val);
        }
    );

    const nameToggleBtn = document.getElementById('builderNameToggle');
    if (nameToggleBtn) {
        nameToggleBtn.style.background = builderShowSanskrit ? '#f9a825' : '#fff8e1';
        nameToggleBtn.style.color      = builderShowSanskrit ? '#fff'    : '#6d4c00';
        nameToggleBtn.textContent      = builderShowSanskrit ? 'अ SA' : 'अ EN';
        nameToggleBtn.onclick = () => {
            builderShowSanskrit = !builderShowSanskrit;
            nameToggleBtn.style.background = builderShowSanskrit ? '#f9a825' : '#fff8e1';
            nameToggleBtn.style.color      = builderShowSanskrit ? '#fff'    : '#6d4c00';
            nameToggleBtn.textContent      = builderShowSanskrit ? 'अ SA' : 'अ EN';
            builderRender();
        };
    }

    if (catInput && datalist) {
        const allCats = [...new Set(window.courses.map(c => c.category).filter(Boolean))].sort();
        datalist.innerHTML = allCats.map(c => `<option value="${c}"></option>`).join("");
        let tempVal = "";
        catInput.onfocus = () => { tempVal = catInput.value; catInput.value = ""; };
        catInput.onblur = () => { if (catInput.value === "") catInput.value = tempVal; };
    }

    if (mode === "new") {
       if (modeLabel) modeLabel.textContent = "New Sequence";
       if (titleEl) titleEl.value = "";
       if (catInput) catInput.value = "";
    } else {
       if (!seq) return;
       if (modeLabel) modeLabel.textContent = "Edit Sequence";
       if (titleEl) titleEl.value = seq.title || "";
       if (catInput) catInput.value = seq.category || "";
       
       const libraryArray = Object.values(window.asanaLibrary || {});
       const rawPoses = (window.currentSequenceOriginalPoses && seq === window.currentSequence) ? window.currentSequenceOriginalPoses : (seq.poses || []);
           rawPoses.forEach(p => {
             const rawId = Array.isArray(p[0]) ? p[0][0] : p[0] || "";
             const idStr = String(rawId);
             
             if (idStr === "LOOP_START" || idStr === "LOOP_END") {
                builderPoses.push({
                    id: idStr,
                    name: idStr === "LOOP_START" ? `🔁 Loop Starts Here (${p[1]} Rounds)` : "🔁 Loop Ends Here",
                    duration: idStr === "LOOP_START" ? Number(p[1]) || 2 : 0,
                    variation: "", note: ""
                });
                return;
             }
             if (idStr.startsWith("MACRO:")) {
                builderPoses.push({ id: idStr, name: `[Sequence] ${idStr.replace("MACRO:", "").trim()}`, duration: Number(p[1]) || 1, variation: "", note: p[4] || "" });
                return;
             }

             const id = idStr.padStart(3, '0');
             const asana = libraryArray.find(a => String(a.id) === id);
             
             let rawExtras = [p[2], p[4]].filter(Boolean).join(" | ").trim();
             let variation = p[3] || ""; 
             let extractedLabel = "";
    
             const bracketMatch = rawExtras.match(/\[(.*?)\]/);
             if (bracketMatch) {
                 extractedLabel = bracketMatch[1].trim(); 
                 rawExtras = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\|]+/, "").trim();
             } else {
                 extractedLabel = rawExtras; rawExtras = "";
             }
    
             if (!variation && asana?.variations && extractedLabel) {
                 const sortedKeys = Object.keys(asana.variations).sort((a,b) => b.length - a.length);
                 for (const vKey of sortedKeys) {
                     const vData = asana.variations[vKey];
                     const vTitle = (vData?.title || "").toLowerCase();
                     if (extractedLabel.toLowerCase() === vTitle || new RegExp(`\\b${vKey}\\b`, 'i').test(extractedLabel)) {
                         variation = vKey; extractedLabel = ""; break;
                     }
                 }
             } else if (variation && extractedLabel === variation) {
                 extractedLabel = ""; 
             }
    
             if (extractedLabel && !variation) {
                 rawExtras = (extractedLabel + (rawExtras ? " | " + rawExtras : "")).trim();
             }
    
             builderPoses.push({
                id: id,
                name: asana ? (asana.name || displayName(asana)) : id,
                duration: Number(p[1]) || 30,
                variation: variation,
                note: rawExtras,
                holdTier: (() => {
                    const tierMatch = (p[4] || '').match(/\btier:(S|L|STD)\b/i);
                    if (tierMatch) {
                        const t = tierMatch[1].toUpperCase();
                        if (t === 'S')   return 'short';
                        if (t === 'L')   return 'long';
                    }
                    return 'standard';
                })()
             });
         });
    }
 
    builderRender();
    $("editCourseBackdrop").style.display = "flex";
    setTimeout(() => { if($("builderSearch")) $("builderSearch").focus(); }, 50);
}

function builderCompileSequenceText() {
    return builderPoses.map(p => {
        const idStr = String(p.id);

        if (idStr.startsWith("MACRO:")) {
            return `${idStr} | ${p.duration} | [Sequence Link] ${p.note ? p.note : ''}`;
        }
        
        if (idStr.startsWith("LOOP_")) {
            return `${idStr} | ${p.duration} | [Repetition] ${p.note ? p.note : ''}`;
        }

        const id = String(p.id).padStart(3, '0');
        const dur = p.duration || 30;
        
        let cleanNote = (p.note || '').replace(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/ig, '')
                                      .replace(/\btier:[SL]\b/gi, '')
                                      .replace(/\s+/g, ' ')
                                      .trim();

        const varPart  = p.variation ? `[${p.variation}]` : `[]`;
        const tierTag  = (p.holdTier && p.holdTier !== 'standard') ? ` tier:${p.holdTier === 'short' ? 'S' : 'L'}` : '';
        const notePart = (cleanNote + tierTag).trim();
        
        return `${id} | ${dur} | ${varPart} ${notePart}`.trim();
    }).filter(s => s.trim().length > 0).join("\n");
}

function builderGetTitle() {
   return ($("builderTitle")?.value || "").trim();
}

function builderGetCategory() {
   return ($("builderCategory")?.value || "").trim();
}

async function saveOrUpdateCourse(payload, knownId = null) {
    if (knownId) {
        const updatePayload = { ...payload };
        delete updatePayload.user_id; 
        const { error } = await supabase.from('courses').update(updatePayload).eq('id', knownId);
        if (error) throw error;
        return { id: knownId };
    }

    const { data: existing, error: selErr } = await supabase
        .from('courses').select('id').eq('title', payload.title).eq('category', payload.category).maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
        const updatePayload = { ...payload };
        delete updatePayload.user_id;
        const { error } = await supabase.from('courses').update(updatePayload).eq('id', existing.id);
        if (error) throw error;
        return { id: existing.id };
    }

    const { data: inserted, error: insErr } = await supabase.from('courses').insert([payload]).select('id').single();
    if (insErr) throw insErr;
    return { id: inserted.id };
}

async function builderSave() {
    const title = builderGetTitle();
    if (!title) { alert("Please enter a title."); return; }
    
    const sequenceText = builderCompileSequenceText();
    const category = builderGetCategory();
    
    try {
        if (!supabase) return;
        if (!window.currentUserId) { alert("You must be signed in to save sequences."); return; }
        if (window.isGuestMode) { alert("Guest sessions cannot save sequences.\n\nSign in with Google to keep your work."); return; }

        const payload = { title, category, sequence_text: sequenceText, last_edited: new Date().toISOString(), user_id: window.currentUserId };
        if (isAdmin()) payload.is_system = true;

        if (builderEditingSupabaseId) {
            const updatePayload = { title, category, sequence_text: sequenceText, last_edited: new Date().toISOString() };
            if (isAdmin()) updatePayload.is_system = true;
            const { data: updateData, error: updateError } = await supabase.from('courses').update(updatePayload).eq('id', builderEditingSupabaseId).select();
            if (updateError) throw updateError;
            if (!updateData || updateData.length === 0) throw new Error('Update matched 0 rows \u2014 check RLS policies for courses table');
        } else {
            const { id: savedId } = await saveOrUpdateCourse(payload);
            if (savedId) builderEditingSupabaseId = savedId;
        }

        await loadCourses(); 
        
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            const newIdx = window.courses.findIndex(c => c.title === title);
            if (newIdx !== -1) {
                sel.value = String(newIdx);
                sel.dispatchEvent(new Event('change'));
            }
        }

        document.getElementById("editCourseBackdrop").style.display = "none";
        alert(`"${title}" saved!`);

    } catch(e) {
        console.error("❌ Save failed:", e);
        alert("Save failed. Please try again.\n\n(Detail: " + (e.message?.replace(/https?:\/\/\S+/g, "").trim() || "Unknown error") + ")");
    }
}

function addPoseToBuilder(poseData) {
    if (!poseData.holdTier) poseData.holdTier = 'standard';
    builderPoses.push(poseData);
    builderRender();
}

function createRepeatGroup() {
    const checkboxes = document.querySelectorAll('.b-row-select:checked');
    if (checkboxes.length === 0) { alert("Please select at least one pose using the checkboxes."); return; }

    const idxs = Array.from(checkboxes).map(c => parseInt(c.dataset.idx)).sort((a,b) => a - b);
    const startIdx = idxs[0];
    const endIdx = idxs[idxs.length - 1]; 
    
    for (let i = startIdx; i <= endIdx; i++) {
        const idStr = String(builderPoses[i].id);
        if (idStr.startsWith('MACRO:') || idStr.startsWith('LOOP_')) { alert("Cannot create a repeat group that intersects with Macros or other loops."); return; }
    }

    const overlay = document.getElementById("repetitionModalOverlay");
    const input = document.getElementById("repetitionInput");
    const confirmBtn = document.getElementById("btnConfirmRepetition");

    overlay.style.display = "flex";
    input.focus();
    input.select();

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = () => {
        const reps = parseInt(input.value, 10);
        if (isNaN(reps) || reps < 2) { alert("Please enter a number of 2 or more."); return; }

        overlay.style.display = "none";

        builderPoses.splice(endIdx + 1, 0, { id: "LOOP_END", name: "🔁 Loop Ends Here", duration: 0, variation: "", note: "" });
        builderPoses.splice(startIdx, 0, { id: "LOOP_START", name: `🔁 Loop Starts Here (${reps} Rounds)`, duration: reps, variation: "", note: "" });
        
        checkboxes.forEach(c => c.checked = false);
        builderRender();
        
        setTimeout(() => alert(`Successfully created a repetition group of ${endIdx - startIdx + 1} poses!`), 100);
    };
}

export {
    builderRender,
    movePose,
    removePose,
    processSemicolonCommand,
    openLinkSequenceModal,
    openEditCourse,
    builderOpen,
    builderSave,
    addPoseToBuilder,
    createRepeatGroup
};