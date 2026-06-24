const TEST_USER = {
    id: 'browser-test-user',
    email: 'guest-browser-test@example.invalid',
    is_anonymous: true,
};

const ratingOptions = [
    { rating: 1, feedback_key: 'too_much', label: 'Too much', subtitle: 'Repeat this practice', emoji: null, progression_score: -2, sort_order: 1, is_active: true },
    { rating: 2, feedback_key: 'hard', label: 'Hard', subtitle: 'Repeat this practice', emoji: null, progression_score: -1, sort_order: 2, is_active: true },
    { rating: 3, feedback_key: 'steady', label: 'Steady', subtitle: 'Continue carefully', emoji: null, progression_score: 0, sort_order: 3, is_active: true },
    { rating: 4, feedback_key: 'good', label: 'Good', subtitle: 'Ready for the next one', emoji: null, progression_score: 1, sort_order: 4, is_active: true },
];

const courses = [
    {
        id: 101,
        title: 'Mock Standing Foundation',
        category: 'How to Use Yoga',
        sequence_json: [
            { type: 'pose', pose_id: '001', duration: 30, note: 'Stand evenly.' },
            { type: 'pose', pose_id: '002', duration: 30, note: 'Keep the breath quiet.' },
        ],
        course_sub_categories: { id: 1, name: 'Week 1', category_id: 10, course_categories: { id: 10, name: 'How to Use Yoga' } },
    },
    {
        id: 102,
        title: 'Mock Seated Foundation',
        category: 'How to Use Yoga',
        sequence_json: [
            { type: 'pose', pose_id: '003', duration: 30, note: 'Sit tall.' },
            { type: 'pose', pose_id: '004', duration: 30, note: 'Release the shoulders.' },
        ],
        course_sub_categories: { id: 1, name: 'Week 1', category_id: 10, course_categories: { id: 10, name: 'How to Use Yoga' } },
    },
    {
        id: 103,
        title: 'Mock Quiet Pranayama',
        category: 'Light on Pranayama',
        sequence_json: [
            { type: 'pose', pose_id: '005', duration: 30, note: 'Observe the breath.' },
        ],
        course_sub_categories: { id: 2, name: 'Course 1 (Preparatory)', category_id: 11, course_categories: { id: 11, name: 'Light on Pranayama' } },
    },
    {
        id: 104,
        title: 'Mock Combined Asana',
        category: 'Light on Yoga',
        sequence_json: [
            { type: 'pose', pose_id: '006', duration: 30, note: 'Steady legs.' },
        ],
        course_sub_categories: { id: 3, name: 'Course 1', category_id: 12, course_categories: { id: 12, name: 'Light on Yoga' } },
    },
];

const asanas = [
    { id: '001', name: 'Tadasana', english_name: 'Mountain Pose', sanskrit_name: 'Tadasana', asana_categories: { name: 'Standing' } },
    { id: '002', name: 'Utthita Hasta Padasana', english_name: 'Extended Hands and Feet Pose', sanskrit_name: 'Utthita Hasta Padasana', asana_categories: { name: 'Standing' } },
    { id: '003', name: 'Dandasana', english_name: 'Staff Pose', sanskrit_name: 'Dandasana', asana_categories: { name: 'Seated' } },
    { id: '004', name: 'Savasana', english_name: 'Corpse Pose', sanskrit_name: 'Savasana', asana_categories: { name: 'Restorative' } },
    { id: '005', name: 'Savasana Breath Observation', english_name: 'Breath Observation', sanskrit_name: 'Savasana', asana_categories: { name: 'Pranayama' } },
    { id: '006', name: 'Virabhadrasana II', english_name: 'Warrior II', sanskrit_name: 'Virabhadrasana II', asana_categories: { name: 'Standing' } },
];

