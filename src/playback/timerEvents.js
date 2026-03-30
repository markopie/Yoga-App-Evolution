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


function isFlowPlaybackPose(pose = null) {
    const poseMeta = pose?.[7] || null;
    return !!(poseMeta?.flowSegment || window.currentSequence?.playbackMode === 'flow' || window.currentSequence?.isFlow);
}


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
            const currentPose = poses[window.currentIndex];
            
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
                    
                    // --- BOUNDARY AUDIO INTERCEPTOR ---
                    const idx = window.currentIndex;
                    
                    if (window._lastBoundaryIdx !== idx) {
                        window._lastBoundaryIdx = idx;

                        const prevPose = idx > 0 ? poses[idx - 1] : null;
                        const prevMeta = prevPose ? (prevPose[7] || {}) : {};
                        const currMeta = currentPose[7] || {};

                        let boundaryPromise = Promise.resolve();
                        let hasBoundary = false;

                        // A. Macro Detection
                        if (currMeta.macroTitle && currMeta.macroTitle !== prevMeta.macroTitle) {
                            hasBoundary = true;
                            const cleanTitle = currMeta.macroTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                            boundaryPromise = boundaryPromise.then(() => typeof window.playSystemAudio === 'function' ? window.playSystemAudio(`macro_start_${cleanTitle}`) : Promise.resolve());
                        } else if (prevMeta.macroTitle && !currMeta.macroTitle) {
                            hasBoundary = true;
                            boundaryPromise = boundaryPromise.then(() => typeof window.playSystemAudio === 'function' ? window.playSystemAudio("macro_end") : Promise.resolve());
                        } 

                        // B. Repetition/Round Detection (Now chains after Macro if needed)
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

                        // Execute Sequentially
                        if (hasBoundary) {
                            window.playbackEngine.suspend(); // ⏸️ Pause countdown safely
                            
                            boundaryPromise.then(() => {
                                // Ensure user hasn't skipped or hard stopped during audio
                                if (window.currentIndex === idx && window.playbackEngine.running) {
                                    window.playbackEngine.resume(); // ▶️ Restart countdown
                                    
                                    // Trigger Asana Audio now that boundary audio is done
                                    if (typeof window.playAsanaAudio === "function") {
                                        const side = window.getCurrentSide ? window.getCurrentSide() : null;
                                        const isSecondSide = side === "left" && !!(asana.requiresSides || asana.requires_sides);
                                        window.playAsanaAudio(asana, poses[window.currentIndex][4] || "", false, side, window.currentVariationKey || null, isSecondSide);
                                    }
                                }
                            });
                            return; // 🛑 Exit to wait for promise
                        }
                    }
                    // --- END BOUNDARY INTERCEPTOR ---

                    // Play standard Asana instruction immediately if no boundary audio
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

// Add the new hook binding right below it
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
    
    // Check if the NEXT pose is a boundary (New Macro or New Round)
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

