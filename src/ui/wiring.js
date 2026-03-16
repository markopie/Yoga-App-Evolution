import { $, showError, safeListen, normaliseText, setStatus } from '../utils/dom.js';
import { prefersIAST, setIASTPref } from '../utils/format.js';
import { supabase } from '../services/supabaseClient.js';
import { themeManager } from './themeToggle.js';
import { normalizePlate } from '../services/dataAdapter.js';
import { playbackEngine } from '../playback/timer.js';
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from './historyModal.js?v=29';
import { builderRender, builderSave, openEditCourse, builderOpen, addPoseToBuilder, processSemicolonCommand, openLinkSequenceModal, createRepeatGroup } from './builder.js?v=29';
import { formatHMS, displayName } from '../utils/format.js';

// Setup some window aliases since we're breaking up a monolithic file
const getActivePlaybackList = () => window.activePlaybackList;
const getCurrentSequence = () => window.currentSequence;
const getAsanaIndex = () => Object.values(window.asanaLibrary || {}).filter(Boolean);

/** Update the Next button text: "Complete ▶" on last pose, "Next ▶" otherwise */
function updateNextBtnText() {
    const nextBtn = document.getElementById('nextBtn');
    if (!nextBtn) return;
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0)
        ? window.activePlaybackList
        : (window.currentSequence?.poses || []);
    const isLast = poses.length > 0 && window.currentIndex >= poses.length - 1;
    nextBtn.textContent = isLast ? 'Complete ▶' : 'Next ▶';
}
window.updateNextBtnText = updateNextBtnText;

// #region 1. DROPDOWN & SEQ SELECTION
const seqSelect = $("sequenceSelect");
if (seqSelect) {
    seqSelect.addEventListener("change", () => {
        const idx = seqSelect.value;
        if (typeof window.stopTimer === "function") window.stopTimer(); 
        
        if (!idx) {
            window.currentSequence = null;
            window.activePlaybackList = [];
            window.currentIndex = 0;
            if (typeof window.stopTimer === "function") window.stopTimer();
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

        // ── Reset active-practice timer so duration only counts this session ──
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

        try {
            window.currentIndex = 0; 
            window.setPose(0);
            updateNextBtnText();
            if($("statusText")) $("statusText").textContent = "Ready to Start"; 
            const btn = document.getElementById("startStopBtn");
            if (btn) btn.textContent = "Start";
        } catch (e) {
            console.error("Error setting initial pose:", e);
        }
    });

    // Edit/New buttons injection
    if (!document.getElementById("quickEditBtn")) {
        const editBtn = document.createElement("button");
        editBtn.id = "quickEditBtn";
        editBtn.innerHTML = "✏️";
        editBtn.className = "tiny";
        editBtn.style.cssText = "margin-left: 8px; padding: 4px 10px; font-size: 1.1rem;";
        seqSelect.parentNode.insertBefore(editBtn, seqSelect.nextSibling);
        editBtn.onclick = () => {
            if (!getCurrentSequence()) return alert("Select a sequence first.");
            openEditCourse();
        };

        const newBtn = document.createElement("button");
        newBtn.id = "newSequenceBtn";
        newBtn.textContent = "+ New";
        newBtn.className = "tiny";
        newBtn.style.cssText = "margin-left: 4px; padding: 4px 10px;";
        editBtn.parentNode.insertBefore(newBtn, editBtn.nextSibling);
        newBtn.onclick = () => builderOpen("new", null);
    }
}

// #region 2. PLAYBACK CONTROLS
safeListen("nextBtn", "click", () => { window.stopTimer(); window.nextPose(); updateNextBtnText(); });
safeListen("prevBtn", "click", () => { window.stopTimer(); window.prevPose(); updateNextBtnText(); });
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
    if($("poseName")) $("poseName").innerText = "Select a sequence";
    if($("poseTimer")) $("poseTimer").innerText = "–";
    if($("statusText")) $("statusText").textContent = "Session Reset";
});

// #region 3. UI EXTRAS (IAST, DIAL, HISTORY)
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
    if (typeof toggleHistoryPanel === 'function') toggleHistoryPanel();
});



// #region 4. BUILDER WIRING

safeListen("btnOpenLinkModal", "click", () => {
    openLinkSequenceModal();
});

