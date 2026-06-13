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
export function buildSessionFacts(slotFacts, dutySlotTypes) {
  // Aggregate slot-grain facts into one fact per (date, session, clinician
  // who worked that session). Each session fact carries the set of slot
  // types it contained, its urgent-slot count, a flag for the busiest-urgent
  // session (the generic on-call equivalent), and — when the practice has
  // configured duty-doctor slot types — a flag for whether this clinician
  // was the actual duty doctor that session (the one holding the most
  // duty-slot-type slots, mirroring getDutyDoctor in lib/huddle).
  const dutySlots = Array.isArray(dutySlotTypes) ? dutySlotTypes : (dutySlotTypes ? [dutySlotTypes] : []);
  const groups = new Map();
  for (const f of (slotFacts || [])) {
    const key = `${f.iso}|${f.session}|${f.clinicianId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        iso: f.iso, dateMs: f.dateMs, weekStartMs: f.weekStartMs, weekLabel: f.weekLabel,
        dow: f.dow, dowName: f.dowName, dowShort: f.dowShort || DAY_SHORT[f.dow],
        session: f.session, clinicianId: f.clinicianId, clinicianName: f.clinicianName,
        role: f.role, isSystem: f.isSystem, slotTypeSet: new Set(), urgentCount: 0, dutyCount: 0, total: 0,
      };
      groups.set(key, g);
    }
    if (f.slotType) g.slotTypeSet.add(f.slotType);
    g.total += f.count || 0;
    if (f.category === 'urgent') g.urgentCount += f.count || 0;
    if (dutySlots.length && f.slotType && dutySlots.includes(f.slotType)) g.dutyCount += f.count || 0;
  }
  // Busiest-urgent session per (date, session): the highest urgent-slot count
  // among real (non-system) clinicians who worked it.
  const dayMax = new Map();
  for (const g of groups.values()) {
    if (g.isSystem || g.urgentCount <= 0) continue;
    const k = `${g.iso}|${g.session}`;
    dayMax.set(k, Math.max(dayMax.get(k) || 0, g.urgentCount));
  }
  // Duty doctor per (date, session): the real clinician holding the most
  // duty-slot-type slots — same rule getDutyDoctor uses to highlight the
  // duty clinician on the Today page. Only computed when duty slots exist.
  const dutyMax = new Map();
  if (dutySlots.length) {
    for (const g of groups.values()) {
      if (g.isSystem || g.dutyCount <= 0) continue;
      const k = `${g.iso}|${g.session}`;
      dutyMax.set(k, Math.max(dutyMax.get(k) || 0, g.dutyCount));
    }
  }
  const facts = [];
  let hasUrgent = false;
  for (const g of groups.values()) {
    if (g.urgentCount > 0) hasUrgent = true;
    const max = dayMax.get(`${g.iso}|${g.session}`) || 0;
    const dMax = dutyMax.get(`${g.iso}|${g.session}`) || 0;
    facts.push({
      iso: g.iso, dateMs: g.dateMs, weekStartMs: g.weekStartMs, weekLabel: g.weekLabel,
      dow: g.dow, dowName: g.dowName, dowShort: g.dowShort, session: g.session,
      clinicianId: g.clinicianId, clinicianName: g.clinicianName, role: g.role,
      isSystem: g.isSystem, slotTypes: Array.from(g.slotTypeSet),
      urgentCount: g.urgentCount, total: g.total,
      isBusiestUrgent: !g.isSystem && g.urgentCount > 0 && g.urgentCount === max,
      isDuty: !g.isSystem && dMax > 0 && g.dutyCount === dMax,
      count: 1,
    });
  }
  return { facts, hasUrgent, hasDuty: dutySlots.length > 0 && Array.from(dutyMax.values()).some(v => v > 0) };
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

// Session-grain filter. New generic model: `mode` is one of
//   'worked'   — any session the clinician worked (default)
//   'slottype' — sessions that include at least one of `slotTypes`
//   'busiest'  — the busiest-urgent session of that day/session
//   'duty'     — the clinician was the duty doctor that session (held the
//                most duty-slot-type slots; needs duty slots configured)
// Back-compat: an old `kinds` array (worked|duty|support) maps duty→'duty'
// and support→'busiest'. `sessions` optionally restricts to am/pm.
function sessionMode(f) {
  if (f?.mode) return f.mode;
  if (f?.kinds && f.kinds.length) {
    if (f.kinds.includes('worked')) return 'worked';
    if (f.kinds.includes('duty')) return 'duty';
    if (f.kinds.includes('support')) return 'busiest';
  }
  return 'worked';
}
function matchSessionFilter(fact, f) {
  if (!f) return true;
  if (f.sessions && f.sessions.length && !f.sessions.includes(fact.session)) return false;
  const mode = sessionMode(f);
  if (mode === 'duty') return !!fact.isDuty;
  if (mode === 'busiest') return !!fact.isBusiestUrgent;
  if (mode === 'slottype') {
    const want = f.slotTypes || [];
    if (want.length === 0) return true;
    return (fact.slotTypes || []).some(st => want.includes(st));
  }
  return true; // worked
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

// Date-range predicate. `range` is either a string preset
// (all|last8|next8|last8next8) or a custom object:
//   { type: 'relative', backWeeks, fwdWeeks }  — N weeks each side of today
//   { type: 'absolute', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
function dateRangePredicate(range) {
  const today = new Date(); today.setHours(0,0,0,0);
  const t = today.getTime();
  if (range && typeof range === 'object') {
    if (range.type === 'relative') {
      const back = t - (Math.max(0, range.backWeeks || 0)) * 7 * 86400000;
      const fwd = t + (Math.max(0, range.fwdWeeks || 0)) * 7 * 86400000;
      return ms => ms >= back && ms <= fwd;
    }
    if (range.type === 'absolute') {
      const from = range.from ? new Date(range.from + 'T00:00:00').getTime() : -Infinity;
      const to = range.to ? new Date(range.to + 'T23:59:59').getTime() : Infinity;
      return ms => ms >= from && ms <= to;
    }
  }
  const back = t - 56 * 86400000;
  const fwd = t + 56 * 86400000;
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
  // Denominator mode: 'none' | 'group' | 'total' | 'custom'.
  // Back-compat: if denomMode absent, infer from denom (object → custom, null → none).
  const denomMode = config.denomMode || (denom ? 'custom' : 'none');
  const inRange = dateRangePredicate(range);
  const keyer = groupKeyer(groupBy);
  const splitKeyer = (splitBy && splitBy !== 'none') ? groupKeyer(splitBy) : null;
  const isRatio = denomMode !== 'none';
  const match = grain === 'sessions' ? matchSessionFilter : matchFilter;

  const groups = {};
  const seriesMeta = {};
  let totalNum = 0, totalCustomDenom = 0, totalAll = 0;

  for (const fact of facts) {
    if (!inRange(fact.dateMs)) continue;
    if (excludeSystem && fact.isSystem) continue;
    if (!matchGlobal(fact, globalFilter)) continue;

    const inNum = match(fact, num);
    const inDenom = denomMode === 'custom' && denom ? match(fact, denom) : false;
    // 'group'/'total' modes need the total of ALL facts in scope, so we
    // keep every in-scope fact rather than skipping non-matching ones.
    const keepForTotal = denomMode === 'group' || denomMode === 'total';
    if (!inNum && !inDenom && !keepForTotal) continue;

    const gk = keyer(fact);
    if (!groups[gk.key]) groups[gk.key] = { key: gk.key, label: gk.label, order: gk.order ?? null, series: {}, numerator: 0, denominator: 0, total: 0 };
    const g = groups[gk.key];

    let skKey = '_all';
    if (splitKeyer) {
      const sk = splitKeyer(fact);
      skKey = sk.key;
      if (!seriesMeta[skKey]) seriesMeta[skKey] = { key: sk.key, label: sk.label, order: sk.order ?? null, value: 0 };
    }
    if (!g.series[skKey]) g.series[skKey] = { numerator: 0, denominator: 0, total: 0 };
    g.series[skKey].total += fact.count; g.total += fact.count; totalAll += fact.count;
    if (inNum) { g.series[skKey].numerator += fact.count; g.numerator += fact.count; totalNum += fact.count; if (seriesMeta[skKey]) seriesMeta[skKey].value += fact.count; }
    if (inDenom) { g.series[skKey].denominator += fact.count; g.denominator += fact.count; totalCustomDenom += fact.count; }
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

  // Resolve the effective denominator for a cell/group given the mode.
  const denomOf = (obj) => {
    switch (denomMode) {
      case 'group':  return obj.total;
      case 'custom': return obj.denominator;
      case 'total':  return totalNum;       // share of overall numerator
      default:       return 0;
    }
  };
  const valueOf = (obj) => {
    if (denomMode === 'none') return obj.numerator;
    const d = denomMode === 'total' ? totalNum : denomOf(obj);
    return d > 0 ? (obj.numerator / d) * 100 : 0;
  };

  let groupArr = Object.values(groups).map(g => {
    const cells = {};
    for (const s of series) {
      const c = g.series[s.key] || { numerator: 0, denominator: 0, total: 0 };
      cells[s.key] = { numerator: c.numerator, denominator: denomOf(c), value: valueOf(c) };
    }
    return { key: g.key, label: g.label, order: g.order, numerator: g.numerator, denominator: denomOf(g), total: g.total, cells, value: valueOf(g) };
  });

  // Sort.
  const timeGroup = isTimeDimension(groupBy);
  if (timeGroup || sort === 'time') groupArr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  else if (sort === 'alpha') groupArr.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  else groupArr.sort((a, b) => b.value - a.value);

  // Top-N (not for time dimensions — you want the whole timeline).
  if (topN && topN > 0 && !timeGroup) groupArr = groupArr.slice(0, topN);

  const overallDenom = denomMode === 'group' ? totalAll : denomMode === 'custom' ? totalCustomDenom : denomMode === 'total' ? totalNum : 0;
  const totalValue = denomMode === 'none' ? totalNum : (overallDenom > 0 ? (totalNum / overallDenom) * 100 : 0);
  const vals = groupArr.map(g => g.value);
  const valueMin = vals.length ? Math.min(...vals) : 0;
  const valueMax = vals.length ? Math.max(...vals) : 0;
  const valueAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return { groups: groupArr, series, hasSplit: !!splitKeyer, denomMode, totalNum, totalDenom: overallDenom, totalAll, totalValue, isRatio, valueMin, valueMax, valueAvg };
}

// Drill-down: return the raw numerator facts behind a single group (and
// optionally a single series), applying the same range / global / system /
// measure filters as runReport. Used when a bar or point is clicked.
export function collectGroupFacts(facts, config, groupKey, seriesKey = null) {
  const { num, groupBy, splitBy, range, grain, globalFilter, excludeSystem } = config;
  const inRange = dateRangePredicate(range);
  const keyer = groupKeyer(groupBy);
  const splitKeyer = (splitBy && splitBy !== 'none') ? groupKeyer(splitBy) : null;
  const match = grain === 'sessions' ? matchSessionFilter : matchFilter;
  const out = [];
  for (const fact of facts) {
    if (!inRange(fact.dateMs)) continue;
    if (excludeSystem && fact.isSystem) continue;
    if (!matchGlobal(fact, globalFilter)) continue;
    if (!match(fact, num)) continue;
    if (keyer(fact).key !== groupKey) continue;
    if (splitKeyer && seriesKey != null && splitKeyer(fact).key !== seriesKey) continue;
    out.push(fact);
  }
  out.sort((a, b) => a.dateMs - b.dateMs || a.session.localeCompare(b.session));
  return out;
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

function describeSessionFilter(f) {
  const mode = sessionMode(f);
  let label;
  if (mode === 'duty') label = 'duty doctor sessions';
  else if (mode === 'busiest') label = 'most-urgent sessions';
  else if (mode === 'slottype') {
    const st = f.slotTypes || [];
    label = st.length ? `sessions including ${st.length <= 2 ? st.join(' or ') : `${st.length} slot types`}` : 'sessions worked';
  } else label = 'sessions worked';
  if (f && f.sessions && f.sessions.length === 1) label += ` (${f.sessions[0].toUpperCase()})`;
  return label;
}

export function describeMeasure(config) {
  const isSession = config.grain === 'sessions';
  const desc = isSession ? describeSessionFilter : describeFilter;
  const numDesc = desc(config.num);
  const mode = config.denomMode || (config.denom ? 'custom' : 'none');
  switch (mode) {
    case 'group':  return `${numDesc} as % of all ${isSession ? 'sessions' : 'slots'} in each group`;
    case 'total':  return `${numDesc} as % of the total (share)`;
    case 'custom': return `${numDesc} ÷ ${desc(config.denom)} (%)`;
    default:       return numDesc;
  }
}

// Short label for the "Show as" denominator mode.
export function denomModeLabel(mode, grain) {
  switch (mode) {
    case 'group':  return `% of group total`;
    case 'total':  return `% of overall total (share)`;
    case 'custom': return `% of a custom subset`;
    default:       return 'Count';
  }
}

// ── Presets ─────────────────────────────────────────────────────────────
// Curated starter reports for the gallery. Each carries a short
// description and icon for the preset cards, plus a complete config that
// drops straight into the builder. Grouped by what a practice manager is
// actually trying to answer.
export const PRESET_GROUPS = [
  {
    group: 'Workload & fairness',
    blurb: 'How work is shared across the team',
    presets: [
      { id: 'duty-share', label: 'Duty sessions as a share of own sessions',
        description: 'For each clinician, the sessions where they were the duty doctor (holding the practice duty slots) divided by the total sessions they worked. Shows how the duty load is shared across the team. Needs duty doctor slots to be set on the Today page.',
        config: { grain: 'sessions', num: { mode: 'duty' }, denomMode: 'custom', denom: { mode: 'worked' }, groupBy: 'clinician', range: 'last8next8', chart: 'bars', colourMode: 'conditional', colourInvert: true } },
      { id: 'busiest-load', label: 'Most-urgent session load by clinician',
        description: 'How often each clinician runs the session with the most urgent slots (the de-facto on-call), as a share of the sessions they work.',
        config: { grain: 'sessions', num: { mode: 'busiest' }, denomMode: 'group', groupBy: 'clinician', range: 'last8next8', chart: 'bars', colourMode: 'conditional', colourInvert: true } },
      { id: 'sessions-worked', label: 'Sessions worked by clinician',
        description: 'Total AM and PM sessions each clinician worked over the period.',
        config: { grain: 'sessions', num: { mode: 'worked' }, denomMode: 'none', groupBy: 'clinician', range: 'last8next8', chart: 'bars', colourMode: 'multi' } },
    ],
  },
  {
    group: 'Capacity & fill',
    blurb: 'Are we offering enough, and is it getting booked',
    presets: [
      { id: 'fill-by-clinician', label: 'Fill rate by clinician',
        description: 'Booked slots as a percentage of all slots offered, per clinician.',
        config: { grain: 'slots', num: { statuses: ['booked'] }, denomMode: 'group', groupBy: 'clinician', range: 'last8', chart: 'bars', colourMode: 'conditional' } },
      { id: 'offered-by-clinician', label: 'Slots offered by clinician',
        description: 'Total slots each clinician put out (available, embargoed and booked).',
        config: { grain: 'slots', num: { statuses: ['available','embargoed','booked'] }, denomMode: 'none', groupBy: 'clinician', range: 'last8next8', chart: 'bars', colourMode: 'multi' } },
      { id: 'fill-by-week', label: 'Fill rate by week',
        description: 'How the overall booking rate trends week by week.',
        config: { grain: 'slots', num: { statuses: ['booked'] }, denomMode: 'group', groupBy: 'week', range: 'last8next8', chart: 'trend', colourMode: 'single' } },
      { id: 'offered-by-location', label: 'Slots offered by site',
        description: 'Where capacity sits across your sites.',
        config: { grain: 'slots', num: { statuses: ['available','embargoed','booked'] }, denomMode: 'none', groupBy: 'location', range: 'last8next8', chart: 'bars', colourMode: 'multi' } },
    ],
  },
  {
    group: 'Demand patterns',
    blurb: 'When and where pressure shows up',
    presets: [
      { id: 'booked-by-dow', label: 'Bookings by day of week',
        description: 'Which weekdays are busiest for booked appointments.',
        config: { grain: 'slots', num: { statuses: ['booked'] }, denomMode: 'none', groupBy: 'dow', range: 'last8', chart: 'bars', colourMode: 'conditional' } },
      { id: 'urgent-by-week', label: 'Urgent slots by week',
        description: 'Urgent capacity offered each week over time.',
        config: { grain: 'slots', num: { categories: ['urgent'], statuses: ['available','embargoed','booked'] }, denomMode: 'none', groupBy: 'week', range: 'last8next8', chart: 'trend', colourMode: 'single' } },
      { id: 'routine-by-week', label: 'Routine slots by week',
        description: 'Routine capacity offered each week over time.',
        config: { grain: 'slots', num: { categories: ['routine'], statuses: ['available','embargoed','booked'] }, denomMode: 'none', groupBy: 'week', range: 'last8next8', chart: 'trend', colourMode: 'single' } },
    ],
  },
  {
    group: 'Appointment mix',
    blurb: 'Composition of what is on offer',
    presets: [
      { id: 'status-mix-by-week', label: 'Status mix by week',
        description: 'Available, embargoed and booked stacked, week by week.',
        config: { grain: 'slots', num: { statuses: ['available','embargoed','booked'] }, denomMode: 'none', groupBy: 'week', splitBy: 'status', range: 'last8next8', chart: 'stacked', colourMode: 'multi' } },
      { id: 'urgent-routine-by-clinician', label: 'Urgent vs routine by clinician',
        description: 'Urgent and routine slots stacked per clinician.',
        config: { grain: 'slots', num: { categories: ['urgent','routine'], statuses: ['available','embargoed','booked'] }, denomMode: 'none', groupBy: 'clinician', splitBy: 'category', range: 'last8next8', chart: 'stacked', colourMode: 'multi' } },
      { id: 'urgent-share-by-clinician', label: 'Urgent share by clinician',
        description: 'What proportion of each clinician\u2019s slots are urgent.',
        config: { grain: 'slots', num: { categories: ['urgent'], statuses: ['available','embargoed','booked'] }, denomMode: 'group', groupBy: 'clinician', range: 'last8next8', chart: 'bars', colourMode: 'conditional' } },
    ],
  },
];

// Flat list (back-compat / convenience).
export const PRESETS = PRESET_GROUPS.flatMap(g => g.presets);

// ── Conditional bar colour ──────────────────────────────────────────────
// Returns a function value → colour for the 'conditional' colour mode.
// auto:   3-band scale around a reference (the chart's reference line or
//         the group average) — above = green, around = amber, below = red.
// custom: explicit low/high thresholds typed by the user.
// invert: flips green/red (useful for "less is better" measures like duty
//         load, where carrying a lot should read as red, not green).
export function makeConditionalColour({ result, refValue, mode = 'auto', low = null, high = null, invert = false }) {
  const GREEN = '#10b981', AMBER = '#f59e0b', RED = '#ef4444';
  let lo, hi;
  if (mode === 'custom' && low != null && high != null && !isNaN(low) && !isNaN(high)) {
    lo = Math.min(low, high); hi = Math.max(low, high);
  } else {
    const ref = (refValue != null) ? refValue : result.valueAvg;
    const span = Math.max(Math.abs(ref) * 0.1, (result.valueMax - result.valueMin) * 0.08, 1e-6);
    lo = ref - span; hi = ref + span;
  }
  return (v) => {
    let c = v >= hi ? GREEN : v <= lo ? RED : AMBER;
    if (invert) c = c === GREEN ? RED : c === RED ? GREEN : AMBER;
    return c;
  };
}


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

// Human label for any range, string preset or custom object.
export function rangeLabel(range) {
  if (range && typeof range === 'object') {
    if (range.type === 'relative') {
      const b = Math.max(0, range.backWeeks || 0), f = Math.max(0, range.fwdWeeks || 0);
      return `${b ? `-${b}w` : 'this week'} to ${f ? `+${f}w` : 'today'}`;
    }
    if (range.type === 'absolute') {
      const fmt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
      const from = fmt(range.from), to = fmt(range.to);
      if (from && to) return `${from} to ${to}`;
      if (from) return `from ${from}`;
      if (to) return `up to ${to}`;
      return 'custom dates';
    }
  }
  const o = RANGE_OPTIONS.find(o => o.id === range);
  return o ? o.label : 'custom range';
}
