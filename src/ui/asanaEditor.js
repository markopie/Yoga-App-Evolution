// src/ui/asanaEditor.js
// Full Asana Editor — handles add/edit of asana records via Supabase

import { $ } from "../utils/dom.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { parseHoldTimes, buildHoldString } from "../utils/parsing.js";
import { getOrCreateAsanaCategoryId } from "../services/persistence.js";
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getUniqueCategories() {
    const cats = new Set();
    const lib = window.asanaLibrary || {};
    Object.values(lib).forEach(a => {
        if (a.category) cats.add(a.category.trim());
    });
    return Array.from(cats).sort();
}

function getDisplayCategory(cat) {
    if (!cat) return "";
    return cat.replace(/^\d+_/, "").replace(/_/g, " ");
}

function formatCategoryName(inputCat) {
    if (!inputCat) return "";
    const cleanInput = inputCat.trim().replace(/\s+/g, "_");
    const existingCats = getUniqueCategories();

    if (existingCats.includes(inputCat)) return inputCat;

    const match = existingCats.find(
        c => c.replace(/^\d+_/, "").toLowerCase() === cleanInput.toLowerCase()
    );
    if (match) return match;

    let maxPrefix = 0;
    existingCats.forEach(c => {
        const m = c.match(/^(\d+)_/);
        if (m && parseInt(m[1], 10) > maxPrefix) maxPrefix = parseInt(m[1], 10);
    });

    const nextPrefix = String(maxPrefix + 1).padStart(2, "0");
    return `${nextPrefix}_${cleanInput}`;
}

function getNextAsanaId() {
    const lib = window.asanaLibrary || {};
    let next = 1;
    while (lib[String(next).padStart(3, "0")]) {
        next++;
    }
    return String(next).padStart(3, "0");
}

