import { builderState, isFlowSequence } from '../store/builderState.js';
import { $ } from '../utils/dom.js';
import { builderPoseName, generateInfoCellHTML, buildMacroInfoHTML, generateExportHeaderHTML } from './builderTemplates.js';
import { formatCategory } from '../utils/format.js';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getExportElement() {
    return document.querySelector('#editCourseBackdrop .modal');
}

function getSequenceTitle() {
    return (document.getElementById('builderTitle')?.value || '').trim();
}

function sanitizeFilename(title) {
    const base = String(title || 'Yoga-Sequence')
        .trim()
        .replace(/\.pdf$/i, '')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return `${base || 'Yoga-Sequence'}.pdf`;
}

function buildPdfConfig() {
    return {
        margin: [12, 12],
        filename: sanitizeFilename(getSequenceTitle()),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: true, // Enabled logging to catch internal capture errors
            backgroundColor: '#ffffff'
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        },
        pagebreak: {
            mode: ['avoid-all', 'css', 'legacy']
        }
    };
}

function ensureExportStyles() {
    if (document.getElementById('builderExportStyles')) return;

    const style = document.createElement('style');
    style.id = 'builderExportStyles';
    style.textContent = `
        /* Root Export Containers */
        .builder-export-root { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .export-cluster { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        /* Buttons */
        .btn-export-primary, .btn-export-secondary {
            appearance: none; border: 1px solid transparent; border-radius: 999px;
            padding: 10px 16px; font-size: 0.92rem; font-weight: 600; cursor: pointer;
        }
        .btn-export-primary { background: #111111; color: #ffffff; }
        .btn-export-secondary { background: #f5f5f7; color: #1d1d1f; border-color: #d2d2d7; }

        /* PDF Snapshot Engine Styles */
        .export-snapshot-host {
            position: absolute !important; left: -10000px !important; top: 0 !important;
            width: 800px !important; background: #ffffff !important; display: block !important;
        }

        .pdf-export-table {
            display: table !important; width: 100% !important; table-layout: fixed !important;
            border-collapse: collapse !important; margin: 0 !important;
        }

        .pdf-export-table th, .pdf-export-table td { 
            display: table-cell !important; border: 1px solid #d2d2d7 !important;
            padding: 12px 10px !important; vertical-align: top !important;
            word-wrap: break-word !important; box-sizing: border-box !important;
        }

        /* SYNCED ALIGNMENT: Centers Col 1 and 3 Headers + Cells */
        .pdf-export-table th:nth-child(1), .pdf-export-table td:nth-child(1) { 
            width: 85px !important; text-align: center !important; 
        }
        .pdf-export-table th:nth-child(2), .pdf-export-table td:nth-child(2) { 
            width: 495px !important; text-align: left !important; 
        }
        .pdf-export-table th:nth-child(3), .pdf-export-table td:nth-child(3) { 
            width: 220px !important; text-align: center !important; 
        }

        .pdf-export-table th {
            background: #f5f5f7 !important; font-weight: 700 !important;
            font-size: 9pt !important; color: #86868b !important; text-transform: uppercase !important;
        }

        /* Typography & Hierarchy */
        .export-snapshot-host #displayTitle { 
            font-size: 28pt !important; font-weight: 700 !important; margin: 0 0 5px 0 !important; 
        }
        
        .export-snapshot-host .export-header-meta {
        display: flex !important;
        justify-content: space-between !important;
        align-items: baseline !important;
        border-bottom: 1px solid #e5e7eb !important;
        margin-bottom: 15px !important;
        padding-bottom: 5px !important;
        padding-right: 10px !important; /* ⬅️ ARCHITECT FIX: Added canvas edge buffer */
        width: 100% !important;
        background: #ffffff !important;
        box-sizing: border-box !important;
    }

        .export-snapshot-host .export-meta-date, 
        .export-snapshot-host .export-meta-duration {
            font-family: -apple-system, system-ui, sans-serif !important;
            font-size: 10pt !important;
            color: #6b7280 !important;
        }

        .export-snapshot-host .duration-pill {
        background: #1d4ed8 !important; /* Professional Blue */
        color: #ffffff !important;
        padding: 2px 10px !important;
        border-radius: 9999px !important;
        font-weight: 700 !important;
        font-size: 9pt !important;
        margin-left: 5px !important;
        margin-right: 4px !important; /* ⬅️ ARCHITECT FIX: Pulls the pill inward */
        display: inline-block !important;
    }

        .export-snapshot-host #modalNotesRow {
            display: block !important; padding: 15px 20px !important;
            background: #fffcf0 !important; border: 1px solid #ffe082 !important;
            margin-bottom: 20px !important; border-radius: 8px !important;
        }

        .b-devanagari { font-size: 1.1rem !important; margin-top: 4px; }
        .b-var-view { color: #007aff; font-weight: 600; font-size: 0.9rem; }
        .hidden { display: none !important; }
    `;
    document.head.appendChild(style);
}

