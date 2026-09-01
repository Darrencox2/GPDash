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
import { matchesStaffMember } from './data';

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

// The routine slot signal. slotCategories.routine is the designed home,
// but a live practice was found with slotCategories null - their routine
// definition lives entirely in the saved routine slot FILTER. Union both
// so the staffing count works wherever the practice keeps its config.
export function getRoutineTypeSet(huddleSettings) {
  const set = new Set(huddleSettings?.slotCategories?.routine || []);
  const filt = huddleSettings?.savedSlotFilters?.routine || {};
  for (const [slotType, on] of Object.entries(filt)) {
    if (on === true) set.add(slotType);
  }
  return set;
}

// The urgent slot signal - same union logic as routine.
export function getUrgentTypeSet(huddleSettings) {
  const set = new Set(huddleSettings?.slotCategories?.urgent || []);
  const filt = huddleSettings?.savedSlotFilters?.urgent || {};
  for (const [slotType, on] of Object.entries(filt)) {
    if (on === true) set.add(slotType);
  }
  return set;
}

// Which session a CSV row belongs to. EMIS row times are session buckets
// (Before 12:59 / After or At 13:00); real clock times are rare, so a
// clocked time at or after 18:30 is evening, otherwise the bucket decides.
export function rowSessionOf(time) {
  const t = String(time || '').toLowerCase();
  if (t.includes('before')) return 'am';
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (m && !t.includes('after')) {
    const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (mins >= 18 * 60 + 30) return 'eve';
    if (mins < 13 * 60) return 'am';
  }
  return 'pm';
}

// One capacity state per box - the fill colour means ONLY capacity now;
// site identity moved to an edge stripe. Tiers: short (below minimum,
// shows the shortfall), tight (exactly on minimum - fragile), ok
// (headroom), none (no minimum configured).
export function staffingState(count, threshold) {
  if (threshold == null) return 'none';
  if (count < threshold) return 'short';
  if (count === threshold) return 'tight';
  return 'ok';
}

export const STATE_COLOURS = {
  short: { bg: 'rgba(239,68,68,0.20)',  bd: '#ef444480', fg: '#fca5a5' },
  tight: { bg: 'rgba(245,158,11,0.18)', bd: '#f59e0b70', fg: '#fbbf24' },
  ok:    { bg: 'rgba(16,185,129,0.14)', bd: '#10b98150', fg: '#34d399' },
  none:  { bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.14)', fg: '#cbd5e1' },
};

