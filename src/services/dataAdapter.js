import { supabase } from './supabaseClient.js';
import { parseHoldTimes, parseSequenceText } from '../utils/parsing.js';
import { setCourses, setAsanaLibrary } from '../store/state.js';

/** 
 * Bridge: Converts new JSON schema into the app's internal array format 
 */
function parseSequenceJSON(json) {
    if (!Array.isArray(json)) return [];
    
    return json.map((item, idx) => {
        // Schema: [id, duration, name_override, variation_key, note, original_idx, label, meta_obj]
        if (item.type === 'pose') {
            const meta = { 
                originalJson: item,
                props: item.props || [],
                stageId: item.stage_id || null,
                tier: item.tier || null, // JSON-Native Tier property
                explicitSide: null
            };
            
            // Restore side info from props
            if (meta.props.includes('side:L')) meta.explicitSide = 'L';
            if (meta.props.includes('side:R')) meta.explicitSide = 'R';

            return [
                item.pose_id || "",
                item.duration || 0,
                item.name_override || "",
                "", // variation_key (resolved in fetchCourses)
                item.note || "",
                idx,
                null,
                meta
            ];
        }
        if (item.type === 'macro') {
            return [`MACRO:${item.sequence_id}`, item.rounds || 1, "", "", "", idx, "", { originalJson: item }];
        }
        if (item.type === 'loop_start') {
            return ["LOOP_START", item.rounds || 2, "", "", "", idx, "", { originalJson: item }];
        }
        if (item.type === 'loop_end') {
            return ["LOOP_END", 0, "", "", "", idx, "", { originalJson: item }];
        }
        return null;
    }).filter(Boolean);
}

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
                // 🌟 JSON Migration: Prioritize JSON column, fallback to text
                const poses = (row.sequence_json && Array.isArray(row.sequence_json))
                    ? parseSequenceJSON(row.sequence_json)
                    : parseSequenceText(row.sequence_text || '');
                
                if (row.title && poses.length > 0) {
                    
                    // Resolve variation string keys from stage IDs if loaded from JSON
                    poses.forEach(p => {
                        const meta = p[7];
                        if (meta && meta.stageId && !p[3]) {
                            const asana = findAsanaByIdOrPlate(normalizePlate(p[0]));
                            if (asana && asana.variations) {
                                const found = Object.entries(asana.variations).find(([k, v]) => String(v.id) === String(meta.stageId));
                                if (found) p[3] = found[0];
                            }
                        }
                    });

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
                        condition_notes: row.condition_notes || "",
                        is_alias: !!row.is_alias,
                        redirect_id: row.redirect_id,
                        poses,
                        isNativeJson: !!(row.sequence_json && Array.isArray(row.sequence_json)),
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

        setCourses(deduplicated);
        return deduplicated;
    } catch (e) {
        console.error("Exception loading courses:", e);
        return [];
    }
}

async function loadAsanaLibrary() {
    if (!supabase) {
        console.error("Supabase client not initialized");
        return {};
    }

    try {
        const { data: asanasData, error: asanasError } = await supabase
            .from('asanas')
            .select(`*, asana_categories ( name )`);
            
        if (asanasError) throw asanasError;

        const normalized = {};

        if (asanasData) {
            asanasData.forEach((row) => {
                const asana = normalizeAsana(row);
                if (asana) normalized[asana.id] = asana;
            });
        }

        const { data: stagesData } = await supabase.from('stages').select('*');
        let allStagesData = stagesData ? [...stagesData] : [];

        const stagesByAsana = {};
        allStagesData.forEach(stage => {
            const parentIdStr = stage.asana_id ?? (Array.isArray(stage.parent_id) ? stage.parent_id[0] : stage.parent_id) ?? null;
            if (!parentIdStr) return;
            const parentKey = normaliseAsanaId(String(parentIdStr));
            if (!normalized[parentKey]) return;
            if (!stagesByAsana[parentKey]) stagesByAsana[parentKey] = [];
            stagesByAsana[parentKey].push(stage);
        });

        Object.keys(stagesByAsana).forEach(parentKey => {
            const stages = stagesByAsana[parentKey];
            stages.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.stage_name).localeCompare(String(b.stage_name)));

            stages.forEach((stage, i) => {
                const norm = normalizeStageRow(stage, i);
                if (norm) {
                    normalized[parentKey].variations[norm.key] = norm.data;
                }
            });
        });

        // Final pass for computed UI fields
        Object.values(normalized).forEach(asana => {
            asana.inlineVariations = Object.keys(asana.variations).map(k => ({
                label: k,
                text: asana.variations[k]
            }));
        });

        setAsanaLibrary(normalized);
        return normalized;

    } catch (e) {
        console.error("Exception loading asana library:", e);
        window.asanaLibrary = window.asanaLibrary || {}; 
        return {};
    }
}

