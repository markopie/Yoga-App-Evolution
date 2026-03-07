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
