// Workload report engine — pure functions, no React.
//
// Turns the parsed huddle CSV into a flat "fact table" of slot records,
// then runs flexible group-by / numerator-over-denominator reports over
// it. This is what powers the customisable reporting tool: the user picks
// a measure (a numerator filter, optionally divided by a denominator
// filter), a dimension to group by, a date range, and a chart type, and
// the engine produces the grouped aggregates.
//
// FACT GRAIN: one fact = one (date, session, clinician, slotType, status,
// location) bucket with a count. This is the richest grain the CSV gives
// us (huddleData.slotRows), so every slot-based measure can be expressed
// as a filtered sum over facts.

import { matchesStaffMember } from './data';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Slot category classification ────────────────────────────────────────
// urgent  = slot type is in the practice's saved "urgent" filter
// routine = slot type is in the saved "routine" filter
// other   = neither (admin, breaks, home visits, etc)
// If a type somehow appears in both, urgent wins.
function buildCategoriser(hs) {
  const urg = hs?.savedSlotFilters?.urgent || null;
  const rout = hs?.savedSlotFilters?.routine || null;
  return (slotType) => {
    if (urg && urg[slotType]) return 'urgent';
    if (rout && rout[slotType]) return 'routine';
    return 'other';
  };
}

// AM/PM from the EMIS time string — mirrors the parser's own logic so the
// session split here matches what the rest of the app shows.
function sessionFromTime(time) {
  if (!time) return 'am';
  const t = time.toLowerCase();
  if (t.includes('before')) return 'am';
  if (t.includes('after')) return 'pm';
  const m = time.match(/(\d{1,2}):/);
  if (m) return parseInt(m[1]) >= 13 ? 'pm' : 'am';
  return 'am';
}

// Parse "29-May-2026" → Date (local midnight). Returns null on failure.
function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const mo = months[m[2].toLowerCase()];
  if (mo === undefined) return null;
  const d = new Date(parseInt(m[3]), mo, parseInt(m[1]));
  d.setHours(0,0,0,0);
  return d;
}

// Monday of the week containing `date`.
function weekStart(date) {
  const dow = date.getDay();
  const off = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(date);
  mon.setDate(date.getDate() + off);
  mon.setHours(0,0,0,0);
  return mon;
}

