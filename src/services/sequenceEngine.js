// src/services/sequenceEngine.js
// Sequence expansion engine: unpacks MACROs, LOOPs, and injects preparatory/recovery poses.
// IMPORTANT: Uses window.* globals only — do NOT add module imports here.
// Adding imports risks creating a second Supabase client instance in the browser.

/**
 * Expands a raw sequence object into a flat, ordered pose list.
 * Handles: MACRO sub-sequences, LOOP_START/LOOP_END repeat blocks,
 * and automatic preparatory/recovery pose injection from asana metadata.
 *
 * @param {object} sequence - A course/sequence object with a .poses array
 * @returns {Array} Flat array of pose tuples [id, dur, overrideName, variation, note, origIdx, metaLabel]
 */
export function getExpandedPoses(sequence) {
    let expanded = [];
    if (!sequence || !sequence.poses) return [];

    const allCourses = window.courses || [];

    // 1. Unpack Macros
    sequence.poses.forEach((p, originalIdx) => {
        const idStr = String(p[0]);
        const durOrReps = Number(p[1]) || 1;

        if (idStr.startsWith("MACRO:")) {
            const targetTitle = idStr.replace("MACRO:", "").trim();
            const sub = allCourses.find(c => c.title === targetTitle);

            if (sub && sub.poses) {
                for (let i = 0; i < durOrReps; i++) {
                    sub.poses.forEach(sp => {
                        let cloned = [...sp];
                        cloned[5] = originalIdx;
                        expanded.push(cloned);
                    });
                }
            }
        } else {
            let cloned = [...p];
            cloned[5] = originalIdx;
            expanded.push(cloned);
        }
    });

    // 2. Unpack Loops
    let finalExpanded = [];
    let loopBuffer = [];
    let inLoop = false;
    let loopCount = 1;

    expanded.forEach(p => {
        const idStr = String(p[0]);
        if (idStr === "LOOP_START") {
            if (inLoop) {
                for (let i = 0; i < loopCount; i++) {
                    finalExpanded.push(...loopBuffer.map(bp => [...bp]));
                }
            }
            inLoop = true;
            loopCount = Number(p[1]) || 1;
            loopBuffer = [];
        } else if (idStr === "LOOP_END") {
            if (inLoop) {
                inLoop = false;
                for (let i = 0; i < loopCount; i++) {
                    finalExpanded.push(...loopBuffer.map(bp => [...bp]));
                }
                loopBuffer = [];
            }
        } else {
            if (inLoop) {
                loopBuffer.push(p);
            } else {
                finalExpanded.push(p);
            }
        }
    });

    if (inLoop) {
        for (let i = 0; i < loopCount; i++) {
            finalExpanded.push(...loopBuffer.map(bp => [...bp]));
        }
    }

    // 3. Inject Preparatory & Recovery Poses dynamically
    const _normalizePlate = typeof window.normalizePlate === "function" ? window.normalizePlate : (x => x);
    const findAsana = (id) =>
        typeof window.findAsanaByIdOrPlate === "function"
            ? window.findAsanaByIdOrPlate(_normalizePlate(id))
            : null;

    let withInjected = [];
    finalExpanded.forEach(p => {
        const idStr = String(p[0] || "");
        if (idStr.startsWith("MACRO") || idStr.startsWith("LOOP_") || idStr === "GROUP_END") {
            withInjected.push(p);
            return;
        }

        const asana = findAsana(idStr);

        let currKey = null;
        let keyMatch = [p[2], p[3], p[4]].filter(Boolean).join(" ").trim().match(/\[(.*?)\]/);
        if (keyMatch) {
            currKey = keyMatch[1].trim();
        } else if (p[3]) {
            currKey = String(p[3]).trim();
        }

        let prepIds = [];
        let recovIds = [];

        if (asana) {
            let prep  = asana.preparatory_pose_id;
            let recov = asana.recovery_pose_id;

            if (currKey && asana.variations) {
                const cleanNk = currKey.toLowerCase();
                for (const [vk, vd] of Object.entries(asana.variations)) {
                    const vtitle = (vd.title || vd.Title || "").toLowerCase().trim();
                    if (vk.toLowerCase() === cleanNk || vtitle.includes(cleanNk)) {
                        if (vd.preparatory_pose_id) prep  = vd.preparatory_pose_id;
                        if (vd.recovery_pose_id)    recov = vd.recovery_pose_id;
                        break;
                    }
                }
            }

            if (prep  && prep  !== "NULL" && prep  !== "null") prepIds.push(prep);
            if (recov && recov !== "NULL" && recov !== "null") recovIds.push(recov);
        }

        const createInjectedPose = (rawId, label) => {
            const cleanRawId = String(rawId).trim().replace(/\|/g, "").replace(/\s+/g, "");
            const parsed = cleanRawId.match(/^(\d+)(.*)$/);
            if (!parsed) return null;

            const numId      = parsed[1].padStart(3, "0");
            let   varSuffix  = parsed[2] ? parsed[2].toUpperCase() : "";
            if (varSuffix === "NULL") varSuffix = "";

            const targetAsana = findAsana(numId);
            let duration      = 30;
            let displayNameStr = "Action";

            if (targetAsana) {
                const hj = window.getHoldTimes ? window.getHoldTimes(targetAsana) : {};
                duration = (hj && hj.standard) ? Number(hj.standard) : 30;
                const _dn = typeof window.displayName === "function" ? window.displayName : (a => a?.english || a?.name || "Action");
                displayNameStr = _dn(targetAsana) || "Action";

                if (varSuffix && targetAsana.variations) {
                    for (const [vk, vd] of Object.entries(targetAsana.variations)) {
                        const vdHold = window.getHoldTimes ? window.getHoldTimes(vd) : {};
                        if (vk.toUpperCase() === varSuffix && vdHold.standard) {
                            duration = vdHold.standard;
                            break;
                        }
                    }
                }
            }

            return [numId, duration, null, varSuffix || null, `* ${label} (Auto-Injected) *`, p[5] || null, label];
        };

        prepIds.forEach(id  => { const pp = createInjectedPose(id,  "Preparatory Action"); if (pp) withInjected.push(pp); });
        withInjected.push(p);
        recovIds.forEach(id => { const rp = createInjectedPose(id,  "Recovery Action");    if (rp) withInjected.push(rp); });
    });

    return withInjected;
}

// Make globally available for compatibility with app.js / wiring.js
window.getExpandedPoses = getExpandedPoses;
