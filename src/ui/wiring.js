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
        
    // ARCHITECT FIX: Only show 'Complete' if it's the last pose AND no second side is pending.
    const isLastIndex = poses.length > 0 && window.currentIndex >= poses.length - 1;
    const isFinalStep = isLastIndex && !window.needsSecondSide;
    nextBtn.textContent = isFinalStep ? 'Complete ▶' : 'Next ▶';
};

/** Updates UI notifications for Aliases and Remedial Notes */
function updateAliasUIFeedback() {
    let notifyArea = document.getElementById("aliasNotificationArea");
    let remedialArea = document.getElementById("remedialNoteArea");
    const poseName = document.getElementById("poseName");
    const focusPoseName = document.getElementById("focusPoseName");
    const contentDisplay = document.getElementById("pose-content-display");
    const infoStack = document.getElementById("poseInfoStack");
    const metaArea = document.getElementById("poseMeta");
    const collageWrap = document.getElementById("collageWrap");
    const playerHeader = document.querySelector(".player-header");

    const fallbackNotes = 'Welcome to your practice. Work within your limits. Ensure props are ready and the space is clear. Press Start to begin.';
    
    // Correctly reference the imported playbackEngine if window.playbackEngine isn't set yet
    const engine = window.playbackEngine || playbackEngine;
    const isSessionActive = (engine && engine.activePracticeSeconds > 5) || window.currentIndex > 0 || (typeof window.getCompletionTracker === 'function' && Object.values(window.getCompletionTracker()).some(v => v > 0));
    const isSwitching = window.pendingSequence && isSessionActive;

    // 2. Universal Briefing & Remedial Callout (Now visible by default for all sequences)
    if (window.isBriefingActive) {
        if (!remedialArea) {
            const stage = document.createElement("div");
            stage.className = "briefing-stage";
            stage.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; z-index:10001; background:rgba(255,255,255,0.98); align-items:center; justify-content:center; padding: 20px; box-sizing: border-box; overflow-y: auto;";
            remedialArea = document.createElement("div");
            remedialArea.id = "remedialNoteArea";
            // Standardize centering and width
            remedialArea.style.cssText = "width:100%; max-width:800px; margin:auto; box-sizing:border-box; flex-shrink: 0;";
            const playerTop = document.querySelector(".player-header") || document.getElementById("poseName")?.parentNode;
            if (playerTop) {
                stage.appendChild(remedialArea);
                playerTop.parentNode.insertBefore(stage, playerTop);
            }
        }

        const displaySeq = window.pendingSequence || window.currentSequence;
        const activeNotes = (displaySeq?.condition_notes || window.remedialNote || '').trim() || fallbackNotes;

        let breadcrumbHtml = "";
        if (isSwitching) {
            breadcrumbHtml = `
                <div style="background:#f2f2f7; padding:8px 16px; border-radius:12px; margin-bottom:1.5rem; font-size:0.85rem; color:#6e6e73; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px; border:1px solid #d2d2d7;">
                    <span>⏸ Session Paused: ${window.currentSequence?.title}</span>
                    <span style="opacity:0.3;">•</span>
                    <span>Step ${window.currentIndex + 1}</span>
                </div>`;
        }

        const stage = remedialArea.parentNode;

        if (true) {
            // 1. Briefing "Cover" Mode Card
            if (stage) stage.style.display = "flex";
            
            const sequenceName = (window.pendingSequence || window.currentSequence)?.title || "Sequence";
            const masterSub = window.isAliasView ? `<div style="font-size: 0.9rem; color: #86868b; margin-top: 4px; font-weight: 500;">Protocol: ${window.masterCourseTitle}</div>` : "";

            remedialArea.innerHTML = `
                <div class="briefing-card-content" style="width: 100%; box-sizing: border-box;">
                    ${breadcrumbHtml}
                    <div style="margin-bottom: 2rem;">
                        <h1 style="margin: 0; font-size: 1.8rem; font-weight: 700; color: #1d1d1f;">${sequenceName}</h1>
                        ${masterSub}
                    </div>
                    <div style="color: #e65100; font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 1rem;">
                        <span style="font-size: 1.4rem;">⚕️</span> Safety Briefing
                    </div>
                    <div style="width: 100%;">
                        <p style="margin: 0; line-height: 1.7; color: #1d1d1f; font-weight: 500; text-align: center;">${activeNotes}</p>
                    </div>
                    <div style="margin-top: 2rem; font-size: 0.9rem; color: #86868b; font-weight: 600; border-top: 1px solid #f2f2f7; padding-top: 1.5rem; width: 100%;">
                        Press <span class='briefing-link' onclick='handleStart()'>Start</span> to begin, or the <span class='briefing-link' onclick='handleNext()'>Next</span> button to browse sequence.
                    </div>
                </div>`;
            
            // Component Isolation & Cleanup: Hide underlying Asana UI components
            if (poseName) poseName.style.display = 'none';
            if (focusPoseName) focusPoseName.style.display = 'none';
            if (contentDisplay) contentDisplay.style.display = 'none';
            else {
                if (collageWrap) collageWrap.style.display = 'none';
                if (playerHeader) playerHeader.style.display = 'none';
            }
            if (infoStack) infoStack.style.display = 'none';
            if (metaArea) metaArea.style.display = 'none';
            
            remedialArea.style.display = "block";
        }
    } else {
        // 2. Dismiss Briefing and show Asana
        if (remedialArea) remedialArea.style.display = "none";
        if (remedialArea && remedialArea.parentNode) remedialArea.parentNode.style.display = "none";
        if (poseName) poseName.style.display = '';
        if (focusPoseName) focusPoseName.style.display = '';
        const contentDisplay = document.getElementById("pose-content-display");
        if (contentDisplay) {
            contentDisplay.style.display = 'block';
        } else {
            if (collageWrap) collageWrap.style.display = 'block';
            if (playerHeader) playerHeader.style.display = 'block';
        }
        if (metaArea) metaArea.style.display = '';
    }

    // 1. Alias Notice (Only show if NOT in briefing mode)
    if (window.isAliasView && window.masterCourseTitle && !window.isBriefingActive) {
        if (!notifyArea) {
            notifyArea = document.createElement("div");
            notifyArea.id = "aliasNotificationArea";
            notifyArea.style.cssText = "background:#e3f2fd; color:#0d47a1; padding:10px; border-radius:8px; margin-bottom:12px; font-size:0.9rem; border:1px solid #bbdefb; display:none;";
            const playerTop = document.querySelector(".player-header") || document.getElementById("poseName")?.parentNode;
            if (playerTop) playerTop.prepend(notifyArea);
        }
        notifyArea.innerHTML = `ℹ️ Displaying protocol for <strong>${window.masterCourseTitle}</strong>`;
        notifyArea.style.display = "block";
    } else if (notifyArea) {
        notifyArea.style.display = "none";
    }
}

