// src/services/historyService.js

import { supabase } from "./supabaseClient.js";
import { $ } from "../utils/dom.js";

const COMPLETION_KEY = "yogaCompletionLog_v2";

export function safeGetLocalStorage(key, defaultValue = null) {
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

export function safeSetLocalStorage(key, value) {
   try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
   } catch (e) {
      console.error(`Failed to save to localStorage: ${key}`, e);
      return false;
   }
}

export function loadCompletionLog() {
   return safeGetLocalStorage(COMPLETION_KEY, []);
}

export function saveCompletionLog(log) {
   safeSetLocalStorage(COMPLETION_KEY, log);
}

export function addCompletion(title, whenDate, category = null) {
   const log = loadCompletionLog();
   const localStr = whenDate.toLocaleString("en-AU", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
   });
   log.push({ title, category, ts: whenDate.getTime(), local: localStr });
   saveCompletionLog(log);
}

export function lastCompletionFor(title) {
   const log = loadCompletionLog().filter(x => x && x.title === title && typeof x.ts === "number");
   if (!log.length) return null;
   return log.sort((a, b) => b.ts - a.ts)[0];
}

export function seedManualCompletionsOnce() {
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

export async function fetchServerHistory() {
    try {
       if (!supabase) {
          serverHistoryCache = loadCompletionLog();
          _rebuildLegacyHistory(serverHistoryCache);
          return serverHistoryCache;
       }
 
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

export async function appendServerHistory(title, whenDate, category = null) {
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

export async function deleteCompletionById(id) {
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

export async function deleteAllCompletionsForTitle(title) {
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
export function calculateStreak(isoStrings) {
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

export async function toggleHistoryPanel() {
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

// Global exposure
// We only expose a few functions to window that are used directly in on-clicks in index.html (if any)
// or by legacy wiring that expects them on window
window.deleteCompletionById = deleteCompletionById;
window.deleteAllCompletionsForTitle = deleteAllCompletionsForTitle;
window.calculateStreak = calculateStreak;
window.appendServerHistory = appendServerHistory;
window.seedManualCompletionsOnce = seedManualCompletionsOnce;
window.fetchServerHistory = fetchServerHistory;

// To allow UI components access
export { COMPLETION_KEY };