const programCurriculum = [
    curriculumNode(9001, 1, 1, 1, 101, 'How to Use Yoga', 'How to Use Yoga', 'Week 1', 'Mock Standing Foundation', 'asana'),
    curriculumNode(9002, 1, 2, 2, 102, 'How to Use Yoga', 'How to Use Yoga', 'Week 1', 'Mock Seated Foundation', 'asana'),
    curriculumNode(9003, 1, 3, 3, 103, 'Light on Pranayama', 'Light on Pranayama', 'Course 1', 'Mock Quiet Pranayama', 'pranayama'),
    curriculumNode(9004, 1, 4, 4, 104, 'Light on Yoga', 'Light on Yoga', 'Course 1', 'Mock Combined Asana', 'asana', {
        practice_composition: [
            { role: 'primary_asana', sequence_id: 104, counts_for_source_completion: true, source_name: 'Light on Yoga', source_reference: 'Mock Combined Asana' },
            { role: 'appended_pranayama', sequence_id: 103, counts_for_source_completion: true, source_name: 'Light on Pranayama', source_reference: 'Mock Quiet Pranayama' },
        ],
        composed_total_duration_minutes: 3,
    }),
    curriculumNode(9005, 1, 5, 5, 101, 'How to Use Yoga', 'How to Use Yoga', 'Week 1', 'Mock Standing Review', 'asana', { counts_for_source_completion: false }),
    curriculumNode(9006, 1, 6, 6, 102, 'How to Use Yoga', 'How to Use Yoga', 'Week 1', 'Mock Seated Review', 'asana', { counts_for_source_completion: false }),
    recoveryNode(9007, 1, 7, 7, 'How to Use Yoga'),
    curriculumNode(9008, 2, 1, 8, 104, 'Light on Yoga', 'Light on Yoga', 'Course 1', 'Mock Full Practice', 'asana', { counts_for_source_completion: false }),
    recoveryNode(9009, 2, 7, 9, 'Light on Yoga'),
    curriculumNode(910011, 1, 1, 11, 101, 'How to Use Yoga', 'How to Use Yoga', 'Week 1', 'Mock Combined Curriculum Foundation', 'asana', {
        curriculum_slug: 'iyengar_combined_school_year_v1',
        program_name: 'Integrated Iyengar School-Year Path',
        progression_group_label: 'Term 1: Foundation & Orientation',
        practice_role: 'foundation',
        term_number: 1,
    }),
    curriculumNode(910012, 1, 2, 12, 102, 'Yoga The Iyengar Way', 'Yoga The Iyengar Way', 'Course 1', 'Mock Combined Curriculum Technical', 'asana', {
        curriculum_slug: 'iyengar_combined_school_year_v1',
        program_name: 'Integrated Iyengar School-Year Path',
        progression_group_label: 'Term 1: Foundation & Orientation',
        practice_role: 'technical',
        term_number: 1,
    }),
    recoveryNode(910017, 1, 7, 17, 'Integrated Iyengar School-Year Path', {
        curriculum_slug: 'iyengar_combined_school_year_v1',
        program_name: 'Integrated Iyengar School-Year Path',
        progression_group_label: 'Term 1: Foundation & Orientation',
        practice_role: 'rest',
        term_number: 1,
    }),
];

let session = null;
let completionId = 1;
let completions = [];
const authSubscribers = new Set();
let _signInShouldFail = false;

/** For tests only: make the next signInWithPassword call return an error. */
export function mockNextSignInFailure() {
    _signInShouldFail = true;
}

function curriculumNode(id, week, day, order, sequenceId, sourceName, sourceKey, sourceCourse, reference, track, extraPayload = {}) {
    const composition = extraPayload.practice_composition || [{
        role: track === 'pranayama' ? 'primary_pranayama' : 'primary_asana',
        sequence_id: sequenceId,
        counts_for_source_completion: extraPayload.counts_for_source_completion !== false,
        source_name: sourceName,
        source_reference: reference,
    }];

    return {
        id,
        curriculum_node_id: id,
        curriculum_slug: extraPayload.curriculum_slug || 'iyengar_integrated_master_path_testing_v2',
        program_name: extraPayload.program_name || 'Integrated Iyengar Practice Path',
        week_number: week,
        day_number: day,
        order_index: order,
        node_type: 'sequence',
        resolved_node_type: 'sequence',
        day_role: 'practice',
        recovery_type: null,
        is_visible: true,
        is_active: true,
        is_rest_day: false,
        sequence_id: sequenceId,
        resolved_sequence_id: sequenceId,
        resolved_course_title: reference,
        source_name: sourceName,
        source_key: sourceKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        source_course: sourceCourse,
        source_reference: reference,
        practice_track: track,
        intensity: track === 'pranayama' ? 'quiet' : 'moderate',
        primary_focus: track === 'pranayama' ? 'Pranayama' : 'Asana',
        estimated_minutes: extraPayload.composed_total_duration_minutes || 3,
        completion_requirement: 'attempt',
        level_number: Math.max(1, week),
        special_instructions: 'Browser harness practice node.',
        curriculum_payload: {
            total_duration_minutes: 3,
            progression_group_label: extraPayload.progression_group_label || sourceName,
            source_category: sourceName,
            practice_role: extraPayload.practice_role || 'practice',
            term_number: extraPayload.term_number || null,
            practice_composition: composition,
            ...extraPayload,
        },
    };
}

