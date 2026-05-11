import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CURRICULUM_SLUG = 'iyengar_integrated_master_path_draft_v1';
const PROGRAM_NAME = 'Integrated Iyengar Practice Path - Draft v1';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const weeklyPlan = [
  [1, 1, 'sequence', 114, 'Light on Yoga Course 1 backbone sequence, Week 1 and 2.'],
  [1, 2, 'sequence', 213, 'Yoga: The Iyengar Way Lesson 1 for lesson-based foundation work.'],
  [1, 3, 'sequence', 52, 'Light on Pranayama preparatory practice. Keep the breath quiet and unforced.'],
  [1, 5, 'sequence', 174, 'Shorter How to Use Yoga standing foundation repeat.'],
  [1, 6, 'revision', null, 'Revision day: repeat a completed sequence marked Do Again, Concentrate, or Favourite.'],
  [1, 7, 'rest', null, 'Rest day. Optional Savasana or quiet observation only.'],

  [2, 1, 'sequence', 175, 'How to Use Yoga Week 1 Day 3 and 5 continuation.'],
  [2, 2, 'sequence', 215, 'Yoga: The Iyengar Way Lesson 2.'],
  [2, 3, 'sequence', 53, 'Light on Pranayama preparatory continuation.'],
  [2, 4, 'sequence', 115, 'Light on Yoga Course 1 Week 3 and 4.'],
  [2, 5, 'sequence', 361, 'Yoga: A Gem for Women introductory three-month course.'],
  [2, 6, 'revision', null, 'Revision day: let markers guide the repeat; otherwise repeat the most recent light foundation practice.'],
  [2, 7, 'rest', null, 'Full rest day.'],

  [3, 1, 'sequence', 178, 'How to Use Yoga Week 2 opening practice.'],
  [3, 2, 'sequence', 216, 'Yoga: The Iyengar Way Lesson 3.'],
  [3, 3, 'sequence', 54, 'Light on Pranayama Week 5 and 6.'],
  [3, 4, 'sequence', 116, 'Light on Yoga Course 1 Week 5 and 6.'],
  [3, 5, 'sequence', 176, 'How to Use Yoga Week 1 Day 6 as a steady foundation repeat.'],
  [3, 6, 'revision', null, 'Revision day: prioritize Concentrate, then Do Again, then Favourite.'],
  [3, 7, 'rest', null, 'Rest day.'],

  [4, 1, 'sequence', 179, 'How to Use Yoga Week 2 sitting-oriented practice.'],
  [4, 2, 'sequence', 217, 'Yoga: The Iyengar Way Lesson 4.'],
  [4, 3, 'sequence', 55, 'Light on Pranayama Week 7 and 8.'],
  [4, 4, 'sequence', 117, 'Light on Yoga Course 1 Week 8; Week 7 is treated as consolidation in the source logic.'],
  [4, 5, 'sequence', 362, 'Short Yoga Gem Virasana practice.'],
  [4, 6, 'revision', null, 'Revision buffer before moving into the next foundation block.'],
  [4, 7, 'rest', null, 'Full rest day.'],

  [5, 1, 'sequence', 180, 'How to Use Yoga Week 2 Day 6.'],
  [5, 2, 'sequence', 218, 'Yoga: The Iyengar Way Lesson 5.'],
  [5, 3, 'sequence', 56, 'Light on Pranayama Week 9 and 10.'],
  [5, 4, 'sequence', 118, 'Light on Yoga Course 1 Week 9 and 10.'],
  [5, 5, 'sequence', 177, 'How to Use Yoga Week 1 Day 7 backbend-focused foundation practice. Work carefully.'],
  [5, 6, 'revision', null, 'Do Again / Concentrate test node: repeat a marked earlier sequence if available.'],
  [5, 7, 'rest', null, 'Rest day.'],

  [6, 1, 'sequence', 208, 'How to Use Yoga Week 3 opening practice.'],
  [6, 2, 'sequence', 219, 'Yoga: The Iyengar Way Lesson 6.'],
  [6, 3, 'sequence', 57, 'Light on Pranayama Week 11 and 12.'],
  [6, 4, 'sequence', 119, 'Light on Yoga Course 1 Week 11 and 12.'],
  [6, 5, 'sequence', 363, 'Yoga Gem First Year Day 1 and 5. Reduce holds if needed.'],
  [6, 6, 'revision', null, 'Revision day: repeat the clearest learning edge from the previous two weeks.'],
  [6, 7, 'rest', null, 'Full rest day.'],

  [7, 1, 'sequence', 209, 'How to Use Yoga Week 3 Day 2 and 4.'],
  [7, 2, 'sequence', 220, 'Yoga: The Iyengar Way Lesson 7. Treat as slightly stronger work.'],
  [7, 3, 'sequence', 58, 'Light on Pranayama Week 13 and 15.'],
  [7, 4, 'sequence', 120, 'Light on Yoga Course 1 Week 14 and 15. Keep the overall dose moderate.'],
  [7, 5, 'sequence', 181, 'How to Use Yoga Week 2 Day 7 backbend-focused foundation practice.'],
  [7, 6, 'revision', null, 'Revision day: choose a prior practice that needs steadier understanding.'],
  [7, 7, 'rest', null, 'Rest day.'],

  [8, 1, 'sequence', 211, 'How to Use Yoga Week 3 Day 6.'],
  [8, 2, 'sequence', 221, 'Yoga: The Iyengar Way Lesson 8.'],
  [8, 3, 'sequence', 59, 'Light on Pranayama Week 16 and 18.'],
  [8, 4, 'sequence', 121, 'Light on Yoga Course 1 Week 16 and 17. Shorten if the practice runs too long.'],
  [8, 5, 'sequence', 365, 'Yoga Gem First Year Day 3. Keep intensity below strain.'],
  [8, 6, 'revision', null, 'Revision day: marker-led repeat before the reserve-alert week.'],
  [8, 7, 'rest', null, 'Full rest day.'],

  [9, 1, 'sequence', 212, 'How to Use Yoga Week 3 Day 7. Backbend-focused; keep it conservative.'],
  [9, 2, 'sequence', 222, 'Yoga: The Iyengar Way Lesson 9.'],
  [9, 3, 'sequence', 60, 'Light on Pranayama Week 19 and 22.'],
  [9, 4, 'sequence', 122, 'Light on Yoga Course 1 Week 19 to 21. Longer forward-bend sequence; reduce holds if needed.'],
  [9, 5, 'sequence', 204, 'How to Use Yoga Week 4 opening practice.'],
  [9, 6, 'choice', null, 'Reserve-alert choice: choose Do Again, Concentrate, or a light prior sequence if fatigue is accumulating.'],
  [9, 7, 'rest', null, 'Rest day.'],

  [10, 1, 'revision', null, 'Consolidation week: repeat a marked foundation sequence rather than adding new material.'],
  [10, 2, 'sequence', 223, 'Yoga: The Iyengar Way Lesson 10 as a lighter lesson anchor.'],
  [10, 3, 'sequence', 61, 'Light on Pranayama Week 23 and 25.'],
  [10, 4, 'revision', null, 'Consolidation repeat: select the Light on Yoga or How to Use Yoga practice that felt least settled.'],
  [10, 5, 'sequence', 205, 'How to Use Yoga Week 4 Day 2 and 4. Keep this as an easy forward-bend day.'],
  [10, 6, 'revision', null, 'End-of-block consolidation: repeat the most useful completed sequence from Weeks 6-9.'],
  [10, 7, 'rest', null, 'Full rest day.'],

  [11, 1, 'sequence', 206, 'How to Use Yoga Week 4 Day 6.'],
  [11, 2, 'sequence', 224, 'Yoga: The Iyengar Way Lesson 11.'],
  [11, 3, 'sequence', 62, 'Light on Pranayama Course 2 opening practice. Treat the course transition as gentle and technical.'],
  [11, 4, 'sequence', 123, 'Light on Yoga Course 1 Week 22 to 25. Longer seated sequence; reduce holds if needed.'],
  [11, 5, 'sequence', 366, 'Yoga Gem First Year Day 4. Keep the practice steady rather than ambitious.'],
  [11, 6, 'revision', null, 'Revision day: repeat a marked or recent practice after the consolidation week.'],
  [11, 7, 'rest', null, 'Rest day.'],

  [12, 1, 'sequence', 207, 'How to Use Yoga Week 4 Day 7. Backbend-focused foundation practice.'],
  [12, 2, 'sequence', 225, 'Yoga: The Iyengar Way Lesson 12.'],
  [12, 3, 'sequence', 63, 'Light on Pranayama Course 2 Week 29 to 31. Stay well within capacity.'],
  [12, 4, 'sequence', 124, 'Light on Yoga Course 1 Week 26 to 30. Longer forward-bend sequence; shorten if needed.'],
  [12, 5, 'sequence', 367, 'Yoga Gem First Year Day 6. Treat as a final foundation exposure, not a test.'],
  [12, 6, 'revision', null, 'End-of-draft revision: repeat the most important Do Again or Concentrate sequence.'],
  [12, 7, 'rest', null, 'Full rest day.'],

  [13, 1, 'sequence', 200, 'How to Use Yoga Week 6 opening standing practice, followed by Light on Pranayama Week 32 to 34.'],
  [13, 2, 'sequence', 226, 'Yoga: The Iyengar Way Course 2 1A standing practice.'],
  [13, 3, 'sequence', 64, 'Light on Pranayama Week 32 to 34.'],
  [13, 4, 'consolidation', null, 'Light on Yoga Course 1 consolidation: revisit the standing and seated work from Weeks 1-12 rather than adding new Course 2 material.'],
  [13, 5, 'sequence', 240, 'Yoga: The Iyengar Way Course 2 4A as supportive exposure, not full Course 2 progression.'],
  [13, 6, 'revision', null, 'Lighter consolidation: repeat a marked easy standing or quiet practice.'],
  [13, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [14, 1, 'sequence', 201, 'How to Use Yoga Week 6 forward-bend practice without new pranayama.'],
  [14, 2, 'sequence', 227, 'Yoga: The Iyengar Way Course 2 1B sitting practice.'],
  [14, 3, 'consolidation', null, 'Pranayama consolidation: repeat settled Course 1 or early Course 2 breath work only if quiet and steady.'],
  [14, 4, 'consolidation', null, 'Light on Yoga Course 1 source-week consolidation: stay with Weeks 14-21 material until the poses feel assimilated.'],
  [14, 5, 'sequence', 241, 'Yoga: The Iyengar Way Course 2 4B as supportive sitting exposure, not a progression gate.'],
  [14, 6, 'revision', null, 'Lighter consolidation: repeat a marked forward-bend or relaxation practice.'],
  [14, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [15, 1, 'sequence', 202, 'How to Use Yoga Week 6 short standing practice without new pranayama.'],
  [15, 2, 'sequence', 228, 'Yoga: The Iyengar Way Course 2 1C miscellaneous practice.'],
  [15, 3, 'consolidation', null, 'Pranayama consolidation: no new source sequence; repeat a short familiar quiet practice if appropriate.'],
  [15, 4, 'consolidation', null, 'Light on Yoga Course 1 deepening: repeat the least settled Course 1 backbone practice before moving toward the milestone set.'],
  [15, 5, 'sequence', 242, 'Yoga: The Iyengar Way Course 2 4C as supportive exposure, not full course advancement.'],
  [15, 6, 'revision', null, 'Keep this light: choose a short marked practice or quiet recovery.'],
  [15, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [16, 1, 'sequence', 203, 'How to Use Yoga Week 6 mixed practice, followed by Light on Pranayama Week 35 to 38.'],
  [16, 2, 'sequence', 229, 'Yoga: The Iyengar Way Course 2 1D relaxation practice.'],
  [16, 3, 'sequence', 65, 'Light on Pranayama Week 35 to 38.'],
  [16, 4, 'consolidation', null, 'Light on Yoga Course 1 consolidation: revisit the Week 22-30 material gradually rather than treating it as completed-for-good.'],
  [16, 5, 'sequence', 243, 'Yoga: The Iyengar Way Course 2 4D relaxation and pranayama practice.'],
  [16, 6, 'revision', null, 'Consolidation repeat: favor quiet or restorative markers.'],
  [16, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [17, 1, 'sequence', 196, 'How to Use Yoga Week 7 opening standing practice without new pranayama.'],
  [17, 2, 'sequence', 230, 'Yoga: The Iyengar Way Course 2 2A standing practice.'],
  [17, 3, 'consolidation', null, 'Pranayama consolidation: stay with Course 1 and early Course 2 stages; no Course 3 work yet.'],
  // TODO(sequence 113): This sequence is classified as reference_collection in sourceBlockMetadataBySequenceId.
  // Its is_active status is currently unchanged (true). A future pass must decide:
  //   Option A — set is_active: false, removing it from the active curriculum flow entirely
  //              (Week 17 Day 4 would become an empty slot; consider replacing with a consolidation node).
  //   Option B — introduce a 'checkpoint' node_type so the RPC and UI present it as a
  //              reference/review rather than a standard practice day with a Begin Practice button.
  // Until that decision is made and the RPC behaviour is updated, this node is delivered as a
  // normal sequence node. Do not treat it as an ordinary progressive practice sequence.
  [17, 4, 'sequence', 113, 'Light on Yoga Course 1 important asanas — reference collection. Present as a course checkpoint, not a new progressive practice sequence.'],
  [17, 5, 'sequence', 244, 'Yoga: The Iyengar Way Course 2 5A as supportive standing exposure.'],
  [17, 6, 'revision', null, 'Keep this light: repeat a short standing or quiet practice.'],
  [17, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [18, 1, 'sequence', 193, 'How to Use Yoga Week 8 short standing practice without new pranayama.'],
  [18, 2, 'sequence', 231, 'Yoga: The Iyengar Way Course 2 2B sitting practice.'],
  [18, 3, 'consolidation', null, 'Pranayama consolidation: repeat a known quiet practice; defer Light on Pranayama Course 3.'],
  [18, 4, 'consolidation', null, 'Light on Yoga Course 1 consolidation: choose a prior backbone practice that needs steadier timing and ease.'],
  [18, 5, 'sequence', 245, 'Yoga: The Iyengar Way Course 2 5B as supportive sitting and mixed exposure.'],
  [18, 6, 'revision', null, 'Keep this light: repeat a marked quiet or short practice.'],
  [18, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [19, 1, 'sequence', 198, 'How to Use Yoga Week 7 seated practice, followed by Light on Pranayama Week 39 to 42.'],
  [19, 2, 'sequence', 232, 'Yoga: The Iyengar Way Course 2 2D relaxation practice.'],
  [19, 3, 'sequence', 66, 'Light on Pranayama Week 39 to 42.'],
  [19, 4, 'consolidation', null, 'Light on Yoga Course 1 deepening: use revision as recovery and assimilation, not new Course 2 progression.'],
  [19, 5, 'sequence', 246, 'Yoga: The Iyengar Way Course 2 5C as supportive miscellaneous exposure.'],
  [19, 6, 'revision', null, 'Use revision as recovery and consolidation.'],
  [19, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [20, 1, 'sequence', 199, 'How to Use Yoga Week 7 forward-bend practice without new pranayama.'],
  [20, 2, 'sequence', 233, 'Yoga: The Iyengar Way Course 2 2C miscellaneous practice.'],
  [20, 3, 'consolidation', null, 'Pranayama consolidation: no new source sequence; stay with the breath work that remains easy.'],
  [20, 4, 'consolidation', null, 'Light on Yoga Course 1 consolidation: keep the backbone alive and avoid promotion by elapsed time alone.'],
  [20, 5, 'sequence', 247, 'Yoga: The Iyengar Way Course 2 5D as supportive relaxation/pranayama exposure.'],
  [20, 6, 'revision', null, 'Choose an easy marked practice.'],
  [20, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [21, 1, 'sequence', 194, 'How to Use Yoga Week 8 forward-bend practice without new pranayama.'],
  [21, 2, 'sequence', 234, 'Yoga: The Iyengar Way Course 2 3A standing practice.'],
  [21, 3, 'consolidation', null, 'Pranayama consolidation: defer Course 3 and repeat only settled Course 1 or Course 2 work.'],
  [21, 4, 'consolidation', null, 'Light on Yoga Course 1 checkpoint: decide whether to remain in consolidation, step back, or approach the plateau set.'],
  [21, 5, 'sequence', 248, 'Yoga: The Iyengar Way Course 2 6A as supportive standing exposure.'],
  [21, 6, 'revision', null, 'Repeat a short or restorative marked practice.'],
  [21, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [22, 1, 'sequence', 195, 'How to Use Yoga Week 8 Day 6 consolidation without new pranayama.'],
  [22, 2, 'sequence', 235, 'Yoga: The Iyengar Way Course 2 3B sitting practice.'],
  [22, 3, 'consolidation', null, 'Pranayama consolidation: no new appended sequence; repeat a settled quiet breathing practice if appropriate.'],
  [22, 4, 'sequence', 125, 'Light on Yoga Course 1 weekly practice day 1. Major Course 1 plateau practice; completion does not imply readiness for Course 2.'],
  [22, 5, 'sequence', 249, 'Yoga: The Iyengar Way Course 2 6B as supportive sitting and mixed exposure.'],
  [22, 6, 'revision', null, 'Choose recovery-oriented revision after the Course 1 plateau practice.'],
  [22, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [23, 1, 'sequence', 190, 'How to Use Yoga Week 9 Day 6 consolidation without new pranayama.'],
  [23, 2, 'sequence', 238, 'Yoga: The Iyengar Way Course 2 3C backbend practice.'],
  [23, 3, 'consolidation', null, 'Pranayama consolidation: no new appended sequence; repeat a settled quiet breathing practice if appropriate.'],
  [23, 4, 'sequence', 126, 'Light on Yoga Course 1 weekly practice day 2. Major Course 1 plateau practice; remain here as long as useful.'],
  [23, 5, 'sequence', 250, 'Yoga: The Iyengar Way Course 2 6C as supportive backbend exposure.'],
  [23, 6, 'revision', null, 'Repeat a shorter marked practice after the heavier plateau day.'],
  [23, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],

  [24, 1, 'sequence', 191, 'How to Use Yoga Week 9 Day 2 and 4 consolidation without new pranayama.'],
  [24, 2, 'sequence', 239, 'Yoga: The Iyengar Way Course 2 3D relaxation practice.'],
  [24, 3, 'consolidation', null, 'Pranayama consolidation: no new appended sequence; repeat a settled quiet breathing practice if appropriate.'],
  [24, 4, 'sequence', 127, 'Light on Yoga Course 1 weekly practice day 3. Major Course 1 plateau practice; progression requires user readiness.'],
  [24, 5, 'sequence', 251, 'Yoga: The Iyengar Way Course 2 6D as supportive relaxation/pranayama exposure.'],
  [24, 6, 'revision', null, 'Mandatory light revision after the Course 1 plateau practice: choose a short, restorative, or quiet practice only.'],
  [24, 7, 'rest', null, 'Rest day. Optional restorative or quiet pranayama if appropriate.'],
];

const appendedPranayamaPlan = [
  {
    primarySequenceId: 115,
    pranayamaSequenceId: 53,
    specialInstructions: 'Light on Yoga Course 1 Week 3 and 4, followed by the short Light on Pranayama Week 3 and 4 practice.',
    rationale: 'Matches the Light on Yoga fortnight and remains under 50 minutes.',
  },
  {
    primarySequenceId: 178,
    pranayamaSequenceId: 54,
    specialInstructions: 'How to Use Yoga Week 2 opening practice, followed by Light on Pranayama Week 5 and 6.',
    rationale: 'A short standing foundation day keeps the composed practice moderate.',
  },
  {
    primarySequenceId: 179,
    pranayamaSequenceId: 55,
    specialInstructions: 'How to Use Yoga Week 2 sitting-oriented practice, followed by Light on Pranayama Week 7 and 8.',
    rationale: 'The seated emphasis is a better host for the longer pranayama block than the longer Light on Yoga day.',
  },
  {
    primarySequenceId: 180,
    pranayamaSequenceId: 56,
    specialInstructions: 'How to Use Yoga Week 2 Day 6, followed by Light on Pranayama Week 9 and 10.',
    rationale: 'Shorter standing day; avoids attaching pranayama to the backbend-focused day.',
  },
  {
    primarySequenceId: 208,
    pranayamaSequenceId: 57,
    specialInstructions: 'How to Use Yoga Week 3 opening practice, followed by Light on Pranayama Week 11 and 12.',
    rationale: 'Keeps the composed day below one hour while the week still has heavier source practices later.',
  },
  {
    primarySequenceId: 209,
    pranayamaSequenceId: 58,
    specialInstructions: 'How to Use Yoga Week 3 Day 2 and 4, followed by Light on Pranayama Week 13 and 15.',
    rationale: 'Forward-bend emphasis makes this the quietest host in Week 7.',
  },
  {
    primarySequenceId: 211,
    pranayamaSequenceId: 59,
    specialInstructions: 'How to Use Yoga Week 3 Day 6, followed by Light on Pranayama Week 16 and 18.',
    rationale: 'Uses the shortest practical Week 8 host and avoids the longer lesson, Light on Yoga, and Gem days.',
  },
  {
    primarySequenceId: 204,
    pranayamaSequenceId: 60,
    specialInstructions: 'How to Use Yoga Week 4 opening practice, followed by Light on Pranayama Week 19 and 22.',
    rationale: 'A moderate reset after the longer Week 9 Light on Yoga day.',
  },
  {
    primarySequenceId: 223,
    pranayamaSequenceId: 61,
    specialInstructions: 'Yoga: The Iyengar Way Lesson 10, followed by Light on Pranayama Week 23 and 25.',
    rationale: 'The lighter lesson anchor is a suitable host during the consolidation week.',
  },
  {
    primarySequenceId: 224,
    pranayamaSequenceId: 62,
    specialInstructions: 'Yoga: The Iyengar Way Lesson 11, followed by the first Course 2 Light on Pranayama practice.',
    rationale: 'Short Course 2 transition practice pairs cleanly with the shorter lesson day.',
  },
  {
    primarySequenceId: 225,
    pranayamaSequenceId: 63,
    specialInstructions: 'Yoga: The Iyengar Way Lesson 12, followed by Light on Pranayama Course 2 Week 29 to 31.',
    rationale: 'Keeps the final Week 12 pranayama exposure in source order and pairs it with a forward-bend lesson host.',
  },
  {
    primarySequenceId: 200,
    pranayamaSequenceId: 64,
    specialInstructions: 'How to Use Yoga Week 6 opening standing practice, followed by Light on Pranayama Week 32 to 34.',
    rationale: 'A gentle standing consolidation host keeps the continuing Course 2 pranayama concrete without making a separate day.',
  },
  {
    primarySequenceId: 203,
    pranayamaSequenceId: 65,
    specialInstructions: 'How to Use Yoga Week 6 mixed practice, followed by Light on Pranayama Week 35 to 38.',
    rationale: 'Spaces the next Course 2 pranayama source into the consolidation block while keeping the composed day moderate.',
  },
  {
    primarySequenceId: 198,
    pranayamaSequenceId: 66,
    specialInstructions: 'How to Use Yoga Week 7 seated practice, followed by Light on Pranayama Week 39 to 42.',
    rationale: 'Spaces the next Course 2 pranayama source into the consolidation block instead of finishing Course 2 quickly.',
  },
];

// ─── Future protected block: LOP weekly practice injection ────────────────────
// Sequences 107–112 (Light on Pranayama) form an authored weekly practice set
// in the source book and are reserved for a complete, ordered injection into
// the curriculum at an appropriate stage.
//
// Design rules:
//   - Do NOT scatter these sequences across random composed-day slots.
//   - Do NOT add them individually to appendedPranayamaPlan.
//   - They must be introduced as a contiguous block in source order.
//   - Prerequisite: the lop_course1_parallel thread (sequences 52–66) should
//     be substantially complete before this block is introduced.
//
// When the curriculum is extended past Week 24, seed this block as:
//   block_id:             'lop_weekly_practice_block'
//   sequence_block_type:  'authored_weekly_practice'
//   block_position:       1–6 (107→1, 108→2, 109→3, 110→4, 111→5, 112→6)
//   block_total:          6
//   suggested position:   a dedicated pranayama week or pair of weeks
//
// Do not seed sequences 107–112 until this design is confirmed and the
// curriculum extension past Week 24 is planned.
// ─────────────────────────────────────────────────────────────────────────────

const longDayMetadataBySequenceId = new Map([
  [126, {
    long_day_reason: 'Light on Yoga Course 1 plateau practice; intentionally retained as a serious long practice day.',
  }],
]);

const plateauMetadataBySequenceId = new Map([
  ...[125, 126, 127].map((sequenceId) => [sequenceId, {
    plateau_candidate: true,
    milestone_type: 'light_on_yoga_course_1_major_plateau',
    progression_gate: 'user_readiness_required_not_completion_only',
    source_week_min: 26,
    source_week_max: 30,
    suggested_consolidation_weeks: 4,
    can_repeat_indefinitely: true,
    exploratory_next_allowed: true,
  }]),
]);

// Maps sequence IDs to their source-block classification metadata.
// Used by sequenceRow() to populate curriculum_payload with block membership.
// Revision, rest, consolidation, and choice nodes have no sequence ID and are not included.
const sourceBlockMetadataBySequenceId = new Map([
  // Light on Yoga Course 1 backbone — authored fortnightly progressions (sequences in source order)
  [114, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 1, block_total: 11 }],
  [115, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 2, block_total: 11 }],
  [116, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 3, block_total: 11 }],
  [117, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 4, block_total: 11 }],
  [118, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 5, block_total: 11 }],
  [119, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 6, block_total: 11 }],
  [120, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 7, block_total: 11 }],
  [121, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 8, block_total: 11 }],
  [122, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 9, block_total: 11 }],
  [123, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 10, block_total: 11 }],
  [124, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_backbone', block_position: 11, block_total: 11 }],

  // Light on Yoga Course 1 weekly practices — plateau candidates (must be completed in order)
  [125, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_weekly_practices', block_position: 1, block_total: 3 }],
  [126, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_weekly_practices', block_position: 2, block_total: 3 }],
  [127, { sequence_block_type: 'authored_weekly_practice', block_id: 'loy_course1_weekly_practices', block_position: 3, block_total: 3 }],

  // Light on Yoga Course 1 important asanas — reference collection, not a progressive practice
  [113, { sequence_block_type: 'reference_collection', block_id: null, block_position: null, block_total: null }],

  // Light on Pranayama Course 1 parallel thread — used as appended_pranayama composition parts
  // These entries apply to the pranayama part objects inside composed days.
  // The same IDs appear as inactive standalone rows (composed_part_only) via inactiveCompositionPartBySequenceId.
  [52,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 1,  block_total: 15 }],
  [53,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 2,  block_total: 15 }],
  [54,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 3,  block_total: 15 }],
  [55,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 4,  block_total: 15 }],
  [56,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 5,  block_total: 15 }],
  [57,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 6,  block_total: 15 }],
  [58,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 7,  block_total: 15 }],
  [59,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 8,  block_total: 15 }],
  [60,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 9,  block_total: 15 }],
  [61,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 10, block_total: 15 }],
  [62,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 11, block_total: 15 }],
  [63,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 12, block_total: 15 }],
  [64,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 13, block_total: 15 }],
  [65,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 14, block_total: 15 }],
  [66,  { sequence_block_type: 'authored_weekly_practice', block_id: 'lop_course1_parallel', block_position: 15, block_total: 15 }],
]);

