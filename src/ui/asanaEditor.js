// src/ui/asanaEditor.js
// Full Asana Editor — handles add/edit of asana records via Supabase
// Refactored by Yoga App Logic Architect - Phase 3 (Integrity & Scannability)

import { $ } from "../utils/dom.js";
import { normalizePlate } from "../services/dataAdapter.js";
import { supabase } from "../services/supabaseClient.js";
import { parseHoldTimes, buildHoldString } from "../utils/parsing.js";
import { getOrCreateAsanaCategoryId } from "../services/persistence.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS & UI BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ARCHITECT UI HELPER: Enforces Jobsian Typographic Hierarchy
 * Bold English -> Italic IAST -> Accented Badge
 */
function renderAsanaLabel(asana, prefix = "") {
    const english = asana.english_name || "Unknown";
    const iast = asana.iast ? ` <em>${asana.iast}</em>` : "";
    const badge = asana.requires_sides 
        ? ' <span class="badge" style="background:#ffeb3b; color:#333; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">Bilateral</span>' 
        : '';
    return `${prefix}<strong>${english}</strong>${iast}${badge}`;
}

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
    const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X"];
    const asanaId = $("editAsanaId").value.trim().padStart(3, "0");
    const taken = new Set(
        Array.from($("stagesContainer").querySelectorAll(".stage-key")).map(el => el.value.trim().toUpperCase())
    );

    if (supabase && asanaId) {
        try {
            const { data: stages } = await supabase.from("stages").select('stage_name').eq("asana_id", asanaId);
            (stages || []).forEach(r => {
                if (r.stage_name) taken.add(String(r.stage_name).toUpperCase());
            });
        } catch (e) {}
    }

    for (const r of ROMAN) {
        if (!taken.has(r)) return r;
    }
    return String(taken.size + 1);
}

