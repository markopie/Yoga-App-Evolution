// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & CONSTANTS
   ========================================================================== */

import {
    COURSES_URL,
    MANIFEST_URL,
    ASANA_LIBRARY_URL,
    LIBRARY_URL,
    ID_ALIASES_URL,
    AUDIO_BASE,
    COMPLETION_LOG_URL,
    LOCAL_SEQ_KEY,
} from "./src/config/appConfig.js";
import { fetchCourses, loadAsanaLibrary, normalizeAsana, normalizeAsanaRow, normalizePlate, parsePlates, normaliseAsanaId } from "./src/services/dataAdapter.js";
import { supabase } from "./src/services/supabaseClient.js";
import { loadJSON } from "./src/services/http.js";
import { $, normaliseText, safeListen, setStatus, showError, enterBrowseDetailMode, exitBrowseDetailMode } from "./src/utils/dom.js";
import { parseHoldTimes, buildHoldString } from "./src/utils/parsing.js";
import { prefersIAST, setIASTPref, displayName, escapeHtml2, renderMarkdownMinimal, formatHMS, formatTechniqueText } from "./src/utils/format.js";
import { playbackEngine } from "./src/playback/timer.js";
import { parsePlateTokens, plateFromFilename, primaryAsanaFromFilename, filenameFromUrl, mobileVariantUrl, ensureArray, isBrowseMobile, smartUrlsForPoseId } from "./src/utils/helpers.js";
import { findAsanaByIdOrPlate } from "./src/services/dataAdapter.js?v=7";
import "./src/ui/wiring.js"; // 👈 Core UI Wiring & Listeners

// UI Renderers
import { 
    updatePoseNote, 
    updatePoseAsanaDescription, 
    updatePoseDescription, 
    loadUserPersonalNote, 
    descriptionForPose 
} from "./src/ui/renderers.js?v=7";

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
    setCurrentSide, setNeedsSecondSide, getCurrentSequence
} from "./src/store/state.js?v=7";

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

import { getCurrentAudio, setCurrentAudio, playFaintGong, detectSide, playSideCue, playAsanaAudio, playPoseMainAudio } from "./src/playback/audioEngine.js?v=7";

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

    if (typeof renderSequenceDropdown === "function") renderSequenceDropdown(); 
};

// 3. Local Sequence Editing (Save/Reset)
function saveSequencesLocally() {
    if (!sequences || !sequences.length) return;
    if (typeof LOCAL_SEQ_KEY !== 'undefined') {
        localStorage.setItem(LOCAL_SEQ_KEY, JSON.stringify(sequences));
    }
    alert("Changes saved to browser storage!");
}
 
function resetToOriginalJSON() {
    if(!confirm("Erase custom edits?")) return;
    if (typeof LOCAL_SEQ_KEY !== 'undefined') localStorage.removeItem(LOCAL_SEQ_KEY);
    location.reload();
}

// 4. Load Asana Library


/**
 * Standardizes a database row into a clean Asana object.
 * Prioritizes hold_json, fallbacks to parsing the 'hold' string.
 */


// Helper function to parse plates string like "Final: 1, 2" or "Intermediate: 3"




window.nextPose = nextPose;
window.prevPose = prevPose;

// Helper: Find URLs for a Pose
// Removed: smartUrlsForPoseId moved to src/utils/helpers.js



// History Loader (Clean version)
async function setupHistory() {
    try {
        // FIX: Only fetch history here. Use the history URL.
        // We use a timestamp to prevent caching old data.
        const res = await fetch("history.json?t=" + Date.now()); 
        if (res.ok) {
            window.completionHistory = await res.json();
// console.log(`History Loaded: ${Object.keys(window.completionHistory).length} sequences`);
        } else {
            window.completionHistory = {};
        }
    } catch (e) {
// console.warn("History not found (starting fresh)");
        window.completionHistory = {};
    }
}
 // #endregion
// #region 5. HISTORY & LOGGING
/* ==========================================================================
   LOCAL LOGGING & PERSISTENCE
   ========================================================================== */


   function getEffectiveTime(id, dur) {
    // 1. Unwrap the ID if it's hiding in an array (fixes Player math)
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    if (Array.isArray(rawId)) rawId = rawId[0]; // Double unwrap just in case
    
    const lib = window.asanaLibrary || {};
    
    // 2. The ID Fix: Compare them mathematically (so "003" safely matches "3")
    const searchId = Number(rawId);
    const asana = Object.values(lib).find(a => Number(a.id || a.asanaNo) === searchId);
    
    const duration = Number(dur) || 0;

    // 3. Double the time if the pose requires sides
    if (asana && (asana.requiresSides || asana.requires_sides)) {
        return duration * 2;
    }
    
    return duration;
}



window.getEffectiveTime = getEffectiveTime; // Make it global

import { 
    safeGetLocalStorage, safeSetLocalStorage, loadCompletionLog, saveCompletionLog, 
    addCompletion, lastCompletionFor, seedManualCompletionsOnce, fetchServerHistory, 
    appendServerHistory, deleteCompletionById, deleteAllCompletionsForTitle, 
    calculateStreak, toggleHistoryPanel 
} from "./src/services/historyService.js?v=2";

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
   async function loadManifestAndPopulateLists() {
// console.log("Fetching manifest from:", MANIFEST_URL); // Debug 1
    const manifest = await loadJSON(MANIFEST_URL, null);

    if (!manifest) {
// console.warn("❌ Manifest failed to load (404 or Invalid JSON)");
        return;
    }

    // Debug 2: See exactly what keys exist. 
    // If you see "Images" (capital I) instead of "images", that's the bug.
// console.log("Raw Manifest Data:", manifest); 

    // Robust check for lowercase OR uppercase keys
    window.serverAudioFiles = manifest.audio || manifest.Audio || [];

// console.log(`Manifest loaded: ${window.serverAudioFiles.length} audio files`);
}
async function init() {
// console.log("init() has started executing!");
    window.appInitialized = true; // Prevents the fallback from running twice
    try {
        const statusEl = $("statusText");
        
        // 1. Core Config
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();

        // 2. Load History
        await Promise.all([
            typeof loadManifestAndPopulateLists === "function" ? loadManifestAndPopulateLists() : Promise.resolve(),
            typeof fetchIdAliases === "function" ? fetchIdAliases() : Promise.resolve(),
            fetchServerHistory()
        ]);

        // 3. Load Main Data (Sequential)
        if (statusEl) statusEl.textContent = "Loading library...";
        asanaLibrary = await loadAsanaLibrary();
        window.asanaLibrary = asanaLibrary;

        if (statusEl) statusEl.textContent = "Loading courses...";
        await loadCourses();



                
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
window.getExpandedPoses = getExpandedPoses;
window.init = init;

function getExpandedPoses(sequence) {
    let expanded = [];
    if (!sequence || !sequence.poses) return [];

    const allCourses = window.courses || [];

    // 1. Unpack Macros
    sequence.poses.forEach((p, originalIdx) => {
        const idStr = String(p[0]);
        const durOrReps = Number(p[1]) || 1; 

        if (idStr.startsWith("MACRO:")) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const sub = allCourses.find(c => c.title === targetTitle);
            
            if (sub && sub.poses) {
                for (let i = 0; i < durOrReps; i++) {
                    sub.poses.forEach(sp => {
                        let cloned = [...sp];
                        cloned[5] = originalIdx; 
                        expanded.push(cloned);
                    });
                }
            }
        } else {
            let cloned = [...p];
            cloned[5] = originalIdx; 
            expanded.push(cloned);
        }
    });

    return expanded;
}
/* ==========================================================================
   TIMER ENGINE (Updated for Centered Focus Mode & Macro Engine)
   ========================================================================== */

   // --- TIMER ENGINE REPLACEMENT ---
window.startTimer = () => playbackEngine.start();
window.stopTimer = () => playbackEngine.stop();

playbackEngine.onStart = () => {
    if (typeof enableWakeLock === "function") enableWakeLock();

    const overlay = document.getElementById("focusOverlay");
    if (overlay) overlay.style.display = "flex";
    
    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Running";

    const startBtn = document.getElementById("startStopBtn");
    if (startBtn) startBtn.textContent = "Pause";

    const pauseBtn = document.getElementById("focusPauseBtn");
    if (pauseBtn) {
        pauseBtn.onclick = () => playbackEngine.stop();
    }

    try {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList : (currentSequence?.poses || []);
            
        if (poses[currentIndex]) {
            const rawId = Array.isArray(poses[currentIndex][0]) ? poses[currentIndex][0][0] : poses[currentIndex][0];
            const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(rawId)) : null;
            
            if (asana) {
                if (playbackEngine.remaining === playbackEngine.currentPoseSeconds) {
                    if (typeof playAsanaAudio === "function") playAsanaAudio(asana, poses[currentIndex][4] || "", false, globalState.currentSide);
                } else {
                    new Audio("data:audio/mp3;base64,//MkxAAQ").play().catch(()=>{});
                }
            }
        }
    } catch(e) {
        console.warn("Audio unlock failed", e);
    }
};

playbackEngine.onStop = () => {
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";

    if (typeof updateTotalAndLastUI === "function") updateTotalAndLastUI(); 

    const btn = document.getElementById("startStopBtn");
    if(btn) btn.textContent = "Start"; 

    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Paused";

    if (typeof disableWakeLock === "function") disableWakeLock();
};

playbackEngine.onTick = (remaining, currentPoseSeconds) => {
    updateTimerUI(remaining, currentPoseSeconds);
};

playbackEngine.onPoseComplete = (wasLongHold) => {
    if (wasLongHold && typeof playFaintGong === "function") playFaintGong();
    
    if (wasLongHold) {
        playbackEngine.startTransition(15);
    } else {
        const advanced = nextPose(); 
        if (advanced) {
            playbackEngine.start();
        }
    }
};

playbackEngine.onTransitionStart = (secs) => {
    const overlay = document.getElementById("transitionOverlay");
    const countdownEl = document.getElementById("transitionCountdown");
    const nextPoseEl = document.getElementById("transitionNextPose");

    if (!overlay) { 
        nextPose(); 
        playbackEngine.start(); 
        return; 
    }

    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) ? window.activePlaybackList : (currentSequence?.poses || []);
    let previewName = "";
    const nextIdx = currentIndex + 1;
    
    if (nextIdx < poses.length) {
        const np = poses[nextIdx];
        const id = Array.isArray(np[0]) ? np[0][0] : np[0];
        const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
        previewName = asana ? (typeof displayName === "function" ? displayName(asana) : asana.name) : "";
    }
    if (nextPoseEl) nextPoseEl.textContent = previewName ? `Next: ${previewName}` : "";

    if (countdownEl) countdownEl.textContent = secs;
    
    overlay.style.display = "flex";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const skipBtn = document.getElementById("transitionSkipBtn");
    if (skipBtn) {
        const newSkip = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        newSkip.onclick = () => playbackEngine.skipTransition();
    }
};

playbackEngine.onTransitionTick = (secs) => {
    const countdownEl = document.getElementById("transitionCountdown");
    if (countdownEl) countdownEl.textContent = secs;
};

playbackEngine.onTransitionComplete = () => {
    const overlay = document.getElementById("transitionOverlay");
    if (overlay) overlay.style.display = "none";
    const advanced = nextPose();
    if (advanced) {
        playbackEngine.start();
    }
};

