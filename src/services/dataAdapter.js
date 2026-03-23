import { supabase } from './supabaseClient.js';
import { parseHoldTimes, parseSequenceText } from '../utils/parsing.js';

async function fetchCourses(currentUserId = null) {
    if (!supabase) return [];

    try {
        const rawAccumulator = [];

        // 1. Fetch courses WITH their relational parent categories
        const { data: coursesData, error } = await supabase
            .from('courses')
            .select(`
                *,
                course_sub_categories (
                    id,
                    name,
                    category_id,
                    course_categories ( id, name )
                )
            `);

        if (error) throw error;

        if (coursesData) {
            coursesData.forEach(row => {
                const poses = parseSequenceText(row.sequence_text || '');
                
                if (row.title && poses.length > 0) {
                    
                    // 🌟 THE FLATTENING: Exclusively use joined relational data
                    // We assume 'General' if the join somehow fails, but the structure is now the source of truth
                    const subObj = row.course_sub_categories;
                    const author = subObj?.course_categories?.name || 'General';
                    const sub    = subObj?.name || '';
                    const categoryId = subObj?.course_categories?.id ?? null;
                    const subCategoryId = subObj?.id ?? row.sub_category_id ?? null;
                    const isFlow = Number(categoryId) === 55 || String(author).trim().toLowerCase() === 'flow';

                    // Reconstruct the "Author > Course" string for the UI
                    const categoryString = (sub && sub !== 'General') ? `${author} > ${sub}` : author;

                    rawAccumulator.push({
                        title: row.title.trim(),
                        category: categoryString,
                        categoryId,
                        subCategoryId,
                        categoryName: author,
                        subCategoryName: sub,
                        playbackMode: isFlow ? 'flow' : 'standard',
                        isFlow,
                        poses,
                        isUserSequence: categoryString === 'My Sequences',
                        id: String(row.id),
                        supabaseId: String(row.id)
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
    // Library load is intentional eager cache warm (see refactor-roadmap.md Lesson #2)
    if (!supabase) {
        console.error("Supabase client not initialized");
        return {};
    }

    try {
        // 1. Fetch Asanas WITH their relational category
        const { data: asanasData, error: asanasError } = await supabase
            .from('asanas')
            .select(`
                *,
                asana_categories ( name )
            `);
            
        if (asanasError) throw asanasError;

        const normalized = {};

        if (asanasData) {
            asanasData.forEach((row) => {
                const rawId = row.id ?? row.ID ?? '';
                const key = normaliseAsanaId(String(rawId));
                if (!key) return;

                const rawHoldText = String(row.hold ?? row.Hold ?? '');
                
                // 🌟 THE FLATTENING: Use relational category if it exists
                let asanaCategory = row.category ?? '';
                if (row.asana_categories) {
                    asanaCategory = row.asana_categories.name || asanaCategory;
                }

                normalized[key] = {
                    id: key,
                    name: row.name ?? `Pose ${key}`, // Safety Fallback
                    iast: row.iast ?? '',
                    // CRITICAL FIX: Ensure 'english' is never empty
                    english: row.english_name ?? row.name ?? `Pose ${key}`, 
                    devanagari: row.devanagari ?? '', 
                    audio: row.audio_url ?? '',
                    image_url: row.image_url ?? '',
                    technique: row.technique ?? row.Technique ?? '',
                    description: row.description ?? row.Description ?? '',
                    category: asanaCategory,
                    requiresSides: !!(row.requires_sides ?? row.Requires_Sides ?? false),
                    plates: typeof parsePlates === 'function' ? parsePlates(row.plate_numbers ?? '') : (row.plate_numbers ?? ''),
                    hold: rawHoldText,
                    holdTimes: parseHoldTimes(rawHoldText),
                    yoga_the_iyengar_way_id: row.yoga_the_iyengar_way_id ?? '',
                    recovery_pose_id: row.recovery_pose_id ?? null,
                    preparatory_pose_id: row.preparatory_pose_id ?? null,
                    variations: {},
                    isCustom: false
                };
            });
        }

       // 2. Load Stages (Base table replaces both former globals and custom user stages)
        const { data: stagesData } = await supabase.from('stages').select('*');
        
        let allStagesData = stagesData ? [...stagesData] : [];

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
                // CRITICAL FIX: Aggressively check all capitalizations of full_technique and technique
                technique: stage.full_technique ?? stage.Full_Technique ?? stage.technique ?? stage.Technique ?? '',
                full_technique: stage.full_technique ?? stage.Full_Technique ?? stage.technique ?? stage.Technique ?? '',
                shorthand: stage.Shorthand ?? stage.shorthand ?? '',
                title: stage.Title ?? stage.title ?? `Stage ${stageKey}`,
                hold: holdStr,
                holdTimes: parseHoldTimes(holdStr),
                image_url: stage.image_url ?? '',
                audio: stage.audio_url ?? stage.Audio_URL ?? '',
                recovery_pose_id: stage.recovery_pose_id ?? stage.recover_pose_id ?? null,
                preparatory_pose_id: stage.preparatory_pose_id ?? null,
                page_primary: stage.page_primary ?? null,  
                isCustom: !!stage.user_id 
            };
        });

        window.asanaLibrary = normalized;
        return normalized;

    } catch (e) {
        console.error("🔥 Exception loading asana library:", e);
        // Ensure the app doesn't crash completely
        window.asanaLibrary = window.asanaLibrary || {}; 
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
        holdTimes: parseHoldTimes(rawHoldText),
        yoga_the_iyengar_way_id: row.yoga_the_iyengar_way_id ?? existingData.yoga_the_iyengar_way_id ?? '',
        recovery_pose_id: row.recovery_pose_id ?? row.recover_pose_id ?? existingData.recovery_pose_id ?? null,
        preparatory_pose_id: row.preparatory_pose_id ?? existingData.preparatory_pose_id ?? null,
        standard_seconds: parseHoldTimes(rawHoldText).standard || 30,
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