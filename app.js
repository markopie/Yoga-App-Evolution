// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & MODULE IMPORTS
   ========================================================================== */

// 1. Core Services & Data
import { supabase } from "./src/services/supabaseClient.js";
import { 
    fetchCourses, 
    loadAsanaLibrary, 
    normalizeAsana, 
    normalizePlate, 
    findAsanaByIdOrPlate 
} from "./src/services/dataAdapter.js";

// 2. UI Framework & Utilities
import { themeManager } from "./src/ui/themeToggle.js";
import { $, safeListen } from "./src/utils/dom.js";
import { parseHoldTimes } from "./src/utils/parsing.js"; 
import { displayName, formatHMS } from "./src/utils/format.js"; // 👈 RESTORED: These were missing
import { playbackEngine } from "./src/playback/timer.js";
import { smartUrlsForPoseId } from "./src/utils/helpers.js";

// 3. Timing & Sequence Engine
import { getExpandedPoses } from "./src/services/sequenceEngine.js";
import { 
    getEffectiveTime, 
    getPosePillTime, 
    calculateTotalSequenceTime 
} from "./src/utils/sequenceUtils.js";

// 4. UI Renderers (Imported to be bound to window)
import { 
    updatePoseNote, 
    updatePoseAsanaDescription, 
    updatePoseDescription, 
    descriptionForPose 
} from "./src/ui/renderers.js";

import { 
    openHistoryModal, 
    switchHistoryTab, 
    renderGlobalHistory 
} from "./src/ui/historyModal.js";

// 5. Side-effect imports: these register window-level listeners/functions
import "./src/ui/browse.js";
import "./src/ui/asanaEditor.js";
import "./src/ui/durationDial.js";
import "./src/ui/courseUI.js";
import "./src/ui/wiring.js"; 

/* ==========================================================================
   GLOBAL BINDINGS & PROXIES
   ========================================================================== */

window.db = supabase;
window.currentUserId = null;

// Bind utilities to window for legacy support and cross-module access
Object.assign(window, {
    parseHoldTimes,
    formatHMS,
    displayName,
    updatePoseNote,
    updatePoseAsanaDescription,
    updatePoseDescription,
    descriptionForPose,
    openHistoryModal,
    switchHistoryTab,
    renderGlobalHistory
});

import { 
    globalState, 
    setCourses, 
    setSequences, 
    setActivePlaybackList, 
    setCurrentSequence, 
    setCurrentIndex, 
    setCurrentSide, 
    setNeedsSecondSide
} from "./src/store/state.js";

// Map globalState properties to window for direct access within app.js
['courses', 'sequences', 'asanaLibrary', 'activePlaybackList', 'currentSequence', 'currentIndex', 'currentSide', 'needsSecondSide'].forEach(prop => {
    Object.defineProperty(window, prop, {
        get: () => globalState[prop],
        set: (v) => { globalState[prop] = v; },
        configurable: true
    });
});

let wakeLock = null;
let wakeLockVisibilityHooked = false;
// 🗑️ DELETED: 'draft' (unused)
// #endregion
// #region 2. SYSTEM & AUDIO
/* ==========================================================================
   DOM & SYSTEM UTILITIES (Wake Lock)
   ========================================================================== */

/**
 * Requests a Screen Wake Lock to prevent the device from sleeping 
 * during an active practice session.
 */
async function enableWakeLock() {
    try {
        if (!("wakeLock" in navigator) || wakeLock) return;

        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });

        // If user switches apps and returns, re-acquire the lock if the timer is running.
        if (!wakeLockVisibilityHooked) {
            wakeLockVisibilityHooked = true;
            document.addEventListener("visibilitychange", () => {
                if (document-.visibilityState === "visible" && playbackEngine.running) {
                    enableWakeLock();
                }
            });
        }
    } catch (_err) {
        // Using _err tells the linter the ignore is intentional
        wakeLock = null;
    }
}

