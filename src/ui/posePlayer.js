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
        window.setCurrentSide("right");
        window.setNeedsSecondSide(true); 
        setPose(window.currentIndex, true);
        return;
    }

    if (window.currentIndex > 0) {
        const newIndex = window.currentIndex - 1;
        const prevPoseData = poses[newIndex];
        
        const id = Array.isArray(prevPoseData[0]) ? prevPoseData[0][0] : prevPoseData[0];
        const asana = window.findAsanaByIdOrPlate(window.normalizePlate(id));

        if (asana && asana.requiresSides) {
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
    let seconds      = currentPose[1];

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

    // VARIATION DURATION OVERRIDE:
    const storedVarKey = currentPose[3];
    if (storedVarKey && asana && asana.variations && asana.variations[storedVarKey]) {
        const varData = asana.variations[storedVarKey];
        const varHoldStr = varData.hold || varData.Hold || "";
        
        if (varHoldStr) {
            const varHd = window.parseHoldTimes(varHoldStr);
            if (varHd.standard > 0) {
                const dial = document.getElementById("durationDial");
                const val = dial ? Number(dial.value) : 50;
                
                const min = varHd.short || Math.max(5, Math.round(varHd.standard * 0.5));
                const std = varHd.standard;
                const max = varHd.long || Math.round(varHd.standard * 2.0);
            
                if (val < 50) seconds = Math.round(min + (std - min) * (val / 50));
                else if (val > 50) seconds = Math.round(std + (max - std) * ((val - 50) / 50));
                else seconds = std;
            }
        }
    }

    // Sides Check
    if (asana && (asana.requiresSides || asana.requires_sides) && !keepSamePose) {
        window.setNeedsSecondSide(true);
    }

    // DIAL ENFORCER
    const dial = document.getElementById("durationDial");
    if (dial) {
        const val = Number(dial.value);
        if (val !== 50) {
            let mult = 1.0;
            if (val < 50) mult = 0.5 + (val / 50) * 0.5;
            else mult = 1.0 + ((val - 50) / 50) * 1.0;
            seconds = Math.round(seconds * mult);
        }
    }

    // VARIATION & NOTE EXTRACTION
    let rawExtras = [currentPose[2], currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    let variationTitle = "";
    let actualNote = "";
    let baseOverrideName = "";

    const bracketMatch = rawExtras.match(/\[(.*?)\]/);
    if (bracketMatch) {
        variationTitle = bracketMatch[1].trim();
        actualNote = rawExtras.replace(bracketMatch[0], "").replace(/^[\s\-\|]+/, "").trim();
    } else {
        baseOverrideName = currentPose[2] || "";
        actualNote = [currentPose[3], currentPose[4]].filter(Boolean).join(" ").trim();
    }

    // VARIATION TECHNIQUE & SHORTHAND
    let displayShorthand = "";
    let displayTechnique = asana ? (asana.technique || asana.Technique || "") : "";
    let matchedVariationKey = storedVarKey;

    const normalizeText = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    if (asana && asana.variations && variationTitle) {
        const normVarTitle = normalizeText(variationTitle);
        let foundVariation = false;

        // Pass 1: Exact matches
        for (const [vKey, vData] of Object.entries(asana.variations)) {
            const resolvedTitle = typeof vData === 'object' ? (vData.title || vData.Title || "") : "";
            const normTitle = normalizeText(resolvedTitle);
            const normShort = normalizeText(typeof vData === 'object' ? (vData.shorthand || vData.Shorthand || "") : "");
            const normKey = vKey.toLowerCase();

            if (normVarTitle === normTitle ||
                normVarTitle === normShort ||
                normVarTitle === `stage ${normKey}` ||
                normVarTitle === normKey) {

                const varTech = (typeof vData === 'object') ? (vData.Full_Technique || vData.technique) : vData;
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
                
                const safeVarTitle = normVarTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const matchRegex = new RegExp(`\\b${safeVarTitle}\\b`, 'i');

                if (matchRegex.test(normKey) || matchRegex.test(normTitle)) {
                    const varTech = (typeof vData === 'object') ? (vData.Full_Technique || vData.technique) : vData;
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
            displayTechnique = v.Full_Technique || v.technique || "";
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
        let finalTitle = baseOverrideName || (asana ? (asana.english_name || asana.english || asana.name) : "Pose");

        if (variationTitle) {
            finalTitle += ` <span style="font-weight:300; opacity:0.7; font-size:0.85em;">— ${variationTitle}</span>`;
        }

        if (asana && asana.requiresSides) {
            const sideMarker = window.currentSide === "right" ? "R" : "L";
            finalTitle += ` <span style="font-weight:300; opacity:0.5; font-size:0.8em; vertical-align: middle;">• ${sideMarker}</span>`;
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

    // 7. TECHNIQUE UI
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

    // 8. NOTES UI
    if (typeof window.updatePoseNote === "function") window.updatePoseNote(actualNote);
    if (typeof window.updatePoseAsanaDescription === "function") window.updatePoseAsanaDescription(asana);
    if (typeof window.loadUserPersonalNote === "function") window.loadUserPersonalNote(lookupId);

    // 9. META UI & AUDIO BUTTON
    const metaContainer = document.getElementById("poseMeta");
    if (metaContainer) {
        metaContainer.innerHTML = ""; 

        const infoSpan = document.createElement("span");
        infoSpan.className = "meta-text-only"; 

        const hj = asana ? window.getHoldTimes(asana) : null;
        let rangeText = "";
        if (hj && hj.short && hj.long) {
            rangeText = `Range: ${hj.short}s\u2013${hj.long}s`;
        } else if (hj && hj.standard) {
            rangeText = `~${hj.standard}s`;
        }

        infoSpan.textContent = rangeText 
            ? `ID: ${lookupId} \u2022 ${rangeText}` 
            : `ID: ${lookupId}`;
        metaContainer.appendChild(infoSpan);

        if (asana) {
            const btn = document.createElement("button");
            btn.className = "tiny"; 
            btn.innerHTML = "🔊";   
            btn.style.marginLeft = "10px";
            btn.onclick = (e) => { 
                e.stopPropagation(); 
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
    if (window.playbackEngine.running && asana) {
        const isSecondSide = window.getCurrentSide() === "left" && !!(asana.requiresSides || asana.requires_sides);
        window.playAsanaAudio(asana, baseOverrideName, false, window.getCurrentSide(), matchedVariationKey, isSecondSide);
    }
}

// Export for Wiring
window.setPose = setPose;
window.nextPose = nextPose;
window.prevPose = prevPose;