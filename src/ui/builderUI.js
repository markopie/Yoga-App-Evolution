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

    // 2. Selectively remove UI elements (keeping indicators like Tier buttons)
    const selectorsToRemove = [
        '.modal-footer',
        '.builder-toolbar-primary',
        '.builder-tools-panel',
        '#builderModeToggleBtn',
        '#editCourseCloseBtn',
        '.edit-only-inline',
        '.modal-header > div:not(#displayTitle):not(#displayCategory)'
    ];

    selectorsToRemove.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // 3. Clean table rows (Remove checkboxes and Order column controls)
    clone.querySelectorAll('#builderTable tr').forEach(tr => {
        const cells = tr.querySelectorAll('th, td');
        if (cells[0]) cells[0].querySelectorAll('input').forEach(i => i.remove());
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

export async function downloadSequencePdf() {
    const sourceElement = getExportElement();
    if (!sourceElement) return;

    // Ensure standalone libraries are ready
    await ensureLibrariesLoaded();

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
    }
}

/**
 * Standalone Export Engine (A/B Winner)
 * Renders snapshot to high-res canvas and generates PDF manually.
 */
async function manualExportPdf(snapshot) {
    // Get constructor from UMD namespace
    const { jsPDF } = window.jspdf;
    
    const canvas = await html2canvas(snapshot, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const imgProps = pdf.getImageProperties(imgData);
    const ratio = pdfWidth / imgProps.width;
    const renderedHeight = imgProps.height * ratio;

    let heightLeft = renderedHeight;
    let position = 0;

    // Page 1
    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, renderedHeight);
    heightLeft -= pdfHeight;

    // Multi-page Splitting
    while (heightLeft >= 0) {
        position = heightLeft - renderedHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, renderedHeight);
        heightLeft -= pdfHeight;
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
                    const isLast = i === parts.length - 1;
                    const pill = `<span style="background:#e3f2fd; color:#005580; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; white-space:normal; word-break:break-word; text-align:left;">${escapeHtml(p)}</span>`;
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