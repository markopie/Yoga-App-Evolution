import { normalizePlate } from "../services/dataAdapter.js";

export function parsePlateTokens(raw) {
   const s = String(raw || "").trim();
   if (!s) return [];
   return s.split(/[\s,]+/).map(x => normalizePlate(x)).filter(Boolean);
}

export function plateFromFilename(name) {
   const m = name.match(/_Plate([0-9]+(?:\.[0-9]+)?)\./i);
   if (!m) return null;
   return normalizePlate(m[1]);
}

export function primaryAsanaFromFilename(name) {
   const m = name.match(/^([a-zA-Z0-9]+)_/);
   return m ? m[1] : null;
}

export function filenameFromUrl(url) {
   return url.split("/").pop();
}

export function mobileVariantUrl(mainUrl) {
   return mainUrl;
}

export function ensureArray(x) {
   return Array.isArray(x) ? x : [x];
}

export function isBrowseMobile() {
   return window.matchMedia("(max-width: 900px)").matches;
}

export function smartUrlsForPoseId(idField, variationKey = null) {
    if (!idField) return [];
    let id = Array.isArray(idField) ? idField[0] : idField;
    
    // Normalize
    if (typeof normalizePlate === 'function') id = normalizePlate(id);

    // 1. Check Database Image URL first (if available in window.asanaLibrary)
    if (window.asanaLibrary && window.asanaLibrary[id]) {
        const asana = window.asanaLibrary[id];
        
        // A. Check for specific variation image
        if (variationKey && asana.variations && asana.variations[variationKey]) {
            const varData = asana.variations[variationKey];
            if (varData && varData.image_url) {
                return [varData.image_url];
            }
        }
        
        // B. Check for main asana image
        if (asana.image_url) {
            return [asana.image_url];
        }
    }

    // 2. Fallback to Legacy Index (manifest.json)
    if (window.asanaToUrls && window.asanaToUrls[id]) {
        return window.asanaToUrls[id];
    }
    
    return [];
}
