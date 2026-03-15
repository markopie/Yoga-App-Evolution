// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & CONSTANTS
   ========================================================================== */

import {
    MANIFEST_URL,
    ASANA_LIBRARY_URL,
    LIBRARY_URL,
    ID_ALIASES_URL,
    AUDIO_BASE,
    COMPLETION_LOG_URL,
    LOCAL_SEQ_KEY,
} from "./src/config/appConfig.js";
import { fetchCourses, loadAsanaLibrary, normalizeAsana, normalizeAsanaRow, normalizePlate, parsePlates, normaliseAsanaId, findAsanaByIdOrPlate } from "./src/services/dataAdapter.js?v=29";
import { supabase } from "./src/services/supabaseClient.js";
import { loadJSON } from "./src/services/http.js";
import { $, normaliseText, safeListen, setStatus, showError, enterBrowseDetailMode, exitBrowseDetailMode } from "./src/utils/dom.js";
import { parseHoldTimes, buildHoldString } from "./src/utils/parsing.js";
import { prefersIAST, setIASTPref, displayName, escapeHtml2, renderMarkdownMinimal, formatHMS, formatTechniqueText } from "./src/utils/format.js";
import { playbackEngine } from "./src/playback/timer.js";
import { parsePlateTokens, plateFromFilename, primaryAsanaFromFilename, filenameFromUrl, mobileVariantUrl, ensureArray, isBrowseMobile, smartUrlsForPoseId } from "./src/utils/helpers.js";

import "./src/ui/wiring.js?v=29"; // 👈 Core UI Wiring & Listeners
import { getExpandedPoses } from "./src/services/sequenceEngine.js";
import { getEffectiveTime, calculateTotalSequenceTime } from "./src/utils/sequenceUtils.js";
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
import "./src/ui/zenSearch.js";
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




