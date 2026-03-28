// src/playback/audioEngine.js

import { AUDIO_BASE, BRIDGE_SKIP_PROBABILITY } from "../config/appConfig.js";
import { normalizePlate } from "../services/dataAdapter.js";

// ── Module-level audio state ────────────────────────────────────────────────
let currentAudio = null;
let audioCtx     = null;

// ── Preloaded side-cue files ─────────────────────────────────────────────────
const _sideCues = {};
["left", "right"].forEach(side => {
    try {
        const a = new Audio(AUDIO_BASE + `${side}_side.mp3`);
        a.preload = "auto";
        _sideCues[side] = a;
    } catch (e) {}
});

function playSideCueFile(side) {
    const a = _sideCues[side];
    if (!a) return;
    try {
        a.currentTime = 0;
        a.play().catch(e => console.warn(`side cue play failed (${side}):`, e));
        currentAudio = a;
    } catch (e) {}
}

// ── Exports ───────────────────────────────────────────────────────────────────
export function getCurrentAudio() { return currentAudio; }
export function setCurrentAudio(audio) { currentAudio = audio; }

// ── Faint gong (Oscillator) ──────────────────────────────────────────────────
export function playFaintGong() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        const t0 = audioCtx.currentTime + 0.02;

        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const g  = audioCtx.createGain();

        o1.type = "sine"; o2.type = "sine";
        o1.frequency.setValueAtTime(432, t0);
        o2.frequency.setValueAtTime(864, t0);

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

        o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
        o1.start(t0); o2.start(t0);
        o1.stop(t0 + 2.0); o2.stop(t0 + 2.0);
    } catch (e) {}
}

// ── Side detection (label-based, for non-requires_sides poses) ───────────────
export function detectSide(poseLabel) {
    if (!poseLabel) return null;
    const label = poseLabel.toLowerCase();
    if (label.includes("(right)") || label.includes("right side")) return "right";
    if (label.includes("(left)")  || label.includes("left side"))  return "left";
    return null;
}

export function playSideCue(side) {
    if (!side) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = side === "right" ? 800 : 600;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}

// ── System & Boundary Audio (Macros / Loops) ─────────────────────────────────

/**
 * Plays a pre-recorded system audio prompt. Returns a Promise so the next
 * audio file can be chained to play sequentially without overlapping.
 */
export function playSystemAudio(fileName) {
    return new Promise((resolve) => {
        if (!fileName) return resolve();

        let finalFile = fileName;
        
        // Smart fallback: If a specific macro name file isn't on the server, 
        // fall back to the generic "macro_start.mp3"
        if (fileName.startsWith('macro_start_')) {
            const allFiles = window.serverAudioFiles || [];
            if (!allFiles.includes(`${fileName}.mp3`)) {
                finalFile = 'macro_start';
            }
        }

        if (currentAudio) {
            try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
        }

        const src = `${AUDIO_BASE}${finalFile}.mp3`;
        const a = new Audio(src);
        currentAudio = a;

        a.onended = resolve;
        a.onerror = () => {
            console.warn(`System audio failed/missing: ${src}`);
            resolve();
        };

        a.play().catch(() => resolve());
    });
}

/**
 * Uses the Web Speech API to announce the round number. 
 * Returns a Promise to allow sequential chaining.
 */
export function speakRound(roundNum) {
    return speakText(`Round ${roundNum}`);
}

/**
 * General Speech API helper for accessibility.
 * Includes a 100ms delay to prevent audio clipping on start.
 */
export function speakText(text) {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window) || !text) return resolve();
        
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.1; 
        utterance.volume = 0.7;

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            const femaleVoice = voices.find(v => {
                const name = v.name.toLowerCase();
                return name.includes('female') || 
                       ['samantha', 'victoria', 'karen', 'tessa', 'moira', 'matilda'].some(n => name.includes(n));
            });
            if (femaleVoice) {
                utterance.voice = femaleVoice;
            }
        }

        utterance.onend = resolve;
        utterance.onerror = resolve;

        // Small delay ensures the engine has fully cleared the previous cancel command
        setTimeout(() => window.speechSynthesis.speak(utterance), 100);
    });
}

