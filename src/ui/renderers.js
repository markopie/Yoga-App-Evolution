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
    const stack = document.getElementById("poseInfoStack"); // The wrapper
    const descDetails = document.getElementById("poseAsanaDescDetails");
    const descBody = document.getElementById("poseAsanaDescBody");
    const techDetails = document.getElementById("poseTechniqueDetails");
    const techBody = document.getElementById("poseTechniqueBody");

    if (!descDetails || !techDetails) return;

    let hasContent = false;

    // 1. Handle Description
    const descText = (asana?.description || asana?.Description || "").toString().trim();
    if (descText) {
        descDetails.style.display = "block";
        descDetails.open = false; // Always start closed for minimalism
        descBody.style.display = "block"; // Override the inline display:none from HTML
        descBody.innerHTML = renderMarkdownMinimal(descText.replace(/\\n/g, '\n'));
        hasContent = true;
    } else {
        descDetails.style.display = "none";
    }

    // 2. Handle Technique
    const finalTech = matchedTechnique || asana?.full_technique || asana?.technique || asana?.Technique || "";
    if (finalTech && finalTech.trim()) {
        techDetails.style.display = "block";
        techDetails.open = false; // Always start closed
        techBody.innerHTML = renderMarkdownMinimal(finalTech.toString().replace(/\\n/g, '\n'));
        hasContent = true;
    } else {
        techDetails.style.display = "none";
    }

    // 3. Control the Wrapper (Only show borders if there is actual content)
    if (stack) {
        stack.style.display = hasContent ? "block" : "none";
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
