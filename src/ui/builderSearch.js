// src/ui/builderSearch.js
import { $, normaliseText } from "../utils/dom.js";

export function setupBuilderSearch(getAsanaIndex, onResultSelected, onSemicolonCommand) {
    const searchInput = $("builderSearch");
    const resultsBox = $("builderSearchResults");
    if (!searchInput || !resultsBox) return;

    resultsBox.style.display = "none";

    function scoreAsana(asma, query) {
        const q = normaliseText(query);
        if (!q) return 0;

        const idStrLoy = String(asma.id || '');
        const idStrMehta = String(asma.yoga_the_iyengar_way_id || '');
        const idStrPage = String(asma.page_primary || '');
        const idNormLoy = idStrLoy.toLowerCase();
        
        // Exact Numeric Match (Prioritize LOY, then Mehta/Page)
        if (/^\d+$/.test(q)) {
            if (idStrLoy.padStart(3, '0') === q.padStart(3, '0')) return 100;
            if (idStrMehta && idStrMehta.padStart(3, '0') === q.padStart(3, '0')) return 90;
            if (idStrPage && idStrPage.padStart(3, '0') === q.padStart(3, '0')) return 85;
        }
        
        if (idNormLoy === q || idStrMehta.toLowerCase() === q || idStrPage.toLowerCase() === q) return 100;

        const eng  = normaliseText(asma.english || '');
        const iast = normaliseText(asma.iast || '');
        const sans = normaliseText(asma.name || '');
        const plate = normaliseText(String(asma.plates || ''));

        if (eng.startsWith(q) || iast.startsWith(q) || sans.startsWith(q)) return 50;
        if (eng.includes(q) || iast.includes(q) || sans.includes(q)) return 20;
        if (plate.includes(q)) return 10;
        if (idNormLoy.includes(q) || (idStrMehta && idStrMehta.includes(q)) || (idStrPage && idStrPage.includes(q))) return 5;

        return 0;
    }

    function getSearchResults(query) {
        const library = getAsanaIndex();
        const scored = [];
        for (const asma of library) {
            const s = scoreAsana(asma, query);
            if (s > 0) scored.push({ asma, score: s });
        }
        scored.sort((a, b) => b.score - a.score);
        return { results: scored };
    }

    searchInput.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        const val = searchInput.value.trim();
        const isSemicolon = val.includes(';');
        const upperVal = val.toUpperCase();
        const isBatch = isSemicolon || upperVal.startsWith('LOY:') || upperVal.startsWith('MEHTA:');

        if (isBatch) {
            e.preventDefault();
            
            // ARCHITECT'S NOTE: Ensure this name matches your defined function
            if (typeof processSemicolonCommand === "function") {
                processSemicolonCommand(val);
            } else if (typeof onSemicolonCommand === "function") {
                onSemicolonCommand(val);
            } else {
                console.error("FATAL: Batch processing function not found in scope.");
            }

            searchInput.value = "";
            resultsBox.style.display = "none";
            return;
        }

        // Standard Single Search Fallback
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
        const upperQuery = query.toUpperCase();
        // Logic Guard: Hide results if it's a batch command (Semicolon, LOY:, or MEHTA:)
        if (query.length < 1 || query.includes(';') || upperQuery.startsWith('LOY:') || upperQuery.startsWith('MEHTA:')) {
            resultsBox.style.display = "none";
            return;
        }

        const { results } = getSearchResults(query); // 🔥 Removed undefined source

        if (results.length > 0) {
            resultsBox.innerHTML = results.slice(0, 15).map(({ asma, score }) => {
                const catLabel = asma.category ? asma.category.replace(/^\d+_/, '').replace(/_/g, ' ') : '';

                return `
                    <div class="search-result-item" data-id="${asma.id}" style="padding:10px; cursor:pointer; border-bottom:1px solid #eee; display:flex; gap:10px; align-items:center;">
                        <div style="background:#007aff; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem; min-width:28px; text-align:center;">${asma.id}</div>
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