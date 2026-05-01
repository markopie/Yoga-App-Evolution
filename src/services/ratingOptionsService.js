// src/services/ratingOptionsService.js
//
// Fetches completion rating options from Supabase dynamically.
// Supabase is the single source of truth — no fallback defaults.

import { supabase } from "./supabaseClient.js";

/**
 * Fetch active rating options from Supabase.
 * @returns {Promise<Array<{rating: number, feedback_key: string, label: string, subtitle: string|null, emoji: string|null, progression_score: number}>>}
 * @throws {Error} If Supabase is unavailable or the query fails.
 */
export async function fetchRatingOptions() {
  if (!supabase) {
    throw new Error("Supabase client is not available.");
  }

  const { data, error } = await supabase
    .from('completion_rating_options')
    .select('rating, feedback_key, label, subtitle, emoji, progression_score')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch rating options: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("No active rating options found in the database.");
  }

  return data;
}
