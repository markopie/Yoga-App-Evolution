// src/ui/courseUI.js
// Course/Sequence dropdown rendering + collage/plate renderers

import { mobileVariantUrl, smartUrlsForPoseId } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE COLLAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a responsive <div class="collage"> element from a list of image URLs.
 * Uses <picture> with a mobile srcset for bandwidth savings.
 */
export function renderCollage(urls) {
    const wrap = document.createElement("div");
    wrap.className = "collage";
    urls.forEach(u => {
        const mob  = (typeof mobileVariantUrl === "function") ? mobileVariantUrl(u) : u;
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.innerHTML = `
          <picture>
            <source media="(max-width: 768px)" srcset="${mob}">
            <img src="${u}" alt="" loading="lazy" decoding="async">
          </picture>
        `;
        wrap.appendChild(tile);
    });
    return wrap;
}

/**
 * Renders a named plate section inside a detail view.
 * Shows a list of plate tokens, builds image URLs, and deduplicates against a global Set.
 *
 * @param {string}  title      - Section header text ("Final Poses", etc.)
 * @param {Array}   plates     - Array of plate IDs to render.
 * @param {Set}     globalSeen - Cross-section de-dup Set; mutated in place.
 * @param {string}  fallbackId - Fallback plate ID to try if the main list yields no images.
 */