function updateTimerUI(remaining, currentPoseSeconds) {
    const timerEl = document.getElementById("poseTimer");
    const focusTimerEl = document.getElementById("focusTimer");
    
    if (timerEl) {
        if (!currentSequence) {
            timerEl.textContent = "–";
            if (focusTimerEl) focusTimerEl.textContent = "–";
        } else {
            const mm = Math.floor(remaining / 60);
            const ss = remaining % 60;
            const timeStr = `${mm}:${String(ss).padStart(2,"0")}`;
            timerEl.textContent = timeStr;
            if (focusTimerEl) focusTimerEl.textContent = timeStr;

            timerEl.className = "";
            if (remaining <= 5 && remaining > 0) timerEl.className = "critical";
            else if (remaining <= 10 && remaining > 0) timerEl.className = "warning";
        }
    }

    if (currentSequence) {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList 
            : (currentSequence.poses || []);
        
        const totalSeconds = poses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
        let secondsLeft = remaining; 

        if (typeof needsSecondSide !== "undefined" && needsSecondSide && poses[currentIndex]) {
             secondsLeft += (Number(poses[currentIndex][1]) || 0);
        }

        for (let i = currentIndex + 1; i < poses.length; i++) {
             secondsLeft += getEffectiveTime(poses[i][0], poses[i][1]);
        }

        const remDisp = document.getElementById("timeRemainingDisplay");
        const totDisp = document.getElementById("timeTotalDisplay");
        
        if (remDisp && typeof formatHMS === "function") remDisp.textContent = formatHMS(secondsLeft);
        if (totDisp && typeof formatHMS === "function") totDisp.textContent = formatHMS(totalSeconds);

        const bar = document.getElementById("timeProgressFill");
        if (bar && totalSeconds > 0) {
            const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
            bar.style.width = `${pct}%`;
            bar.style.backgroundColor = pct < 10 ? "#ffccbc" : "#c8e6c9"; 
        }
    }
}

// Export for Wiring
window.updateTimerUI = updateTimerUI;

function calculateTotalSequenceTime(seq) {
    if (!seq || !seq.poses) return 0;
    const expanded = typeof getExpandedPoses === "function" ? getExpandedPoses(seq) : seq.poses;
    return expanded.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
}

function nextPose() {
    // 1. Get the correct list (Always prefer the expanded playback list)
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (currentSequence.poses || []);

    if (!poses.length) return false;

    // 2. Scenario: Two-Sided Pose
    if (needsSecondSide) {
        setCurrentSide("left");
        setNeedsSecondSide(false); 
        setPose(currentIndex, true); // Stays on same index, just swaps side
        return true;
    }

    // 3. Scenario: Advance to next index in the 87-item list
    if (currentIndex < poses.length - 1) {
        setCurrentSide("right");
        setNeedsSecondSide(false);
        setPose(currentIndex + 1);
        return true;
    } else {
        // End of Sequence
        stopTimer();
        const compBtn = document.getElementById("completeBtn");
        if (compBtn) compBtn.style.display = "inline-block";
        return false;
    }
}

function prevPose() {
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (currentSequence.poses || []);

    if (getCurrentSide() === "left") {
        setCurrentSide("right");
        setNeedsSecondSide(true); 
        setPose(currentIndex, true);
        return;
    }

    if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        const prevPoseData = poses[newIndex];
        
        // Use our helper to check if the previous pose in the list has sides
        const id = Array.isArray(prevPoseData[0]) ? prevPoseData[0][0] : prevPoseData[0];
        const asana = findAsanaByIdOrPlate(normalizePlate(id));

        if (asana && asana.requiresSides) {
            setCurrentSide("left");
            setNeedsSecondSide(false);
            setPose(newIndex, true); 
        } else {
            setPose(newIndex);
        }
    }
}





/* ==========================================================================
   RENDERER (SetPose)
   ========================================================================== */
   function setPose(idx, keepSamePose = false) {
    if (!currentSequence) return;
    const poses = (activePlaybackList && activePlaybackList.length > 0) 
                  ? activePlaybackList 
                  : (currentSequence.poses || []);

    if (idx < 0 || idx >= poses.length) return;

    // 1. SAVE PROGRESS (update currentIndex first so the correct pose index is saved)
    setCurrentIndex(idx);
    if (typeof saveCurrentProgress === "function") saveCurrentProgress();

    // Reset side tracking when moving to a new pose
    if (!keepSamePose) {
        setCurrentSide("right");
        setNeedsSecondSide(false);
    }

// 2. DATA EXTRACTION
const currentPose = poses[idx];
const originalRowIndex = (currentPose && currentPose[5] !== undefined) 
                        ? currentPose[5] 
                        : idx;

// FIX: Use the original sequence length instead of the expanded 'poses.length'
const displayTotal = currentSequence.poses ? currentSequence.poses.length : poses.length;



// Update the Focus/Overlay Count
const focusCounter = document.getElementById("focusPoseCounter");
if (focusCounter) {
    focusCounter.textContent = `${originalRowIndex + 1} / ${displayTotal}`;

}
    const rawIdField = currentPose[0];
    let seconds      = currentPose[1];

    let lookupId = Array.isArray(rawIdField) ? rawIdField[0] : rawIdField;
    lookupId = normalizePlate(lookupId);

    // ALIAS RESOLUTION
    if (typeof idAliases !== 'undefined' && idAliases[lookupId]) {
        let aliasVal = idAliases[lookupId];
        if (aliasVal.includes("|")) aliasVal = aliasVal.split("|")[0];
        lookupId = normalizePlate(aliasVal);
    }

    // 3. SMART LOOKUP
    const asana = findAsanaByIdOrPlate(lookupId);

    // VARIATION DURATION OVERRIDE:
    const storedVarKey = currentPose[3];
    if (storedVarKey && asana && asana.variations && asana.variations[storedVarKey]) {
        const varData = asana.variations[storedVarKey];
        const varHoldStr = varData.hold || varData.Hold || "";
        
        if (varHoldStr) {
            const varHd = parseHoldTimes(varHoldStr);
            if (varHd.standard > 0) {
                const dial = document.getElementById("durationDial");
                const val = dial ? Number(dial.value) : 50;
                
                // MATCH: Use .short and .long here too
                const min = varHd.short || Math.max(5, Math.round(varHd.standard * 0.5));
                const std = varHd.standard;
                const max = varHd.long || Math.round(varHd.standard * 2.0);
            
                if (val < 50) seconds = Math.round(min + (std - min) * (val / 50));
                else if (val > 50) seconds = Math.round(std + (max - std) * ((val - 50) / 50));
                else seconds = std;
            }
        }
    }

    // Sides Check
    if (asana && (asana.requiresSides || asana.requires_sides) && !keepSamePose) {
        setNeedsSecondSide(true);
    }

    // --- NEW: THE DIAL ENFORCER ---
    // Make absolutely sure 'seconds' respects the current dial multiplier!
    const dial = document.getElementById("durationDial");
    if (dial) {
        const val = Number(dial.value);
        if (val !== 50) {
            let mult = 1.0;
            if (val < 50) mult = 0.5 + (val / 50) * 0.5; // Faster (0.5x to 1x)
            else mult = 1.0 + ((val - 50) / 50) * 1.0;   // Slower (1x to 2x)
            seconds = Math.round(seconds * mult);
        }
    }

    // Sides Check
    if (asana && (asana.requiresSides || asana.requires_sides) && !keepSamePose) {
        setNeedsSecondSide(true);
    }

    // --- NEW: VARIATION & NOTE EXTRACTION ---
    // Combine all extra array fields to cleanly parse brackets vs actual notes
    let rawExtras = [currentPose[2], currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    let variationTitle = "";
    let actualNote = "";
    let baseOverrideName = "";

    const bracketMatch = rawExtras.match(/\[(.*?)\]/);
    if (bracketMatch) {
        variationTitle = bracketMatch[1].trim(); // Extracts "Modified I (On ledge)"
        // Remove the bracketed string to leave just the real notes
        actualNote = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\-\|]+/, "").trim();
    } else {
        // Legacy fallback: If no brackets exist, currentPose[2] acts as a base name override
        baseOverrideName = currentPose[2] || "";
        actualNote = [currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    }

  // --- VARIATION TECHNIQUE & SHORTHAND ---
  let displayShorthand = "";
  let displayTechnique = asana ? (asana.technique || asana.Technique || "") : "";
  let matchedVariationKey = storedVarKey; // Default to legacy

  // Helper to strip accents for safe comparison (e.g. Ujjāyī -> ujjayi)
  const normalizeText = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  if (asana && asana.variations && variationTitle) {
      const normVarTitle = normalizeText(variationTitle);
      let foundVariation = false;

      // Pass 1: Exact matches (ignoring accents)
      for (const [vKey, vData] of Object.entries(asana.variations)) {
          const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
          const normTitle = normalizeText(resolvedTitle);
          const normShort = normalizeText(typeof vData === 'object' ? (vData.shorthand || vData.Shorthand || "") : "");
          const normKey = vKey.toLowerCase();

          if (normVarTitle === normTitle ||
              normVarTitle === normShort ||
              normVarTitle === `stage ${normKey}` ||
              normVarTitle === normKey) {

              const varTech = (typeof vData === 'object') ? (vData.Full_Technique || vData.technique) : vData;
              if (varTech) displayTechnique = varTech;
              if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
              
              // Display Title cleaning
              const idNum = parseInt(asana.id || asana.asanaNo || "0", 10);
              // Pranayama range is 214-222 in Light on Yoga
              const isPranayama = idNum >= 214 && idNum <= 230;

              if (resolvedTitle) {
                  if (isPranayama) {
                      variationTitle = resolvedTitle;
                  } else {
                      const bracketMatch = resolvedTitle.match(/\((.*?)\)/);
                      if (bracketMatch) {
                          let innerText = bracketMatch[1].trim();
                          variationTitle = innerText.charAt(0).toUpperCase() + innerText.slice(1);
                      } else {
                          variationTitle = resolvedTitle.replace(/^Modified\s+[IVX]+\s*-?\s*/i, '').trim();
                      }
                  }
              }

              matchedVariationKey = vKey;
              foundVariation = true;
              break;
          }
      }

      // Pass 2: Fuzzy Roman Numeral Match (e.g., if title is "Ujjayi VI", it catches the "VI")
      if (!foundVariation) {
          const sortedKeys = Object.keys(asana.variations).sort((a,b) => b.length - a.length);
          for (const vKey of sortedKeys) {
              const normKey = vKey.toLowerCase();
              const vData = asana.variations[vKey];
              const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
              const normTitle = normalizeText(resolvedTitle);
              
              // Test if the DB key or Title has the user's input as a standalone word at the end or in brackets
              const safeVarTitle = normVarTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const matchRegex = new RegExp(`\\b${safeVarTitle}\\b`, 'i');

              if (matchRegex.test(normKey) || matchRegex.test(normTitle)) {
                  const varTech = (typeof vData === 'object') ? (vData.Full_Technique || vData.technique) : vData;
                  if (varTech) displayTechnique = varTech;
                  if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
                  
                  // Display Title cleaning
                  const idNum = parseInt(asana.id || asana.asanaNo || "0", 10);
                  // Pranayama range is 214-222 in Light on Yoga
                  const isPranayama = idNum >= 214 && idNum <= 230;

                  if (resolvedTitle) {
                      if (isPranayama) {
                          variationTitle = resolvedTitle;
                      } else {
                          // Try to extract text inside parentheses first (e.g., "Modified I (On a chair)" -> "On a chair")
                          const bracketMatch = resolvedTitle.match(/\((.*?)\)/);
                          if (bracketMatch) {
                              // Ensure first letter is capitalized nicely
                              let innerText = bracketMatch[1].trim();
                              variationTitle = innerText.charAt(0).toUpperCase() + innerText.slice(1);
                          } else {
                              // Otherwise just strip "Modified X" 
                              variationTitle = resolvedTitle.replace(/^Modified\s+[IVX]+\s*-?\s*/i, '').trim();
                          }
                      }
                  }
                  
                  matchedVariationKey = vKey;
                  foundVariation = true;
                  break;
              }
          }
      }
  } 
  // Legacy fallback if the old index 3 was used
  else if (asana && currentPose[3] && asana.variations && asana.variations[currentPose[3]]) {
      const v = asana.variations[currentPose[3]];
      matchedVariationKey = currentPose[3];
      if (typeof v === "string") {
          displayTechnique = v;
      } else {
          displayShorthand = v.shorthand || v.Shorthand || "";
          displayTechnique = v.Full_Technique || v.technique || "";
          const legacyTitle = v.title || v.Title || "";
          if (legacyTitle) variationTitle = legacyTitle;
      }
  }

  // 4. HEADER UI
  const nameEl = document.getElementById("poseName");
  if (nameEl) {
      // Jobbsian Minimalist UI: Primary text is English Name only
      let finalTitle = baseOverrideName || (asana ? (asana.english_name || asana.english || asana.name) : "Pose");

      // Append Variation text elegantly (e.g., "On a wall")
      if (variationTitle) {
          finalTitle += ` <span style="font-weight:300; opacity:0.7; font-size:0.85em;">— ${variationTitle}</span>`;
      }

      // Append Sides elegantly
      if (asana && asana.requiresSides) {
          const sideMarker = currentSide === "right" ? "R" : "L";
          finalTitle += ` <span style="font-weight:300; opacity:0.5; font-size:0.8em; vertical-align: middle;">• ${sideMarker}</span>`;
      }
      
      nameEl.innerHTML = finalTitle; 
  }

  // 5. SHORTHAND UI
  const shEl = document.getElementById("poseShorthand");
  if (shEl) {
      shEl.textContent = displayShorthand;
      shEl.style.display = displayShorthand ? "block" : "none";
  }
    // 6. GLOSSARY UI
    if (typeof renderSmartGlossary === "function") {
        renderSmartGlossary(displayShorthand);
    }

    // 7. INSTRUCTIONS UI
    const textContainer = document.getElementById("poseInstructions");
    if (textContainer) {
        if (displayTechnique && typeof formatTechniqueText === 'function') {
            textContainer.style.display = "block";
            
            // Dynamically prepend the variation title in bold IF a variation is active
            let techniqueHTML = formatTechniqueText(displayTechnique);
            if (variationTitle) {
                techniqueHTML = `<div style="font-weight:600; color:#333; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #ddd;">${variationTitle} Instructions:</div>` + techniqueHTML;
            }

            textContainer.innerHTML = `
                <details>
                    <summary style="cursor:pointer; color:#2e7d32; font-weight:600; padding:5px 0;">View Full Technique Instructions</summary>
                    <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:8px; white-space: pre-wrap;">${techniqueHTML}</div>
                </details>`;
        } else {
            textContainer.style.display = "none";
        }
    }

    // 8. NOTES UI (Passes only the clean actualNote)
    if (typeof updatePoseNote === "function") updatePoseNote(actualNote);
    if (typeof updatePoseAsanaDescription === "function") updatePoseAsanaDescription(asana);
    if (typeof loadUserPersonalNote === "function") loadUserPersonalNote(lookupId);

    // 9. META UI & AUDIO BUTTON
    const metaContainer = document.getElementById("poseMeta");
    if (metaContainer) {
        metaContainer.innerHTML = ""; 

        const infoSpan = document.createElement("span");
        infoSpan.className = "meta-text-only"; 

        // --- THE FIX: Use the sequence duration for the display string ---
        // currentPose[1] contains the duration defined in your sequence/macro
        const currentSeconds = currentPose[1]; 

        // Get range from library for reference
        const hj = asana?.hold_json || asana?.hold_data;
        let rangeText = "";
        if (hj && hj.standard) {
            rangeText = ` (Range: ${hj.short}s - ${hj.long}s)`;
        }

        // Update the text content to use the dynamic currentSeconds
        infoSpan.textContent = `ID: ${lookupId} • ${currentSeconds}s${rangeText}`;
        metaContainer.appendChild(infoSpan);

        if (asana) {
            const btn = document.createElement("button");
            btn.className = "tiny"; 
            btn.innerHTML = "🔊";   
            btn.style.marginLeft = "10px";
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                playAsanaAudio(asana, null, true); 
            };
            metaContainer.appendChild(btn);
        }
    }

    // 10. TIMER & IMAGE LOGIC
    playbackEngine.setPoseTime(seconds); //(seconds, 10) || 0;
    playbackEngine.remaining = playbackEngine.currentPoseSeconds;
    updateTimerUI(playbackEngine.remaining, playbackEngine.currentPoseSeconds);

    const wrap = document.getElementById("collageWrap");
    if (wrap) {
        wrap.innerHTML = "";
        const urls = smartUrlsForPoseId(lookupId, matchedVariationKey);
        if (urls.length > 0) {
            wrap.appendChild(renderCollage(urls));
        } else {
            const div = document.createElement("div");
            div.className = "msg";
            div.textContent = `No image found for: ${lookupId}`;
            wrap.appendChild(div);
        }
    }

    // --- SYNC OVERLAY CONTENT ---
    const overlayName = document.getElementById("focusPoseName");
    const overlayImageWrap = document.getElementById("focusImageWrap");
    
    if (overlayName && nameEl) overlayName.innerHTML = nameEl.innerHTML; // Sync Name + Variation Span
    
    if (overlayImageWrap) {
        overlayImageWrap.innerHTML = ""; 
        const focusUrls = smartUrlsForPoseId(lookupId, matchedVariationKey);
        if (focusUrls.length > 0) {
            const img = document.createElement("img");
            img.src = focusUrls[0]; 
            overlayImageWrap.appendChild(img);
        }
    }

    // 11. AUDIO TRIGGER
    if (playbackEngine.running && asana) {
         playAsanaAudio(asana, baseOverrideName, false, globalState.currentSide); 
    }
}