/**
 * Hardens an asana row from Supabase or legacy object into a consistent application object.
 * Standardizes keys: requires_sides (Boolean), page_primary (Number), is_variation (Boolean).
 */
function normalizeAsana(row, existingData = {}) {
    if (!row) return null;

    // Handle (id, asana) legacy signature
    if (typeof row === 'string' && existingData && typeof existingData === 'object') {
        return normalizeAsana({ ...existingData, id: row });
    }

    const rawId = row.id ?? row.ID ?? row.asanaNo ?? existingData.id ?? '';
    const key = normaliseAsanaId(String(rawId));
    if (!key) return null;

    const rawHoldText = String(row.Hold ?? row.hold ?? existingData.hold ?? '');
    
    // requires_sides (Boolean) -> Handles requiresSides, requires_sides, and "true" strings.
    const rawSides = row.requires_sides ?? row.requiresSides ?? row.Requires_Sides ?? existingData.requires_sides ?? false;
    const requires_sides = (typeof rawSides === 'string') 
        ? (rawSides.toLowerCase() === 'true') 
        : !!rawSides;

    // page_primary (Number) -> Ensure it's a float/int, not a string.
    let page_primary = row.page_primary ?? existingData.page_primary ?? null;
    if (page_primary != null && page_primary !== "") {
        page_primary = parseFloat(page_primary);
        if (isNaN(page_primary)) page_primary = null;
    }

    // is_variation (Boolean)
    const rawIsVar = row.is_variation ?? row.isVariation ?? existingData.is_variation ?? false;
    const is_variation = (typeof rawIsVar === 'string') 
        ? (rawIsVar.toLowerCase() === 'true') 
        : !!rawIsVar;

    // Relational category flattening
    let asanaCategory = row.category ?? existingData.category ?? '';
    if (row.asana_categories) {
        asanaCategory = row.asana_categories.name || asanaCategory;
    }

    const asana = {
        ...existingData,
        id: key,
        asanaNo: key,
        name: row.name ?? existingData.name ?? `Pose ${key}`,
        iast: row.iast ?? existingData.iast ?? '',
        english: row.english_name ?? row.english ?? row.name ?? existingData.english ?? `Pose ${key}`,
        devanagari: row.devanagari ?? existingData.devanagari ?? '', 
        audio: row.audio_url ?? row.audio ?? existingData.audio ?? '',
        image_url: row.image_url ?? existingData.image_url ?? '',
        technique: row.technique ?? row.Technique ?? existingData.technique ?? '',
        description: row.description ?? row.Description ?? existingData.description ?? '',
        category: asanaCategory,
        requires_sides,
        is_variation,
        plates: typeof parsePlates === 'function' ? parsePlates(row.plate_numbers ?? '') : (row.plate_numbers ?? ''),
        hold: rawHoldText,
        holdTimes: parseHoldTimes(rawHoldText),
        page_primary,
        yoga_the_iyengar_way_id: row.yoga_the_iyengar_way_id ?? existingData.yoga_the_iyengar_way_id ?? '',
        recovery_pose_id: row.recovery_pose_id ?? row.recover_pose_id ?? existingData.recovery_pose_id ?? null,
        preparatory_pose_id: row.preparatory_pose_id ?? existingData.preparatory_pose_id ?? null,
        variations: existingData.variations || {},
        isCustom: !!(row.is_custom ?? row.isCustom ?? row.user_id ?? existingData.isCustom ?? false),
        standard_seconds: parseHoldTimes(rawHoldText).standard || 30
    };

    asana['Yogasana Name'] = asana.english;
    asana.allPlates = [key];

    return asana;
}

/**
 * Hardens a stage/variation row from Supabase.
 */
function normalizeStageRow(stage, index = 0) {
    const stageKey = String(stage.Stage_Name ?? stage.stage_name ?? '').trim();
    if (!stageKey) return null;

    const holdStr = stage.Hold ?? stage.hold ?? '';
    
    let page_primary = stage.page_primary ?? null;
    if (page_primary != null && page_primary !== "") {
        page_primary = parseFloat(page_primary);
        if (isNaN(page_primary)) page_primary = null;
    }

    const rawIsVar = stage.is_variation ?? stage.isVariation ?? true; 
    const is_variation = (typeof rawIsVar === 'string') 
        ? (rawIsVar.toLowerCase() === 'true') 
        : !!rawIsVar;

    return {
        key: stageKey,
        data: {
            id: stage.id ?? '',
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
            page_primary,
            is_variation,
            isCustom: !!stage.user_id,
            sort_order: stage.sort_order ?? index 
        }
    };
}

function normalizeAsanaRow(row, existingData = {}) {
    return normalizeAsana(row, existingData);
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