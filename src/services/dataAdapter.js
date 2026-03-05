import { supabase } from './supabaseClient.js';

/**
 * Fetches all system courses from the database.
 * Future refactor: Move the data mapping/parsing logic into this function.
 */
export async function fetchCourses() {
    return await supabase.from('courses').select('*');
}

/**
 * Fetches the global asana library from the database.
 * Future refactor: Move the ID normalization and object building into this function.
 */
export async function fetchAsanas() {
    return await supabase.from('asanas').select('*');
}
