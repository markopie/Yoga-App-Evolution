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

        // BUILD THE DURATION INPUT (Locked if not Flow/Macro)
        // BUILD THE DURATION INPUT (Locked if not Flow/Macro/Loop)
        const displayTime = (isMacro || isLoopStart) ? durOrReps : (isFlow ? durOrReps : (asana?.hold_data?.standard || 30));
        const isLocked = !isFlow && !isMacro && !isLoopStart;

        let durInputHTML = ``;
        if (isLoopEnd) {
             durInputHTML = `<span style="color:#aaa;">-</span>`;
        } else {
             durInputHTML = `
                <input type="number" class="b-dur" data-idx="${idx}" 
                    value="${displayTime}" 
                    min="1" 
                    ${isLocked ? 'readonly' : ''} 
                    style="width:60px; padding:4px; border:1px solid #ccc; text-align:center; ${isLocked ? 'background:#f0f0f0; color:#888; cursor:not-allowed;' : ''}">
                ${(isMacro || isLoopStart) ? `<div style="font-size:0.7rem; color:#0d47a1; margin-top:4px; font-weight:bold;">Rounds</div>` : (isLocked ? '' : `<button class="tiny b-std-time" data-idx="${idx}" style="display:block; margin:4px auto 0;">⏱ Std</button>`)}
            `;
        }
    
        const isSpecial = isMacro || isLoopStart || isLoopEnd;

        // --- 4. INJECT HTML ---
        tr.innerHTML = `
           <td style="padding:8px; text-align:center; color:#888;">
              <input type="checkbox" class="b-row-select" data-idx="${idx}" style="margin-bottom: 4px;" ${isSpecial ? 'disabled' : ''}><br>
              ${idx + 1}
           </td>
           <td style="padding:8px;">
              <div style="font-weight:bold; margin-bottom:4px; line-height: 1.2;">
                 ${pose.name || 'Unknown'} ${sideBadge}
              </div>
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" ${isSpecial ? 'readonly' : ''} style="width:${isSpecial ? 'auto' : '50px'}; padding:2px; border:1px solid #ccc; border-radius:4px; ${isSpecial ? 'background:#f0f0f0;' : ''}">
                 ${varSelectHTML}
              </div>
           </td>
           <td style="padding:8px; text-align:center;">
              ${durInputHTML}
           </td>
           <td style="padding:8px;">
              <input type="text" class="b-note" data-idx="${idx}" value="${(pose.note || '').replace(/"/g, '&quot;')}" placeholder="Notes..." style="width:100%; padding:4px; border:1px solid #ccc;">
           </td>
           <td style="padding:8px; text-align:center; white-space:nowrap;">
              <button class="tiny b-move-top" data-idx="${idx}" title="Move to Top" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤒</button>
              <button class="tiny b-move-bot" data-idx="${idx}" title="Move to Bottom" ${idx === builderPoses.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤓</button>
              <button class="tiny b-move-up" data-idx="${idx}">▲</button>
              <button class="tiny b-move-dn" data-idx="${idx}">▼</button>
              <button class="tiny warn b-remove" data-idx="${idx}">✕</button>
           </td>`;
           
        tbody.appendChild(tr);

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

    qS('.b-note').forEach(el => el.oninput = (e) => builderPoses[e.target.dataset.idx].note = e.target.value);
    qS('.b-move-up').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), -1));
    qS('.b-move-dn').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), 1));
    qS('.b-remove').forEach(el => el.onclick = () => removePose(parseInt(el.dataset.idx)));
  
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
        // Efficiently calculate expanded totals
        const tempSeq = { poses: builderPoses.map(p => [p.id, p.duration, p.variation || "", p.variation || "", p.note || ""]) };
        const expanded = (typeof window.getExpandedPoses === "function") ? window.getExpandedPoses(tempSeq) : builderPoses;
        
        const finalTotalSecs = expanded.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
        const expandedPoseCount = expanded.length;

        const m = Math.floor(finalTotalSecs / 60);
        const s = finalTotalSecs % 60;
        statsEl.textContent = `${expandedPoseCount} poses · ${m}m ${s}s total (incl. reps & sides)`;
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



async function processSemicolonCommand(commandString, useMehta = false) {
    const parts = commandString.split(';').map(p => p.trim());
    if (parts.length < 3) return;

    const [title, category, idsStr] = parts;
    
    // Expand ranges (001-005) if any, then split by comma
    const expandedIds = idsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        let r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) {
            if (useMehta) {
               r.push(String(i));
            } else {
               r.push(String(i).padStart(3, '0'));
            }
        }
        return r.join(',');
    });

    const parsedArray = expandedIds.split(',').map(s => s.trim()).filter(id => id.length > 0 && id !== "000");
    const validAsanas = [];
    
    parsedArray.forEach(id => {
       if (!useMehta) {
           const cleanId = id.padStart(3, '0');
           if (window.asanaLibrary[cleanId]) {
               validAsanas.push({ id: cleanId, asana: window.asanaLibrary[cleanId] });
           }
       } else {
           const asanaArr = Object.values(window.asanaLibrary);
           const asana = asanaArr.find(a => {
               if (!a.yoga_the_iyengar_way_id) return false;
               if (a.yoga_the_iyengar_way_id === id) return true;
               const pList = a.yoga_the_iyengar_way_id.split(',').map(s=>s.trim());
               return pList.some(p => p === id || p.replace(/\s*\|\s*/g, '') === id);
           });
           if (asana) {
               validAsanas.push({ id: asana.id, asana: asana });
           }
       }
    });

    // Format: ID | Duration | [] (Matches existing DB format with empty notes)
    const sequenceText = validAsanas.map(item => {
        const duration = item.asana?.hold_data?.standard || 30;
        return `${item.id} | ${duration} | []`; 
    }).join('\n');

    const payload = {
        title: title,
        category: category,
        sequence_text: sequenceText,
        last_edited: new Date().toISOString()
    };

    const { error } = await supabase.from('courses').upsert([payload], { onConflict: 'title, category' });
    if (error) {
        console.error(`❌ Error saving ${title}:`, error.message);
        throw error; // Pass it up to the main try/catch
    }
}





// Removed dynamic button creation as it's now explicitly in index.html

function openLinkSequenceModal() {
    // We can use a simple prompt for now, but a searchable dropdown is better.
    // Let's create a tiny temporary overlay or use a prompt with a datalist hint.
    const allTitles = window.courses.map(c => c.title).filter(Boolean);
    const targetTitle = prompt(`Enter Sequence Title to link:\nAvailable: ${allTitles.join(", ")}`);
    
    if (!targetTitle) return;
    
    // Validate that the course exists
    const exists = window.courses.find(c => c.title.trim().toLowerCase() === targetTitle.trim().toLowerCase());
    if (!exists) {
        alert("Sequence not found. Please enter the exact title.");
        return;
    }

    const reps = prompt(`How many repetitions for "${exists.title}"?`, "1");
    if (reps === null) return;

    // Add as a Macro row to builderPoses
    
    builderPoses.unshift({ // Changed from .push()
    id: `MACRO:${exists.title}`,
    name: `[Sequence] ${exists.title}`,
    duration: parseInt(reps) || 1,
    variation: "",
    note: `Linked Sequence: ${reps} Rounds`
});

    builderRender(); // Refresh the table
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
            last_edited: new Date().toISOString()
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
        alert(`"${title}" saved successfully!`);

    } catch(e) {
        console.error("❌ Save failed:", e);
        alert("Failed to save: " + (e.message || "Unknown error"));
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
