# RPE (Effort & Ease) Logic

## The 1-5 Rating Scale
We use a modified RPE scale specifically for Iyengar Yoga pedagogy:
- **5 (Effortless/Easy):** Practitioner felt light and stable.
- **3-4 (Moderate):** Standard practice.
- **1-2 (Struggled/Heavy):** High effort, low ease, or "groggy" feeling.

## "Smart Advice" Planning (Future RPC)
Even without an enrollment system, we can generate "Smart Advice" by querying the most recent entry in `sequence_completions`.

### Logic Flow:
1. **Identify Last Session:** Fetch the most recent `rpe_rating` for the logged-in user.
2. **Threshold Check:** - If `rpe_rating` <= 2: Trigger "Struggled" state.
   - If `rpe_rating` > 2: Trigger "Progress" state.
3. **Action Recommendation:**
   - **Struggled:** Suggest repeating the same `curriculum_slug` or a "Restorative" sequence from the library.
   - **Progress:** Suggest the next sequence in the `order_index`.

## Implementation Note for AI Agent
When querying `sequence_completions`, always join with `program_curriculum` via the `curriculum_slug` to identify where the user is in the overall syllabus.
