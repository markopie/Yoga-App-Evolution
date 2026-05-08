// progressSummaryUI.js

import { renderLinkedSequenceDetailsHtml, sequenceNodeToDetailItem } from "./linkedSequenceDetails.js";

// ── Internal State (Closure) ─────────────────────────────────────────────────
let completionTracker = {};

/** Returns a copy of the current tracker state. */
export function getCompletionTracker() {
    return { ...completionTracker };
}

/** Wipes the tracker state. */
export function resetCompletionTracker() {
    completionTracker = {};
}

/** Restores the tracker state (e.g. from Resume). */
export function setCompletionTracker(data) {
    completionTracker = { ...data };
}

/** Called by the timer engine active tick to accumulate seconds for a pose. */
export function updateNodeCompletion(idx, seconds = 1) {
    if (idx === null || idx === undefined) return;
    if (!completionTracker[idx]) completionTracker[idx] = 0;
    completionTracker[idx] += seconds;
}

// Expose to window immediately for other modules
Object.assign(window, {
    getCompletionTracker,
    resetCompletionTracker,
    setCompletionTracker,
    updateNodeCompletion
});

export function setupProgressSummary() {
    const progressFillContainer = document.getElementById('timeDashboard');
    if (!progressFillContainer) return;

    progressFillContainer.style.cursor = 'pointer'; 
    progressFillContainer.addEventListener('click', renderProgressSummaryModal);
}

