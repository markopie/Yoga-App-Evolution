// -------- DOM Helpers --------
export function $(id) { 
  return document.getElementById(id); 
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ 
    "&": "&amp;", 
    "<": "&lt;", 
    ">": "&gt;", 
    '"': "&quot;", 
    "'": "&#39;" 
  }[c]));
}

// -------- Data loading --------
export async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.json();
}

// -------- Formatting --------
export function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function normalizePlate(p) {
  // keep "471.0" etc as-is; strip leading zeros for matching where user types "1" vs "001"
  const s = String(p ?? "").trim();
  if (!s) return "";
  // if purely digits, normalize to no leading zeros
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s; 
}

export function ensureArray(x) {
  return Array.isArray(x) ? x : [x];
}

// -------- Markdown Logic --------
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
      const nextOl = next.match(/^(\d+)[\.)]\s+/);
      const nextUl = next.match(/^[-*]\s+/);
      if ((inOl && nextOl) || (inUl && nextUl)) {
        continue; // keep list open
      }
      closeLists();
      continue;
    }

    const ol = trimmed.match(/^(\d+)[\.)]\s+(.*)$/);
    const ul = trimmed.match(/^[-*]\s+(.*)$/);

    if (ol) {
      if (inUl) { out += "</ul>"; inUl = false; }
      if (!inOl) { out += "<ol>"; inOl = true; }
      out += "<li>" + escapeHtml(ol[2]) + "</li>";
      continue;
    }

    if (ul) {
      if (inOl) { out += "</ol>"; inOl = false; }
      if (!inUl) { out += "<ul>"; inUl = true; }
      out += "<li>" + escapeHtml(ul[1]) + "</li>";
      continue;
    }

    closeLists();
    out += "<p style=\"margin:8px 0\">" + escapeHtml(trimmed) + "</p>";
  }
  closeLists();
  return out;
}