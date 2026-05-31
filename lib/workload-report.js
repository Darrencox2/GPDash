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
import { getHuddleCapacity, getDutyDoctor } from './huddle';

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
      ? { id: matched.id, name: matched.name, role: matched.role || 'Unspecified', system: false }
      : { id: `csv:${name}`, name: name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name, role: 'Unspecified', system: true };
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
          isSystem: clin.system,
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

// ── Session-grain fact extraction ───────────────────────────────────────
// One fact per (date, session, clinician-who-worked). Carries flags for
// whether that clinician was the duty doctor or the support doctor that
// session. This is what makes the duty & support balance reports possible
// inside the builder: "duty sessions ÷ sessions worked", grouped by
// clinician, is the classic duty-load chart.
//
// The support-doctor heuristic mirrors the original Workload Audit logic:
// the highest urgent-slot provider that session, excluding the duty
// doctor, provided they have a clear lead (>=5 slots and >=2 ahead of the
// next). The Winscombe-specific "balson" exclusion is preserved so the
// numbers match the classic view for that practice; for a cleaner
// multi-practice rule this should eventually key off a per-clinician
// "counts as a doctor" flag rather than a name.
export function buildSessionFacts(huddleData, clinicians, hs) {
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const urgentOv = hs?.savedSlotFilters?.urgent || null;
  const facts = [];
  if (!huddleData?.dates) return { facts, hasDuty: !!hasDuty };

  const clinList = clinicians || [];
  const resolve = (csvName) => {
    const m = clinList.find(tc => matchesStaffMember(csvName, tc));
    return m
      ? { id: m.id, name: m.name, role: m.role || 'Unspecified', system: false }
      : { id: `csv:${csvName}`, name: csvName.replace(/\s*\([^)]*\)\s*$/, '').trim() || csvName, role: 'Unspecified', system: true };
  };

  huddleData.dates.forEach(dateStr => {
    const date = parseDateStr(dateStr);
    if (!date) return;
    if (date.getDay() === 0 || date.getDay() === 6) return;
    const ws = weekStart(date);
    const weekLabel = `${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`;
    const dow = date.getDay();
    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

    const allCap = getHuddleCapacity(huddleData, dateStr, hs);
    const urgentCap = urgentOv ? getHuddleCapacity(huddleData, dateStr, hs, urgentOv) : null;

    ['am','pm'].forEach(session => {
      const present = (allCap?.[session]?.byClinician || [])
        .map(c => {
          const r = resolve(c.name);
          const total = (c.available || 0) + (c.embargoed || 0) + (c.booked || 0);
          return r && total > 0 ? { ...c, resolved: r, total } : null;
        })
        .filter(Boolean);
      if (present.length === 0) return;

      // Duty + support determination
      let dutyId = null, supportId = null;
      if (hasDuty) {
        const dutyDoc = getDutyDoctor(huddleData, dateStr, session, dutySlots, clinList);
        if (dutyDoc) {
          const m = resolve(dutyDoc.name);
          if (m) dutyId = m.id;
          const urgentPresent = (urgentCap?.[session]?.byClinician || [])
            .map(c => {
              const r = resolve(c.name);
              const total = (c.available || 0) + (c.embargoed || 0) + (c.booked || 0);
              return r && total > 0 ? { ...c, resolved: r, total } : null;
            })
            .filter(Boolean);
          const afterDuty = urgentPresent.filter(c =>
            c.resolved.id !== dutyId &&
            !c.resolved.system &&
            !c.resolved.name.toLowerCase().includes('balson')
          );
          if (afterDuty.length > 0) {
            const sorted = [...afterDuty].sort((a,b) => b.total - a.total);
            const top = sorted[0], second = sorted[1] || null;
            if (top.total >= 5 && top.total >= ((second?.total || 0) + 2)) supportId = top.resolved.id;
          }
        }
      }

      present.forEach(c => {
        facts.push({
          iso, dateMs: date.getTime(), weekStartMs: ws.getTime(), weekLabel,
          dow, dowName: DAY_NAMES[dow], dowShort: DAY_SHORT[dow],
          session,
          clinicianId: c.resolved.id,
          clinicianName: c.resolved.name,
          role: c.resolved.role,
          isSystem: c.resolved.system,
          isDuty: c.resolved.id === dutyId,
          isSupport: c.resolved.id === supportId,
          count: 1,
        });
      });
    });
  });

  return { facts, hasDuty: !!hasDuty };
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