// Export for Wiring
window.setPose = setPose;

/* ==========================================================================
   UI HELPERS (Notes & Stats)
   ========================================================================== */


function updateTotalAndLastUI() {
    // 1. EXPLORER FIX: Look at the activePlaybackList to include the injected standing poses
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
        ? window.activePlaybackList 
        : ((currentSequence && currentSequence.poses) ? currentSequence.poses : []);

    // 2. Calculate Total Time
    const total = poses.reduce((acc, p) => {
       const duration = Number(p?.[1]) || 0;
       const idField = p?.[0];
       const id = Array.isArray(idField) ? idField[0] : idField;
       
       const asana = (typeof findAsanaByIdOrPlate === 'function') 
          ? findAsanaByIdOrPlate(id) 
          : null;

       if (asana && asana.requiresSides) {
          return acc + (duration * 2);
       }
       return acc + duration;
    }, 0);

    // 3. Update Total Time UI
    const totalEl = document.getElementById("totalTimePill");
    if (totalEl) {
        totalEl.textContent = `Total: ${formatHMS(total)}`;
    }

    // 4. Update History UI
    const lastEl = document.getElementById("lastCompletedPill");
    
    if (lastEl) {
        const title = currentSequence && currentSequence.title ? currentSequence.title : null;
        
        if (title) {
           const source = (typeof serverHistoryCache !== 'undefined' && Array.isArray(serverHistoryCache) && serverHistoryCache.length) 
              ? serverHistoryCache 
              : (typeof loadCompletionLog === 'function' ? loadCompletionLog() : []);

           const last = source
              .filter(x => x && x.title === title && typeof x.ts === "number")
              .sort((a, b) => b.ts - a.ts)[0];

           lastEl.textContent = last ?
              `Last: ${new Date(last.ts).toLocaleString("en-AU", {
               year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
              })}` : "Last: –";
        } else {
           lastEl.textContent = "Last: –";
        }
    }
}

// #endregion
// #region 7. UI & BROWSING
/* ==========================================================================
   BROWSE SCREEN & FILTERS
   ========================================================================== */

   function setupBrowseUI() {
// console.log("setupBrowseUI() is running...");

    // 1. Wire up the main Browse button
    const bBtn = document.getElementById("browseBtn");
    if (bBtn) {
// console.log("✅ Browse button found! Attaching click listener.");
        bBtn.onclick = (e) => {
            e.preventDefault();
            window.openBrowse();
        };
    } else {
        console.error("❌ ERROR: browseBtn was NULL during setupBrowseUI!");
    }

    // 2. Wire up the close button
    if ($("browseCloseBtn")) {
        $("browseCloseBtn").addEventListener("click", closeBrowse);
    }

    // 3. Hide Finals Checkbox
    const finalsChk = $("browseFinalOnly");
    if (finalsChk) {
        if (finalsChk.parentElement && finalsChk.parentElement.tagName === "LABEL") {
            finalsChk.parentElement.style.display = "none";
        } else {
            finalsChk.style.display = "none";
        }
    }

    const closeBtn = $("browseCloseBtn");

    // Create "Add Asana" Button (always visible)
    if (closeBtn && !document.getElementById("browseAddAsanaBtn")) {
        const addBtn = document.createElement("button");
        addBtn.id = "browseAddAsanaBtn";
        addBtn.textContent = "Add Asana";
        addBtn.className = "tiny";
        addBtn.style.cssText = "background: #007aff; color: white; margin-right: 8px;";

        addBtn.onclick = () => {
            if (typeof window.openAsanaEditor === "function") {
                window.openAsanaEditor(null);
            }
        };

        if (closeBtn.parentNode) {
            closeBtn.parentNode.insertBefore(addBtn, closeBtn);
            closeBtn.parentNode.style.display = "flex";
            closeBtn.parentNode.style.alignItems = "center";
        }
    }

    // 6. Backdrop Click Logic
    const bd = $("browseBackdrop");
    if (bd) {
        let downOnBackdrop = false;
        bd.addEventListener("pointerdown", (e) => { downOnBackdrop = (e.target === bd); });
        bd.addEventListener("click", (e) => {
            if (e.target === bd && downOnBackdrop) closeBrowse();
            downOnBackdrop = false;
        });
    }

    // 7. ESC Key Support
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $("browseBackdrop")?.style.display === "flex") {
            closeBrowse();
        }
    });

    // 8. Filters
    const onChange = () => applyBrowseFilters();
    const debounce = (fn, ms = 120) => {
        let t = null;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };

    if ($("browseSearch")) $("browseSearch").addEventListener("input", debounce(onChange, 120));
    if ($("browsePlate")) $("browsePlate").addEventListener("input", debounce(onChange, 120));
    if ($("browseAsanaNo")) $("browseAsanaNo").addEventListener("input", debounce(onChange, 120));
    if ($("browseCategory")) $("browseCategory").addEventListener("change", onChange);
}


window.openBrowse = function() {
// console.log("✅ openBrowse() was successfully triggered!");
document.body.classList.add("modal-open");
    const bd = $("browseBackdrop");
// console.log("🔍 Looking for backdrop element:", bd);
    
    if (!bd) {
        console.error("❌ ERROR: browseBackdrop not found in the HTML!");
        return;
    }
    
    bd.style.display = "flex";
    bd.setAttribute("aria-hidden", "false");
// console.log("✅ Backdrop display set to flex.");
    
    try {
// console.log("🔄 Calling applyBrowseFilters()...");
        applyBrowseFilters(); 
// console.log("✅ Filters applied successfully.");
    } catch (e) {
        console.error("❌ ERROR inside applyBrowseFilters:", e);
    }
    
    if ($("browseSearch")) $("browseSearch").focus();
};

// Ensure the local reference points to the window one just in case
const openBrowse = window.openBrowse;

