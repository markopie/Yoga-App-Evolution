// src/ui/posePlayer.js
// ────────────────────────────────────────────────────────────────────────────
// Extracted from app.js Phase 4. Contains setPose(), nextPose(), prevPose().
//
// ⚠️  NO IMPORTS — follows sequenceEngine.js pattern (see refactor-roadmap.md
//     Lesson #4). All helpers accessed via window.* to avoid duplicate module
//     instances and Supabase auth breakage.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Universal Conflict Modal for session switching.
 */
window.showConflictModal = function(onConfirm, onResume) {
    let modal = document.getElementById("sessionConflictModal");
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="sessionConflictModal" class="modal-backdrop" style="display:none; z-index:10002; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); position:fixed; top:0; left:0; width:100%; height:100%;">
                <div class="modal" style="max-width:400px; padding:24px; text-align:center; border-radius:24px; background:#fff; box-shadow:0 20px 40px rgba(0,0,0,0.2); pointer-events:auto;">
                    <div style="font-size:2.5rem; margin-bottom:12px;">⚠️</div>
                    <h2 style="margin: 0 0 12px 0; font-size:1.4rem; font-weight:700; color:#1d1d1f;">Active Session in Progress</h2>
                    <p style="color:#6e6e73; line-height:1.6; margin-bottom:24px; font-size:0.95rem;">Starting this new sequence will end your current session and reset your progress. Do you wish to proceed? Or click to resume the current session at last pose.</p>
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <button id="btnConfirmNewSession" style="width:100%; background:#ff3b30; color:#fff; border:none; padding:14px; border-radius:14px; font-weight:600; cursor:pointer; transition: opacity 0.2s;">End Current & Start New</button>
                        <button id="btnResumeOldSession" style="width:100%; background:#f5f5f7; color:#1d1d1f; border:1px solid #d2d2d7; padding:14px; border-radius:14px; font-weight:600; cursor:pointer;">Resume Current Session</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById("sessionConflictModal");
    }
    
    modal.style.display = "flex";
    
    document.getElementById("btnConfirmNewSession").onclick = () => {
        modal.style.display = "none";
        onConfirm();
    };
    document.getElementById("btnResumeOldSession").onclick = () => {
        modal.style.display = "none";
        onResume();
    };
};

window.handleStart = () => {
    const proceed = () => {
        window.isBriefingActive = false;
        if (typeof window.updateAliasUIFeedback === 'function') window.updateAliasUIFeedback();
        if (typeof window.startTimer === 'function') window.startTimer();
    };

    const isSessionActive = (window.playbackEngine && window.playbackEngine.activePracticeSeconds > 5) || window.currentIndex > 0 || (typeof window.getCompletionTracker === 'function' && Object.values(window.getCompletionTracker()).some(v => v > 0));

    if (window.pendingSequence && isSessionActive) {
        window.showConflictModal(() => {
            window.applyPendingSequence();
            proceed();
        }, () => {
            window.pendingSequence = null;
            window.isBriefingActive = false;
            if (typeof window.syncSequenceSelector === 'function') window.syncSequenceSelector();
            if (typeof window.updateAliasUIFeedback === 'function') window.updateAliasUIFeedback();
            if (typeof window.setPose === 'function') window.setPose(window.currentIndex, true);
        });
    } else {
        if (window.pendingSequence) window.applyPendingSequence();
        proceed();
    }
};

window.handleNext = () => {
    const proceed = () => {
        window.isBriefingActive = false;
        if (typeof window.updateAliasUIFeedback === 'function') window.updateAliasUIFeedback();
    };

    const isSessionActive = (window.playbackEngine && window.playbackEngine.activePracticeSeconds > 5) || window.currentIndex > 0 || (typeof window.getCompletionTracker === 'function' && Object.values(window.getCompletionTracker()).some(v => v > 0));

    if (window.pendingSequence && isSessionActive) {
        window.showConflictModal(() => {
            window.applyPendingSequence();
            proceed();
        }, () => {
            window.pendingSequence = null;
            window.isBriefingActive = false;
            if (typeof window.syncSequenceSelector === 'function') window.syncSequenceSelector();
            if (typeof window.updateAliasUIFeedback === 'function') window.updateAliasUIFeedback();
            if (typeof window.setPose === 'function') window.setPose(window.currentIndex, true);
        });
    } else {
        if (window.pendingSequence) window.applyPendingSequence();
        proceed();
    }
};

