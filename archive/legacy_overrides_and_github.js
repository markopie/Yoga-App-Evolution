// LEGACY ARCHIVE

// --- DATA FETCHING (GET) ---
/* ==========================================================================
   DATA FETCHING (GET)
   ========================================================================== */

async function fetchDescriptionOverrides() {
    try {
        const res = await fetch(DESCRIPTIONS_OVERRIDE_URL, { cache: "no-store" });
        if (!res.ok) { descriptionOverrides = {}; return; }
        const data = await res.json();
        descriptionOverrides = (data && typeof data === "object") ? data : {};
    } catch (e) { descriptionOverrides = {}; }
}

async function fetchCategoryOverrides() {
    try {
        const res = await fetch(CATEGORY_OVERRIDE_URL, { cache: "no-store" });
        if (!res.ok) { categoryOverrides = {}; return; }
        const data = await res.json();
        categoryOverrides = (data && typeof data === "object") ? data : {};
    } catch (e) { categoryOverrides = {}; }
}

async function fetchImageOverrides() {
    try {
        const data = await loadJSON(IMAGE_OVERRIDE_URL, {});
        if (data) imageOverrides = data;
    } catch (e) { imageOverrides = {}; }
}

/* ==========================================================================
   DATA APPLICATION (APPLY LEGACY OVERRIDES)
   ========================================================================== */

function applyDescriptionOverrides() {
    Object.keys(asanaLibrary).forEach(id => {
        const key = normalizePlate(id);
        const a = asanaLibrary[id];
        const o = descriptionOverrides && descriptionOverrides[key];
        if (o && typeof o === "object" && typeof o.md === "string") {
            a.description = o.md;
            a.descriptionSource = "override";
        }
    });
}

function applyCategoryOverrides() {
    Object.keys(asanaLibrary).forEach(id => {
        const key = normalizePlate(id);
        const a = asanaLibrary[id];
        const o = categoryOverrides && categoryOverrides[key];
        if (o && typeof o === "object" && typeof o.category === "string" && o.category.trim()) {
            a.category = o.category.trim();
            a.categorySource = "override";
        }
    });
}



// --- GITHUB SYNC ---
// -------- GITHUB SYNC --------
/**
 * Pushes any JSON object to a specific file in your GitHub Repository
 * @param {string} fileName - e.g., "asana_library.json"
 * @param {Object} data - The JS object to save
 */
async function syncDataToGitHub(fileName, data) {
    const token = getStoredGitHubPAT();
    if (!token) {
        showGitHubPatPrompt((newToken) => syncDataToGitHub(fileName, data));
        return;
    }

    try {
        setGitHubButtonLoading(true);
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`;
        
        // 1. Get the current file's SHA (required by GitHub to update)
        const getRes = await fetch(url, {
            headers: { "Authorization": `token ${token}` }
        });
        const fileData = await getRes.json();
        const sha = fileData.sha;

        // 2. Encode and Push
        const content = encodeToBase64(JSON.stringify(data, null, 2));
        const putRes = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Update ${fileName} via Yoga App`,
                content: content,
                sha: sha
            })
        });

        if (!putRes.ok) throw new Error(`GitHub Save Failed: ${putRes.status}`);

        showGitHubStatus(`✓ ${fileName} synced to GitHub!`);
    } catch (error) {
        console.error(error);
        showGitHubStatus(`Error syncing ${fileName}: ${error.message}`, true);
    } finally {
        setGitHubButtonLoading(false);
    }
}
// -------- GITHUB HELPERS (REQUIRED) --------

const GITHUB_REPO = "markopie/Yoga-App-Evolution"; // Ensure this matches your repo
const GH_PAT_STORAGE_KEY = "gh_pat";

function getStoredGitHubPAT() {
    return localStorage.getItem(GH_PAT_STORAGE_KEY) || null;
}

function storeGitHubPAT(token, remember) {
    if (remember) {
        localStorage.setItem(GH_PAT_STORAGE_KEY, token);
    } else {
        // If not remembering, we still return it, but you might want to store in session or memory
        // For simplicity in this app, we usually store it or ask every time.
        // This simple implementation relies on LocalStorage.
        localStorage.setItem(GH_PAT_STORAGE_KEY, token); 
    }
    return token;
}