function closeBrowse() {
    document.body.classList.remove("modal-open");
    const bd = $("browseBackdrop");
    if (!bd) return;
    bd.style.display = "none";
    bd.setAttribute("aria-hidden", "true");
    exitBrowseDetailMode();
    const d = $("browseDetail");
    if (d) d.innerHTML = "";
    if ($("browseBtn")) $("browseBtn").focus();
}

function renderBrowseList(items) {
    const list = document.getElementById("browseList");
    if (!list) return;
    
    list.innerHTML = "";
    const countEl = document.getElementById("browseCount");
    
    const totalCount = Object.keys(asanaLibrary || {}).length;
    if (countEl) countEl.textContent = `Showing ${items.length} of ${totalCount}`;

    if (!items.length) {
       list.innerHTML = `<div class="msg" style="padding:10px 0">No matches found.</div>`;
       return;
    }

    const frag = document.createDocumentFragment();
    
    items.slice(0, 400).forEach(asma => {
       const row = document.createElement("div");
       row.className = "browse-item";

       const left = document.createElement("div");
       
       const title = document.createElement("div");
       title.className = "title";
       
       // Fallback logic for title
       let titleText = (typeof displayName === "function" ? displayName(asma) : null);
       if (!titleText || titleText === "(no name)") {
           titleText = asma.name || asma.english || asma.iast || "(no name)";
       }
       
       // Use plural 'variations' length if present
       const varCount = asma.variations ? Object.keys(asma.variations).length : 0;
       if (varCount > 0) {
           titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${varCount} variations)</span>`;
       }
       title.innerHTML = titleText;

       const meta = document.createElement("div");
       meta.className = "meta";
       const catDisplay = asma.category ? asma.category.replace(/^\d+_/, "").replace(/_/g, " ") : "Uncategorized";
       const catBadge = catDisplay ? ` <span class="badge">${catDisplay}</span>` : "";
       
        // Smart plate formatter
        let platesText = "";
        if (typeof asma.plates === 'object' && asma.plates !== null) {
            const finalStr = asma.plates.final && asma.plates.final.length ? `Final: ${asma.plates.final.join(", ")}` : "";
            const interStr = asma.plates.intermediate && asma.plates.intermediate.length ? `Int: ${asma.plates.intermediate.join(", ")}` : "";
            platesText = [finalStr, interStr].filter(Boolean).join(" | ");
        } else {
            platesText = asma.plates || asma.plate_numbers || "";
        }
       meta.innerHTML = `
         <span style="color:#000; font-weight:bold;">ID: ${asma.id || asma.asanaNo || "?"}</span>
         ${platesText ? ` • Plates: ${platesText}` : ""}
         ${catBadge}
       `;
       
       left.appendChild(title);
       left.appendChild(meta);

       const btn = document.createElement("button");
       btn.textContent = "View";
       btn.className = "tiny";
       btn.addEventListener("click", () => {
          if (typeof showAsanaDetail === "function") showAsanaDetail(asma);
          if (typeof isBrowseMobile === 'function' && isBrowseMobile()) {
             if (typeof enterBrowseDetailMode === "function") enterBrowseDetailMode();
          }
       });

       row.appendChild(left);
       row.appendChild(btn);
       frag.appendChild(row);
    });
    
    list.appendChild(frag);

    if (items.length > 400) {
       const more = document.createElement("div");
       more.className = "msg";
       more.style.padding = "10px 0";
       more.textContent = `Showing first 400 results. Narrow your filters.`;
       list.appendChild(more);
    }
}

/* ==========================================================================
   DETAIL VIEW & TABS
   ========================================================================== */

function startBrowseAsana(asma) {
   const plates = (asma.finalPlates && asma.finalPlates.length) ? asma.finalPlates : asma.interPlates;
   if (!plates || !plates.length) return;

   stopTimer();
   /* running = false */;
   $("startStopBtn").textContent = "Start";

   const variationName = asma.variation || "";
   const fullName = variationName ? `${asma.english} (${variationName})` : asma.english;

   setCurrentSequence({
      title: `Browse: ${fullName}`,
      category: "Browse",
      poses: [[plates, 60, fullName]]
   });
   setCurrentIndex(0);
   setPose(0);
   closeBrowse();
}
async function showAsanaDetail(asana) {
// console.log("showAsanaDetail called with:", asana);
    const d = document.getElementById('browseDetail');
// console.log("browseDetail element found:", d);
    if (!d) {
        console.error("browseDetail element not found!");
        return;
    }

    d.innerHTML = "";
// console.log("browseDetail cleared");

    const titleEl = document.createElement("h2");
    titleEl.style.margin = "0 0 10px 0";
    titleEl.textContent = displayName(asana);
    d.appendChild(titleEl);
// console.log("Title appended");

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit Asana";
    editBtn.className = "edit-asana-btn";
    editBtn.style.cssText = "background: #2196f3; color: white; padding: 6px 12px; cursor: pointer; margin-bottom: 10px; font-weight: bold; border: none; border-radius: 6px;";
    editBtn.onclick = () => {
// console.log("Edit button onclick fired");
// console.log("Edit button clicked, asana.id:", asana.id, "asana.asanaNo:", asana.asanaNo);
        window.openAsanaEditor(asana.id || asana.asanaNo);
    };
    d.appendChild(editBtn);
// console.log("Edit button appended:", editBtn);
// console.log("Edit button onclick property:", editBtn.onclick);

    let rangeText = "";
    const hj = asana?.hold_json || asana?.hold_data;
    if (hj && hj.standard) {
        rangeText = ` • ${hj.standard}s (Range: ${hj.short}s - ${hj.long}s)`;
    }

    // 3. Build the rest of the Info via a single HTML string
    // Use a unique name for this string variable to avoid re-declaration errors
    let detailHTML = `
      ${
        asana.iast && prefersIAST() && asana.english
          ? `<div style="font-size:0.85rem;color:#666;margin-bottom:4px;">${asana.english}</div>`
          : asana.iast && !prefersIAST()
          ? `<div style="font-size:0.85rem;color:#666;margin-bottom:4px;font-style:italic;">${asana.iast}</div>`
          : ''
      }
      <div class="muted">
         <span id="poseMetaBrowse"><span class="meta-text-only">ID: ${asana.id || asana.asanaNo}${rangeText}</span><button id="playNameBtn" class="tiny" style="margin-left: 10px;" title="Play Audio">🔊</button></span>
      </div>
      <hr>
    `;

    // 4. Append Images
    const urls = typeof smartUrlsForPoseId === 'function' ? smartUrlsForPoseId(asana.id || asana.asanaNo) : [];
    if (urls && urls.length > 0) {
        detailHTML += `<div class="browse-collage">`;
        urls.forEach((src) => {
            detailHTML += `<img src="${src}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">`;
        });
        detailHTML += `</div>`;
    }
  
    // 5. Append Technique (Base Pose)
    const baseTech = asana.technique || asana.Technique || "";
    if (baseTech) {
        detailHTML += `<h3>Base Technique</h3>
          <div class="technique-text" style="white-space: pre-wrap;">${
            typeof formatTechniqueText === 'function' ? formatTechniqueText(baseTech) : baseTech
          }</div>`;
    }

    // 5.5. Append Description
    const baseDesc = asana.description || asana.Description || "";
    if (baseDesc) {
        detailHTML += `<details style="margin-top:12px; max-width:720px;">
          <summary style="cursor:pointer; font-weight:650">Description</summary>
          <div class="desc-text" style="padding-top:8px; color:#111; white-space: pre-wrap;">${
            typeof formatTechniqueText === 'function' ? formatTechniqueText(baseDesc) : baseDesc
          }</div>
        </details>`;
    }

    // Safely append the gathered HTML string to the existing native elements
    d.insertAdjacentHTML('beforeend', detailHTML);
  
    // --- REPLACE YOUR SECTION 6 (Variations Loop) WITH THIS ---
    if (asana.variations && Object.keys(asana.variations).length > 0) {
        const varSection = document.createElement('div');
        // We can just use one heading now since they are merged
        varSection.innerHTML = '<hr><h3>Variations & Stages</h3>';

        const sortedKeys = Object.keys(asana.variations).sort();
        sortedKeys.forEach(key => {
            const val = asana.variations[key];
            let techText = '';
            let shortText = '';
            let holdText = val.hold || '';
            let titleText = `Stage ${key}`;
            let isCustom = !!val.isCustom; // This is the flag we added to loadAsanaLibrary

            if (typeof val === 'string') {
                techText = val;
            } else if (val && typeof val === 'object') {
                techText = val.full_technique || val.Full_Technique || val.technique || '';
                shortText = val.shorthand || val.Shorthand || '';
                // Per user request, simplified to only use the 'title' field.
                if (val.title && String(val.title).trim()) titleText = String(val.title).trim();
            }

            const wrapper = document.createElement('div');
            wrapper.className = isCustom ? 'user-variation-block' : 'variation-block';
            
            // STYLE OVERRIDE: If it's custom, give it the blue theme. Otherwise, the grey theme.
            wrapper.style.cssText = isCustom 
                ? 'background:#f0f7ff; padding:12px; margin-bottom:12px; border-radius:8px; border: 2px solid #2196f3;'
                : 'background:#f9f9f9; padding:12px; margin-bottom:12px; border-radius:8px; border: 1px solid #eee;';

            let html = `<h4 style="margin-top:0; margin-bottom:8px; color:${isCustom ? '#1976d2' : '#333'}; font-size:1.1rem;">${titleText}</h4>`;
            
            if (shortText) html += `<div style="color:${isCustom ? '#1565c0' : '#2e7d32'}; font-weight:bold; margin-bottom:8px; font-family:monospace; font-size:1rem;">${shortText}</div>`;
            
            // Add the Hold time if it exists
            if (holdText) html += `<div style="color:${isCustom ? '#0d47a1' : '#666'}; margin-bottom:8px; font-weight:600; font-size:0.95rem;">Hold: ${holdText}</div>`;

            if (techText) {
                const formattedTech = typeof formatTechniqueText === 'function' ? formatTechniqueText(techText) : techText;
                html += `<div class="technique-text" style="white-space: pre-wrap; font-size:0.95rem; color:#444;">${formattedTech}</div>`;
            } else {
                html += `<div class="muted" style="font-size:0.85rem;">No specific instructions provided.</div>`;
            }

            wrapper.innerHTML = html;
            varSection.appendChild(wrapper);
        });
        d.appendChild(varSection);
    }
    // 7. Bind Audio Button
    const playBtn = document.getElementById('playNameBtn');
    if (playBtn) playBtn.onclick = () => playAsanaAudio(asana, null, true);
  
}


/* ==========================================================================
   RENDERERS (COLLAGE & LISTS)
   ========================================================================== */
/* ==========================================================================
   RENDERERS (COLLAGE, LISTS & DROPDOWNS)
   ========================================================================== */

   function renderPlateSection(title, plates, globalSeen, fallbackId) {
    const wrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "section-title";
    header.textContent = title;
    wrap.appendChild(header);
 
    let targets = (plates && plates.length) ? plates : [];
    if (!targets.length && !fallbackId) {
       const msg = document.createElement("div");
       msg.className = "msg";
       msg.textContent = "–";
       wrap.appendChild(msg);
       return wrap;
    }
 
    const urls = [];
    const missing = [];
    const seen = new Set();
    
    const processIds = (idList) => {
        for (const p of idList) {
           if (!p || p === "undefined") continue;
           const u = (typeof urlsForPlateToken === 'function') ? urlsForPlateToken(p) : [];
           if (!u.length) missing.push(p);
           u.forEach(x => {
              const g = globalSeen || null;
              if (!seen.has(x) && !(g && g.has(x))) {
                 seen.add(x);
                 if (g) g.add(x);
                 urls.push(x);
              }
           });
        }
    };
    processIds(targets);
 
    if (urls.length === 0 && fallbackId) {
        const fallbackUrls = (typeof urlsForPlateToken === 'function') ? urlsForPlateToken(fallbackId) : [];
        if (fallbackUrls.length > 0) {
            fallbackUrls.forEach(x => {
                const g = globalSeen || null;
                if (!seen.has(x) && !(g && g.has(x))) {
                    seen.add(x);
                    if (g) g.add(x);
                    urls.push(x);
                }
            });
            while(missing.length > 0) missing.pop();
        }
    }
 
    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.marginTop = "4px";
    meta.style.fontSize = "0.8rem";
    if (targets.length) {
        meta.textContent = `Ref Plates: ${targets.join(", ")}`;
        wrap.appendChild(meta);
    }
 
    if (urls.length) {
       if (typeof renderCollage === "function") wrap.appendChild(renderCollage(urls));
       else console.warn("renderCollage missing");
    }
 
    if (missing.length && urls.length === 0) {
       const m = document.createElement("div");
       m.className = "msg";
       m.style.color = "#d9534f"; 
       m.textContent = `⚠️ Image not found for Ref: ${missing.join(", ")}`;
       wrap.appendChild(m);
    }
    return wrap;
 }
 
 function renderCollage(urls) {
    const wrap = document.createElement("div");
    wrap.className = "collage";
    urls.forEach(u => {
       const mob = (typeof mobileVariantUrl === 'function') ? mobileVariantUrl(u) : u;
       const tile = document.createElement("div");
       tile.className = "tile";
       tile.innerHTML = `
         <picture>
           <source media="(max-width: 768px)" srcset="${mob}">
           <img src="${u}" alt="" loading="lazy" decoding="async">
         </picture>
       `;
       wrap.appendChild(tile);
    });
    return wrap;
 }
 
 // --- NEW: Category Filter Logic ---
 function renderCategoryFilter() {
    const filterEl = document.getElementById("categoryFilter");
    if (!filterEl) return;
 
    // 1. Get unique categories
    const uniqueCats = new Set();
    courses.forEach(c => {
        const cat = c.category ? c.category.trim() : "Uncategorized";
        uniqueCats.add(cat);
    });
 
    // 2. Save current selection
    const currentVal = filterEl.value;
 
    // 3. Rebuild Options
    filterEl.innerHTML = `<option value="ALL">📂 All Collections</option>`;
 
    Array.from(uniqueCats).sort().forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        
        // Visual flair for your specific categories
        let icon = "📁";
        if (cat.includes("Asana")) icon = "🧘";
        else if (cat.includes("Therapeutic")) icon = "❤️";
        else if (cat.includes("Pranayama")) icon = "🌬️";
        
        opt.textContent = `${icon} ${cat}`;
        filterEl.appendChild(opt);
    });
 
    // 4. Restore selection or default
    filterEl.value = currentVal || "ALL";
 
    // 5. Attach Listener
    // Remove old listener to avoid duplicates
    filterEl.onchange = () => renderCourseUI();
 }
 
 // --- UPDATED: Course Selector (Filters based on Category) ---
 function renderCourseUI() {
    const sel = document.getElementById("sequenceSelect");
    const filterEl = document.getElementById("categoryFilter");
    if (!sel) return;

    const filterVal = filterEl ? filterEl.value : "ALL";
    const currentVal = sel.value; 

    sel.innerHTML = `<option value="">Select a course</option>`;

    // Grouping by EXACT category string
    const grouped = {};
    courses.forEach((course, idx) => {
       const cat = course.category ? course.category.trim() : "Uncategorized";
       
       if (filterVal !== "ALL" && cat !== filterVal) return;

       if (!grouped[cat]) grouped[cat] = [];
       grouped[cat].push({ course, idx });
    });

    // Sort categories alphabetically
    const sortedCats = Object.keys(grouped).sort();

    sortedCats.forEach(catName => {
        const groupEl = document.createElement("optgroup");
        groupEl.label = catName;
        
        grouped[catName].forEach(item => {
            const opt = document.createElement("option");
            opt.value = String(item.idx);
            // Show the title. The value (idx) points to the unique object in the courses array.
            opt.textContent = item.course.title || `Course ${item.idx + 1}`;
            groupEl.appendChild(opt);
        });
        sel.appendChild(groupEl);
    });

    if (currentVal) {
        const exists = Array.from(sel.options).some(o => o.value === currentVal);
        if (exists) sel.value = currentVal;
    }
}
 
 // Main Entry Point for Dropdowns
 function renderSequenceDropdown() {
    renderCategoryFilter(); // Update filter options
    renderCourseUI();       // Update course list
 }
 
 // Alias for Admin compatibility
 const populateSequenceSelect = renderSequenceDropdown;

/* ==========================================================================
   FILTER HELPERS
   ========================================================================== */

   function applyBrowseFilters() {
    const q = document.getElementById("browseSearch")?.value.trim() || "";
    const plateStr = document.getElementById("browsePlate")?.value.trim() || "";
    const noQ = document.getElementById("browseAsanaNo")?.value.trim() || "";
    const cat = document.getElementById("browseCategory")?.value || "";
    const finalsOnly = document.getElementById("browseFinalOnly")?.checked || false;

    const normalizeText = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normQ = normalizeText(q);

    // Get all asanas as an array
    const asanaArray = Object.values(window.asanaIndex || asanaLibrary || {});

    const filtered = asanaArray.filter(a => {
        if (!a) return false;

        // 1. Text Search (Null-proof)
        if (normQ) {
            const searchStr = normalizeText(a.name) + " " + normalizeText(a.english) + " " + normalizeText(a.iast);
            if (!searchStr.includes(normQ)) return false;
        }

        // 2. Category Dropdown
        if (cat && cat !== "") {
            const safeCat = String(a.category || "");
            if (cat === "__UNCAT__") {
                if (safeCat && safeCat !== "Uncategorized") return false;
            } else {
                if (!safeCat.includes(cat) && safeCat !== cat) return false;
            }
        }

        // 3. Asana ID 
        if (noQ && String(a.id) !== noQ && String(a.asanaNo) !== noQ) return false;

        // 4. Plates
        if (plateStr) {
            const plateArr = plateStr.match(/\d+/g) || [];
            const aPlates = String(a.plates || a.plate_numbers || "").match(/\d+/g) || [];
            const hasPlate = plateArr.some(p => aPlates.includes(p));
            if (!hasPlate) return false;
        }

        return true;
    });

    // 5. Safe Deduplication by ID
    const uniqueFiltered = [];
    const seen = new Set();
    filtered.forEach(a => {
        const uniqueKey = String(a.id || a.asanaNo || a.name || "").toLowerCase().trim();
        if (uniqueKey && !seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            uniqueFiltered.push(a);
        }
    });

    // 6. Sort Numerically by ID
    uniqueFiltered.sort((x, y) => {
        const idX = String(x.id || x.asanaNo || "9999");
        const idY = String(y.id || y.asanaNo || "9999");
        // { numeric: true } ensures that "2" comes before "10"
        return idX.localeCompare(idY, undefined, { numeric: true });
    });

    if (typeof renderBrowseList === "function") {
        renderBrowseList(uniqueFiltered);
    }
}

/* ==========================================================================
   CONSOLIDATED ADMIN / MANAGE UI
   ========================================================================== */
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
// -- Only Core Initialization Below -- 

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
        setCurrentSequence(null);
        setStatus("Select a sequence");
        if($("collageWrap")) $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`;
        return;
    }

    // --- 1. SET CURRENT SEQUENCE ---
    // (Checks both 'courses' and 'sequences' arrays to be safe)
    const rawSequence = (typeof courses !== "undefined" ? courses : sequences)[parseInt(idx, 10)];
    setCurrentSequence(rawSequence); 
    
    // 👈 EXPOSE TO CONSOLE
    window.currentSequence = getCurrentSequence(); 

    // --- 2. GENERATE EXPANDED LIST (MACROS) ---
    if (typeof getExpandedPoses === "function") {
        setActivePlaybackList(getExpandedPoses(getCurrentSequence()));
    } else {
        setActivePlaybackList(getCurrentSequence() && getCurrentSequence().poses ? [...getCurrentSequence().poses] : []);
    }
    
    // 👈 EXPOSE TO CONSOLE
    window.activePlaybackList = getActivePlaybackList(); 

    // --- 3. APPLY SLIDER & UI ---
    if (typeof applyDurationDial === 'function') applyDurationDial();
    if (typeof updateDialUI === 'function') updateDialUI();

    if (typeof updateTotalAndLastUI === 'function') updateTotalAndLastUI();

    try {
        currentIndex = 0; // Ensure we start at the beginning
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
      if (currentSequence) setPose(currentIndex);
   });
})();
function updateLastCompletedPill(){

    const pill = document.getElementById("lastCompletedPill");
    if(!pill) return;
  
    const seq = getCurrentSequenceTitle();
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
        if (!currentSequence) return alert("Please select a sequence first.");
        openHistoryModal("current");
    });
}

