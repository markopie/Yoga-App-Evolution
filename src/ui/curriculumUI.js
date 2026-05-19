import { supabase } from '../services/supabaseClient.js';
import { $ } from '../utils/dom.js';
import { playbackEngine } from '../playback/timer.js';
import { isConfiguredAdminEmail } from '../config/appConfig.js';
import { ACTIVE_CURRICULUM_SLUG } from '../config/curriculumConfig.js';
import {
    isRestOrRecoveryNode,
    isSequenceReady,
    nonSequenceNodeTitle,
    prettifyCurriculumToken,
} from '../utils/curriculumRouting.js';

const CURRICULUM_SLUG = ACTIVE_CURRICULUM_SLUG;

function isLocalDev() {
    const h = window.location.hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(h) || h.endsWith('.webcontainer-api.io');
}

function isDevOrAdmin() {
    return isLocalDev() || !!window.adminMode || isConfiguredAdminEmail(window.currentUserEmail);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function valueText(value) {
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
    if (value && typeof value === 'object') return JSON.stringify(value);
    return value ?? 'None';
}

function renderField(label, value) {
    return `
        <div class="curriculum-practice-field">
            <div class="curriculum-practice-field__label">${escapeHtml(label)}</div>
            <div class="curriculum-practice-field__value">${escapeHtml(valueText(value))}</div>
        </div>
    `;
}

function formatDuration(value) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const minutes = Math.round(duration);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function renderOverviewItem(label, value) {
    if (value == null || value === '') return '';
    return `
        <div class="curriculum-practice-overview__item">
            <span class="curriculum-practice-overview__label">${escapeHtml(label)}</span>
            <span class="curriculum-practice-overview__value">${escapeHtml(valueText(value))}</span>
        </div>
    `;
}

function normalisePracticeResult(data) {
    if (Array.isArray(data)) return data[0] ?? null;
    return data ?? null;
}

function findCourseById(sequenceId) {
    return (window.courses || []).find((course) =>
        String(course.supabaseId || course.id) === String(sequenceId)
    );
}

function roleLabel(role) {
    const labels = {
        primary_asana: 'Asana',
        appended_pranayama: 'Short Pranayama',
        quiet_asana: 'Quiet Asana',
        light_asana: 'Light Asana',
        primary_pranayama: 'Pranayama',
    };
    return labels[role] || String(role || 'Practice').replace(/_/g, ' ');
}

function getPracticeComposition(practice) {
    const payload = practice?.curriculum_payload || {};
    if (Array.isArray(payload.practice_composition) && payload.practice_composition.length) {
        return payload.practice_composition;
    }
    if (practice?.resolved_sequence_id) {
        return [{
            role: practice.practice_track === 'pranayama' ? 'primary_pranayama' : 'primary_asana',
            sequence_id: practice.resolved_sequence_id,
            counts_for_source_completion: true,
        }];
    }
    return [];
}

function enrichPracticeComposition(practice) {
    return getPracticeComposition(practice).map((part, index) => {
        const course = findCourseById(part.sequence_id);
        return {
            ...part,
            part_number: index + 1,
            title: part.title || course?.title || `Sequence ${part.sequence_id}`,
            category: part.category || course?.category || '',
            course,
            counts_for_source_completion: part.counts_for_source_completion !== false,
        };
    });
}

function compositionSummary(parts) {
    if (parts.length <= 1) return '';
    return parts
        .map(part => `Part ${part.part_number}: ${roleLabel(part.role)} — ${part.title}`)
        .join(' | ');
}

function compositionDurationMinutes(parts) {
    if (typeof window.getExpandedPoses !== 'function' || typeof window.getPosePillTime !== 'function') return null;
    let totalSeconds = 0;
    parts.forEach((part) => {
        if (!part.course) return;
        const expanded = window.getExpandedPoses(part.course);
        expanded.forEach((pose) => {
            totalSeconds += window.getPosePillTime(pose, part.course);
        });
    });
    return Math.round((totalSeconds / 60) * 100) / 100;
}

function completionItemsForPractice(practice = window.currentCurriculumPractice) {
    return (practice?.composition_parts || enrichPracticeComposition(practice))
        .filter(part => part.counts_for_source_completion !== false)
        .map(part => ({
            sequence_id: part.sequence_id,
            title: part.title,
            category: part.category,
            counts_for_source_completion: true,
        }));
}

function updateCurriculumLibraryLock() {
    const locked = !!window.currentCurriculumPractice?.curriculum_node_id;
    const note = $('manualLibraryModeNote');
    const panel = $('manualLibraryPanel');
    const exitBtn = $('exitCurriculumPracticeBtn');
    const controls = [
        $('categoryFilter'),
        $('sequenceSelect'),
        $('poseSequenceFilter'),
        $('clearPoseSequenceFilter'),
    ].filter(Boolean);

    controls.forEach((control) => {
        control.disabled = locked;
    });

    if (note) {
        note.textContent = locked
            ? 'Curriculum practice is active. Library browsing is paused.'
            : 'Manual browsing is separate from Today\'s Practice.';
        note.classList.toggle('manual-library-mode-note--locked', locked);
    }

    if (panel && locked) {
        panel.open = false;
    }

    if (exitBtn) {
        exitBtn.style.display = locked ? '' : 'none';
    }
}

function exitCurriculumPractice() {
    const summary = $('curriculumPracticeSummary');
    const overview = $('curriculumPracticeOverview');
    const details = $('curriculumPracticeDetails');
    const detailsToggle = $('curriculumDetailsToggleBtn');
    const markBtn = $('markCurriculumCompleteBtn');
    const undoBtn = $('undoCurriculumCompletionBtn');

    if (typeof window.stopTimer === 'function') window.stopTimer();
    if (playbackEngine && typeof playbackEngine.resetPracticeTimer === 'function') {
        playbackEngine.resetPracticeTimer();
    }
    if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();

    window.currentCurriculumPractice = null;
    window.isBriefingActive = false;
    window.pendingSequence = null;
    window.currentSequence = null;
    window.activePlaybackList = null;
    window.currentIndex = 0;

    const filter = $('categoryFilter');
    const selector = $('sequenceSelect');
    if (filter) filter.value = 'ALL';
    if (typeof window.renderCourseUI === 'function') window.renderCourseUI();
    if (selector) selector.value = '';

    if (summary) summary.textContent = 'Ready when you are.';
    if (overview) {
        overview.innerHTML = '';
        overview.style.display = 'none';
    }
    if (details) {
        details.innerHTML = '';
        details.style.display = 'none';
    }
    if (detailsToggle) {
        detailsToggle.style.display = 'none';
        detailsToggle.setAttribute('aria-expanded', 'false');
        detailsToggle.textContent = 'Details';
    }
    if (markBtn) markBtn.style.display = 'none';
    if (undoBtn) undoBtn.style.display = 'none';
    if ($('statusText')) $('statusText').textContent = 'Ready to Start';
    if ($('poseTimer')) $('poseTimer').textContent = '–';
    if ($('poseName')) $('poseName').textContent = 'Select a sequence';
    if ($('poseInstructions')) $('poseInstructions').textContent = '';
    if ($('timeRemainingDisplay')) $('timeRemainingDisplay').textContent = '--:--';
    if ($('timeTotalDisplay')) $('timeTotalDisplay').textContent = '--:--';
    if ($('timeProgressFill')) $('timeProgressFill').style.width = '0%';
    if (typeof window.updateNextBtnText === 'function') window.updateNextBtnText();

    updateCurriculumLibraryLock();
}

function renderPracticeDetails(practice) {
    const details = $('curriculumPracticeDetails');
    const overview = $('curriculumPracticeOverview');
    const summary = $('curriculumPracticeSummary');
    const detailsToggle = $('curriculumDetailsToggleBtn');
    const devCompleteBtn = $('markCurriculumCompleteBtn');
    const undoBtn = $('undoCurriculumCompletionBtn');
    const resetTestBtn = $('resetCurriculumTestProgressBtn');
    if (!details || !summary || !practice) return;

    const payload = practice.curriculum_payload || {};
    const title = practice.resolved_course_title || practice.source_reference || nonSequenceNodeTitle(practice);
    const parts = enrichPracticeComposition(practice);
    const composedSummary = compositionSummary(parts);
    const totalDuration = parts.length > 1 ? compositionDurationMinutes(parts) : payload.total_duration_minutes;
    const durationLabel = formatDuration(totalDuration);
    summary.textContent = composedSummary
        ? `Week ${practice.week_number}, Day ${practice.day_number}: ${composedSummary}`
        : `Week ${practice.week_number}, Day ${practice.day_number}: ${title}`;

    if (overview) {
        const sourceLabel = [practice.source_name, practice.source_course]
            .filter(Boolean)
            .join(' - ');
        const overviewItems = [
            ['When', `Week ${practice.week_number}, Day ${practice.day_number}`],
            ['Practice', composedSummary || title],
            ['Source', sourceLabel || practice.source_reference],
            ['Duration', durationLabel],
            ['Focus', practice.primary_focus],
            ['Role', practice.day_role],
            ['Recovery', practice.recovery_type && prettifyCurriculumToken(practice.recovery_type)],
        ];
        overview.innerHTML = overviewItems.map(([label, value]) => renderOverviewItem(label, value)).join('');
        overview.style.display = overview.innerHTML ? 'grid' : 'none';
    }

    const fields = [
        ['Title', title],
        ['Week / Day', `Week ${practice.week_number}, Day ${practice.day_number}`],
        ['Node type', practice.node_type],
        ['Resolved node type', practice.resolved_node_type],
        ['Day role', practice.day_role],
        ['Recovery type', practice.recovery_type],
        ['Practice track', practice.practice_track],
        ['Source key', practice.source_key],
        ['Source course', practice.source_course],
        ['Resolved sequence ID', practice.resolved_sequence_id],
        ['Curriculum node ID', practice.curriculum_node_id],
        ['Total duration', totalDuration],
        ['Estimated minutes', practice.estimated_minutes],
        ['Practice parts', composedSummary],
        ['Resolution reason', practice.resolution_reason],
    ];

    details.innerHTML = `<div class="curriculum-practice-grid">${fields.map(([label, value]) => renderField(label, value)).join('')}</div>`;
    details.style.display = 'none';
    if (detailsToggle) {
        detailsToggle.style.display = isDevOrAdmin() ? '' : 'none';
        detailsToggle.setAttribute('aria-expanded', 'false');
        detailsToggle.textContent = 'Details';
    }
    if (devCompleteBtn && isLocalDev()) {
        devCompleteBtn.style.display = practice.curriculum_node_id ? '' : 'none';
    }
    if (undoBtn && isLocalDev()) {
        undoBtn.style.display = practice.curriculum_node_id ? '' : 'none';
    }
    if (resetTestBtn && isLocalDev()) {
        resetTestBtn.style.display = '';
    }
    updateCurriculumLibraryLock();
}

function loadResolvedSequence(practice) {
    const parts = enrichPracticeComposition(practice);
    const playableParts = parts.filter(part => part.course);

    if (!practice?.resolved_sequence_id && playableParts.length === 0) {
        const summary = $('curriculumPracticeSummary');
        if (summary) summary.textContent = practice?.resolution_reason || 'No sequence resolved for this node.';
        return false;
    }

    if (parts.length !== playableParts.length) {
        const missing = parts.filter(part => !part.course).map(part => part.sequence_id).join(', ');
        const summary = $('curriculumPracticeSummary');
        if (summary) summary.textContent = `Composition sequence ${missing} is not in the loaded library.`;
        return false;
    }

    const primaryCourse = playableParts[0]?.course || findCourseById(practice.resolved_sequence_id);
    const isComposed = playableParts.length > 1;
    const playableSequence = isComposed
        ? {
            id: `curriculum-${practice.curriculum_node_id}`,
            supabaseId: practice.resolved_sequence_id,
            title: `Week ${practice.week_number} Day ${practice.day_number}: Today's Practice`,
            category: 'Integrated Curriculum',
            condition_notes: practice.special_instructions || primaryCourse?.condition_notes || '',
            playbackMode: 'standard',
            poses: playableParts.map(part => [
                `MACRO:${part.sequence_id}`,
                1,
                '',
                '',
                `Part ${part.part_number}: ${roleLabel(part.role)}`,
                null,
                '',
                { curriculumPart: part.role, curriculumPartSequenceId: part.sequence_id },
            ]),
        }
        : { ...primaryCourse };

    const curriculumPracticeState = {
        ...practice,
        composition_parts: playableParts.map((part) => {
            const cloned = { ...part };
            delete cloned.course;
            return cloned;
        }),
        is_composed_practice: isComposed,
    };
    window.currentCurriculumPractice = curriculumPracticeState;
    window.suppressCurriculumClear = true;

    if (typeof window.stopTimer === 'function') window.stopTimer();
    if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
    window.completionTracker = {};
    if (playbackEngine && typeof playbackEngine.resetPracticeTimer === 'function') {
        playbackEngine.resetPracticeTimer();
    }

    window.isAliasView = false;
    window.masterCourseTitle = null;
    window.remedialNote = playableSequence.condition_notes || '';
    window.isBriefingActive = true;
    window.pendingSequence = null;
    window.currentSequence = playableSequence;

    if (typeof window.applySequenceInternal === 'function') {
        window.applySequenceInternal(window.currentSequence);
    }

    const idx = (window.courses || []).findIndex((item) =>
        String(item.supabaseId || item.id) === String(practice.resolved_sequence_id)
    );
    const filter = $('categoryFilter');
    const selector = $('sequenceSelect');
    if (filter) {
        const selectedCategory = primaryCourse?.category || 'ALL';
        const hasSelectedCategory = Array.from(filter.options || []).some(option => option.value === selectedCategory);
        filter.value = hasSelectedCategory ? selectedCategory : 'ALL';
    }
    if (typeof window.renderCourseUI === 'function') window.renderCourseUI();
    if (selector && idx >= 0) selector.value = String(idx);
    window.suppressCurriculumClear = false;
    window.currentCurriculumPractice = curriculumPracticeState;

    if (typeof window.updateAliasUIFeedback === 'function') window.updateAliasUIFeedback();
    if (typeof window.updateNextBtnText === 'function') window.updateNextBtnText();
    if ($('statusText')) $('statusText').textContent = 'Curriculum practice ready';
    if ($('startStopBtn')) $('startStopBtn').textContent = 'Start';
    updateCurriculumLibraryLock();

    return true;
}

async function startTodayPractice(repeatNodeId = null) {
    const btn = $('startTodayPracticeBtn');
    const summary = $('curriculumPracticeSummary');
    const originalText = btn?.textContent || 'Start Today\'s Practice';

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Loading...';
    }
    if (summary) summary.textContent = 'Finding today\'s practice...';

    try {
        const rpcParams = {
            p_curriculum_slug: CURRICULUM_SLUG,
            p_user_id: window.currentUserId || null,
        };
        if (repeatNodeId != null) rpcParams.p_repeat_node_id = repeatNodeId;

        const { data, error } = await supabase.rpc('get_today_curriculum_practice', rpcParams);

        if (error) throw error;

        const practice = normalisePracticeResult(data);
        if (!practice) throw new Error('No curriculum practice returned.');

        renderPracticeDetails(practice);

        if (isRestOrRecoveryNode(practice)) {
            window.currentCurriculumPractice = practice;
            if (summary) summary.textContent = practice.special_instructions || `${nonSequenceNodeTitle(practice)}.`;
            if ($('statusText')) $('statusText').textContent = nonSequenceNodeTitle(practice);
            if ($('poseName')) $('poseName').textContent = nonSequenceNodeTitle(practice);
            if ($('poseInstructions')) $('poseInstructions').textContent = practice.special_instructions || '';
            updateCurriculumLibraryLock();
            return;
        }

        if (isSequenceReady(practice)) {
            loadResolvedSequence(practice);
            return;
        }

        window.currentCurriculumPractice = practice;
        if (summary) {
            summary.textContent = practice.special_instructions
                || practice.resolution_reason
                || `${nonSequenceNodeTitle(practice)}.`;
        }
        if ($('statusText')) $('statusText').textContent = nonSequenceNodeTitle(practice);
        if ($('poseName')) $('poseName').textContent = nonSequenceNodeTitle(practice);
        if ($('poseInstructions')) $('poseInstructions').textContent = practice.special_instructions || practice.resolution_reason || '';
        updateCurriculumLibraryLock();
    } catch (err) {
        console.error('Curriculum start failed:', err);
        if (summary) summary.textContent = err.message || 'Could not load today\'s practice.';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function markCurrentCurriculumNodeCompleteForTesting() {
    const practice = window.currentCurriculumPractice;
    const btn = $('markCurriculumCompleteBtn');
    const summary = $('curriculumPracticeSummary');

    if (!isLocalDev()) return;
    if (!practice?.curriculum_node_id) {
        if (summary) summary.textContent = 'Load a curriculum practice first.';
        return;
    }

    const originalText = btn?.textContent || 'Mark Node Complete';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Marking...';
    }

    try {
        if (!isSequenceReady(practice)) {
            console.log('[dev] Non-sequence curriculum node - writing acknowledgement row and advancing (no rating).');
            if (typeof window.appendServerHistory !== 'function') {
                throw new Error('Completion service is not loaded.');
            }
            await window.appendServerHistory(
                `${nonSequenceNodeTitle(practice)} - Week ${practice.week_number} Day ${practice.day_number}`,
                new Date(),
                practice.source_course || practice.source_key || '',
                null,
                {
                    status: 'Completed',
                    sequence_id: null,
                    curriculum_node_id: practice.curriculum_node_id,
                    completion_items: [],
                    notes: `${nonSequenceNodeTitle(practice)} acknowledged via dev test helper.`,
                },
            );
            window.currentCurriculumPractice = null;
            await startTodayPractice();
            return;
        }

        const completionItems = completionItemsForPractice(practice);
        if (typeof window.appendServerHistory !== 'function') {
            throw new Error('Completion service is not loaded.');
        }

        const sessionId = await window.appendServerHistory(
            practice.resolved_course_title || practice.source_reference || 'Curriculum practice',
            new Date(),
            practice.source_course || practice.source_key || '',
            null,
            {
                status: 'Completed',
                sequence_id: practice.resolved_sequence_id,
                curriculum_node_id: practice.curriculum_node_id,
                completion_items: completionItems,
                notes: 'Local curriculum flow test completion.',
            },
        );
        if (!sessionId) throw new Error('Completion was not saved.');

        if (summary) {
            summary.textContent = 'Completion saved. Choose a rating to continue.';
        }
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
        const shown = typeof window.showCompletionRatingOverlay === 'function' && window.showCompletionRatingOverlay(sessionId, {
            title: 'Rate this curriculum practice',
            afterRatingAction: 'startTodayPractice',
            resetAfterRating: false,
        });
        if (!shown) {
            window.currentCurriculumPractice = null;
            await startTodayPractice();
        }
    } catch (err) {
        console.error('Test completion failed:', err);
        if (summary) summary.textContent = err.message || 'Could not mark node complete.';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function undoCurrentCurriculumNodeCompletionForTesting() {
    const practice = window.currentCurriculumPractice;
    const btn = $('undoCurriculumCompletionBtn');
    const summary = $('curriculumPracticeSummary');

    if (!isLocalDev()) return;
    if (!practice?.curriculum_node_id) {
        if (summary) summary.textContent = 'Load a curriculum practice first.';
        return;
    }

    const originalText = btn?.textContent || 'Undo Curriculum Completion';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Undoing...';
    }

    try {
        // Find the previous node so we can repeat it after deleting this one's completion.
        const { data: prevData } = await supabase
            .from('program_curriculum')
            .select('id')
            .eq('curriculum_slug', CURRICULUM_SLUG)
            .lt('order_index', practice.order_index)
            .order('order_index', { ascending: false })
            .limit(1)
            .maybeSingle();

        let query = supabase
            .from('sequence_completions')
            .delete()
            .eq('curriculum_node_id', practice.curriculum_node_id);

        if (window.currentUserId) {
            query = query.eq('user_id', window.currentUserId);
        }

        const { error } = await query;
        if (error) throw error;

        if (summary) summary.textContent = 'Curriculum completion undone. Reloading practice...';
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
        window.currentCurriculumPractice = null;
        await startTodayPractice(prevData?.id ?? null);
    } catch (err) {
        console.error('Undo curriculum completion failed:', err);
        if (summary) summary.textContent = err.message || 'Could not undo curriculum completion.';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function getFirstActiveCurriculumNodeId() {
    const { data, error } = await supabase
        .from('program_curriculum')
        .select('id')
        .eq('curriculum_slug', CURRICULUM_SLUG)
        .eq('is_active', true)
        .eq('is_visible', true)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data?.id ?? null;
}

async function resetCurriculumTestProgress() {
    const btn = $('resetCurriculumTestProgressBtn');
    const summary = $('curriculumPracticeSummary');

    if (!isLocalDev()) return;
    if (!window.currentUserId) {
        if (summary) summary.textContent = 'Sign in or continue as guest before resetting curriculum test progress.';
        return;
    }

    const confirmed = window.confirm(
        'Reset curriculum test progress for the active curriculum for the current user? This deletes curriculum completion rows for this curriculum only.',
    );
    if (!confirmed) return;

    const originalText = btn?.textContent || 'Reset Curriculum Test Progress';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Resetting...';
    }

    try {
        const { data: nodes, error: nodeError } = await supabase
            .from('program_curriculum')
            .select('id')
            .eq('curriculum_slug', CURRICULUM_SLUG);
        if (nodeError) throw nodeError;

        const nodeIds = (nodes || []).map(node => node.id).filter(id => id !== null && id !== undefined);
        if (!nodeIds.length) throw new Error('No curriculum nodes found for this draft.');

        const { error } = await supabase
            .from('sequence_completions')
            .delete()
            .in('curriculum_node_id', nodeIds)
            .eq('user_id', window.currentUserId);
        if (error) throw error;

        if (summary) summary.textContent = 'Curriculum test progress reset. Loading first available practice...';
        if (typeof window.resetCompletionTracker === 'function') window.resetCompletionTracker();
        window.currentCurriculumPractice = null;
        const firstActiveNodeId = await getFirstActiveCurriculumNodeId();
        await startTodayPractice(firstActiveNodeId);
    } catch (err) {
        console.error('Reset curriculum test progress failed:', err);
        if (summary) summary.textContent = err.message || 'Could not reset curriculum test progress.';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

function setupCurriculumUI() {
    const btn = $('startTodayPracticeBtn');
    if (btn) btn.addEventListener('click', () => startTodayPractice());

    const exitBtn = $('exitCurriculumPracticeBtn');
    if (exitBtn) {
        exitBtn.style.display = 'none';
        exitBtn.addEventListener('click', () => exitCurriculumPractice());
    }

    const detailsToggle = $('curriculumDetailsToggleBtn');
    const details = $('curriculumPracticeDetails');
    if (detailsToggle && details) {
        detailsToggle.style.display = 'none';
        detailsToggle.addEventListener('click', () => {
            const isOpen = details.style.display !== 'none';
            details.style.display = isOpen ? 'none' : 'block';
            detailsToggle.setAttribute('aria-expanded', String(!isOpen));
            detailsToggle.textContent = isOpen ? 'Details' : 'Hide Details';
        });
    }

    const devCompleteBtn = $('markCurriculumCompleteBtn');
    if (devCompleteBtn && isLocalDev()) {
        devCompleteBtn.style.display = 'none';
        devCompleteBtn.addEventListener('click', markCurrentCurriculumNodeCompleteForTesting);
    }

    const undoBtn = $('undoCurriculumCompletionBtn');
    if (undoBtn && isLocalDev()) {
        undoBtn.style.display = 'none';
        undoBtn.addEventListener('click', undoCurrentCurriculumNodeCompletionForTesting);
    }

    const resetTestBtn = $('resetCurriculumTestProgressBtn');
    if (resetTestBtn && isLocalDev()) {
        resetTestBtn.style.display = 'none';
        resetTestBtn.addEventListener('click', resetCurriculumTestProgress);
    }
}

window.setupCurriculumUI = setupCurriculumUI;
window.startTodayPractice = startTodayPractice;
window.markCurrentCurriculumNodeCompleteForTesting = markCurrentCurriculumNodeCompleteForTesting;
window.undoCurrentCurriculumNodeCompletionForTesting = undoCurrentCurriculumNodeCompletionForTesting;
window.resetCurriculumTestProgress = resetCurriculumTestProgress;
window.getCurriculumCompletionItems = completionItemsForPractice;
window.updateCurriculumLibraryLock = updateCurriculumLibraryLock;
window.exitCurriculumPractice = exitCurriculumPractice;
