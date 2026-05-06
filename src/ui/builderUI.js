import { builderState } from '../store/builderState.js';
import { builderPoseName } from './builderTemplates.js';


function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSequenceTitle() {
    return (document.getElementById('builderTitle')?.value || '').trim();
}

function getCategoryInitials(categoryValue) {
    const mainCategory = String(categoryValue || '')
        .split('>')[0]
        .trim();

    if (!mainCategory) return '';

    const compact = mainCategory.replace(/[^A-Za-z0-9]/g, '');
    if (compact.length >= 2 && compact.length <= 5 && compact === compact.toUpperCase()) {
        return compact;
    }

    return mainCategory
        .split(/[\s/&+-]+/)
        .map(part => part.match(/[A-Za-z0-9]/)?.[0] || '')
        .join('')
        .toUpperCase()
        .slice(0, 6);
}

function buildPdfFilename(title, categoryValue) {
    const initials = getCategoryInitials(categoryValue);
    const suffix = initials ? ` (${initials})` : '';
    return sanitizeFilename(`${title || 'Yoga-Sequence'}${suffix}`);
}

function sanitizeFilename(title) {
    const base = String(title || 'Yoga-Sequence')
        .trim()
        .replace(/\.pdf$/i, '')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return `${base || 'Yoga-Sequence'}.pdf`;
}