function recoveryNode(id, week, day, order, sourceName, extraPayload = {}) {
    return {
        id,
        curriculum_node_id: id,
        curriculum_slug: extraPayload.curriculum_slug || 'iyengar_integrated_master_path_testing_v2',
        program_name: extraPayload.program_name || 'Integrated Iyengar Practice Path',
        week_number: week,
        day_number: day,
        order_index: order,
        node_type: 'recovery',
        resolved_node_type: 'recovery',
        day_role: 'recovery',
        recovery_type: 'rest_day',
        is_visible: true,
        is_active: true,
        is_rest_day: true,
        sequence_id: null,
        resolved_sequence_id: null,
        source_name: sourceName,
        source_key: null,
        source_course: sourceName,
        source_reference: 'Weekly Recovery',
        practice_track: 'recovery',
        intensity: 'rest',
        primary_focus: 'Recovery',
        estimated_minutes: null,
        completion_requirement: 'acknowledge',
        level_number: Math.max(1, week),
        special_instructions: 'Rest or quiet Savasana only.',
        curriculum_payload: {
            progression_group_label: extraPayload.progression_group_label || sourceName,
            source_category: sourceName,
            practice_role: extraPayload.practice_role || 'rest',
            term_number: extraPayload.term_number || null,
            ...extraPayload,
        },
    };
}

function notifyAuth(event) {
    for (const callback of authSubscribers) callback(event, session);
}

