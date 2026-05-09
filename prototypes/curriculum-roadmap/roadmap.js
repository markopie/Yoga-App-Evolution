/**
 * PROTOTYPE ONLY – curriculum-roadmap
 * No Supabase, no production app code, no imports from src/.
 *
 * FUTURE RPC NOTE:
 *   Recommend adding a read-only Postgres RPC:
 *     get_curriculum_roadmap(p_user_id uuid, p_curriculum_slug text)
 *   returning the shape defined by MOCK_ROADMAP below.
 *   Existing get_today_curriculum_practice only returns the current node;
 *   a roadmap view needs the full graph + completion + rating + source coverage
 *   denormalized so the client doesn't JOIN multiple tables itself.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ROADMAP = {
  curriculum_slug: "iyengar_integrated_master_path_draft_v1",
  program_name: "Iyengar Integrated Master Path",
  summary: {
    total_nodes: 84,
    completed_nodes: 18,
    current_curriculum_node_id: "cn_p2_w5_d3",
    current_week_number: 5,
    current_day_number: 3,
    required_source_sequences_total: 62,
    required_source_sequences_attempted: 17,
    required_source_sequences_remaining: 45,
    source_coverage: [
      {
        source_key: "light_on_yoga",
        source_course: "Light on Yoga – Asana Programme",
        required_count: 28,
        scheduled_count: 28,
        completed_count: 8,
      },
      {
        source_key: "light_on_pranayama",
        source_course: "Light on Pranayama – 200-Week Course",
        required_count: 18,
        scheduled_count: 18,
        completed_count: 4,
      },
      {
        source_key: "yoga_dipika_extra",
        source_course: "Yoga Dipika Supplemental",
        required_count: 8,
        scheduled_count: 8,
        completed_count: 3,
      },
      {
        source_key: "iyengar_way",
        source_course: "The Iyengar Way",
        required_count: 8,
        scheduled_count: 8,
        completed_count: 2,
      },
    ],
  },
  phases: [
    // ── Phase 1: Foundation (completed) ──────────────────────────────────────
    {
      phase_id: "ph_1",
      title: "Phase 1 – Foundation",
      status: "complete",
      weeks: [
        {
          week_number: 1,
          status: "complete",
          nodes: [
            {
              curriculum_node_id: "cn_p1_w1_d1",
              order_index: 1,
              week_number: 1,
              day_number: 1,
              title: "Standing Poses Introduction",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w1_standing",
              status: "complete",
              rating: 4,
              duration_minutes: 45,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 1",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p1_w1_d2",
              order_index: 2,
              week_number: 1,
              day_number: 2,
              title: "Rest Day",
              node_type: "rest",
              resolved_node_type: "rest",
              practice_track: null,
              sequence_id: null,
              status: "complete",
              rating: null,
              duration_minutes: 0,
              source_key: null,
              source_course: null,
              source_reference: null,
              is_revision_node: false,
              is_rest_day: true,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p1_w1_d3",
              order_index: 3,
              week_number: 1,
              day_number: 3,
              title: "Seated Forward Bends – Level 1",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w1_seated",
              status: "complete",
              rating: 5,
              duration_minutes: 50,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 1 – Seated",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
        {
          week_number: 2,
          status: "complete",
          nodes: [
            {
              curriculum_node_id: "cn_p1_w2_d1",
              order_index: 4,
              week_number: 2,
              day_number: 1,
              title: "Pranayama Introduction",
              node_type: "practice",
              resolved_node_type: "composed",
              practice_track: "combined",
              sequence_id: null,
              status: "complete",
              rating: 3,
              duration_minutes: 60,
              source_key: null,
              source_course: null,
              source_reference: "LoY W2 + LoP W1",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: "main",
                    sequence_id: "seq_loy_w2_standing",
                    title: "Standing Poses – Set 2",
                    duration_minutes: 45,
                    counts_for_source_completion: true,
                    source_key: "light_on_yoga",
                    source_course: "Light on Yoga – Asana Programme",
                  },
                  {
                    part_number: 2,
                    role: "supplemental",
                    sequence_id: "seq_lop_w1_intro",
                    title: "Pranayama – Ujjayi Introduction",
                    duration_minutes: 15,
                    counts_for_source_completion: true,
                    source_key: "light_on_pranayama",
                    source_course: "Light on Pranayama – 200-Week Course",
                  },
                ],
              },
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p1_w2_d2",
              order_index: 5,
              week_number: 2,
              day_number: 2,
              title: "Week 2 Revision",
              node_type: "revision",
              resolved_node_type: "revision",
              practice_track: "asana",
              sequence_id: "seq_loy_w2_revision",
              status: "complete",
              rating: 4,
              duration_minutes: 50,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY W2 Revision",
              is_revision_node: true,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: true },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p1_w2_d3",
              order_index: 6,
              week_number: 2,
              day_number: 3,
              title: "Inversions Introduction (Optional)",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_inversions_intro",
              status: "complete",
              rating: 5,
              duration_minutes: 35,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY W2 Optional",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: true,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
        {
          week_number: 3,
          status: "complete",
          nodes: [
            {
              curriculum_node_id: "cn_p1_w3_d1",
              order_index: 7,
              week_number: 3,
              day_number: 1,
              title: "Backbend Foundations",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w3_backbends",
              status: "complete",
              rating: 4,
              duration_minutes: 55,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 3",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p1_w3_milestone",
              order_index: 8,
              week_number: 3,
              day_number: 2,
              title: "Phase 1 Mastery Check",
              node_type: "mastery_gate",
              resolved_node_type: "mastery_gate",
              practice_track: "asana",
              sequence_id: "seq_loy_p1_mastery",
              status: "complete",
              rating: 5,
              duration_minutes: 75,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Phase 1 Gate",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: "phase_gate", progression_gate: true, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
      ],
    },

    // ── Phase 2: Development (current) ───────────────────────────────────────
    {
      phase_id: "ph_2",
      title: "Phase 2 – Development",
      status: "current",
      weeks: [
        {
          week_number: 4,
          status: "complete",
          nodes: [
            {
              curriculum_node_id: "cn_p2_w4_d1",
              order_index: 9,
              week_number: 4,
              day_number: 1,
              title: "Extended Standing Cycle",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w4_standing_ext",
              status: "complete",
              rating: 3,
              duration_minutes: 60,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 4",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p2_w4_d2",
              order_index: 10,
              week_number: 4,
              day_number: 2,
              title: "Rest Day",
              node_type: "rest",
              resolved_node_type: "rest",
              practice_track: null,
              sequence_id: null,
              status: "complete",
              rating: null,
              duration_minutes: 0,
              source_key: null,
              source_course: null,
              source_reference: null,
              is_revision_node: false,
              is_rest_day: true,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p2_w4_d3",
              order_index: 11,
              week_number: 4,
              day_number: 3,
              title: "Twists + Short Pranayama",
              node_type: "practice",
              resolved_node_type: "composed",
              practice_track: "combined",
              sequence_id: null,
              status: "complete",
              rating: 4,
              duration_minutes: 65,
              source_key: null,
              source_course: null,
              source_reference: "LoY W4 + LoP W3",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: "main",
                    sequence_id: "seq_loy_w4_twists",
                    title: "Twists Sequence",
                    duration_minutes: 50,
                    counts_for_source_completion: true,
                    source_key: "light_on_yoga",
                    source_course: "Light on Yoga – Asana Programme",
                  },
                  {
                    part_number: 2,
                    role: "supplemental",
                    sequence_id: "seq_lop_w3_nadi",
                    title: "Nadi Shodhana – Stage 1",
                    duration_minutes: 15,
                    counts_for_source_completion: true,
                    source_key: "light_on_pranayama",
                    source_course: "Light on Pranayama – 200-Week Course",
                  },
                ],
              },
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
        {
          week_number: 5,
          status: "current",
          nodes: [
            {
              curriculum_node_id: "cn_p2_w5_d1",
              order_index: 12,
              week_number: 5,
              day_number: 1,
              title: "Shoulder Girdle Opening",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w5_shoulder",
              status: "complete",
              rating: 3,
              duration_minutes: 55,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 5",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: true, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p2_w5_d2",
              order_index: 13,
              week_number: 5,
              day_number: 2,
              title: "Hip Opening Sequence",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_iyengar_way_hips",
              status: "complete",
              rating: 2,
              duration_minutes: 50,
              source_key: "iyengar_way",
              source_course: "The Iyengar Way",
              source_reference: "IW Ch.4 Hips",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: true, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p2_w5_d3",
              order_index: 14,
              week_number: 5,
              day_number: 3,
              title: "Asana + Pranayama Combined",
              node_type: "practice",
              resolved_node_type: "composed",
              practice_track: "combined",
              sequence_id: null,
              status: "current",
              rating: null,
              duration_minutes: 70,
              source_key: null,
              source_course: null,
              source_reference: "LoY W5 + LoP W5",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: "main",
                    sequence_id: "seq_loy_w5_backbend_ext",
                    title: "Extended Backbend Practice",
                    duration_minutes: 50,
                    counts_for_source_completion: true,
                    source_key: "light_on_yoga",
                    source_course: "Light on Yoga – Asana Programme",
                  },
                  {
                    part_number: 2,
                    role: "supplemental",
                    sequence_id: "seq_lop_w5_ujjayi_ext",
                    title: "Ujjayi Extended – Ratio Work",
                    duration_minutes: 20,
                    counts_for_source_completion: true,
                    source_key: "light_on_pranayama",
                    source_course: "Light on Pranayama – 200-Week Course",
                  },
                ],
              },
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
        {
          week_number: 6,
          status: "upcoming",
          nodes: [
            {
              curriculum_node_id: "cn_p2_w6_d1",
              order_index: 15,
              week_number: 6,
              day_number: 1,
              title: "Supine Sequence",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w6_supine",
              status: "upcoming",
              rating: null,
              duration_minutes: 55,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 6",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p2_w6_d2",
              order_index: 16,
              week_number: 6,
              day_number: 2,
              title: "Phase 2 Revision (Optional)",
              node_type: "revision",
              resolved_node_type: "revision",
              practice_track: "asana",
              sequence_id: "seq_loy_p2_revision",
              status: "upcoming",
              rating: null,
              duration_minutes: 60,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY P2 Rev",
              is_revision_node: true,
              is_rest_day: false,
              is_optional: true,
              is_locked: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: true },
              practice_composition: null,
            },
          ],
        },
      ],
    },

    // ── Phase 3: Deepening (locked) ───────────────────────────────────────────
    {
      phase_id: "ph_3",
      title: "Phase 3 – Deepening",
      status: "locked",
      weeks: [
        {
          week_number: 7,
          status: "locked",
          nodes: [
            {
              curriculum_node_id: "cn_p3_w7_d1",
              order_index: 17,
              week_number: 7,
              day_number: 1,
              title: "Advanced Inversions",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w7_inversions_adv",
              status: "locked",
              rating: null,
              duration_minutes: 65,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 7",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: true,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p3_w7_d2",
              order_index: 18,
              week_number: 7,
              day_number: 2,
              title: "Pranayama + Meditation Gate",
              node_type: "mastery_gate",
              resolved_node_type: "mastery_gate",
              practice_track: "pranayama",
              sequence_id: "seq_lop_w7_gate",
              status: "locked",
              rating: null,
              duration_minutes: 80,
              source_key: "light_on_pranayama",
              source_course: "Light on Pranayama – 200-Week Course",
              source_reference: "LoP Week 7 Gate",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: true,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: "phase_gate", progression_gate: true, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
        {
          week_number: 8,
          status: "locked",
          nodes: [
            {
              curriculum_node_id: "cn_p3_w8_d1",
              order_index: 19,
              week_number: 8,
              day_number: 1,
              title: "Full Standing Programme",
              node_type: "practice",
              resolved_node_type: "practice",
              practice_track: "asana",
              sequence_id: "seq_loy_w8_full_standing",
              status: "locked",
              rating: null,
              duration_minutes: 75,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 8",
              is_revision_node: false,
              is_rest_day: false,
              is_optional: false,
              is_locked: true,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
          ],
        },
      ],
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(node) {
  if (node.is_rest_day) return { key: "rest", label: "Rest" };
  if (node.is_locked)   return { key: "locked", label: "Locked" };
  const map = {
    complete:     { key: "complete",  label: "Done" },
    current:      { key: "current",   label: "Today" },
    upcoming:     { key: "upcoming",  label: "Upcoming" },
    locked:       { key: "locked",    label: "Locked" },
    revision:     { key: "revision",  label: "Revision" },
    mastery_gate: { key: "mastery",   label: "Mastery Gate" },
    rest:         { key: "rest",      label: "Rest" },
    optional:     { key: "optional",  label: "Optional" },
  };
  if (node.resolved_node_type === "mastery_gate") return map.mastery_gate;
  if (node.resolved_node_type === "revision")     return map.revision;
  if (node.is_optional)                           return map.optional;
  return map[node.status] || { key: "upcoming", label: node.status };
}

function renderStars(rating, maxStars = 5) {
  if (rating == null) return "";
  let html = '<span class="curriculum-roadmap__rating" aria-label="Rating: ' + rating + ' of ' + maxStars + '">';
  for (let i = 1; i <= maxStars; i++) {
    const cls = i <= rating
      ? "curriculum-roadmap__rating-star--filled"
      : "curriculum-roadmap__rating-star--empty";
    html += `<span class="${cls}">★</span>`;
  }
  html += "</span>";
  return html;
}

function formatDuration(mins) {
  if (!mins) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function phaseStatusLabel(status) {
  const map = { complete: "Done", current: "In Progress", locked: "Locked", upcoming: "Upcoming" };
  return map[status] || status;
}

// ─── Coverage pct ─────────────────────────────────────────────────────────────

function coveragePct(row) {
  if (!row.scheduled_count) return 0;
  return Math.round((row.completed_count / row.scheduled_count) * 100);
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderFlags(node) {
  const flags = [];
  if (node.metadata?.plateau_candidate)  flags.push("Plateau Candidate");
  if (node.metadata?.progression_gate)   flags.push("Progression Gate");
  if (node.metadata?.can_repeat_indefinitely) flags.push("Repeatable");
  if (node.metadata?.milestone_type)     flags.push(node.metadata.milestone_type.replace(/_/g, " "));
  if (!flags.length) return "";
  return `<div class="curriculum-roadmap__flags">${flags.map(f => `<span class="curriculum-roadmap__flag">${esc(f)}</span>`).join("")}</div>`;
}

function renderParts(node) {
  const comp = node.curriculum_payload?.practice_composition;
  if (!comp?.length) return "";
  const rows = comp.map(p => `
    <div class="curriculum-roadmap__part">
      <span class="curriculum-roadmap__part-num">P${p.part_number}</span>
      <div class="curriculum-roadmap__part-body">
        <div class="curriculum-roadmap__part-title">${esc(p.title)}</div>
        <div class="curriculum-roadmap__part-meta">
          ${p.duration_minutes ? `<span>${formatDuration(p.duration_minutes)}</span>` : ""}
          ${p.source_key ? `<span>${esc(p.source_key)}</span>` : ""}
          <span class="curriculum-roadmap__node-ref">${esc(p.sequence_id)}</span>
          ${p.counts_for_source_completion ? `<span class="curriculum-roadmap__part-counts-tag">counts</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
  return `<div class="curriculum-roadmap__parts">${rows}</div>`;
}

function renderNode(node, currentNodeId) {
  const isCurrent = node.curriculum_node_id === currentNodeId;
  const badge = statusBadge(node);
  const parts = renderParts(node);
  const flags = renderFlags(node);

  return `
    <div class="curriculum-roadmap__node${isCurrent ? " curriculum-roadmap__node--current" : ""}">
      <div class="curriculum-roadmap__node-row">
        <span class="curriculum-roadmap__node-day">D${node.day_number}</span>
        <div class="curriculum-roadmap__node-body">
          <div class="curriculum-roadmap__node-title">${esc(node.title)}</div>
          <div class="curriculum-roadmap__node-meta-row">
            ${node.duration_minutes ? `<span class="curriculum-roadmap__node-duration">${formatDuration(node.duration_minutes)}</span>` : ""}
            ${node.source_key ? `<span class="curriculum-roadmap__node-source">${esc(node.source_key)}</span>` : ""}
            ${node.practice_track ? `<span class="curriculum-roadmap__node-track">${esc(node.practice_track)}</span>` : ""}
            ${node.source_reference ? `<span class="curriculum-roadmap__node-ref">${esc(node.source_reference)}</span>` : ""}
          </div>
          ${flags}
        </div>
        <div class="curriculum-roadmap__node-right">
          <span class="curriculum-roadmap__badge curriculum-roadmap__badge--${badge.key}">${badge.label}</span>
          ${renderStars(node.rating)}
        </div>
      </div>
      ${parts}
    </div>
  `;
}

function weekStatusBadge(status) {
  const map = {
    complete: "complete",
    current:  "current",
    upcoming: "upcoming",
    locked:   "locked",
  };
  return map[status] || "upcoming";
}

function renderWeek(week, currentNodeId, forceOpen) {
  const open = forceOpen ? " open" : "";
  const nodeCount = week.nodes.length;
  const doneCount = week.nodes.filter(n => n.status === "complete").length;
  const badgeCls = `curriculum-roadmap__badge curriculum-roadmap__badge--${weekStatusBadge(week.status)}`;
  const nodes = week.nodes.map(n => renderNode(n, currentNodeId)).join("");

  return `
    <details class="curriculum-roadmap__week"${open}>
      <summary class="curriculum-roadmap__week-summary">
        <svg class="curriculum-roadmap__week-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="5,3 11,8 5,13"/>
        </svg>
        <span class="curriculum-roadmap__week-label">Week ${week.week_number}</span>
        <span class="${badgeCls}" style="margin-right:.35rem">${phaseStatusLabel(week.status)}</span>
        <span class="curriculum-roadmap__week-meta">${doneCount}/${nodeCount} done</span>
      </summary>
      <div class="curriculum-roadmap__nodes">
        ${nodes}
      </div>
    </details>
  `;
}

function renderPhase(phase, currentWeek, currentNodeId) {
  const isCurrent = phase.status === "current";
  const isComplete = phase.status === "complete";
  const open = isCurrent ? " open" : "";
  const totalNodes = phase.weeks.reduce((s, w) => s + w.nodes.length, 0);
  const doneNodes  = phase.weeks.reduce((s, w) => s + w.nodes.filter(n => n.status === "complete").length, 0);
  const badgeCls = `curriculum-roadmap__badge curriculum-roadmap__badge--${weekStatusBadge(phase.status)}`;

  const weeks = phase.weeks.map(w => {
    const isCurrentWeek = w.week_number === currentWeek;
    const weekOpen = !isComplete && (isCurrentWeek || w.status === "current");
    return renderWeek(w, currentNodeId, weekOpen);
  }).join("");

  return `
    <details class="curriculum-roadmap__phase"${open}>
      <summary class="curriculum-roadmap__phase-summary">
        <svg class="curriculum-roadmap__phase-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="5,3 11,8 5,13"/>
        </svg>
        <span class="curriculum-roadmap__phase-title">${esc(phase.title)}</span>
        <span class="${badgeCls}" style="margin-right:.5rem">${phaseStatusLabel(phase.status)}</span>
        <span class="curriculum-roadmap__phase-meta">${doneNodes}/${totalNodes} nodes</span>
      </summary>
      <div class="curriculum-roadmap__weeks">${weeks}</div>
    </details>
  `;
}

function renderSummary(summary) {
  const completedPct = Math.round((summary.completed_nodes / summary.total_nodes) * 100);
  const sourcePct    = Math.round((summary.required_source_sequences_attempted / summary.required_source_sequences_total) * 100);

  const coverageRows = summary.source_coverage.map(row => {
    const pct = coveragePct(row);
    return `
      <div class="curriculum-roadmap__coverage-row">
        <span class="curriculum-roadmap__coverage-source" title="${esc(row.source_course)}">${esc(row.source_course)}</span>
        <div class="curriculum-roadmap__coverage-bar-wrap">
          <div class="curriculum-roadmap__coverage-bar">
            <div class="curriculum-roadmap__coverage-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="curriculum-roadmap__coverage-pct">${row.completed_count}/${row.scheduled_count} (${pct}%)</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="curriculum-roadmap__summary">
      <div class="curriculum-roadmap__summary-grid">
        <div class="curriculum-roadmap__stat">
          <span class="curriculum-roadmap__stat-label">Current</span>
          <span class="curriculum-roadmap__stat-value">W${summary.current_week_number} · D${summary.current_day_number}</span>
        </div>
        <div class="curriculum-roadmap__stat">
          <span class="curriculum-roadmap__stat-label">Nodes</span>
          <span class="curriculum-roadmap__stat-value">${summary.completed_nodes} / ${summary.total_nodes}</span>
          <span class="curriculum-roadmap__stat-sub">${completedPct}% complete</span>
        </div>
        <div class="curriculum-roadmap__stat">
          <span class="curriculum-roadmap__stat-label">Sources Attempted</span>
          <span class="curriculum-roadmap__stat-value">${summary.required_source_sequences_attempted} / ${summary.required_source_sequences_total}</span>
          <span class="curriculum-roadmap__stat-sub">${sourcePct}% of required</span>
        </div>
        <div class="curriculum-roadmap__stat">
          <span class="curriculum-roadmap__stat-label">Remaining</span>
          <span class="curriculum-roadmap__stat-value">${summary.required_source_sequences_remaining}</span>
          <span class="curriculum-roadmap__stat-sub">required sequences left</span>
        </div>
      </div>
      <div class="curriculum-roadmap__coverage-title">Source Coverage</div>
      <div class="curriculum-roadmap__coverage-list">${coverageRows}</div>
    </div>
  `;
}

// ─── Main render ──────────────────────────────────────────────────────────────

function render(data) {
  const { summary, phases, program_name, curriculum_slug } = data;
  const currentNodeId = summary.current_curriculum_node_id;
  const currentWeek   = summary.current_week_number;

  const phasesHtml = phases
    .map(ph => renderPhase(ph, currentWeek, currentNodeId))
    .join("");

  return `
    <div class="curriculum-roadmap__header">
      <div>
        <div class="curriculum-roadmap__title">${esc(program_name)}</div>
        <div class="curriculum-roadmap__slug">${esc(curriculum_slug)}</div>
      </div>
      <button class="curriculum-roadmap__jump-btn" onclick="alert('Prototype only – no navigation wired.')">
        Jump to Current Practice
      </button>
    </div>
    <div class="curriculum-roadmap__proto-banner">
      PROTOTYPE · mock data · no Supabase · iyengar_integrated_master_path_draft_v1
    </div>
    ${renderSummary(summary)}
    <div class="curriculum-roadmap__phases">
      ${phasesHtml || '<div class="curriculum-roadmap__empty">No phases found.</div>'}
    </div>
  `;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const root = document.getElementById("app");
if (root) {
  root.innerHTML = render(MOCK_ROADMAP);
} else {
  console.error("[roadmap] #app element not found");
}
