// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & CONSTANTS
   ========================================================================== */

import {
    COURSES_URL,
    MANIFEST_URL,
    ASANA_LIBRARY_URL,
    LIBRARY_URL,
    DESCRIPTIONS_OVERRIDE_URL,
    CATEGORY_OVERRIDE_URL,
    IMAGE_OVERRIDE_URL,
    AUDIO_OVERRIDE_URL,
    ID_ALIASES_URL,
    IMAGES_BASE,
    AUDIO_BASE,
    IMAGES_BASE_URL,
    COMPLETION_LOG_URL,
    LOCAL_SEQ_KEY,
} from "./src/config/appConfig.js";
import { supabase } from "./src/services/supabaseClient.js";
import { getFullCourseList, getFullAsanaLibrary } from "./src/services/dataAdapter.js";
import { loadJSON } from "./src/services/http.js";
import { $, normaliseText, safeListen } from "./src/utils/dom.js";
import { parseHoldTimes, buildHoldString, parseSequenceText } from "./src/utils/parsing.js";


window.db = supabase;
window.currentUserId = null;

/* ==========================================================================
   GLOBAL STATE VARIABLES
   ========================================================================== */

// Data storage
let courses = [];
window.courses = courses; // 👈 Add this line
let sequences = [];  // For backwards compatibility during transition
let asanaLibrary = {};  // JSON object keyed by ID (e.g. "003" -> pose data)
window.asanaLibrary = asanaLibrary; // 👈 Add this line
let plateGroups = {};   // "18" -> ["18","19"] (optional)

// Admin Overrides
let audioOverrides = {}; 
let serverAudioFiles = []; // Holds the list of files on server
let serverImageFiles = [];
let idAliases = {};

// Playback State
let activePlaybackList = []; // This will hold the "unpacked" poses (Macros + Reps)
window.activePlaybackList = activePlaybackList; // 👈 Add this line
let currentSequence = null;
let currentIndex = 0;
let currentAudio = null; // Tracks the currently playing sound
let timer = null;
let remaining = 0;
let running = false;
let currentSide = "right"; // Track which side for requiresSides poses
let needsSecondSide = false; // Track if we need to play left side after right

// Image Mapping State
let asanaToUrls = {};          // Strict ID Map: "218" -> ["images/218_dhyana.jpg"]

// -------- Wake Lock (prevent screen sleep while running, if supported) --------
let wakeLock = null;
let wakeLockVisibilityHooked = false;

let draft = []; // each: [idField, seconds, label]

let descriptionOverrides = {}; // { [asanaNo]: { md: string, updated_at: string } }
let categoryOverrides = {}; // { [asanaNo]: { category: string, updated_at: string } }


// #endregion
// #region 2. SYSTEM & AUDIO
/* ==========================================================================
   DOM & SYSTEM UTILITIES
   ========================================================================== */
// -------- Wake Lock (Prevent screen sleep) --------
async function enableWakeLock(){
   try {
      if (!("wakeLock" in navigator)) return;
      if (wakeLock) return;

      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
         wakeLock = null;
      });

      // Hook once: if user switches away and returns, re-request lock.
      if (!wakeLockVisibilityHooked) {
         wakeLockVisibilityHooked = true;
         document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && running) enableWakeLock();
         });
      }
   } catch (e) {
      wakeLock = null;
   }
}

async function disableWakeLock() {
   try {
      if (wakeLock) await wakeLock.release();
   } catch (e) {}
   wakeLock = null;
}

/* ==========================================================================
   AUDIO ENGINE
   ========================================================================== */

// -------- Faint gong (Oscillator) --------
let currentPoseSeconds = 0; // Used by timer to decide if gong plays
let audioCtx = null;

function playFaintGong() {
   try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      const t0 = audioCtx.currentTime + 0.02;

      // Create Sound Generators
      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      // Configure Tones (432Hz + 864Hz harmonic)
      o1.type = "sine";
      o2.type = "sine";
      o1.frequency.setValueAtTime(432, t0);
      o2.frequency.setValueAtTime(864, t0);

      // Configure Volume Envelope (Fade in/out)
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

      // Connect & Play
      o1.connect(g);
      o2.connect(g);
      g.connect(audioCtx.destination);

      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + 2.0);
      o2.stop(t0 + 2.0);
   } catch (e) {}
}

// -------- Side Detection Logic --------
function detectSide(poseLabel) {
   if (!poseLabel) return null;
   const label = poseLabel.toLowerCase();
   if (label.includes("(right)") || label.includes("right side")) return "right";
   if (label.includes("(left)") || label.includes("left side")) return "left";
   return null;
}

function playSideCue(side) {
   if (!side) return;
   const ctx = new (window.AudioContext || window.webkitAudioContext)();
   const oscillator = ctx.createOscillator();
   const gainNode = ctx.createGain();

   oscillator.connect(gainNode);
   gainNode.connect(ctx.destination);

   // Different frequencies for left and right
   oscillator.frequency.value = side === "right" ? 800 : 600;
   oscillator.type = "sine";

   gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
   gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

   oscillator.start(ctx.currentTime);
   oscillator.stop(ctx.currentTime + 0.3);
}

/* ==========================================================================
   AUDIO ENGINE
   ========================================================================== */

// ... (Keep detectSide and playSideCue helper functions as they are) ...

// -------- Audio File Player (MP3) --------

/**
 * Orchestrates the audio playback sequence.
 * New Logic: Plays Main Name -> THEN plays Side Cue (if needed).
 * @param {boolean} isBrowseContext - If true, skips side cues (for Browse menu).
 */
function playAsanaAudio(asana, poseLabel = null, isBrowseContext = false) {
    if (!asana) return;
 
    // 1. Reset current audio
    if (currentAudio) {
       try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
       currentAudio = null;
    }
 
    // 2. Define what happens AFTER the main name finishes
    const onMainAudioEnded = () => {
        // If we are browsing, or if sides aren't required, stop here.
        if (isBrowseContext) return;
        
        // Play side audio (Right/Left) AFTER main audio
        if (asana.requiresSides && currentSide) {
           // Use AUDIO_BASE to ensure we fetch from the server
           const sideUrl = AUDIO_BASE + `${currentSide}_side.mp3`; 
           const sideAudio = new Audio(sideUrl);
           
           sideAudio.play().catch(e => console.warn(`Failed to play ${currentSide}_side.mp3:`, e));
           
           // Track this as current so we can pause it if the user clicks "Stop"
           currentAudio = sideAudio; 
        }
    };
 
    // 3. Play Main Audio immediately, then trigger the callback
    playPoseMainAudio(asana, poseLabel, onMainAudioEnded);
 }
 
 function playPoseMainAudio(asana, poseLabel = null, onComplete = null) {
    // 1. Side Detection (Visual/Sound Effect only)
    if (poseLabel && !asana.requiresSides) {
       const side = detectSide(poseLabel);
       if (side) setTimeout(() => playSideCue(side), 100);
    }
 
    // 2. Prepare IDs (THE FIX)
    // Your library has 'id', but the player was looking for 'asanaNo'.
    // We now check both.
    const rawID = asana.asanaNo || asana.id; 
    const idStr = normalizePlate(rawID);
    
// console.log(`[Audio Debug] Playing ID: ${idStr}, Name: ${asana.english || asana.name}`);


window.playAsanaAudio = function(idStr, onComplete) {
    const playSrc = (src) => {
        const a = new Audio();
        if (onComplete) {
            a.onended = onComplete;
        }
        a.play()
            .then(() => { currentAudio = a; })
            .catch(e => {
                if (onComplete) onComplete();
            });
    };

    // 1. Path Setup
    let overrideSrc = null; // Overrides purged

    if (overrideSrc) {
        const src = overrideSrc.includes("/") ? overrideSrc : (AUDIO_BASE + overrideSrc);
        playSrc(src);
        return; 
    }
 
    // 2. SMART FALLBACK (Manifest Lookup)
    const fileList = window.serverAudioFiles || [];
    
    if (fileList.length > 0 && idStr) {
        const match = fileList.find(f => f.startsWith(`${idStr}_`) || f === `${idStr}.mp3`);
        if (match) {
            playSrc(AUDIO_BASE + match);
            return;
        }
    }

    // 3. Final Fallback
    if (onComplete) onComplete();
};
    if (!idStr) { 
        if (onComplete) onComplete(); 
        return; 
    } 

    const safeName = (asana.english || asana.name || "").replace(/[^a-zA-Z0-9]/g, "");
    // Try generic formats
    const candidate = `${AUDIO_BASE}${idStr}_${safeName}.mp3`;
    
    const a = new Audio(candidate);
    if (onComplete) a.onended = onComplete;
    a.play().catch(() => {
// console.warn("Legacy guess failed too.");
        if (onComplete) onComplete();
    });
}

// #endregion
// #region 3. HELPERS & FORMATTING
/* ==========================================================================
   STRING & DATA FORMATTERS
   ========================================================================== */
/**
 * Converts the Asana Library object into an array for the Browse section.
 * REQUIRED for applyBrowseFilters and renderBrowseList.
 */
function getAsanaIndex() {
    // Safety check if library isn't loaded yet
    if (!asanaLibrary) return [];
    
    return Object.keys(asanaLibrary).map(id => {
        // Use the normalizeAsana helper we added earlier
        return normalizeAsana(id, asanaLibrary[id]);
    }).filter(Boolean); // Remove any nulls
}

   /**
 * CRITICAL HELPER: Normalizes raw JSON data into a standard format the app expects.
 * Missing this function causes "Uncaught ReferenceError: normalizeAsana is not defined"
 */
function normalizeAsana(id, asana) {
    if (!asana) return null;
    return {
       ...asana,
       asanaNo: id,
       english: asana.english || asana.name || "",
       'Yogasana Name': asana.english || asana.name || "",
       variation: "", // Variations are now in variations object
       inlineVariations: asana.variations ? Object.keys(asana.variations).map(key => ({
          label: key,
          text: asana.variations[key]
       })) : [],
       allPlates: [id] // For search compatibility
    };
 }
// IAST display preference — stored in localStorage
const IAST_PREF_KEY = "yoga_prefer_iast";

function prefersIAST() {
   return localStorage.getItem(IAST_PREF_KEY) !== "false";
}

function setIASTPref(val) {
   localStorage.setItem(IAST_PREF_KEY, val ? "true" : "false");
}

function displayName(asana) {
   if (!asana) return "";
   if (prefersIAST() && asana.iast) return asana.iast;
   return asana.english || asana.name || asana.iast || "";
}

function escapeHtml2(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  } [c]));
}

function renderMarkdownMinimal(md) {
   const raw = String(md || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
   if (!raw) return "";
   
   const lines = raw.split("\n");
   let out = "";
   let inOl = false;
   let inUl = false;

   const closeLists = () => {
      if (inOl) { out += "</ol>"; inOl = false; }
      if (inUl) { out += "</ul>"; inUl = false; }
   };

   const peekNextNonEmpty = (fromIdx) => {
      for (let k = fromIdx; k < lines.length; k++) {
         const t = (lines[k] || "").trim();
         if (t) return t;
      }
      return "";
   };

   for (let i = 0; i < lines.length; i++) {
      const trimmed = (lines[i] || "").trim();

      if (!trimmed) {
         const next = peekNextNonEmpty(i + 1);
         const nextOl = next.match(/^(\d+)[\.)]\s+/);
         const nextUl = next.match(/^[-*]\s+/);
         
         if ((inOl && nextOl) || (inUl && nextUl)) continue;
         
         closeLists();
         out += "<div style='display:block; height:15px; width:100%;'></div>";
         continue;
      }

      const ol = trimmed.match(/^(\d+)[\.)]\s+(.*)$/);
      const ul = trimmed.match(/^[-*]\s+(.*)$/);

      if (ol) {
         if (inUl) { out += "</ul>"; inUl = false; }
         if (!inOl) { out += "<ol style='margin-bottom:10px; padding-left:25px;'>"; inOl = true; }
         out += "<li style='margin-bottom:8px;'>" + escapeHtml2(ol[2]) + "</li>";
         continue;
      }

      if (ul) {
         if (inOl) { out += "</ol>"; inOl = false; }
         if (!inUl) { out += "<ul style='margin-bottom:10px; padding-left:25px;'>"; inUl = true; }
         out += "<li style='margin-bottom:8px;'>" + escapeHtml2(ul[1]) + "</li>";
         continue;
      }

      closeLists();
      out += `<p style="margin: 0 0 12px 0; line-height: 1.6; display: block;">${escapeHtml2(trimmed)}</p>`;
   }
   closeLists();
   return out;
}
/**
 * UI Helper: Bridges the old function name to the new smart logic.
 * Required for 'renderPlateSection' to work.
 */
function urlsForPlateToken(p) {
    return smartUrlsForPoseId(p);
}
function formatHMS(totalSeconds) {
   const s = Math.max(0, Math.floor(totalSeconds || 0));
   const h = Math.floor(s / 3600);
   const m = Math.floor((s % 3600) / 60);
   const r = s % 60;
   if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
   return `${m}:${String(r).padStart(2,"0")}`;
}

function formatTechniqueText(text) {
    // SAFETY CHECK: If text is null, undefined, or an object, return empty string
    if (!text || typeof text !== 'string') return "";
    
    let clean = text.replace(/^"|"$/g, '').trim();
    return clean.replace(/\.(\s+|$)/g, '.\n\n');
 }

/* ==========================================================================
   ID & PLATE NORMALIZATION
   ========================================================================== */

function normalizePlate(p) {
   const s = String(p ?? "").trim();
   if (!s) return "";
   
   // If pure number (e.g. "1"), pad to "001"
   if (/^\d+$/.test(s)) {
       return s.padStart(3, '0');
   }
   return s; 
}

function parsePlateTokens(raw) {
   const s = String(raw || "").trim();
   if (!s) return [];
   return s.split(/[\s,]+/).map(x => normalizePlate(x)).filter(Boolean);
}

function plateFromFilename(name) {
   const m = name.match(/_Plate([0-9]+(?:\.[0-9]+)?)\./i);
   if (!m) return null;
   return normalizePlate(m[1]);
}

function primaryAsanaFromFilename(name) {
   const m = name.match(/^([a-zA-Z0-9]+)_/);
   return m ? m[1] : null;
}

function filenameFromUrl(url) {
   return url.split("/").pop();
}

function mobileVariantUrl(mainUrl) {
   return mainUrl;
}

function ensureArray(x) {
   return Array.isArray(x) ? x : [x];
}

// UTILITIES
function isBrowseMobile() {
   return window.matchMedia("(max-width: 900px)").matches;
}

function resolveId(id) {
    const norm = normalizePlate(id);
    if (typeof idAliases !== 'undefined' && idAliases[norm]) {
        return normalizePlate(idAliases[norm]); 
    }
    return norm; 
}

// #endregion
// #region 4. DATA LOADING
/* ==========================================================================
   DATA LOADING & PARSING (FIXED)
   ========================================================================== */

window.loadCourses = async function() {
    if (!supabase) return;
    try {
        const deduplicated = await getFullCourseList(window.currentUserId);
        
        window.courses = deduplicated;
        courses = deduplicated;
        sequences = deduplicated;

        if (typeof renderSequenceDropdown === "function") renderSequenceDropdown(); 
    } catch (e) {
        console.error('Load courses failed:', e);
};

// 3. Local Sequence Editing (Save/Reset)
// 4. Load Asana Library
async function loadAsanaLibrary() {
    if (!supabase) {
        console.error("Supabase client not initialized");
        return {};
    try {
        const normalized = await getFullAsanaLibrary();
    } catch (err) {
        console.error('Error loading asana library:', err);
            };
        });


// console.log(`Asana Library Loaded: ${Object.keys(normalized).length} poses`);
        window.asanaLibrary = normalized;
        if (typeof asanaLibrary !== 'undefined') {
            asanaLibrary = normalized;

        // console.log(`Asana Library Loaded: ${Object.keys(normalized).length} poses`);
        return normalized;

        } catch (e) {
        console.error("Exception loading asana library:", e);
        return {};

/**
 * Standardizes a database row into a clean Asana object.
 * Prioritizes hold_json, fallbacks to parsing the 'hold' string.
 */
function normalizeAsanaRow(row, existingData = {}) {
    const rawHoldText = String(row.Hold ?? row.hold ?? '');
    
    // JSON-First Logic: Check if DB sent hold_json, otherwise parse text
    const holdData = (row.hold_json && typeof row.hold_json === 'object') 
        ? row.hold_json 
        : parseHoldTimes(rawHoldText);

    return {
        ...existingData, // Preserve existing fields if overwriting
        id: existingData.id || String(row.id || row.ID || '').trim().replace(/^0+/, '').padStart(3, '0'),
        name: row.name ?? row.Name ?? existingData.name,
        english: row.english_name ?? row.English ?? existingData.english,
        category: row.category ?? existingData.category,
        hold: rawHoldText,
        hold_json: holdData, // <--- YOUR NEW DURATION BRAIN
        standard_seconds: holdData.standard || 30, // Shortcut for the Slider
        isCustom: !!row.is_custom || false
    };
}


// Helper function to parse plates string like "Final: 1, 2" or "Intermediate: 3"
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

/* ==========================================================================
   IMAGE INDEXING
   ========================================================================== */

async function buildImageIndexes() {
    // Now calls loadJSON correctly with MANIFEST_URL
        
    // Reset global map
    window.asanaToUrls = {}; 

    if (manifest && Array.isArray(manifest.images)) {
        manifest.images.forEach(filename => {
            // Extract ID (e.g. "082" from "082_Pose.jpg")
            const parts = filename.split('_');
            const rawID = parts[0];
            
            // Normalize
            const cleanId = (typeof normalizePlate === 'function') ? normalizePlate(rawID) : rawID;
            
            // Build URL
            const url = `https://arrowroad.com.au/yoga/images/${filename}`;

            if (!window.asanaToUrls[cleanId]) window.asanaToUrls[cleanId] = [];
            window.asanaToUrls[cleanId].push(url);
        });
// console.log(`✓ Image Indexing complete: ${manifest.images.length} files`);
    } else {
// console.warn("Manifest images not found or invalid format");
    }
}

// Helper: Find URLs for a Pose
function smartUrlsForPoseId(idField) {
    if (!idField) return [];
    let id = Array.isArray(idField) ? idField[0] : idField;
    
    // Normalize
    if (typeof normalizePlate === 'function') id = normalizePlate(id);

    // 1. Check Overrides
    
    // 2. Check Index
    if (window.asanaToUrls && window.asanaToUrls[id]) {
        return window.asanaToUrls[id];
    }
    
    return [];
}

// Helper: Find Data
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

// History Loader (Clean version)
async function setupHistory() {
    try {
        // FIX: Only fetch history here. Use the history URL.
        // We use a timestamp to prevent caching old data.
            } catch (e) {
// console.warn("History not found (starting fresh)");
        window.completionHistory = {};
    }
}
 // #endregion
// #region 5. HISTORY & LOGGING
/* ==========================================================================
   LOCAL LOGGING & PERSISTENCE
   ========================================================================== */


   function getEffectiveTime(id, dur) {
    // 1. Unwrap the ID if it's hiding in an array (fixes Player math)
    let rawId = id;
    if (Array.isArray(rawId)) rawId = rawId[0];
    if (Array.isArray(rawId)) rawId = rawId[0]; // Double unwrap just in case
    
    const lib = window.asanaLibrary || {};
    
    // 2. The ID Fix: Compare them mathematically (so "003" safely matches "3")
    const searchId = Number(rawId);
    const asana = Object.values(lib).find(a => Number(a.id || a.asanaNo) === searchId);
    
    const duration = Number(dur) || 0;

    // 3. Double the time if the pose requires sides
    if (asana && (asana.requiresSides || asana.requires_sides)) {
        return duration * 2;
    }
    
    return duration;
}



window.getEffectiveTime = getEffectiveTime; // Make it global

const COMPLETION_KEY = "yogaCompletionLog_v2";

function safeGetLocalStorage(key, defaultValue = null) {
   try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      return JSON.parse(item);
   } catch (e) {
      console.error(`Corrupted localStorage for key: ${key}`, e);
      localStorage.removeItem(key);
      return defaultValue;
   }
}

function safeSetLocalStorage(key, value) {
   try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
   } catch (e) {
      console.error(`Failed to save to localStorage: ${key}`, e);
      return false;
   }
}

function loadCompletionLog() {
   return safeGetLocalStorage(COMPLETION_KEY, []);
}

function saveCompletionLog(log) {
   safeSetLocalStorage(COMPLETION_KEY, log);
}

function addCompletion(title, whenDate, category = null) {
   const log = loadCompletionLog();
   const localStr = whenDate.toLocaleString("en-AU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
   });
   log.push({ title, category, ts: whenDate.getTime(), local: localStr });
   saveCompletionLog(log);
}

