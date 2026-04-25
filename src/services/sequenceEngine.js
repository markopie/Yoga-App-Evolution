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
 * @param {object} ctx - Recursive context for macros and loops
 * @returns {Array} Flat array of pose tuples [id, dur, overrideName, variation, note, origIdx, metaLabel, poseMeta]
 */
export function getExpandedPoses(sequence, ctx = {}) {
    let expanded = [];
    if (!sequence || !sequence.poses) return [];

    const allCourses = window.courses || [];
    const visitedTitles = new Set(Array.isArray(ctx.visitedTitles) ? ctx.visitedTitles : []);
    const stack = Array.isArray(ctx.stack) ? [...ctx.stack] : [];
    const depth = Number(ctx.depth) || 0;
    const maxDepth = Number(ctx.maxDepth) || 12;
    
    const seqTitle = String(sequence.title || '').trim();

    // Structural Protection (Flow or Cycle) vs. Timing Strategy (Flow Only)
    const isProtected = window.isProtectedSequence ? window.isProtectedSequence(sequence) : false;
    const seqIsFlow = !!(sequence && (sequence.playbackMode === 'flow' || sequence.isFlow === true));

    const inheritedFlow = !!ctx.flowSegment;
    const flowSegment = inheritedFlow || seqIsFlow;
    
    const inheritedProtected = !!ctx.isProtected;
    const protectedContext = inheritedProtected || isProtected;

    if (depth > maxDepth) {
        console.warn(`[SequenceEngine] Max macro depth (${maxDepth}) exceeded for "${seqTitle || 'Untitled Sequence'}".`);
        return [];
    }

    if (seqTitle) {
        if (visitedTitles.has(seqTitle)) {
            const loopPath = [...stack, seqTitle].join(' → ');
            console.warn(`[SequenceEngine] Macro cycle detected: ${loopPath}`);
            return [];
        }
        visitedTitles.add(seqTitle);
        stack.push(seqTitle);
    }
    
    // 1. Unpack Macros
    sequence.poses.forEach((p, originalIdx) => {
        const rawId = Array.isArray(p[0]) ? p[0][0] : p[0];
        const idStr = String(rawId || "");
        const durOrReps = Number(p[1]) || 1;

        if (/^MACRO:/i.test(idStr)) {
            const identifier = idStr.replace(/^MACRO:/i, "").trim();
            const normId = identifier.toLowerCase();

            const sub = allCourses.find(c => {
                const cTitle = String(c.title || "").trim().toLowerCase();
                const cId = String(c.id || "").trim();
                return cTitle === normId || cId === identifier;
            });
            
            if (!sub || !sub.poses) {
                console.warn(`[SequenceEngine] Linked macro sequence "${identifier}" was not found.`);
                return;
            }

            const subExpanded = getExpandedPoses(sub, {
                visitedTitles: Array.from(visitedTitles),
                stack,
                depth: depth + 1,
                maxDepth,
                flowSegment,
                isProtected: protectedContext
            });

            const macroNote = (p[4] || "").trim();

            for (let i = 0; i < durOrReps; i++) {
                subExpanded.forEach(sp => {
                    let cloned = [...sp];
                    cloned[5] = originalIdx;

                    // Requirement: Add the macro note to EVERY asana in the linked sequence for the navigator
                    // Prepend the macro context to any existing pose-level notes.
                    if (macroNote) {
                        const existingNote = (cloned[4] || "").trim();
                        cloned[4] = existingNote ? `${macroNote} | ${existingNote}` : macroNote;
                    }
                    
                    const meta = { 
                        ...(cloned[7] || {}), 
                        macroTitle: sub.title || identifier,
                        flowSegment: !!(cloned[7]?.flowSegment || flowSegment),
                        isProtected: !!(cloned[7]?.isProtected || protectedContext)
                    };
                    
                    if (durOrReps > 1) {
                        meta.loopCurrent = i + 1;
                        meta.loopTotal = durOrReps;
                    }
                    
                    cloned[7] = meta;
                    expanded.push(cloned);
                });
            }
        } else {
            let cloned = [...p];
            cloned[5] = originalIdx;
            cloned[7] = { ...(cloned[7] || {}), flowSegment, isProtected: protectedContext };
            expanded.push(cloned);
        }
    });

    // 2. Unpack Loops
    let finalExpanded = [];
    let loopBuffer = [];
    let inLoop = false;
    let loopCount = 1;
    let loopLabel = "";

    expanded.forEach(p => {
        const idStr = String(p[0]);
        if (idStr === "LOOP_START") {
            if (inLoop) {
                for (let i = 0; i < loopCount; i++) {
                    finalExpanded.push(...loopBuffer.map(bp => {
                        let newBp = [...bp];
                        newBp[7] = { ...(newBp[7] || {}), loopCurrent: i + 1, loopTotal: loopCount, loopLabel };
                        return newBp;
                    }));
                }
            }
            inLoop = true;
            loopCount = Number(p[1]) || 1;
            loopLabel = p[4] ? p[4].replace(/[\[\]]/g, "").trim() : ""; 
            loopBuffer = [];
        } else if (idStr === "LOOP_END") {
            if (inLoop) {
                inLoop = false;
                for (let i = 0; i < loopCount; i++) {
                    finalExpanded.push(...loopBuffer.map(bp => {
                        let newBp = [...bp];
                        newBp[7] = { ...(newBp[7] || {}), loopCurrent: i + 1, loopTotal: loopCount, loopLabel };
                        return newBp;
                    }));
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
            finalExpanded.push(...loopBuffer.map(bp => {
                let newBp = [...bp];
                newBp[7] = { ...(newBp[7] || {}), loopCurrent: i + 1, loopTotal: loopCount, loopLabel };
                return newBp;
            }));
        }
    }

    // 3. Inject Preparatory & Recovery Poses
    const _normalizePlate = typeof window.normalizePlate === "function" ? window.normalizePlate : (x => x);
    const findAsana = (id) =>
        typeof window.findAsanaByIdOrPlate === "function"
            ? window.findAsanaByIdOrPlate(_normalizePlate(id))
            : null;

    let withInjected = [];
    
    finalExpanded.forEach(p => {
        const idStr = String(p[0] || "");
        const poseMeta = p[7] || {};
        
        if (idStr.startsWith("MACRO") || idStr.startsWith("LOOP_") || idStr === "GROUP_END") {
            withInjected.push(p);
            return;
        }

        const isFlowContext = !!poseMeta.flowSegment;
        // Evaluate Flow Context (Skip injections and side-doubling in pure flow / explicit single sides)
        const isExplicitSingleSide = poseMeta.explicitSide === 'L' || poseMeta.explicitSide === 'R';
        const skipInjections = !!(poseMeta.isProtected || isFlowContext || isExplicitSingleSide);

        if (skipInjections) {
            let cloned = [...p];
            cloned[7] = { 
                ...(cloned[7] || {}), 
                flowSegment: !!(poseMeta.flowSegment || isExplicitSingleSide),
                isBilateral: false // Overrides default bilateral player logic
            };
            withInjected.push(cloned);
            return;
        }

        const asana = findAsana(idStr);
        let currKey = null;

        let prepIds = [];
        let recovIds = [];

        if (asana) {
            let prep  = asana.preparatory_pose_id;
            let recov = asana.recovery_pose_id;

            // Relational Lookup: Prioritize stageId from JSON metadata
            if (poseMeta.stageId && asana.variations) {
                const stageEntry = Object.entries(asana.variations).find(([k, v]) => Number(v.id) === Number(poseMeta.stageId));
                if (stageEntry) {
                    prep = stageEntry[1].preparatory_pose_id || prep;
                    recov = stageEntry[1].recovery_pose_id || recov;
                }
            } 
            
            const addInjectionTarget = (val, list) => {
                if (!val) return;
                if (typeof val === 'object' && val.asana_id) {
                    list.push(val);
                } else if (typeof val === 'string' && val.toUpperCase() !== "NULL") {
                    // Legacy String Parsing (e.g. "020II")
                    const clean = val.trim().replace(/\|/g, "").replace(/\s+/g, "");
                    const m = clean.match(/^(\d+)(.*)$/);
                    if (m) list.push({ asana_id: m[1].padStart(3, "0"), var_key: m[2].toUpperCase() });
                }
            };

            // Heuristic Fallback for Variation Keys (Legacy)
            let keyMatch = [p[2], p[3], p[4]].filter(Boolean).join(" ").trim().match(/\[(.*?)\]/);
            if (keyMatch) {
                currKey = keyMatch[1].trim();
            } else if (p[3]) {
                currKey = String(p[3]).trim();
            }

            if (currKey && asana.variations) {
                const cleanNk = currKey.toLowerCase();
                for (const [vk, vd] of Object.entries(asana.variations)) {
                    const vtitle = (vd.title || "").toLowerCase().trim();
                    if (vk.toLowerCase() === cleanNk || vtitle.includes(cleanNk)) {
                        prep  = vd.preparatory_pose_id;
                        recov = vd.recovery_pose_id;
                        break;
                    }
                }
            }

            addInjectionTarget(prep, prepIds);
            addInjectionTarget(recov, recovIds);
        }

        const createInjectedPose = (target, label) => {
            const numId = String(target.asana_id || "").padStart(3, "0");
            const stageId = target.stage_id;
            const legacyVarKey = target.var_key;

            const targetAsana = findAsana(numId);
            if (!targetAsana) return null;

            let duration = 30;
            let variationName = "";
            let resolvedVarKey = legacyVarKey || null;

            const hj = window.getHoldTimes ? window.getHoldTimes(targetAsana) : {};
            duration = (hj && hj.standard) ? Number(hj.standard) : 30;

            if (stageId && targetAsana.variations) {
                const vEntry = Object.entries(targetAsana.variations).find(([k, v]) => Number(v.id) === Number(stageId));
                if (vEntry) {
                    const [vk, vd] = vEntry;
                    resolvedVarKey = vk;
                    const vdHold = window.getHoldTimes ? window.getHoldTimes(vd) : {};
                    if (vdHold.standard) duration = vdHold.standard;
                    variationName = vd.title || vd.Title || "";
                }
            } else if (legacyVarKey && targetAsana.variations) {
                for (const [vk, vd] of Object.entries(targetAsana.variations)) {
                    const vdHold = window.getHoldTimes ? window.getHoldTimes(vd) : {};
                    if (vk.toUpperCase() === legacyVarKey.toUpperCase() && vdHold.standard) {
                        duration = vdHold.standard;
                        variationName = vd.title || vd.Title || "";
                        resolvedVarKey = vk;
                        break;
                    }
                }
            }

            return [
                numId, 
                duration, 
                null, 
                resolvedVarKey, 
                variationName ? `[${variationName}]` : "",
                p[5] || null, 
                label,
                { ...(poseMeta || {}), flowSegment: isFlowContext, stageId: stageId || null }
            ];
        };

        prepIds.forEach(target  => { const pp = createInjectedPose(target, "Preparatory Action"); if (pp) withInjected.push(pp); });
        withInjected.push(p);
        recovIds.forEach(target => { const rp = createInjectedPose(target, "Recovery Action");    if (rp) withInjected.push(rp); });
    });

    return withInjected;
}

window.getExpandedPoses = getExpandedPoses;