// ── Fact extraction ─────────────────────────────────────────────────────
// Returns { facts, locations, slotTypes, dateMin, dateMax }.
// `clinicians` is the practice clinician list (with id, name, role).
export function buildFacts(huddleData, clinicians, hs) {
  const empty = { facts: [], locations: [], slotTypes: [], dateMin: null, dateMax: null };
  if (!huddleData?.slotRows || !huddleData?.clinicians) return empty;
  const categorise = buildCategoriser(hs);
  const csvClin = huddleData.clinicians;       // index → CSV name
  const facts = [];
  const locationSet = new Set();
  const slotTypeSet = new Set();
  let dateMin = null, dateMax = null;

  // Pre-resolve each CSV clinician index → practice clinician (id, name, role).
  const resolved = csvClin.map(name => {
    const matched = (clinicians || []).find(tc => matchesStaffMember(name, tc));
    return matched
      ? { id: matched.id, name: matched.name, role: matched.role || 'Unspecified', matched: true }
      : { id: `csv:${name}`, name: name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name, role: 'Unspecified', matched: false };
  });

  Object.entries(huddleData.slotRows).forEach(([dateStr, byIdx]) => {
    const date = parseDateStr(dateStr);
    if (!date) return;
    if (date.getDay() === 0 || date.getDay() === 6) return; // skip weekends
    if (!dateMin || date < dateMin) dateMin = date;
    if (!dateMax || date > dateMax) dateMax = date;
    const ws = weekStart(date);
    const weekLabel = `${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`;
    const dow = date.getDay();

    Object.entries(byIdx).forEach(([idxStr, rows]) => {
      const idx = parseInt(idxStr);
      const clin = resolved[idx];
      if (!clin) return;
      (rows || []).forEach(r => {
        if (!r || (r.count || 0) <= 0) return;
        if (r.status === 'blocked') return;   // blocked = unavailable, not a slot offering
        const session = sessionFromTime(r.time);
        const category = categorise(r.slotType);
        const loc = r.location || 'Unknown';
        locationSet.add(loc);
        slotTypeSet.add(r.slotType);
        facts.push({
          iso: `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,
          dateMs: date.getTime(),
          weekStartMs: ws.getTime(),
          weekLabel,
          dow,
          dowName: DAY_NAMES[dow],
          dowShort: DAY_SHORT[dow],
          session,
          clinicianId: clin.id,
          clinicianName: clin.name,
          role: clin.role,
          location: loc,
          slotType: r.slotType,
          category,
          status: r.status,          // available | embargoed | booked
          count: r.count,
        });
      });
    });
  });

  return {
    facts,
    locations: Array.from(locationSet).sort(),
    slotTypes: Array.from(slotTypeSet).sort(),
    dateMin, dateMax,
  };
}

// ── Filtering ───────────────────────────────────────────────────────────
// A measure filter is { statuses, categories, slotTypes, locations, sessions }
// where each is either null (no constraint) or an array of allowed values.
function matchFilter(fact, f) {
  if (!f) return true;
  if (f.statuses && f.statuses.length && !f.statuses.includes(fact.status)) return false;
  if (f.categories && f.categories.length && !f.categories.includes(fact.category)) return false;
  if (f.slotTypes && f.slotTypes.length && !f.slotTypes.includes(fact.slotType)) return false;
  if (f.locations && f.locations.length && !f.locations.includes(fact.location)) return false;
  if (f.sessions && f.sessions.length && !f.sessions.includes(fact.session)) return false;
  return true;
}

// Date-range predicate. `range` is one of all|last8|next8|last8next8.
function dateRangePredicate(range) {
  const today = new Date(); today.setHours(0,0,0,0);
  const back = today.getTime() - 56 * 86400000;
  const fwd = today.getTime() + 56 * 86400000;
  const t = today.getTime();
  switch (range) {
    case 'last8':      return ms => ms >= back && ms < t;
    case 'next8':      return ms => ms >= t && ms <= fwd;
    case 'last8next8': return ms => ms >= back && ms <= fwd;
    case 'all':
    default:           return () => true;
  }
}

// ── Group-key extraction ────────────────────────────────────────────────
function groupKeyer(dimension) {
  switch (dimension) {
    case 'clinician': return f => ({ key: f.clinicianId, label: f.clinicianName });
    case 'location':  return f => ({ key: f.location, label: f.location });
    case 'slotType':  return f => ({ key: f.slotType, label: f.slotType });
    case 'category':  return f => ({ key: f.category, label: f.category.charAt(0).toUpperCase()+f.category.slice(1) });
    case 'role':      return f => ({ key: f.role, label: f.role });
    case 'session':   return f => ({ key: f.session, label: f.session.toUpperCase() });
    case 'dow':       return f => ({ key: String(f.dow), label: f.dowName, order: f.dow === 0 ? 7 : f.dow });
    case 'week':      return f => ({ key: String(f.weekStartMs), label: `w/c ${f.weekLabel}`, order: f.weekStartMs });
    default:          return f => ({ key: 'all', label: 'All' });
  }
}

// Whether a dimension is naturally time-ordered (for trend charts).
export function isTimeDimension(dim) {
  return dim === 'week' || dim === 'dow';
}

// ── Main report runner ──────────────────────────────────────────────────
// config = {
//   num:   filter,          // numerator
//   denom: filter | null,   // denominator (null → raw count)
//   groupBy: dimension,
//   range: 'all'|'last8'|'next8'|'last8next8',
// }
// Returns { groups: [{key,label,order,numerator,denominator,value}],
//           totalNum, totalDenom, totalValue, isRatio }.
export function runReport(facts, config) {
  const { num, denom, groupBy, range } = config;
  const inRange = dateRangePredicate(range);
  const keyer = groupKeyer(groupBy);
  const isRatio = !!denom;

  const map = {};
  let totalNum = 0, totalDenom = 0;

  for (const fact of facts) {
    if (!inRange(fact.dateMs)) continue;
    const inNum = matchFilter(fact, num);
    const inDenom = denom ? matchFilter(fact, denom) : false;
    if (!inNum && !inDenom) continue;
    const { key, label, order } = keyer(fact);
    if (!map[key]) map[key] = { key, label, order: order ?? null, numerator: 0, denominator: 0 };
    if (inNum) { map[key].numerator += fact.count; totalNum += fact.count; }
    if (inDenom) { map[key].denominator += fact.count; totalDenom += fact.count; }
  }

  let groups = Object.values(map).map(g => ({
    ...g,
    value: isRatio ? (g.denominator > 0 ? (g.numerator / g.denominator) * 100 : 0) : g.numerator,
  }));

  // Sort: time dimensions chronologically, everything else by value desc.
  if (isTimeDimension(groupBy)) {
    groups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } else {
    groups.sort((a, b) => b.value - a.value);
  }

  const totalValue = isRatio ? (totalDenom > 0 ? (totalNum / totalDenom) * 100 : 0) : totalNum;
  return { groups, totalNum, totalDenom, totalValue, isRatio };
}

// ── Human-readable measure label ────────────────────────────────────────
const STATUS_LABEL = { available: 'available', embargoed: 'embargoed', booked: 'booked' };
const CAT_LABEL = { urgent: 'urgent', routine: 'routine', other: 'other' };

function describeFilter(f) {
  if (!f) return 'all slots';
  const parts = [];
  if (f.statuses && f.statuses.length) parts.push(f.statuses.map(s => STATUS_LABEL[s] || s).join('/'));
  if (f.categories && f.categories.length) parts.push(f.categories.map(c => CAT_LABEL[c] || c).join('/'));
  const body = parts.length ? parts.join(' ') : 'all';
  return `${body} slots`;
}

export function describeMeasure(config) {
  const numDesc = describeFilter(config.num);
  if (config.denom) {
    return `${numDesc} ÷ ${describeFilter(config.denom)} (%)`;
  }
  return numDesc;
}

// ── Presets ─────────────────────────────────────────────────────────────
// One-click starting points. Each returns a full config.
export const PRESETS = [
  {
    id: 'offered-by-clinician',
    label: 'Slots offered by clinician',
    config: { num: { statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'clinician', range: 'last8next8', chart: 'bars' },
  },
  {
    id: 'fill-by-clinician',
    label: 'Fill rate by clinician',
    config: { num: { statuses: ['booked'] }, denom: { statuses: ['available','embargoed','booked'] }, groupBy: 'clinician', range: 'last8', chart: 'bars' },
  },
  {
    id: 'urgent-by-week',
    label: 'Urgent slots by week',
    config: { num: { categories: ['urgent'], statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'week', range: 'last8next8', chart: 'trend' },
  },
  {
    id: 'fill-by-week',
    label: 'Fill rate by week',
    config: { num: { statuses: ['booked'] }, denom: { statuses: ['available','embargoed','booked'] }, groupBy: 'week', range: 'last8next8', chart: 'trend' },
  },
  {
    id: 'booked-by-dow',
    label: 'Booked slots by day of week',
    config: { num: { statuses: ['booked'] }, denom: null, groupBy: 'dow', range: 'last8', chart: 'bars' },
  },
  {
    id: 'offered-by-location',
    label: 'Slots offered by site',
    config: { num: { statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'location', range: 'last8next8', chart: 'bars' },
  },
  {
    id: 'urgent-share-by-clinician',
    label: 'Urgent share by clinician',
    config: { num: { categories: ['urgent'], statuses: ['available','embargoed','booked'] }, denom: { statuses: ['available','embargoed','booked'] }, groupBy: 'clinician', range: 'last8next8', chart: 'bars' },
  },
  {
    id: 'category-by-week',
    label: 'Routine slots by week',
    config: { num: { categories: ['routine'], statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'week', range: 'last8next8', chart: 'trend' },
  },
];

export const GROUP_BY_OPTIONS = [
  { id: 'clinician', label: 'Clinician' },
  { id: 'location', label: 'Site / location' },
  { id: 'slotType', label: 'Slot type' },
  { id: 'category', label: 'Category (urgent/routine)' },
  { id: 'role', label: 'Role' },
  { id: 'session', label: 'Session (AM/PM)' },
  { id: 'dow', label: 'Day of week' },
  { id: 'week', label: 'Week' },
];

export const RANGE_OPTIONS = [
  { id: 'last8', label: 'Last 8 weeks' },
  { id: 'next8', label: 'Next 8 weeks' },
  { id: 'last8next8', label: 'Last 8 + next 8' },
  { id: 'all', label: 'All data' },
];
