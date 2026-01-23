// #region 1. STATE & CONSTANTS
/* ==========================================================================
   APP CONFIGURATION & CONSTANTS
   ========================================================================== */

// 1. Data Sources
const SEQUENCES_URL = "sequences.json";
const MANIFEST_URL = "images/manifest.json";
const PLATE_GROUPS_URL = "plate_groups.json";
const INDEX_CSV_URL = "index.csv";

// 2. Paths
const IMAGES_BASE = "images/";
const AUDIO_BASE = "audio/";
const IMAGES_MAIN_BASE = "images/";   // Since you moved to root, main is just root
const IMAGES_MOBILE_BASE = "images/"; // Same for mobile if you aren't generating w800 anymore

// 3. Server Overrides & Saving (Admin Features)
const OVERRIDE_URL = "sequences_override.json";
const SAVE_URL = "save_sequences.php";

const DESCRIPTIONS_OVERRIDE_URL = "descriptions_override.json";
const SAVE_DESCRIPTION_URL = "save_description.php";

const CATEGORY_OVERRIDE_URL = "category_overrides.json";
const SAVE_CATEGORY_URL = "save_category.php";

const IMAGE_OVERRIDE_URL = "image_overrides.json";
const SAVE_IMAGE_URL = "save_image_override.php";

const AUDIO_OVERRIDE_URL = "audio_overrides.json";
const UPLOAD_AUDIO_URL = "upload_audio.php";

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
let sequences = [];
let asanaIndex = [];    // Full CSV data
let asanaByNo = {};     // Quick lookup map (e.g. "203" -> Object)
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

// -------- Audio File Player (MP3) --------
/**
 * Logic Flow:
 * 1. Check Specific Override ("Ujjayi Stage 1")
 * 2. Check Global ID Override ("203")
 * 3. Fallback: Auto-guess file "audio/203_Ujjayi.mp3"
 * 4. Side Detection: Play audio cue for Left/Right poses
 */
function playAsanaAudio(asana, poseLabel = null) {
   if (!asana) return;

   // 1. Side Detection - Play audio cue for left/right poses
   if (poseLabel) {
      const side = detectSide(poseLabel);
      if (side) {
         setTimeout(() => playSideCue(side), 100);
      }
   }

   // 2. Reset current audio
   if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
      currentAudio = null;
   }

   // 2. Prepare Identifiers
   const idStr = normalizePlate(asana.asanaNo);
   const mainName = (asana.english || asana.title || asana['Yogasana Name'] || "").trim();
   const variation = (asana.variation || asana['Variation'] || "").trim();
   
   const specificKey = variation ? `${mainName} ${variation}` : mainName;
   const norm = (s) => String(s || "").trim();

   // 3. Check Overrides (Admin Tool)
   let overrideSrc = null;
   if (typeof audioOverrides !== 'undefined') {
       // Priority A: Specific Variation
       if (specificKey && audioOverrides[norm(specificKey)]) {
           overrideSrc = audioOverrides[norm(specificKey)];
       } 
       // Priority B: Global ID
       else if (idStr && audioOverrides[idStr]) {
           overrideSrc = audioOverrides[idStr];
       }
   }

   if (overrideSrc) {
       const src = overrideSrc.includes("/") ? overrideSrc : (AUDIO_BASE + overrideSrc);
       const a = new Audio(src);
       a.play().then(() => { currentAudio = a; }).catch(e => console.warn("Override play failed:", e));
       return; 
   }

   // 4. Fallback: Auto-detect file logic
   if (!idStr) return;
   const safeName = mainName.replace(/[^a-zA-Z0-9]/g, "");
   const candidates = [];

   const pushId = (x) => {
      if (!x) return;
      const formatted = (String(x).length < 3) ? String(x).padStart(3, "0") : String(x);
      candidates.push(`${AUDIO_BASE}${formatted}_${safeName}.mp3`);
   };

   // Try exact ID (e.g. "172a") then base ID (e.g. "172")
   pushId(idStr);
   const digitPart = (idStr.match(/^\d+/) || [null])[0];
   if (digitPart && digitPart !== idStr) pushId(digitPart);

   // Recursive player: tries candidate 1, if fail, tries candidate 2
   let i = 0;
   const tryNext = () => {
      if (i >= candidates.length) return; 
      const src = candidates[i++];
      const a = new Audio(src);
      a.addEventListener("error", () => tryNext(), { once: true });
      a.play().then(() => { currentAudio = a; }).catch(() => tryNext());
   };

   tryNext();
}

// #endregion
// #region 3. HELPERS & FORMATTING
/* ==========================================================================
   STRING & DATA FORMATTERS
   ========================================================================== */

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

/* ==========================================================================
   REGION 3: CSV DATA HANDLING (STRICT ID MODE)
   ========================================================================== */
// 1. FETCH AND INDEX (The Strict Version)
async function fetchAndParseCSV() {
    try {
        const res = await fetch(CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`CSV 404: ${CSV_URL}`);
        
        const text = await res.text();
        const rows = parseCSV(text); // Use your existing parser
        
        asanaByNo = {};
        if (rows.length < 2) return; 

        const headers = rows[0];

        // Loop through rows (skipping the header row)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 1) continue;

            // Convert row array to object
            const asana = {};
            headers.forEach((h, idx) => {
                asana[h.trim()] = row[idx] || "";
            });

            // ⚡ STRICT LOOKUP: Only check the first column (ID)
            let id = row[0] ? String(row[0]).trim() : "";
            
            // Normalize ID (e.g., "5" -> "005")
            if (/^\d+$/.test(id)) {
                id = id.padStart(3, '0');
            }

            // Save to index ONLY if ID exists. 
            // We DO NOT check other columns for plates/ranges anymore.
            if (id) {
                asanaByNo[id] = asana;
            }
        }
        console.log(`CSV Index Built. Loaded ${Object.keys(asanaByNo).length} poses.`);
        
    } catch (e) {
        console.error("CSV Load Failed", e);
    }
}

// 2. PARSER (Your existing code - logic is perfect, kept as is)
function parseCSV(text) {
   const rows = [];
   let cur = [];
   let val = "";
   let inQuotes = false;
   
   for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
         if (c === '"') {
            const next = text[i + 1];
            if (next === '"') {
               val += '"';
               i++;
            } else {
               inQuotes = false;
            }
         } else {
            val += c;
         }
      } else {
         if (c === '"') {
            inQuotes = true;
         } else if (c === ',') {
            cur.push(val);
            val = "";
         } else if (c === '\n') {
            cur.push(val);
            val = "";
            if (cur.length === 1 && cur[0] === "") {
               cur = [];
               continue;
            }
            rows.push(cur.map(x => String(x ?? "").replace(/\r$/, "")));
            cur = [];
         } else {
            val += c;
         }
      }
   }
   if (val.length || cur.length) {
      cur.push(val);
      rows.push(cur.map(x => String(x ?? "").replace(/\r$/, "")));
   }
   return rows;
}

