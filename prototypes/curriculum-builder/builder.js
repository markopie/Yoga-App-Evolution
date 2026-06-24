import { supabase } from '../../src/services/supabaseClient.js';
import { isConfiguredAdminEmail } from '../../src/config/appConfig.js';
import {
  computeOrderIndex,
  validateDraft,
} from './validation.js';
import {
  createAutosaver,
  createEmptyDraft,
  deleteDraft,
  duplicateDraft,
  loadDraftList,
  loadDraft,
} from './draftService.js';

const COLUMN_DEFAULTS = {
  curriculum_slug: '',
  program_name: '',
  day_kind: 'practice',
  week_number: null,
  day_number: null,
  order_index: null,
  node_type: 'sequence',
  sequence_id: null,
  source_name: '',
  source_key: '',
  source_course: '',
  source_reference: '',
  practice_track: 'asana',
  curriculum_phase: '',
  intensity: 'light',
  primary_focus: '',
  special_instructions: '',
  requires_user_selection: false,
  is_rest_day: false,
  is_active: true,
  is_revision_node: false,
  completion_requirement: 'attempt',
  level_number: null,
  curriculum_payload: {},
  day_role: 'practice',
  recovery_type: '',
  is_visible: true,
  source_policy: '',
  source_sequence_order: null,
  estimated_minutes: null,
  curriculum_unit_id: '',
  adaptive_behavior: {},
};

const DAY_KIND_OPTIONS = [
  { value: 'practice', label: 'Practice', nodeType: 'sequence', completion: 'attempt' },
  { value: 'combined_practice', label: 'Combined practice', nodeType: 'composed_sequence', completion: 'complete_all_parts' },
  { value: 'rest_day', label: 'Rest day', nodeType: 'rest', completion: 'acknowledge' },
  { value: 'recovery_day', label: 'Recovery day', nodeType: 'recovery', completion: 'acknowledge' },
  { value: 'revision', label: 'Revision', nodeType: 'revision', completion: 'attempt' },
  { value: 'student_choice', label: 'Student chooses', nodeType: 'choice', completion: 'choose_one' },
  { value: 'teaching_note', label: 'Teaching note', nodeType: 'instruction', completion: 'acknowledge' },
  { value: 'checkpoint', label: 'Checkpoint', nodeType: 'mastery_gate', completion: 'repeat_until_ready' },
];

const COMPLETION_RULE_OPTIONS = [
  { value: 'attempt', label: 'Do this practice' },
  { value: 'complete', label: 'Complete fully' },
  { value: 'complete_all_parts', label: 'Complete all parts' },
  { value: 'optional', label: 'Optional' },
  { value: 'choose_one', label: 'Pick one' },
  { value: 'acknowledge', label: 'Acknowledge' },
  { value: 'repeat_until_ready', label: 'Repeat until ready' },
];

const RECOVERY_STYLE_OPTIONS = [
  { value: 'full_rest', label: 'Full rest' },
  { value: 'gentle_recovery', label: 'Gentle recovery' },
  { value: 'quiet_practice', label: 'Quiet practice' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'technical', label: 'Technical' },
  { value: 'support', label: 'Support' },
  { value: 'revision', label: 'Revision' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'anchor', label: 'Anchor' },
  { value: 'other', label: 'Other' },
];

const INTENSITY_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'restorative', label: 'Restorative' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strong', label: 'Strong' },
  { value: 'advanced', label: 'Advanced' },
];

const state = {
  courses: [],
  filteredCourses: [],
  categories: new Set(),
  activeCategories: new Set(),
  draft: null,
  draftSummaries: [],
  draftListError: '',
  selected: null,
  validation: { errors: [], warnings: [] },
  autosaver: null,
  lastValidatedAt: null,
  publishStatus: '',
};

const $ = (id) => document.getElementById(id);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function curriculumSlugFromName(name) {
  return slugify(name) || `curriculum_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`;
}

