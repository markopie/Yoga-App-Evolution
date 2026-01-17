import { CONFIG } from './config.js';
import { loadJSON, normalizePlate } from './utils.js';

// -------- Module State (Private) --------
let plateToUrls = {};          // "176" -> ["images/..webp", ...]
let plateToPrimaryAsana = {};  // "176" -> "074" (string) or null
let asanaToUrls = {};          // "074" -> [urls...]
let plateGroups = {};          // "18" -> ["18","19"] (loaded from plate_groups.json)


// -------- Helper Functions (Private) --------

function ensureArray(x){
  return Array.isArray(x) ? x : [x];
}

function mobileVariantUrl(mainUrl){
  const u = String(mainUrl || "");
  if (u.includes("/main/")) return u.replace("/main/","/w800/");
  if (u.startsWith(CONFIG.IMAGES_MAIN_BASE)) return CONFIG.IMAGES_MOBILE_BASE + u.slice(CONFIG.IMAGES_MAIN_BASE.length);
  if (u.startsWith(CONFIG.IMAGES_BASE)) return CONFIG.IMAGES_MOBILE_BASE + u.slice(CONFIG.IMAGES_BASE.length);
  return u;
}

function filenameFromUrl(url){
  return url.split("/").pop();
}

function plateFromFilename(name){
  const m = name.match(/_Plate([0-9]+(?:\.[0-9]+)?)\./i);
  if (!m) return null;
  return normalizePlate(m[1]);
}

function primaryAsanaFromFilename(name){
  const m = name.match(/^(\d{1,5})_/);
  return m ? m[1] : null;
}

function normalizeImagePath(p){
  if (!p) return null;
  const s = String(p).replace(/\\/g,"/").replace(/^\.?\//,"");
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith(CONFIG.IMAGES_BASE)) return s;
  return CONFIG.IMAGES_BASE + s;
}

function urlsForExplicitPlates(plates){
  const out = [];
  const seen = new Set();
  ensureArray(plates).forEach(p => {
    const key = normalizePlate(p);
    (plateToUrls[key] || []).forEach(u => {
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    });
  });
  return out;
}

// -------- Manifest Parsing --------

function manifestItemToPath(item){
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return null;
  return item.main || item.path || item.file || item.name || item.relpath || item.relative_path || null;
}

function manifestToFileList(manifest){
  if (Array.isArray(manifest)) return manifest;
  if (!manifest || typeof manifest !== "object") return [];

  const looksLikePlateMap = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    const digitKeys = keys.filter(k => /^\d+$/.test(String(k))).length;
    return digitKeys >= Math.max(1, Math.floor(keys.length * 0.7));
  };

  if (manifest.images && looksLikePlateMap(manifest.images)){
    return Object.entries(manifest.images).map(([plate, meta]) => {
      if (meta && typeof meta === "object" && !Array.isArray(meta)) return { plate, ...meta };
      return { plate, main: meta };
    });
  }

  if (looksLikePlateMap(manifest)){
    return Object.entries(manifest).map(([plate, meta]) => {
      if (meta && typeof meta === "object" && !Array.isArray(meta)) return { plate, ...meta };
      return { plate, main: meta };
    });
  }

  const candidates = [
    manifest.files, manifest.images, manifest.items, manifest.main,
    manifest.paths, manifest.list,
    manifest.variants && manifest.variants.main,
    manifest.variants && manifest.variants.files
  ];

  for (const c of candidates){
    if (c && Array.isArray(c)) return c;
  }
  return [];
}


// -------- Public / Exported Functions --------

export async function loadPlateGroups() {
  try {
    plateGroups = await loadJSON(CONFIG.PLATE_GROUPS_URL);
  } catch (e) {
    plateGroups = {};
  }
}

export async function buildImageIndexes(){
  const manifest = await loadJSON(CONFIG.MANIFEST_URL);
  const items = manifestToFileList(manifest);

  plateToUrls = {};
  plateToPrimaryAsana = {};
  asanaToUrls = {};

  items.forEach(item => {
    const rel = manifestItemToPath(item);
    if (!rel) return;

    const lower = String(rel).toLowerCase();
    if (!(lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp"))) return;

    const plateFromName = plateFromFilename(rel);
    const plateFromItem = (item && typeof item==="object" && item.plate) ? normalizePlate(item.plate) : null;
    
    const plate = plateFromName || plateFromItem;
    const primaryAsana = primaryAsanaFromFilename(rel);
    const url = normalizeImagePath(rel);

    if (plate){
      if (!plateToUrls[plate]) plateToUrls[plate] = [];
      plateToUrls[plate].push(url);

      if (primaryAsana){
        if (!(plate in plateToPrimaryAsana)) plateToPrimaryAsana[plate] = primaryAsana;
        else if (plateToPrimaryAsana[plate] !== primaryAsana) plateToPrimaryAsana[plate] = null;
      }
    }

    if (primaryAsana){
      if (!asanaToUrls[primaryAsana]) asanaToUrls[primaryAsana] = [];
      asanaToUrls[primaryAsana].push(url);
    }
  });

  Object.keys(plateToUrls).forEach(k => plateToUrls[k].sort());
  Object.keys(asanaToUrls).forEach(k => asanaToUrls[k].sort());
}

export function smartUrlsForPoseId(idField){
  if (Array.isArray(idField)) {
    if (idField.length > 1) return urlsForExplicitPlates(idField);
    idField = idField[0];
  }

  const plate = normalizePlate(idField);

  if (plateGroups && plateGroups[plate] && Array.isArray(plateGroups[plate]) && plateGroups[plate].length){
    return urlsForExplicitPlates(plateGroups[plate]);
  }

  const primary = plateToPrimaryAsana[plate] || null;
  if (primary && asanaToUrls[primary] && asanaToUrls[primary].length) {
    return asanaToUrls[primary];
  }

  return (plateToUrls[plate] || []);
}

export function renderCollage(urls){
  const wrap = document.createElement("div");
  wrap.className = "collage";
  
  if (!urls || !urls.length) return wrap;

  urls.forEach(u => {
    const mob = mobileVariantUrl(u); 
    const tile = document.createElement("div");
    tile.className = "tile";

    // Responsive: serve w800 on mobile, main on desktop
    // Fixed: Added backticks for template literal
    tile.innerHTML = `
      <picture>
        <source media="(max-width: 768px)" srcset="${mob}">
        <img src="${u}" alt="">
      </picture>
    `; 
    wrap.appendChild(tile);
  });
  return wrap;
}

export function categoryFromAnyUrl(urls){
  if (!urls || !urls.length) return "";
  const u = String(urls[0]);
  const m = u.match(/\/(main|w800)\/([^\/]+)\//);
  return m ? m[2] : "";
}