// History Modal & Tabs Logic
const histBackdrop = $("historyBackdrop");
if ($("historyCloseBtn")) $("historyCloseBtn").onclick = () => {
    if(histBackdrop) histBackdrop.style.display = "none";
};

// Tab Switching
const tabCurrent = $("histTabCurrent");
const tabGlobal = $("histTabGlobal");
const viewCurrent = $("histViewCurrent");
const viewGlobal = $("histViewGlobal");

if (tabCurrent && tabGlobal) {
    tabCurrent.onclick = () => switchHistoryTab("current");
    tabGlobal.onclick = () => switchHistoryTab("global");
}

function switchHistoryTab(mode) {
    if (mode === "current") {
        tabCurrent.style.background = "#fff";
        tabCurrent.style.fontWeight = "bold";
        tabCurrent.style.border = "1px solid #ddd";
        
        tabGlobal.style.background = "transparent";
        tabGlobal.style.fontWeight = "normal";
        tabGlobal.style.border = "none";

        viewCurrent.style.display = "block";
        viewGlobal.style.display = "none";
    } else {
        tabGlobal.style.background = "#fff";
        tabGlobal.style.fontWeight = "bold";
        tabGlobal.style.border = "1px solid #ddd";

        tabCurrent.style.background = "transparent";
        tabCurrent.style.fontWeight = "normal";
        tabCurrent.style.border = "none";

        viewCurrent.style.display = "none";
        viewGlobal.style.display = "block";
        renderGlobalHistory(); // Render on demand
    }
}

// Clear History Button — now deletes from Supabase
if ($("clearHistoryBtn")) $("clearHistoryBtn").onclick = async () => {
    if (!currentSequence) return;
    if (!confirm("Clear all completion dates for this sequence?")) return;
    const btn = $("clearHistoryBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Clearing…"; }
    await deleteAllCompletionsForTitle(currentSequence.title);
    if (btn) { btn.disabled = false; btn.textContent = "Clear This Sequence"; }
    openHistoryModal("current");
    updateTotalAndLastUI();
};

