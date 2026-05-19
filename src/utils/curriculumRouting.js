export function prettifyCurriculumToken(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isRecoveryNode(practice) {
    return practice?.node_type === 'recovery'
        || practice?.day_role === 'recovery'
        || practice?.resolved_node_type === 'recovery';
}

export function isRestOrRecoveryNode(practice) {
    return practice?.is_rest_day
        || practice?.node_type === 'rest'
        || practice?.resolved_node_type === 'rest'
        || isRecoveryNode(practice);
}

export function isSequenceReady(practice) {
    return practice?.resolved_node_type === 'sequence' && !!practice?.resolved_sequence_id;
}

export function nonSequenceNodeTitle(practice) {
    if (isRecoveryNode(practice)) {
        const recovery = practice.recovery_type ? ` - ${prettifyCurriculumToken(practice.recovery_type)}` : '';
        return `Recovery Day${recovery}`;
    }
    if (practice?.node_type === 'instruction') return 'Instruction Day';
    if (practice?.node_type === 'choice') return 'Choice Day';
    if (practice?.node_type === 'revision') return 'Revision Day';
    if (practice?.node_type === 'consolidation') return 'Consolidation Day';
    if (practice?.node_type === 'assessment') return 'Assessment Day';
    return prettifyCurriculumToken(practice?.day_role || practice?.node_type || 'Curriculum Day');
}
