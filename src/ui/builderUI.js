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
    const datalist  = document.getElementById('linkSequenceList');
    const repsInput = document.getElementById('linkSequenceReps');
    if (!overlay) return;

    const allCourses = [...(window.courses || [])];
    const sorted = [
        ...allCourses.filter(c => (c.category || '').toLowerCase().includes('flow')),
        ...allCourses.filter(c => !(c.category || '').toLowerCase().includes('flow'))
    ];
    if (datalist) {
        datalist.innerHTML = sorted.map(c => `<option value="${c.title}">${c.category ? '(' + c.category + ')' : ''}</option>`).join('');
    }
    if (input)     input.value     = '';
    if (repsInput) repsInput.value = '1';

    overlay.style.display = 'flex';
    setTimeout(() => { if (input) input.focus(); }, 50);
}