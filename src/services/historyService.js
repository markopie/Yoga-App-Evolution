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

function sumPoseMinutes(poses = []) {
   if (!Array.isArray(poses) || !poses.length) return null;
   const totalSeconds = poses.reduce((acc, pose) => {
      const seconds = typeof window.getPosePillTime === 'function'
         ? window.getPosePillTime(pose)
         : Number(pose?.[1] || 0);
      return acc + (Number.isFinite(seconds) ? seconds : 0);
   }, 0);
   return Math.round((totalSeconds / 60) * 100) / 100;
}

function buildDurationDialCompletionMetadata() {
   const sequence = window.currentSequence || null;
   const plannedList = sequence && typeof window.getExpandedPoses === 'function'
      ? window.getExpandedPoses(sequence)
      : sequence?.poses;
   const adjustedList = typeof window.getActivePlaybackList === 'function'
      ? window.getActivePlaybackList()
      : window.activePlaybackList;

   const plannedMinutes = sumPoseMinutes(plannedList);
   const adjustedMinutes = sumPoseMinutes(adjustedList);
   const scale = plannedMinutes && adjustedMinutes
      ? Math.round((adjustedMinutes / plannedMinutes) * 1000) / 1000
      : null;

   return {
      completed: true,
      duration_scale_used: scale,
      planned_duration_minutes: plannedMinutes,
      actual_adjusted_duration_minutes: adjustedMinutes,
   };
}

function stripDurationMetadata(payload) {
   const {
      completed,
      duration_scale_used,
      planned_duration_minutes,
      actual_adjusted_duration_minutes,
      ...legacyPayload
   } = payload;
   void completed;
   void duration_scale_used;
   void planned_duration_minutes;
   void actual_adjusted_duration_minutes;
   return legacyPayload;
}

function isMissingDurationMetadataColumnError(error) {
   const message = String(error?.message || error?.details || '');
   return [
      'completed',
      'duration_scale_used',
      'planned_duration_minutes',
      'actual_adjusted_duration_minutes',
   ].some(column => message.includes(column));
}

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

       if (!window.currentUserId) {
          serverHistoryCache = [];
          _rebuildLegacyHistory(serverHistoryCache);
          return serverHistoryCache;
       }
 
       let query = supabase
          .from('sequence_completions')
          .select('id, title, category, completed_at')
          .eq('user_id', window.currentUserId);

       const { data, error } = await query;
 
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
       serverHistoryCache = supabase ? [] : loadCompletionLog();
       _rebuildLegacyHistory(serverHistoryCache);
       return serverHistoryCache;
    }
}

export async function appendServerHistory(title, whenDate, category = null, durationSeconds = null, options = {}) {
   if (!supabase) {
      addCompletion(title, whenDate, category);
      return false;
   }

   if (!window.currentUserId) {
      console.error("Cannot save completion without a signed-in user.");
      return false;
   }

   try {
      const completionOptions = typeof options === 'string' ? { status: options } : (options || {});
      const completionItems = Array.isArray(completionOptions.completion_items)
         ? completionOptions.completion_items.filter(item => item && item.counts_for_source_completion !== false)
         : [];
      const durationMetadata = {
         ...buildDurationDialCompletionMetadata(),
         ...(completionOptions.duration_metadata || {}),
      };

      const buildPayload = (item = {}) => {
         const payload = {
            title: item.title || title,
            category: item.category || category,
            completed_at: whenDate.toISOString(),
            status: item.status || completionOptions.status || 'Completed',
            completed: durationMetadata.completed !== false,
         };

         const itemDuration = item.duration_seconds ?? durationSeconds;
         if (itemDuration !== null && itemDuration !== undefined && !isNaN(itemDuration)) {
            payload.duration_seconds = itemDuration;
         }
         if (completionOptions.notes !== undefined) payload.notes = completionOptions.notes;
         if (completionOptions.rating !== undefined) payload.rating = completionOptions.rating;
         if (completionOptions.difficulty_feedback !== undefined) payload.difficulty_feedback = completionOptions.difficulty_feedback;
         if (durationMetadata.duration_scale_used !== null && durationMetadata.duration_scale_used !== undefined) {
            payload.duration_scale_used = durationMetadata.duration_scale_used;
         }
         if (durationMetadata.planned_duration_minutes !== null && durationMetadata.planned_duration_minutes !== undefined) {
            payload.planned_duration_minutes = durationMetadata.planned_duration_minutes;
         }
         if (durationMetadata.actual_adjusted_duration_minutes !== null && durationMetadata.actual_adjusted_duration_minutes !== undefined) {
            payload.actual_adjusted_duration_minutes = durationMetadata.actual_adjusted_duration_minutes;
         }

         const sequenceId = item.sequence_id ?? completionOptions.sequence_id;
         if (sequenceId !== undefined && sequenceId !== null) {
            payload.sequence_id = sequenceId;
         }
         if (completionOptions.curriculum_node_id !== undefined && completionOptions.curriculum_node_id !== null) {
            payload.curriculum_node_id = completionOptions.curriculum_node_id;
         }
         payload.user_id = window.currentUserId;
         return payload;
      };

      const rows = completionItems.length
         ? completionItems.map(buildPayload)
         : [buildPayload()];

      let { data, error } = await supabase
         .from('sequence_completions')
         .insert(rows)
         .select();

      if (error && isMissingDurationMetadataColumnError(error)) {
         const legacyRows = rows.map(stripDurationMetadata);
         const retry = await supabase
            .from('sequence_completions')
            .insert(legacyRows)
            .select();
         data = retry.data;
         error = retry.error;
      }

      if (error) throw error;
      addCompletion(title, whenDate, category);
      await fetchServerHistory();
      
      if (data && data.length > 0) {
          window.pendingRatingCompletionIds = data.map(row => row.id);
          return data[0].id;
      }
      return true;
   } catch (e) {
      console.error("Failed to append to server history:", e);
      return false;
   }
}

export async function updateCompletionRating(id, rating) {
   if (!supabase || !id || !window.currentUserId) return false;
   try {
      const ratingIds = Array.isArray(window.pendingRatingCompletionIds) && window.pendingRatingCompletionIds.includes(id)
         ? window.pendingRatingCompletionIds
         : [id];
      const { error } = await supabase
         .from('sequence_completions')
         .update({ rating: rating })
         .in('id', ratingIds)
         .eq('user_id', window.currentUserId);
      if (error) throw error;
      if (Array.isArray(window.pendingRatingCompletionIds) && window.pendingRatingCompletionIds.includes(id)) {
         window.pendingRatingCompletionIds = null;
      }
      return true;
   } catch (e) {
      console.error("Failed to update rating:", e);
      return false;
   }
}

export async function deleteCompletionById(id) {
   if (!supabase || !id || !window.currentUserId) return false;
   try {
      const { error } = await supabase
         .from('sequence_completions')
         .delete()
         .eq('id', id)
         .eq('user_id', window.currentUserId);
      if (error) throw error;
      await fetchServerHistory();
      return true;
   } catch (e) {
      console.error("Failed to delete completion:", e);
      return false;
   }
}

export async function deleteAllCompletionsForTitle(title) {
   if (!supabase || !title || !window.currentUserId) return false;
   try {
      const { error } = await supabase
         .from('sequence_completions')
         .delete()
         .eq('title', title)
         .eq('user_id', window.currentUserId);
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
window.updateCompletionRating = updateCompletionRating;

// To allow UI components access
export { COMPLETION_KEY };
