// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & CONSTANTS
   ========================================================================== */

import {
    ASANA_LIBRARY_URL,
    LIBRARY_URL,
    ID_ALIASES_URL,
    AUDIO_BASE,
    COMPLETION_LOG_URL,
    LOCAL_SEQ_KEY,
} from "./src/config/appConfig.js";
import { fetchCourses, loadAsanaLibrary, normalizeAsana, normalizeAsanaRow, normalizePlate, parsePlates, normaliseAsanaId, findAsanaByIdOrPlate } from "./src/services/dataAdapter.js?v=29";
import { supabase } from "./src/services/supabaseClient.js";
import { themeManager } from "./src/ui/themeToggle.js";
import { loadJSON } from "./src/services/http.js";
import { $, normaliseText, safeListen, setStatus, showError, enterBrowseDetailMode, exitBrowseDetailMode } from "./src/utils/dom.js";
import { parseHoldTimes, buildHoldString } from "./src/utils/parsing.js";
import { prefersIAST, setIASTPref, displayName, escapeHtml2, renderMarkdownMinimal, formatHMS, formatTechniqueText } from "./src/utils/format.js";
import { playbackEngine } from "./src/playback/timer.js";
import { parsePlateTokens, plateFromFilename, primaryAsanaFromFilename, filenameFromUrl, mobileVariantUrl, ensureArray, isBrowseMobile, smartUrlsForPoseId } from "./src/utils/helpers.js";

import "./src/ui/wiring.js?v=29"; // 👈 Core UI Wiring & Listeners
import { getExpandedPoses } from "./src/services/sequenceEngine.js";
import { getEffectiveTime, getPosePillTime, calculateTotalSequenceTime } from "./src/utils/sequenceUtils.js";
import { builderOpen, openEditCourse } from "./src/ui/builder.js?v=29";
import { updateTotalAndLastUI } from "./src/ui/statsUI.js";

// UI Renderers
import { 
    updatePoseNote, 
    updatePoseAsanaDescription, 
    updatePoseDescription, 
    loadUserPersonalNote, 
    descriptionForPose 
} from "./src/ui/renderers.js?v=29";

// Extracted UI modules (side-effects: registers functions on window)
import "./src/ui/browse.js?v=29";
import "./src/ui/asanaEditor.js?v=29";
import "./src/ui/durationDial.js";
import "./src/ui/courseUI.js";
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from "./src/ui/historyModal.js?v=29";

// Expose history modal on window for legacy callers
window.openHistoryModal = openHistoryModal;
window.switchHistoryTab = switchHistoryTab;
window.renderGlobalHistory = renderGlobalHistory;


// Make them global so old UI buttons and other files can call them if needed
window.updatePoseNote = updatePoseNote;
window.updatePoseAsanaDescription = updatePoseAsanaDescription;
window.updatePoseDescription = updatePoseDescription;
window.loadUserPersonalNote = loadUserPersonalNote;
window.descriptionForPose = descriptionForPose;

window.db = supabase;
window.currentUserId = null;

/* ==========================================================================
   GLOBAL STATE VARIABLES
   ========================================================================== */

import { 
    globalState, setCourses, setSequences, setAsanaLibrary, setPlateGroups, setServerAudioFiles, 
    setIdAliases, setActivePlaybackList, setCurrentSequence, setCurrentIndex, 
    setCurrentSide, setNeedsSecondSide, getCurrentSequence, getActivePlaybackList, getCurrentSide
} from "./src/store/state.js?v=29";

// Expose robust proxies on window so ANY lingering bare reads in app.js seamlessly hit globalState without ReferenceErrors
['courses', 'sequences', 'asanaLibrary', 'activePlaybackList', 'currentSequence', 'currentIndex', 'currentSide', 'needsSecondSide'].forEach(prop => {
    Object.defineProperty(window, prop, {
        get: () => globalState[prop],
        set: (v) => { globalState[prop] = v; },
        configurable: true
    });
});

let wakeLock = null;
let wakeLockVisibilityHooked = false;
let draft = [];



// #endregion
// #region 2. SYSTEM & AUDIO
/* ==========================================================================
   DOM & SYSTEM UTILITIES
   ========================================================================== */
