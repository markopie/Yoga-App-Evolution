export const CURRICULA = [
    {
        slug: 'iyengar_integrated_master_path_testing_v2',
        name: 'Integrated Iyengar Practice Path',
        type: 'book',
        isDefault: true,
        enabled: true,
    },
    {
        slug: 'iyengar_combined_school_year_v1',
        name: 'Integrated Iyengar School-Year Path',
        type: 'combined',
        isDefault: false,
        enabled: true,
    },
];

export const CURRICULUM_SELECTION_STORAGE_KEY = 'yogaEvolution.selectedCurriculumSlug';

export const DEFAULT_CURRICULUM = CURRICULA.find((item) => item.isDefault) || CURRICULA[0];
export const ACTIVE_CURRICULUM_SLUG = DEFAULT_CURRICULUM.slug;
export const ACTIVE_CURRICULUM_NAME = DEFAULT_CURRICULUM.name;

const enabledCurricula = () => CURRICULA.filter((item) => item.enabled !== false);

export function getCurriculumBySlug(slug) {
    return enabledCurricula().find((item) => item.slug === slug) || DEFAULT_CURRICULUM;
}

export function getSelectedCurriculumSlug() {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CURRICULUM.slug;
    const stored = window.localStorage.getItem(CURRICULUM_SELECTION_STORAGE_KEY);
    return getCurriculumBySlug(stored).slug;
}

export function getSelectedCurriculum() {
    return getCurriculumBySlug(getSelectedCurriculumSlug());
}

export function setSelectedCurriculumSlug(slug) {
    const selected = getCurriculumBySlug(slug);
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(CURRICULUM_SELECTION_STORAGE_KEY, selected.slug);
        window.dispatchEvent(new CustomEvent('curriculum-selection-changed', { detail: selected }));
    }
    return selected;
}

export function getSelectedCurriculumName() {
    return getSelectedCurriculum().name;
}
