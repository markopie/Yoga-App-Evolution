import { $, enterBrowseDetailMode, exitBrowseDetailMode } from "../utils/dom.js";
import { displayName, prefersIAST, formatTechniqueText } from "../utils/format.js";
import { isBrowseMobile, mobileVariantUrl, smartUrlsForPoseId } from "../utils/helpers.js";
import { playAsanaAudio } from "../playback/audio.js";
import { normalizePlate } from "../services/dataAdapter.js";

// Access global variables that app.js sets
const getAsanaLibrary = () => window.asanaLibrary;

function setupBrowseUI() {
// console.log("setupBrowseUI() is running...");

    // 1. Wire up the main Browse button
    const bBtn = document.getElementById("browseBtn");
    if (bBtn) {
// console.log("✅ Browse button found! Attaching click listener.");
        bBtn.onclick = (e) => {
            e.preventDefault();
            window.openBrowse();
        };
    } else {
        console.error("❌ ERROR: browseBtn was NULL during setupBrowseUI!");
    }

    // 2. Wire up the close button
    if ($("browseCloseBtn")) {
        $("browseCloseBtn").addEventListener("click", closeBrowse);
    }

    // 3. Hide Finals Checkbox
    const finalsChk = $("browseFinalOnly");
    if (finalsChk) {
        if (finalsChk.parentElement && finalsChk.parentElement.tagName === "LABEL") {
            finalsChk.parentElement.style.display = "none";
        } else {
            finalsChk.style.display = "none";
        }
    }

    const closeBtn = $("browseCloseBtn");

    // Create "Add Asana" Button (always visible)
    if (closeBtn && !document.getElementById("browseAddAsanaBtn")) {
        const addBtn = document.createElement("button");
        addBtn.id = "browseAddAsanaBtn";
        addBtn.textContent = "Add Asana";
        addBtn.className = "tiny";
        addBtn.style.cssText = "background: #007aff; color: white; margin-right: 8px;";

        addBtn.onclick = () => {
            if (typeof window.openAsanaEditor === "function") {
                window.openAsanaEditor(null);
            }
        };

        if (closeBtn.parentNode) {
            closeBtn.parentNode.insertBefore(addBtn, closeBtn);
            closeBtn.parentNode.style.display = "flex";
            closeBtn.parentNode.style.alignItems = "center";
        }
    }

    // 6. Backdrop Click Logic
    const bd = $("browseBackdrop");
    if (bd) {
        let downOnBackdrop = false;
        bd.addEventListener("pointerdown", (e) => { downOnBackdrop = (e.target === bd); });
        bd.addEventListener("click", (e) => {
            if (e.target === bd && downOnBackdrop) closeBrowse();
            downOnBackdrop = false;
        });
    }

    // 7. ESC Key Support
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $("browseBackdrop")?.style.display === "flex") {
            closeBrowse();
        }
    });

    // 8. Filters
    const onChange = () => applyBrowseFilters();
    const debounce = (fn, ms = 120) => {
        let t = null;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };

    if ($("browseSearch")) $("browseSearch").addEventListener("input", debounce(onChange, 120));
    if ($("browseAsanaNo")) $("browseAsanaNo").addEventListener("input", debounce(onChange, 120));
    if ($("browseCategory")) $("browseCategory").addEventListener("change", onChange);
    
    // Populate category dropdown dynamically from asana library
    // Called once after library loads; also exposed on window for re-population
    window.populateBrowseCategoryDropdown = function() {
        const catEl = $("browseCategory");
        if (!catEl) return;
        const lib = window.asanaLibrary || {};
        const cats = new Set();
        Object.values(lib).forEach(a => {
            if (a && a.category && a.category.trim()) cats.add(a.category.trim());
        });
        
        // Keep the existing first option ("All categories")
        catEl.innerHTML = '<option value="">All categories</option>';
        
        // Sort by the category string (numeric prefix preserves order)
        const sortedCats = Array.from(cats).sort();
        sortedCats.forEach(rawCat => {
            const displayLabel = rawCat.replace(/^\d+_/, '').replace(/_/g, ' ');
            const opt = document.createElement('option');
            opt.value = rawCat;
            opt.textContent = displayLabel;
            catEl.appendChild(opt);
        });
        
        if (sortedCats.length === 0) {
            const opt = document.createElement('option');
            opt.value = '__UNCAT__';
            opt.textContent = 'Uncategorized';
            catEl.appendChild(opt);
        }
    };

    // --- IAST Toggle button on the browse list header ---
    const browseListHeader = document.querySelector('#browseBackdrop .browse-list-header, #browseBackdrop .browse-panel');
    let iastToggleBtn = document.getElementById('browseIastToggle');
    if (!iastToggleBtn) {
        const filtersRow = $("browseCategory")?.parentElement?.parentElement || $("browseSearch")?.parentElement;
        iastToggleBtn = document.createElement('button');
        iastToggleBtn.id = 'browseIastToggle';
        iastToggleBtn.className = 'tiny';
        iastToggleBtn.title = 'Toggle IAST / English names in the list';
        iastToggleBtn.style.cssText = 'white-space:nowrap; flex-shrink:0;';
        window._browseShowIAST = false;
        iastToggleBtn.textContent = 'Show IAST';
        iastToggleBtn.onclick = () => {
            window._browseShowIAST = !window._browseShowIAST;
            iastToggleBtn.textContent = window._browseShowIAST ? 'Show English' : 'Show IAST';
            iastToggleBtn.style.background = window._browseShowIAST ? '#7b1fa2' : '';
            iastToggleBtn.style.color = window._browseShowIAST ? '#fff' : '';
            applyBrowseFilters();
        };
        // Append into .browse-filters (the filter bar) - browseCategory is a direct child of .browse-filters
        const filtersBar = $("browseCategory")?.parentElement;
        if (filtersBar) {
            filtersBar.appendChild(iastToggleBtn);
        }
    }
}


