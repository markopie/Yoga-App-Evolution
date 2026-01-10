import { CONFIG } from './config.js';
import { $, escapeHtml } from './utils.js';

// -------- Constants & State --------
const COMPLETION_KEY = "yogaCompletionLog_v1";
let serverHistoryCache = null; // array of {title, ts, local?}

// -------- Local Storage Helpers (Private/Exported as needed) --------

export function loadCompletionLog(){
  try { return JSON.parse(localStorage.getItem(COMPLETION_KEY) || "[]"); }
  catch(e){ return []; }
}

function saveCompletionLog(log){
  localStorage.setItem(COMPLETION_KEY, JSON.stringify(log));
}

export function addCompletion(title, whenDate){
  const log = loadCompletionLog();
  log.push({
    title,
    ts: whenDate.getTime(),
    // Store a human-friendly local string for quick display
    local: whenDate.toLocaleString("en-AU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })
  });
  saveCompletionLog(log);
}

// -------- Seeding --------

export function seedManualCompletionsOnce(){
  const log = loadCompletionLog();
  const have = new Set(log.filter(x=>x && x.title).map(x=>x.title + "::" + x.ts));

  const seeds = [
    { title: "Course 1: Short Course, Day 1", d: new Date(2025, 11, 31, 10, 0, 0) }, // 31/12/2025 10:00
    { title: "Course 1: Short Course, Day 2", d: new Date(2026, 0, 1, 9, 30, 0) },   // 01/01/2026 09:30
    { title: "Course 1: Short Course, Day 3", d: new Date(2026, 0, 2, 10, 0, 0), local_override: "02/01/2026" } // time not provided
  ];

  let changed = false;
  for (const s of seeds){
    const key = s.title + "::" + s.d.getTime();
    if (!have.has(key)){
      log.push({
        title: s.title,
        ts: s.d.getTime(),
        local: s.d.toLocaleString("en-AU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })
      });
      changed = true;
    }
  }
  if (changed) saveCompletionLog(log);
}

// -------- Server Synchronization --------

export async function fetchServerHistory(){
  try {
    const res = await fetch(CONFIG.COMPLETION_LOG_URL + "?action=get", { cache: "no-store" });
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

export async function appendServerHistory(title, whenDate){
  // Always write to localStorage first so the UI updates even if server fails
  addCompletion(title, whenDate);

  const payload = {
    title,
    ts: whenDate.getTime(),
    // ISO string keeps timezone offset; useful later for multi-user auditing
    iso: whenDate.toISOString()
  };

  try {
    const res = await fetch(CONFIG.COMPLETION_LOG_URL + "?action=add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

// -------- UI Helpers --------

export function getLastCompletionDate(title) {
  if (!title) return null;
  // Prefer server cache if available, else local
  const source = (Array.isArray(serverHistoryCache) && serverHistoryCache.length) ? serverHistoryCache : loadCompletionLog();
  const last = source.filter(x => x && x.title === title && typeof x.ts === "number").sort((a,b)=>b.ts-a.ts)[0];
  return last ? last.ts : null;
}

function formatHistoryRow(entry){
  const title = entry?.title || "Untitled sequence";
  
  // Format the date using Australian locale
  const local = (typeof entry?.ts === "number")
    ? new Date(entry.ts).toLocaleString("en-AU", { 
        year: "numeric", month: "2-digit", day: "2-digit", 
        hour: "2-digit", minute: "2-digit" 
      })
    : (entry.local || "");
    
  return `${local} — ${title}`;
}

export async function toggleHistoryPanel(){
  const panel = $("historyPanel");
  if (!panel) return;
  
  const isOpen = panel.style.display !== "none";
  if (isOpen) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  panel.textContent = "Loading…";
  
  // We use the exported fetchServerHistory here
  const hist = await fetchServerHistory();

  if (!hist.length) {
    panel.textContent = "No completions recorded yet.";
    return;
  }

  // newest first
  const sorted = [...hist].filter(x => x && typeof x.ts === "number").sort((a,b)=>b.ts-a.ts);
  const lines = sorted.map(formatHistoryRow);

  panel.innerHTML = "<div style='margin-top:4px'></div>" + lines.map(l => `<div>• ${escapeHtml(l)}</div>`).join("");
}