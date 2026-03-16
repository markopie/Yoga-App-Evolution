// src/ui/statsUI.js
import { formatHMS } from "../utils/format.js";

export function updateTotalAndLastUI() {
    let total = 0;
    
    // 1. If the live player is active, sum the dialed times directly
    if (window.activePlaybackList && window.activePlaybackList.length > 0 && typeof window.getPosePillTime === "function") {
        total = window.activePlaybackList.reduce((acc, p) => acc + window.getPosePillTime(p), 0);
    } 
    // 2. Fallback: Calculate strict base time from sequence
    else if (window.currentSequence && typeof window.calculateTotalSequenceTime === "function") {
        total = window.calculateTotalSequenceTime(window.currentSequence);
    }

    const totalEl = document.getElementById("totalTimePill");
    if (totalEl) totalEl.textContent = `Total: ${formatHMS(total)}`;

    const lastEl = document.getElementById("lastCompletedPill");
    if (!lastEl) return;

    const title = window.currentSequence?.title ?? null;
    if (!title) {
        lastEl.textContent = "Last: –";
        return;
    }

    const source = (typeof window.serverHistoryCache !== "undefined" && Array.isArray(window.serverHistoryCache) && window.serverHistoryCache.length)
            ? window.serverHistoryCache
            : (typeof window.loadCompletionLog === "function" ? window.loadCompletionLog() : []);

    const last = source
        .filter(x => x && x.title === title && typeof x.ts === "number")
        .sort((a, b) => b.ts - a.ts)[0];

    lastEl.textContent = last
        ? `Last: ${new Date(last.ts).toLocaleString("en-AU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`
        : "Last: –";
}

window.updateTotalAndLastUI = updateTotalAndLastUI;