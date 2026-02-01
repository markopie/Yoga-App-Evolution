// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & CONSTANTS
   ========================================================================== */

// 1. Data Sources (GitHub Raw URLs)
const BASE_RAW_URL = "https://raw.githubusercontent.com/markopie/Yoga-App-Evolution/main/";
const COURSES_URL = `${BASE_RAW_URL}courses.json`;
const MANIFEST_URL = `${BASE_RAW_URL}manifest.json`;
const ASANA_LIBRARY_URL = `${BASE_RAW_URL}asana_library.json`;
const LIBRARY_URL = ASANA_LIBRARY_URL;

// Overrides
const DESCRIPTIONS_OVERRIDE_URL = `${BASE_RAW_URL}descriptions_override.json`;
const CATEGORY_OVERRIDE_URL = `${BASE_RAW_URL}category_overrides.json`;
const IMAGE_OVERRIDE_URL = `${BASE_RAW_URL}image_overrides.json`;
const AUDIO_OVERRIDE_URL = `${BASE_RAW_URL}audio_overrides.json`;
const ID_ALIASES_URL = `${BASE_RAW_URL}id_aliases.json`;

// 2. Paths (Static assets stay on your host)
// We name these exactly what the functions look for: IMAGES_BASE and AUDIO_BASE
const IMAGES_BASE = "https://arrowroad.com.au/yoga/images/";
const AUDIO_BASE = "https://arrowroad.com.au/yoga/audio/";
const IMAGES_BASE_URL = IMAGES_BASE; // Kept for safety if legacy code uses it

// 4. Other
const COMPLETION_LOG_URL = "completion_log.php";
const LOCAL_SEQ_KEY = "yoga_sequences_v1";

// 5. Supabase Configuration
const SUPABASE_URL = "https://yonzdrhewxwaowfyuglx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlvbnpkcmhld3h3YW93Znl1Z2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDE5MjcsImV4cCI6MjA4NDY3NzkyN30.I3L9kAXs-5Ggq1TxnE-GZoYWGITg9kUcUCTw0l-LvG8";
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;


/* ==========================================================================
   GLOBAL STATE VARIABLES
   ========================================================================== */

// Data storage
let courses = [];
let sequences = [];  // For backwards compatibility during transition
let asanaLibrary = {};  // JSON object keyed by ID (e.g. "003" -> pose data)
let plateGroups = {};   // "18" -> ["18","19"] (optional)

// Admin Overrides
let imageOverrides = {};
let audioOverrides = {}; 
let serverAudioFiles = []; // Holds the list of files on server
let serverImageFiles = [];
let idAliases = {};

// Playback State
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

const ADMIN_MODE_KEY = "yogaAdminMode_v1";
let adminMode = false;
let descriptionOverrides = {}; // { [asanaNo]: { md: string, updated_at: string } }
let categoryOverrides = {}; // { [asanaNo]: { category: string, updated_at: string } }


// #endregion
// #region 2. SYSTEM & AUDIO
/* ==========================================================================
   DOM & SYSTEM UTILITIES
   ========================================================================== */

function $(id) {
   return document.getElementById(id);
}

// Store registered listeners to prevent duplicates
const registeredListeners = new Map();

function safeListen(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) return;

    const key = `${id}:${event}`;

    // Remove previous listener if it exists
    if (registeredListeners.has(key)) {
        const oldHandler = registeredListeners.get(key);
        el.removeEventListener(event, oldHandler);
    }

    // Add new listener and store reference
    el.addEventListener(event, handler);
    registeredListeners.set(key, handler);
}

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
    
    console.log(`[Audio Debug] Playing ID: ${idStr}, Name: ${asana.english || asana.name}`);

    // Helper to play and attach the 'onended' listener
    const playSrc = (src) => {
        const a = new Audio(src);
        // CRITICAL: Attach the callback so side audio plays next
        if (onComplete) {
            a.onended = onComplete;
        }
        a.play()
            .then(() => { currentAudio = a; })
            .catch(e => {
                console.warn(`[Audio Debug] Failed: ${src}`, e);
                // If main audio fails, still trigger callback so flow continues
                if (onComplete) onComplete();
            });
    };

    // 3. Override Check
    let overrideSrc = null;
    if (typeof audioOverrides !== 'undefined') {
        const norm = (s) => String(s || "").trim();
        const mainName = (asana.english || asana.name || asana['Yogasana Name'] || "").trim();
        const variation = (asana.variation || asana['Variation'] || "").trim();
        const specificKey = variation ? `${mainName} ${variation}` : mainName;

        if (specificKey && audioOverrides[norm(specificKey)]) {
            overrideSrc = audioOverrides[norm(specificKey)];
        } else if (idStr && audioOverrides[idStr]) {
            overrideSrc = audioOverrides[idStr];
        }
    }

    if (overrideSrc) {
       console.log(`[Audio Debug] Using Override: ${overrideSrc}`);
       const src = overrideSrc.includes("/") ? overrideSrc : (AUDIO_BASE + overrideSrc);
       playSrc(src);
       return; 
    }
 
    // 4. SMART FALLBACK (Manifest Lookup)
    const fileList = window.serverAudioFiles || [];
    
    if (fileList.length > 0 && idStr) {
        // Look for "001_Name.mp3" OR "001.mp3"
        const match = fileList.find(f => f.startsWith(`${idStr}_`) || f === `${idStr}.mp3`);
        
        if (match) {
            console.log(`[Audio Debug] FOUND MATCH: ${match}`);
            playSrc(AUDIO_BASE + match);
            return;
        }
    }

    // 5. Legacy Fallback (If not in manifest)
    console.log("[Audio Debug] Falling back to legacy guessing...");
    
    // If no ID found at all, skip
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
        console.warn("Legacy guess failed too.");
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
       english: asana.name || "",
       'Yogasana Name': asana.name || "",
       variation: "", // Variations are now in variations object
       inlineVariations: asana.variations ? Object.keys(asana.variations).map(key => ({
          label: key,
          text: asana.variations[key]
       })) : [],
       allPlates: [id] // For search compatibility
    };
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
   if (!text) return "";
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

// 1. Generic JSON Loader
async function loadJSON(url, fallback = null) {
    try {
        // ✅ FIX: Use the 'url' passed to the function, not HISTORY_URL
        const res = await fetch(url);
        if (!res.ok) {
             console.warn(`Fetch failed ${res.status} for ${url}`);
             return fallback;
        }
        return await res.json();
    } catch (e) {
        console.warn(`Error loading ${url}:`, e);
        return fallback;
    }
}

// 2. Load Courses
async function loadCourses() {
    // 1. Load Data
    const data = await loadJSON(COURSES_URL, []);
 
    // 2. Validate
    if (!Array.isArray(data) || data.length === 0) {
       console.error("Failed to load courses.json - using empty array");
       courses = [];
       sequences = [];
       return;
    }
 
    // 3. Assign Globals
    // Filter out bad data and ensure global variables are set
    courses = data.filter(c => c && c.title && Array.isArray(c.poses));
    sequences = courses;
    window.courses = courses; 
    
    console.log(`Loaded ${courses.length} courses`);

    // 4. TRIGGER UI UPDATE (This was missing)
    if (typeof renderSequenceDropdown === "function") {
        renderSequenceDropdown();
    } else if (typeof renderCourseUI === "function") {
        renderCourseUI();
    }
}

// 3. Local Sequence Editing (Save/Reset)
function saveSequencesLocally() {
    if (!sequences || !sequences.length) return;
    if (typeof LOCAL_SEQ_KEY !== 'undefined') {
        localStorage.setItem(LOCAL_SEQ_KEY, JSON.stringify(sequences));
    }
    alert("Changes saved to browser storage!");
}
 
function resetToOriginalJSON() {
    if(!confirm("Erase custom edits?")) return;
    if (typeof LOCAL_SEQ_KEY !== 'undefined') localStorage.removeItem(LOCAL_SEQ_KEY);
    location.reload();
}

// 4. Load Asana Library
async function loadAsanaLibrary() {
    // Now calls loadJSON correctly with ASANA_LIBRARY_URL
    const data = await loadJSON(ASANA_LIBRARY_URL, {});

    if (!data || Object.keys(data).length === 0) {
        console.error("Failed to load Library (or empty)");
        return {};
    }

    // Normalize IDs (ensure "001" and "1" match)
    const normalized = {};
    Object.keys(data).forEach(key => {
        // Use your existing normalizePlate function if available, else simple trim
        const cleanId = (typeof normalizePlate === 'function') ? normalizePlate(key) : key.trim();
        normalized[cleanId] = data[key];
        // Ensure ID property exists
        if (!normalized[cleanId].id) normalized[cleanId].id = cleanId;
    });

    console.log(`Asana Library Loaded: ${Object.keys(normalized).length} poses`);
    return normalized;
}

/* ==========================================================================
   IMAGE INDEXING
   ========================================================================== */

async function buildImageIndexes() {
    // Now calls loadJSON correctly with MANIFEST_URL
    const manifest = await loadJSON(MANIFEST_URL, {});
    
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
        console.log(`✓ Image Indexing complete: ${manifest.images.length} files`);
    } else {
        console.warn("Manifest images not found or invalid format");
    }
}

// Helper: Find URLs for a Pose
function smartUrlsForPoseId(idField) {
    if (!idField) return [];
    let id = Array.isArray(idField) ? idField[0] : idField;
    
    // Normalize
    if (typeof normalizePlate === 'function') id = normalizePlate(id);

    // 1. Check Overrides
    if (typeof imageOverrides !== 'undefined' && imageOverrides[id]) {
        let ov = imageOverrides[id];
        if (!ov.startsWith("http")) return [`https://arrowroad.com.au/yoga/images/${ov}`];
        return [ov];
    }

    // 2. Check Index
    if (window.asanaToUrls && window.asanaToUrls[id]) {
        return window.asanaToUrls[id];
    }
    
    return [];
}

