// src/services/ratingOptionsService.js
//
// Fetches completion rating options from Supabase dynamically.
// Supabase is the single source of truth — no fallback defaults.

import { supabase } from "./supabaseClient.js";

const CACHE_KEY = 'yoga_completion_rating_options_v1';
let ratingOptionsCache = null;

function readCachedRatingOptions() {
  if (ratingOptionsCache) return ratingOptionsCache;
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    ratingOptionsCache = parsed;
    return ratingOptionsCache;
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    return null;
  }
}

function writeCachedRatingOptions(options) {
  ratingOptionsCache = options;
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(options));
  } catch {
    // Rating options can always be fetched again; storage failures are non-blocking.
  }
}

/**
 * Fetch active rating options from Supabase.
 * @returns {Promise<Array<{rating: number, feedback_key: string, label: string, subtitle: string|null, emoji: string|null, progression_score: number}>>}
 * @throws {Error} If Supabase is unavailable or the query fails.
 */
export async function fetchRatingOptions() {
  const cachedOptions = readCachedRatingOptions();
  if (cachedOptions) return cachedOptions;

  if (!supabase) {
    throw new Error("Supabase client is not available.");
  }

  let data;
  let error;

  try {
    const result = await supabase
      .from('completion_rating_options')
      .select('rating, feedback_key, label, subtitle, emoji, progression_score')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    const fallbackOptions = readCachedRatingOptions();
    if (fallbackOptions) return fallbackOptions;
    throw fetchError;
  }

  if (error) {
    const fallbackOptions = readCachedRatingOptions();
    if (fallbackOptions) return fallbackOptions;
    throw new Error(`Failed to fetch rating options: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("No active rating options found in the database.");
  }

  writeCachedRatingOptions(data);
  return data;
}
