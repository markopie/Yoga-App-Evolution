// src/ui/asanaEditor.js
// ────────────────────────────────────────────────────────────────────────────
// Logic for adding/editing asanas and variations (Stages).
// ────────────────────────────────────────────────────────────────────────────

import { $, normaliseText } from '../utils/dom.js';
import { supabase } from '../services/supabaseClient.js';
import { loadAsanaLibrary } from '../services/dataAdapter.js';
import { getOrCreateAsanaCategoryId } from '../services/persistence.js';


/**
 * Creates a new stage pre-filled with data from the current asana.
 * Called when the "+ Add Stage" button is clicked.
 */
window.createStageFromAsana = function() {
    const asanaId = $("editAsanaId")?.value?.trim();
    if (!asanaId || asanaId === "000") {
        alert("Please save the asana first before adding stages.");
        return;
    }

    const normId = typeof window.normalizePlate === 'function' ? window.normalizePlate(asanaId) : asanaId;
    const lib = window.asanaLibrary || {};
    const asana = lib[normId] || {};

    // Stage key left empty for the user to fill in
    const stageKey = "";

    // Copy technique from the asana editor's technique field
    const technique = $("editAsanaTechnique")?.value?.trim() || asana.technique || "";

    // Copy image_url from the asana
    const imageUrl = asana.image_url || "";

    // Copy hold times from the asana editor's hold inputs
    const holdStandard = parseInt($("editAsanaHoldStandard")?.value || "30", 10);
    const holdShort = parseInt($("editAsanaHoldShort")?.value || "15", 10);
    const holdLong = parseInt($("editAsanaHoldLong")?.value || "60", 10);
    const holdJson = { standard: holdStandard, short: holdShort, long: holdLong };

    // Determine sort_order: count existing stages
    const container = document.getElementById("stagesContainer");
    const existingCount = container ? container.querySelectorAll(".stage-row").length : 0;
    const sortOrder = existingCount;

    // Add the stage to the editor
    window.addStageToEditor(stageKey, {
        full_technique: technique,
        image_url: imageUrl,
        hold_json: holdJson,
        sort_order: sortOrder,
        title: "" // User fills in the title
    });
};

/**
 * Populates the category select dropdown from the asana_categories table.
 */
