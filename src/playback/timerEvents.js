// src/playback/timerEvents.js
// ────────────────────────────────────────────────────────────────────────────
// Extracted from app.js Phase 4. Timer engine event callbacks.
//
// ⚠️  NO IMPORTS — follows sequenceEngine.js pattern (see refactor-roadmap.md
//     Lesson #4). All helpers accessed via window.* to avoid duplicate module
//     instances and Supabase auth breakage.
// ────────────────────────────────────────────────────────────────────────────

// --- TIMER ENGINE REPLACEMENT ---
window.startTimer = () => window.playbackEngine.start();
window.stopTimer = () => window.playbackEngine.stop();

window.playbackEngine.onStart = () => {
    if (typeof window.enableWakeLock === "function") window.enableWakeLock();

    const overlay = document.getElementById("focusOverlay");
    if (overlay) overlay.style.display = "flex";
    
    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Running";

    const startBtn = document.getElementById("startStopBtn");
    if (startBtn) startBtn.textContent = "Pause";

    const pauseBtn = document.getElementById("focusPauseBtn");
    if (pauseBtn) {
        pauseBtn.onclick = () => window.playbackEngine.stop();
    }

    try {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList : (window.currentSequence?.poses || []);
            
        if (poses[window.currentIndex]) {
            const rawId = Array.isArray(poses[window.currentIndex][0]) ? poses[window.currentIndex][0][0] : poses[window.currentIndex][0];
            const asana = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(window.normalizePlate(rawId)) : null;
            
            if (asana) {
                if (window.playbackEngine.remaining === window.playbackEngine.currentPoseSeconds) {
                    if (typeof window.playAsanaAudio === "function") {
                        const side = window.getCurrentSide ? window.getCurrentSide() : null;
                        const isSecondSide = side === "left" && !!(asana.requiresSides || asana.requires_sides);
                        window.playAsanaAudio(asana, poses[window.currentIndex][4] || "", false, side, window.currentVariationKey || null, isSecondSide);
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

window.playbackEngine.onStop = () => {
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";

    document.body.classList.remove("modal-open");

    if (typeof window.updateTotalAndLastUI === "function") window.updateTotalAndLastUI(); 

    const btn = document.getElementById("startStopBtn");
    if(btn) btn.textContent = "Start"; 

    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Paused";

    if (typeof window.disableWakeLock === "function") window.disableWakeLock();
};
window.playbackEngine.onTick = (remaining, currentPoseSeconds) => {
    window.updateTimerUI(remaining, currentPoseSeconds);
};

window.playbackEngine.onPoseComplete = (wasLongHold) => {
    if (wasLongHold && typeof window.playFaintGong === "function") window.playFaintGong();
    
    if (wasLongHold) {
        window.playbackEngine.startTransition(15);
    } else {
        const advanced = window.nextPose(); 
        if (advanced) {
            window.playbackEngine.start();
        }
    }
};

function triggerSequenceEnd() {
    window.stopTimer();
    
    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    // 90% completion gate
    const totalSeqTime = window.calculateTotalSequenceTime(window.currentSequence);
    const focusDuration = window.playbackEngine.activePracticeSeconds || 0;
    
    if (focusDuration === 0) {
        const ratingOverlay = document.getElementById("ratingOverlay");
        if (ratingOverlay) ratingOverlay.style.display = "none";
        return;
    }
    
    const completionRatio = totalSeqTime > 0 ? focusDuration / totalSeqTime : 1;
    
    if (completionRatio < 0.9 && totalSeqTime > 60) {
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
        
        const title = window.currentSequence.title || "Unknown Sequence";
        const category = window.currentSequence.category || null;
        
        ratingOverlay.dataset.sessionId = "";
        
        if (typeof window.appendServerHistory === "function") {
            const finalDuration = window.playbackEngine.activePracticeSeconds || 0;
            console.log(`📊 Practice duration: ${finalDuration}s (active play only, paused time excluded)`);
            window.appendServerHistory(title, new Date(), category, finalDuration).then(resultId => {
                if (resultId && resultId !== true && typeof resultId !== "boolean") {
                    ratingOverlay.dataset.sessionId = resultId;
                }
            }).catch(console.error);
        }
    }
}

window.playbackEngine.onTransitionStart = (secs) => {
    const overlay = document.getElementById("transitionOverlay");
    const countdownEl = document.getElementById("transitionCountdown");
    const nextPoseEl = document.getElementById("transitionNextPose");
    const msgEl = document.querySelector("#transitionOverlay .transition-msg");

    if (!overlay) { 
        window.nextPose(); 
        window.playbackEngine.start(); 
        return; 
    }

    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) ? window.activePlaybackList : (window.currentSequence?.poses || []);
    // Change lines 161-162 to:
    let previewName;
    let mainMsg;
    const formatTransitionPose = (rawId) => {
        if (!rawId) return "";
        const cleanId = String(rawId).trim().replace(/\|/g, "").replace(/\s+/g, "");
        const parsed = cleanId.match(/^(\d+)(.*)$/);
        if (!parsed) return cleanId;
        
        const num = parsed[1].padStart(3, "0");
        const varSuffix = parsed[2] ? parsed[2].toUpperCase() : "";
        
        const asanaObj = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(num) : null;
        let baseName = asanaObj ? (typeof window.displayName === "function" ? window.displayName(asanaObj) : (asanaObj.english || asanaObj.name)) : `Pose ${num}`;
        
        if (varSuffix && varSuffix !== "NULL") {
            return `${baseName} (Stage ${varSuffix})`;
        }
        return baseName;
    };

    if (typeof window.needsSecondSide !== "undefined" && window.needsSecondSide) {
        mainMsg = "Release from the pose and prepare for the other side";
        if (nextPoseEl) nextPoseEl.textContent = "Next: the other side";
    } else {
        const nextIdx = window.currentIndex + 1;
        
        if (nextIdx >= poses.length) {
            triggerSequenceEnd();
            return;
        } else {
            const np = poses[nextIdx];
            const id = Array.isArray(np[0]) ? np[0][0] : np[0];
            const asana = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(window.normalizePlate(id)) : null;
            
            previewName = asana ? (typeof window.displayName === "function" ? window.displayName(asana) : (asana.english || asana.name)) : "";
            
            let transitionTarget = null;
            
            const currentP = poses[window.currentIndex];
            const currId = Array.isArray(currentP[0]) ? currentP[0][0] : currentP[0];
            const currAsana = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(window.normalizePlate(currId)) : null;
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
            
            if (!transitionTarget && asana) {
                let prep = asana.preparatory_pose_id;
                
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
        newSkip.onclick = () => window.playbackEngine.skipTransition();
    }
};

window.playbackEngine.onTransitionTick = (secs) => {
    const countdownEl = document.getElementById("transitionCountdown");
    if (countdownEl) countdownEl.textContent = secs;
};

window.playbackEngine.onTransitionComplete = () => {
    const overlay = document.getElementById("transitionOverlay");
    if (overlay) overlay.style.display = "none";
    const advanced = window.nextPose();
    if (advanced) {
        window.playbackEngine.start();
    }
};

function updateTimerUI(remaining, currentPoseSeconds) {
    const timerEl = document.getElementById("poseTimer");
    const focusTimerEl = document.getElementById("focusTimer");
    
    if (timerEl) {
        if (!window.currentSequence) {
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

    if (window.currentSequence) {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0)
            ? window.activePlaybackList
            : (window.currentSequence.poses || []);

        // Use getPosePillTime — reads p[1] (dial-adjusted), not the library hold standard.
        // See sequenceUtils.js Lesson #9 comment.
        const poseTime = (p) => window.getPosePillTime(p);

        const totalSeconds = poses.reduce((acc, p) => acc + poseTime(p), 0);

        // Remaining = current pose countdown + all future poses
        let secondsLeft = remaining;

        // If second side is pending, add one more full side duration
        if (window.needsSecondSide && poses[window.currentIndex]) {
            secondsLeft += Number(poses[window.currentIndex][1]) || 0;
        }

        for (let i = window.currentIndex + 1; i < poses.length; i++) {
            secondsLeft += poseTime(poses[i]);
        }

        const remDisp = document.getElementById("timeRemainingDisplay");
        const totDisp = document.getElementById("timeTotalDisplay");
        
        if (remDisp && typeof window.formatHMS === "function") remDisp.textContent = window.formatHMS(secondsLeft);
        if (totDisp && typeof window.formatHMS === "function") totDisp.textContent = window.formatHMS(totalSeconds);

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
window.triggerSequenceEnd = triggerSequenceEnd;