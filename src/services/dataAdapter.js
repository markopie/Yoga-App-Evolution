import { supabase } from './supabaseClient.js';

import { parseHoldTimes } from '../utils/parsing.js';

async function loadAsanaLibrary() {
    if (!supabase) {
        console.error("Supabase client not initialized");
        return {};
    }

    try {
        // 1. Load Global Asanas
        const { data: asanasData, error: asanasError } = await supabase.from('asanas').select('*');
        const normalized = {};

        if (asanasData) {
            asanasData.forEach((row) => {
                const rawId = row.ID ?? row.id ?? '';
                const paddedId = String(rawId).trim().replace(/^0+/, '') || '';
                if (!paddedId) return;
                const key = paddedId.padStart(3, '0');

                // 🌟 ADD THIS: Define holdData BEFORE creating the object 🌟
                const rawHoldText = String(row.Hold ?? row.hold ?? '');
                const holdData = (row.hold_json && typeof row.hold_json === 'object') 
                    ? row.hold_json 
                    : parseHoldTimes(rawHoldText);

                normalized[key] = {
                    id: key,
                    name: row.name ?? '',
                    iast: row.IAST ?? row.iast ?? '',
                    english: row.english_name ?? '',
                    technique: row.Technique ?? row.technique ?? '',
                    requiresSides: !!(row.Requires_Sides ?? row.requires_sides ?? false),
                    plates: typeof parsePlates === 'function' ? parsePlates(row.plate_numbers ?? '') : (row.plate_numbers ?? ''),
                    page2001: String(row.Page_2001 ?? row.page_2001 ?? ''),
                    page2015: String(row.Page_2015 ?? row.page_2015 ?? ''),
                    intensity: String(row.Intensity ?? row.intensity ?? ''),
                    note: row.Note ?? row.note ?? '',
                    category: row.category ?? '',
                    description: row.Description ?? row.description ?? '',
                    
                    // 🌟 NOW WE USE IT 🌟
                    hold: rawHoldText,
                    Hold: rawHoldText,
                    hold_json: holdData, 
                    hold_data: holdData, 
                    
                    variations: {},
                    isCustom: false
                };
            });
        }

        // 2. Load User Asanas and OVERWRITE globals
try {
    // IMPORTANT: Ensure your .select('*') or .select('..., hold_json') includes the new field
    const { data: userAsanasData } = await supabase.from('user_asanas').select('*');
    
    if (userAsanasData) {
        userAsanasData.forEach(userRow => {
            const key = String(userRow.id).trim().replace(/^0+/, '').padStart(3, '0');
            
            if (normalized[key]) {
                // Use the universal normalizer to update the object
                normalized[key] = normalizeAsanaRow(userRow, normalized[key]);
                normalized[key].isCustom = true; 
            }
        });
    }
} catch (err) { console.error("Error loading user asanas:", err); }

        // 3. Load All Stages (Global + User)
        const { data: stagesData } = await supabase.from('stages').select('*');
        const { data: userStagesData } = await supabase.from('user_stages').select('*');
        
        let allStagesData = stagesData ? [...stagesData] : [];
        if (userStagesData) allStagesData = allStagesData.concat(userStagesData);

        allStagesData.forEach((stage) => {
            let parentIdStr = stage.asana_id ?? (Array.isArray(stage.parent_id) ? stage.parent_id[0] : stage.parent_id) ?? null;
            if (!parentIdStr) return;

            const numPart = String(parentIdStr).match(/^(\d+)/);
            if (!numPart) return;
            const parentKey = numPart[1].replace(/^0+/, '').padStart(3, '0') + String(parentIdStr).replace(/^\d+/, '');
            
            if (!normalized[parentKey]) return;

            const stageKey = String(stage.Stage_Name ?? stage.stage_name ?? '').trim();
            if (!stageKey) return;

            const holdStr = stage.Hold ?? stage.hold ?? '';
            
            // User stages naturally overwrite global stages here because they were concatenated last
            normalized[parentKey].variations[stageKey] = {
                id: stage.id ?? '',
                technique: stage.Full_Technique ?? stage.full_technique ?? '',
                full_technique: stage.Full_Technique ?? stage.full_technique ?? '',
                shorthand: stage.Shorthand ?? stage.shorthand ?? '',
                title: stage.Title ?? stage.title ?? `Stage ${stageKey}`,
                hold: holdStr,
                hold_data: parseHoldTimes(holdStr),
                isCustom: !!stage.user_id 
            };
        });


// console.log(`Asana Library Loaded: ${Object.keys(normalized).length} poses`);
        window.asanaLibrary = normalized;
        if (typeof asanaLibrary !== 'undefined') {
            asanaLibrary = normalized;
        }

        // console.log(`Asana Library Loaded: ${Object.keys(normalized).length} poses`);
        return normalized;

        } catch (e) {
        console.error("Exception loading asana library:", e);
        return {};
}
}

