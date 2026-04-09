import { builderState } from '../store/builderState.js';

export function updateBuilderModeUI() {
    const backdrop = document.getElementById("editCourseBackdrop");
    const toggleBtn = document.getElementById("builderModeToggleBtn");
    const saveBtn = document.getElementById("editCourseSaveBtn");
    const cancelBtn = document.getElementById("editCourseCancelBtn");
    const printBtn = document.getElementById("builderPrintBtn");
    const topCloseBtn = document.getElementById("editCourseCloseBtn"); 
    
    const viewHeader = document.getElementById("viewModeHeader");
    const editHeader = document.getElementById("editModeHeader");
    
    const displayTitle = document.getElementById("displayTitle");
    const displayCategory = document.getElementById("displayCategory"); 
    const inputCategory = document.getElementById("builderCategory"); 
    const inputTitle = document.getElementById("builderTitle");       

    if (topCloseBtn) topCloseBtn.style.display = "none";

    if (builderState.isViewMode) {
        backdrop.classList.add("builder-view-mode");
        
        // 🔒 LOCK INPUTS: Prevent typing/keyboard in View Mode
        if (inputCategory) inputCategory.readOnly = true;
        if (inputTitle) inputTitle.readOnly = true;
        
        if (displayTitle && inputTitle) {
            displayTitle.textContent = inputTitle.value.trim() || "Untitled Sequence";
        }
        
        // 🌟 BREADCRUMB LOGIC
        if (displayCategory && inputCategory) {
            const rawVal = inputCategory.value.trim();
            if (!rawVal) {
                displayCategory.style.display = "none";
                displayCategory.innerHTML = "";
            } else {
                displayCategory.style.display = "flex";
                const parts = rawVal.split('>').map(p => p.trim()).filter(Boolean);
                
                displayCategory.innerHTML = parts.map((p, i) => {
                    const isLast = i === parts.length - 1;
                    const pill = `<span style="background:#e3f2fd; color:#005580; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; white-space:normal; word-break:break-word; text-align:left;">${p}</span>`;
                    const sep = !isLast ? `<span style="color:#86868b; font-weight:bold; font-size:1.1rem; margin-top:-2px;">›</span>` : '';
                    return pill + (sep ? ` ${sep} ` : '');
                }).join('');
            }
        }

        if (editHeader) editHeader.style.display = "none";
        if (viewHeader) viewHeader.style.display = "flex";

        if (toggleBtn) {
            toggleBtn.innerHTML = "✏️ Edit";
            toggleBtn.style.background = "#f5f5f7";
            toggleBtn.style.color = "#1d1d1f";
            toggleBtn.style.borderColor = "#d2d2d7";
        }
        if (printBtn) printBtn.style.display = "inline-block";
        if (saveBtn) saveBtn.style.display = "none";
        if (cancelBtn) {
            cancelBtn.textContent = "Close";
            cancelBtn.style.background = "#007aff";
            cancelBtn.style.color = "#fff";
            cancelBtn.style.border = "none";
        }
        
    } else {
        backdrop.classList.remove("builder-view-mode");
        
        // 🔓 UNLOCK INPUTS: Allow editing in Edit Mode
        if (inputCategory) inputCategory.readOnly = false;
        if (inputTitle) inputTitle.readOnly = false;
        
        if (viewHeader) viewHeader.style.display = "none";
        if (editHeader) editHeader.style.display = "flex";
        
        if (toggleBtn) {
            toggleBtn.innerHTML = "👁️ View"; 
            toggleBtn.style.background = "#007aff";
            toggleBtn.style.color = "#fff";
            toggleBtn.style.borderColor = "#007aff";
        }
        if (printBtn) printBtn.style.display = "none";
        if (saveBtn) saveBtn.style.display = "block";
        if (cancelBtn) {
            cancelBtn.textContent = "Cancel";
            cancelBtn.style.background = ""; 
            cancelBtn.style.color = "";      
            cancelBtn.style.border = "";
        }
    }
}


export function openLinkSequenceModal() {
    const overlay   = document.getElementById('linkSequenceOverlay');
    const input     = document.getElementById('linkSequenceInput');
    const results   = document.getElementById('linkSequenceResults');
    const repsInput = document.getElementById('linkSequenceReps');
    if (!overlay) return;

    // Safety: Close the row search overlay if it's open to prevent "Mixed Up" screens
    const rowSearch = document.getElementById('rowSearchOverlay');
    if (rowSearch) rowSearch.style.display = 'none';
    builderState.activeRowSearchIdx = -1;

    // Reset UI
    if (input) {
        input.value = '';
        input.oninput = handleLinkSearch; // Attach the real-time search
    }
    if (repsInput) repsInput.value = '1';
    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }

    overlay.style.display = 'flex';
    setTimeout(() => { 
        if (input) {
            input.focus(); 
            handleLinkSearch({ target: input }); 
        }
    }, 50);
}

// --- Helper: The Real-time Search Engine ---
function handleLinkSearch(e) {
    const term = (e && e.target ? e.target.value : (e || '')).toLowerCase();
    const resultsContainer = document.getElementById('linkSequenceResults');
    
    // Safety check: ensure courses are loaded
    const allCourses = [...(window.courses || [])];
    if (allCourses.length === 0) return;

    // The Bridge Check: Look for the word 'flow' in the category string, 
    // or ID 55 if the dataAdapter passed it through.
    const isFlow = (c) => {
        const catStr = String(c.category || '').toLowerCase();
        return catStr.includes('flow') || 
               String(c.category_id) === '55' || 
               String(c.categoryId) === '55';
    };

    let filtered = [];

    if (term.length === 0) {
        // EMPTY STATE: User just opened the modal.
        // ONLY show Flow sequences to prevent dumping the whole DB on the screen.
        filtered = allCourses.filter(isFlow);
    } else {
        // SEARCH STATE: User is typing. Search everything.
        filtered = allCourses.filter(c => 
            (c.title || '').toLowerCase().includes(term) || 
            (c.category || '').toLowerCase().includes(term)
        );
        // Sort the search results so Flows still appear at the top
        filtered.sort((a, b) => isFlow(b) - isFlow(a));
    }

    // Limit results to 50 to ensure mobile scrolling remains perfectly smooth
    const displayList = filtered.slice(0, 50);

    if (displayList.length > 0) {
        resultsContainer.innerHTML = displayList.map(c => {
        const safeTitle = (c.title || '').replace(/'/g, "\\'"); 
        const displayCat = c.category || (isFlow(c) ? 'Flow' : 'General');
        
        return `
            <div class="link-option-row" onclick="window.selectLinkSequence('${safeTitle}')">
                <span class="link-option-title">${c.title}</span>
                <span class="link-option-meta">${displayCat}</span>
            </div>
        `;
    }).join('');
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.innerHTML = `<div style="padding:12px; color:#999; text-align:center;">No sequences found.</div>`;
        resultsContainer.style.display = 'block';
    }
}

// --- Window Binding for Inline Onclick ---
// Placed globally so the innerHTML buttons can trigger it
window.selectLinkSequence = (title) => {
    const input = document.getElementById('linkSequenceInput');
    const results = document.getElementById('linkSequenceResults');
    if (input) input.value = title;
    if (results) results.style.display = "none";
};