export function toggleSpeak(text, btn) {
    if (window.speechSynthesis.speaking && btn.dataset.speaking === "true") {
        window.speechSynthesis.cancel();
        return;
    }

    // Reset any other buttons currently in "Stop" state
    document.querySelectorAll('.speak-toggle-btn').forEach(b => {
        if (b.dataset.originalLabel) b.innerHTML = b.dataset.originalLabel;
        b.dataset.speaking = "false";
    });

    btn.dataset.originalLabel = btn.innerHTML;
    btn.innerHTML = "⏹ Stop";
    btn.dataset.speaking = "true";
    btn.classList.add('speak-toggle-btn');

    speakText(text).then(() => {
        btn.innerHTML = btn.dataset.originalLabel;
        btn.dataset.speaking = "false";
    });
}


// ── Main orchestrator ─────────────────────────────────────────────────────────
export function playAsanaAudio(
    asana,
    poseLabel       = null,
    isBrowseContext = false,
    currentSide     = null,
    variationKey    = null,
    isSecondSide    = false
) {
    if (!asana) return;

    if (currentAudio) {
        try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
        currentAudio = null;
    }

    if (isSecondSide && asana.requiresSides && currentSide && !isBrowseContext) {
        playSideCueFile(currentSide);
        return;
    }

    const onMainAudioEnded = () => {
        if (isBrowseContext) return;
        if (asana.requiresSides && currentSide) {
            playSideCueFile(currentSide);
        }
    };

    playPoseMainAudio(asana, poseLabel, onMainAudioEnded, variationKey);
}

export function playPoseMainAudio(asana, poseLabel = null, onComplete = null, variationKey = null) {
    if (poseLabel && !asana.requiresSides) {
        const side = detectSide(poseLabel);
        if (side) setTimeout(() => playSideCue(side), 100);
    }

    const playSrcInQueue = (src, nextStep) => {
        if (!src) { if (nextStep) nextStep(); return; }
        const a = new Audio(src);
        if (nextStep)       a.onended = nextStep;
        else if (onComplete) a.onended = onComplete;
        a.play()
            .then(() => { currentAudio = a; })
            .catch(e => {
                console.warn(`Audio play failed: ${src}`, e);
                if (nextStep) nextStep();
                else if (onComplete) onComplete();
            });
    };

    const varAudio = (variationKey && asana.variations && asana.variations[variationKey]?.audio)
        ? asana.variations[variationKey].audio : null;

    const step3_Variation = () => {
        if (varAudio) playSrcInQueue(varAudio, onComplete);
        else if (onComplete) onComplete();
    };

    const step2_Bridge = () => {
        if (!varAudio) { if (onComplete) onComplete(); return; }
        if (Math.random() < BRIDGE_SKIP_PROBABILITY) {
            step3_Variation();
            return;
        }
        const allFiles   = window.serverAudioFiles || [];
        const bridges    = ["bridge_stage.mp3", "bridge_stage_2.mp3", "bridge_stage_3.mp3"]
                            .filter(f => allFiles.includes(f) || f === "bridge_stage.mp3");
        const bridgeFile = bridges[Math.floor(Math.random() * bridges.length)];
        playSrcInQueue(AUDIO_BASE + bridgeFile, step3_Variation);
    };

    const step1_Main = () => {
        let src = asana.audio;
        if (!src) {
            const idStr   = normalizePlate(asana.asanaNo || asana.id);
            const fileList = window.serverAudioFiles || [];
            const match   = fileList.find(f => f.startsWith(`${idStr}_`) || f === `${idStr}.mp3`);
            if (match)      src = AUDIO_BASE + match;
            else if (idStr) src = `${AUDIO_BASE}${idStr}_${(asana.english || asana.name || "").replace(/[^a-zA-Z0-9]/g, "")}.mp3`;
        }
        if (src) playSrcInQueue(src, step2_Bridge);
        else     step2_Bridge();
    };

    step1_Main();
}

// Global bindings for legacy callers
window.playAsanaAudio   = playAsanaAudio;
window.playFaintGong    = playFaintGong;
window.playPoseMainAudio = playPoseMainAudio;
window.getCurrentAudio  = getCurrentAudio;
window.playSystemAudio  = playSystemAudio;
window.speakRound       = speakRound;
window.speakText        = speakText;
window.toggleSpeak      = toggleSpeak;