function lastCompletionFor(title) {
   const log = loadCompletionLog().filter(x => x && x.title === title && typeof x.ts === "number");
   if (!log.length) return null;
   return log.sort((a, b) => b.ts - a.ts)[0];
}

function seedManualCompletionsOnce() {
   const log = loadCompletionLog();
   const have = new Set(log.filter(x => x?.title).map(x => x.title + "::" + x.ts));
   const seeds = [
      { title: "Course 1: Short Course, Day 1", d: new Date(2025, 11, 31, 10, 0, 0) },
      { title: "Course 1: Short Course, Day 2", d: new Date(2026, 0, 1, 9, 30, 0) },
      { title: "Course 1: Short Course, Day 3", d: new Date(2026, 0, 2, 10, 0, 0) }
   ];
   let changed = false;
   seeds.forEach(s => {
      const key = s.title + "::" + s.d.getTime();
      if (!have.has(key)) {
         log.push({
            title: s.title, ts: s.d.getTime(),
            local: s.d.toLocaleString("en-AU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
         });
         changed = true;
      }
   });
   if (changed) saveCompletionLog(log);
}

/* ==========================================================================
   SERVER SYNC (History) - Supabase `sequence_completions`
   Single source of truth: Supabase.

   Unified entry shape: { id?, title, category, ts (ms), local (string), iso (string) }
   window.completionHistory: { [title]: [isoString, ...] } — for legacy display code
   ========================================================================== */

let serverHistoryCache = null; // array of unified entries, newest first

// Build window.completionHistory (legacy format) from the unified cache
function _rebuildLegacyHistory(entries) {
   const hist = {};
   entries.forEach(e => {
      if (!e.title) return;
      if (!hist[e.title]) hist[e.title] = [];
      hist[e.title].push(e.iso || new Date(e.ts).toISOString());
   });
   window.completionHistory = hist;
}
async function fetchServerHistory() {
    try {
       if (!supabase) {
          serverHistoryCache = loadCompletionLog();
          _rebuildLegacyHistory(serverHistoryCache);
          return serverHistoryCache;
       }
 
       // FIX: Query the actual completions table, not the Asanas table!
       const { data, error } = await supabase
          .from('sequence_completions')
          .select('id, title, category, completed_at');
 
       if (error) throw error;
 
       serverHistoryCache = data.map(r => ({
          id: r.id,
          title: r.title,
          category: r.category || '',
          ts: new Date(r.completed_at).getTime(),
          local: new Date(r.completed_at).toLocaleString("en-AU", {
             year: "numeric", month: "2-digit", day: "2-digit",
             hour: "2-digit", minute: "2-digit"
          }),
          iso: r.completed_at
       }));
 
       _rebuildLegacyHistory(serverHistoryCache);
       return serverHistoryCache;
 
    } catch (e) {
       console.error("Failed to fetch server history:", e);
       serverHistoryCache = loadCompletionLog();
       _rebuildLegacyHistory(serverHistoryCache);
       return serverHistoryCache;
    }
 }

async function appendServerHistory(title, whenDate, category = null) {
   addCompletion(title, whenDate, category);

   if (!supabase) return false;

   try {
      const { error } = await supabase
         .from('sequence_completions')
         .insert([{ title, category, completed_at: whenDate.toISOString() }]);

      if (error) throw error;
      await fetchServerHistory();
      return true;
   } catch (e) {
      console.error("Failed to append to server history:", e);
      return false;
   }
}

async function deleteCompletionById(id) {
   if (!supabase || !id) return false;
   try {
      const { error } = await supabase
         .from('sequence_completions')
         .delete()
         .eq('id', id);
      if (error) throw error;
      await fetchServerHistory();
      return true;
   } catch (e) {
      console.error("Failed to delete completion:", e);
      return false;
   }
}

async function deleteAllCompletionsForTitle(title) {
   if (!supabase || !title) return false;
   try {
      const { error } = await supabase
         .from('sequence_completions')
         .delete()
         .eq('title', title);
      if (error) throw error;
      await fetchServerHistory();
      return true;
   } catch (e) {
      console.error("Failed to delete completions for title:", e);
      return false;
   }
}

// Calculate consecutive day streak from a sorted array of ISO date strings (newest first)
function calculateStreak(isoStrings) {
   if (!isoStrings || !isoStrings.length) return 0;
   const days = [...new Set(
      isoStrings.map(s => new Date(s).toLocaleDateString("en-AU"))
   )].map(d => {
      const [dd, mm, yyyy] = d.split('/');
      return new Date(yyyy, mm - 1, dd).getTime();
   }).sort((a, b) => b - a);

   const MS_PER_DAY = 86400000;
   const today = new Date(); today.setHours(0,0,0,0);
   const todayMs = today.getTime();
   const yesterdayMs = todayMs - MS_PER_DAY;

   if (days[0] !== todayMs && days[0] !== yesterdayMs) return 0;

   let streak = 1;
   for (let i = 1; i < days.length; i++) {
      if (days[i - 1] - days[i] === MS_PER_DAY) {
         streak++;
      } else {
         break;
      }
   }
   return streak;
}

async function toggleHistoryPanel() {
   const panel = $("historyPanel");
   if (!panel) return;
   const isOpen = panel.style.display !== "none";
   if (isOpen) { panel.style.display = "none"; return; }
   panel.style.display = "block";
   panel.textContent = "Loading…";
   const hist = await fetchServerHistory();
   if (!hist.length) { panel.textContent = "No completions recorded yet."; return; }
   const sorted = [...hist].sort((a, b) => b.ts - a.ts);
   panel.innerHTML = sorted.map(e =>
      `<div style="padding:10px;border-bottom:1px solid #f0f0f0;">
         <div style="font-weight:600;color:#1a1a1a;margin-bottom:4px;">${e.title}</div>
         <div style="font-size:0.85rem;color:#666;">${e.category || ''}</div>
         <div style="font-size:0.8rem;color:#999;margin-top:2px;">${e.local}</div>
       </div>`
   ).join("");
}

/* ==========================================================================
   RESUME STATE & PROGRESS
   ========================================================================== */

const RESUME_STATE_KEY = "yoga_resume_state_v2";

function saveCurrentProgress() {
    if (!currentSequence) return;
    const state = {
        sequenceIdx: $("sequenceSelect")?.value || "",
        poseIdx: currentIndex,
        sequenceTitle: currentSequence.title,
        timestamp: Date.now()
    };
    safeSetLocalStorage(RESUME_STATE_KEY, state);
}

function clearProgress() {
    try {
        localStorage.removeItem(RESUME_STATE_KEY);
    } catch (e) {
        console.error("Failed to clear progress", e);
    }
}

function showResumePrompt(state) {
    const banner = document.createElement("div");
    banner.style.cssText = `
        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
        background: #333; color: #fff; padding: 12px 20px; border-radius: 30px;
        z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        display: flex; gap: 15px; align-items: center; font-size: 14px;
    `;
    
    // Safety check if sequence still exists
    const seqName = (sequences && sequences[state.sequenceIdx]) ? sequences[state.sequenceIdx].title : "your previous session";
    
    banner.innerHTML = `
        <span>Resume <b>${seqName}</b> at pose ${state.poseIdx + 1}?</span>
        <button id="resumeYes" style="background:#4CAF50; color:white; border:none; padding:5px 12px; border-radius:15px; cursor:pointer;">Yes</button>
        <button id="resumeNo" style="background:transparent; color:#ccc; border:none; cursor:pointer;">✕</button>
    `;
    
    document.body.appendChild(banner);

    banner.querySelector("#resumeYes").onclick = () => {
        const sel = $("sequenceSelect");
        if (sel) {
            sel.value = state.sequenceIdx;
            sel.dispatchEvent(new Event('change'));
            
            // Increased delay to 500ms to allow DOM to render
            setTimeout(() => {
                // Double check that we actually switched sequences before setting pose
                if (currentSequence) {
                    setPose(state.poseIdx);
                }
                banner.remove();
            }, 500); 
        }
    };

    banner.querySelector("#resumeNo").onclick = () => {
        clearProgress();
        banner.remove();
    };
}
// #endregion
// #region 6. CORE PLAYER LOGIC
/* ==========================================================================
   APP INITIALIZATION (Controller)
   ========================================================================== */
   async function loadManifestAndPopulateLists() {
// console.log("Fetching manifest from:", MANIFEST_URL); // Debug 1
    
    if (!manifest) {
// console.warn("❌ Manifest failed to load (404 or Invalid JSON)");
        return;
    }

    // Debug 2: See exactly what keys exist. 
    // If you see "Images" (capital I) instead of "images", that's the bug.
// console.log("Raw Manifest Data:", manifest); 

    // Robust check for lowercase OR uppercase keys
    window.serverAudioFiles = manifest.audio || manifest.Audio || [];
    window.serverImageFiles = manifest.images || manifest.Images || [];

// console.log(`Manifest loaded: ${window.serverAudioFiles.length} audio, ${window.serverImageFiles.length} images`);
}
async function init() {
// console.log("init() has started executing!");
    window.appInitialized = true; // Prevents the fallback from running twice
    try {
        const statusEl = $("statusText");
        
        // 1. Core Config
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();

        // 2. Load Overrides + History in Parallel
        await Promise.all([
            typeof loadManifestAndPopulateLists === "function" ? loadManifestAndPopulateLists() : Promise.resolve(),
            typeof fetchAudioOverrides === "function" ? fetchAudioOverrides() : Promise.resolve(),
            typeof fetchImageOverrides === "function" ? fetchImageOverrides() : Promise.resolve(),
            typeof fetchDescriptionOverrides === "function" ? fetchDescriptionOverrides() : Promise.resolve(),
            typeof fetchCategoryOverrides === "function" ? fetchCategoryOverrides() : Promise.resolve(),
            typeof fetchIdAliases === "function" ? fetchIdAliases() : Promise.resolve(),
            fetchServerHistory()
        ]);

        // 3. Load Main Data (Sequential)
        if (statusEl) statusEl.textContent = "Loading library...";
        asanaLibrary = await loadAsanaLibrary();

        if (statusEl) statusEl.textContent = "Loading courses...";
        await loadCourses();

        if (statusEl) statusEl.textContent = "Processing images...";
        await buildImageIndexes();

        // 4. Apply Overrides
        if (typeof applyDescriptionOverrides === "function") applyDescriptionOverrides();
        if (typeof applyCategoryOverrides === "function") applyCategoryOverrides();
        
        if (typeof setupBrowseUI === "function") setupBrowseUI();

        // 5. Finalize
        if (statusEl) statusEl.textContent = "Ready";
        const loadText = $("loadingText");
        if (loadText) loadText.textContent = "Select a course";
        if (typeof updateDialUI === 'function') updateDialUI();

        // 6. Resume Check
        const state = safeGetLocalStorage(RESUME_STATE_KEY, null);
        if (state && state.timestamp) {
            const fourHours = 4 * 60 * 60 * 1000;
            if (Date.now() - state.timestamp < fourHours) {
                showResumePrompt(state);
            } else {
                clearProgress(); 
            }
        }
        
    } catch (e) {
        console.error("Init Error:", e);
        if ($("statusText")) $("statusText").textContent = "Error loading app data";
    }
}

function getExpandedPoses(sequence) {
    let expanded = [];
    if (!sequence || !sequence.poses) return [];

    const allCourses = window.courses || [];

    // 1. Unpack Macros
    sequence.poses.forEach((p, originalIdx) => {
        const idStr = String(p[0]);
        const durOrReps = Number(p[1]) || 1; 

        if (idStr.startsWith("MACRO:")) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const sub = allCourses.find(c => c.title === targetTitle);
            
            if (sub && sub.poses) {
                for (let i = 0; i < durOrReps; i++) {
                    sub.poses.forEach(sp => {
                        let cloned = [...sp];
                        cloned[5] = originalIdx; 
                        expanded.push(cloned);
                    });
                }
            }
        } else {
            let cloned = [...p];
            cloned[5] = originalIdx; 
            expanded.push(cloned);
        }
    });

    return expanded;
}
/* ==========================================================================
   TIMER ENGINE (Updated for Centered Focus Mode & Macro Engine)
   ========================================================================== */

   function startTimer() {
    if (!currentSequence) return;
    
    // Main screen toggle: If running, stop.
    if (running) { stopTimer(); return; }

    running = true;
    if (typeof enableWakeLock === "function") enableWakeLock();

    // --- 🚀 THE AUDIO FIX: Unlock Browser Autoplay on Click ---
    try {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList : (currentSequence.poses || []);
            
        if (poses[currentIndex]) {
            const rawId = Array.isArray(poses[currentIndex][0]) ? poses[currentIndex][0][0] : poses[currentIndex][0];
            const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(rawId)) : null;
            
            if (asana) {
                // If we are at the very beginning of the pose, announce it!
                if (remaining === currentPoseSeconds) {
                    playAsanaAudio(asana, poses[currentIndex][4] || "");
                } else {
                    // If resuming mid-pose, play a silent file just to satisfy the browser's strict audio rules
                    new Audio("data:audio/mp3;base64,//MkxAAQ").play().catch(()=>{});
                }
            }
        }
    } catch(e) {
        console.warn("Audio unlock failed", e);
    }
    // -----------------------------------------------------------

    // --- 1. UI Setup ---
    const overlay = document.getElementById("focusOverlay");
    if (overlay) overlay.style.display = "flex";
    
    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Running";

    const startBtn = document.getElementById("startStopBtn");
    if (startBtn) startBtn.textContent = "Pause"; // The main screen button becomes 'Pause'

    // --- 2. ORIGINAL PAUSE UX ---
    const pauseBtn = document.getElementById("focusPauseBtn");
    if (pauseBtn) {
        pauseBtn.onclick = () => {
            stopTimer(); 
        };
    }

    // --- 3. THE MAIN CLOCK TICK ---
    timer = setInterval(() => {
        if (remaining > 0) {
            remaining--;
            updateTimerUI();
        }
        
        if (remaining <= 0) {
            // Clear immediately to prevent double-ticks
            clearInterval(timer); 
            timer = null;

            const wasLongHold = currentPoseSeconds >= 60;
            if (wasLongHold && typeof playFaintGong === "function") playFaintGong();
            
            if (wasLongHold) {
                startTransitionPause();
            } else {
                nextPose(); 
                
                // Reset running state before auto-triggering the next pose
                if (running) {
                    running = false; 
                    startTimer(); 
                }
            }
        }
    }, 1000);
}

function startTransitionPause() {
    const overlay = document.getElementById("transitionOverlay");
    const countdownEl = document.getElementById("transitionCountdown");
    const nextPoseEl = document.getElementById("transitionNextPose");

    // If no overlay exists, skip the pause and resume
    if (!overlay) { 
        nextPose(); 
        running = false; 
        startTimer(); 
        return; 
    }

    // Look ahead to the NEXT pose using the active list
    const poses = (activePlaybackList && activePlaybackList.length > 0) ? activePlaybackList : (currentSequence.poses || []);
    let previewName = "";
    const nextIdx = currentIndex + 1;
    
    if (nextIdx < poses.length) {
        const np = poses[nextIdx];
        const id = Array.isArray(np[0]) ? np[0][0] : np[0];
        const asana = typeof findAsanaByIdOrPlate === "function" ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
        previewName = asana ? (typeof displayName === "function" ? displayName(asana) : asana.name) : "";
    }
    if (nextPoseEl) nextPoseEl.textContent = previewName ? `Next: ${previewName}` : "";

    let secs = 15;
    if (countdownEl) countdownEl.textContent = secs;
    
    overlay.style.display = "flex";
    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    // --- TRANSITION CLOCK TICK ---
    let transitionTimer = setInterval(() => {
        secs--;
        if (countdownEl) countdownEl.textContent = secs;
        if (secs <= 0) {
            clearInterval(transitionTimer);
            finishTransition();
        }
    }, 1000);

    function finishTransition() {
        overlay.style.display = "none";
        if (!running) return;
        
        nextPose();
        // Force the main loop to pick up seamlessly where it left off
        running = false; 
        startTimer(); 
    }

    // Handle Skip Button
    const skipBtn = document.getElementById("transitionSkipBtn");
    if (skipBtn) {
        // Clone to remove old event listeners safely
        const newSkip = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkip, skipBtn);
        newSkip.onclick = () => {
            clearInterval(transitionTimer);
            finishTransition();
        };
    }
}

function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;

    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

    const transOverlay = document.getElementById("transitionOverlay");
    if (transOverlay) transOverlay.style.display = "none";

    if (typeof updateTotalAndLastUI === "function") updateTotalAndLastUI(); 

    const btn = document.getElementById("startStopBtn");
    if(btn) btn.textContent = "Start"; 

    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Paused";

    if (typeof disableWakeLock === "function") disableWakeLock();
}

function updateTimerUI() {
    const timerEl = document.getElementById("poseTimer");
    const focusTimerEl = document.getElementById("focusTimer");
    
    // --- 1. Current Clock ---
    if (timerEl) {
        if (!currentSequence) {
            timerEl.textContent = "–";
            if (focusTimerEl) focusTimerEl.textContent = "–";
        } else {
            const mm = Math.floor(remaining / 60);
            const ss = remaining % 60;
            const timeStr = `${mm}:${String(ss).padStart(2,"0")}`;
            timerEl.textContent = timeStr;
            if (focusTimerEl) focusTimerEl.textContent = timeStr;

            timerEl.className = "";
            if (remaining <= 5 && remaining > 0) timerEl.className = "critical";
            else if (remaining <= 10 && remaining > 0) timerEl.className = "warning";
        }
    }

    // --- 2. Dashboard Pill ---
    if (currentSequence) {
        const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
            ? window.activePlaybackList 
            : (currentSequence.poses || []);
        
        // 1. Calculate TOTAL TIME (The right side of the slash)
        // This will correctly return 80 seconds (1:20) for a 40s Trikonasana
        const totalSeconds = poses.reduce((acc, p) => acc + getEffectiveTime(p[0], p[1]), 0);

        // 2. Calculate REMAINING TIME (The left side of the slash)
        let secondsLeft = remaining; // Time left on the CURRENT side of the current pose

        // If we are currently playing Side 1, we must add the duration of Side 2 to the remaining total
        if (typeof needsSecondSide !== "undefined" && needsSecondSide && poses[currentIndex]) {
             secondsLeft += (Number(poses[currentIndex][1]) || 0);
        }

        // Add the effective time of all FUTURE rows
        for (let i = currentIndex + 1; i < poses.length; i++) {
             secondsLeft += getEffectiveTime(poses[i][0], poses[i][1]);
        }

        // 3. Render
        const remDisp = document.getElementById("timeRemainingDisplay");
        const totDisp = document.getElementById("timeTotalDisplay");
        
        if (remDisp && typeof formatHMS === "function") remDisp.textContent = formatHMS(secondsLeft);
        if (totDisp && typeof formatHMS === "function") totDisp.textContent = formatHMS(totalSeconds);

        const bar = document.getElementById("timeProgressFill");
        if (bar && totalSeconds > 0) {
            const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
            bar.style.width = `${pct}%`;
            bar.style.backgroundColor = pct < 10 ? "#ffccbc" : "#c8e6c9"; 
        }
    }
}

// B. STATIC TOTAL TIME CALCULATION (For Builder & Dropdowns)
function calculateTotalSequenceTime(seq) {
    if (!seq || !seq.poses) return 0;
    
    // Unpack macros first
    const expanded = typeof getExpandedPoses === "function" ? getExpandedPoses(seq) : seq.poses;

    // Use the global helper for every pose in the expanded list
    return expanded.reduce((acc, p) => {
        return acc + getEffectiveTime(p[0], p[1]);
    }, 0);
}
/* ==========================================================================
   NAVIGATION
   ========================================================================== */

   function nextPose() {
    // 1. Get the correct list (Always prefer the expanded playback list)
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (currentSequence.poses || []);

    if (!poses.length) return;

    // 2. Scenario: Two-Sided Pose
    if (needsSecondSide) {
        currentSide = "left";
        needsSecondSide = false; 
        setPose(currentIndex, true); // Stays on same index, just swaps side
        return;
    }

    // 3. Scenario: Advance to next index in the 87-item list
    if (currentIndex < poses.length - 1) {
        currentSide = "right";
        needsSecondSide = false;
        setPose(currentIndex + 1);
    } else {
        // End of Sequence
        stopTimer();
        const compBtn = document.getElementById("completeBtn");
        if (compBtn) compBtn.style.display = "inline-block";
    }
}

function prevPose() {
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (currentSequence.poses || []);

    if (currentSide === "left") {
        currentSide = "right";
        needsSecondSide = true; 
        setPose(currentIndex, true);
        return;
    }

    if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        const prevPoseData = poses[newIndex];
        
        // Use our helper to check if the previous pose in the list has sides
        const id = Array.isArray(prevPoseData[0]) ? prevPoseData[0][0] : prevPoseData[0];
        const asana = findAsanaByIdOrPlate(normalizePlate(id));

        if (asana && asana.requiresSides) {
            currentSide = "left";
            needsSecondSide = false;
            setPose(newIndex, true); 
        } else {
            setPose(newIndex);
        }
    }
}





