import { $, safeListen, normaliseText } from "../utils/dom.js";
import { parseHoldTimes, parseSequenceText, buildHoldString } from "../utils/parsing.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { saveSequence } from "../services/persistence.js";
import { parseSemicolonCommand } from "../utils/builderParser.js";
import { setupBuilderSearch } from "./builderSearch.js";
import { formatHMS, displayName, formatCategory } from "../utils/format.js";
import { builderPoseName, generateVariationSelectHTML, generateInfoCellHTML, resolvePoseInfo, buildMacroInfoHTML } from "./builderTemplates.js";
import { builderState, setPoseSide, movePose, movePoseToIndex, removePose, addPoseToBuilder, isFlowSequence } from '../store/builderState.js';
import { updateBuilderModeUI, openLinkSequenceModal } from "./builderUI.js";
import { PROP_REGISTRY } from "../config/propRegistry.js";

const getEffectiveTime = (...args) => window.getEffectiveTime ? window.getEffectiveTime(...args) : args[1];
const getAsanaIndex = () => Object.values(window.asanaLibrary || {}).filter(Boolean);

const ADMIN_EMAIL = 'mark.opie@gmail.com';
const isAdmin = () => window.currentUserEmail === ADMIN_EMAIL;
const resetBusyCursorState = () => {
    const activeEl = document.activeElement;
    if (activeEl && typeof activeEl.blur === "function") activeEl.blur();
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
};

export function updateToolbarState() {
    const checkedCount = document.querySelectorAll('.b-row-select:checked').length;
    const btnDelete = document.getElementById("btnDeleteSelected");
    const btnRepeat = document.getElementById("btnGroupRepeat");
    
    if (btnDelete) btnDelete.style.display = checkedCount > 0 ? "inline-block" : "none";
    
    if (btnRepeat) btnRepeat.style.display = checkedCount > 0 ? "inline-block" : "none"; 
}

export function getTargetInsertionIndex() {
    const firstChecked = document.querySelector('.b-row-select:checked');
    return firstChecked ? parseInt(firstChecked.dataset.idx, 10) : -1;
}

export function clearBuilderSelection() {
    document.querySelectorAll('.b-row-select:checked').forEach(cb => cb.checked = false);
    updateToolbarState(); 
}

