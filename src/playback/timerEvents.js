// src/playback/timerEvents.js
// ────────────────────────────────────────────────────────────────────────────
// Extracted from app.js Phase 4. Timer engine event callbacks.
//
// ⚠️  NO IMPORTS — follows sequenceEngine.js pattern. All helpers accessed 
//    via window.* to avoid duplicate module instances.
// ────────────────────────────────────────────────────────────────────────────

// 1. ENGINE BINDINGS (Fixes window.startTimer is not a function)
window.startTimer = () => window.playbackEngine.start();
window.stopTimer = () => window.playbackEngine.stop();

/** Helper to detect if the current pose is part of a Flow segment. */
function isFlowPlaybackPose(pose = null) {
    const poseMeta = pose?.[7] || null;
    return !!(poseMeta?.flowSegment || window.currentSequence?.playbackMode === 'flow' || window.currentSequence?.isFlow);
}

// 2. ON START HOOK
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
            const idx = window.currentIndex;
            const currentPose = poses[idx];
            
            // --- SKIP BUTTON LOGIC ---
            const activeSkipBtn = document.getElementById("activePoseSkipBtn"); 
            if (activeSkipBtn) {
                const note = String(currentPose[4] || "").toLowerCase();
                const poseName = String(currentPose[6] || "").toLowerCase();
                const isSkipType = note.includes("recovery") || poseName.includes("recovery") || 
                                   note.includes("preparat") || poseName.includes("preparat");
                
                if (isSkipType) {
                    activeSkipBtn.style.display = "inline-block";
                    activeSkipBtn.onclick = () => {
                        window.playbackEngine.stop();
                        const advanced = typeof window.nextPose === "function" ? window.nextPose() : false;
                        if (advanced) window.playbackEngine.start();
                    };
                } else {
                    activeSkipBtn.style.display = "none";
                }
            }

            const rawId = Array.isArray(currentPose[0]) ? currentPose[0][0] : currentPose[0];
            const asana = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(window.normalizePlate(rawId)) : null;
            
            if (asana) {
                if (window.playbackEngine.remaining === window.playbackEngine.currentPoseSeconds) {
                    
                    // --- 🎙️ SEQUENTIAL AUDIO HELPER ---
                    const triggerAsanaAudio = () => {
                        if (typeof window.playAsanaAudio !== "function") {
                            window.playbackEngine.resume();
                            return;
                        }
                        const side = window.getCurrentSide ? window.getCurrentSide() : null;
                        const isSecondSide = side === "left" && !!(asana.requiresSides || asana.requires_sides);
                        
                        window.playbackEngine.suspend(); 
                        window.playAsanaAudio(asana, currentPose[4] || "", false, side, window.currentVariationKey || null, isSecondSide)
                            .then(() => {
                                if (window.currentIndex === idx && window.playbackEngine.running) {
                                    window.playbackEngine.resume(); 
                                }
                            });
                    };

                    // --- BOUNDARY AUDIO INTERCEPTOR ---
                    if (window._lastBoundaryIdx !== idx) {
                        window._lastBoundaryIdx = idx;

                        const prevPose = idx > 0 ? poses[idx - 1] : null;
                        const prevMeta = prevPose ? (prevPose[7] || {}) : {};
                        const currMeta = currentPose[7] || {};

                        let boundaryPromise = Promise.resolve();
                        let hasBoundary = false;

                        if (currMeta.macroTitle && currMeta.macroTitle !== prevMeta.macroTitle) {
                            hasBoundary = true;
                            const cleanTitle = currMeta.macroTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                            boundaryPromise = boundaryPromise.then(() => typeof window.playSystemAudio === 'function' ? window.playSystemAudio(`macro_start_${cleanTitle}`) : Promise.resolve());
                        } else if (prevMeta.macroTitle && !currMeta.macroTitle) {
                            hasBoundary = true;
                            boundaryPromise = boundaryPromise.then(() => typeof window.playSystemAudio === 'function' ? window.playSystemAudio("macro_end") : Promise.resolve());
                        } 

                        if (currMeta.loopCurrent) {
                            const isNewRound = prevMeta.loopCurrent && currMeta.loopCurrent !== prevMeta.loopCurrent;
                            const isFirstRoundStart = !prevMeta.loopCurrent && currMeta.loopCurrent === 1;

                            if (isFirstRoundStart) {
                                hasBoundary = true;
                                boundaryPromise = boundaryPromise.then(() => typeof window.playSystemAudio === 'function' ? window.playSystemAudio("loop_start") : Promise.resolve())
                                                                 .then(() => typeof window.speakRound === 'function' ? window.speakRound(1) : Promise.resolve());
                            } else if (isNewRound) {
                                hasBoundary = true;
                                boundaryPromise = boundaryPromise.then(() => typeof window.speakRound === 'function' ? window.speakRound(currMeta.loopCurrent) : Promise.resolve());
                            }
                        } else if (prevMeta.loopCurrent && !currMeta.loopCurrent) {
                            hasBoundary = true;
                            boundaryPromise = boundaryPromise.then(() => typeof window.playSystemAudio === 'function' ? window.playSystemAudio("loop_end") : Promise.resolve());
                        }

                        if (hasBoundary) {
                            window.playbackEngine.suspend(); 
                            boundaryPromise.then(() => {
                                if (window.currentIndex === idx && window.playbackEngine.running) {
                                    triggerAsanaAudio(); 
                                }
                            });
                            return; 
                        }
                    }
                    triggerAsanaAudio();
                } else {
                    new Audio("data:audio/mp3;base64,//MkxAAQ").play().catch(()=>{});
                }
            }
        }
    } catch(e) {
        console.warn("Audio start logic failed", e);
    }
};

