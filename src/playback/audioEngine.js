// src/playback/audioEngine.js

import { AUDIO_BASE } from "../config/appConfig.js";
import { normalizePlate } from "../services/dataAdapter.js";

// Keep track of the currently playing audio in this module directly
let currentAudio = null;
let audioCtx = null;

export function getCurrentAudio() {
    return currentAudio;
}

export function setCurrentAudio(audio) {
    currentAudio = audio;
}

// -------- Faint gong (Oscillator) --------
// Used by timer to decide if gong plays
export function playFaintGong() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        const t0 = audioCtx.currentTime + 0.02;

        // Create Sound Generators
        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        // Configure Tones (432Hz + 864Hz harmonic)
        o1.type = "sine";
        o2.type = "sine";
        o1.frequency.setValueAtTime(432, t0);
        o2.frequency.setValueAtTime(864, t0);

        // Configure Volume Envelope (Fade in/out)
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

        // Connect & Play
        o1.connect(g);
        o2.connect(g);
        g.connect(audioCtx.destination);

        o1.start(t0);
        o2.start(t0);
        o1.stop(t0 + 2.0);
        o2.stop(t0 + 2.0);
    } catch (e) {}
}

// -------- Side Detection Logic --------
export function detectSide(poseLabel) {
    if (!poseLabel) return null;
    const label = poseLabel.toLowerCase();
    if (label.includes("(right)") || label.includes("right side")) return "right";
    if (label.includes("(left)") || label.includes("left side")) return "left";
    return null;
}

export function playSideCue(side) {
    if (!side) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Different frequencies for left and right
        oscillator.frequency.value = side === "right" ? 800 : 600;
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}

// -------- Audio File Player (MP3) --------

/**
 * Orchestrates the audio playback sequence.
 * New Logic: Plays Main Name -> THEN plays Side Cue (if needed).
 * @param {boolean} isBrowseContext - If true, skips side cues (for Browse menu).
 * @param {string} variationKey - Key for the current variation/stage.
 */
export function playAsanaAudio(asana, poseLabel = null, isBrowseContext = false, currentSide = null, variationKey = null) {
    if (!asana) return;
 
    // 1. Reset current audio
    if (currentAudio) {
       try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
       currentAudio = null;
    }
 
    // 2. Define what happens AFTER the main name finishes
    const onMainAudioEnded = () => {
        // If we are browsing, or if sides aren't required, stop here.
        if (isBrowseContext) return;
        
        // Play side audio (Right/Left) AFTER main audio
        if (asana.requiresSides && currentSide) {
           // Use AUDIO_BASE to ensure we fetch from the server
           const sideUrl = AUDIO_BASE + `${currentSide}_side.mp3`; 
           const sideAudio = new Audio(sideUrl);
           
           sideAudio.play().catch(e => console.warn(`Failed to play ${currentSide}_side.mp3:`, e));
           
           // Track this as current so we can pause it if the user clicks "Stop"
           currentAudio = sideAudio; 
        }
    };
 
    // 3. Play Main Audio immediately, then trigger the callback
    playPoseMainAudio(asana, poseLabel, onMainAudioEnded, variationKey);
}
 
export function playPoseMainAudio(asana, poseLabel = null, onComplete = null, variationKey = null) {
    // 1. Side Detection (Sound FX only if applicable)
    if (poseLabel && !asana.requiresSides) {
       const side = detectSide(poseLabel);
       if (side) setTimeout(() => playSideCue(side), 100);
    }
 
    /**
     * Helper to play an audio source and call the next function in the chain.
     */
    const playSrcInQueue = (src, nextStep) => {
        if (!src) {
            if (nextStep) nextStep();
            return;
        }

        const a = new Audio(src);
        
        // If there's a next step, trigger it when this segment ends.
        // Otherwise, trigger the final onComplete callback.
        if (nextStep) {
            a.onended = nextStep;
        } else if (onComplete) {
            a.onended = onComplete;
        }

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

    // STEP 3: PLAY VARIATION AUDIO
    const step3_Variation = () => {
        if (varAudio) {
            playSrcInQueue(varAudio, onComplete);
        } else if (onComplete) {
            onComplete();
        }
    };

    // STEP 2: PLAY BRIDGE AUDIO ("With variation")
    const step2_Bridge = () => {
        if (varAudio) {
            // bridge_stage.mp3 is expected in the AUDIO_BASE directory
            playSrcInQueue(AUDIO_BASE + "bridge_stage.mp3", step3_Variation);
        } else {
            // No variation audio to play, skip to end/complete
            if (onComplete) onComplete();
        }
    };

    // STEP 1: PLAY MAIN ASANA AUDIO
    const step1_Main = () => {
        let mainSrc = asana.audio;

        // Fallback Logic if no explicit .audio URL
        if (!mainSrc) {
            const rawID = asana.asanaNo || asana.id; 
            const idStr = normalizePlate(rawID);
            const fileList = window.serverAudioFiles || [];
            
            const match = fileList.find(f => f.startsWith(`${idStr}_`) || f === `${idStr}.mp3`);
            if (match) {
                mainSrc = AUDIO_BASE + match;
            } else if (idStr) {
                const safeName = (asana.english || asana.name || "").replace(/[^a-zA-Z0-9]/g, "");
                mainSrc = `${AUDIO_BASE}${idStr}_${safeName}.mp3`;
            }
        }

        if (mainSrc) {
            playSrcInQueue(mainSrc, step2_Bridge);
        } else {
            // If even main fails, try to jump to bridge/variation
            step2_Bridge();
        }
    };

    // START THE QUEUE
    step1_Main();
}

// Make globally accessible since UI elements might trigger them from HTML attributes or global bindings
window.playAsanaAudio = playAsanaAudio;
window.playFaintGong = playFaintGong;
window.playPoseMainAudio = playPoseMainAudio;