// -------- Wake Lock (Prevent screen sleep) --------
async function enableWakeLock(){
   try {
      if (!("wakeLock" in navigator)) return;
      if (wakeLock) return;

      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
         wakeLock = null;
      });

      // Hook once: if user switches away and returns, re-request lock.
      if (!wakeLockVisibilityHooked) {
         wakeLockVisibilityHooked = true;
         document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && playbackEngine.running) enableWakeLock();
         });
      }
   } catch (e) {
      wakeLock = null;
   }
}

async function disableWakeLock() {
   try {
      if (wakeLock) await wakeLock.release();
   } catch (e) {}
   wakeLock = null;
}

/* ==========================================================================
   AUDIO ENGINE
   ========================================================================== */

import { getCurrentAudio, setCurrentAudio, playFaintGong, detectSide, playSideCue, playAsanaAudio, playPoseMainAudio } from "./src/playback/audioEngine.js?v=29";

// #endregion
// #region 3. HELPERS & FORMATTING
/* ==========================================================================
   STRING & DATA FORMATTERS
   ========================================================================== */
/**
 * Converts the Asana Library object into an array for the Browse section.
 * REQUIRED for applyBrowseFilters and renderBrowseList.
 */
function getAsanaIndex() {
    // Safety check if library isn't loaded yet
    if (!asanaLibrary) return [];
    
    return Object.keys(asanaLibrary).map(id => {
        // Use the normalizeAsana helper we added earlier
        return normalizeAsana(id, asanaLibrary[id]);
    }).filter(Boolean); // Remove any nulls
}

   /**
 * CRITICAL HELPER: Normalizes raw JSON data into a standard format the app expects.
 * Missing this function causes "Uncaught ReferenceError: normalizeAsana is not defined"
 */

// IAST display preference — stored in localStorage
const IAST_PREF_KEY = "yoga_prefer_iast";

/**
 * UI Helper: Bridges the old function name to the new smart logic.
 * Required for 'renderPlateSection' to work.
 */
function urlsForPlateToken(p) {
    return smartUrlsForPoseId(p);
}

/* ==========================================================================
   ID & PLATE NORMALIZATION
   ========================================================================== */

function resolveId(id) {
    const norm = normalizePlate(id);
    if (typeof idAliases !== 'undefined' && idAliases[norm]) {
        return normalizePlate(idAliases[norm]); 
    }
    return norm; 
}

// #endregion
// #region 4. DATA LOADING
/* ==========================================================================
   DATA LOADING & PARSING (FIXED)
   ========================================================================== */

window.loadCourses = async function() {
    const deduplicated = await fetchCourses(window.currentUserId);
    window.courses = deduplicated;
    setCourses(deduplicated);
    setSequences(deduplicated);
    if (typeof window.renderSequenceDropdown === "function") window.renderSequenceDropdown();
};



// 4. Load Asana Library


/**
 * Standardizes a database row into a clean Asana object.
 * Prioritizes hold_json, fallbacks to parsing the 'hold' string.
 */


// Helper function to parse plates string like "Final: 1, 2" or "Intermediate: 3"





// Helper: Find URLs for a Pose
// Removed: smartUrlsForPoseId moved to src/utils/helpers.js



 // #endregion
// #region 5. HISTORY & LOGGING
/* ==========================================================================
   LOCAL LOGGING & PERSISTENCE
   ========================================================================== */


// getEffectiveTime → src/utils/sequenceUtils.js

import { 
    safeGetLocalStorage, safeSetLocalStorage, loadCompletionLog, saveCompletionLog, 
    addCompletion, lastCompletionFor, seedManualCompletionsOnce, fetchServerHistory, 
    appendServerHistory, deleteCompletionById, deleteAllCompletionsForTitle, 
    calculateStreak, toggleHistoryPanel 
} from "./src/services/historyService.js?v=29";

window.clearProgress = clearProgress;

/* ==========================================================================
   RESUME STATE & PROGRESS
   ========================================================================== */

const RESUME_STATE_KEY = "yoga_resume_state_v2";

function saveCurrentProgress() {
    if (!currentSequence) return;
    const state = {
        sequenceIdx: $("sequenceSelect")?.value || "",
        poseIdx: currentIndex,
        sequenceTitle: currentSequence.title,
        focusDuration: playbackEngine.totalFocusSeconds || 0,
        timestamp: Date.now()
    };
    safeSetLocalStorage(RESUME_STATE_KEY, state);
}

