// IAST display preference — stored in localStorage
const IAST_PREF_KEY = "yoga_prefer_iast";

export function prefersIAST() {
   return localStorage.getItem(IAST_PREF_KEY) !== "false";
}

export function setIASTPref(val) {
   localStorage.setItem(IAST_PREF_KEY, val ? "true" : "false");
}

export function displayName(asana) {
   if (!asana) return "";
   if (prefersIAST() && asana.iast) return asana.iast;
   return asana.english || asana.name || asana.iast || "";
}

export function escapeHtml2(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  } [c]));
}

export function renderMarkdownMinimal(md) {

   const raw = String(md || "")

      .replace(/\r\n/g, "\n")

      .replace(/\r/g, "\n")

      .trim();

   if (!raw) return "";

   

   const lines = raw.split("\n");
   let out = "";
   let inOl = false;
   let inUl = false;

   const closeLists = () => {
      if (inOl) { out += "</ol>"; inOl = false; }
      if (inUl) { out += "</ul>"; inUl = false; }
   };

   const peekNextNonEmpty = (fromIdx) => {
      for (let k = fromIdx; k < lines.length; k++) {
         const t = (lines[k] || "").trim();
         if (t) return t;
      }
      return "";
   };

   for (let i = 0; i < lines.length; i++) {
      const trimmed = (lines[i] || "").trim();

      if (!trimmed) {
         const next = peekNextNonEmpty(i + 1);
         const nextOl = next.match(/^(\d+)[\.)] \s+/);
         const nextUl = next.match(/^[-*]\s+/);
         
         if ((inOl && nextOl) || (inUl && nextUl)) continue;
         
         closeLists();
         out += "<div style='display:block; height:15px; width:100%;'></div>";
         continue;
      }

      const ol = trimmed.match(/^(\d+)[\.)] \s+(.*)$/);
      const ul = trimmed.match(/^[-*]\s+(.*)$/);

      if (ol) {
         if (inUl) { out += "</ul>"; inUl = false; }
         if (!inOl) { out += "<ol style='margin-bottom:10px; padding-left:25px;'>"; inOl = true; }
         out += "<li style='margin-bottom:8px;'>" + escapeHtml2(ol[2]) + "</li>";
         continue;
      }

      if (ul) {
         if (inOl) { out += "</ol>"; inOl = false; }
         if (!inUl) { out += "<ul style='margin-bottom:10px; padding-left:25px;'>"; inUl = true; }
         out += "<li style='margin-bottom:8px;'>" + escapeHtml2(ul[1]) + "</li>";
         continue;
      }

      closeLists();
      out += `<p style="margin: 0 0 12px 0; line-height: 1.6; display: block;">${escapeHtml2(trimmed)}</p>`;
   }
   closeLists();
   return out;
}

export function formatHMS(totalSeconds) {
   const s = Math.max(0, Math.floor(totalSeconds || 0));
   const h = Math.floor(s / 3600);
   const m = Math.floor((s % 3600) / 60);
   const r = s % 60;
   if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
   return `${m}:${String(r).padStart(2,"0")}`;
}

export function formatTechniqueText(text) {
    // SAFETY CHECK: If text is null, undefined, or an object, return empty string
    if (!text || typeof text !== 'string') return "";
    
    // Strip surrounding quotes
    let clean = text.replace(/^"|"$/g, '').trim();
    
    // Convert literal \n escape sequences (stored as backslash-n in the DB) to real newlines
    // This handles text like "Stand erect.\n\nTouch your heels..." from Supabase
    clean = clean.replace(/\\n/g, '\n');
    
    // Collapse 3+ consecutive newlines down to 2
    clean = clean.replace(/\n{3,}/g, '\n\n');
    
    // Trim trailing whitespace on each line
    clean = clean.split('\n').map(l => l.trimEnd()).join('\n').trim();
    
    return clean;
}