// Helper: Find Data
function findAsanaByIdOrPlate(id) {
    if (!id) return null;
    if (typeof normalizePlate === 'function') id = normalizePlate(id);
    return asanaLibrary[id] || null;
}

// History Loader (Clean version)
async function setupHistory() {
    try {
        // FIX: Only fetch history here. Use the history URL.
        // We use a timestamp to prevent caching old data.
        const res = await fetch("history.json?t=" + Date.now()); 
        if (res.ok) {
            window.completionHistory = await res.json();
            console.log(`History Loaded: ${Object.keys(window.completionHistory).length} sequences`);
        } else {
            window.completionHistory = {};
        }
    } catch (e) {
        console.warn("History not found (starting fresh)");
        window.completionHistory = {};
    }
}
 // #endregion
// #region 5. HISTORY & LOGGING
/* ==========================================================================
   LOCAL LOGGING & PERSISTENCE
   ========================================================================== */

const COMPLETION_KEY = "yogaCompletionLog_v2";

// Safe localStorage with corruption handling
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
            title: s.title,
            ts: s.d.getTime(),
            local: s.d.toLocaleString("en-AU", {
               year: "numeric", month: "2-digit", day: "2-digit",
               hour: "2-digit", minute: "2-digit"
            })
         });
         changed = true;
      }
   });

   if (changed) saveCompletionLog(log);
}

/* ==========================================================================
   SERVER SYNC (History) - Using Supabase
   ========================================================================== */

let serverHistoryCache = null;

async function fetchServerHistory() {
   try {
      if (!supabase) {
         console.warn("Supabase not initialized, using local storage");
         serverHistoryCache = loadCompletionLog();
         return serverHistoryCache;
      }

      const { data, error } = await supabase
         .from('sequence_completions')
         .select('*')
         .order('completed_at', { ascending: false });

      if (error) throw error;

      // Convert Supabase format to app format for compatibility
      serverHistoryCache = data.map(record => ({
         title: record.title,
         category: record.category,
         ts: new Date(record.completed_at).getTime(),
         local: new Date(record.completed_at).toLocaleString("en-AU", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit"
         }),
         iso: record.completed_at
      }));

      return serverHistoryCache;
   } catch (e) {
      console.error("Failed to fetch server history:", e);
      serverHistoryCache = loadCompletionLog();
      return serverHistoryCache;
   }
}

async function appendServerHistory(title, whenDate, category = null) {
   // 1. Optimistic Update (Local)
   addCompletion(title, whenDate, category);

   // 2. Sync to Supabase
   try {
      if (!supabase) {
         console.warn("Supabase not initialized, saving locally only");
         return false;
      }

      const { error } = await supabase
         .from('sequence_completions')
         .insert([{
            title: title,
            category: category,
            completed_at: whenDate.toISOString()
         }]);

      if (error) throw error;

      // Refresh cache
      await fetchServerHistory();
      return true;
   } catch (e) {
      console.error("Failed to append to server history:", e);
      return false; // Local record persists even if server fails
   }
}

function formatHistoryRow(entry) {
   const title = entry?.title || "Untitled sequence";
   const category = entry?.category || "Uncategorized";
   const local = (typeof entry?.ts === "number") ?
      new Date(entry.ts).toLocaleString("en-AU", {
         year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      }) : (entry.local || "");

   return `
      <div style="padding: 10px; border-bottom: 1px solid #f0f0f0;">
         <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">${title}</div>
         <div style="font-size: 0.85rem; color: #666;">${category}</div>
         <div style="font-size: 0.8rem; color: #999; margin-top: 2px;">${local}</div>
      </div>
   `;
}