function clearProgress() {
    try {
        localStorage.removeItem(RESUME_STATE_KEY);
    } catch (e) {
        console.error("Failed to clear progress", e);
    }
}

// Export for Wiring
window.saveCurrentProgress = saveCurrentProgress;

function showResumePrompt(state) {
    const banner = document.createElement("div");
    banner.style.cssText = `
        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
        background: #333; color: #fff; padding: 12px 20px; border-radius: 30px;
        z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        display: flex; gap: 15px; align-items: center; font-size: 14px;
    `;
    
    // Safety check if sequence still exists
    const seq = sequences && sequences[state.sequenceIdx];
    const seqName = seq ? seq.title : "your previous session";
    
    let poseName = `pose ${state.poseIdx + 1}`;
    if (seq && seq.poses) {
        const poses = typeof getExpandedPoses === "function" ? getExpandedPoses(seq) : seq.poses;
        if (poses[state.poseIdx]) {
            const rawId = Array.isArray(poses[state.poseIdx][0]) ? poses[state.poseIdx][0][0] : poses[state.poseIdx][0];
            const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(rawId)) : null;
            if (asana) {
                poseName = typeof displayName === "function" ? displayName(asana) : (asana.name || poseName);
            }
        }
    }
    
    banner.innerHTML = `
        <span>Resume <b>${seqName}</b> at <b>${poseName}</b>?</span>
        <button id="resumeYes" style="background:#4CAF50; color:white; border:none; padding:5px 12px; border-radius:15px; cursor:pointer;">Yes</button>
        <button id="resumeNo" style="background:transparent; color:#ccc; border:none; cursor:pointer;">✕</button>
    `;
    
    document.body.appendChild(banner);

    banner.querySelector("#resumeYes").onclick = () => {
        const sel = $("sequenceSelect");
        if (sel) {
            sel.value = state.sequenceIdx;
            sel.dispatchEvent(new Event('change'));
            
            // Increased delay to 500ms to allow DOM to render
            setTimeout(() => {
                // Double check that we actually switched sequences before setting pose
                if (currentSequence) {
                    if (state.focusDuration) playbackEngine.totalFocusSeconds = state.focusDuration;
                    setPose(state.poseIdx);
                }
                banner.remove();
            }, 500); 
        }
    };

    banner.querySelector("#resumeNo").onclick = () => {
        clearProgress();
        banner.remove();
    };
}
// #endregion
// #region 6. CORE PLAYER LOGIC
/* ==========================================================================
   APP INITIALIZATION (Controller)
   ========================================================================== */
   
async function init() {
    window.appInitialized = true; // Prevents the fallback from running twice
    try {
        const statusEl = $("statusText");

        // 1. Core Config
        themeManager.init();
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();

        // 2. Load History;
        await Promise.all([
            typeof loadManifestAndPopulateLists === "function" ? loadManifestAndPopulateLists() : Promise.resolve(),
            typeof fetchIdAliases === "function" ? fetchIdAliases() : Promise.resolve(),
            fetchServerHistory()
        ]);;

        // 3. Load Main Data (Sequential)
        if (statusEl) statusEl.textContent = "Loading library...";;
        asanaLibrary = await loadAsanaLibrary();
        window.asanaLibrary = asanaLibrary;;

        if (statusEl) statusEl.textContent = "Loading courses...";
        await loadCourses();;




                
        if (typeof setupBrowseUI === "function") setupBrowseUI();

        // 5. Finalize
        if (statusEl) statusEl.textContent = "Ready";
        const loadText = $("loadingText");
        if (loadText) loadText.textContent = "Select a course";
        if (typeof updateDialUI === 'function') updateDialUI();

        // 6. Resume Check
        const state = safeGetLocalStorage(RESUME_STATE_KEY, null);
        if (state && state.timestamp) {
            const fourHours = 4 * 60 * 60 * 1000;
            if (Date.now() - state.timestamp < fourHours && state.poseIdx >= 0) {
                showResumePrompt(state);
            } else {
                clearProgress(); 
            }
        }
        
    } catch (e) {
        console.error("Init Error:", e);
        if ($("statusText")) $("statusText").textContent = "Error loading app data";
    }
}

