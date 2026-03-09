import { $, showError, safeListen, normaliseText, setStatus } from '../utils/dom.js';
import { prefersIAST, setIASTPref } from '../utils/format.js';
import { supabase } from '../services/supabaseClient.js';
import { playbackEngine } from '../playback/timer.js';
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from './historyModal.js';
import { builderRender, movePose, removePose, processSemicolonCommand, openLinkSequenceModal } from './builder.js';

// Setup some window aliases since we're breaking up a monolithic file
const getActivePlaybackList = () => window.activePlaybackList;
const getCurrentSequence = () => window.currentSequence;
// #region 9. WIRING UP UI ELEMENTS
/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */


// 1. Sequence Dropdown Selection
const seqSelect = $("sequenceSelect");
if (seqSelect) {
    // A. Clean up old bottom sections (Hide them)
    const oldEditSection = $("exportCourseBtn")?.closest("div"); // Heuristic to find the container
    if (oldEditSection) oldEditSection.style.display = "none";
    
    const advancedSection = document.querySelector("details"); // Assuming Advanced is in a <details> tag
    if (advancedSection && advancedSection.textContent.includes("Advanced")) {
        advancedSection.style.display = "none";
    }

    // B. Create the "Edit" and "New" buttons
    if (!document.getElementById("quickEditBtn")) {
        const editBtn = document.createElement("button");
        editBtn.id = "quickEditBtn";
        editBtn.innerHTML = "✏️";
        editBtn.title = "Edit this sequence in the Sequence Builder";
        editBtn.className = "tiny";
        editBtn.style.cssText = "margin-left: 8px; padding: 4px 10px; font-size: 1.1rem; vertical-align: middle;";
        seqSelect.parentNode.insertBefore(editBtn, seqSelect.nextSibling);
        editBtn.onclick = () => {
            if (!getCurrentSequence()) return alert("Select a sequence first.");
            openEditCourse();
        };

        const newBtn = document.createElement("button");
        newBtn.id = "newSequenceBtn";
        newBtn.textContent = "+ New";
        newBtn.title = "Create a new sequence from scratch";
        newBtn.className = "tiny";
        newBtn.style.cssText = "margin-left: 4px; padding: 4px 10px; vertical-align: middle;";
        editBtn.parentNode.insertBefore(newBtn, editBtn.nextSibling);
        newBtn.onclick = () => builderOpen("new", null);
    }

    // C. Dropdown Logic (Fixed: Stops timer, Waits for user to click Start)
seqSelect.addEventListener("change", () => {
    const idx = seqSelect.value;
    if (typeof stopTimer === "function") stopTimer(); 
    
    const setStatus = (text) => {
        const el = document.getElementById("statusText") || document.getElementById("status");
        if (el) el.textContent = text;
    };

    if (!idx) {
        window.currentSequence = null;
        setStatus("Select a sequence");
        if($("collageWrap")) $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`;
        return;
    }

    // --- 1. SET CURRENT SEQUENCE ---
    // (Checks both 'courses' and 'sequences' arrays to be safe)
    const rawSequence = (typeof courses !== "undefined" ? courses : sequences)[parseInt(idx, 10)];
    window.currentSequence = rawSequence; 

    // --- 2. GENERATE EXPANDED LIST (MACROS) ---
    if (typeof getExpandedPoses === "function") {
        window.activePlaybackList = getExpandedPoses(getCurrentSequence());
    } else {
        window.activePlaybackList = getCurrentSequence().poses ? [...getCurrentSequence().poses] : [];
    } 

    // --- 3. APPLY SLIDER & UI ---
    if (typeof applyDurationDial === 'function') applyDurationDial();
    if (typeof updateDialUI === 'function') updateDialUI();

    if (typeof updateTotalAndLastUI === 'function') updateTotalAndLastUI();

    try {
        window.currentIndex = 0; // Ensure we start at the beginning
        setPose(0);
        setStatus("Ready to Start"); 
        const btn = document.getElementById("startStopBtn");
        if (btn) btn.textContent = "Start";
    } catch (e) {
        console.error("Error setting initial pose:", e);
    }
});
}

// IAST Toggle Button
(function setupIASTToggle() {
   const btn = $("iastToggleBtn");
   if (!btn) return;
   function updateBtn() {
      const using = prefersIAST();
      btn.textContent = using ? "IAST" : "English";
      btn.style.opacity = using ? "1" : "0.7";
      btn.title = using ? "Showing IAST names — click for English" : "Showing English names — click for IAST";
   }
   updateBtn();
   btn.addEventListener("click", () => {
      setIASTPref(!prefersIAST());
      updateBtn();
      if (getCurrentSequence()) setPose(window.currentIndex);
   });
})();
function updateLastCompletedPill(){

    const pill = document.getElementById("lastCompletedPill");
    if(!pill) return;
  
    const seq = window.currentSequence && window.currentSequence.title ? window.currentSequence.title : null;
    const last = getLastCompletionForSequence(seq);
  
    if(last){
      pill.textContent =
        "Last: " + new Date(last).toLocaleString();
    }else{
      pill.textContent = "History";
    }
  }

// 2. History Interactions (Clickable Pill)
const lastPill = $("lastCompletedPill");
if (lastPill) {
    lastPill.style.cursor = "pointer";
    lastPill.title = "Click to view full completion history";
    lastPill.style.textDecoration = "underline dotted";

    lastPill.addEventListener("click", () => {
        if (!getCurrentSequence()) return alert("Please select a sequence first.");
        openHistoryModal("current");
    });
}

// 2. Playback Controls
safeListen("nextBtn", "click", () => {
    stopTimer();
    nextPose();
});

safeListen("prevBtn", "click", () => {
    stopTimer();
    prevPose();
});

safeListen("startStopBtn", "click", () => {
    if (!getCurrentSequence()) return;
    if (!playbackEngine.running) startTimer();
    else stopTimer();
});

safeListen("resetBtn", "click", () => {
   // 1. Stop the clock
   stopTimer();

   // 2. WIPE MEMORY (Fixes the "Resume" popup on refresh)
   localStorage.removeItem("lastPlayedSequence");
   localStorage.removeItem("currentPoseIndex");
   localStorage.removeItem("timeLeft");
   
   // Optional: Clear internal progress tracking if you use it
   if (typeof clearProgress === "function") clearProgress();

   // 3. RESET DROPDOWN (Fixes the ID: sequenceSelect)
   const dropdown = $("sequenceSelect");
   if (dropdown) dropdown.value = ""; 

   // 4. NULLIFY DATA
   window.currentSequence = null;
   window.currentIndex = 0;

   // 5. RESET UI VISUALS (Matched to your specific HTML IDs)
   const titleEl = $("poseName");
   const metaEl = $("poseMeta"); // Used for english/sanskrit subtext
   const collageEl = $("collageWrap"); // Where images go
   const timerEl = $("poseTimer");
   const statusEl = $("statusText");
   const instructionsEl = $("poseInstructions");

   // Reset Title
   if (titleEl) titleEl.innerText = "Select a sequence";
   
   // Reset Meta/Subtitle
   if (metaEl) metaEl.innerText = "";

   // Reset Image Area (Restore the "Select a sequence" message)
   if (collageEl) {
       collageEl.innerHTML = '<div class="msg" id="loadingText">Select a sequence</div>';
   }

   // Reset Timer
   if (timerEl) timerEl.innerText = "–"; // Matching your default HTML

   // Reset Status
   if (statusEl) statusEl.textContent = "Session Reset";
   
   // Reset Instructions
   if (instructionsEl) instructionsEl.textContent = "";
});
// --- DYNAMIC DURATION DIAL LOGIC ---
function getDialPosition() {
    const dial = $("durationDial");
    return dial ? parseInt(dial.value, 10) : 50;
}

function resolveDialAnchors(origDur, asana) {
    const hd = asana && asana.hold_data;
    const defaultDur = origDur;
    const rawShort = (hd && typeof hd.short === 'number') ? hd.short : defaultDur;
    const rawLong  = (hd && typeof hd.long  === 'number') ? hd.long  : defaultDur;
    return {
        short:    Math.min(rawShort, defaultDur),
        defaultDur,
        long:     Math.max(rawLong,  defaultDur)
    };
}

function interpolateDuration(pos, short, defaultDur, long) {
    if (pos === 50) return defaultDur;
    if (pos < 50) {
        const t = pos / 50;
        return Math.round(short + (defaultDur - short) * t);
    }
    const t = (pos - 50) / 50;
    return Math.round(defaultDur + (long - defaultDur) * t);
}

// Change 'function dialReset()' to 'window.dialReset = function()'
window.dialReset = function() {
    const dial = document.getElementById("durationDial");
    if (!dial) return;
    
    dial.value = 50;
    
    // Trigger the logic to update the app
    if (typeof updateDialUI === "function") updateDialUI();
    if (typeof applyDurationDial === "function") applyDurationDial();
    
    // Optional: If you want it to refresh the current pose timer immediately
    if (typeof getCurrentSequence() !== "undefined" && getCurrentSequence()) {
        if (typeof setPose === "function") setPose(window.currentIndex);
    }
    
    console.log("Dial reset via touch");
};

function updateDialUI() {
    const dial = $("durationDial");
    const wrap = $("durationDialWrap");
    const label = $("durationDialLabel");
    const estEl = $("durationDialEst");
    if (!dial || !label) return;

    const pos = getDialPosition();

    if (pos === 50) {
        label.textContent = "Default";
    } else if (pos < 50) {
        label.textContent = pos === 0 ? "Shortest" : "Shorter";
    } else {
        label.textContent = pos === 100 ? "Longest" : "Longer";
    }

    if (wrap) {
        wrap.classList.remove("dial-faster", "dial-slower");
        if (pos > 50) wrap.classList.add("dial-faster");
        else if (pos < 50) wrap.classList.add("dial-slower");
    }

    if (estEl && getCurrentSequence() && window.currentSequenceOriginalPoses) {
        const total = window.currentSequenceOriginalPoses.reduce((s, p) => {
            const origDur = Number(p[1]) || 0;
            const id = Array.isArray(p[0]) ? p[0][0] : p[0];
            const asana = findAsanaByIdOrPlate ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
            const { short, defaultDur, long } = resolveDialAnchors(origDur, asana);
            const dur = interpolateDuration(pos, short, defaultDur, long);
            return s + (asana && asana.requiresSides ? dur * 2 : dur);
        }, 0);
        estEl.textContent = formatHMS(total);
    } else if (estEl) {
        estEl.textContent = "";
    }
}

const durationDial = document.getElementById("durationDial");
if (durationDial) {
    // 1. Sliding: Updates math and UI dynamically
    durationDial.addEventListener("input", () => {
        // --- START MAGNETIC SNAP LOGIC ---
        let val = parseInt(durationDial.value, 10);
        // If the finger is between 45 and 55, force it to 50
        if (val > 45 && val < 55) {
            durationDial.value = 50;
        }
        // --- END MAGNETIC SNAP LOGIC ---

        if (typeof updateDialUI === "function") updateDialUI();
        if (getCurrentSequence()) applyDurationDial();
    });
    
    // 2. Releasing: Just forces one final sync
    durationDial.addEventListener("change", () => {
        if (getCurrentSequence()) applyDurationDial();
    });
    
    // 3. Double Click: Reset (Keep for desktop users)
    durationDial.addEventListener("dblclick", () => {
        durationDial.value = 50;
        if (typeof updateDialUI === "function") updateDialUI();
        if (getCurrentSequence()) applyDurationDial();
    });
}
function applyDurationDial() {
    if (!getCurrentSequence()) return;
    const dial = document.getElementById("durationDial");
    if (!dial) return;
    
    const val = Number(dial.value); // 0 to 100

    // 1. Expand a fresh list from the raw sequence
    const baseList = typeof getExpandedPoses === "function" ? getExpandedPoses(getCurrentSequence()) : getCurrentSequence().poses;

    // 2. Apply the dynamic database scale
    window.activePlaybackList = baseList.map(p => {
        let cloned = [...p];
        const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
        
        // Ensure we are looking in window.asanaLibrary for the normalized object
        const lib = window.asanaLibrary || {};
        const key = String(rawId).trim().replace(/^0+/, '').padStart(3, '0');
        const asana = lib[key];

        // NEW: Check for the hold_json column we just created
        if (asana && asana.hold_json && typeof asana.hold_json.standard === 'number') {
            const hj = asana.hold_json;
            
            // Logic: Short (0) | Standard (50) | Long (100)
            const min = hj.short || Math.max(5, Math.round(hj.standard * 0.5));
            const std = hj.standard;
            const max = hj.long  || Math.round(hj.standard * 2.0);
        
            if (val < 50) {
                // Interpolate Short -> Standard
                cloned[1] = Math.round(min + (std - min) * (val / 50));
            } else if (val > 50) {
                // Interpolate Standard -> Long
                cloned[1] = Math.round(std + (max - std) * ((val - 50) / 50));
            } else {
                cloned[1] = std;
            }
        } else {
            // Failsafe: Global % scaling if JSON is missing
            const originalSeconds = Number(cloned[1]) || 30;
            let mult = (val < 50) ? (0.5 + (val / 50) * 0.5) : (1.0 + ((val - 50) / 50) * 1.0);
            cloned[1] = Math.round(originalSeconds * mult);
        }
        return cloned;
    });

    // 3. UI Updates (Labels)
    const label = document.getElementById("durationDialLabel");
    if(label) {
        if (val === 50) label.textContent = "Standard Holds";
        else if (val < 50) label.textContent = "Shorter Holds (-)";
        else label.textContent = "Longer Holds (+)";
    }

    // 4. Update the Active Timer (Mid-pose scaling)
    if (window.activePlaybackList[window.currentIndex]) {
        const newPoseSeconds = Number(window.activePlaybackList[window.currentIndex][1]) || 0;
        if (playbackEngine.currentPoseSeconds > 0) {
            const ratio = playbackEngine.remaining / playbackEngine.currentPoseSeconds;
            playbackEngine.remaining = Math.round(newPoseSeconds * ratio);
        } else {
            playbackEngine.remaining = newPoseSeconds;
        }
        playbackEngine.currentPoseSeconds = newPoseSeconds; 
    }

    if (typeof updateTimerUI === "function") updateTimerUI(playbackEngine.remaining, playbackEngine.currentPoseSeconds);
    
    // IMPORTANT: Recalculate the "87 poses • 32m 50s" text
    if (typeof builderRender === "function") builderRender();
}



// 3. UI Toggles
safeListen("historyLink", "click", (e) => {
    e.preventDefault();
    toggleHistoryPanel();
});

// Complete Button Logic
safeListen("completeBtn", "click", async () => {
    if (!getCurrentSequence()) return;

    const btn = $("completeBtn");
    const originalText = btn.textContent;

    // UI Feedback
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const title = getCurrentSequence().title || "Unknown Sequence";
        const category = getCurrentSequence().category || null;
        const now = new Date();

        // Call the helper from Region 5 with category support
        const success = await appendServerHistory(title, now, category);

        if (success) {
// console.log("✅ Server sync success");
        } else {
// console.warn("⚠️ Saved locally only (Server sync failed)");
        }
        
        // Optional: Play a success sound or visual cue
        alert("Sequence Completed and Logged!");

    } catch (e) {
        console.error("Completion error:", e);
        alert("Error saving progress. See console.");
    } finally {
        // Reset button state
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// -------- COURSE EDITING & EXPORT --------
let editingCourseData = null;
let editingCourseIndex = null;

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
   if (!getCurrentSequence()) { alert("Please select a course first."); return; }
   builderOpen("edit", getCurrentSequence());
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
       const rawPoses = (window.currentSequenceOriginalPoses && seq === getCurrentSequence())
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


// 4. APP STARTUP (Auth-Gated)
// console.log("Script parsed. Attempting startup...");

function showApp() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("mainAppContainer").style.display = "";
    if (!window.appInitialized && window.init) {
        window.init();
    }
}

function showLogin() {
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("mainAppContainer").style.display = "none";
}

function setupAuthListeners() {
    const googleBtn = document.getElementById("googleSignInBtn");
    const skipBtn = document.getElementById("skipLoginBtn");
    const signOutBtn = document.getElementById("signOutBtn");
    const loginError = document.getElementById("loginError");

    if (googleBtn) {
        googleBtn.onclick = async () => {
            googleBtn.disabled = true;
            googleBtn.textContent = "Redirecting…";
            loginError.style.display = "none";
            
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) {
                loginError.textContent = error.message;
                loginError.style.display = "block";
                googleBtn.disabled = false;
                googleBtn.textContent = "Sign in with Google";
            }
        };
    }

    if (skipBtn) {
        skipBtn.onclick = () => {
            window.isGuestMode = true;
            window.currentUserId = null;
            showApp();
        };
    }

    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (window.isGuestMode) {
                window.isGuestMode = false;
                showLogin();
            } else {
                await supabase.auth.signOut();
            }
        };
    }

    supabase.auth.onAuthStateChange((event, session) => {
        const emailDisplay = document.getElementById("userEmailDisplay");
        if (session && session.user) {
            window.isGuestMode = false;
            window.currentUserId = session.user.id;
            if (emailDisplay && session.user.email) {
                emailDisplay.textContent = session.user.email;
                emailDisplay.style.display = "inline";
            }
            showApp();
        } else if (!window.isGuestMode) {
            window.currentUserId = null;
            if (emailDisplay) emailDisplay.style.display = "none";
            showLogin();
        } else {
            // Guest mode
            if (emailDisplay) {
                emailDisplay.textContent = "Guest User";
                emailDisplay.style.display = "inline";
            }
        }
    });
}

// --- NEW AUTONOMOUS RESET LISTENER ---
// Put this at the very bottom of app.js
(function() {
    const attachResetListener = () => {
        const resetText = document.getElementById("dialResetBtn");
        if (!resetText) return;

        const performReset = (e) => {
            // Log for Chrome Console tracking
            console.log(`[MobileReset] ${e.type} detected`);
            
            const dial = document.getElementById("durationDial");
            if (!dial) return;

            // Stop scrolling/zooming
            if (e.cancelable) e.preventDefault(); 

            dial.value = 50;

            // Manually trigger 'input' so the existing slider logic hears the change
            dial.dispatchEvent(new Event('input', { bubbles: true }));
            dial.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Force a UI refresh if the helpers exist
            if (typeof updateDialUI === "function") updateDialUI();
            
            console.log("[MobileReset] Snapped to 50");
        };

        // Use passive: false to allow e.preventDefault() on mobile
        resetText.addEventListener("touchend", performReset, { passive: false });
        resetText.addEventListener("click", performReset);
    };

    // Run once on load, and again if the DOM changes (in case it's in a modal)
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attachResetListener);
    } else {
        attachResetListener();
    }
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthListeners);
} else {
    setupAuthListeners();
}


// Done
