// src/ui/builderSearch.js
import { $, normaliseText } from "../utils/dom.js";

/**
 * Initializes the builder search input, dropdown logic, and hit scoring.
 * @param {function} getAsanaIndex - Function returning the library array to search.
 * @param {function} onResultSelected - Callback triggered when an item is clicked/enter.
 * @param {function} onSemicolonCommand - Callback triggered if the user types a semicolon command.
 */
export function setupBuilderSearch(getAsanaIndex, onResultSelected, onSemicolonCommand) {
    const searchInput = $("builderSearch");
    const resultsBox = $("builderSearchResults");
    if (!searchInput || !resultsBox) return;

    resultsBox.style.display = "none";

    function scoreAsana(asma, query, source) {
        const q = normaliseText(query);
        if (!q) return 0;

        let idStr = source === 'mehta' ? String(asma.yoga_the_iyengar_way_id || '') : String(asma.id || '');
        const idNorm = idStr.toLowerCase();
        
        if (/^\d+$/.test(q) && idStr.padStart(3, '0') === q.padStart(3, '0')) return 100;
        if (idNorm === q) return 100;

        const eng  = normaliseText(asma.english || '');
        const iast = normaliseText(asma.iast || '');
        const sans = normaliseText(asma.name || '');
        const plate = normaliseText(String(asma.plates || ''));

        if (eng.startsWith(q) || iast.startsWith(q) || sans.startsWith(q)) return 50;
        if (eng.includes(q) || iast.includes(q) || sans.includes(q)) return 20;
        if (plate.includes(q)) return 10;
        if (idNorm.includes(q)) return 5;

        return 0;
    }

    function getSearchResults(query) {
        const source = $("builderIdSource")?.value || "loy";
        const library = getAsanaIndex();

        const scored = [];
        for (const asma of library) {
            const s = scoreAsana(asma, query, source);
            if (s > 0) scored.push({ asma, score: s });
        }
        scored.sort((a, b) => b.score - a.score);
        return { results: scored, source };
    }

    searchInput.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            const val = searchInput.value.trim();
            if (val.includes(';')) {
                e.preventDefault();
                onSemicolonCommand(val);
                searchInput.value = "";
                return;
            }
            if (val.length >= 1) {
                e.preventDefault();
                const { results } = getSearchResults(val);
                if (results.length > 0) {
                    onResultSelected(results[0].asma);
                    searchInput.value = "";
                    resultsBox.style.display = "none";
                }
            }
        }
    };

    searchInput.oninput = () => {
        const query = searchInput.value.trim();
        if (query.length < 1 || query.includes(';')) {
            resultsBox.style.display = "none";
            return;
        }

        const { results, source } = getSearchResults(query);

        if (results.length > 0) {
            resultsBox.innerHTML = results.slice(0, 15).map(({ asma, score }) => {
                const displayId = (source === "mehta") ? (asma.yoga_the_iyengar_way_id || "N/A") : asma.id;
                const badgeColor = (source === "mehta") ? "#673ab7" : "#007aff";
                const catLabel = asma.category ? asma.category.replace(/^\d+_/, '').replace(/_/g, ' ') : '';

                return `
                    <div class="search-result-item" data-id="${asma.id}" style="padding:10px; cursor:pointer; border-bottom:1px solid #eee; display:flex; gap:10px; align-items:center;">
                        <div style="background:${badgeColor}; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem; min-width:28px; text-align:center;">${displayId}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${asma.english || asma.name || 'Unknown'}</div>
                            <div style="font-size:0.75rem; color:#666; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${asma.iast || asma.name || ''}</div>
                        </div>
                        ${catLabel ? `<div style="font-size:0.65rem; color:#999; white-space:nowrap;">${catLabel}</div>` : ''}
                    </div>
                `;
            }).join("");

            resultsBox.style.display = "block";

            const rect = searchInput.getBoundingClientRect();
            resultsBox.style.width = `${rect.width}px`;
            resultsBox.style.top = `${rect.bottom + 4}px`;
            resultsBox.style.left = `${rect.left}px`;

            resultsBox.querySelectorAll('.search-result-item').forEach(item => {
                item.onclick = () => {
                    const id = item.dataset.id;
                    const asma = getAsanaIndex().find(a => String(a.id) === id);
                    if (asma) {
                        onResultSelected(asma);
                        searchInput.value = "";
                        resultsBox.style.display = "none";
                        searchInput.focus();
                    }
                };
            });
        } else {
            resultsBox.style.display = "none";
        }
    };

    searchInput.onblur = () => {
        setTimeout(() => { resultsBox.style.display = "none"; }, 250);
    };
}