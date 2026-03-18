// -----------------------------------------------------------------------------
// TODO: [MODULE REFACTOR ARCHITECTURE]
// This file serves as the central nervous system binding the UI to the logic.
// In the next refactor phase, we must extract these domains into dedicated modules:
// 1. Auth Logic -> src/services/authService.js
// 2. Playback/Timer UI Bindings -> src/ui/playbackUI.js
// 3. Dropdown/Sequence Selection -> src/ui/sequenceSelector.js
// -----------------------------------------------------------------------------

import { $, showError, safeListen, normaliseText, setStatus } from '../utils/dom.js';
import { prefersIAST, setIASTPref, formatHMS, displayName } from '../utils/format.js';
import { supabase } from '../services/supabaseClient.js';
import { themeManager } from './themeToggle.js';
import { normalizePlate } from '../services/dataAdapter.js';
import { playbackEngine } from '../playback/timer.js';
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from './historyModal.js?v=29';
import { builderRender, builderSave, openEditCourse, builderOpen, addPoseToBuilder, processSemicolonCommand, openLinkSequenceModal, createRepeatGroup } from './builder.js?v=29';

// ── Application State Aliases ────────────────────────────────────────────────
const getActivePlaybackList = () => window.activePlaybackList;
const getCurrentSequence = () => window.currentSequence;
const getAsanaIndex = () => Object.values(window.asanaLibrary || {}).filter(Boolean);

/** Update the Next button text: "Complete ▶" on last pose, "Next ▶" otherwise */
window.updateNextBtnText = function updateNextBtnText() {
    const nextBtn = document.getElementById('nextBtn');
    if (!nextBtn) return;
    
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0)
        ? window.activePlaybackList
        : (window.currentSequence?.poses || []);
        
    const isLast = poses.length > 0 && window.currentIndex >= poses.length - 1;
    nextBtn.textContent = isLast ? 'Complete ▶' : 'Next ▶';
};

