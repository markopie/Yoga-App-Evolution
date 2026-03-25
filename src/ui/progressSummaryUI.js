export function setupProgressSummary() {
    const progressFillContainer = document.getElementById('timeDashboard');
    if (!progressFillContainer) return;

    progressFillContainer.style.cursor = 'pointer'; // Safe single inline style for a dynamic interaction trigger
    progressFillContainer.addEventListener('click', renderProgressSummaryModal);
}

function renderProgressSummaryModal() {
    const activeList = typeof window.getActivePlaybackList === 'function' ? window.getActivePlaybackList() : [];
    const tracker = typeof window.getCompletionTracker === 'function' ? window.getCompletionTracker() : {};
    
    if (!activeList || activeList.length === 0) return;

    // 1. Create Modal Container
    const backdrop = document.createElement('div');
    backdrop.className = 'progress-summary-backdrop';

    const modal = document.createElement('div');
    modal.className = 'progress-summary-modal';

    // 2. Header
    const header = document.createElement('div');
    header.className = 'progress-summary-header';
    header.innerHTML = `
        <h2>Practice Summary</h2>
        <button id="closeSummaryBtnTop" class="progress-summary-close-top">&times;</button>
    `;

    // 3. Body
    const body = document.createElement('div');
    body.className = 'progress-summary-body';

    let html = `
        <table class="progress-summary-table">
        <thead>
            <tr>
                <th>Asana</th>
                <th style="text-align: right;">Progress</th>
            </tr>
        </thead>
        <tbody>
    `;

    activeList.forEach((node, index) => {
        if (!Array.isArray(node)) return;

        const allocated = Number(node[1] || 0);
        const completed = Number(tracker[index] || 0);
        const left = Math.max(0, allocated - completed);
        
        const note = String(node[4] || "").toLowerCase();
        const poseNameStr = String(node[6] || "").toLowerCase();
        const isSkipType = note.includes("recovery") || poseNameStr.includes("recovery") || 
                           note.includes("preparat") || poseNameStr.includes("preparat");
        
        const rawId = Array.isArray(node[0]) ? node[0][0] : node[0];
        let displayNameHtml = `<span class="progress-asana-name">${node[6] || `Pose ${rawId}`}</span>`;

        if (typeof window.findAsanaByIdOrPlate === 'function' && typeof window.normalizePlate === 'function') {
            const asana = window.findAsanaByIdOrPlate(window.normalizePlate(rawId));
            if (asana) {
                const english = asana.english_name || asana.english || asana.name || "";
                const iast = asana.iast || "";
                
                if (english && iast) {
                    displayNameHtml = `<span class="progress-asana-name">${english}</span><span class="progress-asana-iast">${iast}</span>`;
                } else if (english || iast) {
                    displayNameHtml = `<span class="progress-asana-name">${english || iast}</span>`;
                }
            }
        }
        
        const statusClass = (!isSkipType && allocated > 0 && (completed/allocated < 0.9)) 
            ? 'status-incomplete' 
            : 'status-complete';

        const timeFormatted = typeof window.formatHMS === 'function' ? window.formatHMS(allocated) : allocated + 's';

        html += `<tr class="progress-summary-row ${statusClass}" data-index="${index}">
                    <td class="progress-cell-left">
                        ${displayNameHtml}
                        ${isSkipType ? '<div><span class="progress-skip-tag">Skip Allowed</span></div>' : ''}
                    </td>
                    <td class="progress-cell-right">
                        <div class="progress-time-fraction">${completed}s <span class="progress-time-total">/ ${timeFormatted}</span></div>
                        <div class="progress-time-left">${left > 0 ? left + 's left' : '<span class="progress-time-done">Done ✓</span>'}</div>
                    </td>
                 </tr>`;
    });

    html += `</tbody></table>`;
    body.innerHTML = html;

    // 4. Footer
    const footer = document.createElement('div');
    footer.className = 'progress-summary-footer';
    footer.innerHTML = `<button id="closeSummaryBtnBottom" class="progress-summary-close-btn">Close</button>`;

    // Assemble
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
            if (typeof window.setCurrentIndex === 'function') window.setCurrentIndex(targetIndex);
            
            closeModals();
            
            if (typeof window.stopTimer === 'function') window.stopTimer();
            if (typeof window.setPose === 'function') {
                window.setPose(targetIndex); 
            } else if (typeof window.loadPoseAtIndex === 'function') {
                window.loadPoseAtIndex(targetIndex);
            }
        });
    });
}

// Expose to window
window.setupProgressSummary = setupProgressSummary;