async function populateCategorySelect() {
    const select = $("editAsanaCategory");
    if (!select) return;
    
    // Only populate if not already done
    if (select.options.length > 1) return;
    
    try {
        const { data: categories, error } = await supabase
            .from('asana_categories')
            .select('id, name')
            .order('name');
        
        if (error) throw error;
        
        if (categories) {
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Failed to load categories:", e);
    }
}

/**
 * Opens the Asana Editor modal and populates it with data.
 */
window.openAsanaEditor = async function(asanaId) {
    const backdrop = $("asanaEditorBackdrop");
    if (!backdrop) return;

    const lib = window.asanaLibrary || {};
    const normId = asanaId ? (typeof window.normalizePlate === 'function' ? window.normalizePlate(asanaId) : asanaId) : null;
    const asana = normId ? lib[normId] : null;

    // Populate category select on first open
    await populateCategorySelect();

    // Populate Main Fields
    $("editAsanaId").value = asanaId || "000";
    $("editAsanaEnglish").value = asana?.english || asana?.english_name || "";
    $("editAsanaName").value = asana?.name || "";
    $("editAsanaIAST").value = asana?.iast || "";
    $("editAsanaDescription").value = asana?.description || "";
    $("editAsanaTechnique").value = asana?.technique || "";
    $("editAsanaRequiresSides").checked = !!(asana?.requires_sides);
    
    // Category — select the matching option or show custom input
    const catSelect = $("editAsanaCategory");
    const catCustom = $("editAsanaCategoryCustom");
    const categoryName = asana?.category || "";
    if (categoryName) {
        const optionExists = Array.from(catSelect.options).some(o => o.value === categoryName);
        if (optionExists) {
            catSelect.value = categoryName;
            catSelect.style.display = "";
            if (catCustom) catCustom.style.display = "none";
        } else {
            // Custom category not in the list — show the custom input
            catSelect.value = "";
            if (catCustom) {
                catCustom.value = categoryName;
                catCustom.style.display = "";
            }
        }
    } else {
        catSelect.value = "";
        if (catCustom) catCustom.style.display = "none";
    }

    // Intensity
    if ($("editAsanaIntensity")) $("editAsanaIntensity").value = asana?.intensity || "";

    // Relational Injections
    const formatInjection = (val) => {
        if (!val) return "";
        if (typeof val === 'object' && val.asana_id) {
            const stageId = val.stage_id;
            const targetAsana = lib[val.asana_id];
            if (stageId && targetAsana && targetAsana.variations) {
                // Resolve stage_id (database ID) back to stage key
                const found = Object.entries(targetAsana.variations).find(([k, v]) => String(v.id) === String(stageId));
                if (found) {
                    return `${val.asana_id}:${found[0]}`;
                }
            }
            return val.asana_id;
        }
        return String(val);
    };
    if ($("editAsanaPrep")) $("editAsanaPrep").value = formatInjection(asana?.preparatory_pose_id);
    if ($("editAsanaRecov")) $("editAsanaRecov").value = formatInjection(asana?.recovery_pose_id);

    // Hydrate Variations
    const container = $("stagesContainer");
    if (container) container.innerHTML = "";

    if (asana?.variations) {
        Object.entries(asana.variations).forEach(([sKey, sData]) => {
            window.addStageToEditor(sKey, sData);
        });
    }

    backdrop.style.display = "flex";
};

if ($("asanaEditorCloseBtn")) {
    $("asanaEditorCloseBtn").onclick = () => $("asanaEditorBackdrop").style.display = "none";
}

// Wire the Add Stage button
if ($("addStageBtn")) {
    $("addStageBtn").onclick = window.createStageFromAsana;
}

/**
 * Injects a stage (variation) row into the editor modal.
 */
window.addStageToEditor = function(stageKey, stageData = {}) {
    const container = document.getElementById("stagesContainer");
    if (!container) return;

    const div = document.createElement("div");
    div.className = "stage-row";
    div.style.cssText = "border:1px solid #eee; padding:12px; border-radius:8px; background:#fff; margin-bottom:10px;";
    // Store the database ID if this is an existing stage (for update on save)
    if (stageData.id) {
        div.dataset.stageId = stageData.id;
    }
    
    const existingTech = stageData.full_technique || stageData.technique || "";
    const hj = stageData.hold_json || {};
    const holdStd = hj.standard || 30;
    const holdShort = hj.short || 15;
    const holdLong = hj.long || 60;

    // Only show the actual stage_name in the key field, not internal fallback keys
    const displayKey = (stageKey && !stageKey.startsWith('_id_') && !stageKey.startsWith('_new_')) ? stageKey : '';

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
           <input type="text" class="stage-name" value="${displayKey}" placeholder="Key (e.g. I)" style="width:80px; font-weight:bold; padding:4px;">
           <input type="text" class="stage-title" value="${stageData.title || ''}" placeholder="Display Title" style="flex:1; margin:0 10px; padding:4px;">
           <button type="button" class="tiny warn" onclick="window.deleteStageRow(this)">✕</button>
        </div>
        <div style="margin-bottom:8px;">
           <textarea class="stage-tech" style="height:60px; padding:6px; width:100%; font-family:inherit; border:1px solid #ccc; border-radius:4px;">${existingTech}</textarea>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:8px;">
           <div style="flex:1;">
               <label class="muted" style="font-size:0.75rem;">Hold Standard (s)</label>
               <input type="number" class="stage-hold-standard" value="${holdStd}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="flex:1;">
               <label class="muted" style="font-size:0.75rem;">Hold Short (s)</label>
               <input type="number" class="stage-hold-short" value="${holdShort}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="flex:1;">
               <label class="muted" style="font-size:0.75rem;">Hold Long (s)</label>
               <input type="number" class="stage-hold-long" value="${holdLong}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
        </div>
        <div style="display:flex; gap:10px;">
           <div style="flex:1;">
               <label class="muted" style="font-size:0.75rem;">Prep (ID:Stage)</label>
               <div style="display:flex; gap:4px; align-items:center;">
                 <input type="text" class="stage-prep" value="${stageData.preparatory_pose_id ? (typeof stageData.preparatory_pose_id === 'object' ? stageData.preparatory_pose_id.asana_id + (stageData.preparatory_pose_id.stage_id ? ':'+stageData.preparatory_pose_id.stage_id : '') : stageData.preparatory_pose_id) : ''}" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px;">
                 <button type="button" class="tiny b-row-search-btn" onclick="window.triggerAsanaInjectionSearch(this.closest('.stage-row').querySelector('.stage-prep'))" style="padding:2px 6px; border-radius:4px; border:1px solid #ccc; background:#fff; cursor:pointer; flex-shrink:0;" title="Search Asana">🔍</button>
               </div>
           </div>
           <div style="flex:1;">
               <label class="muted" style="font-size:0.75rem;">Recov (ID:Stage)</label>
               <div style="display:flex; gap:4px; align-items:center;">
                  <input type="text" class="stage-recov" value="${stageData.recovery_pose_id ? (typeof stageData.recovery_pose_id === 'object' ? stageData.recovery_pose_id.asana_id + (stageData.recovery_pose_id.stage_id ? ':'+stageData.recovery_pose_id.stage_id : '') : stageData.recovery_pose_id) : ''}" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px;">
                 <button type="button" class="tiny b-row-search-btn" onclick="window.triggerAsanaInjectionSearch(this.closest('.stage-row').querySelector('.stage-recov'))" style="padding:2px 6px; border-radius:4px; border:1px solid #ccc; background:#fff; cursor:pointer; flex-shrink:0;" title="Search Asana">🔍</button>
               </div>
           </div>
        </div>
    `;
    container.appendChild(div);
};

/**
 * Deletes a stage row from the editor and from the database if it has been saved.
 * Called when the ✕ button on a stage row is clicked.
 */
window.deleteStageRow = async function(btn) {
    const div = btn.closest('.stage-row');
    if (!div) return;

    const stageId = div.dataset.stageId;
    if (stageId) {
        // This stage exists in the database — delete it
        try {
            const { error } = await supabase.from("stages").delete().eq("id", stageId);
            if (error) throw error;
        } catch (err) {
            console.error("Failed to delete stage:", err);
            alert("Error deleting stage: " + err.message);
            return;
        }
    }
    // Remove the DOM element
    div.remove();
};

/**
 * Opens the row search overlay for selecting an asana to inject into a prep/recovery field.
 * @param {string|HTMLElement} targetInput - The ID of the input element, or the input element itself.
 */
window.triggerAsanaInjectionSearch = function(targetInput) {
    // Resolve the target input element
    let inputEl;
    if (typeof targetInput === 'string') {
        inputEl = document.getElementById(targetInput);
    } else if (targetInput && targetInput.tagName === 'INPUT') {
        inputEl = targetInput;
    }
    if (!inputEl) {
        console.error("AsanaEditor: target input not found", targetInput);
        return;
    }

    // Store the target input reference for the callback
    window._asanaInjectionTarget = inputEl;

    const overlay = document.getElementById('rowSearchOverlay');
    const searchInput = document.getElementById('rowSearchInput');
    const results = document.getElementById('rowSearchResults');

    if (!overlay) {
        console.error("Architect Error: rowSearchOverlay missing from DOM.");
        return;
    }

    // DOM Reparenting Failsafe
    if (overlay.parentNode !== document.body) {
        document.body.appendChild(overlay);
    }

    // Show overlay
    overlay.style.display = 'flex';

    // Clear previous state
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search pose by name or ID...';
    }
    if (results) results.innerHTML = '';

    // Override the row search input handler to use our callback mode
    // Store original handler so we can restore it
    if (!window._origRowSearchHandler) {
        window._origRowSearchHandler = searchInput ? searchInput.oninput : null;
    }

    if (searchInput) {
        searchInput.oninput = function() {
            const rawQ = searchInput.value.trim().toLowerCase();
            if (rawQ.length < 1) { results.innerHTML = ''; return; }

            const lib = Object.values(window.asanaLibrary || {}).filter(Boolean);
            const q = normaliseText(rawQ);

            const scoredMatches = lib.map(a => {
                let score = 0;
                const id = String(a.id || '').toLowerCase();
                const eng = normaliseText(a.english || a.name || '').toLowerCase();
                const iast = normaliseText(a.iast || '').toLowerCase();

                if (id === q || id.replace(/^0+/, '') === q) score += 200;
                else if (id.startsWith(q)) score += 100;

                const engWords = eng.split(/[\s-]/);
                const iastWords = iast.split(/[\s-]/);
                if (eng.startsWith(q) || iast.startsWith(q)) score += 100;
                else if (engWords.some(w => w.startsWith(q)) || iastWords.some(w => w.startsWith(q))) score += 80;
                else if (eng.includes(q) || iast.includes(q)) score += 30;

                if (eng.endsWith(' i') || iast.endsWith(' i')) score += 25;
                const modifierRegex = /\b(parivrtta|parsva|eka|dwi|baddha|mukta|urdhva|pinda|janu|supta|ardha|variation|ii|iii|iv|v|vi)\b/g;
                const engMods = eng.match(modifierRegex) || [];
                const iastMods = iast.match(modifierRegex) || [];
                score -= ((engMods.length + iastMods.length) * 12);
                if (score > 0) score -= (eng.length * 0.1);

                return { asana: a, score };
            });

            const sortedMatches = scoredMatches
                .filter(m => m.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 15);

            if (sortedMatches.length === 0) {
                results.innerHTML = '<div style="padding:20px; color:#999; text-align:center;">No poses found matching "' + rawQ + '"</div>';
                return;
            }

            results.innerHTML = sortedMatches.map(({ asana: a }) => {
                const hasVariations = a.variations && Object.keys(a.variations).length > 0;
                return '<div style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:10px; align-items:center;" '
                    + 'onclick="window.selectAsanaInjectionSearch(\'' + a.id + '\')">'
                    + '<div style="background:#007aff; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem; min-width:28px; text-align:center;">' + a.id + '</div>'
                    + '<div style="flex:1; min-width:0;">'
                    + '<div style="font-weight:600; color:#1d1d1f; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (a.english || a.name) + '</div>'
                    + '<div style="font-size:0.75rem; color:#86868b; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (a.iast || '') + '</div>'
                    + '</div>'
                    + (hasVariations ? '<div style="color:#ff9800; font-size:0.7rem; font-weight:bold; padding:2px 6px; border:1px solid #ff9800; border-radius:4px;">Stages</div>' : '')
                    + '<div style="color:#007aff; font-size:0.8rem; font-weight:bold; padding-left:5px;">→</div>'
                    + '</div>';
            }).join('');
        };

        // Trigger initial search if there's already text
        if (searchInput.value.trim()) {
            searchInput.oninput();
        }
    }

    setTimeout(() => {
        if (searchInput) {
            searchInput.focus();
            searchInput.click();
        }
    }, 100);
};

/**
 * Callback for when an asana is selected from the injection search overlay.
 * If the asana has variations, shows a variation picker before populating the field.
 */
window.selectAsanaInjectionSearch = function(asanaId) {
    const targetInput = window._asanaInjectionTarget;
    if (!targetInput) {
        document.getElementById('rowSearchOverlay').style.display = 'none';
        return;
    }

    const lib = window.asanaLibrary || {};
    const normId = typeof window.normalizePlate === 'function' ? window.normalizePlate(asanaId) : asanaId;
    const asana = lib[normId];

    // Check if the asana has variations
    if (asana && asana.variations && Object.keys(asana.variations).length > 0) {
        // Show variation picker within the search results
        const results = document.getElementById('rowSearchResults');
        const searchInput = document.getElementById('rowSearchInput');

        // Build variation picker UI
        const variations = asana.variations;
        const varEntries = Object.entries(variations);

        let varHTML = '<div style="padding:8px 12px; background:#f5f5f7; border-bottom:1px solid #eee; font-weight:600; font-size:0.85rem; color:#1d1d1f;">'
            + 'Select variation for <strong>' + (asana.english || asana.name) + '</strong>:</div>';

        // "Base Pose" option (no stage)
        varHTML += '<div style="padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:10px; align-items:center; background:#f0f7ff;" '
            + 'onclick="window._applyInjectionSearch(\'' + asanaId + '\', null)">'
            + '<div style="background:#34a853; color:#fff; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">Base</div>'
            + '<div style="flex:1; font-weight:600; color:#1d1d1f;">Base Pose (no stage)</div>'
            + '<div style="color:#007aff; font-size:0.8rem;">✓</div>'
            + '</div>';

        varEntries.forEach(([stageKey, stageData]) => {
            varHTML += '<div style="padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:10px; align-items:center;" '
                + 'onclick="window._applyInjectionSearch(\'' + asanaId + '\', \'' + stageKey + '\')">'
                + '<div style="background:#ff9800; color:#fff; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">' + stageKey + '</div>'
                + '<div style="flex:1; min-width:0;">'
                + '<div style="font-weight:600; color:#1d1d1f; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (stageData.title || stageKey) + '</div>'
                + '</div>'
                + '<div style="color:#007aff; font-size:0.8rem;">→</div>'
                + '</div>';
        });

        if (searchInput) searchInput.value = '';
        results.innerHTML = varHTML;
    } else {
        // No variations - apply directly
        window._applyInjectionSearch(asanaId, null);
    }
};

/**
 * Applies the selected asana (and optional stage) to the target input field.
 */
window._applyInjectionSearch = function(asanaId, stageKey) {
    const targetInput = window._asanaInjectionTarget;
    if (!targetInput) {
        document.getElementById('rowSearchOverlay').style.display = 'none';
        return;
    }

    const paddedId = String(asanaId).padStart(3, '0');
    const value = stageKey ? paddedId + ':' + stageKey : paddedId;
    targetInput.value = value;

    // Clean up
    window._closeInjectionSearch();
    document.getElementById('rowSearchOverlay').style.display = 'none';
};

/**
 * Cleans up the injection search state (restores original handler, clears target).
 */
window._closeInjectionSearch = function() {
    window._asanaInjectionTarget = null;

    // Restore original row search handler if it exists
    const searchInput = document.getElementById('rowSearchInput');
    if (searchInput && window._origRowSearchHandler) {
        searchInput.oninput = window._origRowSearchHandler;
    }
};

/**
 * Prepares the save payload, converting ID:StageKey strings into structured JSON.
 * Stage keys (e.g. "I", "II") are resolved to their database UUID via asanaLibrary.
 */
const buildInjectionPayload = (val) => {
    if (!val || val.trim() === "" || val.toLowerCase() === "null") return null;
    const parts = val.trim().split(/[:\-]/);
    const asana_id = parts[0].padStart(3, "0");
    const stageKey = parts[1] || null;

    let stage_id = null;
    if (stageKey) {
        // Resolve the stage key to its database UUID
        const lib = window.asanaLibrary || {};
        const asana = lib[asana_id];
        if (asana && asana.variations && asana.variations[stageKey]) {
            stage_id = asana.variations[stageKey].id || stageKey;
        } else {
            // Fallback: store the key as-is if we can't resolve it
            stage_id = stageKey;
        }
    }

    return { asana_id, stage_id };
};

/**
 * Builds a hold_json object from the stage row's hold inputs.
 */
function buildStageHoldJson(div) {
    const std = parseInt(div.querySelector(".stage-hold-standard")?.value || "30", 10);
    const sh = parseInt(div.querySelector(".stage-hold-short")?.value || "15", 10);
    const lg = parseInt(div.querySelector(".stage-hold-long")?.value || "60", 10);
    return { standard: std, short: sh, long: lg };
}

/**
 * Logic for the Save button.
 */
window.setupAsanaEditorSave = function() {
    const saveBtn = $("asanaEditorSaveBtn");
    if (!saveBtn) return;

    saveBtn.onclick = async () => {
        const id = $("editAsanaId").value.trim().padStart(3, "0");
        if (!id || id === "000") return;

        try {
            // Resolve category name to category_id (FK to asana_categories table)
            const catSelect = $("editAsanaCategory");
            const catCustom = $("editAsanaCategoryCustom");
            const categoryName = (catCustom && catCustom.style.display !== "none" && catCustom.value.trim())
                ? catCustom.value.trim()
                : (catSelect ? catSelect.value : "");
            const category_id = categoryName ? await getOrCreateAsanaCategoryId(categoryName) : null;

            const asanaPayload = {
                id,
                english_name: $("editAsanaEnglish").value.trim(),
                name: $("editAsanaName").value.trim(),
                iast: $("editAsanaIAST").value.trim(),
                technique: $("editAsanaTechnique").value.trim(),
                description: $("editAsanaDescription").value.trim(),
                requires_sides: $("editAsanaRequiresSides").checked,
                category_id,
                intensity: $("editAsanaIntensity")?.value?.trim() || "",
                preparatory_pose_id: buildInjectionPayload($("editAsanaPrep")?.value),
                recovery_pose_id: buildInjectionPayload($("editAsanaRecov")?.value)
            };

            const { error: asanaErr } = await supabase.from("asanas").upsert(asanaPayload);
            if (asanaErr) throw asanaErr;

            // Handle Stages...
            // Use insert for new stages, update for existing ones (identified by data-stage-id)
            const stageRows = document.querySelectorAll(".stage-row");
            for (let i = 0; i < stageRows.length; i++) {
                const div = stageRows[i];
                const stagePayload = {
                    asana_id: id,
                    stage_name: div.querySelector(".stage-name").value.trim(),
                    title: div.querySelector(".stage-title").value.trim(),
                    full_technique: div.querySelector(".stage-tech").value.trim(),
                    hold_json: buildStageHoldJson(div),
                    sort_order: i,
                    preparatory_pose_id: buildInjectionPayload(div.querySelector(".stage-prep")?.value),
                    recovery_pose_id: buildInjectionPayload(div.querySelector(".stage-recov")?.value)
                };
                const existingStageId = div.dataset.stageId;
                if (existingStageId) {
                    // Update existing stage by its UUID
                    const { error: stageErr } = await supabase
                        .from("stages")
                        .update(stagePayload)
                        .eq("id", existingStageId);
                    if (stageErr) throw stageErr;
                } else {
                    // Insert new stage
                    const { error: stageErr } = await supabase
                        .from("stages")
                        .insert(stagePayload);
                    if (stageErr) throw stageErr;
                }
            }

            // Reload the asana library so the editor shows fresh data on re-open
            window.asanaLibrary = await loadAsanaLibrary();

            // Close the editor modal and refresh the browse view
            $("asanaEditorBackdrop").style.display = "none";
            $("asanaEditorStatus").textContent = "✓ Saved Successfully!";
            if (typeof window.applyBrowseFilters === "function") {
                window.applyBrowseFilters();
            }
            // Re-render the browse detail view with fresh data from the reloaded library
            if (typeof window.showAsanaDetail === "function") {
                const freshAsana = (window.asanaLibrary || {})[id];
                if (freshAsana) {
                    await window.showAsanaDetail(freshAsana);
                }
            }
        } catch (err) {
            console.error("Save failed:", err);
            alert("Error saving: " + err.message);
        }
    };
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.setupAsanaEditorSave);
} else {
    window.setupAsanaEditorSave();
}