/* ==========================================================================
   RENDERER (SetPose)
   ========================================================================== */
   function setPose(idx, keepSamePose = false) {
    if (!currentSequence) return;
    const poses = (activePlaybackList && activePlaybackList.length > 0) 
                  ? activePlaybackList 
                  : (currentSequence.poses || []);

    if (idx < 0 || idx >= poses.length) return;

    // 1. SAVE PROGRESS (update currentIndex first so the correct pose index is saved)
    currentIndex = idx;
    if (typeof saveCurrentProgress === "function") saveCurrentProgress();

    // Reset side tracking when moving to a new pose
    if (!keepSamePose) {
        currentSide = "right";
        needsSecondSide = false;
    }

// 2. DATA EXTRACTION
const currentPose = poses[idx];
const originalRowIndex = (currentPose && currentPose[5] !== undefined) 
                        ? currentPose[5] 
                        : idx;

// FIX: Use the original sequence length instead of the expanded 'poses.length'
const displayTotal = currentSequence.poses ? currentSequence.poses.length : poses.length;



// Update the Focus/Overlay Count
const focusCounter = document.getElementById("focusPoseCounter");
if (focusCounter) {
    focusCounter.textContent = `${originalRowIndex + 1} / ${displayTotal}`;

}
    const rawIdField = currentPose[0];
    let seconds      = currentPose[1];

    let lookupId = Array.isArray(rawIdField) ? rawIdField[0] : rawIdField;
    lookupId = normalizePlate(lookupId);

    // ALIAS RESOLUTION
    if (typeof idAliases !== 'undefined' && idAliases[lookupId]) {
        let aliasVal = idAliases[lookupId];
        if (aliasVal.includes("|")) aliasVal = aliasVal.split("|")[0];
        lookupId = normalizePlate(aliasVal);
    }

    // 3. SMART LOOKUP
    const asana = findAsanaByIdOrPlate(lookupId);

    // VARIATION DURATION OVERRIDE:
    const storedVarKey = currentPose[3];
    if (storedVarKey && asana && asana.variations && asana.variations[storedVarKey]) {
        const varData = asana.variations[storedVarKey];
        const varHoldStr = varData.hold || varData.Hold || "";
        
        if (varHoldStr) {
            const varHd = parseHoldTimes(varHoldStr);
            if (varHd.standard > 0) {
                const dial = document.getElementById("durationDial");
                const val = dial ? Number(dial.value) : 50;
                
                // MATCH: Use .short and .long here too
                const min = varHd.short || Math.max(5, Math.round(varHd.standard * 0.5));
                const std = varHd.standard;
                const max = varHd.long || Math.round(varHd.standard * 2.0);
            
                if (val < 50) seconds = Math.round(min + (std - min) * (val / 50));
                else if (val > 50) seconds = Math.round(std + (max - std) * ((val - 50) / 50));
                else seconds = std;
            }
        }
    }

    // Sides Check
    if (asana && (asana.requiresSides || asana.requires_sides) && !keepSamePose) {
        needsSecondSide = true;
    }

    // --- NEW: THE DIAL ENFORCER ---
    // Make absolutely sure 'seconds' respects the current dial multiplier!
    const dial = document.getElementById("durationDial");
    if (dial) {
        const val = Number(dial.value);
        if (val !== 50) {
            let mult = 1.0;
            if (val < 50) mult = 0.5 + (val / 50) * 0.5; // Faster (0.5x to 1x)
            else mult = 1.0 + ((val - 50) / 50) * 1.0;   // Slower (1x to 2x)
            seconds = Math.round(seconds * mult);
        }
    }

    // Sides Check
    if (asana && (asana.requiresSides || asana.requires_sides) && !keepSamePose) {
        needsSecondSide = true;
    }

    // --- NEW: VARIATION & NOTE EXTRACTION ---
    // Combine all extra array fields to cleanly parse brackets vs actual notes
    let rawExtras = [currentPose[2], currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    let variationTitle = "";
    let actualNote = "";
    let baseOverrideName = "";

    const bracketMatch = rawExtras.match(/\[(.*?)\]/);
    if (bracketMatch) {
        variationTitle = bracketMatch[1].trim(); // Extracts "Modified I (On ledge)"
        // Remove the bracketed string to leave just the real notes
        actualNote = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\-\|]+/, "").trim();
    } else {
        // Legacy fallback: If no brackets exist, currentPose[2] acts as a base name override
        baseOverrideName = currentPose[2] || "";
        actualNote = [currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    }

  // --- VARIATION TECHNIQUE & SHORTHAND ---
  let displayShorthand = "";
  let displayTechnique = asana ? (asana.technique || asana.Technique || "") : "";

  // Helper to strip accents for safe comparison (e.g. Ujjāyī -> ujjayi)
  const normalizeText = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  if (asana && asana.variations && variationTitle) {
      const normVarTitle = normalizeText(variationTitle);
      let foundVariation = false;

      // Pass 1: Exact matches (ignoring accents)
      for (const [vKey, vData] of Object.entries(asana.variations)) {
          const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
          const normTitle = normalizeText(resolvedTitle);
          const normShort = normalizeText(typeof vData === 'object' ? (vData.shorthand || vData.Shorthand || "") : "");
          const normKey = vKey.toLowerCase();

          if (normVarTitle === normTitle ||
              normVarTitle === normShort ||
              normVarTitle === `stage ${normKey}` ||
              normVarTitle === normKey) {

              const varTech = (typeof vData === 'object') ? (vData.Full_Technique || vData.technique) : vData;
              if (varTech) displayTechnique = varTech;
              if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
              if (resolvedTitle) variationTitle = resolvedTitle;

              foundVariation = true;
              break;
          }
      }

      // Pass 2: Fuzzy Roman Numeral Match (e.g., if title is "Ujjayi VI", it catches the "VI")
      if (!foundVariation) {
          const sortedKeys = Object.keys(asana.variations).sort((a,b) => b.length - a.length);
          for (const vKey of sortedKeys) {
              const normKey = vKey.toLowerCase();
              const endsWithRegex = new RegExp(`\\b${normKey}$`, 'i');

              if (endsWithRegex.test(normVarTitle)) {
                  const vData = asana.variations[vKey];
                  const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
                  const varTech = (typeof vData === 'object') ? (vData.Full_Technique || vData.technique) : vData;
                  if (varTech) displayTechnique = varTech;
                  if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
                  if (resolvedTitle) variationTitle = resolvedTitle;
                  break;
              }
          }
      }
  } 
  // Legacy fallback if the old index 3 was used
  else if (asana && currentPose[3] && asana.variations && asana.variations[currentPose[3]]) {
      const v = asana.variations[currentPose[3]];
      if (typeof v === "string") {
          displayTechnique = v;
      } else {
          displayShorthand = v.shorthand || v.Shorthand || "";
          displayTechnique = v.Full_Technique || v.technique || "";
          const legacyTitle = v.title || v.Title || "";
          if (legacyTitle) variationTitle = legacyTitle;
      }
  }

  // 4. HEADER UI
  const nameEl = document.getElementById("poseName");
  if (nameEl) {
      let finalTitle = baseOverrideName || (asana ? displayName(asana) : "Pose");

      // Append Variation nicely
      if (variationTitle) {
          finalTitle += ` <span style="font-weight:normal; color:#666; font-size:0.85em;">— ${variationTitle}</span>`;
      }
      // Append Sides
      if (asana && asana.requiresSides) {
          finalTitle += (currentSide === "right" ? " (Right)" : " (Left)");
      }
      
      nameEl.innerHTML = finalTitle; // Use innerHTML to parse the appended span
  }

  // 5. SHORTHAND UI
  const shEl = document.getElementById("poseShorthand");
  if (shEl) {
      shEl.textContent = displayShorthand;
      shEl.style.display = displayShorthand ? "block" : "none";
  }
    // 6. GLOSSARY UI
    if (typeof renderSmartGlossary === "function") {
        renderSmartGlossary(displayShorthand);
    }

    // 7. INSTRUCTIONS UI
    const textContainer = document.getElementById("poseInstructions");
    if (textContainer) {
        if (displayTechnique && typeof formatTechniqueText === 'function') {
            textContainer.style.display = "block";
            
            // Dynamically prepend the variation title in bold IF a variation is active
            let techniqueHTML = formatTechniqueText(displayTechnique);
            if (variationTitle) {
                techniqueHTML = `<div style="font-weight:600; color:#333; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #ddd;">${variationTitle} Instructions:</div>` + techniqueHTML;
            }

            textContainer.innerHTML = `
                <details>
                    <summary style="cursor:pointer; color:#2e7d32; font-weight:600; padding:5px 0;">View Full Technique Instructions</summary>
                    <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:8px; white-space: pre-wrap;">${techniqueHTML}</div>
                </details>`;
        } else {
            textContainer.style.display = "none";
        }
    }

    // 8. NOTES UI (Passes only the clean actualNote)
    if (typeof updatePoseNote === "function") updatePoseNote(actualNote);
    if (typeof updatePoseAsanaDescription === "function") updatePoseAsanaDescription(asana);
    if (typeof loadUserPersonalNote === "function") loadUserPersonalNote(lookupId);

    // 9. META UI & AUDIO BUTTON
    const metaContainer = document.getElementById("poseMeta");
    if (metaContainer) {
        metaContainer.innerHTML = ""; 

        const infoSpan = document.createElement("span");
        infoSpan.className = "meta-text-only"; 

        // --- THE FIX: Use the sequence duration for the display string ---
        // currentPose[1] contains the duration defined in your sequence/macro
        const currentSeconds = currentPose[1]; 

        // Get range from library for reference
        const hj = asana?.hold_json || asana?.hold_data;
        let rangeText = "";
        if (hj && hj.standard) {
            rangeText = ` (Range: ${hj.short}s - ${hj.long}s)`;
        }

        // Update the text content to use the dynamic currentSeconds
        infoSpan.textContent = `ID: ${lookupId} • ${currentSeconds}s${rangeText}`;
        metaContainer.appendChild(infoSpan);

        if (asana) {
            const btn = document.createElement("button");
            btn.className = "tiny"; 
            btn.innerHTML = "🔊";   
            btn.style.marginLeft = "10px";
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                playAsanaAudio(asana); 
            };
            metaContainer.appendChild(btn);
        }
    }

    // 10. TIMER & IMAGE LOGIC
    currentPoseSeconds = parseInt(seconds, 10) || 0;
    remaining = currentPoseSeconds;
    updateTimerUI();

    const wrap = document.getElementById("collageWrap");
    if (wrap) {
        wrap.innerHTML = "";
        const urls = smartUrlsForPoseId(lookupId);
        if (urls.length > 0) {
            wrap.appendChild(renderCollage(urls));
        } else {
            const div = document.createElement("div");
            div.className = "msg";
            div.textContent = `No image found for: ${lookupId}`;
            wrap.appendChild(div);
        }
    }

    // --- SYNC OVERLAY CONTENT ---
    const overlayName = document.getElementById("focusPoseName");
    const overlayImageWrap = document.getElementById("focusImageWrap");
    
    if (overlayName && nameEl) overlayName.innerHTML = nameEl.innerHTML; // Sync Name + Variation Span
    
    if (overlayImageWrap) {
        overlayImageWrap.innerHTML = ""; 
        const focusUrls = smartUrlsForPoseId(lookupId);
        if (focusUrls.length > 0) {
            const img = document.createElement("img");
            img.src = focusUrls[0]; 
            overlayImageWrap.appendChild(img);
        }
    }

    // 11. AUDIO TRIGGER
    if (running && asana) {
         playAsanaAudio(asana, baseOverrideName); 
    }
}

/* ==========================================================================
   UI HELPERS (Notes & Stats)
   ========================================================================== */
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
function updatePoseNote(note) {
   const details = $("poseNoteDetails");
   const body = $("poseNoteBody");
   if (!details || !body) return;

   const text = (note ?? "").toString().trim();
   if (!text) {
      details.style.display = "none";
      details.open = false;
      body.innerHTML = "";
      return;
   }

   details.style.display = "block";
   details.open = true;
   body.innerHTML = renderMarkdownMinimal(text);
}

function updatePoseAsanaDescription(asana) {
   const details = $("poseAsanaDescDetails");
   const body = $("poseAsanaDescBody");
   if (!details || !body) return;

   const text = (asana?.description || asana?.Description || "").toString().trim();
   if (!text) {
      details.style.display = "none";
      details.open = false;
      body.innerHTML = "";
      return;
   }

   details.style.display = "block";
   details.open = false;
   body.innerHTML = renderMarkdownMinimal(text);
}

function updatePoseDescription(idField, label) { 
   const body = $("poseDescBody");
   if (!body) return;
   const asana = findAsanaByIdOrPlate(idField);
   const md = descriptionForPose(asana, label);

   if (md) {
      body.innerHTML = renderMarkdownMinimal(md);
   } else {
      body.innerHTML = '<div class="msg">No notes</div>';
   }
}
function updateTotalAndLastUI() {
    // 1. EXPLORER FIX: Look at the activePlaybackList to include the injected standing poses
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
        ? window.activePlaybackList 
        : ((currentSequence && currentSequence.poses) ? currentSequence.poses : []);

    // 2. Calculate Total Time
    const total = poses.reduce((acc, p) => {
       const duration = Number(p?.[1]) || 0;
       const idField = p?.[0];
       const id = Array.isArray(idField) ? idField[0] : idField;
       
       const asana = (typeof findAsanaByIdOrPlate === 'function') 
          ? findAsanaByIdOrPlate(id) 
          : null;

       if (asana && asana.requiresSides) {
          return acc + (duration * 2);
       }
       return acc + duration;
    }, 0);

    // 3. Update Total Time UI
    const totalEl = document.getElementById("totalTimePill");
    if (totalEl) {
        totalEl.textContent = `Total: ${formatHMS(total)}`;
    }

    // 4. Update History UI
    const lastEl = document.getElementById("lastCompletedPill");
    
    if (lastEl) {
        const title = currentSequence && currentSequence.title ? currentSequence.title : null;
        
        if (title) {
           const source = (typeof serverHistoryCache !== 'undefined' && Array.isArray(serverHistoryCache) && serverHistoryCache.length) 
              ? serverHistoryCache 
              : (typeof loadCompletionLog === 'function' ? loadCompletionLog() : []);

           const last = source
              .filter(x => x && x.title === title && typeof x.ts === "number")
              .sort((a, b) => b.ts - a.ts)[0];

           lastEl.textContent = last ?
              `Last: ${new Date(last.ts).toLocaleString("en-AU", {
               year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
              })}` : "Last: –";
        } else {
           lastEl.textContent = "Last: –";
        }
    }
}
 function loadUserPersonalNote(idField) {
    const container = document.getElementById("poseDescBody");
    if (!container) return;
    container.innerHTML = ""; 

    const rawId = Array.isArray(idField) ? idField[0] : idField;
    // This key is already unique (e.g., "user_note_001")
    const storageKey = `user_note_${normalizePlate(rawId)}`; 
    const savedNote = localStorage.getItem(storageKey) || "";

    const wrapper = document.createElement("div");
    
    const area = document.createElement("textarea");
    
    // --- FIX: Add ID and Name attributes here ---
    area.id = storageKey;    // Helps browser identify the field
    area.name = storageKey;  // Helps browser identify the field
    // --------------------------------------------

    area.style.width = "100%";
    area.style.height = "80px";
    area.style.padding = "8px";
    area.style.border = "1px solid #ccc";
    area.style.borderRadius = "4px";
    area.style.fontFamily = "inherit";
    area.placeholder = "Add your personal notes for this pose here (e.g. 'Use block under knee')...";
    area.value = savedNote;

    const status = document.createElement("div");
    status.style.fontSize = "0.75rem";
    status.style.marginTop = "4px";
    status.style.color = "#888";
    status.textContent = "Changes save automatically.";

    let timeout;
    area.oninput = () => {
        status.textContent = "Saving...";
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            localStorage.setItem(storageKey, area.value);
            status.textContent = "✓ Saved to this device";
            status.style.color = "green";
            setTimeout(() => { status.style.color = "#888"; }, 2000);
        }, 800); 
    };

    wrapper.appendChild(area);
    wrapper.appendChild(status);
    container.appendChild(wrapper);
}
function descriptionForPose(asana, fullLabel) {
   if (!asana) return "";
   
   // Extract Stage from Label (e.g., "Ujjayi IIb" -> "IIb")
   const stageMatch = (fullLabel || "").match(/\s([IVXLCDM]+[a-b]?)$/i);
   if (stageMatch) {
       let stageKey = stageMatch[1].toUpperCase(); 
       stageKey = stageKey.replace(/([A-B])$/, (m) => m.toLowerCase()); 

       if (asana[stageKey]) {
           return asana[stageKey].trim();
       }
   }
   return (asana.Description || asana.Technique || "").trim();
}

// #endregion
// #region 7. UI & BROWSING
/* ==========================================================================
   BROWSE SCREEN & FILTERS
   ========================================================================== */

   function setupBrowseUI() {
// console.log("setupBrowseUI() is running...");

    // 1. Wire up the main Browse button
    const bBtn = document.getElementById("browseBtn");
    if (bBtn) {
// console.log("✅ Browse button found! Attaching click listener.");
        bBtn.onclick = (e) => {
            e.preventDefault();
            window.openBrowse();
        };
    } else {
        console.error("❌ ERROR: browseBtn was NULL during setupBrowseUI!");
    }

    // 2. Wire up the close button
    if ($("browseCloseBtn")) {
        $("browseCloseBtn").addEventListener("click", closeBrowse);
    }

    // 3. Hide Finals Checkbox
    const finalsChk = $("browseFinalOnly");
    if (finalsChk) {
        if (finalsChk.parentElement && finalsChk.parentElement.tagName === "LABEL") {
            finalsChk.parentElement.style.display = "none";
        } else {
            finalsChk.style.display = "none";
        }
    }

    const closeBtn = $("browseCloseBtn");

    // Create "Add Asana" Button (always visible)
    if (closeBtn && !document.getElementById("browseAddAsanaBtn")) {
        const addBtn = document.createElement("button");
        addBtn.id = "browseAddAsanaBtn";
        addBtn.textContent = "Add Asana";
        addBtn.className = "tiny";
        addBtn.style.cssText = "background: #007aff; color: white; margin-right: 8px;";

        addBtn.onclick = () => {
            if (typeof window.openAsanaEditor === "function") {
                window.openAsanaEditor(null);
            }
        };

        if (closeBtn.parentNode) {
            closeBtn.parentNode.insertBefore(addBtn, closeBtn);
            closeBtn.parentNode.style.display = "flex";
            closeBtn.parentNode.style.alignItems = "center";
        }
    }

    // 6. Backdrop Click Logic
    const bd = $("browseBackdrop");
    if (bd) {
        let downOnBackdrop = false;
        bd.addEventListener("pointerdown", (e) => { downOnBackdrop = (e.target === bd); });
        bd.addEventListener("click", (e) => {
            if (e.target === bd && downOnBackdrop) closeBrowse();
            downOnBackdrop = false;
        });
    }

    // 7. ESC Key Support
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $("browseBackdrop")?.style.display === "flex") {
            closeBrowse();
        }
    });

    // 8. Filters
    const onChange = () => applyBrowseFilters();
    const debounce = (fn, ms = 120) => {
        let t = null;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };

    if ($("browseSearch")) $("browseSearch").addEventListener("input", debounce(onChange, 120));
    if ($("browsePlate")) $("browsePlate").addEventListener("input", debounce(onChange, 120));
    if ($("browseAsanaNo")) $("browseAsanaNo").addEventListener("input", debounce(onChange, 120));
    if ($("browseCategory")) $("browseCategory").addEventListener("change", onChange);
}


window.openBrowse = function() {
// console.log("✅ openBrowse() was successfully triggered!");
document.body.classList.add("modal-open");
    const bd = $("browseBackdrop");
// console.log("🔍 Looking for backdrop element:", bd);
    
    if (!bd) {
        console.error("❌ ERROR: browseBackdrop not found in the HTML!");
        return;
    }
    
    bd.style.display = "flex";
    bd.setAttribute("aria-hidden", "false");
// console.log("✅ Backdrop display set to flex.");
    
    try {
// console.log("🔄 Calling applyBrowseFilters()...");
        applyBrowseFilters(); 
// console.log("✅ Filters applied successfully.");
    } catch (e) {
        console.error("❌ ERROR inside applyBrowseFilters:", e);
    }
    
    if ($("browseSearch")) $("browseSearch").focus();
};

// Ensure the local reference points to the window one just in case
const openBrowse = window.openBrowse;

function closeBrowse() {
    document.body.classList.remove("modal-open");
    const bd = $("browseBackdrop");
    if (!bd) return;
    bd.style.display = "none";
    bd.setAttribute("aria-hidden", "true");
    exitBrowseDetailMode();
    const d = $("browseDetail");
    if (d) d.innerHTML = "";
    if ($("browseBtn")) $("browseBtn").focus();
}

