// src/ui/renderers.js

import { renderMarkdownMinimal } from "../utils/format.js";
import { findAsanaByIdOrPlate, normalizePlate } from "../services/dataAdapter.js";

export function updatePoseNote(note) {
   const details = document.getElementById("poseNoteDetails");
   const body = document.getElementById("poseNoteBody");
   if (!details || !body) return;

   const text = (note ?? "").toString().trim();
   if (!text) {
      details.style.display = "none";
      details.open = false;
      body.innerHTML = "";
      return;
   }

   details.style.display = "block";
   details.open = true;
   body.innerHTML = renderMarkdownMinimal(text);
}

export function updatePoseAsanaDescription(asana, matchedTechnique = "") {
    const descDetails = document.getElementById("poseAsanaDescDetails");
    const descBody = document.getElementById("poseAsanaDescBody");
    const techDetails = document.getElementById("poseTechniqueDetails");
    const techBody = document.getElementById("poseTechniqueBody");

    if (!descDetails || !techDetails) return;

    // 1. Handle Description
    const descText = (asana?.description || asana?.Description || "").toString().trim();
    if (descText) {
        descDetails.style.display = "block";
        descDetails.open = false; // Always start closed for minimalism
        descBody.innerHTML = renderMarkdownMinimal(descText.replace(/\\n/g, '\n'));
    } else {
        descDetails.style.display = "none";
    }

    // 2. Handle Technique
    const finalTech = matchedTechnique || asana?.full_technique || asana?.technique || asana?.Technique || "";
    if (finalTech && finalTech.trim()) {
        techDetails.style.display = "block";
        techDetails.open = false; // Always start closed
        techBody.innerHTML = renderMarkdownMinimal(finalTech.toString().replace(/\\n/g, '\n'));
    } else {
        techDetails.style.display = "none";
    }
}

export function getContentForPose(asana, fullLabel) {
    if (!asana) return { description: "", technique: "" };

    let description = (asana.description || asana.Description || "").trim();
    let technique = (asana.full_technique || asana.technique || asana.Technique || "").trim();

    // Stage logic (Matches your existing pattern)
    const stageMatch = (fullLabel || "").match(/\s([IVXLCDM]+[a-b]?)$/i);
    if (stageMatch) {
        let stageKey = stageMatch[1].toUpperCase().replace(/([A-B])$/, (m) => m.toLowerCase());
        
        // If a specific stage description exists (e.g. asana["IIb"])
        if (asana[stageKey]) {
            description = asana[stageKey].trim();
        }
        
        // If a specific stage technique exists (e.g. asana["Technique_IIb"])
        const stageTechKey = `Technique_${stageKey}`;
        const stageFullTechKey = `full_technique_${stageKey}`;
        
        if (asana[stageFullTechKey]) technique = asana[stageFullTechKey].trim();
        else if (asana[stageTechKey]) technique = asana[stageTechKey].trim();
    }

    return { description, technique };
}

export function updatePoseDescription(idField, label) { 
   const body = document.getElementById("poseDescBody");
   if (!body) return;
   const asana = findAsanaByIdOrPlate(idField);
   const md = descriptionForPose(asana, label);

   if (md) {
      body.innerHTML = renderMarkdownMinimal(md);
   } else {
      body.innerHTML = '<div class="msg">No notes</div>';
   }
}

export function loadUserPersonalNote(idField) {
    const container = document.getElementById("poseDescBody");
    if (!container) return;
    container.innerHTML = ""; 

    const rawId = Array.isArray(idField) ? idField[0] : idField;
    // This key is already unique (e.g., "user_note_001")
    const storageKey = `user_note_${normalizePlate(rawId)}`; 
    const savedNote = localStorage.getItem(storageKey) || "";

    const wrapper = document.createElement("div");
    
    const area = document.createElement("textarea");
    
    // --- FIX: Add ID and Name attributes here ---
    area.id = storageKey;    // Helps browser identify the field
    area.name = storageKey;  // Helps browser identify the field
    // --------------------------------------------

    area.style.width = "100%";
    area.style.height = "80px";
    area.style.padding = "8px";
    area.style.border = "1px solid #ccc";
    area.style.borderRadius = "4px";
    area.style.fontFamily = "inherit";
    area.placeholder = "Add your personal notes for this pose here (e.g. 'Use block under knee')...";
    area.value = savedNote;

    const status = document.createElement("div");
    status.style.fontSize = "0.75rem";
    status.style.marginTop = "4px";
    status.style.color = "#888";
    status.textContent = "Changes save automatically.";

    let timeout;
    area.oninput = () => {
        status.textContent = "Saving...";
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            localStorage.setItem(storageKey, area.value);
            status.textContent = "✓ Saved to this device";
            status.style.color = "green";
            setTimeout(() => { status.style.color = "#888"; }, 2000);
        }, 800); 
    };

    wrapper.appendChild(area);
    wrapper.appendChild(status);
    container.appendChild(wrapper);
}

export function descriptionForPose(asana, fullLabel) {
   if (!asana) return "";
   
   // Extract Stage from Label (e.g., "Ujjayi IIb" -> "IIb")
   const stageMatch = (fullLabel || "").match(/\\s([IVXLCDM]+[a-b]?)$/i);
   if (stageMatch) {
       let stageKey = stageMatch[1].toUpperCase(); 
       stageKey = stageKey.replace(/([A-B])$/, (m) => m.toLowerCase()); 

       if (asana[stageKey]) {
           return asana[stageKey].trim();
       }
   }
   return (asana.Description || asana.Technique || "").trim();
}
