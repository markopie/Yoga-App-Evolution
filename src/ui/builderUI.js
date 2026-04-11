import { builderState } from '../store/builderState.js';
import { $ } from '../utils/dom.js';

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
        .builder-export-root {
            display: flex;
            align-items: center;
            gap: 10px;
            position: relative;
            flex-wrap: wrap;
        }

        .export-cluster {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            position: relative;
            flex-wrap: wrap;
        }

        .btn-export-primary,
        .btn-export-secondary {
            appearance: none;
            border: 1px solid transparent;
            border-radius: 999px;
            padding: 10px 16px;
            font-size: 0.92rem;
            font-weight: 600;
            letter-spacing: 0.01em;
            line-height: 1.2;
            cursor: pointer;
            transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
            white-space: nowrap;
        }

        .btn-export-primary {
            background: #111111;
            color: #ffffff;
            border-color: #111111;
            box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        }

        .btn-export-primary:hover,
        .btn-export-primary:focus-visible {
            background: #1f1f1f;
            border-color: #1f1f1f;
            outline: none;
        }

        .btn-export-secondary {
            background: #f5f5f7;
            color: #1d1d1f;
            border-color: #d2d2d7;
        }

        .btn-export-secondary:hover,
        .btn-export-secondary:focus-visible {
            background: #ececf0;
            outline: none;
        }
        
        .export-snapshot-host {
            position: absolute !important;
            left: -10000px !important;
            top: 0 !important;
            width: 900px !important;
            opacity: 1 !important;
            visibility: visible !important;
            display: block !important;
            pointer-events: none !important;
            z-index: 10000 !important;
            background: #ffffff !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            transform: none !important;
        }

        .export-snapshot-host .modal {
            position: relative !important;
            display: block !important; /* Destroy flexbox for capture */
            width: 100% !important;
            height: auto !important; /* Remove 90vh/100vh constraints */
            max-height: none !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
            background: #ffffff !important;
        }
        
        /* Force container visibility for export components */
        .export-snapshot-host #viewModeHeader {
            display: block !important;
        }

        .export-snapshot-host .modal-header {
            position: static !important;
            display: block !important;
            padding: 20px !important;
            background: #ffffff !important;
            border-bottom: 1px solid #eee !important;
            height: auto !important;
        }

        .export-snapshot-host .modal-body {
            display: block !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important; 
            padding: 0 20px 60px !important;
            flex: none !important; /* Remove flex-grow */
        }
        
        /* Pleasant Header Styling for PDF */
        .export-snapshot-host #displayTitle {
            font-size: 28pt !important;
            font-weight: 700 !important;
            color: #1d1d1f !important;
            margin: 0 0 10px 0 !important;
            line-height: 1.1 !important;
            display: block !important;
        }

        .export-snapshot-host #displayCategory {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            align-items: center !important;
            margin-bottom: 20px !important;
        }

        .export-snapshot-host #displayCategory .cat-pill {
            padding: 4px 10px !important;
            border-radius: 8px !important;
            font-size: 9pt !important;
            text-transform: uppercase !important;
            font-weight: 700 !important;
        }

        .export-snapshot-host #displayCategory .cat-main {
            background: #007aff !important;
            color: #ffffff !important;
        }

        .export-snapshot-host #displayCategory .cat-sub {
            background: #f5f5f7 !important;
            color: #6e6e73 !important;
            border: 1px solid #d2d2d7 !important;
        }

        .export-snapshot-host #builderTable {
            width: 99% !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
            margin: 0 auto !important;
        }

        .export-snapshot-host #builderTable th,
        .export-snapshot-host #builderTable td {
            border: 1px solid #eee !important;
            padding: 12px 8px !important;
            vertical-align: top !important;
            word-wrap: break-word !important;
        }

        /* Hide Order column and edit chrome */
        .export-snapshot-host .b-row-select,
        .export-snapshot-host .order-controls-group,
        .export-snapshot-host .b-move-top,
        .export-snapshot-host .b-move-bot,
        .export-snapshot-host .b-move-up,
        .export-snapshot-host .b-move-dn,
        .export-snapshot-host .b-remove,
        .export-snapshot-host .b-row-search-btn,
        .export-snapshot-host .b-macro-swap,
        .export-snapshot-host th:last-child,
        .export-snapshot-host td:last-child {
            display: none !important;
        }

        /* Ensure Info column visibility */
        .export-snapshot-host th:nth-child(3),
        .export-snapshot-host td:nth-child(3) {
            display: table-cell !important;
            min-width: 120px !important;
        }
        
        .export-date-tag {
            margin: 0 0 14px;
            font-size: 0.85rem;
            color: #6e6e73;
            font-weight: 500;
        }

        @media (max-width: 640px) {
            .builder-export-root,
            .export-cluster {
                width: 100%;
            }

            .btn-export-primary,
            .btn-export-secondary {
                flex: 1 1 auto;
                justify-content: center;
            }
        }

        @media print {
            .builder-export-root,
            .export-panel,
            #exportOptionsPanel {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Creates a clean, expanded clone of the sequence for PDF rendering.
 */
function createExportSnapshot(sourceElement) {
    const clone = sourceElement.cloneNode(true);

    // 1. Apply classes to trigger presentation styles
    clone.classList.add('export-snapshot-host');
    clone.classList.add('builder-view-mode');

    // 2. Sync data manually to the clone to ensure title/category "comes through"
    const titleVal = getSequenceTitle() || 'Untitled Sequence';
    const catVal = (document.getElementById('builderCategory')?.value || '').trim();

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
            const pill = `<span class="cat-pill ${cls}">${escapeHtml(p)}</span>`;
            const sep = i < parts.length - 1 ? `<span style="color:#86868b; margin: 0 4px; font-weight:bold;">›</span>` : '';
            return pill + sep;
        }).join('');
    }

    // 3. Selectively remove UI elements
    const selectorsToRemove = [
        '.modal-footer',
        '.builder-toolbar-primary',
        '.builder-tools-panel',
        '#builderModeToggleBtn',
        '#editCourseCloseBtn',
        '.edit-only-inline',
        '#editModeHeader',
        '.modal-header button',
        '.builder-export-root',
        '#exportOptionsPanel',
        '.builder-toolbar-primary'
    ];

    selectorsToRemove.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Ensure the view mode header is explicitly shown in the clone
    const vh = clone.querySelector('#viewModeHeader');
    if (vh) {
        vh.style.setProperty('display', 'block', 'important');
    }

    // 4. Clean table rows
    clone.querySelectorAll('#builderTable tr').forEach(tr => {
        const cells = tr.querySelectorAll('th, td');
        if (cells[0]) cells[0].querySelectorAll('input').forEach(i => i.remove());

        // Fix: Ensure selects (like variations) show their text value instead of an empty box in the PDF
        tr.querySelectorAll('select').forEach(sel => {
            const span = document.createElement('span');
            span.textContent = sel.options[sel.selectedIndex]?.text || '';
            sel.replaceWith(span);
        });

        // Column 4 is "Order" - we remove it to match print layout
        if (cells.length >= 4) cells[3].remove();
    });

    // Add Date Tag
    const modalBody = clone.querySelector('.modal-body') || clone;
    const dateTag = document.createElement('div');
    dateTag.className = 'export-date-tag';
    dateTag.textContent = `Practice Date: ${new Date().toLocaleDateString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })}`;
    modalBody.prepend(dateTag);

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
            const canvas = await html2canvas(el, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 800 // Standardized width for table consistency
            });
            if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
            return canvas;
        } catch (e) {
            console.warn('[PDF] Capture failed for element:', el, e);
            return null;
        }
    };

    const headerEl = snapshot.querySelector('.modal-header');
    const dateEl = snapshot.querySelector('.export-date-tag');
    let currentY = margin;

    // 1. Render Header (Title + Category) and Practice Date
    // We capture the headerEl which contains both #displayTitle and #displayCategory
    const headerComponents = [headerEl, dateEl].filter(Boolean);
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
    const thead = snapshot.querySelector('#builderTable thead');
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
    const rows = Array.from(snapshot.querySelectorAll('#builderTable tbody tr'));
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
        replacement.id = container.id;
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

