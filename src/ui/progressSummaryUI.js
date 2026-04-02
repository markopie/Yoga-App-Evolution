// progressSummaryUI.js

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
        
        // Detect if this specific node is an auto-injected transition (Prep/Recovery)
        const noteText = String(node[4] || "").toLowerCase();
        const labelText = String(node[6] || "").toLowerCase();
        const isTransition = noteText.includes("recovery") || labelText.includes("recovery") || 
                             noteText.includes("preparat") || labelText.includes("preparat") ||
                             noteText.includes("preparation");

        if (!groupMap[origIdx]) {
            groupMap[origIdx] = {
                firstPlaybackIndex: playbackIdx,
                macroTitle: node[7]?.macroTitle || null,
                label: node[6] || null, 
                rawId: Array.isArray(node[0]) ? node[0][0] : node[0],
                totalAllocated: 0,
                totalCompleted: 0,
                loopTotal: node[7]?.loopTotal || 1 
            };
            groups.push(groupMap[origIdx]);
        }
        const g = groupMap[origIdx];

        // If this node is NOT a transition, ensure it "wins" the naming/metadata for the group
        // and include its duration in the row totals.
        if (!isTransition) {
            g.rawId = Array.isArray(node[0]) ? node[0][0] : node[0];
            if (!g.macroTitle) g.macroTitle = node[7]?.macroTitle || null;
            g.label = node[6] || null;
            
            g.totalAllocated += Number(node[1] || 0);
            g.totalCompleted += Number(tracker[playbackIdx] || 0);
        }
    });

    // --- NEW: Dashboard Calculations ---
    const totalSections = groups.length;
    let completedSections = 0;

    groups.forEach(g => {
        const ratio = g.totalAllocated > 0 ? (g.totalCompleted / g.totalAllocated) : 0;
        if (ratio >= 0.9) completedSections++; // 90% threshold for an individual section
    });

    const completionRatio = totalSections > 0 ? (completedSections / totalSections) : 0;
    // The Hidden 90% Rule applied to the overall score:
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
    // -----------------------------------

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

    // 3. Render Groups into the Body
    let html = `<table class="progress-summary-table">
                <thead><tr><th>Asana / Section</th><th style="text-align: right;">Status</th></tr></thead>
                <tbody>`;

    groups.forEach(g => {
        const ratio = g.totalAllocated > 0 ? (g.totalCompleted / g.totalAllocated) : 0;
        const isEffectivelyDone = ratio >= 0.9;
        const statusClass = isEffectivelyDone ? 'status-complete' : 'status-incomplete';

        // 1. Resolve Data using Schema-aligned fields
        const asana = window.findAsanaByIdOrPlate ? window.findAsanaByIdOrPlate(window.normalizePlate(g.rawId)) : null;
        // 2. Define Components
        ;const primaryDisplay = g.macroTitle 
        ? `📦 ${g.macroTitle}` 
        : (asana?.english || g.label || asana?.name || `Pose ${g.rawId}`);

        const secondaryIast = asana?.iast || "";

        // 3. Variation Logic: Clean the label
        // If the label (e.g. "I") is already at the end of the primary name, don't repeat it as a subtitle.
        let subLabel = (g.label && g.label !== primaryDisplay) ? g.label : "";
        if (primaryDisplay.endsWith(` ${subLabel}`)) subLabel = ""; 

        // 4. Final Jobsian HTML Construction
        const nameDisplay = `
            <div class="progress-asana-stack">
                <span class="progress-asana-name">${primaryDisplay}</span>
                ${secondaryIast ? `<span class="progress-asana-iast">${secondaryIast}</span>` : ''}
                ${subLabel ? `<div class="progress-variation-label">${subLabel}</div>` : ''}
            </div>
        `;
        if (g.loopTotal > 1 && !g.macroTitle) {
            nameDisplay += `<div style="font-size:0.75rem; opacity:0.6; margin-top:2px;">${g.loopTotal} Rounds</div>`;
        }

        const timeTotalStr = typeof window.formatHMS === 'function' ? window.formatHMS(g.totalAllocated) : g.totalAllocated + 's';
        const statusIndicator = isEffectivelyDone 
        
            ? '<span class="progress-status-badge done">✓ Done</span>' 
            : `<span class="progress-status-badge partial">${Math.round(ratio * 100)}%</span>`;

        html += `
            <tr class="progress-summary-row ${statusClass}" data-index="${g.firstPlaybackIndex}">
                <td class="progress-cell-left">${nameDisplay}</td>
                <td class="progress-cell-right" style="text-align: right;">
                    <div class="progress-time-total">${timeTotalStr}</div>
                    <div class="progress-status-wrapper" style="margin-top:4px;">${statusIndicator}</div>
                </td>
            </tr>`;
    });

    html += `</tbody></table>`;
    
    // Inject the Dashboard ABOVE the table
    body.innerHTML = dashboardHtml + html;

    // 4. Assemble & Display
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
            const targetIndex = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            closeModals();
            if (typeof window.setCurrentIndex === 'function') window.setCurrentIndex(targetIndex);
            if (typeof window.stopTimer === 'function') window.stopTimer();
            if (typeof window.setPose === 'function') window.setPose(targetIndex);
        });
    });
}

// Expose to window
window.setupProgressSummary = setupProgressSummary;