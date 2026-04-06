// #region 1. STATE & CONSTANTS
import { supabase } from "./src/services/supabaseClient.js";
import { fetchCourses, loadAsanaLibrary, normalizeAsana, normalizePlate, findAsanaByIdOrPlate } from "./src/services/dataAdapter.js";
import { themeManager } from "./src/ui/themeToggle.js";
import { $, safeListen } from "./src/utils/dom.js";
import { parseHoldTimes } from "./src/utils/parsing.js"; 
import { displayName, formatHMS } from "./src/utils/format.js";
import { playbackEngine } from "./src/playback/timer.js";
import { smartUrlsForPoseId } from "./src/utils/helpers.js";
import { getExpandedPoses } from "./src/services/sequenceEngine.js";
import { getEffectiveTime, getPosePillTime, calculateTotalSequenceTime } from "./src/utils/sequenceUtils.js";
import { updatePoseNote, updatePoseAsanaDescription, updatePoseDescription, descriptionForPose } from "./src/ui/renderers.js";
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from "./src/ui/historyModal.js";

import "./src/ui/browse.js";
import "./src/ui/asanaEditor.js";
import "./src/ui/durationDial.js";
import "./src/ui/courseUI.js";
import "./src/ui/wiring.js"; 

window.db = supabase;
window.currentUserId = null;

Object.assign(window, {
    parseHoldTimes, formatHMS, displayName, updatePoseNote, updatePoseAsanaDescription, 
    updatePoseDescription, descriptionForPose, openHistoryModal, switchHistoryTab, renderGlobalHistory
});

import { globalState, setCourses, setSequences, setActivePlaybackList, setCurrentSequence, setCurrentIndex, setCurrentSide, setNeedsSecondSide } from "./src/store/state.js";

['courses', 'sequences', 'asanaLibrary', 'activePlaybackList', 'currentSequence', 'currentIndex', 'currentSide', 'needsSecondSide'].forEach(prop => {
    Object.defineProperty(window, prop, {
        get: () => globalState[prop],
        set: (v) => { globalState[prop] = v; },
        configurable: true
    });
});

let wakeLock = null;
let wakeLockVisibilityHooked = false;
// #endregion

// #region 2. SYSTEM & AUDIO
async function enableWakeLock() {
    try {
        if (!("wakeLock" in navigator) || wakeLock) return;
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });

        if (!wakeLockVisibilityHooked) {
            wakeLockVisibilityHooked = true;
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible" && playbackEngine.running) {
                    enableWakeLock();
                }
            });
        }
    } catch (_err) {
        wakeLock = null;
    }
}

async function disableWakeLock() {
    try {
        if (wakeLock) await wakeLock.release();
    } catch (_err) { }
    wakeLock = null;
}

import { playPoseMainAudio } from "./src/playback/audioEngine.js";

Object.assign(window, { enableWakeLock, disableWakeLock, playPoseMainAudio });
// #endregion

// #region 3. HELPERS & FORMATTING
function getAsanaIndex() {
    const library = window.asanaLibrary;
    if (!library) return [];
    return Object.keys(library).map(id => normalizeAsana(id, library[id])).filter(Boolean);
}

function urlsForPlateToken(p) {
    return smartUrlsForPoseId(p);
}

function resolveId(id) {
    const norm = normalizePlate(id);
    if (typeof window.idAliases !== 'undefined' && window.idAliases && window.idAliases[norm]) {
        return normalizePlate(window.idAliases[norm]); 
    }
    return norm; 
}

Object.assign(window, { getAsanaIndex, urlsForPlateToken, resolveId });
// #endregion

// #region 4. DATA LOADING
window.loadCourses = async function() {
    try {
        if (typeof fetchCourses !== "function") throw new Error("fetchCourses service not initialized.");
        const deduplicated = await fetchCourses(window.currentUserId);
        
        window.courses = deduplicated;
        setCourses(deduplicated);
        setSequences(deduplicated);

        if (typeof window.renderSequenceDropdown === "function") {
            window.renderSequenceDropdown();
        }
    } catch (err) {
        console.error("Failed to load courses:", err);
    }
};
// #endregion

// #region 5. HISTORY & LOGGING
import { safeGetLocalStorage, safeSetLocalStorage, fetchServerHistory, appendServerHistory, seedManualCompletionsOnce, updateCompletionRating } from "./src/services/historyService.js";

