// src/playback/audioEngine.js

import { AUDIO_BASE, BRIDGE_SKIP_PROBABILITY } from "../config/appConfig.js";
import { normalizePlate } from "../services/dataAdapter.js";

// ── Module-level audio state ────────────────────────────────────────────────
let currentAudio = null;
let audioCtx     = null;

// ── Preloaded side-cue files ─────────────────────────────────────────────────
// Created at module init so they are network-fetched and buffered before first
// use. This eliminates the ~100ms fetch latency that was clipping "l-eft side".
const _sideCues = {};
["left", "right"].forEach(side => {
    try {
        const a = new Audio(AUDIO_BASE + `${side}_side.mp3`);
        a.preload = "auto";
        _sideCues[side] = a;
    } catch (e) {}
});

/** Play a preloaded side-cue file, resetting to the beginning each time. */
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

// ── Main orchestrator ─────────────────────────────────────────────────────────
/**
 * Orchestrates the audio playback sequence for a pose.
 *
 * Standard flow:  Main Name → bridge_stage.mp3 (random skip) → Variation → Side cue
 *
 * Special cases:
 *   - `isBrowseContext`: skips all side cues (Browse menu).
 *   - `isSecondSide`: skips name/bridge/stage entirely; plays only the preloaded
 *     side-cue file. Use when a requires_sides asana flips from side 1 → side 2.
 *
 * @param {object}  asana
 * @param {string}  [poseLabel]
 * @param {boolean} [isBrowseContext=false]
 * @param {string}  [currentSide]   'left' | 'right' | null
 * @param {string}  [variationKey]
 * @param {boolean} [isSecondSide=false]
 */
export function playAsanaAudio(
    asana,
    poseLabel       = null,
    isBrowseContext = false,
    currentSide     = null,
    variationKey    = null,
    isSecondSide    = false
) {
    if (!asana) return;

    // Stop whatever was playing
    if (currentAudio) {
        try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
        currentAudio = null;
    }

    // ── Second-side shortcut ─────────────────────────────────────────────────
    // For requires_sides asanas transitioning to the second side: play only the
    // preloaded side-cue file (preloaded = no network latency = no cutoff).
    if (isSecondSide && asana.requiresSides && currentSide && !isBrowseContext) {
        playSideCueFile(currentSide);
        return;
    }

    // ── Standard flow ────────────────────────────────────────────────────────
    const onMainAudioEnded = () => {
        if (isBrowseContext) return;
        if (asana.requiresSides && currentSide) {
            playSideCueFile(currentSide);
        }
    };

    playPoseMainAudio(asana, poseLabel, onMainAudioEnded, variationKey);
}

/**
 * Plays the main audio chain: Name → Bridge (random skip) → Variation.
 *
 * Bridge skip rule: each call independently rolls Math.random() against
 * BRIDGE_SKIP_PROBABILITY. No cross-pose state needed — stateless and robust.
 *
 * @param {object}   asana
 * @param {string}   [poseLabel]
 * @param {Function} [onComplete]
 * @param {string}   [variationKey]
 */
export function playPoseMainAudio(asana, poseLabel = null, onComplete = null, variationKey = null) {
    // Label-based side cue for non-requires_sides poses (sound FX only)
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

    // STEP 3: Variation audio
    const step3_Variation = () => {
        if (varAudio) playSrcInQueue(varAudio, onComplete);
        else if (onComplete) onComplete();
    };

    // STEP 2: Bridge audio — stateless random skip + multi-file variety
    const step2_Bridge = () => {
        if (!varAudio) { if (onComplete) onComplete(); return; }
        if (Math.random() < BRIDGE_SKIP_PROBABILITY) {
            step3_Variation();
            return;
        }
        // Pick randomly from however many bridge files exist in the manifest
        const allFiles   = window.serverAudioFiles || [];
        const bridges    = ["bridge_stage.mp3", "bridge_stage_2.mp3", "bridge_stage_3.mp3"]
                            .filter(f => allFiles.includes(f) || f === "bridge_stage.mp3");
        const bridgeFile = bridges[Math.floor(Math.random() * bridges.length)];
        playSrcInQueue(AUDIO_BASE + bridgeFile, step3_Variation);
    };

    // STEP 1: Main asana name audio
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
