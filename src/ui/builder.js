import { $, safeListen, normaliseText } from "../utils/dom.js";
import { parseHoldTimes, parseSequenceText, buildHoldString } from "../utils/parsing.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { saveSequence } from "../services/persistence.js";
import { parseSemicolonCommand } from "../utils/builderParser.js";
import { setupBuilderSearch } from "./builderSearch.js";
import { formatHMS, displayName, formatCategory } from "../utils/format.js";
import { builderPoseName, generateVariationSelectHTML, generateInfoCellHTML, resolvePoseInfo, buildMacroInfoHTML } from "./builderTemplates.js";
import { builderState, movePose, movePoseToIndex, removePose, addPoseToBuilder, isFlowSequence } from '../store/builderState.js';
import { updateBuilderModeUI, openLinkSequenceModal } from "./builderUI.js";

const getEffectiveTime = (id, time) => window.getEffectiveTime ? window.getEffectiveTime(id, time) : time;
const getAsanaIndex = () => Object.values(window.asanaLibrary || {}).filter(Boolean);

const ADMIN_EMAIL = 'mark.opie@gmail.com';
const isAdmin = () => window.currentUserEmail === ADMIN_EMAIL;
const resetBusyCursorState = () => {
    const activeEl = document.activeElement;
    if (activeEl && typeof activeEl.blur === "function") activeEl.blur();
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
};
function builderRender() {
    const tbody = document.getElementById("builderTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const emptyMsg = document.getElementById("builderEmptyMsg");
    if (emptyMsg) emptyMsg.style.display = builderState.poses.length ? "none" : "block";
 
    let totalSec = 0;
    const libraryArray = Object.values(window.asanaLibrary || {});
    const libMap = window.asanaLibrary || {};
    const catElement = document.getElementById("builderCategory");
    const currentCategory = (catElement ? (catElement.textContent || catElement.value || "") : "").toLowerCase();
    const isFlow = isFlowSequence()
        || (builderState.currentPlaybackMode == null && currentCategory.includes("flow"));
    const macroDurationCache = new Map();
 
    builderState.poses.forEach((pose, idx) => {
        const idStr = String(pose.id);
        const durOrReps = Number(pose.duration) || 0;
        const isMacro = idStr.startsWith("MACRO:");
        const isLoopStart = idStr === "LOOP_START";
        const isLoopEnd = idStr === "LOOP_END";
        const isSpecial = isMacro || isLoopStart || isLoopEnd;
        const disableRowSelect = isLoopStart || isLoopEnd;
        const idStrNumeric = idStr.match(/^\d+/)?.[0] || idStr;
        let asana = null;
    
        let macroInfo = null;
        if (isMacro) {
            const targetTitle = idStr.replace("MACRO:", "").trim(); 
            const subCourse = window.courses ? window.courses.find(c => c.title === targetTitle) : null;
            if (subCourse && subCourse.poses) {
                const cacheKey = String(subCourse.id || subCourse.supabaseId || subCourse.title || targetTitle);
                let oneRoundSecs = macroDurationCache.get(cacheKey);
                if (oneRoundSecs == null) {
                    oneRoundSecs = typeof window.calculateTotalSequenceTime === "function"
                        ? window.calculateTotalSequenceTime(subCourse)
                        : subCourse.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1], '', sp[3], sp[4], false, subCourse), 0);
                    macroDurationCache.set(cacheKey, oneRoundSecs);
                }
                totalSec += (oneRoundSecs * durOrReps);
                macroInfo = { oneRoundSecs, rounds: durOrReps, note: subCourse.category || pose.note || '' };
            }
        } else if (!isSpecial) {
            const normId = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
            asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
            const holdTimes = asana ? window.getHoldTimes(asana, pose.variation || null) : { standard: 30, flow: 5 };
            const libraryStd = holdTimes.standard || 30;
            const flowTime = Number(pose.flowHoldOverride ?? durOrReps ?? holdTimes.flow ?? holdTimes.standard ?? 5) || 5;
            const activeTime = isFlow ? flowTime : libraryStd;
            totalSec += getEffectiveTime(idStr, activeTime);
        }

        const devanagari = asana?.devanagari || asana?.name || ""; 
        const iast = asana?.iast || "";
    
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
                movePoseToIndex(fromIdx, toIdx);
                builderRender();
            }
        };

        const sideBadge = (!isMacro && (asana?.requires_sides || asana?.requiresSides)) 
            ? `<span style="color:#2e7d32; font-size:0.7rem; font-weight:bold; margin-left:4px;">[Sides ×2]</span>` 
            : '';

        let roundsHTML = '';
        if (isMacro || isLoopStart) {
            roundsHTML = `<div style="font-size:0.75rem; color:#0d47a1; margin-top:4px;">
                <label style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                    Rounds:
                    <input type="number" class="b-dur" data-idx="${idx}" value="${durOrReps}" min="1" style="width:50px; padding:2px 4px; border:1px solid #ccc; border-radius:4px;">
                </label>
            </div>`;
        }

        let injectionBadgesHTML = '';
        if (!isSpecial && asana) {
            let prepId = asana.preparatory_pose_id;
            let recovId = asana.recovery_pose_id;
            const selectedVar = pose.variation;

            if (selectedVar && asana.variations && asana.variations[selectedVar]) {
                const vd = asana.variations[selectedVar];
                if (vd.preparatory_pose_id) prepId = vd.preparatory_pose_id;
                if (vd.recovery_pose_id) recovId = vd.recovery_pose_id;
            }

            const prepInfo = resolvePoseInfo(prepId, libMap);
            const recovInfo = resolvePoseInfo(recovId, libMap);

            if (prepInfo || recovInfo) {
                const badges = [];
                if (prepInfo) badges.push(`<span title="Auto-injected before this pose at runtime" style="display:inline-flex; align-items:center; gap:3px; background:#fff8e1; color:#f57f17; border:1px solid #ffe082; border-radius:10px; padding:1px 7px; font-size:0.7rem; font-weight:600; white-space:nowrap;">⚡ +Prep: ${prepInfo.name} (${prepInfo.dur}s)</span>`);
                if (recovInfo) badges.push(`<span title="Auto-injected after this pose at runtime" style="display:inline-flex; align-items:center; gap:3px; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:10px; padding:1px 7px; font-size:0.7rem; font-weight:600; white-space:nowrap;">💚 +Recovery: ${recovInfo.name} (${recovInfo.dur}s)</span>`);
                injectionBadgesHTML = `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;">${badges.join('')}</div>`;
            }
        }

        tr.innerHTML = `
        <td style="padding: 12px 4px 12px 12px; text-align: center; width: 85px; min-width: 85px; vertical-align: top; border-bottom: 1px solid #eee;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%;">
                <div style="display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" class="b-row-select" data-idx="${idx}" ${disableRowSelect ? 'disabled' : ''} style="margin: 0; width: 14px; height: 14px;">                    <span style="font-weight: 800; color: #007aff; font-size: 0.9rem;">${idx + 1}</span>
                </div>
                <div class="builder-row-meta">${isMacro ? "LINKED SEQUENCE" : `ID ${idStrNumeric}`}</div>
                <div style="font-size: 1.5rem; line-height: 1.2; color: #1a1a1a; font-family: 'Noto Sans Devanagari', sans-serif; margin-top: 6px; white-space: normal; word-wrap: break-word; text-align: center; width: 100%;">
                    ${devanagari}
                </div>
            </div>
        </td>
           <td style="padding:12px 8px; vertical-align: top; border-bottom: 1px solid #eee;">
              <div style="font-weight:700; font-size:1.1rem; line-height: 1.2; display:flex; align-items:center; flex-wrap:wrap;">
                 <span>${isSpecial ? (pose.name || 'Unknown') : builderPoseName(asana, pose.name, builderState.showSanskrit)}</span>
                ${generateVariationSelectHTML(asana, pose, idx)}
                 ${sideBadge}
              </div>
              <div style="font-size:0.85rem; color:var(--color-text-secondary); font-style:italic; margin-bottom:6px;">
                 ${iast}
              </div>
              <div class="edit-only-inline" style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" ${isSpecial ? 'readonly' : ''} style="width:${isSpecial ? 'auto' : '50px'}; padding:2px; border:1px solid #ccc; border-radius:4px;">
                 ${!isSpecial ? `<button class="tiny b-row-search-btn" data-idx="${idx}" style="padding:2px 6px; border-radius:4px; border:1px solid #ccc; background:#fff; cursor:pointer;" title="Search Asana">🔍</button>` : ''}
              </div>
              ${injectionBadgesHTML}
              ${roundsHTML}
           </td>
           ${isMacro ? buildMacroInfoHTML(macroInfo || { rounds: durOrReps, note: pose.note || "" }) : generateInfoCellHTML(asana, pose, idx, { isSpecial, isFlow })}
           <td class="builder-order-column">
  <div class="order-controls-group">
      <button class="tiny b-move-top" data-idx="${idx}" title="Move to Top" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤒</button>
      <button class="tiny b-move-up" data-idx="${idx}">▲</button>
      <button class="tiny b-move-dn" data-idx="${idx}">▼</button>
      <button class="tiny b-move-bot" data-idx="${idx}" title="Move to Bottom" ${idx === builderState.poses.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤓</button>
  </div>
</td>`;
           
        tbody.appendChild(tr);

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
                <td colspan="4" style="background:#fff3e0; border-left:4px solid #ff6d00; padding:6px 12px; font-size:0.78rem; color:#bf360c;">
                    ⚠️ <strong>Page ${pose._pageNum} has multiple asanas.</strong> Currently using: <em>${pose.name}</em>.
                    <span style="margin-left:4px;">${altButtons}</span>
                    <button class="b-amb-keep tiny" data-idx="${idx}" style="background:#2e7d32; color:#fff; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:0.72rem; margin-left:8px;">
                        ✓ Keep ${pose.name}
                    </button>
                </td>`;
            tbody.appendChild(warnRow);
        }

        if (idx === 0 && builderState.poses.length > 1) {
            tr.style.backgroundColor = "#fff9c4"; 
            setTimeout(() => { tr.style.transition = "background 1s"; tr.style.backgroundColor = ""; }, 100);
        }
    }); 

    if (builderState.poses.length > 0) {
        const spacer = document.createElement("tr");
        spacer.innerHTML = `<td colspan="4" style="height: 80px; border: none; background: transparent; padding: 0;"></td>`;
        tbody.appendChild(spacer);
    }
 
    const qS = (sel) => tbody.querySelectorAll(sel);
    
    qS('.b-row-search-btn').forEach(btn => btn.onclick = (e) => {
        builderState.activeRowSearchIdx = parseInt(e.target.dataset.idx);
        document.getElementById('rowSearchOverlay').style.display = 'flex';
        document.getElementById('rowSearchInput').value = '';
        document.getElementById('rowSearchResults').innerHTML = '';
        setTimeout(() => document.getElementById('rowSearchInput').focus(), 50);
    });

    qS('.b-id').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        let val = e.target.value.trim();
        if(!val.startsWith("MACRO:")) val = val.padStart(3, '0');
        builderState.poses[i].id = val;
        const normId = typeof normalizePlate === "function" ? normalizePlate(val) : val;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch) {
            builderState.poses[i].name = asanaMatch.name;
            if (asanaMatch && window.getHoldTimes) {
                const ah = window.getHoldTimes(asanaMatch, builderState.poses[i].variation || null);
                const nextDuration = isFlow ? (ah.flow || ah.standard || 5) : (ah.standard || 30);
                builderState.poses[i].duration = nextDuration;
                builderState.poses[i].flowHoldOverride = isFlow ? nextDuration : null;
            }
        }
        builderRender();
    });

    qS('.b-var').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        builderState.poses[i].variation = e.target.value;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderState.poses[i].id) : builderState.poses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        const holdSource = asanaMatch?.variations?.[e.target.value]?.hold || asanaMatch?.hold || '';
        if (holdSource) { 
            const hd = parseHoldTimes(holdSource); 
            const nextDuration = isFlow ? (hd.flow || hd.standard || 5) : (hd.standard || 30);
            builderState.poses[i].duration = nextDuration; 
            builderState.poses[i].flowHoldOverride = isFlow ? nextDuration : null;
        }
        builderRender();
    });

    qS('.b-flow-hold').forEach(el => el.onchange = (e) => {
        const idx = e.target.dataset.idx;
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        builderState.poses[idx].flowHoldOverride = val;
        builderState.poses[idx].duration = val;
        builderRender();
    });

    qS('.b-dur').forEach(el => el.onchange = (e) => {
        const idx = e.target.dataset.idx;
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 1) val = 1;
        builderState.poses[idx].duration = val;
         if (String(builderState.poses[idx].id || "").startsWith("MACRO:")) {
            builderState.poses[idx].note = `Linked Sequence: ${val} Round${val !== 1 ? 's' : ''}`;
        }
        builderRender(); 
    });

    qS('.b-move-up').forEach(el => el.onclick = () => { movePose(parseInt(el.dataset.idx), -1); builderRender(); });
    qS('.b-move-dn').forEach(el => el.onclick = () => { movePose(parseInt(el.dataset.idx), 1); builderRender(); });

    qS('.b-amb-keep').forEach(el => el.onclick = () => {
        const i = parseInt(el.dataset.idx);
        builderState.poses[i]._ambiguous = false;
        builderState.poses[i]._alternatives = [];
        builderRender();
    });

    qS('.b-amb-switch').forEach(el => el.onclick = () => {
        const i = parseInt(el.dataset.idx);
        const altId   = el.dataset.altId;
        const altName = el.dataset.altName;
        const altAsana = libraryArray.find(a => String(a.id) === String(altId) || String(a.asanaNo) === String(altId));
        builderState.poses[i].id = altId;
        builderState.poses[i].name = altName;
        builderState.poses[i].asana = altAsana || { id: altId };
        builderState.poses[i]._ambiguous = false;
        builderState.poses[i]._alternatives = [];
        builderRender();
    });

    const saveStatusBtn = document.getElementById('editCourseSaveBtn');
    if (saveStatusBtn) {
        const hasAmbiguous = builderState.poses.some(p => p._ambiguous);
        saveStatusBtn.disabled = hasAmbiguous;
        saveStatusBtn.title = hasAmbiguous ? 'Resolve all ⚠️ ambiguous pages before saving' : '';
        saveStatusBtn.style.opacity = hasAmbiguous ? '0.45' : '';
    }

    qS('.b-move-top').forEach(el => el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        if (idx > 0) {
            const item = builderState.poses.splice(idx, 1)[0];
            builderState.poses.unshift(item);
            builderRender();
        }
    });

    qS('.b-move-bot').forEach(el => el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        if (idx < builderState.poses.length - 1) {
            const item = builderState.poses.splice(idx, 1)[0];
            builderState.poses.push(item);
            builderRender();
        }
    });

    qS('.b-tier').forEach(el => el.onclick = () => {
        const i    = parseInt(el.dataset.idx);
        const tier = el.dataset.tier;
        const pose = builderState.poses[i];
        if (!pose) return;

        const normId = typeof normalizePlate === 'function' ? normalizePlate(String(pose.id)) : String(pose.id);
        const asana  = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
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

    const statsEl = document.getElementById("builderStats");
    if (statsEl) {
        const tempPoses = builderState.poses.map(p => {
            const tierTag = (!p.holdTier || p.holdTier === 'standard') ? '' : ` tier:${p.holdTier === 'short' ? 'S' : 'L'}`;
            const cleanNote = (p.note || '').replace(/\btier:[SL]\b/gi, '').trim();
            const noteWithTier = (cleanNote + tierTag).trim();
            return [p.id, p.duration, p.variation || "", p.variation || "", noteWithTier];
        });
        
        const tempSeq = { poses: tempPoses };
        const expanded = (typeof window.getExpandedPoses === "function") ? window.getExpandedPoses(tempSeq) : builderState.poses;
        
        const authoredPoses  = expanded.filter(p => !String(p[4] || "").includes("Auto-Injected"));
        const injectedPoses  = expanded.filter(p =>  String(p[4] || "").includes("Auto-Injected"));

        const extractTierLocal = (note) => { 
            const m = String(note||'').match(/\btier:(S|L|STD)\b/i); 
            return m ? m[1].toUpperCase() : ''; 
        };

        tempSeq.playbackMode = isFlow ? 'flow' : 'standard';
        const authoredSecs  = authoredPoses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1], extractTierLocal(p[4]), p[3], p[4], false, tempSeq), 0);
        const injectedSecs  = injectedPoses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1], extractTierLocal(p[4]), p[3], p[4], false, tempSeq), 0);

        const runtimeSecs   = authoredSecs + injectedSecs;
        const fmt = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

        if (injectedSecs > 0) {
            statsEl.innerHTML = `<span>${authoredPoses.length} poses · <strong>${fmt(authoredSecs)}</strong> authored</span>
                <span style="margin-left:10px; color:#f57f17; font-size:0.85em;" title="Additional time from auto-injected poses">
                    + ~${fmt(injectedSecs)} injected → <strong>~${fmt(runtimeSecs)} runtime</strong>
                </span>`;
        } else {
            statsEl.textContent = `${authoredPoses.length} poses · ${fmt(authoredSecs)} total (incl. reps & sides)`;
        }
    }
}

async function processSemicolonCommand(commandString) {
    const result = await parseSemicolonCommand(commandString, getAsanaIndex(), window.asanaLibrary);
    if (!result) return;

    const { title, category, validItems } = result;

    const titleEl = document.getElementById('builderTitle');
    const catEl   = document.getElementById('builderCategory');
    if (titleEl && title)    titleEl.value = title;
    if (catEl   && category) catEl.value   = category;

    if (validItems.length === 0) return;

    validItems.forEach(item => {
        const holdTimes = (item.asana && window.getHoldTimes) ? window.getHoldTimes(item.asana, item.stageKey || null) : { standard: 30, flow: 5 };
        const duration = isFlowSequence() ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30);
        builderState.poses.push({
            id: item.id, name: item.name, duration, variation: item.stageKey || '', note: item.stageKey ? `[${item.stageKey}]` : '', holdTier: 'standard', flowHoldOverride: isFlowSequence() ? duration : null,
            _ambiguous: item._ambiguous || false, _pageNum: item._pageNum || null, _alternatives: item._alternatives || []
        });
    });

    builderRender();
}

function openEditCourse() {
   if (!window.currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", window.currentSequence);
}

function builderOpen(mode, seq) {
    builderState.mode = mode;
    builderState.editingCourseIndex = -1;
    builderState.poses = []; 
    let targetId = seq ? (seq.supabaseId || seq.id) : null;

    builderState.isViewMode = (mode === "edit"); 

    const catInput = $("builderCategory"); 
    const titleEl = $("builderTitle");
    const modeLabel = $("builderModeLabel");
    const datalist = $("builderCategoryList");
    const displayCategory = document.getElementById("displayCategory");

    if (catInput) {
        catInput.oninput = () => { builderRender(); };
    }

    if (catInput && datalist) {
        const existingCategories = [...new Set(window.courses.map(c => c.category).filter(Boolean))].sort();
        datalist.innerHTML = existingCategories.map(cat => `<option value="${cat}">`).join("");
        catInput.ondblclick = () => { catInput.value = ''; };
    }

    builderState.editingSupabaseId = targetId;
    document.body.classList.add("modal-open");
    
    setupBuilderSearch(
        getAsanaIndex, 
        (asma) => { 
            addPoseToBuilder({
                id: asma.id,
                name: asma.name || asma.english,
                duration: (() => { const holdTimes = window.getHoldTimes ? window.getHoldTimes(asma) : { standard: 30, flow: 5 }; return isFlowSequence() ? (holdTimes.flow || holdTimes.standard || 5) : ((holdTimes.standard || 30)); })(),
                variation: "",
                note: "",
                flowHoldOverride: (() => { const holdTimes = window.getHoldTimes ? window.getHoldTimes(asma) : { standard: 30, flow: 5 }; return isFlowSequence() ? (holdTimes.flow || holdTimes.standard || 5) : null; })()
            });
            builderRender();
        },
        processSemicolonCommand
    );

    const nameToggleBtn = document.getElementById('builderNameToggle');
    if (nameToggleBtn) {
        nameToggleBtn.style.background = builderState.showSanskrit ? '#f9a825' : '#fff8e1';
        nameToggleBtn.style.color      = builderState.showSanskrit ? '#fff'    : '#6d4c00';
        nameToggleBtn.onclick = () => {
            builderState.showSanskrit = !builderState.showSanskrit;
            nameToggleBtn.style.background = builderState.showSanskrit ? '#f9a825' : '#fff8e1';
            nameToggleBtn.style.color      = builderState.showSanskrit ? '#fff'    : '#6d4c00';
            builderRender();
        };
    }

    if (mode === "new") {
       if (modeLabel) modeLabel.textContent = "New Sequence";
       if (titleEl) titleEl.value = "";
       if (catInput) catInput.value = ""; 
        builderState.currentPlaybackMode = null;
       if (displayCategory) displayCategory.style.display = "none";
    } else {
       if (!seq) return;
       if (modeLabel) modeLabel.textContent = "Sequence Review";
       if (titleEl) titleEl.value = seq.title || "";
       if (catInput) catInput.value = seq.category || "";
       builderState.currentPlaybackMode = seq.playbackMode || (seq.isFlow ? "flow" : "standard");       
       const seqIsFlow = builderState.currentPlaybackMode === "flow";
       const libraryArray = Object.values(window.asanaLibrary || {});
       const rawPoses = (window.currentSequenceOriginalPoses && seq === window.currentSequence) ? window.currentSequenceOriginalPoses : (seq.poses || []);
       
       if (displayCategory) displayCategory.textContent = seq.category || "";
       
       rawPoses.forEach(p => {
             const rawId = Array.isArray(p[0]) ? p[0][0] : p[0] || "";
             const idStr = String(rawId);
             
             if (idStr === "LOOP_START" || idStr === "LOOP_END") {
                builderState.poses.push({
                    id: idStr,
                    name: idStr === "LOOP_START" ? `🔁 Loop Starts Here (${p[1]} Rounds)` : "🔁 Loop Ends Here",
                    duration: idStr === "LOOP_START" ? Number(p[1]) || 2 : 0,
                    variation: "", note: ""
                });
                return;
             }
             if (idStr.startsWith("MACRO:")) {
                builderState.poses.push({ id: idStr, name: `[Sequence] ${idStr.replace("MACRO:", "").trim()}`, duration: Number(p[1]) || 1, variation: "", note: p[4] || "" });
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
                     if (extractedLabel.toLowerCase() === (vData?.title || "").toLowerCase() || new RegExp(`\\b${vKey}\\b`, 'i').test(extractedLabel)) {
                         variation = vKey; extractedLabel = ""; break;
                     }
                 }
             } else if (variation && extractedLabel === variation) {
                 extractedLabel = ""; 
             }
    
             if (extractedLabel && !variation) {
                 rawExtras = (extractedLabel + (rawExtras ? " | " + rawExtras : "")).trim();
             }
    
             const holdTimes = asana ? (window.getHoldTimes ? window.getHoldTimes(asana, variation || null) : { standard: 30, flow: 5 }) : { standard: 30, flow: 5 };
             const parsedDuration = Number(p[1]) || (seqIsFlow ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30));
             builderState.poses.push({
                id: id,
                name: asana ? (asana.name || displayName(asana)) : id,
                duration: parsedDuration,
                variation: variation,
                note: rawExtras,
                holdTier: (() => {
                    const tierMatch = (p[4] || '').match(/\btier:(S|L|STD)\b/i);
                    return tierMatch ? (tierMatch[1].toUpperCase() === 'S' ? 'short' : 'long') : 'standard';
                })(),
                flowHoldOverride: seqIsFlow ? parsedDuration : null
             });
       });
    }
    
    if (typeof updateBuilderModeUI === "function") updateBuilderModeUI();
    builderRender();
    
    $("editCourseBackdrop").style.display = "flex";
    setTimeout(() => { if($("builderSearch")) $("builderSearch").focus(); }, 50);
}

function builderCompileSequenceText() {
    return builderState.poses.map(p => {
        const idStr = String(p.id);
    if (idStr.startsWith("MACRO:")) {
            const rounds = Math.max(1, Number(p.duration) || 1);
            return `${idStr} | ${rounds} | [Sequence Link] Linked Sequence: ${rounds} Round${rounds !== 1 ? 's' : ''}`;
        }        if (idStr.startsWith("LOOP_")) return `${idStr} | ${p.duration} | [Repetition] ${p.note ? p.note : ''}`;

        const id = String(p.id).padStart(3, '0');
        const dur = p.duration || (isFlowSequence() ? 5 : 30);
        
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

function builderGetTitle() { return ($("builderTitle")?.value || "").trim(); }
function builderGetCategory() { 
    const el = document.getElementById("builderCategory");
    if (!el) return "";
    return el.value.trim(); 
}

async function builderSave() {
    const title = builderGetTitle();
    const categoryString = builderGetCategory();
    const sequenceText = builderCompileSequenceText();
    
    if (!title) return alert("Please enter a title.");

    const originalSeq = window.courses?.find(c => String(c.id) === String(builderState.editingSupabaseId));
    
    if (originalSeq && originalSeq.category !== categoryString) {
        const confirmMove = confirm(`Moving sequence from "${originalSeq.category || 'Uncategorized'}" to "${categoryString}". \n\nContinue?`);
        if (!confirmMove) return;
    }
    
    try {
        if (!supabase) return;
        if (!window.currentUserId) return alert("You must be signed in to save sequences.");
        if (window.isGuestMode) return alert("Guest sessions cannot save sequences.\n\nSign in with Google to keep your work.");

        const payload = { 
            title, 
            category: categoryString, 
            sequence_text: sequenceText, 
            last_edited: new Date().toISOString(), 
            user_id: window.currentUserId 
        };
        
        if (isAdmin()) payload.is_system = true;

        const { id: savedId } = await saveSequence(payload, builderState.editingSupabaseId);
        
        if (savedId) builderState.editingSupabaseId = savedId;

        await window.loadCourses(); 
        
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            const newIdx = window.courses.findIndex(c => String(c.id) === String(savedId));
            if (newIdx !== -1) {
                sel.value = String(newIdx);
                sel.dispatchEvent(new Event('change'));
            }
        }

        builderState.isViewMode = true;
        if (typeof updateBuilderModeUI === "function") updateBuilderModeUI();
        document.getElementById("editCourseBackdrop").style.display = "none";
        document.body.classList.remove("modal-open");
        resetBusyCursorState();
        alert(`"${title}" saved!`);

    } catch(e) {
        console.error("❌ Save failed:", e);
        alert("Save failed. Please try again.\n\n(Detail: " + (e.message?.replace(/https?:\/\/\S+/g, "").trim() || "Unknown error") + ")");
    }
}

function createRepeatGroup() {
    const checkboxes = document.querySelectorAll('.b-row-select:checked');
    if (checkboxes.length === 0) return alert("Please select at least one pose using the checkboxes.");

    const idxs = Array.from(checkboxes).map(c => parseInt(c.dataset.idx)).sort((a,b) => a - b);
    const startIdx = idxs[0];
    const endIdx = idxs[idxs.length - 1]; 
    
    for (let i = startIdx; i <= endIdx; i++) {
        const idStr = String(builderState.poses[i].id);
        if (idStr.startsWith('MACRO:') || idStr.startsWith('LOOP_')) return alert("Cannot create a repeat group that intersects with Macros or other loops.");
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
        if (isNaN(reps) || reps < 2) return alert("Please enter a number of 2 or more.");

        overlay.style.display = "none";
        builderState.poses.splice(endIdx + 1, 0, { id: "LOOP_END", name: "🔁 Loop Ends Here", duration: 0, variation: "", note: "" });
        builderState.poses.splice(startIdx, 0, { id: "LOOP_START", name: `🔁 Loop Starts Here (${reps} Rounds)`, duration: reps, variation: "", note: "" });
        
        checkboxes.forEach(c => c.checked = false);
        builderRender();
        setTimeout(() => alert(`Successfully created a repetition group of ${endIdx - startIdx + 1} poses!`), 100);
    };
}

function wireBuilderGlobals() {
    // BULK DELETE LOGIC
    const btnDeleteSelected = document.getElementById("btnDeleteSelected");
    if (btnDeleteSelected) {
        btnDeleteSelected.onclick = (e) => {
            e.preventDefault();
            const checkboxes = document.querySelectorAll('.b-row-select:checked');
            
            if (checkboxes.length === 0) {
                return alert("Please check the box next to the poses you want to delete.");
            }

            if (!confirm(`Are you sure you want to remove ${checkboxes.length} selected pose(s)?`)) {
                return;
            }

            // 🌟 CRITICAL: Sort indices in descending order before removing!
            // If we remove index 2 first, the old index 5 becomes index 4. 
            // Going backwards prevents this shifting bug.
            const idxs = Array.from(checkboxes)
                .map(c => parseInt(c.dataset.idx))
                .sort((a, b) => b - a);

            idxs.forEach(idx => removePose(idx));
            
            // Re-render the table to reflect deletions and uncheck all boxes
            builderRender();
        };
    }
    // SINGLE SOURCE OF TRUTH FOR SAVE BUTTON
    const btnSaveEl = document.getElementById("editCourseSaveBtn");
    if (btnSaveEl) {
        btnSaveEl.onclick = null; // Clear inline/previous event assignments
        btnSaveEl.onclick = builderSave;
    }

    const modeBtn = document.getElementById("builderModeToggleBtn");
    if (modeBtn) modeBtn.onclick = () => { builderState.isViewMode = !builderState.isViewMode; updateBuilderModeUI(); };

    const printBtn = document.getElementById("builderPrintBtn");
    if (printBtn) printBtn.onclick = () => window.print();

    const catEdit = document.getElementById("builderCategory");
    if (catEdit) {
        catEdit.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                catEdit.blur();     
            }
        });
    }

    const gearBtn = document.getElementById("builderToolsToggle");
    const toolsPanel = document.getElementById("builderToolsPanel");
    if (gearBtn && toolsPanel) gearBtn.onclick = () => toolsPanel.classList.toggle("show");

    const rowInput = document.getElementById("rowSearchInput");
    const rowResults = document.getElementById("rowSearchResults");
    if (rowInput && rowResults) {
        rowInput.oninput = () => {
            const q = rowInput.value.trim().toLowerCase();
            if (q.length < 1) { rowResults.innerHTML = ""; return; }
            
            const lib = getAsanaIndex();
            const matches = lib.filter(a => 
                (String(a.id)||"").toLowerCase().includes(q) || 
                (a.english||"").toLowerCase().includes(q) || 
                (a.name||"").toLowerCase().includes(q)
            ).slice(0, 15);
            
            rowResults.innerHTML = matches.map(a => `
                <div style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:10px; align-items:center;" onclick="window.selectRowSearch('${a.id}')">
                    <div style="background:#007aff; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem; min-width:28px; text-align:center;">${a.id}</div>
                    <div><div style="font-weight:600;">${a.english || a.name}</div><div style="font-size:0.75rem; color:#666;">${a.iast || ''}</div></div>
                </div>
            `).join("");
        };
    }
}

if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", wireBuilderGlobals); } else { wireBuilderGlobals(); }

window.selectRowSearch = (id) => {
    if (builderState.activeRowSearchIdx >= 0 && builderState.poses[builderState.activeRowSearchIdx]) {
        const val = String(id).padStart(3, '0');
        builderState.poses[builderState.activeRowSearchIdx].id = val;
        
        const libraryArray = Object.values(window.asanaLibrary || {});
        const normId = typeof normalizePlate === "function" ? normalizePlate(val) : val;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        
        if (asanaMatch) {
            builderState.poses[builderState.activeRowSearchIdx].name = asanaMatch.name;
            if (window.getHoldTimes) {
                const holdTimes = window.getHoldTimes(asanaMatch);
                const nextDuration = isFlowSequence() ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30);
                builderState.poses[builderState.activeRowSearchIdx].duration = nextDuration;
                builderState.poses[builderState.activeRowSearchIdx].flowHoldOverride = isFlowSequence() ? nextDuration : null;
            }
        }
        builderRender();
    }
    document.getElementById('rowSearchOverlay').style.display = 'none';
};

export {
    builderRender, processSemicolonCommand, openEditCourse, builderOpen, builderSave, createRepeatGroup,
    openLinkSequenceModal // Correctly exported
};
export { movePose, removePose, addPoseToBuilder } from "../store/builderState.js";