// Session-grain filter. `kinds` is a subset of worked|duty|support. A fact
// matches if: no kinds set (any worked session counts); or kinds includes
// 'worked' (all worked sessions); or the fact's duty/support flag is in
// kinds. `sessions` optionally restricts to am/pm.
function matchSessionFilter(fact, f) {
  if (!f) return true;
  if (f.sessions && f.sessions.length && !f.sessions.includes(fact.session)) return false;
  if (!f.kinds || f.kinds.length === 0) return true;
  if (f.kinds.includes('worked')) return true;
  if (f.kinds.includes('duty') && fact.isDuty) return true;
  if (f.kinds.includes('support') && fact.isSupport) return true;
  return false;
}

// Global filter — scopes the whole dataset before any measure matching.
// Same shape works for both grains (session facts simply lack location /
// slotType, so those keys are ignored).
function matchGlobal(fact, gf) {
  if (!gf) return true;
  if (gf.clinicianIds && gf.clinicianIds.length && !gf.clinicianIds.includes(fact.clinicianId)) return false;
  if (gf.roles && gf.roles.length && !gf.roles.includes(fact.role)) return false;
  if (gf.sessions && gf.sessions.length && !gf.sessions.includes(fact.session)) return false;
  if (gf.locations && gf.locations.length && fact.location !== undefined && !gf.locations.includes(fact.location)) return false;
  if (gf.slotTypes && gf.slotTypes.length && fact.slotType !== undefined && !gf.slotTypes.includes(fact.slotType)) return false;
  return true;
}

