/**
 * PROTOTYPE ONLY – curriculum-roadmap
 * No Supabase calls. No production app imports. Mock data only.
 *
 * Real DB shape reference (qrcpiyncvfmpmeuyhsha):
 *   program_curriculum: id (bigint), curriculum_slug, week_number, day_number,
 *     order_index, sequence_id→courses.id, node_type, source_name,
 *     source_reference, level_number, special_instructions
 *   sequence_completions: curriculum_node_id, rating (1-5), completed_at
 *   completion_rating_options: rating 1-5, label, subtitle
 *   course_sequence_analysis: total_duration_minutes, intensity_band, primary_theme
 *   curriculum_payload.practice_composition roles (curriculumUI.js):
 *     primary_asana | appended_pranayama | quiet_asana | light_asana | primary_pranayama
 */

// ─── Vocabulary helpers ───────────────────────────────────────────────────────

function roleLabel(role) {
  const m = {
    primary_asana:          'Asana',
    appended_pranayama:     'Short Pranayama',
    quiet_asana:            'Quiet Asana',
    light_asana:            'Light Asana',
    primary_pranayama:      'Pranayama',
    supplemental_pranayama: 'Pranayama',
  };
  return m[role] || String(role || '').replace(/_/g, ' ');
}

function nodeTypeLabel(node) {
  if (node.node_type === 'rest')     return 'Rest Day';
  if (node.node_type === 'revision') return 'Revision Practice';
  if (node.node_type === 'choice')   return 'Your Choice';
  const comp = node.curriculum_payload?.practice_composition;
  if (Array.isArray(comp) && comp.length > 1) return 'Combined Practice';
  return null;
}

function intensityLabel(band) {
  return { restorative:'Restorative', light:'Light', moderate:'Moderate',
           strong:'Strong', advanced:'Advanced' }[band] || null;
}

function ratingMeta(r) {
  return { 1:{label:'Too Much',subtitle:'Heavy'}, 2:{label:'Challenging',subtitle:'Effortful'},
           3:{label:'Balanced',subtitle:'Right level'}, 4:{label:'Comfortable',subtitle:'Fluid'},
           5:{label:'Ready for More',subtitle:'Strong'} }[r] || null;
}

