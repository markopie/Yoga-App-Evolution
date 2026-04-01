// src/ui/posePlayer.js
// ────────────────────────────────────────────────────────────────────────────
// Extracted from app.js Phase 4. Contains setPose(), nextPose(), prevPose().
//
// ⚠️  NO IMPORTS — follows sequenceEngine.js pattern (see refactor-roadmap.md
//     Lesson #4). All helpers accessed via window.* to avoid duplicate module
//     instances and Supabase auth breakage.
// ────────────────────────────────────────────────────────────────────────────

function nextPose() {
    const poses = (window.activePlaybackList && window.activePlaybackList.length > 0) 
                  ? window.activePlaybackList 
                  : (window.currentSequence.poses || []);

    if (!poses.length) return false;

    if (window.needsSecondSide) {
        window.setCurrentSide("left");
        window.setNeedsSecondSide(false); 
        setPose(window.currentIndex, true);
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

        // Only treat as bilateral if it's not a flow segment and has no explicit side lock
        const isBilateralContext = asana && (asana.requiresSides || asana.requires_sides) && !meta.explicitSide && !meta.flowSegment;

        if (isBilateralContext) {
            window.setCurrentSide("left");
            window.setNeedsSecondSide(false);
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

    // 2. DATA EXTRACTION
    const currentPose = poses[idx];
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
    let seconds = Number(currentPose[1]) || 30;

    if (asana && (asana.requiresSides || asana.requires_sides)) {
        if (!keepSamePose) {
            const poseMeta = currentPose[7] || {};
            const explicitSide = poseMeta.explicitSide;

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


    // VARIATION & NOTE EXTRACTION
    let noteField = currentPose[4] || "";
    let variationTitle = currentPose[3] || ""; 
    let actualNote = noteField;
    let baseOverrideName = currentPose[2] || "";

    const bracketMatch = noteField.match(/\[(.*?)\]/);
    if (bracketMatch) {
        if (!variationTitle) variationTitle = bracketMatch[1].trim();
        // Clean out the bracket part so the note UI just shows the user's text
        actualNote = noteField.replace(bracketMatch[0], "").replace(/^[\s\-\|]+/, "").trim();
    } else if (!variationTitle) {
        actualNote = [currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    }

    // VARIATION TECHNIQUE & SHORTHAND
    let displayShorthand = "";
    let displayTechnique = asana ? (asana.technique || asana.Technique || "") : "";
    let matchedVariationKey = storedVarKey || variationTitle;

    const normalizeText = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const compactText = (str) => normalizeText(str).replace(/\s+/g, "");

    if (asana && asana.variations && variationTitle) {
        const compactVarTitle = compactText(variationTitle);
        let foundVariation = false;

        // Pass 1: Exact & Space-Agnostic Matches
        for (const [vKey, vData] of Object.entries(asana.variations)) {
            const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
            const compactTitle = compactText(resolvedTitle);
            const compactShort = compactText(typeof vData === 'object' ? (vData.shorthand || vData.Shorthand || "") : "");
            const compactKey = compactText(vKey);

            if (compactVarTitle === compactTitle ||
                compactVarTitle === compactShort ||
                compactVarTitle === `stage${compactKey}` ||
                compactVarTitle === compactKey) {

                // 🛑 CRITICAL FIX: Explicitly target full_technique first
                const varTech = (typeof vData === 'object') ? (vData.full_technique || vData.Full_Technique || vData.technique || vData.Technique) : vData;
                if (varTech) displayTechnique = varTech;
                if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
                
                const idNum = parseInt(asana.id || asana.asanaNo || "0", 10);
                const isPranayama = idNum >= 214 && idNum <= 230;

                if (resolvedTitle) {
                    if (isPranayama) {
                        variationTitle = resolvedTitle;
                    } else {
                        const bm = resolvedTitle.match(/\((.*?)\)/);
                        if (bm) {
                            let innerText = bm[1].trim();
                            variationTitle = innerText.charAt(0).toUpperCase() + innerText.slice(1);
                        } else {
                            variationTitle = resolvedTitle.replace(/^Modified\s+[IVX]+\s*-?\s*/i, '').trim();
                        }
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
                const normTitle = normalizeText(resolvedTitle);
                
                const normVarTitle = normalizeText(variationTitle);
                const safeVarTitle = normVarTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const matchRegex = new RegExp(`\\b${safeVarTitle}\\b`, 'i');

                if (matchRegex.test(normKey) || matchRegex.test(normTitle)) {
                    // 🛑 CRITICAL FIX: Explicitly target full_technique first
                    const varTech = (typeof vData === 'object') ? (vData.full_technique || vData.Full_Technique || vData.technique || vData.Technique) : vData;
                    if (varTech) displayTechnique = varTech;
                    if (typeof vData === 'object') displayShorthand = vData.shorthand || vData.Shorthand || "";
                    
                    const idNum = parseInt(asana.id || asana.asanaNo || "0", 10);
                    const isPranayama = idNum >= 214 && idNum <= 230;

                    if (resolvedTitle) {
                        if (isPranayama) {
                            variationTitle = resolvedTitle;
                        } else {
                            const bm = resolvedTitle.match(/\((.*?)\)/);
                            if (bm) {
                                let innerText = bm[1].trim();
                                variationTitle = innerText.charAt(0).toUpperCase() + innerText.slice(1);
                            } else {
                                variationTitle = resolvedTitle.replace(/^Modified\s+[IVX]+\s*-?\s*/i, '').trim();
                            }
                        }
                    }
                    
                    matchedVariationKey = vKey;
                   
                    break;
                }
            }
        }
    } 
    // Legacy fallback
    else if (asana && currentPose[3] && asana.variations && asana.variations[currentPose[3]]) {
        const v = asana.variations[currentPose[3]];
        matchedVariationKey = currentPose[3];
        if (typeof v === "string") {
            displayTechnique = v;
        } else {
            displayShorthand = v.shorthand || v.Shorthand || "";
            // 🛑 CRITICAL FIX: Explicitly target full_technique first
            displayTechnique = v.full_technique || v.Full_Technique || v.technique || v.Technique || "";
            const legacyTitle = v.title || v.Title || "";
            if (legacyTitle) variationTitle = legacyTitle;
        }
    }

    // 4. HEADER UI
    const nameEl = document.getElementById("poseName");
    const labelEl = document.getElementById("poseLabel");
    
    if (labelEl) {
        if (currentPose[6]) {
            labelEl.textContent = currentPose[6];
            labelEl.style.display = "flex";
        } else {
            labelEl.style.display = "none";
        }
    }

    if (nameEl) {
        // Index 2 is baseOverrideName. This will now correctly be empty unless you actually typed a custom name.
        const baseOverrideName = currentPose[2];
        let finalTitle = baseOverrideName || (asana ? (asana.english_name || asana.english || asana.name) : "Pose");

        if (variationTitle) {
            finalTitle += ` <span style="font-weight:300; opacity:0.7; font-size:0.85em;">— ${variationTitle}</span>`;
        }

        if (asana && asana.requiresSides) {
            // 👇 Read our explicit side from the meta object we just injected
            const poseMeta = currentPose[7] || {};
            const explicitSide = poseMeta.explicitSide;
            
            let sideMarker = "";
            if (explicitSide === "L" || explicitSide === "R") {
                sideMarker = explicitSide; // Strict override from Flow Builder
            } else {
                sideMarker = window.currentSide === "right" ? "R" : "L"; // Standard fallback
            }
            
            finalTitle += ` <span style="font-weight:300; opacity:0.5; font-size:0.8em; vertical-align: middle;">• ${sideMarker}</span>`;
        }
        
        const poseMeta = currentPose[7] || {};
        const showMacro = poseMeta.macroTitle;
        const showLoop = poseMeta.loopCurrent && poseMeta.loopTotal > 1;

        if (showMacro || showLoop) {
            const contextLabel = poseMeta.macroTitle || poseMeta.loopLabel || "";
            const labelDisplay = contextLabel ? ` (${contextLabel})` : "";
            const roundInfo = showLoop ? ` ${poseMeta.loopCurrent}/${poseMeta.loopTotal}` : "";
            const icon = showLoop ? '↻' : '🔗';

            finalTitle += ` <span style="font-weight:300; opacity:0.5; font-size:0.72em; vertical-align: middle; margin-left: 8px;">
                              ${icon}${roundInfo}${labelDisplay}
                           </span>`;
        }

        nameEl.innerHTML = finalTitle; 
    }

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

        const infoSpan = document.createElement("span");
        infoSpan.className = "meta-text-only"; 

        // ✅ Pass matchedVariationKey so Stage-specific times appear in the UI
        const hj = asana ? window.getHoldTimes(asana, matchedVariationKey) : null;
        
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
            btn.className = "tiny"; 
            btn.innerHTML = "🔊";   
            btn.style.marginLeft = "12px"; // Slightly more whitespace for that premium feel
            btn.style.opacity = "0.7";     // Subtly lighter until hovered
            btn.onclick = (e) => { 
                e.stopPropagation(); 
                // Correctly passes the variation key to the audio engine
                window.playAsanaAudio(asana, null, true, null, matchedVariationKey); 
            };
            metaContainer.appendChild(btn);
        }
    }

    // 10. TIMER & IMAGE LOGIC
    window.playbackEngine.setPoseTime(seconds);
    window.playbackEngine.remaining = window.playbackEngine.currentPoseSeconds;
    window.updateTimerUI(window.playbackEngine.remaining, window.playbackEngine.currentPoseSeconds);

    const wrap = document.getElementById("collageWrap");
    if (wrap) {
        wrap.innerHTML = "";
        const urls = window.smartUrlsForPoseId(lookupId, matchedVariationKey);
        if (urls.length > 0) {
            wrap.appendChild(window.renderCollage(urls));
        } else {
            const div = document.createElement("div");
            div.className = "msg";
            div.textContent = `No image found for: ${lookupId}`;
            wrap.appendChild(div);
        }
    }

    // SYNC OVERLAY CONTENT
    const overlayName = document.getElementById("focusPoseName");
    const overlayLabel = document.getElementById("focusPoseLabel");
    const overlayImageWrap = document.getElementById("focusImageWrap");
    
    if (overlayName && nameEl) overlayName.innerHTML = nameEl.innerHTML;
    
    if (overlayLabel) {
        if (currentPose[6]) {
            overlayLabel.textContent = currentPose[6];
            overlayLabel.style.display = "inline-block";
        } else {
            overlayLabel.style.display = "none";
        }
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
    if (window.playbackEngine && window.playbackEngine.running && asana) {
        const isSecondSide = window.getCurrentSide() === "left" && !!(asana.requiresSides || asana.requires_sides);
        window.playAsanaAudio(asana, baseOverrideName, false, window.getCurrentSide(), matchedVariationKey, isSecondSide);
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
                    if (window.playbackEngine) window.playbackEngine.start(); // Auto-start next
                } else {
                    if (typeof window.triggerSequenceEnd === 'function') window.triggerSequenceEnd();
                }
            };
        } else {
            activeSkipBtn.style.display = "none";
        }
    }
}

// Export for Wiring
window.setPose = setPose;
window.nextPose = nextPose;
window.prevPose = prevPose;