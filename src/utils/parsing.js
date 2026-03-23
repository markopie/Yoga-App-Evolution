function parseHoldTimes(holdStr) {
const result = { standard: 30, short: 15, long: 60, flow: 5 };
  if (!holdStr) return result;

  const parts = String(holdStr).split('|').map((s) => s.trim());
  parts.forEach((p) => {
    const match = p.match(/(Standard|Short|Long|Flow):\s*(\d+):(\d+)/i);
        if (match) {
      const key = match[1].toLowerCase();
      result[key] = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
      return;
    }

    const matchSec = p.match(/(Standard|Short|Long|Flow):\s*(\d+)/i);
        if (matchSec) {
      result[matchSec[1].toLowerCase()] = parseInt(matchSec[2], 10);
    }
  });

  return result;
}

function secsToMSS(secs) {
  const s = Math.max(0, parseInt(secs, 10) || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildHoldString(standard, short, long, flow = null) {
  const parts = [
    `Standard: ${secsToMSS(standard)}`,
    `Short: ${secsToMSS(short)}`,
    `Long: ${secsToMSS(long)}`
  ];

  if (flow != null && flow !== '') parts.push(`Flow: ${secsToMSS(flow)}`);
  return parts.join(' | ');
}

function parseSequenceText(sequenceText) {
  if (!sequenceText || typeof sequenceText !== 'string') return [];

  const lines = sequenceText.split('\n').map((line) => line.trim()).filter(Boolean);
  const poses = [];

  lines.forEach((line) => {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) return;

    const id = parts[0] || '';
    const duration = parseInt(parts[1], 10) || 0;
    const noteSection = parts.slice(2).join(' | ').trim();

    let variationKey = '';
    const note = noteSection;
    
    // Separate the Roman Numeral from the optional suffix character
    const variationMatch = noteSection.match(/\[.*?\b([IVX]+)([a-z]?)\b.*?\]/i);
    
    if (variationMatch) {
      // variationMatch[1] = "VII", variationMatch[2] = "a"
      const roman = variationMatch[1].toUpperCase();
      const suffix = variationMatch[2] ? variationMatch[2].toLowerCase() : "";
      variationKey = roman + suffix; // Properly reconstructs "VIIa" instead of "VIIA"
    }

    // MACRO: rows (e.g. "MACRO:Surya Namaskar A") are expected linked-sequence
    // markers and must round-trip through persistence intact.
    if (/^MACRO:/i.test(id)) {
      poses.push([id, duration, '', '', note]);
      return;
    }

    const numericPart = id.match(/^(\d+)/);
    const suffix = id.replace(/^\d+/, '');
    const normalizedId = numericPart
      ? numericPart[1].replace(/^0+/, '').padStart(3, '0') + suffix
      : id;

    

    if (/\s+/.test(suffix) || /^[IVX]{2,}/i.test(suffix)) {
      console.warn(
        `[parseSequenceText] Malformed ID "${id}" — it looks like "${numericPart?.[1]} | [${suffix.trim()}]" was intended.` +
        ` Move the stage name to the note column: "${numericPart?.[1]} | ${duration} | [${suffix.trim()}]"`
      );
      return;
    }

    // Extract optional hold-tier override keyword from the note field.
    // Format: "tier:S", "tier:L", or "tier:STD" (case-insensitive).
    // Written by builderCompileSequenceText when author picks a non-standard tier.
    // NOTE: we do NOT store this as p[5] — that slot is reserved for originalIdx
    // (set by getExpandedPoses). Instead, tier is read directly from p[4] (the note)
    // by consumers via a /\btier:(S|L|STD)\b/ regex when needed.

    poses.push([[normalizedId], duration, '', variationKey, note]);
  });

  return poses;
}

export { parseHoldTimes, secsToMSS, buildHoldString, parseSequenceText, getHoldTimes };

/**
* Returns the parsed hold-times object { short, standard, long, flow }.
 * If a variationKey is provided, it prioritizes that variation's data.
 * @param {object} asana - The base asana object.
 * @param {string} variationKey - Optional key (e.g., "IIb", "III").
 */
function getHoldTimes(asana, variationKey = null) {
    if (!asana) return { standard: 30, short: 15, long: 60, flow: 5 };

    let source = asana;

    // Check if the specific variation has its own timing override
    if (variationKey && asana.variations && asana.variations[variationKey]) {
        const v = asana.variations[variationKey];
        // Only switch source if the variation actually has a hold string
        if (v.hold || v.Hold) {
            source = v;
        }
    }

    return parseHoldTimes((source && (source.hold || source.Hold)) || '');
}

// Update the global exposure
if (typeof window !== 'undefined') window.getHoldTimes = getHoldTimes;