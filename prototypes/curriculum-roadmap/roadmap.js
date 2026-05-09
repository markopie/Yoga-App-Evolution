/**
 * PROTOTYPE ONLY – curriculum-roadmap
 * No Supabase calls. No production app imports. Mock data only.
 *
 * ── Confirmed real DB shape (qrcpiyncvfmpmeuyhsha) ───────────────────────────
 *
 * public.sequence_completions columns (all confirmed live):
 *   id, title, category, completed_at, duration_seconds, notes, created_at,
 *   status, user_id, rating, sequence_id, curriculum_node_id,
 *   difficulty_feedback, completed, duration_scale_used,
 *   planned_duration_minutes, actual_adjusted_duration_minutes
 *
 * Other confirmed live objects:
 *   - public.completion_rating_options
 *   - public.program_curriculum
 *   - public.source_sequence_inventory
 *   - public.v_source_sequence_inventory_enriched
 *   - RPC: get_today_curriculum_practice
 *   - RPC: get_next_curriculum_node
 *   - RPC: resolve_revision_curriculum_node
 *
 * ── Mock field status legend ──────────────────────────────────────────────────
 *
 * [REAL-RPC]    Field returned by get_today_curriculum_practice. Confirmed.
 * [REAL-DB]     Column exists in a live table. Confirmed.
 * [DERIVED]     Not stored; computed from real fields (e.g. status from
 *               completions + current-node pointer, duration from
 *               course_sequence_analysis).
 * [ROADMAP-RPC] Would be returned by a future get_curriculum_roadmap RPC.
 *               Does not exist yet; shape is a design proposal.
 * [SPECULATIVE] Not in any live table or RPC today. Future planning concept.
 *
 * ── Future RPC recommendation ────────────────────────────────────────────────
 *
 * get_today_curriculum_practice returns only the current node.
 * A roadmap needs the full graph + completion + rating + source coverage,
 * denormalized so the client doesn't JOIN program_curriculum +
 * source_sequence_inventory + sequence_completions itself.
 *
 * Recommended new read-only RPC:
 *   get_curriculum_roadmap(p_user_id uuid, p_curriculum_slug text)
 *
 * It should return the shape defined by MOCK_ROADMAP below.
 *
 * ── Composed-day duplicate-completion note ───────────────────────────────────
 *
 * historyService.js writes one sequence_completions row per
 * counts_for_source_completion part. A roadmap grouping by
 * curriculum_node_id must deduplicate (e.g. GROUP BY curriculum_node_id,
 * take MAX(rating)) to avoid double-counting.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────
//
// sequence_id values are integers matching courses.id in the real DB.
// practice_composition roles use the real vocabulary from curriculumUI.js:
//   primary_asana | appended_pranayama | quiet_asana | supplemental_pranayama
//
// Numeric course IDs used in mock (representative placeholders):
//   101 = LoY Week 1 Standing
//   102 = LoY Week 1 Seated
//   103 = LoY Week 2 Standing
//   104 = LoP Week 1 Ujjayi Intro
//   105 = LoY Week 2 Revision
//   106 = LoY Inversions Intro
//   107 = LoY Week 3 Backbends
//   108 = LoY Phase 1 Mastery
//   109 = LoY Week 4 Standing Extended
//   110 = LoY Week 4 Twists
//   111 = LoP Week 3 Nadi Shodhana
//   112 = LoY Week 5 Shoulder
//   113 = IW Chapter 4 Hips
//   114 = LoY Week 5 Backbend Extended
//   115 = LoP Week 5 Ujjayi Extended
//   116 = LoY Week 6 Supine
//   117 = LoY Phase 2 Revision
//   118 = LoY Week 7 Inversions Advanced
//   119 = LoP Week 7 Gate
//   120 = LoY Week 8 Full Standing

const MOCK_ROADMAP = {
  // [ROADMAP-RPC] Top-level curriculum identifier
  curriculum_slug: "iyengar_integrated_master_path_draft_v1",
  program_name: "Iyengar Integrated Master Path",

  summary: {
    // [REAL-RPC] current_curriculum_node_id returned by get_today_curriculum_practice
    current_curriculum_node_id: "cn_p2_w5_d3",
    // [ROADMAP-RPC] week/day derived from program_curriculum row for current node
    current_week_number: 5,
    current_day_number: 3,
    // [DERIVED] COUNT(*) from program_curriculum for this curriculum_slug
    total_nodes: 84,
    // [DERIVED] COUNT of distinct curriculum_node_id in sequence_completions where completed=true
    completed_nodes: 18,
    // [DERIVED] from source_sequence_inventory JOIN sequence_completions
    required_source_sequences_total: 62,
    required_source_sequences_attempted: 17,
    required_source_sequences_remaining: 45,
    // [DERIVED] from v_source_sequence_inventory_enriched + sequence_completions
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
    // ── Phase 1: Foundation (all weeks completed) ─────────────────────────────
    {
      // [ROADMAP-RPC] phase grouping — not in program_curriculum today; proposed addition
      phase_id: "ph_1",
      title: "Phase 1 – Foundation",
      // [DERIVED] from completion state of contained nodes
      status: "complete",
      weeks: [
        {
          // [REAL-DB] program_curriculum.week_number
          week_number: 1,
          // [DERIVED]
          status: "complete",
          nodes: [
            {
              // [REAL-DB] program_curriculum.curriculum_node_id
              curriculum_node_id: "cn_p1_w1_d1",
              // [REAL-DB] program_curriculum.order_index
              order_index: 1,
              week_number: 1,
              day_number: 1,
              // [REAL-RPC] resolved_course_title from get_today_curriculum_practice
              title: "Standing Poses Introduction",
              // [REAL-DB] program_curriculum.node_type
              node_type: "practice",
              // [REAL-RPC] resolved_node_type
              resolved_node_type: "practice",
              // [REAL-RPC] practice_track
              practice_track: "asana",
              // [REAL-DB] program_curriculum.sequence_id → courses.id (integer)
              sequence_id: 101,
              // [DERIVED] from sequence_completions WHERE curriculum_node_id = this AND completed = true
              status: "complete",
              // [REAL-DB] sequence_completions.rating (1–5 via completion_rating_options)
              rating: 4,
              // [DERIVED] course_sequence_analysis.total_duration_minutes for sequence_id 101
              duration_minutes: 45,
              // [REAL-RPC] source_key
              source_key: "light_on_yoga",
              // [REAL-RPC] source_course
              source_course: "Light on Yoga – Asana Programme",
              // [REAL-RPC] source_reference
              source_reference: "LoY Week 1",
              is_rest_day: false,
              // [SPECULATIVE] not in program_curriculum today
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: null,
              // [SPECULATIVE] future metadata fields — not in any live table today
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
              is_rest_day: true,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
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
              sequence_id: 102,
              status: "complete",
              rating: 5,
              duration_minutes: 50,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 1 – Seated",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
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
              title: "Standing Poses + Pranayama Introduction",
              node_type: "practice",
              // [REAL-RPC] resolved_node_type = "composed" when is_composed_practice is true
              resolved_node_type: "composed",
              practice_track: "combined",
              // [REAL-DB] null for composed nodes; parts live in curriculum_payload
              sequence_id: null,
              status: "complete",
              // [REAL-DB] sequence_completions.rating — for composed days, taken from
              // the primary part's completion row (curriculum_node_id + MAX(rating))
              rating: 3,
              duration_minutes: 60,
              source_key: null,
              source_course: null,
              source_reference: "LoY W2 + LoP W1",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: {
                // [REAL-RPC] practice_composition from curriculum_payload JSONB
                // Role vocabulary confirmed from curriculumUI.js:
                //   primary_asana | appended_pranayama | quiet_asana | supplemental_pranayama
                practice_composition: [
                  {
                    part_number: 1,
                    role: "primary_asana",
                    // sequence_id is integer → courses.id
                    sequence_id: 103,
                    title: "Standing Poses – Set 2",
                    duration_minutes: 45,
                    // [REAL-RPC] counts_for_source_completion controls whether
                    // historyService writes a sequence_completions row for this part
                    counts_for_source_completion: true,
                    source_key: "light_on_yoga",
                    source_course: "Light on Yoga – Asana Programme",
                  },
                  {
                    part_number: 2,
                    role: "appended_pranayama",
                    sequence_id: 104,
                    title: "Ujjayi Introduction",
                    duration_minutes: 15,
                    counts_for_source_completion: true,
                    source_key: "light_on_pranayama",
                    source_course: "Light on Pranayama – 200-Week Course",
                  },
                ],
                total_duration_minutes: 60,
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
              sequence_id: 105,
              status: "complete",
              rating: 4,
              duration_minutes: 50,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY W2 Revision",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: true,
              curriculum_payload: null,
              // [SPECULATIVE] can_repeat_indefinitely not in live program_curriculum
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
              sequence_id: 106,
              status: "complete",
              rating: 5,
              duration_minutes: 35,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY W2 Optional",
              is_rest_day: false,
              is_optional: true,
              is_locked: false,
              is_revision_node: false,
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
              sequence_id: 107,
              status: "complete",
              rating: 4,
              duration_minutes: 55,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 3",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
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
              sequence_id: 108,
              status: "complete",
              rating: 5,
              duration_minutes: 75,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Phase 1 Gate",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: null,
              // [SPECULATIVE] milestone_type and progression_gate not in live program_curriculum
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
              sequence_id: 109,
              status: "complete",
              rating: 3,
              duration_minutes: 60,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 4",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
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
              is_rest_day: true,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p2_w4_d3",
              order_index: 11,
              week_number: 4,
              day_number: 3,
              title: "Twists + Nadi Shodhana",
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
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: "primary_asana",
                    sequence_id: 110,
                    title: "Twists Sequence",
                    duration_minutes: 50,
                    counts_for_source_completion: true,
                    source_key: "light_on_yoga",
                    source_course: "Light on Yoga – Asana Programme",
                  },
                  {
                    part_number: 2,
                    role: "appended_pranayama",
                    sequence_id: 111,
                    title: "Nadi Shodhana – Stage 1",
                    duration_minutes: 15,
                    counts_for_source_completion: true,
                    source_key: "light_on_pranayama",
                    source_course: "Light on Pranayama – 200-Week Course",
                  },
                ],
                total_duration_minutes: 65,
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
              sequence_id: 112,
              status: "complete",
              rating: 3,
              duration_minutes: 55,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 5",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: null,
              // [SPECULATIVE] plateau_candidate not in live program_curriculum
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
              sequence_id: 113,
              status: "complete",
              rating: 2,
              duration_minutes: 50,
              source_key: "iyengar_way",
              source_course: "The Iyengar Way",
              source_reference: "IW Ch.4 Hips",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: true, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              // This is the current node — matches summary.current_curriculum_node_id
              curriculum_node_id: "cn_p2_w5_d3",
              order_index: 14,
              week_number: 5,
              day_number: 3,
              title: "Extended Backbend + Ujjayi Ratio Work",
              node_type: "practice",
              resolved_node_type: "composed",
              practice_track: "combined",
              sequence_id: null,
              // [DERIVED] "current" because curriculum_node_id matches
              // get_today_curriculum_practice response
              status: "current",
              rating: null,
              duration_minutes: 70,
              source_key: null,
              source_course: null,
              source_reference: "LoY W5 + LoP W5",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
              curriculum_payload: {
                practice_composition: [
                  {
                    part_number: 1,
                    role: "primary_asana",
                    sequence_id: 114,
                    title: "Extended Backbend Practice",
                    duration_minutes: 50,
                    counts_for_source_completion: true,
                    source_key: "light_on_yoga",
                    source_course: "Light on Yoga – Asana Programme",
                  },
                  {
                    part_number: 2,
                    role: "appended_pranayama",
                    sequence_id: 115,
                    title: "Ujjayi – Extended Ratio Work",
                    duration_minutes: 20,
                    counts_for_source_completion: true,
                    source_key: "light_on_pranayama",
                    source_course: "Light on Pranayama – 200-Week Course",
                  },
                ],
                total_duration_minutes: 70,
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
              sequence_id: 116,
              status: "upcoming",
              rating: null,
              duration_minutes: 55,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 6",
              is_rest_day: false,
              is_optional: false,
              is_locked: false,
              is_revision_node: false,
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
              sequence_id: 117,
              status: "upcoming",
              rating: null,
              duration_minutes: 60,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY P2 Rev",
              is_rest_day: false,
              is_optional: true,
              is_locked: false,
              is_revision_node: true,
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
              sequence_id: 118,
              status: "locked",
              rating: null,
              duration_minutes: 65,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 7",
              is_rest_day: false,
              is_optional: false,
              is_locked: true,
              is_revision_node: false,
              curriculum_payload: null,
              metadata: { plateau_candidate: false, milestone_type: null, progression_gate: false, can_repeat_indefinitely: false },
              practice_composition: null,
            },
            {
              curriculum_node_id: "cn_p3_w7_d2",
              order_index: 18,
              week_number: 7,
              day_number: 2,
              title: "Pranayama Mastery Gate",
              node_type: "mastery_gate",
              resolved_node_type: "mastery_gate",
              practice_track: "pranayama",
              sequence_id: 119,
              status: "locked",
              rating: null,
              duration_minutes: 80,
              source_key: "light_on_pranayama",
              source_course: "Light on Pranayama – 200-Week Course",
              source_reference: "LoP Week 7 Gate",
              is_rest_day: false,
              is_optional: false,
              is_locked: true,
              is_revision_node: false,
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
              sequence_id: 120,
              status: "locked",
              rating: null,
              duration_minutes: 75,
              source_key: "light_on_yoga",
              source_course: "Light on Yoga – Asana Programme",
              source_reference: "LoY Week 8",
              is_rest_day: false,
              is_optional: false,
              is_locked: true,
              is_revision_node: false,
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
  const resolvedMap = {
    mastery_gate: { key: "mastery",  label: "Mastery Gate" },
    revision:     { key: "revision", label: "Revision" },
  };
  if (resolvedMap[node.resolved_node_type]) return resolvedMap[node.resolved_node_type];
  if (node.is_optional) return { key: "optional", label: "Optional" };
  const statusMap = {
    complete:  { key: "complete",  label: "Done" },
    current:   { key: "current",   label: "Today" },
    upcoming:  { key: "upcoming",  label: "Upcoming" },
    locked:    { key: "locked",    label: "Locked" },
  };
  return statusMap[node.status] || { key: "upcoming", label: node.status };
}

function renderStars(rating, maxStars = 5) {
  if (rating == null) return "";
  let html = `<span class="curriculum-roadmap__rating" aria-label="Rating: ${rating} of ${maxStars}">`;
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

function coveragePct(row) {
  if (!row.scheduled_count) return 0;
  return Math.round((row.completed_count / row.scheduled_count) * 100);
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderFlags(node) {
  // These metadata flags are [SPECULATIVE] — not in live program_curriculum today.
  const flags = [];
  if (node.metadata?.plateau_candidate)       flags.push("Plateau Candidate");
  if (node.metadata?.progression_gate)        flags.push("Progression Gate");
  if (node.metadata?.can_repeat_indefinitely) flags.push("Repeatable");
  if (node.metadata?.milestone_type)          flags.push(node.metadata.milestone_type.replace(/_/g, " "));
  if (!flags.length) return "";
  return `<div class="curriculum-roadmap__flags">${flags.map(f => `<span class="curriculum-roadmap__flag">${esc(f)}</span>`).join("")}</div>`;
}

function roleLabel(role) {
  // Maps real practice_composition role values to display labels
  const map = {
    primary_asana:           "Asana",
    appended_pranayama:      "Pranayama",
    quiet_asana:             "Quiet Asana",
    supplemental_pranayama:  "Pranayama (Supp.)",
  };
  return map[role] || role;
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
          <span class="curriculum-roadmap__part-role">${esc(roleLabel(p.role))}</span>
          ${p.source_key ? `<span>${esc(p.source_key)}</span>` : ""}
          <span class="curriculum-roadmap__node-ref">courses.id: ${esc(String(p.sequence_id))}</span>
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
  const seqRef = node.sequence_id != null
    ? `<span class="curriculum-roadmap__node-ref">courses.id: ${node.sequence_id}</span>`
    : "";

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
            ${seqRef}
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
  const map = { complete: "complete", current: "current", upcoming: "upcoming", locked: "locked" };
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
      PROTOTYPE · mock data only · no Supabase · qrcpiyncvfmpmeuyhsha
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
