// -------- Config (relative paths; index.html is /yoga/) --------
const SEQUENCES_URL = "sequences.json";
const MANIFEST_URL = "images/manifest.json";
const PLATE_GROUPS_URL = "plate_groups.json"; // optional overrides: plate -> [plates]
const INDEX_CSV_URL = "index.csv"; // source of truth for Browse Asanas
const DESCRIPTIONS_OVERRIDE_URL = "descriptions_override.json"; // server-side overrides for formatted_description (Markdown)
const SAVE_DESCRIPTION_URL = "save_description.php"; // endpoint to save description overrides (Admin mode)
const CATEGORY_OVERRIDE_URL = "category_overrides.json"; // server-side overrides for category mapping (Admin mode)
const SAVE_CATEGORY_URL = "save_category.php"; // endpoint to save category overrides (Admin mode)
const COMPLETION_LOG_URL = "completion_log.php"; // server-side completion history (optional)
const IMAGES_BASE = "images/";
const IMAGES_MAIN_BASE = IMAGES_BASE + "main/";
const IMAGES_MOBILE_BASE = "images/w800/"; // Option 2: smaller webp for mobile
const AUDIO_BASE = "audio/"; // Path to your mp3 folder

// -------- State --------
let sequences = [];
let currentSequence = null;
let currentIndex = 0;
let csvPlateToAsana = {}; // Maps "104" -> Asana Object (from CSV)
let currentAudio = null; // Tracks the currently playing sound

let plateToUrls = {}; // "176" -> ["images/..webp", ...]
let plateToPrimaryAsana = {}; // "176" -> "074" (string) or null
let asanaToUrls = {}; // "074" -> [urls...]
let plateGroups = {}; // "18" -> ["18","19"] (optional)

let timer = null;
let remaining = 0;
let running = false;

// -------- Wake Lock (prevent screen sleep while running, if supported) --------
let wakeLock = null;
let wakeLockVisibilityHooked = false;

async function enableWakeLock() {
   try {
      if (!("wakeLock" in navigator)) return;
      if (wakeLock) return;

      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
         wakeLock = null;
      });

      // Hook once: if user switches away and returns while running, re-request.
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

// -------- Faint gong when timer ends (only for long holds >= 60s) --------
let currentPoseSeconds = 0;
let audioCtx = null;

function playFaintGong() {
   try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      const t0 = audioCtx.currentTime + 0.02;

      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      o1.type = "sine";
      o2.type = "sine";
      o1.frequency.setValueAtTime(432, t0);
      o2.frequency.setValueAtTime(864, t0);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);

      o1.connect(g);
      o2.connect(g);
      g.connect(audioCtx.destination);

      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + 2.0);
      o2.stop(t0 + 2.0);
   } catch (e) {}
}

// -------- Audio Helper --------
// Plays audio from /audio/ folder.
// Filename convention: <ID>_<SafeEnglish>.mp3
// - ID is usually 3-digit (001..216). If the asana has a LOY suffix (e.g., 172a),
//   we first try "172a_*", then fall back to "172_*".
function playAsanaAudio(asana) {
   if (!asana) return;

   // Stop any currently playing audio
   if (currentAudio) {
      try {
         currentAudio.pause();
      } catch (e) {}
      try {
         currentAudio.currentTime = 0;
      } catch (e) {}
      currentAudio = null;
   }

   const idStr = String(asana.asanaNo || "").trim();
   if (!idStr) return;

   const safeName = (asana.english || "").replace(/[^a-zA-Z0-9]/g, "");
   if (!safeName) return;

   // Candidate IDs (most specific first)
   const digitPart = (idStr.match(/^\d+/) || [null])[0];
   const candidates = [];

   const pushId = (x) => {
      if (!x) return;
      const formatted = (String(x).length < 3) ? String(x).padStart(3, "0") : String(x);
      candidates.push(`${AUDIO_BASE}${formatted}_${safeName}.mp3`);
   };

   // Try exact id first (keeps suffix like 172a)
   pushId(idStr);

   // Fallback: if has suffix letters, try the digit part (e.g., 172a -> 172)
   if (digitPart && digitPart !== idStr) pushId(digitPart);

   if (!candidates.length) return;

   let i = 0;
   const tryNext = () => {
      if (i >= candidates.length) return; // silent fail
      const src = candidates[i++];
      const a = new Audio(src);
      a.addEventListener("error", () => tryNext(), {
         once: true
      });
      a.play().then(() => {
         currentAudio = a;
      }).catch(() => {
         // Autoplay restrictions: user may need to tap first; try next just in case
         tryNext();
      });
   };

   tryNext();
}

// -------- Completion log (localStorage) --------
const COMPLETION_KEY = "yogaCompletionLog_v1";

function loadCompletionLog() {
   try {
      return JSON.parse(localStorage.getItem(COMPLETION_KEY) || "[]");
   } catch (e) {
      return [];
   }
}

function saveCompletionLog(log) {
   localStorage.setItem(COMPLETION_KEY, JSON.stringify(log));
}

function addCompletion(title, whenDate) {
   const log = loadCompletionLog();
   log.push({
      title,
      ts: whenDate.getTime(),
      // Store a human-friendly local string for quick display
      local: whenDate.toLocaleString("en-AU", {
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit"
      })
   });
   saveCompletionLog(log);
}

function lastCompletionFor(title) {
   const log = loadCompletionLog().filter(x => x && x.title === title && typeof x.ts === "number");
   if (!log.length) return null;
   log.sort((a, b) => b.ts - a.ts);
   return log[0];
}

function seedManualCompletionsOnce() {
   const log = loadCompletionLog();
   const have = new Set(log.filter(x => x && x.title).map(x => x.title + "::" + x.ts));

   const seeds = [{
         title: "Course 1: Short Course, Day 1",
         d: new Date(2025, 11, 31, 10, 0, 0)
      }, // 31/12/2025 10:00
      {
         title: "Course 1: Short Course, Day 2",
         d: new Date(2026, 0, 1, 9, 30, 0)
      }, // 01/01/2026 09:30
      {
         title: "Course 1: Short Course, Day 3",
         d: new Date(2026, 0, 2, 10, 0, 0),
         local_override: "02/01/2026"
      } // time not provided
   ];

   let changed = false;
   for (const s of seeds) {
      const key = s.title + "::" + s.d.getTime();
      if (!have.has(key)) {
         log.push({
            title: s.title,
            ts: s.d.getTime(),
            local: s.d.toLocaleString("en-AU", {
               year: "numeric",
               month: "2-digit",
               day: "2-digit",
               hour: "2-digit",
               minute: "2-digit"
            })
         });
         changed = true;
      }
   }
   if (changed) saveCompletionLog(log);
}

// -------- Completion history (server-side, optional) --------
let serverHistoryCache = null; // array of {title, ts, local?}

