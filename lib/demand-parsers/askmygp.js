// lib/demand-parsers/askmygp.js
//
// Parser for the AskMyGP "Crosstab — Demand data" CSV export.
//
// Format (UTF-16 LE, tab-separated, ~4 rows):
//   Row 1: empty col, then week-start dates repeating (7 columns per week, Mon-Sun)
//   Row 2: empty col, then weekday labels (Monday..Sunday, repeating)
//   Row 3: "% of week ..." with percentages (we ignore)
//   Row 4: "requests" with daily counts
//   ... possibly more rows below for other metrics (we ignore)
//
// We reconstruct the actual date for each column from week-start + weekday
// offset. Empty cells = practice closed that day = skip (don't record 0 —
// we want missing-data semantics, not "had zero demand").
//
// Returns: { rows: [{ date, count }], errors: [], summary }
// Designed to be called from a browser File reader.

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Parse the AskMyGP demand CSV from a File or string.
 * Caller passes raw text (already decoded from UTF-16 if needed).
 */
export function parseAskMyGpCSV(rawText) {
  const errors = [];
  const rows = [];

  // Strip BOM if present
  let text = rawText;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 4) {
    return { rows, errors: ['File has fewer than 4 lines — does not look like an AskMyGP demand CSV'], summary: null };
  }

  const dateRow = lines[0].split('\t');
  const dayRow = lines[1].split('\t');

  // Find the row labelled "requests" (row 4 in the spec, but defensive: search for it)
  let requestsRow = null;
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const label = (cols[0] || '').toLowerCase();
    if (label === 'requests' || label.startsWith('requests')) {
      requestsRow = cols;
      break;
    }
  }
  if (!requestsRow) {
    return { rows, errors: ['Could not find "requests" row in CSV — may be wrong format'], summary: null };
  }

  // Validate columns line up
  if (dateRow.length !== dayRow.length || dateRow.length !== requestsRow.length) {
    errors.push(`Column count mismatch: dates=${dateRow.length}, days=${dayRow.length}, requests=${requestsRow.length}. Will process up to the shortest.`);
  }
  const colCount = Math.min(dateRow.length, dayRow.length, requestsRow.length);

  // Iterate columns, skipping the first (label column)
  for (let col = 1; col < colCount; col++) {
    const weekStartStr = (dateRow[col] || '').trim();
    const dayName = (dayRow[col] || '').trim();
    const countStr = (requestsRow[col] || '').trim();

    // Empty cell = closed day = skip
    if (!countStr || !weekStartStr || !dayName) continue;

    const weekStart = parseAskMyGpDate(weekStartStr);
    if (!weekStart) {
      errors.push(`Column ${col}: couldn't parse week-start date "${weekStartStr}"`);
      continue;
    }

    const dayIdx = WEEKDAYS.indexOf(dayName);
    if (dayIdx < 0) {
      errors.push(`Column ${col}: unknown weekday "${dayName}"`);
      continue;
    }

    // Build the actual date by adding dayIdx days to the week-start (Monday)
    const actualDate = new Date(weekStart);
    actualDate.setDate(actualDate.getDate() + dayIdx);

    const count = parseFloat(countStr);
    if (Number.isNaN(count)) {
      errors.push(`Column ${col} (${formatIsoDate(actualDate)}): non-numeric count "${countStr}"`);
      continue;
    }

    rows.push({
      date: formatIsoDate(actualDate),
      count: Math.round(count),
    });
  }

  // Deduplicate (in case the export has overlapping weeks, e.g. weekly chunks
  // covering the same day twice). Keep the last value seen per date.
  const byDate = new Map();
  for (const r of rows) byDate.set(r.date, r.count);
  const dedupedRows = Array.from(byDate.entries()).map(([date, count]) => ({ date, count }));
  dedupedRows.sort((a, b) => a.date.localeCompare(b.date));

  return {
    rows: dedupedRows,
    errors,
    summary: dedupedRows.length === 0 ? null : {
      count: dedupedRows.length,
      earliest: dedupedRows[0].date,
      latest: dedupedRows[dedupedRows.length - 1].date,
    },
  };
}

/**
 * Parse "2 June 2025" or "2 Jun 2025" style dates.
 */
function parseAskMyGpDate(str) {
  // "2 June 2025" → 2025-06-02
  const m = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthName = m[2].toLowerCase();
  const year = parseInt(m[3], 10);
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthsShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  let monthIdx = months.findIndex(m => m === monthName);
  if (monthIdx < 0) monthIdx = monthsShort.findIndex(m => m === monthName);
  if (monthIdx < 0) return null;
  return new Date(Date.UTC(year, monthIdx, day));
}

function formatIsoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Read a File and decode UTF-16 LE if detected, otherwise UTF-8.
 * Returns a Promise<string>.
 */
export async function readAskMyGpFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Detect UTF-16 LE BOM (0xFF 0xFE)
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  // UTF-16 BE BOM (0xFE 0xFF)
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  // UTF-8 BOM (0xEF 0xBB 0xBF) or no BOM
  return new TextDecoder('utf-8').decode(buffer);
}