function getEffectiveFlowStatus() {
    const catElement = document.getElementById("builderCategory");
    const currentCategory = (catElement ? (catElement.textContent || catElement.value || "") : "").toLowerCase();
    // Checks both state and the current (unsaved) category input
    return isFlowSequence() || (builderState.currentPlaybackMode == null && currentCategory.includes("flow"));
}

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
    const isFlow = getEffectiveFlowStatus();
    const macroDurationCache = new Map();
 
    builderState.poses.forEach((pose, idx) => {
        const idStr = String(pose.id);
        const durOrReps = Number(pose.duration) || 0;
        const isMacro = idStr.startsWith("MACRO:");
        const isLoopStart = idStr === "LOOP_START";
        const isLoopEnd = idStr === "LOOP_END";
        const isSpecial = isMacro || isLoopStart || isLoopEnd;
        const disableRowSelect = false;
        const idStrNumeric = idStr.match(/^\d+/)?.[0] || idStr;
        let asana = null;
    
        let macroInfo = null;
        if (isMacro) {
            const identifier = idStr.replace("MACRO:", "").trim(); 
            const subCourse = window.courses ? window.courses.find(c => 
                String(c.title || "").trim().toLowerCase() === identifier.toLowerCase() || 
                String(c.id || "").trim() === identifier
            ) : null;
            if (subCourse && subCourse.poses) {
                const cacheKey = String(subCourse.id || subCourse.supabaseId || subCourse.title || identifier);
                let oneRoundSecs = macroDurationCache.get(cacheKey);
                if (oneRoundSecs == null) {
            // Step 1 Fix: Align Info cell with the correct expansion-based calculation path.
            if (typeof window.getExpandedPoses === "function" && typeof window.getPosePillTime === "function") {
                const syntheticSeq = { poses: [[`MACRO:${subCourse.id || identifier}`, 1, "", "", "Linked Sequence: 1 Round"]] };
                const expanded = window.getExpandedPoses(syntheticSeq);
                oneRoundSecs = expanded.reduce((acc, p) => acc + window.getPosePillTime(p), 0);
            } else {
                oneRoundSecs = typeof window.calculateTotalSequenceTime === "function"
                    ? window.calculateTotalSequenceTime(subCourse)
                    : subCourse.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1], '', sp[3], sp[4], false, subCourse, sp[7] || null), 0);
            }
                    macroDurationCache.set(cacheKey, oneRoundSecs);
                }
                totalSec += (oneRoundSecs * durOrReps);
                macroInfo = { oneRoundSecs, rounds: durOrReps, note: subCourse.category || pose.note || '' };
                pose.name = `[Sequence] ${subCourse.title}`; // Ensure UI shows Name even if linked by ID
            }
        } else if (!isSpecial) {
            const normId = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
            asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
            
            const hj = asana ? (window.getHoldTimes ? window.getHoldTimes(asana, pose.variation) : (asana.hold_json || { standard: 30 })) : { standard: 30 };
            const activeTime = isFlow ? (pose.flowHoldOverride || hj.flow || hj.standard || 5) : (pose.duration || hj.standard || 30);
            const tier = pose.holdTier === 'short' ? 'S' : (pose.holdTier === 'long' ? 'L' : null);
            
            totalSec += getEffectiveTime(idStr, activeTime, tier, pose.variation, pose.note);
        }

        const devanagari = asana?.devanagari || ""; 
        const iast = asana?.iast || "";

        const viewModePropsHTML = (pose.props || []).length > 0 ? `
            <div class="view-mode-props-container">
                ${pose.props.map(pid => {
                    const p = PROP_REGISTRY[pid];
                    const color = p ? p.color : '#86868b';
                    const icon = p ? p.icon : '❓';
                    const label = p ? p.label : pid;
                    const r = parseInt(color.slice(1,3), 16), g = parseInt(color.slice(3,5), 16), b = parseInt(color.slice(5,7), 16);
                    
                    return `<span class="b-prop-chip" style="border-color: ${color}; color: ${color}; background: rgba(${r},${g},${b},0.08);">
                        ${icon} ${label}
                    </span>`;
                }).join('')}
            </div>
        ` : '';

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

        let sideBadge = '';
        if (!isMacro && (asana?.requires_sides || asana?.requiresSides)) {
            if (isFlow) {
                const s = pose.side || '';
                sideBadge = `
                <div class="side-selector" style="display:inline-flex; border: 1px solid #d2d2d7; border-radius: 6px; overflow:hidden; font-size: 0.65rem; font-weight: 600; margin-left:8px; vertical-align:middle; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <button class="b-side" data-idx="${idx}" data-side="L" style="padding: 3px 8px; border:none; border-right: 1px solid #d2d2d7; background:${s === 'L' ? '#007aff' : 'transparent'}; color:${s === 'L' ? '#fff' : '#86868b'}; cursor:pointer; transition:all 0.15s;">L</button>
                    <button class="b-side" data-idx="${idx}" data-side="" style="padding: 3px 8px; border:none; border-right: 1px solid #d2d2d7; background:${s === '' ? '#007aff' : 'transparent'}; color:${s === '' ? '#fff' : '#86868b'}; cursor:pointer; transition:all 0.15s;">L+R</button>
                    <button class="b-side" data-idx="${idx}" data-side="R" style="padding: 3px 8px; border:none; background:${s === 'R' ? '#007aff' : 'transparent'}; color:${s === 'R' ? '#fff' : '#86868b'}; cursor:pointer; transition:all 0.15s;">R</button>
                </div>`;
            } else {
                sideBadge = `<span style="color:#86868b; font-size:0.65rem; font-weight:600; margin-left:8px; border: 1px solid #d2d2d7; padding: 2px 6px; border-radius: 4px; background:#f5f5f7;">L+R</span>`;
            }
        }
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
                // ARCHITECT FIX: Explicitly set to null if the variation has no value, overriding base asana.
                // This ensures that a variation can explicitly "cancel" a base asana's injection.
                prepId = (vd.preparatory_pose_id === undefined || vd.preparatory_pose_id === '') ? null : vd.preparatory_pose_id;
                recovId = (vd.recovery_pose_id === undefined || vd.recovery_pose_id === '') ? null : vd.recovery_pose_id;
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
                 <span style="margin-left: 6px;">${generateVariationSelectHTML(asana, pose, idx)}</span>
                 ${sideBadge}
              </div>
              <div style="font-size:0.85rem; color:var(--color-text-secondary); font-style:italic; margin-bottom:6px;">
                 ${iast}
              </div>
              ${viewModePropsHTML}
              <div class="edit-only-inline" style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ${isLoopStart || isLoopEnd ? `<span style="color:#999; font-size:0.65rem; text-transform:uppercase; font-weight:bold; letter-spacing:0.02em;">System Block</span>` : 
                   (isMacro ? `ID: <span style="font-family:monospace; background:#f0f0f0; padding:2px 6px; border-radius:4px; border:1px solid #ddd; font-size:0.7rem; color:#333;">${pose.id.replace("MACRO:", "")}</span>
                               <button class="tiny b-macro-swap" data-idx="${idx}" style="padding:2px 8px; border-radius:4px; border:1px solid #007aff; background:#fff; color:#007aff; cursor:pointer; font-weight:600; font-size:0.65rem;" title="Change Linked Sequence">Swap</button>` :
                                `ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" style="width:50px; padding:2px; border:1px solid #ccc; border-radius:4px;">
                                <div style="display:inline-flex; align-items:center; margin-left:4px; vertical-align:middle;">
                                    <div class="b-prop-picker-btn" data-idx="${idx}" 
                                         title="${(pose.props || []).length > 0 ? 'Active Props: ' + pose.props.map(p => PROP_REGISTRY[p]?.label).join(', ') : 'Select Props'}"
                                         style="cursor:pointer; font-size:1.1rem; opacity:${(pose.props || []).length > 0 ? '1' : '0.3'}; filter:${(pose.props || []).length > 0 ? 'none' : 'grayscale(1)'};">
                                        🧰
                                    </div>
                                </div>
                                <button onclick="window.triggerRowSearch(event, ${idx})" type="button" class="tiny b-row-search-btn" data-idx="${idx}" style="padding:2px 6px; border-radius:4px; border:1px solid #ccc; background:#fff; cursor:pointer;" title="Search Asana">🔍</button>`
                   )
                 }
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
    
    qS('.b-row-select').forEach(cb => cb.onchange = (e) => {
        const idx = parseInt(cb.dataset.idx);
        const pose = builderState.poses[idx];
        if (pose && (pose.id === "LOOP_START" || pose.id === "LOOP_END")) {
            const isChecked = e.target.checked;
            let pairIdx = -1;
            if (pose.id === "LOOP_START") {
                for (let j = idx + 1; j < builderState.poses.length; j++) {
                    if (builderState.poses[j].id === "LOOP_END") { pairIdx = j; break; }
                }
            } else {
                for (let j = idx - 1; j >= 0; j--) {
                    if (builderState.poses[j].id === "LOOP_START") { pairIdx = j; break; }
                }
            }
            if (pairIdx !== -1) {
                const pairCb = tbody.querySelector(`.b-row-select[data-idx="${pairIdx}"]`);
                if (pairCb) pairCb.checked = isChecked;
            }
        }
        
        updateToolbarState(); // 👈 ADDED: Triggers the Delete/Repeat buttons to appear
    });

    qS('.b-prop-picker-btn').forEach(btn => btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        openPropPicker(idx);
    });

    qS('.b-side').forEach(btn => btn.onmousedown = (e) => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.idx, 10);
        const side = btn.dataset.side; // Will be 'L', 'R', or ''
        
        setPoseSide(idx, side);
        builderRender();
    });