function normalizeAsana(id, asana) {
    if (!asana) return null;
    return {
       ...asana,
       asanaNo: id,
       english: asana.english || asana.name || "",
       'Yogasana Name': asana.english || asana.name || "",
       variation: "", // Variations are now in variations object
       inlineVariations: asana.variations ? Object.keys(asana.variations).map(key => ({
          label: key,
          text: asana.variations[key]
       })) : [],
       allPlates: [id] // For search compatibility
    };
 }

function normalizeAsanaRow(row, existingData = {}) {
    const rawHoldText = String(row.Hold ?? row.hold ?? '');
    
    // JSON-First Logic: Check if DB sent hold_json, otherwise parse text
    const holdData = (row.hold_json && typeof row.hold_json === 'object') 
        ? row.hold_json 
        : parseHoldTimes(rawHoldText);

    return {
        ...existingData, // Preserve existing fields if overwriting
        id: existingData.id || String(row.id || row.ID || '').trim().replace(/^0+/, '').padStart(3, '0'),
        name: row.name ?? row.Name ?? existingData.name,
        english: row.english_name ?? row.English ?? existingData.english,
        category: row.category ?? existingData.category,
        hold: rawHoldText,
        hold_json: holdData, // <--- YOUR NEW DURATION BRAIN
        standard_seconds: holdData.standard || 30, // Shortcut for the Slider
        isCustom: !!row.is_custom || false
    };
}

function normalizePlate(p) {
   const s = String(p ?? "").trim();
   if (!s) return "";
   
   // If pure number (e.g. "1"), pad to "001"
   if (/^\d+$/.test(s)) {
       return s.padStart(3, '0');
   }
   return s; 
}

function parsePlates(plateStr) {
    const result = {
        intermediate: [],
        final: []
    };

    if (!plateStr || typeof plateStr !== 'string') {
        return result;
    }

    // Split by common delimiters and look for "Final:" and "Intermediate:"
    const finalMatch = plateStr.match(/Final:\s*([^,\n]+(?:,\s*[^,\n]+)*)/i);
    const intermediateMatch = plateStr.match(/Intermediate:\s*([^,\n]+(?:,\s*[^,\n]+)*)/i);

    if (finalMatch) {
        const plates = finalMatch[1].split(',').map(s => s.trim()).filter(s => s);
        result.final = plates;
    }

    if (intermediateMatch) {
        const plates = intermediateMatch[1].split(',').map(s => s.trim()).filter(s => s);
        result.intermediate = plates;
    }

    return result;
}

function normaliseAsanaId(q){
if(!q) return null;

// extract number + optional suffix
const m = q.trim().match(/^(\d+)([a-z]?)$/i);
if(!m) return null;

let num = m[1];
let suffix = m[2] || "";

num = num.padStart(3,"0");   // 1 → 001
return num + suffix;
}

export { loadAsanaLibrary, normalizeAsana, normalizeAsanaRow, normalizePlate, parsePlates, normaliseAsanaId };