function renderBrowseList(items) {
    const list = document.getElementById("browseList");
    if (!list) return;
    
    list.innerHTML = "";
    const countEl = document.getElementById("browseCount");
    
    const totalCount = Object.keys(asanaLibrary || {}).length;
    if (countEl) countEl.textContent = `Showing ${items.length} of ${totalCount}`;

    if (!items.length) {
       list.innerHTML = `<div class="msg" style="padding:10px 0">No matches found.</div>`;
       return;
    }

    const frag = document.createDocumentFragment();
    
    items.slice(0, 400).forEach(asma => {
       const row = document.createElement("div");
       row.className = "browse-item";

       const left = document.createElement("div");
       
       const title = document.createElement("div");
       title.className = "title";
       
       // Fallback logic for title
       let titleText = (typeof displayName === "function" ? displayName(asma) : null);
       if (!titleText || titleText === "(no name)") {
           titleText = asma.name || asma.english || asma.iast || "(no name)";
       }
       
       // Use plural 'variations' length if present
       const varCount = asma.variations ? Object.keys(asma.variations).length : 0;
       if (varCount > 0) {
           titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${varCount} variations)</span>`;
       }
       title.innerHTML = titleText;

       const meta = document.createElement("div");
       meta.className = "meta";
       const catDisplay = asma.category ? asma.category.replace(/^\d+_/, "").replace(/_/g, " ") : "Uncategorized";
       const catBadge = catDisplay ? ` <span class="badge">${catDisplay}</span>` : "";
       
        // Smart plate formatter
        let platesText = "";
        if (typeof asma.plates === 'object' && asma.plates !== null) {
            const finalStr = asma.plates.final && asma.plates.final.length ? `Final: ${asma.plates.final.join(", ")}` : "";
            const interStr = asma.plates.intermediate && asma.plates.intermediate.length ? `Int: ${asma.plates.intermediate.join(", ")}` : "";
            platesText = [finalStr, interStr].filter(Boolean).join(" | ");
        } else {
            platesText = asma.plates || asma.plate_numbers || "";
        }
       meta.innerHTML = `
         <span style="color:#000; font-weight:bold;">ID: ${asma.id || asma.asanaNo || "?"}</span>
         ${platesText ? ` • Plates: ${platesText}` : ""}
         ${catBadge}
       `;
       
       left.appendChild(title);
       left.appendChild(meta);

       const btn = document.createElement("button");
       btn.textContent = "View";
       btn.className = "tiny";
       btn.addEventListener("click", () => {
          if (typeof showAsanaDetail === "function") showAsanaDetail(asma);
          if (typeof isBrowseMobile === 'function' && isBrowseMobile()) {
             if (typeof enterBrowseDetailMode === "function") enterBrowseDetailMode();
          }
       });

       row.appendChild(left);
       row.appendChild(btn);
       frag.appendChild(row);
    });
    
    list.appendChild(frag);

    if (items.length > 400) {
       const more = document.createElement("div");
       more.className = "msg";
       more.style.padding = "10px 0";
       more.textContent = `Showing first 400 results. Narrow your filters.`;
       list.appendChild(more);
    }
}

/* ==========================================================================
   DETAIL VIEW & TABS
   ========================================================================== */

function startBrowseAsana(asma) {
   const plates = (asma.finalPlates && asma.finalPlates.length) ? asma.finalPlates : asma.interPlates;
   if (!plates || !plates.length) return;

   stopTimer();
   running = false;
   $("startStopBtn").textContent = "Start";

   const variationName = asma.variation || "";
   const fullName = variationName ? `${asma.english} (${variationName})` : asma.english;

   currentSequence = {
      title: `Browse: ${fullName}`,
      category: "Browse",
      poses: [[plates, 60, fullName]]
   };
   currentIndex = 0;
   setPose(0);
   closeBrowse();
}
async function showAsanaDetail(asana) {
// console.log("showAsanaDetail called with:", asana);
    const d = document.getElementById('browseDetail');
// console.log("browseDetail element found:", d);
    if (!d) {
        console.error("browseDetail element not found!");
        return;
    }

    d.innerHTML = "";
// console.log("browseDetail cleared");

    const titleEl = document.createElement("h2");
    titleEl.style.margin = "0 0 10px 0";
    titleEl.textContent = displayName(asana);
    d.appendChild(titleEl);
// console.log("Title appended");

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit Asana";
    editBtn.className = "edit-asana-btn";
    editBtn.style.cssText = "background: #2196f3; color: white; padding: 6px 12px; cursor: pointer; margin-bottom: 10px; font-weight: bold; border: none; border-radius: 6px;";
    editBtn.onclick = () => {
// console.log("Edit button onclick fired");
// console.log("Edit button clicked, asana.id:", asana.id, "asana.asanaNo:", asana.asanaNo);
        window.openAsanaEditor(asana.id || asana.asanaNo);
    };
    d.appendChild(editBtn);
// console.log("Edit button appended:", editBtn);
// console.log("Edit button onclick property:", editBtn.onclick);

    // 3. Build the rest of the Info via a single HTML string
    // Use a unique name for this string variable to avoid re-declaration errors
    let detailHTML = `
      ${
        asana.iast && prefersIAST() && asana.english
          ? `<div style="font-size:0.85rem;color:#666;margin-bottom:4px;">${asana.english}</div>`
          : asana.iast && !prefersIAST()
          ? `<div style="font-size:0.85rem;color:#666;margin-bottom:4px;font-style:italic;">${asana.iast}</div>`
          : ''
      }
      <div class="muted">ID: ${asana.id || asana.asanaNo}</div>
      <button id="playNameBtn" class="tiny" style="margin-top:10px;">🔊 Play Audio</button>
      <hr>
    `;

    // 4. Append Images
    const urls = typeof smartUrlsForPoseId === 'function' ? smartUrlsForPoseId(asana.id || asana.asanaNo) : [];
    if (urls && urls.length > 0) {
        detailHTML += `<div class="browse-collage">`;
        urls.forEach((src) => {
            detailHTML += `<img src="${src}" style="max-width:100%; border-radius:8px; margin-bottom:10px;">`;
        });
        detailHTML += `</div>`;
    }
  
    // 5. Append Technique (Base Pose)
    const baseTech = asana.technique || asana.Technique || "";
    if (baseTech) {
        detailHTML += `<h3>Base Technique</h3>
          <div class="technique-text" style="white-space: pre-wrap;">${
            typeof formatTechniqueText === 'function' ? formatTechniqueText(baseTech) : baseTech
          }</div>`;
    }

    // 5.5. Append Description
    const baseDesc = asana.description || asana.Description || "";
    if (baseDesc) {
        detailHTML += `<details style="margin-top:12px; max-width:720px;">
          <summary style="cursor:pointer; font-weight:650">Description</summary>
          <div class="desc-text" style="padding-top:8px; color:#111; white-space: pre-wrap;">${
            typeof formatTechniqueText === 'function' ? formatTechniqueText(baseDesc) : baseDesc
          }</div>
        </details>`;
    }

    // Safely append the gathered HTML string to the existing native elements
    d.insertAdjacentHTML('beforeend', detailHTML);
  
    // --- REPLACE YOUR SECTION 6 (Variations Loop) WITH THIS ---
    if (asana.variations && Object.keys(asana.variations).length > 0) {
        const varSection = document.createElement('div');
        // We can just use one heading now since they are merged
        varSection.innerHTML = '<hr><h3>Variations & Stages</h3>';

        const sortedKeys = Object.keys(asana.variations).sort();
        sortedKeys.forEach(key => {
            const val = asana.variations[key];
            let techText = '';
            let shortText = '';
            let holdText = val.hold || '';
            let titleText = `Stage ${key}`;
            let isCustom = !!val.isCustom; // This is the flag we added to loadAsanaLibrary

            if (typeof val === 'string') {
                techText = val;
            } else if (val && typeof val === 'object') {
                techText = val.full_technique || val.Full_Technique || val.technique || '';
                shortText = val.shorthand || val.Shorthand || '';
                const actualTitle = val.Title || val.title || val.Stage_Title || val.stage_title;
                if (actualTitle && String(actualTitle).trim() !== '') titleText = String(actualTitle).trim();
            }

            const wrapper = document.createElement('div');
            wrapper.className = isCustom ? 'user-variation-block' : 'variation-block';
            
            // STYLE OVERRIDE: If it's custom, give it the blue theme. Otherwise, the grey theme.
            wrapper.style.cssText = isCustom 
                ? 'background:#f0f7ff; padding:12px; margin-bottom:12px; border-radius:8px; border: 2px solid #2196f3;'
                : 'background:#f9f9f9; padding:12px; margin-bottom:12px; border-radius:8px; border: 1px solid #eee;';

            let html = `<h4 style="margin-top:0; margin-bottom:8px; color:${isCustom ? '#1976d2' : '#333'}; font-size:1.1rem;">${titleText}</h4>`;
            
            if (shortText) html += `<div style="color:${isCustom ? '#1565c0' : '#2e7d32'}; font-weight:bold; margin-bottom:8px; font-family:monospace; font-size:1rem;">${shortText}</div>`;
            
            // Add the Hold time if it exists
            if (holdText) html += `<div style="color:${isCustom ? '#0d47a1' : '#666'}; margin-bottom:8px; font-weight:600; font-size:0.95rem;">Hold: ${holdText}</div>`;

            if (techText) {
                const formattedTech = typeof formatTechniqueText === 'function' ? formatTechniqueText(techText) : techText;
                html += `<div class="technique-text" style="white-space: pre-wrap; font-size:0.95rem; color:#444;">${formattedTech}</div>`;
            } else {
                html += `<div class="muted" style="font-size:0.85rem;">No specific instructions provided.</div>`;
            }

            wrapper.innerHTML = html;
            varSection.appendChild(wrapper);
        });
        d.appendChild(varSection);
    }
    // 7. Bind Audio Button
    const playBtn = document.getElementById('playNameBtn');
    if (playBtn) playBtn.onclick = () => playAsanaAudio(asana, null);
  
}


/* ==========================================================================
   RENDERERS (COLLAGE & LISTS)
   ========================================================================== */
/* ==========================================================================
   RENDERERS (COLLAGE, LISTS & DROPDOWNS)
   ========================================================================== */

   function renderPlateSection(title, plates, globalSeen, fallbackId) {
    const wrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "section-title";
    header.textContent = title;
    wrap.appendChild(header);
 
    let targets = (plates && plates.length) ? plates : [];
    if (!targets.length && !fallbackId) {
       const msg = document.createElement("div");
       msg.className = "msg";
       msg.textContent = "–";
       wrap.appendChild(msg);
       return wrap;
    }
 
    const urls = [];
    const missing = [];
    const seen = new Set();
    
    const processIds = (idList) => {
        for (const p of idList) {
           if (!p || p === "undefined") continue;
           const u = (typeof urlsForPlateToken === 'function') ? urlsForPlateToken(p) : [];
           if (!u.length) missing.push(p);
           u.forEach(x => {
              const g = globalSeen || null;
              if (!seen.has(x) && !(g && g.has(x))) {
                 seen.add(x);
                 if (g) g.add(x);
                 urls.push(x);
              }
           });
        }
    };
    processIds(targets);
 
    if (urls.length === 0 && fallbackId) {
        const fallbackUrls = (typeof urlsForPlateToken === 'function') ? urlsForPlateToken(fallbackId) : [];
        if (fallbackUrls.length > 0) {
            fallbackUrls.forEach(x => {
                const g = globalSeen || null;
                if (!seen.has(x) && !(g && g.has(x))) {
                    seen.add(x);
                    if (g) g.add(x);
                    urls.push(x);
                }
            });
            while(missing.length > 0) missing.pop();
        }
    }
 
    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.marginTop = "4px";
    meta.style.fontSize = "0.8rem";
    if (targets.length) {
        meta.textContent = `Ref Plates: ${targets.join(", ")}`;
        wrap.appendChild(meta);
    }
 
    if (urls.length) {
       if (typeof renderCollage === "function") wrap.appendChild(renderCollage(urls));
       else console.warn("renderCollage missing");
    }
 
    if (missing.length && urls.length === 0) {
       const m = document.createElement("div");
       m.className = "msg";
       m.style.color = "#d9534f"; 
       m.textContent = `⚠️ Image not found for Ref: ${missing.join(", ")}`;
       wrap.appendChild(m);
    }
    return wrap;
 }
 
 function renderCollage(urls) {
    const wrap = document.createElement("div");
    wrap.className = "collage";
    urls.forEach(u => {
       const mob = (typeof mobileVariantUrl === 'function') ? mobileVariantUrl(u) : u;
       const tile = document.createElement("div");
       tile.className = "tile";
       tile.innerHTML = `
         <picture>
           <source media="(max-width: 768px)" srcset="${mob}">
           <img src="${u}" alt="" loading="lazy" decoding="async">
         </picture>
       `;
       wrap.appendChild(tile);
    });
    return wrap;
 }
 
 // --- NEW: Category Filter Logic ---
 function renderCategoryFilter() {
    const filterEl = document.getElementById("categoryFilter");
    if (!filterEl) return;
 
    // 1. Get unique categories
    const uniqueCats = new Set();
    courses.forEach(c => {
        const cat = c.category ? c.category.trim() : "Uncategorized";
        uniqueCats.add(cat);
    });
 
    // 2. Save current selection
    const currentVal = filterEl.value;
 
    // 3. Rebuild Options
    filterEl.innerHTML = `<option value="ALL">📂 All Collections</option>`;
 
    Array.from(uniqueCats).sort().forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        
        // Visual flair for your specific categories
        let icon = "📁";
        if (cat.includes("Asana")) icon = "🧘";
        else if (cat.includes("Therapeutic")) icon = "❤️";
        else if (cat.includes("Pranayama")) icon = "🌬️";
        
        opt.textContent = `${icon} ${cat}`;
        filterEl.appendChild(opt);
    });
 
    // 4. Restore selection or default
    filterEl.value = currentVal || "ALL";
 
    // 5. Attach Listener
    // Remove old listener to avoid duplicates
    filterEl.onchange = () => renderCourseUI();
 }
 
 // --- UPDATED: Course Selector (Filters based on Category) ---
 function renderCourseUI() {
    const sel = document.getElementById("sequenceSelect");
    const filterEl = document.getElementById("categoryFilter");
    if (!sel) return;

    const filterVal = filterEl ? filterEl.value : "ALL";
    const currentVal = sel.value; 

    sel.innerHTML = `<option value="">Select a course</option>`;

    // Grouping by EXACT category string
    const grouped = {};
    courses.forEach((course, idx) => {
       const cat = course.category ? course.category.trim() : "Uncategorized";
       
       if (filterVal !== "ALL" && cat !== filterVal) return;

       if (!grouped[cat]) grouped[cat] = [];
       grouped[cat].push({ course, idx });
    });

    // Sort categories alphabetically
    const sortedCats = Object.keys(grouped).sort();

    sortedCats.forEach(catName => {
        const groupEl = document.createElement("optgroup");
        groupEl.label = catName;
        
        grouped[catName].forEach(item => {
            const opt = document.createElement("option");
            opt.value = String(item.idx);
            // Show the title. The value (idx) points to the unique object in the courses array.
            opt.textContent = item.course.title || `Course ${item.idx + 1}`;
            groupEl.appendChild(opt);
        });
        sel.appendChild(groupEl);
    });

    if (currentVal) {
        const exists = Array.from(sel.options).some(o => o.value === currentVal);
        if (exists) sel.value = currentVal;
    }
}
 
 // Main Entry Point for Dropdowns
 function renderSequenceDropdown() {
    renderCategoryFilter(); // Update filter options
    renderCourseUI();       // Update course list
 }
 
 // Alias for Admin compatibility
 const populateSequenceSelect = renderSequenceDropdown;

/* ==========================================================================
   FILTER HELPERS
   ========================================================================== */

   function applyBrowseFilters() {
    const q = document.getElementById("browseSearch")?.value.trim() || "";
    const plateStr = document.getElementById("browsePlate")?.value.trim() || "";
    const noQ = document.getElementById("browseAsanaNo")?.value.trim() || "";
    const cat = document.getElementById("browseCategory")?.value || "";
    const finalsOnly = document.getElementById("browseFinalOnly")?.checked || false;

    const normalizeText = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normQ = normalizeText(q);

    // Get all asanas as an array
    const asanaArray = Object.values(window.asanaIndex || asanaLibrary || {});

    const filtered = asanaArray.filter(a => {
        if (!a) return false;

        // 1. Text Search (Null-proof)
        if (normQ) {
            const searchStr = normalizeText(a.name) + " " + normalizeText(a.english) + " " + normalizeText(a.iast);
            if (!searchStr.includes(normQ)) return false;
        }

        // 2. Category Dropdown
        if (cat && cat !== "") {
            const safeCat = String(a.category || "");
            if (cat === "__UNCAT__") {
                if (safeCat && safeCat !== "Uncategorized") return false;
            } else {
                if (!safeCat.includes(cat) && safeCat !== cat) return false;
            }
        }

        // 3. Asana ID 
        if (noQ && String(a.id) !== noQ && String(a.asanaNo) !== noQ) return false;

        // 4. Plates
        if (plateStr) {
            const plateArr = plateStr.match(/\d+/g) || [];
            const aPlates = String(a.plates || a.plate_numbers || "").match(/\d+/g) || [];
            const hasPlate = plateArr.some(p => aPlates.includes(p));
            if (!hasPlate) return false;
        }

        return true;
    });

    // 5. Safe Deduplication by ID
    const uniqueFiltered = [];
    const seen = new Set();
    filtered.forEach(a => {
        const uniqueKey = String(a.id || a.asanaNo || a.name || "").toLowerCase().trim();
        if (uniqueKey && !seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            uniqueFiltered.push(a);
        }
    });

    // 6. Sort Numerically by ID
    uniqueFiltered.sort((x, y) => {
        const idX = String(x.id || x.asanaNo || "9999");
        const idY = String(y.id || y.asanaNo || "9999");
        // { numeric: true } ensures that "2" comes before "10"
        return idX.localeCompare(idY, undefined, { numeric: true });
    });

    if (typeof renderBrowseList === "function") {
        renderBrowseList(uniqueFiltered);
    }
}

function matchesText(asma, q) {
   if (!q) return true;
   const haystack = (String(asma.english || "") + " " + String(asma.iast || "") + " " + String(asma.variation || "")).toLowerCase();
   return haystack.includes(q.toLowerCase());
}

function parsePlateQuery(q) {
   const s = String(q || "").trim();
   if (!s) return [];
   return parseIndexPlateField(s.replace(/[,\s]+/g, "|"));
}

function matchesPlate(asma, plateQuery) {
   if (!plateQuery || !plateQuery.length) return true;
   const set = new Set(asma.allPlates.map(x => normalizePlate(x)));
   for (const p of plateQuery) {
      if (set.has(normalizePlate(p))) return true;
   }
   return false;
}

function matchesAsanaNo(asma, q) {
   const s = String(q || "").trim();
   if (!s) return true;
   return normalizePlate(s) === normalizePlate(asma.asanaNo);
}

function matchesCategory(asma, cat) {
   if (!cat) return true;
   if (cat === "__UNCAT__") return !asma.category;
   return asma.category === cat;
}

function setStatus(msg) {
   const el = $("statusText");
   if (el) el.textContent = msg;
}

function showError(where, msg) {
   console.error(msg);
   const el = $(where);
   if (el) el.textContent = msg;
}

function enterBrowseDetailMode() {
   const modal = document.querySelector("#browseBackdrop .modal");
   if (modal) modal.classList.add("detail-mode");
}

function exitBrowseDetailMode() {
    const modal = document.querySelector("#browseBackdrop .modal");
    if (modal) modal.classList.remove("detail-mode");
}

/* ==========================================================================
   CONSOLIDATED ADMIN / MANAGE UI
   ========================================================================== */
// #endregion
// #region 8. ADMIN & DATA LAYER


function builderRender() {
    const tbody = document.getElementById("builderTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const emptyMsg = document.getElementById("builderEmptyMsg");
    if (emptyMsg) emptyMsg.style.display = builderPoses.length ? "none" : "block";
 
    let totalSec = 0;
    const libraryArray = Object.values(window.asanaLibrary || {});
    
    // --- NEW: Category Detection ---
    const currentCategory = (document.getElementById("builderCategory")?.value || "").toLowerCase();
    const isFlow = currentCategory.includes("flow");
 
    builderPoses.forEach((pose, idx) => {
        const idStr = String(pose.id);
        const durOrReps = Number(pose.duration) || 0;
        const isMacro = idStr.startsWith("MACRO:");
        let asana = null;
    
        // --- 1. TIME CALCULATION (Using Helper & Override) ---
        if (isMacro) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const subCourse = window.courses ? window.courses.find(c => c.title === targetTitle) : null;
            
            if (subCourse && subCourse.poses) {
                const oneRoundSecs = subCourse.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1]), 0);
                totalSec += (oneRoundSecs * durOrReps); 
            }
        } else {
            const normId = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
            asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
            
            // IF NOT FLOW: Force library standard timing
            const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
            const activeTime = isFlow ? durOrReps : libraryStd;
    
            totalSec += getEffectiveTime(idStr, activeTime);
        }
    
        // --- 2. ROW CREATION & DRAG EVENTS ---
        const tr = document.createElement("tr");
        tr.draggable = true;
        tr.dataset.idx = idx;
        if (isMacro) tr.className = "builder-macro-row";

        tr.ondragstart = (e) => {
            e.dataTransfer.setData("text/plain", idx);
            tr.style.opacity = "0.4";
        };
        tr.ondragend = () => tr.style.opacity = "1";
        tr.ondragover = (e) => {
            e.preventDefault();
            tr.style.borderTop = "2px solid #007aff";
        };
        tr.ondragleave = () => tr.style.borderTop = "none";
        tr.ondrop = (e) => {
            e.preventDefault();
            tr.style.borderTop = "none";
            const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
            const toIdx = idx;
            if (fromIdx !== toIdx) {
                const item = builderPoses.splice(fromIdx, 1)[0];
                builderPoses.splice(toIdx, 0, item);
                builderRender();
            }
        };
    
        // --- 3. UI RENDERING PREP ---
        const hasSides = asana && (asana.requires_sides || asana.requiresSides);
        const sideBadge = (!isMacro && hasSides) 
            ? `<span style="color:#2e7d32; font-size:0.7rem; font-weight:bold; margin-left:4px;">[Sides ×2]</span>` 
            : '';
    
        let varSelectHTML = '';
        const variations = asana ? (asana.variations || {}) : {};
        if (!isMacro && Object.keys(variations).length > 0) {
            varSelectHTML = `
               <select class="b-var" data-idx="${idx}" style="margin-left:8px; padding:2px 4px; border:1px solid #1976d2; border-radius:4px; font-size:0.75rem; background:#e3f2fd; color:#005580; max-width: 160px;">
                  <option value="">Base Pose</option>
                  ${Object.entries(variations).map(([vKey, vData]) => {
                      let optionTitle = vData.title || `Stage ${vKey}`;
                      const sel = (pose.variation === vKey) ? 'selected' : '';
                      return `<option value="${vKey}" ${sel}>${optionTitle}</option>`;
                  }).join('')}
               </select>`;
        }

        // BUILD THE DURATION INPUT (Locked if not Flow/Macro)
        const displayTime = isMacro ? durOrReps : (isFlow ? durOrReps : (asana?.hold_data?.standard || 30));
        const isLocked = !isFlow && !isMacro;

        const durInputHTML = `
            <input type="number" class="b-dur" data-idx="${idx}" 
                value="${displayTime}" 
                min="1" 
                ${isLocked ? 'readonly' : ''} 
                style="width:60px; padding:4px; border:1px solid #ccc; text-align:center; ${isLocked ? 'background:#f0f0f0; color:#888; cursor:not-allowed;' : ''}">
            ${isMacro ? `<div style="font-size:0.7rem; color:#0d47a1; margin-top:4px; font-weight:bold;">Rounds</div>` : (isLocked ? '' : `<button class="tiny b-std-time" data-idx="${idx}" style="display:block; margin:4px auto 0;">⏱ Std</button>`)}
        `;
    
        // --- 4. INJECT HTML ---
        tr.innerHTML = `
           <td style="padding:8px; text-align:center; color:#888;">${idx + 1}</td>
           <td style="padding:8px;">
              <div style="font-weight:bold; margin-bottom:4px; line-height: 1.2;">
                 ${pose.name || 'Unknown'} ${sideBadge}
              </div>
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                 ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" ${isMacro ? 'readonly' : ''} style="width:${isMacro ? 'auto' : '50px'}; padding:2px; border:1px solid #ccc; border-radius:4px; ${isMacro ? 'background:#f0f0f0;' : ''}">
                 ${varSelectHTML}
              </div>
           </td>
           <td style="padding:8px; text-align:center;">
              ${durInputHTML}
           </td>
           <td style="padding:8px;">
              <input type="text" class="b-note" data-idx="${idx}" value="${(pose.note || '').replace(/"/g, '&quot;')}" placeholder="Notes..." style="width:100%; padding:4px; border:1px solid #ccc;">
           </td>
           <td style="padding:8px; text-align:center; white-space:nowrap;">
              <button class="tiny b-move-top" data-idx="${idx}" title="Move to Top" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤒</button>
              <button class="tiny b-move-bot" data-idx="${idx}" title="Move to Bottom" ${idx === builderPoses.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>⤓</button>
              <button class="tiny b-move-up" data-idx="${idx}">▲</button>
              <button class="tiny b-move-dn" data-idx="${idx}">▼</button>
              <button class="tiny warn b-remove" data-idx="${idx}">✕</button>
           </td>`;
           
        tbody.appendChild(tr);

        // Flash highlight for newly unshifted row
        if (idx === 0 && builderPoses.length > 1) {
            tr.style.backgroundColor = "#fff9c4"; 
            setTimeout(() => { tr.style.transition = "background 1s"; tr.style.backgroundColor = ""; }, 100);
        }
    }); // <--- END OF THE forEach LOOP
 
    // --- 5. LISTENERS ---
    const qS = (sel) => tbody.querySelectorAll(sel);
    qS('.b-id').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        let val = e.target.value.trim();
        if(!val.startsWith("MACRO:")) val = val.padStart(3, '0');
        builderPoses[i].id = val;
        const normId = typeof normalizePlate === "function" ? normalizePlate(val) : val;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch) {
            builderPoses[i].name = asanaMatch.name;
            if (asanaMatch.hold_data?.standard) builderPoses[i].duration = asanaMatch.hold_data.standard;
        }
        builderRender();
    });

    qS('.b-std-time').forEach(el => el.onclick = () => {
        const i = el.dataset.idx;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderPoses[i].id) : builderPoses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        if (asanaMatch?.hold_data?.standard) { builderPoses[i].duration = asanaMatch.hold_data.standard; builderRender(); }
    });

    qS('.b-var').forEach(el => el.onchange = (e) => {
        const i = e.target.dataset.idx;
        builderPoses[i].variation = e.target.value;
        const normId = typeof normalizePlate === "function" ? normalizePlate(builderPoses[i].id) : builderPoses[i].id;
        const asanaMatch = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
        const vHold = asanaMatch?.variations?.[e.target.value]?.hold;
        if (vHold) { 
            const hd = parseHoldTimes(vHold); 
            if(hd.standard) builderPoses[i].duration = hd.standard; 
        }
        builderRender();
    });

    qS('.b-dur').forEach(el => {
        el.onchange = (e) => {
            const idx = e.target.dataset.idx;
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 1) {
                val = 1;
                e.target.value = 1;
            }
            builderPoses[idx].duration = val;
            builderRender(); 
        };
    });

    qS('.b-note').forEach(el => el.oninput = (e) => builderPoses[e.target.dataset.idx].note = e.target.value);
    qS('.b-move-up').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), -1));
    qS('.b-move-dn').forEach(el => el.onclick = () => movePose(parseInt(el.dataset.idx), 1));
    qS('.b-remove').forEach(el => el.onclick = () => removePose(parseInt(el.dataset.idx)));
  
    qS('.b-move-top').forEach(el => el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        if (idx > 0) {
            const item = builderPoses.splice(idx, 1)[0];
            builderPoses.unshift(item);
            builderRender();
        }
    });

    qS('.b-move-bot').forEach(el => el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        if (idx < builderPoses.length - 1) {
            const item = builderPoses.splice(idx, 1)[0];
            builderPoses.push(item);
            builderRender();
        }
    });

    // --- 6. STATS UPDATER (Builder Modal) ---
    const statsEl = document.getElementById("builderStats");
    if (statsEl) {
        let finalTotalSecs = 0;
        let expandedPoseCount = 0;

        builderPoses.forEach(p => {
            const idStr = String(p.id);
            const durOrReps = Number(p.duration) || 0;

            if (idStr.startsWith("MACRO:")) {
                const targetTitle = idStr.replace("MACRO:", "").trim();
                const sub = (window.courses || []).find(c => c.title === targetTitle);
                if (sub && sub.poses) {
                    const oneRound = sub.poses.reduce((acc, sp) => acc + getEffectiveTime(sp[0], sp[1]), 0);
                    finalTotalSecs += (oneRound * durOrReps);
                    expandedPoseCount += 1;
                }
            } else {
                // FIXED: Respect the "Flow" logic for accurate totals
                const normId = typeof normalizePlate === "function" ? normalizePlate(idStr) : idStr;
                const asana = libraryArray.find(a => String(a.id || a.asanaNo) === String(normId));
                
                const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
                const activeTime = isFlow ? durOrReps : libraryStd;

                const effective = getEffectiveTime(p.id, activeTime);
                finalTotalSecs += effective;
                
                expandedPoseCount += (effective > activeTime) ? 2 : 1;
            }
        });

        const m = Math.floor(finalTotalSecs / 60);
        const s = finalTotalSecs % 60;
        statsEl.textContent = `${expandedPoseCount} poses · ${m}m ${s}s total (incl. reps & sides)`;
    }
}




function movePose(idx, dir) {
    if (idx + dir < 0 || idx + dir >= builderPoses.length) return;
    const temp = builderPoses[idx];
    builderPoses[idx] = builderPoses[idx + dir];
    builderPoses[idx + dir] = temp;
    builderRender();
}

function removePose(idx) {
    builderPoses.splice(idx, 1);
    builderRender();

}



// 1. HELPER FUNCTION: Handles the actual Supabase injection
async function processSemicolonCommand(commandString) {
    const parts = commandString.split(';').map(p => p.trim());
    if (parts.length < 3) return;

    const [title, category, idsStr] = parts;
    
    // Expand ranges (001-005) if any, then split by comma
    const expandedIds = idsStr.replace(/(\d+)\s*-\s*(\d+)/g, (m, start, end) => {
        let r = [];
        for (let i = parseInt(start); i <= parseInt(end); i++) r.push(String(i).padStart(3, '0'));
        return r.join(',');
    });

    const idArray = expandedIds.split(',')
        .map(s => s.trim().padStart(3, '0'))
        .filter(id => id !== "000" && asanaLibrary[id]);

    // Format: ID | Duration | [] (Matches existing DB format with empty notes)
    const sequenceText = idArray.map(id => {
        const a = asanaLibrary[id];
        const duration = a?.hold_data?.standard || 30;
        return `${id} | ${duration} | []`; 
    }).join('\n');

    const payload = {
        title: title,
        category: category,
        sequence_text: sequenceText,
        pose_count: idArray.length,
        updated_at: new Date().toISOString(),
        user_id: window.currentUserId
    };

    const { error } = await supabase.from('user_sequences').insert([payload]);
    if (error) {
        console.error(`❌ Error saving ${title}:`, error.message);
        throw error; // Pass it up to the main try/catch
    }
}





// --- 1. THE LINK SEQUENCE BUTTON ---
const actionRow = document.querySelector('.builder-action-row'); // Adjust selector to your specific container
if (actionRow) {
    const linkBtn = document.createElement("button");
    linkBtn.innerHTML = "🔗 Link Sequence";
    linkBtn.className = "secondary"; // Use your existing secondary button style
    linkBtn.style.marginLeft = "8px";
    
    linkBtn.onclick = () => openLinkSequenceModal();
    actionRow.appendChild(linkBtn);
}

// --- 2. THE SEARCHABLE LINK MODAL ---
function openLinkSequenceModal() {
    // We can use a simple prompt for now, but a searchable dropdown is better.
    // Let's create a tiny temporary overlay or use a prompt with a datalist hint.
    const allTitles = courses.map(c => c.title).filter(Boolean);
    const targetTitle = prompt(`Enter Sequence Title to link:\nAvailable: ${allTitles.join(", ")}`);
    
    if (!targetTitle) return;
    
    // Validate that the course exists
    const exists = courses.find(c => c.title.trim().toLowerCase() === targetTitle.trim().toLowerCase());
    if (!exists) {
        alert("Sequence not found. Please enter the exact title.");
        return;
    }

    const reps = prompt(`How many repetitions for "${exists.title}"?`, "1");
    if (reps === null) return;

    // Add as a Macro row to builderPoses
    
    builderPoses.unshift({ // Changed from .push()
    id: `MACRO:${exists.title}`,
    name: `[Sequence] ${exists.title}`,
    duration: parseInt(reps) || 1,
    variation: "",
    note: `Linked Sequence: ${reps} Rounds`
});

    builderRender(); // Refresh the table
}
/* ==========================================================================
   DATA SAVING (CORE)
   ========================================================================== */

/**
 * Updates a specific field in the main Asana Library LOCALLY.
 */
async function saveAsanaField(asanaNo, field, value) {
    const id = normalizePlate(asanaNo);
    
    // 1. Update Local State
    if (asanaLibrary[id]) {
        asanaLibrary[id][field] = value;
    } else {
        console.error("Asana ID not found:", id);
        return;
    }

    // 2. Save to LocalStorage (Backup)
    
    // 3. Resolve immediately
    return Promise.resolve();
}



/* ==========================================================================
   DATA FETCHING (GET)
   ========================================================================== */

async function fetchDescriptionOverrides() {
    try {
        const res = await fetch(DESCRIPTIONS_OVERRIDE_URL, { cache: "no-store" });
        if (!res.ok) { descriptionOverrides = {}; return; }
        const data = await res.json();
        descriptionOverrides = (data && typeof data === "object") ? data : {};
    } catch (e) { descriptionOverrides = {}; }
}

async function fetchCategoryOverrides() {
    try {
        const res = await fetch(CATEGORY_OVERRIDE_URL, { cache: "no-store" });
        if (!res.ok) { categoryOverrides = {}; return; }
        const data = await res.json();
        categoryOverrides = (data && typeof data === "object") ? data : {};
    } catch (e) { categoryOverrides = {}; }
}

async function fetchAudioOverrides() {
    try {
        const res = await fetch(AUDIO_OVERRIDE_URL, { cache: "no-store" });
        if (res.ok) audioOverrides = await res.json();
    } catch (e) { audioOverrides = {}; }
}

async function fetchImageOverrides() {
    try {
        }

/* ==========================================================================
   DATA APPLICATION (APPLY LEGACY OVERRIDES)
   ========================================================================== */

function applyDescriptionOverrides() {
    Object.keys(asanaLibrary).forEach(id => {
        const key = normalizePlate(id);
        const a = asanaLibrary[id];
        const o = descriptionOverrides && descriptionOverrides[key];
        if (o && typeof o === "object" && typeof o.md === "string") {
            a.description = o.md;
            a.descriptionSource = "override";
        }
    });
}

function applyCategoryOverrides() {
    Object.keys(asanaLibrary).forEach(id => {
        const key = normalizePlate(id);
        const a = asanaLibrary[id];
        const o = categoryOverrides && categoryOverrides[key];
        if (o && typeof o === "object" && typeof o.category === "string" && o.category.trim()) {
            a.category = o.category.trim();
            a.categorySource = "override";
        }
    });
}

/* ==========================================================================
   SPECIALTY TOOLS (ID FIXER)
   ========================================================================== */

function renderIdFixer(container, brokenId) {

    const normBroken = normalizePlate(brokenId);
    const currentAlias = (typeof idAliases !== 'undefined') ? idAliases[normBroken] : null;

    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px dashed #ccc";
    wrap.style.fontSize = "0.85rem";

    let statusHTML = currentAlias 
        ? `<div style="margin-bottom:4px; color:green;">✅ <b>${normBroken}</b> ➝ <b>${currentAlias}</b></div>` 
        : `<div style="margin-bottom:4px; color:#e65100;">🔧 <b>ID ${normBroken}</b> is unlinked</div>`;

    wrap.innerHTML = `
        <div class="adv-section-title" style="margin-top:0; color:#333;">Link / Map Pose</div>
        ${statusHTML}
        <div style="display:flex; gap:5px; margin-top:5px;">
            <input type="text" id="fixerSearch" placeholder="Search pose..." class="tiny" style="flex:1; min-width:80px;">
        </div>
        <select id="fixerSelect" class="tiny" style="width:100%; margin-top:5px; margin-bottom:5px;">
            <option value="">(Type to search...)</option>
        </select>
        <button id="fixerSaveBtn" class="tiny" style="width:100%; background:${currentAlias ? '#2e7d32' : '#e65100'}; color:white;">
            ${currentAlias ? 'Update Link' : 'Link Pose'}
        </button>
    `;

    const searchInput = wrap.querySelector("#fixerSearch");
    const select = wrap.querySelector("#fixerSelect");

    searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        if (q.length < 2) return;
        const asanaIndex = getAsanaIndex();
        const matches = asanaIndex.filter(a =>
            (a.english.toLowerCase().includes(q) || a.asanaNo.includes(q))
        ).slice(0, 10);

        select.innerHTML = "";
        matches.forEach(m => {
            const mainOpt = document.createElement("option");
            mainOpt.value = normalizePlate(m.asanaNo);
            mainOpt.textContent = `[${m.asanaNo}] ${m.english}`;
            select.appendChild(mainOpt);
        });
    };

    wrap.querySelector("#fixerSaveBtn").onclick = async () => {
        const newVal = select.value;
        if (!newVal) return alert("Select target.");
        if (confirm(`Map ID ${normBroken} -> ${newVal}?`)) {
            alert("This requires backend logic for id_aliases.json");
        }
    };
    container.appendChild(wrap);
}
// #endregion
// #region 9. WIRING UP UI ELEMENTS
/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */


// 1. Sequence Dropdown Selection
const seqSelect = $("sequenceSelect");
if (seqSelect) {
    // A. Clean up old bottom sections (Hide them)
    const oldEditSection = $("exportCourseBtn")?.closest("div"); // Heuristic to find the container
    if (oldEditSection) oldEditSection.style.display = "none";
    
    const advancedSection = document.querySelector("details"); // Assuming Advanced is in a <details> tag
    if (advancedSection && advancedSection.textContent.includes("Advanced")) {
        advancedSection.style.display = "none";
    }

    // B. Create the "Edit" and "New" buttons
    if (!document.getElementById("quickEditBtn")) {
        const editBtn = document.createElement("button");
        editBtn.id = "quickEditBtn";
        editBtn.innerHTML = "✏️";
        editBtn.title = "Edit this sequence in the Sequence Builder";
        editBtn.className = "tiny";
        editBtn.style.cssText = "margin-left: 8px; padding: 4px 10px; font-size: 1.1rem; vertical-align: middle;";
        seqSelect.parentNode.insertBefore(editBtn, seqSelect.nextSibling);
        editBtn.onclick = () => {
            if (!currentSequence) return alert("Select a sequence first.");
            openEditCourse();
        };

        const newBtn = document.createElement("button");
        newBtn.id = "newSequenceBtn";
        newBtn.textContent = "+ New";
        newBtn.title = "Create a new sequence from scratch";
        newBtn.className = "tiny";
        newBtn.style.cssText = "margin-left: 4px; padding: 4px 10px; vertical-align: middle;";
        editBtn.parentNode.insertBefore(newBtn, editBtn.nextSibling);
        newBtn.onclick = () => builderOpen("new", null);
    }

    // C. Dropdown Logic (Fixed: Stops timer, Waits for user to click Start)
seqSelect.addEventListener("change", () => {
    const idx = seqSelect.value;
    if (typeof stopTimer === "function") stopTimer(); 
    
    const setStatus = (text) => {
        const el = document.getElementById("statusText") || document.getElementById("status");
        if (el) el.textContent = text;
    };

    if (!idx) {
        currentSequence = null;
        setStatus("Select a sequence");
        if($("collageWrap")) $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`;
        return;
    }

    // --- 1. SET CURRENT SEQUENCE ---
    // (Checks both 'courses' and 'sequences' arrays to be safe)
    const rawSequence = (typeof courses !== "undefined" ? courses : sequences)[parseInt(idx, 10)];
    currentSequence = rawSequence; 
    
    // 👈 EXPOSE TO CONSOLE
    window.currentSequence = currentSequence; 

    // --- 2. GENERATE EXPANDED LIST (MACROS) ---
    if (typeof getExpandedPoses === "function") {
        activePlaybackList = getExpandedPoses(currentSequence);
    } else {
        activePlaybackList = currentSequence.poses ? [...currentSequence.poses] : [];
    }
    
    // 👈 EXPOSE TO CONSOLE
    window.activePlaybackList = activePlaybackList; 

    // --- 3. APPLY SLIDER & UI ---
    if (typeof applyDurationDial === 'function') applyDurationDial();
    if (typeof updateDialUI === 'function') updateDialUI();

    if (typeof updateTotalAndLastUI === 'function') updateTotalAndLastUI();

    try {
        currentIndex = 0; // Ensure we start at the beginning
        setPose(0);
        setStatus("Ready to Start"); 
        const btn = document.getElementById("startStopBtn");
        if (btn) btn.textContent = "Start";
    } catch (e) {
        console.error("Error setting initial pose:", e);
    }
});
}

