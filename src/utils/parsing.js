function parseHoldTimes(holdStr) {
  const result = { standard: 30, short: 15, long: 60 };
  if (!holdStr) return result;

  const parts = String(holdStr).split('|').map((s) => s.trim());
  parts.forEach((p) => {
    const match = p.match(/(Standard|Short|Long):\s*(\d+):(\d+)/i);
    if (match) {
      const key = match[1].toLowerCase();
      result[key] = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
      return;
    }

    const matchSec = p.match(/(Standard|Short|Long):\s*(\d+)/i);
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

function buildHoldString(standard, short, long) {
  return `Standard: ${secsToMSS(standard)} | Short: ${secsToMSS(short)} | Long: ${secsToMSS(long)}`;
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
    // 'i' flag: matches lowercase brackets like [iia]; toUpperCase() normalises to DB key format.
    const variationMatch = noteSection.match(/\[.*?\b([IVX]+[a-z]?)\]/i);
    if (variationMatch) {
      variationKey = variationMatch[1].toUpperCase();
    }

    const numericPart = id.match(/^(\d+)/);
    const suffix = id.replace(/^\d+/, '');
    const normalizedId = numericPart
      ? numericPart[1].replace(/^0+/, '').padStart(3, '0') + suffix
      : id;

    // Guard: reject IDs that smuggle a Roman numeral or a space (e.g. "53 II" or "53II").
    // These are data-entry mistakes — the stage belongs in the note column as "[II]".
    if (/\s+/.test(suffix) || /^[IVX]{2,}/i.test(suffix)) {
      console.warn(
        `[parseSequenceText] Malformed ID "${id}" — it looks like "${numericPart?.[1]} | [${suffix.trim()}]" was intended.` +
        ` Move the stage name to the note column: "${numericPart?.[1]} | ${duration} | [${suffix.trim()}]"`
      );
      return; // Skip row — do not insert a ghost pose that will never resolve.
    }

    poses.push([[normalizedId], duration, '', variationKey, note]);
  });

  return poses;
}

export { parseHoldTimes, secsToMSS, buildHoldString, parseSequenceText };
