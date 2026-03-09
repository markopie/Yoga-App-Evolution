// #region 7. UI & BROWSING
/* ==========================================================================
   BROWSE SCREEN & FILTERS
   ========================================================================== */

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
    if ($("browsePlate")) $("browsePlate").addEventListener("input", debounce(onChange, 120));
    if ($("browseAsanaNo")) $("browseAsanaNo").addEventListener("input", debounce(onChange, 120));
    if ($("browseCategory")) $("browseCategory").addEventListener("change", onChange);
}


window.openBrowse = function() {
// console.log("✅ openBrowse() was successfully triggered!");
document.body.classList.add("modal-open");
    const bd = $("browseBackdrop");
// console.log("🔍 Looking for backdrop element:", bd);
    
    if (!bd) {
        console.error("❌ ERROR: browseBackdrop not found in the HTML!");
        return;
    }
    
    bd.style.display = "flex";
    bd.setAttribute("aria-hidden", "false");
// console.log("✅ Backdrop display set to flex.");
    
    try {
// console.log("🔄 Calling applyBrowseFilters()...");
        applyBrowseFilters(); 
// console.log("✅ Filters applied successfully.");
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
    if (countEl) countEl.textContent = `Showing ${items.length} of ${totalCount}`;

    if (!items.length) {
       list.innerHTML = `<div class="msg" style="padding:10px 0">No matches found.</div>`;
       return;
    }

    const frag = document.createDocumentFragment();
    
    items.slice(0, 400).forEach(asma => {
       const row = document.createElement("div");
       row.className = "browse-item";

       const left = document.createElement("div");
       
       const title = document.createElement("div");
       title.className = "title";
       
       // Fallback logic for title
       let titleText = (typeof displayName === "function" ? displayName(asma) : null);
       if (!titleText || titleText === "(no name)") {
           titleText = asma.name || asma.english || asma.iast || "(no name)";
       }
       
       // Use plural 'variations' length if present
       const varCount = asma.variations ? Object.keys(asma.variations).length : 0;
       if (varCount > 0) {
           titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${varCount} variations)</span>`;
       }
       title.innerHTML = titleText;

       const meta = document.createElement("div");
       meta.className = "meta";
       const catDisplay = asma.category ? asma.category.replace(/^\d+_/, "").replace(/_/g, " ") : "Uncategorized";
       const catBadge = catDisplay ? ` <span class="badge">${catDisplay}</span>` : "";
       
        // Smart plate formatter
        let platesText = "";
        if (typeof asma.plates === 'object' && asma.plates !== null) {
            const finalStr = asma.plates.final && asma.plates.final.length ? `Final: ${asma.plates.final.join(", ")}` : "";
            const interStr = asma.plates.intermediate && asma.plates.intermediate.length ? `Int: ${asma.plates.intermediate.join(", ")}` : "";
            platesText = [finalStr, interStr].filter(Boolean).join(" | ");
        } else {
            platesText = asma.plates || asma.plate_numbers || "";
        }
       meta.innerHTML = `
         <span style="color:#000; font-weight:bold;">ID: ${asma.id || asma.asanaNo || "?"}</span>
         ${platesText ? ` • Plates: ${platesText}` : ""}
         ${catBadge}
       `;
       
       left.appendChild(title);
       left.appendChild(meta);

       const btn = document.createElement("button");
       btn.textContent = "View";
       btn.className = "tiny";
       btn.addEventListener("click", () => {
          if (typeof showAsanaDetail === "function") showAsanaDetail(asma);
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

/* ==========================================================================
   DETAIL VIEW & TABS
   ========================================================================== */

function startBrowseAsana(asma) {
   const plates = (asma.finalPlates && asma.finalPlates.length) ? asma.finalPlates : asma.interPlates;
   if (!plates || !plates.length) return;

   stopTimer();
   running = false;
   $("startStopBtn").textContent = "Start";

   const variationName = asma.variation || "";
   const fullName = variationName ? `${asma.english} (${variationName})` : asma.english;

   currentSequence = {
      title: `Browse: ${fullName}`,
      category: "Browse",
      poses: [[plates, 60, fullName]]
   };
   currentIndex = 0;
   setPose(0);
   closeBrowse();
}
async function showAsanaDetail(asana) {
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
    const hj = asana?.hold_json || asana?.hold_data;
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
            let isCustom = !!val.isCustom; // This is the flag we added to loadAsanaLibrary

            if (typeof val === 'string') {
                techText = val;
            } else if (val && typeof val === 'object') {
                techText = val.full_technique || val.Full_Technique || val.technique || '';
                shortText = val.shorthand || val.Shorthand || '';
                const actualTitle = val.Title || val.title || val.Stage_Title || val.stage_title;
                if (actualTitle && String(actualTitle).trim() !== '') titleText = String(actualTitle).trim();
            }

            const wrapper = document.createElement('div');
            wrapper.className = isCustom ? 'user-variation-block' : 'variation-block';
            
            // STYLE OVERRIDE: If it's custom, give it the blue theme. Otherwise, the grey theme.
            wrapper.style.cssText = isCustom 
                ? 'background:#f0f7ff; padding:12px; margin-bottom:12px; border-radius:8px; border: 2px solid #2196f3;'
                : 'background:#f9f9f9; padding:12px; margin-bottom:12px; border-radius:8px; border: 1px solid #eee;';

            let html = `<h4 style="margin-top:0; margin-bottom:8px; color:${isCustom ? '#1976d2' : '#333'}; font-size:1.1rem;">${titleText}</h4>`;
            
            if (shortText) html += `<div style="color:${isCustom ? '#1565c0' : '#2e7d32'}; font-weight:bold; margin-bottom:8px; font-family:monospace; font-size:1rem;">${shortText}</div>`;
            
            // Add the Hold time if it exists
            if (holdText) html += `<div style="color:${isCustom ? '#0d47a1' : '#666'}; margin-bottom:8px; font-weight:600; font-size:0.95rem;">Hold: ${holdText}</div>`;

            if (techText) {
                const formattedTech = typeof formatTechniqueText === 'function' ? formatTechniqueText(techText) : techText;
                html += `<div class="technique-text" style="white-space: pre-wrap; font-size:0.95rem; color:#444;">${formattedTech}</div>`;
            } else {
                html += `<div class="muted" style="font-size:0.85rem;">No specific instructions provided.</div>`;
            }

            wrapper.innerHTML = html;
            varSection.appendChild(wrapper);
        });
        d.appendChild(varSection);
    }
    // 7. Bind Audio Button
    const playBtn = document.getElementById('playNameBtn');
    if (playBtn) playBtn.onclick = () => playAsanaAudio(asana, null, true);
  
}


/* ==========================================================================
   RENDERERS (COLLAGE & LISTS)
   ========================================================================== */
/* ==========================================================================
   RENDERERS (COLLAGE, LISTS & DROPDOWNS)
   ========================================================================== */

   function renderPlateSection(title, plates, globalSeen, fallbackId) {
    const wrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "section-title";
    header.textContent = title;
    wrap.appendChild(header);
 
    let targets = (plates && plates.length) ? plates : [];
    if (!targets.length && !fallbackId) {
       const msg = document.createElement("div");
       msg.className = "msg";
       msg.textContent = "–";
       wrap.appendChild(msg);
       return wrap;
    }
 
    const urls = [];
    const missing = [];
    const seen = new Set();
    
    const processIds = (idList) => {
        for (const p of idList) {
           if (!p || p === "undefined") continue;
           const u = (typeof urlsForPlateToken === 'function') ? urlsForPlateToken(p) : [];
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
 
    if (urls.length === 0 && fallbackId) {
        const fallbackUrls = (typeof urlsForPlateToken === 'function') ? urlsForPlateToken(fallbackId) : [];
        if (fallbackUrls.length > 0) {
            fallbackUrls.forEach(x => {
                const g = globalSeen || null;
                if (!seen.has(x) && !(g && g.has(x))) {
                    seen.add(x);
                    if (g) g.add(x);
                    urls.push(x);
                }
            });
            while(missing.length > 0) missing.pop();
        }
    }
 
    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.marginTop = "4px";
    meta.style.fontSize = "0.8rem";
    if (targets.length) {
        meta.textContent = `Ref Plates: ${targets.join(", ")}`;
        wrap.appendChild(meta);
    }
 
    if (urls.length) {
       if (typeof renderCollage === "function") wrap.appendChild(renderCollage(urls));
       else console.warn("renderCollage missing");
    }
 
    if (missing.length && urls.length === 0) {
       const m = document.createElement("div");
       m.className = "msg";
       m.style.color = "#d9534f"; 
       m.textContent = `⚠️ Image not found for Ref: ${missing.join(", ")}`;
       wrap.appendChild(m);
    }
    return wrap;
 }
 
 function renderCollage(urls) {
    const wrap = document.createElement("div");
    wrap.className = "collage";
    urls.forEach(u => {
       const mob = (typeof mobileVariantUrl === 'function') ? mobileVariantUrl(u) : u;
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
 
 // --- NEW: Category Filter Logic ---
 function renderCategoryFilter() {
    const filterEl = document.getElementById("categoryFilter");
    if (!filterEl) return;
 
    // 1. Get unique categories
    const uniqueCats = new Set();
    courses.forEach(c => {
        const cat = c.category ? c.category.trim() : "Uncategorized";
        uniqueCats.add(cat);
    });
 
    // 2. Save current selection
    const currentVal = filterEl.value;
 
    // 3. Rebuild Options
    filterEl.innerHTML = `<option value="ALL">📂 All Collections</option>`;
 
    Array.from(uniqueCats).sort().forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        
        // Visual flair for your specific categories
        let icon = "📁";
        if (cat.includes("Asana")) icon = "🧘";
        else if (cat.includes("Therapeutic")) icon = "❤️";
        else if (cat.includes("Pranayama")) icon = "🌬️";
        
        opt.textContent = `${icon} ${cat}`;
        filterEl.appendChild(opt);
    });
 
    // 4. Restore selection or default
    filterEl.value = currentVal || "ALL";
 
    // 5. Attach Listener
    // Remove old listener to avoid duplicates
    filterEl.onchange = () => renderCourseUI();
 }
 
 // --- UPDATED: Course Selector (Filters based on Category) ---
 function renderCourseUI() {
    const sel = document.getElementById("sequenceSelect");
    const filterEl = document.getElementById("categoryFilter");
    if (!sel) return;

    const filterVal = filterEl ? filterEl.value : "ALL";
    const currentVal = sel.value; 

    sel.innerHTML = `<option value="">Select a course</option>`;

    // Grouping by EXACT category string
    const grouped = {};
    courses.forEach((course, idx) => {
       const cat = course.category ? course.category.trim() : "Uncategorized";
       
       if (filterVal !== "ALL" && cat !== filterVal) return;

       if (!grouped[cat]) grouped[cat] = [];
       grouped[cat].push({ course, idx });
    });

    // Sort categories alphabetically
    const sortedCats = Object.keys(grouped).sort();

    sortedCats.forEach(catName => {
        const groupEl = document.createElement("optgroup");
        groupEl.label = catName;
        
        grouped[catName].forEach(item => {
            const opt = document.createElement("option");
            opt.value = String(item.idx);
            // Show the title. The value (idx) points to the unique object in the courses array.
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
 
 // Main Entry Point for Dropdowns
 function renderSequenceDropdown() {
    renderCategoryFilter(); // Update filter options
    renderCourseUI();       // Update course list
 }
 
 // Alias for Admin compatibility
 const populateSequenceSelect = renderSequenceDropdown;

/* ==========================================================================
   FILTER HELPERS
   ========================================================================== */

   function applyBrowseFilters() {
    const q = document.getElementById("browseSearch")?.value.trim() || "";
    const plateStr = document.getElementById("browsePlate")?.value.trim() || "";
    const noQ = document.getElementById("browseAsanaNo")?.value.trim() || "";
    const cat = document.getElementById("browseCategory")?.value || "";
    const finalsOnly = document.getElementById("browseFinalOnly")?.checked || false;

    const normalizeText = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normQ = normalizeText(q);

    // Get all asanas as an array
    const asanaArray = Object.values(window.asanaIndex || asanaLibrary || {});

    const filtered = asanaArray.filter(a => {
        if (!a) return false;

        // 1. Text Search (Null-proof)
        if (normQ) {
            const searchStr = normalizeText(a.name) + " " + normalizeText(a.english) + " " + normalizeText(a.iast);
            if (!searchStr.includes(normQ)) return false;
        }

        // 2. Category Dropdown
        if (cat && cat !== "") {
            const safeCat = String(a.category || "");
            if (cat === "__UNCAT__") {
                if (safeCat && safeCat !== "Uncategorized") return false;
            } else {
                if (!safeCat.includes(cat) && safeCat !== cat) return false;
            }
        }

        // 3. Asana ID 
        if (noQ && String(a.id) !== noQ && String(a.asanaNo) !== noQ) return false;

        // 4. Plates
        if (plateStr) {
            const plateArr = plateStr.match(/\d+/g) || [];
            const aPlates = String(a.plates || a.plate_numbers || "").match(/\d+/g) || [];
            const hasPlate = plateArr.some(p => aPlates.includes(p));
            if (!hasPlate) return false;
        }

        return true;
    });

    // 5. Safe Deduplication by ID
    const uniqueFiltered = [];
    const seen = new Set();
    filtered.forEach(a => {
        const uniqueKey = String(a.id || a.asanaNo || a.name || "").toLowerCase().trim();
        if (uniqueKey && !seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            uniqueFiltered.push(a);
        }
    });

    // 6. Sort Numerically by ID
    uniqueFiltered.sort((x, y) => {
        const idX = String(x.id || x.asanaNo || "9999");
        const idY = String(y.id || y.asanaNo || "9999");
        // { numeric: true } ensures that "2" comes before "10"
        return idX.localeCompare(idY, undefined, { numeric: true });
    });

    if (typeof renderBrowseList === "function") {
        renderBrowseList(uniqueFiltered);
    }
}

function matchesText(asma, q) {
   if (!q) return true;
   const haystack = (String(asma.english || "") + " " + String(asma.iast || "") + " " + String(asma.variation || "")).toLowerCase();
   return haystack.includes(q.toLowerCase());
}

function parsePlateQuery(q) {
   const s = String(q || "").trim();
   if (!s) return [];
   return parseIndexPlateField(s.replace(/[,\s]+/g, "|"));
}

function matchesPlate(asma, plateQuery) {
   if (!plateQuery || !plateQuery.length) return true;
   const set = new Set(asma.allPlates.map(x => normalizePlate(x)));
   for (const p of plateQuery) {
      if (set.has(normalizePlate(p))) return true;
   }
   return false;
}

function matchesAsanaNo(asma, q) {
   const s = String(q || "").trim();
   if (!s) return true;
   return normalizePlate(s) === normalizePlate(asma.asanaNo);
}

function matchesCategory(asma, cat) {
   if (!cat) return true;
   if (cat === "__UNCAT__") return !asma.category;
   return asma.category === cat;
}

function setStatus(msg) {
   const el = $("statusText");
   if (el) el.textContent = msg;
}

function showError(where, msg) {
   console.error(msg);
   const el = $(where);
   if (el) el.textContent = msg;
}

function enterBrowseDetailMode() {
   const modal = document.querySelector("#browseBackdrop .modal");
   if (modal) modal.classList.add("detail-mode");
}

function exitBrowseDetailMode() {
    const modal = document.querySelector("#browseBackdrop .modal");
    if (modal) modal.classList.remove("detail-mode");
}

/* ==========================================================================
   CONSOLIDATED ADMIN / MANAGE UI
   ========================================================================== */
// #endregion