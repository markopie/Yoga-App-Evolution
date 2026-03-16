// src/ui/durationDial.js
// Duration Dial — controls hold-time scaling for the active sequence

import { $ } from "../utils/dom.js";
import { formatHMS } from "../utils/format.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { playbackEngine } from "../playback/timer.js";

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the current dial position (0–100, default 50). */
export function getDialPosition() {
    const dial = $("durationDial");
    return dial ? parseInt(dial.value, 10) : 50;
}

/**
 * Resolves the short / standard / long anchors for a pose.
 * Resolves the short / standard / long anchors for a pose.
 */
export function resolveDialAnchors(origDur, asana) {
    const hd = asana && window.getHoldTimes(asana);
    const defaultDur = origDur;
    const rawShort = (hd && typeof hd.short === "number") ? hd.short : defaultDur;
    const rawLong  = (hd && typeof hd.long  === "number") ? hd.long  : defaultDur;
    return {
        short:      Math.min(rawShort, defaultDur),
        defaultDur,
        long:       Math.max(rawLong,  defaultDur)
    };
}

/**
 * Linearly interpolates between the three anchors based on dial position.
 * pos 0   → short
 * pos 50  → defaultDur
 * pos 100 → long
 */
export function interpolateDuration(pos, short, defaultDur, long) {
    if (pos === 50) return defaultDur;
    if (pos < 50) {
        const t = pos / 50;
        return Math.round(short + (defaultDur - short) * t);
    }
    const t = (pos - 50) / 50;
    return Math.round(defaultDur + (long - defaultDur) * t);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI UPDATERS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// UI UPDATERS
// ─────────────────────────────────────────────────────────────────────────────

export function updateDialUI() {
    const dial  = $("durationDial");
    const wrap  = $("durationDialWrap");
    const label = $("durationDialLabel");
    const estEl = $("durationDialEst");
    if (!dial || !label) return;

    const pos = getDialPosition();

    if (pos === 50) {
        label.textContent = "Default";
    } else if (pos < 50) {
        label.textContent = pos === 0 ? "Shortest" : "Shorter";
    } else {
        label.textContent = pos === 100 ? "Longest" : "Longer";
    }

    if (wrap) {
        wrap.classList.remove("dial-faster", "dial-slower");
        if (pos > 50) wrap.classList.add("dial-faster");
        else if (pos < 50) wrap.classList.add("dial-slower");
    }

    const currentSequence = window.currentSequence;
    const originalPoses   = window.currentSequenceOriginalPoses || (currentSequence ? currentSequence.poses : null);
    
    if (estEl && currentSequence && originalPoses) {
        const total = originalPoses.reduce((s, p) => {
            const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
            const strId = String(rawId || "").trim();
            if (strId.startsWith("MACRO:") || strId.startsWith("LOOP")) return s;

            const noteStr = p[4] || "";
            const tierMatch = noteStr.match(/\btier:(S|L|STD)\b/i);
            const tier = tierMatch ? tierMatch[1].toUpperCase() : null;

            const asana = window.findAsanaByIdOrPlate ? window.findAsanaByIdOrPlate(normalizePlate(strId)) : null;
            const needsSides = asana && (asana.requiresSides === true || asana.requires_sides === true || asana.requiresSides === "true" || asana.requires_sides === "true");

            let trueBase = Number(p[1]) || 0;
            if (typeof window.getEffectiveTime === "function") {
                const effectiveTotal = window.getEffectiveTime(strId, p[1], tier);
                trueBase = needsSides ? Math.round(effectiveTotal / 2) : effectiveTotal;
            }

            const { short, defaultDur, long } = resolveDialAnchors(trueBase, asana);
            const dur = interpolateDuration(pos, short, defaultDur, long);
            
            return s + (needsSides ? dur * 2 : dur);
        }, 0);
        estEl.textContent = formatHMS(total);
    } else if (estEl) {
        estEl.textContent = "";
    }
}

export function applyDurationDial() {
    const currentSequence = window.currentSequence;
    if (!currentSequence) return;

    const dial = $("durationDial");
    if (!dial) return;

    const val      = Number(dial.value);
    const baseList = typeof window.getExpandedPoses === "function"
        ? window.getExpandedPoses(currentSequence)
        : currentSequence.poses;

    window.activePlaybackList = baseList.map(p => {
        const cloned = [...p];
        const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
        const strId = String(rawId || "").trim();

        if (strId.startsWith("MACRO:") || strId.startsWith("LOOP")) return cloned;

        const asana = window.findAsanaByIdOrPlate ? window.findAsanaByIdOrPlate(normalizePlate(strId)) : null;
        
        const noteStr = cloned[4] || "";
        const tierMatch = noteStr.match(/\btier:(S|L|STD)\b/i);
        const tier = tierMatch ? tierMatch[1].toUpperCase() : null;

        const needsSides = asana && (asana.requiresSides === true || asana.requires_sides === true || asana.requiresSides === "true" || asana.requires_sides === "true");
        
        // 🌟 Use the True Base Time instead of the library standard
        let trueBase = Number(cloned[1]) || 30;
        if (typeof window.getEffectiveTime === "function") {
            const effectiveTotal = window.getEffectiveTime(strId, cloned[1], tier);
            trueBase = needsSides ? Math.round(effectiveTotal / 2) : effectiveTotal;
        }

        const { short, defaultDur, long } = resolveDialAnchors(trueBase, asana);
        cloned[1] = interpolateDuration(val, short, defaultDur, long);

        return cloned;
    });

    // Label
    const label = $("durationDialLabel");
    if (label) {
        if (val === 50)      label.textContent = "Standard Holds";
        else if (val < 50)   label.textContent = "Shorter Holds (-)";
        else                 label.textContent = "Longer Holds (+)";
    }

    // Update live timer if mid-pose
    const currentIndex = window.currentIndex || 0;
    if (window.activePlaybackList[currentIndex]) {
        const newPoseSeconds = Number(window.activePlaybackList[currentIndex][1]) || 0;
        if (playbackEngine.currentPoseSeconds > 0) {
            const ratio = playbackEngine.remaining / playbackEngine.currentPoseSeconds;
            playbackEngine.remaining = Math.round(newPoseSeconds * ratio);
        } else {
            playbackEngine.remaining = newPoseSeconds;
        }
        playbackEngine.currentPoseSeconds = newPoseSeconds;
    }

    if (typeof window.updateTimerUI === "function") {
        window.updateTimerUI(playbackEngine.remaining, playbackEngine.currentPoseSeconds);
    }

    if (typeof window.builderRender === "function") window.builderRender();
}



/**
 * Snaps the dial back to 50 (default) and triggers all downstream updates.
 */
export function dialReset() {
    const dial = $("durationDial");
    if (!dial) return;
    dial.value = 50;
    updateDialUI();
    applyDurationDial();
    if (window.currentSequence && typeof window.setPose === "function") {
        window.setPose(window.currentIndex || 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

/** Attaches all dial listeners once the DOM is available. */
function wireDial() {
    const durationDial = $("durationDial");
    if (durationDial) {
        durationDial.addEventListener("input", () => {
            // Magnetic snap to centre
            let val = parseInt(durationDial.value, 10);
            if (val > 45 && val < 55) durationDial.value = 50;

            updateDialUI();
            if (window.currentSequence) applyDurationDial();
        });

        durationDial.addEventListener("change", () => {
            if (window.currentSequence) applyDurationDial();
        });

        durationDial.addEventListener("dblclick", () => {
            durationDial.value = 50;
            updateDialUI();
            if (window.currentSequence) applyDurationDial();
        });
    }

    // Mobile reset button
    const resetBtn = $("dialResetBtn");
    if (resetBtn) {
        const performReset = (e) => {
            const dial = $("durationDial");
            if (!dial) return;
            if (e.cancelable) e.preventDefault();
            dial.value = 50;
            dial.dispatchEvent(new Event("input", { bubbles: true }));
            dial.dispatchEvent(new Event("change", { bubbles: true }));
            updateDialUI();
        };
        resetBtn.addEventListener("touchend", performReset, { passive: false });
        resetBtn.addEventListener("click", performReset);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDial);
} else {
    wireDial();
}

// Expose functions window-wide for legacy calls from app.js

window.resolveDialAnchors = resolveDialAnchors;
window.interpolateDuration = interpolateDuration;
window.updateDialUI    = updateDialUI;
window.applyDurationDial = applyDurationDial;
window.dialReset       = dialReset;