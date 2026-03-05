import { supabase } from './supabaseClient.js';
import { parseSequenceText, parseHoldTimes } from '../utils/parsing.js';

/**
 * Fetches and formats all system courses from the database.
 * Returns an array of clean course objects ready for the UI.
 */
export async function getSystemCourses() {
    const { data: coursesData } = await supabase.from('courses').select('*');
    const formattedCourses = [];
    
    if (coursesData) {
        coursesData.forEach(row => {
            const poses = parseSequenceText(row.sequence_text || '');
            if (row.title && poses.length > 0) {
                formattedCourses.push({ 
                    title: row.title.trim(), 
                    category: (row.category || '').trim(), 
                    poses, 
                    isUserSequence: false, 
                    id: String(row.id)
                });
            }
        });
    }
    return formattedCourses;
}

/**
 * Fetches and formats the global asana library from the database.
 * Returns a normalized dictionary keyed by 3-digit IDs.
 */
export async function getGlobalAsanas() {
    const { data: asanasData } = await supabase.from('asanas').select('*');
    const normalized = {};

    if (asanasData) {
        asanasData.forEach((row) => {
            const rawId = row.ID ?? row.id ?? '';
            const paddedId = String(rawId).trim().replace(/^0+/, '') || '';
            if (!paddedId) return;
            const key = paddedId.padStart(3, '0');

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
                hold: rawHoldText,
                Hold: rawHoldText,
                hold_json: holdData, 
                hold_data: holdData, 
                variations: {},
                isCustom: false
            };
        });
    }
    return normalized;
}