/**
 * Creates a clean, expanded clone of the sequence for PDF rendering.
 */
/**
 * Creates a clean, expanded clone of the sequence for PDF rendering.
 * Architecture: Uses a rigid table structure to prevent column misalignment.
 */
export function createExportSnapshot(sourceElement) {
    const clone = sourceElement.cloneNode(true);
    const libMap = window.asanaLibrary || {};

    // 1. Apply classes to trigger presentation styles
    clone.classList.add('export-snapshot-host');
    clone.classList.add('builder-view-mode');

    // 2. Render a dedicated export table to avoid mobile DOM/CSS artifacts
    const oldTable = clone.querySelector('#builderTable');
    
    if (oldTable) {
        const libArray = Object.values(libMap);
        const exportTable = document.createElement('table');
        exportTable.className = 'pdf-export-table';
        
        // Header structure matches the strict CSS widths defined in ensureExportStyles
        exportTable.innerHTML = `
            <thead>
                <tr>
                    <th style="text-align: center;"># / ID</th>
                    <th>Pose Details</th>
                    <th>Info</th>
                </tr>
            </thead>
            <tbody id="builderTableBody"></tbody>
        `;
        
        const tbody = exportTable.querySelector('tbody');

        builderState.poses.forEach((pose, idx) => {
            const idStr = String(pose.id);
            const isMacro = idStr.startsWith("MACRO:");
            const isLoop = idStr.startsWith("LOOP_");
            const isSpecial = isMacro || isLoop;
            
            // Robust ID lookup matching builder.js logic
            const normId = idStr.match(/^\d+/)?.[0]?.padStart(3, '0') || idStr;
            const asana = libMap[normId] || libArray.find(a => String(a.id || a.asanaNo) === String(normId));
            
            const tr = document.createElement('tr');
            if (isMacro) tr.className = "builder-macro-row";
            if (isLoop) tr.className = "builder-loop-row";
            
            // Col 1: Index + ID + Devanagari
            const devanagari = asana?.devanagari ? `<div class="b-devanagari">${asana.devanagari}</div>` : '';
            const idLabel = isMacro ? 'LINK' : (isLoop ? 'BLOCK' : `ID ${idStr}`);
            const col1 = `
                <td>
                    <div style="font-weight:800; color:#007aff; font-size:1.1rem; text-align:center;">${idx + 1}</div>
                    <div style="font-size:0.65rem; font-weight:700; color:#86868b; text-transform:uppercase; text-align:center;">${idLabel}</div>
                    ${devanagari}
                </td>
            `;
            
            // Col 2: Name + Variations
            const name = isSpecial ? pose.name : builderPoseName(asana, pose.name, builderState.showSanskrit);
            const varText = (pose.variation && asana?.variations?.[pose.variation]) 
                ? `<span class="b-var-view">(${asana.variations[pose.variation].title || `Stage ${pose.variation}`})</span>` 
                : '';
            const iast = (!isSpecial && asana?.iast) ? `<div style="font-size:0.85rem; color:#6e6e73; font-style:italic;">${asana.iast}</div>` : '';
            
            const rawNote = pose.note || '';
            const cleanNote = (rawNote === 'null' || rawNote === 'NULL') ? '' : String(rawNote).trim();
            const noteHTML = cleanNote ? `
                <div style="margin-top: 4px; display: flex; align-items: baseline; gap: 6px;">
                    <span style="font-size: 0.7rem; color: #86868b; font-weight: 700; text-transform: uppercase; flex-shrink: 0;">Note:</span>
                    <span style="font-size: 0.8rem; color: #1d1d1f; flex: 1; overflow-wrap: break-word;">${escapeHtml(cleanNote)}</span>
                </div>` : '';

            const col2 = `
                <td>
                    <div style="font-weight:700; font-size:1.1rem;">${name} ${varText}</div>
                    ${iast}
                    ${noteHTML}
                </td>
            `;

            // Col 3: Info
            let col3 = '';
            const safeAsana = asana || { id: idStr, english: pose.name, variations: {} };
            if (isMacro) {
                const identifier = idStr.replace("MACRO:", "").trim();
                const subCourse = (window.courses || []).find(c => 
                    String(c.title || "").trim().toLowerCase() === identifier.toLowerCase() || 
                    String(c.id || "").trim() === identifier
                );
                
                let oneRoundSecs = 0;
                if (subCourse) {
                    if (typeof window.getExpandedPoses === "function" && typeof window.getPosePillTime === "function") {
                        const syntheticSeq = { poses: [[`MACRO:${subCourse.id || identifier}`, 1, "", "", "Linked Sequence: 1 Round"]] };
                        const expanded = window.getExpandedPoses(syntheticSeq);
                        oneRoundSecs = expanded.reduce((acc, p) => acc + window.getPosePillTime(p), 0);
                    } else if (typeof window.calculateTotalSequenceTime === "function") {
                        oneRoundSecs = window.calculateTotalSequenceTime(subCourse);
                    }
                }
                col3 = buildMacroInfoHTML({ oneRoundSecs, rounds: pose.duration, note: subCourse?.category || pose.note });
            } else {
                const isFlow = isFlowSequence() || (builderState.currentPlaybackMode === 'flow');
                col3 = generateInfoCellHTML(safeAsana, pose, idx, { isSpecial, isFlow });
            }

            // Architecture Note: Ensure internal logic is preserved while fixing UI injection
            tr.innerHTML = col1 + col2 + col3;
            tbody.appendChild(tr);

            // Ambiguity Row (Secondary Row Injection)
            if (pose._ambiguous) {
                const ambRow = document.createElement('tr');
                ambRow.innerHTML = `
                    <td colspan="3" style="background:#fff3e0; border-left:4px solid #ff6d00; padding:10px 12px; font-size:0.8rem;">
                        ⚠️ <strong>Note:</strong> Multiple matches found for page ${pose._pageNum}. Using <em>${pose.name}</em>.
                    </td>
                `;
                tbody.appendChild(ambRow);
            }
        });

        oldTable.replaceWith(exportTable);
    }

    // 3. Sync metadata
    const titleVal = getSequenceTitle() || 'Untitled Sequence';
    const catEl = document.getElementById('builderCategory');
    const catVal = (catEl?.value === "__NEW__" ? document.getElementById('builderCategoryCustom')?.value : catEl?.value || '').trim();
    const notesVal = (document.getElementById('builderNotes')?.value || '').trim();

    const displayTitle = clone.querySelector('#displayTitle');
    const displayCategory = clone.querySelector('#displayCategory');

    if (displayTitle) {
        displayTitle.textContent = titleVal;
        displayTitle.style.display = 'block';
    }

    if (displayCategory && catVal) {
        displayCategory.style.display = 'flex';
        const parts = catVal.split('>').map(p => p.trim()).filter(Boolean);
        displayCategory.innerHTML = parts.map((p, i) => {
            const isFirst = i === 0;
            const cls = isFirst ? 'cat-main' : 'cat-sub';
            return `<span class="cat-pill ${cls}">${escapeHtml(p)}</span>` + (i < parts.length - 1 ? `<span style="color:#86868b; margin: 0 4px; font-weight:bold;">›</span>` : '');
        }).join('');
    }

    // 4. Sync Safety Notes
    const displayNotes = clone.querySelector('#displayNotes');
    const notesRow = clone.querySelector('#modalNotesRow');
    if (notesRow && notesVal) {
        notesRow.classList.remove('hidden', 'collapsed');
        if (displayNotes) {
            displayNotes.classList.remove('hidden');
            const emphasizedVal = escapeHtml(notesVal).replace(/\b([A-Z][a-zāīūṛḷṅñṭḍṇśṣḥ]+( [IVX]+)?)\b/g, '<em>$1</em>');
            displayNotes.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; color:#e65100; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">
                    <strong>Safety Note</strong>
                </div> 
                <div style="line-height:1.5;">${emphasizedVal}</div>`;
        }
    }

    // 5. Code Pruning: Explicitly remove interactive elements
    const selectorsToRemove = [
        '.modal-footer', '.builder-toolbar-primary', '.builder-tools-panel',
        '#builderModeToggleBtn', '#editCourseCloseBtn', '.edit-only-inline',
        '#editModeHeader', '.modal-header button', '.builder-export-root',
        '#exportOptionsPanel', '#builderNotes', '#warningRestoreBtn', '.warning-dismiss-btn'
    ];
    selectorsToRemove.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

    // Force View Mode Visibility
    const vh = clone.querySelector('#viewModeHeader');
    if (vh) vh.style.setProperty('display', 'block', 'important');

   // ==========================================
    // 6. Practice Metadata (Targeted Slot-Filling)
    // ==========================================
    
    // Logic Preservation: Calculate accurate time based on 8-index schema
    const tempPoses = builderState.poses.map(p => {
        const tierTag = (!p.holdTier || p.holdTier === 'standard') ? '' : ` tier:${p.holdTier === 'short' ? 'S' : 'L'}`;
        const cleanNote = (p.note || '').replace(/\btier:[SL]\b/gi, '').trim();
        const meta = { explicitSide: p.side || null };
        return [p.id, p.duration, p.variation || "", p.variation || "", (cleanNote + tierTag).trim(), null, null, meta];
    });

    const totalSec = (typeof window.calculateTotalSequenceTime === "function") 
        ? window.calculateTotalSequenceTime({ poses: tempPoses }) 
        : 0;
    
    // 1. ROUND-UP PROTOCOL: Always round up to the next minute
    const totalMinutes = Math.ceil(totalSec / 60);

    // 2. SMART FORMATTING: Convert to h/m only if 60+ minutes
    let formattedTime = "";
    if (totalMinutes >= 60) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        formattedTime = m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
        formattedTime = `${totalMinutes}m`;
    }

    // CRITICAL FIX: Inject into `#viewModeHeader` for PDF capture
    const headerTarget = vh || (displayTitle ? displayTitle.parentNode : clone);
    
    if (headerTarget && typeof generateExportHeaderHTML === 'function') {
        const existingMeta = clone.querySelector('.export-header-meta');
        if (existingMeta) existingMeta.remove();

        headerTarget.insertAdjacentHTML('afterbegin', generateExportHeaderHTML());

        const dateSlot = clone.querySelector('#exportDateSlot');
        const durationSlot = clone.querySelector('#exportDurationSlot');

        if (dateSlot) {
            dateSlot.innerHTML = `<strong>Date:</strong> ${new Date().toLocaleDateString('en-AU', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            })}`;
        }

        if (durationSlot) {
            durationSlot.innerHTML = `Total Duration: <span class="duration-pill">~${formattedTime}</span>`;
        }
    }

    return clone;
}
/**
 * Waits for the browser to complete layout for the temporary export node.
 */
async function waitForExportLayout() {
    // Ensure fonts are loaded and layout has ticked twice
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
}

export function printSequence() {
    window.print();
}

/**
 * Dynamic loader for standalone rendering libraries.
 * Ensures we aren't relying on broken internal html2pdf bundles.
 */
async function ensureLibrariesLoaded() {
    const libs = [
        { name: 'html2canvas', url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', check: () => typeof window.html2canvas !== 'undefined' },
        { name: 'jspdf', url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', check: () => typeof window.jspdf !== 'undefined' }
    ];

    for (const lib of libs) {
        if (!lib.check()) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = lib.url;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
    }
}

/**
 * UI Progress Feedback
 */
function showPdfProgress(msg) {
    let el = document.getElementById('pdfProgressOverlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'pdfProgressOverlay';
        el.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(255,255,255,0.85); z-index: 10001;
            display: flex; align-items: center; justify-content: center;
            flex-direction: column; font-family: system-ui, sans-serif;
        `;
        document.body.appendChild(el);
    }
    el.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; border: 1px solid #eee;">
            <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #007aff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
            <div style="font-weight: 600; color: #1d1d1f; font-size: 1.1rem;">${msg}</div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </div>
    `;
    document.body.style.cursor = 'progress';
}

function hidePdfProgress() {
    const el = document.getElementById('pdfProgressOverlay');
    if (el) el.remove();
    document.body.style.cursor = '';
}

export async function downloadSequencePdf() {
    const sourceElement = getExportElement();
    if (!sourceElement) return;

    // Ensure standalone libraries are ready
    await ensureLibrariesLoaded();

    showPdfProgress('Preparing document...');

    const snapshot = createExportSnapshot(sourceElement);
    document.body.appendChild(snapshot);

    await waitForExportLayout();

    try {
        // Primary Path: Standalone html2canvas + jsPDF 
        // This bypasses the broken html2pdf worker chain entirely
        await manualExportPdf(snapshot);
    } catch (err) {
        console.error('[PDF] Export failed:', err);
        alert('PDF generation encountered an error. Falling back to print.');
        printSequence();
    } finally {
        snapshot.remove();
        hidePdfProgress();
    }
}

/**
 * Standalone Export Engine (A/B Winner)
 * Renders snapshot to high-res canvas and generates PDF manually.
 */
async function manualExportPdf(snapshot) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pdfWidth - (2 * margin);
    const pageHeightLimit = pdfHeight - margin;

    // Helper for high-quality structural capture
    const capture = async (el) => {
        try {
            // Force the element to behave as a block of 800px before snapping
            const originalWidth = el.style.width;
            el.style.setProperty('width', '800px', 'important');
            
            const canvas = await html2canvas(el, {
                scale: 2, // High DPI
                width: 800, // Explicitly crop the canvas to 800px
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });
            
            el.style.width = originalWidth; // Reset after snap
            return canvas;
        } catch (e) {
            console.warn('[PDF] Capture failed:', e);
            return null;
        }
    };

    const headerEl = snapshot.querySelector('.modal-header');
    const notesRowEl = snapshot.querySelector('#modalNotesRow');
    const dateEl = snapshot.querySelector('.export-date-tag');
    let currentY = margin;

    // 1. Render Header (Title + Category), Notes Row, and Practice Date
    const headerComponents = [headerEl, notesRowEl, dateEl].filter(el => el && !el.classList.contains('hidden'));
    for (let el of headerComponents) {
        const canvas = await capture(el);
        if (!canvas) continue;
        const h = canvas.height * (contentWidth / canvas.width);
        if (h > 0 && isFinite(h)) {
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', margin, currentY, contentWidth, h);
            currentY += h + 4;
        }
    }

    // 2. Prepare Table Header (for repetition)
    const thead = snapshot.querySelector('.pdf-export-table thead');
    const headCanvas = thead ? await capture(thead) : null;
    const headH = headCanvas ? headCanvas.height * (contentWidth / headCanvas.width) : 0;
    const headImg = headCanvas ? headCanvas.toDataURL('image/jpeg', 0.98) : null;

    const drawHeader = () => {
        if (headImg && headH > 0 && isFinite(headH)) {
            pdf.addImage(headImg, 'JPEG', margin, currentY, contentWidth, headH);
            currentY += headH;
        }
    };

    drawHeader();

    // 3. Render Table Rows structurally
    const rows = Array.from(snapshot.querySelectorAll('.pdf-export-table tbody tr'));
    const totalRows = rows.length;

    for (let i = 0; i < totalRows; i++) {
        const row = rows[i];
        showPdfProgress(`Rendering row ${i + 1} of ${totalRows}...`);

        const rowCanvas = await capture(row);
        if (!rowCanvas) continue;
        const rowH = rowCanvas.height * (contentWidth / rowCanvas.width);
        if (!isFinite(rowH) || rowH <= 0) continue;

        // Logic: If the row doesn't fit, move it in full to the next page
        if (currentY + rowH > pageHeightLimit) {
            pdf.addPage();
            currentY = margin;
            drawHeader(); // Requirement: show headers on new page
        }

        pdf.addImage(rowCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', margin, currentY, contentWidth, rowH);
        currentY += rowH;
    }

    pdf.save(sanitizeFilename(getSequenceTitle()));
}

export function initExportUI(container) {
    if (!container) return null;

    ensureExportStyles();

    let root = container;

    if (container.tagName === 'BUTTON') {
        const replacement = document.createElement('div');
        replacement.id = container.id + 'Container'; // Fix: Avoid ID collision
        replacement.className = container.className;
        replacement.setAttribute('role', 'group');
        replacement.setAttribute('aria-label', 'Export controls');
        replacement.style.display = container.style.display || 'none';
        container.replaceWith(replacement);
        root = replacement;
    }

    if (root.dataset.exportInit === 'true') {
        return root;
    }

    root.dataset.exportInit = 'true';
    root.classList.add('builder-export-root');
    root.innerHTML = `
        <div class="export-cluster">
            <button type="button" id="btnDownloadPdf" class="btn-export-primary">Download PDF</button>
            <button type="button" id="btnPrintSequence" class="btn-export-secondary">Print</button>
        </div>
    `;

    const btnDownloadPdf = root.querySelector('#btnDownloadPdf');
    const btnPrintSequence = root.querySelector('#btnPrintSequence');

    if (btnDownloadPdf) {
        btnDownloadPdf.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadSequencePdf();
        });
    }

    if (btnPrintSequence) {
        btnPrintSequence.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            printSequence();
        });
    }

    return root;
}

/**
 * State toggle for the sequence warning visibility.
 */
window.toggleWarning = (dismiss) => {
    const row = document.getElementById('modalNotesRow');
    if (row) {
        row.classList.toggle('collapsed', dismiss);
        builderState.isWarningDismissed = dismiss;
        updateBuilderModeUI(); // Force sync of buttons and tooltips
    }
    return false; // Prevent any default action
};

export function updateBuilderModeUI() {
    const backdrop = document.getElementById('editCourseBackdrop');
    const toggleBtn = document.getElementById('builderModeToggleBtn');
    const saveBtn = document.getElementById('editCourseSaveBtn');
    const cancelBtn = document.getElementById('editCourseCancelBtn');
    const printBtn = document.getElementById('btnDownloadPdf');
    const notesRow = document.getElementById('modalNotesRow');
    const topCloseBtn = document.getElementById('editCourseCloseBtn');

    const viewHeader = document.getElementById('viewModeHeader');
    const editHeader = document.getElementById('editModeHeader');

    const displayTitle = document.getElementById('displayTitle');
    const displayCategory = document.getElementById('displayCategory');
    const displayNotes = document.getElementById('displayNotes');
    const inputCategory = document.getElementById('builderCategory');
    const inputTitle = document.getElementById('builderTitle');
    const inputNotes = document.getElementById('builderNotes');
    const restoreBtn = document.getElementById('warningRestoreBtn');

    if (!backdrop) return;

    if (topCloseBtn) topCloseBtn.style.display = 'none';

    if (builderState.isViewMode) {
        backdrop.classList.add('builder-view-mode');

        if (inputCategory) inputCategory.readOnly = true;
        if (inputTitle) inputTitle.readOnly = true;
        if (inputNotes) inputNotes.classList.add('hidden'); // Hide editor in View Mode

        if (displayTitle && inputTitle) {
            displayTitle.textContent = inputTitle.value.trim() || 'Untitled Sequence';
        }

        if (displayNotes && inputNotes) {
            const val = inputNotes.value.trim();
            const hasNotes = !!val;
            
            displayNotes.classList.toggle('hidden', !hasNotes);
            if (notesRow) {
                notesRow.classList.toggle('hidden', !hasNotes);
                
                // Sync persistent UI state
                if (hasNotes && builderState.isWarningDismissed) {
                    notesRow.classList.add('collapsed');
                } else {
                    notesRow.classList.remove('collapsed');
                }

                if (restoreBtn) {
                    // Explicitly sync visibility to prevent "dead" icons or Edit-mode leaks
                    restoreBtn.style.display = (hasNotes && builderState.isWarningDismissed) ? 'flex' : 'none';
                    restoreBtn.onclick = (e) => {
                        e.preventDefault();
                        window.toggleWarning(false);
                    };
                }
            }

            if (val) {
                // Jobsian Hierarchy: Emphasize IAST terms (e.g., Trikonasana, Sirsasana II) 
                // specifically to distinguish Sanskrit terminology from safety instructions.
                const emphasizedVal = escapeHtml(val)
                    .replace(/\b([A-Z][a-zāīūṛḷṅñṭḍṇśṣḥ]+( [IVX]+)?)\b/g, '<em>$1</em>');

                // Jobbsian Review Style: Uses the same card layout as the player preamble
                displayNotes.innerHTML = `
                    <button type="button" class="warning-dismiss-btn" title="Dismiss warning" onclick="window.toggleWarning(true)">✕</button>
                    <div style="display:flex; align-items:center; gap:8px; color:#e65100; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">
                        <span style="font-size:1.1rem;">⚕️</span> <strong>Safety Note</strong>
                    </div>
                    <div style="line-height:1.5;">${emphasizedVal}</div>`;
            }
        }

        if (displayCategory && inputCategory) {
            const rawVal = inputCategory.value.trim();

            if (!rawVal) {
                displayCategory.style.display = 'none';
                displayCategory.innerHTML = '';
            } else {
                displayCategory.style.display = 'flex';
                const parts = rawVal.split('>').map((p) => p.trim()).filter(Boolean);

                displayCategory.innerHTML = parts.map((p, i) => {
                    const isFirst = i === 0;
                    const isLast = i === parts.length - 1;
                    
                    const bg = isFirst ? '#007aff' : '#f5f5f7';
                    const tc = isFirst ? '#ffffff' : '#6e6e73';
                    const border = isFirst ? 'none' : '1px solid #d2d2d7';
                    const fw = isFirst ? '700' : '600';

                    const pill = `<span style="background:${bg}; color:${tc}; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:${fw}; text-transform:uppercase; letter-spacing:0.04em; white-space:normal; word-break:break-word; text-align:left; border:${border};">${escapeHtml(p)}</span>`;
                    const sep = !isLast ? `<span style="color:#86868b; font-weight:bold; font-size:1.1rem; margin-top:-2px;">›</span>` : '';
                    return pill + (sep ? ` ${sep} ` : '');
                }).join('');
            }
        }

        if (editHeader) editHeader.style.display = 'none';
        if (viewHeader) viewHeader.style.display = 'flex';

        if (toggleBtn) {
            toggleBtn.innerHTML = '✏️ Edit';
            toggleBtn.className = 'btn-builder-mode-edit';
        }

        // Prevent recursive button generation by checking for the container first
        const existingExport = document.getElementById('btnDownloadPdfContainer');
        if (existingExport) {
            existingExport.style.display = 'flex';
        } else if (printBtn) {
            const exportRoot = initExportUI(printBtn);
            if (exportRoot) exportRoot.style.display = 'flex';
        }

        if (saveBtn) saveBtn.style.display = 'none';

        if (cancelBtn) {
            cancelBtn.textContent = 'Close';
            cancelBtn.style.background = '#007aff';
            cancelBtn.style.color = '#fff';
            cancelBtn.style.border = 'none';
        }
    } else {
        backdrop.classList.remove('builder-view-mode');

        if (inputCategory) inputCategory.readOnly = false;
        if (inputTitle) inputTitle.readOnly = false;
        if (inputNotes) inputNotes.classList.remove('hidden');
        if (notesRow) notesRow.classList.remove('hidden');
        // Ensure row is expanded for editing
        if (notesRow) notesRow.classList.remove('collapsed');
        // Explicitly hide restore icon in Edit mode
        if (restoreBtn) restoreBtn.style.display = 'none';

        if (viewHeader) viewHeader.style.display = 'none';
        if (editHeader) editHeader.style.display = 'flex';
        if (displayNotes) displayNotes.classList.add('hidden');

        if (toggleBtn) {
            toggleBtn.innerHTML = '👁️ View';
            toggleBtn.className = 'btn-builder-mode-view';
        }

        // Hide export cluster in Edit mode
        const exportContainer = document.getElementById('btnDownloadPdfContainer');
        if (exportContainer) {
            exportContainer.style.display = 'none';
        }

        if (saveBtn) saveBtn.style.display = 'block';

        if (cancelBtn) {
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.background = '';
            cancelBtn.style.color = '';
            cancelBtn.style.border = '';
        }
    }
}

export function openLinkSequenceModal() {
    const overlay = document.getElementById('linkSequenceOverlay');
    const input = document.getElementById('linkSequenceInput');
    const results = document.getElementById('linkSequenceResults');
    const repsInput = document.getElementById('linkSequenceReps');
    const modal = overlay.querySelector('.modal');

    // Inject Filter UI if missing
    if (modal && !document.getElementById('linkFilterGroup')) {
        const filterHtml = `
            <div id="linkFilterGroup" style="display:flex; gap:8px; margin-bottom:12px;">
                <button class="tiny active" data-filter="all" style="flex:1; padding:6px; border-radius:6px; border:1px solid #ccc; background:#007aff; color:#fff; font-weight:600; cursor:pointer;">All</button>
                <button class="tiny" data-filter="flow" style="flex:1; padding:6px; border-radius:6px; border:1px solid #ccc; background:#fff; font-weight:600; cursor:pointer;">Flows</button>
                <button class="tiny" data-filter="cycle" style="flex:1; padding:6px; border-radius:6px; border:1px solid #ccc; background:#fff; font-weight:600; cursor:pointer;">Cycles</button>
            </div>
        `;
        const searchLabel = modal.querySelector('label');
        if (searchLabel) searchLabel.insertAdjacentHTML('afterend', filterHtml);

        document.getElementById('linkFilterGroup').onclick = (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            document.querySelectorAll('#linkFilterGroup button').forEach(b => {
                b.classList.remove('active');
                b.style.background = '#fff';
                b.style.color = '#000';
                b.style.borderColor = '#ccc';
            });
            btn.classList.add('active');
            btn.style.background = '#007aff';
            btn.style.color = '#fff';
            btn.style.borderColor = '#007aff';
            handleLinkSearch({ target: input });
        };
    }

    if (!overlay) return;

    const rowSearch = document.getElementById('rowSearchOverlay');
    if (rowSearch) rowSearch.style.display = 'none';
    builderState.activeRowSearchIdx = -1;

    if (input) {
        input.value = '';
        input.oninput = handleLinkSearch;
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

function handleLinkSearch(e) {
    const term = (e && e.target ? e.target.value : (e || '')).toLowerCase();
    const resultsContainer = document.getElementById('linkSequenceResults');
    if (!resultsContainer) return;

    const filterGroup = document.getElementById('linkFilterGroup');
    const activeFilter = filterGroup?.querySelector('.active')?.dataset.filter || 'all';

    const allCourses = [...(window.courses || [])];
    if (allCourses.length === 0) return;

    const matchesFilter = (c) => {
        if (activeFilter === 'flow') return c.isFlow;
        if (activeFilter === 'cycle') return c.isCycle;
        return c.isMacroLinkable;
    };

    let filtered = [];

    if (term.length === 0) {
        filtered = allCourses.filter(matchesFilter);
    } else {
        filtered = allCourses.filter((c) =>
            (c.title || '').toLowerCase().includes(term) ||
            (c.category || '').toLowerCase().includes(term)
        );
        filtered.sort((a, b) => Number(matchesFilter(b)) - Number(matchesFilter(a)));
    }

    const displayList = filtered.slice(0, 50);

    if (displayList.length > 0) {
        resultsContainer.innerHTML = displayList.map((c) => {
            const safeTitle = String(c.title || '').replace(/'/g, "\\'");
            const displayCat = c.categoryLabel || c.category || (c.isFlow ? 'Flow' : (c.isCycle ? 'Cycle' : 'General'));

            // Rule: Contextual Suppression (Hide meta if Cycles or Flow tab is active)
            const hideMeta = (activeFilter === 'cycle' || activeFilter === 'flow');

            return `
                <div class="link-option-row" onclick="window.selectLinkSequence('${safeTitle}')">
                    <span class="link-option-title">${escapeHtml(c.title || '')}${c.iast ? ` <em style="font-size:0.85rem; color:#666; margin-left:4px;">${escapeHtml(c.iast)}</em>` : ''}</span>
                    ${!hideMeta ? `<span class="link-option-meta">${escapeHtml(displayCat)}</span>` : ''}
                </div>
            `;
        }).join('');
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.innerHTML = `<div style="padding:12px; color:#999; text-align:center;">No sequences found.</div>`;
        resultsContainer.style.display = 'block';
    }
}

window.selectLinkSequence = (title) => {
    const input = document.getElementById('linkSequenceInput');
    const results = document.getElementById('linkSequenceResults');

    if (input) input.value = title;
    if (results) results.style.display = 'none';
};