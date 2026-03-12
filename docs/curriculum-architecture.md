# Curriculum & Sequence Architecture

## Overview
To avoid renaming our existing `courses` table (which functions as a Sequence Library), we use the `program_curriculum` table as a "Syllabus" or "Map."

### Key Tables
1. **courses (The Library):** Contains the actual asana data and sequence names.
2. **program_curriculum (The Map):** Defines the order, week, and day for a specific program (e.g., Mehta Course 1).
3. **sequence_completions (The History):** Records when a user finishes a sequence and their 1-5 RPE (Effort & Ease) rating.

## The "Gap" Ordering Strategy
To keep the curriculum flexible, the `order_index` column uses **Decimal** values in increments of 100:
- Day 1: `100.00`
- Day 2: `200.00`
- Day 3: `300.00`

*Why:* If we need to insert a "Pre-requisite" or "Intro" sequence between Day 1 and Day 2, we can give it an index of `150.00` without re-indexing the entire database.

## Slug Convention
Every row in `program_curriculum` must have a `curriculum_slug`.
- **Format:** `[author]_[course#]_[week#]_[day#]`
- **Example:** `mehta_c1_w1_d1` (Mira Mehta, Course 1, Week 1, Day 1).

## Logic for Progress
A sequence is considered "Ready" if:
1. It is the first item in the `program_curriculum`.
2. OR, the previous `order_index` has an entry in `sequence_completions` for the current user.