const RESUME_STATE_KEY = "yoga_resume_state_v2";

/** Saves current sequence and pose index for session recovery. */
function saveCurrentProgress() {
    if (!window.currentSequence) return;
    
    // 🛡️ ARCHITECT GUARD: Do not auto-save if the user is on the completion screen!
    const ratingOverlay = document.getElementById("ratingOverlay");
    if (ratingOverlay && ratingOverlay.style.display !== "none") {
        return; // Abort the save. The session is already over.
    }

    // 1. Fetch the active tracker data
    const trackerData = typeof window.getCompletionTracker === 'function' 
        ? window.getCompletionTracker() 
        : (window.completionTracker || {});

    // 2. Fetch the new active millisecond tracker
    const activeMs = window.playbackEngine 
        ? (window.playbackEngine._activePracticeMs || (window.playbackEngine.activePracticeSeconds * 1000) || 0)
        : 0;
    
    const state = {
        sequenceIdx: document.getElementById("sequenceSelect")?.value || "",
        poseIdx: window.currentIndex,
        sequenceTitle: window.currentSequence.title,
        focusDuration: activeMs,
        completionTracker: trackerData,
        timestamp: Date.now()
    };
    
    if (typeof safeSetLocalStorage === 'function') {
        safeSetLocalStorage("yoga_resume_state_v2", state);
    } else {
        try { localStorage.setItem("yoga_resume_state_v2", JSON.stringify(state)); } catch(e){}
    }
}

function clearProgress() {
    try { localStorage.removeItem(RESUME_STATE_KEY); } catch (_err) {}
}

function showResumePrompt(state) {
    const banner = document.createElement("div");
    banner.id = "resumeBanner";
    banner.style.cssText = `position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: #333; color: #fff; padding: 12px 20px; border-radius: 30px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; gap: 15px; align-items: center; font-size: 14px;`;
    
    const seq = window.sequences && window.sequences[state.sequenceIdx];
    const seqName = seq ? seq.title : "your previous session";
    
    let poseName = `pose ${state.poseIdx + 1}`;
    if (seq?.poses) {
        const poses = typeof window.getExpandedPoses === "function" ? window.getExpandedPoses(seq) : seq.poses;
        const targetPose = poses[state.poseIdx];
        if (targetPose) {
            const rawId = Array.isArray(targetPose[0]) ? targetPose[0][0] : targetPose[0];
            const asana = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(window.normalizePlate(rawId)) : null;
            if (asana) poseName = typeof window.displayName === "function" ? window.displayName(asana) : (asana.english || asana.name);
        }
    }
    
    banner.innerHTML = `<span>Resume <b>${seqName}</b> at <b>${poseName}</b>?</span><button id="resumeYes" style="background:#4CAF50; color:white; border:none; padding:5px 12px; border-radius:15px; cursor:pointer;">Yes</button><button id="resumeNo" style="background:transparent; color:#ccc; border:none; cursor:pointer;">✕</button>`;
    document.body.appendChild(banner);

    banner.querySelector("#resumeYes").onclick = () => {
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            sel.value = state.sequenceIdx;
            sel.dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                if (window.currentSequence && typeof window.setPose === "function") {
                    if (state.focusDuration && window.playbackEngine) {
                        window.playbackEngine._activePracticeMs = state.focusDuration;
                        if (typeof window.playbackEngine.syncTimer === 'function') window.playbackEngine.syncTimer();
                    }
                    if (state.completionTracker) {
                        window.completionTracker = state.completionTracker;
                        if (typeof window.setCompletionTracker === 'function') {
                            window.setCompletionTracker(state.completionTracker);
                        }
                    }
                    window.setPose(state.poseIdx);
                }
                banner.remove();
            }, 500); 
        }
    };

    banner.querySelector("#resumeNo").onclick = () => {
        if (typeof window.clearProgress === 'function') window.clearProgress();
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
        window.completionTracker = {}; 
        banner.remove();
    };
}

Object.assign(window, { saveCurrentProgress, clearProgress, showResumePrompt, fetchServerHistory, appendServerHistory, updateCompletionRating, seedManualCompletionsOnce });

window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveCurrentProgress();
});
window.addEventListener("pagehide", saveCurrentProgress);
// #endregion