function triggerSequenceEnd() {
    window.stopTimer();
    
    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    // --- RE-EVALUATE SUCCESS BASED ON THE DASHBOARD TRACKER ---
    const activeList = typeof window.getActivePlaybackList === 'function' ? window.getActivePlaybackList() : [];
    const tracker = typeof window.getCompletionTracker === 'function' ? window.getCompletionTracker() : {};
    
    let totalSections = 0;
    let completedSections = 0;

    if (activeList && activeList.length > 0) {
        const groupMap = {};
        
        // Group and sum the active time vs allocated time exactly like the UI does
        activeList.forEach((node, playbackIdx) => {
            const origIdx = (node[5] !== undefined && node[5] !== null) ? node[5] : `p-${playbackIdx}`;
            if (!groupMap[origIdx]) {
                groupMap[origIdx] = { totalAllocated: 0, totalCompleted: 0 };
                totalSections++;
            }
            groupMap[origIdx].totalAllocated += Number(node[1] || 0);
            groupMap[origIdx].totalCompleted += Number(tracker[playbackIdx] || 0);
        });

        // Tally how many sections crossed the 90% threshold
        Object.values(groupMap).forEach(g => {
            const ratio = g.totalAllocated > 0 ? (g.totalCompleted / g.totalAllocated) : 0;
            if (ratio >= 0.9) completedSections++; 
        });
    }

    const completionRatio = totalSections > 0 ? (completedSections / totalSections) : 0;
    const isSuccess = completionRatio >= 0.9;
    // -----------------------------------------------------------

    const focusDuration = window.playbackEngine ? window.playbackEngine.activePracticeSeconds : 0;
    
    // Gatekeeper: If they didn't effectively practice 90% of the sequence blocks, block the save.
    if (!isSuccess) { 
        const displayPercent = Math.round(completionRatio * 100);
        const msg = `You've completed ${displayPercent}% of the sequence blocks.\n\nYou need to hold the poses a bit longer to log this session to your history!`;
        
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
            window.appendServerHistory(title, new Date(), category, focusDuration).then(resultId => {
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
    
    let previewName;
    let mainMsg;
    
    const getPoseVariationInfo = (pose, asanaObj) => {
        if (!pose || !asanaObj || !asanaObj.variations) return { key: "", title: "" };

        const noteBits = [pose[2], pose[3], pose[4]].filter(Boolean).join(" ").trim();
        const bracketMatch = noteBits.match(/\[(.*?)\]/);
        const requestedKey = bracketMatch ? bracketMatch[1].trim() : (pose[3] || "");
        const cleanRequestedKey = String(requestedKey || "").trim();
        if (!cleanRequestedKey) return { key: "", title: "" };

        for (const [vk, vd] of Object.entries(asanaObj.variations)) {
            const vtitle = String(vd?.title || vd?.Title || "").trim();
            if (vk.toLowerCase() === cleanRequestedKey.toLowerCase() || vtitle.toLowerCase() === cleanRequestedKey.toLowerCase()) {
                return { key: vk, title: vtitle || `Stage ${vk}` };
            }
        }

        return { key: cleanRequestedKey, title: `Stage ${cleanRequestedKey}` };
    };
    
    const buildPosePreviewName = (pose, asanaObj) => {
        if (!asanaObj) return "";
        const baseName = typeof window.displayName === "function" ? window.displayName(asanaObj) : (asanaObj.english || asanaObj.name || "");
        const variationInfo = getPoseVariationInfo(pose, asanaObj);
        return variationInfo.title ? `${baseName} — ${variationInfo.title}` : baseName;
    };
    
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

    const currentPose = poses[window.currentIndex] || null;
    const nextPose = poses[window.currentIndex + 1] || null;
    const currentFlowPose = isFlowPlaybackPose(currentPose);
    const nextFlowPose = isFlowPlaybackPose(nextPose);

    if (typeof window.needsSecondSide !== "undefined" && window.needsSecondSide) {
        mainMsg = currentFlowPose ? "Release from the pose and continue flowing" : "Release from the pose and prepare for the other side";
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
            
            previewName = buildPosePreviewName(np, asana);            
            let transitionTarget = null;
            
            const currentP = currentPose;
            const currId = Array.isArray(currentP[0]) ? currentP[0][0] : currentP[0];
            const currAsana = typeof window.findAsanaByIdOrPlate === "function" ? window.findAsanaByIdOrPlate(window.normalizePlate(currId)) : null;
            const currKey = window.currentVariationKey;
            
            if (currAsana && !currentFlowPose) {
                let recovery = currAsana.recovery_pose_id;
                if (currKey && currAsana.variations && currAsana.variations[currKey] && currAsana.variations[currKey].recovery_pose_id) {
                    recovery = currAsana.variations[currKey].recovery_pose_id;
                }
                if (recovery && recovery !== "NULL" && recovery !== "null") {
                    transitionTarget = `Recovery: ${formatTransitionPose(recovery)}`;
                }
            }
            
            if (!transitionTarget && asana && !nextFlowPose) {
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
            
            // --- SMART ROUTING LOGIC: Macros and Loops ---
            const currMeta = currentPose ? (currentPose[7] || {}) : {};
            const nextMeta = np ? (np[7] || {}) : {};
            
            // 1. Entering a New Macro
            if (nextMeta.macroTitle && nextMeta.macroTitle !== currMeta.macroTitle) {
                mainMsg = `Prepare for ${nextMeta.macroTitle}`;
                if (nextPoseEl) {
                    const startLabel = transitionTarget ? transitionTarget : previewName;
                    nextPoseEl.textContent = `Starting with: ${startLabel}`;
                }
            }
            // 2. Entering or Incrementing a Loop/Round
            else if (nextMeta.loopCurrent && nextMeta.loopCurrent !== currMeta.loopCurrent) {
                const isFirstRound = nextMeta.loopCurrent === 1;
                const roundText = isFirstRound ? 'Repetitions' : `Round ${nextMeta.loopCurrent}`;
                
                // Prevent redundant label like "Repetitions (Repetition)"
                let loopContext = '';
                if (nextMeta.loopLabel) {
                    const cleanLabel = nextMeta.loopLabel.trim().toLowerCase();
                    if (cleanLabel !== 'repetition' && cleanLabel !== 'repetitions') {
                        loopContext = ` (${nextMeta.loopLabel})`;
                    }
                }
                
                mainMsg = `Prepare for ${roundText}${loopContext}`;
                if (nextPoseEl) {
                    const startLabel = transitionTarget ? transitionTarget : previewName;
                    nextPoseEl.textContent = `Starting with: ${startLabel}`;
                }
            }
            // 3. Exiting a Macro
            else if (currMeta.macroTitle && !nextMeta.macroTitle) {
                mainMsg = `Sequence complete. Release and prepare for next pose.`;
                if (nextPoseEl) nextPoseEl.textContent = transitionTarget ? `Next: ${transitionTarget}` : `Next: ${previewName}`;
            }
            // 4. Standard Behavior (Flows & Normal Poses)
            else {
                if (currentFlowPose || nextFlowPose) {
                    mainMsg = 'Release from the pose and continue flowing';
                    if (nextPoseEl) nextPoseEl.textContent = previewName ? `Next: ${previewName}` : 'Next pose';
                } else if (transitionTarget) {
                    mainMsg = `Release from the pose and prepare for ${transitionTarget}`;
                    if (nextPoseEl) nextPoseEl.textContent = `Next: ${previewName}`;
                } else {
                    mainMsg = `Release from the pose and prepare for ${previewName}`;
                    if (nextPoseEl) nextPoseEl.textContent = `Next: ${previewName}`;
                }
            }
            // ----------------------------------------------
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

        const poseTime = (p) => window.getPosePillTime(p);

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

// Export for Wiring
window.updateTimerUI = updateTimerUI;
window.triggerSequenceEnd = triggerSequenceEnd;