function openPropPicker(idx) {
    const pose = builderState.poses[idx];
    if (!pose) return;
    
    let overlay = document.getElementById("propPickerOverlay");
    if (!overlay) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="propPickerOverlay" class="modal-backdrop" style="display:none; align-items:center; justify-content:center;">
                <div class="modal" style="max-width:340px; height:auto; border-radius:16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                    <div class="modal-header">
                        <strong>Prop Toolbox</strong>
                        <button class="tiny" onclick="document.getElementById('propPickerOverlay').style.display='none'">✕</button>
                    </div>
                    <div class="modal-body" id="propPickerList" style="padding:15px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; max-height:300px;"></div>
                    
                    <details id="customPropAccordion" style="border-top:1px solid #eee; background:#f9f9f9; border-bottom-left-radius:16px; border-bottom-right-radius:16px;">
                        <summary style="padding:14px; font-size:0.75rem; color:#007aff; font-weight:700; text-transform:uppercase; cursor:pointer; outline:none; user-select:none;">
                            + Add Custom Prop
                        </summary>
                        <div style="padding:0 12px 12px 12px; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; gap:6px;">
                                <input type="text" id="customPropIcon" placeholder="Icon" style="width:40px; padding:6px; text-align:center;">
                                <input type="text" id="customPropLabel" placeholder="Prop Name (e.g. Chair)" style="flex:1; padding:6px;">
                            </div>
                            <input type="text" id="customPropAudio" placeholder="Audio Cue (e.g. Use a chair for support)" style="width:100%; padding:6px; font-size:0.8rem; border:1px solid #ccc; border-radius:4px;">
                            <input type="text" id="customPropBannerTitle" placeholder="Banner Title" style="width:100%; padding:6px; font-size:0.8rem; border:1px solid #ccc; border-radius:4px;">
                            <textarea id="customPropBannerHtml" placeholder="Banner Details (HTML allowed)" style="width:100%; height:60px; padding:6px; font-size:0.8rem; border:1px solid #ccc; border-radius:4px; font-family:inherit;"></textarea>
                            <button id="btnAddCustomProp" style="background:#007aff; color:#fff; border:none; border-radius:8px; padding:8px; font-weight:600; cursor:pointer; margin-top:4px;">Create Prop</button>
                        </div>
                    </details>
                </div>
            </div>
        `);
        overlay = document.getElementById("propPickerOverlay");
    }

    const list = document.getElementById("propPickerList");
    list.innerHTML = Object.values(PROP_REGISTRY).map(p => {
        const isActive = pose.props?.includes(p.id);
        return `
            <label style="display:flex; align-items:center; gap:12px; cursor:pointer; padding:10px; border-radius:10px; border:1px solid ${isActive ? '#007aff' : '#eee'}; background:${isActive ? 'rgba(0,122,255,0.05)' : '#fff'}; transition: all 0.2s;">
                <input type="checkbox" class="prop-checkbox" data-pid="${p.id}" ${isActive ? 'checked' : ''} style="width:18px; height:18px;">
                <span style="font-size:1.2rem;">${p.icon}</span>
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:0.9rem;">${p.label}</div>
                </div>
            </label>
        `;
    }).join('');

    list.querySelectorAll('.prop-checkbox').forEach(cb => {
        cb.onchange = () => {
            const pid = cb.dataset.pid;
            if (!pose.props) pose.props = [];
            if (cb.checked) {
                if (!pose.props.includes(pid)) pose.props.push(pid);
            } else {
                pose.props = pose.props.filter(id => id !== pid);
            }
            builderRender();
            // Refresh background color for the row in the modal
            const lbl = cb.closest('label');
            lbl.style.background = cb.checked ? 'rgba(0,122,255,0.05)' : '#fff';
            lbl.style.borderColor = cb.checked ? '#007aff' : '#eee';
        };
    });

    // 🌟 Custom Prop logic: allows on-the-fly expansion of the registry
    const addBtn = document.getElementById("btnAddCustomProp");
    if (addBtn) {
        addBtn.onclick = async () => {
            const iconInp = document.getElementById("customPropIcon");
            const labelInp = document.getElementById("customPropLabel");
            const audioInp = document.getElementById("customPropAudio");
            const titleInp = document.getElementById("customPropBannerTitle");
            const htmlInp = document.getElementById("customPropBannerHtml");

            const icon = iconInp.value.trim() || "🩹";
            const label = labelInp.value.trim();
            const audioCue = audioInp.value.trim() || `Using a ${label}.`;
            const bannerTitle = titleInp.value.trim() || label;
            const bannerHtml = htmlInp.value.trim() || `Instructions for ${label} go here.`;

            if (!label) return alert("Please provide a name for the prop.");
            
            const pid = label.toLowerCase().replace(/\s+/g, '_');
            if (PROP_REGISTRY[pid]) return alert("This prop already exists.");

            // 🌟 PERSIST TO SUPABASE
            const payload = {
                id: pid,
                label,
                icon,
                color: "#007aff",
                audio_cue: audioCue,
                banner_title: bannerTitle,
                banner_html: bannerHtml
            };

            try {
                const { error } = await supabase.from('props').upsert(payload);
                if (error) throw error;

                // Inject into local memory registry
                PROP_REGISTRY[pid] = { id: pid, label, icon, color: "#007aff", audioCue, bannerTitle, bannerHtml };
                
                if (!pose.props) pose.props = [];
                pose.props.push(pid);
                
                // Reset fields and close accordion
                [iconInp, labelInp, audioInp, titleInp, htmlInp].forEach(el => el.value = "");
                document.getElementById("customPropAccordion").open = false;

                openPropPicker(idx); // Recursive refresh to show the new item
                builderRender();
            } catch (err) {
                console.error("[Props] Save failed:", err);
                alert("Failed to save prop to global library: " + err.message);
            }
        };
    }
    overlay.style.display = "flex";
}

    // 1. Trigger the Overlay (Delegated to builderUI.js)
    qS('.b-macro-swap').forEach(btn => {
    btn.onmousedown = (e) => {
        e.preventDefault();
        builderState.activeMacroSwapIdx = parseInt(btn.dataset.idx, 10);
        if (typeof openLinkSequenceModal === 'function') {
            openLinkSequenceModal();
        }
    };
});


    qS('.b-id').forEach(el => el.onchange = (e) => {
        const i = el.dataset.idx;
        let val = el.value.trim();
        if(!val.startsWith("MACRO:")) val = val.padStart(3, '0');
        
        // 👈 THE FIX: Clear Phantom State
        // If the ID actually changed, wipe out any old variation data
        if (builderState.poses[i].id !== val) {
            builderState.poses[i].variation = "";
        }

        builderState.poses[i].id = val;
        const normId = typeof normalizePlate === "function" ? normalizePlate(val) : val;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch) {
            // Use English or Devanagari for the display name in the builder state
            builderState.poses[i].name = asanaMatch.english || asanaMatch.devanagari || asanaMatch.name;

            const isFlowNow = getEffectiveFlowStatus();
            if (window.getHoldTimes) {
                const variationKey = builderState.poses[i].variation || null;
                const ah = window.getHoldTimes(asanaMatch, variationKey);
                const nextDuration = isFlowNow ? (ah.flow || ah.standard || 5) : (ah.standard || 30);
                builderState.poses[i].duration = nextDuration;
                builderState.poses[i].flowHoldOverride = isFlowNow ? nextDuration : null;
            }
        }
        builderRender();
    });

    qS('.b-var').forEach(el => el.onchange = (e) => {
        const i = el.dataset.idx;
        builderState.poses[i].variation = el.value;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderState.poses[i].id) : builderState.poses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));

        if (asanaMatch && window.getHoldTimes) {
            const isFlowNow = getEffectiveFlowStatus();
            const hj = window.getHoldTimes ? window.getHoldTimes(asanaMatch, el.value) : (asanaMatch.hold_json || { standard: 30 });
            const nextDuration = isFlowNow ? (hj.flow || hj.standard || 5) : (hj.standard || 30);
            builderState.poses[i].duration = nextDuration; 
            builderState.poses[i].flowHoldOverride = isFlowNow ? nextDuration : null;
        }
        builderRender();
    });

    qS('.b-flow-hold').forEach(el => el.onchange = (e) => {
        const idx = el.dataset.idx;
        let val = parseInt(el.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        builderState.poses[idx].flowHoldOverride = val;
        builderState.poses[idx].duration = val;
        builderRender();
    });

    qS('.b-dur').forEach(el => el.onchange = (e) => {
        const idx = el.dataset.idx;
        let val = parseInt(el.value);
        if (isNaN(val) || val < 1) val = 1;
        builderState.poses[idx].duration = val;
         if (String(builderState.poses[idx].id || "").startsWith("MACRO:")) {
            builderState.poses[idx].note = `Linked Sequence: ${val} Round${val !== 1 ? 's' : ''}`;
        } else if (builderState.poses[idx].id === "LOOP_START") {
            builderState.poses[idx].name = `🔁 Repeat Block (${val} Rounds)`;
        }
        builderRender(); 
    });

    const findLoopRange = (idx) => {
        const pose = builderState.poses[idx];
        if (!pose) return null;
        if (pose.id === "LOOP_START") {
            for (let j = idx + 1; j < builderState.poses.length; j++) if (builderState.poses[j].id === "LOOP_END") return [idx, j];
        } else if (pose.id === "LOOP_END") {
            for (let j = idx - 1; j >= 0; j--) if (builderState.poses[j].id === "LOOP_START") return [j, idx];
        }
        return null;
    };

    const moveBlock = (range, dir) => {
        const [start, end] = range;
        if (dir === -1 && start > 0) {
            const block = builderState.poses.splice(start, end - start + 1);
            builderState.poses.splice(start - 1, 0, ...block);
        } else if (dir === 1 && end < builderState.poses.length - 1) {
            const block = builderState.poses.splice(start, end - start + 1);
            builderState.poses.splice(start + 1, 0, ...block);
        }
    };

    qS('.b-move-up').forEach(el => el.onmousedown = (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        const range = findLoopRange(idx);
        if (range) moveBlock(range, -1); else movePose(idx, -1);
        builderRender();
    });
    qS('.b-move-dn').forEach(el => el.onmousedown = (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        const range = findLoopRange(idx);
        if (range) moveBlock(range, 1); else movePose(idx, 1);
        builderRender();
    });

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

    qS('.b-move-top').forEach(el => el.onmousedown = (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        if (idx > 0) {
            const item = builderState.poses.splice(idx, 1)[0];
            builderState.poses.unshift(item);
            builderRender();
        }
    });

    qS('.b-move-bot').forEach(el => el.onmousedown = (e) => {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        if (idx < builderState.poses.length - 1) {
            const item = builderState.poses.splice(idx, 1)[0];
            builderState.poses.push(item);
            builderRender();
        }
    });

    qS('.b-tier').forEach(el => el.onmousedown = (e) => {
        e.preventDefault();
        const i    = parseInt(el.dataset.idx, 10);
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

        const poseTime = (p) => (typeof window.getPosePillTime === 'function')
            ? window.getPosePillTime(p)
            : Number(p?.[1]) || 0;

        const authoredSecs  = authoredPoses.reduce((acc, p) => acc + poseTime(p), 0);
        const injectedSecs  = injectedPoses.reduce((acc, p) => acc + poseTime(p), 0);

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
    updateToolbarState(); // 👈 ADDED: Ensures buttons hide if a selected row is moved or deleted
}

async function processSemicolonCommand(commandString) {
    const result = await parseSemicolonCommand(commandString, getAsanaIndex(), window.asanaLibrary);
    if (!result) return;

    const { title, category, validItems } = result;

    // Only overwrite UI if explicitly provided in the command
    if (title) {
        const titleEl = document.getElementById('builderTitle');
        if (titleEl) titleEl.value = title;
    }
    if (category) {
        const catEl = document.getElementById('builderCategory');
        if (catEl) catEl.value = category;
    }

    if (validItems.length === 0) return;

    let insertAt = getTargetInsertionIndex(); 

    validItems.forEach(item => {
        const isFlowNow = getEffectiveFlowStatus();
        
        // Fix: Use asana.hold_json if window.getHoldTimes is missing/stale
        const hj = item.asana 
            ? (window.getHoldTimes ? window.getHoldTimes(item.asana, item.stageKey || null) : (item.asana.hold_json || { standard: 30, flow: 5 })) 
            : { standard: 30, flow: 5 };
            
        const duration = isFlowNow ? (hj.flow || hj.standard || 5) : (hj.standard || 30);
        
        addPoseToBuilder({
            id: item.id, name: item.name, duration, variation: item.stageKey || '', note: item.stageKey ? `[${item.stageKey}]` : '', 
            holdTier: 'standard', flowHoldOverride: isFlowNow ? duration : null,
            _ambiguous: item._ambiguous || false, _pageNum: item._pageNum || null, _alternatives: item._alternatives || []
        }, insertAt);
        
        if (insertAt >= 0) insertAt++; 
    });

    clearBuilderSelection(); 
    builderRender();
}

function openEditCourse() {
   if (!window.currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", window.currentSequence);
}

function builderOpen(mode, seq) {

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    builderState.mode = mode;
    builderState.editingCourseIndex = -1;
    builderState.poses = []; 
    let targetId = seq ? (seq.supabaseId || seq.id) : null;

    builderState.isViewMode = (mode === "edit"); 

    const catSelect = $("builderCategory"); 
    const catCustom = $("builderCategoryCustom");
    const titleEl = $("builderTitle");
    const modeLabel = $("builderModeLabel");
    const displayCategory = document.getElementById("displayCategory");

    // --- Jobbsian Note Entry Injection ---
    let notesEl = $("builderNotes");
    let displayNotes = $("displayNotes");
    
    if (!notesEl) {
        // Robust Injection: Use Title parent as fallback to ensure the box is always created
        const titleEl = document.getElementById("builderTitle");
        const parent = document.getElementById("editModeHeader") || titleEl?.parentNode;
        if (parent) {
            notesEl = document.createElement("textarea");
            notesEl.id = "builderNotes";
            notesEl.className = "full-width-note hidden";
            notesEl.placeholder = "Add safety or remedial notes (e.g., medical guidance)...";
            parent.appendChild(notesEl);
        }
    }
    if (!displayNotes) {
        const vHeader = document.getElementById("viewModeHeader");
        if (vHeader) {
            displayNotes = document.createElement("div");
            displayNotes.id = "displayNotes";
            displayNotes.className = "full-width-note hidden";
            vHeader.appendChild(displayNotes);
        }
    }

    // 🌟 CATEGORY INITIALIZATION
    if (catSelect) {
        // Filter strictly for course categories (showing asana categories here was confusing)
        const allCats = [...new Set((window.courses || []).map(c => c.category))].filter(Boolean).sort();

        if (catSelect.tagName === "SELECT") {
            catSelect.innerHTML = '<option value="">-- Select category --</option>' + 
                allCats.map(c => `<option value="${c}">${c}</option>`).join('') +
                '<option value="__NEW__" style="font-weight:bold; color:#007aff;">+ Create New Category...</option>';
        } else {
            // Handle Datalist lookup for the text input provided in the prompt
            const datalist = document.getElementById("builderCategoryList");
            if (datalist) {
                datalist.innerHTML = allCats.map(c => `<option value="${c}">`).join("");
            }
        }

        catSelect.onchange = () => {
            if (catCustom) {
                const isNew = catSelect.value === "__NEW__";
                catCustom.style.display = isNew ? "block" : "none";
                if (isNew) {
                    catCustom.focus();
                    // Give it a distinct "new" look if empty
                    catCustom.placeholder = "Enter New Category (e.g. Course > Subcourse)";
                }
            }
            builderRender();
        };
    }

    if (catCustom) {
        catCustom.value = "";
        catCustom.style.display = "none";
        catCustom.oninput = () => builderRender();
        // Style sync to make it clear this is an extension of the select
        catCustom.style.borderTop = "none";
        catCustom.style.borderTopLeftRadius = "0";
        catCustom.style.borderTopRightRadius = "0";
        if (catSelect) catSelect.style.marginBottom = "0";
    }

    builderState.editingSupabaseId = targetId;
    document.body.classList.add("modal-open");
    
    setupBuilderSearch(
        getAsanaIndex, 
        (asma) => { 
            const insertAt = getTargetInsertionIndex(); // 👈 Find ticked box
            const isFlowNow = getEffectiveFlowStatus();
            
            addPoseToBuilder({
                id: asma.id,
                name: asma.name || asma.english,
                duration: (() => { 
                    const holdTimes = window.getHoldTimes ? window.getHoldTimes(asma) : { standard: 30, flow: 5 }; 
                    return isFlowNow ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30); 
                })(),
                variation: "",
                note: "",
                flowHoldOverride: isFlowNow ? (() => { 
                    const holdTimes = window.getHoldTimes ? window.getHoldTimes(asma) : { standard: 30, flow: 5 }; 
                    return (holdTimes.flow || holdTimes.standard || 5); 
                })() : null
            }, insertAt); // 👈 Pass insertion index
            
            clearBuilderSelection(); // 👈 Clear checkbox
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
       if (notesEl) notesEl.value = "";
       if (catSelect) catSelect.value = "";
       if (catCustom) catCustom.value = "";
       builderState.currentSubCategoryId = null;
        builderState.currentPlaybackMode = null;
       if (displayCategory) displayCategory.style.display = "none";
    } else {
       if (!seq) return;
       if (modeLabel) modeLabel.textContent = "Sequence Review";
       if (titleEl) titleEl.value = seq.title || "";
       if (notesEl) notesEl.value = seq.condition_notes || "";

       if (catSelect) {
           const isSelect = catSelect.tagName === "SELECT";
           const exists = isSelect && catSelect.options 
               ? Array.from(catSelect.options).some(opt => opt.value === seq.category) 
               : !!seq.category;

           if (exists && seq.category) {
               catSelect.value = seq.category;
               if (isSelect && catCustom) catCustom.style.display = "none";
           } else if (seq.category) {
               if (isSelect) {
                   catSelect.value = "__NEW__";
                   if (catCustom) {
                       catCustom.style.display = "block";
                       catCustom.value = seq.category;
                   }
               } else {
                   catSelect.value = seq.category;
               }
           } else {
               catSelect.value = "";
               if (catCustom) catCustom.style.display = "none";
           }
       }

       builderState.currentSubCategoryId = seq.subCategoryId || seq.sub_category_id || null;
       builderState.currentPlaybackMode = seq.playbackMode || (seq.isFlow ? "flow" : "standard");       
       const seqIsFlow = builderState.currentPlaybackMode === "flow";
       const libraryArray = Object.values(window.asanaLibrary || {});
       const rawPoses = (window.currentSequenceOriginalPoses && seq === window.currentSequence) ? window.currentSequenceOriginalPoses : (seq.poses || []);

       // 🌟 JSON Migration: Detect if source is native JSON
       const isNativeSource = seq.isNativeJson || (rawPoses.length > 0 && rawPoses[0][7]?.originalJson);
       
       if (displayCategory) displayCategory.textContent = seq.category || "";
       
       rawPoses.forEach(p => {
             const rawId = Array.isArray(p[0]) ? p[0][0] : p[0] || "";
             const idStr = String(rawId);
             
             if (idStr === "LOOP_START" || idStr === "LOOP_END") {
                builderState.poses.push({
                    id: idStr,
                    name: idStr === "LOOP_START" ? `🔁 Repeat Block (${p[1]} Rounds)` : "🔚 End Repeat Block",
                    duration: idStr === "LOOP_START" ? Number(p[1]) || 2 : 0,
                    variation: "", note: ""
                });
                return;
             }
             if (idStr.startsWith("MACRO:")) {
                const identifier = idStr.replace("MACRO:", "").trim();
                const subCourse = window.courses?.find(c => 
                    String(c.title || "").trim().toLowerCase() === identifier.toLowerCase() || 
                    String(c.id || "").trim() === identifier
                );
                const displayTitle = subCourse ? subCourse.title : identifier;
                builderState.poses.push({ id: idStr, name: `[Sequence] ${displayTitle}`, duration: Number(p[1]) || 1, variation: "", note: p[4] || "" });
                return;
             }

             const id = idStr.padStart(3, '0');
             const asana = libraryArray.find(a => String(a.id) === id);
             
             let rawExtras = "";
             let extractedLabel = "";
             let variation = p[3] || ""; 
             let holdTier = 'standard';
             let initialProps = [...(p[7]?.props || [])];
    
             if (isNativeSource && p[7]?.originalJson) {
                 rawExtras = p[7].originalJson.note || "";
                 const jsonTier = p[7].originalJson.tier;
                 holdTier = jsonTier === 'S' ? 'short' : (jsonTier === 'L' ? 'long' : 'standard');
                 // variation is already resolved by fetchCourses bridge
             } else {
                 rawExtras = [p[2], p[4]].filter(Boolean).join(" | ").trim();

             const bracketMatch = rawExtras.match(/\[(.*?)\]/);
             if (bracketMatch) {
                 extractedLabel = bracketMatch[1].trim(); 
                 rawExtras = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\|]+/, "").trim();
             } else {
                 extractedLabel = rawExtras; rawExtras = "";
             }

             // 🌟 Note Cleaning: Strip legacy tier tags and assign to state
             const tierMatch = (rawExtras || p[4] || '').match(/\btier:(S|L|STD)\b/i);
             if (tierMatch) {
                 holdTier = tierMatch[1].toUpperCase() === 'S' ? 'short' : (tierMatch[1].toUpperCase() === 'L' ? 'long' : 'standard');
                 rawExtras = rawExtras.replace(tierMatch[0], '').trim();
             }

             Object.keys(PROP_REGISTRY).forEach(propName => {
                 const tag = `:${propName}`;
                 if (rawExtras.toLowerCase().includes(tag)) {
                     rawExtras = rawExtras.replace(new RegExp(tag, 'gi'), '').trim();
                     if (!initialProps.includes(propName)) initialProps.push(propName);
                 }
             });
    
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
             }
    
             const holdTimes = asana ? (window.getHoldTimes ? window.getHoldTimes(asana, variation || null) : { standard: 30, flow: 5 }) : { standard: 30, flow: 5 };
             const parsedDuration = Number(p[1]) || (seqIsFlow ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30));
             
             builderState.poses.push({
                id: id,
                name: asana ? (asana.name || displayName(asana)) : id,
                duration: parsedDuration,
                variation: variation,
                note: rawExtras,
                holdTier: holdTier,
                flowHoldOverride: seqIsFlow ? parsedDuration : null,
                side: p[7] && p[7].explicitSide ? p[7].explicitSide : "",
                props: initialProps
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
        }        
        if (idStr.startsWith("LOOP_")) return `${idStr} | ${p.duration} | [Repetition] ${p.note ? p.note : ''}`;

        const id = String(p.id).padStart(3, '0');
        const dur = p.duration || (isFlowSequence() ? 5 : 30);
        
        // 🌟 THE AUTO-SCRUBBER
        let validatedVariation = p.variation || "";
        if (validatedVariation) {
            const libraryArray = Object.values(window.asanaLibrary || {});
            const normId = typeof normalizePlate === "function" ? normalizePlate(id) : id;
            const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
            if (asanaMatch && (!asanaMatch.variations || !asanaMatch.variations[validatedVariation])) {
                validatedVariation = "";
            }
        }

        // Check if therapeutic props are present in the note BEFORE scrubbing
        const activeProps = (p.props || []).filter(prop => ['bandage', 'block'].includes(prop));
        if ((p.note || '').toLowerCase().includes(':bandage') && !activeProps.includes('bandage')) activeProps.push('bandage');
        if ((p.note || '').toLowerCase().includes(':block') && !activeProps.includes('block')) activeProps.push('block');

        // Scrub old tags (Preserving the note text, removing brackets with Roman numerals)
        let cleanNote = (p.note || '').replace(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/ig, '')
                                      .replace(/:bandage/gi, '') // Remove existing bandage tag to re-insert cleanly
                                      .replace(/:block/gi, '')
                                      .replace(/\btier:[SL]\b/gi, '')
                                      .replace(/\bside:[LR]\b/gi, '') 
                                      .replace(/\s+/g, ' ')
                                      .trim();

        // 🌟 RE-CONSTRUCTION: The "Bandage-Aware" Schema
        // If we have a variation AND a bandage: [I:bandage]
        // If just bandage: [:bandage]
        // If just variation: [I]
        let bracketContent = validatedVariation;
        activeProps.forEach(prop => {
            bracketContent = bracketContent ? `${bracketContent}:${prop}` : `:${prop}`;
        });
        
        const varPart = bracketContent ? `[${bracketContent}]` : `[]`;
        const tierTag = (p.holdTier && p.holdTier !== 'standard') ? ` tier:${p.holdTier === 'short' ? 'S' : 'L'}` : '';
        const sideTag = p.side ? ` side:${p.side}` : ''; 
        
        const notePart = (cleanNote + tierTag + sideTag).trim(); 
        
        // This creates the standard: ID | Dur | [Var:Prop] Note
        return `${id} | ${dur} | ${varPart} ${notePart}`.trim();
    }).filter(s => s.trim().length > 0).join("\n");
}

function builderCompileSequenceJSON() {
    return builderState.poses.map(p => {
        const idStr = String(p.id);
        
        if (idStr.startsWith("MACRO:")) {
            return {
                type: "macro",
                sequence_id: idStr.replace("MACRO:", ""),
                rounds: Math.max(1, Number(p.duration) || 1)
            };
        }
        if (idStr === "LOOP_START") {
            return {
                type: "loop_start",
                rounds: Math.max(2, Number(p.duration) || 2)
            };
        }
        if (idStr === "LOOP_END") {
            return { type: "loop_end" };
        }

        // 🌟 JSON-Native Fix: Use the props array from the builder state (which contains toggle selections)
        const props = Array.isArray(p.props) ? [...p.props] : [];
        
        // Sync explicit side selector into the metadata props
        if (p.side && !props.includes(`side:${p.side}`)) props.push(`side:${p.side}`);
        
        // Also check if the user manually typed a marker in the note field during this session
        Object.keys(PROP_REGISTRY).forEach(prop => {
            if (p.note && p.note.toLowerCase().includes(`:${prop}`) && !props.includes(prop)) props.push(prop);
        });
        
        let stageId = null;
        if (p.variation) {
            const asana = (window.asanaLibrary || {})[normalizePlate(p.id)];
            if (asana && asana.variations && asana.variations[p.variation]) {
                stageId = asana.variations[p.variation].id;
            }
        }

        return {
            type: "pose",
            pose_id: normalizePlate(p.id),
            stage_id: stageId,
            duration: Number(p.duration) || 0,
            tier: p.holdTier === 'short' ? 'S' : (p.holdTier === 'long' ? 'L' : null),
            props: props,
            note: p.note ? (() => {
                let n = p.note.replace(/\btier:[SL]\b/gi, '');
                Object.keys(PROP_REGISTRY).forEach(pk => { n = n.replace(new RegExp(`:${pk}`, 'gi'), ''); });
                return n.trim();
            })() : ""
        };
    });
}

function builderGetTitle() { return ($("builderTitle")?.value || "").trim(); }
function builderGetNotes() { 
    const el = document.getElementById("builderNotes");
    return (el?.value || "").trim();
}
function builderGetCategory() { 
    const sel = document.getElementById("builderCategory");
    const custom = document.getElementById("builderCategoryCustom");
    if (sel && sel.value === "__NEW__") return (custom?.value || "").trim();
    return (sel?.value || "").trim(); 
}

async function builderSave() {
    const title = builderGetTitle();
    const categoryString = builderGetCategory();
    let conditionNotes = builderGetNotes();
    const sequenceJson = builderCompileSequenceJSON();
    
    if (!title) return alert("Please enter a title.");

    if (!conditionNotes) {
        conditionNotes = 'Welcome to your practice. Work within your limits. Ensure props are ready and the space is clear. Press Start to begin.';
    }

    const originalSeq = window.courses?.find(c => String(c.id || c.supabaseId) === String(builderState.editingSupabaseId));

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
            category: categoryString, // 🌟 Pass string to persistence.js to resolve ID automatically
            condition_notes: conditionNotes,
            sequence_json: sequenceJson,
            last_edited: new Date().toISOString(), 
            user_id: window.currentUserId 
        };
        
        if (isAdmin()) payload.is_system = true;

        const { id: savedId } = await saveSequence(payload, builderState.editingSupabaseId);
        
        if (savedId) builderState.editingSupabaseId = savedId;

        await window.loadCourses(); 
        
        // 🛡️ Ensure the new course is visible by resetting the filter
        const filterEl = document.getElementById("categoryFilter");
        if (filterEl) filterEl.value = "ALL";
        if (typeof window.renderCourseUI === "function") window.renderCourseUI();

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
    // 1. Initial State Check (Your original logic)
    const checkboxes = document.querySelectorAll('.b-row-select:checked');
    if (checkboxes.length === 0) return alert("Please select at least one pose using the checkboxes.");

    const idxs = Array.from(checkboxes).map(c => parseInt(c.dataset.idx)).sort((a,b) => a - b);
    const startIdx = idxs[0];
    const endIdx = idxs[idxs.length - 1]; 
    
    for (let i = startIdx; i <= endIdx; i++) {
        const idStr = String(builderState.poses[i].id);
        if (idStr.startsWith('MACRO:') || idStr.startsWith('LOOP_')) {
            return alert("Cannot create a repeat group that intersects with Macros or other loops.");
        }
    }

    // 2. UI Hookup
    const overlay = document.getElementById("repetitionModalOverlay");
    const input = document.getElementById("repetitionInput");
    const confirmBtn = document.getElementById("btnConfirmRepetition");

    // ARCHITECT SAFETY: Close Row Search if open (Standardized behavior)
    const rowSearch = document.getElementById('rowSearchOverlay');
    if (rowSearch) rowSearch.style.display = 'none';

    // 3. Display Logic (Standardized with Link Modal)
    overlay.style.display = "flex";
    
    // JOBSian FOCUS PROTOCOL: Ensure input is focused after DOM paint
    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);

    // 4. Button Binding (Cloning prevents multiple listener stacking)
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = () => {
        const reps = parseInt(input.value, 10);
        if (isNaN(reps) || reps < 2) return alert("Please enter a number of 2 or more.");

        overlay.style.display = "none";

        // DATA INTEGRITY: Your original splice logic preserved exactly
        // Insert End first so Start index remains constant
        builderState.poses.splice(endIdx + 1, 0, { id: "LOOP_END", name: "🔚 End Repeat Block", duration: 0, variation: "", note: "" });
        builderState.poses.splice(startIdx, 0, { id: "LOOP_START", name: `🔁 Repeat Block (${reps} Rounds)`, duration: reps, variation: "", note: "" });
        
        // 5. Cleanup & Refresh
        checkboxes.forEach(c => c.checked = false);
        builderRender();
        
        // Brief delay for the alert to allow DOM to render the new rows first
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
    if (printBtn) {
    }

    const catEdit = document.getElementById("builderCategory");
    if (catEdit) {
        catEdit.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                catEdit.blur();     
            }
        });
    }


    const rowInput = document.getElementById("rowSearchInput");
    const rowResults = document.getElementById("rowSearchResults");
    if (rowInput && rowResults) {
        rowInput.oninput = () => {
            const rawQ = rowInput.value.trim().toLowerCase();
            if (rawQ.length < 1) { rowResults.innerHTML = ""; return; }
            
            const q = typeof normaliseText === 'function' ? normaliseText(rawQ) : rawQ;
            const lib = getAsanaIndex();

            const scoredMatches = lib.map(a => {
                let score = 0;
                
                // 1. Normalize strings
                const id = String(a.id || "").toLowerCase();
                const eng = typeof normaliseText === 'function' ? normaliseText(a.english || a.name || "").toLowerCase() : (a.english || a.name || "").toLowerCase();
                const iast = typeof normaliseText === 'function' ? normaliseText(a.iast || "").toLowerCase() : (a.iast || "").toLowerCase();

                // 2. ID Match (Highest Priority: 100-200 pts)
                if (id === q || id.replace(/^0+/, '') === q) score += 200;
                else if (id.startsWith(q)) score += 100;

                // 3. Word-Boundary Match (80-100 pts)
                const engWords = eng.split(/[\s-]/);
                const iastWords = iast.split(/[\s-]/);
                
                if (eng.startsWith(q) || iast.startsWith(q)) {
                    score += 100; // Exact start of the entire name (e.g. "Sirsa Padasana")
                } else if (engWords.some(w => w.startsWith(q)) || iastWords.some(w => w.startsWith(q))) {
                    score += 80;  // Start of a middle word (e.g. "Salamba Sirsasana")
                } else if (eng.includes(q) || iast.includes(q)) {
                    score += 30;  // Just contains it somewhere
                }

                // 4. Iyengar "Base Pose" Boost (+25 pts)
                // Salamba Sirsasana I, Virabhadrasana I, etc. are the true base poses.
                if (eng.endsWith(" i") || iast.endsWith(" i")) {
                    score += 25;
                }

                // 5. Modifier Penalty (-12 pts per modifier)
                // This forces complex poses (Eka Pada, Revolved, Stage II) to sink below the base poses
                const modifierRegex = /\b(parivrtta|parsva|eka|dwi|baddha|mukta|urdhva|pinda|janu|supta|ardha|variation|ii|iii|iv|v|vi)\b/g;
                const engModifiers = eng.match(modifierRegex) || [];
                const iastModifiers = iast.match(modifierRegex) || [];
                
                score -= ((engModifiers.length + iastModifiers.length) * 12);

                // 6. Light Length Tie-Breaker (Shorter, simpler names win ties)
                if (score > 0) score -= (eng.length * 0.1);

                return { asana: a, score };
            });

            // Filter 0s and sort highest to lowest
            const sortedMatches = scoredMatches
                .filter(m => m.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 15);

            if (sortedMatches.length === 0) {
                rowResults.innerHTML = `<div style="padding:20px; color:#999; text-align:center;">No poses found matching "${rawQ}"</div>`;
                return;
            }

            rowResults.innerHTML = sortedMatches.map(({ asana: a }) => `
                <div style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:10px; align-items:center;" 
                     onclick="window.selectRowSearch('${a.id}')">
                    <div style="background:#007aff; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem; min-width:28px; text-align:center;">${a.id}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; color:#1d1d1f; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.english || a.name}</div>
                        <div style="font-size:0.75rem; color:#86868b; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.iast || ''}</div>
                    </div>
                    <div style="color:#007aff; font-size:0.8rem; font-weight:bold; padding-left:5px;">→</div>
                </div>
            `).join("");
        };
    }
}

if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", wireBuilderGlobals); } else { wireBuilderGlobals(); }

window.selectRowSearch = (id) => {
    if (builderState.activeRowSearchIdx >= 0 && builderState.poses[builderState.activeRowSearchIdx]) {
        const val = String(id).padStart(3, '0');
        const targetPose = builderState.poses[builderState.activeRowSearchIdx];
        
        // 👈 THE FIX: Clear Phantom State on Search
        if (targetPose.id !== val) {
            targetPose.variation = "";
        }

        targetPose.id = val;
        
        const libraryArray = Object.values(window.asanaLibrary || {});
        const normId = typeof normalizePlate === "function" ? normalizePlate(val) : val;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        
        if (asanaMatch) {
            targetPose.name = asanaMatch.english || asanaMatch.devanagari || asanaMatch.name;
            if (window.getHoldTimes) {
                const holdTimes = window.getHoldTimes(asanaMatch);
                const nextDuration = isFlowSequence() ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30);
                targetPose.duration = nextDuration;
                targetPose.flowHoldOverride = isFlowSequence() ? nextDuration : null;
            }
        }
        builderRender();
    }
    document.getElementById('rowSearchOverlay').style.display = 'none';
};


window.triggerRowSearch = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    
    builderState.activeRowSearchIdx = parseInt(idx, 10);
    
    const overlay = document.getElementById('rowSearchOverlay');
    const input = document.getElementById('rowSearchInput');
    const results = document.getElementById('rowSearchResults');

    if (!overlay) {
        console.error("Architect Error: rowSearchOverlay missing from DOM.");
        return;
    }

    // 1. DOM Reparenting Failsafe: Ensures immune viewport rendering
    if (overlay.parentNode !== document.body) {
        document.body.appendChild(overlay);
    }

    // 2. State Toggle Only (Visuals delegated to components.css)
    overlay.style.display = 'flex';
    
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    
    setTimeout(() => {
        if (input) {
            input.focus();
            input.click();
        }
    }, 100);
};

export {
    builderRender, builderCompileSequenceJSON, processSemicolonCommand, openEditCourse, builderOpen, builderSave, createRepeatGroup,
    openLinkSequenceModal // Correctly exported
};
export { movePose, removePose, addPoseToBuilder } from "../store/builderState.js";