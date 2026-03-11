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
 */
export function playAsanaAudio(asana, poseLabel = null, isBrowseContext = false, currentSide = null) {
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
    playPoseMainAudio(asana, poseLabel, onMainAudioEnded);
}
 
export function playPoseMainAudio(asana, poseLabel = null, onComplete = null) {
    // 1. Side Detection (Visual/Sound Effect only)
    if (poseLabel && !asana.requiresSides) {
       const side = detectSide(poseLabel);
       if (side) setTimeout(() => playSideCue(side), 100);
    }
 
    // 2. Prepare IDs
    const rawID = asana.asanaNo || asana.id; 
    const idStr = normalizePlate(rawID);
    
    // Helper to play and attach the 'onended' listener
    const playSrc = (src) => {
        const a = new Audio(src);
        // CRITICAL: Attach the callback so side audio plays next
        if (onComplete) {
            a.onended = onComplete;
        }
        a.play()
            .then(() => { currentAudio = a; })
            .catch(e => {
                // If main audio fails, still trigger callback so flow continues
                if (onComplete) onComplete();
            });
    };

    // 3. Use database-provided audio URL if present
    if (asana.audio) {
       playSrc(asana.audio);
       return;
    }
 
    // 4. SMART FALLBACK (Manifest Lookup)
    const fileList = window.serverAudioFiles || [];
    
    if (fileList.length > 0 && idStr) {
        // Look for "001_Name.mp3" OR "001.mp3"
        const match = fileList.find(f => f.startsWith(`${idStr}_`) || f === `${idStr}.mp3`);
        
        if (match) {
            playSrc(AUDIO_BASE + match);
            return;
        }
    }

    // 5. Legacy Fallback
    if (!idStr) { 
        if (onComplete) onComplete(); 
        return; 
    } 

    const safeName = (asana.english || asana.name || "").replace(/[^a-zA-Z0-9]/g, "");
    const candidate = `${AUDIO_BASE}${idStr}_${safeName}.mp3`;
    
    const a = new Audio(candidate);
    if (onComplete) a.onended = onComplete;
    a.play().catch(() => {
        if (onComplete) onComplete();
    });
}

// Make globally accessible since UI elements might trigger them from HTML attributes or global bindings
window.playAsanaAudio = playAsanaAudio;
window.playFaintGong = playFaintGong;
window.playPoseMainAudio = playPoseMainAudio;
