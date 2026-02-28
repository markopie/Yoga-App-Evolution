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
const SUPABASE_URL = "https://qrcpiyncvfmpmeuyhsha.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyY3BpeW5jdmZtcG1ldXloc2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTA2NDgsImV4cCI6MjA4NzI4NjY0OH0.7sjbfwdT_aYmrJyVFYWpfMNBQpCJAI7Vd5uNEkzD4GI";
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

window.currentUserId = null;

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
function normaliseText(str){
return (str || "")
    .toString()
    .normalize("NFD")                 // split accents
    .replace(/[\u0300-\u036f]/g,"")   // remove accents
    .toLowerCase()
    .trim();
}
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

async function loadCourses() {
    if (!supabase) {
        console.error("Supabase client not initialized");
        courses = []; sequences = []; return;
    }

    try {
        // 1. Fetch System Courses
        const { data: coursesData, error: coursesError } = await supabase.from('courses').select('*');
        if (coursesError) throw coursesError;

        console.log(`Fetched ${coursesData ? coursesData.length : 0} courses`);
        if (coursesData?.[0]) {
            console.warn('DIAG course row[0] keys:', Object.keys(coursesData[0]));
            console.warn('DIAG course row[0] sample:', JSON.stringify(coursesData[0]).slice(0, 300));
        }

        const rawAccumulator = [];

        // 2. Transform System Courses (Legacy Airtable + Snake_Case support)
        if (coursesData) {
            coursesData.forEach((row, idx) => {
                const title = (row.Course_Title ?? row.course_title ?? '').trim();
                const category = row.Category ?? row.category ?? '';
                const sequenceText = row.Sequence_Text ?? row.sequence_text ?? '';

                if (!title) return;

                const poses = parseSequenceText(sequenceText);
                if (idx < 2) console.warn(`DIAG row[${idx}] title="${title}" poses=${poses.length}`);

                if (Array.isArray(poses) && poses.length > 0) {
                    rawAccumulator.push({ 
                        title, 
                        category, 
                        poses,
                        isUserSequence: false,
                        // Maintain SN metadata if present
                        Inc_Namaskara: row.Inc_Namaskara ?? row.inc_namaskara ?? null,
                        Namaskara_Reps: row.Namaskara_Reps ?? row.namaskara_reps ?? null
                    });
                }
            });
        }

        // 3. Fetch & Add User Sequences
        const { data: userSeqs, error: userError } = await supabase.from('user_sequences').select('*');
        if (userError) console.error("Error loading user sequences", userError);

        if (userSeqs) {
            userSeqs.forEach(seq => {
                const poses = parseSequenceText(seq.sequence_text);
                if (poses && poses.length > 0) {
                    rawAccumulator.push({
                        title: (seq.title || '').trim(),
                        category: seq.category || 'My Sequences',
                        poses: poses,
                        isUserSequence: true,
                        supabaseId: seq.id,
                        Inc_Namaskara: seq.inc_namaskara ?? null,
                        Namaskara_Reps: seq.namaskara_reps ?? null
                    });
                }
            });
        }

        // 4. THE DEDUPLICATOR (The critical fix)
        // We use the trimmed, lowercase title as the key.
        const finalMap = new Map();
        rawAccumulator.forEach(item => {
            const key = String(item.title || "").trim().toLowerCase();
            // Since User sequences were added LAST to rawAccumulator, 
            // they will overwrite System sequences in the Map here.
            finalMap.set(key, item);
        });

        // 5. Final Sort and Global Assignment
        const deduplicated = Array.from(finalMap.values()).sort((a, b) => 
            a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        );

        // Update all global references to the CLEAN, deduplicated list only.
        courses = deduplicated;
        sequences = deduplicated;
        window.courses = deduplicated;

        console.log(`✅ Load complete. Unique sequences: ${courses.length}`);

        // 6. Trigger UI updates
        if (typeof renderSequenceDropdown === "function") {
            renderSequenceDropdown();
        } 
        if (typeof renderCourseUI === "function") {
            renderCourseUI();
        }

    } catch (e) {
        console.error("Exception loading courses:", e);
        courses = []; sequences = [];
    }
}
// --- TIME PARSER HELPER ---
function parseHoldTimes(holdStr) {
    const result = { standard: 30, short: 15, long: 60 }; // Fallbacks
    if (!holdStr) return result;
    
    const parts = String(holdStr).split('|').map(s => s.trim());
    parts.forEach(p => {
        // Match format "Standard: 0:30" or "Standard: 1:00"
        const match = p.match(/(Standard|Short|Long):\s*(\d+):(\d+)/i);
        if (match) {
            const key = match[1].toLowerCase();
            result[key] = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
        } else {
            // Match format "Standard: 30" (just seconds)
            const matchSec = p.match(/(Standard|Short|Long):\s*(\d+)/i);
            if (matchSec) result[matchSec[1].toLowerCase()] = parseInt(matchSec[2], 10);
        }
    });
    return result;
}