// Wire the confirm button inside the linkSequenceOverlay modal
safeListen("btnConfirmLink", "click", () => {
    const input    = document.getElementById('linkSequenceInput');
    const repsInp  = document.getElementById('linkSequenceReps');
    const overlay  = document.getElementById('linkSequenceOverlay');
    const title    = (input?.value || '').trim();
    const reps     = parseInt(repsInp?.value || '1', 10) || 1;
    if (!title) { alert('Please select or type a sequence name.'); return; }
    const exists = (window.courses || []).find(c => c.title.trim().toLowerCase() === title.toLowerCase());
    if (!exists) { alert('Sequence not found. Choose from the list.'); return; }
    addPoseToBuilder({
        id:        `MACRO:${exists.title}`,
        name:      `[Sequence] ${exists.title}`,
        duration:  reps,
        variation: '',
        note:      `Linked Sequence: ${reps} Round${reps !== 1 ? 's' : ''}`
    });
    if (overlay) overlay.style.display = 'none';
});

const repeatBtn = document.getElementById("btnGroupRepeat");

safeListen("btnGroupRepeat", "click", (e) => {
    e.preventDefault();
    createRepeatGroup();
});

window.createRepeatGroup = createRepeatGroup;
window.openLinkSequenceModal = openLinkSequenceModal;

safeListen("editCourseBtn", "click", () => {
    openEditCourse();
});

safeListen("editCourseCloseBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open");
});

safeListen("editCourseCancelBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open");
});

safeListen("editCourseSaveBtn", "click", () => {
   if (!window.asanaLibrary || Object.keys(window.asanaLibrary).length === 0) {
      alert("Library is still loading. Please wait."); 
      return;
   }
   builderSave();
});

safeListen("builderAddBlank", "click", () => {
    addPoseToBuilder({ id: "", name: "", englishName: "", duration: 30, variation: "", note: "" });
});

// #region 5. AUTH & INITIALIZATION
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
    const googleBtn  = document.getElementById("googleSignInBtn");
    const guestBtn   = document.getElementById("guestSignInBtn");
    const signOutBtn = document.getElementById("signOutBtn");

    // ── Google OAuth ─────────────────────────────────────────────────────────
    if (googleBtn) {
        googleBtn.onclick = async () => {
            googleBtn.disabled = true;
            await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: "select_account" } }
            });
        };
    }

    // ── Guest (anonymous) login ───────────────────────────────────────────────
    if (guestBtn) {
        guestBtn.onclick = async () => {
            guestBtn.disabled = true;
            guestBtn.textContent = 'Starting guest session…';

            const { data, error } = await supabase.auth.signInAnonymously();

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
            // On success, onAuthStateChange fires with event=SIGNED_IN — handled below.
        };
    }

    // ── Sign Out ─────────────────────────────────────────────────────────────
    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            const emailSpan = document.getElementById('userEmailDisplay');
            if (emailSpan) { emailSpan.textContent = ''; emailSpan.style.display = 'none'; }
            window.isGuestMode = false;
            await supabase.auth.signOut();
        };
    }

    // ── Auth state handler ────────────────────────────────────────────────────
    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            window.currentUserId = session.user.id;
            themeManager.setUserId(session.user.id);

            // is_anonymous is the canonical flag Supabase sets for anon users.
            const isAnon = session.user.is_anonymous === true;
            window.isGuestMode = isAnon;
            window.currentUserEmail = isAnon ? null : (session.user.email || null);

            const emailSpan = document.getElementById('userEmailDisplay');
            if (emailSpan) {
                if (isAnon) {
                    // Show a distinct "Guest" badge instead of an email address
                    emailSpan.textContent = '👤 Guest';
                    emailSpan.style.cssText = 'font-size:0.75rem; color:#f57f17; font-weight:600; margin-right:10px; display:inline;';
                } else {
                    emailSpan.textContent = session.user.email;
                    emailSpan.style.cssText = 'font-size:0.75rem; color:#888; margin-right:10px; display:inline;';
                }
            }

            // Both signed-in and anonymous users go straight to the app.
            showApp();
        } else if (!window.isGuestMode) {
            showLogin();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthListeners);
} else {
    setupAuthListeners();
}

// Mobile Reset Autonomous Logic
(function() {
    const attachResetListener = () => {
        const resetText = document.getElementById("dialResetBtn");
        if (!resetText) return;
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
    };
    attachResetListener();
})();