function showGitHubPatPrompt(callback) {
    // Create simple prompt if custom UI doesn't exist
    let token = prompt("Please enter your GitHub Personal Access Token (PAT) to save changes:");
    if (token) {
        storeGitHubPAT(token, true);
        if (callback) callback(token);
    }
}

function setGitHubButtonLoading(isLoading) {
    // Optional: Visual feedback if you have a specific button
    const btn = document.getElementById("syncGitHubBtn");
    if(btn) btn.disabled = isLoading;
}

function showGitHubStatus(msg, isError = false) {
    const el = document.getElementById("statusText");
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? "red" : "green";
        setTimeout(() => el.style.color = "", 5000);
    }
    if (isError) alert(msg);
}

// Helper to encode string to Base64 (UTF-8 safe)
function encodeToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

/* ==========================================================================
   FULL ASANA EDITOR (Supabase Upsert)
   ========================================================================== */

   window.openAsanaEditor = async function(id) {

    const bd = $("asanaEditorBackdrop");

    if (!bd) {
        console.error("asanaEditorBackdrop not found!");
        return alert("Editor HTML missing");
    }
    bd.style.display = "flex";
    // Populate Category Datalist dynamically
    const dl = $("asanaCategoryList");
    if (dl) {
        dl.innerHTML = "";
        getUniqueCategories().forEach(c => {
            const opt = document.createElement("option");
            opt.value = getDisplayCategory(c); // Use the clean display helper
            dl.appendChild(opt);
        });
    }

    // Wipe fields clean
    $("editAsanaId").value = "";
    $("editAsanaName").value = "";
    $("editAsanaIAST").value = "";
    $("editAsanaEnglish").value = "";
    $("editAsanaCategory").value = "";
    if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = "";
    if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = "";
    if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = "";
    $("editAsanaPlates").value = "";
    $("editAsanaPage2001").value = "";
    $("editAsanaPage2015").value = "";
    $("editAsanaIntensity").value = "";
    $("editAsanaNote").value = "";
    $("editAsanaDescription").value = "";
    $("editAsanaTechnique").value = "";
    $("editAsanaRequiresSides").checked = false;
    $("stagesContainer").innerHTML = "";
    $("asanaEditorStatus").textContent = "";

    // If ID is provided, we are EDITING
    if (id) {
        $("asanaEditorTitle").textContent = `Edit Asana: ${id}`;
        const a = asanaLibrary[id] || {};

        $("editAsanaId").value = a.id || a.asanaNo || id;
        $("editAsanaName").value = a.name || "";
        $("editAsanaIAST").value = a.iast || a.IAST || "";
        $("editAsanaEnglish").value = a.english || a.english_name || "";
        $("editAsanaCategory").value = a.category || "";

     
    

        // We check a.Hold (Supabase) and a.hold (Local/Legacy)
        const holdData = parseHoldTimes(a.Hold || a.hold || "");
        if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = holdData.standard;
        if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = holdData.short;
        if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = holdData.long;
        let pStr = "";
        if (a.plates && (a.plates.final || a.plates.intermediate)) {
            if (a.plates.final && a.plates.final.length) pStr += `Final: ${a.plates.final.join(", ")}`;
            if (a.plates.intermediate && a.plates.intermediate.length) {
                if (pStr) pStr += " ";
                pStr += `Intermediate: ${a.plates.intermediate.join(", ")}`;
            }
        } else {
            pStr = a.plate_numbers || "";
        }
        $("editAsanaPlates").value = pStr;

        $("editAsanaPage2001").value = a.page2001 || a.Page_2001 || "";
        $("editAsanaPage2015").value = a.page2015 || a.Page_2015 || "";
        $("editAsanaIntensity").value = a.intensity || a.Intensity || "";
        $("editAsanaNote").value = a.note || a.Note || "";
        $("editAsanaDescription").value = a.description || a.Description || "";
        $("editAsanaTechnique").value = a.technique || a.Technique || "";
        $("editAsanaRequiresSides").checked = !!(a.requiresSides || a.Requires_Sides);

        if (a.variations) {
            Object.entries(a.variations).forEach(([sKey, sData]) => {
                addStageToEditor(sKey, sData);
            });
        }

        try {
            const paddedId = String(id).padStart(3, '0');
            const { data: userStages } = await supabase.from('user_stages').select('*').eq('asana_id', paddedId);
            if (userStages && userStages.length > 0) {
                userStages.forEach((stage) => {
                    const stageKey = stage.stage_name || '';
                    if (!$("stagesContainer").querySelector(`input.stage-key[value="${stageKey}"]`)) {
                        addStageToEditor(stageKey, {
                            id: stage.id,
                            stage_name: stageKey,
                            title: stage.title || '',
                            shorthand: stage.shorthand || '',
                            full_technique: stage.full_technique || '',
                            hold: stage.hold || ''
                        });
                    }
                });
            }
        } catch (e) {
// console.warn("Could not load user stages for editor:", e.message);
        }
    } else {
        // We are ADDING NEW
        $("asanaEditorTitle").textContent = "Add New Asana";
        $("editAsanaId").value = getNextAsanaId(); // Auto-calculate next ID
    }

    // Snapshot initial field values for change detection
    window._asanaEditorSnapshot = null;
    window._asanaEditorOriginalStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
    window._asanaEditorOriginalStageData = null;
    requestAnimationFrame(() => {
        window._asanaEditorSnapshot = {
            name: $("editAsanaName").value,
            iast: $("editAsanaIAST").value,
            english_name: $("editAsanaEnglish").value,
            technique: $("editAsanaTechnique").value,
            plate_numbers: $("editAsanaPlates").value,
            requires_sides: $("editAsanaRequiresSides").checked,
            page_2001: $("editAsanaPage2001").value,
            page_2015: $("editAsanaPage2015").value,
            intensity: $("editAsanaIntensity").value,
            note: $("editAsanaNote").value,
            category: $("editAsanaCategory").value,
            description: $("editAsanaDescription").value,
            holdStd: $("editAsanaHoldStandard")?.value,
            holdShort: $("editAsanaHoldShort")?.value,
            holdLong: $("editAsanaHoldLong")?.value,
            stageCount: $("stagesContainer").querySelectorAll(".stage-row").length
        };
        window._asanaEditorOriginalStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
            key: div.querySelector(".stage-key")?.value || "",
            prefix: div.querySelector(".stage-prefix")?.value || "",
            suffix: div.querySelector(".stage-suffix")?.value || "",
            short: div.querySelector(".stage-short")?.value || "",
            tech: div.querySelector(".stage-tech")?.value || "",
            holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
            holdShort: div.querySelector(".stage-hold-short")?.value || "",
            holdLong: div.querySelector(".stage-hold-long")?.value || ""
        }));
    });

};