window.openBrowse = function() {
document.body.classList.add("modal-open");
    const bd = $("browseBackdrop");
    
    if (!bd) {
        console.error("❌ ERROR: browseBackdrop not found in the HTML!");
        return;
    }
    
    bd.style.display = "flex";
    bd.setAttribute("aria-hidden", "false");
    
    // Populate category dropdown if not already done
    if (typeof window.populateBrowseCategoryDropdown === 'function') {
        window.populateBrowseCategoryDropdown();
    }
    
    try {
        applyBrowseFilters(); 
    } catch (e) {
        console.error("❌ ERROR inside applyBrowseFilters:", e);
    }
    
    if ($("browseSearch")) $("browseSearch").focus();
};

// Ensure the local reference points to the window one just in case
const openBrowse = window.openBrowse;

function closeBrowse() {
    document.body.classList.remove("modal-open");
    const bd = $("browseBackdrop");
    if (!bd) return;
    bd.style.display = "none";
    bd.setAttribute("aria-hidden", "true");
    exitBrowseDetailMode();
    const d = $("browseDetail");
    if (d) d.innerHTML = "";
    if ($("browseBtn")) $("browseBtn").focus();
}
function renderBrowseList(items) {
    const list = document.getElementById("browseList");
    if (!list) return;
    
    list.innerHTML = "";
    const countEl = document.getElementById("browseCount");
    
    const totalCount = Object.keys(asanaLibrary || {}).length;
    // Count includes stage hits — show base poses count in denominator
    const stageHitCount = items.filter(a => a._sourceType === 'stage').length;
    const baseHitCount = items.length - stageHitCount;
    if (countEl) {
        countEl.textContent = stageHitCount > 0
            ? `Showing ${baseHitCount} poses + ${stageHitCount} stages of ${totalCount} total`
            : `Showing ${items.length} of ${totalCount}`;
    }

    if (!items.length) {
       list.innerHTML = `<div class="msg" style="padding:10px 0">No matches found.</div>`;
       return;
    }

    const frag = document.createDocumentFragment();
    
    items.slice(0, 400).forEach(asma => {
       const row = document.createElement("div");
       // Give stage rows a subtle left border to visually group them under their parent
       row.className = "browse-item" + (asma._sourceType === 'stage' ? " browse-item--stage" : "");
       if (asma._sourceType === 'stage') {
           row.style.cssText = "border-left: 3px solid #00695c; margin-left: 8px; background: #f0faf9;";
       }

       const left = document.createElement("div");
       
       const title = document.createElement("div");
       title.className = "title";
       
       // Use IAST or English based on toggle
       const showIAST = !!window._browseShowIAST;
       let titleText;

       if (asma._sourceType === 'stage' && asma._stageTitle) {
           // For stage results: show stage title as primary
           titleText = asma._stageTitle;
       } else if (showIAST && asma.iast) {
           titleText = asma.iast;
       } else {
           titleText = (typeof displayName === "function" ? displayName(asma) : null);
           if (!titleText || titleText === "(no name)") {
               titleText = asma.name || asma.english || asma.iast || "(no name)";
           }
       }
       
       // Variation count badge (only for base poses)
       if (asma._sourceType !== 'stage') {
           const varCount = asma.variations ? Object.keys(asma.variations).length : 0;
           if (varCount > 0) {
               titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${varCount} variations)</span>`;
           }
       }
       title.innerHTML = titleText;

       // Sub-label: parent asana name when showing a stage result
       if (asma._sourceType === 'stage') {
           const parentSub = document.createElement('div');
           parentSub.style.cssText = 'font-size:0.78rem; color:#00695c; margin-top:1px; font-weight:600;';
           const parentName = asma.english || asma.name || `ID ${asma.id}`;
           parentSub.textContent = `↳ ${parentName}`;
           left.appendChild(parentSub);
       } else if (showIAST && asma.english) {
           const sub = document.createElement('div');
           sub.style.cssText = 'font-size:0.8rem; color:#888; margin-top:1px;';
           sub.textContent = asma.english;
           left.appendChild(sub);
       }

       const meta = document.createElement("div");
       meta.className = "meta";
       const catRaw = (asma.category || "").trim();
       const catDisplay = catRaw ? catRaw.replace(/^\d+_/, "").replace(/_/g, " ") : "Uncategorized";
       const catBadge = `<span class="badge">${catDisplay}</span>`;

       // Stage key badge — shows the stage code (e.g. "I", "II", "A") so user can see what to select
       const stageKeyBadge = asma._sourceType === 'stage' && asma._stageKey
           ? `<span style="background:#00695c; color:#fff; border-radius:10px; padding:1px 8px; font-size:0.72rem; font-weight:700; white-space:nowrap; font-family:monospace;">Stage ${asma._stageKey}</span>`
           : '';
       
       meta.innerHTML = `
         <span style="color:#000; font-weight:bold;">ID: ${asma.id || asma.asanaNo || "?"}</span>
         ${catBadge}
         ${stageKeyBadge}
       `;
       
       left.appendChild(title);
       left.appendChild(meta);

       const btn = document.createElement("button");
       btn.textContent = "View";
       btn.className = "tiny";
       // Pass _stageKey so showAsanaDetail can pre-highlight the correct variation panel
       btn.addEventListener("click", () => {
          if (typeof showAsanaDetail === "function") showAsanaDetail(asma, asma._stageKey || null);
          if (typeof isBrowseMobile === 'function' && isBrowseMobile()) {
             if (typeof enterBrowseDetailMode === "function") enterBrowseDetailMode();
          }
       });

       row.appendChild(left);
       row.appendChild(btn);
       frag.appendChild(row);
    });
    
    list.appendChild(frag);

    if (items.length > 400) {
       const more = document.createElement("div");
       more.className = "msg";
       more.style.padding = "10px 0";
       more.textContent = `Showing first 400 results. Narrow your filters.`;
       list.appendChild(more);
    }
}


function startBrowseAsana(asma) {
   const plates = (asma.finalPlates && asma.finalPlates.length) ? asma.finalPlates : asma.interPlates;
   if (!plates || !plates.length) return;

   stopTimer();
   /* running = false */;
   $("startStopBtn").textContent = "Start";

   const variationName = asma.variation || "";
   const fullName = variationName ? `${asma.english} (${variationName})` : asma.english;

   window.currentSequence = {
      title: `Browse: ${fullName}`,
      category: "Browse",
      poses: [[plates, 60, fullName]]
   };
   window.currentIndex = 0;
   setPose(0);
   closeBrowse();
}
async function showAsanaDetail(asana, highlightStageKey = null) {
// console.log("showAsanaDetail called with:", asana);
    const d = document.getElementById('browseDetail');
// console.log("browseDetail element found:", d);
    if (!d) {
        console.error("browseDetail element not found!");
        return;
    }

    d.innerHTML = "";
// console.log("browseDetail cleared");

    const titleEl = document.createElement("h2");
    titleEl.style.margin = "0 0 10px 0";
    titleEl.textContent = displayName(asana);
    d.appendChild(titleEl);
// console.log("Title appended");

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit Asana";
    editBtn.className = "edit-asana-btn";
    editBtn.style.cssText = "background: #2196f3; color: white; padding: 6px 12px; cursor: pointer; margin-bottom: 10px; font-weight: bold; border: none; border-radius: 6px;";
    editBtn.onclick = () => {
// console.log("Edit button onclick fired");
// console.log("Edit button clicked, asana.id:", asana.id, "asana.asanaNo:", asana.asanaNo);
        window.openAsanaEditor(asana.id || asana.asanaNo);
    };
    d.appendChild(editBtn);
// console.log("Edit button appended:", editBtn);
// console.log("Edit button onclick property:", editBtn.onclick);

    let rangeText = "";
    const hj = asana ? window.getHoldTimes(asana) : null;
    if (hj && hj.standard) {
        rangeText = ` • ${hj.standard}s (Range: ${hj.short}s - ${hj.long}s)`;
    }

    // 3. Build the rest of the Info via a single HTML string
    // Use a unique name for this string variable to avoid re-declaration errors
    let detailHTML = `
      ${
        asana.iast && prefersIAST() && asana.english
          ? `<div style="font-size:0.85rem;color:#666;margin-bottom:4px;">${asana.english}</div>`
          : asana.iast && !prefersIAST()
          ? `<div style="font-size:0.85rem;color:#666;margin-bottom:4px;font-style:italic;">${asana.iast}</div>`
          : ''
      }
      <div class="muted">
         <span id="poseMetaBrowse"><span class="meta-text-only">ID: ${asana.id || asana.asanaNo}${rangeText}</span><button id="playNameBtn" class="tiny" style="margin-left: 10px;" title="Play Audio">🔊</button></span>
      </div>
      <hr>
    `;

    // 4. Append Images
    const urls = typeof smartUrlsForPoseId === 'function' ? smartUrlsForPoseId(asana.id || asana.asanaNo) : [];
    if (urls && urls.length > 0) {
        detailHTML += `<div class="browse-collage">`;
        urls.forEach((src) => {
            detailHTML += `<img src="${src}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">`;
        });
        detailHTML += `</div>`;
    }
  
    // 5. Append Technique (Base Pose)
    const baseTech = asana.technique || asana.Technique || "";
    if (baseTech) {
        detailHTML += `<h3>Base Technique</h3>
          <div class="technique-text" style="white-space: pre-wrap;">${
            typeof formatTechniqueText === 'function' ? formatTechniqueText(baseTech) : baseTech
          }</div>`;
    }

    // 5.5. Append Description
    const baseDesc = asana.description || asana.Description || "";
    if (baseDesc) {
        detailHTML += `<details style="margin-top:12px; max-width:720px;">
          <summary style="cursor:pointer; font-weight:650">Description</summary>
          <div class="desc-text" style="padding-top:8px; color:#111; white-space: pre-wrap;">${
            typeof formatTechniqueText === 'function' ? formatTechniqueText(baseDesc) : baseDesc
          }</div>
        </details>`;
    }

    // Safely append the gathered HTML string to the existing native elements
    d.insertAdjacentHTML('beforeend', detailHTML);
  
    // --- REPLACE YOUR SECTION 6 (Variations Loop) WITH THIS ---
    if (asana.variations && Object.keys(asana.variations).length > 0) {
        const varSection = document.createElement('div');
        // We can just use one heading now since they are merged
        varSection.innerHTML = '<hr><h3>Variations & Stages</h3>';

        const sortedKeys = Object.keys(asana.variations).sort();
        sortedKeys.forEach(key => {
            const val = asana.variations[key];
            let techText = '';
            let shortText = '';
            let holdText = val.hold || '';
            let titleText = `Stage ${key}`;
            let isCustom = !!val.isCustom;

            if (typeof val === 'string') {
                techText = val;
            } else if (val && typeof val === 'object') {
                techText = val.full_technique || val.Full_Technique || val.technique || '';
                shortText = val.shorthand || val.Shorthand || '';
                titleText = val.title || val.Title || titleText;
            }

            const wrapper = document.createElement('div');
            wrapper.className = isCustom ? 'user-variation-block' : 'variation-block';
            
            // STYLE OVERRIDE: If it's custom, give it the blue theme. Otherwise, the grey theme.
            wrapper.style.cssText = isCustom 
                ? 'background:#f0f7ff; padding:12px; margin-bottom:12px; border-radius:8px; border: 2px solid #2196f3;'
                : 'background:#f9f9f9; padding:12px; margin-bottom:12px; border-radius:8px; border: 1px solid #eee;';

            let html = `<h4 style="margin-top:0; margin-bottom:8px; color:${isCustom ? '#1976d2' : '#333'}; font-size:1.1rem;">${titleText}</h4>`;
            
            if (shortText) html += `<div style="color:${isCustom ? '#1565c0' : '#2e7d32'}; font-weight:bold; margin-bottom:8px; font-family:monospace; font-size:1rem;">${shortText}</div>`;
            
            if (holdText) html += `<div style="color:${isCustom ? '#0d47a1' : '#666'}; margin-bottom:8px; font-weight:600; font-size:0.95rem;">Hold: ${holdText}</div>`;

            if (techText) {
                const formattedTech = typeof formatTechniqueText === 'function' ? formatTechniqueText(techText) : techText;
                html += `<div class="technique-text" style="white-space: pre-wrap; font-size:0.95rem; color:#444;">${formattedTech}</div>`;
            } else {
                html += `<div class="muted" style="font-size:0.85rem;">No specific instructions provided.</div>`;
            }

            wrapper.innerHTML = html;

            // If we arrived here from a stage-search result, highlight this variation
            if (highlightStageKey && key === highlightStageKey) {
                wrapper.style.border = '2px solid #00695c';
                wrapper.style.background = '#e0f2f1';
                wrapper.dataset.highlighted = 'true';
            }

            varSection.appendChild(wrapper);
        });
        d.appendChild(varSection);

        // Auto-scroll to the highlighted stage wrapper (after paint)
        if (highlightStageKey) {
            requestAnimationFrame(() => {
                const highlighted = varSection.querySelector('[data-highlighted="true"]');
                if (highlighted) highlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
    }

    // 7. Bind Audio Button
    const playBtn = document.getElementById('playNameBtn');
    if (playBtn) playBtn.onclick = () => playAsanaAudio(asana, null, true);
  
}



function applyBrowseFilters() {
    const q = document.getElementById("browseSearch")?.value.trim() || "";
    const noQ = document.getElementById("browseAsanaNo")?.value.trim() || "";
    const cat = document.getElementById("browseCategory")?.value || "";

    const normalizeText = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normQ = normalizeText(q);

    const asanaArray = Object.values(window.asanaIndex || asanaLibrary || {});

    // ── 1. Base-asana results ─────────────────────────────────────────────────
    const baseFiltered = asanaArray.filter(a => {
        if (!a) return false;

        if (normQ) {
            const searchStr = normalizeText(a.name) + " " + normalizeText(a.english) + " " + normalizeText(a.iast);
            if (!searchStr.includes(normQ)) return false;
        }

        if (cat && cat !== "") {
            const safeCat = String(a.category || "");
            if (cat === "__UNCAT__") {
                if (safeCat && safeCat !== "Uncategorized") return false;
            } else {
                if (safeCat !== cat) return false;
            }
        }

        if (noQ) {
            const normalizedNoQ = noQ.replace(/^0+/, '');
            const aId = String(a.id || a.asanaNo || '').replace(/^0+/, '');
            if (aId !== normalizedNoQ) return false;
        }

        return true;
    });

    // Mark base asanas so renderBrowseList can tell them apart
    const baseResults = baseFiltered.map(a => ({ ...a, _sourceType: 'asana', _stageKey: null, _stageTitle: null }));

    // ── 2. Stage results (unified_page_index via asanaLibrary.variations) ─────
    // Only add stage hits when there is a text query — avoids flooding the list
    const stageResults = [];
    if (normQ && !noQ) {
        asanaArray.forEach(a => {
            if (!a || !a.variations) return;
            // Apply category filter to parent asana
            if (cat && cat !== "") {
                const safeCat = String(a.category || "");
                if (cat === "__UNCAT__") { if (safeCat && safeCat !== "Uncategorized") return; }
                else { if (safeCat !== cat) return; }
            }
            Object.entries(a.variations).forEach(([stageKey, vData]) => {
                if (!vData || typeof vData !== 'object') return;
                const stageTitleRaw = vData.title || vData.Title || `Stage ${stageKey}`;
                const stageShorthand = vData.shorthand || vData.Shorthand || '';
                const searchStr = normalizeText(stageTitleRaw)
                    + ' ' + normalizeText(stageShorthand)
                    + ' ' + normalizeText(a.english)
                    + ' ' + normalizeText(a.iast);
                if (!searchStr.includes(normQ)) return;

                // Avoid duplicate if the base pose already matched
                const alreadyBase = baseResults.some(r => r.id === a.id && r._stageKey === null);
                // We still add the stage even if the base matched — it's a distinct hit
                stageResults.push({
                    ...a,
                    _sourceType: 'stage',
                    _stageKey: stageKey,
                    _stageTitle: stageTitleRaw,
                    // Synthetic ID for dedup (asana id + stage key)
                    _uniqueKey: String(a.id) + ':' + stageKey
                });
            });
        });
    }

    // ── 3. Merge, deduplicate, sort ───────────────────────────────────────────
    const allResults = [...baseResults, ...stageResults];
    const uniqueFiltered = [];
    const seen = new Set();
    allResults.forEach(a => {
        const uniqueKey = a._uniqueKey || String(a.id || a.asanaNo || a.name || "").toLowerCase().trim();
        if (uniqueKey && !seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            uniqueFiltered.push(a);
        }
    });

    uniqueFiltered.sort((x, y) => {
        const idX = String(x.id || x.asanaNo || "9999");
        const idY = String(y.id || y.asanaNo || "9999");
        const cmp = idX.localeCompare(idY, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
        // Stages come after their parent base pose
        if (x._stageKey && !y._stageKey) return 1;
        if (!x._stageKey && y._stageKey) return -1;
        return (x._stageKey || '').localeCompare(y._stageKey || '');
    });

    if (typeof renderBrowseList === "function") {
        renderBrowseList(uniqueFiltered);
    }
}


export { setupBrowseUI, openBrowse, closeBrowse, renderBrowseList, startBrowseAsana, showAsanaDetail, applyBrowseFilters };

// Expose on window so app.js can call setupBrowseUI() via typeof guard,
// and so inline HTML onclick="openBrowse()" references work.
window.setupBrowseUI   = setupBrowseUI;
window.openBrowse      = openBrowse;
window.closeBrowse     = closeBrowse;
window.showAsanaDetail = showAsanaDetail;
window.applyBrowseFilters = applyBrowseFilters;
window.renderBrowseList   = renderBrowseList;
window.startBrowseAsana   = startBrowseAsana;

