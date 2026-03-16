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

    // ────────────────────────────────────────────────────────────────────────
   // ────────────────────────────────────────────────────────────────────────
    // 4. THE ROOT INTERCEPTOR: Enforce Priority Rules (STAGE-AWARE)
    // Permanently overwrite the authored sequence duration (p[1]) with the 
    // strictly enforced hierarchy before any UI component can read it.
    // ────────────────────────────────────────────────────────────────────────
    const lib = window.asanaLibrary || {};
    
    withInjected.forEach(p => {
        const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
        const strId = String(rawId || "");
        
        // Skip structural markers and auto-injected poses
        if (strId.startsWith("MACRO") || strId.startsWith("LOOP") || strId === "GROUP_END") return;
        if (p[6] === "Preparatory Action" || p[6] === "Recovery Action") return;

        const idNum = parseInt(strId.replace(/\D/g, ''), 10);
        const key = strId.trim().replace(/^0+/, "").padStart(3, "0");
        const asana = lib[key];
        
        if (!asana) return;

        // --- 🛑 NEW: RESOLVE SPECIFIC STAGE/VARIATION ---
        let targetForHold = asana;
        let varKey = p[3]; // The parsing script extracts the Roman numeral to p[3]
        
        // Fallback: Check the note column just in case
        if (!varKey && p[4]) {
            const match = p[4].match(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/i);
            if (match) varKey = match[1].toUpperCase() + (match[2] ? match[2].toLowerCase() : "");
        }

        if (varKey && asana.variations) {
            // Check direct match
            if (asana.variations[varKey]) {
                targetForHold = asana.variations[varKey];
            } else {
                // Check fuzzy match (e.g. "I" vs "Stage I")
                const normVar = varKey.toLowerCase().replace(/\s+/g, "");
                for (const [vk, vd] of Object.entries(asana.variations)) {
                    const title = (vd && typeof vd === 'object' && (vd.title || vd.Title)) || "";
                    if (vk.toLowerCase() === normVar || title.toLowerCase().replace(/\s+/g, "").includes(normVar)) {
                        targetForHold = vd;
                        break;
                    }
                }
            }
        }

        // Get the hold time from the STAGE (if found) or the BASE ASANA
        const hj = window.getHoldTimes ? window.getHoldTimes(targetForHold) : {};
        
        // If the specific stage lacks a hold time, fallback to the base asana's standard
        let libStandard = (hj && hj.standard != null) ? Number(hj.standard) : null;
        if (libStandard == null) {
            const baseHj = window.getHoldTimes ? window.getHoldTimes(asana) : {};
            libStandard = (baseHj && baseHj.standard != null) ? Number(baseHj.standard) : 30;
        }

        // --- ENFORCE TIMING RULES ---
        const note = p[4] || "";
        const tierMatch = note.match(/\btier:(S|L|STD)\b/i);
        const tier = tierMatch ? tierMatch[1].toUpperCase() : "";

        // Pranayama Protection Zone (Asana IDs 203-230)
        const isPranayama = idNum >= 203 && idNum <= 230;

        // RULE 1: Pranayama Protection or Explicit Tier
        if (isPranayama || tier) {
            if (tier) {
                let tierDur = libStandard;
                if (tier === 'S' && hj.short != null) tierDur = Number(hj.short);
                if (tier === 'L' && hj.long != null) tierDur = Number(hj.long);
                if (tier === 'STD' && hj.standard != null) tierDur = Number(hj.standard);
                
                // Valid tier overwrites authored time, else falls back to authored time
                p[1] = tierDur ?? Number(p[1]) ?? libStandard;
            } else {
                // Pranayama without tier -> Respect the authored sequence time
                p[1] = Number(p[1]) || libStandard;
            }
        } 
        // RULE 2: Global Default
        else {
            // 🛑 DESTROY authored sequence time, FORCE STAGE/LIBRARY Standard
            p[1] = libStandard;
        }
    });

    return withInjected;
}

// Make globally available for compatibility with app.js / wiring.js
window.getExpandedPoses = getExpandedPoses;