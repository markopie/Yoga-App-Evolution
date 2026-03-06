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
    if (!s) return "";
    return String(s).replace(/[&<>"']/g, function(m) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[m];
    });
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
    } catch (e) {
        console.error('Load courses failed:', e);
    }
};

async function loadAsanaLibrary() {
    if (!supabase) return {};
    try {
        const normalized = await getFullAsanaLibrary();
        window.asanaLibrary = normalized;
        return normalized;
    } catch (e) {
        console.error('Asana library load failed:', e);
        return {};
    }
}

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
            ${isMacro ? `<div style="font-size:0.7rem; color:#0d47a1; margin-top:4px; font-weight:bold;">Rounds</div>` : (isLocked ? "" : `<button class="tiny b-std-time" data-idx="${idx}" style="display:block; margin:4px auto 0;">⏱ Std</button>`)}
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
}); // <--- END OF THE forEach LOOP (Restored by Architect)
 
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
        const res = await fetch(DESCRIPTIONS_OVERRIDE_URL, { cache: 'no-store' });
        if (!res.ok) { descriptionOverrides = {}; return; }
        const data = await res.json();
        descriptionOverrides = (data && typeof data === 'object') ? data : {};
    } catch (e) { descriptionOverrides = {}; }
}

async function fetchCategoryOverrides() {
    try {
        const res = await fetch(CATEGORY_OVERRIDE_URL, { cache: 'no-store' });
        if (!res.ok) { categoryOverrides = {}; return; }
        const data = await res.json();
        categoryOverrides = (data && typeof data === 'object') ? data : {};
    } catch (e) { categoryOverrides = {}; }
}

async function fetchAudioOverrides() {
    try {
        const res = await fetch(AUDIO_OVERRIDE_URL, { cache: 'no-store' });
        if (res.ok) audioOverrides = await res.json();
    } catch (e) { audioOverrides = {}; }
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
    </button>`;
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
        if($("collageWrap")) $("collageWrap").innerHTML = `<div class="msg">Select a sequence</div>`;;
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
        listEl.innerHTML = `<div class="muted" style="padding:8px;">Loading…</div>`;;

        // Always pull the freshest data from the unified cache (Supabase-backed)
        const hist = serverHistoryCache || await fetchServerHistory();
        const entries = hist
            .filter(e => e.title === currentSequence.title)
            .sort((a, b) => b.ts - a.ts);

        listEl.innerHTML = "";

        if (entries.length === 0) {
            listEl.innerHTML = `<div class="muted" style="padding:8px;">No completion history yet.</div>`;;
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
      container.innerHTML = `<div class="msg">No history found for any sequence.</div>`;;
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
   let statsHtml = `<div style="font-weight:bold; font-size:1rem; margin-bottom:4px;">Total sessions: ${totalCompletions}</div>`;;
   if (overallStreak > 1) {
      statsHtml += `<div style="color:#2e7d32; font-weight:bold;">${overallStreak}-day practice streak — keep it up!</div>`;;
   } else if (overallStreak === 1) {
      statsHtml += `<div style="color:#2e7d32;">Practiced today — great work!</div>`;;
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
            </div>`;;
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
} // Closed block from 1271
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

function setupBuilderSearch() {
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
             results.innerHTML = `<div style="padding:10px; color:#999; font-style:italic;">No poses found...</div>`;;
             results.style.display = "block";
             positionResults();
             return; 
          }
 
          results.innerHTML = hits.map(a => {
         const dn = displayName(a);
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

}
setupBuilderSearch(); // Boundary Sealed by Architect
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
        window.appInitialized = true;
        // Run startup sequence
        Promise.all([
            loadAsanaLibrary(),
            window.loadCourses()
        ]).then(() => {
            console.log("App data initialized successfully");
            // If you have a render function, call it here:
            if (typeof renderAsanaLibrary === 'function') renderAsanaLibrary();
        }).catch(err => {
            console.error("Startup sequence failed:", err);
        });
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
            googleBtn.textContent = "Redirecting...";
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + window.location.pathname }
            });
            if (error) {
                loginError.textContent = error.message;
                loginError.style.display = 'block';
                googleBtn.disabled = false;
                googleBtn.textContent = 'Sign in with Google';
            }
        };
    }

    if (skipBtn) {
        skipBtn.onclick = () => {
            window.isGuestMode = true;
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
            window.currentUserId = session.user.id;
            showApp();
        } else if (!window.isGuestMode) {
            showLogin();
        }
    });
}


`; 
// --- FINAL APP INITIALIZATION ---
console.log('Script execution reached the final line.');
setupAuthListeners();
// --- ARCHITECTURAL GLOBAL BRIDGE ---
window.loadCourses = loadCourses;
window.builderOpen = builderOpen;
window.builderSave = builderSave;
window.openEditCourse = openEditCourse;
window.addStageToEditor = addStageToEditor;
window.openAsanaEditor = openAsanaEditor;
window.syncDataToGitHub = syncDataToGitHub;

// --- INITIALIZATION ---
console.log("Yoga App Logic Architect: System Online.");
setupAuthListeners();