export function updateBuilderModeUI() {
    const backdrop = document.getElementById('editCourseBackdrop');
    const toggleBtn = document.getElementById('builderModeToggleBtn');
    const saveBtn = document.getElementById('editCourseSaveBtn');
    const cancelBtn = document.getElementById('editCourseCancelBtn');
    const printBtn = document.getElementById('builderPrintBtn');
    const topCloseBtn = document.getElementById('editCourseCloseBtn');

    const viewHeader = document.getElementById('viewModeHeader');
    const editHeader = document.getElementById('editModeHeader');

    const displayTitle = document.getElementById('displayTitle');
    const displayCategory = document.getElementById('displayCategory');
    const inputCategory = document.getElementById('builderCategory');
    const inputTitle = document.getElementById('builderTitle');

    if (!backdrop) return;

    if (topCloseBtn) topCloseBtn.style.display = 'none';

    if (builderState.isViewMode) {
        backdrop.classList.add('builder-view-mode');

        if (inputCategory) inputCategory.readOnly = true;
        if (inputTitle) inputTitle.readOnly = true;

        if (displayTitle && inputTitle) {
            displayTitle.textContent = inputTitle.value.trim() || 'Untitled Sequence';
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
            toggleBtn.style.background = '#f5f5f7';
            toggleBtn.style.color = '#1d1d1f';
            toggleBtn.style.borderColor = '#d2d2d7';
        }

        if (printBtn) {
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

        if (viewHeader) viewHeader.style.display = 'none';
        if (editHeader) editHeader.style.display = 'flex';

        if (toggleBtn) {
            toggleBtn.innerHTML = '👁️ View';
            toggleBtn.style.background = '#007aff';
            toggleBtn.style.color = '#fff';
            toggleBtn.style.borderColor = '#007aff';
        }

        const exportRoot = document.getElementById('builderPrintBtn');
        if (exportRoot) {
            exportRoot.style.display = 'none';
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

    const allCourses = [...(window.courses || [])];
    if (allCourses.length === 0) return;

    const isFlow = (c) => {
        const catStr = String(c.category || '').toLowerCase();
        return catStr.includes('flow') ||
               String(c.category_id) === '55' ||
               String(c.categoryId) === '55';
    };

    let filtered = [];

    if (term.length === 0) {
        filtered = allCourses.filter(isFlow);
    } else {
        filtered = allCourses.filter((c) =>
            (c.title || '').toLowerCase().includes(term) ||
            (c.category || '').toLowerCase().includes(term)
        );
        filtered.sort((a, b) => Number(isFlow(b)) - Number(isFlow(a)));
    }

    const displayList = filtered.slice(0, 50);

    if (displayList.length > 0) {
        resultsContainer.innerHTML = displayList.map((c) => {
            const safeTitle = String(c.title || '').replace(/'/g, "\\'");
            const displayCat = c.category || (isFlow(c) ? 'Flow' : 'General');

            return `
                <div class="link-option-row" onclick="window.selectLinkSequence('${safeTitle}')">
                    <span class="link-option-title">${escapeHtml(c.title || '')}</span>
                    <span class="link-option-meta">${escapeHtml(displayCat)}</span>
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