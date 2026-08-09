// lib/site-staffing.js
//
// Per-site clinician staffing for the capacity planning calendar.
// Pure functions, no React.
//
// The rule (user-specified, 2026-08): a clinician counts toward a site's
// staffing number on a date ONLY if they have ROUTINE slots at that site
// that day. Someone merely based there (e.g. touching base before a
// nursing-home round, no routine slots) must not inflate the count - they
// appear in the hover as "based here, no routine slots today" instead.
//
// Sites come from the database (data.roomAllocation.sites - name + colour),
// never hardcoded, so this works for any practice. Which staff groups are
// eligible is a setting (data.capacityStaffing.groups, defaulting to the
// 'clinician' group from huddleSettings.clinicianGroups). Thresholds are
// one number per site (data.capacityStaffing.thresholds[siteName]) - the
// user explicitly chose NOT to vary them by weekday.

import { getCliniciansForDate, getSlotRowsForClinicianDate } from './huddle';

// Fuzzy site<->location match, same spirit as getSiteColour: EMIS location
// strings are free text ("Winscombe Surgery", "Winscombe - Room 4") so we
// match if either contains the other, case-insensitively.
export function locationMatchesSite(location, siteName) {
  if (!location || !siteName) return false;
  const a = String(location).toLowerCase().trim();
  const b = String(siteName).toLowerCase().trim();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// Which CSV clinician names are in the eligible groups. clinicianGroups
// maps group key -> array of CSV names. An empty/missing groups config
// means "no filter" (count everyone) so a practice that has never
// categorised staff still gets numbers rather than zeros.
function buildEligibleSet(huddleSettings, groups) {
  const cg = huddleSettings?.clinicianGroups || {};
  const wanted = Array.isArray(groups) && groups.length ? groups : ['clinician'];
  const anyConfigured = Object.values(cg).some((arr) => Array.isArray(arr) && arr.length > 0);
  if (!anyConfigured) return null; // null = no filtering
  const set = new Set();
  wanted.forEach((g) => (cg[g] || []).forEach((name) => set.add(name)));
  return set;
}

// Main entry. Returns an array (one entry per configured site, in site
// order) of:
//   {
//     site,            // { name, colour }
//     letter,          // first letter of site name, for the box header
//     counted,         // [csvName] - routine slots at this site today
//     basedButOut,     // [csvName] - slots at this site but none routine
//     threshold,       // number | null
//     below,           // true when threshold set and counted < threshold
//   }
// Returns [] when there are no sites configured or no CSV data for the
// date - callers should render nothing in that case.
export function getSiteStaffingForDate(huddleData, csvDateStr, {
  sites = [],
  huddleSettings = {},
  capacityStaffing = {},
} = {}) {
  if (!huddleData || !csvDateStr || !Array.isArray(sites) || sites.length === 0) return [];
  const names = getCliniciansForDate(huddleData, csvDateStr);
  if (!names.length) return [];

  const routineTypes = new Set(huddleSettings?.slotCategories?.routine || []);
  const eligible = buildEligibleSet(huddleSettings, capacityStaffing.groups);
  const thresholds = capacityStaffing.thresholds || {};

  // Pre-pull each clinician's rows once.
  const rowsByName = {};
  for (const name of names) {
    if (eligible && !eligible.has(name)) continue;
    rowsByName[name] = getSlotRowsForClinicianDate(huddleData, csvDateStr, name) || [];
  }

  return sites.map((site) => {
    const counted = [];
    const basedButOut = [];
    for (const [name, rows] of Object.entries(rowsByName)) {
      const here = rows.filter((r) => locationMatchesSite(r.location, site.name));
      if (!here.length) continue;
      const hasRoutine = routineTypes.size > 0 && here.some((r) => routineTypes.has(r.slotType));
      if (hasRoutine) counted.push(name);
      else basedButOut.push(name);
    }
    const raw = thresholds[site.name];
    const threshold = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
    return {
      site,
      letter: (site.name || '?').trim().charAt(0).toUpperCase(),
      counted: counted.sort(),
      basedButOut: basedButOut.sort(),
      threshold,
      below: threshold != null && counted.length < threshold,
    };
  });
}

// Tooltip text for one site box. Explains the warning when below
// threshold (the user asked that a warning is never mysterious).
export function siteStaffingTooltip(entry) {
  const lines = [`${entry.site.name}`];
  if (entry.below) {
    lines.push(`BELOW MINIMUM: ${entry.counted.length} counted, minimum ${entry.threshold}`);
  } else if (entry.threshold != null) {
    lines.push(`${entry.counted.length} counted (minimum ${entry.threshold})`);
  } else {
    lines.push(`${entry.counted.length} counted (no minimum set)`);
  }
  if (entry.counted.length) {
    lines.push('', 'Counted (routine slots here today):');
    entry.counted.forEach((n) => lines.push(`  ${n}`));
  }
  if (entry.basedButOut.length) {
    lines.push('', 'Based here, no routine slots today (not counted):');
    entry.basedButOut.forEach((n) => lines.push(`  ${n}`));
  }
  return lines.join('\n');
}


// Practice-wide total across all sites for one date. Clinicians are
// deduplicated - someone with routine slots at two sites counts ONCE.
// Its own threshold (capacityStaffing.totalThreshold).
export function computeTotalEntry(entries, capacityStaffing = {}) {
  const counted = new Set();
  const based = new Set();
  for (const e of entries) {
    e.counted.forEach((n) => counted.add(n));
    e.basedButOut.forEach((n) => based.add(n));
  }
  counted.forEach((n) => based.delete(n));
  const raw = capacityStaffing.totalThreshold;
  const threshold = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
  return {
    site: { name: 'Whole practice', colour: '#818cf8' },
    letter: 'ALL',
    isTotal: true,
    counted: Array.from(counted).sort(),
    basedButOut: Array.from(based).sort(),
    threshold,
    below: threshold != null && counted.size < threshold,
  };
}
