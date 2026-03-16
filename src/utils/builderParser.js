// src/utils/builderParser.js
import { supabase } from "../services/supabaseClient.js";

/**
 * Parses a semicolon-delimited command string, fetching necessary Asanas from the library or network.
 * Format: Title ; Category ; 1, 2, 44-46, 50.1
 * Returns an object containing the extracted title, category, and resolved valid items.
 */
export async function parseSemicolonCommand(commandString, libraryArray, asanaLibraryMap) {
    const parts = commandString.split(';').map(p => p.trim());
    if (parts.length < 3) return null;

    const [title, category, idsStr] = parts;

    // Expand integer ranges (51-55) then split by comma
    const expandedTokens = idsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        const r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) r.push(String(i));
        return r.join(',');
    });

    const tokens = expandedTokens.split(',').map(s => s.trim()).filter(s => s.length > 0 && s !== '0');

    const resolveToken = async (token) => {
        const pageNum = parseFloat(token);
        const isPageNum = !isNaN(pageNum) && /^\d+(\.\d+)?$/.test(token.trim());

        if (isPageNum) {
            const baseMatches = libraryArray.filter(a => parseFloat(a.page_primary) === pageNum);

            if (baseMatches.length === 1) {
                const m = baseMatches[0];
                return { id: m.id, asana: m, variation: '', stageKey: '', name: m.english || m.name || m.id, _pageNum: pageNum };
            }
            if (baseMatches.length > 1) {
                const primary = baseMatches[0];
                return {
                    id: primary.id, asana: primary, variation: '', stageKey: '', name: primary.english || primary.name || primary.id, _pageNum: pageNum, _ambiguous: true,
                    _alternatives: baseMatches.slice(1).map(a => ({ id: a.id, name: a.english || a.name || a.id, asana: a }))
                };
            }

            for (const a of libraryArray) {
                if (!a.variations) continue;
                for (const [stageKey, vData] of Object.entries(a.variations)) {
                    if (vData && parseFloat(vData.page_primary) === pageNum) {
                        return { id: a.id, asana: a, variation: stageKey, stageKey, name: `${a.english || a.name} › ${vData.title || stageKey}`, _pageNum: pageNum };
                    }
                }
            }

            try {
                const { data: aHits } = await supabase.from('asanas').select('id, english_name, name').eq('page_primary', pageNum);

                if (aHits && aHits.length === 1) {
                    const row = aHits[0];
                    const asanaKey = String(row.id).padStart(3, '0');
                    const asana = asanaLibraryMap?.[asanaKey];
                    return { id: asanaKey, asana: asana || { id: asanaKey }, variation: '', stageKey: '', name: row.english_name || row.name || asanaKey, _pageNum: pageNum };
                }

                if (aHits && aHits.length > 1) {
                    const primary = aHits[0];
                    const asanaKey = String(primary.id).padStart(3, '0');
                    const asana = asanaLibraryMap?.[asanaKey];
                    return {
                        id: asanaKey, asana: asana || { id: asanaKey }, variation: '', stageKey: '', name: primary.english_name || primary.name || asanaKey, _pageNum: pageNum, _ambiguous: true,
                        _alternatives: aHits.slice(1).map(r => {
                            const k = String(r.id).padStart(3, '0');
                            return { id: k, name: r.english_name || r.name || k, asana: asanaLibraryMap?.[k] || { id: k } };
                        })
                    };
                }

                const { data: sHits } = await supabase.from('stages').select('asana_id, stage_name, title').eq('page_primary', pageNum).limit(1);
                if (sHits && sHits.length > 0) {
                    const row = sHits[0];
                    const asanaKey = String(row.asana_id).padStart(3, '0');
                    const asana = asanaLibraryMap?.[asanaKey];
                    return { id: asanaKey, asana: asana || { id: asanaKey }, variation: row.stage_name || '', stageKey: row.stage_name || '', name: `${asana?.english || asanaKey} › ${row.title || row.stage_name || ''}`, _pageNum: pageNum };
                }
            } catch (netErr) {
                console.warn(`⚠️ page_primary network lookup failed for ${pageNum}:`, netErr.message);
            }

            console.warn(`⚠️ No asana or stage found for page_primary = ${pageNum}`);
            return null;
        }

        const cleanId = token.padStart(3, '0');
        const asana = asanaLibraryMap?.[cleanId];
        if (asana) return { id: cleanId, asana, variation: '', stageKey: '', name: asana.english || asana.name || cleanId };
        return null;
    };

    const resolvedItems = await Promise.all(tokens.map(resolveToken));
    const validItems = resolvedItems.filter(Boolean);

    return { title, category, validItems };
}