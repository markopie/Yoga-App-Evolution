import { supabase } from './supabaseClient.js';
import { parseSequenceText, parseHoldTimes } from '../utils/parsing.js';

/**
 * Fetches and merges system and user courses with deduplication.
 */
export async function getFullCourseList(currentUserId) {
    const { data: coursesData } = await supabase.from('courses').select('*');
    const { data: userSeqs } = await supabase.from('user_sequences').select('*');
    
    const rawAccumulator = [];

    // System Courses
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

    // User Sequences
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

    // Deduplicate
    const finalMap = new Map();
    rawAccumulator.forEach(item => {
        const compositeKey = `${item.category.toLowerCase()} | ${item.title.toLowerCase()}`;
        finalMap.set(compositeKey, item);
    });

    return Array.from(finalMap.values()).sort((a, b) => {
        const catSort = a.category.localeCompare(b.category, undefined, { numeric: true });
        return catSort !== 0 ? catSort : a.title.localeCompare(b.title, undefined, { numeric: true });
    });
}

/**
 * Fetches Global + User Asanas + Stages and merges them.
 */
export async function getFullAsanaLibrary() {
    const { data: asanasData } = await supabase.from('asanas').select('*');
    const { data: userAsanasData } = await supabase.from('user_asanas').select('*');
    const { data: stagesData } = await supabase.from('stages').select('*');
    const { data: userStagesData } = await supabase.from('user_stages').select('*');

    const normalized = {};

    // 1. Process Global Asanas
    if (asanasData) {
        asanasData.forEach(row => {
            const key = String(row.ID ?? row.id ?? '').trim().replace(/^0+/, '').padStart(3, '0');
            if (!key || key === '000') return;
            normalized[key] = formatAsana(row);
        });
    }

    // 2. Overwrite with User Asanas
    if (userAsanasData) {
        userAsanasData.forEach(userRow => {
            const key = String(userRow.id).trim().replace(/^0+/, '').padStart(3, '0');
            if (normalized[key]) {
                normalized[key] = { ...normalized[key], ...formatAsana(userRow), isCustom: true };
            }
        });
    }

    // 3. Process Stages
    let allStages = (stagesData || []).concat(userStagesData || []);
    allStages.forEach(stage => {
        let parentIdStr = stage.asana_id ?? (Array.isArray(stage.parent_id) ? stage.parent_id[0] : stage.parent_id) ?? null;
        if (!parentIdStr) return;
        const parentKey = String(parentIdStr).match(/^(\d+)/)[1].replace(/^0+/, '').padStart(3, '0');
        
        if (normalized[parentKey]) {
            const stageKey = String(stage.stage_name || stage.Stage_Name || '').trim();
            normalized[parentKey].variations[stageKey] = {
                id: stage.id || '',
                title: stage.title || stage.Title || `Stage ${stageKey}`,
                hold: stage.hold || stage.Hold || '',
                hold_data: parseHoldTimes(stage.hold || stage.Hold || ''),
                isCustom: !!stage.user_id
            };
        }
    });

    return normalized;
}

function formatAsana(row) {
    const hold = String(row.Hold ?? row.hold ?? '');
    return {
        name: row.name || '',
        english: row.english_name || row.english || '',
        category: row.category || '',
        hold,
        hold_json: row.hold_json || parseHoldTimes(hold),
        variations: {},
        isCustom: false
    };
}