// 3. UTILITIES
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
// #region 4. DATA LAYER & PARSING
/* ==========================================================================
   DATA LOADING & PARSING
   ========================================================================== */

// 1. Generic JSON Loader with Robust Error Handling
async function loadJSON(url, fallback = null) {
   try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
         console.warn(`Fetch failed ${res.status} for ${url}`);
         return fallback;
      }
      const data = await res.json();
      return data;
   } catch (e) {
      console.error(`Error loading ${url}:`, e);
      return fallback;
   }
}

// 2. Load Sequences (Base + Server Override) with Robust Error Handling
async function loadSequences() {
   // A. Load Base with fallback to empty array
   const baseData = await loadJSON(SEQUENCES_URL, []);

   if (!Array.isArray(baseData) || baseData.length === 0) {
      console.error("Failed to load sequences.json - using empty array");
      sequences = [];
      if (typeof renderSequenceDropdown === "function") renderSequenceDropdown();
      return;
   }

   let finalData = baseData;

   // B. Load Server Overrides (High Priority)
   try {
      const serverData = await fetch(OVERRIDE_URL, { cache: "no-store" }).then(r => r.json());
      if (Array.isArray(serverData) && serverData.length > 0) {
         console.log("Loaded sequences from Server Override");
         finalData = serverData;
      }
   } catch (e) {
      console.log("No server override found, using default.");
   }

   // C. Validate each sequence has required fields
   sequences = finalData.filter(seq => {
      if (!seq || !seq.title || !Array.isArray(seq.poses)) {
         console.warn("Invalid sequence detected, skipping:", seq);
         return false;
      }
      // Ensure category exists, default to "Uncategorized"
      if (!seq.category) {
         seq.category = "Uncategorized";
      }
      return true;
   });

   // D. Refresh UI
   if (typeof renderSequenceDropdown === "function") renderSequenceDropdown();
}

// 3. Local Sequence Editing (Save/Reset)
function saveSequencesLocally() {
   if (!sequences || !sequences.length) return;
   if (typeof LOCAL_SEQ_KEY !== 'undefined') {
       localStorage.setItem(LOCAL_SEQ_KEY, JSON.stringify(sequences));
   }
   if (typeof renderSequenceDropdown === "function") renderSequenceDropdown();
   alert("Changes saved to browser storage!");
}

function resetToOriginalJSON() {
   if(!confirm("This will erase all your custom edits and categories. Are you sure?")) return;
   if (typeof LOCAL_SEQ_KEY !== 'undefined') {
       localStorage.removeItem(LOCAL_SEQ_KEY);
   }
   location.reload();
}

// 4. Load & Parse CSV Index
// 4. Load & Parse CSV Index (STRICT ID ONLY)
async function loadAsanaIndex() {
   if (typeof INDEX_CSV_URL === 'undefined') return [];

   const res = await fetch(INDEX_CSV_URL, { cache: "no-store" });
   if (!res.ok) throw new Error("Failed to load index.csv");
   
   let text = await res.text();
   const rows = parseCSV(text);
   if (!rows.length) return [];

   const header = rows[0].map(h => String(h || "").trim());
   const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase() || h.includes(name));

   // Column Mappings
   const colNo = idx("#");
   const colEng = idx("Yogasana Name");
   const colIAST = idx("IAST Name");
   const colDesc = idx("Description"); 
   const colTech = idx("Technique"); 
   const colCat = header.findIndex(h => /category|classification/i.test(h));

   // Variation Columns (Keep these for tabs)
   const specificVarHeaders = [
       "I", "Ia", "Ib", "II", "IIa", "IIb", "III", "IIIa", "IIIb", 
       "IV", "IVa", "IVb", "V", "Va", "Vb", "VI", "VIa", "VIb", 
       "VII", "VIIa", "VIIb", "VIII", "VIIIa", "VIIIb", "IX", "X", 
       "XI", "XII", "XIII", "XIV", "XV", "XVI"
   ];
   const varCols = [];
   specificVarHeaders.forEach(hName => {
       const i = header.findIndex(h => h === hName); 
       if (i >= 0) varCols.push({ index: i, label: hName });
   });

   const out = [];
   
   for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      // 1. GET ID STRICTLY
      const asanaNoRaw = (colNo >= 0 ? row[colNo] : "") || "";
      const asanaNo = normalizePlate(asanaNoRaw); // e.g. "5" -> "005"

      // Skip invalid IDs
      if (!asanaNo || asanaNo.length > 10 || !/^[a-zA-Z0-9_\-]+$/.test(asanaNo)) continue;

      // 2. Extract Variations
      const inlineVars = [];
      varCols.forEach(vc => {
          const val = row[vc.index];
          if (val && val.trim().length > 0) { 
              inlineVars.push({ label: vc.label, text: val.trim() });
          }
      });

      // 3. Build Object (Ignoring Plate Columns)
      const asanaObj = {
          asanaNo,
          english: (colEng >= 0 ? row[colEng] : "") || "",
          iast: (colIAST >= 0 ? row[colIAST] : "") || "",
          description: (colDesc >= 0 ? row[colDesc] : "") || "",
          technique: (colTech >= 0 ? row[colTech] : "") || "",
          inlineVariations: inlineVars,
          // We keep 'allPlates' just for search filtering, but strictly based on ID now
          allPlates: [asanaNo], 
          category: (colCat >= 0 ? row[colCat] : "") || "",
      };

      out.push(asanaObj);
   }
   return out;
}

/* ==========================================================================
   IMAGE INDEXING & RESOLUTION
   ========================================================================== */

/**
 * 1. Build the Image Map
 * Scans your image folder and maps "218" -> ["images/218_dhyana.jpg"]
 */