async function fetchServerHistory() {
   try {
      const res = await fetch(COMPLETION_LOG_URL + "?action=get", {
         cache: "no-store"
      });
      if (!res.ok) throw new Error("History fetch failed");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("History data not an array");
      serverHistoryCache = data;
      return data;
   } catch (e) {
      // Fallback to localStorage log if server not available
      serverHistoryCache = loadCompletionLog();
      return serverHistoryCache;
   }
}

async function appendServerHistory(title, whenDate) {
   // Always write to localStorage first so the UI updates even if server fails
   addCompletion(title, whenDate);

   const payload = {
      title,
      ts: whenDate.getTime(),
      // ISO string keeps timezone offset; useful later for multi-user auditing
      iso: whenDate.toISOString()
   };

   try {
      const res = await fetch(COMPLETION_LOG_URL + "?action=add", {
         method: "POST",
         headers: {
            "Content-Type": "application/json"
         },
         body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("History append failed");
      const out = await res.json();
      if (out && out.status === "success") {
         // Refresh cache so History list and Last pill reflect server truth
         await fetchServerHistory();
         return true;
      }
   } catch (e) {
      // Keep local record; user can still see history on this device
      return false;
   }
   return false;
}

function escapeHtml(s) {
   return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
   } [c])); // FIXED: Correct HTML entity mapping
}

function formatHistoryRow(entry) {
   const title = entry?.title || "Untitled sequence";

   // Format the date using Australian locale
   const local = (typeof entry?.ts === "number") ?
      new Date(entry.ts).toLocaleString("en-AU", {
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit"
      }) :
      (entry.local || "");

   return `${local} — ${title}`;
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

   // newest first
   const sorted = [...hist].filter(x => x && typeof x.ts === "number").sort((a, b) => b.ts - a.ts);
   const lines = sorted.map(formatHistoryRow);

   panel.innerHTML = "<div style='margin-top:4px'></div>" + lines.map(l => `<div>• ${escapeHtml(l)}</div>`).join("");
}

function formatHMS(totalSeconds) {
   const s = Math.max(0, Math.floor(totalSeconds || 0));
   const h = Math.floor(s / 3600);
   const m = Math.floor((s % 3600) / 60);
   const r = s % 60;
   if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
   return `${m}:${String(r).padStart(2,"0")}`;
}

function updateTotalAndLastUI() {
   // Total time
   const poses = (currentSequence && currentSequence.poses) ? currentSequence.poses : [];
   const total = poses.reduce((acc, p) => acc + (Number(p?.[1]) || 0), 0);
   $("totalTimePill").textContent = `Total: ${formatHMS(total)}`;

   // Last completion (prefer server history if available)
   const title = currentSequence && currentSequence.title ? currentSequence.title : null;
   if (title) {
      const source = (Array.isArray(serverHistoryCache) && serverHistoryCache.length) ? serverHistoryCache : loadCompletionLog();
      const last = source.filter(x => x && x.title === title && typeof x.ts === "number").sort((a, b) => b.ts - a.ts)[0];
      $("lastCompletedPill").textContent = last ?
         `Last: ${new Date(last.ts).toLocaleString("en-AU", { 
          year: "numeric", 
          month: "2-digit", 
          day: "2-digit", 
          hour: "2-digit", 
          minute: "2-digit" 
    })}` :
         "Last: –";
   }
}

let draft = []; // each: [idField, seconds, label]
// -------- Admin mode + overrides --------
const ADMIN_MODE_KEY = "yogaAdminMode_v1";
let adminMode = false;
let descriptionOverrides = {}; // { [asanaNo]: { md: string, updated_at: string } }
let categoryOverrides = {}; // { [asanaNo]: { category: string, updated_at: string } }

// -------- Helpers --------
function $(id) {
   return document.getElementById(id);
}

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
   const currentNo = $("browseDetail")?.getAttribute("data-asana-no");
   if (currentNo) {
      const asma = asanaIndex.find(a => normalizePlate(a.asanaNo) === normalizePlate(currentNo));
      if (asma) showAsanaDetail(asma);
   }
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
      if (inOl) {
         out += "</ol>";
         inOl = false;
      }
      if (inUl) {
         out += "</ul>";
         inUl = false;
      }
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
         if ((inOl && nextOl) || (inUl && nextUl)) {
            continue; // keep list open
         }
         closeLists();
         continue;
      }

      const ol = trimmed.match(/^(\d+)[\.)]\s+(.*)$/);
      const ul = trimmed.match(/^[-*]\s+(.*)$/);

      if (ol) {
         if (inUl) {
            out += "</ul>";
            inUl = false;
         }
         if (!inOl) {
            out += "<ol>";
            inOl = true;
         }
         out += "<li>" + escapeHtml2(ol[2]) + "</li>";
         continue;
      }

      if (ul) {
         if (inOl) {
            out += "</ol>";
            inOl = false;
         }
         if (!inUl) {
            out += "<ul>";
            inUl = true;
         }
         out += "<li>" + escapeHtml2(ul[1]) + "</li>";
         continue;
      }

      closeLists();
      out += "<p style=\"margin:8px 0\">" + escapeHtml2(trimmed) + "</p>";
   }
   closeLists();
   return out;
}

