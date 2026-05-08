import { escapeHtml2, formatHMS } from "../utils/format.js";

function rawPoseId(node) {
    return Array.isArray(node?.[0]) ? node[0][0] : node?.[0];
}

function isTransitionNode(node) {
    const noteText = String(node?.[4] || "").toLowerCase();
    const labelText = String(node?.[6] || "").toLowerCase();
    return noteText.includes("recovery") || labelText.includes("recovery") ||
        noteText.includes("preparat") || labelText.includes("preparat") ||
        noteText.includes("preparation");
}

function cleanNote(note, stripPrefix = "") {
    let text = String(note || "").trim();
    const prefix = String(stripPrefix || "").trim();
    if (prefix && text.toLowerCase().startsWith(prefix.toLowerCase())) {
        text = text.slice(prefix.length).trim();
        if (text.startsWith("|")) text = text.slice(1).trim();
    }
    return text;
}

export function findLinkedSequence(identifier) {
    const lookup = String(identifier || "").trim();
    if (!lookup) return null;
    const lookupLower = lookup.toLowerCase();
    return (window.courses || []).find(course =>
        String(course.title || "").trim().toLowerCase() === lookupLower ||
        String(course.id || "").trim() === lookup ||
        String(course.supabaseId || "").trim() === lookup
    ) || null;
}

export function sequenceNodeToDetailItem(node, options = {}) {
    if (!node || isTransitionNode(node)) return null;

    const id = rawPoseId(node);
    const asana = window.findAsanaByIdOrPlate
        ? window.findAsanaByIdOrPlate(window.normalizePlate ? window.normalizePlate(id) : id)
        : null;
    const variationKey = String(node[3] || "").trim();
    const variationTitle = variationKey && asana?.variations?.[variationKey]
        ? (asana.variations[variationKey].title || variationKey)
        : variationKey;

    const durationSeconds = typeof window.getPosePillTime === "function"
        ? window.getPosePillTime(node)
        : Number(node[1] || 0);

    return {
        id,
        displayId: String(id || "").replace(/^0+/, "") || String(id || ""),
        name: node[2] || asana?.english || asana?.name || node[6] || `Pose ${id}`,
        iast: asana?.iast || "",
        variation: variationTitle,
        note: cleanNote(node[4], options.stripNotePrefix),
        durationSeconds,
        playbackIndex: options.playbackIndex,
        completedSeconds: Number(options.completedSeconds || 0),
    };
}

export function getLinkedSequenceDetailItems(sequence) {
    if (!sequence?.poses) return [];
    const expanded = typeof window.getExpandedPoses === "function"
        ? window.getExpandedPoses(sequence)
        : sequence.poses;
    return expanded
        .map(node => sequenceNodeToDetailItem(node))
        .filter(Boolean);
}

export function renderLinkedSequenceDetailsHtml(items, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return "";

    const summaryText = options.summaryText || "Show poses in linked sequence";
    const className = options.className ? ` ${options.className}` : "";
    const showCompletion = !!options.showCompletion;

    const rows = items.map((item, index) => {
        const duration = formatHMS(item.durationSeconds || 0);
        const variationHtml = item.variation
            ? `<span class="linked-sequence-detail__variation">${escapeHtml2(item.variation)}</span>`
            : "";
        const noteHtml = item.note
            ? `<div class="linked-sequence-detail__note">${escapeHtml2(item.note)}</div>`
            : "";
        const iastHtml = item.iast
            ? `<em class="linked-sequence-detail__iast">${escapeHtml2(item.iast)}</em>`
            : "";
        const completionHtml = showCompletion
            ? renderCompletionStatus(item)
            : "";

        return `<li class="linked-sequence-detail__item">
            <div class="linked-sequence-detail__main">
                <span class="linked-sequence-detail__index">${index + 1}</span>
                <span class="linked-sequence-detail__id">ID ${escapeHtml2(item.displayId)}</span>
                <span class="linked-sequence-detail__name">${escapeHtml2(item.name)}</span>
                ${variationHtml}
            </div>
            <div class="linked-sequence-detail__meta">
                ${iastHtml}
                <span>${escapeHtml2(duration)}</span>
                ${completionHtml}
            </div>
            ${noteHtml}
        </li>`;
    }).join("");

    return `<details class="linked-sequence-details${className}">
        <summary>${escapeHtml2(summaryText)} <span class="linked-sequence-details__count">${items.length}</span></summary>
        <ol class="linked-sequence-details__list">${rows}</ol>
    </details>`;
}

function renderCompletionStatus(item) {
    const allocated = Number(item.durationSeconds || 0);
    const completed = Number(item.completedSeconds || 0);
    const ratio = allocated > 0 ? completed / allocated : 0;
    const isDone = ratio >= 0.9;
    const label = isDone ? "Done" : `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    return `<span class="linked-sequence-detail__status ${isDone ? "is-done" : "is-partial"}">${label}</span>`;
}
