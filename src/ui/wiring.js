import { $, showError, safeListen, normaliseText, setStatus } from '../utils/dom.js';
console.log("🚀 WIRING.JS LOADING...");
import { prefersIAST, setIASTPref } from '../utils/format.js';
import { supabase } from '../services/supabaseClient.js';
import { normalizePlate } from '../services/dataAdapter.js';
import { playbackEngine } from '../playback/timer.js';
import { openHistoryModal, switchHistoryTab, renderGlobalHistory } from './historyModal.js?v=23';
import { builderRender, builderSave, openEditCourse, builderOpen, addPoseToBuilder, processSemicolonCommand, openLinkSequenceModal, createRepeatGroup } from './builder.js?v=23';
import { formatHMS, displayName } from '../utils/format.js';

// Setup some window aliases since we're breaking up a monolithic file
const getActivePlaybackList = () => window.activePlaybackList;
const getCurrentSequence = () => window.currentSequence;
const getAsanaIndex = () => Object.values(window.asanaLibrary || {}).filter(Boolean);

// #region 1. DROPDOWN & SEQ SELECTION
const seqSelect = $("sequenceSelect");
if (seqSelect) {
    seqSelect.addEventListener("change", () => {
        const idx = seqSelect.value;
        if (typeof window.stopTimer === "function") window.stopTimer(); 
        
        if (!idx) {
            window.currentSequence = null;
            if($("statusText")) $("statusText").textContent = "Select a sequence";
            if($("collageWrap")) $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`; 
            return;
        }

        const rawSequence = window.courses[parseInt(idx, 10)];
        window.currentSequence = rawSequence; 

        if (typeof window.getExpandedPoses === "function") {
            window.activePlaybackList = window.getExpandedPoses(rawSequence);
        } else {
            window.activePlaybackList = rawSequence.poses ? [...rawSequence.poses] : [];
        } 

        if (typeof window.applyDurationDial === 'function') window.applyDurationDial();
        if (typeof window.updateDialUI === 'function') window.updateDialUI();
        if (typeof window.updateTotalAndLastUI === 'function') window.updateTotalAndLastUI();

        try {
            window.currentIndex = 0; 
            window.setPose(0);
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
safeListen("nextBtn", "click", () => { window.stopTimer(); window.nextPose(); });
safeListen("prevBtn", "click", () => { window.stopTimer(); window.prevPose(); });
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

const durationDial = document.getElementById("durationDial");
if (durationDial) {
    durationDial.addEventListener("input", () => {
        let val = parseInt(durationDial.value, 10);
        if (val > 45 && val < 55) durationDial.value = 50;
        if (typeof window.updateDialUI === "function") window.updateDialUI();
        if (getCurrentSequence()) window.applyDurationDial();
    });
}

// #region 4. BUILDER WIRING
console.log("Wiring.js: Setting up builder listeners...");

safeListen("btnOpenLinkModal", "click", () => {
    console.log("btnOpenLinkModal CLICKED");
    openLinkSequenceModal();
});

const repeatBtn = document.getElementById("btnGroupRepeat");
console.log("btnGroupRepeat found in DOM?", !!repeatBtn);

safeListen("btnGroupRepeat", "click", (e) => {
    console.log("btnGroupRepeat CLICK EVENT DETECTED");
    e.preventDefault();
    createRepeatGroup();
});

window.createRepeatGroup = createRepeatGroup;
window.openLinkSequenceModal = openLinkSequenceModal;

safeListen("editCourseBtn", "click", () => {
    console.log("editCourseBtn CLICKED");
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
    const googleBtn = document.getElementById("googleSignInBtn");
    const skipBtn = document.getElementById("skipLoginBtn");
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

    if (skipBtn) {
        skipBtn.onclick = () => { window.isGuestMode = true; window.currentUserId = null; showApp(); };
    }

    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (window.isGuestMode) { window.isGuestMode = false; showLogin(); }
            else await supabase.auth.signOut();
        };
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            window.currentUserId = session.user.id;
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