const compositionByPrimarySequenceId = new Map(
  appendedPranayamaPlan.map((plan) => [
    plan.primarySequenceId,
    {
      ...plan,
      practiceComposition: [
        { role: 'primary_asana', sequence_id: plan.primarySequenceId, counts_for_source_completion: true },
        { role: 'appended_pranayama', sequence_id: plan.pranayamaSequenceId, counts_for_source_completion: true, ...sourceBlockMetadataBySequenceId.get(plan.pranayamaSequenceId) },
      ],
    },
  ]),
);

// TODO(curriculum): Decide where Light on Pranayama sequence 52 belongs after
// removing the old How to Use Yoga 173 + LOP 52 composed opener.
const deferredPranayamaBySequenceId = new Map([
  [52, {
    inactive_reason: 'deferred_pending_pranayama_scheduling',
    sequence_block_type: 'composed_part_only',
    composition_strategy: 'deferred_pending_pranayama_scheduling',
    special_instructions: 'Inactive deferred pranayama node: Light on Pranayama Week 1 and 2 is deferred pending future pranayama scheduling.',
  }],
]);

const inactiveCompositionPartBySequenceId = new Map([
  ...deferredPranayamaBySequenceId,
  ...appendedPranayamaPlan.map((plan) => [
    plan.pranayamaSequenceId,
    {
      superseded_by_curriculum_node_sequence_id: plan.primarySequenceId,
      inactive_reason: 'source_sequence_scheduled_as_composition_part',
      sequence_block_type: 'composed_part_only',
      special_instructions: `Inactive composed-day node: sequence ${plan.pranayamaSequenceId} is now appended to sequence ${plan.primarySequenceId}.`,
    },
  ]),
]);