window.nextPose = nextPose;
window.prevPose = prevPose;

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
    window.appInitialized = true; // Prevents the fallback from running twice
    try {
        const statusEl = $("statusText");

        // 1. Core Config
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
        if (typeof window.setupZenSearch === "function") window.setupZenSearch();

        // 5. Finalize
        if (statusEl) statusEl.textContent = "Ready";
        const loadText = $("loadingText");
        if (loadText) loadText.textContent = "Select a practice to begin";
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
window.init                 = init;
window.getActivePlaybackList = getActivePlaybackList;
window.getCurrentSide       = getCurrentSide;
// getExpandedPoses implementation → src/services/sequenceEngine.js


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
                    if (typeof playAsanaAudio === "function") {
                        // isSecondSide: getCurrentSide() is set by nextPose() before start() is called,
                        // so 'left' = second side of a requires_sides asana.
                        const side = window.getCurrentSide ? window.getCurrentSide() : null;
                        const isSecondSide = side === "left" && !!(asana.requiresSides || asana.requires_sides);
                        playAsanaAudio(asana, poses[currentIndex][4] || "", false, side, window.currentVariationKey || null, isSecondSide);
                    }
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

function triggerSequenceEnd() {
    stopTimer();
    
    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    // 90% completion gate: check if user completed enough of the sequence
    const totalSeqTime = calculateTotalSequenceTime(currentSequence);
    // ── Use activePracticeSeconds (wall-clock, paused time excluded) ──────────
    const focusDuration = playbackEngine.activePracticeSeconds || 0;
    
    // Skip gate if timer was never started (user just skipped through)
    if (focusDuration === 0) {
        // Timer never ran — silently allow (no rating) or just return
        const ratingOverlay = document.getElementById("ratingOverlay");
        if (ratingOverlay) ratingOverlay.style.display = "none";
        return;
    }
    
    const completionRatio = totalSeqTime > 0 ? focusDuration / totalSeqTime : 1;
    
    if (completionRatio < 0.9 && totalSeqTime > 60) {
        // User hasn't completed enough
        const pct = Math.round(completionRatio * 100);
        const needed = Math.round(totalSeqTime * 0.9);
        const got = Math.round(focusDuration);
        const needMore = needed - got;
        const mm = Math.floor(needMore / 60);
        const ss = needMore % 60;
        const timeStr = mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
        
        const msg = `You've completed ${pct}% of this sequence's timed practice.\n\n` +
            `Keep going — ${timeStr} more to reach 90% to record this session.`;
        
        setTimeout(() => alert(msg), 100);
        return;
    }

    const ratingOverlay = document.getElementById("ratingOverlay");
    if (ratingOverlay && ratingOverlay.style.display !== "flex") {
        ratingOverlay.style.display = "flex";
        
        const title = currentSequence.title || "Unknown Sequence";
        const category = currentSequence.category || null;
        
        ratingOverlay.dataset.sessionId = "";
        
        if (typeof appendServerHistory === "function") {
            // ── Use activePracticeSeconds — precise active play time only ─────
            const finalDuration = playbackEngine.activePracticeSeconds || 0;
            console.log(`📊 Practice duration: ${finalDuration}s (active play only, paused time excluded)`);
            appendServerHistory(title, new Date(), category, finalDuration).then(resultId => {
                if (resultId && resultId !== true && typeof resultId !== "boolean") {
                    ratingOverlay.dataset.sessionId = resultId;
                }
            }).catch(console.error);
        }
    }
}

playbackEngine.onTransitionStart = (secs) => {
    const overlay = document.getElementById("transitionOverlay");
    const countdownEl = document.getElementById("transitionCountdown");
    const nextPoseEl = document.getElementById("transitionNextPose");
    const msgEl = document.querySelector("#transitionOverlay .transition-msg");

    if (!overlay) { 
        nextPose(); 
        playbackEngine.start(); 
        return; 
    }

    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) ? window.activePlaybackList : (currentSequence?.poses || []);
    let previewName = "";
    let mainMsg = "Release from the pose and prepare";
    
    // Formatting helper for prep/rec IDs like "020II"
    const formatTransitionPose = (rawId) => {
        if (!rawId) return "";
        const cleanId = String(rawId).trim().replace(/\|/g, "").replace(/\s+/g, "");
        const parsed = cleanId.match(/^(\d+)(.*)$/);
        if (!parsed) return cleanId;
        
        const num = parsed[1].padStart(3, "0");
        const varSuffix = parsed[2] ? parsed[2].toUpperCase() : "";
        
        const asanaObj = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(num) : null;
        let baseName = asanaObj ? (typeof displayName === "function" ? displayName(asanaObj) : (asanaObj.english || asanaObj.name)) : `Pose ${num}`;
        
        if (varSuffix && varSuffix !== "NULL") {
            return `${baseName} (Stage ${varSuffix})`;
        }
        return baseName;
    };

    // Are we merely transitioning to the second side of the CURRENT pose?
    if (typeof needsSecondSide !== "undefined" && needsSecondSide) {
        mainMsg = "Release from the pose and prepare for the other side";
        if (nextPoseEl) nextPoseEl.textContent = "Next: the other side";
    } else {
        const nextIdx = currentIndex + 1;
        
        if (nextIdx >= poses.length) {
            triggerSequenceEnd();
            return;
        } else {
            const np = poses[nextIdx];
            const id = Array.isArray(np[0]) ? np[0][0] : np[0];
            const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
            
            previewName = asana ? (typeof displayName === "function" ? displayName(asana) : (asana.english || asana.name)) : "";
            
            // Check for Recovery and Preparatory Poses
            let transitionTarget = null;
            
            // 1. Current pose recovery?
            const currentP = poses[currentIndex];
            const currId = Array.isArray(currentP[0]) ? currentP[0][0] : currentP[0];
            const currAsana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(currId)) : null;
            const currKey = window.currentVariationKey;
            
            if (currAsana) {
                let recovery = currAsana.recovery_pose_id;
                if (currKey && currAsana.variations && currAsana.variations[currKey] && currAsana.variations[currKey].recovery_pose_id) {
                    recovery = currAsana.variations[currKey].recovery_pose_id;
                }
                if (recovery && recovery !== "NULL" && recovery !== "null") {
                    transitionTarget = `Recovery: ${formatTransitionPose(recovery)}`;
                }
            }
            
            // 2. Next pose preparatory? (If no recovery pose dictates the transition)
            if (!transitionTarget && asana) {
                let prep = asana.preparatory_pose_id;
                
                // Attempt to see if next pose has a variation set that overrides the prep pose...
                let nextKeyMatch = [np[2], np[3], np[4]].filter(Boolean).join(" ").trim().match(/\[(.*?)\]/);
                let nextKey = nextKeyMatch ? nextKeyMatch[1].trim() : (np[3] || "");
                
                if (nextKey && asana.variations) {
                    const cleanNk = nextKey.toLowerCase().trim();
                    for (const [vk, vd] of Object.entries(asana.variations)) {
                        const vtitle = (vd.title || vd.Title || "").toLowerCase().trim();
                        if (vk.toLowerCase() === cleanNk || vtitle.includes(cleanNk)) {
                            if (vd.preparatory_pose_id) prep = vd.preparatory_pose_id;
                            break;
                        }
                    }
                }
                
                if (prep && prep !== "NULL" && prep !== "null") {
                    transitionTarget = `Preparation: ${formatTransitionPose(prep)}`;
                }
            }
            
            if (transitionTarget) {
                mainMsg = `Release from the pose and prepare for ${transitionTarget}`;
                if (nextPoseEl) nextPoseEl.textContent = `Next: ${previewName}`;
            } else {
                mainMsg = `Release from the pose and prepare for ${previewName}`;
                if (nextPoseEl) nextPoseEl.textContent = `Next: ${previewName}`;
            }
        }
    }
    
    if (msgEl) msgEl.textContent = mainMsg;

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
        // Use activePlaybackList to get the accurate (expanded) list
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0)
            ? window.activePlaybackList
            : (currentSequence.poses || []);

        // Total time = sum of actual durations in activePlaybackList (respects duration dial)
        const totalSeconds = poses.reduce((acc, p) => {
            const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
            const strId = String(rawId || "");
            // Skip structural markers
            if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) {
                return acc;
            }
            return acc + (Number(p[1]) || 0);
        }, 0);

        let secondsLeft = remaining;

        if (typeof needsSecondSide !== "undefined" && needsSecondSide && poses[currentIndex]) {
             secondsLeft += (Number(poses[currentIndex][1]) || 0);
        }

        for (let i = currentIndex + 1; i < poses.length; i++) {
            const rawId = Array.isArray(poses[i][0]) ? poses[i][0][0] : poses[i][0];
            const strId = String(rawId || "");
            // Skip structural markers
            if (strId.startsWith("MACRO:") || strId.startsWith("LOOP_END") || strId.startsWith("LOOP_START")) {
                continue;
            }
            secondsLeft += (Number(poses[i][1]) || 0);
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

// calculateTotalSequenceTime → src/utils/sequenceUtils.js

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
        triggerSequenceEnd();
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
        // Reset consecutive-bridge state when we go back to the first pose
        // (new sequence selected or playback reset). Not in onStart — that fires per-pose.
        if (idx === 0 && typeof resetBridgeState === "function") resetBridgeState();
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
  const labelEl = document.getElementById("poseLabel");
  
  if (labelEl) {
      if (currentPose[6]) {
          labelEl.textContent = currentPose[6];
          labelEl.style.display = "flex";
      } else {
          labelEl.style.display = "none";
      }
  }

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

    // 7. TECHNIQUE UI (shown directly in poseInstructions, no collapsible wrapper)
    const textContainer = document.getElementById("poseInstructions");
    if (textContainer) {
        if (displayTechnique && typeof formatTechniqueText === 'function') {
            textContainer.style.display = "block";
            
            // Prepend variation title in bold if a variation is active
            let techniqueHTML = formatTechniqueText(displayTechnique);
            if (variationTitle) {
                techniqueHTML = `<div style="font-weight:600; color:#333; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #ddd;">${variationTitle} Instructions:</div>` + techniqueHTML;
            }

            textContainer.innerHTML = techniqueHTML;
        } else {
            textContainer.style.display = "none";
            textContainer.innerHTML = "";
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

        // Get range from library for reference
        const hj = asana?.hold_json || asana?.hold_data;
        let rangeText = "";
        if (hj && hj.short && hj.long) {
            rangeText = `Range: ${hj.short}s\u2013${hj.long}s`;
        } else if (hj && hj.standard) {
            rangeText = `~${hj.standard}s`;
        }

        // Show ID and Range only — sequence duration is no longer relevant here
        infoSpan.textContent = rangeText 
            ? `ID: ${lookupId} \u2022 ${rangeText}` 
            : `ID: ${lookupId}`;
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
    const overlayLabel = document.getElementById("focusPoseLabel");
    const overlayImageWrap = document.getElementById("focusImageWrap");
    
    if (overlayName && nameEl) overlayName.innerHTML = nameEl.innerHTML; // Sync Name + Variation Span
    
    if (overlayLabel) {
        if (currentPose[6]) {
            overlayLabel.textContent = currentPose[6];
            overlayLabel.style.display = "inline-block"; // or flex depending on your centering
        } else {
            overlayLabel.style.display = "none";
        }
    }
    
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
    window.currentVariationKey = matchedVariationKey;
    if (playbackEngine.running && asana) {
        // isSecondSide: getCurrentSide() is already set to 'left' by nextPose() before
        // setPose() is called. Using this (rather than keepSamePose) correctly handles
        // the prevPose() case which also uses keepSamePose=true when going back to right.
        const isSecondSide = getCurrentSide() === "left" && !!(asana.requiresSides || asana.requires_sides);
        playAsanaAudio(asana, baseOverrideName, false, getCurrentSide(), matchedVariationKey, isSecondSide);
    }
}

// Export for Wiring
window.setPose = setPose;

// updateTotalAndLastUI → src/ui/statsUI.js (imported above; window binding done there)


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