async function buildImageIndexes() {
   const manifest = await loadJSON(MANIFEST_URL);
   const items = manifestToFileList(manifest);

   asanaToUrls = {}; // Global map for ID -> [URLs]

   items.forEach(item => {
      const rel = manifestItemToPath(item);
      if (!rel) return;

      const lower = rel.toLowerCase();
      if (!(lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp"))) return;

      const rawID = primaryAsanaFromFilename(filenameFromUrl(rel));
      const normalizedKey = rawID ? normalizePlate(rawID) : null;
      const url = normalizeImagePath(rel);

      if (normalizedKey) {
         if (!asanaToUrls[normalizedKey]) asanaToUrls[normalizedKey] = [];
         if (!asanaToUrls[normalizedKey].includes(url)) {
            asanaToUrls[normalizedKey].push(url);
         }
      }
   });

   Object.keys(asanaToUrls).forEach(k => asanaToUrls[k].sort());
}

/**
 * 2. Find Image URL for a specific ID
 */
function smartUrlsForPoseId(idField) {
   let id = Array.isArray(idField) ? idField[0] : idField;
   id = normalizePlate(id);
   
   if (!id) return [];

   if (typeof imageOverrides !== 'undefined' && imageOverrides[id]) {
       let ov = imageOverrides[id];
       if (ov && !ov.startsWith("images/") && !ov.startsWith("http") && !ov.startsWith("/")) {
           ov = "images/" + ov;
       }
       return [ov];
   }

   return asanaToUrls[id] || [];
}

/**
 * 3. Find CSV Data for a specific ID
 */
function findAsanaByIdOrPlate(idField) {
   let id = Array.isArray(idField) ? idField[0] : idField;
   if (!id) return null;
   
   id = String(id).trim();
   // Standardize to 3 digits (e.g. "5" -> "005") to match CSV column #
   if (/^\d+$/.test(id)) id = id.padStart(3, '0');

   return asanaByNo[id] || null;
}

/**
 * 4. Helper for UI
 */
function urlsForPlateToken(p) {
   return smartUrlsForPoseId(p);
}

// --- CORE UTILITIES ---

function manifestToFileList(manifest) {
   if (Array.isArray(manifest)) return manifest;
   if (!manifest || typeof manifest !== "object") return [];

   const looksLikePlateMap = (obj) => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
      const keys = Object.keys(obj);
      if (keys.length === 0) return false;
      const digitKeys = keys.filter(k => /^\d+$/.test(String(k))).length;
      return digitKeys >= Math.max(1, Math.floor(keys.length * 0.7));
   };

   if (manifest.images && looksLikePlateMap(manifest.images)) {
      return Object.entries(manifest.images).map(([plate, meta]) => {
         return (meta && typeof meta === "object" && !Array.isArray(meta)) ? { plate, ...meta } : { plate, main: meta };
      });
   }
   if (looksLikePlateMap(manifest)) {
      return Object.entries(manifest).map(([plate, meta]) => {
         return (meta && typeof meta === "object" && !Array.isArray(meta)) ? { plate, ...meta } : { plate, main: meta };
      });
   }

   const candidates = [manifest.files, manifest.images, manifest.items, manifest.main];
   for (const c of candidates) { if (c && Array.isArray(c)) return c; }
   return [];
}

function manifestItemToPath(item) {
   if (typeof item === "string") return item;
   if (!item || typeof item !== "object") return null;
   return item.filename || item.main || item.path || item.file || item.name || null;
}

function normalizeImagePath(p) {
   if (!p) return null;
   const s = String(p).replace(/\\/g, "/").replace(/^\.?\//, "");
   if (s.startsWith("http") || s.startsWith(IMAGES_BASE)) return s;
   return IMAGES_BASE + s;
}

async function fetchIdAliases() {
    try {
        const res = await fetch("id_aliases.json", { cache: "no-store" });
        if (res.ok) idAliases = await res.json();
    } catch (e) { idAliases = {}; }
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
    
    const seqName = sequences[state.sequenceIdx]?.title || "your previous session";
    banner.innerHTML = `
        <span>Resume <b>${seqName}</b> at pose ${state.poseIdx + 1}?</span>
        <button id="resumeYes" style="background:#4CAF50; color:white; border:none; padding:5px 12px; border-radius:15px; cursor:pointer;">Yes</button>
        <button id="resumeNo" style="background:transparent; color:#ccc; border:none; cursor:pointer;">✕</button>
    `;
    
    document.body.appendChild(banner);

    banner.querySelector("#resumeYes").onclick = () => {
        const sel = $("sequenceSelect");
        sel.value = state.sequenceIdx;
        sel.dispatchEvent(new Event('change'));
        setTimeout(() => {
            setPose(state.poseIdx);
            banner.remove();
        }, 100);
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

async function init() {
    try {
        // 1. Core Config & Admin
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();
        if (typeof loadAdminMode === "function") loadAdminMode();

        // 2. Load Overrides First (Sequence, Audio, Image)
        // This prevents the "Uncaught Error" by ensuring data is ready before UI renders
        await Promise.all([
            typeof fetchServerHistory === "function" ? fetchServerHistory() : Promise.resolve(),
            typeof fetchAudioOverrides === "function" ? fetchAudioOverrides() : Promise.resolve(),
            typeof fetchImageOverrides === "function" ? fetchImageOverrides() : Promise.resolve(),
            typeof fetchServerAudioList === "function" ? fetchServerAudioList() : Promise.resolve(),
            typeof fetchServerImageList === "function" ? fetchServerImageList() : Promise.resolve(),
            typeof fetchDescriptionOverrides === "function" ? fetchDescriptionOverrides() : Promise.resolve(),
            typeof fetchCategoryOverrides === "function" ? fetchCategoryOverrides() : Promise.resolve(),
            typeof fetchIdAliases === "function" ? fetchIdAliases() : Promise.resolve()
        ]);

        // 3. Load Main Data
        const statusEl = $("statusText");
        if (statusEl) statusEl.textContent = "Loading images...";
        
        await buildImageIndexes();
        
        if (statusEl) statusEl.textContent = "Loading sequences...";
        await loadSequences();
        
        if (statusEl) statusEl.textContent = "Loading index...";
        asanaIndex = await loadAsanaIndex();

        // 4. Apply Logic
        if (typeof applyDescriptionOverrides === "function") applyDescriptionOverrides();
        if (typeof applyCategoryOverrides === "function") applyCategoryOverrides();
        
        asanaByNo = {};
        asanaIndex.forEach(a => {
            const k = normalizePlate(a.asanaNo);
            if (k) asanaByNo[k] = a;
        });
        
        if (typeof setupBrowseUI === "function") setupBrowseUI();

        // 5. Final UI Polish
        if (statusEl) statusEl.textContent = "Ready";

        const state = safeGetLocalStorage(RESUME_STATE_KEY, null);
        if (state && state.timestamp) {
            // Only offer resume if it was saved in the last 4 hours
            const fourHours = 4 * 60 * 60 * 1000;
            if (Date.now() - state.timestamp < fourHours) {
                showResumePrompt(state);
            } else {
                clearProgress(); // Clean up old state
            }
        }

        const loadText = $("loadingText");
        if (loadText) loadText.textContent = "Select a sequence";
        
    } catch (e) {
        console.error("Init Error:", e);
        if ($("statusText")) $("statusText").textContent = "Error";
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
      $("startStopBtn").textContent = "Pause";
   
      // Play audio immediately when starting
      const currentPose = currentSequence.poses[currentIndex];
      if (currentPose) {
          const [idField, , poseLabel] = currentPose;
          const plate = Array.isArray(idField) ? normalizePlate(idField[0]) : normalizePlate(idField);

          // ⚡ STRICT FIX: Only use the strict lookup function
          const asana = findAsanaByIdOrPlate(plate);

          if (asana) playAsanaAudio(asana, poseLabel);
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
   $("startStopBtn").textContent = "Start";
   disableWakeLock();
}

function updateTimerUI() {
   const timerEl = $("poseTimer");
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
    if (currentIndex < poses.length - 1) {
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

   function setPose(idx) {
      if (!currentSequence) return;
      // --- DEBUGGING START ---
    const debugPose = currentSequence.poses[idx];
    console.log("--------------------------------");
    console.log("DEBUG POSE #", idx);
    console.log("Raw from JSON:", debugPose);
    console.log("Raw ID:", debugPose[0]);
    // --- DEBUGGING END ---
      const poses = currentSequence.poses || [];
      if (idx < 0 || idx >= poses.length) return;
   
      // 1. SAVE PROGRESS
      if (typeof saveCurrentProgress === "function") saveCurrentProgress();
   
      currentIndex = idx;
      
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
   
      // 4. HEADER UI (RE-APPLIED)
      const nameEl = document.getElementById("poseName");
      if (nameEl) {
          const jsonLabel = label ? String(label).trim() : "";
          const csvName = asana ? (asana.english || asana['Yogasana Name'] || "").trim() : "";
   
          let finalTitle = "";
   
          // LOGIC: "Sirsasana Cycle - (Parsva Sirsasana)"
          if (jsonLabel && csvName && jsonLabel !== csvName) {
              finalTitle = `${jsonLabel} - (${csvName})`;
          } else {
              finalTitle = jsonLabel || csvName || "Pose";
          }
   
          nameEl.textContent = finalTitle;
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
      if (counterEl) counterEl.textContent = `${idx + 1} / ${poses.length}`;
   
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
   const total = poses.reduce((acc, p) => acc + (Number(p?.[1]) || 0), 0);
   $("totalTimePill").textContent = `Total: ${formatHMS(total)}`;

   const title = currentSequence && currentSequence.title ? currentSequence.title : null;
   if (title) {
      const source = (typeof serverHistoryCache !== 'undefined' && Array.isArray(serverHistoryCache) && serverHistoryCache.length) ? serverHistoryCache : loadCompletionLog();
      const last = source.filter(x => x && x.title === title && typeof x.ts === "number").sort((a, b) => b.ts - a.ts)[0];
      $("lastCompletedPill").textContent = last ?
         `Last: ${new Date(last.ts).toLocaleString("en-AU", { 
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" 
    })}` : "Last: –";
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

    // Backdrop Click Logic (IIFE)
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

    // Input Listeners with Debounce
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
    if ($("browseFinalOnly")) $("browseFinalOnly").addEventListener("change", onChange);
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
    
    // Ensure we exit detail mode so the list shows next time it's opened
    exitBrowseDetailMode();
    
    // Clear the detail content so it doesn't "flash" old data next time
    const d = $("browseDetail");
    if (d) d.innerHTML = "";

    if ($("browseBtn")) $("browseBtn").focus();
}

function renderBrowseList(items) {
   const list = document.getElementById("browseList");
   if (!list) return;
   
   list.innerHTML = "";
   const countEl = document.getElementById("browseCount");
   if (countEl) countEl.textContent = `Showing ${items.length} of ${asanaIndex.length}`;

   if (!items.length) {
      list.innerHTML = `<div class="msg" style="padding:10px 0">No matches found.</div>`;
      return;
   }

   const frag = document.createDocumentFragment();
   
   // Limit to 400 items for performance
   items.slice(0, 400).forEach(asma => {
      const row = document.createElement("div");
      row.className = "browse-item";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      
      // Construct Title: Name + Variation (if present)
      let titleText = asma.english || asma['Yogasana Name'] || "(no name)";
      if (asma.variation) {
          titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${asma.variation})</span>`;
      }
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
      btn.type = "button";
      btn.textContent = "View";
      btn.className = "tiny"; 
      btn.addEventListener("click", () => {
         showAsanaDetail(asma);
         if (typeof isBrowseMobile === 'function' && isBrowseMobile()) {
             enterBrowseDetailMode();
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
      more.textContent = `Showing first 400 results. Narrow your filters to see others.`;
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

   // 1. Setup Data
   const techniqueName = asma.english || asma['Yogasana Name'] || "(no name)";
   const rowVariations = asanaIndex.filter(v => (v.english || v['Yogasana Name']) === techniqueName);
   const isRestorative = (asma.category && asma.category.includes("Restorative"));

   // 2. Mobile Back Button
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

   // 3. Header
   const h = document.createElement("h2");
   h.className = "detail-title";
   h.textContent = techniqueName;
   const audioBtn = document.createElement("button");
   audioBtn.textContent = "🔊";
   audioBtn.style.cssText = "margin-left:10px; cursor:pointer; border:none; background:transparent; font-size:1.2rem;";
   audioBtn.onclick = () => playAsanaAudio(asma);
   h.appendChild(audioBtn);
   d.appendChild(h);

   // 4. Subtitle
   const sub = document.createElement("div");
   sub.className = "sub";
   sub.textContent = `${asma.iast || ""} • Asana # ${asma.asanaNo} • ${asma.category || ""}`;
   d.appendChild(sub);

   // 5. Description
   if (asma.description) {
       const descBlock = document.createElement("div");
       descBlock.style.cssText = "margin: 10px 0; font-style: italic; color: #555; line-height: 1.4; border-left: 3px solid #eee; padding-left: 10px;";
       descBlock.textContent = asma.description; 
       d.appendChild(descBlock);
   }

   // 6. TABS & LAYOUT LOGIC
   let tabsSource = [];
   
   // Priority 1: Inline Columns (L-AQ)
   if (asma.inlineVariations && asma.inlineVariations.length > 0) {
       tabsSource = asma.inlineVariations.map(iv => ({
           label: iv.label, text: iv.text, imagesId: asma.asanaNo, rowId: asma.asanaNo 
       }));
   } 
   // Priority 2: Row Variations
   else if (rowVariations.length > 0) {
       tabsSource = rowVariations.map((v, i) => ({
           label: v.variation || `Stage ${i+1}`,
           text: v.technique || v.description || "", 
           imagesId: v.asanaNo, rowId: v.asanaNo
       }));
   } 
   // Priority 3: Main Item
   else {
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

      // A. Create Image Wrapper
      const imgWrap = document.createElement("div");
      imgWrap.className = "detail-images-wrapper";
      const targets = [tab.imagesId];
      const _seen = new Set();
      imgWrap.appendChild(renderPlateSection("", targets, _seen, tab.imagesId));

      // B. Create Text Wrapper
      const instructions = document.createElement("div");
      instructions.className = "desc-text";
      instructions.style.marginTop = "15px";
      instructions.style.marginBottom = "15px";
      const bodyInst = document.createElement("div");
      bodyInst.style.whiteSpace = "pre-wrap"; 
      bodyInst.style.lineHeight = "1.6";
      bodyInst.innerHTML = `<strong>Instructions:</strong>\n` + (formatTechniqueText(tab.text) || "No instructions.");
      instructions.appendChild(bodyInst);

      // C. CONDITIONAL APPEND (Restorative = Text First)
      if (isRestorative) {
          pane.appendChild(instructions);
          pane.appendChild(imgWrap);
      } else {
          pane.appendChild(imgWrap);
          pane.appendChild(instructions);
      }

      // Tab Interaction
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

   // 7. ADMIN MENU INJECTION
   if (typeof adminMode !== 'undefined' && adminMode) {
      renderAdminDetailTools(d, asma, rowVariations);
   }
}

// Helper to inject Admin Tools into Detail View
function renderAdminDetailTools(container, asma, rowVariations) {
      const adminDetails = document.createElement("details");
      adminDetails.style.marginTop = "20px";
      adminDetails.style.borderTop = "1px solid #ccc";
      adminDetails.style.paddingTop = "10px";

      const adminSum = document.createElement("summary");
      adminSum.textContent = "Advanced / Admin Options";
      adminSum.style.cursor = "pointer";
      adminSum.style.fontWeight = "bold";
      adminDetails.appendChild(adminSum);

      const adminContent = document.createElement("div");
      adminContent.style.padding = "10px";
      adminContent.style.background = "#f4f4f4";

      // A. Category Editor
      const catDiv = document.createElement("div");
      catDiv.style.marginBottom = "10px";
      catDiv.innerHTML = "<strong>Category:</strong> ";
      
      const catLabels = { 
          "": "(no category)", 
          "01_Standing_and_Basic": "01 Standing & Basic", 
          "02_Seated_and_Lotus_Variations": "02 Seated & Lotus", 
          "03_Forward_Bends": "03 Forward Bends", 
          "04_Inversions_Sirsasana_Sarvangasana": "04 Inversions", 
          "05_Abdominal_and_Supine": "05 Abdominal & Supine", 
          "06_Twists": "06 Twists", 
          "07_Arm_Balances": "07 Arm Balances", 
          "08_Advanced_Leg_behind_Head": "08 Leg Behind Head and Advanced", 
          "09_Backbends": "09 Backbends", 
          "10_Restorative_Pranayama": "10 Restorative/Pranayama" 
      };
      const catSel = document.createElement("select");
      catSel.className = "tiny";
      Object.entries(catLabels).forEach(([v, l]) => {
         const o = document.createElement("option"); o.value = v; o.textContent = l; catSel.appendChild(o);
      });
      catSel.value = asma.category || "";
      const saveCatBtn = document.createElement("button");
      saveCatBtn.textContent = "Save"; 
      saveCatBtn.className = "tiny";
      saveCatBtn.style.marginLeft = "5px";
      saveCatBtn.onclick = async () => {
         await saveCategoryOverride(asma.asanaNo, catSel.value);
         applyBrowseFilters();
      };
      catDiv.appendChild(catSel);
      catDiv.appendChild(saveCatBtn);
      adminContent.appendChild(catDiv);

      // B. Media Manager (Call Helper)
      const mediaDiv = document.createElement("div");
      mediaDiv.innerHTML = `<hr><strong>Manage Media</strong>`;
      renderMediaManager(mediaDiv, asma, rowVariations);

      adminContent.appendChild(mediaDiv);
      adminDetails.appendChild(adminContent);
      container.appendChild(adminDetails);
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
          const u = urlsForPlateToken(p);
          
          if (!u.length) {
             missing.push(p);
          }
          
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

   // 1. Try explicit plates first
   processIds(targets);

   // 2. FALLBACK LOGIC
   if (urls.length === 0 && fallbackId) {
       const fallbackUrls = urlsForPlateToken(fallbackId);
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

   // 3. Render Metadata
   const meta = document.createElement("div");
   meta.className = "muted";
   meta.style.marginTop = "4px";
   meta.style.fontSize = "0.8rem";
   if (targets.length) {
       meta.textContent = `Ref Plates: ${targets.join(", ")}`;
       wrap.appendChild(meta);
   }

   // 4. Render Collage
   if (urls.length) {
      if (typeof renderCollage === "function") {
         wrap.appendChild(renderCollage(urls));
      } else {
         console.warn("renderCollage function missing");
      }
   }

   // 5. Render Missing Notice
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
      const mob = mobileVariantUrl(u);
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

function renderSequenceDropdown() {
   const sel = $("sequenceSelect");
   if (!sel) return;
   
   const currentVal = sel.value;
   sel.innerHTML = `<option value="">Select a sequence</option>`;

   const grouped = {};
   sequences.forEach((s, idx) => {
      const cat = s.category ? s.category.trim() : "Uncategorized";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ s, idx });
   });

   const categoryNames = Object.keys(grouped).sort();

   categoryNames.forEach(catName => {
      const groupEl = document.createElement("optgroup");
      groupEl.label = catName;
      grouped[catName].forEach(item => {
         const opt = document.createElement("option");
         opt.value = String(item.idx);
         opt.textContent = item.s.title || `Sequence ${item.idx + 1}`;
         groupEl.appendChild(opt);
      });
      sel.appendChild(groupEl);
   });

   if (currentVal) sel.value = currentVal;
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
   const haystack = (
      String(asma.english || "") + " " + 
      String(asma.iast || "") + " " + 
      String(asma.variation || "")
   ).toLowerCase();
   return haystack.includes(q.toLowerCase());
}

function parsePlateQuery(q) {
   const s = String(q || "").trim();
   if (!s) return [];
   const unified = s.replace(/[,\s]+/g, "|");
   return parseIndexPlateField(unified);
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
    if (modal) {
        modal.classList.remove("detail-mode");
    }
}
// #endregion
// #region 8. ADMIN & OVERRIDES
/* ==========================================================================
   ADMIN STATE & TOGGLES
   ========================================================================== */

function loadAdminMode() {
    try {
        adminMode = JSON.parse(localStorage.getItem(ADMIN_MODE_KEY) || "false") === true;
    } catch (e) {
        adminMode = false;
    }
    const cb = $("adminModeToggle");
    if (cb) cb.checked = adminMode;
    
    const hint = $("adminHint");
    if (hint) hint.style.display = adminMode ? "block" : "none";
}

function setAdminMode(val) {
    adminMode = !!val;
    localStorage.setItem(ADMIN_MODE_KEY, JSON.stringify(adminMode));
    
    const cb = $("adminModeToggle");
    if (cb) cb.checked = adminMode;
    
    const hint = $("adminHint");
    if (hint) hint.style.display = adminMode ? "block" : "none";
    
    // Refresh view if looking at details
    const currentNo = $("browseDetail")?.getAttribute("data-asana-no");
    if (currentNo) {
        const asma = asanaIndex.find(a => normalizePlate(a.asanaNo) === normalizePlate(currentNo));
        if (asma) showAsanaDetail(asma);
    }
}

window.toggleAdminUI = function(show) {
    // 1. Target the container from your HTML
    const panel = document.getElementById("adminContainer");
    
    if (!panel) {
        console.error("❌ Error: <div id='adminContainer'> not found.");
        return;
    }

    // 2. Logic to Open/Close
    const isHidden = (panel.style.display === "none" || panel.style.display === "");
    const shouldShow = (typeof show === "boolean") ? show : isHidden;

    panel.style.display = shouldShow ? "block" : "none";

    // 3. Build the Editor Interface (First run only)
    if (shouldShow) {
        const editorDiv = document.getElementById("adminBulkEditor");
        
        // If empty, inject the table structure
        if (editorDiv && editorDiv.innerHTML.trim() === "") {
            editorDiv.innerHTML = `
                <div style="background:#f9f9f9; padding:15px; border-bottom:1px solid #ddd; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <strong>Bulk Actions:</strong>
                    <input type="text" id="newCatInput" placeholder="New Category Name..." style="padding:6px; border:1px solid #ccc;">
                    <button onclick="applyBulkCategory()" class="tiny">Apply Category</button>
                    <div style="flex:1"></div>
                    <button onclick="window.saveSequencesLocally()" style="background:#2e7d32; color:white; border:none; padding:8px 15px; cursor:pointer;">💾 Save Changes</button>
                </div>
                <div style="overflow-x:auto; margin-top:10px;">
                    <table style="width:100%; border-collapse:collapse; font-size:14px;">
                        <thead style="background:#eee; text-align:left;">
                            <tr>
                                <th style="padding:8px; width:40px; text-align:center;"><input type="checkbox" onchange="toggleAllSequences(this)"></th>
                                <th style="padding:8px; width:30%;">Category</th>
                                <th style="padding:8px;">Sequence Title</th>
                                <th style="padding:8px; width:60px;">Index</th>
                            </tr>
                        </thead>
                        <tbody id="bulkTableBody">
                            </tbody>
                    </table>
                </div>
            `;
        }

        // 4. Populate Data
        if (typeof renderBulkTableRows === "function") {
            renderBulkTableRows();
        }
    }
};

/* ==========================================================================
   DATA FETCHING (GET)
   ========================================================================== */

async function fetchDescriptionOverrides() {
    try {
        const res = await fetch(DESCRIPTIONS_OVERRIDE_URL, { cache: "no-store" });
        if (!res.ok) {
            descriptionOverrides = {};
            return;
        }
        const data = await res.json();
        descriptionOverrides = (data && typeof data === "object") ? data : {};
    } catch (e) {
        descriptionOverrides = {};
    }
}

async function fetchCategoryOverrides() {
    try {
        const res = await fetch(CATEGORY_OVERRIDE_URL, { cache: "no-store" });
        if (!res.ok) {
            categoryOverrides = {};
            return;
        }
        const data = await res.json();
        categoryOverrides = (data && typeof data === "object") ? data : {};
    } catch (e) {
        categoryOverrides = {};
    }
}

async function fetchAudioOverrides() {
    try {
        const res = await fetch(AUDIO_OVERRIDE_URL, { cache: "no-store" });
        if (res.ok) audioOverrides = await res.json();
    } catch (e) {
        console.warn("No audio overrides found (using defaults).");
        audioOverrides = {};
    }
}

async function fetchImageOverrides() {
    try {
        const res = await fetch("image_overrides.json", { cache: "no-store" });
        if (res.ok) imageOverrides = await res.json();
    } catch (e) {
        console.log("No image overrides found.");
        imageOverrides = {};
    }
}

async function fetchServerAudioList() {
    try {
        const res = await fetch("list_audio.php");
        if (res.ok) serverAudioFiles = await res.json();
    } catch (e) {
        console.warn("Could not list server audio files.");
        serverAudioFiles = [];
    }
}

async function fetchServerImageList() {
    try {
        const res = await fetch("list_images.php");
        if (res.ok) serverImageFiles = await res.json();
    } catch (e) {
        console.warn("Could not list server image files.");
        serverImageFiles = [];
    }
}

/* ==========================================================================
   DATA APPLICATION (APPLY)
   ========================================================================== */

function applyDescriptionOverrides() {
    asanaIndex.forEach(a => {
        const key = normalizePlate(a.asanaNo);
        const o = descriptionOverrides && descriptionOverrides[key];
        if (o && typeof o === "object" && typeof o.md === "string") {
            a.descriptionMd = o.md;
            a.descriptionUpdatedAt = o.updated_at || "";
            a.descriptionSource = "override";
        } else {
            a.descriptionMd = a.defaultDescriptionMd || "";
            a.descriptionUpdatedAt = "";
            a.descriptionSource = a.descriptionMd ? "csv" : "";
        }
    });
}

function applyCategoryOverrides() {
    asanaIndex.forEach(a => {
        const key = normalizePlate(a.asanaNo);
        const o = categoryOverrides && categoryOverrides[key];
        if (o && typeof o === "object" && typeof o.category === "string" && o.category.trim()) {
            a.category = o.category.trim();
            a.categoryUpdatedAt = o.updated_at || "";
            a.categorySource = "override";
        }
    });
}

/* ==========================================================================
   DATA SAVING (POST)
   ========================================================================== */

async function saveDescriptionOverride(asanaNo, md) {
    const payload = {
        asana_no: normalizePlate(asanaNo),
        md: String(md || "")
    };
    const res = await fetch(SAVE_DESCRIPTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Save failed");
    
    const out = await res.json();
    if (!out || out.status !== "success") throw new Error(out?.message || "Save failed");
    
    descriptionOverrides[normalizePlate(asanaNo)] = {
        md: payload.md,
        updated_at: out.updated_at || ""
    };
    applyDescriptionOverrides();
}

async function saveCategoryOverride(asanaNo, category) {
    const payload = {
        asana_no: normalizePlate(asanaNo),
        category: String(category || "").trim()
    };
    const res = await fetch(SAVE_CATEGORY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Save failed");
    
    const out = await res.json();
    if (!out || out.status !== "success") throw new Error(out?.message || "Save failed");
    
    if (payload.category) {
        categoryOverrides[normalizePlate(asanaNo)] = {
            category: payload.category,
            updated_at: out.updated_at || ""
        };
    } else {
        delete categoryOverrides[normalizePlate(asanaNo)];
    }
    applyCategoryOverrides();
}

/* ==========================================================================
   UI RENDERERS (COMPLEX ADMIN TOOLS)
   ========================================================================== */

function renderIdFixer(container, brokenId) {
    if (typeof adminMode === 'undefined' || !adminMode) return;

    const normBroken = normalizePlate(brokenId);
    const currentAlias = (typeof idAliases !== 'undefined') ? idAliases[normBroken] : null;

    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px dashed #ccc";
    wrap.style.fontSize = "0.85rem";

    // Status Display
    let statusHTML = "";
    if (currentAlias) {
        const parts = currentAlias.split("|");
        const displayTo = parts.length > 1 ? `ID ${parts[0]} (${parts[1]})` : `ID ${parts[0]}`;
        statusHTML = `<div style="margin-bottom:4px; color:green;">✅ <b>${normBroken}</b> ➝ <b>${displayTo}</b></div>`;
    } else {
        statusHTML = `<div style="margin-bottom:4px; color:#e65100;">🔧 <b>ID ${normBroken}</b> is unlinked</div>`;
    }

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

    // Search Logic
    const searchInput = wrap.querySelector("#fixerSearch");
    const select = wrap.querySelector("#fixerSelect");

    searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();
        if (q.length < 2) return;
        const matches = asanaIndex.filter(a =>
            (a.english.toLowerCase().includes(q) || a.asanaNo.includes(q))
        ).slice(0, 10);

        select.innerHTML = "";

        matches.forEach(m => {
            const mainOpt = document.createElement("option");
            mainOpt.value = normalizePlate(m.asanaNo);
            mainOpt.textContent = `[${m.asanaNo}] ${m.english} (Main)`;
            select.appendChild(mainOpt);

            if (m.inlineVariations) {
                m.inlineVariations.forEach(iv => {
                    const vOpt = document.createElement("option");
                    vOpt.value = `${normalizePlate(m.asanaNo)}|${iv.label}`;
                    vOpt.textContent = `   ↳ ${iv.label} : ${iv.text.substring(0, 30)}...`;
                    select.appendChild(vOpt);
                });
            }
        });
    };

    // Save Logic
    wrap.querySelector("#fixerSaveBtn").onclick = async () => {
        const newVal = select.value;
        if (!newVal) return alert("Select target.");
        if (confirm(`Map ID ${normBroken} -> ${newVal}?`)) {
            try {
                const res = await fetch("save_id_alias.php", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_id: normBroken, new_id: newVal })
                });
                const json = await res.json();
                if (json.status === "success") {
                    alert("Linked!");
                    location.reload();
                }
            } catch (e) { console.error(e); }
        }
    };

    container.appendChild(wrap);
}

function renderMediaManager(container, asma, rowVariations) {
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
                   <select id="audioSelectServer" class="tiny" style="width:100%; margin-bottom:2px;"><option value="">Select server file...</option></select>
                   <button id="linkAudioBtn" class="tiny" style="width:100%;">Link Selected</button>
                </div>
                <div style="border-top:1px dotted #ccc; padding-top:5px;">
                   <input type="file" id="audioUploadInput" accept="audio/*" class="tiny" style="width:100%; margin-bottom:2px;">
                   <button id="uploadAudioBtn" class="tiny" style="width:100%;">Upload & Link</button>
                </div>
             </div>
             <div style="flex:1; padding-left:5px;">
                <div style="font-weight:bold; margin-bottom:5px;">🖼️ IMAGE</div>
                <div id="currentImageLabel" style="margin-bottom:8px; font-size:0.8rem; color:#666; min-height:1.2em;"></div>
                <div style="margin-bottom:8px;">
                   <select id="imageSelectServer" class="tiny" style="width:100%; margin-bottom:2px;"><option value="">Select server file...</option></select>
                   <button id="linkImageBtn" class="tiny" style="width:100%;">Link Selected</button>
                </div>
                <div style="border-top:1px dotted #ccc; padding-top:5px;">
                   <input type="file" id="imageUploadInput" accept="image/*" class="tiny" style="width:100%; margin-bottom:2px;">
                   <button id="uploadImageBtn" class="tiny" style="width:100%;">Upload & Link</button>
                </div>
             </div>
          </div>
      `;

    const targetSel = mediaDiv.querySelector("#mediaTargetKey");
    const optMain = document.createElement("option");
    const mainKey = normalizePlate(asma.asanaNo);
    optMain.value = mainKey;
    optMain.textContent = `Global (ID ${asma.asanaNo})`;
    targetSel.appendChild(optMain);

    // Populate Variations
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

    // Populate Server Lists
    const audioServerSel = mediaDiv.querySelector("#audioSelectServer");
    if (typeof serverAudioFiles !== 'undefined') {
        serverAudioFiles.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            audioServerSel.appendChild(opt);
        });
    }

    const imageServerSel = mediaDiv.querySelector("#imageSelectServer");
    if (typeof serverImageFiles !== 'undefined' && Array.isArray(serverImageFiles)) {
        serverImageFiles.forEach(f => {
            const opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            imageServerSel.appendChild(opt);
        });
    }

    const updateMediaLabels = () => {
        const key = targetSel.value;
        const curAudio = (typeof audioOverrides !== 'undefined' && audioOverrides[key]) ? audioOverrides[key] : "(Inherits Global)";
        mediaDiv.querySelector("#currentAudioLabel").innerHTML = `Curr: <b>${curAudio}</b>`;
        const curImage = (typeof imageOverrides !== 'undefined' && imageOverrides[key]) ? imageOverrides[key] : "(Default)";
        mediaDiv.querySelector("#currentImageLabel").innerHTML = `Curr: <b>${curImage}</b>`;
    };
    targetSel.onchange = updateMediaLabels;
    updateMediaLabels();

    // Button Handlers
    mediaDiv.querySelector("#linkAudioBtn").onclick = async () => {
        const val = audioServerSel.value;
        const targetKey = targetSel.value;
        if (!val) return alert("Select a file first.");
        try {
            const res = await fetch("save_audio_link.php", {
                method: "POST",
                body: JSON.stringify({ plate_id: targetKey, filename: val })
            });
            const json = await res.json();
            if (json.status === "success") {
                alert("Linked!");
                if (typeof audioOverrides !== 'undefined') audioOverrides[targetKey] = val;
                updateMediaLabels();
            }
        } catch (e) {}
    };

    mediaDiv.querySelector("#uploadAudioBtn").onclick = async () => {
        const fileInput = mediaDiv.querySelector("#audioUploadInput");
        const targetKey = targetSel.value;
        if (fileInput.files.length === 0) return alert("Select file first.");
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append("audio_file", file);
        formData.append("plate_id", targetKey);
        try {
            const res = await fetch("upload_audio.php", { method: "POST", body: formData });
            const json = await res.json();
            if (json.status === "success") {
                alert("Uploaded!");
                if (typeof audioOverrides !== 'undefined') audioOverrides[targetKey] = json.filename;
                const opt = document.createElement("option");
                opt.value = json.filename;
                opt.textContent = json.filename;
                audioServerSel.appendChild(opt);
                updateMediaLabels();
            }
        } catch (e) {}
    };

    mediaDiv.querySelector("#linkImageBtn").onclick = async () => {
        const val = imageServerSel.value;
        const targetKey = targetSel.value;
        if (!val) return alert("Select a file first.");
        try {
            const res = await fetch("save_image_override.php", {
                method: "POST",
                body: JSON.stringify({ plate_id: targetKey, filename: val })
            });
            const json = await res.json();
            if (json.status === "success") {
                alert("Image Linked!");
                if (typeof imageOverrides !== 'undefined') imageOverrides[targetKey] = val;
                updateMediaLabels();
                showAsanaDetail(asma);
            }
        } catch (e) {}
    };

    mediaDiv.querySelector("#uploadImageBtn").onclick = async () => {
        const fileInput = mediaDiv.querySelector("#imageUploadInput");
        const targetKey = targetSel.value;
        if (fileInput.files.length === 0) return alert("Select file first.");
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append("image_file", file);
        formData.append("plate_id", targetKey);
        try {
            const res = await fetch("upload_image.php", { method: "POST", body: formData });
            const json = await res.json();
            if (json.status === "success") {
                alert("Uploaded!");
                if (typeof imageOverrides !== 'undefined') imageOverrides[targetKey] = json.filename;
                const opt = document.createElement("option");
                opt.value = json.filename;
                opt.textContent = json.filename;
                imageServerSel.appendChild(opt);
                updateMediaLabels();
                showAsanaDetail(asma);
            }
        } catch (e) {}
    };

    container.appendChild(mediaDiv);
}

/* ==========================================================================
   BULK EDITOR LOGIC
   ========================================================================== */

if (!window.selectedSeqIndices) {
    window.selectedSeqIndices = new Set();
}

window.toggleSeqSelection = function(idx) {
    const index = parseInt(idx);
    if (window.selectedSeqIndices.has(index)) {
        window.selectedSeqIndices.delete(index);
    } else {
        window.selectedSeqIndices.add(index);
    }
};

window.toggleAllSequences = function(source) {
    const checkboxes = document.querySelectorAll(".seq-checkbox");
    window.selectedSeqIndices.clear();

    checkboxes.forEach(cb => {
        cb.checked = source.checked;
        if (source.checked) {
            window.selectedSeqIndices.add(parseInt(cb.value));
        }
    });
};

window.updateSingleField = function(idx, field, value) {
    if (sequences && sequences[idx]) {
        sequences[idx][field] = value;
    }
};

window.applyBulkCategory = function() {
    const inputEl = document.getElementById("newCatInput");
    const newCat = inputEl ? inputEl.value.trim() : "";

    if (!newCat) return alert("Please enter a category name");
    if (window.selectedSeqIndices.size === 0) return alert("No sequences selected");

    window.selectedSeqIndices.forEach(idx => {
        if (sequences[idx]) {
            sequences[idx].category = newCat;
        }
    });

    if (typeof renderBulkTableRows === "function") {
        renderBulkTableRows();
    }

    window.selectedSeqIndices.clear();
    if (inputEl) inputEl.value = "";
    alert("Category updated! Don't forget to click Save to Server.");
};
function renderBulkTableRows() {
  const tbody = document.getElementById("bulkTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (typeof window.selectedSeqIndices === 'undefined') window.selectedSeqIndices = new Set();

  sequences.forEach((s, idx) => {
     const tr = document.createElement("tr");
     tr.style.borderBottom = "1px solid #eee";
     const isChecked = window.selectedSeqIndices.has(idx) ? "checked" : "";
     const safeCat = String(s.category || "").replace(/"/g, '&quot;');
     const safeTitle = String(s.title || "").replace(/"/g, '&quot;');

     tr.innerHTML = `
        <td style="padding:5px; text-align:center;">
           <input type="checkbox" class="seq-checkbox" value="${idx}" ${isChecked} onchange="toggleSeqSelection(${idx})">
        </td>
        <td style="padding:5px;">
           <input type="text" value="${safeCat}" onchange="updateSingleField(${idx}, 'category', this.value)" style="width:100%; border:1px solid #eee; padding:4px;">
        </td>
        <td style="padding:5px;">
           <input type="text" value="${safeTitle}" onchange="updateSingleField(${idx}, 'title', this.value)" style="width:100%; border:1px solid #eee; padding:4px; font-weight:bold;">
        </td>
        <td style="padding:5px; color:#666; font-size:0.9em;">${idx}</td>
     `;
     tbody.appendChild(tr);
  });
}
// #endregion
// #region 9. WIRING UP UI ELEMENTS
/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */

// 1. Sequence Dropdown Selection
const seqSelect = $("sequenceSelect");
if (seqSelect) {
    seqSelect.addEventListener("change", () => {
       const idx = seqSelect.value;
       stopTimer();

       if (!idx) {
          // Reset UI if "Select Sequence" is chosen
          currentSequence = null;
          $("poseName").textContent = "Select a sequence";
          $("poseMeta").textContent = "";
          $("poseCounter").textContent = "–";
          $("poseTimer").textContent = "–";
          $("totalTimePill").textContent = "Total: –";
          $("lastCompletedPill").textContent = "Last: –";
          $("completeBtn").style.display = "none";
          $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`;
          return;
       }

       // Load the sequence
       currentSequence = sequences[parseInt(idx, 10)];
       updateTotalAndLastUI();

       try {
          setPose(0);
          // Auto-start timer after a brief delay (improved 1-click start flow)
          setTimeout(() => {
             if (currentSequence && !running) {
                $("status").textContent = "Starting...";
                setTimeout(() => startTimer(), 800);
             }
          }, 300);
       } catch (e) {
          console.error(e);
          $("collageWrap").innerHTML = `<div class="msg">Error rendering this pose. Check Console.</div>`;
       }
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
// 4. APP STARTUP (Crucial!)
window.onload = init;

// #endregion