async function disableWakeLock() {
    try {
        if (wakeLock) await wakeLock.release();
    } catch (_err) { 
        /* Ignore release errors */ 
    }
    wakeLock = null;
}

/* ==========================================================================
   AUDIO ENGINE
   ========================================================================== */

import { playPoseMainAudio } from "./src/playback/audioEngine.js";

// Bind system and audio functions to window to satisfy linter and provide global access
Object.assign(window, {
    enableWakeLock,
    disableWakeLock,
    playPoseMainAudio
});

// #endregion
// #region 3. HELPERS & FORMATTING
/* ==========================================================================
   STRING & DATA FORMATTERS
   ========================================================================== */

/**
 * Converts the Asana Library map into an array for the Browse section.
 * Required by applyBrowseFilters and renderBrowseList in browse.js.
 */
function getAsanaIndex() {
    // Reference the global window.asanaLibrary to ensure we get the latest state
    const library = window.asanaLibrary;
    if (!library) return [];
    
    return Object.keys(library).map(id => {
        // normalizeAsana is imported in Region 1
        return normalizeAsana(id, library[id]);
    }).filter(Boolean);
}

/**
 * UI Bridge: Maps legacy 'urlsForPlateToken' calls to the new 'smartUrlsForPoseId' utility.
 * Required for renderPlateSection to function without refactoring all UI templates.
 */
function urlsForPlateToken(p) {
    // smartUrlsForPoseId is imported in Region 1
    return smartUrlsForPoseId(p);
}

/* ==========================================================================
   ID & PLATE NORMALIZATION
   ========================================================================== */

/**
 * Ensures an ID is normalized (zero-padded 3 digits).
 * Maintains a safe check for legacy 'idAliases'.
 */
function resolveId(id) {
    const norm = normalizePlate(id);
    // Check if idAliases exists on window to avoid ReferenceErrors
    if (typeof window.idAliases !== 'undefined' && window.idAliases && window.idAliases[norm]) {
        return normalizePlate(window.idAliases[norm]); 
    }
    return norm; 
}

// Ensure these helpers are globally accessible to extracted UI modules
Object.assign(window, {
    getAsanaIndex,
    urlsForPlateToken,
    resolveId
});

// #endregion
// #region 4. DATA LOADING
/* ==========================================================================
   DATA LOADING & PARSING
   ========================================================================== */

/**
 * Fetches and processes courses from Supabase.
 * Updates global state and triggers the UI dropdown refresh.
 */
window.loadCourses = async function() {
    try {
        // fetchCourses is imported in Region 1
        if (typeof fetchCourses !== "function") {
            throw new Error("fetchCourses service not initialized.");
        }

        const deduplicated = await fetchCourses(window.currentUserId);
        
        // Sync state across global proxies (triggers reactivity where bound)
        window.courses = deduplicated;
        setCourses(deduplicated);
        setSequences(deduplicated);

        // Update UI if the dropdown renderer is available
        if (typeof window.renderSequenceDropdown === "function") {
            window.renderSequenceDropdown();
        }
    } catch (err) {
        // Using 'err' instead of 'e' and logging it clears the unused-vars warning
        console.error("Failed to load courses:", err);
    }
};

/**
 * ARCHITECTURE NOTE:
 * Parsing logic (normalizeAsana, parsePlates, findAsanaByIdOrPlate) 
 * is now strictly handled within src/services/dataAdapter.js.
 * Region 4 is the execution layer only.
 */

// #endregion
// #region 5. HISTORY & LOGGING
/* ==========================================================================
   HISTORY SERVICE & PERSISTENCE
   ========================================================================== */

import { 
    safeGetLocalStorage, 
    safeSetLocalStorage, 
    fetchServerHistory, 
    appendServerHistory, 
    seedManualCompletionsOnce,
    updateCompletionRating // Ensure this is imported for the rating buttons
} from "./src/services/historyService.js";

/* ==========================================================================
   RESUME STATE & PROGRESS
   ========================================================================== */