// IAST Toggle Button
(function setupIASTToggle() {
   const btn = $("iastToggleBtn");
   if (!btn) return;
   function updateBtn() {
      const using = prefersIAST();
      btn.textContent = using ? "IAST" : "English";
      btn.style.opacity = using ? "1" : "0.7";
      btn.title = using ? "Showing IAST names — click for English" : "Showing English names — click for IAST";
   }
   updateBtn();
   btn.addEventListener("click", () => {
      setIASTPref(!prefersIAST());
      updateBtn();
      if (currentSequence) setPose(currentIndex);
   });
})();
function updateLastCompletedPill(){

    const pill = document.getElementById("lastCompletedPill");
    if(!pill) return;
  
    const seq = getCurrentSequenceTitle();
    const last = getLastCompletionForSequence(seq);
  
    if(last){
      pill.textContent =
        "Last: " + new Date(last).toLocaleString();
    }else{
      pill.textContent = "History";
    }
  }

// 2. History Interactions (Clickable Pill)
const lastPill = $("lastCompletedPill");
if (lastPill) {
    lastPill.style.cursor = "pointer";
    lastPill.title = "Click to view full completion history";
    lastPill.style.textDecoration = "underline dotted";

    lastPill.addEventListener("click", () => {
        if (!currentSequence) return alert("Please select a sequence first.");
        openHistoryModal("current");
    });
}

