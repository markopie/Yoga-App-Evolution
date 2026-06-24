import { supabase } from '../../src/services/supabaseClient.js';

const RETRY_DELAY_MS = 5000;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeDraft(draft = {}) {
  return {
    ...draft,
    slug: draft.slug || draft.curriculum_slug || '',
    programName: draft.programName || draft.name || 'Untitled curriculum',
    description: draft.description || '',
    sections: Array.isArray(draft.sections) ? draft.sections : [],
  };
}

function statsFromDraftData(draftData = {}) {
  const sections = Array.isArray(draftData.sections) ? draftData.sections : [];
  const weeks = sections.flatMap((section) => section.weeks || []);
  const days = weeks.flatMap((week) => week.items || []);
  const practicesAssigned = days.reduce((count, day) => {
    const composition = Array.isArray(day?.curriculum_payload?.practice_composition)
      ? day.curriculum_payload.practice_composition
      : [];
    return count + (day?.sequence_id ? 1 : 0) + composition.filter((part) => part?.sequence_id).length;
  }, 0);
  return {
    sections: sections.length,
    weeks: weeks.length,
    days: days.length,
    practicesAssigned,
  };
}

function rowToDraft(row) {
  if (!row) return null;
  const draft = normalizeDraft({
    ...(row.draft_data || {}),
    slug: row.curriculum_slug,
    programName: row.name,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return draft;
}

function rowToSummary(row) {
  return {
    id: row.id,
    slug: row.curriculum_slug,
    programName: row.name,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stats: statsFromDraftData(row.draft_data || {}),
  };
}

async function currentUserId() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Drafts cannot be saved.');
  }

  if (typeof supabase.auth.getUser === 'function') {
    const { data, error } = await supabase.auth.getUser();
    if (error && !/session/i.test(error.message || '')) throw error;
    if (data?.user?.id) return data.user.id;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data?.session?.user?.id;
  if (!userId) {
    throw new Error('Sign in to save curriculum drafts to your account.');
  }
  return userId;
}

export async function loadDraftList() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Drafts cannot be loaded.');
  }
  await currentUserId();
  const { data, error } = await supabase
    .from('curriculum_drafts')
    .select('id,curriculum_slug,name,description,draft_data,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToSummary);
}

export async function loadDraft(slug) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Drafts cannot be loaded.');
  }
  await currentUserId();
  const { data, error } = await supabase
    .from('curriculum_drafts')
    .select('id,curriculum_slug,name,description,draft_data,created_at,updated_at')
    .eq('curriculum_slug', slug)
    .maybeSingle();
  if (error) throw error;
  return rowToDraft(data);
}

export async function saveDraft(slug, name, description, draftData) {
  const userId = await currentUserId();
  const draft = normalizeDraft({
    ...clone(draftData),
    slug,
    programName: name,
    description,
  });
  const row = {
    user_id: userId,
    curriculum_slug: slug,
    name,
    description: description || null,
    draft_data: draft,
  };
  const { data, error } = await supabase
    .from('curriculum_drafts')
    .upsert(row, { onConflict: 'user_id,curriculum_slug' })
    .select('id,curriculum_slug,name,description,draft_data,created_at,updated_at')
    .single();
  if (error) throw error;
  return rowToDraft(data);
}

export async function deleteDraft(slug) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Drafts cannot be deleted.');
  }
  await currentUserId();
  const { error } = await supabase
    .from('curriculum_drafts')
    .delete()
    .eq('curriculum_slug', slug);
  if (error) throw error;
}

export async function duplicateDraft(slug, newName) {
  const source = await loadDraft(slug);
  if (!source) return null;
  const summaries = await loadDraftList();
  const existing = new Set(summaries.map((draft) => draft.slug));
  const base = slugify(newName) || `${source.slug}_copy`;
  let nextSlug = base;
  let suffix = 2;
  while (existing.has(nextSlug)) {
    nextSlug = `${base}_${suffix}`;
    suffix += 1;
  }
  const now = new Date().toISOString();
  const copy = {
    ...clone(source),
    slug: nextSlug,
    programName: newName,
    description: source.description || '',
    createdAt: now,
    updatedAt: now,
  };
  return saveDraft(nextSlug, newName, copy.description, copy);
}

export function createEmptyDraft(slug, programName, overrides = {}) {
  const now = new Date().toISOString();
  return normalizeDraft({
    slug,
    programName,
    createdAt: now,
    updatedAt: now,
    sections: [],
    ...overrides,
  });
}

export function createAutosaver({
  getDraft,
  onSaving,
  onSaved,
  onError,
  delay = 2000,
  retryDelay = RETRY_DELAY_MS,
}) {
  let timeoutId = null;
  let retryId = null;
  let savePromise = null;
  let revision = 0;
  let savedRevision = 0;
  let latestDraft = null;
  let lastError = null;

  function clearRetry() {
    if (retryId) window.clearTimeout(retryId);
    retryId = null;
  }

  async function saveLatest() {
    if (savePromise) return savePromise;
    if (!latestDraft) latestDraft = clone(getDraft());
    const draftToSave = clone(latestDraft);
    const saveRevision = revision;
    if (!draftToSave?.slug) return null;
    if (typeof onSaving === 'function') onSaving();
    clearRetry();
    savePromise = saveDraft(
      draftToSave.slug,
      draftToSave.programName || 'Untitled curriculum',
      draftToSave.description || '',
      draftToSave,
    )
      .then((savedDraft) => {
        lastError = null;
        if (saveRevision === revision) {
          savedRevision = saveRevision;
          latestDraft = null;
          if (typeof onSaved === 'function') onSaved(savedDraft);
        } else {
          latestDraft = clone(getDraft());
          window.setTimeout(saveLatest, 0);
        }
        return savedDraft;
      })
      .catch((error) => {
        lastError = error;
        if (typeof onError === 'function') onError(error);
        clearRetry();
        retryId = window.setTimeout(saveLatest, retryDelay);
        throw error;
      })
      .finally(() => {
        savePromise = null;
      });
    return savePromise;
  }

  function schedule() {
    revision += 1;
    latestDraft = clone(getDraft());
    if (typeof onSaving === 'function') onSaving();
    if (timeoutId) window.clearTimeout(timeoutId);
    clearRetry();
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      saveLatest().catch(() => {});
    }, delay);
  }

  async function flush() {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = null;
    if (revision === savedRevision && !latestDraft) return getDraft();
    try {
      return await saveLatest();
    } catch {
      return getDraft();
    }
  }

  function isUnsaved() {
    return revision !== savedRevision || Boolean(latestDraft) || Boolean(savePromise) || Boolean(lastError);
  }

  function getLastError() {
    return lastError;
  }

  return { schedule, flush, isUnsaved, getLastError };
}
