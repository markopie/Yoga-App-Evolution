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
    // CASE B: Shorthand Command (LOY: or MEHTA:)
    else if (parts.length === 1) {
        const upper = parts[0].toUpperCase();
        if (upper.startsWith('LOY:') || upper.startsWith('MEHTA:')) {
            idsStr = parts[0];
        } else {
            return null;
        }
    }
    else {
        return null;
    }

    const upperIds = idsStr.toUpperCase();
    const isLOYBatch = upperIds.startsWith('LOY:');
    const isMehtaBatch = upperIds.startsWith('MEHTA:');
    
    // Strip prefix if present (LOY: is 4 chars, MEHTA: is 6 chars)
    const cleanIdsStr = isLOYBatch ? idsStr.substring(4).trim() : 
                       (isMehtaBatch ? idsStr.substring(6).trim() : idsStr);

    const expandedTokens = cleanIdsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        const r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) r.push(String(i));
        return r.join(',');
    });

    const tokens = expandedTokens.split(',').map(s => s.trim()).filter(s => s.length > 0 && s !== '0');

    const resolveToken = async (token) => {
        if (isLOYBatch) {
            const cleanId = token.padStart(3, '0');
            const asana = asanaLibraryMap?.[cleanId];
            if (asana) return { id: cleanId, asana, variation: '', stageKey: '', name: asana.english || asana.name || cleanId };
            return null;
        }

        // Mehta / Page Number Lookup (page_primary)
        const pageNum = parseFloat(token);
        if (!isNaN(pageNum)) {
            const baseMatches = libraryArray.filter(a => parseFloat(a.page_primary) === pageNum);
            if (baseMatches.length >= 1) {
                const m = baseMatches[0];
                return { id: m.id, asana: m, variation: '', stageKey: '', name: m.english || m.name || m.id, _pageNum: pageNum };
            }
        }
        return null;
    };

    const resolvedItems = await Promise.all(tokens.map(resolveToken));
    const validItems = resolvedItems.filter(Boolean);

    return { title, category, validItems };
}