// ── 1. Sequence Selection & Dynamic Buttons ──────────────────────────────────
function setupSequenceSelector() {
    const seqSelect = $("sequenceSelect");
    if (!seqSelect) return;

    seqSelect.addEventListener("change", () => {
        const idx = seqSelect.value;
        if (typeof window.stopTimer === "function") window.stopTimer(); 
        
        if (!idx) {
            window.currentSequence = null;
            window.activePlaybackList = [];
            window.currentIndex = 0;
            
            if ($("poseName"))         $("poseName").textContent = "Select a sequence";
            if ($("poseMeta"))         $("poseMeta").textContent = "";
            if ($("poseInstructions")) $("poseInstructions").textContent = "";
            if ($("poseTimer"))        $("poseTimer").textContent = "–";
            if ($("statusText"))       $("statusText").textContent = "Select a sequence";
            if ($("collageWrap"))      $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`;
            
            const _tp = document.querySelector(".time-content");
            if (_tp) _tp.innerHTML = `<span id="timeRemainingDisplay">--:--</span><span class="time-sep">/</span><span id="timeTotalDisplay">--:--</span>`;
            if (typeof window.updateActiveCategoryTitle === 'function') window.updateActiveCategoryTitle();
            return;
        }

        const rawSequence = window.courses[parseInt(idx, 10)];
        window.currentSequence = rawSequence; 

        // Reset active-practice timer so duration only counts this session
        playbackEngine.resetPracticeTimer();

        if (typeof window.getExpandedPoses === "function") {
            window.activePlaybackList = window.getExpandedPoses(rawSequence);
        } else {
            window.activePlaybackList = rawSequence.poses ? [...rawSequence.poses] : [];
        } 

        if (typeof window.applyDurationDial === 'function') window.applyDurationDial();
        if (typeof window.updateDialUI === 'function') window.updateDialUI();
        if (typeof window.updateTotalAndLastUI === 'function') window.updateTotalAndLastUI();
        if (typeof window.updateActiveCategoryTitle === 'function') window.updateActiveCategoryTitle();

        window.currentIndex = 0; 
        if (typeof window.setPose === "function") window.setPose(0);
        window.updateNextBtnText();
        
        if ($("statusText")) $("statusText").textContent = "Ready to Start"; 
        if ($("startStopBtn")) $("startStopBtn").textContent = "Start";
    });

    if (!document.getElementById("quickEditBtn")) {
        const editBtn = document.createElement("button");
        editBtn.id = "quickEditBtn";
        
        // Use standard text instead of weird emojis
        editBtn.innerHTML = "Review"; 
        editBtn.title = "Review / Edit Sequence";
        editBtn.className = "tiny";
        
        // Normal button styling (matching the + New button)
        editBtn.style.cssText = "margin-left: 8px; padding: 4px 12px; font-size: 0.9rem; font-weight: 600; border-radius: 8px;";
        
        seqSelect.parentNode.insertBefore(editBtn, seqSelect.nextSibling);
        
        editBtn.onclick = () => {
            if (!getCurrentSequence()) return alert("Select a sequence first.");
            openEditCourse(); // Opens in View Mode
        };

        const newBtn = document.createElement("button");
        newBtn.id = "newSequenceBtn";
        newBtn.textContent = "+ New";
        newBtn.className = "tiny";
        newBtn.style.cssText = "margin-left: 4px; padding: 4px 10px; font-weight: 600;";
        editBtn.parentNode.insertBefore(newBtn, editBtn.nextSibling);
        newBtn.onclick = () => builderOpen("new", null); // Opens directly into Edit Mode
    }
}

// ── 2. Playback & Dial Wiring ────────────────────────────────────────────────
function setupPlaybackControls() {
    safeListen("nextBtn", "click", () => { window.stopTimer(); window.nextPose(); window.updateNextBtnText(); });
    safeListen("prevBtn", "click", () => { window.stopTimer(); window.prevPose(); window.updateNextBtnText(); });
    
    safeListen("startStopBtn", "click", () => {
        if (!getCurrentSequence()) return;
        if (!playbackEngine.running) window.startTimer();
        else window.stopTimer();
    });
    
    safeListen("resetBtn", "click", () => {
        window.stopTimer();
        localStorage.removeItem("lastPlayedSequence");
        localStorage.removeItem("currentPoseIndex");
        localStorage.removeItem("timeLeft");
        
        const dropdown = $("sequenceSelect");
        if (dropdown) dropdown.value = ""; 
        window.currentSequence = null;
        window.currentIndex = 0;
        
        if ($("poseName")) $("poseName").innerText = "Select a sequence";
        if ($("poseTimer")) $("poseTimer").innerText = "–";
        if ($("statusText")) $("statusText").textContent = "Session Reset";
    });

    // Mobile Duration Dial Reset
    const resetText = document.getElementById("dialResetBtn");
    if (resetText) {
        const performReset = (e) => {
            const dial = document.getElementById("durationDial");
            if (!dial) return;
            if (e.cancelable) e.preventDefault(); 
            dial.value = 50;
            dial.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof window.updateDialUI === "function") window.updateDialUI();
        };
        resetText.addEventListener("touchend", performReset, { passive: false });
        resetText.addEventListener("click", performReset);
    }
}

// ── 3. Builder Modal Wiring ──────────────────────────────────────────────────
function setupBuilderWiring() {
    safeListen("btnOpenLinkModal", "click", openLinkSequenceModal);
    
    safeListen("btnConfirmLink", "click", () => {
        const input = document.getElementById('linkSequenceInput');
        const repsInp = document.getElementById('linkSequenceReps');
        const overlay = document.getElementById('linkSequenceOverlay');
        const title = (input?.value || '').trim();
        const reps = parseInt(repsInp?.value || '1', 10) || 1;
        
        if (!title) return alert('Please select or type a sequence name.'); 
        
        const exists = (window.courses || []).find(c => c.title.trim().toLowerCase() === title.toLowerCase());
        if (!exists) return alert('Sequence not found. Choose from the list.'); 
        
        addPoseToBuilder({
            id: `MACRO:${exists.title}`,
            name: `[Sequence] ${exists.title}`,
            duration: reps,
            variation: '',
            note: `Linked Sequence: ${reps} Round${reps !== 1 ? 's' : ''}`
        });
        
        if (overlay) overlay.style.display = 'none';
    });

    safeListen("btnGroupRepeat", "click", (e) => {
        e.preventDefault();
        createRepeatGroup();
    });

    safeListen("editCourseBtn", "click", openEditCourse);
    
    const closeBuilderModal = () => {
        $("editCourseBackdrop").style.display = "none"; 
        document.body.classList.remove("modal-open");
    };
    
    safeListen("editCourseCloseBtn", "click", closeBuilderModal);
    safeListen("editCourseCancelBtn", "click", closeBuilderModal);

    safeListen("builderAddBlank", "click", () => {
        addPoseToBuilder({ id: "", name: "", englishName: "", duration: 30, variation: "", note: "" });
    });
}

// ── 4. UI Extras (IAST, History) ─────────────────────────────────────────────
function setupUIExtras() {
    safeListen("iastToggleBtn", "click", () => {
        setIASTPref(!prefersIAST());
        if (getCurrentSequence()) window.setPose(window.currentIndex);
    });

    safeListen("lastCompletedPill", "click", () => {
        if (!getCurrentSequence()) return alert("Please select a sequence first.");
        openHistoryModal("current");
    });

    safeListen("historyLink", "click", (e) => {
        e.preventDefault();
        if (typeof window.toggleHistoryPanel === 'function') window.toggleHistoryPanel();
    });
}

// ── 5. Auth & Initialization ─────────────────────────────────────────────────
function showApp() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("mainAppContainer").style.display = "";
    if (!window.appInitialized && window.init) window.init();
}

function showLogin() {
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("mainAppContainer").style.display = "none";
}

function setupAuthListeners() {
    const googleBtn = document.getElementById("googleSignInBtn");
    const guestBtn = document.getElementById("guestSignInBtn");
    const signOutBtn = document.getElementById("signOutBtn");

    if (googleBtn) {
        googleBtn.onclick = async () => {
            googleBtn.disabled = true;
            await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: "select_account" } }
            });
        };
    }

    if (guestBtn) {
        guestBtn.onclick = async () => {
            guestBtn.disabled = true;
            guestBtn.textContent = 'Starting guest session…';

            const { error } = await supabase.auth.signInAnonymously();

            if (error) {
                console.error('Anonymous sign-in failed:', error.message);
                const errEl = document.getElementById('loginError');
                if (errEl) {
                    errEl.textContent = `Guest sign-in failed: ${error.message}`;
                    errEl.style.display = 'block';
                }
                guestBtn.disabled = false;
                guestBtn.textContent = 'Continue as Guest';
            }
        };
    }

    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            const emailSpan = document.getElementById('userEmailDisplay');
            if (emailSpan) { emailSpan.textContent = ''; emailSpan.style.display = 'none'; }
            window.isGuestMode = false;
            await supabase.auth.signOut();
        };
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            window.currentUserId = session.user.id;
            themeManager.setUserId(session.user.id);

            const isAnon = session.user.is_anonymous === true;
            window.isGuestMode = isAnon;
            window.currentUserEmail = isAnon ? null : (session.user.email || null);

            const emailSpan = document.getElementById('userEmailDisplay');
            if (emailSpan) {
                if (isAnon) {
                    emailSpan.textContent = '👤 Guest';
                    emailSpan.style.cssText = 'font-size:0.75rem; color:#f57f17; font-weight:600; margin-right:10px; display:inline;';
                } else {
                    emailSpan.textContent = session.user.email;
                    emailSpan.style.cssText = 'font-size:0.75rem; color:#888; margin-right:10px; display:inline;';
                }
            }

            showApp();
        } else if (!window.isGuestMode) {
            showLogin();
        }
    });
}

// ── Global Bootstrapper ──────────────────────────────────────────────────────
function initWiring() {
    setupAuthListeners();
    setupSequenceSelector();
    setupPlaybackControls();
    setupBuilderWiring();
    setupUIExtras();
    
    // Global exports for external access where strictly necessary
    window.createRepeatGroup = createRepeatGroup;
    window.openLinkSequenceModal = openLinkSequenceModal;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWiring);
} else {
    initWiring();
}