import { builderState } from '../store/builderState.js';
import { getTargetInsertionIndex, clearBuilderSelection } from './builder.js';
import { $, showError, safeListen, normaliseText, setStatus } from '../utils/dom.js';
import { prefersIAST, setIASTPref, formatHMS, displayName } from '../utils/format.js';
import { supabase } from '../services/supabaseClient.js';
import { themeManager } from './themeToggle.js';
import { normalizePlate } from '../services/dataAdapter.js';
import { playbackEngine } from '../playback/timer.js';
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from './historyModal.js';
import { builderRender, openEditCourse, builderOpen, addPoseToBuilder, createRepeatGroup, openLinkSequenceModal } from './builder.js';
// ── Application State Aliases ────────────────────────────────────────────────
// ── UI Constants ─────────────────────────────────────────────────────────────
const EMPTY_STATE_HTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 20px; text-align:center; color:#86868b;">
        <div style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;">🧘</div>
        <h3 style="margin: 0 0 8px 0; color:#1d1d1f; font-weight: 600;">Ready for Practice</h3>
        <p style="margin: 0; font-size: 0.9rem; max-width: 250px;">Choose a sequence from the dropdown above to begin.</p>
    </div>
`;
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
        
        // Reset granular progress so we don't carry over completion data to the new sequence
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();

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
            if (!getCurrentSequence()) return showError("Please select a sequence first.");
            openEditCourse(); 
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
        // 1. Stop the clock to freeze the Timer Pill
        if (typeof window.stopTimer === 'function') {
            window.stopTimer();
        }
        const seqSelect = document.getElementById("sequenceSelect");
    if (seqSelect) {
        seqSelect.value = ""; // Visually clears the dropdown
        seqSelect.dispatchEvent(new Event('change')); // Triggers app-wide reset logic
    }

        // 2. The UI Manifest (Verified against index.html)
        const uiResetManifest = {
            "poseTimer":            ["–", "text"],
            "timeRemainingDisplay": ["--:--", "text"],
            "timeTotalDisplay":     ["--:--", "text"],
            "statusText":           ["Ready to Start", "text"], // Changed from Session Reset for better UX
            "poseName":             ["", "text"],
            "poseLabel":            ["", "text"], 
            "poseShorthand":        ["", "html"],
            "glossaryArea":         ["", "html"],
            "poseMeta":             ["", "html"],
            "debugSmall":           ["", "html"],
            "poseInstructions":     ["", "html"],
            "activeCategoryTitle":  ["", "html"],
            "poseAsanaDescBody":    ["", "html"],
            "poseTechniqueBody":    ["", "html"]
        };

        // 3. Execution Loop
        Object.entries(uiResetManifest).forEach(([id, [value, type]]) => {
            const el = document.getElementById(id);
            if (el) {
                if (type === "text") el.textContent = value;
                else el.innerHTML = value;
                
                // Hide specific elements that shouldn't be visible when empty
                if (["poseLabel", "poseShorthand", "glossaryArea", "activeCategoryTitle"].includes(id)) {
                    el.style.display = "none";
                }
            }
        });

        // 4. Clean up "Jobsian" Accordions & Wrappers
        const infoStack = document.getElementById("poseInfoStack");
        const descDetails = document.getElementById("poseAsanaDescDetails");
        const techDetails = document.getElementById("poseTechniqueDetails");
        
        if (infoStack) infoStack.style.display = "none";
        
        if (descDetails) {
            descDetails.style.display = "none"; 
            descDetails.open = false; // Reset state
        }
        if (techDetails) {
            techDetails.style.display = "none";
            techDetails.open = false; // Reset state
        }

        // 5. Clean up Images and Progress
        const collageWrap = document.getElementById("collageWrap");
        if (collageWrap) {
            // Restore your "Ready for Practice" screen
            collageWrap.innerHTML = typeof EMPTY_STATE_HTML !== "undefined" ? EMPTY_STATE_HTML : "";
        }

        // 🛑 6. THE ENGINE FLUSH (Fixes the "Lock Up" bug)
        // This ensures the next sequence you select doesn't collide with the old one
        window.activePlaybackList = null;
        window._lastBoundaryIdx = -1;
        window.currentSequence = null;
        window.currentIndex = 0;
        window.needsSecondSide = false;
        
        // Reset the start button text
        const startBtn = document.getElementById("startStopBtn");
        if (startBtn) startBtn.textContent = "Start";
        
        console.log("Session Reset Complete: Engine Flushed");
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
        const input = $('linkSequenceInput');
        const repsInp = $('linkSequenceReps');
        const overlay = $('linkSequenceOverlay');
        const title = (input?.value || '').trim();
        const reps = parseInt(repsInp?.value || '1', 10) || 1;
        
        if (!title) return showError('Please select or type a sequence name.'); 
        
        const exists = (window.courses || []).find(c => c.title.trim().toLowerCase() === title.toLowerCase());
        if (!exists) return showError('Sequence not found. Choose from the list.'); 
        
        const newMacro = {
            id: `MACRO:${exists.id}`,
            name: `[Sequence] ${exists.title}`, 
            duration: reps,
            variation: '',
            note: `Linked Sequence: ${reps} Round${reps !== 1 ? 's' : ''}`
        };

        // 🛑 BLIND SPOT 6: Check if we are SWAPPING an existing macro or ADDING a new one
        const swapIdx = builderState.activeMacroSwapIdx;
        if (swapIdx !== undefined && swapIdx >= 0) {
            builderState.poses[swapIdx] = newMacro;
            builderState.activeMacroSwapIdx = -1; // Reset
        } else {
            // Standard Insert
            const insertAt = getTargetInsertionIndex(); 
            addPoseToBuilder(newMacro, insertAt);
        }

        clearBuilderSelection(); // 👈 Uncheck boxes
        builderRender();
        
        if (overlay) overlay.style.display = 'none';
        const activeEl = document.activeElement;
        if (activeEl && typeof activeEl.blur === 'function') activeEl.blur();
    });

    safeListen("builderAddBlank", "click", () => {
        const insertAt = getTargetInsertionIndex();
        
        addPoseToBuilder({
            id: "", 
            asana_id: null,
            duration: 30,
            variation: "",
            metadata: {}
        }, insertAt);
        
        clearBuilderSelection(); // 👈 Uncheck boxes
        builderRender();
        
        setTimeout(() => {
            const tbody = document.getElementById("builderTableBody");
            const targetRow = insertAt >= 0 
                ? tbody.querySelector(`tr[data-idx="${insertAt}"]`) 
                : tbody.lastElementChild;
            if (targetRow) targetRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
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
    
    // Inject the empty state once before showing the app
    const collageWrap = $("collageWrap");
    if (collageWrap && !collageWrap.innerHTML.trim()) {
        collageWrap.innerHTML = EMPTY_STATE_HTML;
    }

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

    // Auth Fix: Error Handling for Sign Out
    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            try {
                const emailSpan = $('userEmailDisplay');
                if (emailSpan) { emailSpan.textContent = ''; emailSpan.style.display = 'none'; }
                window.isGuestMode = false;
                
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                
            } catch (err) {
                console.error("Sign out failed:", err.message);
                showError("Sign out failed. Please refresh the page.");
            }
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

// Add to wiring.js
const mainResetBtn = document.getElementById('resetBtn');
if (mainResetBtn) {
    mainResetBtn.addEventListener('click', () => {
        // 1. Log incomplete session (if > 5 secs)
        const focusDuration = window.playbackEngine?.activePracticeSeconds || 0;
        if (focusDuration > 5 && typeof window.appendServerHistory === "function") {
            const title = window.currentSequence?.title || "Unknown Sequence";
            const category = window.currentSequence?.category || null;
            window.appendServerHistory(title, new Date(), category, focusDuration, 'incomplete').catch(console.error);
        }

        // 2. Wipe the granular completion tracker 
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
        
        // 3. Reset the engine's active wall-clock timer
        if (window.playbackEngine && typeof window.playbackEngine.resetPracticeTimer === 'function') {
            window.playbackEngine.resetPracticeTimer();
        }
        
        // 4. Stop playback
        if (typeof window.stopTimer === 'function') window.stopTimer();
        
        // 5. Instantly flush the UI progress bar
        const bar = document.getElementById("timeProgressFill");
        if (bar) {
            bar.style.width = "0%";
            bar.style.backgroundColor = "#ffccbc";
        }
        const remDisp = document.getElementById("timeRemainingDisplay");
        if (remDisp) remDisp.textContent = "--:--";
        
        // 6. Reset UI to Pose 0 using your exact render function
        if (typeof window.setPose === 'function') window.setPose(0);
        if (typeof window.updateNextBtnText === 'function') window.updateNextBtnText();
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