// History Modal & Tabs Logic
const histBackdrop = $("historyBackdrop");
if ($("historyCloseBtn")) $("historyCloseBtn").onclick = () => {
    if(histBackdrop) histBackdrop.style.display = "none";
};

// Tab Switching
const tabCurrent = $("histTabCurrent");
const tabGlobal = $("histTabGlobal");
const viewCurrent = $("histViewCurrent");
const viewGlobal = $("histViewGlobal");

if (tabCurrent && tabGlobal) {
    tabCurrent.onclick = () => switchHistoryTab("current");
    tabGlobal.onclick = () => switchHistoryTab("global");
}

function switchHistoryTab(mode) {
    if (mode === "current") {
        tabCurrent.style.background = "#fff";
        tabCurrent.style.fontWeight = "bold";
        tabCurrent.style.border = "1px solid #ddd";
        
        tabGlobal.style.background = "transparent";
        tabGlobal.style.fontWeight = "normal";
        tabGlobal.style.border = "none";

        viewCurrent.style.display = "block";
        viewGlobal.style.display = "none";
    } else {
        tabGlobal.style.background = "#fff";
        tabGlobal.style.fontWeight = "bold";
        tabGlobal.style.border = "1px solid #ddd";

        tabCurrent.style.background = "transparent";
        tabCurrent.style.fontWeight = "normal";
        tabCurrent.style.border = "none";

        viewCurrent.style.display = "none";
        viewGlobal.style.display = "block";
        renderGlobalHistory(); // Render on demand
    }
}

// Clear History Button — now deletes from Supabase
if ($("clearHistoryBtn")) $("clearHistoryBtn").onclick = async () => {
    if (!currentSequence) return;
    if (!confirm("Clear all completion dates for this sequence?")) return;
    const btn = $("clearHistoryBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Clearing…"; }
    await deleteAllCompletionsForTitle(currentSequence.title);
    if (btn) { btn.disabled = false; btn.textContent = "Clear This Sequence"; }
    openHistoryModal("current");
    updateTotalAndLastUI();
};

async function openHistoryModal(defaultTab = "current") {
    if (!histBackdrop) return;

    const titleEl = $("historyTitle");
    if (titleEl && currentSequence) titleEl.textContent = currentSequence.title;

    const listEl = $("historyList");
    if (listEl && currentSequence) {
        listEl.innerHTML = `<div class="muted" style="padding:8px;">Loading…</div>`;

        // Always pull the freshest data from the unified cache (Supabase-backed)
        const hist = serverHistoryCache || await fetchServerHistory();
        const entries = hist
            .filter(e => e.title === currentSequence.title)
            .sort((a, b) => b.ts - a.ts);

        listEl.innerHTML = "";

        if (entries.length === 0) {
            listEl.innerHTML = `<div class="muted" style="padding:8px;">No completion history yet.</div>`;
        } else {
            // Streak banner
            const streak = calculateStreak(entries.map(e => e.iso));
            if (streak > 0) {
                const streakEl = document.createElement("div");
                streakEl.style.cssText = "padding:8px 10px; background:#e8f5e9; color:#2e7d32; font-weight:bold; border-radius:6px; margin-bottom:8px; font-size:0.9rem;";
                streakEl.textContent = streak === 1
                    ? "Practiced today — keep the momentum!"
                    : `${streak}-day practice streak — well done!`;
                listEl.appendChild(streakEl);
            }

            entries.forEach(e => {
                const row = document.createElement("div");
                row.style.cssText = "padding:8px 4px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; font-size:0.9rem;";
                const d = new Date(e.ts);
                const niceDate = isNaN(d) ? e.local : d.toLocaleDateString("en-AU") + " " + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                const dateSpan = document.createElement("span");
                dateSpan.textContent = niceDate;
                const delBtn = document.createElement("button");
                delBtn.textContent = "✕";
                delBtn.className = "tiny";
                delBtn.style.cssText = "color:#999; border:none; background:transparent; cursor:pointer; font-size:0.8rem;";
                delBtn.title = "Remove this entry";
                delBtn.onclick = async () => {
                    delBtn.disabled = true;
                    await deleteCompletionById(e.id);
                    openHistoryModal("current");
                    updateTotalAndLastUI();
                };
                row.appendChild(dateSpan);
                row.appendChild(delBtn);
                listEl.appendChild(row);
            });
        }
    }

    switchHistoryTab(defaultTab);
    histBackdrop.style.display = "flex";
}

// Render Global Dashboard — reads from the unified Supabase-backed cache
function renderGlobalHistory() {
   const container = $("globalHistoryList");
   if (!container) return;
   container.innerHTML = "";

   const entries = serverHistoryCache || [];
   if (!entries.length) {
      container.innerHTML = `<div class="msg">No history found for any sequence.</div>`;
      return;
   }

   // Build per-title aggregation
   const byTitle = {};
   entries.forEach(e => {
      if (!e.title) return;
      if (!byTitle[e.title]) byTitle[e.title] = { category: e.category || '', isos: [], lastTs: 0 };
      byTitle[e.title].isos.push(e.iso);
      if (e.ts > byTitle[e.title].lastTs) byTitle[e.title].lastTs = e.ts;
   });

   // Overall streak across ALL practice (any sequence)
   const allIsos = entries.map(e => e.iso).filter(Boolean);
   const overallStreak = calculateStreak(allIsos);

   // Total sessions count
   const totalCompletions = entries.length;

   // Stats header
   const statsHeader = document.createElement("div");
   statsHeader.style.cssText = "padding:10px 14px; background:#e8f5e9; border-radius:6px; margin-bottom:12px; font-size:0.9rem;";
   let statsHtml = `<div style="font-weight:bold; font-size:1rem; margin-bottom:4px;">Total sessions: ${totalCompletions}</div>`;
   if (overallStreak > 1) {
      statsHtml += `<div style="color:#2e7d32; font-weight:bold;">${overallStreak}-day practice streak — keep it up!</div>`;
   } else if (overallStreak === 1) {
      statsHtml += `<div style="color:#2e7d32;">Practiced today — great work!</div>`;
   }
   statsHeader.innerHTML = statsHtml;
   container.appendChild(statsHeader);

   // Group by category
   const grouped = {};
   const allSeqs = window.sequences || [];
   const titleToCat = {};
   allSeqs.forEach(s => titleToCat[s.title] = s.category || "Uncategorized");

   Object.keys(byTitle).forEach(title => {
      const cat = byTitle[title].category || titleToCat[title] || "Archived / Removed";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({
         title,
         count: byTitle[title].isos.length,
         lastDate: new Date(byTitle[title].lastTs),
         lastDateStr: new Date(byTitle[title].lastTs).toLocaleDateString("en-AU")
      });
   });

   Object.keys(grouped).sort().forEach(catName => {
      const items = grouped[catName].sort((a, b) => b.lastDate - a.lastDate);

      const section = document.createElement("details");
      section.open = true;
      section.style.cssText = "margin-bottom:10px; border:1px solid #ddd; border-radius:6px; background:#fff;";

      const summary = document.createElement("summary");
      summary.style.cssText = "padding:10px; cursor:pointer; font-weight:bold; background:#f5f5f5; border-radius:6px 6px 0 0;";
      summary.innerHTML = `${catName} <span style="font-weight:normal; color:#666; font-size:0.85em;">(${items.length} sequences)</span>`;

      const content = document.createElement("div");

      items.forEach(item => {
         const row = document.createElement("div");
         row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; font-size:0.9rem;";
         let countColor = "#eee";
         if (item.count > 5) countColor = "#ffe0b2";
         if (item.count > 10) countColor = "#c8e6c9";
         row.innerHTML = `
            <div style="flex:1;">
               <div style="font-weight:600;">${item.title}</div>
               <div style="font-size:0.8rem; color:#888;">Last: ${item.lastDateStr}</div>
            </div>
            <div style="background:${countColor}; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold; margin-left:8px;">
               ${item.count}x
            </div>`;
         content.appendChild(row);
      });

      section.appendChild(summary);
      section.appendChild(content);
      container.appendChild(section);
   });
}

// 2. Playback Controls
safeListen("nextBtn", "click", () => {
    stopTimer();
    nextPose();
});

safeListen("prevBtn", "click", () => {
    stopTimer();
    prevPose();
});

safeListen("startStopBtn", "click", () => {
    if (!currentSequence) return;
    if (!running) startTimer();
    else stopTimer();
});

safeListen("resetBtn", "click", () => {
   // 1. Stop the clock
   stopTimer();

   // 2. WIPE MEMORY (Fixes the "Resume" popup on refresh)
            
   // Optional: Clear internal progress tracking if you use it
   if (typeof clearProgress === "function") clearProgress();

   // 3. RESET DROPDOWN (Fixes the ID: sequenceSelect)
   const dropdown = $("sequenceSelect");
   if (dropdown) dropdown.value = ""; 

   // 4. NULLIFY DATA
   currentSequence = null;
   currentIndex = 0;

   // 5. RESET UI VISUALS (Matched to your specific HTML IDs)
   const titleEl = $("poseName");
   const metaEl = $("poseMeta"); // Used for english/sanskrit subtext
   const collageEl = $("collageWrap"); // Where images go
   const timerEl = $("poseTimer");
   const statusEl = $("statusText");
   const instructionsEl = $("poseInstructions");

   // Reset Title
   if (titleEl) titleEl.innerText = "Select a sequence";
   
   // Reset Meta/Subtitle
   if (metaEl) metaEl.innerText = "";

   // Reset Image Area (Restore the "Select a sequence" message)
   if (collageEl) {
       collageEl.innerHTML = '<div class="msg" id="loadingText">Select a sequence</div>';
   }

   // Reset Timer
   if (timerEl) timerEl.innerText = "–"; // Matching your default HTML

   // Reset Status
   if (statusEl) statusEl.textContent = "Session Reset";
   
   // Reset Instructions
   if (instructionsEl) instructionsEl.textContent = "";
});
// --- DYNAMIC DURATION DIAL LOGIC ---
function getDialPosition() {
    const dial = $("durationDial");
    return dial ? parseInt(dial.value, 10) : 50;
}

function resolveDialAnchors(origDur, asana) {
    const hd = asana && asana.hold_data;
    const defaultDur = origDur;
    const rawShort = (hd && typeof hd.short === 'number') ? hd.short : defaultDur;
    const rawLong  = (hd && typeof hd.long  === 'number') ? hd.long  : defaultDur;
    return {
        short:    Math.min(rawShort, defaultDur),
        defaultDur,
        long:     Math.max(rawLong,  defaultDur)
    };
}

function interpolateDuration(pos, short, defaultDur, long) {
    if (pos === 50) return defaultDur;
    if (pos < 50) {
        const t = pos / 50;
        return Math.round(short + (defaultDur - short) * t);
    }
    const t = (pos - 50) / 50;
    return Math.round(defaultDur + (long - defaultDur) * t);
}

// Change 'function dialReset()' to 'window.dialReset = function()'
window.dialReset = function() {
    const dial = document.getElementById("durationDial");
    if (!dial) return;
    
    dial.value = 50;
    
    // Trigger the logic to update the app
    if (typeof updateDialUI === "function") updateDialUI();
    if (typeof applyDurationDial === "function") applyDurationDial();
    
    // Optional: If you want it to refresh the current pose timer immediately
    if (typeof currentSequence !== "undefined" && currentSequence) {
        if (typeof setPose === "function") setPose(currentIndex);
    }
    
    console.log("Dial reset via touch");
};

function updateDialUI() {
    const dial = $("durationDial");
    const wrap = $("durationDialWrap");
    const label = $("durationDialLabel");
    const estEl = $("durationDialEst");
    if (!dial || !label) return;

    const pos = getDialPosition();

    if (pos === 50) {
        label.textContent = "Default";
    } else if (pos < 50) {
        label.textContent = pos === 0 ? "Shortest" : "Shorter";
    } else {
        label.textContent = pos === 100 ? "Longest" : "Longer";
    }

    if (wrap) {
        wrap.classList.remove("dial-faster", "dial-slower");
        if (pos > 50) wrap.classList.add("dial-faster");
        else if (pos < 50) wrap.classList.add("dial-slower");
    }

    if (estEl && currentSequence && window.currentSequenceOriginalPoses) {
        const total = window.currentSequenceOriginalPoses.reduce((s, p) => {
            const origDur = Number(p[1]) || 0;
            const id = Array.isArray(p[0]) ? p[0][0] : p[0];
            const asana = findAsanaByIdOrPlate ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
            const { short, defaultDur, long } = resolveDialAnchors(origDur, asana);
            const dur = interpolateDuration(pos, short, defaultDur, long);
            return s + (asana && asana.requiresSides ? dur * 2 : dur);
        }, 0);
        estEl.textContent = formatHMS(total);
    } else if (estEl) {
        estEl.textContent = "";
    }
}

const durationDial = document.getElementById("durationDial");
if (durationDial) {
    // 1. Sliding: Updates math and UI dynamically
    durationDial.addEventListener("input", () => {
        // --- START MAGNETIC SNAP LOGIC ---
        let val = parseInt(durationDial.value, 10);
        // If the finger is between 45 and 55, force it to 50
        if (val > 45 && val < 55) {
            durationDial.value = 50;
        }
        // --- END MAGNETIC SNAP LOGIC ---

        if (typeof updateDialUI === "function") updateDialUI();
        if (currentSequence) applyDurationDial();
    });
    
    // 2. Releasing: Just forces one final sync
    durationDial.addEventListener("change", () => {
        if (currentSequence) applyDurationDial();
    });
    
    // 3. Double Click: Reset (Keep for desktop users)
    durationDial.addEventListener("dblclick", () => {
        durationDial.value = 50;
        if (typeof updateDialUI === "function") updateDialUI();
        if (currentSequence) applyDurationDial();
    });
}
function applyDurationDial() {
    if (!currentSequence) return;
    const dial = document.getElementById("durationDial");
    if (!dial) return;
    
    const val = Number(dial.value); // 0 to 100

    // 1. Expand a fresh list from the raw sequence
    const baseList = typeof getExpandedPoses === "function" ? getExpandedPoses(currentSequence) : currentSequence.poses;

    // 2. Apply the dynamic database scale
    window.activePlaybackList = baseList.map(p => {
        let cloned = [...p];
        const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
        
        // Ensure we are looking in window.asanaLibrary for the normalized object
        const lib = window.asanaLibrary || {};
        const key = String(rawId).trim().replace(/^0+/, '').padStart(3, '0');
        const asana = lib[key];

        // NEW: Check for the hold_json column we just created
        if (asana && asana.hold_json && typeof asana.hold_json.standard === 'number') {
            const hj = asana.hold_json;
            
            // Logic: Short (0) | Standard (50) | Long (100)
            const min = hj.short || Math.max(5, Math.round(hj.standard * 0.5));
            const std = hj.standard;
            const max = hj.long  || Math.round(hj.standard * 2.0);
        
            if (val < 50) {
                // Interpolate Short -> Standard
                cloned[1] = Math.round(min + (std - min) * (val / 50));
            } else if (val > 50) {
                // Interpolate Standard -> Long
                cloned[1] = Math.round(std + (max - std) * ((val - 50) / 50));
            } else {
                cloned[1] = std;
            }
        } else {
            // Failsafe: Global % scaling if JSON is missing
            const originalSeconds = Number(cloned[1]) || 30;
            let mult = (val < 50) ? (0.5 + (val / 50) * 0.5) : (1.0 + ((val - 50) / 50) * 1.0);
            cloned[1] = Math.round(originalSeconds * mult);
        }
        return cloned;
    });

    // 3. UI Updates (Labels)
    const label = document.getElementById("durationDialLabel");
    if(label) {
        if (val === 50) label.textContent = "Standard Holds";
        else if (val < 50) label.textContent = "Shorter Holds (-)";
        else label.textContent = "Longer Holds (+)";
    }

    // 4. Update the Active Timer (Mid-pose scaling)
    if (window.activePlaybackList[currentIndex]) {
        const newPoseSeconds = Number(window.activePlaybackList[currentIndex][1]) || 0;
        if (currentPoseSeconds > 0) {
            const ratio = remaining / currentPoseSeconds;
            remaining = Math.round(newPoseSeconds * ratio);
        } else {
            remaining = newPoseSeconds;
        }
        currentPoseSeconds = newPoseSeconds; 
    }

    if (typeof updateTimerUI === "function") updateTimerUI();
    
    // IMPORTANT: Recalculate the "87 poses • 32m 50s" text
    if (typeof builderRender === "function") builderRender();
}



// 3. UI Toggles
safeListen("historyLink", "click", (e) => {
    e.preventDefault();
    toggleHistoryPanel();
});

