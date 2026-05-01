// src/utils/builderParser.js
import { supabase } from "../services/supabaseClient.js";

/**
 * Parses a semicolon-delimited command string, fetching necessary Asanas from the library or network.
 * Format: Title ; Category ; 1, 2, 44-46, 50.1
 * Returns an object containing the extracted title, category, and resolved valid items.
 */
export async function parseSemicolonCommand(commandString, libraryArray, asanaLibraryMap) {
    const parts = commandString.split(';').map(p => p.trim());
    
    let title = null;
    let category = null;
    let idsStr = "";

    // CASE A: Full Command (Title; Category; IDs)
    if (parts.length >= 3) {
        [title, category, idsStr] = parts;
    } 
    // CASE B: Shorthand Command (GEM:)
    else if (parts.length === 1) {
        const upper = parts[0].toUpperCase();
        if (upper.startsWith('GEM:')) {
            idsStr = parts[0];
        } else if (/^\d[\d,\s\-]*$/.test(parts[0]) && (parts[0].includes(',') || parts[0].includes('-'))) {
            // CASE C: Plain LOY IDs with commas (e.g. "1,3,4,5,6,7,8"), ranges (e.g. "3-36"), or mixed (e.g. "1-5,7,9-12")
            idsStr = parts[0];
        } else {
            return null;
        }
    }
    else {
        return null;
    }

    const upperIds = idsStr.toUpperCase();
    const isGEMBatch = upperIds.startsWith('GEM:');
    
    // Strip prefix if present (GEM: is 4 chars)
    const cleanIdsStr = isGEMBatch ? idsStr.substring(4).trim() : idsStr;

    const expandedTokens = cleanIdsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        const r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) r.push(String(i));
        return r.join(',');
    });

    const tokens = expandedTokens.split(',').map(s => s.trim()).filter(s => s.length > 0 && s !== '0');

    const resolveToken = async (token) => {
        // LOY ID Lookup (Primary): match against the asana's own id field
        // This is the standard Light on Yoga ID, e.g. "001", "002"
        const loyMatch = libraryArray.find(a => {
            const aId = String(a.id || '').padStart(3, '0');
            const t = token.padStart(3, '0');
            return aId === t;
        });

        if (loyMatch) {
            return { id: loyMatch.id, asana: loyMatch, variation: '', stageKey: '', name: loyMatch.english || loyMatch.name || loyMatch.id };
        }

        // GEM Plate Lookup (Fallback): find asanas where gem_plate contains the token
        // gem_plate is a comma-separated list of numbers, e.g. "113,114"
        const matches = libraryArray.filter(a => {
            const gemPlate = a.gem_plate || '';
            if (!gemPlate) return false;
            const gemIds = gemPlate.split(',').map(s => s.trim()).filter(Boolean);
            return gemIds.some(g => g === token);
        });
        
        if (matches.length >= 1) {
            // Return the first match (deduplication: if multiple GEM IDs map to same asana, only add once)
            const m = matches[0];
            return { id: m.id, asana: m, variation: '', stageKey: '', name: m.english || m.name || m.id };
        }
        return null;
    };

    const resolvedItems = await Promise.all(tokens.map(resolveToken));
    const validItems = resolvedItems.filter(Boolean);

    return { title, category, validItems };
}