function secsToMSS(secs) {
    const s = Math.max(0, parseInt(secs, 10) || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildHoldString(standard, short, long) {
    return `Standard: ${secsToMSS(standard)} | Short: ${secsToMSS(short)} | Long: ${secsToMSS(long)}`;
}

// Helper function to parse sequence text into poses array
// Input format: "074 | 60 |\n215 | 600 | [Pratiloma IVb]\n203 | 300 | [Ujjāyī II (lying)]"
// Output format: [[id], duration, label, variationKey, note]
function parseSequenceText(sequenceText) {
    if (!sequenceText || typeof sequenceText !== 'string') return [];

    const lines = sequenceText.split('\n').map(line => line.trim()).filter(Boolean);
    const poses = [];

    lines.forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 2) return;

        const id = parts[0] || '';
        const duration = parseInt(parts[1], 10) || 0;
        
        // FIX: Grab everything from the 3rd part onwards and join with pipes
        // This ensures [Tadasana] | Prayer is captured as a single string
        const noteSection = parts.slice(2).join(' | ').trim();

        let variationKey = '';
        const note = noteSection;

        // Maintain your existing variation extraction logic
        const variationMatch = noteSection.match(/\[.*?\b([IVX]+[a-z]?)\]/);
        if (variationMatch) {
            variationKey = variationMatch[1];
        }

        const numericPart = id.match(/^(\d+)/);
        const suffix = id.replace(/^\d+/, '');
        const normalizedId = numericPart
            ? numericPart[1].replace(/^0+/, '').padStart(3, '0') + suffix
            : id;

        poses.push([
            [normalizedId],
            duration,
            '', 
            variationKey,
            note
        ]);
    });

    return poses;
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
    if (!supabase) {
        console.error("Supabase client not initialized");
        return {};
    }

    try {
        // 1. Load Global Asanas
        const { data: asanasData, error: asanasError } = await supabase.from('asanas').select('*');
        const normalized = {};

        if (asanasData) {
            asanasData.forEach((row) => {
                const rawId = row.ID ?? row.id ?? '';
                const paddedId = String(rawId).trim().replace(/^0+/, '') || '';
                if (!paddedId) return;
                const key = paddedId.padStart(3, '0');

                normalized[key] = {
                    id: key,
                    name: row.Name ?? row.name ?? '',
                    iast: row.IAST ?? row.iast ?? '',
                    english: row.English_Name ?? row.english_name ?? '',
                    technique: row.Technique ?? row.technique ?? '',
                    requiresSides: !!(row.Requires_Sides ?? row.requires_sides ?? false),
                    plates: typeof parsePlates === 'function' ? parsePlates(row.Plate_Numbers ?? row.plate_numbers ?? '') : (row.Plate_Numbers ?? row.plate_numbers ?? ''),
                    page2001: String(row.Page_2001 ?? row.page_2001 ?? ''),
                    page2015: String(row.Page_2015 ?? row.page_2015 ?? ''),
                    intensity: String(row.Intensity ?? row.intensity ?? ''),
                    note: row.Note ?? row.note ?? '',
                    category: row.Category ?? row.category ?? '',
                    description: row.Description ?? row.description ?? '',
                    hold: String(row.Hold ?? row.hold ?? ''),
                    Hold: String(row.Hold ?? row.hold ?? ''),
                    hold_data: parseHoldTimes(String(row.Hold ?? row.hold ?? '')),
                    variations: {},
                    isCustom: false
                };
            });
        }

        // 2. Load User Asanas and OVERWRITE globals
        try {
            const { data: userAsanasData } = await supabase.from('user_asanas').select('*');
            if (userAsanasData) {
                userAsanasData.forEach(userRow => {
                    const rawId = userRow.id ?? '';
                    const key = String(rawId).trim().replace(/^0+/, '').padStart(3, '0');
                    
                    if (normalized[key]) {
                        normalized[key] = {
                            ...normalized[key],
                            name: userRow.name ?? normalized[key].name,
                            iast: userRow.iast ?? normalized[key].iast,
                            english: userRow.english_name ?? normalized[key].english,
                            technique: userRow.technique ?? normalized[key].technique,
                            category: userRow.category ?? normalized[key].category,
                            description: userRow.description ?? normalized[key].description,
                            note: userRow.note ?? normalized[key].note,
                            hold: String(userRow.Hold ?? userRow.hold ?? ''),
                            Hold: String(userRow.Hold ?? userRow.hold ?? ''),
                            hold_data: parseHoldTimes(String(userRow.Hold ?? userRow.hold ?? '')),
                            isCustom: true
                        };
                    }
                });
            }
        } catch (e) { console.warn("Could not load user_asanas:", e.message); }

        // 3. Load All Stages (Global + User)
        const { data: stagesData } = await supabase.from('stages').select('*');
        const { data: userStagesData } = await supabase.from('user_stages').select('*');
        
        let allStagesData = stagesData ? [...stagesData] : [];
        if (userStagesData) allStagesData = allStagesData.concat(userStagesData);

        allStagesData.forEach((stage) => {
            let parentIdStr = stage.asana_id ?? (Array.isArray(stage.parent_id) ? stage.parent_id[0] : stage.parent_id) ?? null;
            if (!parentIdStr) return;

            const numPart = String(parentIdStr).match(/^(\d+)/);
            if (!numPart) return;
            const parentKey = numPart[1].replace(/^0+/, '').padStart(3, '0') + String(parentIdStr).replace(/^\d+/, '');
            
            if (!normalized[parentKey]) return;

            const stageKey = String(stage.Stage_Name ?? stage.stage_name ?? '').trim();
            if (!stageKey) return;

            const holdStr = stage.Hold ?? stage.hold ?? '';
            
            // User stages naturally overwrite global stages here because they were concatenated last
            normalized[parentKey].variations[stageKey] = {
                id: stage.id ?? '',
                technique: stage.Full_Technique ?? stage.full_technique ?? '',
                full_technique: stage.Full_Technique ?? stage.full_technique ?? '',
                shorthand: stage.Shorthand ?? stage.shorthand ?? '',
                title: stage.Title ?? stage.title ?? `Stage ${stageKey}`,
                hold: holdStr,
                hold_data: parseHoldTimes(holdStr),
                isCustom: !!stage.user_id 
            };
        });

        // --- DIAGNOSTIC PRINT ---
        Object.entries(normalized).forEach(([poseId, pose]) => {
            const keys = Object.keys(pose.variations);
            if (keys.length > 1) {
                console.log(`🧘 Pose ${poseId} variations (Merged):`);
                keys.forEach(k => console.log(`   Key: "${k}" | Custom: ${!!pose.variations[k].isCustom} | Title: "${pose.variations[k].title}"`));
            }
        });

        console.log(`Asana Library Loaded: ${Object.keys(normalized).length} poses`);
        return normalized;

    } catch (e) {
        console.error("Exception loading asana library:", e);
        return {};
    }
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
   Single source of truth: Supabase. localStorage is an offline fallback.

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

        // Fetch only the essentials for the list. 
    // We will fetch the 'Description' later only when a user selects a pose.
    const { data, error } = await supabase
    .from('asanas')
    .select('ID, Name, Category, Plate_Numbers, is_system');

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
         iso: r.completed_at,
         notes: r.notes || ''
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
    console.log("init() has started executing!");
    window.appInitialized = true; // Prevents the fallback from running twice
    try {
        const statusEl = $("statusText");
        
        // 1. Core Config
        if (typeof seedManualCompletionsOnce === "function") seedManualCompletionsOnce();
        if (typeof loadAdminMode === "function") loadAdminMode();

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
/* ==========================================================================
   TIMER ENGINE (Updated for Centered Focus Mode)
   ========================================================================== */

   function startTimer() {
    if (!currentSequence) return;
    if (running) { stopTimer(); return; }

    running = true;
    enableWakeLock();

    // --- ACTIVATE OVERLAY ---
    const overlay = document.getElementById("focusOverlay");
    if (overlay) {
        overlay.style.display = "flex";
        
        // Setup Button Action
        document.getElementById("focusPauseBtn").onclick = stopTimer;
        
        // Initial Data Populate
        document.getElementById("focusCourseTitle").textContent = currentSequence.title;
        // Trigger one UI update immediately to fill timer/images
        updateTimerUI();
        // Force image refresh for overlay
        const imgWrap = document.getElementById("focusImageWrap");
        const mainImg = document.querySelector("#collageWrap img");
        if(imgWrap && mainImg) {
             imgWrap.innerHTML = "";
             imgWrap.appendChild(mainImg.cloneNode(true));
        }
        document.getElementById("focusPoseName").textContent = document.getElementById("poseName").textContent;
    }
    // ------------------------

    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Running";

    // Play Audio
    const currentPose = currentSequence.poses[currentIndex];
    if (currentPose) {
        const [idField, , poseLabel] = currentPose;
        const plate = Array.isArray(idField) ? normalizePlate(idField[0]) : normalizePlate(idField);
        const asana = findAsanaByIdOrPlate(plate);
        if (asana) playAsanaAudio(asana, poseLabel, false);
    }

    timer = setInterval(() => {
        if (remaining > 0) remaining--;
        updateTimerUI();
        if (remaining <= 0) {
            const wasLongHold = currentPoseSeconds >= 60;
            if (running && wasLongHold) playFaintGong();
            if (wasLongHold) {
                clearInterval(timer);
                timer = null;
                startTransitionPause();
            } else {
                nextPose();
            }
        }
    }, 1000);
}

function startTransitionPause() {
    const overlay = document.getElementById("transitionOverlay");
    const countdownEl = document.getElementById("transitionCountdown");
    const nextPoseEl = document.getElementById("transitionNextPose");

    if (!overlay) { nextPose(); return; }

    const poses = currentSequence ? (currentSequence.poses || []) : [];
    let previewName = "";
    const nextIdx = currentIndex + 1;
    if (nextIdx < poses.length) {
        const np = poses[nextIdx];
        const id = Array.isArray(np[0]) ? np[0][0] : np[0];
        const asana = findAsanaByIdOrPlate(normalizePlate(id));
        previewName = asana ? displayName(asana) : "";
    }
    if (nextPoseEl) nextPoseEl.textContent = previewName ? `Next: ${previewName}` : "";

    let secs = 15;
    if (countdownEl) countdownEl.textContent = secs;
    overlay.style.display = "flex";

    const focusOverlay = document.getElementById("focusOverlay");
    if (focusOverlay) focusOverlay.style.display = "none";

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
        if (running) {
            const focusOvr = document.getElementById("focusOverlay");
            if (focusOvr) {
                focusOvr.style.display = "flex";
                const imgWrap = document.getElementById("focusImageWrap");
                const mainImg = document.querySelector("#collageWrap img");
                if (imgWrap && mainImg) {
                    imgWrap.innerHTML = "";
                    imgWrap.appendChild(mainImg.cloneNode(true));
                }
                const fName = document.getElementById("focusPoseName");
                const pName = document.getElementById("poseName");
                if (fName && pName) fName.textContent = pName.textContent;
            }
            timer = setInterval(() => {
                if (remaining > 0) remaining--;
                updateTimerUI();
                if (remaining <= 0) {
                    const wasLong = currentPoseSeconds >= 60;
                    if (running && wasLong) playFaintGong();
                    if (wasLong) {
                        clearInterval(timer);
                        timer = null;
                        startTransitionPause();
                    } else {
                        nextPose();
                    }
                }
            }, 1000);
        }
    }

    const skipBtn = document.getElementById("transitionSkipBtn");
    if (skipBtn) {
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

    updateTotalAndLastUI(); 

    const btn = document.getElementById("startStopBtn");
    if(btn) btn.textContent = "Start"; 

    const statusEl = document.getElementById("statusText");
    if (statusEl) statusEl.textContent = "Paused";

    disableWakeLock();
}
// A. IMPROVED UPDATE TIMER UI
function updateTimerUI() {
    // --- 1. Main Pose Countdown ---
    const timerEl = document.getElementById("poseTimer");
    if (timerEl) {
        if (!currentSequence) {
            timerEl.textContent = "–";
            timerEl.className = "";
        } else {
            const mm = Math.floor(remaining / 60);
            const ss = remaining % 60;
            const timeStr = `${mm}:${String(ss).padStart(2,"0")}`;
            timerEl.textContent = timeStr;
            
            // Sync Focus Overlay Timer
            const focusTimer = document.getElementById("focusTimer");
            if(focusTimer) focusTimer.textContent = timeStr;

            // Visual Warnings
            timerEl.className = "";
            if (remaining <= 5 && remaining > 0) timerEl.className = "critical";
            else if (remaining <= 10 && remaining > 0) timerEl.className = "warning";
        }
    }

    // --- 2. Smart Dashboard Update ---
    if (currentSequence) {
        // Calculate Seconds Left (Start with CURRENT pose remaining)
        let secondsLeft = remaining;

        // FIX: Add pending 2nd side if currently on 1st side
        if (needsSecondSide && currentSequence.poses[currentIndex]) {
             const currentDur = Number(currentSequence.poses[currentIndex][1]) || 0;
             secondsLeft += currentDur;
        }

        // Loop through FUTURE poses
        const poses = currentSequence.poses;
        for (let i = currentIndex + 1; i < poses.length; i++) {
             const p = poses[i];
             const dur = Number(p[1]) || 0;
             const id = Array.isArray(p[0]) ? p[0][0] : p[0];
             const asana = findAsanaByIdOrPlate(normalizePlate(id));
             
             // Account for Sides
             secondsLeft += (asana && asana.requiresSides) ? dur * 2 : dur;
        }
        
        const totalSeconds = calculateTotalSequenceTime();
        
        // Update Fixed Width Text Fields (No Jitter)
        const remEl = document.getElementById("timeRemainingDisplay");
        const totEl = document.getElementById("timeTotalDisplay");
        
        if (remEl) remEl.textContent = formatHMS(secondsLeft);
        if (totEl) totEl.textContent = formatHMS(totalSeconds);

        // Update Progress Bar
        const bar = document.getElementById("timeProgressFill");
        if (bar && totalSeconds > 0) {
            const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
            bar.style.width = `${pct}%`;
            bar.style.backgroundColor = pct < 10 ? "#ffccbc" : "#c8e6c9"; 
        }
        
        // Sync Overlay Text
        const focusTotal = document.getElementById("focusTotalTime");
        if(focusTotal) {
             focusTotal.textContent = `Time Left: ${formatHMS(secondsLeft)} / ${formatHMS(totalSeconds)}`;
        }
    }
}

// B. IMPROVED TOTAL TIME CALCULATION
function calculateTotalSequenceTime() {
    if (!currentSequence) return 0;
    
    return currentSequence.poses.reduce((acc, p) => {
        const dur = Number(p[1]) || 0;
        const id = Array.isArray(p[0]) ? p[0][0] : p[0];
        const asana = findAsanaByIdOrPlate(normalizePlate(id));
        
        // Correctly calculate total based on whether pose needs sides
        return acc + (asana && asana.requiresSides ? dur * 2 : dur);
    }, 0);
}
/* ==========================================================================
   NAVIGATION
   ========================================================================== */

   function nextPose() {
    if (!currentSequence) return;
    const poses = currentSequence.poses || [];

    // SCENARIO 1: Currently on Right Side of a two-sided pose? Go to Left.
    const currentPose = poses[currentIndex];
    
    // We check needsSecondSide. 
    // Note: In prevPose, we set this to TRUE if we moved back to the Right side.
    if (currentPose && needsSecondSide) {
        currentSide = "left";
        needsSecondSide = false; // Next click will move to new pose
        setPose(currentIndex, true); // Keep same pose index
        return;
    }

    // SCENARIO 2: Move to Next Index
    if (currentIndex < poses.length - 1) {
        currentSide = "right"; // Always start new poses on Right
        needsSecondSide = false; // setPose will recalculate this based on the new pose data
        setPose(currentIndex + 1);
    } else {
        // End of Sequence
        stopTimer();
        const compBtn = $("completeBtn");
        if (compBtn) compBtn.style.display = "inline-block";
    }
}

function prevPose() {
    if (!currentSequence) return;

    // SCENARIO 1: Currently on Left Side? Go back to Right Side of SAME pose.
    if (currentSide === "left") {
        currentSide = "right";
        needsSecondSide = true; // Re-enable the flag so "Next" will trigger Left again
        setPose(currentIndex, true); // true = don't reset state, keep manual side override
        return;
    }

    // SCENARIO 2: Go to Previous Index
    if (currentIndex > 0) {
        const newIndex = currentIndex - 1;
        
        // Check the Previous Pose to see if it has sides
        const prevPoseData = currentSequence.poses[newIndex];
        const idField = prevPoseData[0];
        const id = Array.isArray(idField) ? idField[0] : idField;
        const cleanId = normalizePlate(id);
        const asana = findAsanaByIdOrPlate(cleanId);

        if (asana && asana.requiresSides) {
            // It is two-sided. Since we are reversing, we land on the LEFT side.
            currentSide = "left";
            needsSecondSide = false; // We are on the final side, so next step is New Pose, not side switch
            setPose(newIndex, true); // true = preserve the 'left' side we just set
        } else {
            // Standard pose
            setPose(newIndex); // Standard reset
        }
    }
}

/* ==========================================================================
   RENDERER (SetPose)
   ========================================================================== */
   function setPose(idx, keepSamePose = false) {
    if (!currentSequence) return;
    const poses = currentSequence.poses || [];
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

    // VARIATION DURATION OVERRIDE: if pose has a variation key and that variation has a hold string, parse it
    const storedVarKey = currentPose[3];
    if (storedVarKey && asana && asana.variations && asana.variations[storedVarKey]) {
        const varData = asana.variations[storedVarKey];
        const varHoldStr = varData.hold || varData.Hold || "";
        if (varHoldStr) {
            const varHd = parseHoldTimes(varHoldStr);
            if (varHd.standard > 0) seconds = varHd.standard;
        }
    }

    // Sides Check
    if (asana && asana.requiresSides && !keepSamePose) {
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
        infoSpan.textContent = `ID: ${lookupId} • ${seconds}s `;
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

    if(document.getElementById("poseCounter")) {
        document.getElementById("poseCounter").textContent = `${idx + 1} / ${poses.length}`;
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
    console.log("setupBrowseUI() is running...");

    // 1. Wire up the main Browse button
    const bBtn = document.getElementById("browseBtn");
    if (bBtn) {
        console.log("✅ Browse button found! Attaching click listener.");
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
    console.log("✅ openBrowse() was successfully triggered!");
    
    const bd = $("browseBackdrop");
    console.log("🔍 Looking for backdrop element:", bd);
    
    if (!bd) {
        console.error("❌ ERROR: browseBackdrop not found in the HTML!");
        return;
    }
    
    bd.style.display = "flex";
    bd.setAttribute("aria-hidden", "false");
    console.log("✅ Backdrop display set to flex.");
    
    try {
        console.log("🔄 Calling applyBrowseFilters()...");
        applyBrowseFilters(); 
        console.log("✅ Filters applied successfully.");
    } catch (e) {
        console.error("❌ ERROR inside applyBrowseFilters:", e);
    }
    
    if ($("browseSearch")) $("browseSearch").focus();
};

// Ensure the local reference points to the window one just in case
const openBrowse = window.openBrowse;

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
      
      let titleText = displayName(asma) || "(no name)";
      if (asma.variation) titleText += ` <span style="font-weight:normal; color:#666; font-size:0.9em;">(${asma.variation})</span>`;
      title.innerHTML = titleText;

      const meta = document.createElement("div");
      meta.className = "meta";
      const catDisplay = asma.category ? asma.category.replace(/^\d+_/, "").replace(/_/g, " ") : "";
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
         console.log("View button clicked for asana:", asma);
         showAsanaDetail(asma);
         console.log("showAsanaDetail() completed");
         if (typeof isBrowseMobile === 'function' && isBrowseMobile()) {
            console.log("isBrowseMobile() returned true, calling enterBrowseDetailMode()");
            enterBrowseDetailMode();
         } else {
            console.log("isBrowseMobile() returned false or not a function");
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
    console.log("showAsanaDetail called with:", asana);
    const d = document.getElementById('browseDetail');
    console.log("browseDetail element found:", d);
    if (!d) {
        console.error("browseDetail element not found!");
        return;
    }

    d.innerHTML = "";
    console.log("browseDetail cleared");

    const titleEl = document.createElement("h2");
    titleEl.style.margin = "0 0 10px 0";
    titleEl.textContent = displayName(asana);
    d.appendChild(titleEl);
    console.log("Title appended");

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit Asana";
    editBtn.className = "edit-asana-btn";
    editBtn.style.cssText = "background: #2196f3; color: white; padding: 6px 12px; cursor: pointer; margin-bottom: 10px; font-weight: bold; border: none; border-radius: 6px;";
    editBtn.onclick = () => {
        console.log("Edit button onclick fired");
        console.log("Edit button clicked, asana.id:", asana.id, "asana.asanaNo:", asana.asanaNo);
        window.openAsanaEditor(asana.id || asana.asanaNo);
    };
    d.appendChild(editBtn);
    console.log("Edit button appended:", editBtn);
    console.log("Edit button onclick property:", editBtn.onclick);

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
    // --- DELETE EVERYTHING FROM HERE DOWN TO THE END OF THE OLD SUPABASE CALL ---

    

    // 7. Bind Audio Button
    const playBtn = document.getElementById('playNameBtn');
    if (playBtn) playBtn.onclick = () => playAsanaAudio(asana, null);
  
    // 8. Admin Injector
    if (typeof adminMode !== 'undefined' && adminMode && typeof renderAdminFields === 'function') {
        renderAdminFields(d, asana);
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

    // A. CATEGORY (Dynamic)
    const catDiv = document.createElement("div");
    catDiv.style.marginBottom = "15px";
    catDiv.innerHTML = "<div style='font-size:0.85rem; font-weight:bold; margin-bottom:4px;'>📂 Category</div>";
    
    const catSel = document.createElement("select");
    catSel.className = "tiny";
    catSel.style.width = "100%";
    
    // Create options dynamically
    const oEmpty = document.createElement("option"); 
    oEmpty.value = ""; 
    oEmpty.textContent = "(no category)"; 
    catSel.appendChild(oEmpty);
   



    getUniqueCategories().forEach(c => {
        const o = document.createElement("option"); 
        o.value = c; // Keep the actual prefixed value hidden behind the scenes
        o.textContent = getDisplayCategory(c); // Show the clean name in the dropdown
        catSel.appendChild(o);
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
        if (typeof applyBrowseFilters === 'function') applyBrowseFilters();
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
 
    const grouped = {};
    
    courses.forEach((course, idx) => {
       const cat = course.category ? course.category.trim() : "Uncategorized";
       
       // FILTER: Skip if category doesn't match (unless ALL is selected)
       if (filterVal !== "ALL" && cat !== filterVal) return;
 
       if (!grouped[cat]) grouped[cat] = [];
       grouped[cat].push({ course, idx });
    });
 
    Object.keys(grouped).sort().forEach(catName => {
       // Only show OptGroups if viewing ALL (otherwise it's redundant)
       if (filterVal === "ALL") {
           const groupEl = document.createElement("optgroup");
           groupEl.label = catName;
           grouped[catName].forEach(item => {
              const opt = document.createElement("option");
              opt.value = String(item.idx);
              opt.textContent = item.course.title || `Course ${item.idx + 1}`;
              groupEl.appendChild(opt);
           });
           sel.appendChild(groupEl);
       } else {
           // Flat list for specific categories
           grouped[catName].forEach(item => {
              const opt = document.createElement("option");
              opt.value = String(item.idx);
              opt.textContent = item.course.title || `Course ${item.idx + 1}`;
              sel.appendChild(opt);
           });
       }
    });
 
    if (currentVal) {
        // Check if the previously selected value is still in the filtered list
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
    const q = $("browseSearch").value.trim();
    const plateQ = parsePlateQuery($("browsePlate").value);
    const noQ = $("browseAsanaNo").value.trim();
    const cat = $("browseCategory").value;
    const finalsOnly = $("browseFinalOnly").checked;
 
    // NEW HELPER: Strips all accents/diacritics and converts to lowercase
    const normalizeText = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normQ = normalizeText(q);
 
    const asanaIndex = getAsanaIndex();
    const filtered = asanaIndex.filter(a => {
       // 1. Accent-aware text match
       if (normQ) {
           const name = normalizeText(a.Name || a.name || "");
           const eng = normalizeText(a.English_Name || a.english || "");
           const iast = normalizeText(a.IAST || a.iast || a['Yogasana Name'] || "");
           
           const isMatch = name.includes(normQ) || eng.includes(normQ) || iast.includes(normQ);
           if (!isMatch) return false;
       }
 
       // 2. Your existing custom filters
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
// #endregion
// #region 8. ADMIN & DATA LAYER




function builderOpen(mode, seq) {
    builderMode = mode;
    builderPoses = [];
    builderEditingCourseIndex = -1;
    builderEditingSupabaseId = seq ? seq.supabaseId : null;
 
    const titleEl = document.getElementById("builderTitle");
    const modeLabel = document.getElementById("builderModeLabel");
    const catSel = document.getElementById("builderCategory");
 
    if (catSel) {
       const cats = [...new Set((courses || []).map(c => c.category).filter(Boolean))].sort();
       const datalist = document.getElementById("builderCategoryList");
       if (datalist) datalist.innerHTML = cats.map(c => `<option value="${c}"></option>`).join("");
    }
 
    if (mode === "new") {
       if (modeLabel) modeLabel.textContent = "New Sequence";
       if (titleEl) titleEl.value = "";
       if (catSel) catSel.value = "";
    } else {
       if (!seq) { alert("No sequence to edit."); return; }
       if (modeLabel) modeLabel.textContent = "Edit Sequence";
       if (titleEl) titleEl.value = seq.title || "";
       if (catSel) catSel.value = seq.category || "";
       builderEditingCourseIndex = courses.findIndex(c => c.title === seq.title);

       const library = getAsanaIndex();
       const libraryArray = Array.isArray(library) ? library : Object.values(library);

       // Use raw (unmodified by dial) poses if available, otherwise fall back to seq.poses
       const rawPoses = (window.currentSequenceOriginalPoses && seq === currentSequence)
           ? window.currentSequenceOriginalPoses
           : (seq.poses || []);

       rawPoses.forEach(p => {
          const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
          const id = String(rawId || "").padStart(3, '0');
          const asana = libraryArray.find(a => (a.id || a.ID || a.asanaNo) === id);
          
          // 1. Reconstruct everything after the duration using pipes
          let rawExtras = [p[2], p[3], p[4]].filter(Boolean).join(" | ").trim();
          let variation = "";
          let extractedLabel = "";
 
          // 2. Extract bracketed text
          const bracketMatch = rawExtras.match(/\[(.*?)\]/);
          if (bracketMatch) {
              extractedLabel = bracketMatch[1].trim(); 
              // Remove the brackets from the string so it doesn't end up in notes
              rawExtras = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\|]+/, "").trim();
          } else {
              extractedLabel = rawExtras; // Legacy fallback
              rawExtras = "";
          }
 
          // 3. Match against Variations
          if (asana && asana.variations && extractedLabel) {
              // Sort by length so "XII" matches before "II" or "I"
              const sortedKeys = Object.keys(asana.variations).sort((a,b) => b.length - a.length);
              
              for (const vKey of sortedKeys) {
                  const vData = asana.variations[vKey];
                  const title = (typeof vData === 'object' && vData.Title) ? vData.Title.toLowerCase() : "";
                  
                  // Look for the Roman numeral as a standalone word (e.g. catches "XII" in "Ujjāyī XII (lying)")
                  const regex = new RegExp(`\\b${vKey}\\b`, 'i'); 
                  
                  if (extractedLabel.toLowerCase() === title || regex.test(extractedLabel)) {
                      variation = vKey;
                      extractedLabel = ""; // Consume it so it doesn't go to notes
                      break;
                  }
              }
          }
 
          // 4. Base Pose Check (if it's just "[Savasana]", consume it)
          if (!variation && asana && extractedLabel) {
              const target = extractedLabel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const name = (asana.Name || asana.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              if (target.includes(name)) {
                  extractedLabel = ""; 
              }
          }
 
          // 5. If it wasn't a variation OR a base pose, put it back in notes
          if (extractedLabel && !variation) {
              rawExtras = (extractedLabel + (rawExtras ? " | " + rawExtras : "")).trim();
          }
 
          builderPoses.push({
             id: id,
             name: asana ? (asana.Name || asana.name || displayName(asana)) : id,
             duration: Number(p[1]) || 30,
             variation: variation,
             note: rawExtras
          });
       });
    }
 
    builderRender();
    document.getElementById("editCourseBackdrop").style.display = "flex";
    setTimeout(() => { const s = document.getElementById("builderSearch"); if(s) s.focus(); }, 50);
 }

 function builderRender() {
    const tbody = document.getElementById("builderTableBody");
    tbody.innerHTML = "";
    document.getElementById("builderEmptyMsg").style.display = builderPoses.length ? "none" : "block";
 
    let totalSec = 0;
    const library = getAsanaIndex();
    const libraryArray = Array.isArray(library) ? library : Object.values(library);
 
    builderPoses.forEach((pose, idx) => {
       totalSec += Number(pose.duration) || 0;
       const tr = document.createElement("tr");
       
       const asana = libraryArray.find(a => (a.id || a.ID || a.asanaNo) === pose.id);
       const variations = asana ? (asana.variations || {}) : {};
       const hasVars = Object.keys(variations).length > 0;
 
       // Dropdown now ONLY shows Title or "Stage X"
       let varSelectHTML = '';
       if (hasVars) {
           varSelectHTML = `
              <select class="b-var" data-idx="${idx}" style="margin-left:8px; padding:2px 4px; border:1px solid #1976d2; border-radius:4px; font-size:0.75rem; background:#e3f2fd; color:#005580; max-width: 160px;">
                 <option value="">Base Pose</option>
                 ${Object.entries(variations).map(([vKey, vData]) => {
                     let optionTitle = vData.title || `Stage ${vKey}`;
                     const sel = (pose.variation === vKey) ? 'selected' : '';
                     return `<option value="${vKey}" ${sel}>${optionTitle}</option>`;
                 }).join('')}
              </select>
           `;
       }
       
       tr.innerHTML = `
          <td style="padding:8px; text-align:center; color:#888;">${idx + 1}</td>
          <td style="padding:8px;">
             <div style="font-weight:bold; margin-bottom:4px; line-height: 1.2;">${pose.name || '<span style="color:#aaa; font-style:italic;">Unknown</span>'}</div>
             <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:0.75rem; color:#666;">
                ID: <input type="text" class="b-id" data-idx="${idx}" value="${pose.id}" style="width:50px; padding:2px 4px; border:1px solid #ccc; border-radius:4px; font-size:0.8rem; font-family:monospace;">
                ${varSelectHTML}
             </div>
          </td>
          <td style="padding:8px;">
             <input type="number" class="b-dur" data-idx="${idx}" value="${pose.duration}" style="width:60px; padding:4px; border:1px solid #ccc; border-radius:4px;">
             <button class="tiny b-std-time" data-idx="${idx}" title="Set to Standard Time" style="padding:2px 4px; font-size:0.7rem; margin-top:4px; display:block; background:#e0e0e0; color:#333;">⏱ Std</button>
          </td>
          <td style="padding:8px;">
             <input type="text" class="b-note" data-idx="${idx}" value="${(pose.note || '').replace(/"/g, '&quot;')}" placeholder="Optional notes..." style="width:100%; padding:4px; border:1px solid #ccc; border-radius:4px;">
          </td>
          <td style="padding:8px; text-align:center; white-space:nowrap;">
             ${idx > 0 ? `<button class="tiny b-move-up" data-idx="${idx}">▲</button>` : '<span style="display:inline-block;width:24px;"></span>'}
             ${idx < builderPoses.length - 1 ? `<button class="tiny b-move-dn" data-idx="${idx}">▼</button>` : '<span style="display:inline-block;width:24px;"></span>'}
             <button class="tiny warn b-remove" data-idx="${idx}" style="margin-left:4px;">✕</button>
          </td>
       `;
       tbody.appendChild(tr);
    });
 
    // Listeners
    tbody.querySelectorAll('.b-id').forEach(el => {
        el.onchange = (e) => {
           const idx = e.target.dataset.idx;
           let newId = e.target.value.trim();
           if (!isNaN(newId) && newId.length > 0) newId = newId.padStart(3, '0');
           builderPoses[idx].id = newId;

           const asana = libraryArray.find(a => (a.id || a.ID || a.asanaNo) === newId);
           builderPoses[idx].name = asana ? (asana.Name || asana.name || displayName(asana)) : "Unknown Pose";
           builderPoses[idx].variation = "";
           if (asana && asana.hold_data && asana.hold_data.standard) {
               builderPoses[idx].duration = asana.hold_data.standard;
           }
           builderRender();
        };
     });
 
     // NEW: Standard Time Button logic (Bulletproofed with el.dataset.idx)
     tbody.querySelectorAll('.b-std-time').forEach(el => {
         el.onclick = (e) => {
            const idx = el.dataset.idx; 
            const poseId = builderPoses[idx].id;
            const asana = libraryArray.find(a => (a.id || a.ID || a.asanaNo) === poseId);
            
            if (asana && asana.hold_data && asana.hold_data.standard) {
               builderPoses[idx].duration = asana.hold_data.standard;
               builderRender(); // Instantly update the UI
            } else {
               alert("No standard time mapped for this pose.");
            }
         };
      });
  
     tbody.querySelectorAll('.b-var').forEach(el => {
        el.onchange = (e) => {
            const i = parseInt(e.target.dataset.idx, 10);
            const vKey = e.target.value;
            builderPoses[i].variation = vKey;
            if (vKey) {
                const asana = libraryArray.find(a => (a.id || a.ID || a.asanaNo) === builderPoses[i].id);
                const varData = asana && asana.variations && asana.variations[vKey];
                if (varData) {
                    const holdStr = varData.hold || varData.Hold || "";
                    if (holdStr) {
                        const hd = parseHoldTimes(holdStr);
                        if (hd.standard) { builderPoses[i].duration = hd.standard; builderRender(); }
                    }
                }
            }
        };
     });
  
     tbody.querySelectorAll('.b-dur').forEach(el => el.onchange = (e) => { builderPoses[e.target.dataset.idx].duration = Number(e.target.value) || 0; builderRender(); });
     tbody.querySelectorAll('.b-note').forEach(el => el.oninput = (e) => builderPoses[e.target.dataset.idx].note = e.target.value);

     tbody.querySelectorAll('.b-move-up').forEach(el => {
         el.onclick = () => { const i = parseInt(el.dataset.idx, 10); movePose(i, -1); };
     });
     tbody.querySelectorAll('.b-move-dn').forEach(el => {
         el.onclick = () => { const i = parseInt(el.dataset.idx, 10); movePose(i, 1); };
     });
     tbody.querySelectorAll('.b-remove').forEach(el => {
         el.onclick = () => { const i = parseInt(el.dataset.idx, 10); removePose(i); };
     });
  
     const statsEl = document.getElementById("builderStats");
     if (statsEl) statsEl.textContent = `${builderPoses.length} poses · ${Math.floor(totalSec/60)}m ${totalSec%60}s`;
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

// Search Logic
document.getElementById('builderSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const resBox = document.getElementById('builderSearchResults');
    if (q.length === 0) return resBox.style.display = 'none';

    const hits = getAsanaIndex().filter(a => {
        const txt = ((a.Name||"") + " " + (a.English_Name||"") + " " + (a.IAST||"") + " " + (a.ID||"")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return txt.includes(q);
    }).slice(0, 15);

    resBox.innerHTML = hits.map(a => {
        const defaultDur = (a.hold_data && a.hold_data.standard) ? a.hold_data.standard : 30;
        return `
        <div style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;"
             onclick="builderPoses.push({id: '${a.ID || a.id}', name: '${(a.Name || a.name).replace(/'/g,"\\'")}', duration: ${defaultDur}, note: ''}); document.getElementById('builderSearch').value=''; document.getElementById('builderSearchResults').style.display='none'; builderRender();">
            <strong>${a.Name || a.name}</strong> <span style="color:#888; font-size:0.8em;">(ID: ${a.ID || a.id})</span>
        </div>
    `;
    }).join("");
    resBox.style.display = hits.length ? 'block' : 'none';
});

// Save Logic is handled by builderSave() function (see below)
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
/**
 * Expands a course object if it references a Namaskara sequence.
 * Injects the Namaskara poses X times before the main poses.
 */
function expandSequenceWithNamaskara(rawSeq) {
    const processed = JSON.parse(JSON.stringify(rawSeq));

    if (processed.includeNamaskara) {
        const refSeq = courses.find(c => c.courseId === processed.includeNamaskara);

        if (refSeq && refSeq.poses) {
            const reps = parseInt(processed.namaskaraRepetitions) || 1;
            let namaskaraBlock = [];

            for (let i = 0; i < reps; i++) {
                let roundPoses = JSON.parse(JSON.stringify(refSeq.poses));

                roundPoses.forEach(p => {
                    const id = Array.isArray(p[0]) ? p[0][0] : p[0];
                    const asana = findAsanaByIdOrPlate(normalizePlate(id));
                    
                    // 1. Determine the base name (Use Label -> then Library English -> then "Pose")
                    let baseName = p[2] || (asana ? displayName(asana) : "Pose");

                    // 2. Append the Round number if more than 1 repetition exists
                    if (reps > 1 && !baseName.includes("(Round")) {
                        p[2] = `${baseName} (Round ${i + 1})`;
                    } else {
                        // Ensure it has at least the baseName even if 1 rep
                        p[2] = baseName;
                    }
                });
                namaskaraBlock = namaskaraBlock.concat(roundPoses);
            }

            processed.poses = namaskaraBlock.concat(processed.poses);
            console.log(`[Sequence Expansion] Merged ${reps} rounds of ${processed.includeNamaskara}`);
        }
    }

    return processed;
}

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

       // NEW CODE
       const rawSequence = sequences[parseInt(idx, 10)];
       currentSequence = expandSequenceWithNamaskara(rawSequence);
       
       // Save a pure copy of the sequence so the Dial can reset to it
       window.currentSequenceOriginalPoses = JSON.parse(JSON.stringify(currentSequence.poses));

       if (typeof applyDurationDial === 'function') applyDurationDial();
       if (typeof updateDialUI === 'function') updateDialUI();

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

function dialReset() {
    const dial = $("durationDial");
    if (!dial) return;
    dial.value = 50;
    updateDialUI();
    if (currentSequence) {
        applyDurationDial();
        stopTimer();
        setPose(currentIndex);
    }
}

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

const durationDial = $("durationDial");
if (durationDial) {
    durationDial.addEventListener("input", () => {
        updateDialUI();
        if (currentSequence) applyDurationDial();
    });
    durationDial.addEventListener("change", () => {
        if (currentSequence) {
            stopTimer();
            setPose(currentIndex);
        }
    });
    durationDial.addEventListener("dblclick", dialReset);
}

function applyDurationDial() {
    if (!currentSequence || !window.currentSequenceOriginalPoses) return;
    const pos = getDialPosition();

    currentSequence.poses = window.currentSequenceOriginalPoses.map(p => {
        const copy = [...p];
        const origDur = Number(p[1]) || 0;
        const id = Array.isArray(p[0]) ? p[0][0] : p[0];
        const asana = findAsanaByIdOrPlate ? findAsanaByIdOrPlate(normalizePlate(id)) : null;
        const { short, defaultDur, long } = resolveDialAnchors(origDur, asana);
        copy[1] = interpolateDuration(pos, short, defaultDur, long);
        return copy;
    });

    if (typeof updateTotalAndLastUI === 'function') updateTotalAndLastUI();
    if (typeof updateTimerUI === 'function') updateTimerUI();
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

// ============================================================
// SEQUENCE BUILDER
// ============================================================

let builderPoses = [];  // [{ id, name, duration, note, supabaseRowId? }]
let builderMode = "edit"; // "edit" | "new"
let builderEditingCourseIndex = -1;
let builderEditingSupabaseId = null;



function openEditCourse() {
   if (!currentSequence) { alert("Please select a course first."); return; }
   builderOpen("edit", currentSequence);
}


function builderUpdateStats() {
   const statsEl = $("builderStats");
   if (!statsEl) return;
   if (!builderPoses.length) { statsEl.textContent = ""; return; }
   const total = builderPoses.reduce((s, p) => s + (p.duration || 0), 0);
   statsEl.textContent = `${builderPoses.length} poses · ${formatHMS(total)} estimated`;
}

function builderCompileSequenceText() {
    const library = getAsanaIndex();
    const libraryArray = Array.isArray(library) ? library : Object.values(library);
 
    return builderPoses.map(p => {
       const id = String(p.id || "000").padStart(3, '0');
       const dur = p.duration || 30;
       const asana = libraryArray.find(a => (a.id || a.ID || a.asanaNo) === id);
       
       let labelPart = "";
       
       // If Variation is selected -> Wrap Title in Brackets
       if (p.variation) {
           const vData = (asana && asana.variations) ? asana.variations[p.variation] : null;
           if (vData && typeof vData === 'object' && vData.Title) {
               labelPart = `[${vData.Title.trim()}]`; 
           } else {
               labelPart = `[Stage ${p.variation}]`;
           }
       } 
       // If NO variation -> Wrap Base Name in Brackets
       else if (asana) {
           const displayName = asana.Name || asana.name || asana.IAST || asana.English_Name;
           if (displayName) {
               labelPart = `[${displayName}]`;
           }
       }
       
       // Rebuild string with pipes
       let extraParts = [];
       if (labelPart) extraParts.push(labelPart);
       if (p.note) extraParts.push(p.note.trim());
       
       const noteStr = extraParts.length > 0 ? ` | ${extraParts.join(" | ")}` : "";
       
       return `${id} | ${dur}${noteStr}`;
    }).join("\n");
 }

function builderGetTitle() {
   return ($("builderTitle")?.value || "").trim();
}

function builderGetCategory() {
   return ($("builderCategory")?.value || "").trim();
}

async function builderSave() {
   const title = builderGetTitle();
   if (!title) { alert("Please enter a sequence title."); $("builderTitle")?.focus(); return; }
   if (!builderPoses.length) { alert("Add at least one pose."); return; }

   const sequenceText = builderCompileSequenceText();
   const category = builderGetCategory();
   const totalSec = builderPoses.reduce((s, p) => s + (p.duration || 0), 0);

   try {
      if (supabase) {
         if (builderEditingSupabaseId) {
            await supabase.from('user_sequences').update({
               title, category, sequence_text: sequenceText,
               pose_count: builderPoses.length, total_seconds: totalSec,
               updated_at: new Date().toISOString()
            }).eq('id', builderEditingSupabaseId);
         } else {
            const { data } = await supabase.from('user_sequences').insert([{
               title, category, sequence_text: sequenceText,
               pose_count: builderPoses.length, total_seconds: totalSec
            }]).select('id').maybeSingle();
            if (data?.id) builderEditingSupabaseId = data.id;
         }
      }
   } catch(e) {
      console.warn("Supabase save failed:", e);
   }

   await loadCourses();
   $("editCourseBackdrop").style.display = "none";
   alert(`"${title}" saved.`);
}

// Search dropdown for the builder
(function setupBuilderSearch() {
   const input = document.getElementById("builderSearch");
   const results = document.getElementById("builderSearchResults");
   if (!input || !results) return;

   let debounceTimer;

   function positionResults() {
      const rect = input.getBoundingClientRect();
      results.style.top = (rect.bottom + window.scrollY) + "px";
      results.style.left = rect.left + "px";
      results.style.width = Math.max(rect.width, 280) + "px";
   }

   input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
         const q = input.value.trim().toLowerCase();
         if (q.length < 2) { results.style.display = "none"; return; }

         const library = getAsanaIndex();
         const hits = library.filter(a => {
            const n = (displayName(a) + " " + (a.english || "") + " " + (a.iast || "") + " " + (a.id || "")).toLowerCase();
            return n.includes(q);
         }).slice(0, 20);

         if (!hits.length) { results.style.display = "none"; return; }

         results.innerHTML = hits.map(a => {
            const dn = displayName(a);
            const sub = (a.iast && a.iast !== dn) ? a.iast : (a.english && a.english !== dn ? a.english : "");
            return `<div class="b-search-item" data-id="${a.id}" data-name="${dn.replace(/"/g,'&quot;')}" data-english="${(a.english||"").replace(/"/g,'&quot;')}"
               style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;">
               <div style="font-weight:600;font-size:0.88rem;">${dn}</div>
               ${sub ? `<div style="font-size:0.75rem;color:#888;">${sub}</div>` : ""}
               <div style="font-size:0.7rem;color:#bbb;">ID: ${a.id}</div>
            </div>`;
         }).join("");

         results.style.display = "block";
         positionResults();
      }, 120);
   });

   results.addEventListener("click", e => {
      const item = e.target.closest(".b-search-item");
      if (!item) return;
      const library = getAsanaIndex();
      const asana = library.find(a => (a.id || a.asanaNo) === item.dataset.id);
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

   document.addEventListener("click", e => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
         results.style.display = "none";
      }
   });

   const blankBtn = document.getElementById("builderAddBlank");
   if (blankBtn) {
      blankBtn.addEventListener("click", () => {
         builderPoses.push({ id: "", name: "", englishName: "", duration: 30, variation: "", note: "" });
         builderRender();
      });
   }
})();

safeListen("editCourseBtn", "click", openEditCourse);
safeListen("editCourseCloseBtn", "click", () => { $("editCourseBackdrop").style.display = "none"; });
safeListen("editCourseCancelBtn", "click", () => { $("editCourseBackdrop").style.display = "none"; });
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
    console.log("openAsanaEditor() called with id:", id);
    const bd = $("asanaEditorBackdrop");
    console.log("asanaEditorBackdrop element found:", bd);
    if (!bd) {
        console.error("asanaEditorBackdrop not found!");
        return alert("Editor HTML missing");
    }

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
        $("editAsanaName").value = a.name || a.Name || "";
        $("editAsanaIAST").value = a.iast || a.IAST || "";
        $("editAsanaEnglish").value = a.english || a.english_name || a.English_Name || "";
        $("editAsanaCategory").value = a.category || a.Category || "";

        // DEBUG: Let's see exactly what the library thinks the hold is
        console.log(`Checking Hold for Asana ${id}:`, { hold: a.hold, Hold: a.Hold });

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
            pStr = a.plate_numbers || a.Plate_Numbers || "";
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
            console.warn("Could not load user stages for editor:", e.message);
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

    bd.style.display = "flex";
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
            console.warn("Could not query stage names for Roman numeral calc:", e.message);
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
console.log("Script parsed. Attempting startup...");

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthListeners);
} else {
    setupAuthListeners();
}

// #endregion
