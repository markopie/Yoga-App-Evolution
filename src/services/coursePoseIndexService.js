import { supabase } from './supabaseClient.js';
import { normalisePoseId } from '../utils/poseId.js';

export async function fetchCourseIdsByPoseId(poseId) {
    const target = normalisePoseId(poseId);
    if (!target) return new Set();

    if (!supabase) {
        throw new Error('Supabase client is not available.');
    }

    const { data, error } = await supabase
        .from('course_pose_index')
        .select('course_id')
        .eq('pose_id', target)
        .eq('source_type', 'direct');

    if (error) {
        throw new Error(`Failed to fetch course pose index: ${error.message}`);
    }

    return new Set((data || []).map(row => String(row.course_id)));
}