async function getNextRomanNumeral() {
    const ROMAN = [
        "I","II","III","IV","V","VI","VII","VIII","IX","X",
        "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"
    ];

    const asanaId = $("editAsanaId").value.trim().padStart(3, "0");
    const inDom = Array.from($("stagesContainer").querySelectorAll(".stage-key")).map(
        el => el.value.trim().toUpperCase()
    );
    const taken = new Set(inDom);

    if (supabase && asanaId) {
        try {
            // 🌟 FIX: Only query the actual lowercase column
            const { data: s1 } = await supabase.from("stages").select('stage_name').eq("asana_id", asanaId);
            (s1 || []).forEach(r => {
                const name = r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
        } catch (e) {
            // Non-critical — ignore
        }
    }

    for (const r of ROMAN) {
        if (!taken.has(r)) return r;
    }
    return String(taken.size + 1);
}

function getVariationSuffixes() {
    const suffixes = new Set();
    const asanaId = $("editAsanaId").value.trim().padStart(3, "0");
    const asana = (window.asanaLibrary || {})[asanaId];
    if (asana && asana.variations) {
        Object.values(asana.variations).forEach(vData => {
            const title = typeof vData === "object" ? (vData.title || vData.Title || "") : "";
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

// ─────────────────────────────────────────────────────────────────────────────
// ADD STAGE ROW TO EDITOR
// ─────────────────────────────────────────────────────────────────────────────

window.addStageToEditor = async function (stageKey = "", stageData = {}) {
    const container = $("stagesContainer");

    const autoKey = stageKey || (await getNextRomanNumeral());
    const existingTitle = typeof stageData === "object" ? (stageData.title || stageData.Title || "") : "";
    const prefixMatch = existingTitle.match(/^(Modified|Stage)\s+/i);
    const prefix = prefixMatch ? prefixMatch[1] : "Modified";
    const suffix = existingTitle.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
    const existingShorthand  = typeof stageData === "object" ? (stageData.shorthand   || stageData.Shorthand   || "") : "";
    const existingTech = typeof stageData === "object"
        ? (stageData.full_technique || stageData.Full_Technique || stageData.technique || "")
        : (stageData || "");
    const existingDbId       = typeof stageData === "object" ? (stageData.id           || stageData.db_id       || "") : "";

    const existingHoldStr = typeof stageData === "object" ? (stageData.hold || stageData.Hold || "") : "";
    const parsedHold = parseHoldTimes(existingHoldStr);
    const holdStd   = existingHoldStr ? parsedHold.standard : 30;
    const holdShort = existingHoldStr ? parsedHold.short    : 15;
    const holdLong  = existingHoldStr ? parsedHold.long     : 60;
    const holdFlow  = existingHoldStr ? parsedHold.flow     : 5;

    const suffixes = getVariationSuffixes();
    const datalistId = `stageSuffixList_${Date.now()}`;

    const div = document.createElement("div");
    div.className = "stage-row";
    div.dataset.dbId = existingDbId;
    div.dataset.flowHold = String(holdFlow);
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
           <div style="margin-bottom:4px;">
             <select class="stage-prefix-tpl" style="font-size:0.78rem; padding:3px 6px; border:1px solid #ddd; border-radius:4px; background:#f9f9f9; color:#555;">
               <option value="">— prepend technique prefix —</option>
               <option value="Back against the wall: ">Back against the wall</option>
               <option value="Bent legs throughout: ">Bent legs throughout</option>
               <option value="With chair support: ">With chair support</option>
               <option value="Using a bolster / prop: ">Using a bolster / prop</option>
               <option value="Against the wall (side): ">Against the wall (side)</option>
               <option value="Supported inverted: ">Supported inverted</option>
             </select>
           </div>
           <textarea class="stage-tech" style="height:60px; padding:6px; width:100%; font-family:inherit; border:1px solid #ccc; border-radius:4px;">${existingTech}</textarea>
        </div>
    `;

    div.querySelector(".remove-stage-btn").onclick = () => div.remove();

    // Prefix template picker: prepend chosen text then reset select
    const prefixSel = div.querySelector(".stage-prefix-tpl");
    const techArea  = div.querySelector(".stage-tech");
    if (prefixSel && techArea) {
        prefixSel.onchange = () => {
            const chosen = prefixSel.value;
            if (!chosen) return;
            techArea.value = chosen + techArea.value;
            techArea.focus();
            prefixSel.value = ""; // reset so it can be reused
        };
    }

    container.appendChild(div);
};

// ─────────────────────────────────────────────────────────────────────────────
// OPEN ASANA EDITOR
// ─────────────────────────────────────────────────────────────────────────────

window.openAsanaEditor = async function (id) {
    const bd = $("asanaEditorBackdrop");
    if (!bd) {
        console.error("asanaEditorBackdrop not found!");
        return alert("Editor HTML missing");
    }
    bd.style.display = "flex";

    // Populate Category Select dynamically
    const catSel = $("editAsanaCategory");
    const catCustom = $("editAsanaCategoryCustom");
    if (catSel) {
        catSel.innerHTML = '<option value="">-- Select category --</option>';
        getUniqueCategories().forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;  // raw value for saving
            opt.textContent = getDisplayCategory(c);
            catSel.appendChild(opt);
        });
        // Add new option
        const newOpt = document.createElement("option");
        newOpt.value = "__NEW__";
        newOpt.textContent = "(+ Add new category)";
        catSel.appendChild(newOpt);
        // Wire toggle for custom input
        catSel.onchange = () => {
            if (catCustom) catCustom.style.display = catSel.value === "__NEW__" ? "block" : "none";
        };
        if (catCustom) catCustom.style.display = "none";
    }

    // Reset all fields
    $("editAsanaId").value         = "";
    $("editAsanaName").value       = "";
    $("editAsanaIAST").value       = "";
    $("editAsanaEnglish").value    = "";
    $("editAsanaCategory").value   = "";
    if ($("editAsanaCategoryCustom")) { $("editAsanaCategoryCustom").value = ""; $("editAsanaCategoryCustom").style.display = "none"; }
    if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = "";
    if ($("editAsanaHoldShort"))    $("editAsanaHoldShort").value    = "";
    if ($("editAsanaHoldLong"))     $("editAsanaHoldLong").value     = "";
    $("editAsanaPlates").value     = "";
    $("editAsanaPage2001").value   = "";
    $("editAsanaPage2015").value   = "";
    $("editAsanaIntensity").value  = "";
    $("editAsanaNote").value       = "";
    $("editAsanaDescription").value = "";
    $("editAsanaTechnique").value  = "";
    $("editAsanaRequiresSides").checked = false;
    $("stagesContainer").innerHTML = "";
    $("asanaEditorStatus").textContent = "";

    const lib = window.asanaLibrary || {};

    if (id) {
        // EDITING EXISTING
        $("asanaEditorTitle").textContent = `Edit Asana: ${id}`;
        const a = lib[id] || {};

        $("editAsanaId").value       = a.id || a.asanaNo || id;
        $("editAsanaName").value     = a.name || "";
        $("editAsanaIAST").value     = a.iast || a.IAST || "";
        $("editAsanaEnglish").value  = a.english || a.english_name || "";
        // Pre-select category in the select element
        if ($("editAsanaCategory") && a.category) {
            $("editAsanaCategory").value = a.category;
            // If not found (new category from old data), fall back to custom
            if ($("editAsanaCategory").value !== a.category) {
                $("editAsanaCategory").value = "__NEW__";
                if ($("editAsanaCategoryCustom")) {
                    $("editAsanaCategoryCustom").style.display = "block";
                    $("editAsanaCategoryCustom").value = getDisplayCategory(a.category);
                }
            }
        } else if ($("editAsanaCategory")) {
            $("editAsanaCategory").value = "";
        }

        const holdData = parseHoldTimes(a.Hold || a.hold || "");
        if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = holdData.standard;
        if ($("editAsanaHoldShort"))    $("editAsanaHoldShort").value    = holdData.short;
        if ($("editAsanaHoldLong"))     $("editAsanaHoldLong").value     = holdData.long;

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

        $("editAsanaPage2001").value  = a.page2001 || a.Page_2001 || "";
        $("editAsanaPage2015").value  = a.page2015 || a.Page_2015 || "";
        $("editAsanaIntensity").value = a.intensity || a.Intensity || "";
        $("editAsanaNote").value      = a.note || a.Note || "";
        $("editAsanaDescription").value = a.description || a.Description || "";
        $("editAsanaTechnique").value = a.technique || a.Technique || "";
        $("editAsanaRequiresSides").checked = !!(a.requiresSides || a.Requires_Sides);

        if (a.variations) {
            Object.entries(a.variations).forEach(([sKey, sData]) => {
                window.addStageToEditor(sKey, sData);
            });
        }

        // Load stages from DB and sync IDs
        try {
            const paddedId = String(id).padStart(3, "0");
            const { data: stages } = await supabase
                .from("stages")
                .select("id, stage_name, title, shorthand, full_technique, hold")
                .eq("asana_id", paddedId);
                
            if (stages && stages.length > 0) {
                stages.forEach(stage => {
                    const stageKey = stage.stage_name || "";
                    const existingDomRow = $("stagesContainer").querySelector(`input.stage-key[value="${stageKey}"]`);
                    
                    if (existingDomRow) {
                        // 🌟 FIX: Inject the REAL database ID so Save knows to UPDATE
                        const rowDiv = existingDomRow.closest('.stage-row');
                        if (rowDiv) rowDiv.dataset.dbId = stage.id;
                    } else {
                        // If it doesn't exist in the UI yet, add it
                        window.addStageToEditor(stageKey, {
                            id: stage.id,
                            stage_name: stageKey,
                            title: stage.title || "",
                            shorthand: stage.shorthand || "",
                            full_technique: stage.full_technique || "",
                            hold: stage.hold || ""
                        });
                    }
                });
            }
        } catch (e) {
            console.warn("Failed to load stages from DB:", e);
        }
    } else {
        // ADDING NEW
        $("asanaEditorTitle").textContent = "Add New Asana";
        $("editAsanaId").value = getNextAsanaId();
    }

    // Snapshot for change detection
    window._asanaEditorSnapshot = null;
    window._asanaEditorOriginalStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
    window._asanaEditorOriginalStageData = null;
    requestAnimationFrame(() => {
        window._asanaEditorSnapshot = {
            name:         $("editAsanaName").value,
            iast:         $("editAsanaIAST").value,
            english_name: $("editAsanaEnglish").value,
            technique:    $("editAsanaTechnique").value,
            plate_numbers: $("editAsanaPlates").value,
            requires_sides: $("editAsanaRequiresSides").checked,
            page_2001:    $("editAsanaPage2001").value,
            page_2015:    $("editAsanaPage2015").value,
            intensity:    $("editAsanaIntensity").value,
            note:         $("editAsanaNote").value,
            category:     $("editAsanaCategory").value,
            description:  $("editAsanaDescription").value,
            holdStd:      $("editAsanaHoldStandard")?.value,
            holdShort:    $("editAsanaHoldShort")?.value,
            holdLong:     $("editAsanaHoldLong")?.value,
            stageCount:   $("stagesContainer").querySelectorAll(".stage-row").length
        };
        window._asanaEditorOriginalStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
            key:          div.querySelector(".stage-key")?.value || "",
            prefix:       div.querySelector(".stage-prefix")?.value || "",
            suffix:       div.querySelector(".stage-suffix")?.value || "",
            short:        div.querySelector(".stage-short")?.value || "",
            tech:         div.querySelector(".stage-tech")?.value || "",
            holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
            holdShort:    div.querySelector(".stage-hold-short")?.value || "",
            holdLong:     div.querySelector(".stage-hold-long")?.value || ""
        }));
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE LOGIC (wired on DOMContentLoaded)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SAVE LOGIC (wired on DOMContentLoaded)
// ─────────────────────────────────────────────────────────────────────────────

function wireEditorSave() {
    if ($("asanaEditorCloseBtn")) {
        $("asanaEditorCloseBtn").onclick = () => {
            // 👇 These must be INSIDE the curly braces of the arrow function
            document.activeElement?.blur(); 
            $("asanaEditorBackdrop").style.display = "none";
        };
    }
    
    if ($("addStageBtn")) {
        $("addStageBtn").onclick = () => window.addStageToEditor();
    }
    

    if ($("cloneFromBaseBtn")) {
        $("cloneFromBaseBtn").onclick = () => {
            const cloneHold = buildHoldString(
                parseInt($("editAsanaHoldStandard")?.value || "30", 10),
                parseInt($("editAsanaHoldShort")?.value    || "15", 10),
                parseInt($("editAsanaHoldLong")?.value     || "60", 10),
                parseHoldTimes(window.asanaLibrary?.[$("editAsanaId")?.value.trim().padStart(3, "0")]?.hold || '').flow
            );
            window.addStageToEditor("", {
                full_technique: $("editAsanaTechnique")?.value || "",
                hold:           cloneHold
            });
        };
    }

    const saveBtn = $("asanaEditorSaveBtn");
    if (!saveBtn) return;

    saveBtn.onclick = async () => {
        const rawId = $("editAsanaId").value.trim();
        if (!rawId) return alert("ID is required.");
        const id = rawId.padStart(3, "0");

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        let userEmail = null;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            userEmail = user?.email;
        } catch (e) {
            console.warn("User fetch failed:", e.message);
        }

        const isAdmin = userEmail === 'mark.opie@gmail.com';

        // 🌟 NEW RELATIONAL LOGIC: Resolve Category ID
        const _catSel = $("editAsanaCategory");
        const _catCustom = $("editAsanaCategoryCustom");
        const rawCategoryText = (_catSel && _catSel.value === "__NEW__" && _catCustom)
            ? _catCustom.value.trim()
            : (_catSel ? _catSel.value.trim() : "");
            
        const finalCategoryText = formatCategoryName(rawCategoryText);
        let categoryId = null;
        
        try {
            categoryId = await getOrCreateAsanaCategoryId(finalCategoryText);
        } catch (catError) {
            alert(catError.message);
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Asana";
            return;
        }

        const lib = window.asanaLibrary || {};
        const baseAsana = lib[id] || {};
        const existingAsanaFlow = parseHoldTimes(baseAsana.hold || '').flow;
        const asanaHoldStr = buildHoldString(
            parseInt($("editAsanaHoldStandard")?.value || "30", 10),
            parseInt($("editAsanaHoldShort")?.value    || "15", 10),
            parseInt($("editAsanaHoldLong")?.value     || "60", 10),
            existingAsanaFlow
        );

        // 🌟 CLEAN PAYLOAD: Only columns that actually exist in the 'asanas' table
        const asanaData = {
            id,
            name:          $("editAsanaName").value.trim(),
            iast:          $("editAsanaIAST").value.trim(),
            english_name:  $("editAsanaEnglish").value.trim(),
            technique:     $("editAsanaTechnique").value.trim(),
            hold:          asanaHoldStr,
            plate_numbers: $("editAsanaPlates").value.trim(),
            requires_sides: $("editAsanaRequiresSides").checked,
            page_2001:     parseInt($("editAsanaPage2001").value) || null,
            page_2015:     parseInt($("editAsanaPage2015").value) || null,
            category_id:   categoryId, // 👈 Relational Link!
            image_url:     baseAsana.image_url || null
        };

        try {
            if (!supabase) throw new Error("Database connection missing.");
            
            // Note: If you aren't an admin, we should technically be saving to 'user_asanas'.
            // For now, we assume you are saving as admin to the core library.
            if (!isAdmin) {
                throw new Error("Only admins can edit the global library. (User Asanas table integration pending)");
            }

            const { error: asanaErr } = await supabase
                .from("asanas")
                .upsert(asanaData, { onConflict: "id" });
                
            if (asanaErr) throw new Error(`Asana Save Error: ${asanaErr.message}`);

            // Process variation/stage rows
            const stageDivs = $("stagesContainer").querySelectorAll(".stage-row");
            const localVariations = {};

            for (const div of stageDivs) {
                const key = div.querySelector(".stage-key").value.trim();
                if (!key) continue;

                const pfx = div.querySelector(".stage-prefix")?.value.trim() || "Modified";
                const sfx = div.querySelector(".stage-suffix")?.value.trim() || "";
                const dbId = div.dataset.dbId || "";
                const baseVariation = (baseAsana.variations && baseAsana.variations[key]) ? baseAsana.variations[key] : {};
                const holdStr = buildHoldString(
                    parseInt(div.querySelector(".stage-hold-standard")?.value || "30", 10),
                    parseInt(div.querySelector(".stage-hold-short")?.value    || "15", 10),
                    parseInt(div.querySelector(".stage-hold-long")?.value     || "60", 10),
                    parseInt(div.dataset.flowHold || String(parseHoldTimes(baseVariation.hold || '').flow || 5), 10)
                );

                const payload = {
                    asana_id:       id,
                    stage_name:     key,
                    title:          sfx ? `${pfx} ${key} ${sfx}` : `${pfx} ${key}`,
                    full_technique: div.querySelector(".stage-tech")?.value.trim()       || null,
                    shorthand:      div.querySelector(".stage-short")?.value.trim()       || null,
                    image_url:      baseVariation.image_url                               || null,
                    audio_url:      div.querySelector(".stage-audio-url")?.value.trim()   || null,
                    audio_title:    div.querySelector(".stage-audio-title")?.value.trim() || null,
                    hold:           holdStr
                };

                // 🌟 FIX: dbId is now a BigInt, not a UUID string. 
                // So we just check if it has a valid length/value.
                if (dbId && String(dbId).length > 0 && dbId !== "undefined") {
                    const { error: stageUpdErr } = await supabase.from("stages").update(payload).eq("id", parseInt(dbId));
                    if (stageUpdErr) throw new Error(`Stage Update Error: ${stageUpdErr.message}`);
                } else {
                    const { data: newRow, error: stageInsErr } = await supabase.from("stages").insert(payload).select('id').single();
                    if (stageInsErr) throw new Error(`Stage Insert Error: ${stageInsErr.message}`);
                    if (newRow) div.dataset.dbId = newRow.id;
                }

                localVariations[key] = {
                    title:          payload.title,
                    shorthand:      payload.shorthand,
                    full_technique: payload.full_technique,
                    hold:           holdStr,
                    isCustom:       false // System stage
                };
            }

            // Update in-memory library
            if (window.asanaLibrary) {
                window.asanaLibrary[id] = {
                    ...window.asanaLibrary[id],
                    ...asanaData,
                    category: finalCategoryText, // Reconstruct for UI cache
                    english:  asanaData.english_name,
                    variations: { ...(window.asanaLibrary[id]?.variations || {}), ...localVariations }
                };
            }

            $("asanaEditorStatus").textContent = "✓ Saved Successfully!";
            setTimeout(() => {
                $("asanaEditorBackdrop").style.display = "none";
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Asana";
                if (window.showAsanaDetail) window.showAsanaDetail(window.asanaLibrary[id]);
            }, 1000);
            
        } catch (e) {
            console.error(e);
            alert(e.message);
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Asana";
        }
    };
}

// Wire on DOMContentLoaded (or immediately if DOM is ready)
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireEditorSave);
} else {
    wireEditorSave();
}

// Wire on DOMContentLoaded (or immediately if DOM is ready)
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireEditorSave);
} else {
    wireEditorSave();
}