// Export for Wiring
window.findAsanaByIdOrPlate = findAsanaByIdOrPlate;
window.getExpandedPoses     = getExpandedPoses;
window.init                 = init;                  // ← CRITICAL: called by wiring.js auth listener
window.getActivePlaybackList = getActivePlaybackList;
window.getCurrentSide       = getCurrentSide;
window.playbackEngine       = playbackEngine;         
window.setCurrentIndex      = setCurrentIndex;
window.setCurrentSide       = setCurrentSide;
window.setNeedsSecondSide   = setNeedsSecondSide;
window.setCurrentSequence   = setCurrentSequence;
window.setActivePlaybackList = setActivePlaybackList;
window.normalizePlate        = normalizePlate;
window.smartUrlsForPoseId    = smartUrlsForPoseId;
window.formatHMS             = formatHMS;
window.parseHoldTimes        = parseHoldTimes;
window.displayName           = displayName;
window.enableWakeLock        = enableWakeLock;
window.disableWakeLock       = disableWakeLock;
window.loadUserPersonalNote  = loadUserPersonalNote;
window.updatePoseAsanaDescription = updatePoseAsanaDescription;
window.updatePoseNote        = updatePoseNote;
window.descriptionForPose    = descriptionForPose;
window.updatePoseDescription = updatePoseDescription;
window.formatTechniqueText   = formatTechniqueText;
window.getEffectiveTime      = getEffectiveTime;
window.getPosePillTime       = getPosePillTime;
window.calculateTotalSequenceTime = calculateTotalSequenceTime;

// getExpandedPoses implementation → src/services/sequenceEngine.js

// ── Dynamically loaded after window.* bindings are set ──────────────────────
// Lesson #6: these modules use window.* only (no imports), so they must
// load after the bindings above are established. The dynamic import() is used
// (not static import) because static ES imports execute depth-first BEFORE
// the importing module's body runs, which would break the window.* bindings.
import("./src/playback/timerEvents.js");
import("./src/ui/posePlayer.js");
// ─────────────────────────────────────────────────────────────────────────────

// calculateTotalSequenceTime → src/utils/sequenceUtils.js
// updateTimerUI, triggerSequenceEnd → src/playback/timerEvents.js
// nextPose, prevPose, setPose → src/ui/posePlayer.js


// #region 7. UI & BROWSING
// NOTE: Browse UI, filters, asana detail view, collage renderers, and
// course/category dropdown rendering have been extracted to:
//   - src/ui/browse.js     (setupBrowseUI, openBrowse, closeBrowse, applyBrowseFilters, showAsanaDetail)
//   - src/ui/courseUI.js   (renderCollage, renderPlateSection, renderCategoryFilter, renderCourseUI, renderSequenceDropdown)
// These functions are exposed on window by those modules.

// (Browse + filter + course dropdown functions removed — now in src/ui/browse.js and src/ui/courseUI.js)

// #endregion
// #region 8. ADMIN & DATA LAYER



/* ==========================================================================
   DATA SAVING (CORE)
   ========================================================================== */

/**
 * Updates a specific field in the main Asana Library LOCALLY.
 */
async function saveAsanaField(asanaNo, field, value) {
    const id = normalizePlate(asanaNo);
    
    // 1. Update Local State
    if (asanaLibrary[id]) {
        asanaLibrary[id][field] = value;
    } else {
        console.error("Asana ID not found:", id);
        return;
    }

    // 2. Save to LocalStorage (Backup)
    localStorage.setItem("asana_library_backup_v1", JSON.stringify(asanaLibrary));

    // 3. Resolve immediately
    return Promise.resolve();
}



/* ==========================================================================
   DATA FETCHING (GET)
   ========================================================================== */

/* ==========================================================================
   SPECIALTY TOOLS (ID FIXER)
   ========================================================================== */

