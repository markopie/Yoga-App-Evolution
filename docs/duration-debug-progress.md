# Duration Calculation Debug Progress

## Issue Summary
Duration estimates for linked sequences (Macros) were inconsistent between the "Info" cell in the builder and the grand total at the bottom. Linked flow sequences were showing half the expected time in the "Info" display.

## Evidence Collected
* **Confirmed Expansion Logic**: `getExpandedPoses` + `getPosePillTime` produces the correct bilateral doubling for flow-based poses.
  * `MACRO:321 x1` (Flow) correctly totals **720s / 12m**.
  * `MACRO:321 x2` correctly totals **1440s / 24m**.
* **Identified Failing Path**: `calculateTotalSequenceTime(321)` returns **360s / 6m**. 
  * This indicates that `getEffectiveTime` is likely disabling bilateral doubling when `isFlow` is true, whereas `getPosePillTime` (used by the viewer and builder totals) is correctly doubling based on library metadata.
* **Injected Time Inconsistency**: Sequence 306 showed a 60s discrepancy between `calculateTotalSequenceTime` and expanded totals, indicating "Auto-Injected" poses are handled differently across paths.

## Confirmed Behaviour
1. Linked macro expansion and rounds multiplication in `getExpandedPoses` are working as intended.
2. The bottom total label and sequence viewer "Pill" use a path that includes bilateral doubling for flows.
3. The Builder "Info" cell used a legacy path that excluded doubling for flows.

## Step 1 Patch Summary
* **File**: `src/ui/builder.js`
* **Change**: Redirected the calculation of `oneRoundSecs` for Macros to use a synthetic expansion via `getExpandedPoses` and `getPosePillTime`.
* **Result**: The "Info" cell now displays the correct duration per round, matching the bottom total.

## Remaining Issues
* **Injected-Time Accounting**: We need to decide if "Auto-Injected" time (prep/recovery) should be included in `calculateTotalSequenceTime` or if it belongs only in the "runtime" estimate.
* **Global Sync**: `calculateTotalSequenceTime` and `getEffectiveTime` still contain logic that diverges from `getPosePillTime`.

## Next Steps
1. Audit `getEffectiveTime` in `src/utils/sequenceUtils.js` to reconcile why it disagrees with `getPosePillTime` regarding flows.
2. Review the `injectedSecs` subtotal in `builder.js` to ensure it is not over-counting or double-doubling.
3. Standardize the "Viewer" fallback path in `statsUI.js` to use the expansion-based total.