async function getNextRomanNumeral() {
    // Expanded up to 20 variations
    const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X",
                   "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
    
    const asanaId = $("editAsanaId").value.trim().padStart(3, '0');
    const inDom = Array.from($("stagesContainer").querySelectorAll(".stage-key")).map(el => el.value.trim().toUpperCase());
    const taken = new Set(inDom);

    if (supabase && asanaId) {
        try {
            // THE FIX: Use .eq('asana_id', asanaId) instead of .contains('parent_id')
            const [{ data: s1 }, { data: s2 }] = await Promise.all([
                supabase.from('stages').select('"Stage_Name", stage_name').eq('asana_id', asanaId),
                supabase.from('user_stages').select('"Stage_Name", stage_name').eq('asana_id', asanaId)
            ]);
            
            // Safely check both Title Case and lowercase column names
            (s1 || []).forEach(r => {
                const name = r.Stage_Name || r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
            (s2 || []).forEach(r => {
                const name = r.Stage_Name || r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
        } catch (e) {
// console.warn("Could not query stage names for Roman numeral calc:", e.message);
        }
    }

    for (const r of ROMAN) {
        if (!taken.has(r)) return r;
    }
    return String(taken.size + 1); // Fallback to numbers if they exceed 20
}

function getVariationSuffixes() {
    const suffixes = new Set();
    const asanaId = $("editAsanaId").value.trim().padStart(3, '0');
    const asana = asanaLibrary[asanaId];
    if (asana && asana.variations) {
        Object.values(asana.variations).forEach(vData => {
            const title = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
            const suffix = title.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
            if (suffix) suffixes.add(suffix);
        });
    }
    Array.from($("stagesContainer").querySelectorAll(".stage-row")).forEach(row => {
        const suf = row.querySelector(".stage-suffix");
        if (suf && suf.value.trim()) suffixes.add(suf.value.trim());
    });
    return Array.from(suffixes).sort();
}

window.addStageToEditor = async function(stageKey = "", stageData = {}) {
    const container = $("stagesContainer");

    const autoKey = stageKey || await getNextRomanNumeral();
    const existingTitle = typeof stageData === 'object' ? (stageData.title || stageData.Title || "") : "";
    const prefixMatch = existingTitle.match(/^(Modified|Stage)\s+/i);
    const prefix = prefixMatch ? prefixMatch[1] : "Modified";
    const suffix = existingTitle.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
    const existingShorthand = typeof stageData === 'object' ? (stageData.shorthand || stageData.Shorthand || "") : "";
    const existingTech = typeof stageData === 'object' ? (stageData.full_technique || stageData.Full_Technique || stageData.technique || "") : (stageData || "");
    const existingDbId = typeof stageData === 'object' ? (stageData.id || stageData.db_id || "") : "";

    const existingHoldStr = typeof stageData === 'object' ? (stageData.hold || stageData.Hold || "") : "";
    const parsedHold = parseHoldTimes(existingHoldStr);
    const holdStd  = existingHoldStr ? parsedHold.standard : 30;
    const holdShort = existingHoldStr ? parsedHold.short    : 15;
    const holdLong  = existingHoldStr ? parsedHold.long     : 60;

    const suffixes = getVariationSuffixes();
    const datalistId = `stageSuffixList_${Date.now()}`;

    const div = document.createElement("div");
    div.className = "stage-row";
    div.dataset.dbId = existingDbId;
    div.style.cssText = "border:1px solid #ddd; padding:10px; border-radius:6px; background:#fff; display:grid; gap:8px;";

    div.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
           <div style="min-width:60px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Key</label>
               <input type="text" class="stage-key" value="${autoKey}" readonly style="width:60px; padding:6px; font-weight:bold; background:#f5f5f5; text-align:center; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="min-width:110px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Prefix</label>
               <select class="stage-prefix" style="padding:6px; border:1px solid #ccc; border-radius:4px; background:#fff; min-height:unset;">
                   <option value="Modified" ${prefix === "Modified" ? "selected" : ""}>Modified</option>
                   <option value="Stage" ${prefix === "Stage" ? "selected" : ""}>Stage</option>
               </select>
           </div>
           <div style="flex:2; min-width:140px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Description / Suffix</label>
               <input type="text" class="stage-suffix" list="${datalistId}" value="${suffix}" placeholder="e.g. (on a bolster)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
               <datalist id="${datalistId}">${suffixes.map(s => `<option value="${s}">`).join("")}</datalist>
           </div>
           <div style="min-width:100px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Shorthand</label>
               <input type="text" class="stage-short" value="${existingShorthand}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="display:flex; align-items:flex-end; padding-bottom:2px;">
               <button type="button" class="tiny warn remove-stage-btn">✕ Remove</button>
           </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Short Hold (s)</label>
               <input type="number" class="stage-hold-short" min="0" value="${holdShort}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Standard Hold (s)</label>
               <input type="number" class="stage-hold-standard" min="0" value="${holdStd}" style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Long Hold (s)</label>
               <input type="number" class="stage-hold-long" min="0" value="${holdLong}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
        </div>
        <div>
           <label class="muted" style="font-size:0.75rem;">Technique</label>
           <textarea class="stage-tech" style="height:60px; padding:6px; width:100%; font-family:inherit; border:1px solid #ccc; border-radius:4px;">${existingTech}</textarea>
        </div>
    `;

    div.querySelector(".remove-stage-btn").onclick = () => div.remove();
    container.appendChild(div);
};

// Apply UI Interactivity on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    if ($("asanaEditorCloseBtn")) $("asanaEditorCloseBtn").onclick = () => $("asanaEditorBackdrop").style.display = "none";
    if ($("addStageBtn")) $("addStageBtn").onclick = () => addStageToEditor();

    if ($("asanaEditorSaveBtn")) {
        $("asanaEditorSaveBtn").onclick = async () => {
            const rawId = $("editAsanaId").value.trim();
            if (!rawId) return alert("ID is required.");
            const id = rawId.padStart(3, '0');

            const snap = window._asanaEditorSnapshot;
            if (snap) {
                const currentStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
                const current = {
                    name: $("editAsanaName").value,
                    iast: $("editAsanaIAST").value,
                    english_name: $("editAsanaEnglish").value,
                    technique: $("editAsanaTechnique").value,
                    plate_numbers: $("editAsanaPlates").value,
                    requires_sides: $("editAsanaRequiresSides").checked,
                    page_2001: $("editAsanaPage2001").value,
                    page_2015: $("editAsanaPage2015").value,
                    intensity: $("editAsanaIntensity").value,
                    note: $("editAsanaNote").value,
                    category: $("editAsanaCategory").value,
                    description: $("editAsanaDescription").value,
                    holdStd: $("editAsanaHoldStandard")?.value,
                    holdShort: $("editAsanaHoldShort")?.value,
                    holdLong: $("editAsanaHoldLong")?.value,
                    stageCount: currentStageCount
                };
                
                const stageCountChanged = currentStageCount !== (window._asanaEditorOriginalStageCount ?? snap.stageCount);
                const currentStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
                    key: div.querySelector(".stage-key")?.value || "",
                    short: div.querySelector(".stage-short")?.value || "",
                    tech: div.querySelector(".stage-tech")?.value || "",
                    holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
                    holdShort: div.querySelector(".stage-hold-short")?.value || "",
                    holdLong: div.querySelector(".stage-hold-long")?.value || ""
                }));
                const originalStageData = window._asanaEditorOriginalStageData || [];
                const stageDataChanged = JSON.stringify(currentStageData) !== JSON.stringify(originalStageData);
                const fieldsUnchanged = Object.keys(snap).every(k => snap[k] === current[k]);

                if (!stageCountChanged && !stageDataChanged && fieldsUnchanged) {
                    $("asanaEditorStatus").textContent = "No changes made.";
                    $("asanaEditorStatus").style.color = "#888";
                    setTimeout(() => { $("asanaEditorStatus").textContent = ""; }, 2500);
                    return;
                }
            }

            const btn = $("asanaEditorSaveBtn");
            btn.disabled = true;
            btn.textContent = "Saving...";
            
            let userId = null;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                userId = user?.id;
            } catch (e) { console.warn("User ID fetch failed:", e.message); }

            const asanaHoldStr = buildHoldString(
                parseInt($("editAsanaHoldStandard")?.value || "30", 10),
                parseInt($("editAsanaHoldShort")?.value || "15", 10),
                parseInt($("editAsanaHoldLong")?.value || "60", 10)
            );

            const asanaData = {
                id: id,
                user_id: userId,
                name: $("editAsanaName").value.trim(),
                iast: $("editAsanaIAST").value.trim(),
                english_name: $("editAsanaEnglish").value.trim(),
                technique: $("editAsanaTechnique").value.trim(),
                plate_numbers: $("editAsanaPlates").value.trim(),
                requires_sides: $("editAsanaRequiresSides").checked,
                page_2001: $("editAsanaPage2001").value.trim() || null,
                page_2015: $("editAsanaPage2015").value.trim() || null,
                intensity: $("editAsanaIntensity").value.trim() || null,
                note: $("editAsanaNote").value.trim(),
                category: formatCategoryName($("editAsanaCategory").value.trim()),
                description: $("editAsanaDescription").value.trim(),
                hold: asanaHoldStr
            };

            try {
                // Save Main Asana
                if (supabase && userId) {
                    const { error: asanaErr } = await supabase
                        .from('user_asanas')
                        .upsert(asanaData, { onConflict: 'id' });
                    if (asanaErr) throw new Error(asanaErr.message);

                    // Process Variations
                    const stageDivs = $("stagesContainer").querySelectorAll(".stage-row");
                    const localVariations = {};

                    for (const div of stageDivs) {
                        const key = div.querySelector(".stage-key").value.trim();
                        if (!key) continue;
                        
                        const pfx = div.querySelector(".stage-prefix")?.value.trim() || "Modified";
                        const sfx = div.querySelector(".stage-suffix")?.value.trim() || "";
                        const holdStr = buildHoldString(
                            parseInt(div.querySelector(".stage-hold-standard")?.value || "30", 10),
                            parseInt(div.querySelector(".stage-hold-short")?.value || "15", 10),
                            parseInt(div.querySelector(".stage-hold-long")?.value || "60", 10)
                        );
                        const dbId = div.dataset.dbId || "";

                        const payload = {
                            user_id: userId,
                            asana_id: id,
                            stage_name: key,
                            title: sfx ? `${pfx} ${key} ${sfx}` : `${pfx} ${key}`,
                            full_technique: div.querySelector(".stage-tech")?.value.trim() || null,
                            shorthand: div.querySelector(".stage-short")?.value.trim() || null,
                            hold: holdStr
                        };

                        if (dbId && dbId.includes('-')) {
                            await supabase.from('user_stages').update(payload).eq('id', dbId);
                        } else {
                            const { data: newRow } = await supabase.from('user_stages').insert(payload).select().single();
                            if (newRow) div.dataset.dbId = newRow.id;
                        }

                        localVariations[key] = {
                            title: payload.title,
                            shorthand: payload.shorthand,
                            full_technique: payload.full_technique,
                            hold: holdStr,
                            hold_data: parseHoldTimes(holdStr),
                            isCustom: true
                        };
                    }

                    // Update local memory
                    asanaLibrary[id] = {
                        ...asanaLibrary[id],
                        ...asanaData,
                        english: asanaData.english_name,
                        hold_data: parseHoldTimes(asanaData.hold),
                        variations: { ...asanaLibrary[id].variations, ...localVariations },
                        isCustom: true
                    };

                    $("asanaEditorStatus").textContent = "✓ Saved Successfully!";
                    setTimeout(() => {
                        $("asanaEditorBackdrop").style.display = "none";
                        btn.disabled = false;
                        btn.textContent = "Save Asana";
                        if (window.showAsanaDetail) showAsanaDetail(asanaLibrary[id]);
                    }, 1000);
                }
            } catch (e) {
                console.error(e);
                alert("Error saving: " + e.message);
                btn.disabled = false;
                btn.textContent = "Save Asana";
            }
        };
    }
});

// --- DYNAMIC HELPERS ---
function getNextAsanaId() {
    if (typeof asanaLibrary === 'undefined') return "001";
    let next = 1;
    while (asanaLibrary[String(next).padStart(3, '0')]) {
        next++;
    }
    return String(next).padStart(3, '0');
}

function getUniqueCategories() {
    const cats = new Set();
    if (typeof asanaLibrary !== 'undefined') {
        Object.values(asanaLibrary).forEach(a => {
            if (a.category) cats.add(a.category.trim());
        });
    }
    return Array.from(cats).sort();
}
function getDisplayCategory(cat) {
    if (!cat) return "";
    return cat.replace(/^\d+_/, '').replace(/_/g, ' ');
}

function formatCategoryName(inputCat) {
    if (!inputCat) return "";
    const cleanInput = inputCat.trim().replace(/\s+/g, '_');
    const existingCats = getUniqueCategories();
    
    if (existingCats.includes(inputCat)) return inputCat;
    
    const match = existingCats.find(c => c.replace(/^\d+_/, '').toLowerCase() === cleanInput.toLowerCase());
    if (match) return match; 
    
    let maxPrefix = 0;
    existingCats.forEach(c => {
        const m = c.match(/^(\d+)_/);
        if (m && parseInt(m[1], 10) > maxPrefix) maxPrefix = parseInt(m[1], 10);
    });
    
    const nextPrefix = String(maxPrefix + 1).padStart(2, '0');
    return `${nextPrefix}_${cleanInput}`;
}


// 4. APP STARTUP (Auth-Gated)
// console.log("Script parsed. Attempting startup...");

function showApp() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("mainAppContainer").style.display = "";
    if (!window.appInitialized) {
        init();
    }
}

function showLogin() {
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("mainAppContainer").style.display = "none";
}

function setupAuthListeners() {
    const googleBtn = document.getElementById("googleSignInBtn");
    const skipBtn = document.getElementById("skipLoginBtn");
    const signOutBtn = document.getElementById("signOutBtn");
    const loginError = document.getElementById("loginError");

    if (googleBtn) {
        googleBtn.onclick = async () => {
            googleBtn.disabled = true;
            googleBtn.textContent = "Redirecting…";
            loginError.style.display = "none";
            
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) {
                loginError.textContent = error.message;
                loginError.style.display = "block";
                googleBtn.disabled = false;
                googleBtn.textContent = "Sign in with Google";
            }
        };
    }

    if (skipBtn) {
        skipBtn.onclick = () => {
            window.isGuestMode = true;
            window.currentUserId = null;
            showApp();
        };
    }

    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (window.isGuestMode) {
                window.isGuestMode = false;
                showLogin();
            } else {
                await supabase.auth.signOut();
            }
        };
    }

    supabase.auth.onAuthStateChange((event, session) => {
        
        if (session && session.user) {
            window.isGuestMode = false;
            window.currentUserId = session.user.id;
            showApp();
        } else if (!window.isGuestMode) {
            window.currentUserId = null;
            showLogin();
        }
    });
}

// --- NEW AUTONOMOUS RESET LISTENER ---
// Put this at the very bottom of app.js
(function() {
    const attachResetListener = () => {
        const resetText = document.getElementById("dialResetBtn");
        if (!resetText) return;

        const performReset = (e) => {
            // Log for Chrome Console tracking
            console.log(`[MobileReset] ${e.type} detected`);
            
            const dial = document.getElementById("durationDial");
            if (!dial) return;

            // Stop scrolling/zooming
            if (e.cancelable) e.preventDefault(); 

            dial.value = 50;

            // Manually trigger 'input' so the existing slider logic hears the change
            dial.dispatchEvent(new Event('input', { bubbles: true }));
            dial.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Force a UI refresh if the helpers exist
            if (typeof updateDialUI === "function") updateDialUI();
            
            console.log("[MobileReset] Snapped to 50");
        };

        // Use passive: false to allow e.preventDefault() on mobile
        resetText.addEventListener("touchend", performReset, { passive: false });
        resetText.addEventListener("click", performReset);
    };

    // Run once on load, and again if the DOM changes (in case it's in a modal)
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attachResetListener);
    } else {
        attachResetListener();
    }
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthListeners);
} else {
    setupAuthListeners();
}

// #endregion


// --- SPECIALTY TOOLS ---
/* ==========================================================================
   SPECIALTY TOOLS (ID FIXER)
   ========================================================================== */

function renderIdFixer(container, brokenId) {

    const normBroken = normalizePlate(brokenId);
    const currentAlias = (typeof idAliases !== 'undefined') ? idAliases[normBroken] : null;

    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px dashed #ccc";
    wrap.style.fontSize = "0.85rem";

    let statusHTML = currentAlias 
        ? `<div style="margin-bottom:4px; color:green;">✅ <b>${normBroken}</b> ➝ <b>${currentAlias}</b></div>` 
        : `<div style="margin-bottom:4px; color:#e65100;">🔧 <b>ID ${normBroken}</b> is unlinked</div>`;

    wrap.innerHTML = `
        <div class="adv-section-title" style="margin-top:0; color:#333;">Link / Map Pose</div>
        ${statusHTML}
        <div style="display:flex; gap:5px; margin-top:5px;">
            <input type="text" id="fixerSearch" placeholder="Search pose..." class="tiny" style="flex:1; min-width:80px;">
        </div>
        <select id="fixerSelect" class="tiny" style="width:100%; margin-top:5px; margin-bottom:5px;">
            <option value="">(Type to search...)</option>
        </select>
        <button id="fixerSaveBtn" class="tiny" style="width:100%; background:${currentAlias ? '#2e7d32' : '#e65100'}; color:white;">
            ${currentAlias ? 'Update Link' : 'Link Pose'}
        </button>
    `;

    const searchInput = wrap.querySelector("#fixerSearch");
    const select = wrap.querySelector("#fixerSelect");

    searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        if (q.length < 2) return;
        const asanaIndex = getAsanaIndex();
        const matches = asanaIndex.filter(a =>
            (a.english.toLowerCase().includes(q) || a.asanaNo.includes(q))
        ).slice(0, 10);

        select.innerHTML = "";
        matches.forEach(m => {
            const mainOpt = document.createElement("option");
            mainOpt.value = normalizePlate(m.asanaNo);
            mainOpt.textContent = `[${m.asanaNo}] ${m.english}`;
            select.appendChild(mainOpt);
        });
    };

    wrap.querySelector("#fixerSaveBtn").onclick = async () => {
        const newVal = select.value;
        if (!newVal) return alert("Select target.");
        if (confirm(`Map ID ${normBroken} -> ${newVal}?`)) {
            alert("This requires backend logic for id_aliases.json");
        }
    };
    container.appendChild(wrap);
}