function renderIdFixer(container, brokenId) {

    const normBroken = normalizePlate(brokenId);
    const currentAlias = (typeof idAliases !== 'undefined') ? idAliases[normBroken] : null;

    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px dashed #ccc";
    wrap.style.fontSize = "0.85rem";

    let statusHTML = currentAlias 
        ? `<div style="margin-bottom:4px; color:green;">✅ <b>${normBroken}</b> ➝ <b>${currentAlias}</b></div>` 
        : `<div style="margin-bottom:4px; color:#e65100;">🔧 <b>ID ${normBroken}</b> is unlinked</div>`;

    wrap.innerHTML = `
        <div class="adv-section-title" style="margin-top:0; color:#333;">Link / Map Pose</div>
        ${statusHTML}
        <div style="display:flex; gap:5px; margin-top:5px;">
            <input type="text" id="fixerSearch" placeholder="Search pose..." class="tiny" style="flex:1; min-width:80px;">
        </div>
        <select id="fixerSelect" class="tiny" style="width:100%; margin-top:5px; margin-bottom:5px;">
            <option value="">(Type to search...)</option>
        </select>
        <button id="fixerSaveBtn" class="tiny" style="width:100%; background:${currentAlias ? '#2e7d32' : '#e65100'}; color:white;">
            ${currentAlias ? 'Update Link' : 'Link Pose'}
        </button>
    `;

    const searchInput = wrap.querySelector("#fixerSearch");
    const select = wrap.querySelector("#fixerSelect");

    searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        if (q.length < 2) return;
        const asanaIndex = getAsanaIndex();
        const matches = asanaIndex.filter(a =>
            (a.english.toLowerCase().includes(q) || a.asanaNo.includes(q))
        ).slice(0, 10);

        select.innerHTML = "";
        matches.forEach(m => {
            const mainOpt = document.createElement("option");
            mainOpt.value = normalizePlate(m.asanaNo);
            mainOpt.textContent = `[${m.asanaNo}] ${m.english}`;
            select.appendChild(mainOpt);
        });
    };

    wrap.querySelector("#fixerSaveBtn").onclick = async () => {
        const newVal = select.value;
        if (!newVal) return alert("Select target.");
        if (confirm(`Map ID ${normBroken} -> ${newVal}?`)) {
            alert("This requires backend logic for id_aliases.json");
        }
    };
    container.appendChild(wrap);
}
// #endregion
// #region 9. WIRING UP UI ELEMENTS
/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */

// All duplicate wiring, listeners, and auth logic has been removed from this file 
// and delegated to ./src/ui/wiring.js which is imported at the top.

// (Sequence dropdown & IAST wiring already handled in src/ui/wiring.js)


// (nextBtn/prevBtn/startStopBtn wiring already in src/ui/wiring.js)

// (Duration Dial functions removed — now in src/ui/durationDial.js)



// (historyLink wiring already in src/ui/wiring.js)

// Complete Button Logic — requires minimum practice time
safeListen("completeBtn", "click", async () => {
    if (!currentSequence) return;

    // Gate: must have at least 30s of active practice time
    const practiced = window.playbackEngine?.activePracticeSeconds || 0;
    if (practiced < 30) {
        alert("Start the timer and practice for at least 30 seconds before marking complete.");
        return;
    }
    const btn = $("completeBtn");
    const originalText = btn.textContent;

    // UI Feedback
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const title = currentSequence.title || "Unknown Sequence";
        const category = currentSequence.category || null;
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

// Post-Practice Rating Wiring
const setupRatingButtons = () => {
    document.querySelectorAll(".rating-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const ratingOverlay = document.getElementById("ratingOverlay");
            const sessionId = ratingOverlay.dataset.sessionId;
            const rating = parseInt(btn.dataset.rating, 10);
            
            if (sessionId && typeof updateCompletionRating === "function") {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span style="font-size:1.5rem; margin-top:20px; font-weight:bold;">Saving...</span>`;
                
                await updateCompletionRating(sessionId, rating);
                
                btn.innerHTML = originalHtml;
            }
            
            ratingOverlay.style.display = "none";
            // Return to dashboard
            const resetBtn = document.getElementById("resetBtn");
            if (resetBtn) resetBtn.click();
        });
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupRatingButtons);
} else {
    setupRatingButtons();
}

// --------------------------------------------------------------------------
// End of Region 9. Sections moved to modular files in src/ui/
// --------------------------------------------------------------------------
// (Asana Editor removed — now in src/ui/asanaEditor.js)
// (Auth startup removed — now in src/ui/wiring.js)
// #endregion