// Initials for week-view chips: prefer the register name (Darren Cox ->
// DC), fall back to the CSV surname-first form (COX, Darren (Dr) -> DC).
export function initialsFor(csvName, clinicians) {
  const match = (clinicians || []).find((c) => matchesStaffMember(csvName, c));
  if (match?.name) {
    const parts = String(match.name).trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  const m = String(csvName || '').match(/^([A-Za-z-]+),\s*([A-Za-z-]+)/);
  if (m) return (m[2][0] + m[1][0]).toUpperCase();
  return String(csvName || '?').slice(0, 2).toUpperCase();
}

// Role classification for "who counts". Uses the staff REGISTER roles
// (already curated by the practice) rather than a separate group config.
export function classifyStaffRole(role) {
  const r = String(role || '').toLowerCase();
  if (/hca|healthcare assistant|phleb/.test(r)) return 'hca';
  if (/nurse|matron|anp|acp/.test(r)) return 'nursing';
  // "Associate Partner" is a GP role here; without the explicit match it
  // fell to 'other' and a partner-track GP vanished from GP-only counts.
  if (/gp|doctor|registrar|associate partner/.test(r)) return 'gp';
  return 'other';
}

export const STAFF_GROUP_LABELS = { gp: 'GPs', nursing: 'Nursing', hca: 'HCAs', other: 'Other / unmatched' };

// Which CSV names count, judged from the staff register: match each CSV
// name to a register clinician (matchesStaffMember) and classify their
// role. includeGroups defaults to GPs only - the practice can widen it in
// the staffing panel. Unmatched CSV names classify as 'other'.
function nameIncluded(csvName, clinicians, includeGroups) {
  const match = (clinicians || []).find((c) => matchesStaffMember(csvName, c));
  const group = classifyStaffRole(match?.role);
  return includeGroups.includes(group);
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
  clinicians = [],
} = {}) {
  if (!huddleData || !csvDateStr || !Array.isArray(sites) || sites.length === 0) return [];
  const names = getCliniciansForDate(huddleData, csvDateStr);
  if (!names.length) return [];

  const routineTypes = getRoutineTypeSet(huddleSettings);
  const includeGroups = Array.isArray(capacityStaffing.groups) && capacityStaffing.groups.length
    ? capacityStaffing.groups : ['gp'];
  const thresholds = capacityStaffing.thresholds || {};

  // Pre-pull each eligible clinician's rows once.
  const rowsByName = {};
  for (const name of names) {
    if (!nameIncluded(name, clinicians, includeGroups)) continue;
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
    // Per-session offering counts: a clinician staffs a session at this
    // site only if they have routine slots here IN that session. The box
    // colour is driven by the WORST session with any activity here - a
    // 5-strong morning does not excuse a 1-person afternoon.
    const bySession = { am: new Set(), pm: new Set(), eve: new Set() };
    const anyRows = { am: false, pm: false, eve: false };
    for (const [name, rows] of Object.entries(rowsByName)) {
      for (const r of rows) {
        if (!locationMatchesSite(r.location, site.name)) continue;
        const sess = rowSessionOf(r.time);
        anyRows[sess] = true;
        if (routineTypes.size > 0 && routineTypes.has(r.slotType)) bySession[sess].add(name);
      }
    }
    const sessions = {};
    for (const k of ['am', 'pm', 'eve']) {
      if (anyRows[k]) sessions[k] = bySession[k].size;
    }
    let worst = null;
    for (const k of Object.keys(sessions)) {
      if (!worst || sessions[k] < sessions[worst]) worst = k;
    }
    const worstCount = worst ? sessions[worst] : counted.length;
    return {
      site,
      letter: (site.name || '?').trim().charAt(0).toUpperCase(),
      counted: counted.sort(),
      basedButOut: basedButOut.sort(),
      threshold,
      below: threshold != null && worstCount < threshold,
      sessions,
      worstSession: worst,
      worstCount,
      state: staffingState(worstCount, threshold),
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
    state: staffingState(counted.size, threshold),
  };
}

// Full per-session detail for the WEEK view. For each site with any
// activity on the date: the clinicians offering slots in each session,
// their urgent and routine slot counts, and who is duty. The capacity
// measure is deliberately slot-derived, not rota-derived: how many GPs
// are actually offering appointments, which is the question a week view
// exists to answer.
export function getWeekDayDetail(huddleData, csvDateStr, {
  sites = [],
  huddleSettings = {},
  capacityStaffing = {},
  clinicians = [],
  dutyByName = {},
  includeEmpty = false,
} = {}) {
  if (!huddleData || !csvDateStr || !sites.length) return [];
  const names = getCliniciansForDate(huddleData, csvDateStr);
  if (!names.length) return [];
  const routineTypes = getRoutineTypeSet(huddleSettings);
  const urgentTypes = getUrgentTypeSet(huddleSettings);
  const includeGroups = Array.isArray(capacityStaffing.groups) && capacityStaffing.groups.length
    ? capacityStaffing.groups : ['gp'];
  const thresholds = capacityStaffing.thresholds || {};
  const rowsByName = {};
  for (const name of names) {
    if (!nameIncluded(name, clinicians, includeGroups)) continue;
    rowsByName[name] = getSlotRowsForClinicianDate(huddleData, csvDateStr, name) || [];
  }
  const out = [];
  for (const site of sites) {
    const sessions = {};
    for (const [name, rows] of Object.entries(rowsByName)) {
      const here = rows.filter((r) => locationMatchesSite(r.location, site.name));
      if (!here.length) continue;
      for (const r of here) {
        const sess = rowSessionOf(r.time);
        if (!sessions[sess]) sessions[sess] = { byName: {}, urgent: 0, routine: 0 };
        const b = sessions[sess];
        if (!b.byName[name]) b.byName[name] = { name, initials: initialsFor(name, clinicians), urgent: 0, routine: 0, other: 0 };
        if (urgentTypes.has(r.slotType)) { b.byName[name].urgent += 1; b.urgent += 1; }
        else if (routineTypes.has(r.slotType)) { b.byName[name].routine += 1; b.routine += 1; }
        else b.byName[name].other += 1;
      }
    }
    const keys = ['am', 'pm', 'eve'].filter((k) => sessions[k]);
    // A site with nobody in it used to vanish from the day entirely, so
    // every day showed a different set of sites in different positions
    // and the week could not be read across. includeEmpty keeps the row
    // in place, empty, so the days line up.
    if (!keys.length && !includeEmpty) continue;
    const raw = thresholds[site.name];
    const threshold = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
    const packed = {};
    for (const k of keys) {
      const b = sessions[k];
      const clins = Object.values(b.byName).map((c) => ({
        ...c,
        offering: c.urgent + c.routine > 0,
        duty: (dutyByName[k === 'eve' ? 'pm' : k] || null) === c.name,
      })).sort((x, y) => (y.duty ? 1 : 0) - (x.duty ? 1 : 0) || x.initials.localeCompare(y.initials));
      const offering = clins.filter((c) => c.offering).length;
      packed[k] = { clins, urgent: b.urgent, routine: b.routine, offering, state: staffingState(offering, threshold) };
    }
    out.push({ site, threshold, sessions: packed, empty: keys.length === 0 });
  }
  return out;
}
