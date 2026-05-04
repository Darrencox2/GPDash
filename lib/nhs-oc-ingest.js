// Parses NHS England's "Submissions via Online Consultation Systems"
// monthly dataset (originally distributed as a ZIP containing two CSVs:
// north_regions and south_regions).
//
// Input shapes accepted:
//   - { csvText: string }  — already-extracted CSV text (one or both regions
//     concatenated)
//   - { csvFiles: { [filename]: string } }  — multiple CSVs as a map
//
// Output: array of practice records suitable for insertion into
//   the nhs_oc_baseline table.

const TOTAL_COLS = ['CLINICAL', 'ADMIN', 'UNKNOWN_OTHER', 'TOTAL'];

/**
 * Parse a CSV file's text content, calling onRow for each parsed row.
 * Streaming-style so we don't hold 100k+ rows in memory at once.
 */
function streamCsv(csvText, onRow) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return 0;
  const headers = lines[0].split(',').map(h => h.trim());
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (fields.length !== headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j];
    }
    onRow(row);
    count++;
  }
  return count;
}

// Kept for backward compat / unit tests on small data
function parseCsv(csvText) {
  const out = [];
  streamCsv(csvText, (row) => out.push(row));
  return out;
}

/**
 * Parse a single CSV line, respecting double-quoted fields with embedded
 * commas. Doesn't handle escaped quotes (NHS data doesn't use them).
 */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  fields.push(cur);
  return fields;
}

/**
 * Apply one CSV row to an aggregator map, mutating in place.
 */
function applyRowToAgg(byOds, row, monthIso) {
  const ods = row.GP_CODE;
  if (!ods) return;
  let agg = byOds.get(ods);
  if (!agg) {
    agg = {
      ods_code: ods,
      month: monthIso,
      practice_name: row.GP_NAME || null,
      supplier: row.SUPPLIER || null,
      pcn_code: row.PCN_CODE || null,
      pcn_name: row.PCN_NAME || null,
      icb_code: row.ICB_CODE || null,
      icb_name: row.ICB_NAME || null,
      region_code: row.REGION_CODE || null,
      region_name: row.REGION_NAME || null,
      total: 0,
      clinical: 0,
      admin: 0,
      unknown_other: 0,
      days: new Set(),
      // distinct dates seen per weekday — used to compute "average per Monday"
      days_per_weekday: { Mon: new Set(), Tue: new Set(), Wed: new Set(), Thu: new Set(), Fri: new Set(), Sat: new Set(), Sun: new Set() },
      by_weekday: {},
      by_hour: {},
    };
    byOds.set(ods, agg);
  }
  const total = toInt(row.TOTAL);
  agg.total += total;
  agg.clinical += toInt(row.CLINICAL);
  agg.admin += toInt(row.ADMIN);
  agg.unknown_other += toInt(row.UNKNOWN_OTHER);
  if (row.DATE) agg.days.add(row.DATE);
  const wd = (row.WEEKDAY || '').slice(0, 3);
  if (wd) {
    agg.by_weekday[wd] = (agg.by_weekday[wd] || 0) + total;
    if (row.DATE && agg.days_per_weekday[wd]) agg.days_per_weekday[wd].add(row.DATE);
  }
  const hour = (row.SUBMISSION_TIME || '').slice(0, 2);
  if (hour) {
    const hNum = parseInt(hour, 10);
    if (!Number.isNaN(hNum)) {
      const h = String(hNum);
      agg.by_hour[h] = (agg.by_hour[h] || 0) + total;
    }
  }
}

function finalizeAggMap(byOds) {
  return Array.from(byOds.values()).map(a => {
    const days_per_weekday_count = {};
    for (const wd of Object.keys(a.days_per_weekday)) {
      days_per_weekday_count[wd] = a.days_per_weekday[wd].size;
    }
    return {
      ods_code: a.ods_code,
      month: a.month,
      practice_name: a.practice_name,
      supplier: a.supplier,
      pcn_code: a.pcn_code,
      pcn_name: a.pcn_name,
      icb_code: a.icb_code,
      icb_name: a.icb_name,
      region_code: a.region_code,
      region_name: a.region_name,
      total: a.total,
      days_with_data: a.days.size,
      clinical: a.clinical,
      admin: a.admin,
      unknown_other: a.unknown_other,
      by_weekday: a.by_weekday,
      by_hour: a.by_hour,
      days_per_weekday: days_per_weekday_count,
    };
  });
}

// Backward-compat wrapper for tests on small inputs
function aggregateRows(rows, monthIso) {
  const byOds = new Map();
  for (const row of rows) applyRowToAgg(byOds, row, monthIso);
  return finalizeAggMap(byOds);
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Main entry: parse one or more CSV strings into per-practice rows.
 * Streaming aggregation — never holds all rows in memory at once.
 *
 * @param {string} monthIso — '2026-03-01' (month-start date)
 * @param {string|string[]} csvTextOrTexts — CSV file content(s)
 * @returns {{ rows: object[], monthIso: string, totalRowsParsed: number }}
 */
export function parseNhsOcBaseline(monthIso, csvTextOrTexts) {
  const inputs = Array.isArray(csvTextOrTexts) ? csvTextOrTexts : [csvTextOrTexts];
  const byOds = new Map();
  let totalRowsParsed = 0;
  for (const text of inputs) {
    if (!text) continue;
    totalRowsParsed += streamCsv(text, (row) => applyRowToAgg(byOds, row, monthIso));
  }
  return {
    rows: finalizeAggMap(byOds),
    monthIso,
    totalRowsParsed,
  };
}

// Exported for tests
export { parseCsv, aggregateRows };
