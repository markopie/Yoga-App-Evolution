/**
 * PROTOTYPE ONLY – curriculum-roadmap
 * No Supabase calls. No production app imports. Mock data only.
 *
 * ── Real DB shape reference (qrcpiyncvfmpmeuyhsha) ──────────────────────────
 *
 * program_curriculum: id (bigint PK), curriculum_slug, week_number, day_number,
 *   order_index, sequence_id → courses.id, node_type, is_revision_node,
 *   special_instructions, source_name, source_reference, level_number,
 *   intensity, primary_focus, is_active
 *
 * sequence_completions: id, curriculum_node_id → program_curriculum.id,
 *   sequence_id, rating (1–5), status, completed_at, duration_seconds,
 *   duration_scale_used, planned_duration_minutes, actual_adjusted_duration_minutes
 *
 * completion_rating_options: rating 1–5, label (Too Much / Challenging /
 *   Balanced / Comfortable / Ready for More), subtitle
 *
 * course_sequence_analysis: course_id, total_duration_minutes, intensity_band,
 *   primary_theme, secondary_theme
 *
 * curriculum_payload.practice_composition roles (confirmed in curriculumUI.js):
 *   primary_asana | appended_pranayama | quiet_asana | light_asana | primary_pranayama
 *
 * ── Future RPC ───────────────────────────────────────────────────────────────
 * get_curriculum_roadmap(p_user_id uuid, p_curriculum_slug text)
 * Should return the full graph + completion state + duration + composition
 * denormalized, matching the shape of MOCK_ROADMAP below.
 */

// ─── Source name map ──────────────────────────────────────────────────────────
// Maps internal source_key / source_name values to canonical user-facing labels.
const SOURCE_LABELS = {
  light_on_yoga:        'Light on Yoga',
  light_on_pranayama:   'Light on Pranayama',
  yoga_dipika_extra:    'Light on Yoga',       // not user-facing as separate source
  iyengar_way:          'Yoga: The Iyengar Way',
  gem_for_women:        'Yoga: A Gem for Women',
  how_to_use_yoga:      'How to Use Yoga',
};