async function toggleHistoryPanel() {
   const panel = $("historyPanel");
   const isOpen = panel.style.display !== "none";
   if (isOpen) {
      panel.style.display = "none";
      return;
   }
   panel.style.display = "block";
   panel.textContent = "Loading…";
   
   const hist = await fetchServerHistory();

   if (!hist.length) {
      panel.textContent = "No completions recorded yet.";
      return;
   }

   const sorted = [...hist].filter(x => x && typeof x.ts === "number").sort((a, b) => b.ts - a.ts);

   const lines = sorted.map(formatHistoryRow);
   panel.innerHTML = lines.join("");
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
    console.log("Fetching manifest from:", MANIFEST_URL); // Debug 1
    const manifest = await loadJSON(MANIFEST_URL, null);

    if (!manifest) {
        console.warn("❌ Manifest failed to load (404 or Invalid JSON)");
        return;
    }

    // Debug 2: See exactly what keys exist. 
    // If you see "Images" (capital I) instead of "images", that's the bug.
    console.log("Raw Manifest Data:", manifest); 

    // Robust check for lowercase OR uppercase keys
    window.serverAudioFiles = manifest.audio || manifest.Audio || [];
    window.serverImageFiles = manifest.images || manifest.Images || [];

    console.log(`Manifest loaded: ${window.serverAudioFiles.length} audio, ${window.serverImageFiles.length} images`);
}
async function init() {
    try {
        const statusEl = $("statusText");
        
        // 1. Core Config
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();
        if (typeof loadAdminMode === "function") loadAdminMode();

        // 2. Load Overrides (Parallel)
        await Promise.all([
            typeof loadManifestAndPopulateLists === "function" ? loadManifestAndPopulateLists() : Promise.resolve(),
            typeof fetchAudioOverrides === "function" ? fetchAudioOverrides() : Promise.resolve(),
            typeof fetchImageOverrides === "function" ? fetchImageOverrides() : Promise.resolve(),
            typeof fetchDescriptionOverrides === "function" ? fetchDescriptionOverrides() : Promise.resolve(),
            typeof fetchCategoryOverrides === "function" ? fetchCategoryOverrides() : Promise.resolve(),
            typeof fetchIdAliases === "function" ? fetchIdAliases() : Promise.resolve()
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

/* ==========================================================================
   TIMER ENGINE
   ========================================================================== */

   function startTimer() {
    if (!currentSequence) return;
    if (running) {
        stopTimer();
        return;
    }

    running = true;
    enableWakeLock();
    
    // Update Button
    const btn = $("startStopBtn");
    if (btn) btn.textContent = "Pause";

    // FIX: Explicitly set status to Running (overwriting "Starting...")
    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Running";

    // Play audio immediately when starting (or resuming)
    const currentPose = currentSequence.poses[currentIndex];
    if (currentPose) {
        const [idField, , poseLabel] = currentPose;
        const plate = Array.isArray(idField) ? normalizePlate(idField[0]) : normalizePlate(idField);
        const asana = findAsanaByIdOrPlate(plate);
        // Pass 'false' to ensure side cues play (not browse context)
        if (asana) playAsanaAudio(asana, poseLabel, false);
    }

    timer = setInterval(() => {
        if (remaining > 0) remaining--;
        updateTimerUI();
        if (remaining <= 0) {
            if (running && currentPoseSeconds >= 60) playFaintGong();
            nextPose();
        }
    }, 1000);
}

function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
    
    // Update Button
    const btn = $("startStopBtn");
    if (btn) btn.textContent = "Start";
    
    // FIX: Set status to Paused
    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Paused";
    
    disableWakeLock();
}

function updateTimerUI() {
    const timerEl = document.getElementById("poseTimer");
    if (!timerEl) return; // <--- This simple line prevents the crash
 
    if (!currentSequence) {
       timerEl.textContent = "–";
       timerEl.className = "";
       return;
    }
    const mm = Math.floor(remaining / 60);
    const ss = remaining % 60;
    timerEl.textContent = `${mm}:${String(ss).padStart(2,"0")}`;
 
    // Add visual warning states
    timerEl.className = "";
    if (remaining <= 5 && remaining > 0) {
       timerEl.className = "critical";
    } else if (remaining <= 10 && remaining > 0) {
       timerEl.className = "warning";
    }
 }

/* ==========================================================================
   NAVIGATION
   ========================================================================== */

function nextPose() {
    if (!currentSequence) return;
    const poses = currentSequence.poses || [];

    // Check if current pose requires sides and we just finished right side
    const currentPose = poses[currentIndex];
    if (currentPose && needsSecondSide) {
        // Play left side of the same pose
        currentSide = "left";
        needsSecondSide = false;
        setPose(currentIndex, true); // true = keep same pose, just switch side
        return;
    }

    // Move to next pose
    if (currentIndex < poses.length - 1) {
        currentSide = "right"; // Reset to right side for next pose
        needsSecondSide = false;
        setPose(currentIndex + 1);
    } else {
        stopTimer();
        const compBtn = $("completeBtn");
        if (compBtn) compBtn.style.display = "inline-block";
    }
}

function prevPose() {
    if (!currentSequence) return;
    if (currentIndex > 0) {
        setPose(currentIndex - 1);
    }
}

/* ==========================================================================
   RENDERER (SetPose)
   ========================================================================== */

   function setPose(idx, keepSamePose = false) {
      if (!currentSequence) return;
      const poses = currentSequence.poses || [];
      if (idx < 0 || idx >= poses.length) return;

      // 1. SAVE PROGRESS
      if (typeof saveCurrentProgress === "function") saveCurrentProgress();

      currentIndex = idx;

      // Reset side tracking when moving to a new pose
      if (!keepSamePose) {
         currentSide = "right";
         needsSecondSide = false;
      }
      
      // 2. DATA EXTRACTION
      const currentPose = poses[idx]; 
      const rawIdField = currentPose[0]; 
      const seconds = currentPose[1];
      const label    = currentPose[2]; 
      const note     = currentPose[3] || "";
   
      let lookupId = Array.isArray(rawIdField) ? rawIdField[0] : rawIdField;
      lookupId = normalizePlate(lookupId); 
   
      // ALIAS RESOLUTION
      if (typeof idAliases !== 'undefined' && idAliases[lookupId]) {
          let aliasVal = idAliases[lookupId];
          if (aliasVal.includes("|")) aliasVal = aliasVal.split("|")[0]; 
          lookupId = normalizePlate(aliasVal);
      }
   
      // 3. SMART LOOKUP (Strict)
      const asana = findAsanaByIdOrPlate(lookupId);

      // Check if this pose requires sides and set flag
      if (asana && asana.requiresSides && !keepSamePose) {
         needsSecondSide = true;
      }

      // 4. HEADER UI (RE-APPLIED)
      
      const nameEl = document.getElementById("poseName");

      if (nameEl) {
          const jsonLabel = label ? String(label).trim() : "";
          const csvName = asana ? (asana.method_name || asana.English_Name || asana.name || asana.english || "").trim() : "";          let finalTitle = "";

          if (jsonLabel && csvName && jsonLabel !== csvName) {
              finalTitle = `${jsonLabel} - (${csvName})`;
          } else {
              finalTitle = jsonLabel || csvName || "Pose";
          }

          if (asana && asana.requiresSides) {
              const sideSuffix = currentSide === "right" ? " (Right Side)" : " (Left Side)";
              finalTitle += sideSuffix;
          }

          nameEl.textContent = finalTitle; // No more crashing here!
      }
      
      if (typeof updatePoseNote === "function") updatePoseNote(note);
      if (typeof loadUserPersonalNote === "function") loadUserPersonalNote(lookupId);
   
      // 5. META UI
      const idDisplay = lookupId; 
      const metaContainer = document.getElementById("poseMeta");
      if (metaContainer) {
         let metaText = `ID: ${idDisplay} • ${seconds}s`;
         metaContainer.innerHTML = metaText + " ";
          
         
         if (asana) {
            const speakBtn = document.createElement("button");
            speakBtn.className = "tiny";
            speakBtn.textContent = "🔊";
            speakBtn.style.marginLeft = "10px";
            speakBtn.onclick = (e) => { 
               e.stopPropagation(); 
               playAsanaAudio(asana); 
            };
            metaContainer.appendChild(speakBtn);
         }
      }
   
      const counterEl = document.getElementById("poseCounter");
      if (counterEl) {
        counterEl.textContent = `${idx + 1} / ${poses.length}`;
     }
   
      // 6. TIMER LOGIC
      currentPoseSeconds = parseInt(seconds, 10) || 0;
      remaining = currentPoseSeconds;
      updateTimerUI();
   
      // 7. IMAGE RENDERING
      const urls = smartUrlsForPoseId(lookupId);
      const wrap = document.getElementById("collageWrap");
      if (wrap) {
         wrap.innerHTML = "";
         if (!urls || !urls.length) {
            const div = document.createElement("div");
            div.className = "msg";
            div.textContent = `No image found for: ${idDisplay}`;
            wrap.appendChild(div);
         } else {
            wrap.appendChild(renderCollage(urls));
         }
      }
   
      // 8. TEXT RENDERING
      let instructionsText = "";
      let targetVarName = null;
   
      if (asana) instructionsText = asana.technique || "";
   
      if (typeof idAliases !== 'undefined' && idAliases[lookupId]) {
          const alias = idAliases[lookupId];
          if (alias && alias.includes("|")) targetVarName = alias.split("|")[1].trim();
      }
      
      if (currentPose.length > 3 && currentPose[3]) targetVarName = String(currentPose[3]).trim();
   
      if (targetVarName && asana && asana.inlineVariations) {
          let match = asana.inlineVariations.find(v => v.label === targetVarName);
          if (!match) match = asana.inlineVariations.find(v => v.label.toLowerCase() === targetVarName.toLowerCase());
          if (match) instructionsText = match.text;
      }
   
      const textContainer = document.getElementById("poseInstructions"); 
      if (textContainer) {
          if (instructionsText && instructionsText.trim().length > 0) {
              textContainer.style.display = "block";
              const formatted = (typeof formatTechniqueText === 'function') ? formatTechniqueText(instructionsText) : instructionsText;
              const title = targetVarName ? `Instructions (${targetVarName}):` : "Instructions:";
              textContainer.innerHTML = `<strong>${title}</strong>\n` + formatted;
          } else {
              textContainer.style.display = "none";
              textContainer.textContent = "";
          }
      }
   
      // 9. BUTTON STATES & WAKE LOCK
      const isFinal = (idx === poses.length - 1);
      const compBtn = document.getElementById("completeBtn");
      if (compBtn) compBtn.style.display = isFinal ? "inline-block" : "none";
   
      updateTotalAndLastUI();
      if (running && asana) playAsanaAudio(asana, label);
      if (wakeLockVisibilityHooked && typeof reacquireWakeLock === "function") reacquireWakeLock();
      
      // 10. ADMIN TOOL
      if (typeof adminMode !== 'undefined' && adminMode) {
          const toolSlot = document.getElementById("pose-admin-tools");
          if (toolSlot && lookupId && typeof renderIdFixer === "function") {
              toolSlot.innerHTML = ""; 
              toolSlot.style.display = "block"; 
              renderIdFixer(toolSlot, lookupId);
          }
      } else {
          const toolSlot = document.getElementById("pose-admin-tools");
          if (toolSlot) toolSlot.style.display = "none";
      }
   }

/* ==========================================================================
   UI HELPERS (Notes & Stats)
   ========================================================================== */

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
    const poses = (currentSequence && currentSequence.poses) ? currentSequence.poses : [];
 
    // 1. Calculate Total Time
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
 
    // 2. Update Total Time UI (Safely)
    const totalEl = document.getElementById("totalTimePill");
    if (totalEl) {
        totalEl.textContent = `Total: ${formatHMS(total)}`;
    }
 
    // 3. Update History UI (Safely)
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
   const storageKey = `user_note_${normalizePlate(rawId)}`;
   const savedNote = localStorage.getItem(storageKey) || "";

   const wrapper = document.createElement("div");
   
   const area = document.createElement("textarea");
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
    if ($("browseBtn")) $("browseBtn").addEventListener("click", openBrowse);
    if ($("browseCloseBtn")) $("browseCloseBtn").addEventListener("click", closeBrowse);

    const finalsChk = $("browseFinalOnly");
    if (finalsChk) {
        if (finalsChk.parentElement && finalsChk.parentElement.tagName === "LABEL") {
            finalsChk.parentElement.style.display = "none";
        } else {
            finalsChk.style.display = "none";
        }
    }

    const closeBtn = $("browseCloseBtn");
    if (closeBtn && !document.getElementById("browseSyncBtn")) {
        const syncBtn = document.createElement("button");
        syncBtn.id = "browseSyncBtn";
        syncBtn.textContent = "💾 Sync Library";
        syncBtn.className = "tiny";
        syncBtn.style.cssText = "background: #2e7d32; color: white; margin-right: 15px; margin-left: auto;";
        
        syncBtn.onclick = async () => {
            if (confirm("Push library changes to GitHub?")) {
                await syncDataToGitHub("asana_library.json", asanaLibrary);
            }
        };

        if (closeBtn.parentNode) {
            closeBtn.parentNode.insertBefore(syncBtn, closeBtn);
            closeBtn.parentNode.style.display = "flex";
            closeBtn.parentNode.style.alignItems = "center";
        }
    }

    // Backdrop Click Logic
    (function () {
        const bd = $("browseBackdrop");
        if (!bd) return;
        let downOnBackdrop = false;
        bd.addEventListener("pointerdown", (e) => { downOnBackdrop = (e.target === bd); });
        bd.addEventListener("click", (e) => {
            if (e.target === bd && downOnBackdrop) closeBrowse();
            downOnBackdrop = false;
        });
    })();

    // ESC Key Support
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $("browseBackdrop")?.style.display === "flex") {
            closeBrowse();
        }
    });

    // Filters
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

function openBrowse() {
    const bd = $("browseBackdrop");
    if (!bd) return;
    bd.style.display = "flex";
    bd.setAttribute("aria-hidden", "false");
    applyBrowseFilters(); 
    if ($("browseSearch")) $("browseSearch").focus();
}