window.refreshStageIndices = function() {
    const container = $("stagesContainer");
    if (!container) return;
    Array.from(container.querySelectorAll(".stage-row")).forEach((row, index) => {
        const display = row.querySelector(".stage-index-display");
        if (display) display.textContent = index + 1;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD STAGE ROW
// ─────────────────────────────────────────────────────────────────────────────

window.addStageToEditor = async function (stageKey = "", stageData = {}) {
    const container = $("stagesContainer");
    const autoKey = stageKey || (await getNextRomanNumeral());
    
    // Logic Cleaned: Relying on normalized 'title' and 'technique'
    const existingTitle = stageData.title || "";
    let suffix = existingTitle.replace(/^(Modified|Stage)\s+[IVXLCDM]+\b\s*/i, "").trim();
    if (suffix === "" && existingTitle !== "" && !existingTitle.match(/^(Modified|Stage)/i)) suffix = existingTitle;

    const existingShorthand = stageData.shorthand || "";
    const existingTech = stageData.technique || "";
    const existingDbId = stageData.id || "";

    const holdData = parseHoldTimes(stageData.hold || "");
    
    const div = document.createElement("div");
    div.className = "stage-row";
    div.dataset.dbId = existingDbId;
    div.dataset.flowHold = String(holdData.flow || 5);
    div.style.cssText = "border:1px solid #ddd; padding:10px; border-radius:6px; background:#fff; display:grid; gap:8px;";

    div.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
           <div style="min-width:30px; text-align:center;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Pos</label>
               <div class="stage-index-display" style="padding:6px; font-weight:bold; color:#007aff; font-size:0.9rem;"></div>
           </div>
           <div style="min-width:60px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Key</label>
               <input type="text" class="stage-key" value="${autoKey}" readonly style="width:60px; padding:6px; font-weight:bold; background:#f5f5f5; text-align:center; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="flex:2; min-width:140px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;"><strong>Stage Display Title</strong></label>
               <input type="text" class="stage-suffix" value="${suffix}" placeholder="e.g. I (on a bolster)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
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
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Short (s)</label>
               <input type="number" class="stage-hold-short" min="0" value="${holdData.short || 15}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Standard (s)</label>
               <input type="number" class="stage-hold-standard" min="0" value="${holdData.standard || 30}" style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Long (s)</label>
               <input type="number" class="stage-hold-long" min="0" value="${holdData.long || 60}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
        </div>
        <div>
           <label class="muted" style="font-size:0.75rem;">Technique</label>
           <textarea class="stage-tech" style="height:60px; padding:6px; width:100%; font-family:inherit; border:1px solid #ccc; border-radius:4px;">${existingTech}</textarea>
        </div>
    `;

    div.querySelector(".remove-stage-btn").onclick = () => {
        const dbId = div.dataset.dbId;
        if (dbId) window._asanaEditorDeletedStageIds.push(parseInt(dbId));
        div.remove();
        window.refreshStageIndices?.();
    };

    container.appendChild(div);
    window.refreshStageIndices?.();
};

// ─────────────────────────────────────────────────────────────────────────────
// OPEN EDITOR
// ─────────────────────────────────────────────────────────────────────────────

window.openAsanaEditor = async function (id) {
    const bd = $("asanaEditorBackdrop");
    if (!bd) return;
    bd.style.display = "flex";
    window._asanaEditorDeletedStageIds = [];

    // Reset UI Status
    $("asanaEditorStatus").textContent = "";
    $("stagesContainer").innerHTML = "";

    // Populate Categories
    const catSel = $("editAsanaCategory");
    const catCustom = $("editAsanaCategoryCustom");
    if (catSel) {
        catSel.innerHTML = '<option value="">-- Select category --</option>';
        getUniqueCategories().forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = getDisplayCategory(c);
            catSel.appendChild(opt);
        });
        const newOpt = document.createElement("option");
        newOpt.value = "__NEW__";
        newOpt.textContent = "(+ Add new category)";
        catSel.appendChild(newOpt);
        catSel.onchange = () => {
            catCustom.style.display = catSel.value === "__NEW__" ? "block" : "none";
        };
        catCustom.style.display = "none";
    }

    const lib = window.asanaLibrary || {};

    if (id && lib[id]) {
        const a = lib[id];

        // 🌟 ARCHITECT FIX: Standardized Label Rendering
        $("asanaEditorTitle").innerHTML = renderAsanaLabel(a, "Edit: ");

        $("editAsanaId").value = a.id;
        $("editAsanaName").value = a.devanagari || "";
        $("editAsanaIAST").value = a.iast || "";
        $("editAsanaEnglish").value = a.english_name || "";
        
        if (catSel && a.category) {
            catSel.value = a.category;
            if (catSel.value !== a.category) {
                catSel.value = "__NEW__";
                catCustom.style.display = "block";
                catCustom.value = getDisplayCategory(a.category);
            }
        }

        const holdData = parseHoldTimes(a.hold || "");
        if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = holdData.standard;
        if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = holdData.short;
        if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = holdData.long;

        let pStr = "";
        if (a.plates?.final) pStr = `Final: ${a.plates.final.join(", ")}`;
        if (a.plates?.intermediate) pStr += ` Intermediate: ${a.plates.intermediate.join(", ")}`;
        $("editAsanaPlates").value = pStr.trim() || a.plate_numbers || "";

        $("editAsanaPage2001").value = a.page_2001 || "";
        $("editAsanaPage2015").value = a.page_2015 || "";
        $("editAsanaIntensity").value = a.intensity || "";
        $("editAsanaNote").value = a.note || "";
        $("editAsanaDescription").value = a.description || "";
        $("editAsanaTechnique").value = a.technique || "";
        $("editAsanaRequiresSides").checked = !!a.requires_sides;

        if (a.variations) {
            Object.entries(a.variations).forEach(([sKey, sData]) => {
                window.addStageToEditor(sKey, sData);
            });
        }
    } else {
        $("asanaEditorTitle").innerHTML = "<strong>Add New Asana</strong>";
        $("editAsanaId").value = getNextAsanaId();
        // Reset all fields
        ["Name", "IAST", "English", "Plates", "Page2001", "Page2015", "Intensity", "Note", "Description", "Technique"].forEach(f => {
            if ($(`editAsana${f}`)) $(`editAsana${f}`).value = "";
        });
        $("editAsanaRequiresSides").checked = false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function wireEditorSave() {
    if ($("asanaEditorCloseBtn")) {
        $("asanaEditorCloseBtn").onclick = () => {
            document.activeElement?.blur(); 
            $("asanaEditorBackdrop").style.display = "none";
        };
    }
    
    if ($("addStageBtn")) $("addStageBtn").onclick = () => window.addStageToEditor();

    if ($("cloneFromBaseBtn")) {
        $("cloneFromBaseBtn").onclick = () => {
            const h = {
                std: parseInt($("editAsanaHoldStandard")?.value || "30", 10),
                short: parseInt($("editAsanaHoldShort")?.value || "15", 10),
                long: parseInt($("editAsanaHoldLong")?.value || "60", 10)
            };
            window.addStageToEditor("", {
                technique: $("editAsanaTechnique")?.value || "",
                hold: buildHoldString(h.std, h.short, h.long, 5)
            });
        };
    }

    const saveBtn = $("asanaEditorSaveBtn");
    if (!saveBtn) return;

    saveBtn.onclick = async () => {
        const id = $("editAsanaId").value.trim().padStart(3, "0");
        if (!id || id === "000") return;

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            // Resolve Category
            const catSel = $("editAsanaCategory");
            const catText = (catSel.value === "__NEW__") ? $("editAsanaCategoryCustom").value : catSel.value;
            const finalCategoryText = formatCategoryName(catText);
            const categoryId = await getOrCreateAsanaCategoryId(finalCategoryText);

            // 🌟 ARCHITECT PAYLOAD: Strictly following Database Contract (Snake Case)
            const asanaPayload = {
                id,
                devanagari: $("editAsanaName").value.trim(),
                iast: $("editAsanaIAST").value.trim(),
                english_name: $("editAsanaEnglish").value.trim(),
                description: $("editAsanaDescription").value.trim(),
                technique: $("editAsanaTechnique").value.trim(),
                note: $("editAsanaNote").value.trim(),
                intensity: $("editAsanaIntensity").value.trim(),
                hold: buildHoldString(
                    parseInt($("editAsanaHoldStandard").value), 
                    parseInt($("editAsanaHoldShort").value), 
                    parseInt($("editAsanaHoldLong").value), 
                    5
                ),
                plate_numbers: $("editAsanaPlates").value.trim(),
                requires_sides: $("editAsanaRequiresSides").checked,
                page_2001: parseInt($("editAsanaPage2001").value) || null,
                page_2015: parseInt($("editAsanaPage2015").value) || null,
                category_id: categoryId
            };

            const { error: asanaErr } = await supabase.from("asanas").upsert(asanaPayload);
            if (asanaErr) throw asanaErr;

            // Handle Deletions
            if (window._asanaEditorDeletedStageIds?.length > 0) {
                await supabase.from("stages").delete().in("id", window._asanaEditorDeletedStageIds);
            }

            // Save Stages
            const stageDivs = Array.from($("stagesContainer").querySelectorAll(".stage-row"));
            const localVariations = {};

            for (let i = 0; i < stageDivs.length; i++) {
                const div = stageDivs[i];
                const key = div.querySelector(".stage-key").value;
                const dbId = div.dataset.dbId;
                const sHold = buildHoldString(
                    parseInt(div.querySelector(".stage-hold-standard").value),
                    parseInt(div.querySelector(".stage-hold-short").value),
                    parseInt(div.querySelector(".stage-hold-long").value),
                    parseInt(div.dataset.flowHold || "5")
                );

                const stagePayload = {
                    asana_id: id,
                    stage_name: key,
                    title: div.querySelector(".stage-suffix").value || key,
                    full_technique: div.querySelector(".stage-tech").value.trim() || null,
                    shorthand: div.querySelector(".stage-short").value.trim() || null,
                    hold: sHold,
                    sort_order: i
                };

                if (dbId) {
                    await supabase.from("stages").update(stagePayload).eq("id", dbId);
                } else {
                    const { data: newS } = await supabase.from("stages").insert(stagePayload).select('id').single();
                    if (newS) div.dataset.dbId = newS.id;
                }

                localVariations[key] = {
                    title: stagePayload.title,
                    shorthand: stagePayload.shorthand,
                    technique: stagePayload.full_technique,
                    hold: sHold
                };
            }

            // Sync Local Cache
            if (window.asanaLibrary) {
                window.asanaLibrary[id] = {
                    ...window.asanaLibrary[id],
                    ...asanaPayload,
                    category: finalCategoryText,
                    variations: localVariations
                };
            }

            $("asanaEditorStatus").textContent = "✓ Saved Successfully!";
            $("asanaEditorStatus").style.color = "#4CAF50";

            setTimeout(() => {
                $("asanaEditorBackdrop").style.display = "none";
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Asana";
                if (window.applyBrowseFilters) window.applyBrowseFilters();
            }, 1000);

        } catch (e) {
            $("asanaEditorStatus").textContent = e.message;
            $("asanaEditorStatus").style.color = "#ff3b30";
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Asana";
        }
    };
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireEditorSave);
} else {
    wireEditorSave();
}