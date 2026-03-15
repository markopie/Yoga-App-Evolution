import { AUDIO_BASE } from '../config/appConfig.js';
import { normalizePlate } from '../services/dataAdapter.js';

let currentAudio = null;
let audioCtx = null;

export function playFaintGong() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        const t0 = audioCtx.currentTime + 0.02;

        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        o1.type = "sine";
        o2.type = "sine";
        o1.frequency.setValueAtTime(432, t0);
        o2.frequency.setValueAtTime(864, t0);

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

        o1.connect(g);
        o2.connect(g);
        g.connect(audioCtx.destination);

        o1.start(t0);
        o2.start(t0);
        o1.stop(t0 + 2.0);
        o2.stop(t0 + 2.0);
    } catch (e) {}
}

function detectSide(poseLabel) {
    if (!poseLabel) return null;
    const label = poseLabel.toLowerCase();
    if (label.includes("(right)") || label.includes("right side")) return "right";
    if (label.includes("(left)") || label.includes("left side")) return "left";
    return null;
}

export function playSideCue(side) {
    if (!side) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = side === "right" ? 800 : 600;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
}

export function playAsanaAudio(asana, poseLabel = null, isBrowseContext = false, currentSide = null) {
    if (!asana) return;

    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        } catch (e) {}
        currentAudio = null;
    }

    const onMainAudioEnded = () => {
        if (isBrowseContext) return;

        if (asana.requiresSides && currentSide) {
            const sideUrl = AUDIO_BASE + `${currentSide}_side.mp3`;
            const sideAudio = new Audio(sideUrl);
            
            sideAudio.play().catch(e => console.warn(`Failed to play ${currentSide}_side.mp3:`, e));
            currentAudio = sideAudio;
        }
    };

    playPoseMainAudio(asana, poseLabel, onMainAudioEnded);
}

function playPoseMainAudio(asana, poseLabel = null, onComplete = null) {
    if (poseLabel && !asana.requiresSides) {
        const side = detectSide(poseLabel);
        if (side) setTimeout(() => playSideCue(side), 100);
    }

    const rawID = asana.asanaNo || asana.id;
    const idStr = normalizePlate(rawID);

    const playSrc = (src) => {
        const a = new Audio(src);
        if (onComplete) {
            a.onended = onComplete;
        }
        a.play()
            .then(() => { currentAudio = a; })
            .catch(e => {
                if (onComplete) onComplete();
            });
    };

    if (asana.audio) {
        playSrc(asana.audio);
        return;
    }

    const fileList = window.serverAudioFiles || [];
    
    if (fileList.length > 0 && idStr) {
        const match = fileList.find(f => f.startsWith(`${idStr}_`) || f === `${idStr}.mp3`);
        
        if (match) {
            playSrc(AUDIO_BASE + match);
            return;
        }
    }

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
