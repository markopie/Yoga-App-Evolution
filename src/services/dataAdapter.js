import { supabase } from './supabaseClient.js';

import { parseHoldTimes, parseSequenceText } from '../utils/parsing.js';

async function fetchCourses(currentUserId = null) {
    if (!supabase) return [];

    try {
        const rawAccumulator = [];

        // 1. System Courses
        const { data: coursesData } = await supabase.from('courses').select('*');
        if (coursesData) {
            coursesData.forEach(row => {
                const poses = parseSequenceText(row.sequence_text || '');
                if (row.title && poses.length > 0) {
                    rawAccumulator.push({ 
                        title: row.title.trim(), 
                        category: (row.category || '').trim(), 
                        poses, isUserSequence: false, id: String(row.id)
                    });
                }
            });
        }

        // 2. User Sequences
        const { data: userSeqs } = await supabase.from('user_sequences').select('*');
        if (userSeqs) {
            userSeqs.forEach(seq => {
                const isMine = currentUserId && seq.user_id === currentUserId;
                if (!seq.title || !isMine) return;

                const poses = parseSequenceText(seq.sequence_text);
                if (poses && poses.length > 0) {
                    rawAccumulator.push({
                        title: seq.title.trim(),
                        category: (seq.category || 'My Sequences').trim(),
                        poses, isUserSequence: true, supabaseId: seq.id
                    });
                }
            });
        }

        // 3. Deduplicate using Composite Key
        const finalMap = new Map();
        rawAccumulator.forEach(item => {
            const compositeKey = `${item.category.toLowerCase()} | ${item.title.toLowerCase()}`;
            finalMap.set(compositeKey, item);
        });

        // 4. Final Sort and Assign
        const deduplicated = Array.from(finalMap.values()).sort((a, b) => {
            const catSort = a.category.localeCompare(b.category, undefined, { numeric: true });
            return catSort !== 0 ? catSort : a.title.localeCompare(b.title, undefined, { numeric: true });
        });

        window.courses = deduplicated;
        return deduplicated;
    } catch (e) {
        console.error("Load courses failed:", e);
        return [];
    }
}

async function loadAsanaLibrary() {
    console.log("🚀 Starting Asana Library Load..."); // Track in console
    if (!supabase) {
        console.error("Supabase client not initialized");
        return {};
    }

    try {
        const { data: asanasData, error: asanasError } = await supabase.from('asanas').select('*');
        if (asanasError) throw asanasError;

        const normalized = {};

        if (asanasData) {
            asanasData.forEach((row) => {
                const rawId = row.id ?? row.ID ?? '';
                const key = normaliseAsanaId(String(rawId));
                if (!key) return;

                const rawHoldText = String(row.hold ?? row.Hold ?? '');
                const holdData = (row.hold_json && typeof row.hold_json === 'object') 
                    ? row.hold_json 
                    : parseHoldTimes(rawHoldText);

                normalized[key] = {
                    id: key,
                    name: row.name ?? `Pose ${key}`, // Safety Fallback
                    iast: row.iast ?? '',
                    // 🌟 CRITICAL FIX: Ensure 'english' is never empty
                    english: row.english_name ?? row.name ?? `Pose ${key}`, 
                    audio: row.audio_url ?? '',
                    image_url: row.image_url ?? '',
                    technique: row.technique ?? row.Technique ?? '',
                    requiresSides: !!(row.requires_sides ?? row.Requires_Sides ?? false),
                    plates: typeof parsePlates === 'function' ? parsePlates(row.plate_numbers ?? '') : (row.plate_numbers ?? ''),
                    hold: rawHoldText,
                    hold_json: holdData,
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
            const key = normaliseAsanaId(String(userRow.id || userRow.ID || ''));
            if (key) {
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

            const parentKey = normaliseAsanaId(String(parentIdStr));
            
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
                image_url: stage.image_url ?? '',
                isCustom: !!stage.user_id 
            };
        });


window.asanaLibrary = normalized;
        console.log(`✅ Library Synced: ${Object.keys(normalized).length} poses ready.`);
        return normalized;

    } catch (e) {
        console.error("🔥 Exception loading asana library:", e);
        // Ensure the app doesn't crash completely
        window.asanaLibrary = window.asanaLibrary || {}; 
        return {};
    }
}

// 🌟 ADD THIS: Self-execute so it loads immediately!
loadAsanaLibrary();

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
        id: existingData.id || normaliseAsanaId(String(row.id || row.ID || '')),
        name: row.name ?? '',
        english: row.english_name ?? '',
        iast: row.iast ?? '',
        audio: row.audio_url ?? '',
        image_url: row.image_url ?? existingData.image_url ?? '',
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

function findAsanaByIdOrPlate(id) {
    if (!id) return null;
    const lib = window.asanaLibrary || {};
    const asanaArray = Object.values(lib);
    
    // Clean the incoming ID (remove leading zeros and whitespace)
    const cleanSearchId = String(id).trim().replace(/^0+/, '');

    // Search by comparing "Cleaned" IDs
    return asanaArray.find(a => {
        const cleanLibId = String(a.id || a.asanaNo || '').trim().replace(/^0+/, '');
        return cleanLibId === cleanSearchId;
    }) || null;
}

export { fetchCourses, loadAsanaLibrary, normalizeAsana, normalizeAsanaRow, normalizePlate, parsePlates, normaliseAsanaId, findAsanaByIdOrPlate };
