import { supabase } from './supabaseClient.js';

/**
 * Parses a "Main > Sub" string, checks the DB, and creates missing relational categories.
 * Returns the sub_category_id to be linked to the sequence.
 */
export async function getOrCreateSubCategoryId(fullCategoryString) {
    if (!fullCategoryString) return null;

    const [authorPart, subPart] = fullCategoryString.split('>').map(s => s.trim());
    const mainName = authorPart || "General";
    const subName = subPart || "General";

    // 1. Get or Create the Main Category (Author/Brand)
    let { data: cat, error: catErr } = await supabase
        .from('course_categories')
        .select('id')
        .eq('name', mainName)
        .maybeSingle();

    if (catErr) throw new Error(`Category lookup failed: ${catErr.message}`);

    if (!cat) {
        const { data: newCat, error: newCatErr } = await supabase
            .from('course_categories')
            .insert({ name: mainName })
            .select()
            .single();
        
        if (newCatErr) throw new Error(`Failed to create new category: ${newCatErr.message}`);
        cat = newCat;
    }

    // 2. Get or Create the Sub-Category (Course/Level)
    let { data: sub, error: subErr } = await supabase
        .from('course_sub_categories')
        .select('id')
        .eq('category_id', cat.id)
        .eq('name', subName)
        .maybeSingle();

    if (subErr) throw new Error(`Sub-category lookup failed: ${subErr.message}`);

    if (!sub) {
        const { data: newSub, error: newSubErr } = await supabase
            .from('course_sub_categories')
            .insert({ category_id: cat.id, name: subName })
            .select()
            .single();
            
        if (newSubErr) throw new Error(`Failed to create new sub-category: ${newSubErr.message}`);
        sub = newSub;
    }

    return sub.id;
}

/**
 * Safely saves or updates a course, resolving category IDs automatically.
 */
export async function saveSequence(payload, knownId = null) {
    const subCategoryId = await getOrCreateSubCategoryId(payload.category);
    
    // Logic Architect Note: Ensure user_id is explicitly present
    if (!payload.user_id) {
        throw new Error("Security Violation: Cannot save sequence without a valid user_id.");
    }

    const dbPayload = {
        title: payload.title,
        sequence_json: payload.sequence_json,
        sub_category_id: subCategoryId, 
        last_edited: payload.last_edited,
        user_id: payload.user_id, // Mandatory for the new RLS check
        condition_notes: payload.condition_notes,
        is_alias: payload.is_alias,
        redirect_id: payload.redirect_id
    };

    if (payload.sequence_text !== undefined) dbPayload.sequence_text = payload.sequence_text;
    
    // Logic Architect Note: is_system should ONLY be allowed if the user has admin roles
    if (payload.is_system !== undefined) dbPayload.is_system = payload.is_system;

    // 1. Direct Update via knownId
    if (knownId) {
        const { error } = await supabase
            .from('courses')
            .update(dbPayload)
            .eq('id', knownId)
            .eq('user_id', payload.user_id); // 🛡️ CRITICAL: Only update if user owns it
            
        if (error) throw error;
        return { id: knownId };
    } 

    // 2. Ownership-Aware Upsert (Check title AND user_id)
    const { data: existing, error: selErr } = await supabase
        .from('courses')
        .select('id')
        .eq('title', dbPayload.title)
        .eq('sub_category_id', subCategoryId)
        .eq('user_id', payload.user_id) // 🛡️ CRITICAL: Don't overwrite other users' titles
        .maybeSingle();
        
    if (selErr) throw selErr;

    if (existing) {
        const { error } = await supabase
            .from('courses')
            .update(dbPayload)
            .eq('id', existing.id)
            .eq('user_id', payload.user_id); // 🛡️ CRITICAL Safety redundancy
            
        if (error) throw error;
        return { id: existing.id };
    }

    // 3. Fresh Insert
    const { data: inserted, error: insErr } = await supabase
        .from('courses')
        .insert([dbPayload])
        .select('id')
        .single();
        
    if (insErr) throw insErr;
    return { id: inserted.id };
}
/**
 * Safely finds or creates an Asana Category and returns its ID.
 */
export async function getOrCreateAsanaCategoryId(categoryName) {
    if (!categoryName) return null;
    const cleanName = categoryName.trim();

    // 1. Try to find existing category
    let { data: cat, error: catErr } = await supabase
        .from('asana_categories')
        .select('id')
        .eq('name', cleanName)
        .maybeSingle();

    if (catErr) throw new Error(`Asana category lookup failed: ${catErr.message}`);

    // 2. If it doesn't exist, create it
    if (!cat) {
        const { data: newCat, error: insErr } = await supabase
            .from('asana_categories')
            .insert({ name: cleanName })
            .select()
            .single();
            
        if (insErr) throw new Error(`Failed to create asana category: ${insErr.message}`);
        cat = newCat;
    }

    return cat.id;
}