function orderIndex(week, day) {
  return Number(`${week}.${String(day).padStart(2, '0')}`);
}

function fmtDuration(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function compositionDurationMinutes(composition, candidateBySequenceId) {
  const total = composition.reduce((sum, part) => {
    const duration = Number(candidateBySequenceId.get(part.sequence_id)?.total_duration_minutes);
    return Number.isFinite(duration) ? sum + duration : sum;
  }, 0);

  return fmtDuration(total);
}

function nodePayload(kind, week, day) {
  const base = {
    draft_phase: week <= 12 ? 'v1_12_week_foundation' : 'v1_24_week_foundation_to_early_intermediate',
    weekly_cadence: 'composed_asana_pranayama_with_revision_and_rest',
    source_mix: 'loy_backbone_htuy_revision_gem_variety_iyengar_lessons_lop_parallel',
  };

  if (kind === 'revision' || kind === 'choice' || kind === 'consolidation') {
    return {
      ...base,
      preferred_markers: ['concentrate', 'do_again', 'favourite'],
      fallback_logic: 'repeat_most_recent_completed_light_foundation_sequence',
      requires_marker_if_available: true,
      choice_source_weeks: Array.from({ length: Math.max(week - 1, 1) }, (_, index) => index + 1),
      cadence_day: day,
    };
  }

  if (kind === 'rest') {
    return {
      ...base,
      rest_protocol: 'full_rest_optional_savasana_or_quiet_observation',
      optional_restorative_or_pranayama: true,
    };
  }

  return base;
}

function nonSequenceRow([week, day, nodeType, , instructions]) {
  const isAdaptive = ['revision', 'choice', 'consolidation'].includes(nodeType);
  const isRest = nodeType === 'rest';
  const isConsolidation = instructions.toLowerCase().includes('consolidation');

  return {
    sequence_id: null,
    curriculum_slug: CURRICULUM_SLUG,
    program_name: PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: isAdaptive,
    special_instructions: instructions,
    source_name: isAdaptive ? 'How to Use Yoga' : PROGRAM_NAME,
    source_reference: isRest
      ? 'Rest / Savasana'
      : nodeType === 'choice'
        ? 'Reserve alert / Do Again choice'
        : isConsolidation
          ? 'Foundation consolidation'
          : 'Do Again / Concentrate revision buffer',
    level_number: 1,
    intensity: isRest ? 'restorative' : 'light',
    primary_focus: isRest ? 'Rest' : 'Revision',
    is_active: true,
    node_type: nodeType,
    source_key: isAdaptive ? 'how_to_use_yoga' : null,
    source_rule_id: null,
    source_course: null,
    curriculum_payload: {
      ...nodePayload(nodeType, week, day),
      ...(isConsolidation ? { consolidation_protocol: true } : {}),
    },
    generated_from_rule: isAdaptive,
    is_optional: isRest,
    is_rest_day: isRest,
    requires_user_selection: isAdaptive,
    mastery_gate_required: false,
    curriculum_phase: week >= 10 ? 'foundation_consolidation' : 'foundation',
    practice_track: isRest ? 'rest' : 'revision',
    completion_requirement: isRest ? 'optional' : 'attempt',
  };
}

function sequenceRow(planRow, candidate, candidateBySequenceId) {
  const [week, day, nodeType, sequenceId, instructions] = planRow;
  const composition = compositionByPrimarySequenceId.get(sequenceId);
  const inactivePilot = inactiveCompositionPartBySequenceId.get(sequenceId);
  const longDayMetadata = longDayMetadataBySequenceId.get(sequenceId);
  const plateauMetadata = plateauMetadataBySequenceId.get(sequenceId);
  const practiceComposition = composition?.practiceComposition || null;
  const composedTotalDurationMinutes = practiceComposition
    ? compositionDurationMinutes(practiceComposition, candidateBySequenceId)
    : null;

  return {
    sequence_id: sequenceId,
    curriculum_slug: CURRICULUM_SLUG,
    program_name: PROGRAM_NAME,
    week_number: week,
    day_number: day,
    order_index: orderIndex(week, day),
    is_revision_node: false,
    special_instructions: inactivePilot?.special_instructions || composition?.specialInstructions || instructions,
    source_name: candidate.source_title,
    source_reference: candidate.source_reference,
    level_number: week <= 10 ? 1 : 2,
    intensity: candidate.effective_intensity_band ?? candidate.intensity_band ?? 'light',
    primary_focus: candidate.effective_primary_theme ?? candidate.primary_theme ?? 'Mixed',
    is_active: !inactivePilot,
    node_type: nodeType,
    source_key: candidate.source_key,
    source_rule_id: null,
    source_course: candidate.source_course,
    curriculum_payload: {
      ...nodePayload(nodeType, week, day),
      candidate_inventory_id: candidate.inventory_id,
      curriculum_role: candidate.curriculum_role,
      planned_phase: candidate.planned_phase,
      total_duration_minutes: candidate.total_duration_minutes,
      source_week_label: candidate.source_reference ?? null,
      course_style: candidate.course_style,
      ...(composition ? {
        composition_strategy: 'primary_asana_plus_appendable_pranayama',
        practice_composition: practiceComposition,
        composed_total_duration_minutes: composedTotalDurationMinutes,
        composition_rationale: composition.rationale,
      } : {}),
      // sourceBlockMetadataBySequenceId spread before inactivePilot so that
      // inactivePilot.sequence_block_type ('composed_part_only') wins for inactive rows.
      ...(sourceBlockMetadataBySequenceId.get(sequenceId) ?? { sequence_block_type: 'standalone_sequence' }),
      ...(inactivePilot ? {
        inactive_reason: inactivePilot.inactive_reason,
        superseded_by_curriculum_node_sequence_id: inactivePilot.superseded_by_curriculum_node_sequence_id,
        sequence_block_type: inactivePilot.sequence_block_type,
        composition_strategy: inactivePilot.composition_strategy || 'source_sequence_scheduled_as_composition_part',
      } : {}),
      ...(longDayMetadata ? {
        long_day_acknowledged: true,
        ...longDayMetadata,
      } : {}),
      ...(plateauMetadata || {}),
    },
    generated_from_rule: true,
    is_optional: false,
    is_rest_day: false,
    requires_user_selection: false,
    mastery_gate_required: false,
    curriculum_phase: week === 10
      ? 'foundation_consolidation'
      : candidate.suggested_curriculum_phase ?? candidate.curriculum_phase ?? 'foundation',
    practice_track: candidate.suggested_practice_track ?? candidate.curriculum_practice_track ?? 'asana',
    completion_requirement: 'attempt',
  };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const sequenceIds = weeklyPlan
    .filter((row) => row[2] === 'sequence')
    .map((row) => row[3]);

  const { data: candidates, error: candidateError } = await supabase
    .from('v_master_curriculum_candidate_pool')
    .select('*')
    .in('sequence_id', sequenceIds);

  if (candidateError) throw candidateError;

  const candidateBySequenceId = new Map(
    candidates.map((candidate) => [candidate.sequence_id, candidate]),
  );

  const missing = sequenceIds.filter((sequenceId) => !candidateBySequenceId.has(sequenceId));
  if (missing.length > 0) {
    throw new Error(`Missing candidate rows for sequence IDs: ${missing.join(', ')}`);
  }

  const rows = weeklyPlan.map((planRow) => {
    if (planRow[2] !== 'sequence') return nonSequenceRow(planRow);
    return sequenceRow(planRow, candidateBySequenceId.get(planRow[3]), candidateBySequenceId);
  });

  const { error: deleteError } = await supabase
    .from('program_curriculum')
    .delete()
    .eq('curriculum_slug', CURRICULUM_SLUG);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from('program_curriculum')
    .insert(rows);

  if (insertError) throw insertError;

  const { data: inserted, error: insertedError } = await supabase
    .from('program_curriculum')
    .select('node_type,source_key,source_course,sequence_id')
    .eq('curriculum_slug', CURRICULUM_SLUG)
    .order('order_index');

  if (insertedError) throw insertedError;

  const coverage = new Map();
  for (const row of inserted.filter((item) => item.sequence_id !== null)) {
    const key = `${row.source_key} | ${row.source_course}`;
    coverage.set(key, (coverage.get(key) ?? 0) + 1);
  }

  console.log(`Inserted ${inserted.length} rows for ${CURRICULUM_SLUG}.`);
  console.log('Node types:');
  console.table(
    Object.entries(
      inserted.reduce((acc, row) => {
        acc[row.node_type] = (acc[row.node_type] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([node_type, count]) => ({ node_type, count })),
  );
  console.log('Sequence coverage:');
  console.table(
    [...coverage.entries()].map(([source_course, placed_sequences]) => ({
      source_course,
      placed_sequences,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
