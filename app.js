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
import { findAsanaByIdOrPlate } from "./src/services/dataAdapter.js?v=19";
import "./src/ui/wiring.js?v=23"; // 👈 Core UI Wiring & Listeners
import { builderOpen, openEditCourse } from "./src/ui/builder.js?v=23";

// UI Renderers
import { 
    updatePoseNote, 
    updatePoseAsanaDescription, 
    updatePoseDescription, 
    loadUserPersonalNote, 
    descriptionForPose 
} from "./src/ui/renderers.js?v=23";

// Extracted UI modules (side-effects: registers functions on window)
import "./src/ui/browse.js";
import "./src/ui/asanaEditor.js";
import "./src/ui/durationDial.js";
import "./src/ui/courseUI.js";


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
} from "./src/store/state.js?v=23";

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

import { getCurrentAudio, setCurrentAudio, playFaintGong, detectSide, playSideCue, playAsanaAudio, playPoseMainAudio } from "./src/playback/audioEngine.js?v=23";

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
        } else {
            window.completionHistory = {};
        }
    } catch (e) {
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
} from "./src/services/historyService.js?v=23";

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
window.getActivePlaybackList = getActivePlaybackList;
window.getCurrentSide = getCurrentSide;

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

    // 2. Unpack Loops
    let finalExpanded = [];
    let loopBuffer = [];
    let inLoop = false;
    let loopCount = 1;
    
    expanded.forEach(p => {
        const idStr = String(p[0]);
        if (idStr === "LOOP_START") {
            if (inLoop) {
                for (let i = 0; i < loopCount; i++) {
                    finalExpanded.push(...loopBuffer.map(bp => [...bp]));
                }
            }
            inLoop = true;
            loopCount = Number(p[1]) || 1;
            loopBuffer = [];
        } else if (idStr === "LOOP_END") {
            if (inLoop) {
                inLoop = false;
                for (let i = 0; i < loopCount; i++) {
                    finalExpanded.push(...loopBuffer.map(bp => [...bp]));
                }
                loopBuffer = [];
            }
        } else {
            if (inLoop) {
                loopBuffer.push(p);
            } else {
                finalExpanded.push(p);
            }
        }
    });
    
    if (inLoop) {
        for (let i = 0; i < loopCount; i++) {
            finalExpanded.push(...loopBuffer.map(bp => [...bp]));
        }
    }

    return finalExpanded;
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
                playAsanaAudio(asana, null, true, null, matchedVariationKey); 
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
         playAsanaAudio(asana, baseOverrideName, false, globalState.currentSide, matchedVariationKey); 
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

// (nextBtn/prevBtn/startStopBtn wiring already in src/ui/wiring.js)

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
// (Duration Dial functions removed — now in src/ui/durationDial.js)



// (historyLink wiring already in src/ui/wiring.js)

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

// --------------------------------------------------------------------------
// End of Region 9. Sections moved to modular files in src/ui/
// --------------------------------------------------------------------------
// (Asana Editor removed — now in src/ui/asanaEditor.js)
// (Auth startup removed — now in src/ui/wiring.js)
// #endregion