function sourceLabel(key) {
  return SOURCE_LABELS[key] || null;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
//
// node_type uses real vocabulary from seed_integrated_curriculum_v1.mjs:
//   sequence | revision | rest | choice
//
// level_number maps to display grouping (Foundation / Development / Deepening)
// — a display convention, not a DB concept.
//
// curriculum_node_id uses integers to match program_curriculum.id (bigint).
// Internal IDs are never rendered to the user.
//
// duration_minutes comes from course_sequence_analysis.total_duration_minutes.
// It is omitted where not yet computed.
//
// [SPECULATIVE] fields (is_optional, is_locked, metadata flags) have been
// removed. Status is derived from completion state only.

const MOCK_ROADMAP = {
  curriculum_slug: 'iyengar_integrated_master_path_draft_v1',
  program_name: 'Integrated Iyengar Practice Path',

  summary: {
    current_node_id: 14,         // program_curriculum.id of today's node
    current_week_number: 5,
    current_day_number: 3,
    total_nodes: 84,
    completed_nodes: 18,
    level_display: 'Level 2 – Development',
  },

  // Levels map to program_curriculum.level_number.
  // The label is a display convention; it does not exist in the DB.
  levels: [
    {
      level_number: 1,
      label: 'Foundation',
      status: 'complete',
      weeks: [
        {
          week_number: 1,
          status: 'complete',
          nodes: [
            {
              id: 1,
              week_number: 1,
              day_number: 1,
              title: 'Standing Poses',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 1, Sequence 1',
              duration_minutes: 45,
              status: 'complete',
              rating: 4,
              intensity_band: 'light',
              primary_theme: 'Standing and Basic',
              curriculum_payload: null,
            },
            {
              id: 2,
              week_number: 1,
              day_number: 2,
              title: 'Rest Day',
              node_type: 'rest',
              source_name: null,
              source_reference: null,
              duration_minutes: null,
              status: 'complete',
              rating: null,
              intensity_band: null,
              primary_theme: null,
              curriculum_payload: null,
            },
            {
              id: 3,
              week_number: 1,
              day_number: 3,
              title: 'Seated Forward Bends',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 1, Sequence 2',
              duration_minutes: 50,
              status: 'complete',
              rating: 5,
              intensity_band: 'moderate',
              primary_theme: 'Forward Bends',
              curriculum_payload: null,
            },
          ],
        },
        {
          week_number: 2,
          status: 'complete',
          nodes: [
            {
              id: 4,
              week_number: 2,
              day_number: 1,
              title: 'Standing Poses & Ujjayi Pranayama',
              node_type: 'sequence',
              source_name: null,
              source_reference: null,
              duration_minutes: 60,
              status: 'complete',
              rating: 3,
              intensity_band: 'moderate',
              primary_theme: 'Standing and Basic',
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: 'primary_asana',
                    title: 'Standing Poses – Set 2',
                    source_name: 'Light on Yoga',
                    duration_minutes: 45,
                    counts_for_source_completion: true,
                  },
                  {
                    part_number: 2,
                    role: 'appended_pranayama',
                    title: 'Ujjayi Introduction',
                    source_name: 'Light on Pranayama',
                    duration_minutes: 15,
                    counts_for_source_completion: true,
                  },
                ],
                total_duration_minutes: 60,
              },
            },
            {
              id: 5,
              week_number: 2,
              day_number: 2,
              title: 'Revision Practice',
              node_type: 'revision',
              source_name: 'Light on Yoga',
              source_reference: 'Week 2',
              duration_minutes: 50,
              status: 'complete',
              rating: 4,
              intensity_band: 'light',
              primary_theme: 'Standing and Basic',
              curriculum_payload: null,
            },
            {
              id: 6,
              week_number: 2,
              day_number: 3,
              title: 'Inversions Introduction',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 2, Optional',
              duration_minutes: 35,
              status: 'complete',
              rating: 5,
              intensity_band: 'strong',
              primary_theme: 'Inversions',
              curriculum_payload: null,
            },
          ],
        },
        {
          week_number: 3,
          status: 'complete',
          nodes: [
            {
              id: 7,
              week_number: 3,
              day_number: 1,
              title: 'Backbend Foundations',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 3',
              duration_minutes: 55,
              status: 'complete',
              rating: 4,
              intensity_band: 'moderate',
              primary_theme: 'Backbends',
              curriculum_payload: null,
            },
            {
              id: 8,
              week_number: 3,
              day_number: 2,
              title: 'Foundation Review',
              node_type: 'revision',
              source_name: 'Light on Yoga',
              source_reference: 'Phase 1',
              duration_minutes: 75,
              status: 'complete',
              rating: 5,
              intensity_band: 'moderate',
              primary_theme: 'Mixed',
              curriculum_payload: null,
            },
          ],
        },
      ],
    },

    {
      level_number: 2,
      label: 'Development',
      status: 'current',
      weeks: [
        {
          week_number: 4,
          status: 'complete',
          nodes: [
            {
              id: 9,
              week_number: 4,
              day_number: 1,
              title: 'Extended Standing Cycle',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 4',
              duration_minutes: 60,
              status: 'complete',
              rating: 3,
              intensity_band: 'moderate',
              primary_theme: 'Standing and Basic',
              curriculum_payload: null,
            },
            {
              id: 10,
              week_number: 4,
              day_number: 2,
              title: 'Rest Day',
              node_type: 'rest',
              source_name: null,
              source_reference: null,
              duration_minutes: null,
              status: 'complete',
              rating: null,
              intensity_band: null,
              primary_theme: null,
              curriculum_payload: null,
            },
            {
              id: 11,
              week_number: 4,
              day_number: 3,
              title: 'Twists & Nadi Shodhana',
              node_type: 'sequence',
              source_name: null,
              source_reference: null,
              duration_minutes: 65,
              status: 'complete',
              rating: 4,
              intensity_band: 'moderate',
              primary_theme: 'Twists',
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: 'primary_asana',
                    title: 'Twists Sequence',
                    source_name: 'Light on Yoga',
                    duration_minutes: 50,
                    counts_for_source_completion: true,
                  },
                  {
                    part_number: 2,
                    role: 'appended_pranayama',
                    title: 'Nadi Shodhana – Stage 1',
                    source_name: 'Light on Pranayama',
                    duration_minutes: 15,
                    counts_for_source_completion: true,
                  },
                ],
                total_duration_minutes: 65,
              },
            },
          ],
        },
        {
          week_number: 5,
          status: 'current',
          nodes: [
            {
              id: 12,
              week_number: 5,
              day_number: 1,
              title: 'Shoulder Girdle Opening',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 5',
              duration_minutes: 55,
              status: 'complete',
              rating: 3,
              intensity_band: 'moderate',
              primary_theme: 'Standing and Basic',
              curriculum_payload: null,
            },
            {
              id: 13,
              week_number: 5,
              day_number: 2,
              title: 'Hip Opening',
              node_type: 'sequence',
              source_name: 'Yoga: The Iyengar Way',
              source_reference: 'Chapter 4',
              duration_minutes: 50,
              status: 'complete',
              rating: 2,
              intensity_band: 'moderate',
              primary_theme: 'Forward Bends',
              curriculum_payload: null,
            },
            {
              id: 14,          // ← current node
              week_number: 5,
              day_number: 3,
              title: 'Extended Backbends & Ujjayi',
              node_type: 'sequence',
              source_name: null,
              source_reference: null,
              duration_minutes: 70,
              status: 'current',
              rating: null,
              intensity_band: 'strong',
              primary_theme: 'Backbends',
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: 'primary_asana',
                    title: 'Extended Backbend Practice',
                    source_name: 'Light on Yoga',
                    duration_minutes: 50,
                    counts_for_source_completion: true,
                  },
                  {
                    part_number: 2,
                    role: 'appended_pranayama',
                    title: 'Ujjayi – Extended Ratio Work',
                    source_name: 'Light on Pranayama',
                    duration_minutes: 20,
                    counts_for_source_completion: true,
                  },
                ],
                total_duration_minutes: 70,
              },
            },
          ],
        },
        {
          week_number: 6,
          status: 'upcoming',
          nodes: [
            {
              id: 15,
              week_number: 6,
              day_number: 1,
              title: 'Supine Sequence',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 6',
              duration_minutes: 55,
              status: 'upcoming',
              rating: null,
              intensity_band: 'light',
              primary_theme: 'Forward Bends',
              curriculum_payload: null,
            },
            {
              id: 16,
              week_number: 6,
              day_number: 2,
              title: 'Revision Practice',
              node_type: 'revision',
              source_name: 'Light on Yoga',
              source_reference: 'Level 2',
              duration_minutes: 60,
              status: 'upcoming',
              rating: null,
              intensity_band: 'light',
              primary_theme: null,
              curriculum_payload: null,
            },
          ],
        },
      ],
    },

    {
      level_number: 3,
      label: 'Deepening',
      status: 'upcoming',
      weeks: [
        {
          week_number: 7,
          status: 'upcoming',
          nodes: [
            {
              id: 17,
              week_number: 7,
              day_number: 1,
              title: 'Advanced Inversions',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 7',
              duration_minutes: 65,
              status: 'upcoming',
              rating: null,
              intensity_band: 'advanced',
              primary_theme: 'Inversions',
              curriculum_payload: null,
            },
            {
              id: 18,
              week_number: 7,
              day_number: 2,
              title: 'Pranayama Practice',
              node_type: 'sequence',
              source_name: 'Light on Pranayama',
              source_reference: 'Week 7',
              duration_minutes: 80,
              status: 'upcoming',
              rating: null,
              intensity_band: 'strong',
              primary_theme: 'Pranayama',
              curriculum_payload: null,
            },
          ],
        },
        {
          week_number: 8,
          status: 'upcoming',
          nodes: [
            {
              id: 19,
              week_number: 8,
              day_number: 1,
              title: 'Full Standing Programme',
              node_type: 'sequence',
              source_name: 'Light on Yoga',
              source_reference: 'Week 8',
              duration_minutes: 75,
              status: 'upcoming',
              rating: null,
              intensity_band: 'advanced',
              primary_theme: 'Standing and Basic',
              curriculum_payload: null,
            },
          ],
        },
      ],
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(mins) {
  if (!mins) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// Maps program_curriculum.node_type to a friendly display label
function nodeTypeLabel(node) {
  if (node.node_type === 'rest') return 'Rest Day';
  if (node.node_type === 'revision') return 'Revision Practice';
  if (node.node_type === 'choice') return 'Your Choice';
  const comp = node.curriculum_payload?.practice_composition;
  if (Array.isArray(comp) && comp.length > 1) return 'Combined Practice';
  return null; // sequence — just show the title
}

// Maps curriculum_payload.practice_composition role to a friendly label
// Matches curriculumUI.js role vocabulary exactly.
function roleLabel(role) {
  const labels = {
    primary_asana:          'Asana',
    appended_pranayama:     'Short Pranayama',
    quiet_asana:            'Quiet Asana',
    light_asana:            'Light Asana',
    primary_pranayama:      'Pranayama',
    supplemental_pranayama: 'Pranayama',
  };
  return labels[role] || String(role || '').replace(/_/g, ' ');
}

// Maps intensity_band to a friendly label
function intensityLabel(band) {
  const labels = {
    restorative: 'Restorative',
    light:       'Light',
    moderate:    'Moderate',
    strong:      'Strong',
    advanced:    'Advanced',
  };
  return labels[band] || null;
}

// Maps rating integer to completion_rating_options label + subtitle
function ratingMeta(rating) {
  const map = {
    1: { label: 'Too Much',       subtitle: 'Heavy' },
    2: { label: 'Challenging',    subtitle: 'Effortful' },
    3: { label: 'Balanced',       subtitle: 'Right level' },
    4: { label: 'Comfortable',    subtitle: 'Fluid' },
    5: { label: 'Ready for More', subtitle: 'Strong' },
  };
  return map[rating] || null;
}

function renderStars(rating) {
  if (rating == null) return '';
  const meta = ratingMeta(rating);
  const title = meta ? `${meta.label} – ${meta.subtitle}` : `${rating}/5`;
  let html = `<span class="cr-stars" aria-label="${esc(title)}" title="${esc(title)}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${i <= rating ? 'cr-star--filled' : 'cr-star--empty'}">★</span>`;
  }
  html += '</span>';
  return html;
}

// ─── Today hero card ──────────────────────────────────────────────────────────

function renderTodayHero(data) {
  const { summary, levels } = data;
  let currentNode = null;
  for (const level of levels) {
    for (const week of level.weeks) {
      for (const node of week.nodes) {
        if (node.id === summary.current_node_id) {
          currentNode = node;
          break;
        }
      }
    }
  }
  if (!currentNode) return '';

  const comp = currentNode.curriculum_payload?.practice_composition;
  const isComposed = Array.isArray(comp) && comp.length > 1;
  const dur = formatDuration(currentNode.duration_minutes);
  const typeLabel = nodeTypeLabel(currentNode);

  const partsHtml = isComposed
    ? comp.map(p => `
        <div class="cr-hero-part">
          <span class="cr-hero-part-num">Part ${p.part_number}</span>
          <span class="cr-hero-part-role">${esc(roleLabel(p.role))}</span>
          <span class="cr-hero-part-title">${esc(p.title)}</span>
          ${p.source_name ? `<span class="cr-hero-part-source">${esc(p.source_name)}</span>` : ''}
          ${p.duration_minutes ? `<span class="cr-hero-part-dur">${formatDuration(p.duration_minutes)}</span>` : ''}
        </div>`).join('')
    : '';

  const metaItems = [
    dur ? `<span class="cr-hero-meta-item">${esc(dur)}</span>` : '',
    currentNode.source_name ? `<span class="cr-hero-meta-item">${esc(currentNode.source_name)}</span>` : '',
    currentNode.intensity_band && !isComposed ? `<span class="cr-hero-meta-item cr-hero-meta-intensity">${esc(intensityLabel(currentNode.intensity_band))}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="cr-today">
      <div class="cr-today-eyebrow">Today's Practice &nbsp;·&nbsp; Week ${summary.current_week_number}, Day ${summary.current_day_number}</div>
      <div class="cr-today-title">${esc(currentNode.title)}</div>
      ${typeLabel ? `<div class="cr-today-type">${esc(typeLabel)}</div>` : ''}
      ${metaItems ? `<div class="cr-today-meta">${metaItems}</div>` : ''}
      ${isComposed ? `<div class="cr-hero-parts">${partsHtml}</div>` : ''}
      <div class="cr-today-action">
        <button class="cr-today-btn" onclick="alert('Prototype only — navigation not wired.')">Begin Practice</button>
      </div>
    </div>`;
}

// ─── Summary strip ─────────────────────────────────────────────────────────────

function renderSummary(summary) {
  const pct = Math.round((summary.completed_nodes / summary.total_nodes) * 100);
  return `
    <div class="cr-summary">
      <div class="cr-summary-stats">
        <div class="cr-stat">
          <span class="cr-stat-label">Position</span>
          <span class="cr-stat-value">Week ${summary.current_week_number} · Day ${summary.current_day_number}</span>
        </div>
        <div class="cr-stat">
          <span class="cr-stat-label">Completed</span>
          <span class="cr-stat-value">${summary.completed_nodes} <span class="cr-stat-of">of ${summary.total_nodes}</span></span>
          <span class="cr-stat-sub">${pct}% of the programme</span>
        </div>
        <div class="cr-stat">
          <span class="cr-stat-label">Current stage</span>
          <span class="cr-stat-value">${esc(summary.level_display)}</span>
        </div>
      </div>
      <div class="cr-progress-bar-wrap" aria-label="Programme progress: ${pct}%">
        <div class="cr-progress-bar">
          <div class="cr-progress-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
    </div>`;
}

// ─── Node cards ───────────────────────────────────────────────────────────────

function renderNodeParts(node) {
  const comp = node.curriculum_payload?.practice_composition;
  if (!Array.isArray(comp) || comp.length <= 1) return '';
  const rows = comp.map(p => `
    <div class="cr-node-part">
      <span class="cr-node-part-label">${esc(roleLabel(p.role))}</span>
      <span class="cr-node-part-title">${esc(p.title)}</span>
      ${p.source_name ? `<span class="cr-node-part-source">${esc(p.source_name)}</span>` : ''}
    </div>`).join('');
  return `<div class="cr-node-parts">${rows}</div>`;
}

function renderNode(node, currentNodeId, levelStatus) {
  const isCurrent = node.id === currentNodeId;
  const isComplete = node.status === 'complete';
  const isUpcoming = node.status === 'upcoming';
  const isRest = node.node_type === 'rest';

  const typeLabel = nodeTypeLabel(node);
  const dur = formatDuration(node.duration_minutes);
  const parts = renderNodeParts(node);

  // Status chip
  let chipHtml = '';
  if (isCurrent) {
    chipHtml = '<span class="cr-chip cr-chip--current">Today</span>';
  } else if (isRest) {
    chipHtml = '<span class="cr-chip cr-chip--rest">Rest</span>';
  } else if (node.node_type === 'revision') {
    chipHtml = '<span class="cr-chip cr-chip--revision">Revision</span>';
  } else if (node.node_type === 'choice') {
    chipHtml = '<span class="cr-chip cr-chip--choice">Your Choice</span>';
  } else if (isComplete) {
    chipHtml = '<span class="cr-chip cr-chip--done">Done</span>';
  } else if (isUpcoming && levelStatus === 'upcoming') {
    chipHtml = '<span class="cr-chip cr-chip--ahead">Ahead</span>';
  } else if (isUpcoming) {
    chipHtml = '<span class="cr-chip cr-chip--upcoming">Coming up</span>';
  }

  const starsHtml = isComplete && node.rating != null ? renderStars(node.rating) : '';

  // Completed nodes get a quieter treatment
  const cardMod = isComplete && !isCurrent ? ' cr-node--done' : '';
  const upcomingMod = isUpcoming ? ' cr-node--upcoming' : '';

  const metaRow = [
    dur && !isRest ? `<span class="cr-node-dur">${esc(dur)}</span>` : '',
    node.source_name ? `<span class="cr-node-source">${esc(node.source_name)}</span>` : '',
    node.primary_theme && !isRest ? `<span class="cr-node-theme">${esc(node.primary_theme)}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="cr-node${cardMod}${upcomingMod}${isCurrent ? ' cr-node--current' : ''}">
      <div class="cr-node-row">
        <span class="cr-node-day">D${node.day_number}</span>
        <div class="cr-node-body">
          <div class="cr-node-head">
            <span class="cr-node-title">${esc(isRest ? 'Rest Day' : (typeLabel && node.node_type !== 'sequence' ? typeLabel : node.title))}</span>
            ${chipHtml}
          </div>
          ${node.node_type === 'sequence' && node.title && typeLabel ? `<div class="cr-node-subtitle">${esc(node.title)}</div>` : ''}
          ${metaRow ? `<div class="cr-node-meta">${metaRow}</div>` : ''}
        </div>
        ${starsHtml ? `<div class="cr-node-rating">${starsHtml}</div>` : ''}
      </div>
      ${parts}
    </div>`;
}

// ─── Week accordion ───────────────────────────────────────────────────────────

function renderWeek(week, currentNodeId, levelStatus, forceOpen) {
  const open = forceOpen ? ' open' : '';
  const doneCount = week.nodes.filter(n => n.status === 'complete').length;
  const total = week.nodes.length;
  const allDone = doneCount === total;
  const hasCurrent = week.nodes.some(n => n.id === currentNodeId);

  let weekStatus = '';
  if (hasCurrent) weekStatus = '<span class="cr-week-status cr-week-status--current">In progress</span>';
  else if (allDone) weekStatus = '<span class="cr-week-status cr-week-status--done">Complete</span>';

  const nodes = week.nodes.map(n => renderNode(n, currentNodeId, levelStatus)).join('');
  return `
    <details class="cr-week"${open}>
      <summary class="cr-week-summary">
        <svg class="cr-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="5,3 11,8 5,13"/>
        </svg>
        <span class="cr-week-label">Week ${week.week_number}</span>
        ${weekStatus}
        <span class="cr-week-count">${doneCount}/${total}</span>
      </summary>
      <div class="cr-nodes">${nodes}</div>
    </details>`;
}

// ─── Level accordion ──────────────────────────────────────────────────────────

function renderLevel(level, currentWeek, currentNodeId) {
  const isComplete = level.status === 'complete';
  const isCurrent = level.status === 'current';
  const open = isCurrent ? ' open' : '';
  const totalNodes = level.weeks.reduce((s, w) => s + w.nodes.length, 0);
  const doneNodes = level.weeks.reduce((s, w) => s + w.nodes.filter(n => n.status === 'complete').length, 0);

  let levelStatus = '';
  if (isComplete) levelStatus = '<span class="cr-level-status cr-level-status--done">Complete</span>';
  else if (isCurrent) levelStatus = '<span class="cr-level-status cr-level-status--current">In progress</span>';
  else levelStatus = '<span class="cr-level-status cr-level-status--upcoming">Coming later</span>';

  const weeks = level.weeks.map(w => {
    const isCurrentWeek = w.week_number === currentWeek;
    const weekOpen = !isComplete && (isCurrentWeek || w.status === 'current');
    return renderWeek(w, currentNodeId, level.status, weekOpen);
  }).join('');

  return `
    <details class="cr-level"${open}>
      <summary class="cr-level-summary">
        <svg class="cr-chevron cr-level-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="5,3 11,8 5,13"/>
        </svg>
        <span class="cr-level-label">${esc(level.label)}</span>
        ${levelStatus}
        <span class="cr-level-count">${doneNodes} of ${totalNodes}</span>
      </summary>
      <div class="cr-weeks">${weeks}</div>
    </details>`;
}

// ─── Main render ──────────────────────────────────────────────────────────────

function render(data) {
  const { summary, levels, program_name } = data;
  const currentNodeId = summary.current_node_id;
  const currentWeek   = summary.current_week_number;

  const levelsHtml = levels
    .map(l => renderLevel(l, currentWeek, currentNodeId))
    .join('');

  return `
    <div class="cr-header">
      <div class="cr-header-titles">
        <div class="cr-program-name">${esc(program_name)}</div>
      </div>
    </div>
    ${renderTodayHero(data)}
    ${renderSummary(summary)}
    <div class="cr-roadmap-label">Your Journey</div>
    <div class="cr-levels">
      ${levelsHtml || '<div class="cr-empty">No levels found.</div>'}
    </div>
    <div class="cr-footer-note">
      Visual prototype using mock data &mdash; not connected to live progress yet.
    </div>`;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const root = document.getElementById('app');
if (root) {
  root.innerHTML = render(MOCK_ROADMAP);
} else {
  console.error('[roadmap] #app element not found');
}