function closeBrowse() {
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
   const asanaIndex = getAsanaIndex();
   if (countEl) countEl.textContent = `Showing ${items.length} of ${asanaIndex.length}`;

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
      
      let titleText = asma.english || asma['Yogasana Name'] || "(no name)";
      if (asma.variation) titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${asma.variation})</span>`;
      title.innerHTML = titleText;

      const meta = document.createElement("div");
      meta.className = "meta";
      const catDisplay = asma.category ? asma.category.replace(/_/g, " ") : "";
      const catBadge = catDisplay ? ` <span class="badge">${catDisplay}</span>` : "";
      
      meta.innerHTML = `
        <span style="color:#000; font-weight:bold;">ID: ${asma.asanaNo}</span>
        ${asma.interRaw ? ` • Int: ${asma.interRaw}` : ""}
        ${asma.finalRaw ? ` • Final: ${asma.finalRaw}` : ""}
        ${catBadge}
      `;
      
      left.appendChild(title);
      left.appendChild(meta);

      const btn = document.createElement("button");
      btn.textContent = "View";
      btn.className = "tiny"; 
      btn.addEventListener("click", () => {
         showAsanaDetail(asma);
         if (typeof isBrowseMobile === 'function' && isBrowseMobile()) enterBrowseDetailMode();
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

function showAsanaDetail(asma) {
   const d = document.getElementById("browseDetail");
   if (!d) return;
   d.innerHTML = "";

   const techniqueName = asma.english || asma['Yogasana Name'] || "(no name)";
   const asanaIndex = getAsanaIndex();
   const rowVariations = asanaIndex.filter(v => (v.english || v['Yogasana Name']) === techniqueName);
   const isRestorative = (asma.category && asma.category.includes("Restorative"));

   if (typeof isBrowseMobile === "function" && isBrowseMobile()) {
      const back = document.createElement("button");
      back.textContent = "← Back to list";
      back.className = "tiny";
      back.style.cssText = "margin-bottom:15px; width:100%;";
      back.onclick = () => {
         exitBrowseDetailMode();
         const list = document.getElementById("browseList");
         if (list) list.scrollTop = 0;
      };
      d.appendChild(back);
   }

   const h = document.createElement("h2");
   h.className = "detail-title";
   h.textContent = techniqueName;
   const audioBtn = document.createElement("button");
   audioBtn.textContent = "🔊";
   audioBtn.style.cssText = "margin-left:10px; cursor:pointer; border:none; background:transparent; font-size:1.2rem;";
   audioBtn.onclick = () => playAsanaAudio(asma, null, true); 
   h.appendChild(audioBtn);
   d.appendChild(h);

   const sub = document.createElement("div");
   sub.className = "sub";
   sub.textContent = `${asma.iast || ""} • Asana # ${asma.asanaNo} • ${asma.category || ""}`;
   d.appendChild(sub);

   if (asma.description) {
       const descBlock = document.createElement("div");
       descBlock.style.cssText = "margin: 10px 0; font-style: italic; color: #555; line-height: 1.4; border-left: 3px solid #eee; padding-left: 10px;";
       descBlock.textContent = asma.description; 
       d.appendChild(descBlock);
   }

   let tabsSource = [];
   if (asma.inlineVariations && asma.inlineVariations.length > 0) {
       tabsSource = asma.inlineVariations.map(iv => ({
           label: iv.label, text: iv.text, imagesId: asma.asanaNo, rowId: asma.asanaNo 
       }));
   } else if (rowVariations.length > 0) {
       tabsSource = rowVariations.map((v, i) => ({
           label: v.variation || `Stage ${i+1}`,
           text: v.technique || v.description || "", 
           imagesId: v.asanaNo, rowId: v.asanaNo
       }));
   } else {
       tabsSource = [{ label: "Main", text: asma.technique || "", imagesId: asma.asanaNo, rowId: asma.asanaNo }];
   }

   const tabContainer = document.createElement("div");
   tabContainer.className = "variation-tabs";
   const contentContainer = document.createElement("div");
   contentContainer.className = "variation-content";

   tabsSource.forEach((tab, idx) => {
      const btn = document.createElement("button");
      btn.className = idx === 0 ? "tab-btn active" : "tab-btn";
      let rawLabel = tab.label || String(idx + 1);
      btn.textContent = rawLabel.replace(/Variation|Stage/i, '').trim() || (idx + 1);
      
      const pane = document.createElement("div");
      pane.className = "tab-pane";
      pane.style.display = idx === 0 ? "block" : "none";

      const imgWrap = document.createElement("div");
      imgWrap.className = "detail-images-wrapper";
      const targets = [tab.imagesId];
      const _seen = new Set();
      imgWrap.appendChild(renderPlateSection("", targets, _seen, tab.imagesId));

      const instructions = document.createElement("div");
      instructions.className = "desc-text";
      instructions.style.marginTop = "15px";
      instructions.style.marginBottom = "15px";
      const bodyInst = document.createElement("div");
      bodyInst.style.whiteSpace = "pre-wrap"; 
      bodyInst.style.lineHeight = "1.6";
      bodyInst.innerHTML = `<strong>Instructions:</strong>\n` + (formatTechniqueText(tab.text) || "No instructions.");
      instructions.appendChild(bodyInst);

      if (isRestorative) {
          pane.appendChild(instructions);
          pane.appendChild(imgWrap);
      } else {
          pane.appendChild(imgWrap);
          pane.appendChild(instructions);
      }

      btn.onclick = () => {
         Array.from(tabContainer.children).forEach(b => b.classList.remove('active'));
         Array.from(contentContainer.children).forEach(p => p.style.display = 'none');
         btn.classList.add('active');
         pane.style.display = 'block';
      };

      tabContainer.appendChild(btn);
      contentContainer.appendChild(pane);
   });

   if (tabsSource.length > 1) d.appendChild(tabContainer);
   d.appendChild(contentContainer);
   d.setAttribute("data-asana-no", asma.asanaNo);

   if (typeof adminMode !== 'undefined' && adminMode) {
      renderAdminDetailTools(d, asma, rowVariations);
   } else if (window.enableEditing) {
       renderAdminDetailTools(d, asma, rowVariations);
   }
}

function renderAdminDetailTools(container, asma, rowVariations) {
    const adminDetails = document.createElement("details");
    adminDetails.style.marginTop = "20px";
    adminDetails.style.borderTop = "1px solid #ccc";
    adminDetails.style.paddingTop = "10px";
    adminDetails.open = true; 

    const adminSum = document.createElement("summary");
    adminSum.textContent = "🔧 Admin / Editing Tools";
    adminSum.style.cursor = "pointer";
    adminSum.style.fontWeight = "bold";
    adminSum.style.marginBottom = "10px";
    adminDetails.appendChild(adminSum);

    const adminContent = document.createElement("div");
    adminContent.style.padding = "15px";
    adminContent.style.background = "#f4f4f4";
    adminContent.style.borderRadius = "8px";

    // A0. NAME
    const nameDiv = document.createElement("div");
    nameDiv.style.marginBottom = "15px";
    nameDiv.innerHTML = "<div style='font-size:0.85rem; font-weight:bold; margin-bottom:4px;'>🏷️ Pose Name</div>";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = asma.english || asma.name || "";
    nameInput.style.cssText = "width:100%; padding:6px; border:1px solid #ccc; font-weight:bold;";

    const saveNameBtn = document.createElement("button");
    saveNameBtn.textContent = "Rename Pose"; 
    saveNameBtn.className = "tiny";
    saveNameBtn.style.marginTop = "5px";
    
    saveNameBtn.onclick = async () => {
        saveNameBtn.textContent = "Saving...";
        await saveAsanaField(asma.asanaNo, "name", nameInput.value);
        const header = container.querySelector("h2");
        if(header) header.childNodes[0].nodeValue = nameInput.value;
        saveNameBtn.textContent = "✓ Renamed";
        setTimeout(() => saveNameBtn.textContent = "Rename Pose", 2000);
    };
    nameDiv.appendChild(nameInput);
    nameDiv.appendChild(saveNameBtn);
    adminContent.appendChild(nameDiv);

    // A. CATEGORY
    const catDiv = document.createElement("div");
    catDiv.style.marginBottom = "15px";
    catDiv.innerHTML = "<div style='font-size:0.85rem; font-weight:bold; margin-bottom:4px;'>📂 Category</div>";
    
    const catLabels = { 
        "": "(no category)", 
        "01_Standing_and_Basic": "01 Standing & Basic", 
        "02_Seated_and_Lotus_Variations": "02 Seated & Lotus", 
        "03_Forward_Bends": "03 Forward Bends", 
        "04_Inversions_Sirsasana_Sarvangasana": "04 Inversions", 
        "05_Abdominal_and_Supine": "05 Abdominal & Supine", 
        "06_Twists": "06 Twists", 
        "07_Arm_Balances": "07 Arm Balances", 
        "08_Advanced_Leg_behind_Head": "08 Leg Behind Head", 
        "09_Backbends": "09 Backbends", 
        "10_Restorative_Pranayama": "10 Restorative/Pranayama" 
    };
    const catSel = document.createElement("select");
    catSel.className = "tiny";
    catSel.style.width = "100%";
    Object.entries(catLabels).forEach(([v, l]) => {
        const o = document.createElement("option"); o.value = v; o.textContent = l; catSel.appendChild(o);
    });
    catSel.value = asma.category || "";
    
    const saveCatBtn = document.createElement("button");
    saveCatBtn.textContent = "Save Category"; 
    saveCatBtn.className = "tiny";
    saveCatBtn.style.marginTop = "5px";
    saveCatBtn.onclick = async () => {
        saveCatBtn.textContent = "Saving...";
        await saveAsanaField(asma.asanaNo, "category", catSel.value);
        saveCatBtn.textContent = "✓ Saved";
        setTimeout(() => saveCatBtn.textContent = "Save Category", 2000);
        applyBrowseFilters();
    };
    catDiv.appendChild(catSel);
    catDiv.appendChild(saveCatBtn);
    adminContent.appendChild(catDiv);

    // A2. SIDES PROPERTY
    const propDiv = document.createElement("div");
    propDiv.style.marginBottom = "15px";
    propDiv.style.padding = "10px";
    propDiv.style.background = "#fff";
    propDiv.style.border = "1px solid #ddd";
    propDiv.style.borderRadius = "4px";

    const sideLabel = document.createElement("label");
    sideLabel.style.display = "flex";
    sideLabel.style.alignItems = "center";
    sideLabel.style.gap = "10px";
    sideLabel.style.cursor = "pointer";
    sideLabel.style.fontSize = "0.9rem";
    sideLabel.style.fontWeight = "bold";

    const sideChk = document.createElement("input");
    sideChk.type = "checkbox";
    sideChk.checked = !!asma.requiresSides;

    const sideText = document.createElement("span");
    sideText.textContent = "Requires Left & Right Sides (Audio)";

    sideChk.onchange = async () => {
        sideText.textContent = "Saving...";
        sideText.style.color = "#666";
        await saveAsanaField(asma.asanaNo, "requiresSides", sideChk.checked);
        sideText.textContent = "✓ Saved";
        sideText.style.color = "green";
        setTimeout(() => {
            sideText.textContent = "Requires Left & Right Sides (Audio)";
            sideText.style.color = "black";
        }, 2000);
    };
    sideLabel.appendChild(sideChk);
    sideLabel.appendChild(sideText);
    propDiv.appendChild(sideLabel);
    adminContent.appendChild(propDiv);

    // B. DESCRIPTION
    const descDiv = document.createElement("div");
    descDiv.style.borderTop = "1px dashed #ccc";
    descDiv.style.paddingTop = "15px";
    descDiv.style.marginBottom = "15px";
    descDiv.innerHTML = "<div style='font-size:0.85rem; font-weight:bold; margin-bottom:4px;'>📝 Description</div>";

    const descArea = document.createElement("textarea");
    descArea.style.cssText = "width:100%; height:80px; padding:8px; border:1px solid #ccc; font-family:inherit; font-size:0.9rem;";
    descArea.value = asma.description || "";

    const saveDescBtn = document.createElement("button");
    saveDescBtn.textContent = "Save Description";
    saveDescBtn.className = "tiny";
    saveDescBtn.style.marginTop = "5px";
    saveDescBtn.onclick = async () => {
        saveDescBtn.textContent = "Saving...";
        await saveAsanaField(asma.asanaNo, "description", descArea.value);
        saveDescBtn.textContent = "✓ Saved";
        setTimeout(() => saveDescBtn.textContent = "Save Description", 2000);
    };
    descDiv.appendChild(descArea);
    descDiv.appendChild(saveDescBtn);
    adminContent.appendChild(descDiv);

    // C. TECHNIQUE
    const techDiv = document.createElement("div");
    techDiv.style.borderTop = "1px dashed #ccc";
    techDiv.style.paddingTop = "15px";
    techDiv.style.marginBottom = "15px";
    techDiv.innerHTML = "<div style='font-size:0.85rem; font-weight:bold; margin-bottom:4px;'>🧘 Technique Instructions</div>";

    const techArea = document.createElement("textarea");
    techArea.style.cssText = "width:100%; height:120px; padding:8px; border:1px solid #ccc; font-family:inherit; font-size:0.9rem;";
    techArea.value = asma.technique || "";

    const saveTechBtn = document.createElement("button");
    saveTechBtn.textContent = "Save Technique";
    saveTechBtn.className = "tiny";
    saveTechBtn.style.marginTop = "5px";
    saveTechBtn.onclick = async () => {
        saveTechBtn.textContent = "Saving...";
        await saveAsanaField(asma.asanaNo, "technique", techArea.value);
        saveTechBtn.textContent = "✓ Saved";
        setTimeout(() => saveTechBtn.textContent = "Save Technique", 2000);
    };
    techDiv.appendChild(techArea);
    techDiv.appendChild(saveTechBtn);
    adminContent.appendChild(techDiv);

    // D. MEDIA
    const mediaDiv = document.createElement("div");
    mediaDiv.style.borderTop = "1px dashed #ccc";
    mediaDiv.style.paddingTop = "15px";
    renderMediaManager(mediaDiv, asma, rowVariations);
    adminContent.appendChild(mediaDiv);

    adminDetails.appendChild(adminContent);
    container.appendChild(adminDetails);
}