function nextPose() {
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (window.currentSequence.poses || []);

    if (!poses.length) return false;

    if (window.needsSecondSide) {
        window.setCurrentSide("left");
        window.setNeedsSecondSide(false); 
        // Fix: Use window.currentIndex to ensure we stay on the same pose for the second side
        const currentIdx = window.currentIndex;
        // Update playback engine to reflect the side change
        if (window.playbackEngine) window.playbackEngine.currentSide = "left";
        setPose(currentIdx, true);
        return true;
    }

    if (window.currentIndex < poses.length - 1) {
        window.setCurrentSide("right");
        window.setNeedsSecondSide(false);
        setPose(window.currentIndex + 1);
        return true;
    } else {
        window.triggerSequenceEnd();
        return false;
    }
}

function prevPose() {
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (window.currentSequence.poses || []);

    if (window.currentIndex === 0) {
        if (window.remedialNote) {
            window.isBriefingActive = true;
            if (typeof window.updateAliasUIFeedback === 'function') window.updateAliasUIFeedback();
        }
        return;
    }

    if (window.getCurrentSide() === "left") {
        const currentPose = poses[window.currentIndex];
        const meta = currentPose?.[7] || {};
        // Only move back to 'right' side if this isn't an explicit single-sided pose
        if (!meta.explicitSide) {
            window.setCurrentSide("right");
            window.setNeedsSecondSide(true); 
            setPose(window.currentIndex, true);
            return;
        }
    }

    if (window.currentIndex > 0) {
        const newIndex = window.currentIndex - 1;
        const prevPoseData = poses[newIndex];
        
        const id = Array.isArray(prevPoseData[0]) ? prevPoseData[0][0] : prevPoseData[0];
        const asana = window.findAsanaByIdOrPlate(window.normalizePlate(id));
        const meta = prevPoseData[7] || {};

        // ARCHITECT FIX: Ensure resilient bilateral check during backwards navigation
        const isBilateralContext = asana && (asana.requires_sides === true || asana.requires_sides === "true" || asana.requiresSides === true) && !meta.explicitSide && !meta.flowSegment;

        if (isBilateralContext) {
            // Moving back from Pose N (Right) to Pose N-1 (Left)
            window.setCurrentSide("left");
            window.setNeedsSecondSide(false);
            if (window.playbackEngine) window.playbackEngine.currentSide = "left";
            setPose(newIndex, true); 
        } else {
            setPose(newIndex);
        }
    }
}

/* ==========================================================================
   RENDERER (SetPose)
   ========================================================================== */