async function openHistoryModal(defaultTab = "current") {
    if (!histBackdrop) return;

    const titleEl = $("historyTitle");
    if (titleEl && currentSequence) titleEl.textContent = currentSequence.title;

    const listEl = $("historyList");
    if (listEl && currentSequence) {
        listEl.innerHTML = `<div class="muted" style="padding:8px;">Loading…</div>`;

        // Always pull the freshest data from the unified cache (Supabase-backed)
        const hist = serverHistoryCache || await fetchServerHistory();
        const entries = hist
            .filter(e => e.title === currentSequence.title)
            .sort((a, b) => b.ts - a.ts);

        listEl.innerHTML = "";

        if (entries.length === 0) {
            listEl.innerHTML = `<div class="muted" style="padding:8px;">No completion history yet.</div>`;
        } else {
            // Streak banner
            const streak = calculateStreak(entries.map(e => e.iso));
            if (streak > 0) {
                const streakEl = document.createElement("div");
                streakEl.style.cssText = "padding:8px 10px; background:#e8f5e9; color:#2e7d32; font-weight:bold; border-radius:6px; margin-bottom:8px; font-size:0.9rem;";
                streakEl.textContent = streak === 1
                    ? "Practiced today — keep the momentum!"
                    : `${streak}-day practice streak — well done!`;
                listEl.appendChild(streakEl);
            }

            entries.forEach(e => {
                const row = document.createElement("div");
                row.style.cssText = "padding:8px 4px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem;";
                const d = new Date(e.ts);
                const niceDate = isNaN(d) ? e.local : d.toLocaleDateString("en-AU") + " " + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                const dateSpan = document.createElement("span");
                dateSpan.textContent = niceDate;
                const delBtn = document.createElement("button");
                delBtn.textContent = "✕";
                delBtn.className = "tiny";
                delBtn.style.cssText = "color:#999; border:none; background:transparent; cursor:pointer; font-size:0.8rem;";
                delBtn.title = "Remove this entry";
                delBtn.onclick = async () => {
                    delBtn.disabled = true;
                    await deleteCompletionById(e.id);
                    openHistoryModal("current");
                    updateTotalAndLastUI();
                };
                row.appendChild(dateSpan);
                row.appendChild(delBtn);
                listEl.appendChild(row);
            });
        }
    }

    switchHistoryTab(defaultTab);
    histBackdrop.style.display = "flex";
}

// Render Global Dashboard — reads from the unified Supabase-backed cache
function renderGlobalHistory() {
   const container = $("globalHistoryList");
   if (!container) return;
   container.innerHTML = "";

   const entries = serverHistoryCache || [];
   if (!entries.length) {
      container.innerHTML = `<div class="msg">No history found for any sequence.</div>`;
      return;
   }

   // Build per-title aggregation
   const byTitle = {};
   entries.forEach(e => {
      if (!e.title) return;
      if (!byTitle[e.title]) byTitle[e.title] = { category: e.category || '', isos: [], lastTs: 0 };
      byTitle[e.title].isos.push(e.iso);
      if (e.ts > byTitle[e.title].lastTs) byTitle[e.title].lastTs = e.ts;
   });

   // Overall streak across ALL practice (any sequence)
   const allIsos = entries.map(e => e.iso).filter(Boolean);
   const overallStreak = calculateStreak(allIsos);

   // Total sessions count
   const totalCompletions = entries.length;

   // Stats header
   const statsHeader = document.createElement("div");
   statsHeader.style.cssText = "padding:10px 14px; background:#e8f5e9; border-radius:6px; margin-bottom:12px; font-size:0.9rem;";
   let statsHtml = `<div style="font-weight:bold; font-size:1rem; margin-bottom:4px;">Total sessions: ${totalCompletions}</div>`;
   if (overallStreak > 1) {
      statsHtml += `<div style="color:#2e7d32; font-weight:bold;">${overallStreak}-day practice streak — keep it up!</div>`;
   } else if (overallStreak === 1) {
      statsHtml += `<div style="color:#2e7d32;">Practiced today — great work!</div>`;
   }
   statsHeader.innerHTML = statsHtml;
   container.appendChild(statsHeader);

   // Group by category
   const grouped = {};
   const allSeqs = window.sequences || [];
   const titleToCat = {};
   allSeqs.forEach(s => titleToCat[s.title] = s.category || "Uncategorized");

   Object.keys(byTitle).forEach(title => {
      const cat = byTitle[title].category || titleToCat[title] || "Archived / Removed";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
         title,
         count: byTitle[title].isos.length,
         lastDate: new Date(byTitle[title].lastTs),
         lastDateStr: new Date(byTitle[title].lastTs).toLocaleDateString("en-AU")
      });
   });

   Object.keys(grouped).sort().forEach(catName => {
      const items = grouped[catName].sort((a, b) => b.lastDate - a.lastDate);

      const section = document.createElement("details");
      section.open = true;
      section.style.cssText = "margin-bottom:10px; border:1px solid #ddd; border-radius:6px; background:#fff;";

      const summary = document.createElement("summary");
      summary.style.cssText = "padding:10px; cursor:pointer; font-weight:bold; background:#f5f5f5; border-radius:6px 6px 0 0;";
      summary.innerHTML = `${catName} <span style="font-weight:normal; color:#666; font-size:0.85em;">(${items.length} sequences)</span>`;

      const content = document.createElement("div");

      items.forEach(item => {
         const row = document.createElement("div");
         row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; font-size:0.9rem;";
         let countColor = "#eee";
         if (item.count > 5) countColor = "#ffe0b2";
         if (item.count > 10) countColor = "#c8e6c9";
         row.innerHTML = `
            <div style="flex:1;">
               <div style="font-weight:600;">${item.title}</div>
               <div style="font-size:0.8rem; color:#888;">Last: ${item.lastDateStr}</div>
            </div>
            <div style="background:${countColor}; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold; margin-left:8px;">
               ${item.count}x
            </div>`;
         content.appendChild(row);
      });

      section.appendChild(summary);
      section.appendChild(content);
      container.appendChild(section);
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
    if (!currentSequence) return;
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
   setCurrentSequence(null);
   setCurrentIndex(0);

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
    if (typeof currentSequence !== "undefined" && currentSequence) {
        if (typeof setPose === "function") setPose(currentIndex);
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

    if (estEl && currentSequence && window.currentSequenceOriginalPoses) {
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
        if (currentSequence) applyDurationDial();
    });
    
    // 2. Releasing: Just forces one final sync
    durationDial.addEventListener("change", () => {
        if (currentSequence) applyDurationDial();
    });
    
    // 3. Double Click: Reset (Keep for desktop users)
    durationDial.addEventListener("dblclick", () => {
        durationDial.value = 50;
        if (typeof updateDialUI === "function") updateDialUI();
        if (currentSequence) applyDurationDial();
    });
}
function applyDurationDial() {
    if (!currentSequence) return;
    const dial = document.getElementById("durationDial");
    if (!dial) return;
    
    const val = Number(dial.value); // 0 to 100

    // 1. Expand a fresh list from the raw sequence
    const baseList = typeof getExpandedPoses === "function" ? getExpandedPoses(currentSequence) : currentSequence.poses;

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
    if (window.activePlaybackList[currentIndex]) {
        const newPoseSeconds = Number(window.activePlaybackList[currentIndex][1]) || 0;
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
    if (!currentSequence) return;

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

function openEditCourse() {
   if (!currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", currentSequence);
}

function builderOpen(mode, seq) {
    builderMode = mode;
    builderPoses = [];
    builderEditingCourseIndex = -1;
    let targetId = seq ? (seq.supabaseId || seq.id) : null;

    const catInput = $("builderCategory"); 
    const titleEl = $("builderTitle");
    const modeLabel = $("builderModeLabel");
    const datalist = $("builderCategoryList");

    if (catInput) {
        catInput.oninput = () => builderRender(); 
    }

    if (targetId && String(targetId).length < 30) {
        targetId = null;
    }
    builderEditingSupabaseId = targetId;

    document.body.classList.add("modal-open");

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

function builderRender() {
    const tbody = document.getElementById("builderTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const emptyMsg = document.getElementById("builderEmptyMsg");
    if (emptyMsg) emptyMsg.style.display = builderPoses.length ? "none" : "block";
 
    const libraryArray = Object.values(window.asanaLibrary || {});
    const currentCategory = (document.getElementById("builderCategory")?.value || "").toLowerCase();
    const isFlow = currentCategory.includes("flow");
 
    builderPoses.forEach((pose, idx) => {
        const idStr = String(pose.id);
        const durOrReps = Number(pose.duration) || 0;
        const isMacro = idStr.startsWith("MACRO:");
        let asana = null;
    
        if (!isMacro) {
            const normId = normalizePlate(idStr);
            asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        }
    
        const tr = document.createElement("tr");
        tr.draggable = true;
        tr.dataset.idx = idx;
        if (isMacro) tr.className = "builder-macro-row";

        tr.ondragstart = (e) => { e.dataTransfer.setData("text/plain", idx); tr.style.opacity = "0.4"; };
        tr.ondragend = () => tr.style.opacity = "1";
        tr.ondragover = (e) => { e.preventDefault(); tr.style.borderTop = "2px solid #007aff"; };
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
    
        const hasSides = asana && (asana.requires_sides || asana.requiresSides);
        const sideBadge = (!isMacro && hasSides) ? `<span style="color:#2e7d32; font-size:0.7rem; font-weight:bold; margin-left:4px;">[Sides ×2]</span>` : '';
    
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

        const displayTime = isMacro ? durOrReps : (isFlow ? durOrReps : (asana?.hold_data?.standard || 30));
        const isLocked = !isFlow && !isMacro;

        const durInputHTML = `
            <input type="number" class="b-dur" data-idx="${idx}" value="${displayTime}" min="1" ${isLocked ? 'readonly' : ''} style="width:60px; padding:4px; border:1px solid #ccc; text-align:center; ${isLocked ? 'background:#f0f0f0; color:#888; cursor:not-allowed;' : ''}">
            ${isMacro ? `<div style="font-size:0.7rem; color:#0d47a1; margin-top:4px; font-weight:bold;">Rounds</div>` : (isLocked ? '' : `<button class="tiny b-std-time" data-idx="${idx}" style="display:block; margin:4px auto 0;">⏱ Std</button>`)}
        `;
    
        tr.innerHTML = `
           <td style="padding:8px; text-align:center; color:#888;">${idx + 1}</td>
           <td style="padding:8px;">
              <div style="font-weight:bold; margin-bottom:4px; line-height: 1.2;">${pose.name || 'Unknown'} ${sideBadge}</div>
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" ${isMacro ? 'readonly' : ''} style="width:${isMacro ? 'auto' : '50px'}; padding:2px; border:1px solid #ccc; border-radius:4px; ${isMacro ? 'background:#f0f0f0;' : ''}">
                 ${varSelectHTML}
              </div>
           </td>
           <td style="padding:8px; text-align:center;">${durInputHTML}</td>
           <td style="padding:8px;"><input type="text" class="b-note" data-idx="${idx}" value="${(pose.note || '').replace(/"/g, '&quot;')}" placeholder="Notes..." style="width:100%; padding:4px; border:1px solid #ccc;"></td>
           <td style="padding:8px; text-align:center; white-space:nowrap;">
              <button class="tiny b-move-up" data-idx="${idx}">▲</button>
              <button class="tiny b-move-dn" data-idx="${idx}">▼</button>
              <button class="tiny warn b-remove" data-idx="${idx}">✕</button>
           </td>`;
           
        tbody.appendChild(tr);
    });
 
    const qS = (sel) => tbody.querySelectorAll(sel);
    qS('.b-id').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        let val = e.target.value.trim();
        if(!val.startsWith("MACRO:")) val = val.padStart(3, '0');
        builderPoses[i].id = val;
        const normId = normalizePlate(val);
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch) {
            builderPoses[i].name = asanaMatch.name;
            if (asanaMatch.hold_data?.standard) builderPoses[i].duration = asanaMatch.hold_data.standard;
        }
        builderRender();
    });

    qS('.b-std-time').forEach(el => el.onclick = () => {
        const i = el.dataset.idx;
        const normId = normalizePlate(builderPoses[i].id);
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch?.hold_data?.standard) { builderPoses[i].duration = asanaMatch.hold_data.standard; builderRender(); }
    });

    qS('.b-var').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        builderPoses[i].variation = e.target.value;
        const normId = normalizePlate(builderPoses[i].id);
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
            if (isNaN(val) || val < 1) { val = 1; e.target.value = 1; }
            builderPoses[idx].duration = val;
            builderRender(); 
        };
    });

    qS('.b-note').forEach(el => el.oninput = (e) => builderPoses[e.target.dataset.idx].note = e.target.value);
    qS('.b-move-up').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), -1));
    qS('.b-move-dn').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), 1));
    qS('.b-remove').forEach(el => el.onclick = () => removePose(parseInt(el.dataset.idx)));
  
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
                const normId = normalizePlate(idStr);
                const asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
                const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
                const activeTime = isFlow ? durOrReps : libraryStd;
                const effective = getEffectiveTime(p.id, activeTime);
                finalTotalSecs += effective;
                expandedPoseCount += (effective > activeTime) ? 2 : 1;
            }
        });

        statsEl.textContent = `${expandedPoseCount} poses · ${formatHMS(finalTotalSecs)} total (incl. reps & sides)`;
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

