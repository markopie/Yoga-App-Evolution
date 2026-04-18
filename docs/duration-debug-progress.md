# Duration Calculation Debug Progress

## Issue Summary
Duration estimates for linked sequences (Macros) were inconsistent between the "Info" cell in the builder and the grand total at the bottom. Linked flow sequences were showing half the expected time in the "Info" display.

## Evidence Collected
* **Confirmed Expansion Logic**: `getExpandedPoses` + `getPosePillTime` produces the correct bilateral doubling for flow-based poses.
  * `MACRO:321 x1` (Flow) correctly totals **720s / 12m**.
  * `MACRO:321 x2` correctly totals **1440s / 24m**.
* **Identified Failing Path**: `calculateTotalSequenceTime(321)` returns **360s / 6m**. 
  * This indicates that `getEffectiveTime` is likely disabling bilateral doubling when `isFlow` is true, whereas `getPosePillTime` (used by the viewer and builder totals) is correctly doubling based on library metadata.
* **Confirmed Authored Discrepancy (Sequence 306)**: The 60s discrepancy in 306 is an authored pose timing mismatch involving **ID 234**.
  * `getEffectiveTime` returned 300s, while `getPosePillTime` returned 360s. 
  * Diagnostic suggests a conflict between library standard times and authored duration overrides in standard sequences.

## Confirmed Behaviour
1. Linked macro expansion and rounds multiplication in `getExpandedPoses` are working as intended.
2. The bottom total label and sequence viewer "Pill" use a path that includes bilateral doubling for flows, which is consistent with playback.
3. The Builder "Info" cell used a legacy path that excluded doubling for flows.
## Step 1: Macro Info Alignment (Complete)
* **File**: `src/ui/builder.js`
* **Change**: Redirected the calculation of `oneRoundSecs` for Macros to use a synthetic expansion via `getExpandedPoses` and `getPosePillTime`.
* **Verification**: 
    * Manual check: Linked sequence 321 correctly shows **12m per round**.
    * Scaling check: Rounds = 2 correctly contributes **24m** to the grand total.
    * Programmatic check: Verified that `getExpandedPoses` path is the reliable "Source of Truth" for unrolled sequences.

## Step 2a: Flow Bilateral Alignment (Complete)
* **File**: `src/utils/sequenceUtils.js`
* **Change**: Removed `!isFlow` restriction from bilateral doubling logic in `getEffectiveTime`.
* **Result**: `calculateTotalSequenceTime` for flow sequences now correctly accounts for both sides, matching UI totals.

## Step 2b: Legacy Recovery Audit (In Progress)
* **Status Update**: Initial audit was inflated by false positives. Corrected audit logic now strictly targets rows with actual recovery/preparatory metadata.
* **Discovery**: The recovery-inclusion pattern is rare (~9 suspect rows across 4 sequences). 
* **Confirmed Case**: Sequence 306, Pose 234 remains the primary example. Authored duration (360s) exactly matches Library Standard (300s) + Recovery Standard (60s).
* **Conclusion**: Since the pattern is rare, we should avoid changing global `getEffectiveTime` priority in a way that legitimizes double-counting.

## Remaining Issues
* **Global Sync**: `calculateTotalSequenceTime` and `getEffectiveTime` still contain logic that diverges from `getPosePillTime`.

## Next Steps
1. **Step 2b**: Decide if authored durations should override library standards in standard sequences (currently they do not in `getEffectiveTime`).
2. **Step 3**: Standardize the "Viewer" fallback path in `statsUI.js` to use the expansion-based total.
3. **Step 4**: Audit `injectedSecs` subtotal in `builder.js` for accounting consistency.