function renderMediaManager(container, asma, rowVariations) {
    const audioFiles = window.serverAudioFiles || [];
    const imageFiles = window.serverImageFiles || [];
    
    const mediaDiv = document.createElement("div");
    mediaDiv.style.marginTop = "8px";
    mediaDiv.style.fontSize = "0.85rem";

    mediaDiv.innerHTML = `
          <div style="margin-bottom:12px; background:#fff; padding:5px; border:1px solid #ddd;">
             <label style="font-size:0.8rem; color:#888;">TARGET FOR EDITING:</label>
             <select id="mediaTargetKey" class="tiny" style="width:100%; margin-top:2px; font-weight:bold; border:1px solid #ccc;"></select>
          </div>
          <div style="display:flex; gap:10px;">
             <div style="flex:1; padding-right:5px; border-right:1px solid #eee;">
                <div style="font-weight:bold; margin-bottom:5px;">🎵 AUDIO</div>
                <div id="currentAudioLabel" style="margin-bottom:8px; font-size:0.8rem; color:#666; min-height:1.2em;"></div>
                <div style="margin-bottom:8px;">
                   ${audioFiles.length === 0 ? 
                     `<button id="retryManifestBtn" class="tiny" style="width:100%; background:#ffecb3;">⚠️ Lists Empty - Retry</button>` : 
                     `<select id="audioSelectServer" class="tiny" style="width:100%; margin-bottom:2px;"><option value="">Select server file...</option></select>`
                   }
                   <button id="linkAudioBtn" class="tiny" style="width:100%; margin-top:4px;">Link Selected</button>
                </div>
             </div>
             <div style="flex:1; padding-left:5px;">
                <div style="font-weight:bold; margin-bottom:5px;">🖼️ IMAGE</div>
                <div id="currentImageLabel" style="margin-bottom:8px; font-size:0.8rem; color:#666; min-height:1.2em;"></div>
                <div style="margin-bottom:8px;">
                   ${imageFiles.length === 0 ? 
                     `<div style="font-size:0.7rem; color:red;">No images found</div>` : 
                     `<select id="imageSelectServer" class="tiny" style="width:100%; margin-bottom:2px;"><option value="">Select server file...</option></select>`
                   }
                   <button id="linkImageBtn" class="tiny" style="width:100%; margin-top:4px;">Link Selected</button>
                </div>
             </div>
          </div>
      `;

    const retryBtn = mediaDiv.querySelector("#retryManifestBtn");
    if (retryBtn) {
        retryBtn.onclick = async () => {
            retryBtn.textContent = "Loading...";
            if (typeof loadManifestAndPopulateLists === "function") {
                await loadManifestAndPopulateLists();
                const parent = container.parentElement; 
                container.innerHTML = ""; 
                renderAdminDetailTools(container.parentElement.parentElement, asma, rowVariations); 
            }
        };
    }

    const audioSel = mediaDiv.querySelector("#audioSelectServer");
    if (audioSel) audioFiles.forEach(f => {
        const opt = document.createElement("option"); opt.value = f; opt.textContent = f; audioSel.appendChild(opt);
    });

    const imageSel = mediaDiv.querySelector("#imageSelectServer");
    if (imageSel) imageFiles.forEach(f => {
        const opt = document.createElement("option"); opt.value = f; opt.textContent = f; imageSel.appendChild(opt);
    });

    const targetSel = mediaDiv.querySelector("#mediaTargetKey");
    const optMain = document.createElement("option");
    optMain.value = normalizePlate(asma.asanaNo);
    optMain.textContent = `Global (ID ${asma.asanaNo})`;
    targetSel.appendChild(optMain);

    if (rowVariations) {
        rowVariations.forEach((v, idx) => {
            const vName = (v.english || v['Yogasana Name'] || "").trim();
            const vVar = (v.variation || v['Variation'] || "").trim();
            if (vName) {
                const specificKey = vVar ? `${vName} ${vVar}` : vName;
                const displayLabel = vVar || `Variation ${idx + 1}`;
                const opt = document.createElement("option");
                opt.value = specificKey;
                opt.textContent = `Specific: ${displayLabel}`;
                targetSel.appendChild(opt);
            }
        });
    }

    const updateMediaLabels = () => {
        const key = targetSel.value;
        const audioLabel = mediaDiv.querySelector("#currentAudioLabel");
        const imageLabel = mediaDiv.querySelector("#currentImageLabel");
        
        if(audioLabel) {
            const curAudio = (typeof audioOverrides !== 'undefined' && audioOverrides[key]) ? audioOverrides[key] : "(Inherits Global)";
            audioLabel.innerHTML = `Curr: <b>${curAudio}</b>`;
        }
        if(imageLabel) {
            const curImage = (typeof imageOverrides !== 'undefined' && imageOverrides[key]) ? imageOverrides[key] : "(Default)";
            imageLabel.innerHTML = `Curr: <b>${curImage}</b>`;
        }
    };
    targetSel.onchange = updateMediaLabels;
    updateMediaLabels();

    const linkAudioBtn = mediaDiv.querySelector("#linkAudioBtn");
    if(linkAudioBtn) linkAudioBtn.onclick = async () => {
        if (!audioSel || !audioSel.value) return alert("Select a file first.");
        const key = targetSel.value;
        if (typeof audioOverrides === 'undefined') window.audioOverrides = {};
        audioOverrides[key] = audioSel.value;
        await syncDataToGitHub("audio_overrides.json", audioOverrides);
        updateMediaLabels();
    };

    const linkImageBtn = mediaDiv.querySelector("#linkImageBtn");
    if(linkImageBtn) linkImageBtn.onclick = async () => {
        if (!imageSel || !imageSel.value) return alert("Select a file first.");
        const key = targetSel.value;
        if (typeof imageOverrides === 'undefined') window.imageOverrides = {};
        imageOverrides[key] = imageSel.value;
        await syncDataToGitHub("image_overrides.json", imageOverrides);
        updateMediaLabels();
        showAsanaDetail(asma);
    };

    container.appendChild(mediaDiv);
}

