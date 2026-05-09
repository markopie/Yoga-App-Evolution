export function resumeCourseId(course) {
    const id = course?.supabaseId ?? course?.id;
    return id === undefined || id === null || id === "" ? "" : String(id);
}

export function buildResumeState({
    currentSequence,
    sequenceIdx,
    poseIdx,
    focusDuration,
    completionTracker,
    timestamp = Date.now(),
}) {
    const sequenceId = resumeCourseId(currentSequence);
    return {
        sequenceIdx: sequenceIdx || "",
        sequenceId,
        poseIdx,
        sequenceTitle: currentSequence?.title || "",
        focusDuration,
        completionTracker,
        timestamp,
    };
}

export function resolveResumeCourse(courses, state) {
    const courseList = Array.isArray(courses) ? courses : [];
    const savedId = state?.sequenceId;

    if (savedId !== undefined && savedId !== null && savedId !== "") {
        const stableIndex = courseList.findIndex(course => resumeCourseId(course) === String(savedId));
        if (stableIndex >= 0) {
            return { course: courseList[stableIndex], index: stableIndex };
        }
    }

    const legacyIndex = Number.parseInt(state?.sequenceIdx, 10);
    if (Number.isInteger(legacyIndex) && legacyIndex >= 0 && legacyIndex < courseList.length) {
        return { course: courseList[legacyIndex], index: legacyIndex };
    }

    return { course: null, index: -1 };
}
