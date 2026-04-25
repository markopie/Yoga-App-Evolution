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
        // GEM Plate Lookup: find asanas where gem_plate contains the token
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