function hasAnyGlobalFilter(gf) {
  if (!gf) return false;
  return ['clinicianIds','roles','sessions','locations','slotTypes'].some(k => gf[k] && gf[k].length);
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
    case 'status':    return f => ({ key: f.status, label: f.status.charAt(0).toUpperCase()+f.status.slice(1), order: f.status === 'available' ? 0 : f.status === 'embargoed' ? 1 : 2 });
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
// config = {
//   grain, num, denom, groupBy, range,
//   splitBy?      — optional second dimension → multi-series result
//   globalFilter? — { clinicianIds, roles, sessions, locations, slotTypes }
//   excludeSystem?— drop TRIAGE/CCAS/unmatched pseudo-clinicians (default via caller)
//   sort?         — 'value' | 'alpha' | 'time'
//   topN?         — keep only the top N groups (ignored for time dimensions)
// }
// Returns { groups, series, hasSplit, totalNum, totalDenom, totalValue, isRatio }.
// Each group has { key, label, order, numerator, denominator, value, cells }
// where cells = { [seriesKey]: { numerator, denominator, value } }.
export function runReport(facts, config) {
  const { num, denom, groupBy, splitBy, range, grain, globalFilter, excludeSystem, sort, topN } = config;
  const inRange = dateRangePredicate(range);
  const keyer = groupKeyer(groupBy);
  const splitKeyer = (splitBy && splitBy !== 'none') ? groupKeyer(splitBy) : null;
  const isRatio = !!denom;
  const match = grain === 'sessions' ? matchSessionFilter : matchFilter;

  const groups = {};
  const seriesMeta = {};
  let totalNum = 0, totalDenom = 0;

  for (const fact of facts) {
    if (!inRange(fact.dateMs)) continue;
    if (excludeSystem && fact.isSystem) continue;
    if (!matchGlobal(fact, globalFilter)) continue;
    const inNum = match(fact, num);
    const inDenom = denom ? match(fact, denom) : false;
    if (!inNum && !inDenom) continue;

    const gk = keyer(fact);
    if (!groups[gk.key]) groups[gk.key] = { key: gk.key, label: gk.label, order: gk.order ?? null, series: {}, numerator: 0, denominator: 0 };
    const g = groups[gk.key];

    let skKey = '_all';
    if (splitKeyer) {
      const sk = splitKeyer(fact);
      skKey = sk.key;
      if (!seriesMeta[skKey]) seriesMeta[skKey] = { key: sk.key, label: sk.label, order: sk.order ?? null, value: 0 };
    }
    if (!g.series[skKey]) g.series[skKey] = { numerator: 0, denominator: 0 };
    if (inNum) { g.series[skKey].numerator += fact.count; g.numerator += fact.count; totalNum += fact.count; if (seriesMeta[skKey]) seriesMeta[skKey].value += fact.count; }
    if (inDenom) { g.series[skKey].denominator += fact.count; g.denominator += fact.count; totalDenom += fact.count; }
  }

  // Series list (single pseudo-series when no split).
  let series;
  if (splitKeyer) {
    series = Object.values(seriesMeta);
    if (isTimeDimension(splitBy)) series.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    else series.sort((a, b) => b.value - a.value);
  } else {
    series = [{ key: '_all', label: '' }];
  }

  let groupArr = Object.values(groups).map(g => {
    const cells = {};
    for (const s of series) {
      const c = g.series[s.key] || { numerator: 0, denominator: 0 };
      cells[s.key] = { numerator: c.numerator, denominator: c.denominator, value: isRatio ? (c.denominator > 0 ? (c.numerator / c.denominator) * 100 : 0) : c.numerator };
    }
    return { key: g.key, label: g.label, order: g.order, numerator: g.numerator, denominator: g.denominator, cells, value: isRatio ? (g.denominator > 0 ? (g.numerator / g.denominator) * 100 : 0) : g.numerator };
  });

  // Sort.
  const timeGroup = isTimeDimension(groupBy);
  if (timeGroup || sort === 'time') groupArr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  else if (sort === 'alpha') groupArr.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  else groupArr.sort((a, b) => b.value - a.value);

  // Top-N (not for time dimensions — you want the whole timeline).
  if (topN && topN > 0 && !timeGroup) groupArr = groupArr.slice(0, topN);

  const totalValue = isRatio ? (totalDenom > 0 ? (totalNum / totalDenom) * 100 : 0) : totalNum;
  return { groups: groupArr, series, hasSplit: !!splitKeyer, totalNum, totalDenom, totalValue, isRatio };
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

const KIND_LABEL = { worked: 'sessions worked', duty: 'duty sessions', support: 'support sessions' };
function describeSessionFilter(f) {
  if (!f || !f.kinds || f.kinds.length === 0) return 'sessions worked';
  const k = f.kinds.includes('worked') ? 'worked' : f.kinds[0];
  let label = KIND_LABEL[k] || 'sessions';
  if (f.sessions && f.sessions.length === 1) label += ` (${f.sessions[0].toUpperCase()})`;
  return label;
}

export function describeMeasure(config) {
  const isSession = config.grain === 'sessions';
  const desc = isSession ? describeSessionFilter : describeFilter;
  const numDesc = desc(config.num);
  if (config.denom) {
    return `${numDesc} ÷ ${desc(config.denom)} (%)`;
  }
  return numDesc;
}

// ── Presets ─────────────────────────────────────────────────────────────
// One-click starting points, grouped. Each config is complete and drops
// straight into the builder. Session-grain presets recreate the duty &
// support balance charts.
export const PRESET_GROUPS = [
  {
    group: 'Duty & support',
    presets: [
      { id: 'duty-load', label: 'Duty load by clinician',
        config: { grain: 'sessions', num: { kinds: ['duty'] }, denom: { kinds: ['worked'] }, groupBy: 'clinician', range: 'last8next8', chart: 'bars' } },
      { id: 'support-load', label: 'Support load by clinician',
        config: { grain: 'sessions', num: { kinds: ['support'] }, denom: { kinds: ['worked'] }, groupBy: 'clinician', range: 'last8next8', chart: 'bars' } },
      { id: 'sessions-worked', label: 'Sessions worked by clinician',
        config: { grain: 'sessions', num: { kinds: ['worked'] }, denom: null, groupBy: 'clinician', range: 'last8next8', chart: 'bars' } },
      { id: 'duty-by-week', label: 'Duty sessions by week',
        config: { grain: 'sessions', num: { kinds: ['duty'] }, denom: null, groupBy: 'week', range: 'last8next8', chart: 'trend' } },
    ],
  },
  {
    group: 'Slots',
    presets: [
      { id: 'offered-by-clinician', label: 'Slots offered by clinician',
        config: { grain: 'slots', num: { statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'clinician', range: 'last8next8', chart: 'bars' } },
      { id: 'fill-by-clinician', label: 'Fill rate by clinician',
        config: { grain: 'slots', num: { statuses: ['booked'] }, denom: { statuses: ['available','embargoed','booked'] }, groupBy: 'clinician', range: 'last8', chart: 'bars' } },
      { id: 'offered-by-location', label: 'Slots offered by site',
        config: { grain: 'slots', num: { statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'location', range: 'last8next8', chart: 'bars' } },
      { id: 'booked-by-dow', label: 'Booked by day of week',
        config: { grain: 'slots', num: { statuses: ['booked'] }, denom: null, groupBy: 'dow', range: 'last8', chart: 'bars' } },
      { id: 'urgent-share-by-clinician', label: 'Urgent share by clinician',
        config: { grain: 'slots', num: { categories: ['urgent'], statuses: ['available','embargoed','booked'] }, denom: { statuses: ['available','embargoed','booked'] }, groupBy: 'clinician', range: 'last8next8', chart: 'bars' } },
    ],
  },
  {
    group: 'Trends',
    presets: [
      { id: 'urgent-by-week', label: 'Urgent slots by week',
        config: { grain: 'slots', num: { categories: ['urgent'], statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'week', range: 'last8next8', chart: 'trend' } },
      { id: 'routine-by-week', label: 'Routine slots by week',
        config: { grain: 'slots', num: { categories: ['routine'], statuses: ['available','embargoed','booked'] }, denom: null, groupBy: 'week', range: 'last8next8', chart: 'trend' } },
      { id: 'fill-by-week', label: 'Fill rate by week',
        config: { grain: 'slots', num: { statuses: ['booked'] }, denom: { statuses: ['available','embargoed','booked'] }, groupBy: 'week', range: 'last8next8', chart: 'trend' } },
    ],
  },
];

// Flat list (back-compat / convenience).
export const PRESETS = PRESET_GROUPS.flatMap(g => g.presets);

export const GROUP_BY_OPTIONS = [
  { id: 'clinician', label: 'Clinician', grains: ['slots','sessions'] },
  { id: 'location', label: 'Site / location', grains: ['slots'] },
  { id: 'slotType', label: 'Slot type', grains: ['slots'] },
  { id: 'category', label: 'Category (urgent/routine)', grains: ['slots'] },
  { id: 'role', label: 'Role', grains: ['slots','sessions'] },
  { id: 'session', label: 'Session (AM/PM)', grains: ['slots','sessions'] },
  { id: 'dow', label: 'Day of week', grains: ['slots','sessions'] },
  { id: 'week', label: 'Week', grains: ['slots','sessions'] },
];

// Group-by options valid for a given grain.
export function groupByOptionsForGrain(grain) {
  return GROUP_BY_OPTIONS.filter(o => o.grains.includes(grain));
}

// Split-by (multi-series / "compare") options. Must partition the
// numerator so series stack/compare cleanly. 'none' = single series.
export const SPLIT_BY_OPTIONS = [
  { id: 'none', label: 'None (single series)', grains: ['slots','sessions'] },
  { id: 'status', label: 'Status', grains: ['slots'] },
  { id: 'category', label: 'Category', grains: ['slots'] },
  { id: 'location', label: 'Site', grains: ['slots'] },
  { id: 'slotType', label: 'Slot type', grains: ['slots'] },
  { id: 'session', label: 'Session (AM/PM)', grains: ['slots','sessions'] },
  { id: 'role', label: 'Role', grains: ['slots','sessions'] },
];
export function splitByOptionsForGrain(grain) {
  return SPLIT_BY_OPTIONS.filter(o => o.grains.includes(grain));
}

// Build the option lists for the global-filter controls from a clinician
// list + the slot fact metadata (locations, slotTypes).
export function buildFilterOptions(clinicians, slotMeta) {
  const clinOpts = (clinicians || [])
    .map(c => ({ id: c.id, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const roleSet = new Set();
  (clinicians || []).forEach(c => roleSet.add(c.role || 'Unspecified'));
  return {
    clinicians: clinOpts,
    roles: Array.from(roleSet).sort().map(r => ({ id: r, label: r })),
    locations: (slotMeta?.locations || []).map(l => ({ id: l, label: l })),
    slotTypes: (slotMeta?.slotTypes || []).map(s => ({ id: s, label: s })),
  };
}

export const RANGE_OPTIONS = [
  { id: 'last8', label: 'Last 8 weeks' },
  { id: 'next8', label: 'Next 8 weeks' },
  { id: 'last8next8', label: 'Last 8 + next 8' },
  { id: 'all', label: 'All data' },
];
