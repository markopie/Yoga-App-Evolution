import { $ } from '../utils/dom.js'; // Assuming $ is your document.querySelector wrapper


export function setupProgressSummary() {
    const progressFillContainer = document.getElementById('timeDashboard');
    if (!progressFillContainer) return;

    progressFillContainer.style.cursor = 'pointer';
    
    // Bind the click event to render the modal
    progressFillContainer.addEventListener('click', () => {
        renderProgressSummaryModal();
    });
}

function renderProgressSummaryModal() {
    const activeList = typeof window.getActivePlaybackList === 'function' ? window.getActivePlaybackList() : [];
    const tracker = typeof window.getCompletionTracker === 'function' ? window.getCompletionTracker() : {};
    
    if (!activeList || activeList.length === 0) return;

    // 1. Create Modal Container
    const modal = document.createElement('div');
    modal.id = 'progressSummaryModal';
    modal.style.cssText = `
        position: fixed; top: 10%; left: 10%; width: 80%; max-height: 80vh;
        background: white; z-index: 9999; overflow-y: auto; padding: 20px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; color: #333;
    `;

    // 2. Build Table
    let html = `<h2>Practice Summary</h2>
                <table style="width: 100%; text-align: left; border-collapse: collapse;">
                <tr style="border-bottom: 2px solid #ccc;">
                    <th style="padding: 8px 0;">Asana</th>
                    <th>Allocated</th>
                    <th>Completed</th>
                    <th>Left</th>
                </tr>`;

    activeList.forEach((node, index) => {
        if (!Array.isArray(node)) return;

        const allocated = Number(node[1] || 0);
        const completed = Number(tracker[index] || 0);
        const left = Math.max(0, allocated - completed);
        
        const note = String(node[4] || "").toLowerCase();
        const poseNameStr = String(node[6] || "").toLowerCase();
        const isSkipType = note.includes("recovery") || poseNameStr.includes("recovery") || 
                           note.includes("preparat") || poseNameStr.includes("preparat");
        
        // --- NEW: ASANA DATA RESOLUTION ---
        const rawId = Array.isArray(node[0]) ? node[0][0] : node[0];
        let displayNameHtml = node[6] || `Pose ${rawId}`; // Fallback

        // Safely look up the actual asana object using existing utility functions
        if (typeof window.findAsanaByIdOrPlate === 'function' && typeof window.normalizePlate === 'function') {
            const asana = window.findAsanaByIdOrPlate(window.normalizePlate(rawId));
            if (asana) {
                const english = asana.english_name || asana.english || asana.name || "";
                const iast = asana.iast || "";
                
                // Format nicely: English on top (bold), IAST underneath (italic/grey)
                if (english && iast) {
                    displayNameHtml = `<strong>${english}</strong><br><span style="font-size:0.85em; color:#666;"><em>${iast}</em></span>`;
                } else if (english || iast) {
                    displayNameHtml = `<strong>${english || iast}</strong>`;
                }
            }
        }
        // ----------------------------------
        
        // Highlight rows that haven't hit the 90% threshold (if not a skipped type)
        const rowStyle = (!isSkipType && allocated > 0 && (completed/allocated < 0.9)) 
            ? 'color: #d32f2f;' // Red
            : 'color: #388e3c;'; // Green

        html += `<tr style="${rowStyle} cursor: pointer; border-bottom: 1px solid #eee;" data-index="${index}">
                    <td style="padding: 10px 0; line-height: 1.4;">
                        ${displayNameHtml}
                        ${isSkipType ? '<br><span style="font-size:0.75em; background:#eee; padding:2px 4px; border-radius:4px; color:#666; display:inline-block; margin-top:4px;">(Skip Allow)</span>' : ''}
                    </td>
                    <td>${typeof window.formatHMS === 'function' ? window.formatHMS(allocated) : allocated + 's'}</td>
                    <td>${completed}s</td>
                    <td>${left}s</td>
                 </tr>`;
    });

    html += `</table><button id="closeSummaryModal" style="margin-top: 15px; padding: 8px 16px; cursor: pointer;">Close</button>`;
    modal.innerHTML = html;

    // 3. Attach to DOM
    document.body.appendChild(modal);

    // 4. Bind Events
    document.getElementById('closeSummaryModal').addEventListener('click', () => {
        modal.remove();
    });

    modal.querySelectorAll('tr[data-index]').forEach(row => {
        row.addEventListener('click', (e) => {
            const targetIndex = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            
            // 1. Update the state's index
            if (typeof window.setCurrentIndex === 'function') window.setCurrentIndex(targetIndex);
            
            // 2. Close the summary modal
            modal.remove();
            
            // 3. Pause the timer to prevent auto-starting a mid-sequence jump
            if (typeof window.stopTimer === 'function') window.stopTimer();
            
            // 4. Trigger the UI to render the new pose
            // 👉 CHANGE THIS to window.loadPoseAtIndex if that is your app's actual function name!
            if (typeof window.setPose === 'function') {
                window.setPose(targetIndex); 
            } else if (typeof window.loadPoseAtIndex === 'function') {
                window.loadPoseAtIndex(targetIndex);
            }
        });
    });
}

// CRITICAL: Expose to window so init() can call it
window.setupProgressSummary = setupProgressSummary;