import { supabase } from '../services/supabaseClient.js';
import { isConfiguredAdminEmail } from '../config/appConfig.js';
import { ACTIVE_CURRICULUM_NAME, ACTIVE_CURRICULUM_SLUG } from '../config/curriculumConfig.js';

const CURRICULUM_SLUG = ACTIVE_CURRICULUM_SLUG;

// ─── Dev gate ─────────────────────────────────────────────────────────────────
// Roadmap button is only visible to local dev or admin (god mode) users.
function isDevOrAdmin() {
    const h = window.location.hostname;
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(h) || h.endsWith('.webcontainer-api.io');
    return isLocal || !!window.adminMode || isConfiguredAdminEmail(window.currentUserEmail);
}

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
    if (node.node_type === 'recovery')      return 'Recovery Day';
    if (node.node_type === 'instruction')   return 'Instruction Day';
    if (node.node_type === 'rest')          return 'Rest Day';
    if (node.node_type === 'revision')      return 'Review Practice';
    if (node.node_type === 'consolidation') return 'Consolidation Practice';
    if (node.node_type === 'choice')        return 'Review Practice';
    const comp = node.curriculum_payload?.practice_composition;
    if (Array.isArray(comp) && comp.length > 1) return 'Combined Practice';
    return null;
}

function intensityLabel(band) {
    return { restorative: 'Restorative', light: 'Light', moderate: 'Moderate',
             strong: 'Strong', advanced: 'Advanced' }[band] || null;
}

function ratingMeta(r) {
    return {
        1: { label: 'Too Much',       subtitle: 'Heavy' },
        2: { label: 'Challenging',    subtitle: 'Effortful' },
        3: { label: 'Balanced',       subtitle: 'Right level' },
        4: { label: 'Comfortable',    subtitle: 'Fluid' },
        5: { label: 'Ready for More', subtitle: 'Strong' },
    }[r] || null;
}

function formatDuration(m) {
    if (!m && m !== 0) return null;
    const mins = Math.round(m);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), r = mins % 60;
    return r ? `${h} hr ${r} min` : `${h} hr`;
}

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Status derivation ────────────────────────────────────────────────────────
// Groups completions by curriculum_node_id to avoid double-counting composed nodes.

const DONE_STATUSES = ['completed', 'repeated', 'plateau', 'rest', 'revision'];

function buildCompletionMap(completions) {
    const map = new Map(); // node_id → { count, bestRating, lastAt }
    for (const row of completions) {
        if (!row.curriculum_node_id) continue;
        const id = row.curriculum_node_id;
        const attemptKey = row.completed_at || `${row.sequence_id ?? 'sequence'}:${id}`;
        const existing = map.get(id);
        if (!existing) {
            map.set(id, { count: 1, bestRating: row.rating, lastAt: row.completed_at, attempts: new Set([attemptKey]) });
        } else {
            if (!existing.attempts.has(attemptKey)) {
                existing.attempts.add(attemptKey);
                existing.count = existing.attempts.size;
            }
            if (row.rating != null && (existing.bestRating == null || row.rating > existing.bestRating)) {
                existing.bestRating = row.rating;
            }
            if (row.completed_at > existing.lastAt) existing.lastAt = row.completed_at;
        }
    }
    return map;
}

function resolveCurrentNodeId(nodes, completionMap, explicitCurrentNodeId) {
    if (explicitCurrentNodeId && nodes.some(node => node.id === explicitCurrentNodeId)) {
        return explicitCurrentNodeId;
    }

    const nextNode = nodes.find(node => !completionMap.has(node.id));
    return nextNode?.id ?? null;
}

