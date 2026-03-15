// src/ui/statsUI.js
//
// Renders the "Total Time" and "Last Completed" pills in the main header.
// All external state is accessed through window.* so this module has no
// hard imports — it can be imported from app.js without creating new module
// instances or duplicate Supabase clients.

import { formatHMS } from "../utils/format.js";

/**
 * Updates the Total Time and Last Completed UI pills based on the current
 * active playback list and server history cache.
 *
 * Reads from window:
 *   - window.activePlaybackList  — expanded pose list (may include injected poses)
 *   - window.currentSequence     — the currently selected sequence object
 *   - window.findAsanaByIdOrPlate — library lookup function
 *   - window.serverHistoryCache  — array of completion records
 */
export function updateTotalAndLastUI() {
    // 1. Prefer the expanded playback list (includes injected prep/recovery poses)
    const poses =
        (window.activePlaybackList && window.activePlaybackList.length > 0)
            ? window.activePlaybackList
            : (window.currentSequence?.poses ?? []);

    // 2. Sum total time (double for bilateral poses)
    const total = poses.reduce((acc, p) => {
        const duration = Number(p?.[1]) || 0;
        const idField  = p?.[0];
        const id       = Array.isArray(idField) ? idField[0] : idField;

        const asana =
            typeof window.findAsanaByIdOrPlate === "function"
                ? window.findAsanaByIdOrPlate(id)
                : null;

        return acc + (asana?.requiresSides ? duration * 2 : duration);
    }, 0);

    // 3. Render total time pill
    const totalEl = document.getElementById("totalTimePill");
    if (totalEl) totalEl.textContent = `Total: ${formatHMS(total)}`;

    // 4. Render last-completed pill
    const lastEl = document.getElementById("lastCompletedPill");
    if (!lastEl) return;

    const title = window.currentSequence?.title ?? null;
    if (!title) {
        lastEl.textContent = "Last: –";
        return;
    }

    // Prefer live server cache; fall back to local log
    const source =
        (typeof window.serverHistoryCache !== "undefined" &&
         Array.isArray(window.serverHistoryCache) &&
         window.serverHistoryCache.length)
            ? window.serverHistoryCache
            : (typeof window.loadCompletionLog === "function"
                ? window.loadCompletionLog()
                : []);

    const last = source
        .filter(x => x && x.title === title && typeof x.ts === "number")
        .sort((a, b) => b.ts - a.ts)[0];

    lastEl.textContent = last
        ? `Last: ${new Date(last.ts).toLocaleString("en-AU", {
              year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit",
          })}`
        : "Last: –";
}

// Expose globally so legacy callers (e.g. wiring.js) can still call by name
window.updateTotalAndLastUI = updateTotalAndLastUI;