function uniqueCurriculumSlug(name) {
  const base = curriculumSlugFromName(name);
  const existing = new Set(state.draftSummaries.map((draft) => draft.slug));
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function relativeTime(value) {
  if (!value) return 'not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not saved yet';
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}

function sequenceLength(course) {
  if (Array.isArray(course.sequence_json)) return course.sequence_json.length;
  return String(course.sequence_text || course.sequence_text_ARCHIVED || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
}

function courseParts(course) {
  const sub = course.course_sub_categories || {};
  const category = sub.course_categories || {};
  const categoryName = category.name || course.category || 'General';
  const subCategoryName = sub.name || course.sub_category || '';
  const length = sequenceLength(course);
  return {
    id: Number(course.id),
    title: String(course.title || course.course_title || `Course ${course.id}`).trim(),
    categoryName,
    subCategoryName,
    sourceKey: slugify(categoryName),
    sequenceLength: length,
    estimatedMinutes: Math.max(10, Math.round(length * 2.5) || 10),
    isAlias: Boolean(course.is_alias || course.redirect_id),
  };
}

function dayKindConfig(value) {
  return DAY_KIND_OPTIONS.find((option) => option.value === value) || DAY_KIND_OPTIONS[0];
}

function dayKindFromItem(item) {
  if (item.day_kind) return item.day_kind;
  if (item.is_rest_day) return 'rest_day';
  if (item.is_revision_node) return 'revision';
  if (item.node_type === 'composed_sequence') return 'combined_practice';
  if (item.node_type === 'recovery') return 'recovery_day';
  if (item.node_type === 'choice') return 'student_choice';
  if (item.node_type === 'instruction') return 'teaching_note';
  if (item.node_type === 'mastery_gate') return 'checkpoint';
  if (item.node_type === 'rest') return 'rest_day';
  return 'practice';
}

function syncDayKind(item, kind = dayKindFromItem(item), { resetCompletion = false } = {}) {
  const config = dayKindConfig(kind);
  item.day_kind = config.value;
  item.node_type = config.nodeType;
  item.is_rest_day = config.value === 'rest_day';
  item.is_revision_node = config.value === 'revision';
  item.requires_user_selection = config.value === 'student_choice';
  if (resetCompletion || !item.completion_requirement) item.completion_requirement = config.completion;
  if ((config.value === 'rest_day' || config.value === 'recovery_day') && !item.recovery_type) item.recovery_type = 'full_rest';
  if (config.value !== 'rest_day' && config.value !== 'recovery_day') item.recovery_type = '';
  return item;
}

function friendlyDayKindLabel(item) {
  return dayKindConfig(dayKindFromItem(item)).label;
}

function inferPracticeTrack(course) {
  const haystack = `${course?.cb?.categoryName || ''} ${course?.cb?.subCategoryName || ''} ${course?.cb?.title || ''}`.toLowerCase();
  if (haystack.includes('pranayama')) return 'pranayama';
  if (haystack.includes('flow')) return 'flow';
  if (haystack.includes('cycle')) return 'cycle';
  return 'asana';
}

function sourceFieldsFromCourse(course) {
  if (!course) {
    return {
      source_name: null,
      source_key: null,
      source_course: null,
      source_reference: null,
    };
  }
  return {
    source_name: course.cb.categoryName || null,
    source_key: course.cb.sourceKey || null,
    source_course: course.cb.subCategoryName || null,
    source_reference: course.cb.title || null,
  };
}

function selectedItemRef() {
  if (!state.draft || !state.selected || state.selected.type !== 'item') return null;
  const section = state.draft.sections[state.selected.sectionIndex];
  const week = section?.weeks?.[state.selected.weekIndex];
  const item = week?.items?.[state.selected.itemIndex];
  if (!section || !week || !item) return null;
  return { section, week, item, ...state.selected };
}

function selectedSectionRef() {
  if (!state.draft || !state.selected) return null;
  const sectionIndex = state.selected.sectionIndex ?? 0;
  const section = state.draft.sections[sectionIndex];
  return section ? { section, sectionIndex } : null;
}

function selectedWeekRef() {
  if (!state.draft || !state.selected) return null;
  const sectionIndex = state.selected.sectionIndex ?? 0;
  const section = state.draft.sections[sectionIndex];
  const weekIndex = state.selected.weekIndex ?? Math.max(0, (section?.weeks || []).length - 1);
  const week = section?.weeks?.[weekIndex];
  return section && week ? { section, week, sectionIndex, weekIndex } : null;
}

function touchDraft({ render = true } = {}) {
  if (!state.draft || !state.autosaver) return;
  state.lastValidatedAt = null;
  state.publishStatus = '';
  if (render) {
    renderAll();
  } else {
    renderDraftMeta();
    renderSources();
    renderStructure();
    renderValidation();
  }
  state.autosaver.schedule();
}

function setSaved(savedDraft) {
  if (savedDraft && state.draft?.slug === savedDraft.slug) {
    state.draft = savedDraft;
  }
  $('saveStatus').textContent = 'Saved';
  $('saveStatus').title = '';
  renderDraftMeta();
}

function setSaving() {
  $('saveStatus').textContent = 'Saving...';
}

function setSaveError(error) {
  const message = error?.message || 'Could not save draft.';
  $('saveStatus').textContent = 'Save failed - retrying';
  $('saveStatus').title = message;
}

async function refreshDraftList() {
  try {
    state.draftSummaries = await loadDraftList();
    state.draftListError = '';
  } catch (error) {
    state.draftSummaries = [];
    state.draftListError = error?.message || 'Could not load drafts from Supabase.';
  }
  renderStartScreen();
}

function createItem(overrides = {}) {
  const item = {
    ...structuredClone(COLUMN_DEFAULTS),
    ...overrides,
    curriculum_payload: overrides.curriculum_payload || {},
    adaptive_behavior: overrides.adaptive_behavior || {},
  };
  return syncDayKind(item, item.day_kind || dayKindFromItem(item));
}

function createRestItem() {
  return createItem({
    day_kind: 'rest_day',
    node_type: 'rest',
    is_rest_day: true,
    completion_requirement: 'acknowledge',
    practice_track: 'recovery',
    intensity: 'restorative',
    primary_focus: 'Rest',
    day_role: 'rest',
    recovery_type: 'full_rest',
    source_reference: 'Rest',
    estimated_minutes: 0,
  });
}

function createPracticeItem(dayNumber) {
  return createItem({
    day_kind: 'practice',
    day_number: dayNumber,
    primary_focus: '',
    day_role: 'practice',
    intensity: 'light',
  });
}

function createWeek(weekNumber, days = 7) {
  const safeDays = Math.min(7, Math.max(1, Number(days) || 7));
  const items = Array.from({ length: safeDays }, (_, dayIndex) => {
    const dayNumber = dayIndex + 1;
    return dayNumber === 7 ? createRestItem() : createPracticeItem(dayNumber);
  });
  items.forEach((item, index) => {
    item.week_number = weekNumber;
    item.day_number = index + 1;
  });
  return { weekNumber, open: true, items };
}

function createStarterSections(shape, sections = 1, weeks = 1, days = 7) {
  if (shape === 'empty') return [];
  const safeSections = Math.min(4, Math.max(1, Number(sections) || 1));
  const safeWeeks = Math.min(20, Math.max(1, Number(weeks) || 1));
  const safeDays = Math.min(7, Math.max(5, Number(days) || 7));
  let weekNumber = 1;
  return Array.from({ length: safeSections }, (_, sectionIndex) => ({
    name: `Course / Level ${sectionIndex + 1}`,
    levelNumber: sectionIndex + 1,
    description: '',
    open: true,
    weeks: Array.from({ length: safeWeeks }, () => createWeek(weekNumber++, safeDays)),
  }));
}

function ensureDraft() {
  if (state.draft) return true;
  window.alert('Create or open a curriculum first.');
  return false;
}

async function checkAuthorization() {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (local) return true;
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user?.email) return false;
  return isConfiguredAdminEmail(data.session.user.email);
}

async function fetchCourses() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('courses')
    .select('*, course_sub_categories(id, name, category_id, course_categories(id, name))')
    .order('id');
  if (error) throw error;
  return (data || []).map((course) => ({ ...course, cb: courseParts(course) }));
}

function renderDraftMeta() {
  const meta = $('draftMeta');
  const pageTitle = $('pageTitle');
  const current = $('breadcrumbCurrent');
  const separator = $('breadcrumbSeparator');
  const saveStatus = $('saveStatus');
  if (!state.draft) {
    meta.textContent = 'No curriculum open';
    pageTitle.textContent = 'Curriculum Builder';
    current.textContent = '';
    separator.hidden = true;
    saveStatus.hidden = true;
    return;
  }
  const updated = state.draft.updatedAt ? new Date(state.draft.updatedAt).toLocaleString() : 'not saved yet';
  const name = state.draft.programName || 'Untitled curriculum';
  pageTitle.textContent = name;
  current.textContent = name;
  separator.hidden = false;
  saveStatus.hidden = false;
  meta.textContent = `Last saved ${updated}`;
}

function curriculumStats(draft) {
  const sections = draft?.sections || [];
  const weeks = sections.flatMap((section) => section.weeks || []);
  const items = weeks.flatMap((week) => week.items || []);
  const assigned = items.filter((item) => item.sequence_id).length;
  const restDays = items.filter((item) => dayKindFromItem(item) === 'rest_day').length;
  const teachingNotes = items.filter((item) => dayKindFromItem(item) === 'teaching_note').length;
  const unassigned = items.length - assigned - restDays - teachingNotes;
  return {
    sections: sections.length,
    weeks: weeks.length,
    days: items.length,
    assigned,
    unassigned: Math.max(0, unassigned),
    restDays,
    teachingNotes,
  };
}