async function fetchDescriptionOverrides() {
   try {
      const res = await fetch(DESCRIPTIONS_OVERRIDE_URL, {
         cache: "no-store"
      });
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
      const res = await fetch(CATEGORY_OVERRIDE_URL, {
         cache: "no-store"
      });
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

async function saveDescriptionOverride(asanaNo, md) {
   const payload = {
      asana_no: normalizePlate(asanaNo),
      md: String(md || "")
   };
   const res = await fetch(SAVE_DESCRIPTION_URL, {
      method: "POST",
      headers: {
         "Content-Type": "application/json"
      },
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
      headers: {
         "Content-Type": "application/json"
      },
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

function normalizePlate(p) {
   // keep "471.0" etc as-is; but strip leading zeros for matching where user types "1" vs "001"
   const s = String(p ?? "").trim();
   if (!s) return "";
   // if purely digits, normalize to no leading zeros
   if (/^\d+$/.test(s)) return String(parseInt(s, 10));
   return s; // allow "471.0" etc
}

function parsePlateTokens(raw) {
   const s = String(raw || "").trim();
   if (!s) return [];
   return s.split(/[\s,]+/).map(x => normalizePlate(x)).filter(Boolean);
}

function plateFromFilename(name) {
   // _Plate601.png  or _Plate471.1.png
   const m = name.match(/_Plate([0-9]+(?:\.[0-9]+)?)\./i);
   if (!m) return null;
   return normalizePlate(m[1]);
}

function primaryAsanaFromFilename(name) {
   // leading numeric id at start of filename
   const m = name.match(/^(\d{1,5})_/);
   return m ? m[1] : null;
}

function ensureArray(x) {
   return Array.isArray(x) ? x : [x];
}

function urlsForExplicitPlates(plates) {
   const out = [];
   const seen = new Set();
   ensureArray(plates).forEach(p => {
      const key = normalizePlate(p);
      (plateToUrls[key] || []).forEach(u => {
         if (!seen.has(u)) {
            seen.add(u);
            out.push(u);
         }
      });
   });
   return out;
}

function smartUrlsForPoseId(idField) {
   // If multi-plate array:
   // - length > 1 means the sequence explicitly wants those plates (step-by-step)
   // - length === 1 is treated as a single plate so we still get "smart" grouping (range + asana collage)
   if (Array.isArray(idField)) {
      if (idField.length > 1) return urlsForExplicitPlates(idField);
      idField = idField[0];
   }

   const plate = normalizePlate(idField);

   // Optional override: if this plate belongs to a defined group/range, show the whole group
   // (Safest way to handle "plate ranges" from the book index.)
   if (plateGroups && plateGroups[plate] && Array.isArray(plateGroups[plate]) && plateGroups[plate].length) {
      return urlsForExplicitPlates(plateGroups[plate]);
   }

   // Default behavior: if it maps to a unique primary asana, show all urls for that asana (collage)
   const primary = plateToPrimaryAsana[plate] || null;
   if (primary && asanaToUrls[primary] && asanaToUrls[primary].length) {
      return asanaToUrls[primary];
   }

   // Otherwise fallback: show just that plate's images
   return (plateToUrls[plate] || []);
}

function filenameFromUrl(url) {
   // url is like "images/XYZ.webp"
   return url.split("/").pop();
}

function mobileVariantUrl(mainUrl) {
   const u = String(mainUrl || "");
   if (u.includes("/main/")) return u.replace("/main/", "/w800/");
   if (u.startsWith(IMAGES_MAIN_BASE)) return IMAGES_MOBILE_BASE + u.slice(IMAGES_MAIN_BASE.length);
   if (u.startsWith(IMAGES_BASE)) return IMAGES_MOBILE_BASE + u.slice(IMAGES_BASE.length);
   return u;
}

function renderCollage(urls) {
   const wrap = document.createElement("div");
   wrap.className = "collage";
   urls.forEach(u => {
      const mob = mobileVariantUrl(u);
      const tile = document.createElement("div");
      tile.className = "tile";

      // Responsive: serve w800 on mobile, main on desktop
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

function setStatus(msg) {
   $("statusText").textContent = msg;
}

function showError(where, msg) {
   console.error(msg);
   const el = $(where);
   if (el) el.textContent = msg;
}

// -------- Data loading --------
async function loadJSON(url) {
   const res = await fetch(url, {
      cache: "no-store"
   });
   if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
   return await res.json();
}

// Support multiple manifest.json shapes:
//  1) ["main/.../file.webp", ...]
//  2) {files:[...]} / {images:[...]} / {items:[...]}
//  3) {variants:{main:[...]}} or {variants:{main:{files:[...]}}}
function manifestToFileList(manifest) {
   // Supports multiple manifest shapes:
   // 1) ["main/...webp", ...]
   // 2) {files:[...]} or {images:[...]} or {items:[...]}
   // 3) {images:{ "332": {main:"main/...Plate332.webp", w800:"w800/..."}, ...}}
   // 4) {"332": {main:"main/..."}, "333": {...}}  (plate->meta mapping)
   if (Array.isArray(manifest)) return manifest;
   if (!manifest || typeof manifest !== "object") return [];

   // Plate->meta mapping
   const looksLikePlateMap = (obj) => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
      const keys = Object.keys(obj);
      if (keys.length === 0) return false;
      // if most keys are digits, treat as plate map
      const digitKeys = keys.filter(k => /^\d+$/.test(String(k))).length;
      return digitKeys >= Math.max(1, Math.floor(keys.length * 0.7));
   };

   // If manifest.images is a plate->meta object, expand to items with plate attached
   if (manifest.images && looksLikePlateMap(manifest.images)) {
      return Object.entries(manifest.images).map(([plate, meta]) => {
         if (meta && typeof meta === "object" && !Array.isArray(meta)) return {
            plate,
            ...meta
         };
         return {
            plate,
            main: meta
         };
      });
   }

   // If manifest itself is a plate map, expand
   if (looksLikePlateMap(manifest)) {
      return Object.entries(manifest).map(([plate, meta]) => {
         if (meta && typeof meta === "object" && !Array.isArray(meta)) return {
            plate,
            ...meta
         };
         return {
            plate,
            main: meta
         };
      });
   }

   const candidates = [
      manifest.files,
      manifest.images,
      manifest.items,
      manifest.main,
      manifest.paths,
      manifest.list,
      manifest.variants && manifest.variants.main,
      manifest.variants && manifest.variants.files
   ];

   for (const c of candidates) {
      if (!c) continue;
      if (Array.isArray(c)) return c;
   }

   return [];
}


function manifestItemToPath(item) {
   // Item can be:
   // - string path
   // - object {main:"main/..", w800:"w800/..", plate:"332", ...}
   // - object {path:"...", file:"...", name:"..."}
   if (typeof item === "string") return item;
   if (!item || typeof item !== "object") return null;
   return item.main || item.path || item.file || item.name || item.relpath || item.relative_path || null;
}

function normalizeImagePath(p) {
   if (!p) return null;
   const s = String(p).replace(/\\/g, "/").replace(/^\.?\//, "");
   if (s.startsWith("http://") || s.startsWith("https://")) return s;
   if (s.startsWith(IMAGES_BASE)) return s;
   return IMAGES_BASE + s;
}

async function buildImageIndexes() {
   const manifest = await loadJSON(MANIFEST_URL);
   const items = manifestToFileList(manifest);

   plateToUrls = {};
   plateToPrimaryAsana = {};
   asanaToUrls = {};

   items.forEach(item => {
      const rel = manifestItemToPath(item);
      if (!rel) return;

      const lower = String(rel).toLowerCase();
      if (!(lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp"))) return;

      const plateFromName = plateFromFilename(rel); // <-- the truth (PlateXX in filename)
      const plateFromItem = (item && typeof item === "object" && item.plate) ? normalizePlate(item.plate) : null;

      // Prefer the filename plate. Only trust item.plate if it matches (or filename plate missing).
      const plate = plateFromName || plateFromItem;

      const primaryAsana = primaryAsanaFromFilename(rel);
      const url = normalizeImagePath(rel);

      if (plate) {
         if (!plateToUrls[plate]) plateToUrls[plate] = [];
         plateToUrls[plate].push(url);

         // only set primary asana if consistent; if inconsistent, null it out
         if (primaryAsana) {
            if (!(plate in plateToPrimaryAsana)) plateToPrimaryAsana[plate] = primaryAsana;
            else if (plateToPrimaryAsana[plate] !== primaryAsana) plateToPrimaryAsana[plate] = null;
         }
      }

      if (primaryAsana) {
         if (!asanaToUrls[primaryAsana]) asanaToUrls[primaryAsana] = [];
         asanaToUrls[primaryAsana].push(url);
      }
   });

   // sort urls for stable collage order (by filename)
   Object.keys(plateToUrls).forEach(k => plateToUrls[k].sort());
   Object.keys(asanaToUrls).forEach(k => asanaToUrls[k].sort());
}

async function loadSequences() {
   sequences = await loadJSON(SEQUENCES_URL);
   if (!Array.isArray(sequences)) throw new Error("sequences.json must be an array");

   const sel = $("sequenceSelect");
   sel.innerHTML = `<option value="">Select a sequence</option>`;
   sequences.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = s.title || `Sequence ${idx+1}`;
      sel.appendChild(opt);
   });
}


// -------- Browse Asanas (index.csv) --------
let asanaIndex = [];
let asanaByNo = {}; // normalized asanaNo -> asanaIndex entry // array of { asanaNo, english, iast, interRaw, finalRaw, interPlates, finalPlates, allPlates, category, page2001, page2015, intensity }

function parseCSV(text) {
   // Minimal CSV parser that handles quoted fields.
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
            // trim \r
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
   // last line
   if (val.length || cur.length) {
      cur.push(val);
      rows.push(cur.map(x => String(x ?? "").replace(/\r$/, "")));
   }
   return rows;
}

function parseIndexPlateField(raw) {
   // Supports: tokens split by |, and numeric ranges A-B. Preserves suffix like 476a.
   const s = String(raw || "").trim();
   if (!s) return [];
   const parts = s.split("|").map(x => String(x).trim()).filter(Boolean);

   const out = [];
   for (const token of parts) {
      const t = token.replace(/\s+/g, ""); // be forgiving about spaces
      const m = t.match(/^(\d+)-(\d+)$/);
      if (m) {
         const a = parseInt(m[1], 10);
         const b = parseInt(m[2], 10);
         if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
            for (let k = a; k <= b; k++) out.push(String(k));
            continue;
         }
      }
      // exact token (may include suffix like 591a)
      out.push(normalizePlate(t));
   }
   // de-dupe but preserve order
   const seen = new Set();
   return out.filter(x => (x && !seen.has(x) && (seen.add(x), true)));
}

function categoryFromAnyUrl(urls) {
   if (!urls || !urls.length) return "";
   const u = String(urls[0]);
   const m = u.match(/\/(main|w800)\/([^\/]+)\//);
   return m ? m[2] : "";
}

async function loadAsanaIndex() {
   const res = await fetch(INDEX_CSV_URL, {
      cache: "no-store"
   });
   if (!res.ok) throw new Error("Failed to load index.csv");
   let text = await res.text();
   const rows = parseCSV(text);
   if (!rows.length) return [];

   const header = rows[0].map(h => String(h || "").trim());
   // Robust column finding
   const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase() || h.includes(name));

   const colNo = idx("#");
   const colEng = idx("Yogasana Name");
   const colIAST = idx("IAST Name");
   const colInt = idx("Intermediate Plate");
   const colFinal = idx("Final Asana Plate");
   const colP2001 = idx("2001 Edition Page");
   const colP2015 = idx("2015 Edition Page");
   const colIntensity = idx("Intensity");
   const colDesc = header.findIndex(h => /formatted\s*description/i.test(h) || /formatted_description/i.test(h));

   const out = [];
   for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const asanaNoRaw = (colNo >= 0 ? row[colNo] : "") || "";
      const asanaNo = normalizePlate(asanaNoRaw);

      // SKIP invalid rows (allow LOY suffix letters like 172a)
      if (!asanaNo || asanaNo.length > 8 || !/^\d+(?:[a-zA-Z])?$/.test(asanaNo)) continue;

      const english = (colEng >= 0 ? row[colEng] : "") || "";
      const iast = (colIAST >= 0 ? row[colIAST] : "") || "";
      const interRaw = (colInt >= 0 ? row[colInt] : "") || "";
      const finalRaw = (colFinal >= 0 ? row[colFinal] : "") || "";
      const defaultDescriptionMd = (colDesc >= 0 ? row[colDesc] : "") || "";

      const interPlates = parseIndexPlateField(interRaw);
      const finalPlates = parseIndexPlateField(finalRaw);
      const allPlates = [...interPlates, ...finalPlates];

      // Infer category from the first plate that has an image (prefer Final)
      let cat = "";
      const tryPlates = finalPlates.length ? finalPlates : interPlates;
      for (const p of tryPlates) {
         const urls = smartUrlsForPoseId(p);
         if (urls && urls.length) {
            cat = categoryFromAnyUrl(urls);
            if (cat) break;
         }
      }

      // Create object first
      const asanaObj = {
         asanaNo,
         english,
         iast,
         interRaw: String(interRaw || "").trim(),
         finalRaw: String(finalRaw || "").trim(),
         interPlates,
         finalPlates,
         allPlates,
         category: cat,
         page2001: (colP2001 >= 0 ? row[colP2001] : "") || "",
         page2015: (colP2015 >= 0 ? row[colP2015] : "") || "",
         intensity: (colIntensity >= 0 ? row[colIntensity] : "") || "",
         defaultDescriptionMd: String(defaultDescriptionMd || "").trim(),
         descriptionMd: "",
         descriptionUpdatedAt: "",
         descriptionSource: ""
      };

      out.push(asanaObj);

      // Map every plate mentioned in this CSV row to this Asana object
      allPlates.forEach(p => {
         const k = normalizePlate(p);
         if (k) csvPlateToAsana[k] = asanaObj;
      });
      // ---------------------
   }
   return out;
}

function matchesText(asma, q) {
   if (!q) return true;
   const hay = (String(asma.english || "") + " " + String(asma.iast || "")).toLowerCase();
   return hay.includes(q.toLowerCase());
}

function parsePlateQuery(q) {
   // allow commas/spaces and | and numeric ranges
   const s = String(q || "").trim();
   if (!s) return [];
   // unify separators: treat comma/space as "|"
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

function renderBrowseList(items) {
   const list = $("browseList");
   list.innerHTML = "";
   $("browseCount").textContent = `Showing ${items.length} of ${asanaIndex.length}`;

   if (!items.length) {
      list.innerHTML = `<div class="msg" style="padding:10px 0">No matches.</div>`;
      return;
   }

   const frag = document.createDocumentFragment();
   items.slice(0, 400).forEach(asma => {
      const row = document.createElement("div");
      row.className = "browse-item";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = asma.english || "(no name)";
      const meta = document.createElement("div");
      meta.className = "meta";
      const catBadge = asma.category ? ` <span class="badge">${asma.category}</span>` : "";
      meta.innerHTML = `
        Asana # <b>${asma.asanaNo}</b>
        • Int: ${asma.interRaw || "–"}${asma.finalRaw ? ` • Final: ${asma.finalRaw}` : ""}
        ${catBadge}
      `;
      left.appendChild(title);
      left.appendChild(meta);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "View";
      btn.addEventListener("click", () => {
         showAsanaDetail(asma);
         if (isBrowseMobile()) enterBrowseDetailMode();
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

function urlsForPlateToken(p) {
   const urls = smartUrlsForPoseId(p);
   return urls && urls.length ? urls : [];
}

function renderPlateSection(title, plates, globalSeen) {
   const wrap = document.createElement("div");
   const header = document.createElement("div");
   header.className = "section-title";
   header.textContent = title;
   wrap.appendChild(header);

   if (!plates || !plates.length) {
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.textContent = "–";
      wrap.appendChild(msg);
      return wrap;
   }

   const urls = [];
   const missing = [];
   const seen = new Set();
   for (const p of plates) {
      const u = urlsForPlateToken(p);
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

   const meta = document.createElement("div");
   meta.className = "muted";
   meta.style.marginTop = "4px";
   meta.textContent = `Plates: ${plates.join(", ")}`;
   wrap.appendChild(meta);

   if (urls.length) {
      wrap.appendChild(renderCollage(urls));
   }

   if (missing.length) {
      const m = document.createElement("div");
      m.className = "msg";
      m.textContent = `Image not found for: ${missing.join(", ")}`;
      wrap.appendChild(m);
   }
   return wrap;
}

function showAsanaDetail(asma) {
   const d = $("browseDetail");
   d.innerHTML = "";
   if (isBrowseMobile()) {
      const back = document.createElement("button");
      back.type = "button";
      back.textContent = "← Back to list";
      back.className = "tiny";
      back.addEventListener("click", () => {
         exitBrowseDetailMode();
         // optional: keep focus near the results
         const list = $("browseList");
         if (list) list.scrollIntoView({
            block: "start"
         });
      });
      d.appendChild(back);
   }
   const h = document.createElement("h2");
   h.textContent = asma.english || "(no name)";

   // --- NEW: Audio Button in Browse Header ---
   const audioBtn = document.createElement("button");
   audioBtn.textContent = "🔊";
   audioBtn.title = "Pronounce";
   audioBtn.style.marginLeft = "10px";
   audioBtn.style.cursor = "pointer";
   audioBtn.style.border = "none";
   audioBtn.style.background = "transparent";
   audioBtn.style.fontSize = "1.2rem";
   audioBtn.onclick = () => playAsanaAudio(asma);
   h.appendChild(audioBtn);
   // ------------------------------------------

   const sub = document.createElement("div");
   sub.className = "sub";
   const bits = [];
   if (asma.iast) bits.push(asma.iast);
   bits.push(`Asana # ${asma.asanaNo}`);
   if (asma.category) bits.push(asma.category);
   sub.textContent = bits.join(" • ");

   // Admin: category override editor
   const adminCatWrap = document.createElement("div");
   adminCatWrap.style.marginTop = "10px";
   adminCatWrap.style.display = adminMode ? "block" : "none";

   const catLabel = document.createElement("div");
   catLabel.className = "muted";
   catLabel.textContent = "Admin: override category";
   catLabel.style.marginBottom = "6px";

   const catRow = document.createElement("div");
   catRow.style.display = "flex";
   catRow.style.gap = "8px";
   catRow.style.alignItems = "center";
   catRow.style.flexWrap = "wrap";

   const catSel = document.createElement("select");
   catSel.className = "tiny";
   const catOptions = [
      "",
      "01_Standing_and_Basic",
      "02_Seated_and_Lotus_Variations",
      "03_Forward_Bends",
      "04_Inversions_Sirsasana_Sarvangasana",
      "05_Abdominal_and_Supine",
      "06_Twists",
      "07_Arm_Balances",
      "08_Advanced_Leg_behind_Head",
      "09_Backbends",
      "10_Restorative_Pranayama"
   ];
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
   catOptions.forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = catLabels[v] || v;
      catSel.appendChild(o);
   });
   catSel.value = asma.category || "";

   const saveCatBtn = document.createElement("button");
   saveCatBtn.type = "button";
   saveCatBtn.textContent = "Save category";
   saveCatBtn.className = "tiny";

   const catStatus = document.createElement("span");
   catStatus.className = "muted";

   saveCatBtn.addEventListener("click", async () => {
      saveCatBtn.disabled = true;
      catStatus.textContent = "Saving…";
      try {
         await saveCategoryOverride(asma.asanaNo, catSel.value);
         applyBrowseFilters();
         catStatus.textContent = "Saved ✓";
      } catch (e) {
         catStatus.textContent = "Save failed";
      } finally {
         setTimeout(() => catStatus.textContent = "", 1500);
         saveCatBtn.disabled = false;
      }
   });

   catRow.appendChild(catSel);
   catRow.appendChild(saveCatBtn);
   catRow.appendChild(catStatus);

   adminCatWrap.appendChild(catLabel);
   adminCatWrap.appendChild(catRow);

   if (adminMode) d.appendChild(adminCatWrap);

   const actions = document.createElement("div");
   actions.style.marginTop = "10px";
   actions.style.display = "flex";
   actions.style.gap = "10px";
   actions.style.flexWrap = "wrap";

   const startBtn = document.createElement("button");
   startBtn.type = "button";
   startBtn.textContent = "Start this asana";
   const playablePlates = (asma.finalPlates && asma.finalPlates.length) ? asma.finalPlates : asma.interPlates;
   if (!playablePlates || !playablePlates.length) {
      startBtn.disabled = true;
      startBtn.title = "No plates available to load into the player.";
   }
   startBtn.addEventListener("click", () => startBrowseAsana(asma));

   const closeBtn = document.createElement("button");
   closeBtn.type = "button";
   closeBtn.textContent = "Close";
   closeBtn.addEventListener("click", closeBrowse);

   //actions.appendChild(startBtn);
   //actions.appendChild(closeBtn);

   d.appendChild(h);
   d.appendChild(sub);
   // mark current asana for admin re-render
   d.setAttribute("data-asana-no", asma.asanaNo);
   d.appendChild(actions);

   // Sections (de-dupe images across Intermediate + Final)
   const _globalSeen = new Set();
   d.appendChild(renderPlateSection("Intermediate", asma.interPlates, _globalSeen));
   d.appendChild(renderPlateSection("Final", asma.finalPlates, _globalSeen));

   // Description (Markdown)
   const descWrap = document.createElement("div");
   descWrap.style.marginTop = "12px";

   const descDetails = document.createElement("details");
   descDetails.open = false;

   const descSum = document.createElement("summary");
   descSum.textContent = "Description";
   descSum.style.cursor = "pointer";
   descSum.style.fontWeight = "650";
   descDetails.appendChild(descSum);

   const descBody = document.createElement("div");
   descBody.style.paddingTop = "10px";

   const md = String(asma.descriptionMd || "").trim();
   if (md) {
      const rendered = document.createElement("div");
      rendered.className = "muted";
      rendered.style.color = "#111";
      rendered.innerHTML = renderMarkdownMinimal(md);
      descBody.appendChild(rendered);

      const meta = document.createElement("div");
      meta.className = "muted";
      meta.style.marginTop = "8px";
      const source = asma.descriptionSource ? `Source: ${asma.descriptionSource}` : "";
      const updated = asma.descriptionUpdatedAt ? `Updated: ${asma.descriptionUpdatedAt}` : "";
      meta.textContent = [source, updated].filter(Boolean).join(" • ");
      descBody.appendChild(meta);
   } else {
      const empty = document.createElement("div");
      empty.className = "msg";
      empty.textContent = "No description yet.";
      descBody.appendChild(empty);
   }

   if (adminMode) {
      const editRow = document.createElement("div");
      editRow.style.marginTop = "10px";
      editRow.style.display = "flex";
      editRow.style.gap = "10px";
      editRow.style.flexWrap = "wrap";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit description";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "Save";
      saveBtn.style.display = "none";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.display = "none";

      const ta = document.createElement("textarea");
      ta.style.marginTop = "10px";
      ta.style.width = "100%";
      ta.style.minHeight = "160px";
      ta.style.display = "none";
      ta.value = md || "";

      const status = document.createElement("div");
      status.className = "muted";
      status.style.marginTop = "6px";
      status.style.display = "none";

      editBtn.addEventListener("click", () => {
         descDetails.open = true;
         ta.style.display = "block";
         saveBtn.style.display = "inline-block";
         cancelBtn.style.display = "inline-block";
         editBtn.style.display = "none";
         status.style.display = "none";
         ta.focus();
      });

      cancelBtn.addEventListener("click", () => {
         ta.value = md || "";
         ta.style.display = "none";
         saveBtn.style.display = "none";
         cancelBtn.style.display = "none";
         editBtn.style.display = "inline-block";
         status.style.display = "none";
      });

      saveBtn.addEventListener("click", async () => {
         status.style.display = "block";
         status.textContent = "Saving…";
         try {
            await saveDescriptionOverride(asma.asanaNo, ta.value || "");
            status.textContent = "Saved ✓";
            // refresh the detail with updated merged data
            const refreshed = asanaIndex.find(a => normalizePlate(a.asanaNo) === normalizePlate(asma.asanaNo));
            if (refreshed) showAsanaDetail(refreshed);
         } catch (e) {
            status.textContent = "Save failed. Check JSON file permissions / PHP.";
            console.error(e);
         }
      });

      editRow.appendChild(editBtn);
      editRow.appendChild(saveBtn);
      editRow.appendChild(cancelBtn);

      descBody.appendChild(editRow);
      descBody.appendChild(ta);
      descBody.appendChild(status);
   }

   descDetails.appendChild(descBody);
   descWrap.appendChild(descDetails);
   d.appendChild(descWrap);
}

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

   // Stable sort: by asana number (numeric first)
   filtered.sort((x, y) => {
      const ax = parseFloat(x.asanaNo);
      const ay = parseFloat(y.asanaNo);
      const nx = Number.isFinite(ax) ? ax : Number.POSITIVE_INFINITY;
      const ny = Number.isFinite(ay) ? ay : Number.POSITIVE_INFINITY;
      if (nx !== ny) return nx - ny;
      return String(x.asanaNo).localeCompare(String(y.asanaNo));
   });

   renderBrowseList(filtered);
}

function openBrowse() {
   $("browseBackdrop").style.display = "flex";
   $("browseBackdrop").setAttribute("aria-hidden", "false");
   $("browseSearch").focus();
   applyBrowseFilters();
}

function closeBrowse() {
   $("browseBackdrop").style.display = "none";
   $("browseBackdrop").setAttribute("aria-hidden", "true");
   exitBrowseDetailMode();
   const btn = $("browseBtn");
   if (btn) btn.focus();
}

function startBrowseAsana(asma) {
   const plates = (asma.finalPlates && asma.finalPlates.length) ? asma.finalPlates : asma.interPlates;
   if (!plates || !plates.length) return;

   stopTimer();
   running = false;
   disableWakeLock();
   $("startStopBtn").textContent = "Start";

   // Create a temporary single-pose sequence that uses explicit plates (step-by-step)
   currentSequence = {
      title: `Browse: ${asma.english || "Asana"}`,
      category: "Browse",
      poses: [
         [plates, 60, asma.english || "Asana"]
      ]
   };
   currentIndex = 0;
   $("sequenceSelect").value = ""; // keep existing sequences unchanged
   updateTotalAndLastUI();
   setPose(0);
   closeBrowse();
}

function setupBrowseUI() {
   $("browseBtn").addEventListener("click", openBrowse);
   $("browseCloseBtn").addEventListener("click", closeBrowse);

   // Clear filters
   $("browseClearBtn").addEventListener("click", () => {
      $("browseSearch").value = "";
      $("browsePlate").value = "";
      $("browseAsanaNo").value = "";
      $("browseCategory").value = "";
      $("browseFinalOnly").checked = false;
      applyBrowseFilters();
      $("browseSearch").focus();
   });

   // click backdrop to close (only when the down/up both start on the backdrop)
   (function () {
      const bd = $("browseBackdrop");
      let downOnBackdrop = false;

      bd.addEventListener("pointerdown", (e) => {
         downOnBackdrop = (e.target === bd);
      });

      bd.addEventListener("click", (e) => {
         if (e.target === bd && downOnBackdrop) closeBrowse();
         downOnBackdrop = false;
      });
   })();
   // ESC closes
   document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("browseBackdrop").style.display === "flex") closeBrowse();
   });

   const onChange = () => applyBrowseFilters();
   const debounce = (fn, ms = 120) => {
      let t = null;
      return (...args) => {
         if (t) clearTimeout(t);
         t = setTimeout(() => fn(...args), ms);
      };
   };

   $("browseSearch").addEventListener("input", debounce(onChange, 120));
   $("browsePlate").addEventListener("input", debounce(onChange, 120));
   $("browseAsanaNo").addEventListener("input", debounce(onChange, 120));
   $("browseCategory").addEventListener("change", onChange);
   $("browseFinalOnly").addEventListener("change", onChange);
}

// -------- Playback --------
function stopTimer() {
   if (timer) clearInterval(timer);
   timer = null;
   running = false;
   $("startStopBtn").textContent = "Start";
}

function startTimer() {
   if (!currentSequence) return;
   if (running) {
      // If already running, we are pausing
      stopTimer();
      return;
   }

   running = true;
   enableWakeLock();
   $("startStopBtn").textContent = "Pause";

   // --- NEW: Play audio immediately when starting ---
   const [idField] = currentSequence.poses[currentIndex];
   const plate = Array.isArray(idField) ? normalizePlate(idField[0]) : normalizePlate(idField);
   const asana = csvPlateToAsana[plate];
   if (asana) playAsanaAudio(asana);
   // -------------------------------------------------

   timer = setInterval(() => {
      if (remaining > 0) remaining--;
      updateTimerUI();
      if (remaining <= 0) {
         if (running && currentPoseSeconds >= 60) playFaintGong();
         nextPose(); // nextPose will call setPose, which checks 'running' and plays audio
      }
   }, 1000);
}

function updateTimerUI() {
   if (!currentSequence) {
      $("poseTimer").textContent = "–";
      return;
   }
   const mm = Math.floor(remaining / 60);
   const ss = remaining % 60;
   $("poseTimer").textContent = `${mm}:${String(ss).padStart(2,"0")}`;
}


function descriptionForPose(idField) {
   // 1. Get the plate number from the sequence
   const plate = Array.isArray(idField) ? normalizePlate(idField[0]) : normalizePlate(idField);

   // 2. Look up the Asana object using our CSV map
   const asana = csvPlateToAsana[plate];

   // 3. Return the description (this includes overrides if they exist)
   return (asana && asana.descriptionMd) ? String(asana.descriptionMd).trim() : "";
}

function updatePoseDescription(idField) {
   const body = $("poseDescBody");
   const md = descriptionForPose(idField);
   if (!body) return;
   if (md) {
      body.innerHTML = renderMarkdownMinimal(md);
   } else {
      body.innerHTML = '<span class="msg">No description yet.</span>';
   }
}


function updatePoseNote(note) {
   const details = $("poseNoteDetails");
   const body = $("poseNoteBody");
   if (!details || !body) return;

   const text = (note ?? "").toString().trim();
   if (!text) {
      // Hide the panel entirely and reset its state if empty
      details.style.display = "none";
      details.open = false;
      body.innerHTML = "";
      return;
   }

   // Show the panel and auto-expand it when text exists
   details.style.display = "block";
   details.open = true; 
   body.innerHTML = renderMarkdownMinimal(text);
}


function setPose(idx) {
   if (!currentSequence) return;
   const poses = currentSequence.poses || [];
   if (idx < 0 || idx >= poses.length) return;

   currentIndex = idx;

   // 1. Update the destructuring to include 'note' (the 4th element)
   const [idField, seconds, label, note] = poses[idx];

   // --- 1. LOOKUP ASANA ---
   const plate = Array.isArray(idField) ? normalizePlate(idField[0]) : normalizePlate(idField);
   const asana = csvPlateToAsana[plate]; // The object from CSV

   // --- 2. UPDATE UI ---
   $("poseName").textContent = label || "Pose";
   updatePoseNote(note);

   // Update Meta + Add Pronounce Button
   const idDisplay = Array.isArray(idField) ? idField.join(", ") : String(idField);

   // Clear previous buttons in debugSmall or poseMeta if you want, or just append
   // Here we rebuild the meta line to include the button
   const metaContainer = $("poseMeta");
   metaContainer.innerHTML = `Plate(s): ${idDisplay} • ${seconds}s `;

   if (asana) {
      const speakBtn = document.createElement("button");
      speakBtn.className = "tiny"; // You can style this in CSS
      speakBtn.textContent = "🔊 Pronounce";
      speakBtn.style.marginLeft = "10px";
      speakBtn.onclick = () => playAsanaAudio(asana);
      metaContainer.appendChild(speakBtn);
   }

   updatePoseDescription(idField);
   $("poseCounter").textContent = `${idx + 1} / ${poses.length}`;

   // show Complete button only on final pose
   $("completeBtn").style.display = (idx === poses.length - 1) ? "inline-block" : "none";

   // timer
   currentPoseSeconds = parseInt(seconds, 10) || 0;
   remaining = currentPoseSeconds;
   updateTimerUI();

   // images
   const urls = smartUrlsForPoseId(idField);
   const wrap = $("collageWrap");
   wrap.innerHTML = "";
   if (!urls || !urls.length) {
      const div = document.createElement("div");
      div.className = "msg";
      div.textContent = `No image found for plate(s): ${idDisplay}`;
      wrap.appendChild(div);
   } else {
      wrap.appendChild(renderCollage(urls));
   }

   // Show Complete button only on final pose
   const posesArr = currentSequence.poses || [];
   const isFinal = posesArr.length && currentIndex === posesArr.length - 1;
   $("completeBtn").style.display = isFinal ? "inline-block" : "none";

   // Keep Total/Last pills in sync
   updateTotalAndLastUI();

   // debug small
   $("debugSmall").textContent = urls && urls.length ? `${urls.length} image(s)` : "";

   // --- 3. AUTO PLAY AUDIO ---
   // Only play automatically if the sequence is actively running
   if (running && asana) {
      playAsanaAudio(asana);
   }
}

function nextPose() {
   if (!currentSequence) return;
   const poses = currentSequence.poses || [];
   if (currentIndex < poses.length - 1) {
      setPose(currentIndex + 1);
      if (running) {
         /* keep running */ } else stopTimer();
   } else {
      stopTimer();
   }
}

function prevPose() {
   if (!currentSequence) return;
   if (currentIndex > 0) {
      setPose(currentIndex - 1);
      if (running) {
         /* keep running */ } else stopTimer();
   }
}

// -------- Builder --------
function renderDraft() {
   const list = $("draftList");
   if (!list) return; // Guard against missing element

   list.innerHTML = "";

   if (!draft.length) {
      list.innerHTML = `<div class="msg">Draft is empty.</div>`;
      if ($("draftExport")) $("draftExport").value = "";
      return;
   }

   draft.forEach((row, i) => {
      const [idField, sec, label] = row;
      const idDisplay = Array.isArray(idField) ? idField.join(", ") : String(idField);

      const item = document.createElement("div");
      item.className = "draft-row";
      item.innerHTML = `
        <div class="left">
          <div><b>${label || "Pose"}</b></div>
          <div class="muted">Plate(s): ${idDisplay} • ${sec}s</div>
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" data-act="up" data-i="${i}">↑</button>
          <button type="button" data-act="down" data-i="${i}">↓</button>
          <button type="button" data-act="del" data-i="${i}">✕</button>
        </div>
      `;
      list.appendChild(item);
   });

   // Export as JSON rows
   if ($("draftExport")) $("draftExport").value = JSON.stringify(draft, null, 2);

   list.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
         const act = btn.getAttribute("data-act");
         const i = parseInt(btn.getAttribute("data-i"), 10);
         if (act === "del") draft.splice(i, 1);
         if (act === "up" && i > 0) {
            const t = draft[i - 1];
            draft[i - 1] = draft[i];
            draft[i] = t;
         }
         if (act === "down" && i < draft.length - 1) {
            const t = draft[i + 1];
            draft[i + 1] = draft[i];
            draft[i] = t;
         }
         renderDraft();
      });
   });
}

function addDraft() {
   const platesRaw = $("plateInput") ? $("plateInput").value.trim() : "";
   const secs = $("durInput") ? (parseInt($("durInput").value, 10) || 0) : 0;
   const label = $("nameInput") ? $("nameInput").value.trim() : "";

   const tokens = parsePlateTokens(platesRaw);
   if (!tokens.length || secs <= 0) return;

   const idField = (tokens.length === 1) ? tokens[0] : tokens;
   const autoLabel = label || (tokens.length === 1 ? `Plate ${tokens[0]}` : `Plates ${tokens.join(", ")}`);

   draft.push([idField, secs, autoLabel]);
   renderDraft();
}

// -------- Wire up --------
$("sequenceSelect").addEventListener("change", () => {
   const idx = $("sequenceSelect").value;
   stopTimer();
   if (!idx) {
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
   currentSequence = sequences[parseInt(idx, 10)];
   // Update Total/Last immediately (even if image rendering errors)
   updateTotalAndLastUI();
   try {
      setPose(0);
   } catch (e) {
      console.error(e);
      $("collageWrap").innerHTML = `<div class="msg">Error rendering this pose. Check Console for details.</div>`;
   }
});

$("nextBtn").addEventListener("click", () => {
   stopTimer();
   nextPose();
});
$("prevBtn").addEventListener("click", () => {
   stopTimer();
   prevPose();
});
$("startStopBtn").addEventListener("click", () => {
   if (!currentSequence) return;
   if (!running) startTimer();
   else stopTimer();
});
$("resetBtn").addEventListener("click", () => {
   stopTimer();
   if (currentSequence) setPose(0);
});

$("completeBtn").addEventListener("click", async () => {
   if (!currentSequence) return;
   const poses = currentSequence.poses || [];
   if (!poses.length) return;
   // Only allow marking complete on the final pose
   if (currentIndex !== poses.length - 1) return;

   stopTimer();
   await appendServerHistory(currentSequence.title || "Untitled sequence", new Date());
   updateTotalAndLastUI();
   $("statusText").textContent = "Completed ✓";
   // Optional tiny confirmation without a popup
   // The "Last:" pill updates immediately.
});


$("historyLink").addEventListener("click", (e) => {
   e.preventDefault();
   toggleHistoryPanel();
});
$("adminModeToggle").addEventListener("change", (e) => {
   setAdminMode(e.target.checked);
});
const _addDraftBtn = $("addDraftBtn");
if (_addDraftBtn) _addDraftBtn.addEventListener("click", addDraft);

// FIX: Added safety check for clearDraftBtn
const _clearDraftBtn = $("clearDraftBtn");
if (_clearDraftBtn) _clearDraftBtn.addEventListener("click", () => {
   draft = [];
   renderDraft();
});

// -------- Init --------
(async function init() {
   try {
      seedManualCompletionsOnce();
      loadAdminMode();
      // Load server history early so "Last:" is correct even after refresh.
      await fetchServerHistory();
      setStatus("Loading images…");
      await buildImageIndexes();

      // Optional: load plate groups (e.g., 18 -> [18,19]) to handle index ranges safely.
      // If the file doesn't exist, everything still works.
      try {
         plateGroups = await loadJSON(PLATE_GROUPS_URL);
      } catch (e) {
         plateGroups = {};
      }

      setStatus("Loading sequences…");
      await loadSequences();

      setStatus("Loading asana index…");
      asanaIndex = await loadAsanaIndex();
      await fetchDescriptionOverrides();
      await fetchCategoryOverrides();
      applyDescriptionOverrides();
      applyCategoryOverrides();
      // Build quick lookup map for descriptions in the main player
      asanaByNo = {};
      asanaIndex.forEach(a => {
         const k = normalizePlate(a.asanaNo);
         if (k) asanaByNo[k] = a;
      });
      setupBrowseUI();
      setStatus("Ready");
      $("loadingText").textContent = "Select a sequence";

      // FIX: Only call renderDraft if the draft list exists
      if ($("draftList")) renderDraft();

   } catch (e) {
      setStatus("Error");
      $("loadingText").textContent = "Error loading. Open Console for details.";
      console.error(e);
   }
})();

function isBrowseMobile() {
   return window.matchMedia("(max-width: 900px)").matches;
}

function enterBrowseDetailMode() {
   const modal = document.querySelector("#browseBackdrop .modal");
   if (modal) modal.classList.add("detail-mode");
}

function exitBrowseDetailMode() {
   const modal = document.querySelector("#browseBackdrop .modal");
   if (modal) modal.classList.remove("detail-mode");
}

// --- VARIATION LOGIC START ---
window.switchVariationTab = function(btn, contentId) {
    const parent = btn.closest('#technique-description-container') || document.body;
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(contentId).classList.add('active');
};

function getVariations(techniqueName, allData) {
    return allData.filter(item => item['Yogasana Name'] === techniqueName);
}

function findSequenceItem(sequenceString, allData) {
    let exactMatch = allData.find(i => i['Yogasana Name'].toLowerCase() === sequenceString.toLowerCase());
    if (exactMatch) return exactMatch;

    const match = sequenceString.match(/(.*?)\s*\((.*?)\)/);
    if (match) {
        const baseName = match[1].trim();
        const variationName = match[2].trim();
        return allData.find(item => 
            item['Yogasana Name'].toLowerCase() === baseName.toLowerCase() &&
            item['Variation'].toLowerCase().includes(variationName.toLowerCase())
        ) || allData.find(i => i['Yogasana Name'].toLowerCase() === baseName.toLowerCase());
    }
    return null;
}
// --- VARIATION LOGIC END ---

// --- VARIATION LOGIC START ---
window.switchVariationTab = function(btn, contentId) {
    const parent = btn.closest('#details-panel') || btn.closest('.modal-content') || document.body;
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(contentId);
    if(target) target.classList.add('active');
};

function getVariations(techniqueName, allData) {
    return allData.filter(item => item['Yogasana Name'] === techniqueName);
}

function findSequenceItem(sequenceString, allData) {
    let exactMatch = allData.find(i => i['Yogasana Name'].toLowerCase() === sequenceString.toLowerCase());
    if (exactMatch) return exactMatch;

    // Fixed SyntaxWarning by using raw string handling in Python
    const match = sequenceString.match(/(.*?)\s*\((.*?)\)/);
    if (match) {
        const baseName = match[1].trim();
        const variationName = match[2].trim();
        return allData.find(item => 
            item['Yogasana Name'].toLowerCase() === baseName.toLowerCase() &&
            (item['Variation'] || "").toLowerCase().includes(variationName.toLowerCase())
        ) || allData.find(i => i['Yogasana Name'].toLowerCase() === baseName.toLowerCase());
    }
    return null;
}
// --- VARIATION LOGIC END ---
