import { $, safeListen } from "../utils/dom.js";
import { parseHoldTimes, parseSequenceText, buildHoldString } from "../utils/parsing.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { formatHMS, displayName } from "../utils/format.js";

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
// When true, builder rows show asana.name (Sanskrit) instead of asana.english.
let builderShowSanskrit = false;

/** Returns the display name for a pose row respecting the Sanskrit toggle. */
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
    
    // --- NEW: Category Detection ---
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
            
            // IF NOT FLOW: Force library standard timing
            const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
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

        // Duration is now governed by library defaults — no per-row editing needed
        // For macros/loop-starts, we still allow rounds input
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
        // Inform the builder author about auto-injected prep/recovery poses so the
        // total runtime makes sense (injected time is NOT included in the builder stats).
        let injectionBadgesHTML = '';
        if (!isSpecial && asana) {
            const lib = window.asanaLibrary || {};

            // Helper: resolve a pose ID to its name + standard duration
            const resolvePose = (rawId) => {
                if (!rawId || rawId === 'NULL' || rawId === 'null') return null;
                const cleanId = String(rawId).trim().replace(/\|/g, '').replace(/\s+/g, '');
                const parsed = cleanId.match(/^(\d+)(.*)?$/);
                if (!parsed) return null;
                const numId = parsed[1].padStart(3, '0');
                const varSuffix = (parsed[2] || '').toUpperCase();
                const target = lib[numId];
                if (!target) return null;
                // hold_json is the field in asanaLibrary; hold_data is on variation objects
                let dur = (target.hold_json?.standard) ?? (target.hold_data?.standard) ?? target.standard_seconds ?? 30;
                let name = target.english || target.name || `ID ${numId}`;
                if (varSuffix && target.variations) {
                    const vd = target.variations[varSuffix];
                    if (vd) {
                        name += ` (${vd.title || varSuffix})`;
                        dur = (vd.hold_data?.standard) ?? dur;
                    }
                }
                // Double if sides required
                if (target.requiresSides || target.requires_sides) dur *= 2;
                return { name, dur };
            };

            // Check base asana's prep/recovery
            let prepId = asana.preparatory_pose_id;
            let recovId = asana.recovery_pose_id;

            // Check if the currently selected variation overrides them
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

        // --- 4. INJECT HTML ---
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
           <td style="padding:8px; text-align:center; white-space:nowrap;">
              <button class="tiny b-move-top" data-idx="${idx}" title="Move to Top" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤒</button>
              <button class="tiny b-move-bot" data-idx="${idx}" title="Move to Bottom" ${idx === builderPoses.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤓</button>
              <button class="tiny b-move-up" data-idx="${idx}">▲</button>
              <button class="tiny b-move-dn" data-idx="${idx}">▼</button>
              <button class="tiny warn b-remove" data-idx="${idx}">✕</button>
           </td>`;
           
        tbody.appendChild(tr);

        // ── Ambiguous page warning banner ──────────────────────────────────────
        // Shown when multiple asanas share the same page_primary. User must pick.
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
                <td colspan="3" style="
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

        // Flash highlight for newly unshifted row

        if (idx === 0 && builderPoses.length > 1) {
            tr.style.backgroundColor = "#fff9c4"; 
            setTimeout(() => { tr.style.transition = "background 1s"; tr.style.backgroundColor = ""; }, 100);
        }
    }); // <--- END OF THE forEach LOOP
 
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
            if (asanaMatch.hold_data?.standard) builderPoses[i].duration = asanaMatch.hold_data.standard;
        }
        builderRender();
    });

    qS('.b-std-time').forEach(el => el.onclick = () => {
        const i = el.dataset.idx;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderPoses[i].id) : builderPoses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch?.hold_data?.standard) { builderPoses[i].duration = asanaMatch.hold_data.standard; builderRender(); }
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

    // Rounds input for Macros and Loop starts only
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

    // ── Ambiguous-page resolution buttons ─────────────────────────────────────
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

    // ── Disable Save while any ambiguous row exists ───────────────────────────
    const saveBtn = document.getElementById('editCourseSaveBtn');
    if (saveBtn) {
        const hasAmbiguous = builderPoses.some(p => p._ambiguous);
        saveBtn.disabled = hasAmbiguous;
        saveBtn.title = hasAmbiguous
            ? 'Resolve all ⚠️ ambiguous pages before saving'
            : '';
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

    // --- 6. STATS UPDATER (Builder Modal) ---
    const statsEl = document.getElementById("builderStats");
    if (statsEl) {
        // Build a sequence using library-standard hold times (the source of truth for timing)
        const libraryArray2 = Object.values(window.asanaLibrary || {});
        
        const tempPoses = builderPoses.map(p => {
            const idStr = String(p.id);
            const isMacroOrLoop = idStr.startsWith("MACRO:") || idStr.startsWith("LOOP_");
            let standardTime = p.duration; // fallback
            
            if (!isMacroOrLoop) {
                const normId2 = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
                const asana2 = libraryArray2.find(a => String(a.id || a.asanaNo) === String(normId2));
                if (asana2 && asana2.hold_data && asana2.hold_data.standard) {
                    standardTime = asana2.hold_data.standard;
                }
            }
            
            return [p.id, standardTime, p.variation || "", p.variation || "", p.note || ""];
        });
        
        const tempSeq = { poses: tempPoses };
        const expanded = (typeof window.getExpandedPoses === "function") ? window.getExpandedPoses(tempSeq) : builderPoses;
        
        // Authored poses = non-injected (no note matching the injection marker)
        const authoredPoses  = expanded.filter(p => !String(p[4] || "").includes("Auto-Injected"));
        const injectedPoses  = expanded.filter(p =>  String(p[4] || "").includes("Auto-Injected"));

        const authoredSecs  = authoredPoses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
        const injectedSecs  = injectedPoses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
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
    const parts = commandString.split(';').map(p => p.trim());
    if (parts.length < 3) return;

    const [title, category, idsStr] = parts;

    // ── Pre-populate the builder title + category fields immediately ──────────
    const titleEl = document.getElementById('builderTitle');
    const catEl   = document.getElementById('builderCategory');
    if (titleEl && title)    titleEl.value = title;
    if (catEl   && category) catEl.value   = category;

    // Expand integer ranges (51-55) then split by comma
    // Note: decimal tokens like 44.1 are NOT expanded by range logic
    const expandedTokens = idsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        const r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) r.push(String(i));
        return r.join(',');
    });

    const tokens = expandedTokens.split(',').map(s => s.trim()).filter(s => s.length > 0 && s !== '0');

    // ── Per-token resolution using Mehta page_primary lookup ─────────────────
    // Strategy:
    //   1. Fast path  – scan asanaLibrary for page_primary match (no network).
    //   2. Stage path – scan asanaLibrary.variations for page_primary match.
    //   3. Network    – query asanas (without limit) to detect multi-match pages,
    //                   then stages as fallback.
    //   4. Fallback   – treat the token as a direct LOY ID (padded to 3 digits).
    //
    // Decimal support: parseFloat handles both "44" and "44.1"

    const resolveToken = async (token) => {
        // ── Parse page number (supports decimals like 44.1) ───────────────────
        const pageNum = parseFloat(token);
        const isPageNum = !isNaN(pageNum) && /^\d+(\.\d+)?$/.test(token.trim());

        if (isPageNum) {
            const libArray = Object.values(window.asanaLibrary || {});

            // ── Fast path: base asanas ────────────────────────────────────────
            const baseMatches = libArray.filter(a =>
                parseFloat(a.page_primary) === pageNum
            );

            if (baseMatches.length === 1) {
                const m = baseMatches[0];
                return { id: m.id, asana: m, variation: '', stageKey: '',
                         name: m.english || m.name || m.id,
                         _pageNum: pageNum };
            }
            if (baseMatches.length > 1) {
                // Multiple asanas share this page — flag for user confirmation
                const primary = baseMatches[0];
                return {
                    id: primary.id, asana: primary, variation: '', stageKey: '',
                    name: primary.english || primary.name || primary.id,
                    _pageNum: pageNum,
                    _ambiguous: true,
                    _alternatives: baseMatches.slice(1).map(a => ({
                        id: a.id, name: a.english || a.name || a.id, asana: a
                    }))
                };
            }

            // ── Fast path: stages (variations) ───────────────────────────────
            for (const a of libArray) {
                if (!a.variations) continue;
                for (const [stageKey, vData] of Object.entries(a.variations)) {
                    if (vData && parseFloat(vData.page_primary) === pageNum) {
                        return {
                            id: a.id, asana: a, variation: stageKey, stageKey,
                            name: `${a.english || a.name} › ${vData.title || stageKey}`,
                            _pageNum: pageNum
                        };
                    }
                }
            }

            // ── Network path ──────────────────────────────────────────────────
            try {
                // Fetch WITHOUT limit to catch multi-match pages
                const { data: aHits } = await supabase
                    .from('asanas')
                    .select('id, english_name, name')
                    .eq('page_primary', pageNum);

                if (aHits && aHits.length === 1) {
                    const row = aHits[0];
                    const asanaKey = String(row.id).padStart(3, '0');
                    const asana = window.asanaLibrary?.[asanaKey];
                    return { id: asanaKey, asana: asana || { id: asanaKey },
                             variation: '', stageKey: '',
                             name: row.english_name || row.name || asanaKey,
                             _pageNum: pageNum };
                }

                if (aHits && aHits.length > 1) {
                    // Ambiguous — multiple asanas on this page
                    const primary = aHits[0];
                    const asanaKey = String(primary.id).padStart(3, '0');
                    const asana = window.asanaLibrary?.[asanaKey];
                    return {
                        id: asanaKey, asana: asana || { id: asanaKey },
                        variation: '', stageKey: '',
                        name: primary.english_name || primary.name || asanaKey,
                        _pageNum: pageNum,
                        _ambiguous: true,
                        _alternatives: aHits.slice(1).map(r => {
                            const k = String(r.id).padStart(3, '0');
                            return { id: k, name: r.english_name || r.name || k,
                                     asana: window.asanaLibrary?.[k] || { id: k } };
                        })
                    };
                }

                // Try stages table
                const { data: sHits } = await supabase
                    .from('stages')
                    .select('asana_id, stage_name, title')
                    .eq('page_primary', pageNum)
                    .limit(1);
                if (sHits && sHits.length > 0) {
                    const row = sHits[0];
                    const asanaKey = String(row.asana_id).padStart(3, '0');
                    const asana = window.asanaLibrary?.[asanaKey];
                    return {
                        id: asanaKey, asana: asana || { id: asanaKey },
                        variation: row.stage_name || '', stageKey: row.stage_name || '',
                        name: `${asana?.english || asanaKey} › ${row.title || row.stage_name || ''}`,
                        _pageNum: pageNum
                    };
                }
            } catch (netErr) {
                console.warn(`⚠️ page_primary network lookup failed for ${pageNum}:`, netErr.message);
            }

            console.warn(`⚠️ No asana or stage found for page_primary = ${pageNum}`);
            return null;
        }

        // ── Non-numeric token: treat as a direct LOY ID ───────────────────────
        const cleanId = token.padStart(3, '0');
        const asana = window.asanaLibrary?.[cleanId];
        if (asana) {
            return { id: cleanId, asana, variation: '', stageKey: '',
                     name: asana.english || asana.name || cleanId };
        }
        return null;
    };

    // Resolve all tokens (parallel for speed)
    const resolvedItems = await Promise.all(tokens.map(resolveToken));
    const validItems = resolvedItems.filter(Boolean);

    if (validItems.length === 0) {
        console.warn('⚠️ processSemicolonCommand: no valid poses resolved from:', idsStr);
        return;
    }

    // ── Add to builder (ambiguous items get _ambiguous flag — rendered with ⚠️) ─
    validItems.forEach(item => {
        const duration = item.asana?.hold_data?.standard || item.asana?.hold_json?.standard || 30;
        builderPoses.push({
            id: item.id,
            name: item.name,
            duration,
            variation: item.stageKey || '',
            note: item.stageKey ? `[${item.stageKey}]` : '',
            // Ambiguous-page metadata — used by builderRender to show ⚠️ UI
            _ambiguous:     item._ambiguous || false,
            _pageNum:       item._pageNum || null,
            _alternatives:  item._alternatives || []
        });
    });

    builderRender();

    // ── Persist to Supabase (skip ambiguous rows — they need resolution first) ─
    const saveable = validItems.filter(item => !item._ambiguous);
    if (saveable.length === 0) {
        console.warn('⚠️ All resolved items are ambiguous — resolve conflicts before saving.');
        return;
    }

    const sequenceText = saveable.map(item => {
        const duration = item.asana?.hold_data?.standard || item.asana?.hold_json?.standard || 30;
        const varPart = item.stageKey ? `[${item.stageKey}]` : `[]`;
        return `${item.id} | ${duration} | ${varPart}`;
    }).join('\n');

    const payload = { title, category, sequence_text: sequenceText,
                      last_edited: new Date().toISOString(),
                      user_id: window.currentUserId || null };
    try {
        const { error } = await supabase.from('courses').upsert([payload], { onConflict: 'title, category' });
        if (error) { console.error(`❌ Error saving ${title}:`, error.message); throw error; }
        console.log(`✅ Bulk import saved: "${title}" (${saveable.length} poses${validItems.length - saveable.length > 0 ? `, ${validItems.length - saveable.length} awaiting disambiguation` : ''})`);
    } catch (e) {
        console.error('❌ processSemicolonCommand save failed:', e);
        throw e;
    }
}



// Removed dynamic button creation as it's now explicitly in index.html

function openLinkSequenceModal() {
    const overlay   = document.getElementById('linkSequenceOverlay');
    const input     = document.getElementById('linkSequenceInput');
    const datalist  = document.getElementById('linkSequenceList');
    const repsInput = document.getElementById('linkSequenceReps');
    if (!overlay) return;

    // Populate datalist with all courses (Flow takes priority, rest alphabetical)
    const allCourses = [...(window.courses || [])];
    const sorted = [
        ...allCourses.filter(c => (c.category || '').toLowerCase().includes('flow')),
        ...allCourses.filter(c => !(c.category || '').toLowerCase().includes('flow'))
    ];
    if (datalist) {
        datalist.innerHTML = sorted
            .map(c => `<option value="${c.title}">${c.category ? '(' + c.category + ')' : ''}</option>`)
            .join('');
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
    builderPoses = []; // CRITICAL: Clear previous state
    let targetId = seq ? (seq.supabaseId || seq.id) : null;

    // Use your $ helper consistently for all elements at the start
    const catInput = $("builderCategory"); 
    const titleEl = $("builderTitle");
    const modeLabel = $("builderModeLabel");
    const datalist = $("builderCategoryList");

    if (catInput) {
        // Forces re-render to check for "Flow" on every keystroke
        catInput.oninput = () => builderRender(); 
    }

    // Global IDs are short integers (e.g., "170"). User sequences use long UUIDs.
    if (targetId && String(targetId).length < 30) {
        targetId = null;
    }
    builderEditingSupabaseId = targetId;

    document.body.classList.add("modal-open");

    // SETUP SEARCH LISTENER
    setupBuilderSearch();

    // ── Sanskrit / English toggle button ─────────────────────────────────────
    const nameToggleBtn = document.getElementById('builderNameToggle');
    if (nameToggleBtn) {
        // Reflect current state on open
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

    // Populate Category Datalist
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
       const rawPoses = (window.currentSequenceOriginalPoses && seq === window.currentSequence)
           ? window.currentSequenceOriginalPoses : (seq.poses || []);
           rawPoses.forEach(p => {
             const rawId = Array.isArray(p[0]) ? p[0][0] : p[0] || "";
             const idStr = String(rawId);
             
             if (idStr === "LOOP_START") {
                builderPoses.push({
                    id: "LOOP_START",
                    name: `🔁 Loop Starts Here (${p[1]} Rounds)`,
                    duration: Number(p[1]) || 2,
                    variation: "",
                    note: ""
                });
                return;
             }
             if (idStr === "LOOP_END") {
                builderPoses.push({
                    id: "LOOP_END",
                    name: "🔁 Loop Ends Here",
                    duration: 0,
                    variation: "",
                    note: ""
                });
                return;
             }
             if (idStr.startsWith("MACRO:")) {
                builderPoses.push({
                    id: idStr,
                    name: `[Sequence] ${idStr.replace("MACRO:", "").trim()}`,
                    duration: Number(p[1]) || 1,
                    variation: "",
                    note: p[4] || "" // p[4] is the note for macros
                });
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
                note: rawExtras
             });
         });
    }
 
    builderRender();
    $("editCourseBackdrop").style.display = "flex";
    setTimeout(() => { if($("builderSearch")) $("builderSearch").focus(); }, 50);
}

function builderUpdateStats() {
   const statsEl = $("builderStats");
   if (!statsEl) return;
   if (!builderPoses.length) { statsEl.textContent = ""; return; }
   const total = builderPoses.reduce((s, p) => s + (p.duration || 0), 0);
   statsEl.textContent = `${builderPoses.length} poses · ${formatHMS(total)} estimated`;
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
        
        // Enforces exact 3-column structure: ID | Duration | [Variation] Note
        const varPart = p.variation ? `[${p.variation}]` : `[]`;
        const notePart = p.note ? p.note.trim() : "";
        
        return `${id} | ${dur} | ${varPart} ${notePart}`.trim();
    }).filter(s => s.trim().length > 0).join("\n");
}

function builderGetTitle() {
   return ($("builderTitle")?.value || "").trim();
}

function builderGetCategory() {
   return ($("builderCategory")?.value || "").trim();
}

async function builderSave() {
    console.log("DB Target ID:", builderEditingSupabaseId);
    console.log("Current User ID:", window.currentUserId);

    // 1. Extract and Validate Data
    const title = builderGetTitle();
    if (!title) { alert("Please enter a title."); return; }
    
    const sequenceText = builderCompileSequenceText();
    const category = builderGetCategory();
    const isFlow = category.toLowerCase().includes("flow"); 
    
    // 2. Calculate Total Time (Expanded)
    const tempSeq = { poses: builderPoses.map(p => [p.id, p.duration, p.variation || "", p.variation || "", p.note || ""]) };
    const expanded = (typeof window.getExpandedPoses === "function") ? window.getExpandedPoses(tempSeq) : builderPoses;
    const totalSec = expanded.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);

    // 3. Database Operation
    try {
        if (!supabase) return;
        if (!window.currentUserId) {
            alert("You must be signed in to save sequences.");
            return;
        }
        let result;

        const payload = {
            title, 
            category, 
            sequence_text: sequenceText,
            last_edited: new Date().toISOString(),
            user_id: window.currentUserId
        };

        console.log("🚀 SAVING TO SUPABASE (courses):", payload);

        // Thanks to the unique composite index (title, category) on courses, we can safely and cleanly upsert:
        const { data, error: upsertError } = await supabase.from('courses')
            .upsert([payload], { onConflict: 'title, category' })
            .select();

        if (upsertError) throw upsertError;
        console.log("✅ SUPABASE UPSERT SUCCESS:", data);

        // 4. UI Refresh
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
        // ── Save success feedback ─────────────────────────────────────────────
        if (isAdmin() && data && data[0]) {
            const savedId = data[0].id;
            const promote = confirm(`"${title}" saved!\n\n📌 Promote to published? Makes it visible to all users.\n\nOK = Publish   |   Cancel = Keep as private draft`);
            if (promote) {
                await supabase.from('courses')
                    .update({ is_system: true })
                    .eq('id', savedId);
            }
        } else {
            alert(`"${title}" saved!`);
        }

    } catch(e) {
        console.error("❌ Save failed:", e);
        alert("Save failed. Please try again.\n\n(Detail: " + (e.message?.replace(/https?:\/\/\S+/g, "").trim() || "Unknown error") + ")");
    }
}

function addPoseToBuilder(poseData) {
    builderPoses.push(poseData);
    builderRender();
}

function createRepeatGroup() {
    console.log("createRepeatGroup UI flow started");
    const checkboxes = document.querySelectorAll('.b-row-select:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one pose using the checkboxes.");
        return;
    }

    const idxs = Array.from(checkboxes).map(c => parseInt(c.dataset.idx)).sort((a,b) => a - b);
    const startIdx = idxs[0];
    const endIdx = idxs[idxs.length - 1]; 
    
    // Safety check for existing macros/loops
    for (let i = startIdx; i <= endIdx; i++) {
        const idStr = String(builderPoses[i].id);
        if (idStr.startsWith('MACRO:') || idStr.startsWith('LOOP_')) {
            alert("Cannot create a repeat group that intersects with Macros or other loops.");
            return;
        }
    }

    // Show the custom modal
    const overlay = document.getElementById("repetitionModalOverlay");
    const input = document.getElementById("repetitionInput");
    const confirmBtn = document.getElementById("btnConfirmRepetition");

    overlay.style.display = "flex";
    input.focus();
    input.select();

    // Remove any old listener to prevent multiple bindings
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = () => {
        const reps = parseInt(input.value, 10);
        if (isNaN(reps) || reps < 2) {
            alert("Please enter a number of 2 or more.");
            return;
        }

        console.log(`Injecting Loop: ${reps} rounds for range ${startIdx}-${endIdx}`);
        
        // Close modal
        overlay.style.display = "none";

        // Insert Loop End first (so indices don't shift for Loop Start)
        builderPoses.splice(endIdx + 1, 0, {
            id: "LOOP_END",
            name: "🔁 Loop Ends Here",
            duration: 0,
            variation: "",
            note: ""
        });
        
        // Insert Loop Start
        builderPoses.splice(startIdx, 0, {
            id: "LOOP_START",
            name: `🔁 Loop Starts Here (${reps} Rounds)`,
            duration: reps,
            variation: "",
            note: ""
        });
        
        checkboxes.forEach(c => c.checked = false);
        builderRender();
        
        setTimeout(() => alert(`Successfully created a repetition group of ${endIdx - startIdx + 1} poses!`), 100);
    };
}

function setupBuilderSearch() {
    const searchInput = $("builderSearch");
    const resultsBox = $("builderSearchResults");
    if (!searchInput || !resultsBox) return;

    // Reset previous state
    resultsBox.style.display = "none";
    
    searchInput.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            const val = searchInput.value.trim();
            if (val.includes(';')) {
                e.preventDefault();
                processSemicolonCommand(val);
                searchInput.value = "";
            } else if (val.length >= 1) {
                const source = $("builderIdSource")?.value || "loy";
                const library = getAsanaIndex();
                
                // Try perfect ID match based on source
                let perfectMatch = null;
                if (source === "mehta") {
                    perfectMatch = library.find(a => String(a.yoga_the_iyengar_way_id || "").padStart(3, '0') === val.padStart(3, '0'));
                } else {
                    perfectMatch = library.find(a => String(a.id).padStart(3, '0') === val.padStart(3, '0'));
                }

                if (perfectMatch) {
                    e.preventDefault();
                    addPoseToBuilder({
                        id: perfectMatch.id, // Always use LOY ID as the primary key for the sequence
                        name: perfectMatch.name || perfectMatch.english,
                        duration: perfectMatch.hold_data?.standard || 30,
                        variation: "",
                        note: ""
                    });
                    searchInput.value = "";
                    resultsBox.style.display = "none";
                }
            }
        }
    };

    searchInput.oninput = (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (query.length < 1 || query.includes(';')) {
            resultsBox.style.display = "none";
            return;
        }

        const source = $("builderIdSource")?.value || "loy";
        const library = getAsanaIndex();
        
        const matches = library.filter(asma => {
            let idMatch = false;
            if (source === "mehta") {
                idMatch = String(asma.yoga_the_iyengar_way_id || "").toLowerCase().includes(query);
            } else {
                idMatch = String(asma.id || asana.asanaNo || "").toLowerCase().includes(query);
            }
            
            const engMatch = (asma.english || "").toLowerCase().includes(query);
            const iastMatch = (asma.iast || "").toLowerCase().includes(query);
            const plateMatch = (asma.plates || "").toString().toLowerCase().includes(query);
            return idMatch || engMatch || iastMatch || plateMatch;
        });

        if (matches.length > 0) {
            resultsBox.innerHTML = matches.slice(0, 15).map(asma => {
                const displayId = (source === "mehta") ? (asma.yoga_the_iyengar_way_id || "N/A") : asma.id;
                const badgeColor = (source === "mehta") ? "#673ab7" : "#007aff"; // Purple for Mehta, Blue for LOY
                
                return `
                    <div class="search-result-item" data-id="${asma.id}" style="padding:10px; cursor:pointer; border-bottom:1px solid #eee; display:flex; gap:10px; align-items:center;">
                        <div style="background:${badgeColor}; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem;">${displayId}</div>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${asma.english || asma.name}</div>
                            <div style="font-size:0.75rem; color:#666; font-style:italic;">${asma.iast || ""}</div>
                        </div>
                    </div>
                `;
            }).join("");
            
            resultsBox.style.display = "block";
            
            // Positioning relative to the textarea
            const rect = searchInput.getBoundingClientRect();
            resultsBox.style.width = `${rect.width}px`;
            resultsBox.style.top = `${rect.bottom + 4}px`; 
            resultsBox.style.left = `${rect.left}px`;
            
            resultsBox.querySelectorAll('.search-result-item').forEach(item => {
                item.onclick = () => {
                    const id = item.dataset.id;
                    const asana = library.find(a => String(a.id) === id);
                    if (asana) {
                        addPoseToBuilder({
                            id: asana.id,
                            name: asana.name || asana.english,
                            duration: asana.hold_data?.standard || 30,
                            variation: "",
                            note: ""
                        });
                        searchInput.value = "";
                        resultsBox.style.display = "none";
                        searchInput.focus();
                    }
                };
            });
        } else {
            resultsBox.style.display = "none";
        }
    };

    // Close on blur
    searchInput.onblur = () => {
        setTimeout(() => { resultsBox.style.display = "none"; }, 250);
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