window.applySequenceInternal = (seq) => {
    if (typeof window.getExpandedPoses === "function") {
        window.activePlaybackList = window.getExpandedPoses(seq);
    } else {
        window.activePlaybackList = seq.poses ? [...seq.poses] : [];
    } 

    if (typeof window.applyDurationDial === 'function') window.applyDurationDial();
    if (typeof window.updateDialUI === 'function') window.updateDialUI();
    if (typeof window.updateTotalAndLastUI === 'function') window.updateTotalAndLastUI();
    if (typeof window.updateActiveCategoryTitle === 'function') window.updateActiveCategoryTitle();

    window.currentIndex = 0; 
    if (typeof window.setPose === "function") window.setPose(0);
};

window.applyPendingSequence = () => {
    if (window.pendingSequence) {
        window.currentSequence = window.pendingSequence;
        window.applySequenceInternal(window.currentSequence);
        window.pendingSequence = null;
    }
};

window.syncSequenceSelector = () => {
    const sel = $("sequenceSelect");
    if (sel && window.currentSequence) {
        const idx = (window.courses || []).findIndex(c => c.title === window.currentSequence.title);
        if (idx !== -1) sel.value = String(idx);
    }
};

/** Internal helper to reset to briefing if applicable */
function checkAndRestoreBriefing() {
    if (window.currentIndex === 0 && window.remedialNote) {
        window.isBriefingActive = true;
        updateAliasUIFeedback();
        return true;
    }
    return false;
}

