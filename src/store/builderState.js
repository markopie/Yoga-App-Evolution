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

export function addPoseToBuilder(poseData) {
    if (!poseData.holdTier) poseData.holdTier = 'standard';
    builderState.poses.push(poseData);
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