async function builderSave() {
    const title = ($("builderTitle")?.value || "").trim();
    if (!title) { alert("Please enter a title."); return; }
    
    const sequenceText = builderPoses.map(p => {
        const idStr = String(p.id);
        if (idStr.startsWith("MACRO:")) {
            return `${idStr} | ${p.duration} | [Sequence Link] ${p.note ? p.note : ''}`;
        }
        const id = String(p.id).padStart(3, '0');
        const dur = p.duration || 30;
        const varPart = p.variation ? `[${p.variation}]` : `[]`;
        const notePart = p.note ? p.note.trim() : "";
        return `${id} | ${dur} | ${varPart} ${notePart}`.trim();
    }).join("\n");

    const category = ($("builderCategory")?.value || "").trim();
    const isFlow = category.toLowerCase().includes("flow"); 
    const libraryArray = Object.values(asanaLibrary || {});

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

    try {
        if (!supabase) return;
        const payload = { title, category, sequence_text: sequenceText, pose_count: builderPoses.length, total_seconds: totalSec, updated_at: new Date().toISOString() };
        const { error } = builderEditingSupabaseId 
            ? await supabase.from('user_sequences').update(payload).eq('id', builderEditingSupabaseId)
            : await supabase.from('user_sequences').insert([{ ...payload, user_id: window.currentUserId }]);
        if (error) throw error;

        await loadCourses(); 
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            const newIdx = courses.findIndex(c => c.title === title);
            if (newIdx !== -1) { sel.value = String(newIdx); sel.dispatchEvent(new Event('change')); }
        }
        $("editCourseBackdrop").style.display = "none";
        document.body.classList.remove("modal-open");
        alert(`"${title}" saved successfully!`);
    } catch(e) {
        console.error("❌ Save failed:", e);
        alert("Failed to save: " + (e.message || "Unknown error"));
    }
}

/* ==========================================================================
   FULL ASANA EDITOR (Supabase Upsert)
   ========================================================================== */

   window.openAsanaEditor = async function(id) {

    const bd = $("asanaEditorBackdrop");

    if (!bd) {
        console.error("asanaEditorBackdrop not found!");
        return alert("Editor HTML missing");
    }
    bd.style.display = "flex";
    // Populate Category Datalist dynamically
    const dl = $("asanaCategoryList");
    if (dl) {
        dl.innerHTML = "";
        getUniqueCategories().forEach(c => {
            const opt = document.createElement("option");
            opt.value = getDisplayCategory(c); // Use the clean display helper
            dl.appendChild(opt);
        });
    }

    // Wipe fields clean
    $("editAsanaId").value = "";
    $("editAsanaName").value = "";
    $("editAsanaIAST").value = "";
    $("editAsanaEnglish").value = "";
    $("editAsanaCategory").value = "";
    if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = "";
    if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = "";
    if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = "";
    $("editAsanaPlates").value = "";
    $("editAsanaPage2001").value = "";
    $("editAsanaPage2015").value = "";
    $("editAsanaIntensity").value = "";
    $("editAsanaNote").value = "";
    $("editAsanaDescription").value = "";
    $("editAsanaTechnique").value = "";
    $("editAsanaRequiresSides").checked = false;
    $("stagesContainer").innerHTML = "";
    $("asanaEditorStatus").textContent = "";

    // If ID is provided, we are EDITING
    if (id) {
        $("asanaEditorTitle").textContent = `Edit Asana: ${id}`;
        const a = asanaLibrary[id] || {};

        $("editAsanaId").value = a.id || a.asanaNo || id;
        $("editAsanaName").value = a.name || "";
        $("editAsanaIAST").value = a.iast || a.IAST || "";
        $("editAsanaEnglish").value = a.english || a.english_name || "";
        $("editAsanaCategory").value = a.category || "";

     
    

        // We check a.Hold (Supabase) and a.hold (Local/Legacy)
        const holdData = parseHoldTimes(a.Hold || a.hold || "");
        if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = holdData.standard;
        if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = holdData.short;
        if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = holdData.long;
        let pStr = "";
        if (a.plates && (a.plates.final || a.plates.intermediate)) {
            if (a.plates.final && a.plates.final.length) pStr += `Final: ${a.plates.final.join(", ")}`;
            if (a.plates.intermediate && a.plates.intermediate.length) {
                if (pStr) pStr += " ";
                pStr += `Intermediate: ${a.plates.intermediate.join(", ")}`;
            }
        } else {
            pStr = a.plate_numbers || "";
        }
        $("editAsanaPlates").value = pStr;

        $("editAsanaPage2001").value = a.page2001 || a.Page_2001 || "";
        $("editAsanaPage2015").value = a.page2015 || a.Page_2015 || "";
        $("editAsanaIntensity").value = a.intensity || a.Intensity || "";
        $("editAsanaNote").value = a.note || a.Note || "";
        $("editAsanaDescription").value = a.description || a.Description || "";
        $("editAsanaTechnique").value = a.technique || a.Technique || "";
        $("editAsanaRequiresSides").checked = !!(a.requiresSides || a.Requires_Sides);

        if (a.variations) {
            Object.entries(a.variations).forEach(([sKey, sData]) => {
                addStageToEditor(sKey, sData);
            });
        }

        try {
            const paddedId = String(id).padStart(3, '0');
            const { data: userStages } = await supabase.from('user_stages').select('*').eq('asana_id', paddedId);
            if (userStages && userStages.length > 0) {
                userStages.forEach((stage) => {
                    const stageKey = stage.stage_name || '';
                    if (!$("stagesContainer").querySelector(`input.stage-key[value="${stageKey}"]`)) {
                        addStageToEditor(stageKey, {
                            id: stage.id,
                            stage_name: stageKey,
                            title: stage.title || '',
                            shorthand: stage.shorthand || '',
                            full_technique: stage.full_technique || '',
                            hold: stage.hold || ''
                        });
                    }
                });
            }
        } catch (e) {
// console.warn("Could not load user stages for editor:", e.message);
        }
    } else {
        // We are ADDING NEW
        $("asanaEditorTitle").textContent = "Add New Asana";
        $("editAsanaId").value = getNextAsanaId(); // Auto-calculate next ID
    }

    // Snapshot initial field values for change detection
    window._asanaEditorSnapshot = null;
    window._asanaEditorOriginalStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
    window._asanaEditorOriginalStageData = null;
    requestAnimationFrame(() => {
        window._asanaEditorSnapshot = {
            name: $("editAsanaName").value,
            iast: $("editAsanaIAST").value,
            english_name: $("editAsanaEnglish").value,
            technique: $("editAsanaTechnique").value,
            plate_numbers: $("editAsanaPlates").value,
            requires_sides: $("editAsanaRequiresSides").checked,
            page_2001: $("editAsanaPage2001").value,
            page_2015: $("editAsanaPage2015").value,
            intensity: $("editAsanaIntensity").value,
            note: $("editAsanaNote").value,
            category: $("editAsanaCategory").value,
            description: $("editAsanaDescription").value,
            holdStd: $("editAsanaHoldStandard")?.value,
            holdShort: $("editAsanaHoldShort")?.value,
            holdLong: $("editAsanaHoldLong")?.value,
            stageCount: $("stagesContainer").querySelectorAll(".stage-row").length
        };
        window._asanaEditorOriginalStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
            key: div.querySelector(".stage-key")?.value || "",
            prefix: div.querySelector(".stage-prefix")?.value || "",
            suffix: div.querySelector(".stage-suffix")?.value || "",
            short: div.querySelector(".stage-short")?.value || "",
            tech: div.querySelector(".stage-tech")?.value || "",
            holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
            holdShort: div.querySelector(".stage-hold-short")?.value || "",
            holdLong: div.querySelector(".stage-hold-long")?.value || ""
        }));
    });

};