async function ensureJsPdfLoaded() {
    if (typeof window.jspdf !== 'undefined') return;
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function ensureJsZipLoaded() {
    if (typeof window.JSZip !== 'undefined') return;
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function getCurrentCategoryValue() {
    const catEl = document.getElementById('builderCategory');
    return (catEl?.value === "__NEW__" ? document.getElementById('builderCategoryCustom')?.value : catEl?.value || '').trim();
}

function resolveLinkedSequence(identifier) {
    const needle = String(identifier || '').trim();
    if (!needle) return null;
    const lowerNeedle = needle.toLowerCase();

    return (window.courses || []).find(c =>
        String(c.title || "").trim().toLowerCase() === lowerNeedle ||
        String(c.id || "").trim() === needle ||
        String(c.supabaseId || "").trim() === needle
    ) || null;
}

function collectLinkedSequences(poses, visited = new Set()) {
    const linked = [];

    (poses || []).forEach(pose => {
        const idStr = String(pose?.id ?? (Array.isArray(pose?.[0]) ? pose[0][0] : pose?.[0]) ?? '');
        if (!idStr.startsWith('MACRO:')) return;

        const identifier = idStr.replace('MACRO:', '').trim();
        const course = resolveLinkedSequence(identifier);
        if (!course) return;

        const courseKey = String(course.id || course.supabaseId || course.title || identifier);
        if (visited.has(courseKey)) return;
        visited.add(courseKey);
        linked.push(course);
        linked.push(...collectLinkedSequences(courseToPdfPoses(course), visited));
    });

    return linked;
}

function courseToPdfPoses(course) {
    const seqIsFlow = course?.playbackMode === "flow" || course?.isFlow;
    const libraryArray = Object.values(window.asanaLibrary || {});

    return (course?.poses || []).map(p => {
        const rawId = Array.isArray(p?.[0]) ? p[0][0] : p?.[0] || "";
        const idStr = String(rawId);

        if (idStr === "LOOP_START" || idStr === "LOOP_END") {
            return {
                id: idStr,
                name: idStr === "LOOP_START" ? `Repeat Block (${p[1]} Rounds)` : "End Repeat Block",
                duration: idStr === "LOOP_START" ? Number(p[1]) || 2 : 0,
                variation: "",
                note: ""
            };
        }

        if (idStr.startsWith("MACRO:")) {
            const identifier = idStr.replace("MACRO:", "").trim();
            const subCourse = resolveLinkedSequence(identifier);
            return {
                id: idStr,
                name: `[Sequence] ${subCourse ? subCourse.title : identifier}`,
                duration: Number(p[1]) || 1,
                variation: "",
                note: p[4] || ""
            };
        }

        const id = idStr.padStart(3, '0');
        const asana = libraryArray.find(a => String(a.id || a.asanaNo) === id);
        const originalJson = p?.[7]?.originalJson || null;
        const variation = p?.[3] || "";
        const tier = originalJson?.tier;
        const holdTier = tier === 'S' ? 'short' : (tier === 'L' ? 'long' : 'standard');
        const holdTimes = asana && window.getHoldTimes
            ? window.getHoldTimes(asana, variation || null)
            : { standard: 30, flow: 5 };

        return {
            id,
            name: asana ? (asana.name || asana.english || id) : id,
            duration: Number(p?.[1]) || (seqIsFlow ? (holdTimes.flow || holdTimes.standard || 5) : (holdTimes.standard || 30)),
            variation,
            note: originalJson ? (originalJson.note || "") : [p?.[2], p?.[4]].filter(Boolean).join(" | ").trim(),
            holdTier,
            side: p?.[7]?.explicitSide || "",
            props: [...(p?.[7]?.props || [])]
        };
    });
}

function getUniqueFilename(filename, usedNames) {
    if (!usedNames.has(filename)) {
        usedNames.add(filename);
        return filename;
    }

    const base = filename.replace(/\.pdf$/i, '');
    let suffix = 2;
    let candidate = `${base} ${suffix}.pdf`;
    while (usedNames.has(candidate)) {
        suffix += 1;
        candidate = `${base} ${suffix}.pdf`;
    }
    usedNames.add(candidate);
    return candidate;
}

export async function downloadSequencePdf() {
    try {
        await ensureJsPdfLoaded();
        const titleText = getSequenceTitle() || 'Untitled Sequence';
        const categoryValue = getCurrentCategoryValue();
        const linkedSequences = collectLinkedSequences(builderState.poses);

        if (!linkedSequences.length) {
            await generateTablePdf({
                title: titleText,
                category: categoryValue,
                notes: (document.getElementById('builderNotes')?.value || '').trim(),
                poses: builderState.poses,
                courseId: builderState.editingSupabaseId,
                filename: buildPdfFilename(titleText, categoryValue),
                save: true
            });
            return;
        }

        await ensureJsZipLoaded();
        const zip = new window.JSZip();
        const usedNames = new Set();

        const mainFilename = getUniqueFilename(buildPdfFilename(titleText, categoryValue), usedNames);
        const mainBlob = await generateTablePdf({
            title: titleText,
            category: categoryValue,
            notes: (document.getElementById('builderNotes')?.value || '').trim(),
            poses: builderState.poses,
            courseId: builderState.editingSupabaseId,
            save: false
        });
        zip.file(mainFilename, mainBlob);

        for (const course of linkedSequences) {
            const linkedCategory = course.categoryName || course.category || '';
            const linkedFilename = getUniqueFilename(buildPdfFilename(course.title, linkedCategory), usedNames);
            const linkedBlob = await generateTablePdf({
                title: course.title || 'Linked Sequence',
                category: course.category || linkedCategory,
                notes: course.condition_notes || '',
                poses: courseToPdfPoses(course),
                courseId: course.id || course.supabaseId,
                save: false
            });
            zip.file(linkedFilename, linkedBlob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerBlobDownload(zipBlob, sanitizeFilename(`${titleText || 'Yoga-Sequence'} sequence PDFs`).replace(/\.pdf$/i, '.zip'));
    } catch (err) {
        console.error('[PDF] Text export failed:', err);
        alert('PDF generation encountered an error.');
    }
}



/**
 * Format seconds into a human-readable duration string.
 * e.g. 55 → "55s", 120 → "2m", 300 → "5m", 600 → "10m"
 */
function formatPoseDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins && secs) return `${mins}m ${secs}s`;
    if (mins) return `${mins}m`;
    return `${secs}s`;
}


/**
 * Load a TTF font file and register it with jsPDF for use in PDF generation.
 * Returns the font name to use with pdf.setFont().
 */
async function loadFont(pdf, fontPath, fontName) {
    try {
        const response = await fetch(fontPath);
        const arrayBuffer = await response.arrayBuffer();
        // Convert ArrayBuffer to base64 safely (chunked to avoid call stack limits)
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);
        pdf.addFileToVFS(`${fontName}.ttf`, base64);
        pdf.addFont(`${fontName}.ttf`, fontName, 'normal');
        return fontName;
    } catch (e) {
        console.warn(`[PDF] Could not load font ${fontPath}:`, e);
        return null;
    }
}


/**
 * Table-based PDF Generator
 * Reconstructs the visual table layout using jsPDF's native drawing/text APIs.
 * Produces a PDF that looks like the original (table with columns, borders, headers)
 * but with real selectable, copyable text instead of rasterized images.
 */
async function generateTablePdf(options = {}) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - (2 * margin);
    let y = margin;

    // ── Load custom fonts ────────────────────────────────────────────────────
    const devanagariFont = await loadFont(pdf, 'fonts/NotoSansDevanagari-Regular.ttf', 'NotoSansDevanagari');
    const iastFont = await loadFont(pdf, 'fonts/NotoSerif-Regular.ttf', 'NotoSerif');

    // ── Gather Data ──────────────────────────────────────────────────────────
    const titleText = options.title || getSequenceTitle() || 'Untitled Sequence';
    const catVal = (options.category ?? getCurrentCategoryValue()).trim();
    const notesVal = (options.notes ?? (document.getElementById('builderNotes')?.value || '')).trim();
    const sourcePoses = options.poses || builderState.poses;
    const libMap = window.asanaLibrary || {};
    const libArray = Object.values(libMap);

    // ── Column Layout ────────────────────────────────────────────────────────
    // Col 1: #, ID, Devanagari (stacked vertically)
    // Col 2: English name, IAST, variation, note
    // Col 3: Duration, tier info

    // Calculate the widest Devanagari text to size col1 dynamically
    let maxDevanagariWidth = 0;
    if (devanagariFont) {
        pdf.setFont(devanagariFont, 'normal');
        pdf.setFontSize(8);
        sourcePoses.forEach(pose => {
            const idStr = String(pose.id);
            const normId = idStr.match(/^\d+/)?.[0]?.padStart(3, '0') || idStr;
            const asana = libMap[normId] || libArray.find(a => String(a.id || a.asanaNo) === String(normId));
            const devText = asana?.devanagari || '';
            if (devText) {
                const w = pdf.getTextWidth(devText);
                if (w > maxDevanagariWidth) maxDevanagariWidth = w;
            }
        });
    }
    // Base col1W on the widest Devanagari text, with a minimum of 18mm and max of 45mm
    const col1W = Math.min(45, Math.max(18, maxDevanagariWidth + 5));

    const col2W = 95;   // Pose Details (English, IAST, variation, note)
    const col3W = contentWidth - col1W - col2W; // Info (remaining, shrinks to accommodate Sanskrit)

    const col1X = margin;
    const col2X = col1X + col1W;
    const col3X = col2X + col2W;
    const tableRight = margin + contentWidth;

    // ── Styling Constants ────────────────────────────────────────────────────
    const headerBg = [245, 245, 247];
    const headerTextColor = [134, 134, 139];
    const borderColor = [210, 210, 215];
    const bodyTextColor = [30, 30, 30];
    const linkColor = [0, 122, 255];
    const noteColor = [100, 100, 100];
    const safetyBg = [255, 252, 240];
    const safetyTextColor = [80, 80, 80];

    // ── Helpers ──────────────────────────────────────────────────────────────
    function addPageIfNeeded(needed) {
        if (y + needed > pageHeight - margin) {
            pdf.addPage();
            y = margin;
        }
    }

    function drawCellBg(x, y, w, h, color) {
        pdf.setFillColor(color[0], color[1], color[2]);
        pdf.rect(x, y, w, h, 'F');
    }

    function drawCellBorder(x, y, w, h) {
        pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        pdf.setLineWidth(0.2);
        pdf.rect(x, y, w, h, 'S');
    }

    // Calculate total duration
    const tempPoses = sourcePoses.map(p => {
        const tierTag = (!p.holdTier || p.holdTier === 'standard') ? '' : ` tier:${p.holdTier === 'short' ? 'S' : 'L'}`;
        const cleanNote = (p.note || '').replace(/\btier:[SL]\b/gi, '').trim();
        const meta = { explicitSide: p.side || null };
        return [p.id, p.duration, p.variation || "", p.variation || "", (cleanNote + tierTag).trim(), null, null, meta];
    });
    const totalSec = (typeof window.calculateTotalSequenceTime === "function")
        ? window.calculateTotalSequenceTime({ poses: tempPoses })
        : 0;
    const totalMinutes = Math.ceil(totalSec / 60);
    let formattedTime = "";
    if (totalMinutes >= 60) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        formattedTime = m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
        formattedTime = `${totalMinutes}m`;
    }

    const dateStr = new Date().toLocaleDateString('en-AU', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // ── Build Content ────────────────────────────────────────────────────────

    // 1. Title
    addPageIfNeeded(14);
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(titleText, margin, y + 8);
    y += 12;

    // 2. Category
    if (catVal) {
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(catVal, margin, y + 4);
        y += 8;
    }

   // 3. Date + Duration + Course ID (header meta bar)
    addPageIfNeeded(9);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(107, 114, 128);
    
    // Extract ID based on the validated builderState schema
    // Fallback to URL parameters if the builder initializes via query string
    const urlParams = new URLSearchParams(window.location.search);
    const mainCourseId = options.courseId || builderState.editingSupabaseId || urlParams.get('id') || '';
    const idDisplay = mainCourseId ? `   |   Course ID: ${mainCourseId}` : '';
    
    pdf.text(`Date: ${dateStr}${idDisplay}`, margin, y + 4);

    // Duration pill (simple filled rectangle)
    const durText = `${formattedTime}`;
    const durW = pdf.getTextWidth(durText) + 8;
    const durX = tableRight - durW;
    pdf.setFillColor(29, 78, 216);
    pdf.rect(durX, y - 1, durW, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(durText, durX + 4, y + 4);

    y += 9;

    // Divider line
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, tableRight, y);
    y += 5;

    // 4. Safety Notes
    if (notesVal) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const noteLines = pdf.splitTextToSize(notesVal, contentWidth - 8);
        const noteLineH = 4.5;
        const noteHeaderH = 10;
        const notePadding = 2;
        const noteCardH = noteHeaderH + (noteLines.length * noteLineH) + notePadding;
        addPageIfNeeded(noteCardH + 4);
        // Safety note card
        drawCellBg(margin, y, contentWidth, noteCardH, safetyBg);
        drawCellBorder(margin, y, contentWidth, noteCardH);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(230, 81, 0);
        pdf.text('SAFETY NOTE', margin + 4, y + 5);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(safetyTextColor[0], safetyTextColor[1], safetyTextColor[2]);
        noteLines.forEach((line, i) => {
            pdf.text(line, margin + 4, y + noteHeaderH + (i * noteLineH));
        });
        y += noteCardH + 4;
    }

    // 5. Table Header
    addPageIfNeeded(11);
    drawCellBg(col1X, y, col1W, 8, headerBg);
    drawCellBg(col2X, y, col2W, 8, headerBg);
    drawCellBg(col3X, y, col3W, 8, headerBg);
    drawCellBorder(col1X, y, col1W, 8);
    drawCellBorder(col2X, y, col2W, 8);
    drawCellBorder(col3X, y, col3W, 8);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(headerTextColor[0], headerTextColor[1], headerTextColor[2]);
    pdf.text('# / ID', col1X + (col1W / 2), y + 5.5, { align: 'center' });
    pdf.text('Pose Details', col2X + 3, y + 5.5);
    pdf.text('Info', col3X + (col3W / 2), y + 5.5, { align: 'center' });
    y += 8;

    // 6. Table Rows
    let poseCounter = 0;

    sourcePoses.forEach(pose => {
        const idStr = String(pose.id);
        const isMacro = idStr.startsWith("MACRO:");
        const isLoopStart = idStr === "LOOP_START";
        const isLoopEnd = idStr === "LOOP_END";

        // Build cell contents
        let col1Lines = [];
        let col2Lines = [];
        let col3Lines = [];
        let rowBg = null;
        let col1Devanagari = ''; // Sanskrit text for col1, rendered with custom font

        if (isLoopStart) {
            const rounds = Number(pose.duration) || 2;
            col1Lines = ['BLOCK'];
            col2Lines = [`Repeat Block — ${rounds} rounds`];
            col3Lines = [''];
            rowBg = [232, 240, 254];
        } else if (isLoopEnd) {
            col1Lines = [''];
            col2Lines = ['— End Repeat Block —'];
            col3Lines = [''];
            rowBg = [232, 240, 254];
        } else if (isMacro) {
            const identifier = idStr.replace("MACRO:", "").trim();
            const subCourse = (window.courses || []).find(c =>
                String(c.title || "").trim().toLowerCase() === identifier.toLowerCase() ||
                String(c.id || "").trim() === identifier
            );
            const subTitle = subCourse ? subCourse.title : identifier;
            const subId = subCourse ? (subCourse.id || subCourse.course_id || identifier) : identifier;
            const rounds = Number(pose.duration) || 1;
            col1Lines = [`Course ID ${subId}`];

            col2Lines = [`${subTitle} (${rounds} round${rounds !== 1 ? 's' : ''})`];
            col3Lines = [''];

            // Calculate macro time info (matching buildMacroInfoHTML logic)
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
            const totalMacroSec = oneRoundSecs * rounds;
            col3Lines = [
                `${formatPoseDuration(oneRoundSecs)} per round`,
                `× ${rounds} round${rounds !== 1 ? 's' : ''}`,
                `${formatPoseDuration(totalMacroSec)} total`
            ];
            rowBg = [232, 240, 254];
        } else {
            // Regular pose
            poseCounter++;
            const normId = idStr.match(/^\d+/)?.[0]?.padStart(3, '0') || idStr;
            const asana = libMap[normId] || libArray.find(a => String(a.id || a.asanaNo) === String(normId));
            const engName = asana?.english || asana?.name || pose.name || `ID ${normId}`;
            const iastName = asana?.iast || '';
            const devanagariName = asana?.devanagari || '';
            const dur = Number(pose.duration) || 30;

            col1Lines = [`${poseCounter}`, `ID ${normId}`];
            if (devanagariName) col1Devanagari = devanagariName;
            col2Lines = [engName];
            if (iastName) col2Lines.push(iastName);

            if (pose.variation && asana?.variations?.[pose.variation]) {
                col2Lines.push(`(${asana.variations[pose.variation].title || `Stage ${pose.variation}`})`);
            }
            const cleanNote = (pose.note || '').replace(/\btier:[SL]\b/gi, '').replace(/\bside:[LR]\b/gi, '').trim();
            if (cleanNote && cleanNote !== 'null') {
                col2Lines.push(`Note: ${cleanNote}`);
            }

            // Build info text (duration + tier + bilateral logic)
            const tier = pose.holdTier || 'standard';
            const tierLabel = tier === 'short' ? 'Short hold' : tier === 'long' ? 'Long hold' : '';

            // Schema Strict: Account for both native boolean and potential string casts from the database adapter
            const isBilateral = asana?.requires_sides === true || 
                                String(asana?.requires_sides).toLowerCase() === 'true' || 
                                asana?.requiresSides === true || 
                                String(asana?.requiresSides).toLowerCase() === 'true';

            const formattedDuration = formatPoseDuration(dur);
            const durationDisplay = isBilateral ? `${formattedDuration} / side` : formattedDuration;

            // Automatically strips out empty tierLabels, handling the 'hide standard' request seamlessly
            col3Lines = [durationDisplay, tierLabel].filter(Boolean);
        }

        // Calculate row height
        const padding = 3;
        const lineH = 4.2;
        const maxLines = Math.max(col1Lines.length + (col1Devanagari ? 1 : 0), col2Lines.length, col3Lines.length);

        const rowH = Math.max(9, (maxLines * lineH) + (padding * 2));

        // Check if row fits on current page
        addPageIfNeeded(rowH + 2);

        // If we just added a page, redraw the table header
        if (y <= margin + 2) {
            drawCellBg(col1X, y, col1W, 8, headerBg);
            drawCellBg(col2X, y, col2W, 8, headerBg);
            drawCellBg(col3X, y, col3W, 8, headerBg);
            drawCellBorder(col1X, y, col1W, 8);
            drawCellBorder(col2X, y, col2W, 8);
            drawCellBorder(col3X, y, col3W, 8);
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(headerTextColor[0], headerTextColor[1], headerTextColor[2]);
            pdf.text('# / ID', col1X + (col1W / 2), y + 5.5, { align: 'center' });
            pdf.text('Pose Details', col2X + 3, y + 5.5);
            pdf.text('Info', col3X + (col3W / 2), y + 5.5, { align: 'center' });
            y += 8;
        }

        // Draw row background
        if (rowBg) {
            drawCellBg(col1X, y, col1W, rowH, rowBg);
            drawCellBg(col2X, y, col2W, rowH, rowBg);
            drawCellBg(col3X, y, col3W, rowH, rowBg);
        }

        // Draw cell borders
        drawCellBorder(col1X, y, col1W, rowH);
        drawCellBorder(col2X, y, col2W, rowH);
        drawCellBorder(col3X, y, col3W, rowH);

        // Write cell text
        // Col 1: centered
        col1Lines.forEach((line, i) => {
            if (i === 0) {
                // Pose number
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
                pdf.text(line, col1X + (col1W / 2), y + padding + (lineH * (i + 1)), { align: 'center' });
            } else {
                // ID label
                pdf.setFontSize(7);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(headerTextColor[0], headerTextColor[1], headerTextColor[2]);
                pdf.text(line, col1X + (col1W / 2), y + padding + (lineH * (i + 1)), { align: 'center' });
            }
        });

        // Render Devanagari in col1 if present (using custom font)
        if (col1Devanagari && devanagariFont) {
            const devanagariLineIdx = col1Lines.length;
            pdf.setFontSize(8);
            pdf.setFont(devanagariFont, 'normal');
            pdf.setTextColor(noteColor[0], noteColor[1], noteColor[2]);
            pdf.text(col1Devanagari, col1X + (col1W / 2), y + padding + (lineH * (devanagariLineIdx + 1)), { align: 'center' });
        }

        // Col 2: left-aligned
        col2Lines.forEach((line, i) => {
            if (i === 0) {
                // Pose name
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(bodyTextColor[0], bodyTextColor[1], bodyTextColor[2]);
                pdf.text(line, col2X + 3, y + padding + (lineH * (i + 1)));
            } else if (line.startsWith('Note:')) {
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(noteColor[0], noteColor[1], noteColor[2]);
                pdf.text(line, col2X + 3, y + padding + (lineH * (i + 1)));
            } else if (line.startsWith('(')) {
                // Variation
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
                pdf.text(line, col2X + 3, y + padding + (lineH * (i + 1)));
            } else {
                // IAST — use NotoSerif for proper diacritical rendering
                pdf.setFontSize(9);
                if (iastFont) {
                    pdf.setFont(iastFont, 'normal');
                } else {
                    pdf.setFont('helvetica', 'italic');
                }
                pdf.setTextColor(noteColor[0], noteColor[1], noteColor[2]);
                pdf.text(line, col2X + 3, y + padding + (lineH * (i + 1)));
            }
        });

        // Col 3: centered
        col3Lines.forEach((line, i) => {
            if (i === 0) {
                // Duration
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(bodyTextColor[0], bodyTextColor[1], bodyTextColor[2]);
                pdf.text(line, col3X + (col3W / 2), y + padding + (lineH * (i + 1)), { align: 'center' });
            } else {
                // Tier label
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(noteColor[0], noteColor[1], noteColor[2]);
                pdf.text(line, col3X + (col3W / 2), y + padding + (lineH * (i + 1)), { align: 'center' });
            }
        });

        y += rowH;
    });

    // 7. Total Duration Footer
    addPageIfNeeded(12);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, tableRight, y);
    y += 6;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 80, 200);
    pdf.text(`Total Duration: ${formattedTime}`, margin, y);

    y += 6;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(160, 160, 160);
    pdf.text(`Generated on ${dateStr}`, margin, y);

    // 8. Save
    if (options.save === false) {
        return pdf.output('blob');
    }

    pdf.save(options.filename || buildPdfFilename(titleText, catVal));
}

export function initExportUI(container) {
    if (!container) return null;

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
        </div>
    `;

    const btnDownloadPdf = root.querySelector('#btnDownloadPdf');

    if (btnDownloadPdf) {
        btnDownloadPdf.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadSequencePdf();
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