function nextPractice(repeatNodeId, curriculumSlug = 'iyengar_integrated_master_path_testing_v2') {
    const curriculumRows = programCurriculum.filter((node) => node.curriculum_slug === curriculumSlug);
    if (repeatNodeId != null) {
        return curriculumRows.find((node) => String(node.id) === String(repeatNodeId)) || curriculumRows[0];
    }
    const completedIds = new Set(completions.map((row) => Number(row.curriculum_node_id)).filter(Boolean));
    return curriculumRows.find((node) => !completedIds.has(Number(node.id))) || curriculumRows[0];
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

class Query {
    constructor(table, operation = 'select', payload = null) {
        this.table = table;
        this.operation = operation;
        this.payload = payload;
        this.filters = [];
        this.notFilters = [];
        this.orders = [];
        this.limitValue = null;
        this.singleMode = false;
        this.maybeSingleMode = false;
        this.selected = null;
    }

    select(columns) { this.selected = columns || '*'; return this; }
    eq(column, value) { this.filters.push({ column, op: 'eq', value }); return this; }
    lt(column, value) { this.filters.push({ column, op: 'lt', value }); return this; }
    in(column, values) { this.filters.push({ column, op: 'in', value: values }); return this; }
    not(column, op, value) { this.notFilters.push({ column, op, value }); return this; }
    order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
    limit(value) { this.limitValue = value; return this; }
    single() { this.singleMode = true; return this; }
    maybeSingle() { this.maybeSingleMode = true; return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }

    async execute() {
        try {
            if (this.operation === 'insert') return { data: this.insertRows(), error: null };
            if (this.operation === 'update') return { data: this.updateRows(), error: null };
            if (this.operation === 'delete') return { data: this.deleteRows(), error: null };
            const rows = this.applyQuery(getTableRows(this.table));
            const data = this.singleMode || this.maybeSingleMode ? (rows[0] || null) : rows;
            return { data: clone(data), error: null };
        } catch (error) {
            return { data: null, error };
        }
    }

    applyQuery(rows) {
        let result = [...rows];
        for (const filter of this.filters) {
            result = result.filter((row) => {
                if (filter.op === 'eq') return row[filter.column] === filter.value || String(row[filter.column]) === String(filter.value);
                if (filter.op === 'lt') return Number(row[filter.column]) < Number(filter.value);
                if (filter.op === 'in') return (filter.value || []).map(String).includes(String(row[filter.column]));
                return true;
            });
        }
        for (const filter of this.notFilters) {
            if (filter.op === 'is' && filter.value === null) {
                result = result.filter((row) => row[filter.column] !== null && row[filter.column] !== undefined);
            }
        }
        for (const order of this.orders) {
            result.sort((a, b) => {
                const cmp = String(a[order.column] ?? '').localeCompare(String(b[order.column] ?? ''), undefined, { numeric: true });
                return order.ascending ? cmp : -cmp;
            });
        }
        if (this.limitValue != null) result = result.slice(0, Number(this.limitValue));
        return result;
    }

    insertRows() {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (this.table === 'sequence_completions') {
            const inserted = rows.map((row) => ({ id: completionId++, ...row }));
            completions.push(...inserted);
            return clone(inserted);
        }
        return clone(rows);
    }

    updateRows() {
        if (this.table !== 'sequence_completions') return [];
        const rows = this.applyQuery(completions);
        rows.forEach((row) => Object.assign(row, this.payload));
        return clone(rows);
    }

    deleteRows() {
        if (this.table !== 'sequence_completions') return [];
        const removeIds = new Set(this.applyQuery(completions).map((row) => row.id));
        completions = completions.filter((row) => !removeIds.has(row.id));
        return [];
    }
}

function getTableRows(table) {
    if (table === 'courses') return courses;
    if (table === 'asanas') return asanas;
    if (table === 'stages') return [];
    if (table === 'props') return [];
    if (table === 'program_curriculum') return programCurriculum;
    if (table === 'sequence_completions') return completions;
    if (table === 'completion_rating_options') return ratingOptions;
    return [];
}

export function createBrowserTestSupabaseClient() {
    return {
        auth: {
            async getSession() { return { data: { session }, error: null }; },
            async signInAnonymously() {
                session = { user: TEST_USER, access_token: 'browser-test-token' };
                notifyAuth('SIGNED_IN');
                return { data: { session, user: TEST_USER }, error: null };
            },
            async signInWithPassword() {
                if (_signInShouldFail) {
                    _signInShouldFail = false;
                    const err = Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' });
                    return { data: {}, error: err };
                }
                return this.signInAnonymously();
            },
            async signUp() { return this.signInAnonymously(); },
            async signInWithOAuth() { return { data: {}, error: null }; },
            async resetPasswordForEmail() { return { data: {}, error: null }; },
            async updateUser() { return { data: { user: TEST_USER }, error: null }; },
            async signOut() {
                session = null;
                notifyAuth('SIGNED_OUT');
                return { error: null };
            },
            onAuthStateChange(callback) {
                authSubscribers.add(callback);
                if (session) setTimeout(() => callback('INITIAL_SESSION', session), 0);
                return { data: { subscription: { unsubscribe: () => authSubscribers.delete(callback) } } };
            },
        },
        from(table) {
            return {
                select(columns) { return new Query(table).select(columns); },
                insert(payload) { return new Query(table, 'insert', payload); },
                update(payload) { return new Query(table, 'update', payload); },
                delete() { return new Query(table, 'delete'); },
            };
        },
        async rpc(name, params = {}) {
            if (name === 'get_today_curriculum_practice') {
                return { data: clone(nextPractice(params.p_repeat_node_id, params.p_curriculum_slug)), error: null };
            }
            return { data: null, error: new Error(`Browser test mock does not implement rpc ${name}`) };
        },
    };
}

export const browserTestSupabaseConfig = {
    url: 'mock://browser-test',
    target: 'browser-test',
    keyType: 'mock',
    storageKey: 'yoga-evolution-browser-test-auth',
};
