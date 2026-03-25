// src/store/state.js
// Centralized state manager for the application

export const globalState = {
    courses: [],
    sequences: [],
    asanaLibrary: {},
    plateGroups: {},
    serverAudioFiles: [],
    idAliases: {},
    
    // Playback State
    activePlaybackList: [],
    currentSequence: null,
    currentIndex: 0,
    currentAudio: null,
    currentSide: "right",
    needsSecondSide: false,
    completionTracker: {}, // Maps index to seconds
    
    // System State
    wakeLock: null,
    wakeLockVisibilityHooked: false,
    draft: []
};

/**
 * TRACKER: Internal state object to store seconds spent per pose index
 * Format: { 0: 30, 1: 45, ... }
 */
window.completionTracker = {};

export function resetCompletionTracker() {
    globalState.completionTracker = {};
    window.completionTracker = globalState.completionTracker;
}

/**
 * Updates the completion state for a specific pose node and saves to cache.
 */
export function updateNodeCompletion(index, seconds) {
    if (index === undefined || index === null) return;
    
    if (!window.completionTracker[index]) {
        window.completionTracker[index] = 0;
    }
    
    // Increment the active time
    window.completionTracker[index] += seconds;
    
    // Piggyback on your existing resume state cache
    try {
        const existingState = localStorage.getItem("yoga_resume_state_v2");
        if (existingState) {
            const stateObj = JSON.parse(existingState);
            stateObj.completionTracker = window.completionTracker; // Inject our data
            localStorage.setItem("yoga_resume_state_v2", JSON.stringify(stateObj));
        }
    } catch (e) {
        console.warn("Could not save live progress to local cache", e);
    }
}

// Setters
export function setCourses(newCourses) {
    globalState.courses = newCourses;
    window.courses = newCourses;
}

export function setSequences(newSequences) {
    globalState.sequences = newSequences;
}

export function setAsanaLibrary(newLib) {
    globalState.asanaLibrary = newLib;
    window.asanaLibrary = newLib;
}

export function setPlateGroups(newGroups) {
    globalState.plateGroups = newGroups;
}

export function setServerAudioFiles(files) {
    globalState.serverAudioFiles = files;
    window.serverAudioFiles = files;
}

export function setIdAliases(aliases) {
    globalState.idAliases = aliases;
    window.idAliases = aliases;
}

export function setActivePlaybackList(list) {
    globalState.activePlaybackList = list;
    window.activePlaybackList = list;
}

export function setCurrentSequence(sequence) {
    globalState.currentSequence = sequence;
    window.currentSequence = sequence;
}

export function setCurrentIndex(index) {
    globalState.currentIndex = index;
    window.currentIndex = index;
}

export function setCurrentAudio(audio) {
    globalState.currentAudio = audio;
}

export function setCurrentSide(side) {
    globalState.currentSide = side;
}

export function setNeedsSecondSide(needs) {
    globalState.needsSecondSide = needs;
}

// Getters
export function getCourses() { return globalState.courses; }
export function getSequences() { return globalState.sequences; }
export function getAsanaLibrary() { return globalState.asanaLibrary; }
export function getActivePlaybackList() { return globalState.activePlaybackList; }
export function getCurrentSequence() { return globalState.currentSequence; }
export function getCurrentIndex() { return globalState.currentIndex; }
export function getCurrentSide() { return globalState.currentSide; }
export function getNeedsSecondSide() { return globalState.needsSecondSide; }
export function getCompletionTracker() { return window.completionTracker; }

// Window binding for legacy interoperability
Object.assign(window, {
    globalState,
    updateNodeCompletion,
    resetCompletionTracker,
    getCompletionTracker,
    getCurrentIndex, // Ensure this is available for your timer hook
    setCourses,
    setSequences,
    setAsanaLibrary,
    setPlateGroups,
    setServerAudioFiles,
    setIdAliases,
    setActivePlaybackList,
    setCurrentSequence,
    setCurrentIndex,
    setCurrentAudio,
    setCurrentSide,
    setNeedsSecondSide
});