// #region 6. CORE PLAYER LOGIC
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
        await fetchServerHistory();

        if (statusEl) statusEl.textContent = "Initializing player...";
        await Promise.all([
            import("./src/playback/timerEvents.js"),
            import("./src/ui/posePlayer.js"),
            import("./src/ui/progressSummaryUI.js")
        ]);
        
        if (typeof window.setupProgressSummary === 'function') window.setupProgressSummary();
        if (typeof setupBrowseUI === "function") window.setupBrowseUI();
        if (typeof updateDialUI === 'function') window.updateDialUI();

        if (statusEl) statusEl.textContent = "Ready";
        if (loadText) loadText.textContent = "Select a course";

        const state = safeGetLocalStorage("yoga_resume_state_v2", null);
        const fourHours = 4 * 60 * 60 * 1000;
        
        if (state?.timestamp && (Date.now() - state.timestamp < fourHours)) {
            if (state.poseIdx >= 0 && typeof showResumePrompt === "function") showResumePrompt(state);
        } else {
            clearProgress();
        }
    } catch (err) {
        console.error("Init Error:", err);
        if (statusEl) statusEl.textContent = "Error loading app data";
    }
}

import { getActivePlaybackList, getCurrentSide, getCurrentSequence } from "./src/store/state.js";

Object.assign(window, {
    init, getActivePlaybackList, getCurrentSide, getCurrentSequence, findAsanaByIdOrPlate,
    getExpandedPoses, playbackEngine, setCurrentIndex, setCurrentSide, setNeedsSecondSide,
    setCurrentSequence, setActivePlaybackList, normalizePlate, smartUrlsForPoseId,
    getEffectiveTime, getPosePillTime, calculateTotalSequenceTime
});
// #endregion

// #region 9. WIRING UP UI ELEMENTS
safeListen("completeBtn", "click", async () => {
    if (!window.currentSequence) return;

    const tracker = typeof window.getCompletionTracker === 'function' ? window.getCompletionTracker() : {};
    const practiced = Object.values(tracker).reduce((acc, val) => acc + Number(val), 0);

    if (practiced < 30) {
        alert(`Practice for at least 30 seconds before marking complete. (Current: ${Math.round(practiced)}s)`);
        return;
    }

    const btn = $("completeBtn");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const title = window.currentSequence.title || "Unknown Sequence";
        const category = window.currentSequence.category || null;
        const sessionId = await appendServerHistory(title, new Date(), category, Math.round(practiced));

        alert("Sequence Completed and Logged!");
        const ratingOverlay = document.getElementById("ratingOverlay");
        
        if (ratingOverlay) {
            ratingOverlay.dataset.sessionId = sessionId || "fallback-id";
            ratingOverlay.style.setProperty('display', 'flex', 'important');
        }
    } catch (e) {
        console.error("Completion error:", e);
        alert("Error saving progress. Check console.");
        const ratingOverlay = document.getElementById("ratingOverlay");
        if (ratingOverlay) ratingOverlay.style.setProperty('display', 'flex', 'important');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

const setupRatingButtons = () => {
    const ratingButtons = document.querySelectorAll(".rating-btn");
    const overlay = document.getElementById("ratingOverlay");

    ratingButtons.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            
            const sessionId = overlay?.dataset.sessionId;
            const rating = parseInt(btn.dataset.rating, 10);
            
            if (!sessionId) {
                if (overlay) overlay.style.display = "none";
                return;
            }

            ratingButtons.forEach(b => b.style.opacity = "0.3");
            btn.style.opacity = "1";
            btn.style.transform = "scale(1.1)";

            try {
                if (sessionId !== "fallback-id" && typeof window.updateCompletionRating === "function") {
                    await window.updateCompletionRating(sessionId, rating);
                }
            } catch (err) {
                console.error("Rating Phase 2 Failed:", err);
            } finally {
                if (overlay) {
                    overlay.style.display = "none";
                    delete overlay.dataset.sessionId; 
                }
                const resetBtn = document.getElementById("resetBtn");
                if (resetBtn) resetBtn.click();
                
                ratingButtons.forEach(b => {
                    b.style.opacity = "";
                    b.style.transform = "";
                });
            }
        });
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupRatingButtons);
} else {
    setupRatingButtons();
}
// #endregion