function formatDuration(m) {
  if (!m) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Mock data ────────────────────────────────────────────────────────────────
// node_type: sequence | revision | rest | choice
// status:    complete | current | upcoming
// level_number maps to Foundation / Development / Deepening display labels.
// curriculum_node_id is an integer (program_curriculum.id bigint) — never rendered.

const MOCK_ROADMAP = {
  curriculum_slug: 'iyengar_integrated_master_path_draft_v1',
  program_name:    'Integrated Iyengar Practice Path',

  summary: {
    current_node_id:      14,
    current_week_number:  5,
    current_day_number:   3,
    total_nodes:          84,
    completed_nodes:      18,
    level_display:        'Level 2 – Development',
  },

  levels: [
    {
      level_number: 1,
      label:  'Foundation',
      status: 'complete',
      weeks: [
        {
          week_number: 1, status: 'complete',
          nodes: [
            { id:1,  week_number:1, day_number:1, title:'Standing Poses',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:45, status:'complete', rating:4,
              intensity_band:'light', primary_theme:'Standing and Basic',
              curriculum_payload:null },
            { id:2,  week_number:1, day_number:2, title:'Rest Day',
              node_type:'rest', source_name:null,
              duration_minutes:null, status:'complete', rating:null,
              intensity_band:null, primary_theme:null, curriculum_payload:null },
            { id:3,  week_number:1, day_number:3, title:'Seated Forward Bends',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:50, status:'complete', rating:5,
              intensity_band:'moderate', primary_theme:'Forward Bends',
              curriculum_payload:null },
          ],
        },
        {
          week_number: 2, status: 'complete',
          nodes: [
            { id:4,  week_number:2, day_number:1, title:'Standing & Ujjayi Pranayama',
              node_type:'sequence', source_name:null,
              duration_minutes:60, status:'complete', rating:3,
              intensity_band:'moderate', primary_theme:'Standing and Basic',
              curriculum_payload:{ practice_composition:[
                { part_number:1, role:'primary_asana',      title:'Standing Poses – Set 2',
                  source_name:'Light on Yoga',      duration_minutes:45, counts_for_source_completion:true },
                { part_number:2, role:'appended_pranayama', title:'Ujjayi Introduction',
                  source_name:'Light on Pranayama', duration_minutes:15, counts_for_source_completion:true },
              ], total_duration_minutes:60 } },
            { id:5,  week_number:2, day_number:2, title:'Revision Practice',
              node_type:'revision', source_name:'Light on Yoga',
              duration_minutes:50, status:'complete', rating:4,
              intensity_band:'light', primary_theme:'Standing and Basic', curriculum_payload:null },
            { id:6,  week_number:2, day_number:3, title:'Inversions Introduction',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:35, status:'complete', rating:5,
              intensity_band:'strong', primary_theme:'Inversions', curriculum_payload:null },
          ],
        },
        {
          week_number: 3, status: 'complete',
          nodes: [
            { id:7,  week_number:3, day_number:1, title:'Backbend Foundations',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:55, status:'complete', rating:4,
              intensity_band:'moderate', primary_theme:'Backbends', curriculum_payload:null },
            { id:8,  week_number:3, day_number:2, title:'Foundation Review',
              node_type:'revision', source_name:'Light on Yoga',
              duration_minutes:75, status:'complete', rating:5,
              intensity_band:'moderate', primary_theme:'Mixed', curriculum_payload:null },
          ],
        },
      ],
    },

    {
      level_number: 2,
      label:  'Development',
      status: 'current',
      weeks: [
        {
          week_number: 4, status: 'complete',
          nodes: [
            { id:9,  week_number:4, day_number:1, title:'Extended Standing Cycle',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:60, status:'complete', rating:3,
              intensity_band:'moderate', primary_theme:'Standing and Basic', curriculum_payload:null },
            { id:10, week_number:4, day_number:2, title:'Rest Day',
              node_type:'rest', source_name:null,
              duration_minutes:null, status:'complete', rating:null,
              intensity_band:null, primary_theme:null, curriculum_payload:null },
            { id:11, week_number:4, day_number:3, title:'Twists & Nadi Shodhana',
              node_type:'sequence', source_name:null,
              duration_minutes:65, status:'complete', rating:4,
              intensity_band:'moderate', primary_theme:'Twists',
              curriculum_payload:{ practice_composition:[
                { part_number:1, role:'primary_asana',      title:'Twists Sequence',
                  source_name:'Light on Yoga',      duration_minutes:50, counts_for_source_completion:true },
                { part_number:2, role:'appended_pranayama', title:'Nadi Shodhana – Stage 1',
                  source_name:'Light on Pranayama', duration_minutes:15, counts_for_source_completion:true },
              ], total_duration_minutes:65 } },
          ],
        },
        {
          week_number: 5, status: 'current',
          nodes: [
            { id:12, week_number:5, day_number:1, title:'Shoulder Girdle Opening',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:55, status:'complete', rating:3,
              intensity_band:'moderate', primary_theme:'Standing and Basic', curriculum_payload:null },
            { id:13, week_number:5, day_number:2, title:'Hip Opening',
              node_type:'sequence', source_name:'Yoga: The Iyengar Way',
              duration_minutes:50, status:'complete', rating:2,
              intensity_band:'moderate', primary_theme:'Forward Bends', curriculum_payload:null },
            { id:14, week_number:5, day_number:3, title:'Extended Backbends & Ujjayi',
              node_type:'sequence', source_name:null,
              duration_minutes:70, status:'current', rating:null,
              intensity_band:'strong', primary_theme:'Backbends',
              curriculum_payload:{ practice_composition:[
                { part_number:1, role:'primary_asana',      title:'Extended Backbend Practice',
                  source_name:'Light on Yoga',      duration_minutes:50, counts_for_source_completion:true },
                { part_number:2, role:'appended_pranayama', title:'Ujjayi – Extended Ratio Work',
                  source_name:'Light on Pranayama', duration_minutes:20, counts_for_source_completion:true },
              ], total_duration_minutes:70 } },
          ],
        },
        {
          week_number: 6, status: 'upcoming',
          nodes: [
            { id:15, week_number:6, day_number:1, title:'Supine Sequence',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:55, status:'upcoming', rating:null,
              intensity_band:'light', primary_theme:'Forward Bends', curriculum_payload:null },
            { id:16, week_number:6, day_number:2, title:'Revision Practice',
              node_type:'revision', source_name:'Light on Yoga',
              duration_minutes:60, status:'upcoming', rating:null,
              intensity_band:'light', primary_theme:null, curriculum_payload:null },
          ],
        },
      ],
    },

    {
      level_number: 3,
      label:  'Deepening',
      status: 'upcoming',
      weeks: [
        {
          week_number: 7, status: 'upcoming',
          nodes: [
            { id:17, week_number:7, day_number:1, title:'Advanced Inversions',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:65, status:'upcoming', rating:null,
              intensity_band:'advanced', primary_theme:'Inversions', curriculum_payload:null },
            { id:18, week_number:7, day_number:2, title:'Pranayama Practice',
              node_type:'sequence', source_name:'Light on Pranayama',
              duration_minutes:80, status:'upcoming', rating:null,
              intensity_band:'strong', primary_theme:'Pranayama', curriculum_payload:null },
          ],
        },
        {
          week_number: 8, status: 'upcoming',
          nodes: [
            { id:19, week_number:8, day_number:1, title:'Full Standing Programme',
              node_type:'sequence', source_name:'Light on Yoga',
              duration_minutes:75, status:'upcoming', rating:null,
              intensity_band:'advanced', primary_theme:'Standing and Basic', curriculum_payload:null },
          ],
        },
      ],
    },
  ],
};

// ─── Flatten all nodes for the map ────────────────────────────────────────────

function flattenNodes(data) {
  const nodes = [];
  data.levels.forEach(level => {
    level.weeks.forEach(week => {
      week.nodes.forEach(node => {
        nodes.push({ ...node, level_label: level.label, level_number: level.level_number });
      });
    });
  });
  return nodes;
}

// ─── Transit map layout ───────────────────────────────────────────────────────
//
// Metaphor:
//   Station   = curriculum node (practice day)
//   Line      = dominant practice stream for that node:
//               asana | pranayama | revision | rest | combined
//   Interchange = composed practice (2+ parts) — rendered as a double-ring
//   Current   = "You are here" pulsing station
//   Completed = filled, quieter colour
//   Upcoming  = open circle, muted
//
// Layout approach:
//   Nodes are laid out left-to-right on a horizontal flow.
//   Each node gets an (x, y) coordinate.
//   The "line" (practice stream) determines vertical lane:
//     asana     → y = middle lane
//     pranayama → y = upper lane
//     revision  → y = lower lane
//     rest      → y = rest lane (furthest down, very small dot)
//     combined  → spans two lanes, rendered as interchange
//
//   Within a level, nodes advance x. Between levels, a slight angle
//   or curve creates a natural progression feel.
//
//   The SVG is scrollable horizontally on narrow screens.

const LANE = {
  asana:     0,
  combined:  0,    // interchange: spans asana + pranayama
  pranayama: 1,
  revision:  2,
  rest:      3,
};

function nodeStream(node) {
  const comp = node.curriculum_payload?.practice_composition;
  if (Array.isArray(comp) && comp.length > 1) return 'combined';
  if (node.node_type === 'rest')     return 'rest';
  if (node.node_type === 'revision') return 'revision';
  if (node.primary_theme === 'Pranayama') return 'pranayama';
  return 'asana';
}

// Station colours by stream
const STREAM_COLOUR = {
  asana:     '#1e8e83',   // teal
  pranayama: '#9b59b6',   // soft violet (the only context where violet is intentional — represents breath/air)
  revision:  '#2980b9',   // calm blue
  rest:      '#bfb9af',   // stone
  combined:  '#1e8e83',   // teal (interchange marker is separate)
};

const LANE_Y = {
  asana:     60,
  combined:  60,
  pranayama: 110,
  revision:  155,
  rest:      195,
};

const INTERCHANGE_Y_TOP    = 44;   // top ring of interchange
const INTERCHANGE_Y_BOTTOM = 126;  // bottom ring of interchange

// Build layout: assign (x, y) to every node
function buildLayout(nodes) {
  // Group by level for spacing
  const LEVEL_GAP  = 32;
  const NODE_STEP  = 72;
  const START_X    = 44;

  let x = START_X;
  let lastLevel = null;
  return nodes.map(node => {
    if (lastLevel !== null && node.level_number !== lastLevel) {
      x += LEVEL_GAP;
    }
    lastLevel = node.level_number;
    const stream = nodeStream(node);
    const y = LANE_Y[stream];
    const pos = { x, y, stream };
    x += NODE_STEP;
    return { ...node, ...pos };
  });
}

// Build SVG path data for a stream's line through its stations
function streamPath(placed, stream) {
  const pts = placed.filter(n => {
    if (stream === 'combined') return false;
    return nodeStream(n) === stream;
  });
  if (pts.length < 2) return '';
  // Simple polyline through points
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

// For the main asana/combined horizontal spine, draw through all non-rest nodes
// using their x positions at the asana lane y
function spinePath(placed) {
  // All nodes except rest contribute to the horizontal spine
  const relevant = placed.filter(n => n.stream !== 'rest');
  if (relevant.length < 2) return '';
  const pts = relevant.map(n => ({ x: n.x, y: LANE_Y.asana }));
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

// Build the SVG markup
function renderMap(data, currentNodeId, selectedNodeId) {
  const nodes  = flattenNodes(data);
  const placed = buildLayout(nodes);

  // Dimensions
  const lastX  = placed.length ? placed[placed.length - 1].x : 400;
  const W      = lastX + 60;
  const H      = 240;

  // Helper: station fill/stroke by status
  function stationFill(node) {
    if (node.status === 'complete') return node.stream === 'rest' ? '#d4cfc7' : STREAM_COLOUR[node.stream];
    if (node.status === 'current')  return STREAM_COLOUR[node.stream];
    return 'none';
  }
  function stationStroke(node) {
    if (node.status === 'upcoming') return '#ccc8c0';
    return STREAM_COLOUR[node.stream];
  }
  function stationOpacity(node) {
    if (node.status === 'complete') return '0.7';
    if (node.status === 'upcoming') return '0.5';
    return '1';
  }

  // Build level separator lines
  const levelSeps = [];
  let prevLevel = null;
  placed.forEach((n, i) => {
    if (prevLevel !== null && n.level_number !== prevLevel) {
      const sepX = (placed[i - 1].x + n.x) / 2;
      levelSeps.push(sepX);
    }
    prevLevel = n.level_number;
  });

  // Build lane lines
  const streams = ['asana', 'pranayama', 'revision'];
  let laneLines = '';
  streams.forEach(stream => {
    const pts = placed.filter(n => n.stream === stream || (stream === 'asana' && n.stream === 'combined'));
    if (pts.length < 2) return;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${LANE_Y[stream]}`).join(' ');
    const colour = STREAM_COLOUR[stream];
    const dimmed = stream !== 'asana' ? ' opacity="0.55"' : '';
    laneLines += `<path d="${d}" stroke="${colour}" stroke-width="${stream === 'asana' ? 3 : 2}" fill="none" stroke-linecap="round" stroke-linejoin="round"${dimmed}/>`;
  });

  // Vertical connector lines for interchanges and pranayama-only nodes
  let connectors = '';
  placed.forEach(n => {
    if (n.stream === 'combined') {
      // Draw vertical connector between asana and pranayama lanes
      connectors += `<line x1="${n.x}" y1="${LANE_Y.asana}" x2="${n.x}" y2="${LANE_Y.pranayama}" stroke="${STREAM_COLOUR.combined}" stroke-width="2" stroke-dasharray="3,2" opacity="0.5"/>`;
    }
    if (n.stream === 'pranayama') {
      // Drop line from pranayama lane down to asana spine (visual anchor)
      connectors += `<line x1="${n.x}" y1="${LANE_Y.pranayama}" x2="${n.x}" y2="${LANE_Y.asana}" stroke="${STREAM_COLOUR.pranayama}" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.35"/>`;
    }
    if (n.stream === 'revision') {
      connectors += `<line x1="${n.x}" y1="${LANE_Y.revision}" x2="${n.x}" y2="${LANE_Y.asana}" stroke="${STREAM_COLOUR.revision}" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.35"/>`;
    }
  });

  // Level separators
  let sepSvg = '';
  levelSeps.forEach(sx => {
    sepSvg += `<line x1="${sx}" y1="20" x2="${sx}" y2="215" stroke="#e5e2dc" stroke-width="1" stroke-dasharray="4,3"/>`;
  });

  // Level labels
  const levelGroups = {};
  placed.forEach(n => {
    if (!levelGroups[n.level_number]) levelGroups[n.level_number] = { label: n.level_label, xs: [] };
    levelGroups[n.level_number].xs.push(n.x);
  });
  let levelLabels = '';
  Object.values(levelGroups).forEach(g => {
    const midX = (Math.min(...g.xs) + Math.max(...g.xs)) / 2;
    levelLabels += `<text x="${midX}" y="18" text-anchor="middle" font-size="9" fill="#a8a39a" font-family="-apple-system,BlinkMacSystemFont,sans-serif" letter-spacing="0.08em" text-transform="uppercase">${esc(g.label.toUpperCase())}</text>`;
  });

  // Lane labels on right edge
  const laneLabels = [
    { stream:'asana',     label:'Asana' },
    { stream:'pranayama', label:'Pranayama' },
    { stream:'revision',  label:'Revision' },
    { stream:'rest',      label:'Rest' },
  ];
  let laneLabelsSvg = '';
  laneLabels.forEach(({ stream, label }) => {
    const hasNodes = placed.some(n => n.stream === stream);
    if (!hasNodes) return;
    laneLabelsSvg += `<text x="${W - 6}" y="${LANE_Y[stream] + 4}" text-anchor="end" font-size="8.5" fill="#a8a39a" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(label)}</text>`;
  });

  // Station circles
  let stations = '';
  placed.forEach(n => {
    const isCurrent    = n.id === currentNodeId;
    const isSelected   = n.id === selectedNodeId;
    const isInterchange = n.stream === 'combined';
    const isRest        = n.stream === 'rest';
    const r   = isRest ? 4 : isInterchange ? 9 : 7;
    const fill   = stationFill(n);
    const stroke = stationStroke(n);
    const sw     = isInterchange ? 2.5 : 2;
    const op     = stationOpacity(n);

    // Pulsing ring for current station
    if (isCurrent) {
      stations += `
        <circle class="cr-map-pulse" cx="${n.x}" cy="${n.y}" r="${r + 8}" fill="none" stroke="${STREAM_COLOUR[n.stream]}" stroke-width="1.5" opacity="0.3"/>`;
    }

    // Selection ring — solid, clearly distinct from the pulse ring
    if (isSelected && !isCurrent) {
      stations += `<circle cx="${n.x}" cy="${n.y}" r="${r + 5}" fill="none" stroke="${STREAM_COLOUR[n.stream]}" stroke-width="2.5" opacity="0.9"/>`;
    }
    // Current+selected gets a bolder ring
    if (isSelected && isCurrent) {
      stations += `<circle cx="${n.x}" cy="${n.y}" r="${r + 5}" fill="none" stroke="${STREAM_COLOUR[n.stream]}" stroke-width="2.5" opacity="1"/>`;
    }

    // Interchange: show second ring at pranayama lane y
    if (isInterchange) {
      const fillP   = n.status === 'complete' ? STREAM_COLOUR.pranayama : 'none';
      const strokeP = n.status === 'upcoming' ? '#ccc8c0' : STREAM_COLOUR.pranayama;
      const ariaLabel = `Week ${n.week_number} Day ${n.day_number}: ${n.title} (Combined Practice)`;
      stations += `<circle cx="${n.x}" cy="${LANE_Y.pranayama}" r="7" fill="${fillP}" stroke="${strokeP}" stroke-width="2.5" opacity="${op}" data-id="${n.id}" class="cr-map-station" role="button" aria-label="${esc(ariaLabel)}" tabindex="0" style="cursor:pointer"/>`;
    }

    // Main station circle
    const ariaLabel = `Week ${n.week_number} Day ${n.day_number}: ${n.node_type === 'rest' ? 'Rest Day' : n.title}`;
    stations += `
      <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}" data-id="${n.id}" class="cr-map-station" role="button" aria-label="${esc(ariaLabel)}" tabindex="0" style="cursor:pointer"/>`;

    // "You are here" label
    if (isCurrent) {
      stations += `<text x="${n.x}" y="${n.y - r - 6}" text-anchor="middle" font-size="8" fill="${STREAM_COLOUR[n.stream]}" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,sans-serif">YOU ARE HERE</text>`;
    }

    // Week/day label under station
    const labelY = isRest ? n.y + 14 : n.y + r + 13;
    stations += `<text x="${n.x}" y="${labelY}" text-anchor="middle" font-size="8" fill="#a8a39a" font-family="-apple-system,BlinkMacSystemFont,sans-serif">W${n.week_number}·D${n.day_number}</text>`;
  });

  return `<svg
    class="cr-map-svg"
    viewBox="0 0 ${W} ${H}"
    width="${W}"
    height="${H}"
    aria-label="Practice journey map"
    role="img">
    <defs>
      <style>
        @keyframes cr-pulse {
          0%   { r: 15; opacity: 0.35; }
          60%  { r: 22; opacity: 0.08; }
          100% { r: 15; opacity: 0.35; }
        }
        .cr-map-pulse { animation: cr-pulse 2.6s ease-in-out infinite; }
        .cr-map-station:hover circle,
        .cr-map-station { transition: opacity 120ms; }
      </style>
    </defs>
    ${sepSvg}
    ${levelLabels}
    ${laneLines}
    ${connectors}
    ${laneLabelsSvg}
    ${stations}
  </svg>`;
}

// ─── Station detail panel ─────────────────────────────────────────────────────
// Called with node=null for the idle (no selection) state.
// The Begin Practice button lives only in the Today hero card — never here.

function renderStationDetail(node, isIdle) {
  if (isIdle) {
    return `<div class="cr-detail cr-detail--prompt" id="cr-detail-inner">
      <svg class="cr-detail-prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="3" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="21"/>
        <line x1="3" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="21" y2="12"/>
      </svg>
      <span class="cr-detail-prompt-text">Select any station on the map to preview that practice</span>
    </div>`;
  }

  const typeLabel  = nodeTypeLabel(node);
  const dur        = formatDuration(node.duration_minutes);
  const comp       = node.curriculum_payload?.practice_composition;
  const isComposed = Array.isArray(comp) && comp.length > 1;
  const isToday    = node.status === 'current';

  const starsHtml = node.rating != null ? (() => {
    let s = '<span class="cr-stars">';
    for (let i = 1; i <= 5; i++) {
      s += `<span class="${i <= node.rating ? 'cr-star--filled' : 'cr-star--empty'}">★</span>`;
    }
    s += '</span>';
    const meta = ratingMeta(node.rating);
    if (meta) s += ` <span class="cr-detail-rating-label">${esc(meta.label)}</span>`;
    return s;
  })() : null;

  const partsHtml = isComposed
    ? `<div class="cr-detail-parts">
        ${comp.map(p => `
          <div class="cr-detail-part">
            <span class="cr-detail-part-label">${esc(roleLabel(p.role))}</span>
            <span class="cr-detail-part-title">${esc(p.title)}</span>
            ${p.source_name ? `<span class="cr-detail-part-source">${esc(p.source_name)}</span>` : ''}
            ${p.duration_minutes ? `<span class="cr-detail-part-dur">${formatDuration(p.duration_minutes)}</span>` : ''}
          </div>`).join('')}
      </div>`
    : '';

  const statusMap   = { complete:'Done', current:'Today', upcoming:'Ahead' };
  const chipKey     = isToday ? 'current' : node.status === 'complete' ? 'done' : 'ahead';
  const statusLabel = statusMap[node.status] || node.status;

  // "Today" badge replaces the week/day eyebrow when this is the current node,
  // so the panel reads differently to the hero card above it.
  const eyebrow = isToday
    ? `<div class="cr-detail-week cr-detail-week--today">Today's Practice</div>`
    : `<div class="cr-detail-week">Week ${node.week_number} · Day ${node.day_number}</div>`;

  return `<div class="cr-detail${isToday ? ' cr-detail--today' : ''}" id="cr-detail-inner">
    <div class="cr-detail-head">
      ${eyebrow}
      <span class="cr-chip cr-chip--${chipKey}">${esc(statusLabel)}</span>
    </div>
    <div class="cr-detail-title">${esc(node.node_type === 'rest' ? 'Rest Day' : node.title)}</div>
    ${typeLabel ? `<div class="cr-detail-type">${esc(typeLabel)}</div>` : ''}
    <div class="cr-detail-meta">
      ${dur && node.node_type !== 'rest' ? `<span class="cr-detail-meta-item">${esc(dur)}</span>` : ''}
      ${node.source_name ? `<span class="cr-detail-meta-item">${esc(node.source_name)}</span>` : ''}
      ${node.intensity_band ? `<span class="cr-detail-meta-item cr-detail-meta-intensity">${esc(intensityLabel(node.intensity_band))}</span>` : ''}
    </div>
    ${partsHtml}
    ${starsHtml ? `<div class="cr-detail-rating">${starsHtml}</div>` : ''}
  </div>`;
}

// ─── Today hero ───────────────────────────────────────────────────────────────

function renderTodayHero(data) {
  const { summary, levels } = data;
  let currentNode = null;
  for (const level of levels) {
    for (const week of level.weeks) {
      for (const node of week.nodes) {
        if (node.id === summary.current_node_id) { currentNode = node; break; }
      }
    }
  }
  if (!currentNode) return '';

  const comp      = currentNode.curriculum_payload?.practice_composition;
  const isComposed = Array.isArray(comp) && comp.length > 1;
  const dur       = formatDuration(currentNode.duration_minutes);
  const typeLabel = nodeTypeLabel(currentNode);

  const partsHtml = isComposed
    ? `<div class="cr-hero-parts">${comp.map(p => `
        <div class="cr-hero-part">
          <span class="cr-hero-part-num">Part ${p.part_number}</span>
          <span class="cr-hero-part-role">${esc(roleLabel(p.role))}</span>
          <span class="cr-hero-part-title">${esc(p.title)}</span>
          ${p.source_name ? `<span class="cr-hero-part-source">${esc(p.source_name)}</span>` : ''}
          ${p.duration_minutes ? `<span class="cr-hero-part-dur">${formatDuration(p.duration_minutes)}</span>` : ''}
        </div>`).join('')}
      </div>`
    : '';

  const metaItems = [
    dur ? `<span class="cr-hero-meta-item">${esc(dur)}</span>` : '',
    currentNode.source_name ? `<span class="cr-hero-meta-item">${esc(currentNode.source_name)}</span>` : '',
    currentNode.intensity_band && !isComposed ? `<span class="cr-hero-meta-item cr-hero-meta-intensity">${esc(intensityLabel(currentNode.intensity_band))}</span>` : '',
  ].filter(Boolean).join('');

  return `<div class="cr-today">
    <div class="cr-today-eyebrow">Today's Practice &nbsp;·&nbsp; Week ${summary.current_week_number}, Day ${summary.current_day_number}</div>
    <div class="cr-today-title">${esc(currentNode.title)}</div>
    ${typeLabel ? `<div class="cr-today-type">${esc(typeLabel)}</div>` : ''}
    ${metaItems ? `<div class="cr-today-meta">${metaItems}</div>` : ''}
    ${partsHtml}
    <div class="cr-today-action">
      <button class="cr-today-btn" onclick="alert('Prototype only — navigation not wired.')">Begin Practice</button>
    </div>
  </div>`;
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function renderSummary(summary) {
  const pct = Math.round((summary.completed_nodes / summary.total_nodes) * 100);
  return `<div class="cr-summary">
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
      <div class="cr-progress-bar"><div class="cr-progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
  </div>`;
}

// ─── List view (accordion) ────────────────────────────────────────────────────

function renderStars(rating) {
  if (rating == null) return '';
  const meta = ratingMeta(rating);
  const title = meta ? `${meta.label} – ${meta.subtitle}` : `${rating}/5`;
  let html = `<span class="cr-stars" aria-label="${esc(title)}" title="${esc(title)}">`;
  for (let i = 1; i <= 5; i++) html += `<span class="${i <= rating ? 'cr-star--filled' : 'cr-star--empty'}">★</span>`;
  return html + '</span>';
}

function renderNodeCard(node, currentNodeId, levelStatus) {
  const isCurrent = node.id === currentNodeId;
  const isRest    = node.node_type === 'rest';
  const typeLabel = nodeTypeLabel(node);
  const dur       = formatDuration(node.duration_minutes);
  const comp      = node.curriculum_payload?.practice_composition;
  const isComposed = Array.isArray(comp) && comp.length > 1;

  let chipHtml = '';
  if (isCurrent)                               chipHtml = '<span class="cr-chip cr-chip--current">Today</span>';
  else if (isRest)                             chipHtml = '<span class="cr-chip cr-chip--rest">Rest</span>';
  else if (node.node_type === 'revision')      chipHtml = '<span class="cr-chip cr-chip--revision">Revision</span>';
  else if (node.node_type === 'choice')        chipHtml = '<span class="cr-chip cr-chip--choice">Your Choice</span>';
  else if (node.status === 'complete')         chipHtml = '<span class="cr-chip cr-chip--done">Done</span>';
  else if (levelStatus === 'upcoming')         chipHtml = '<span class="cr-chip cr-chip--ahead">Ahead</span>';
  else                                         chipHtml = '<span class="cr-chip cr-chip--upcoming">Coming up</span>';

  const metaRow = [
    dur && !isRest ? `<span class="cr-node-dur">${esc(dur)}</span>` : '',
    node.source_name ? `<span class="cr-node-source">${esc(node.source_name)}</span>` : '',
    node.primary_theme && !isRest ? `<span class="cr-node-theme">${esc(node.primary_theme)}</span>` : '',
  ].filter(Boolean).join('');

  const partsHtml = isComposed
    ? `<div class="cr-node-parts">${comp.map(p => `
        <div class="cr-node-part">
          <span class="cr-node-part-label">${esc(roleLabel(p.role))}</span>
          <span class="cr-node-part-title">${esc(p.title)}</span>
          ${p.source_name ? `<span class="cr-node-part-source">${esc(p.source_name)}</span>` : ''}
        </div>`).join('')}
      </div>`
    : '';

  const cardMod = [
    isCurrent ? ' cr-node--current' : '',
    node.status === 'complete' && !isCurrent ? ' cr-node--done' : '',
    node.status === 'upcoming' ? ' cr-node--upcoming' : '',
  ].join('');

  return `<div class="cr-node${cardMod}">
    <div class="cr-node-row">
      <span class="cr-node-day">D${node.day_number}</span>
      <div class="cr-node-body">
        <div class="cr-node-head">
          <span class="cr-node-title">${esc(isRest ? 'Rest Day' : (typeLabel && node.node_type !== 'sequence' ? typeLabel : node.title))}</span>
          ${chipHtml}
        </div>
        ${metaRow ? `<div class="cr-node-meta">${metaRow}</div>` : ''}
      </div>
      ${node.status === 'complete' && node.rating != null ? `<div class="cr-node-rating">${renderStars(node.rating)}</div>` : ''}
    </div>
    ${partsHtml}
  </div>`;
}

function renderListView(data) {
  const { summary, levels } = data;
  return `<div class="cr-levels" id="cr-list-view">
    ${levels.map(level => {
      const isComplete = level.status === 'complete';
      const isCurrent  = level.status === 'current';
      const totalNodes = level.weeks.reduce((s, w) => s + w.nodes.length, 0);
      const doneNodes  = level.weeks.reduce((s, w) => s + w.nodes.filter(n => n.status === 'complete').length, 0);
      let levelStatusHtml = '';
      if (isComplete) levelStatusHtml = '<span class="cr-level-status cr-level-status--done">Complete</span>';
      else if (isCurrent) levelStatusHtml = '<span class="cr-level-status cr-level-status--current">In progress</span>';
      else levelStatusHtml = '<span class="cr-level-status cr-level-status--upcoming">Coming later</span>';

      const weeks = level.weeks.map(week => {
        const hasCurrent = week.nodes.some(n => n.id === summary.current_node_id);
        const allDone    = week.nodes.every(n => n.status === 'complete');
        const doneW      = week.nodes.filter(n => n.status === 'complete').length;
        let weekStatus   = '';
        if (hasCurrent) weekStatus = '<span class="cr-week-status cr-week-status--current">In progress</span>';
        else if (allDone) weekStatus = '<span class="cr-week-status cr-week-status--done">Complete</span>';
        const open = (!isComplete && (hasCurrent || week.status === 'current')) ? ' open' : '';
        return `<details class="cr-week"${open}>
          <summary class="cr-week-summary">
            <svg class="cr-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="5,3 11,8 5,13"/>
            </svg>
            <span class="cr-week-label">Week ${week.week_number}</span>
            ${weekStatus}
            <span class="cr-week-count">${doneW}/${week.nodes.length}</span>
          </summary>
          <div class="cr-nodes">
            ${week.nodes.map(n => renderNodeCard(n, summary.current_node_id, level.status)).join('')}
          </div>
        </details>`;
      }).join('');

      return `<details class="cr-level"${isCurrent ? ' open' : ''}>
        <summary class="cr-level-summary">
          <svg class="cr-chevron cr-level-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="5,3 11,8 5,13"/>
          </svg>
          <span class="cr-level-label">${esc(level.label)}</span>
          ${levelStatusHtml}
          <span class="cr-level-count">${doneNodes} of ${totalNodes}</span>
        </summary>
        <div class="cr-weeks">${weeks}</div>
      </details>`;
    }).join('')}
  </div>`;
}

// ─── Map view ─────────────────────────────────────────────────────────────────

function renderMapView(data) {
  const allNodes = flattenNodes(data);
  const placed   = buildLayout(allNodes);
  const mapSvg   = renderMap(data, data.summary.current_node_id, data.summary.current_node_id);
  const currentNode = allNodes.find(n => n.id === data.summary.current_node_id) || null;

  return `<div id="cr-map-view">
    <div class="cr-map-topbar">
      <div class="cr-map-legend">
        <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#1e8e83"></span>Asana</span>
        <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#9b59b6"></span>Pranayama</span>
        <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#2980b9"></span>Revision</span>
        <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#bfb9af;border:1px solid #a8a39a"></span>Rest</span>
        <span class="cr-legend-item cr-legend-interchange"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#1e8e83" stroke-width="2"/><circle cx="7" cy="7" r="2" fill="#1e8e83"/></svg>Combined</span>
      </div>
      <span class="cr-map-hint">Tap a station to explore</span>
    </div>
    <div class="cr-map-scroll">
      ${mapSvg}
    </div>
    <div class="cr-detail-section">
      <div class="cr-detail-section-label">Station details</div>
      <div class="cr-detail-wrap" id="cr-detail-wrap">
        ${renderStationDetail(null, true)}
      </div>
    </div>
  </div>`;
}

// ─── Main render ──────────────────────────────────────────────────────────────

function renderApp(data) {
  return `
    <div class="cr-header">
      <div class="cr-program-name">${esc(data.program_name)}</div>
    </div>
    ${renderTodayHero(data)}
    ${renderSummary(data.summary)}
    <div class="cr-view-toggle" role="tablist" aria-label="Journey view">
      <button class="cr-view-btn cr-view-btn--active" id="btn-map" role="tab" aria-selected="true" onclick="switchView('map')">Map view</button>
      <button class="cr-view-btn" id="btn-list" role="tab" aria-selected="false" onclick="switchView('list')">List view</button>
    </div>
    <div id="cr-map-container">${renderMapView(data)}</div>
    <div id="cr-list-container" style="display:none">${renderListView(data)}</div>
    <div class="cr-footer-note">
      Visual prototype &mdash; mock data only, not connected to live progress.
    </div>`;
}

// ─── View toggle ──────────────────────────────────────────────────────────────

window.switchView = function(view) {
  const mapBtn  = document.getElementById('btn-map');
  const listBtn = document.getElementById('btn-list');
  const mapDiv  = document.getElementById('cr-map-container');
  const listDiv = document.getElementById('cr-list-container');
  if (!mapDiv || !listDiv) return;
  if (view === 'map') {
    mapDiv.style.display  = '';
    listDiv.style.display = 'none';
    mapBtn.classList.add('cr-view-btn--active');   mapBtn.setAttribute('aria-selected','true');
    listBtn.classList.remove('cr-view-btn--active'); listBtn.setAttribute('aria-selected','false');
  } else {
    mapDiv.style.display  = 'none';
    listDiv.style.display = '';
    listBtn.classList.add('cr-view-btn--active');   listBtn.setAttribute('aria-selected','true');
    mapBtn.classList.remove('cr-view-btn--active'); mapBtn.setAttribute('aria-selected','false');
  }
};

// ─── Station click / keyboard handling ───────────────────────────────────────

function wireMapClicks(data) {
  const allNodes = flattenNodes(data);

  function selectStation(id) {
    const node = allNodes.find(n => n.id === id);
    if (!node) return;

    // Re-render map with selection ring
    const mapScroll = document.querySelector('.cr-map-scroll');
    if (mapScroll) mapScroll.innerHTML = renderMap(data, data.summary.current_node_id, id);

    // Update detail panel
    const detailWrap = document.getElementById('cr-detail-wrap');
    if (detailWrap) {
      detailWrap.innerHTML = renderStationDetail(node, false);
      // Smooth scroll the detail section into view only on narrow screens
      // (on desktop it's already visible below the map)
      const section = detailWrap.closest('.cr-detail-section');
      if (section && window.innerWidth < 600) {
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // Click
  document.addEventListener('click', e => {
    const circle = e.target.closest('.cr-map-station');
    if (!circle) return;
    selectStation(parseInt(circle.getAttribute('data-id'), 10));
  });

  // Keyboard: Enter or Space on a focused station
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const circle = e.target.closest('.cr-map-station');
    if (!circle) return;
    e.preventDefault();
    selectStation(parseInt(circle.getAttribute('data-id'), 10));
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const root = document.getElementById('app');
if (root) {
  root.innerHTML = renderApp(MOCK_ROADMAP);
  wireMapClicks(MOCK_ROADMAP);
} else {
  console.error('[roadmap] #app element not found');
}