export function renderPlateSection(title, plates, globalSeen, fallbackId) {
    const wrap   = document.createElement("div");
    const header = document.createElement("div");
    header.className   = "section-title";
    header.textContent = title;
    wrap.appendChild(header);

    const targets = (plates && plates.length) ? plates : [];
    if (!targets.length && !fallbackId) {
        const msg = document.createElement("div");
        msg.className   = "msg";
        msg.textContent = "–";
        wrap.appendChild(msg);
        return wrap;
    }

    const urls    = [];
    const missing = [];
    const seen    = new Set();

    const processIds = (idList) => {
        for (const p of idList) {
            if (!p || p === "undefined") continue;
            const u = smartUrlsForPoseId(p);
            if (!u.length) missing.push(p);
            u.forEach(x => {
                const g = globalSeen || null;
                if (!seen.has(x) && !(g && g.has(x))) {
                    seen.add(x);
                    if (g) g.add(x);
                    urls.push(x);
                }
            });
        }
    };
    processIds(targets);

    // Try fallback if nothing found
    if (urls.length === 0 && fallbackId) {
        const fallbackUrls = smartUrlsForPoseId(fallbackId);
        if (fallbackUrls.length > 0) {
            fallbackUrls.forEach(x => {
                const g = globalSeen || null;
                if (!seen.has(x) && !(g && g.has(x))) {
                    seen.add(x);
                    if (g) g.add(x);
                    urls.push(x);
                }
            });
            while (missing.length > 0) missing.pop();
        }
    }

    if (targets.length) {
        const meta = document.createElement("div");
        meta.className        = "muted";
        meta.style.marginTop  = "4px";
        meta.style.fontSize   = "0.8rem";
        meta.textContent      = `Ref Plates: ${targets.join(", ")}`;
        wrap.appendChild(meta);
    }

    if (urls.length) {
        wrap.appendChild(renderCollage(urls));
    }

    if (missing.length && urls.length === 0) {
        const m = document.createElement("div");
        m.className      = "msg";
        m.style.color    = "#d9534f";
        m.textContent    = `⚠️ Image not found for Ref: ${missing.join(", ")}`;
        wrap.appendChild(m);
    }

    return wrap;
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY FILTER DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuilds the category filter <select> from the current global courses list.
 * Groups categories by their parent prefix (e.g., "Asana > Standing").
 */
export function renderCategoryFilter() {
    const filterEl = document.getElementById("categoryFilter");
    if (!filterEl) return;

    const courses = window.courses || [];

    const uniqueCats = new Set();
    courses.forEach(c => {
        const cat = c.category ? c.category.trim() : "Uncategorized";
        uniqueCats.add(cat);
    });

    const currentVal = filterEl.value;
    filterEl.innerHTML = `<option value="ALL">📂 All Collections</option>`;

    const structuredCats = {};
    Array.from(uniqueCats).sort().forEach(cat => {
        const parts = cat.split(">");
        let group = "General";
        let label = cat;
        if (parts.length > 1) {
            group = parts[0].trim();
            label = parts.slice(1).join(">").trim();
        }
        if (!structuredCats[group]) structuredCats[group] = [];
        structuredCats[group].push({ value: cat, label });
    });

    Object.keys(structuredCats).sort().forEach(groupName => {
        let parentEl = filterEl;
        if (groupName !== "General") {
            const optgroup = document.createElement("optgroup");
            optgroup.label = groupName;
            filterEl.appendChild(optgroup);
            parentEl = optgroup;
        }

        structuredCats[groupName].forEach(item => {
            const opt = document.createElement("option");
            opt.value = item.value;

            let icon = "📄";
            if (groupName === "General" || item.value === item.label) {
                icon = "📁";
                if (item.value.includes("Asana"))       icon = "🧘";
                else if (item.value.includes("Therapeutic")) icon = "❤️";
                else if (item.value.includes("Pranayama"))   icon = "🌬️";
            }
            opt.textContent = `${icon} ${item.label}`;
            parentEl.appendChild(opt);
        });
    });

    filterEl.value = currentVal || "ALL";
    filterEl.onchange = () => {
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            sel.value = ""; // Clear sequence if user changes category
            sel.dispatchEvent(new Event("change"));
        }
        renderCourseUI();
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSE SELECTOR (SEQUENCE DROPDOWN)
// ─────────────────────────────────────────────────────────────────────────────

export function updateActiveCategoryTitle() {
    const sel      = document.getElementById("sequenceSelect");
    const filterEl = document.getElementById("categoryFilter");
    const activeTitleEl = document.getElementById("activeCategoryTitle");
    if (!activeTitleEl) return;

    let displayCat = null;
    let didChangeFilter = false;
    
    // If a sequence is actively selected, it dictates the category.
    if (sel && sel.value && window.courses && window.courses[sel.value]) {
        const courseCat = window.courses[sel.value].category || "Uncategorized";
        
        // Auto-update the category dropdown to match the selected sequence 
        // if user found it via "All Collections"
        if (filterEl && filterEl.value === "ALL") {
            filterEl.value = courseCat;
            didChangeFilter = true;
        }

        const parts = courseCat.split(">");
        displayCat = parts[0].trim();
    } 
    // Otherwise, if no sequence is selected but a filter IS applied
    else if (filterEl && filterEl.value !== "ALL" && filterEl.value) {
        const parts = filterEl.value.split(">");
        displayCat = parts[0].trim();
    }

    if (displayCat) {
        activeTitleEl.textContent = displayCat;
        activeTitleEl.style.display = "block";
    } else {
        activeTitleEl.style.display = "none";
    }

    // Rebuild sequence options properly if we forcefully changed the category dropdown above
    if (didChangeFilter && typeof renderCourseUI === "function") {
        renderCourseUI();
    }
}

/**
 * Rebuilds the sequence <select> filtered by the current category selection.
 * Groups courses by their category string and sorts alphabetically.
 */
export function renderCourseUI() {
    const sel      = document.getElementById("sequenceSelect");
    const filterEl = document.getElementById("categoryFilter");
    if (!sel) return;

    const courses    = window.courses || [];
    const filterVal  = filterEl ? filterEl.value : "ALL";
    const currentVal = sel.value;

    sel.innerHTML = `<option value="">Select a course</option>`;

    const grouped = {};
    courses.forEach((course, idx) => {
        const cat = course.category ? course.category.trim() : "Uncategorized";
        if (filterVal !== "ALL" && cat !== filterVal) return;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ course, idx });
    });

    Object.keys(grouped).sort().forEach(catName => {
        const groupEl   = document.createElement("optgroup");
        groupEl.label   = catName;

        grouped[catName].forEach(item => {
            const opt       = document.createElement("option");
            opt.value       = String(item.idx);
            opt.textContent = item.course.title || `Course ${item.idx + 1}`;
            groupEl.appendChild(opt);
        });
        sel.appendChild(groupEl);
    });

    if (currentVal) {
        const exists = Array.from(sel.options).some(o => o.value === currentVal);
        if (exists) sel.value = currentVal;
    }
}

/**
 * Master entry point — rebuilds both the category filter and the course list.
 * Called after data is loaded or a sequence is saved.
 */
export function renderSequenceDropdown() {
    renderCategoryFilter();
    renderCourseUI();
}

// Expose for legacy calls (wiring.js, app.js fragments)
window.renderSequenceDropdown = renderSequenceDropdown;
window.renderCourseUI         = renderCourseUI;
window.renderCategoryFilter   = renderCategoryFilter;
window.renderCollage          = renderCollage;
window.updateActiveCategoryTitle = updateActiveCategoryTitle;
