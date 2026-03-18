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
    // 1. Resolve the relational ID using our new helper
    const subCategoryId = await getOrCreateSubCategoryId(payload.category);

    // 2. Build the exact payload for the database
    const dbPayload = {
        title: payload.title,
        sequence_text: payload.sequence_text,
        sub_category_id: subCategoryId, // 🌟 THE ONLY CATEGORY LINK
        last_edited: payload.last_edited,
        user_id: payload.user_id
    };

    if (payload.is_system !== undefined) {
        dbPayload.is_system = payload.is_system;
    }

    // 3. Execute the Update or Insert
    if (knownId) {
        const { error } = await supabase.from('courses').update(dbPayload).eq('id', knownId);
        if (error) throw error;
        return { id: knownId };
    } 

    const { data: existing, error: selErr } = await supabase
        .from('courses')
        .select('id')
        .eq('title', dbPayload.title)
        .eq('sub_category_id', subCategoryId)
        .maybeSingle();
        
    if (selErr) throw selErr;

    if (existing) {
        const { error } = await supabase.from('courses').update(dbPayload).eq('id', existing.id);
        if (error) throw error;
        return { id: existing.id };
    }

    const { data: inserted, error: insErr } = await supabase
        .from('courses')
        .insert([dbPayload])
        .select('id')
        .single();
        
    if (insErr) throw insErr;
    
    return { id: inserted.id };
}