function deriveNodeStatus(node, completionMap, currentNodeId) {
    if (node.id === currentNodeId) return 'current';

    const rec = completionMap.get(node.id);
    if (!rec) return 'upcoming';

    const nodeType = (node.node_type || '').toLowerCase().trim();
    if (nodeType === 'rest' || nodeType === 'recovery') return 'rest';
    if (['revision', 'choice', 'instruction', 'consolidation', 'assessment'].includes(nodeType)) return 'revision';

    const payload = node.curriculum_payload || {};
    if (payload.plateau_candidate || payload.can_repeat_indefinitely || payload.progression_gate || payload.milestone_type) {
        if (rec.count > 1) return 'plateau';
    }

    if (rec.count > 1) return 'repeated';
    return 'completed';
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadRoadmapData() {
    const userId = window.currentUserId;

    // Fetch all active curriculum nodes in order
    const { data: nodes, error: nodesErr } = await supabase
        .from('program_curriculum')
        .select(`id, week_number, day_number, order_index, node_type,
                 day_role, recovery_type, is_visible, estimated_minutes,
                 sequence_id, is_active, is_rest_day, source_name, source_key,
                 source_course, source_reference, practice_track, intensity, primary_focus,
                 curriculum_payload, completion_requirement, level_number,
                 special_instructions`)
        .eq('curriculum_slug', CURRICULUM_SLUG)
        .eq('is_active', true)
        .eq('is_visible', true)
        .order('order_index');

    if (nodesErr) throw nodesErr;

    // Fetch completions for this user (only those linked to this curriculum)
    let completions = [];
    if (userId) {
        const { data: compData, error: compErr } = await supabase
            .from('sequence_completions')
            .select('curriculum_node_id, sequence_id, rating, completed_at')
            .eq('user_id', userId)
            .not('curriculum_node_id', 'is', null)
            .order('completed_at');
        if (compErr) throw compErr;
        completions = compData || [];
    }

    return { nodes: nodes || [], completions };
}

// ─── Assemble roadmap nodes ───────────────────────────────────────────────────

function assembleRoadmapNodes(nodes, completions, currentNodeId) {
    const completionMap = buildCompletionMap(completions);
    const effectiveCurrentNodeId = resolveCurrentNodeId(nodes, completionMap, currentNodeId);
    const hasExplicitCurrent = !!currentNodeId && effectiveCurrentNodeId === currentNodeId;

    return nodes.map(node => {
        const rec = completionMap.get(node.id) || null;
        const status = deriveNodeStatus(node, completionMap, effectiveCurrentNodeId);

        // Duration: prefer composed total, fallback to course analysis (not available here), or null
        const payload = node.curriculum_payload || {};
        const durationMinutes =
            node.estimated_minutes ||
            payload.composed_total_duration_minutes ||
            payload.total_duration_minutes ||
            null;

        return {
            ...node,
            status,
            completion_count: rec ? rec.count : 0,
            best_rating:      rec ? rec.bestRating : null,
            last_completed_at: rec ? rec.lastAt : null,
            is_current:       node.id === effectiveCurrentNodeId,
            is_explicit_current: hasExplicitCurrent && node.id === effectiveCurrentNodeId,
            duration_minutes: durationMinutes,
            progression_group_label: payload.progression_group_label || node.source_name || levelDisplayName(node.level_number),
            // Title: derive from source for sequences, type label for rest/revision
            title: buildNodeTitle(node),
        };
    });
}

function buildNodeTitle(node) {
    if (node.node_type === 'recovery') {
        return node.recovery_type
            ? `${tokenLabel(node.recovery_type)} Recovery`
            : 'Recovery Day';
    }
    if (node.node_type === 'instruction') return node.primary_focus || 'Instruction Day';
    if (node.node_type === 'rest')     return 'Rest Day';
    if (node.node_type === 'revision') return 'Review Practice';
    if (node.node_type === 'consolidation') return 'Consolidation Practice';

    const payload = node.curriculum_payload || {};
    const comp = payload.practice_composition;
    if (Array.isArray(comp) && comp.length > 1) {
        // For combined practices, show primary role title if available
        const primary = comp.find(p => p.role === 'primary_asana') || comp[0];
        return primary.title || node.primary_focus || 'Combined Practice';
    }

    // Single sequence: prefer primary_focus as the readable label
    if (node.primary_focus && node.primary_focus !== 'Revision') return node.primary_focus;
    return node.source_reference || 'Practice';
}

function tokenLabel(value) {
    return String(value || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

// ─── Group nodes into levels/weeks ───────────────────────────────────────────

function groupIntoLevels(assembledNodes) {
    const levelMap = new Map();

    for (const node of assembledNodes) {
        const lvl = node.level_number || 1;
        if (!levelMap.has(lvl)) {
            levelMap.set(lvl, { level_number: lvl, label: node.progression_group_label || levelDisplayName(lvl), weeks: new Map() });
        }
        const level = levelMap.get(lvl);
        const wk = node.week_number;
        if (!level.weeks.has(wk)) level.weeks.set(wk, { week_number: wk, nodes: [] });
        level.weeks.get(wk).nodes.push(node);
    }

    // Convert maps to sorted arrays, compute status for levels/weeks
    return Array.from(levelMap.values())
        .sort((a, b) => a.level_number - b.level_number)
        .map(level => {
            const weeks = Array.from(level.weeks.values())
                .sort((a, b) => a.week_number - b.week_number);
            const allNodes = weeks.flatMap(w => w.nodes);
            const levelStatus = computeGroupStatus(allNodes);
            const weeksWithStatus = weeks.map(week => ({
                ...week,
                status: computeGroupStatus(week.nodes),
            }));
            return { ...level, weeks: weeksWithStatus, status: levelStatus };
        });
}

function levelDisplayName(n) {
    return n ? `Group ${n}` : 'Weekly Recovery';
}

function computeGroupStatus(nodes) {
    if (nodes.length === 0) return 'upcoming';
    if (nodes.every(n => DONE_STATUSES.includes(n.status))) return 'complete';
    if (nodes.some(n => n.status === 'current' || DONE_STATUSES.includes(n.status))) return 'current';
    return 'upcoming';
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildSummary(levels, assembledNodes, currentNode) {
    const completedCount = assembledNodes.filter(n => DONE_STATUSES.includes(n.status)).length;

    const currentLevel = levels.find(l => l.status === 'current') || levels[0];
    const isComplete = assembledNodes.length > 0 && completedCount === assembledNodes.length;
    const positionText = currentNode
        ? `Week ${currentNode.week_number} - Day ${currentNode.day_number}`
        : isComplete
            ? 'Complete'
            : completedCount > 0
                ? `${completedCount} completed`
                : 'Not started';
    const positionLabel = currentNode?.is_explicit_current ? 'Current' : currentNode ? 'Next' : 'Position';

    return {
        current_node_id:     currentNode?.id ?? null,
        current_week_number: currentNode?.week_number ?? null,
        current_day_number:  currentNode?.day_number ?? null,
        position_label:      positionLabel,
        position_text:       positionText,
        total_nodes:         assembledNodes.length,
        completed_nodes:     completedCount,
        level_display:       currentLevel ? `Level ${currentLevel.level_number} — ${currentLevel.label}` : '',
    };
}

// ─── Transit map ──────────────────────────────────────────────────────────────

const STREAM_COLOUR = {
    asana:     '#1e8e83',
    pranayama: '#5e9ed6',  // calm blue (not violet per design rules)
    revision:  '#4a7fa5',  // deeper blue
    rest:      '#bfb9af',
    combined:  '#1e8e83',
};

const LANE_Y = { asana: 60, combined: 60, pranayama: 110, revision: 155, rest: 195 };

function nodeStream(node) {
    const comp = node.curriculum_payload?.practice_composition;
    if (Array.isArray(comp) && comp.length > 1) return 'combined';
    if (node.node_type === 'rest' || node.node_type === 'recovery' || node.day_role === 'recovery') return 'rest';
    if (['revision', 'consolidation', 'choice', 'instruction', 'assessment'].includes(node.node_type)) return 'revision';
    if (
        node.practice_track === 'pranayama'
        || node.source_key === 'light_on_pranayama'
        || node.source_name === 'Light on Pranayama'
        || node.curriculum_payload?.source_category === 'Light on Pranayama'
        || node.primary_focus === 'Pranayama'
    ) return 'pranayama';
    return 'asana';
}

function buildLayout(nodes) {
    const LEVEL_GAP = 32;
    const NODE_STEP = 72;
    const START_X   = 44;
    let x = START_X;
    let lastLevel = null;
    return nodes.map(node => {
        if (lastLevel !== null && node.level_number !== lastLevel) x += LEVEL_GAP;
        lastLevel = node.level_number;
        const stream = nodeStream(node);
        const y = LANE_Y[stream];
        const pos = { x, y, stream };
        x += NODE_STEP;
        return { ...node, ...pos };
    });
}

function renderMap(placed, currentNodeId, selectedNodeId) {
    const lastX = placed.length ? placed[placed.length - 1].x : 400;
    const W = lastX + 60;
    const H = 240;

    function stationFill(node) {
        if (node.status === 'current')   return STREAM_COLOUR[node.stream];
        if (['completed', 'repeated', 'plateau', 'rest', 'revision'].includes(node.status))
            return node.stream === 'rest' ? '#d4cfc7' : STREAM_COLOUR[node.stream];
        return 'none';
    }
    function stationStroke(node) {
        return node.status === 'upcoming' ? '#ccc8c0' : STREAM_COLOUR[node.stream];
    }
    function stationOpacity(node) {
        if (['completed', 'repeated', 'plateau', 'rest', 'revision'].includes(node.status)) return '0.72';
        if (node.status === 'upcoming') return '0.45';
        return '1';
    }

    // Level separators
    let prevLevel = null;
    const levelSeps = [];
    placed.forEach((n, i) => {
        if (prevLevel !== null && n.level_number !== prevLevel) {
            levelSeps.push((placed[i - 1].x + n.x) / 2);
        }
        prevLevel = n.level_number;
    });

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
        if (!g.label) return;
        const midX = (Math.min(...g.xs) + Math.max(...g.xs)) / 2;
        levelLabels += `<text x="${midX}" y="18" text-anchor="middle" font-size="9" fill="#a8a39a" font-family="-apple-system,BlinkMacSystemFont,sans-serif" letter-spacing="0.08em">${esc(g.label.toUpperCase())}</text>`;
    });

    // Lane lines
    const streams = ['asana', 'pranayama', 'revision'];
    let laneLines = '';
    streams.forEach(stream => {
        const pts = placed.filter(n => n.stream === stream || (stream === 'asana' && n.stream === 'combined'));
        if (pts.length < 2) return;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${LANE_Y[stream]}`).join(' ');
        const colour = STREAM_COLOUR[stream];
        const dimmed = stream !== 'asana' ? ' opacity="0.5"' : '';
        laneLines += `<path d="${d}" stroke="${colour}" stroke-width="${stream === 'asana' ? 3 : 2}" fill="none" stroke-linecap="round"${dimmed}/>`;
    });

    // Vertical connectors
    let connectors = '';
    placed.forEach(n => {
        if (n.stream === 'combined') {
            connectors += `<line x1="${n.x}" y1="${LANE_Y.asana}" x2="${n.x}" y2="${LANE_Y.pranayama}" stroke="${STREAM_COLOUR.combined}" stroke-width="2" stroke-dasharray="3,2" opacity="0.4"/>`;
        } else if (n.stream === 'pranayama') {
            connectors += `<line x1="${n.x}" y1="${LANE_Y.pranayama}" x2="${n.x}" y2="${LANE_Y.asana}" stroke="${STREAM_COLOUR.pranayama}" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.3"/>`;
        } else if (n.stream === 'revision') {
            connectors += `<line x1="${n.x}" y1="${LANE_Y.revision}" x2="${n.x}" y2="${LANE_Y.asana}" stroke="${STREAM_COLOUR.revision}" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.3"/>`;
        }
    });

    // Lane labels
    const laneLabels = [
        { stream: 'asana',     label: 'Asana' },
        { stream: 'pranayama', label: 'Pranayama' },
        { stream: 'revision',  label: 'Revision' },
        { stream: 'rest',      label: 'Rest' },
    ];
    let laneLabelsSvg = '';
    laneLabels.forEach(({ stream, label }) => {
        if (!placed.some(n => n.stream === stream)) return;
        laneLabelsSvg += `<text x="${W - 6}" y="${LANE_Y[stream] + 4}" text-anchor="end" font-size="8.5" fill="#a8a39a" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(label)}</text>`;
    });

    // Stations
    let stations = '';
    placed.forEach(n => {
        const isCurrent     = n.id === currentNodeId;
        const isSelected    = n.id === selectedNodeId;
        const isInterchange = n.stream === 'combined';
        const isRest        = n.stream === 'rest';
        const r   = isRest ? 4 : isInterchange ? 9 : 7;
        const fill   = stationFill(n);
        const stroke = stationStroke(n);
        const sw     = isInterchange ? 2.5 : 2;
        const op     = stationOpacity(n);
        const ariaLabel = `Week ${n.week_number} Day ${n.day_number}: ${n.title}`;

        stations += `<circle cx="${n.x}" cy="${n.y}" r="20" fill="transparent" data-id="${n.id}" data-testid="curriculum-station-hit-target" class="cr-map-hit-target" role="button" aria-label="${esc(ariaLabel)}" tabindex="0" style="cursor:pointer"/>`;

        if (isCurrent) {
            stations += `<circle class="cr-map-pulse" cx="${n.x}" cy="${n.y}" r="${r + 8}" fill="none" stroke="${STREAM_COLOUR[n.stream]}" stroke-width="1.5" opacity="0.3"/>`;
        }
        if (isSelected && !isCurrent) {
            stations += `<circle cx="${n.x}" cy="${n.y}" r="${r + 5}" fill="none" stroke="${STREAM_COLOUR[n.stream]}" stroke-width="2.5" opacity="0.9"/>`;
        }
        if (isSelected && isCurrent) {
            stations += `<circle cx="${n.x}" cy="${n.y}" r="${r + 5}" fill="none" stroke="${STREAM_COLOUR[n.stream]}" stroke-width="2.5" opacity="1"/>`;
        }

        if (isInterchange) {
            const fillP   = ['completed', 'repeated', 'plateau'].includes(n.status) ? STREAM_COLOUR.pranayama : 'none';
            const strokeP = n.status === 'upcoming' ? '#ccc8c0' : STREAM_COLOUR.pranayama;
            const ariaLabelP = `Week ${n.week_number} Day ${n.day_number} pranayama part`;
            stations += `<circle cx="${n.x}" cy="${LANE_Y.pranayama}" r="18" fill="transparent" data-id="${n.id}" data-testid="curriculum-station-hit-target" class="cr-map-hit-target" role="button" aria-label="${esc(ariaLabelP)}" tabindex="0" style="cursor:pointer"/>`;
            stations += `<circle cx="${n.x}" cy="${LANE_Y.pranayama}" r="7" fill="${fillP}" stroke="${strokeP}" stroke-width="2.5" opacity="${op}" data-id="${n.id}" data-testid="curriculum-station" class="cr-map-station" style="pointer-events:none"/>`;
        }

        stations += `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}" data-id="${n.id}" data-testid="curriculum-station" class="cr-map-station" style="pointer-events:none"/>`;

        if (isCurrent) {
            stations += `<text x="${n.x}" y="${n.y - r - 6}" text-anchor="middle" font-size="8" fill="${STREAM_COLOUR[n.stream]}" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${n.is_explicit_current ? 'YOU ARE HERE' : 'NEXT'}</text>`;
        }

        const labelY = isRest ? n.y + 14 : n.y + r + 13;
        stations += `<text x="${n.x}" y="${labelY}" text-anchor="middle" font-size="8" fill="#a8a39a" font-family="-apple-system,BlinkMacSystemFont,sans-serif">W${n.week_number}·D${n.day_number}</text>`;
    });

    return `<svg class="cr-map-svg" data-testid="curriculum-map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Practice journey map" role="img">
    <defs>
      <style>
        @keyframes cr-pulse { 0% { r: 15; opacity: 0.3; } 55% { r: 22; opacity: 0.07; } 100% { r: 15; opacity: 0.3; } }
        .cr-map-pulse { animation: cr-pulse 2.6s ease-in-out infinite; }
      </style>
    </defs>
    ${sepSvg}${levelLabels}${laneLines}${connectors}${laneLabelsSvg}${stations}
  </svg>`;
}

// ─── Station detail panel ─────────────────────────────────────────────────────

function renderStationDetail(node, isIdle) {
    if (isIdle) {
        return `<div class="cr-detail cr-detail--prompt" id="cr-detail-inner">
      <svg class="cr-detail-prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/></svg>
      <span class="cr-detail-prompt-text">Select any station on the map to preview that practice</span>
    </div>`;
    }

    const typeLabel   = nodeTypeLabel(node);
    const dur         = formatDuration(node.duration_minutes);
    const comp        = node.curriculum_payload?.practice_composition;
    const isComposed  = Array.isArray(comp) && comp.length > 1;
    const isToday     = node.status === 'current';
    const isRestNode  = node.node_type === 'rest' || node.node_type === 'recovery' || node.day_role === 'recovery';
    const isRevision  = ['revision', 'choice', 'instruction', 'consolidation'].includes(node.node_type);

    // Source label: suppress for rest/revision, use "Source: <name> — <ref>" for others
    let sourceLabel = null;
    if (!isRestNode && !isRevision && node.source_name && node.source_name !== ACTIVE_CURRICULUM_NAME) {
        sourceLabel = node.source_reference
            ? `${node.source_name} — ${node.source_reference}`
            : node.source_name;
    }

    const starsHtml = node.best_rating != null ? (() => {
        let s = '<span class="cr-stars">';
        for (let i = 1; i <= 5; i++) s += `<span class="${i <= node.best_rating ? 'cr-star--filled' : 'cr-star--empty'}">★</span>`;
        s += '</span>';
        const meta = ratingMeta(node.best_rating);
        if (meta) s += ` <span class="cr-detail-rating-label">${esc(meta.label)}</span>`;
        return s;
    })() : null;

    const partsHtml = isComposed
        ? `<div class="cr-detail-parts">${comp.map((p, idx) => `
          <div class="cr-detail-part">
            <span class="cr-detail-part-label">${esc(roleLabel(p.role))}</span>
            <span class="cr-detail-part-title">Part ${idx + 1}</span>
            ${p.source_name ? `<span class="cr-detail-part-source">Source: ${esc(p.source_name)}${p.source_reference ? ` — ${esc(p.source_reference)}` : ''}</span>` : ''}
            ${p.duration_minutes ? `<span class="cr-detail-part-dur">${formatDuration(p.duration_minutes)}</span>` : ''}
          </div>`).join('')}
        </div>` : '';

    const chipKey = isToday ? 'current' : DONE_STATUSES.includes(node.status) ? 'done' : 'ahead';
    const currentLabel = node.is_explicit_current ? 'Today' : 'Next';
    const chipLabel = isToday
        ? currentLabel
        : { completed: 'Done', repeated: 'Repeated', plateau: 'Plateau', rest: 'Rest', revision: 'Revision', upcoming: 'Ahead' }[node.status] || node.status;

    const eyebrow = isToday
        ? `<div class="cr-detail-week cr-detail-week--today">${node.is_explicit_current ? "Today's Practice" : 'Next Practice'}</div>`
        : `<div class="cr-detail-week">Week ${node.week_number} · Day ${node.day_number}</div>`;

    return `<div class="cr-detail${isToday ? ' cr-detail--today' : ''}" id="cr-detail-inner">
    <div class="cr-detail-head">${eyebrow}<span class="cr-chip cr-chip--${chipKey}">${esc(chipLabel)}</span></div>
    <div class="cr-detail-title">${esc(node.title)}</div>
    ${typeLabel && node.node_type !== 'sequence' ? `<div class="cr-detail-type">${esc(typeLabel)}</div>` : ''}
    <div class="cr-detail-meta">
      ${dur && !isRestNode ? `<span class="cr-detail-meta-item">${esc(dur)}</span>` : ''}
      ${sourceLabel ? `<span class="cr-detail-meta-item">${esc(sourceLabel)}</span>` : ''}
      ${node.day_role ? `<span class="cr-detail-meta-item">${esc(tokenLabel(node.day_role))}</span>` : ''}
      ${node.recovery_type ? `<span class="cr-detail-meta-item">${esc(tokenLabel(node.recovery_type))}</span>` : ''}
      ${node.intensity ? `<span class="cr-detail-meta-item cr-detail-meta-intensity">${esc(intensityLabel(node.intensity) || node.intensity)}</span>` : ''}
    </div>
    ${partsHtml}
    ${node.special_instructions ? `<div class="cr-detail-repeat-note">${esc(node.special_instructions)}</div>` : ''}
    ${starsHtml ? `<div class="cr-detail-rating">${starsHtml}</div>` : ''}
    ${node.completion_count > 1 ? `<div class="cr-detail-repeat-note">${node.completion_count}× completed</div>` : ''}
  </div>`;
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function renderSummaryStrip(summary) {
    const pct = summary.total_nodes > 0
        ? Math.round((summary.completed_nodes / summary.total_nodes) * 100)
        : 0;
    return `<div class="cr-summary">
    <div class="cr-summary-stats">
      <div class="cr-stat">
        <span class="cr-stat-label">${esc(summary.position_label || 'Position')}</span>
        <span class="cr-stat-value">${esc(summary.position_text || 'Not started')}</span>
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

// ─── List view ────────────────────────────────────────────────────────────────

function renderStars(rating) {
    if (rating == null) return '';
    const meta = ratingMeta(rating);
    const title = meta ? `${meta.label} — ${meta.subtitle}` : `${rating}/5`;
    let html = `<span class="cr-stars" aria-label="${esc(title)}" title="${esc(title)}">`;
    for (let i = 1; i <= 5; i++) html += `<span class="${i <= rating ? 'cr-star--filled' : 'cr-star--empty'}">★</span>`;
    return html + '</span>';
}

function renderNodeCard(node, currentNodeId) {
    const isCurrent  = node.id === currentNodeId;
    const isRest     = node.node_type === 'rest' || node.node_type === 'recovery' || node.day_role === 'recovery';
    const isRevision = ['revision', 'choice', 'instruction', 'consolidation'].includes(node.node_type);
    const dur        = formatDuration(node.duration_minutes);
    const comp       = node.curriculum_payload?.practice_composition;
    const isComposed = Array.isArray(comp) && comp.length > 1;

    let chipHtml;
    if (isCurrent)                      chipHtml = `<span class="cr-chip cr-chip--current">${node.is_explicit_current ? 'Today' : 'Next'}</span>`;
    else if (isRest)                    chipHtml = `<span class="cr-chip cr-chip--rest">${node.node_type === 'recovery' ? 'Recovery' : 'Rest'}</span>`;
    else if (isRevision)                chipHtml = `<span class="cr-chip cr-chip--revision">${esc(nodeTypeLabel(node) || 'Review')}</span>`;
    else if (node.status === 'plateau') chipHtml = '<span class="cr-chip cr-chip--plateau">Plateau</span>';
    else if (node.status === 'repeated') chipHtml = '<span class="cr-chip cr-chip--repeated">Repeated</span>';
    else if (node.status === 'completed') chipHtml = '<span class="cr-chip cr-chip--done">Done</span>';
    else                                chipHtml = '<span class="cr-chip cr-chip--upcoming">Upcoming</span>';

    // Source: suppress for rest/revision
    let sourceText = null;
    if (!isRest && !isRevision && node.source_name && node.source_name !== ACTIVE_CURRICULUM_NAME) {
        sourceText = node.source_reference ? `${node.source_name} — ${node.source_reference}` : node.source_name;
    }

    const metaRow = [
        dur && !isRest ? `<span class="cr-node-dur">${esc(dur)}</span>` : '',
        sourceText ? `<span class="cr-node-source">${esc(sourceText)}</span>` : '',
        node.primary_focus && !isRest && !isRevision ? `<span class="cr-node-theme">${esc(node.primary_focus)}</span>` : '',
        node.day_role ? `<span class="cr-node-theme">${esc(tokenLabel(node.day_role))}</span>` : '',
        node.recovery_type ? `<span class="cr-node-theme">${esc(tokenLabel(node.recovery_type))}</span>` : '',
    ].filter(Boolean).join('');

    const partsHtml = isComposed
        ? `<div class="cr-node-parts">${comp.map((p, idx) => `
          <div class="cr-node-part">
            <span class="cr-node-part-label">${esc(roleLabel(p.role))}</span>
            <span class="cr-node-part-title">Part ${idx + 1}</span>
            ${p.source_name ? `<span class="cr-node-part-source">${esc(p.source_name)}</span>` : ''}
          </div>`).join('')}
        </div>` : '';

    const cardMod = [
        isCurrent ? ' cr-node--current' : '',
        DONE_STATUSES.includes(node.status) && !isCurrent ? ' cr-node--done' : '',
        node.status === 'upcoming' ? ' cr-node--upcoming' : '',
    ].join('');

    return `<div class="cr-node${cardMod}">
    <div class="cr-node-row">
      <span class="cr-node-day">D${node.day_number}</span>
      <div class="cr-node-body">
        <div class="cr-node-head">
          <span class="cr-node-title">${esc(node.title)}</span>
          ${chipHtml}
        </div>
        ${metaRow ? `<div class="cr-node-meta">${metaRow}</div>` : ''}
      </div>
      ${['completed', 'repeated', 'plateau'].includes(node.status) && node.best_rating != null ? `<div class="cr-node-rating">${renderStars(node.best_rating)}</div>` : ''}
    </div>
    ${partsHtml}
  </div>`;
}

function renderListView(levels, currentNodeId) {
    return `<div class="cr-levels" id="cr-list-view">
    ${levels.map(level => {
        const isComplete = level.status === 'complete';
        const isCurrent  = level.status === 'current';
        const allNodes   = level.weeks.flatMap(w => w.nodes);
        const doneCount  = allNodes.filter(n => DONE_STATUSES.includes(n.status)).length;
        const levelStatusHtml = isComplete
            ? '<span class="cr-level-status cr-level-status--done">Complete</span>'
            : isCurrent
            ? '<span class="cr-level-status cr-level-status--current">In progress</span>'
            : '<span class="cr-level-status cr-level-status--upcoming">Coming later</span>';

        const weeks = level.weeks.map(week => {
            const hasCurrent = week.nodes.some(n => n.id === currentNodeId);
            const allDone    = week.nodes.length > 0 && week.nodes.every(n => DONE_STATUSES.includes(n.status));
            const doneW      = week.nodes.filter(n => DONE_STATUSES.includes(n.status)).length;
            let weekStatus = '';
            if (hasCurrent) weekStatus = '<span class="cr-week-status cr-week-status--current">In progress</span>';
            else if (allDone) weekStatus = '<span class="cr-week-status cr-week-status--done">Complete</span>';
            else if (doneW > 0) weekStatus = '<span class="cr-week-status cr-week-status--current">In progress</span>';
            const open = hasCurrent || (doneW > 0 && !allDone) ? ' open' : '';
            return `<details class="cr-week"${open}>
          <summary class="cr-week-summary">
            <svg class="cr-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="5,3 11,8 5,13"/></svg>
            <span class="cr-week-label">Week ${week.week_number}</span>
            ${weekStatus}
            <span class="cr-week-count">${doneW}/${week.nodes.length}</span>
          </summary>
          <div class="cr-nodes">
            ${week.nodes.map(n => renderNodeCard(n, currentNodeId)).join('')}
          </div>
        </details>`;
        }).join('');

        return `<details class="cr-level"${isCurrent ? ' open' : ''}>
        <summary class="cr-level-summary">
          <svg class="cr-chevron cr-level-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="5,3 11,8 5,13"/></svg>
          <span class="cr-level-label">${esc(level.label)}</span>
          ${levelStatusHtml}
          <span class="cr-level-count">${doneCount} of ${allNodes.length}</span>
        </summary>
        <div class="cr-weeks">${weeks}</div>
      </details>`;
    }).join('')}
  </div>`;
}

// ─── Map view wrapper ─────────────────────────────────────────────────────────

function renderMapView(placed, currentNodeId) {
    const mapSvg = renderMap(placed, currentNodeId, currentNodeId);
    const defaultNode = placed.find(node => node.id === currentNodeId) || placed[0] || null;
    return `<div id="cr-map-view">
    <div class="cr-map-content">
      <div class="cr-map-main">
        <div class="cr-map-topbar">
          <div class="cr-map-legend">
            <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#1e8e83"></span>Asana</span>
            <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#5e9ed6"></span>Pranayama</span>
            <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#4a7fa5"></span>Revision</span>
            <span class="cr-legend-item"><span class="cr-legend-dot" style="background:#bfb9af;border:1px solid #a8a39a"></span>Rest</span>
            <span class="cr-legend-item cr-legend-interchange"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#1e8e83" stroke-width="2"/><circle cx="7" cy="7" r="2" fill="#1e8e83"/></svg>Combined</span>
          </div>
        </div>
        <div class="cr-map-scroll">${mapSvg}</div>
      </div>
      <div class="cr-detail-section">
        <div class="cr-detail-section-label">Practice details</div>
        <div class="cr-detail-wrap" id="cr-detail-wrap" data-testid="curriculum-detail">${renderStationDetail(defaultNode, !defaultNode)}</div>
      </div>
    </div>
  </div>`;
}

// ─── Full roadmap render ──────────────────────────────────────────────────────

function renderRoadmap(assembledNodes, levels, summary) {
    const placed = buildLayout(assembledNodes.map(n => ({ ...n, level_label: n.progression_group_label || levelDisplayName(n.level_number) })));

    return `
    <div class="cr-program-name">${esc(ACTIVE_CURRICULUM_NAME)}</div>
    ${renderSummaryStrip(summary)}
    <div class="cr-view-toggle" role="tablist" aria-label="Journey view">
      <button class="cr-view-btn cr-view-btn--active" id="cr-btn-map" role="tab" aria-selected="true">Map view</button>
      <button class="cr-view-btn" id="cr-btn-list" role="tab" aria-selected="false">List view</button>
    </div>
    <div id="cr-map-container">${renderMapView(placed, summary.current_node_id)}</div>
    <div id="cr-list-container" style="display:none">${renderListView(levels, summary.current_node_id)}</div>`;
}

// ─── View toggle ──────────────────────────────────────────────────────────────

function wireViewToggle() {
    const mapBtn  = document.getElementById('cr-btn-map');
    const listBtn = document.getElementById('cr-btn-list');
    if (!mapBtn || !listBtn) return;

    function activateView(view) {
        const mapDiv  = document.getElementById('cr-map-container');
        const listDiv = document.getElementById('cr-list-container');
        if (!mapDiv || !listDiv) return;
        if (view === 'map') {
            mapDiv.style.display   = '';
            listDiv.style.display  = 'none';
            mapBtn.classList.add('cr-view-btn--active');     mapBtn.setAttribute('aria-selected', 'true');
            listBtn.classList.remove('cr-view-btn--active'); listBtn.setAttribute('aria-selected', 'false');
        } else {
            mapDiv.style.display   = 'none';
            listDiv.style.display  = '';
            listBtn.classList.add('cr-view-btn--active');   listBtn.setAttribute('aria-selected', 'true');
            mapBtn.classList.remove('cr-view-btn--active'); mapBtn.setAttribute('aria-selected', 'false');
        }
    }

    mapBtn.addEventListener('click',  () => activateView('map'));
    listBtn.addEventListener('click', () => activateView('list'));
}

// ─── Station click handling ───────────────────────────────────────────────────

function wireMapClicks(assembledNodes, currentNodeId) {
    const nodeById = new Map(assembledNodes.map(n => [n.id, n]));
    const backdrop = document.getElementById('curriculumMapBackdrop');
    if (!backdrop) return;

    function handleSelect(id) {
        const node = nodeById.get(id);
        if (!node) return;

        // Re-render SVG with selection ring
        const placed = buildLayout(assembledNodes.map(n => ({ ...n, level_label: n.progression_group_label || levelDisplayName(n.level_number) })));
        const mapScroll = document.querySelector('#curriculumMapBackdrop .cr-map-scroll');
        if (mapScroll) mapScroll.innerHTML = renderMap(placed, currentNodeId, id);

        const detailWrap = document.getElementById('cr-detail-wrap');
        if (detailWrap) {
            detailWrap.innerHTML = renderStationDetail(node, false);
            if (window.innerWidth < 600) {
                detailWrap.closest('.cr-detail-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    backdrop.addEventListener('click', e => {
        const circle = e.target.closest('.cr-map-hit-target, .cr-map-station');
        if (circle) handleSelect(parseInt(circle.getAttribute('data-id'), 10));
    });

    backdrop.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const circle = e.target.closest('.cr-map-hit-target, .cr-map-station');
        if (!circle) return;
        e.preventDefault();
        handleSelect(parseInt(circle.getAttribute('data-id'), 10));
    });
}

// ─── Open / close ─────────────────────────────────────────────────────────────

async function openCurriculumRoadmap() {
    const backdrop = document.getElementById('curriculumMapBackdrop');
    const body     = document.getElementById('curriculumMapBody');
    if (!backdrop || !body) return;

    // Show modal immediately with loading state
    backdrop.style.display = 'flex';
    document.body.classList.add('modal-open');
    body.innerHTML = '<div class="cr-loading cr-loading--full">Loading curriculum map...</div>';

    try {
        const { nodes, completions } = await loadRoadmapData();

        // Get current node from live app state
        const currentPractice = window.currentCurriculumPractice;
        const currentNodeId   = currentPractice?.curriculum_node_id ?? null;

        const assembledNodes = assembleRoadmapNodes(nodes, completions, currentNodeId);
        const currentNode    = assembledNodes.find(n => n.is_current) || null;
        const effectiveCurrentNodeId = currentNode?.id ?? null;
        const levels         = groupIntoLevels(assembledNodes);
        const summary        = buildSummary(levels, assembledNodes, currentNode);

        body.innerHTML = renderRoadmap(assembledNodes, levels, summary);

        wireViewToggle();
        wireMapClicks(assembledNodes, effectiveCurrentNodeId);

        // Scroll map to current node if it exists
        if (effectiveCurrentNodeId) {
            const mapScroll = body.querySelector('.cr-map-scroll');
            if (mapScroll) {
                const placed = buildLayout(assembledNodes.map(n => ({ ...n, level_label: n.progression_group_label || levelDisplayName(n.level_number) })));
                const currentPlaced = placed.find(n => n.id === effectiveCurrentNodeId);
                if (currentPlaced) {
                    // Scroll horizontally so current node is visible
                    const scrollTarget = Math.max(0, currentPlaced.x - 120);
                    mapScroll.scrollLeft = scrollTarget;
                }
            }
        }
    } catch (err) {
        console.error('[curriculumRoadmapUI] Failed to load roadmap:', err);
        body.innerHTML = `<div class="cr-loading cr-loading--error">Failed to load curriculum map. Please try again.</div>`;
    }
}

function closeCurriculumRoadmap() {
    const backdrop = document.getElementById('curriculumMapBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    document.body.classList.remove('modal-open');
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupCurriculumRoadmapUI() {
    const btn = document.getElementById('curriculumMapBtn');
    if (!btn) return;

    if (!isDevOrAdmin()) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = '';

    btn.addEventListener('click', () => openCurriculumRoadmap());

    const closeBtn = document.getElementById('curriculumMapCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => closeCurriculumRoadmap());

    // Close on backdrop click
    const backdrop = document.getElementById('curriculumMapBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) closeCurriculumRoadmap();
        });
        // Close on Escape
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && backdrop.style.display !== 'none') closeCurriculumRoadmap();
        });
    }
}