// 3. OTHER ENGINE HOOKS
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

window.playbackEngine.onActiveTick = (secs) => {
    if (typeof window.updateNodeCompletion === 'function') {
        window.updateNodeCompletion(window.getCurrentIndex(), secs);
    }
};

window.playbackEngine.onPoseComplete = (wasLongHold) => {
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) ? window.activePlaybackList : (window.currentSequence?.poses || []);
    const currentPose = poses[window.currentIndex] || null;
    const flowPose = isFlowPlaybackPose(currentPose);
    const advanceAndRestart = () => {
        const advanced = window.nextPose();
        if (advanced) window.playbackEngine.start();
    };

    if (wasLongHold && !flowPose && typeof window.playFaintGong === "function") window.playFaintGong();
    
    const nextPose = poses[window.currentIndex + 1] || null;
    const currMeta = currentPose?.[7] || {};
    const nextMeta = nextPose?.[7] || {};
    const isBoundary = (nextMeta.macroTitle && nextMeta.macroTitle !== currMeta.macroTitle) || 
                       (nextMeta.loopCurrent && nextMeta.loopCurrent !== currMeta.loopCurrent);

    if ((wasLongHold || isBoundary) && !flowPose) {
        window.playbackEngine.startTransition(15);
        return;
    }

    if (flowPose && typeof window.getCurrentAudio === 'function') {
        const activeAudio = window.getCurrentAudio();
        if (activeAudio && !activeAudio.paused && !activeAudio.ended) {
            let finished = false;
            const cleanup = () => {
                activeAudio.removeEventListener('ended', handleEnded);
                clearTimeout(safetyTimer);
            };
            const handleEnded = () => {
                if (finished) return;
                finished = true;
                cleanup();
                advanceAndRestart();
            };
            const safetyTimer = setTimeout(() => {
                if (finished) return;
                finished = true;
                cleanup();
                advanceAndRestart();
            }, 5000);
            activeAudio.addEventListener('ended', handleEnded, { once: true });
            return;
        }
    }
    advanceAndRestart();
};

// 4. BOTTOM UI FUNCTIONS (Fixes updateTimerUI is not a function)
function triggerSequenceEnd() {
    window.stopTimer();
    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const activeList = typeof window.getActivePlaybackList === 'function' ? window.getActivePlaybackList() : [];
    const tracker = typeof window.getCompletionTracker === 'function' ? window.getCompletionTracker() : {};
    
    let totalSections = 0;
    let completedSections = 0;

    if (activeList && activeList.length > 0) {
        const groupMap = {};
        activeList.forEach((node, playbackIdx) => {
            const origIdx = (node[5] !== undefined && node[5] !== null) ? node[5] : `p-${playbackIdx}`;
            if (!groupMap[origIdx]) {
                groupMap[origIdx] = { totalAllocated: 0, totalCompleted: 0 };
                totalSections++;
            }
            groupMap[origIdx].totalAllocated += Number(node[1] || 0);
            groupMap[origIdx].totalCompleted += Number(tracker[playbackIdx] || 0);
        });

        Object.values(groupMap).forEach(g => {
            const ratio = g.totalAllocated > 0 ? (g.totalCompleted / g.totalAllocated) : 0;
            if (ratio >= 0.9) completedSections++; 
        });
    }

    const completionRatio = totalSections > 0 ? (completedSections / totalSections) : 0;
    const isSuccess = completionRatio >= 0.9;

    if (!isSuccess) { 
        const displayPercent = Math.round(completionRatio * 100);
        alert(`You've completed ${displayPercent}% of the sequence blocks.\n\nYou need to hold the poses a bit longer to log this session to your history!`);
        return;
    }

    const ratingOverlay = document.getElementById("ratingOverlay");
    if (ratingOverlay && ratingOverlay.style.display !== "flex") {
        ratingOverlay.style.display = "flex";
        const title = window.currentSequence?.title || "Unknown Sequence";
        const category = window.currentSequence?.category || null;
        const focusDuration = window.playbackEngine ? window.playbackEngine.activePracticeSeconds : 0;
        
        if (typeof window.appendServerHistory === "function") {
            window.appendServerHistory(title, new Date(), category, focusDuration);
        }
    }
}

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
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) ? window.activePlaybackList : (window.currentSequence.poses || []);
        const poseTime = (p) => (typeof window.getPosePillTime === 'function') ? window.getPosePillTime(p) : (Number(p[1]) || 0);
        const totalSeconds = poses.reduce((acc, p) => acc + poseTime(p), 0);
        let secondsLeft = remaining;
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

// 5. GLOBAL EXPORTS
window.updateTimerUI = updateTimerUI;
window.triggerSequenceEnd = triggerSequenceEnd;