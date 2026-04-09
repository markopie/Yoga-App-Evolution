// ==========================================
// 🧠 BUILDER STATE (The Source of Truth)
// ==========================================

export const builderState = {
    poses: [],
    mode: "edit",
    editingCourseIndex: -1,
    editingSupabaseId: null,
    isViewMode: true, 
    activeRowSearchIdx: -1,
    showSanskrit: false,
    currentPlaybackMode: null
};

/**
 * Bulk updates props for selected rows.
 * @param {string} propKey - e.g., 'bandage'
 * @param {boolean} add - true to add, false to clear
 */


export function setPoseSide(index, targetSide) {
    if (!builderState.poses[index]) return;
    builderState.poses[index].side = targetSide; // targetSide will be 'L', 'R', or '' (Both)
}

export function isFlowSequence() {
    return builderState.currentPlaybackMode === 'flow';
}

// ==========================================
// 🛠️ STATE MUTATION METHODS
// These functions ONLY change data. They do NOT touch the DOM.
// ==========================================

/** Initializes state when opening a sequence */
export function setBuilderState(mode, targetId = null) {
    builderState.mode = mode;
    builderState.isViewMode = (mode !== "new" && mode !== "edit"); 
    builderState.editingSupabaseId = targetId;
    builderState.editingCourseIndex = -1;
    builderState.poses = [];
    builderState.currentPlaybackMode = null; 
}

/** Purely for the Drag and Drop logic */
export function movePoseToIndex(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const item = builderState.poses.splice(fromIdx, 1)[0];
    builderState.poses.splice(toIdx, 0, item);
}

/** Moves a pose up or down by one */
export function movePose(idx, dir) {
    if (idx + dir < 0 || idx + dir >= builderState.poses.length) return false;
    const temp = builderState.poses[idx];
    builderState.poses[idx] = builderState.poses[idx + dir];
    builderState.poses[idx + dir] = temp;
    return true;
}

export function removePose(idx) {
    if (idx >= 0 && idx < builderState.poses.length) {
        builderState.poses.splice(idx, 1);
        return true;
    }
    return false;
}

/** * Adds a pose to the builder. 
 * If atIndex is provided and >= 0, it inserts at that position (above the line).
 * Otherwise, it appends to the end.
 */
export function addPoseToBuilder(poseData, atIndex = -1) {
    if (!poseData.holdTier) poseData.holdTier = 'standard';
    
    if (atIndex >= 0 && atIndex <= builderState.poses.length) {
        // Insert above the specified index
        builderState.poses.splice(atIndex, 0, poseData);
    } else {
        // Default behavior: add to end
        builderState.poses.push(poseData);
    }
}

export function toggleSanskrit() {
    builderState.showSanskrit = !builderState.showSanskrit;
    return builderState.showSanskrit;
}

export function clearAmbiguity(idx) {
    if (builderState.poses[idx]) {
        builderState.poses[idx]._ambiguous = false;
        builderState.poses[idx]._alternatives = [];
    }
}