import { $, safeListen } from "../utils/dom.js";
import { parseHoldTimes, parseSequenceText, buildHoldString } from "../utils/parsing.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { formatHMS, displayName } from "../utils/format.js";

const getEffectiveTime = (id, time) => window.getEffectiveTime ? window.getEffectiveTime(id, time) : time;
const getAsanaIndex = () => {
    return Object.values(window.asanaLibrary || {}).filter(Boolean);
};

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
        let asana = null;
    
        // --- 1. TIME CALCULATION (Using Helper & Override) ---
        if (isMacro) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const subCourse = window.courses ? window.courses.find(c => c.title === targetTitle) : null;
            
            if (subCourse && subCourse.poses) {
                const oneRoundSecs = subCourse.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1]), 0);
                totalSec += (oneRoundSecs * durOrReps); 
            }
        } else {
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
        const displayTime = isMacro ? durOrReps : (isFlow ? durOrReps : (asana?.hold_data?.standard || 30));
        const isLocked = !isFlow && !isMacro;

        const durInputHTML = `
            <input type="number" class="b-dur" data-idx="${idx}" 
                value="${displayTime}" 
                min="1" 
                ${isLocked ? 'readonly' : ''} 
                style="width:60px; padding:4px; border:1px solid #ccc; text-align:center; ${isLocked ? 'background:#f0f0f0; color:#888; cursor:not-allowed;' : ''}">
            ${isMacro ? `<div style="font-size:0.7rem; color:#0d47a1; margin-top:4px; font-weight:bold;">Rounds</div>` : (isLocked ? '' : `<button class="tiny b-std-time" data-idx="${idx}" style="display:block; margin:4px auto 0;">⏱ Std</button>`)}
        `;
    
        // --- 4. INJECT HTML ---
        tr.innerHTML = `
           <td style="padding:8px; text-align:center; color:#888;">${idx + 1}</td>
           <td style="padding:8px;">
              <div style="font-weight:bold; margin-bottom:4px; line-height: 1.2;">
                 ${pose.name || 'Unknown'} ${sideBadge}
              </div>
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" ${isMacro ? 'readonly' : ''} style="width:${isMacro ? 'auto' : '50px'}; padding:2px; border:1px solid #ccc; border-radius:4px; ${isMacro ? 'background:#f0f0f0;' : ''}">
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
        let finalTotalSecs = 0;
        let expandedPoseCount = 0;

        builderPoses.forEach(p => {
            const idStr = String(p.id);
            const durOrReps = Number(p.duration) || 0;

            if (idStr.startsWith("MACRO:")) {
                const targetTitle = idStr.replace("MACRO:", "").trim();
                const sub = (window.courses || []).find(c => c.title === targetTitle);
                if (sub && sub.poses) {
                    const oneRound = sub.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1]), 0);
                    finalTotalSecs += (oneRound * durOrReps);
                    expandedPoseCount += 1;
                }
            } else {
                // FIXED: Respect the "Flow" logic for accurate totals
                const normId = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
                const asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
                
                const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
                const activeTime = isFlow ? durOrReps : libraryStd;

                const effective = getEffectiveTime(p.id, activeTime);
                finalTotalSecs += effective;
                
                expandedPoseCount += (effective > activeTime) ? 2 : 1;
            }
        });

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



// 1. HELPER FUNCTION: Handles the actual Supabase injection
async function processSemicolonCommand(commandString) {
    const parts = commandString.split(';').map(p => p.trim());
    if (parts.length < 3) return;

    const [title, category, idsStr] = parts;
    
    // Expand ranges (001-005) if any, then split by comma
    const expandedIds = idsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        let r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) r.push(String(i).padStart(3, '0'));
        return r.join(',');
    });

    const idArray = expandedIds.split(',')
        .map(s => s.trim().padStart(3, '0'))
        .filter(id => id !== "000" && asanaLibrary[id]);

    // Format: ID | Duration | [] (Matches existing DB format with empty notes)
    const sequenceText = idArray.map(id => {
        const a = asanaLibrary[id];
        const duration = a?.hold_data?.standard || 30;
        return `${id} | ${duration} | []`; 
    }).join('\n');

    const payload = {
        title: title,
        category: category,
        sequence_text: sequenceText,
        pose_count: idArray.length,
        updated_at: new Date().toISOString(),
        user_id: window.currentUserId
    };

    const { error } = await supabase.from('user_sequences').insert([payload]);
    if (error) {
        console.error(`❌ Error saving ${title}:`, error.message);
        throw error; // Pass it up to the main try/catch
    }
}





// --- 1. THE LINK SEQUENCE BUTTON ---
const actionRow = document.querySelector('.builder-action-row'); // Adjust selector to your specific container
if (actionRow) {
    const linkBtn = document.createElement("button");
    linkBtn.innerHTML = "🔗 Link Sequence";
    linkBtn.className = "secondary"; // Use your existing secondary button style
    linkBtn.style.marginLeft = "8px";
    
    linkBtn.onclick = () => openLinkSequenceModal();
    actionRow.appendChild(linkBtn);
}

// --- 2. THE SEARCHABLE LINK MODAL ---
function openLinkSequenceModal() {
    // We can use a simple prompt for now, but a searchable dropdown is better.
    // Let's create a tiny temporary overlay or use a prompt with a datalist hint.
    const allTitles = courses.map(c => c.title).filter(Boolean);
    const targetTitle = prompt(`Enter Sequence Title to link:\nAvailable: ${allTitles.join(", ")}`);
    
    if (!targetTitle) return;
    
    // Validate that the course exists
    const exists = courses.find(c => c.title.trim().toLowerCase() === targetTitle.trim().toLowerCase());
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


// ============================================================
// SEQUENCE BUILDER
// ============================================================

let builderPoses = [];  // [{ id, name, duration, note, supabaseRowId? }]
let builderMode = "edit"; // "edit" | "new"
let builderEditingCourseIndex = -1;
let builderEditingSupabaseId = null;

function addHit(el) {
    const id = el.getAttribute('data-id');
    const name = el.getAttribute('data-name');
    
    // Change console log to reflect reality
    console.log("Adding pose to bottom:", name);

    // THE FIX: Change unshift to push
    builderPoses.push({ 
        id: id,
        name: name,
        duration: 30,
        note: ''
    });

    const input = document.getElementById('builderSearch');
    const resBox = document.getElementById('builderSearchResults');
    
    if (input) input.value = '';
    if (resBox) resBox.style.display = 'none';
    
    builderRender();
    if (input) input.focus();
}

function openEditCourse() {
   if (!currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", currentSequence);
}
function builderOpen(mode, seq) {
    builderMode = mode;
    builderPoses = [];
    builderEditingCourseIndex = -1;
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

    // Populate Category Datalist
    if (catInput && datalist) {
        const allCats = [...new Set(courses.map(c => c.category).filter(Boolean))].sort();
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
       
       const libraryArray = Object.values(asanaLibrary || {});
       const rawPoses = (window.currentSequenceOriginalPoses && seq === currentSequence)
           ? window.currentSequenceOriginalPoses : (seq.poses || []);

           rawPoses.forEach(p => {
            const id = String(Array.isArray(p[0]) ? p[0][0] : p[0] || "").padStart(3, '0');
            const asana = libraryArray.find(a => String(a.id) === id);
            
            // THE FIX: Do not include p[3] in this join! 
            // p[3] is the variation key. p[4] already has the brackets.
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
   
            // Legacy fuzzy matching (Kept intact)
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
                // If it already found the variation, clear the label so it doesn't bleed into notes
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
               note: rawExtras // This will now be completely clean
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

        const id = String(p.id).padStart(3, '0');
        const dur = p.duration || 30;
        
        // Enforces exact 3-column structure: ID | Duration | [Variation] Note
        const varPart = p.variation ? `[${p.variation}]` : `[]`;
        const notePart = p.note ? p.note.trim() : "";
        
        return `${id} | ${dur} | ${varPart} ${notePart}`.trim();
    }).join("\n");
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
    
    const libraryArray = Object.values(asanaLibrary || {});

    // 2. Calculate Total Time
    const totalSec = builderPoses.reduce((acc, p) => {
        const idStr = String(p.id);
        const durOrReps = Number(p.duration) || 0;

        if (idStr.startsWith("MACRO:")) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const sub = (window.courses || []).find(c => c.title === targetTitle);
            if (sub && sub.poses) {
                const oneRound = sub.poses.reduce((accSub, sp) => accSub + getEffectiveTime(sp[0], sp[1]), 0);
                return acc + (oneRound * durOrReps);
            }
            return acc;
        } else {
            const asana = libraryArray.find(a => String(a.id) === String(p.id));
            const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
            const activeTime = isFlow ? durOrReps : libraryStd;
            return acc + getEffectiveTime(p.id, activeTime);
        }
    }, 0);

    // 3. Database Operation
    try {
        if (!supabase) return;
        let result;

        const payload = {
            title, 
            category, 
            sequence_text: sequenceText,
            pose_count: builderPoses.length, 
            total_seconds: totalSec,
            updated_at: new Date().toISOString()
        };

        if (builderEditingSupabaseId) {
            // Update existing
            result = await supabase.from('user_sequences')
                .update(payload)
                .eq('id', builderEditingSupabaseId)
                .select();
            if (result.error) throw result.error;
        } else {
            // Insert new
            result = await supabase.from('user_sequences').insert([{
                ...payload,
                user_id: window.currentUserId
            }]).select();
            if (result.error) throw result.error;
        }

        // 4. UI Refresh
        await loadCourses(); 
        
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            const newIdx = courses.findIndex(c => c.title === title);
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

// Open the Modal and populate the searchable datalist
document.getElementById("btnOpenLinkModal")?.addEventListener("click", () => {
    const datalist = document.getElementById("linkSequenceList");
    if (datalist && window.courses) {
        // Grab all unique sequence titles
        const allTitles = [...new Set(window.courses.map(c => c.title).filter(Boolean))].sort();
        datalist.innerHTML = allTitles.map(t => `<option value="${t}"></option>`).join("");
    }
    
    document.getElementById("linkSequenceInput").value = "";
    document.getElementById("linkSequenceReps").value = "1";
    document.getElementById("linkSequenceOverlay").style.display = "flex";
});

// Confirm and Add to Builder
document.getElementById("btnConfirmLink")?.addEventListener("click", () => {
    const targetTitle = document.getElementById("linkSequenceInput").value.trim();
    const reps = parseInt(document.getElementById("linkSequenceReps").value, 10) || 1;
    
    if (!targetTitle) return alert("Please select a sequence.");

    // Add as a Macro row to the builderPoses array
    builderPoses.unshift({
        id: `MACRO:${targetTitle}`,
        name: `<span class="macro-title-badge">LINK</span> ${targetTitle}`,
        duration: reps, // We store reps in the duration column
        variation: "",
        note: `Repeats: ${reps}x`,
        isMacro: true // Flag it so we can style it in the table render
    });

    document.getElementById("linkSequenceOverlay").style.display = "none";
    
    // Call your function that redraws the table (e.g., builderRender)
    if (typeof builderRender === "function") builderRender();
});

(function setupBuilderSearch() {
    const input = document.getElementById("builderSearch");
    const results = document.getElementById("builderSearchResults");
    if (!input || !results) return;
 
    let debounceTimer;
 
    // NEW HELPER: Strips all accents/diacritics and converts to lowercase
    const normalize = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
 
    function positionResults() {
       const rect = input.getBoundingClientRect();
       results.style.top = (rect.bottom + window.scrollY) + "px";
       results.style.left = rect.left + "px";
       results.style.width = Math.max(rect.width, 280) + "px";
    }
 

    input.addEventListener("input", () => {
        const rawVal = input.value.trim();
    
        // 🚀 BULK ADD DETECTION
        // If the input contains a comma, we assume the user is bulk-adding IDs
        if (rawVal.includes(',')) {
            const idParts = rawVal.split(',').map(s => s.trim()).filter(s => s.length > 0);
            
            // Only trigger bulk add if they've finished typing at least one ID
            // We look for a trailing comma or a multi-ID list
            const lastChar = rawVal.slice(-1);
            if (lastChar !== ',') {
                // Optional: You could wait for 'Enter' for bulk, or just add them as they go.
                // Let's make it add only when they hit 'Enter' or if they paste a whole list.
                return; 
            }
    
            // Process all IDs except the very last one (if it's still being typed)
            const completedIds = idParts;
            
            completedIds.forEach(id => {
                const cleanId = id.padStart(3, '0');
                const asana = asanaLibrary[cleanId];
                
                if (asana) {
                    builderPoses.push({
                        id: cleanId,
                        name: displayName(asana),
                        duration: (asana.hold_data && asana.hold_data.standard) ? asana.hold_data.standard : 30,
                        note: ""
                    });
                }
            });
    
            builderRender();
            input.value = ""; // Clear input after bulk adding
            results.style.display = "none";
            return;
        }
       clearTimeout(debounceTimer);
       debounceTimer = setTimeout(() => {
          const rawQ = input.value.trim();
          const q = normalize(rawQ);
          
          // 1. Minimum character check
          if (q.length < 1) { results.style.display = "none"; return; }
 
          // 2. Smart ID Padding: If user types "1", we also look for "001"
          let paddedQ = "";
          if (/^\d+$/.test(q)) {
             paddedQ = q.padStart(3, '0');
          }
 
          const library = getAsanaIndex();
          const hits = library.filter(a => {
             // Flatten all searchable fields
             const name = normalize(a.name);
             const eng = normalize(a.english);
             const iast = normalize(a.iast);
             const aid = String(a.id || "").toLowerCase();
 
             // Match against normalized query OR padded ID
             return name.includes(q) || 
                    eng.includes(q) || 
                    iast.includes(q) || 
                    aid === q || 
                    (paddedQ && aid === paddedQ);
          }).slice(0, 25); // Increased limit slightly
 
          if (!hits.length) { 
             results.innerHTML = `<div style="padding:10px; color:#999; font-style:italic;">No poses found...</div>`;
             results.style.display = "block";
             positionResults();
             return; 
          }
 
          results.innerHTML = hits.map(a => {
             const dn = displayName(a);
             // Highlight what matched (optional improvement)
             const sub = (a.iast && a.iast !== dn) ? a.iast : (a.english && a.english !== dn ? a.english : "");
             return `<div class="b-search-item" data-id="${a.id}" data-name="${dn.replace(/"/g,'&quot;')}" data-english="${(a.english||"").replace(/"/g,'&quot;')}"
                style="padding:10px 12px; cursor:pointer; border-bottom:1px solid #eee; transition: background 0.2s;">
                <div style="font-weight:600; font-size:0.95rem; color:#111;">${dn}</div>
                ${sub ? `<div style="font-size:0.8rem; color:#666; margin-top:2px;">${sub}</div>` : ""}
                <div style="font-size:0.7rem; color:#aaa; margin-top:4px; font-family:monospace;">ID: ${a.id}</div>
             </div>`;
          }).join("");
 
          results.style.display = "block";
          positionResults();
       }, 150); // Slightly longer debounce for better performance
    });
 
    // Handle Enter key for Batch Posing and Direct-to-DB commands
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            const fullVal = input.value;
            const trimmedVal = fullVal.trim();
            if (!trimmedVal) return;

            // --- A. BATCH/SINGLE SEMICOLON COMMANDS ---
            if (trimmedVal.includes(';')) {
                e.preventDefault();
                const lines = fullVal.split('\n').map(l => l.trim()).filter(l => l.includes(';'));

                if (lines.length > 1) {
                    if (confirm(`Batch Mode: Detected ${lines.length} sequences. Create all now?`)) {
                        try {
                            for (const line of lines) {
                                await processSemicolonCommand(line);
                            }
                            alert(`✓ Successfully processed ${lines.length} sequences!`);
                            input.value = "";
                            await loadCourses();
                        } catch (err) {
                            alert("Batch failed mid-way: " + err.message);
                        }
                    }
                } else {
                    if (confirm(`Save "${trimmedVal.split(';')[0]}" to database?`)) {
                        try {
                            await processSemicolonCommand(trimmedVal);
                            alert("✓ Sequence added!");
                            input.value = "";
                            await loadCourses();
                        } catch (err) {
                            alert("Save failed: " + err.message);
                        }
                    }
                }
                return;
            }

            // --- B. BULK ADD POSES (If just IDs and commas, no semicolons) ---
            if (trimmedVal.includes(',') && !trimmedVal.includes(';')) {
                e.preventDefault();
                const idParts = trimmedVal.split(',').map(s => s.trim().padStart(3, '0')).filter(id => id !== "000" && asanaLibrary[id]);
                
                idParts.forEach(id => {
                    const asana = asanaLibrary[id];
                    builderPoses.push({
                        id: id,
                        duration: asana?.hold_data?.standard || 30
                    });
                });

                builderRender();
                input.value = "";
                results.style.display = "none";
            }
        }
    });

    // Handle selection
    results.addEventListener("click", e => {
       const item = e.target.closest(".b-search-item");
       if (!item) return;
       const library = getAsanaIndex();
       const asana = library.find(a => String(a.id) === String(item.dataset.id));
       
       const defaultDuration = (asana && asana.hold_data && asana.hold_data.standard) ? asana.hold_data.standard : 30;
       
       builderPoses.push({
          id: item.dataset.id,
          name: item.dataset.name,
          englishName: item.dataset.english,
          duration: defaultDuration,
          note: ""
       });
       
       builderRender();
       input.value = "";
       results.style.display = "none";
       input.focus();
    });
 
    // Close on outside click
    document.addEventListener("click", e => {
       if (!input.contains(e.target) && !results.contains(e.target)) {
          results.style.display = "none";
       }
    });
 
    // Blank row helper
const blankBtn = document.getElementById("builderAddBlank");
if (blankBtn) {
   blankBtn.addEventListener("click", () => {
      // 1. Add to the top of the array
      builderPoses.push({ 
          id: "", 
          name: "", 
          englishName: "", 
          duration: 30, 
          variation: "", 
          note: "" 
      });
      
      // 2. THIS IS THE MISSING PIECE: Force the UI to update
      builderRender(); 
      
      // 3. Optional: Auto-focus the ID input of the new top row
      setTimeout(() => {
          const firstIdInput = document.querySelector('.b-id');
          if (firstIdInput) firstIdInput.focus();
      }, 50);
   });
}
 })();


safeListen("editCourseBtn", "click", openEditCourse);
safeListen("editCourseCloseBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open"); // UNLOCK SCROLL
});

safeListen("editCourseCancelBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open"); // UNLOCK SCROLL
});
safeListen("editCourseSaveBtn", "click", () => {
   if (!asanaLibrary || Object.keys(asanaLibrary).length === 0) {
      alert("Library is still loading. Please wait.");
      return;
   }
   builderSave();
});


export {
    builderRender,
    movePose,
    removePose,
    processSemicolonCommand,
    openLinkSequenceModal,
    addHit,
    openEditCourse,
    builderOpen,
    builderUpdateStats,
    builderCompileSequenceText,
    builderGetTitle,
    builderGetCategory,
    builderSave
};