function renderProgressSummaryModal() {
    const activeList = typeof window.getActivePlaybackList === 'function' ? window.getActivePlaybackList() : [];
    const tracker = typeof window.getCompletionTracker === 'function' ? window.getCompletionTracker() : {};
    
    if (!activeList || activeList.length === 0) return;

    // 1. Group the active list by its original source index (node[5])
    const groups = [];
    const groupMap = {}; 

    activeList.forEach((node, playbackIdx) => {
        const origIdx = (node[5] !== undefined && node[5] !== null) ? node[5] : `p-${playbackIdx}`;
        
        const noteText = String(node[4] || "").toLowerCase();
        const labelText = String(node[6] || "").toLowerCase();
        const isTransition = noteText.includes("recovery") || labelText.includes("recovery") || 
                             noteText.includes("preparat") || labelText.includes("preparat") ||
                             noteText.includes("preparation");

        const sourceRow = typeof origIdx === 'number' ? window.currentSequence?.poses?.[origIdx] : null;
        const rawSourceId = Array.isArray(sourceRow?.[0]) ? sourceRow[0][0] : sourceRow?.[0];
        const macroNote = sourceRow?.[4] || "";

        if (!groupMap[origIdx]) {
            groupMap[origIdx] = {
                firstPlaybackIndex: playbackIdx,
                macroTitle: node[7]?.macroTitle || null,
                macroId: node[7]?.macroId || null,
                macroNote,
                firstAsanaInfo: null,
                label: node[6] || null, 
                variation: node[3] || null, // Capture parsed variation [code]
                rawId: Array.isArray(node[0]) ? node[0][0] : node[0],
                totalAllocated: 0,
                totalCompleted: 0,
                loopTotal: node[7]?.loopTotal || 1,
                detailItems: []
            };
            groups.push(groupMap[origIdx]);
        }
        const g = groupMap[origIdx];

        if (!isTransition) {
            // Capture first pose name and variation for linked sequence subtitle
            if (g.macroTitle && !g.firstAsanaInfo) {
                const asanaId = Array.isArray(node[0]) ? node[0][0] : node[0];
                const asanaMatch = window.findAsanaByIdOrPlate ? window.findAsanaByIdOrPlate(window.normalizePlate(asanaId)) : null;
                if (asanaMatch) {
                    const name = asanaMatch.english || asanaMatch.name;
                    let vTitle = node[3] || "";
                    // Look up human-friendly variation title if available
                    if (vTitle && asanaMatch.variations?.[vTitle]) {
                        vTitle = asanaMatch.variations[vTitle].title || vTitle;
                    }
                    g.firstAsanaInfo = vTitle ? `${name} (${vTitle})` : name;
                }
            }

            // Fallback for Macro ID if missing on the first node
            if (!g.macroId && node[7]?.macroId) {
                g.macroId = node[7].macroId;
            } else if (!g.macroId && g.macroTitle && rawSourceId) {
                if (String(rawSourceId || "").startsWith("MACRO:")) {
                    g.macroId = String(rawSourceId).replace("MACRO:", "").trim();
                }
            }

            g.rawId = Array.isArray(node[0]) ? node[0][0] : node[0];
            if (!g.macroTitle) g.macroTitle = node[7]?.macroTitle || null;
            g.label = node[6] || null;
            g.variation = node[3] || null;
            
            g.totalAllocated += Number(node[1] || 0);
            g.totalCompleted += Number(tracker[playbackIdx] || 0);

            if (g.macroTitle) {
                const detailItem = sequenceNodeToDetailItem(node, {
                    playbackIndex: playbackIdx,
                    completedSeconds: tracker[playbackIdx] || 0,
                    stripNotePrefix: g.macroNote,
                });
                if (detailItem) g.detailItems.push(detailItem);
            }
        }
    });

    // --- Dashboard Calculations ---
    const totalSections = groups.length;
    let completedSections = 0;

    groups.forEach(g => {
        const ratio = g.totalAllocated > 0 ? (g.totalCompleted / g.totalAllocated) : 0;
        if (ratio >= 0.9) completedSections++; 
    });

    const completionRatio = totalSections > 0 ? (completedSections / totalSections) : 0;
    const isSuccess = completionRatio >= 0.9; 
    const displayPercent = isSuccess ? 100 : Math.round(completionRatio * 100);
    
    const activeSeconds = window.playbackEngine ? window.playbackEngine.activePracticeSeconds : 0;
    const durationStr = typeof window.formatHMS === 'function' ? window.formatHMS(activeSeconds) : activeSeconds + 's';

    const dashboardHtml = `
        <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.03); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: ${isSuccess ? '#28a745' : 'inherit'};">${displayPercent}%</div>
                <div style="font-size: 0.7rem; text-transform: uppercase; opacity: 0.6;">Completion</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold;">${durationStr}</div>
                <div style="font-size: 0.7rem; text-transform: uppercase; opacity: 0.6;">Active Time</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold;">${completedSections} <span style="font-size: 1rem; opacity: 0.5;">/ ${totalSections}</span></div>
                <div style="font-size: 0.7rem; text-transform: uppercase; opacity: 0.6;">Sections Done</div>
            </div>
        </div>
    `;

    // 2. Create Modal Containers
    const backdrop = document.createElement('div');
    backdrop.className = 'progress-summary-backdrop';
    const modal = document.createElement('div');
    modal.className = 'progress-summary-modal';
    const header = document.createElement('div');
    header.className = 'progress-summary-header';
    header.innerHTML = `<h2>Practice Summary</h2><button id="closeSummaryBtnTop" class="progress-summary-close-top">&times;</button>`;
    const body = document.createElement('div');
    body.className = 'progress-summary-body';
    const footer = document.createElement('div');
    footer.className = 'progress-summary-footer';
    footer.innerHTML = `<button id="closeSummaryBtnBottom" class="progress-summary-close-btn">Close</button>`;

    // 3. Render Groups into the Table
    let html = `<table class="progress-summary-table">
                <thead><tr><th>Asana / Section</th><th style="text-align: right;">Status</th></tr></thead>
                <tbody>`;

    groups.forEach(g => {
        const ratio = g.totalAllocated > 0 ? (g.totalCompleted / g.totalAllocated) : 0;
        const isEffectivelyDone = ratio >= 0.9;
        const statusClass = isEffectivelyDone ? 'status-complete' : 'status-incomplete';

        // Data Resolution
        // For Macros, we ignore the 'asana' metadata of the last constituent pose to prevent leaks
        const asana = (!g.macroTitle && window.findAsanaByIdOrPlate) ? window.findAsanaByIdOrPlate(window.normalizePlate(g.rawId)) : null;
        
        // Jobsian: strip leading zeros from ID (e.g. 001 -> 1)
        const displayId = String(g.rawId || '').replace(/^0+/, '');
        
        let idBadge = "";
        if (g.macroTitle) {
            const mId = g.macroId || "";
            idBadge = mId ? `<span class="summary-id-badge">Sequence link ID ${mId}</span>` : "";
        } else if (displayId) {
            idBadge = `<span class="summary-id-badge">ID ${displayId}</span>`;
        }

        const primaryDisplay = g.macroTitle 
            ? `📦 ${g.macroTitle}` 
            : (asana?.english || g.label || asana?.name || `Pose ${g.rawId}`);

        let secondaryIast = asana?.iast || "";
        if (g.macroTitle) {
            secondaryIast = g.firstAsanaInfo ? `Starting with ${g.firstAsanaInfo}` : "Linked Sequence";
        }

        let subLabel = "";
        
        if (!g.macroTitle && g.variation) {
            const stageKey = String(g.variation).trim();
            const varObj = asana?.variations?.[stageKey];
            subLabel = varObj?.title || stageKey; 
        } else if (g.label && g.label !== primaryDisplay) {
            subLabel = g.label;
        }

        if (primaryDisplay.endsWith(` ${subLabel}`)) subLabel = ""; 

        const loopHtml = (g.loopTotal > 1 && !g.macroTitle) 
            ? `<div style="font-size:0.75rem; opacity:0.6; margin-top:2px;">${g.loopTotal} Rounds</div>` 
            : "";
        const linkedDetailsHtml = g.macroTitle
            ? renderLinkedSequenceDetailsHtml(g.detailItems, {
                summaryText: g.macroNote ? `Show poses for ${g.macroNote}` : "Show linked sequence poses",
                showCompletion: true,
                className: "linked-sequence-details--summary",
            })
            : "";

        const nameDisplayHtml = `
            <div class="progress-asana-stack">
                <div style="display: flex; align-items: center;">
                    ${idBadge}
                    <span class="progress-asana-name"><strong>${primaryDisplay}</strong></span>
                </div>
                ${secondaryIast ? `<span class="progress-asana-iast"><em>${secondaryIast}</em></span>` : ''}
                ${subLabel ? `<div class="progress-skip-tag" style="background:rgba(0,122,255,0.1); border-color:rgba(0,122,255,0.2); color:#007aff;">${subLabel}</div>` : ''}
                ${loopHtml}
                ${linkedDetailsHtml}
            </div>
        `;

        const timeTotalStr = typeof window.formatHMS === 'function' ? window.formatHMS(g.totalAllocated) : g.totalAllocated + 's';
        const statusIndicator = isEffectivelyDone 
            ? '<span class="progress-status-badge done">✓ Done</span>' 
            : `<span class="progress-status-badge partial">${Math.round(ratio * 100)}%</span>`;

        html += `
            <tr class="progress-summary-row ${statusClass}" data-index="${g.firstPlaybackIndex}">
                <td class="progress-cell-left">${nameDisplayHtml}</td>
                <td class="progress-cell-right" style="text-align: right;">
                    <div class="progress-time-total">${timeTotalStr}</div>
                    <div class="progress-status-wrapper" style="margin-top:4px;">${statusIndicator}</div>
                </td>
            </tr>`;
    });

    html += `</tbody></table>`;
    
    body.innerHTML = dashboardHtml + html;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // 5. Bind Events
    const closeModals = () => backdrop.remove();
    document.getElementById('closeSummaryBtnTop').addEventListener('click', closeModals);
    document.getElementById('closeSummaryBtnBottom').addEventListener('click', closeModals);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModals(); });

    modal.querySelectorAll('tr[data-index]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.linked-sequence-details')) return;
            const targetIndex = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            closeModals();
            if (typeof window.setCurrentIndex === 'function') window.setCurrentIndex(targetIndex);
            if (typeof window.stopTimer === 'function') window.stopTimer();
            if (typeof window.setPose === 'function') window.setPose(targetIndex);
        });
    });
}

window.setupProgressSummary = setupProgressSummary;
