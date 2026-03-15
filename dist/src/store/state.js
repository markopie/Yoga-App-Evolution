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

    
    // System State
    wakeLock: null,
    wakeLockVisibilityHooked: false,
    draft: []
};

// Setters to allow updating state while preserving references
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

// Window binding for legacy interoperability
window.globalState = globalState;