async function getNextRomanNumeral() {
    // Expanded up to 20 variations
    const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X",
                   "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
    
    const asanaId = $("editAsanaId").value.trim().padStart(3, '0');
    const inDom = Array.from($("stagesContainer").querySelectorAll(".stage-key")).map(el => el.value.trim().toUpperCase());
    const taken = new Set(inDom);

    if (supabase && asanaId) {
        try {
            // THE FIX: Use .eq('asana_id', asanaId) instead of .contains('parent_id')
            const [{ data: s1 }, { data: s2 }] = await Promise.all([
                supabase.from('stages').select('"Stage_Name", stage_name').eq('asana_id', asanaId),
                supabase.from('user_stages').select('"Stage_Name", stage_name').eq('asana_id', asanaId)
            ]);
            
            // Safely check both Title Case and lowercase column names
            (s1 || []).forEach(r => {
                const name = r.Stage_Name || r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
            (s2 || []).forEach(r => {
                const name = r.Stage_Name || r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
        } catch (e) {
// console.warn("Could not query stage names for Roman numeral calc:", e.message);
        }
    }

    for (const r of ROMAN) {
        if (!taken.has(r)) return r;
    }
    return String(taken.size + 1); // Fallback to numbers if they exceed 20
}

function getVariationSuffixes() {
    const suffixes = new Set();
    const asanaId = $("editAsanaId").value.trim().padStart(3, '0');
    const asana = asanaLibrary[asanaId];
    if (asana && asana.variations) {
        Object.values(asana.variations).forEach(vData => {
            const title = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
            const suffix = title.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
            if (suffix) suffixes.add(suffix);
        });
    }
    Array.from($("stagesContainer").querySelectorAll(".stage-row")).forEach(row => {
        const suf = row.querySelector(".stage-suffix");
        if (suf && suf.value.trim()) suffixes.add(suf.value.trim());
    });
    return Array.from(suffixes).sort();
}

window.addStageToEditor = async function(stageKey = "", stageData = {}) {
    const container = $("stagesContainer");

    const autoKey = stageKey || await getNextRomanNumeral();
    const existingTitle = typeof stageData === 'object' ? (stageData.title || stageData.Title || "") : "";
    const prefixMatch = existingTitle.match(/^(Modified|Stage)\s+/i);
    const prefix = prefixMatch ? prefixMatch[1] : "Modified";
    const suffix = existingTitle.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
    const existingShorthand = typeof stageData === 'object' ? (stageData.shorthand || stageData.Shorthand || "") : "";
    const existingTech = typeof stageData === 'object' ? (stageData.full_technique || stageData.Full_Technique || stageData.technique || "") : (stageData || "");
    const existingDbId = typeof stageData === 'object' ? (stageData.id || stageData.db_id || "") : "";

    const existingHoldStr = typeof stageData === 'object' ? (stageData.hold || stageData.Hold || "") : "";
    const parsedHold = parseHoldTimes(existingHoldStr);
    const holdStd  = existingHoldStr ? parsedHold.standard : 30;
    const holdShort = existingHoldStr ? parsedHold.short    : 15;
    const holdLong  = existingHoldStr ? parsedHold.long     : 60;

    const suffixes = getVariationSuffixes();
    const datalistId = `stageSuffixList_${Date.now()}`;

    const div = document.createElement("div");
    div.className = "stage-row";
    div.dataset.dbId = existingDbId;
    div.style.cssText = "border:1px solid #ddd; padding:10px; border-radius:6px; background:#fff; display:grid; gap:8px;";

    div.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
           <div style="min-width:60px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Key</label>
               <input type="text" class="stage-key" value="${autoKey}" readonly style="width:60px; padding:6px; font-weight:bold; background:#f5f5f5; text-align:center; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="min-width:110px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Prefix</label>
               <select class="stage-prefix" style="padding:6px; border:1px solid #ccc; border-radius:4px; background:#fff; min-height:unset;">
                   <option value="Modified" ${prefix === "Modified" ? "selected" : ""}>Modified</option>
                   <option value="Stage" ${prefix === "Stage" ? "selected" : ""}>Stage</option>
               </select>
           </div>
           <div style="flex:2; min-width:140px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Description / Suffix</label>
               <input type="text" class="stage-suffix" list="${datalistId}" value="${suffix}" placeholder="e.g. (on a bolster)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
               <datalist id="${datalistId}">${suffixes.map(s => `<option value="${s}">`).join("")}</datalist>
           </div>
           <div style="min-width:100px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Shorthand</label>
               <input type="text" class="stage-short" value="${existingShorthand}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="display:flex; align-items:flex-end; padding-bottom:2px;">
               <button type="button" class="tiny warn remove-stage-btn">✕ Remove</button>
           </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Short Hold (s)</label>
               <input type="number" class="stage-hold-short" min="0" value="${holdShort}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Standard Hold (s)</label>
               <input type="number" class="stage-hold-standard" min="0" value="${holdStd}" style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Long Hold (s)</label>
               <input type="number" class="stage-hold-long" min="0" value="${holdLong}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
        </div>
        <div>
           <label class="muted" style="font-size:0.75rem;">Technique</label>
           <textarea class="stage-tech" style="height:60px; padding:6px; width:100%; font-family:inherit; border:1px solid #ccc; border-radius:4px;">${existingTech}</textarea>
        </div>
    `;

    div.querySelector(".remove-stage-btn").onclick = () => div.remove();
    container.appendChild(div);
};

// Apply UI Interactivity on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    if ($("asanaEditorCloseBtn")) $("asanaEditorCloseBtn").onclick = () => $("asanaEditorBackdrop").style.display = "none";
    if ($("addStageBtn")) $("addStageBtn").onclick = () => addStageToEditor();

    if ($("asanaEditorSaveBtn")) {
        $("asanaEditorSaveBtn").onclick = async () => {
            const rawId = $("editAsanaId").value.trim();
            if (!rawId) return alert("ID is required.");
            const id = rawId.padStart(3, '0');

            const snap = window._asanaEditorSnapshot;
            if (snap) {
                const currentStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
                const current = {
                    name: $("editAsanaName").value,
                    iast: $("editAsanaIAST").value,
                    english_name: $("editAsanaEnglish").value,
                    technique: $("editAsanaTechnique").value,
                    plate_numbers: $("editAsanaPlates").value,
                    requires_sides: $("editAsanaRequiresSides").checked,
                    page_2001: $("editAsanaPage2001").value,
                    page_2015: $("editAsanaPage2015").value,
                    intensity: $("editAsanaIntensity").value,
                    note: $("editAsanaNote").value,
                    category: $("editAsanaCategory").value,
                    description: $("editAsanaDescription").value,
                    holdStd: $("editAsanaHoldStandard")?.value,
                    holdShort: $("editAsanaHoldShort")?.value,
                    holdLong: $("editAsanaHoldLong")?.value,
                    stageCount: currentStageCount
                };
                
                const stageCountChanged = currentStageCount !== (window._asanaEditorOriginalStageCount ?? snap.stageCount);
                const currentStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
                    key: div.querySelector(".stage-key")?.value || "",
                    short: div.querySelector(".stage-short")?.value || "",
                    tech: div.querySelector(".stage-tech")?.value || "",
                    holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
                    holdShort: div.querySelector(".stage-hold-short")?.value || "",
                    holdLong: div.querySelector(".stage-hold-long")?.value || ""
                }));
                const originalStageData = window._asanaEditorOriginalStageData || [];
                const stageDataChanged = JSON.stringify(currentStageData) !== JSON.stringify(originalStageData);
                const fieldsUnchanged = Object.keys(snap).every(k => snap[k] === current[k]);

                if (!stageCountChanged && !stageDataChanged && fieldsUnchanged) {
                    $("asanaEditorStatus").textContent = "No changes made.";
                    $("asanaEditorStatus").style.color = "#888";
                    setTimeout(() => { $("asanaEditorStatus").textContent = ""; }, 2500);
                    return;
                }
            }

            const btn = $("asanaEditorSaveBtn");
            btn.disabled = true;
            btn.textContent = "Saving...";
            
            let userId = null;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                userId = user?.id;
            } catch (e) { console.warn("User ID fetch failed:", e.message); }

            const asanaHoldStr = buildHoldString(
                parseInt($("editAsanaHoldStandard")?.value || "30", 10),
                parseInt($("editAsanaHoldShort")?.value || "15", 10),
                parseInt($("editAsanaHoldLong")?.value || "60", 10)
            );

            const baseAsana = asanaLibrary[id] || {};

            const asanaData = {
                id: id,
                user_id: userId,
                name: $("editAsanaName").value.trim(),
                iast: $("editAsanaIAST").value.trim(),
                english_name: $("editAsanaEnglish").value.trim(),
                technique: $("editAsanaTechnique").value.trim(),
                plate_numbers: $("editAsanaPlates").value.trim(),
                requires_sides: $("editAsanaRequiresSides").checked,
                page_2001: $("editAsanaPage2001").value.trim() || null,
                page_2015: $("editAsanaPage2015").value.trim() || null,
                intensity: $("editAsanaIntensity").value.trim() || null,
                note: $("editAsanaNote").value.trim(),
                category: formatCategoryName($("editAsanaCategory").value.trim()),
                description: $("editAsanaDescription").value.trim(),
                image_url: baseAsana.image_url || null,
                hold: asanaHoldStr
            };

            try {
                // Save Main Asana
                if (supabase && userId) {
                    const { error: asanaErr } = await supabase
                        .from('user_asanas')
                        .upsert(asanaData, { onConflict: 'id' });
                    if (asanaErr) throw new Error(asanaErr.message);

                    // Process Variations
                    const stageDivs = $("stagesContainer").querySelectorAll(".stage-row");
                    const localVariations = {};

                    for (const div of stageDivs) {
                        const key = div.querySelector(".stage-key").value.trim();
                        if (!key) continue;
                        
                        const pfx = div.querySelector(".stage-prefix")?.value.trim() || "Modified";
                        const sfx = div.querySelector(".stage-suffix")?.value.trim() || "";
                        const holdStr = buildHoldString(
                            parseInt(div.querySelector(".stage-hold-standard")?.value || "30", 10),
                            parseInt(div.querySelector(".stage-hold-short")?.value || "15", 10),
                            parseInt(div.querySelector(".stage-hold-long")?.value || "60", 10)
                        );
                        const dbId = div.dataset.dbId || "";

                        const baseVariation = (baseAsana.variations && baseAsana.variations[key]) ? baseAsana.variations[key] : {};

                        const payload = {
                            user_id: userId,
                            asana_id: id,
                            stage_name: key,
                            title: sfx ? `${pfx} ${key} ${sfx}` : `${pfx} ${key}`,
                            full_technique: div.querySelector(".stage-tech")?.value.trim() || null,
                            shorthand: div.querySelector(".stage-short")?.value.trim() || null,
                            image_url: baseVariation.image_url || null,
                            hold: holdStr
                        };

                        if (dbId && dbId.includes('-')) {
                            await supabase.from('user_stages').update(payload).eq('id', dbId);
                        } else {
                            const { data: newRow } = await supabase.from('user_stages').insert(payload).select().single();
                            if (newRow) div.dataset.dbId = newRow.id;
                        }

                        localVariations[key] = {
                            title: payload.title,
                            shorthand: payload.shorthand,
                            full_technique: payload.full_technique,
                            hold: holdStr,
                            hold_data: parseHoldTimes(holdStr),
                            isCustom: true
                        };
                    }

                    // Update local memory
                    asanaLibrary[id] = {
                        ...asanaLibrary[id],
                        ...asanaData,
                        english: asanaData.english_name,
                        hold_data: parseHoldTimes(asanaData.hold),
                        variations: { ...asanaLibrary[id].variations, ...localVariations },
                        isCustom: true
                    };

                    $("asanaEditorStatus").textContent = "✓ Saved Successfully!";
                    setTimeout(() => {
                        $("asanaEditorBackdrop").style.display = "none";
                        btn.disabled = false;
                        btn.textContent = "Save Asana";
                        if (window.showAsanaDetail) showAsanaDetail(asanaLibrary[id]);
                    }, 1000);
                }
            } catch (e) {
                console.error(e);
                alert("Error saving: " + e.message);
                btn.disabled = false;
                btn.textContent = "Save Asana";
            }
        };
    }
});

// --- DYNAMIC HELPERS ---
function getNextAsanaId() {
    if (typeof asanaLibrary === 'undefined') return "001";
    let next = 1;
    while (asanaLibrary[String(next).padStart(3, '0')]) {
        next++;
    }
    return String(next).padStart(3, '0');
}

function getUniqueCategories() {
    const cats = new Set();
    if (typeof asanaLibrary !== 'undefined') {
        Object.values(asanaLibrary).forEach(a => {
            if (a.category) cats.add(a.category.trim());
        });
    }
    return Array.from(cats).sort();
}
function getDisplayCategory(cat) {
    if (!cat) return "";
    return cat.replace(/^\d+_/, '').replace(/_/g, ' ');
}

function formatCategoryName(inputCat) {
    if (!inputCat) return "";
    const cleanInput = inputCat.trim().replace(/\s+/g, '_');
    const existingCats = getUniqueCategories();
    
    if (existingCats.includes(inputCat)) return inputCat;
    
    const match = existingCats.find(c => c.replace(/^\d+_/, '').toLowerCase() === cleanInput.toLowerCase());
    if (match) return match; 
    
    let maxPrefix = 0;
    existingCats.forEach(c => {
        const m = c.match(/^(\d+)_/);
        if (m && parseInt(m[1], 10) > maxPrefix) maxPrefix = parseInt(m[1], 10);
    });
    
    const nextPrefix = String(maxPrefix + 1).padStart(2, '0');
    return `${nextPrefix}_${cleanInput}`;
}


// 4. APP STARTUP (Auth-Gated)
// console.log("Script parsed. Attempting startup...");

function showApp() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("mainAppContainer").style.display = "";
    if (!window.appInitialized) {
        init();
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
                options: { 
                    redirectTo: window.location.origin + window.location.pathname,
                    queryParams: {
                        prompt: "select_account"
                    }
                }
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

safeListen("editCourseCloseBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open");
});

safeListen("editCourseCancelBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open");
});
safeListen("editCourseSaveBtn", "click", () => {
   if (!asanaLibrary || Object.keys(asanaLibrary).length === 0) {
      alert("Library is still loading. Please wait.");
      return;
   }
   builderSave();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthListeners);
} else {
    setupAuthListeners();
}

// #endregion