// Complete Button Logic
safeListen("completeBtn", "click", async () => {
    if (!currentSequence) return;

    const btn = $("completeBtn");
    const originalText = btn.textContent;

    // UI Feedback
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const title = currentSequence.title || "Unknown Sequence";
        const category = currentSequence.category || null;
        const now = new Date();

        // Call the helper from Region 5 with category support
        const success = await appendServerHistory(title, now, category);

        if (success) {
// console.log("✅ Server sync success");
        } else {
// console.warn("⚠️ Saved locally only (Server sync failed)");
        }
        
        // Optional: Play a success sound or visual cue
        alert("Sequence Completed and Logged!");

    } catch (e) {
        console.error("Completion error:", e);
        alert("Error saving progress. See console.");
    } finally {
        // Reset button state
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// -------- COURSE EDITING & EXPORT --------
let editingCourseData = null;
let editingCourseIndex = null;

// ============================================================
// SEQUENCE BUILDER
// ============================================================

let builderPoses = [];  // [{ id, name, duration, note, supabaseRowId? }]
let builderMode = "edit"; // "edit" | "new"
let builderEditingCourseIndex = -1;
let builderEditingSupabaseId = null;

function addHit(el) {
    const id = el.getAttribute('data-id');
    const name = el.getAttribute('data-name');
    
    // Change console log to reflect reality
    console.log("Adding pose to bottom:", name);

    // THE FIX: Change unshift to push
    builderPoses.push({ 
        id: id,
        name: name,
        duration: 30,
        note: ''
    });

    const input = document.getElementById('builderSearch');
    const resBox = document.getElementById('builderSearchResults');
    
    if (input) input.value = '';
    if (resBox) resBox.style.display = 'none';
    
    builderRender();
    if (input) input.focus();
}

function openEditCourse() {
   if (!currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", currentSequence);
}
function builderOpen(mode, seq) {
    builderMode = mode;
    builderPoses = [];
    builderEditingCourseIndex = -1;
    let targetId = seq ? (seq.supabaseId || seq.id) : null;

    // Use your $ helper consistently for all elements at the start
    const catInput = $("builderCategory"); 
    const titleEl = $("builderTitle");
    const modeLabel = $("builderModeLabel");
    const datalist = $("builderCategoryList");

    if (catInput) {
        // Forces re-render to check for "Flow" on every keystroke
        catInput.oninput = () => builderRender(); 
    }

    // Global IDs are short integers (e.g., "170"). User sequences use long UUIDs.
    if (targetId && String(targetId).length < 30) {
        targetId = null;
    }
    builderEditingSupabaseId = targetId;

    document.body.classList.add("modal-open");

    // Populate Category Datalist
    if (catInput && datalist) {
        const allCats = [...new Set(courses.map(c => c.category).filter(Boolean))].sort();
        datalist.innerHTML = allCats.map(c => `<option value="${c}"></option>`).join("");

        let tempVal = "";
        catInput.onfocus = () => { tempVal = catInput.value; catInput.value = ""; };
        catInput.onblur = () => { if (catInput.value === "") catInput.value = tempVal; };
    }

    if (mode === "new") {
       if (modeLabel) modeLabel.textContent = "New Sequence";
       if (titleEl) titleEl.value = "";
       if (catInput) catInput.value = "";
    } else {
       if (!seq) return;
       if (modeLabel) modeLabel.textContent = "Edit Sequence";
       if (titleEl) titleEl.value = seq.title || "";
       if (catInput) catInput.value = seq.category || "";
       
       const libraryArray = Object.values(asanaLibrary || {});
       const rawPoses = (window.currentSequenceOriginalPoses && seq === currentSequence)
           ? window.currentSequenceOriginalPoses : (seq.poses || []);

           rawPoses.forEach(p => {
            const id = String(Array.isArray(p[0]) ? p[0][0] : p[0] || "").padStart(3, '0');
            const asana = libraryArray.find(a => String(a.id) === id);
            
            // THE FIX: Do not include p[3] in this join! 
            // p[3] is the variation key. p[4] already has the brackets.
            let rawExtras = [p[2], p[4]].filter(Boolean).join(" | ").trim();
            let variation = p[3] || ""; 
            let extractedLabel = "";
   
            const bracketMatch = rawExtras.match(/\[(.*?)\]/);
            if (bracketMatch) {
                extractedLabel = bracketMatch[1].trim(); 
                rawExtras = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\|]+/, "").trim();
            } else {
                extractedLabel = rawExtras; rawExtras = "";
            }
   
            // Legacy fuzzy matching (Kept intact)
            if (!variation && asana?.variations && extractedLabel) {
                const sortedKeys = Object.keys(asana.variations).sort((a,b) => b.length - a.length);
                for (const vKey of sortedKeys) {
                    const vData = asana.variations[vKey];
                    const vTitle = (vData?.title || "").toLowerCase();
                    if (extractedLabel.toLowerCase() === vTitle || new RegExp(`\\b${vKey}\\b`, 'i').test(extractedLabel)) {
                        variation = vKey; extractedLabel = ""; break;
                    }
                }
            } else if (variation && extractedLabel === variation) {
                // If it already found the variation, clear the label so it doesn't bleed into notes
                extractedLabel = ""; 
            }
   
            if (extractedLabel && !variation) {
                rawExtras = (extractedLabel + (rawExtras ? " | " + rawExtras : "")).trim();
            }
   
            builderPoses.push({
               id: id,
               name: asana ? (asana.name || displayName(asana)) : id,
               duration: Number(p[1]) || 30,
               variation: variation,
               note: rawExtras // This will now be completely clean
            });
        });
    }
 
    builderRender();
    $("editCourseBackdrop").style.display = "flex";
    setTimeout(() => { if($("builderSearch")) $("builderSearch").focus(); }, 50);
}

function builderUpdateStats() {
   const statsEl = $("builderStats");
   if (!statsEl) return;
   if (!builderPoses.length) { statsEl.textContent = ""; return; }
   const total = builderPoses.reduce((s, p) => s + (p.duration || 0), 0);
   statsEl.textContent = `${builderPoses.length} poses · ${formatHMS(total)} estimated`;
}

function builderCompileSequenceText() {
    return builderPoses.map(p => {
        const idStr = String(p.id);

        if (idStr.startsWith("MACRO:")) {
            return `${idStr} | ${p.duration} | [Sequence Link] ${p.note ? p.note : ''}`;
        }

        const id = String(p.id).padStart(3, '0');
        const dur = p.duration || 30;
        
        // Enforces exact 3-column structure: ID | Duration | [Variation] Note
        const varPart = p.variation ? `[${p.variation}]` : `[]`;
        const notePart = p.note ? p.note.trim() : "";
        
        return `${id} | ${dur} | ${varPart} ${notePart}`.trim();
    }).join("\n");
}

function builderGetTitle() {
   return ($("builderTitle")?.value || "").trim();
}

function builderGetCategory() {
   return ($("builderCategory")?.value || "").trim();
}

async function builderSave() {
    console.log("DB Target ID:", builderEditingSupabaseId);
    console.log("Current User ID:", window.currentUserId);

    // 1. Extract and Validate Data
    const title = builderGetTitle();
    if (!title) { alert("Please enter a title."); return; }
    
    const sequenceText = builderCompileSequenceText();
    const category = builderGetCategory();
    const isFlow = category.toLowerCase().includes("flow"); 
    
    const libraryArray = Object.values(asanaLibrary || {});

    // 2. Calculate Total Time
    const totalSec = builderPoses.reduce((acc, p) => {
        const idStr = String(p.id);
        const durOrReps = Number(p.duration) || 0;

        if (idStr.startsWith("MACRO:")) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const sub = (window.courses || []).find(c => c.title === targetTitle);
            if (sub && sub.poses) {
                const oneRound = sub.poses.reduce((accSub, sp) => accSub + getEffectiveTime(sp[0], sp[1]), 0);
                return acc + (oneRound * durOrReps);
            }
            return acc;
        } else {
            const asana = libraryArray.find(a => String(a.id) === String(p.id));
            const libraryStd = (asana && asana.hold_data) ? asana.hold_data.standard : 30;
            const activeTime = isFlow ? durOrReps : libraryStd;
            return acc + getEffectiveTime(p.id, activeTime);
        }
    }, 0);

    // 3. Database Operation
    try {
        if (!supabase) return;
        let result;

        const payload = {
            title, 
            category, 
            sequence_text: sequenceText,
            pose_count: builderPoses.length, 
            total_seconds: totalSec,
            updated_at: new Date().toISOString()
        };

        if (builderEditingSupabaseId) {
            // Update existing
            result = await supabase.from('user_sequences')
                .update(payload)
                .eq('id', builderEditingSupabaseId)
                .select();
            if (result.error) throw result.error;
        } else {
            // Insert new
            result = await supabase.from('user_sequences').insert([{
                ...payload,
                user_id: window.currentUserId
            }]).select();
            if (result.error) throw result.error;
        }

        // 4. UI Refresh
        await loadCourses(); 
        
        const sel = document.getElementById("sequenceSelect");
        if (sel) {
            const newIdx = courses.findIndex(c => c.title === title);
            if (newIdx !== -1) {
                sel.value = String(newIdx);
                sel.dispatchEvent(new Event('change'));
            }
        }

        document.getElementById("editCourseBackdrop").style.display = "none";
        alert(`"${title}" saved successfully!`);

    } catch(e) {
        console.error("❌ Save failed:", e);
        alert("Failed to save: " + (e.message || "Unknown error"));
    }
}

// Open the Modal and populate the searchable datalist
document.getElementById("btnOpenLinkModal")?.addEventListener("click", () => {
    const datalist = document.getElementById("linkSequenceList");
    if (datalist && window.courses) {
        // Grab all unique sequence titles
        const allTitles = [...new Set(window.courses.map(c => c.title).filter(Boolean))].sort();
        datalist.innerHTML = allTitles.map(t => `<option value="${t}"></option>`).join("");
    }
    
    document.getElementById("linkSequenceInput").value = "";
    document.getElementById("linkSequenceReps").value = "1";
    document.getElementById("linkSequenceOverlay").style.display = "flex";
});

// Confirm and Add to Builder
document.getElementById("btnConfirmLink")?.addEventListener("click", () => {
    const targetTitle = document.getElementById("linkSequenceInput").value.trim();
    const reps = parseInt(document.getElementById("linkSequenceReps").value, 10) || 1;
    
    if (!targetTitle) return alert("Please select a sequence.");

    // Add as a Macro row to the builderPoses array
    builderPoses.unshift({
        id: `MACRO:${targetTitle}`,
        name: `<span class="macro-title-badge">LINK</span> ${targetTitle}`,
        duration: reps, // We store reps in the duration column
        variation: "",
        note: `Repeats: ${reps}x`,
        isMacro: true // Flag it so we can style it in the table render
    });

    document.getElementById("linkSequenceOverlay").style.display = "none";
    
    // Call your function that redraws the table (e.g., builderRender)
    if (typeof builderRender === "function") builderRender();
});

(function setupBuilderSearch() {
    const input = document.getElementById("builderSearch");
    const results = document.getElementById("builderSearchResults");
    if (!input || !results) return;
 
    let debounceTimer;
 
    // NEW HELPER: Strips all accents/diacritics and converts to lowercase
    const normalize = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
 
    function positionResults() {
       const rect = input.getBoundingClientRect();
       results.style.top = (rect.bottom + window.scrollY) + "px";
       results.style.left = rect.left + "px";
       results.style.width = Math.max(rect.width, 280) + "px";
    }
 

    input.addEventListener("input", () => {
        const rawVal = input.value.trim();
    
        // 🚀 BULK ADD DETECTION
        // If the input contains a comma, we assume the user is bulk-adding IDs
        if (rawVal.includes(',')) {
            const idParts = rawVal.split(',').map(s => s.trim()).filter(s => s.length > 0);
            
            // Only trigger bulk add if they've finished typing at least one ID
            // We look for a trailing comma or a multi-ID list
            const lastChar = rawVal.slice(-1);
            if (lastChar !== ',') {
                // Optional: You could wait for 'Enter' for bulk, or just add them as they go.
                // Let's make it add only when they hit 'Enter' or if they paste a whole list.
                return; 
            }
    
            // Process all IDs except the very last one (if it's still being typed)
            const completedIds = idParts;
            
            completedIds.forEach(id => {
                const cleanId = id.padStart(3, '0');
                const asana = asanaLibrary[cleanId];
                
                if (asana) {
                    builderPoses.push({
                        id: cleanId,
                        name: displayName(asana),
                        duration: (asana.hold_data && asana.hold_data.standard) ? asana.hold_data.standard : 30,
                        note: ""
                    });
                }
            });
    
            builderRender();
            input.value = ""; // Clear input after bulk adding
            results.style.display = "none";
            return;
        }
       clearTimeout(debounceTimer);
       debounceTimer = setTimeout(() => {
          const rawQ = input.value.trim();
          const q = normalize(rawQ);
          
          // 1. Minimum character check
          if (q.length < 1) { results.style.display = "none"; return; }
 
          // 2. Smart ID Padding: If user types "1", we also look for "001"
          let paddedQ = "";
          if (/^\d+$/.test(q)) {
             paddedQ = q.padStart(3, '0');
          }
 
          const library = getAsanaIndex();
          const hits = library.filter(a => {
             // Flatten all searchable fields
             const name = normalize(a.name);
             const eng = normalize(a.english);
             const iast = normalize(a.iast);
             const aid = String(a.id || "").toLowerCase();
 
             // Match against normalized query OR padded ID
             return name.includes(q) || 
                    eng.includes(q) || 
                    iast.includes(q) || 
                    aid === q || 
                    (paddedQ && aid === paddedQ);
          }).slice(0, 25); // Increased limit slightly
 
          if (!hits.length) { 
             results.innerHTML = `<div style="padding:10px; color:#999; font-style:italic;">No poses found...</div>`;
             results.style.display = "block";
             positionResults();
             return; 
          }
 
          results.innerHTML = hits.map(a => {
             const dn = displayName(a);
             // Highlight what matched (optional improvement)
             const sub = (a.iast && a.iast !== dn) ? a.iast : (a.english && a.english !== dn ? a.english : "");
             return `<div class="b-search-item" data-id="${a.id}" data-name="${dn.replace(/"/g,'&quot;')}" data-english="${(a.english||"").replace(/"/g,'&quot;')}"
                style="padding:10px 12px; cursor:pointer; border-bottom:1px solid #eee; transition: background 0.2s;">
                <div style="font-weight:600; font-size:0.95rem; color:#111;">${dn}</div>
                ${sub ? `<div style="font-size:0.8rem; color:#666; margin-top:2px;">${sub}</div>` : ""}
                <div style="font-size:0.7rem; color:#aaa; margin-top:4px; font-family:monospace;">ID: ${a.id}</div>
             </div>`;
          }).join("");
 
          results.style.display = "block";
          positionResults();
       }, 150); // Slightly longer debounce for better performance
    });
 
    // Handle Enter key for Batch Posing and Direct-to-DB commands
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            const fullVal = input.value;
            const trimmedVal = fullVal.trim();
            if (!trimmedVal) return;

            // --- A. BATCH/SINGLE SEMICOLON COMMANDS ---
            if (trimmedVal.includes(';')) {
                e.preventDefault();
                const lines = fullVal.split('\n').map(l => l.trim()).filter(l => l.includes(';'));

                if (lines.length > 1) {
                    if (confirm(`Batch Mode: Detected ${lines.length} sequences. Create all now?`)) {
                        try {
                            for (const line of lines) {
                                await processSemicolonCommand(line);
                            }
                            alert(`✓ Successfully processed ${lines.length} sequences!`);
                            input.value = "";
                            await loadCourses();
                        } catch (err) {
                            alert("Batch failed mid-way: " + err.message);
                        }
                    }
                } else {
                    if (confirm(`Save "${trimmedVal.split(';')[0]}" to database?`)) {
                        try {
                            await processSemicolonCommand(trimmedVal);
                            alert("✓ Sequence added!");
                            input.value = "";
                            await loadCourses();
                        } catch (err) {
                            alert("Save failed: " + err.message);
                        }
                    }
                }
                return;
            }

            // --- B. BULK ADD POSES (If just IDs and commas, no semicolons) ---
            if (trimmedVal.includes(',') && !trimmedVal.includes(';')) {
                e.preventDefault();
                const idParts = trimmedVal.split(',').map(s => s.trim().padStart(3, '0')).filter(id => id !== "000" && asanaLibrary[id]);
                
                idParts.forEach(id => {
                    const asana = asanaLibrary[id];
                    builderPoses.push({
                        id: id,
                        duration: asana?.hold_data?.standard || 30
                    });
                });

                builderRender();
                input.value = "";
                results.style.display = "none";
            }
        }
    });

    // Handle selection
    results.addEventListener("click", e => {
       const item = e.target.closest(".b-search-item");
       if (!item) return;
       const library = getAsanaIndex();
       const asana = library.find(a => String(a.id) === String(item.dataset.id));
       
       const defaultDuration = (asana && asana.hold_data && asana.hold_data.standard) ? asana.hold_data.standard : 30;
       
       builderPoses.push({
          id: item.dataset.id,
          name: item.dataset.name,
          englishName: item.dataset.english,
          duration: defaultDuration,
          note: ""
       });
       
       builderRender();
       input.value = "";
       results.style.display = "none";
       input.focus();
    });
 
    // Close on outside click
    document.addEventListener("click", e => {
       if (!input.contains(e.target) && !results.contains(e.target)) {
          results.style.display = "none";
       }
    });
 
    // Blank row helper
const blankBtn = document.getElementById("builderAddBlank");
if (blankBtn) {
   blankBtn.addEventListener("click", () => {
      // 1. Add to the top of the array
      builderPoses.push({ 
          id: "", 
          name: "", 
          englishName: "", 
          duration: 30, 
          variation: "", 
          note: "" 
      });
      
      // 2. THIS IS THE MISSING PIECE: Force the UI to update
      builderRender(); 
      
      // 3. Optional: Auto-focus the ID input of the new top row
      setTimeout(() => {
          const firstIdInput = document.querySelector('.b-id');
          if (firstIdInput) firstIdInput.focus();
      }, 50);
   });
}
 })();


safeListen("editCourseBtn", "click", openEditCourse);
safeListen("editCourseCloseBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open"); // UNLOCK SCROLL
});

safeListen("editCourseCancelBtn", "click", () => { 
    $("editCourseBackdrop").style.display = "none"; 
    document.body.classList.remove("modal-open"); // UNLOCK SCROLL
});
safeListen("editCourseSaveBtn", "click", () => {
   if (!asanaLibrary || Object.keys(asanaLibrary).length === 0) {
      alert("Library is still loading. Please wait.");
      return;
   }
   builderSave();
});
// -------- GITHUB SYNC --------
/**
 * Pushes any JSON object to a specific file in your GitHub Repository
 * @param {string} fileName - e.g., "asana_library.json"
 * @param {Object} data - The JS object to save
 */
async function syncDataToGitHub(fileName, data) {
    const token = getStoredGitHubPAT();
    if (!token) {
        showGitHubPatPrompt((newToken) => syncDataToGitHub(fileName, data));
        return;
    }

    try {
        setGitHubButtonLoading(true);
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`;
        
        // 1. Get the current file's SHA (required by GitHub to update)
        const getRes = await fetch(url, {
            headers: { "Authorization": `token ${token}` }
        });
        const fileData = await getRes.json();
        const sha = fileData.sha;

        // 2. Encode and Push
        const content = encodeToBase64(JSON.stringify(data, null, 2));
        const putRes = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Update ${fileName} via Yoga App`,
                content: content,
                sha: sha
            })
        });

        if (!putRes.ok) throw new Error(`GitHub Save Failed: ${putRes.status}`);

        showGitHubStatus(`✓ ${fileName} synced to GitHub!`);
    } catch (error) {
        console.error(error);
        showGitHubStatus(`Error syncing ${fileName}: ${error.message}`, true);
    } finally {
        setGitHubButtonLoading(false);
    }
}
// -------- GITHUB HELPERS (REQUIRED) --------

const GITHUB_REPO = "markopie/Yoga-App-Evolution"; // Ensure this matches your repo
const GH_PAT_STORAGE_KEY = "gh_pat";

function getStoredGitHubPAT() {
    return localStorage.getItem(GH_PAT_STORAGE_KEY) || null;
}

function storeGitHubPAT(token, remember) {
    if (remember) {
        localStorage.setItem(GH_PAT_STORAGE_KEY, token);
    } else {
        // If not remembering, we still return it, but you might want to store in session or memory
        // For simplicity in this app, we usually store it or ask every time.
        // This simple implementation relies on LocalStorage.
        localStorage.setItem(GH_PAT_STORAGE_KEY, token); 
    }
    return token;
}

function showGitHubPatPrompt(callback) {
    // Create simple prompt if custom UI doesn't exist
    let token = prompt("Please enter your GitHub Personal Access Token (PAT) to save changes:");
    if (token) {
        storeGitHubPAT(token, true);
        if (callback) callback(token);
    }
}

function setGitHubButtonLoading(isLoading) {
    // Optional: Visual feedback if you have a specific button
    const btn = document.getElementById("syncGitHubBtn");
    if(btn) btn.disabled = isLoading;
}

function showGitHubStatus(msg, isError = false) {
    const el = document.getElementById("statusText");
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? "red" : "green";
        setTimeout(() => el.style.color = "", 5000);
    }
    if (isError) alert(msg);
}

// Helper to encode string to Base64 (UTF-8 safe)
function encodeToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