function setPose(idx, keepSamePose = false) {
    if (!window.currentSequence) return;
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (window.currentSequence.poses || []);

    if (idx < 0 || idx >= poses.length) return;

    // 1. SAVE PROGRESS
    window.setCurrentIndex(idx);
    if (typeof window.saveCurrentProgress === "function") window.saveCurrentProgress();
    
    if (!keepSamePose) {
        window.setCurrentSide("right");
        window.setNeedsSecondSide(false);
        if (idx === 0 && typeof window.resetBridgeState === "function") window.resetBridgeState();
    }

    // Sync playback engine side
    if (window.playbackEngine) window.playbackEngine.currentSide = window.getCurrentSide();

    // 2. DATA EXTRACTION
    const currentPose = poses[idx];
    const poseMeta = currentPose[7] || {};
    const explicitSide = poseMeta.explicitSide;
    const originalRowIndex = (currentPose && currentPose[5] !== undefined) 
                            ? currentPose[5] 
                            : idx;

    const displayTotal = window.currentSequence.poses ? window.currentSequence.poses.length : poses.length;

    const focusCounter = document.getElementById("focusPoseCounter");
    if (focusCounter) {
        focusCounter.textContent = `${originalRowIndex + 1} / ${displayTotal}`;
    }

    const rawIdField = currentPose[0];
    let lookupId = Array.isArray(rawIdField) ? rawIdField[0] : rawIdField;
    lookupId = window.normalizePlate(lookupId);

    // ALIAS RESOLUTION
    if (typeof window.idAliases !== 'undefined' && window.idAliases[lookupId]) {
        let aliasVal = window.idAliases[lookupId];
        if (aliasVal.includes("|")) aliasVal = aliasVal.split("|")[0];
        lookupId = window.normalizePlate(aliasVal);
    }

    // 3. SMART LOOKUP
    const asana = window.findAsanaByIdOrPlate(lookupId);
    const storedVarKey = currentPose[3]; 

    // --- 🛑 DURATION RESOLUTION (TRUST THE PLAYBACK LIST) ---
    // applyDurationDial() has ALREADY evaluated the strict rules, 
    // applied the dial scaling, and calculated sides. We just read it directly!
    let seconds = Number(currentPose[1]);

    // Fallback: If list value is 0/missing (corrupt or legacy sequence), resolve from library
    if (!seconds && asana) {
        const tier = poseMeta.tier;
        const hj = window.getHoldTimes ? window.getHoldTimes(asana, currentPose[3]) : (asana.hold_json || { standard: 30 });
        if (tier === 'S') seconds = hj.short || hj.standard || 30;
        else if (tier === 'L') seconds = hj.long || hj.standard || 30;
        else seconds = hj.standard || 30;
    }

    // Final absolute safety fallback
    if (!seconds) seconds = 30;

    // 🌟 TIMER SYNC: Moved after resolution to ensure library-standard times are also synced
    if (window.playbackEngine) {
        window.playbackEngine.currentPoseSeconds = seconds;
        window.playbackEngine.remaining = seconds;
        // Immediately update the UI display (the "Pill") to prevent visual lag
        if (typeof window.updateTimerUI === "function") {
            window.updateTimerUI(seconds, seconds);
        }
    }

    // ARCHITECT FIX: Check both naming conventions for bilateral detection
    const isBilateral = asana && (asana.requires_sides === true || asana.requires_sides === "true" || asana.requiresSides === true);
    
    

    if (isBilateral) {
        if (!keepSamePose) {
            if (explicitSide === 'L' || explicitSide === 'R') {
                // Strict override from Flow Builder: Lock the side, kill the bilateral loop.
                window.setCurrentSide(explicitSide === 'L' ? 'left' : 'right');
                window.setNeedsSecondSide(false); 
            } else {
                // Standard behavior: Default to right, ask engine to play left next.
                window.setCurrentSide("right");
                window.setNeedsSecondSide(true);
            }
        }
    }


    // VARIATION & NOTE EXTRACTION (The Perfect Rollback)
    let noteField = currentPose[4] || "";
    let variationTitle = currentPose[3] || ""; 
    let actualNote = noteField;
    let baseOverrideName = currentPose[2] || "";

    const isJsonNative = !!poseMeta.originalJson;

    if (isJsonNative) {
        actualNote = poseMeta.originalJson.note || "";
    } else {
    // 1. ORIGINAL BRACKET LOGIC (Exactly as it was when variations worked perfectly)
    const bracketMatch = noteField.match(/\[(.*?)\]/);
    if (bracketMatch) {
        if (!variationTitle) variationTitle = bracketMatch[1].trim();
        actualNote = noteField.replace(bracketMatch[0], "").replace(/^[\s\-\|]+/, "").trim();
    } else if (!variationTitle) {
        actualNote = [currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    }
    }

    // 2. THE PROP SANITIZER (Multi-Prop Logic)
    let propModifier = null; // Legacy single-prop pointer
    
    // JSON-Native First: Rely strictly on the props array
    const registry = window.PROP_REGISTRY || {};
    let activeProps = Array.isArray(poseMeta.props) ? [...poseMeta.props] : [];
    if (activeProps.length > 0) propModifier = activeProps[0];

    // Legacy Note Cleanup (Strips it out for display hygiene and adds to active list)
    Object.keys(registry).forEach(propName => {
        const tag = `:${propName}`;
        const searchStr = (actualNote + " " + variationTitle + " " + baseOverrideName).toLowerCase();
        
        if (searchStr.includes(tag)) {
            if (!activeProps.includes(propName)) activeProps.push(propName);
            actualNote = actualNote.replace(new RegExp(tag, 'gi'), '').trim();
            variationTitle = variationTitle.replace(new RegExp(tag, 'gi'), '').trim();
            baseOverrideName = baseOverrideName.replace(new RegExp(tag, 'gi'), '').trim();
        }
    });

    // 🌟 ENSURE UNIQUENESS: Prevents double banners if a prop is in both JSON and Note string
    activeProps = [...new Set(activeProps)];

    if (!propModifier && activeProps.length > 0) propModifier = activeProps[0];

    // 3. Global State for Focus Mode Auto-Audio Trigger
    window.currentPropModifier = activeProps;

    // VARIATION TECHNIQUE & SHORTHAND
    let displayShorthand = "";
    let displayTechnique = asana ? (asana.technique || asana.Technique || "") : "";
    let matchedVariationKey = variationTitle || currentPose[3]; 

    const normalizeText = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const compactText = (str) => normalizeText(str).replace(/\s+/g, "");

    // 🌟 JSON NATIVE LOOKUP: Priority lookup via relational ID
    if (poseMeta.stageId && asana && asana.variations) {
        const foundEntry = Object.entries(asana.variations).find(([k, v]) => Number(v.id) === Number(poseMeta.stageId));
        if (foundEntry) {
            const [vKey, vData] = foundEntry;
            matchedVariationKey = vKey;
            variationTitle = vData.title || vData.Title || `Stage ${vKey}`;
            const varTech = (typeof vData === 'object') ? (vData.full_technique || vData.Full_Technique || vData.technique || vData.Technique) : vData;
            if (varTech) displayTechnique = varTech;
            if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
        }
    }

    // Legacy Fuzzy Match Logic (Fallback if stageId resolution failed or wasn't present)
    if (!matchedVariationKey && asana && asana.variations && variationTitle) {
        const compactVarTitle = compactText(variationTitle);
        let foundVariation = false;

        // Pass 1: Exact Match (NOW INCLUDES STAGE_NAME)
        for (const [vKey, vData] of Object.entries(asana.variations)) {
            const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
            const stageName = typeof vData === 'object' ? (vData.stage_name || vData.stage || vData.Stage || "") : "";
            
            const compactTitle = compactText(resolvedTitle);
            const compactShort = compactText(typeof vData === 'object' ? (vData.shorthand || vData.Shorthand || "") : "");
            const compactStage = compactText(stageName);
            const compactKey = compactText(vKey);

            if (compactVarTitle === compactTitle || 
                compactVarTitle === compactShort || 
                compactVarTitle === compactStage || // <-- CRITICAL: Catches "I", "II", "III" directly
                compactVarTitle === `stage${compactKey}` || 
                compactVarTitle === compactKey) {
                
                const varTech = (typeof vData === 'object') ? (vData.full_technique || vData.Full_Technique || vData.technique || vData.Technique) : vData;
                if (varTech) displayTechnique = varTech;
                if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
                
                const idNum = parseInt(asana.id || asana.asanaNo || "0", 10);
                if (idNum >= 214 && idNum <= 230 && resolvedTitle) {
                    variationTitle = resolvedTitle;
                } else if (resolvedTitle) {
                    const bm = resolvedTitle.match(/\((.*?)\)/);
                    if (bm) {
                        let innerText = bm[1].trim();
                        variationTitle = innerText.charAt(0).toUpperCase() + innerText.slice(1);
                    } else {
                        variationTitle = resolvedTitle.replace(/^Modified\s+[IVX]+\s*-?\s*/i, '').trim();
                    }
                }
                matchedVariationKey = vKey;
                foundVariation = true;
                break;
            }
        }

        // Pass 2: Fuzzy Roman Numeral Match
        if (!foundVariation) {
            const sortedKeys = Object.keys(asana.variations).sort((a,b) => b.length - a.length);
            for (const vKey of sortedKeys) {
                const normKey = vKey.toLowerCase();
                const vData = asana.variations[vKey];
                const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
                
                const normVarTitle = normalizeText(variationTitle);
                const safeVarTitle = normVarTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const matchRegex = new RegExp(`\\b${safeVarTitle}\\b`, 'i');

                if (matchRegex.test(normKey) || matchRegex.test(normalizeText(resolvedTitle))) {
                    const varTech = (typeof vData === 'object') ? (vData.full_technique || vData.Full_Technique || vData.technique || vData.Technique) : vData;
                    if (varTech) displayTechnique = varTech;
                    if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
                    matchedVariationKey = vKey;
                    break;
                }
            }
        }
    } else if (asana && variationTitle && asana.variations && asana.variations[variationTitle]) {
        const v = asana.variations[variationTitle];
        matchedVariationKey = variationTitle;
        if (typeof v === "string") {
            displayTechnique = v;
        } else {
            displayShorthand = v.shorthand || v.Shorthand || "";
            displayTechnique = v.full_technique || v.Full_Technique || v.technique || v.Technique || "";
            const legacyTitle = v.title || v.Title || "";
            if (legacyTitle) variationTitle = legacyTitle;
        }
    }

    // 🌟 RE-SANitize Props: If lookup updated variationTitle, check again for bandage/side
    if (variationTitle && registry && typeof variationTitle === 'string') {
        const vtLower = variationTitle.toLowerCase();
        Object.keys(registry).forEach(p => {
            if (vtLower.includes(`:${p}`)) {
                if (!activeProps.includes(p)) activeProps.push(p);
                variationTitle = variationTitle.replace(new RegExp(`:${p}`, 'gi'), '').trim();
            }
        });
        window.currentPropModifier = activeProps;
    }

    // 4. HEADER UI
    const nameEl = document.getElementById("poseName");
    const focusNameEl = document.getElementById("focusPoseName");
    const labelEl = document.getElementById("poseLabel");
    
    if (labelEl) {
        if (currentPose[6]) {
            labelEl.textContent = currentPose[6];
            labelEl.style.display = "flex";
        } else {
            labelEl.style.display = "none";
        }
    }

    // 🌟 UNIFIED TITLE CONSTRUCTION: Works for both Navigator and Focus Mode
    const baseName = currentPose[2] || (asana ? (asana.english_name || asana.english || asana.name) : "Pose");
    let finalTitle = baseName;

    if (variationTitle) {
        finalTitle += ` <span style="font-weight:300; opacity:0.7; font-size:0.85em;">— ${variationTitle}</span>`;
    }

    activeProps.forEach(pid => {
        const p = registry[pid];
        if (p) finalTitle += ` <span style="color:${p.color}; margin-left:6px;" title="${p.label}">${p.icon || '🩹'}</span>`;
    });

    // 🌟 RESTORE: Use the resilient isBilateral flag instead of strict property check
    if (isBilateral) {
        let sideMarker = "";
        if (explicitSide === "L" || explicitSide === "R") {
            sideMarker = explicitSide; 
        } else {
            sideMarker = window.getCurrentSide() === "right" ? "R" : "L";
        }
        finalTitle += ` <span style="font-weight:300; opacity:0.5; font-size:0.8em; vertical-align: middle;">• ${sideMarker}</span>`;
    }
    
    const showMacro = poseMeta.macroTitle;
    const showLoop = poseMeta.loopCurrent && poseMeta.loopTotal > 1;
    if (showMacro || showLoop) {
        const contextLabel = poseMeta.macroTitle || poseMeta.loopLabel || "";
        const labelDisplay = contextLabel ? ` (${contextLabel})` : "";
        const roundInfo = showLoop ? ` ${poseMeta.loopCurrent}/${poseMeta.loopTotal}` : "";
        const icon = showLoop ? '↻' : '🔗';
        finalTitle += ` <span style="font-weight:300; opacity:0.5; font-size:0.72em; vertical-align: middle; margin-left: 8px;">${icon}${roundInfo}${labelDisplay}</span>`;
    }

    if (nameEl) nameEl.innerHTML = finalTitle;
    if (focusNameEl) focusNameEl.innerHTML = finalTitle;

    // 5. SHORTHAND UI
    const shEl = document.getElementById("poseShorthand");
    if (shEl) {
        shEl.textContent = displayShorthand;
        shEl.style.display = displayShorthand ? "block" : "none";
    }

    // 6. GLOSSARY UI
    if (typeof window.renderSmartGlossary === "function") {
        window.renderSmartGlossary(displayShorthand);
    }

    // 7. TECHNIQUE UI (Main Display)
    const textContainer = document.getElementById("poseInstructions");
    if (textContainer) {
        if (displayTechnique && typeof window.formatTechniqueText === 'function') {
            textContainer.style.display = "block";
            let techniqueHTML = window.formatTechniqueText(displayTechnique);
            if (variationTitle) {
                techniqueHTML = `<div style="font-weight:600; color:#333; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid #ddd;">${variationTitle} Instructions:</div>` + techniqueHTML;
            }
            textContainer.innerHTML = techniqueHTML;
        } else {
            textContainer.style.display = "none";
            textContainer.innerHTML = "";
        }
    }

    // 8. NOTES & ASANA DETAILS (Accordions)
    if (typeof window.updatePoseNote === "function") {
        window.updatePoseNote(actualNote);
    }

    // NEW: Passing both asana AND the specifically matched technique to the renderer
    if (typeof window.updatePoseAsanaDescription === "function") {
        // We pass displayTechnique so the renderer doesn't have to guess
        window.updatePoseAsanaDescription(asana, displayTechnique);
    }

    // 9. META UI & AUDIO BUTTON
    const metaContainer = document.getElementById("poseMeta");
    if (metaContainer) {
        metaContainer.innerHTML = "";
        // The metadata container visibility is now primarily managed by updateAliasUIFeedback
        // but we keep this as a secondary safety guard for focused mode rendering.
        if (window.isBriefingActive) metaContainer.style.display = "none";

        const infoSpan = document.createElement("span");
        infoSpan.className = "meta-text-only"; 

        // ✅ Pass matchedVariationKey so Stage-specific times appear in the UI
        const hj = asana ? (window.getHoldTimes ? window.getHoldTimes(asana, matchedVariationKey) : (asana.hold_json || asana.hold_data)) : null;
        
        let rangeText = "";
        if (hj && hj.short && hj.long) {
            // Using \u2013 for the elegant en-dash
            rangeText = `Range: ${hj.short}s\u2013${hj.long}s`;
        } else if (hj && hj.standard) {
            rangeText = `~${hj.standard}s`;
        }

        // Standard Apple-style separator: ID • Timing
        infoSpan.textContent = rangeText 
            ? `ID: ${lookupId} \u2022 ${rangeText}` 
            : `ID: ${lookupId}`;
        metaContainer.appendChild(infoSpan);

        if (asana) {
            const btn = document.createElement("button");
            btn.className = "tiny"; btn.innerHTML = "🔊"; btn.style.marginLeft = "12px"; btn.style.opacity = "0.7";
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                window.playAsanaAudio(asana, null, true, null, matchedVariationKey, false, activeProps);
            };
            metaContainer.appendChild(btn);
        }
    }
    // 10. THERAPEUTIC BANNERS
    const wrap = document.getElementById("collageWrap");
    if (wrap) {
        // 🛡️ ARCHITECT FIX: Fully reset wrap to prevent image accumulation from previous poses
        wrap.innerHTML = '<div class="banner-stack" style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; width:100%;"></div>';
        const bannerStack = wrap.querySelector(".banner-stack");
        
        activeProps.forEach(pid => {
            const p = registry[pid];
            if (!p) return; // 🛡️ Safety check: Skip if prop is missing from registry
            const hexToRgba = (hex, a) => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };
            bannerStack.insertAdjacentHTML('beforeend', `<div class="therapeutic-banner" style="background:${hexToRgba(p.color, 0.08)}; border-left:4px solid ${p.color}; padding:12px; border-radius:6px; font-size:0.9em; color:#1d1d1f; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <strong style="color:${p.color};">${p.icon || '🩹'} ${p.bannerTitle}</strong><br>${p.bannerHtml}</div>`);
        });

        const urls = window.smartUrlsForPoseId(lookupId, matchedVariationKey);
        if (urls.length > 0) { 
            wrap.appendChild(window.renderCollage(urls)); 
        } else { 
            wrap.insertAdjacentHTML('beforeend', `<div class="msg">No image found for: ${lookupId}</div>`); 
        }
    }

    const overlayLabel = document.getElementById("focusPoseLabel");
    const overlayImageWrap = document.getElementById("focusImageWrap");

    if (overlayLabel) {
        if (currentPose[6]) {
            overlayLabel.textContent = currentPose[6];
            overlayLabel.style.display = "inline-block";
        } else {
            overlayLabel.style.display = "none";
        }
    }

    // 🌟 FOCUS MODE PROP LABELS (Accessibility & Audio Sync)
    const focusPropWrap = document.getElementById("focusPropIndicator");
    if (focusPropWrap) {
        const propNames = activeProps.map(pid => registry[pid]?.label || pid).filter(Boolean).join(", ");
        const propIcons = activeProps.map(pid => registry[pid]?.icon || '❓').filter(Boolean).join(" ");
        focusPropWrap.innerHTML = activeProps.length > 0 ? `<div style="background:rgba(255,255,255,0.95); padding:8px 18px; border-radius:24px; font-weight:700; color:#1d1d1f; border:1px solid #d2d2d7; display:flex; align-items:center; gap:12px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">${propIcons} <span style="font-size:0.95rem; opacity:0.9;">${propNames}</span></div>` : "";
        focusPropWrap.style.display = activeProps.length > 0 ? "flex" : "none";
    }
    
    if (overlayImageWrap) {
        overlayImageWrap.innerHTML = ""; 
        const focusUrls = window.smartUrlsForPoseId(lookupId, matchedVariationKey);
        if (focusUrls.length > 0) {
            const img = document.createElement("img");
            img.src = focusUrls[0]; 
            overlayImageWrap.appendChild(img);
        }
    }

    // 11. AUDIO TRIGGER
    window.currentVariationKey = matchedVariationKey;
    window.currentPropModifier = activeProps; // 🌟 SYNC: Ensure audio engine sees the props
    if (window.playbackEngine && window.playbackEngine.running && asana) {
        // 🌟 RESTORE: Use resilient check for audio logic too
        const isSecondSide = window.getCurrentSide() === "left" && !!isBilateral;
        window.playAsanaAudio(asana, baseOverrideName, false, window.getCurrentSide(), matchedVariationKey, isSecondSide, activeProps);
    }

    // SKIP BUTTON VISIBILITY (Recovery / Preparatory)
    const activeSkipBtn = document.getElementById("activePoseSkipBtn"); 
    if (activeSkipBtn) {
        // Stringify the currentPose array to easily catch 'recovery' or 'preparatory' 
        // whether it's in the note (index 4), the name (index 6), or meta (index 7)
        const poseDataString = JSON.stringify(currentPose).toLowerCase();
        
        const isSkipType = poseDataString.includes("recovery") || 
                           poseDataString.includes("preparat") || 
                           poseDataString.includes("preparation");
        
        if (isSkipType) {
            activeSkipBtn.style.display = "inline-block";
            activeSkipBtn.onclick = () => {
                // 1. Stop the current timer
                if (typeof window.stopTimer === 'function') window.stopTimer();
                
                // 2. Advance to the next pose
                const nextIdx = idx + 1;
                if (nextIdx < poses.length) {
                    window.setPose(nextIdx); // Load the UI
                    if (window.playbackEngine) window.playbackEngine.start(); // Auto-start nexts
                    if (typeof window.triggerSequenceEnd === 'function') window.triggerSequenceEnd();
                }
            };
        } else {
            activeSkipBtn.style.display = "none";
        }
    }

    // 🌟 SYNC: Update the 'Next' vs 'Complete' button text whenever the pose changes
    if (typeof window.updateNextBtnText === "function") window.updateNextBtnText();
}

// Export for Wiring
window.setPose = setPose;
window.nextPose = nextPose;
window.prevPose = prevPose;