function renderStartScreen() {
  const startScreen = $('startScreen');
  const workbench = $('workbench');
  const hasDraft = Boolean(state.draft);
  startScreen.hidden = hasDraft;
  workbench.hidden = !hasDraft;
  if (hasDraft) return;

  const drafts = state.draftSummaries || [];
  const list = $('savedCurricula');
  const heading = $('startHeading');
  const intro = $('startIntro');
  const guide = $('startGuide');
  list.innerHTML = '';
  if (state.draftListError) {
    list.innerHTML = `<p class="validation-error">${escapeHtml(state.draftListError)}</p>`;
  }
  if (!drafts.length) {
    heading.textContent = 'Create your first curriculum';
    intro.textContent = 'Arrange practices into sections, weeks, and days.';
    guide.hidden = false;
    return;
  }

  heading.textContent = 'Your curricula';
  intro.textContent = '';
  guide.hidden = true;
  drafts.forEach((summary) => {
    const stats = summary.stats || {};
    const card = document.createElement('article');
    card.className = 'saved-card';
    card.tabIndex = 0;
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(summary.name || summary.programName || summary.slug)}</h3>
        ${summary.description ? `<p>${escapeHtml(truncateText(summary.description, 150))}</p>` : ''}
        <div class="meta-line">${stats.sections || 0} sections, ${stats.weeks || 0} weeks, ${stats.days || 0} days, ${stats.practicesAssigned || 0} practices assigned</div>
        <div class="meta-line">Last edited ${escapeHtml(relativeTime(summary.updatedAt))}</div>
      </div>
      <div class="saved-actions">
        <button type="button" class="btn btn-primary saved-open-btn">Open</button>
        <button type="button" class="btn btn-secondary saved-duplicate-btn">Duplicate</button>
        <button type="button" class="btn btn-secondary saved-remove-btn">Delete</button>
      </div>
    `;
    const open = () => openCurriculum(summary.slug);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    card.querySelector('.saved-open-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      open();
    });
    card.querySelector('.saved-duplicate-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      duplicateCurriculum(summary.slug);
    });
    card.querySelector('.saved-remove-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      removeCurriculum(summary.slug);
    });
    list.append(card);
  });
}

function usedCourseIds() {
  const ids = new Set();
  (state.draft?.sections || []).forEach((section) => {
    (section.weeks || []).forEach((week) => {
      (week.items || []).forEach((item) => {
        if (item.sequence_id) ids.add(Number(item.sequence_id));
        const composition = item.curriculum_payload?.practice_composition || [];
        composition.forEach((part) => {
          if (part.sequence_id) ids.add(Number(part.sequence_id));
        });
      });
    });
  });
  return ids;
}

function compositionParts(item) {
  const parts = item?.curriculum_payload?.practice_composition;
  return Array.isArray(parts) ? parts : [];
}

function compositionSummary(item) {
  const parts = compositionParts(item);
  if (!parts.length) return '';
  return parts
    .map((part) => part.title || part.source_reference || `Course ${part.sequence_id}`)
    .filter(Boolean)
    .join(' + ');
}

function totalEstimatedMinutes(item) {
  const mainCourse = item.sequence_id ? findCourse(item.sequence_id) : null;
  const main = Number(mainCourse?.cb?.estimatedMinutes) || Number(item.main_estimated_minutes) || Number(item.estimated_minutes) || 0;
  const second = compositionParts(item).reduce((sum, part) => sum + (Number(part.estimated_minutes) || 0), 0);
  return main + second;
}

function sourceDefaultMinutes(item) {
  const mainCourse = item?.sequence_id ? findCourse(item.sequence_id) : null;
  return Number(mainCourse?.cb?.estimatedMinutes) || Number(item?.main_estimated_minutes) || null;
}

function renderCategoryFilters() {
  const container = $('categoryFilters');
  container.innerHTML = '';
  [...state.categories].sort().forEach((category) => {
    const label = document.createElement('label');
    label.className = 'category-filter';
    label.innerHTML = `
      <input type="checkbox" value="${category}" ${state.activeCategories.has(category) ? 'checked' : ''}>
      <span>${category}</span>
    `;
    label.querySelector('input').addEventListener('change', (event) => {
      if (event.target.checked) state.activeCategories.add(category);
      else state.activeCategories.delete(category);
      renderSources();
    });
    container.append(label);
  });
}

function renderSources() {
  const list = $('sourceList');
  const help = $('assignHelp');
  const query = $('sourceSearch').value.trim().toLowerCase();
  const used = usedCourseIds();
  const selected = selectedItemRef();
  const selectedUsesPractice = selected ? shouldShowPracticeFields(dayKindFromItem(selected.item)) : false;
  const canAssign = Boolean(selected && selectedUsesPractice);
  const canAddSecond = Boolean(selected?.item?.sequence_id && selectedUsesPractice);
  if (help) {
    help.textContent = selected && selectedUsesPractice
      ? `${positionLabel(selected.week, selected.item)} selected. Use a card button to assign a practice.`
      : selected
        ? 'This day kind does not use practice assignments.'
      : 'Select a day, then use a practice card action.';
  }
  state.filteredCourses = state.courses.filter((course) => {
    const haystack = `${course.cb.title} ${course.cb.categoryName} ${course.cb.subCategoryName}`.toLowerCase();
    return state.activeCategories.has(course.cb.categoryName) && (!query || haystack.includes(query));
  });
  list.innerHTML = '';
  state.filteredCourses.forEach((course) => {
    const card = document.createElement('article');
    card.className = `source-card${used.has(course.cb.id) ? ' used' : ''}`;
    card.draggable = true;
    card.dataset.courseId = String(course.cb.id);
    card.innerHTML = `
      <div class="source-title">${escapeHtml(course.cb.title)}</div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(course.cb.categoryName)}</span>
        ${course.cb.subCategoryName ? `<span class="badge">${escapeHtml(course.cb.subCategoryName)}</span>` : ''}
        ${course.cb.isAlias ? '<span class="badge">Alias</span>' : ''}
        ${used.has(course.cb.id) ? '<span class="badge used-badge">Used</span>' : ''}
      </div>
          <div class="card-meta">${course.cb.sequenceLength} poses - ${course.cb.estimatedMinutes} min</div>
          <div class="card-actions">
            <button type="button" class="btn btn-secondary source-main-btn" ${canAssign ? '' : 'disabled'} title="${canAssign ? '' : 'Select a day first'}">Use as main</button>
            ${canAddSecond ? `<button type="button" class="btn btn-secondary source-second-btn">Add second</button>` : ''}
            <button type="button" class="btn btn-secondary source-preview-btn">Preview</button>
          </div>
        `;
    card.addEventListener('click', () => previewCourse(course));
    card.querySelector('.source-main-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      assignCourse(course.cb.id, 'main');
    });
    card.querySelector('.source-second-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      assignCourse(course.cb.id, 'append');
    });
    card.querySelector('.source-preview-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      previewCourse(course);
    });
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', String(course.cb.id));
      event.dataTransfer.effectAllowed = 'copy';
    });
    list.append(card);
  });
}

function previewCourse(course) {
  window.alert(`${course.cb.title}\n${course.cb.categoryName}${course.cb.subCategoryName ? ` - ${course.cb.subCategoryName}` : ''}\n${course.cb.sequenceLength} poses, about ${course.cb.estimatedMinutes} minutes`);
}

function positionLabel(week, item) {
  const weekNumber = week.weekNumber ?? '';
  const dayNumber = item.day_number ?? '';
  return `W${weekNumber || '?'} D${dayNumber || '?'}`;
}

function intensityClass(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'moderate') return 'intensity-moderate';
  if (key === 'strong' || key === 'advanced') return 'intensity-strong';
  if (key === 'restorative' || key === 'light') return 'intensity-light';
  return 'intensity-empty';
}

function truncateText(value, max = 24) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function renderStructure() {
  const tree = $('structureTree');
  tree.innerHTML = '';
  if (!state.draft) {
    tree.innerHTML = '<p class="empty-state">Create or open a curriculum.</p>';
    return;
  }
  if (!state.draft.sections.length) {
    tree.innerHTML = '<p class="empty-state">Add a course or level to begin.</p>';
    return;
  }

  state.draft.sections.forEach((section, sectionIndex) => {
    const sectionEl = document.createElement('details');
    sectionEl.className = 'section-block';
    sectionEl.open = section.open !== false;
    sectionEl.innerHTML = `<summary class="section-summary">${escapeHtml(section.name || 'Untitled Section')} - Level ${escapeHtml(section.levelNumber || '-')}</summary>`;
    sectionEl.querySelector('.section-summary').addEventListener('click', () => {
      state.selected = { type: 'section', sectionIndex };
      renderAll();
    });
    sectionEl.addEventListener('toggle', () => {
      section.open = sectionEl.open;
      if (state.draft) state.autosaver?.schedule();
    });

    (section.weeks || []).forEach((week, weekIndex) => {
      const weekEl = document.createElement('details');
      weekEl.className = 'week-block';
      weekEl.open = week.open !== false;
      weekEl.innerHTML = `<summary class="week-summary">Week ${escapeHtml(week.weekNumber)}</summary><div class="week-items"></div>`;
      weekEl.addEventListener('toggle', () => {
        week.open = weekEl.open;
        if (state.draft) state.autosaver?.schedule();
      });
      const itemsEl = weekEl.querySelector('.week-items');
      (week.items || []).forEach((item, itemIndex) => {
        const appendedLabel = compositionSummary(item);
        const row = document.createElement('article');
        const dayKind = dayKindFromItem(item);
        const hasMainPractice = Boolean(item.sequence_id);
        const focus = truncateText(item.primary_focus, 24);
        const title = item.source_reference || (dayKind === 'rest_day' ? 'Rest day' : dayKind === 'recovery_day' ? 'Recovery day' : dayKind === 'teaching_note' ? 'Teaching note' : dayKind === 'checkpoint' ? 'Checkpoint' : 'Unassigned');
        const durationLabel = item.estimated_minutes == null || item.estimated_minutes === ''
          ? '--'
          : `${Number(item.estimated_minutes)}m`;
        const dayKindBadge = dayKind !== 'practice'
          ? `<span class="chip">${friendlyDayKindLabel(item)}</span>`
          : '';
        const selected = state.selected?.type === 'item'
          && state.selected.sectionIndex === sectionIndex
          && state.selected.weekIndex === weekIndex
          && state.selected.itemIndex === itemIndex;
        row.className = `structure-item${selected ? ' selected' : ''}${hasMainPractice || !shouldShowPracticeFields(dayKind) ? '' : ' unassigned'}${dayKind === 'rest_day' || dayKind === 'recovery_day' ? ' rest-row' : ''}`;
        row.draggable = true;
        row.dataset.sectionIndex = String(sectionIndex);
        row.dataset.weekIndex = String(weekIndex);
        row.dataset.itemIndex = String(itemIndex);
        row.innerHTML = `
          <div class="item-row-main">
            <strong>${positionLabel(week, item)}</strong>
            ${dayKindBadge}
            <span class="intensity-dot ${intensityClass(item.intensity)}" title="${item.intensity || 'Intensity not set'}"></span>
            <span class="chip">${durationLabel}</span>
          </div>
          <div class="item-title ${hasMainPractice || !shouldShowPracticeFields(dayKind) ? '' : 'muted-title'}">${escapeHtml(truncateText(title, 42))}</div>
          ${focus ? `<div class="item-focus">${escapeHtml(focus)}</div>` : ''}
          ${appendedLabel ? `<div class="appended-line">Second practice: ${escapeHtml(truncateText(appendedLabel, 48))}</div>` : ''}
          <div class="item-meta">${escapeHtml(item.source_name || 'No source')}${item.source_course ? ` - ${escapeHtml(item.source_course)}` : ''}</div>
        `;
        row.addEventListener('click', () => {
          state.selected = { type: 'item', sectionIndex, weekIndex, itemIndex };
          renderAll();
        });
        row.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          state.selected = { type: 'item', sectionIndex, weekIndex, itemIndex };
          renderAll();
        });
        row.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('application/x-cb-item', JSON.stringify({ sectionIndex, weekIndex, itemIndex }));
          event.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragover', (event) => {
          event.preventDefault();
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          row.classList.remove('drag-over');
          const sourceCourseId = event.dataTransfer.getData('text/plain');
          const sourceItem = event.dataTransfer.getData('application/x-cb-item');
          if (sourceCourseId) {
            state.selected = { type: 'item', sectionIndex, weekIndex, itemIndex };
            assignCourse(Number(sourceCourseId), 'main');
          } else if (sourceItem) {
            moveItem(JSON.parse(sourceItem), { sectionIndex, weekIndex, itemIndex });
          }
        });
        itemsEl.append(row);
      });
      sectionEl.append(weekEl);
    });
    tree.append(sectionEl);
  });
}

function fieldTemplate(name, label, value, type = 'text') {
  return `
    <div class="field">
      <label for="field_${name}">${label}</label>
      <input id="field_${name}" name="${name}" type="${type}" value="${escapeHtml(value ?? '')}">
    </div>
  `;
}

function appendListTemplate(item) {
  const parts = compositionParts(item);
  if (!parts.length) {
    return '<div class="empty-state">No appended practice.</div>';
  }
  return `
    <div class="append-list">
      ${parts.map((part, index) => `
        <div class="append-row">
          <div>
            <strong>${escapeHtml(part.title || part.source_reference || `Course ${part.sequence_id}`)}</strong>
            <div class="meta-line">${escapeHtml(part.source_name || 'Source')} - ${part.estimated_minutes || '-'} min</div>
          </div>
          <button type="button" class="btn btn-secondary remove-append-btn" data-append-index="${index}">Remove</button>
        </div>
      `).join('')}
    </div>
  `;
}

function optionTemplate(options, value) {
  return options.map((option) => `<option value="${option.value}" ${option.value === value ? 'selected' : ''}>${option.label}</option>`).join('');
}

function radioTemplate(name, options, value) {
  return options.map((option) => `
    <label class="radio-field">
      <input type="radio" name="${name}" value="${option.value}" ${option.value === value ? 'checked' : ''}>
      <span>${option.label}</span>
    </label>
  `).join('');
}

function selectedItemTechnicalPreview(ref) {
  if (!new URLSearchParams(window.location.search).has('debug')) return '';
  const row = buildRow(state.draft, ref.item, ref.section, ref.week, ref.sectionIndex, ref.weekIndex, ref.itemIndex);
  return `
    <details class="technical-preview">
      <summary>Technical view</summary>
      <pre>${JSON.stringify(row, null, 2)}</pre>
    </details>
  `;
}

function shouldShowPracticeFields(dayKind) {
  return ['practice', 'combined_practice', 'revision', 'student_choice'].includes(dayKind);
}

function renderEditor() {
  const form = $('itemEditor');
  const editorPanel = document.querySelector('.editor-panel');
  const ref = selectedItemRef();
  const sectionRef = selectedSectionRef();
  editorPanel.classList.toggle('has-selection', !!ref || !!sectionRef);
  if (!ref && sectionRef) {
    form.innerHTML = `
      <section class="editor-group">
        <h3>Course / Level</h3>
        ${fieldTemplate('section_name', 'Section name', sectionRef.section.name)}
        ${fieldTemplate('section_level', 'Level number', sectionRef.section.levelNumber, 'number')}
        <div class="field">
          <label for="field_section_description">Section description</label>
          <textarea id="field_section_description" name="section_description">${escapeHtml(sectionRef.section.description || '')}</textarea>
        </div>
      </section>
    `;
    form.querySelectorAll('input, textarea').forEach((control) => {
      control.addEventListener('input', updateSelectedSectionFromEditor);
      control.addEventListener('change', updateSelectedSectionFromEditor);
    });
    return;
  }
  if (!ref) {
    form.innerHTML = '<p class="empty-state">Select a day or course/level to edit.</p>';
    return;
  }

  const { item } = ref;
  syncDayKind(item);
  const dayKind = dayKindFromItem(item);
  const showSecondPractice = dayKind === 'combined_practice';
  const showRecoveryStyle = dayKind === 'rest_day' || dayKind === 'recovery_day';
  const showPracticeFields = shouldShowPracticeFields(dayKind);
  const defaultMinutes = sourceDefaultMinutes(item);
  const sourceDefaultLabel = defaultMinutes ? `Source default: ${defaultMinutes} min` : 'Source default: not available';
  const mainPracticeLabel = item.sequence_id
    ? `${item.source_reference || 'Untitled practice'}${item.source_name ? ` - ${item.source_name}` : ''}`
    : 'No practice selected';
  form.innerHTML = `
    <section class="editor-group">
      <h3>Day Kind</h3>
      <div class="field">
        <label for="field_day_kind">Day kind</label>
        <select id="field_day_kind" name="day_kind">
          ${optionTemplate(DAY_KIND_OPTIONS, dayKind)}
        </select>
      </div>
    </section>

    <section class="editor-group" ${showPracticeFields ? '' : 'hidden'}>
      <h3>Practice</h3>
      <div class="source-assignment">
        <strong>Main practice</strong>
        <div class="source-badge">${escapeHtml(mainPracticeLabel)}</div>
        <div class="inline-actions">
          <button id="changeSourceBtn" type="button" class="btn btn-secondary">Change</button>
          <button id="clearSourceBtn" type="button" class="btn btn-secondary" ${item.sequence_id ? '' : 'disabled'}>Clear</button>
        </div>
      </div>
      <div class="source-assignment" ${showSecondPractice ? '' : 'hidden'}>
        <strong>Second practice</strong>
        <div class="meta-line">Use the Practice Library "Add second" action to add support work.</div>
        ${appendListTemplate(item)}
      </div>
      ${!showSecondPractice ? '<div class="meta-line">Choose Combined practice or use Add second to add support work.</div>' : ''}
    </section>

    <section class="editor-group" ${showPracticeFields || showRecoveryStyle ? '' : 'hidden'}>
      <h3>Day Details</h3>
      <div class="field" ${showPracticeFields ? '' : 'hidden'}>
        <label for="field_estimated_minutes">Target duration</label>
        <input id="field_estimated_minutes" name="estimated_minutes" type="number" min="0" value="${item.estimated_minutes ?? ''}">
        <div class="meta-line">The app will adjust the duration dial to aim for this time. Leave blank to use the default practice length.</div>
        <div class="meta-line">${escapeHtml(sourceDefaultLabel)}</div>
      </div>
      <div class="field" ${showPracticeFields ? '' : 'hidden'}>
        <label for="field_intensity">Intensity</label>
        <select id="field_intensity" name="intensity">${optionTemplate(INTENSITY_OPTIONS, item.intensity || '')}</select>
      </div>
      <div class="field" ${showPracticeFields ? '' : 'hidden'}>
        <label for="field_primary_focus">Focus</label>
        <input id="field_primary_focus" name="primary_focus" type="text" value="${escapeHtml(item.primary_focus || '')}" placeholder="Standing poses, hip opening">
      </div>
      <div class="field" ${showPracticeFields ? '' : 'hidden'}>
        <label for="field_day_role">Role</label>
        <select id="field_day_role" name="day_role">${optionTemplate(ROLE_OPTIONS, item.day_role || '')}</select>
      </div>
      <div class="field" ${(showPracticeFields && item.day_role === 'other') ? '' : 'hidden'}>
        <label for="field_day_role_other">Other role</label>
        <input id="field_day_role_other" name="day_role_other" type="text" value="${escapeHtml(item.day_role_other || '')}">
      </div>
      <div class="field" ${showRecoveryStyle ? '' : 'hidden'}>
        <span class="field-label">Recovery style</span>
        <div class="radio-row">
          ${radioTemplate('recovery_type', RECOVERY_STYLE_OPTIONS, item.recovery_type || 'full_rest')}
        </div>
      </div>
    </section>

    <section class="editor-group">
      <h3>Notes</h3>
      <div class="field" ${dayKind === 'rest_day' || dayKind === 'recovery_day' ? 'hidden' : ''}>
        <label for="field_special_instructions">Instructions for student</label>
        <textarea id="field_special_instructions" name="special_instructions">${escapeHtml(item.special_instructions || '')}</textarea>
      </div>
      <div class="field">
        <label for="field_curator_notes">Curator notes</label>
        <textarea id="field_curator_notes" name="curator_notes">${escapeHtml(item.curriculum_payload?.curator_notes || '')}</textarea>
        <div class="meta-line">Not shown to students</div>
      </div>
      <details class="completion-panel">
        <summary>Override completion rule</summary>
        <div class="field">
          <label for="field_completion_requirement">Completion rule</label>
          <select id="field_completion_requirement" name="completion_requirement">
            ${optionTemplate(COMPLETION_RULE_OPTIONS, item.completion_requirement || dayKindConfig(dayKind).completion)}
          </select>
        </div>
      </details>
    </section>
    ${selectedItemTechnicalPreview(ref)}
  `;

  form.querySelectorAll('input, select, textarea').forEach((control) => {
    if (control.id === 'showPayloadToggle') return;
    control.addEventListener('input', updateSelectedFromEditor);
    control.addEventListener('change', updateSelectedFromEditor);
  });
  $('changeSourceBtn')?.addEventListener('click', () => {
    $('sourceSearch')?.focus();
  });
  $('clearSourceBtn')?.addEventListener('click', clearSource);
  form.querySelectorAll('.remove-append-btn').forEach((button) => {
    button.addEventListener('click', () => removeCompositionPart(Number(button.dataset.appendIndex)));
  });
}

function updateSelectedSectionFromEditor(event) {
  const ref = selectedSectionRef();
  if (!ref) return;
  if (event.target.name === 'section_name') ref.section.name = event.target.value;
  if (event.target.name === 'section_level') ref.section.levelNumber = event.target.value === '' ? null : Number(event.target.value);
  if (event.target.name === 'section_description') ref.section.description = event.target.value;
  touchDraft({ render: false });
}

function updateSelectedFromEditor(event) {
  const ref = selectedItemRef();
  if (!ref) return;
  const { item } = ref;
  const control = event.target;
  const name = control.name;
  if (!name) return;
  if (name === 'day_kind') {
    syncDayKind(item, control.value, { resetCompletion: true });
    if (control.value === 'combined_practice' && compositionParts(item).length && !item.estimated_minutes) {
      item.estimated_minutes = totalEstimatedMinutes(item);
    }
    if (control.value !== 'combined_practice' && item.curriculum_payload?.practice_composition?.length) {
      item.curriculum_payload = { ...(item.curriculum_payload || {}) };
      delete item.curriculum_payload.practice_composition;
      item.estimated_minutes = sourceDefaultMinutes(item);
    }
  } else if (control.type === 'checkbox') {
    item[name] = control.checked;
  } else if (control.type === 'radio') {
    if (!control.checked) return;
    item[name] = control.value;
  } else if (control.type === 'number') {
    item[name] = control.value === '' ? null : Number(control.value);
  } else if (name === 'curator_notes') {
    item.curriculum_payload = { ...(item.curriculum_payload || {}), curator_notes: control.value };
    item.curriculum_payload_raw = JSON.stringify(item.curriculum_payload, null, 2);
  } else {
    item[name] = control.value;
  }
  touchDraft({ render: name === 'day_kind' || name === 'day_role' });
}

function findCourse(id) {
  return state.courses.find((course) => Number(course.cb.id) === Number(id));
}

function assignCourse(courseId, mode = 'main') {
  const ref = selectedItemRef();
  if (!ref) {
    window.alert('Select a day first.');
    return;
  }
  const course = findCourse(courseId);
  if (!course) return;
  const { item } = ref;
  if (mode === 'append') {
    const currentDefault = totalEstimatedMinutes(item);
    const hasCustomTarget = item.estimated_minutes != null && Number(item.estimated_minutes) !== Number(currentDefault);
    const part = {
      role: 'appended_practice',
      sequence_id: course.cb.id,
      title: course.cb.title,
      source_name: course.cb.categoryName,
      source_reference: course.cb.title,
      estimated_minutes: course.cb.estimatedMinutes,
    };
    item.curriculum_payload = {
      ...(item.curriculum_payload || {}),
      practice_composition: [...(item.curriculum_payload?.practice_composition || []), part],
    };
    syncDayKind(item, 'combined_practice', { resetCompletion: true });
    if (!hasCustomTarget) item.estimated_minutes = totalEstimatedMinutes(item);
  } else {
    const hadMainPractice = Boolean(item.sequence_id);
    const previousDefault = sourceDefaultMinutes(item);
    const shouldUseSourceDefault = !hadMainPractice
      || item.estimated_minutes == null
      || Number(item.estimated_minutes) === Number(previousDefault);
    Object.assign(item, {
      sequence_id: course.cb.id,
      source_name: course.cb.categoryName,
      source_key: course.cb.sourceKey,
      source_course: course.cb.subCategoryName,
      source_reference: course.cb.title,
      main_estimated_minutes: course.cb.estimatedMinutes,
      primary_focus: item.primary_focus || course.cb.subCategoryName || course.cb.categoryName,
    });
    if (shouldUseSourceDefault) {
      item.estimated_minutes = dayKindFromItem(item) === 'combined_practice'
        ? totalEstimatedMinutes(item)
        : course.cb.estimatedMinutes;
    }
  }
  touchDraft();
}

function removeCompositionPart(index) {
  const ref = selectedItemRef();
  if (!ref) return;
  const parts = compositionParts(ref.item);
  if (!parts[index]) return;
  const previousDefault = totalEstimatedMinutes(ref.item);
  const hasCustomTarget = ref.item.estimated_minutes != null && Number(ref.item.estimated_minutes) !== Number(previousDefault);
  const nextParts = parts.filter((_, partIndex) => partIndex !== index);
  ref.item.curriculum_payload = {
    ...(ref.item.curriculum_payload || {}),
    practice_composition: nextParts,
  };
  if (!nextParts.length) {
    delete ref.item.curriculum_payload.practice_composition;
    if (dayKindFromItem(ref.item) === 'combined_practice') syncDayKind(ref.item, 'practice', { resetCompletion: true });
  }
  if (!hasCustomTarget) ref.item.estimated_minutes = totalEstimatedMinutes(ref.item);
  touchDraft();
}

function clearSource() {
  const ref = selectedItemRef();
  if (!ref) return;
  Object.assign(ref.item, {
    sequence_id: null,
    source_name: '',
    source_key: '',
    source_course: '',
    source_reference: '',
    main_estimated_minutes: null,
    estimated_minutes: null,
  });
  touchDraft();
}

function addSection() {
  if (!ensureDraft()) return;
  const name = window.prompt('Course or level name', `Course / Level ${state.draft.sections.length + 1}`);
  if (!name) return;
  state.draft.sections.push({
    name,
    levelNumber: state.draft.sections.length + 1,
    open: true,
    weeks: [],
  });
  state.selected = { type: 'section', sectionIndex: state.draft.sections.length - 1 };
  touchDraft();
}

function addWeek() {
  if (!ensureDraft()) return;
  let sectionRef = selectedSectionRef();
  if (!sectionRef) {
    if (!state.draft.sections.length) addSection();
    sectionRef = selectedSectionRef();
  }
  if (!sectionRef) return;
  const nextWeek = Math.max(0, ...state.draft.sections.flatMap((section) => (section.weeks || []).map((week) => Number(week.weekNumber) || 0))) + 1;
  sectionRef.section.weeks.push({ weekNumber: nextWeek, open: true, items: [] });
  state.selected = { type: 'week', sectionIndex: sectionRef.sectionIndex, weekIndex: sectionRef.section.weeks.length - 1 };
  touchDraft();
}

function addItem(rest = false) {
  if (!ensureDraft()) return;
  let weekRef = selectedWeekRef();
  if (!weekRef) {
    addWeek();
    weekRef = selectedWeekRef();
  }
  if (!weekRef) return;
  const dayNumber = (weekRef.week.items || []).length + 1;
  const sectionLevel = weekRef.section.levelNumber || weekRef.sectionIndex + 1;
  const item = rest ? createRestItem() : createItem();
  Object.assign(item, {
    curriculum_slug: state.draft.slug,
    program_name: state.draft.programName,
    week_number: weekRef.week.weekNumber,
    day_number: dayNumber,
    level_number: sectionLevel,
    curriculum_phase: weekRef.section.name,
    curriculum_unit_id: slugify(weekRef.section.name),
  });
  weekRef.week.items.push(item);
  state.selected = {
    type: 'item',
    sectionIndex: weekRef.sectionIndex,
    weekIndex: weekRef.weekIndex,
    itemIndex: weekRef.week.items.length - 1,
  };
  touchDraft();
}

function moveSelected(delta) {
  const ref = selectedItemRef();
  if (!ref) return;
  const items = ref.week.items;
  const targetIndex = ref.itemIndex + delta;
  if (targetIndex < 0 || targetIndex >= items.length) return;
  const [item] = items.splice(ref.itemIndex, 1);
  items.splice(targetIndex, 0, item);
  state.selected.itemIndex = targetIndex;
  renumberWeek(ref.week);
  touchDraft();
}

function duplicateSelected() {
  const ref = selectedItemRef();
  if (!ref) return;
  const clone = structuredClone(ref.item);
  ref.week.items.splice(ref.itemIndex + 1, 0, clone);
  renumberWeek(ref.week);
  state.selected.itemIndex += 1;
  touchDraft();
}

function deleteSelected() {
  const ref = selectedItemRef();
  if (!ref) return;
  ref.week.items.splice(ref.itemIndex, 1);
  renumberWeek(ref.week);
  state.selected = { type: 'week', sectionIndex: ref.sectionIndex, weekIndex: ref.weekIndex };
  touchDraft();
}

function clearSelected() {
  const ref = selectedItemRef();
  if (!ref) return;
  const dayNumber = ref.item.day_number;
  const weekNumber = ref.item.week_number;
  Object.assign(ref.item, createItem({
    curriculum_slug: state.draft.slug,
    program_name: state.draft.programName,
    week_number: weekNumber,
    day_number: dayNumber,
    level_number: ref.section.levelNumber || ref.sectionIndex + 1,
    curriculum_phase: ref.section.name,
    curriculum_unit_id: slugify(ref.section.name),
  }));
  touchDraft();
}

function renumberWeek(week) {
  week.items.forEach((item, index) => {
    item.week_number = week.weekNumber;
    item.day_number = index + 1;
  });
}

function moveItem(from, to) {
  const fromWeek = state.draft.sections[from.sectionIndex]?.weeks?.[from.weekIndex];
  const toWeek = state.draft.sections[to.sectionIndex]?.weeks?.[to.weekIndex];
  if (!fromWeek || !toWeek) return;
  const [item] = fromWeek.items.splice(from.itemIndex, 1);
  const targetIndex = fromWeek === toWeek && from.itemIndex < to.itemIndex ? to.itemIndex - 1 : to.itemIndex;
  toWeek.items.splice(targetIndex, 0, item);
  renumberWeek(fromWeek);
  renumberWeek(toWeek);
  state.selected = { type: 'item', sectionIndex: to.sectionIndex, weekIndex: to.weekIndex, itemIndex: targetIndex };
  touchDraft();
}

function renderValidation() {
  const output = $('validationOutput');
  renderPublishingSummary();
  const errors = state.validation.errors || [];
  const warnings = state.validation.warnings || [];
  if (!errors.length && !warnings.length) {
    output.innerHTML = '<p class="empty-state">No check results yet.</p>';
    return;
  }
  output.innerHTML = `
    ${errors.length ? `<strong class="validation-error">Needs fixing (${errors.length})</strong><ul class="validation-list">${errors.map((entry) => `<li class="validation-error">${escapeHtml(entry.message)}</li>`).join('')}</ul>` : ''}
    ${warnings.length ? `<strong class="validation-warning">Worth reviewing (${warnings.length})</strong><ul class="validation-list">${warnings.map((entry) => `<li class="validation-warning">${escapeHtml(entry.message)}</li>`).join('')}</ul>` : ''}
  `;
}

function runValidation() {
  normalizeDraftForExport();
  if (!state.draft) {
    state.validation = { errors: [{ level: 'error', path: 'curriculum', message: 'No curriculum open.' }], warnings: [] };
  } else {
    state.validation = validateDraft(state.draft, state.courses);
  }
  state.lastValidatedAt = new Date().toISOString();
  renderValidation();
  return state.validation;
}

function renderPublishingSummary() {
  const container = $('publishingSummary');
  const exportButton = $('exportBtn');
  const publishButton = $('publishBtn');
  const validateButton = $('validateBtn');
  if (!container || !exportButton || !publishButton) return;
  if (validateButton) validateButton.textContent = state.lastValidatedAt ? 'Check Curriculum' : 'Check Curriculum *';
  if (!state.draft) {
    container.innerHTML = '<p class="empty-state">Open a curriculum to review it for publishing.</p>';
    exportButton.disabled = true;
    publishButton.disabled = true;
    return;
  }
  const stats = curriculumStats(state.draft);
  const errors = state.validation.errors?.length || 0;
  const warnings = state.validation.warnings?.length || 0;
  exportButton.disabled = false;
  publishButton.disabled = errors > 0;
  container.innerHTML = `
    <div><strong>${escapeHtml(state.draft.programName || 'Untitled curriculum')}</strong></div>
    <div class="meta-line">Internal key: ${escapeHtml(state.draft.slug)}</div>
    <div class="summary-grid">
      <span>${stats.sections} sections</span>
      <span>${stats.weeks} weeks</span>
      <span>${stats.days} days</span>
      <span>${stats.assigned} assigned</span>
      <span>${stats.unassigned} unassigned</span>
      <span>${stats.restDays} rest days</span>
    </div>
    <div class="${errors ? 'validation-error' : 'meta-line'}">${errors ? `Fix ${errors} issue(s) before publishing.` : 'No blocking issues.'}</div>
    <div class="${warnings ? 'validation-warning' : 'meta-line'}">${warnings ? `${warnings} item(s) worth reviewing.` : 'No review warnings yet.'}</div>
    ${state.publishStatus ? `<div class="meta-line">${escapeHtml(state.publishStatus)}</div>` : ''}
  `;
}

function normalizeDraftForExport() {
  (state.draft?.sections || []).forEach((section) => {
    (section.weeks || []).forEach((week) => {
      (week.items || []).forEach((item) => {
        syncDayKind(item, dayKindFromItem(item));
      });
    });
  });
}

function buildPayload(item) {
  const payload = {};
  const composition = compositionParts(item);
  if (composition.length) {
    payload.practice_composition = composition;
    payload.total_duration_minutes = totalEstimatedMinutes(item);
    payload.composed_total_duration_minutes = totalEstimatedMinutes(item);
  }
  if (item.curriculum_payload?.curator_notes) payload.curator_notes = item.curriculum_payload.curator_notes;
  if (item.recovery_type) payload.recovery_type = item.recovery_type;
  return payload;
}

function buildRow(draft, item, section, week, sectionIndex, weekIndex, itemIndex) {
  const kind = dayKindFromItem(item);
  const config = dayKindConfig(kind);
  const mainCourse = item.sequence_id ? findCourse(item.sequence_id) : null;
  const sourceFields = sourceFieldsFromCourse(mainCourse);
  const levelNumber = section.levelNumber ?? null;
  return {
    curriculum_slug: draft.slug,
    program_name: draft.programName,
    week_number: week.weekNumber,
    day_number: item.day_number ?? itemIndex + 1,
    order_index: computeOrderIndex(sectionIndex, weekIndex, itemIndex),
    node_type: config.nodeType,
    sequence_id: item.sequence_id || null,
    source_name: sourceFields.source_name,
    source_key: sourceFields.source_key,
    source_course: sourceFields.source_course,
    source_reference: sourceFields.source_reference,
    practice_track: inferPracticeTrack(mainCourse),
    curriculum_phase: section.name || null,
    intensity: item.intensity || null,
    primary_focus: item.primary_focus || null,
    special_instructions: item.special_instructions || null,
    requires_user_selection: kind === 'student_choice',
    is_rest_day: kind === 'rest_day',
    is_active: true,
    is_revision_node: kind === 'revision',
    completion_requirement: item.completion_requirement || config.completion,
    level_number: levelNumber,
    curriculum_payload: buildPayload(item),
    day_role: item.day_role === 'other' ? (item.day_role_other || 'other') : (item.day_role || null),
    recovery_type: (kind === 'rest_day' || kind === 'recovery_day') ? (item.recovery_type || null) : null,
    is_visible: true,
    source_policy: item.source_policy || null,
    source_sequence_order: item.source_sequence_order ?? null,
    estimated_minutes: item.estimated_minutes ?? null,
    curriculum_unit_id: slugify(section.name) || null,
    adaptive_behavior: item.adaptive_behavior || {},
  };
}

function buildRows(draft = state.draft) {
  normalizeDraftForExport();
  const rows = [];
  (draft.sections || []).forEach((section, sectionIndex) => {
    (section.weeks || []).forEach((week, weekIndex) => {
      (week.items || []).forEach((item, itemIndex) => {
        rows.push(buildRow(draft, item, section, week, sectionIndex, weekIndex, itemIndex));
      });
    });
  });
  return rows;
}

async function publishCurriculum() {
  if (!ensureDraft()) return;
  await state.autosaver?.flush();
  const validation = runValidation();
  if (validation.errors.length) {
    state.publishStatus = 'Fix the listed issues before publishing.';
    renderPublishingSummary();
    return;
  }
  if (validation.warnings.length && !window.confirm(`${validation.warnings.length} warning(s) found. Publish anyway?`)) {
    state.publishStatus = 'Publish cancelled.';
    renderPublishingSummary();
    return;
  }
  if (!supabase) {
    state.publishStatus = 'Supabase is not configured. Publish is unavailable.';
    renderPublishingSummary();
    return;
  }

  const rows = buildRows(state.draft);
  state.publishStatus = 'Publishing...';
  renderPublishingSummary();

  try {
    const { error: deleteError } = await supabase
      .from('program_curriculum')
      .delete()
      .eq('curriculum_slug', state.draft.slug);
    if (deleteError) throw deleteError;

    if (rows.length) {
      const { error: insertError } = await supabase
        .from('program_curriculum')
        .insert(rows);
      if (insertError) throw insertError;
    }

    state.publishStatus = `Published ${rows.length} row(s).`;
  } catch (error) {
    console.error(error);
    state.publishStatus = error?.message || 'Publish failed.';
  }
  renderPublishingSummary();
}

async function downloadExport() {
  if (!ensureDraft()) return;
  await state.autosaver?.flush();
  const validation = runValidation();
  if (validation.errors.length) return;
  const rows = buildRows(state.draft);
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${state.draft.slug}_draft_${date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderAll() {
  renderStartScreen();
  renderDraftMeta();
  renderSources();
  renderStructure();
  renderEditor();
  renderValidation();
}

function setDraft(draft) {
  state.draft = draft;
  state.selected = draft.sections?.[0]?.weeks?.[0]?.items?.[0]
    ? { type: 'item', sectionIndex: 0, weekIndex: 0, itemIndex: 0 }
    : null;
  state.autosaver = createAutosaver({
    getDraft: () => state.draft,
    onSaving: setSaving,
    onSaved: (savedDraft) => {
      setSaved(savedDraft);
      void refreshDraftList();
    },
    onError: setSaveError,
  });
  setSaved(draft);
  renderAll();
}

function newDraftDialog() {
  if (state.draft && !confirmLeaveDraft('Some changes have not saved yet. Create a new curriculum anyway?')) return;
  $('createDialogError').textContent = '';
  $('createForm').reset();
  renderSlugPreview();
  renderCreateShapeFields();
  $('createDialog').showModal();
  $('curriculumNameInput').focus();
}

function renderSlugPreview() {
  const name = $('curriculumNameInput').value.trim();
  const slug = name ? curriculumSlugFromName(name) : '';
  $('slugPreview').textContent = slug
    ? `Internal key: ${slug}. You do not need to edit this.`
    : 'Internal key will be created automatically.';
}

function renderCreateShapeFields() {
  const selected = document.querySelector('input[name="starterShape"]:checked')?.value;
  document.querySelector('.custom-shape').hidden = selected !== 'custom';
}

function selectCustomStarterShape() {
  const custom = document.querySelector('input[name="starterShape"][value="custom"]');
  if (custom && !custom.checked) {
    custom.checked = true;
    renderCreateShapeFields();
  }
}

function hasUnsavedDraftChanges() {
  return Boolean(state.autosaver?.isUnsaved());
}

function confirmLeaveDraft(message = 'Some changes have not saved yet. Leave this curriculum anyway?') {
  return !hasUnsavedDraftChanges() || window.confirm(message);
}

async function returnToStartScreen() {
  if (!confirmLeaveDraft('Some changes have not saved yet. Return to your curricula anyway?')) return;
  state.draft = null;
  state.selected = null;
  state.autosaver = null;
  await refreshDraftList();
  renderAll();
}

async function createCurriculumFromDialog(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const programName = String(formData.get('curriculumName') || '').trim();
  if (!programName) {
    $('createDialogError').textContent = 'Please name the curriculum.';
    return;
  }
  const description = String(formData.get('curriculumDescription') || '').trim();
  const starterShape = String(formData.get('starterShape') || 'starter_week');
  const sectionCount = starterShape === 'custom' ? Number(formData.get('customSections')) : 1;
  const weeks = starterShape === 'standard_term' ? 12 : starterShape === 'custom' ? Number(formData.get('customWeeks')) : 1;
  const days = starterShape === 'custom' ? Number(formData.get('customDays')) : 7;
  if (starterShape === 'custom' && (!sectionCount || !weeks || !days)) {
    $('createDialogError').textContent = 'For Custom, choose sections, weeks, and days.';
    return;
  }
  const slug = uniqueCurriculumSlug(programName);
  const draft = createEmptyDraft(slug, programName, {
    description,
    sections: createStarterSections(starterShape, sectionCount, weeks, days),
  });
  $('createDialog').close();
  setDraft(draft);
  state.autosaver?.schedule();
}

async function openCurriculum(slug) {
  if (!confirmLeaveDraft('Some changes have not saved yet. Open another curriculum anyway?')) return;
  try {
    const draft = await loadDraft(slug);
    if (draft) setDraft(draft);
  } catch (error) {
    console.error(error);
    window.alert(error?.message || 'Could not open this curriculum.');
  }
}

async function duplicateCurriculum(slug) {
  const summary = state.draftSummaries.find((draft) => draft.slug === slug);
  const programName = `${summary?.name || summary?.programName || slug} (copy)`;
  try {
    const copy = await duplicateDraft(slug, programName);
    if (copy) {
      setDraft(copy);
      await refreshDraftList();
    }
  } catch (error) {
    console.error(error);
    window.alert(error?.message || 'Could not duplicate this curriculum.');
  }
}

async function removeCurriculum(slug) {
  const summary = state.draftSummaries.find((draft) => draft.slug === slug);
  const name = summary?.name || summary?.programName || state.draft?.programName || slug;
  if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    await deleteDraft(slug);
    if (state.draft?.slug === slug) {
      state.draft = null;
      state.selected = null;
      state.autosaver = null;
    }
    await refreshDraftList();
    renderAll();
  } catch (error) {
    console.error(error);
    window.alert(error?.message || 'Could not delete this curriculum.');
  }
}

function deleteDraftDialog() {
  if (!state.draft) return renderStartScreen();
  removeCurriculum(state.draft.slug);
}

function bindEvents() {
  $('sourceSearch').addEventListener('input', renderSources);
  $('newDraftBtn').addEventListener('click', newDraftDialog);
  $('startNewBtn').addEventListener('click', newDraftDialog);
  $('breadcrumbHomeBtn').addEventListener('click', returnToStartScreen);
  $('createForm').addEventListener('submit', createCurriculumFromDialog);
  $('cancelCreateBtn').addEventListener('click', () => $('createDialog').close());
  $('curriculumNameInput').addEventListener('input', renderSlugPreview);
  document.querySelectorAll('input[name="starterShape"]').forEach((input) => {
    input.addEventListener('change', renderCreateShapeFields);
  });
  ['customSectionsInput', 'customWeeksInput', 'customDaysInput'].forEach((id) => {
    $(id).addEventListener('input', selectCustomStarterShape);
    $(id).addEventListener('focus', selectCustomStarterShape);
  });
  $('validateBtn').addEventListener('click', runValidation);
  $('publishBtn').addEventListener('click', publishCurriculum);
  $('exportBtn').addEventListener('click', downloadExport);
  $('addSectionBtn').addEventListener('click', addSection);
  $('addWeekBtn').addEventListener('click', addWeek);
  $('addItemBtn').addEventListener('click', () => addItem(false));
  $('addRestBtn').addEventListener('click', () => addItem(true));
  $('moveUpBtn').addEventListener('click', () => moveSelected(-1));
  $('moveDownBtn').addEventListener('click', () => moveSelected(1));
  $('duplicateBtn').addEventListener('click', duplicateSelected);
  $('clearBtn').addEventListener('click', clearSelected);
  $('deleteBtn').addEventListener('click', deleteSelected);
  window.addEventListener('beforeunload', (event) => {
    if (!state.autosaver?.isUnsaved()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function init() {
  const authorized = await checkAuthorization();
  if (!authorized) {
    $('authGate').hidden = false;
    return;
  }
  $('app').hidden = false;
  bindEvents();
  try {
    state.courses = await fetchCourses();
  } catch (error) {
    console.error(error);
    $('sourceList').innerHTML = '<p class="empty-state">Could not load source library.</p>';
  }
  state.categories = new Set(state.courses.map((course) => course.cb.categoryName));
  state.activeCategories = new Set(state.categories);
  renderCategoryFilters();
  await refreshDraftList();
  renderAll();
}

init();