/* ==========================================================================
   RENDERERS (COLLAGE & LISTS)
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

function renderCourseUI() {
   const sel = $("sequenceSelect");
   if (!sel) return;
   const currentVal = sel.value;
   sel.innerHTML = `<option value="">Select a course</option>`;

   const grouped = {};
   courses.forEach((course, idx) => {
      const cat = course.category ? course.category.trim() : "Uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ course, idx });
   });

   Object.keys(grouped).sort().forEach(catName => {
      const groupEl = document.createElement("optgroup");
      groupEl.label = catName;
      grouped[catName].forEach(item => {
         const opt = document.createElement("option");
         opt.value = String(item.idx);
         opt.textContent = item.course.title || `Course ${item.idx + 1}`;
         groupEl.appendChild(opt);
      });
      sel.appendChild(groupEl);
   });
   if (currentVal) sel.value = currentVal;
}

function renderSequenceDropdown() {
   renderCourseUI();
}

/* ==========================================================================
   FILTER HELPERS
   ========================================================================== */

function applyBrowseFilters() {
   const q = $("browseSearch").value.trim();
   const plateQ = parsePlateQuery($("browsePlate").value);
   const noQ = $("browseAsanaNo").value.trim();
   const cat = $("browseCategory").value;
   const finalsOnly = $("browseFinalOnly").checked;

   const asanaIndex = getAsanaIndex();
   const filtered = asanaIndex.filter(a => {
      if (!matchesText(a, q)) return false;
      if (!matchesPlate(a, plateQ)) return false;
      if (!matchesAsanaNo(a, noQ)) return false;
      if (!matchesCategory(a, cat)) return false;
      if (finalsOnly && (!a.finalPlates || !a.finalPlates.length)) return false;
      return true;
   });

   const uniqueFiltered = [];
   const seen = new Set();
   filtered.forEach(a => {
      const name = (a.english || a['Yogasana Name'] || "").toLowerCase().trim();
      if (!seen.has(name)) {
         seen.add(name);
         uniqueFiltered.push(a);
      }
   });

   uniqueFiltered.sort((x, y) => {
      const ax = parseFloat(x.asanaNo), ay = parseFloat(y.asanaNo);
      return (Number.isFinite(ax) ? ax : 9999) - (Number.isFinite(ay) ? ay : 9999);
   });

   renderBrowseList(uniqueFiltered);
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

function toggleAdminUI(show) {
    const backdrop = document.getElementById("manageSequencesBackdrop");
    if (!backdrop) return;
    if (show) {
        const title = backdrop.querySelector("h2");
        if (title) title.textContent = "⚙️ Admin Dashboard";
        if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
        backdrop.style.display = "flex";
    } else {
        backdrop.style.display = "none";
    }
}
window.toggleAdminUI = toggleAdminUI;

const closeManBtn = document.getElementById("manageCloseBtn");
if (closeManBtn) closeManBtn.onclick = () => toggleAdminUI(false);

function renderAdminDashboard() {
    const list = document.getElementById("manageSequenceList");
    if (!list) return;
    list.innerHTML = "";
    
    // Reset selection state on re-render
    if (!window.adminSelectedIndices) window.adminSelectedIndices = new Set();
    // But clearing it every time might annoy users if we re-render on checkbox click.
    // We will re-render intelligently or just use DOM updates. 
    // For simplicity, we keep the Set global but don't clear it automatically unless closing.

    // A. GLOBAL TOOLS
    const toolsDiv = document.createElement("div");
    toolsDiv.style.cssText = "background:#f0f8ff; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #cceeff;";
    const isEditing = window.enableEditing || false;

    toolsDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
           <strong style="color:#005580;">Global Tools</strong>
           <button id="adminSyncBtn" class="tiny" style="background:#2e7d32; color:white;">💾 Sync All to GitHub</button>
        </div>
        <div style="display:flex; gap:15px; align-items:center;">
             <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; cursor:pointer;">
                <input type="checkbox" id="adminEditToggle" ${isEditing ? "checked" : ""}>
                Enable Library Editing
            </label>
        </div>
        
        <div style="margin-top:15px; padding-top:15px; border-top:1px solid #cceeff;">
            <div style="font-weight:bold; font-size:0.85rem; margin-bottom:5px;">Bulk Sequence Actions</div>
            <div style="display:flex; gap:5px;">
                <input type="text" id="bulkCatInput" placeholder="New Category Name (e.g. Light on Yoga > Course 2)" style="flex:1; padding:5px; border:1px solid #ccc;">
                <button id="bulkApplyBtn" class="tiny" style="background:#007AFF; color:white;">Set Category for Selected</button>
            </div>
        </div>
    `;
    list.appendChild(toolsDiv);

    // Wire up Sync (Updated to include History)
    toolsDiv.querySelector("#adminSyncBtn").onclick = async () => {
        if(!confirm("Push ALL changes (Courses, Library, History) to GitHub?")) return;
        
        const btn = toolsDiv.querySelector("#adminSyncBtn");
        const oldText = btn.textContent;
        btn.textContent = "Syncing...";

        try {
            // 1. Sync Courses
            await syncDataToGitHub("courses.json", sequences);
            
            // 2. Sync History (This is the new part!)
            if (window.completionHistory && typeof HISTORY_URL !== 'undefined') {
                await syncDataToGitHub(HISTORY_URL, window.completionHistory);
            }

            // 3. Sync Other Files
            if(window.asanaLibrary) await syncDataToGitHub("asana_library.json", window.asanaLibrary);
            if(window.audioOverrides) await syncDataToGitHub("audio_overrides.json", window.audioOverrides);

            alert("✓ All Data Synced Successfully");
        } catch(e) {
            alert("❌ Sync Failed: " + e.message);
        }
        btn.textContent = oldText;
    };
    // Wire up Edit Toggle
    toolsDiv.querySelector("#adminEditToggle").onchange = (e) => {
        window.enableEditing = e.target.checked;
        localStorage.setItem("admin_mode_enabled", e.target.checked);
        if(typeof applyBrowseFilters === 'function') applyBrowseFilters();
    };
    // Wire up Bulk Apply
    toolsDiv.querySelector("#bulkApplyBtn").onclick = () => {
        const cat = toolsDiv.querySelector("#bulkCatInput").value.trim();
        if (!cat) return alert("Enter a category name first.");
        if (window.adminSelectedIndices.size === 0) return alert("Select at least one sequence below.");
        
        const count = window.adminSelectedIndices.size;
        if (confirm(`Set category "${cat}" for ${count} sequences?`)) {
            window.adminSelectedIndices.forEach(idx => {
                if (sequences[idx]) sequences[idx].category = cat;
            });
            populateSequenceSelect();
            renderAdminDashboard(); // Refresh list to show new categories
            alert("Updated! Remember to Sync.");
        }
    };

    // C. SEQUENCE LIST HEADER
    const header = document.createElement("div");
    header.style.cssText = "display:flex; gap:10px; padding:8px; background:#eee; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #ccc;";
    header.innerHTML = `
        <div style="width:30px; text-align:center;"><input type="checkbox" id="selectAllSeqs"></div>
        <div style="width:150px;">Category</div>
        <div style="flex:1;">Sequence Title</div>
        <div style="width:40px;"></div>
    `;
    list.appendChild(header);

    // Select All Logic
    header.querySelector("#selectAllSeqs").onchange = (e) => {
        const chk = e.target.checked;
        const boxes = list.querySelectorAll(".seq-chk");
        window.adminSelectedIndices.clear();
        boxes.forEach(b => {
            b.checked = chk;
            if(chk) window.adminSelectedIndices.add(parseInt(b.value));
        });
    };

    // D. SEQUENCE ROWS
    if (typeof sequences !== 'undefined' && Array.isArray(sequences)) {
        sequences.forEach((seq, idx) => {
            const row = document.createElement("div");
            row.className = "manage-row";
            row.style.cssText = "display:flex; gap:10px; padding:8px; border-bottom:1px solid #eee; align-items:center;";

            // Checkbox
            const chkDiv = document.createElement("div");
            chkDiv.style.width = "30px";
            chkDiv.style.textAlign = "center";
            const chk = document.createElement("input");
            chk.type = "checkbox";
            chk.className = "seq-chk";
            chk.value = idx;
            if (window.adminSelectedIndices.has(idx)) chk.checked = true;
            chk.onchange = (e) => {
                if (e.target.checked) window.adminSelectedIndices.add(idx);
                else window.adminSelectedIndices.delete(idx);
            };
            chkDiv.appendChild(chk);

            // Category Input
            const catInput = document.createElement("input");
            catInput.type = "text";
            catInput.value = seq.category || "";
            catInput.style.cssText = "width:150px; padding:5px; border:1px solid #ccc; font-size:0.85rem;";
            catInput.onchange = (e) => {
                seq.category = e.target.value;
                populateSequenceSelect();
            };

            // Title Input
            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.value = seq.title;
            titleInput.style.cssText = "flex:1; padding:5px; border:1px solid #ccc; font-weight:bold;";
            titleInput.onchange = (e) => {
                seq.title = e.target.value;
                populateSequenceSelect();
            };

            // Delete
            const delBtn = document.createElement("button");
            delBtn.textContent = "🗑";
            delBtn.className = "tiny warn";
            delBtn.onclick = () => {
                if (confirm(`Delete "${seq.title}"?`)) {
                    sequences.splice(idx, 1);
                    window.adminSelectedIndices.delete(idx); // Cleanup
                    populateSequenceSelect();
                    renderAdminDashboard(); 
                }
            };

            row.appendChild(chkDiv);
            row.appendChild(catInput);
            row.appendChild(titleInput);
            row.appendChild(delBtn);
            list.appendChild(row);
        });
    }

    // E. ADD NEW
    const addBtn = document.createElement("button");
    addBtn.textContent = "+ New Sequence";
    addBtn.className = "tiny";
    addBtn.style.marginTop = "15px";
    addBtn.onclick = () => {
        const title = prompt("Name for new sequence?");
        if (title) {
            sequences.push({ title, category: "Uncategorized", poses: [] });
            populateSequenceSelect();
            renderAdminDashboard();
        }
    };
    list.appendChild(addBtn);
}

if (localStorage.getItem("admin_mode_enabled") === "true") {
    window.enableEditing = true;
}
// #endregion
// #region 8. ADMIN & DATA LAYER
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
    localStorage.setItem("asana_library_backup_v1", JSON.stringify(asanaLibrary));

    // 3. Resolve immediately
    return Promise.resolve();
}

/* ==========================================================================
   LEGACY BRIDGE (Fixes 'setAdminMode is not defined')
   ========================================================================== */

// Restoring this function prevents the crash
window.setAdminMode = function(val) {
    // Update the new global flag
    window.enableEditing = !!val;
    localStorage.setItem("admin_mode_enabled", window.enableEditing);
    
    // Update the UI checkbox if it exists
    const cb = document.getElementById("adminEditToggle"); // The new one
    if (cb) cb.checked = window.enableEditing;

    // Refresh Browse if active
    if (typeof applyBrowseFilters === 'function') applyBrowseFilters();
};

// Ensure toggleAdminUI is globally available for the HTML button
if (typeof toggleAdminUI !== 'function') {
    window.toggleAdminUI = function(show) {
        // Fallback if Region 7 didn't load it globally
        const backdrop = document.getElementById("manageSequencesBackdrop");
        if (backdrop) {
            if (show && typeof renderAdminDashboard === 'function') renderAdminDashboard();
            backdrop.style.display = show ? "flex" : "none";
        }
    };
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
        const res = await fetch("image_overrides.json", { cache: "no-store" });
        if (res.ok) imageOverrides = await res.json();
    } catch (e) { imageOverrides = {}; }
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
    if (!window.enableEditing) return;

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

    // B. Create the new "Edit Content" button
    if (!document.getElementById("quickEditBtn")) {
        const editBtn = document.createElement("button");
        editBtn.id = "quickEditBtn";
        editBtn.innerHTML = "✏️";
        editBtn.title = "Edit Current Course (Timings & Poses)";
        editBtn.className = "tiny";
        editBtn.style.cssText = "margin-left: 10px; padding: 4px 10px; font-size: 1.1rem; vertical-align: middle;";
        
        // Insert it right after the dropdown
        seqSelect.parentNode.insertBefore(editBtn, seqSelect.nextSibling);

        editBtn.onclick = () => {
            if (!currentSequence) return alert("Select a sequence first.");
            openEditCourse(); // Reuse your existing edit modal
        };
    }

    // C. Dropdown Logic (Fixed: Stops timer, Waits for user to click Start)
    seqSelect.addEventListener("change", () => {
       const idx = seqSelect.value;
       stopTimer(); 
       
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

       currentSequence = sequences[parseInt(idx, 10)];
       updateTotalAndLastUI();

       try {
          setPose(0);
          setStatus("Ready to Start"); 
          const btn = $("startStopBtn");
          if (btn) btn.textContent = "Start";
       } catch (e) {
          console.error(e);
       }
    });
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

// Clear History Button
if ($("clearHistoryBtn")) $("clearHistoryBtn").onclick = () => {
    if (!currentSequence) return;
    if (confirm("Clear all completion dates for this sequence?")) {
        if (window.completionHistory && window.completionHistory[currentSequence.title]) {
            delete window.completionHistory[currentSequence.title];
            localStorage.setItem("asana_app_history", JSON.stringify(window.completionHistory));
            openHistoryModal("current"); // Refresh list
            updateTotalAndLastUI(); // Refresh pill
        }
    }
};

function openHistoryModal(defaultTab = "current") {
    if (!histBackdrop) return;
    
    // 1. Setup Current View
    const titleEl = $("historyTitle");
    if (titleEl && currentSequence) titleEl.textContent = currentSequence.title;

    const listEl = $("historyList");
    if (listEl && currentSequence) {
        listEl.innerHTML = "";
        const historyData = window.completionHistory || {};
        const dates = historyData[currentSequence.title] || [];
        
        if (dates.length === 0) {
            listEl.innerHTML = `<div class="muted">No completion history yet.</div>`;
        } else {
            [...dates].reverse().forEach(dateStr => {
                const row = document.createElement("div");
                row.style.cssText = "padding:8px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between;";
                
                const d = new Date(dateStr);
                const niceDate = isNaN(d) ? dateStr : d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                row.textContent = niceDate;
                listEl.appendChild(row);
            });
        }
    }

    // 2. Open & Switch Tab
    switchHistoryTab(defaultTab);
    histBackdrop.style.display = "flex";
}

// New: Render Global Dashboard
function renderGlobalHistory() {
   const container = $("globalHistoryList");
   if (!container) return;
   container.innerHTML = "";

   const history = window.completionHistory || {};
   const allSeqs = window.sequences || [];
   const grouped = {};
   let totalCompletions = 0;

   // 1. Map Titles to Categories (from courses.json)
   const titleToCat = {};
   allSeqs.forEach(s => titleToCat[s.title] = s.category || "Uncategorized");

   // 2. Aggregate Data
   Object.keys(history).forEach(title => {
       const dates = history[title];
       if(!dates || !dates.length) return;

       const cat = titleToCat[title] || "Archived / Deleted Sequences";
       if(!grouped[cat]) grouped[cat] = [];

       // Sort dates (newest first)
       const sortedDates = [...dates].sort((a,b) => new Date(b) - new Date(a));
       const lastDate = new Date(sortedDates[0]);

       grouped[cat].push({
           title: title,
           count: dates.length,
           lastDate: lastDate,
           lastDateStr: lastDate.toLocaleDateString()
       });
       totalCompletions += dates.length;
   });

   // 3. Render
   if (Object.keys(grouped).length === 0) {
       container.innerHTML = `<div class="msg">No history found for any sequence.</div>`;
       return;
   }

   const statsHeader = document.createElement("div");
   statsHeader.style.cssText = "padding:10px; background:#e3f2fd; color:#0d47a1; border-radius:6px; margin-bottom:15px; font-weight:bold; text-align:center;";
   statsHeader.textContent = `🎉 Total Sessions Completed: ${totalCompletions}`;
   container.appendChild(statsHeader);

   // Sort Categories Alphabetically
   Object.keys(grouped).sort().forEach(catName => {
       const items = grouped[catName];
       // Sort items inside category by Recency (Last Completed)
       items.sort((a,b) => b.lastDate - a.lastDate);

       const section = document.createElement("details");
       section.open = true; // Default open
       section.style.marginBottom = "10px";
       section.style.border = "1px solid #ddd";
       section.style.borderRadius = "6px";
       section.style.background = "#fff";

       const summary = document.createElement("summary");
       summary.style.padding = "10px";
       summary.style.cursor = "pointer";
       summary.style.fontWeight = "bold";
       summary.style.background = "#f5f5f5";
       summary.style.borderRadius = "6px 6px 0 0";
       summary.innerHTML = `${catName} <span style="font-weight:normal; color:#666; font-size:0.85em;">(${items.length} seqs)</span>`;
       
       const content = document.createElement("div");
       content.style.padding = "0";

       items.forEach(item => {
           const row = document.createElement("div");
           row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; font-size:0.9rem;";
           
           // Count Badge style
           let countColor = "#eee";
           if(item.count > 5) countColor = "#ffe0b2"; // Orange for 5+
           if(item.count > 10) countColor = "#c8e6c9"; // Green for 10+

           row.innerHTML = `
               <div style="flex:1;">
                   <div style="font-weight:600;">${item.title}</div>
                   <div style="font-size:0.8rem; color:#888;">Last: ${item.lastDateStr}</div>
               </div>
               <div style="background:${countColor}; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold;">
                   ${item.count}x
               </div>
           `;
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
   localStorage.removeItem("lastPlayedSequence");
   localStorage.removeItem("currentPoseIndex");
   localStorage.removeItem("timeLeft");
   
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

// 3. UI Toggles
safeListen("historyLink", "click", (e) => {
    e.preventDefault();
    toggleHistoryPanel();
});

safeListen("adminModeToggle", "change", (e) => {
    setAdminMode(e.target.checked);
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
            console.log("✅ Server sync success");
        } else {
            console.warn("⚠️ Saved locally only (Server sync failed)");
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

function openEditCourse() {
    if (!currentSequence) {
        alert("Please select a course first");
        return;
    }

    editingCourseIndex = courses.findIndex(c => c.title === currentSequence.title);
    if (editingCourseIndex === -1) {
        alert("Could not find course");
        return;
    }

    editingCourseData = JSON.parse(JSON.stringify(currentSequence));

    $("editCourseTitle").textContent = currentSequence.title;
    renderEditList();

    // --- NEW: Inject the "Save & Sync" Button dynamically ---
    injectSyncButtonIntoModal();

    const backdrop = $("editCourseBackdrop");
    if (backdrop) backdrop.style.display = "flex";
}
/**
 * Adds a blank row to the editing data and re-renders.
 */
function addNewPose() {
    // Add a blank row structure: [ID, Time, Label, null, Notes]
    editingCourseData.poses.push(["", 0, "", null, ""]);
    renderEditList();
}

function deletePose(index) {
    if (confirm("Remove this pose?")) {
        editingCourseData.poses.splice(index, 1);
        renderEditList();
    }
}

function handlePoseSelection(inputElement) {
    const val = inputElement.value.trim();
    const idx = inputElement.dataset.idx;
    
    // Lookup in library by Name
    const library = getAsanaIndex();
    const match = library.find(a => 
        (a.english && a.english.toLowerCase() === val.toLowerCase()) || 
        (a['Yogasana Name'] && a['Yogasana Name'].toLowerCase() === val.toLowerCase())
    );

    if (match) {
        // Auto-fill Label if it is currently empty
        const labelInput = document.querySelector(`.edit-label[data-idx="${idx}"]`);
        if (labelInput && !labelInput.value) {
            labelInput.value = match.english || match['Yogasana Name'];
        }
    }
}
/**
 * Creates a "Save & Sync to GitHub" button inside the modal footer
 * and hides the old main-page buttons.
 */
function injectSyncButtonIntoModal() {
    // 1. Hide the old main page buttons
    const oldSync = $("syncGitHubBtn");
    const oldExport = $("exportCourseBtn");
    if (oldSync) oldSync.style.display = "none";
    if (oldExport) oldExport.style.display = "none";

    // 2. Find the Save button to place our new button next to
    const saveBtn = $("editCourseSaveBtn");
    if (!saveBtn) return;

    const parent = saveBtn.parentElement;
    
    // Check if we already added the button to prevent duplicates
    if (document.getElementById("editCourseSyncBtn")) return;

    // 3. Create the new button
    const syncBtn = document.createElement("button");
    syncBtn.id = "editCourseSyncBtn";
    syncBtn.textContent = "💾 Save & Sync to GitHub";
    syncBtn.className = "tiny"; // Match your app's style
    syncBtn.style.cssText = "background: #2e7d32; color: white; margin-left: 10px;";
    
    // 4. The Logic: Save Local -> Sync GitHub
    syncBtn.onclick = async () => {
        // A. Save to Local Memory first
        const success = saveEditedCourse(true); // true = silent mode (no alert)
        if (!success) return;

        // B. Push to GitHub
        await syncDataToGitHub("courses.json", window.courses);
        
        // C. Close Modal
        $("editCourseBackdrop").style.display = "none";
        editingCourseData = null;
    };

    // Insert after the existing Save button
    parent.insertBefore(syncBtn, saveBtn.nextSibling);
    
    // Optional: Update the text of the original save button to clarify it's local only
    saveBtn.textContent = "Save Locally Only";
}

function renderEditList() {
    if (!editingCourseData || !editingCourseData.poses) return;

    const container = $("editCourseList");
    if (!container) return;

    // 1. GET LIBRARY: Reuse the existing reliable index
    const library = getAsanaIndex();

    // 2. BUILD SEARCH OPTIONS: Create the autocomplete list from the library
    // We map over the library to create <option> tags for the inputs to use
    const dataListOptions = library.map(a => {
        // Try English, then Yogasana Name, then fall back to ID
        const name = a.english || a['Yogasana Name'] || a.id || "";
        // Clean quotes to prevent HTML errors
        return `<option value="${name.replace(/"/g, '&quot;')}">`;
    }).join("");

    // 3. SETUP CONTAINER HTML
    container.innerHTML = `
        <div style="padding: 12px; background:#f5f5f5; border-radius:8px; margin-bottom:12px;">
            <strong>Edit Sequence:</strong> Add, remove, or modify poses. Search for poses by name.
        </div>
        
        <datalist id="asanaOptions">
            ${dataListOptions}
        </datalist>

        <table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed;">
            <thead>
                <tr style="background:#f9f9f9; border-bottom:2px solid #eee;">
                    <th style="padding:10px; width:5%; text-align:center;">#</th>
                    <th style="padding:10px; text-align:left; width:35%;">Pose (Search)</th>
                    <th style="padding:10px; text-align:left; width:15%;">Time (s)</th>
                    <th style="padding:10px; text-align:left; width:20%;">Label</th>
                    <th style="padding:10px; text-align:left; width:20%;">Notes</th>
                    <th style="padding:10px; text-align:center; width:5%;"></th>
                </tr>
            </thead>
            <tbody id="editTableBody">
            </tbody>
        </table>
        
        <div style="margin-top:15px; text-align:center;">
             <button id="addPoseBtn" style="padding:8px 16px; cursor:pointer; background:#e0f7fa; border:1px solid #006064; border-radius:4px; color:#006064; font-weight:600;">
                + Add Pose
             </button>
        </div>
    `;

    const tbody = container.querySelector("#editTableBody");
    if (!tbody) return;

    // 4. RENDER ROWS
    editingCourseData.poses.forEach((pose, idx) => {
        // Handle data structure safely
        const asanaId = Array.isArray(pose[0]) ? pose[0][0] : pose[0];
        const timing = pose[1] || 0;
        const label = pose[2] || "";
        const notes = pose[4] || "";

        // -- LOGIC FIX: LOOKUP NAME LOCALLY --
        // We search the library for a matching ID or asanaNo
        const match = library.find(a => a.id == asanaId || a.asanaNo == asanaId);
        
        // Determine what to display in the input box
        let poseName = "";
        if (match) {
            poseName = match.english || match['Yogasana Name'] || asanaId;
        } else {
            // If not found, show the ID (or blank if ID is null)
            poseName = asanaId || ""; 
        }

        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid #eee";
        row.innerHTML = `
            <td style="padding:10px; text-align:center; color:#888;">${idx + 1}</td>
            
            <td style="padding:10px;">
                <input type="text" 
                       class="edit-pose-name" 
                       data-idx="${idx}" 
                       list="asanaOptions" 
                       value="${poseName.replace(/"/g, '&quot;')}" 
                       placeholder="Type to search..."
                       style="width:100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
            </td>
            
            <td style="padding:10px;">
                <input type="number" class="edit-timing" data-idx="${idx}" value="${timing}" min="0" max="3600" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
            </td>
            
            <td style="padding:10px;">
                <input type="text" class="edit-label" data-idx="${idx}" value="${label}" placeholder="Label" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
            </td>
            
            <td style="padding:10px;">
                <input type="text" class="edit-notes" data-idx="${idx}" value="${notes}" placeholder="Notes" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:4px;">
            </td>
            
            <td style="padding:10px; text-align:center;">
                <button class="delete-pose-btn" data-idx="${idx}" style="background:none; border:none; color:#d32f2f; cursor:pointer; font-size:18px; font-weight:bold;">
                    &times;
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // 5. ATTACH LISTENERS
    
    // Add Button
    document.getElementById("addPoseBtn").addEventListener("click", addNewPose);

    // Delete Buttons
    document.querySelectorAll(".delete-pose-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            // Use closest to ensure we catch the click even if user clicks the icon
            const idx = parseInt(e.target.closest('button').dataset.idx);
            deletePose(idx);
        });
    });

    // Smart Input (Auto-fill Label on selection)
    document.querySelectorAll(".edit-pose-name").forEach(input => {
        input.addEventListener("change", (e) => handlePoseSelection(e.target));
    });
}

/**
 * Saves changes to the global 'courses' variable.
 * @param {boolean} silent - If true, suppresses the "Saved" alert (used when syncing immediately after).
 */
function saveEditedCourse(silent = false) {
    if (!editingCourseData || editingCourseIndex === -1) return false;

    const library = getAsanaIndex();
    const newPoses = [];
    const rowCount = document.querySelectorAll(".edit-pose-name").length;

    for (let i = 0; i < rowCount; i++) {
        const nameInput = document.querySelector(`.edit-pose-name[data-idx="${i}"]`);
        const timeInput = document.querySelector(`.edit-timing[data-idx="${i}"]`);
        const labelInput = document.querySelector(`.edit-label[data-idx="${i}"]`);
        const notesInput = document.querySelector(`.edit-notes[data-idx="${i}"]`);

        if (!nameInput) continue;

        const nameVal = nameInput.value.trim();
        let finalId = nameVal; // Default: keep the text if no ID found

        // Reverse Lookup: Find ID based on Name
        const match = library.find(a => 
            (a.english && a.english.toLowerCase() === nameVal.toLowerCase()) || 
            (a['Yogasana Name'] && a['Yogasana Name'].toLowerCase() === nameVal.toLowerCase())
        );

        if (match) {
            // Prefer ID, fallback to asanaNo
            finalId = match.id || match.asanaNo || nameVal;
        }

        // Skip completely empty rows
        if (!finalId && !labelInput.value) continue;

        newPoses.push([
            finalId,
            parseInt(timeInput.value) || 0,
            labelInput.value,
            null,
            notesInput.value
        ]);
    }

    // Save back to global object
    editingCourseData.poses = newPoses;
    courses[editingCourseIndex] = JSON.parse(JSON.stringify(editingCourseData));
    
    // Update live sequence if it's the one currently open
    if(currentSequence && currentSequence.title === editingCourseData.title) {
        currentSequence = courses[editingCourseIndex];
    }

    if (!silent) {
        const backdrop = $("editCourseBackdrop");
        if (backdrop) backdrop.style.display = "none";
        alert("Changes saved locally.");
        editingCourseData = null;
        editingCourseIndex = -1;
    }
    
    return true;
}

safeListen("editCourseBtn", "click", openEditCourse);
safeListen("editCourseCloseBtn", "click", () => {
    $("editCourseBackdrop").style.display = "none";
    editingCourseData = null;
});
safeListen("editCourseCancelBtn", "click", () => {
    $("editCourseBackdrop").style.display = "none";
    editingCourseData = null;
});
// The original save button just does a local save
safeListen("editCourseSaveBtn", "click", () => saveEditedCourse(false));
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
// 4. APP STARTUP (Crucial!)
window.onload = init;

// #endregion