// ── 1. Sequence Selection & Dynamic Buttons ──────────────────────────────────
function setupSequenceSelector() {
    const seqSelect = $("sequenceSelect");
    
    if (!seqSelect) return;

    seqSelect.addEventListener("change", () => {
        const idx = seqSelect.value;
        if (typeof window.stopTimer === "function") window.stopTimer(); 
        
        // Reset granular progress so we don't carry over completion data to the new sequence
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
        
        // Clear Alias/Remedial state
        window.isAliasView = false;
        window.masterCourseTitle = null;
        window.remedialNote = "";
        window.isBriefingActive = false;

        if (!idx) {
            window.currentSequence = null;
            window.activePlaybackList = [];
            window.currentIndex = 0;
            
            updateAliasUIFeedback();

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
        
        // --- RECURSIVE ALIAS RESOLUTION ---
        let resolvedSequence = { ...rawSequence };

        if (rawSequence.is_alias) {
            const master = (window.courses || []).find(c => 
                String(c.supabaseId || c.id) === String(rawSequence.redirect_id)
            );

            if (!master || !rawSequence.redirect_id) {
                showError("Missing Master Link: The master sequence for this alias could not be found.");
                seqSelect.value = "";
                seqSelect.dispatchEvent(new Event('change'));
                return;
            }

            // Resolve Data: Use master content while maintaining Alias metadata
            resolvedSequence.poses = master.poses;
            resolvedSequence.sequence_json = master.sequence_json;
            resolvedSequence.playbackMode = master.playbackMode;

            window.isAliasView = true;
            window.masterCourseTitle = master.title;
            // Prioritize condition_notes from Alias record
            window.remedialNote = rawSequence.condition_notes || master.condition_notes || "";
        } else {
            window.remedialNote = rawSequence.condition_notes || "";
        }

        const engine = window.playbackEngine || playbackEngine;
        const isSessionActive = (engine && engine.activePracticeSeconds > 5) || window.currentIndex > 0 || (typeof window.getCompletionTracker === 'function' && Object.values(window.getCompletionTracker()).some(v => v > 0));
        
        // Universal Briefing: Always enabled on load
        window.isBriefingActive = true;

        if (isSessionActive && window.currentSequence && window.currentSequence.title !== resolvedSequence.title) {
            // Keep current session in background, treat this as a "preview" briefing
            window.pendingSequence = resolvedSequence;
        } else {
            window.pendingSequence = null;
            window.currentSequence = resolvedSequence;
            window.remedialNote = resolvedSequence.condition_notes || "";
            if (engine) engine.resetPracticeTimer();
            window.applySequenceInternal(resolvedSequence);
        }
        updateAliasUIFeedback();
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
    safeListen("nextBtn", "click", () => { 
        if (window.isBriefingActive) {
            window.isBriefingActive = false;
            updateAliasUIFeedback();
            return; // Dismiss briefing to reveal first pose
        }
        window.stopTimer(); window.nextPose(); window.updateNextBtnText(); 
    });
    safeListen("prevBtn", "click", () => { window.stopTimer(); window.prevPose(); window.updateNextBtnText(); });
    
    safeListen("startStopBtn", "click", () => {
        if (!getCurrentSequence()) return;
        if (window.isBriefingActive) {
            window.isBriefingActive = false;
            updateAliasUIFeedback();
        }

        if (!playbackEngine.running) window.startTimer();
        else window.stopTimer();
    });
    safeListen("resetBtn", "click", () => {
        // 1. Stop the clock to freeze the Timer Pill
        if (typeof window.stopTimer === 'function') {
            window.stopTimer();
        }
        
        // If on step 0, clicking reset should ideally just show the briefing again
        if (window.currentIndex === 0 && checkAndRestoreBriefing()) {
            return;
        }

        // 🛡️ ARCHITECT FIX 1: Wipe the engine's internal duration memory for the next sequence
        if (window.playbackEngine && typeof window.playbackEngine.resetPracticeTimer === 'function') {
            window.playbackEngine.resetPracticeTimer();
        }
        
        // 🛡️ ARCHITECT FIX 2: Wipe the localStorage save file so "Resume" doesn't trigger on refresh
        if (typeof window.clearProgress === 'function') {
            window.clearProgress();
        }
        
        // 🛡️ ARCHITECT FIX 3: Wipe the local completion tracker memory
        if (typeof window.resetCompletionTracker === 'function') {
            window.resetCompletionTracker();
        }
        window.completionTracker = {}; 

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
            "statusText":           ["Ready to Start", "text"],
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
            descDetails.open = false; 
        }
        if (techDetails) {
            techDetails.style.display = "none";
            techDetails.open = false; 
        }

        // 5. Clean up Images and Progress
        const collageWrap = document.getElementById("collageWrap");
        if (collageWrap) {
            collageWrap.innerHTML = typeof EMPTY_STATE_HTML !== "undefined" ? EMPTY_STATE_HTML : "";
        }

        // 🛑 6. THE ENGINE FLUSH (Fixes the "Lock Up" bug)
        window.activePlaybackList = null;
        window._lastBoundaryIdx = -1;
        window.currentSequence = null;
        window.currentIndex = 0;
        window.needsSecondSide = false;
        
        // Reset the start button text
        const startBtn = document.getElementById("startStopBtn");
        if (startBtn) startBtn.textContent = "Start";
        
        console.log("🛠️ Architect: Session Reset Complete. Engine, UI, and Save State Flushed.");
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
        // If we are currently in a sequence, check if we should just show briefing
        if (window.currentSequence && window.currentIndex === 0 && window.remedialNote) {
            window.isBriefingActive = true;
            updateAliasUIFeedback();
        }

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

        window.remedialNote = "";
        window.isBriefingActive = false;
        updateAliasUIFeedback();
    });
}

// ── Global Bootstrapper ──────────────────────────────────────────────────────
function initWiring() {
    // Ensure engine and UI functions are globally accessible across modules
    window.playbackEngine = playbackEngine;
    window.updateAliasUIFeedback = updateAliasUIFeedback;

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