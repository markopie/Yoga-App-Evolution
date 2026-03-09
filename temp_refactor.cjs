const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Add playbackEngine import
code = code.replace(
  'import { playFaintGong, playAsanaAudio } from "./src/playback/audio.js";',
  'import { playFaintGong, playAsanaAudio } from "./src/playback/audio.js";\nimport { playbackEngine } from "./src/playback/timer.js";'
);

// Remove timer globals
code = code.replace('let timer = null;\nlet currentPoseSeconds = 0;\nlet remaining = 0;\nlet running = false;', '');
code = code.replace('let timer = null;\r\nlet currentPoseSeconds = 0;\r\nlet remaining = 0;\r\nlet running = false;', '');

// Fix any other references to the globals
code = code.replace(/remaining === currentPoseSeconds/g, 'playbackEngine.remaining === playbackEngine.currentPoseSeconds');
code = code.replace(/if \(remaining/g, 'if (playbackEngine.remaining');
code = code.replace(/remaining = /g, 'playbackEngine.remaining = ');
code = code.replace(/remaining <= /g, 'playbackEngine.remaining <= ');
code = code.replace(/currentPoseSeconds = parseInt/g, 'playbackEngine.setPoseTime(seconds); //');
code = code.replace(/running &&/g, 'playbackEngine.running &&');
code = code.replace(/if \(!running/g, 'if (!playbackEngine.running');
code = code.replace(/running = false/g, '/* running = false */');
code = code.replace(/running = true/g, '/* running = true */');

const timerStartIdx = code.indexOf('function startTimer()');
const timerEndIdx = code.indexOf('// B. STATIC TOTAL TIME CALCULATION');

if (timerStartIdx !== -1 && timerEndIdx !== -1) {
    const newEngineLogic = `// --- TIMER ENGINE REPLACEMENT ---
// Aliases for global legacy access (these map to the new engine)
window.startTimer = () => playbackEngine.start();
window.stopTimer = () => playbackEngine.stop();

// Wire up the engine hooks to the UI
playbackEngine.onStart = () => {
    if (typeof enableWakeLock === "function") enableWakeLock();

    // UI Setup
    const overlay = document.getElementById("focusOverlay");
    if (overlay) overlay.style.display = "flex";
    
    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Running";

    const startBtn = document.getElementById("startStopBtn");
    if (startBtn) startBtn.textContent = "Pause";

    // Setup pause button
    const pauseBtn = document.getElementById("focusPauseBtn");
    if (pauseBtn) {
        pauseBtn.onclick = () => playbackEngine.stop();
    }

    // Audio Unlock Logic
    try {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList : (currentSequence?.poses || []);
            
        if (poses[currentIndex]) {
            const rawId = Array.isArray(poses[currentIndex][0]) ? poses[currentIndex][0][0] : poses[currentIndex][0];
            const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(rawId)) : null;
            
            if (asana) {
                if (playbackEngine.remaining === playbackEngine.currentPoseSeconds) {
                    playAsanaAudio(asana, poses[currentIndex][4] || "", false, currentSide);
                } else {
                    new Audio("data:audio/mp3;base64,//MkxAAQ").play().catch(()=>{});
                }
            }
        }
    } catch(e) {
        console.warn("Audio unlock failed", e);
    }
};

playbackEngine.onStop = () => {
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";

    if (typeof updateTotalAndLastUI === "function") updateTotalAndLastUI(); 

    const btn = document.getElementById("startStopBtn");
    if(btn) btn.textContent = "Start"; 

    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Paused";

    if (typeof disableWakeLock === "function") disableWakeLock();
};

playbackEngine.onTick = (remaining, currentPoseSeconds) => {
    updateTimerUI(remaining, currentPoseSeconds);
};

playbackEngine.onPoseComplete = (wasLongHold) => {
    if (wasLongHold && typeof playFaintGong === "function") playFaintGong();
    
    if (wasLongHold) {
        playbackEngine.startTransition(15);
    } else {
        nextPose(); 
        playbackEngine.start();
    }
};

playbackEngine.onTransitionStart = (secs) => {
    const overlay = document.getElementById("transitionOverlay");
    const countdownEl = document.getElementById("transitionCountdown");
    const nextPoseEl = document.getElementById("transitionNextPose");

    if (!overlay) { 
        nextPose(); 
        playbackEngine.start(); 
        return; 
    }

    const poses = (activePlaybackList && activePlaybackList.length > 0) ? activePlaybackList : (currentSequence?.poses || []);
    let previewName = "";
    const nextIdx = currentIndex + 1;
    
    if (nextIdx < poses.length) {
        const np = poses[nextIdx];
        const id = Array.isArray(np[0]) ? np[0][0] : np[0];
        const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
        previewName = asana ? (typeof displayName === "function" ? displayName(asana) : asana.name) : "";
    }
    if (nextPoseEl) nextPoseEl.textContent = previewName ? \`Next: \${previewName}\` : "";

    if (countdownEl) countdownEl.textContent = secs;
    
    overlay.style.display = "flex";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const skipBtn = document.getElementById("transitionSkipBtn");
    if (skipBtn) {
        const newSkip = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        newSkip.onclick = () => playbackEngine.skipTransition();
    }
};

playbackEngine.onTransitionTick = (secs) => {
    const countdownEl = document.getElementById("transitionCountdown");
    if (countdownEl) countdownEl.textContent = secs;
};

playbackEngine.onTransitionComplete = () => {
    const overlay = document.getElementById("transitionOverlay");
    if (overlay) overlay.style.display = "none";
    nextPose();
    playbackEngine.start();
};

function updateTimerUI(remaining, currentPoseSeconds) {
    const timerEl = document.getElementById("poseTimer");
    const focusTimerEl = document.getElementById("focusTimer");
    
    // --- 1. Current Clock ---
    if (timerEl) {
        if (!currentSequence) {
            timerEl.textContent = "–";
            if (focusTimerEl) focusTimerEl.textContent = "–";
        } else {
            const mm = Math.floor(remaining / 60);
            const ss = remaining % 60;
            const timeStr = \`\${mm}:\${String(ss).padStart(2,"0")}\`;
            timerEl.textContent = timeStr;
            if (focusTimerEl) focusTimerEl.textContent = timeStr;

            timerEl.className = "";
            if (remaining <= 5 && remaining > 0) timerEl.className = "critical";
            else if (remaining <= 10 && remaining > 0) timerEl.className = "warning";
        }
    }

    // --- 2. Dashboard Pill ---
    if (currentSequence) {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList 
            : (currentSequence.poses || []);
        
        const totalSeconds = poses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);
        let secondsLeft = remaining; 

        if (typeof needsSecondSide !== "undefined" && needsSecondSide && poses[currentIndex]) {
             secondsLeft += (Number(poses[currentIndex][1]) || 0);
        }

        for (let i = currentIndex + 1; i < poses.length; i++) {
             secondsLeft += getEffectiveTime(poses[i][0], poses[i][1]);
        }

        const remDisp = document.getElementById("timeRemainingDisplay");
        const totDisp = document.getElementById("timeTotalDisplay");
        
        if (remDisp && typeof formatHMS === "function") remDisp.textContent = formatHMS(secondsLeft);
        if (totDisp && typeof formatHMS === "function") totDisp.textContent = formatHMS(totalSeconds);

        const bar = document.getElementById("timeProgressFill");
        if (bar && totalSeconds > 0) {
            const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
            bar.style.width = \`\${pct}%\`;
            bar.style.backgroundColor = pct < 10 ? "#ffccbc" : "#c8e6c9"; 
        }
    }
}

`;
    const newCode = code.substring(0, timerStartIdx) + newEngineLogic + code.substring(timerEndIdx);
    fs.writeFileSync('app.js', newCode);
    console.log('Successfully swapped timer engine');
} else {
    console.log('Could not find timer block');
}