const RESUME_STATE_KEY = "yoga_resume_state_v2";

/** Saves current sequence and pose index for session recovery. */
function saveCurrentProgress() {
    // Note: currentSequence and currentIndex are managed via the window proxy in Region 1
    if (!window.currentSequence) return;
    
    const state = {
        sequenceIdx: $("sequenceSelect")?.value || "",
        poseIdx: window.currentIndex,
        sequenceTitle: window.currentSequence.title,
        focusDuration: playbackEngine.totalFocusSeconds || 0,
        timestamp: Date.now()
    };
    safeSetLocalStorage(RESUME_STATE_KEY, state);
}

/** Wipes the saved progress. */
function clearProgress() {
    try {
        localStorage.removeItem(RESUME_STATE_KEY);
    } catch (_err) {
        // Linter-friendly catch
    }
}

/**
 * UI Component: Displays a prompt to resume the previous session.
 */
function showResumePrompt(state) {
    const banner = document.createElement("div");
    banner.id = "resumeBanner";
    banner.style.cssText = `
        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
        background: #333; color: #fff; padding: 12px 20px; border-radius: 30px;
        z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        display: flex; gap: 15px; align-items: center; font-size: 14px;
    `;
    
    const seq = window.sequences && window.sequences[state.sequenceIdx];
    const seqName = seq ? seq.title : "your previous session";
    
    let poseName = `pose ${state.poseIdx + 1}`;
    if (seq?.poses) {
        const poses = typeof getExpandedPoses === "function" ? getExpandedPoses(seq) : seq.poses;
        const targetPose = poses[state.poseIdx];
        if (targetPose) {
            const rawId = Array.isArray(targetPose[0]) ? targetPose[0][0] : targetPose[0];
            const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(rawId)) : null;
            if (asana) poseName = displayName(asana);
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
            
            setTimeout(() => {
                if (window.currentSequence && typeof window.setPose === "function") {
                    if (state.focusDuration) playbackEngine.totalFocusSeconds = state.focusDuration;
                    window.setPose(state.poseIdx);
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

// Global exports
Object.assign(window, {
    saveCurrentProgress,
    clearProgress,
    showResumePrompt,
    fetchServerHistory,
    appendServerHistory,
    updateCompletionRating,
    seedManualCompletionsOnce
});

// #endregion
// #region 6. CORE PLAYER LOGIC
/* ==========================================================================
   APP INITIALIZATION (Controller)
   ========================================================================== */

/**
 * Main application entry point. Triggered by Supabase auth state change in wiring.js.
 */
async function init() {
    window.appInitialized = true;
    const statusEl = $("statusText");
    const loadText = $("loadingText");

    try {
        themeManager.init();
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();

        if (statusEl) statusEl.textContent = "Loading library...";
        window.asanaLibrary = await loadAsanaLibrary();

        if (statusEl) statusEl.textContent = "Loading courses...";
        await window.loadCourses();

        // Load History from Supabase
        await fetchServerHistory();

        // 🚀 CRITICAL: Await player modules so 'setPose' and others exist
        if (statusEl) statusEl.textContent = "Initializing player...";
        await Promise.all([
            import("./src/playback/timerEvents.js"),
            import("./src/ui/posePlayer.js")
        ]);

        if (typeof setupBrowseUI === "function") window.setupBrowseUI();
        if (typeof updateDialUI === 'function') window.updateDialUI();

        if (statusEl) statusEl.textContent = "Ready";
        if (loadText) loadText.textContent = "Select a course";

        // Resume Session Check
        const state = safeGetLocalStorage("yoga_resume_state_v2", null);
        const fourHours = 4 * 60 * 60 * 1000;
        
        if (state?.timestamp && (Date.now() - state.timestamp < fourHours)) {
            if (state.poseIdx >= 0 && typeof showResumePrompt === "function") {
                showResumePrompt(state);
            }
        } else {
            clearProgress();
        }

    } catch (err) {
        console.error("Init Error:", err);
        if (statusEl) statusEl.textContent = "Error loading app data";
    }
}

/* ==========================================================================
   FINAL GLOBAL EXPORTS (The Fix for the ReferenceError)
   ========================================================================== */

/**
 * We explicitly bind these to window one last time at the very end 
 * to ensure all modules (wiring.js, etc.) can access them.
 */
import { 
    getActivePlaybackList, 
    getCurrentSide, 
    getCurrentSequence 
} from "./src/store/state.js";

Object.assign(window, {
    init,
    getActivePlaybackList,
    getCurrentSide,
    getCurrentSequence,
    findAsanaByIdOrPlate,
    getExpandedPoses,
    playbackEngine,
    setCurrentIndex,
    setCurrentSide,
    setNeedsSecondSide,
    setCurrentSequence,
    setActivePlaybackList,
    normalizePlate,
    smartUrlsForPoseId,
    getEffectiveTime,
    getPosePillTime,
    calculateTotalSequenceTime
});

// #endregion
// #region 7. UI & BROWSING
/**
 * UI components for Sequence browsing and Course selection.
 * Implementation extracted to:
 * - src/ui/browse.js: Filter logic, Detail views, and Browse UI.
 * - src/ui/courseUI.js: Sequence dropdowns, Category filters, and Collages.
 * * Functions like setupBrowseUI() and renderSequenceDropdown() are called in Region 6 (init).
 */
// #endregion
// #region 8. ADMIN & DATA LAYER
/**
 * Note: Administrative tools (saveAsanaField, renderIdFixer) have been 
 * moved to src/ui/asanaEditor.js to keep the main app entry point lean.
 */
// #endregion

// #region 9. WIRING UP UI ELEMENTS
/* ==========================================================================
   FINAL PRACTICE LOGIC (Post-Sequence)
   ========================================================================== */

/**
 * Complete Button Logic: Ensures the user has practiced for a minimum 
 * duration before allowing them to log the sequence as 'Complete'.
 */
safeListen("completeBtn", "click", async () => {
    if (!window.currentSequence) return;

    // Gate: Prevent accidental logging if practiced for less than 30s
    const practiced = window.playbackEngine?.activePracticeSeconds || 0;
    if (practiced < 30) {
        alert("Practice for at least 30 seconds before marking complete.");
        return;
    }

    const btn = $("completeBtn");
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const title = window.currentSequence.title || "Unknown Sequence";
        const category =  window.currentSequence.category || null;
        
        // Log to Supabase via historyService.js
        const success = await appendServerHistory(title, new Date(), category);

        if (success) {
            alert("Sequence Completed and Logged!");
            // Trigger the rating overlay if your UI supports post-practice feedback
            const ratingOverlay = document.getElementById("ratingOverlay");
            if (ratingOverlay) ratingOverlay.style.display = "flex";
        }
    } catch (e) {
        console.error("Completion error:", e);
        alert("Error saving progress. Check console.");
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

/**
 * Post-Practice Rating Wiring:
 * Attaches listeners to the 1-5 rating buttons in the completion overlay.
 */
const setupRatingButtons = () => {
    document.querySelectorAll(".rating-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const overlay = document.getElementById("ratingOverlay");
            const sessionId = overlay.dataset.sessionId;
            const rating = parseInt(btn.dataset.rating, 10);
            
            if (sessionId && typeof window.updateCompletionRating === "function") {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span>Saving...</span>`;
                await window.updateCompletionRating(sessionId, rating);
                btn.innerHTML = originalHtml;
            }
            
            overlay.style.display = "none";
            const resetBtn = document.getElementById("resetBtn");
            if (resetBtn) resetBtn.click();
        });
    });
};

// Initialize rating buttons immediately or on DOM load
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupRatingButtons);
} else {
    setupRatingButtons();
}

/* ==========================================================================
   END OF app.js
   ========================================================================== */
// #endregion