/* ==========================================================================
   FULL ASANA EDITOR (Supabase Upsert)
   ========================================================================== */

   window.openAsanaEditor = async function(id) {

    const bd = $("asanaEditorBackdrop");

    if (!bd) {
        console.error("asanaEditorBackdrop not found!");
        return alert("Editor HTML missing");
    }
    bd.style.display = "flex";
    // Populate Category Datalist dynamically
    const dl = $("asanaCategoryList");
    if (dl) {
        dl.innerHTML = "";
        getUniqueCategories().forEach(c => {
            const opt = document.createElement("option");
            opt.value = getDisplayCategory(c); // Use the clean display helper
            dl.appendChild(opt);
        });
    }

    // Wipe fields clean
    $("editAsanaId").value = "";
    $("editAsanaName").value = "";
    $("editAsanaIAST").value = "";
    $("editAsanaEnglish").value = "";
    $("editAsanaCategory").value = "";
    if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = "";
    if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = "";
    if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = "";
    $("editAsanaPlates").value = "";
    $("editAsanaPage2001").value = "";
    $("editAsanaPage2015").value = "";
    $("editAsanaIntensity").value = "";
    $("editAsanaNote").value = "";
    $("editAsanaDescription").value = "";
    $("editAsanaTechnique").value = "";
    $("editAsanaRequiresSides").checked = false;
    $("stagesContainer").innerHTML = "";
    $("asanaEditorStatus").textContent = "";

    // If ID is provided, we are EDITING
    if (id) {
        $("asanaEditorTitle").textContent = `Edit Asana: ${id}`;
        const a = asanaLibrary[id] || {};

        $("editAsanaId").value = a.id || a.asanaNo || id;
        $("editAsanaName").value = a.name || "";
        $("editAsanaIAST").value = a.iast || a.IAST || "";
        $("editAsanaEnglish").value = a.english || a.english_name || "";
        $("editAsanaCategory").value = a.category || "";

     
    

        // We check a.Hold (Supabase) and a.hold (Local/Legacy)
        const holdData = parseHoldTimes(a.Hold || a.hold || "");
        if ($("editAsanaHoldStandard")) $("editAsanaHoldStandard").value = holdData.standard;
        if ($("editAsanaHoldShort")) $("editAsanaHoldShort").value = holdData.short;
        if ($("editAsanaHoldLong")) $("editAsanaHoldLong").value = holdData.long;
        let pStr = "";
        if (a.plates && (a.plates.final || a.plates.intermediate)) {
            if (a.plates.final && a.plates.final.length) pStr += `Final: ${a.plates.final.join(", ")}`;
            if (a.plates.intermediate && a.plates.intermediate.length) {
                if (pStr) pStr += " ";
                pStr += `Intermediate: ${a.plates.intermediate.join(", ")}`;
            }
        } else {
            pStr = a.plate_numbers || "";
        }
        $("editAsanaPlates").value = pStr;

        $("editAsanaPage2001").value = a.page2001 || a.Page_2001 || "";
        $("editAsanaPage2015").value = a.page2015 || a.Page_2015 || "";
        $("editAsanaIntensity").value = a.intensity || a.Intensity || "";
        $("editAsanaNote").value = a.note || a.Note || "";
        $("editAsanaDescription").value = a.description || a.Description || "";
        $("editAsanaTechnique").value = a.technique || a.Technique || "";
        $("editAsanaRequiresSides").checked = !!(a.requiresSides || a.Requires_Sides);

        if (a.variations) {
            Object.entries(a.variations).forEach(([sKey, sData]) => {
                addStageToEditor(sKey, sData);
            });
        }

        try {
            const paddedId = String(id).padStart(3, '0');
            const { data: userStages } = await supabase.from('user_stages').select('*').eq('asana_id', paddedId);
            if (userStages && userStages.length > 0) {
                userStages.forEach((stage) => {
                    const stageKey = stage.stage_name || '';
                    if (!$("stagesContainer").querySelector(`input.stage-key[value="${stageKey}"]`)) {
                        addStageToEditor(stageKey, {
                            id: stage.id,
                            stage_name: stageKey,
                            title: stage.title || '',
                            shorthand: stage.shorthand || '',
                            full_technique: stage.full_technique || '',
                            hold: stage.hold || ''
                        });
                    }
                });
            }
        } catch (e) {
// console.warn("Could not load user stages for editor:", e.message);
        }
    } else {
        // We are ADDING NEW
        $("asanaEditorTitle").textContent = "Add New Asana";
        $("editAsanaId").value = getNextAsanaId(); // Auto-calculate next ID
    }

    // Snapshot initial field values for change detection
    window._asanaEditorSnapshot = null;
    window._asanaEditorOriginalStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
    window._asanaEditorOriginalStageData = null;
    requestAnimationFrame(() => {
        window._asanaEditorSnapshot = {
            name: $("editAsanaName").value,
            iast: $("editAsanaIAST").value,
            english_name: $("editAsanaEnglish").value,
            technique: $("editAsanaTechnique").value,
            plate_numbers: $("editAsanaPlates").value,
            requires_sides: $("editAsanaRequiresSides").checked,
            page_2001: $("editAsanaPage2001").value,
            page_2015: $("editAsanaPage2015").value,
            intensity: $("editAsanaIntensity").value,
            note: $("editAsanaNote").value,
            category: $("editAsanaCategory").value,
            description: $("editAsanaDescription").value,
            holdStd: $("editAsanaHoldStandard")?.value,
            holdShort: $("editAsanaHoldShort")?.value,
            holdLong: $("editAsanaHoldLong")?.value,
            stageCount: $("stagesContainer").querySelectorAll(".stage-row").length
        };
        window._asanaEditorOriginalStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
            key: div.querySelector(".stage-key")?.value || "",
            prefix: div.querySelector(".stage-prefix")?.value || "",
            suffix: div.querySelector(".stage-suffix")?.value || "",
            short: div.querySelector(".stage-short")?.value || "",
            tech: div.querySelector(".stage-tech")?.value || "",
            holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
            holdShort: div.querySelector(".stage-hold-short")?.value || "",
            holdLong: div.querySelector(".stage-hold-long")?.value || ""
        }));
    });

};

async function getNextRomanNumeral() {
    // Expanded up to 20 variations
    const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X",
                   "XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
    
    const asanaId = $("editAsanaId").value.trim().padStart(3, '0');
    const inDom = Array.from($("stagesContainer").querySelectorAll(".stage-key")).map(el => el.value.trim().toUpperCase());
    const taken = new Set(inDom);

    if (supabase && asanaId) {
        try {
            // THE FIX: Use .eq('asana_id', asanaId) instead of .contains('parent_id')
            const [{ data: s1 }, { data: s2 }] = await Promise.all([
                supabase.from('stages').select('"Stage_Name", stage_name').eq('asana_id', asanaId),
                supabase.from('user_stages').select('"Stage_Name", stage_name').eq('asana_id', asanaId)
            ]);
            
            // Safely check both Title Case and lowercase column names
            (s1 || []).forEach(r => {
                const name = r.Stage_Name || r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
            (s2 || []).forEach(r => {
                const name = r.Stage_Name || r.stage_name;
                if (name) taken.add(String(name).toUpperCase());
            });
        } catch (e) {
// console.warn("Could not query stage names for Roman numeral calc:", e.message);
        }
    }

    for (const r of ROMAN) {
        if (!taken.has(r)) return r;
    }
    return String(taken.size + 1); // Fallback to numbers if they exceed 20
}

function getVariationSuffixes() {
    const suffixes = new Set();
    const asanaId = $("editAsanaId").value.trim().padStart(3, '0');
    const asana = asanaLibrary[asanaId];
    if (asana && asana.variations) {
        Object.values(asana.variations).forEach(vData => {
            const title = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
            const suffix = title.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
            if (suffix) suffixes.add(suffix);
        });
    }
    Array.from($("stagesContainer").querySelectorAll(".stage-row")).forEach(row => {
        const suf = row.querySelector(".stage-suffix");
        if (suf && suf.value.trim()) suffixes.add(suf.value.trim());
    });
    return Array.from(suffixes).sort();
}

window.addStageToEditor = async function(stageKey = "", stageData = {}) {
    const container = $("stagesContainer");

    const autoKey = stageKey || await getNextRomanNumeral();
    const existingTitle = typeof stageData === 'object' ? (stageData.title || stageData.Title || "") : "";
    const prefixMatch = existingTitle.match(/^(Modified|Stage)\s+/i);
    const prefix = prefixMatch ? prefixMatch[1] : "Modified";
    const suffix = existingTitle.replace(/^(Modified|Stage)\s+[IVXLCDM]+\s*/i, "").trim();
    const existingShorthand = typeof stageData === 'object' ? (stageData.shorthand || stageData.Shorthand || "") : "";
    const existingTech = typeof stageData === 'object' ? (stageData.full_technique || stageData.Full_Technique || stageData.technique || "") : (stageData || "");
    const existingDbId = typeof stageData === 'object' ? (stageData.id || stageData.db_id || "") : "";

    const existingHoldStr = typeof stageData === 'object' ? (stageData.hold || stageData.Hold || "") : "";
    const parsedHold = parseHoldTimes(existingHoldStr);
    const holdStd  = existingHoldStr ? parsedHold.standard : 30;
    const holdShort = existingHoldStr ? parsedHold.short    : 15;
    const holdLong  = existingHoldStr ? parsedHold.long     : 60;

    const suffixes = getVariationSuffixes();
    const datalistId = `stageSuffixList_${Date.now()}`;

    const div = document.createElement("div");
    div.className = "stage-row";
    div.dataset.dbId = existingDbId;
    div.style.cssText = "border:1px solid #ddd; padding:10px; border-radius:6px; background:#fff; display:grid; gap:8px;";

    div.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
           <div style="min-width:60px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Key</label>
               <input type="text" class="stage-key" value="${autoKey}" readonly style="width:60px; padding:6px; font-weight:bold; background:#f5f5f5; text-align:center; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="min-width:110px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Prefix</label>
               <select class="stage-prefix" style="padding:6px; border:1px solid #ccc; border-radius:4px; background:#fff; min-height:unset;">
                   <option value="Modified" ${prefix === "Modified" ? "selected" : ""}>Modified</option>
                   <option value="Stage" ${prefix === "Stage" ? "selected" : ""}>Stage</option>
               </select>
           </div>
           <div style="flex:2; min-width:140px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Description / Suffix</label>
               <input type="text" class="stage-suffix" list="${datalistId}" value="${suffix}" placeholder="e.g. (on a bolster)" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
               <datalist id="${datalistId}">${suffixes.map(s => `<option value="${s}">`).join("")}</datalist>
           </div>
           <div style="min-width:100px;">
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Shorthand</label>
               <input type="text" class="stage-short" value="${existingShorthand}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div style="display:flex; align-items:flex-end; padding-bottom:2px;">
               <button type="button" class="tiny warn remove-stage-btn">✕ Remove</button>
           </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Short Hold (s)</label>
               <input type="number" class="stage-hold-short" min="0" value="${holdShort}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Standard Hold (s)</label>
               <input type="number" class="stage-hold-standard" min="0" value="${holdStd}" style="width:80px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
           <div>
               <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:3px;">Long Hold (s)</label>
               <input type="number" class="stage-hold-long" min="0" value="${holdLong}" style="width:70px; padding:6px; border:1px solid #ccc; border-radius:4px;">
           </div>
        </div>
        <div>
           <label class="muted" style="font-size:0.75rem;">Technique</label>
           <textarea class="stage-tech" style="height:60px; padding:6px; width:100%; font-family:inherit; border:1px solid #ccc; border-radius:4px;">${existingTech}</textarea>
        </div>
    `;

    div.querySelector(".remove-stage-btn").onclick = () => div.remove();
    container.appendChild(div);
};

// Apply UI Interactivity on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    if ($("asanaEditorCloseBtn")) $("asanaEditorCloseBtn").onclick = () => $("asanaEditorBackdrop").style.display = "none";
    if ($("addStageBtn")) $("addStageBtn").onclick = () => addStageToEditor();

    if ($("asanaEditorSaveBtn")) {
        $("asanaEditorSaveBtn").onclick = async () => {
            const rawId = $("editAsanaId").value.trim();
            if (!rawId) return alert("ID is required.");
            const id = rawId.padStart(3, '0');

            const snap = window._asanaEditorSnapshot;
            if (snap) {
                const currentStageCount = $("stagesContainer").querySelectorAll(".stage-row").length;
                const current = {
                    name: $("editAsanaName").value,
                    iast: $("editAsanaIAST").value,
                    english_name: $("editAsanaEnglish").value,
                    technique: $("editAsanaTechnique").value,
                    plate_numbers: $("editAsanaPlates").value,
                    requires_sides: $("editAsanaRequiresSides").checked,
                    page_2001: $("editAsanaPage2001").value,
                    page_2015: $("editAsanaPage2015").value,
                    intensity: $("editAsanaIntensity").value,
                    note: $("editAsanaNote").value,
                    category: $("editAsanaCategory").value,
                    description: $("editAsanaDescription").value,
                    holdStd: $("editAsanaHoldStandard")?.value,
                    holdShort: $("editAsanaHoldShort")?.value,
                    holdLong: $("editAsanaHoldLong")?.value,
                    stageCount: currentStageCount
                };
                
                const stageCountChanged = currentStageCount !== (window._asanaEditorOriginalStageCount ?? snap.stageCount);
                const currentStageData = Array.from($("stagesContainer").querySelectorAll(".stage-row")).map(div => ({
                    key: div.querySelector(".stage-key")?.value || "",
                    short: div.querySelector(".stage-short")?.value || "",
                    tech: div.querySelector(".stage-tech")?.value || "",
                    holdStandard: div.querySelector(".stage-hold-standard")?.value || "",
                    holdShort: div.querySelector(".stage-hold-short")?.value || "",
                    holdLong: div.querySelector(".stage-hold-long")?.value || ""
                }));
                const originalStageData = window._asanaEditorOriginalStageData || [];
                const stageDataChanged = JSON.stringify(currentStageData) !== JSON.stringify(originalStageData);
                const fieldsUnchanged = Object.keys(snap).every(k => snap[k] === current[k]);

                if (!stageCountChanged && !stageDataChanged && fieldsUnchanged) {
                    $("asanaEditorStatus").textContent = "No changes made.";
                    $("asanaEditorStatus").style.color = "#888";
                    setTimeout(() => { $("asanaEditorStatus").textContent = ""; }, 2500);
                    return;
                }
            }

            const btn = $("asanaEditorSaveBtn");
            btn.disabled = true;
            btn.textContent = "Saving...";
            
            let userId = null;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                userId = user?.id;
            } catch (e) { console.warn("User ID fetch failed:", e.message); }

            const asanaHoldStr = buildHoldString(
                parseInt($("editAsanaHoldStandard")?.value || "30", 10),
                parseInt($("editAsanaHoldShort")?.value || "15", 10),
                parseInt($("editAsanaHoldLong")?.value || "60", 10)
            );

            const asanaData = {
                id: id,
                user_id: userId,
                name: $("editAsanaName").value.trim(),
                iast: $("editAsanaIAST").value.trim(),
                english_name: $("editAsanaEnglish").value.trim(),
                technique: $("editAsanaTechnique").value.trim(),
                plate_numbers: $("editAsanaPlates").value.trim(),
                requires_sides: $("editAsanaRequiresSides").checked,
                page_2001: $("editAsanaPage2001").value.trim() || null,
                page_2015: $("editAsanaPage2015").value.trim() || null,
                intensity: $("editAsanaIntensity").value.trim() || null,
                note: $("editAsanaNote").value.trim(),
                category: formatCategoryName($("editAsanaCategory").value.trim()),
                description: $("editAsanaDescription").value.trim(),
                hold: asanaHoldStr
            };

            try {
                // Save Main Asana
                if (supabase && userId) {
                    const { error: asanaErr } = await supabase
                        .from('user_asanas')
                        .upsert(asanaData, { onConflict: 'id' });
                    if (asanaErr) throw new Error(asanaErr.message);

                    // Process Variations
                    const stageDivs = $("stagesContainer").querySelectorAll(".stage-row");
                    const localVariations = {};

                    for (const div of stageDivs) {
                        const key = div.querySelector(".stage-key").value.trim();
                        if (!key) continue;
                        
                        const pfx = div.querySelector(".stage-prefix")?.value.trim() || "Modified";
                        const sfx = div.querySelector(".stage-suffix")?.value.trim() || "";
                        const holdStr = buildHoldString(
                            parseInt(div.querySelector(".stage-hold-standard")?.value || "30", 10),
                            parseInt(div.querySelector(".stage-hold-short")?.value || "15", 10),
                            parseInt(div.querySelector(".stage-hold-long")?.value || "60", 10)
                        );
                        const dbId = div.dataset.dbId || "";

                        const payload = {
                            user_id: userId,
                            asana_id: id,
                            stage_name: key,
                            title: sfx ? `${pfx} ${key} ${sfx}` : `${pfx} ${key}`,
                            full_technique: div.querySelector(".stage-tech")?.value.trim() || null,
                            shorthand: div.querySelector(".stage-short")?.value.trim() || null,
                            hold: holdStr
                        };

                        if (dbId && dbId.includes('-')) {
                            await supabase.from('user_stages').update(payload).eq('id', dbId);
                        } else {
                            const { data: newRow } = await supabase.from('user_stages').insert(payload).select().single();
                            if (newRow) div.dataset.dbId = newRow.id;
                        }

                        localVariations[key] = {
                            title: payload.title,
                            shorthand: payload.shorthand,
                            full_technique: payload.full_technique,
                            hold: holdStr,
                            hold_data: parseHoldTimes(holdStr),
                            isCustom: true
                        };
                    }

                    // Update local memory
                    asanaLibrary[id] = {
                        ...asanaLibrary[id],
                        ...asanaData,
                        english: asanaData.english_name,
                        hold_data: parseHoldTimes(asanaData.hold),
                        variations: { ...asanaLibrary[id].variations, ...localVariations },
                        isCustom: true
                    };

                    $("asanaEditorStatus").textContent = "✓ Saved Successfully!";
                    setTimeout(() => {
                        $("asanaEditorBackdrop").style.display = "none";
                        btn.disabled = false;
                        btn.textContent = "Save Asana";
                        if (window.showAsanaDetail) showAsanaDetail(asanaLibrary[id]);
                    }, 1000);
                }
            } catch (e) {
                console.error(e);
                alert("Error saving: " + e.message);
                btn.disabled = false;
                btn.textContent = "Save Asana";
            }
        };
    }
});

// --- DYNAMIC HELPERS ---
function getNextAsanaId() {
    if (typeof asanaLibrary === 'undefined') return "001";
    let next = 1;
    while (asanaLibrary[String(next).padStart(3, '0')]) {
        next++;
    }
    return String(next).padStart(3, '0');
}

function getUniqueCategories() {
    const cats = new Set();
    if (typeof asanaLibrary !== 'undefined') {
        Object.values(asanaLibrary).forEach(a => {
            if (a.category) cats.add(a.category.trim());
        });
    }
    return Array.from(cats).sort();
}
function getDisplayCategory(cat) {
    if (!cat) return "";
    return cat.replace(/^\d+_/, '').replace(/_/g, ' ');
}

function formatCategoryName(inputCat) {
    if (!inputCat) return "";
    const cleanInput = inputCat.trim().replace(/\s+/g, '_');
    const existingCats = getUniqueCategories();
    
    if (existingCats.includes(inputCat)) return inputCat;
    
    const match = existingCats.find(c => c.replace(/^\d+_/, '').toLowerCase() === cleanInput.toLowerCase());
    if (match) return match; 
    
    let maxPrefix = 0;
    existingCats.forEach(c => {
        const m = c.match(/^(\d+)_/);
        if (m && parseInt(m[1], 10) > maxPrefix) maxPrefix = parseInt(m[1], 10);
    });
    
    const nextPrefix = String(maxPrefix + 1).padStart(2, '0');
    return `${nextPrefix}_${cleanInput}`;
}


// 4. APP STARTUP (Auth-Gated)
// console.log("Script parsed. Attempting startup...");

function showApp() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("mainAppContainer").style.display = "";
    if (!window.appInitialized) {
        init();
    }
}

function showLogin() {
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("mainAppContainer").style.display = "none";
}

function setupAuthListeners() {
    const googleBtn = document.getElementById("googleSignInBtn");
    const skipBtn = document.getElementById("skipLoginBtn");
    const signOutBtn = document.getElementById("signOutBtn");
    const loginError = document.getElementById("loginError");

    if (googleBtn) {
        googleBtn.onclick = async () => {
            googleBtn.disabled = true;
            googleBtn.textContent = "Redirecting…";
            loginError.style.display = "none";
            
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) {
                loginError.textContent = error.message;
                loginError.style.display = "block";
                googleBtn.disabled = false;
                googleBtn.textContent = "Sign in with Google";
            }
        };
    }

    if (skipBtn) {
        skipBtn.onclick = () => {
            window.isGuestMode = true;
            window.currentUserId = null;
            showApp();
        };
    }

    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (window.isGuestMode) {
                window.isGuestMode = false;
                showLogin();
            } else {
                await supabase.auth.signOut();
            }
        };
    }

    supabase.auth.onAuthStateChange((event, session) => {
        
        if (session && session.user) {
            window.isGuestMode = false;
            window.currentUserId = session.user.id;
            showApp();
        } else if (!window.isGuestMode) {
            window.currentUserId = null;
            showLogin();
        }
    });
}

// --- NEW AUTONOMOUS RESET LISTENER ---
// Put this at the very bottom of app.js
(function() {
    const attachResetListener = () => {
        const resetText = document.getElementById("dialResetBtn");
        if (!resetText) return;

        const performReset = (e) => {
            // Log for Chrome Console tracking
            console.log(`[MobileReset] ${e.type} detected`);
            
            const dial = document.getElementById("durationDial");
            if (!dial) return;

            // Stop scrolling/zooming
            if (e.cancelable) e.preventDefault(); 

            dial.value = 50;

            // Manually trigger 'input' so the existing slider logic hears the change
            dial.dispatchEvent(new Event('input', { bubbles: true }));
            dial.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Force a UI refresh if the helpers exist
            if (typeof updateDialUI === "function") updateDialUI();
            
            console.log("[MobileReset] Snapped to 50");
        };

        // Use passive: false to allow e.preventDefault() on mobile
        resetText.addEventListener("touchend", performReset, { passive: false });
        resetText.addEventListener("click", performReset);
    };

    // Run once on load, and again if the DOM changes (in case it's in a modal)
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attachResetListener);
    } else {
        attachResetListener();
    }
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthListeners);
} else {
    setupAuthListeners();
}

// #endregion
// Last structural fix: Thu Mar  5 11:52:00 PM UTC 2026
// Build Fix: Thu Mar  5 11:52:35 PM UTC 2026
