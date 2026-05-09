export function ratingOverlayOptionsForCompletion(curriculumPractice) {
    if (!curriculumPractice?.curriculum_node_id) return {};

    return {
        afterRatingAction: "startTodayPractice",
        resetAfterRating: false,
    };
}
