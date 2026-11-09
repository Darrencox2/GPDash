// lib/week-review.js
//
// Week in review: everything someone checks before a week goes live, for
// one Monday-to-Friday week, as plain data. Pure functions, no React.
//
// The question the page answers is not "how busy are we" but "is next
// week set up properly on EMIS, and can we function". So every row is a
// check with a verdict, and every verdict that is not fine becomes a flag
// the reviewer can see, acknowledge with a reason, or go and fix.
//
// Sources, all already in the app:
//   - EMIS export (huddleData): who holds slots, of which type, where
//   - the session rota and absences (data): who is MEANT to be in
//   - huddleSettings: urgent targets per weekday and session, duty slot
//     types, site minimums, and this page's own config (weekReview)
//   - the demand predictor: expected urgent demand for the day
//   - the staff plan: changes that take effect this week
//
// Config lives in huddleSettings.weekReview so it persists with the rest
// of the huddle settings (the save route writes huddleSettings whole):
//   {
//     wardRoundTypes: ['2026 Nursing home ward round'],  // slot types that mean a round
//     wardRounds: [{ id, name, days: ['Monday'], session: 'am'|'pm'|'any', usual: ['Dr Name'] }],
//     activityTypes: ['2026 Teaching or Supervision', 'Baby imms', ...],
//   }
// The ward round slot type says a GP is doing A round, never which home:
// the EMIS location on those rows is the GP's base surgery (checked on
// the live export, Nov 2026). So the home is configured here, with the
// GPs who usually do it, and holders are matched to a home by that.

import { toHuddleDateStr, toLocalIso, getScheduledSessions, matchesStaffMember, titleCaseName } from './data';
import { getDutyDoctor, getHuddleCapacity, getBand, getCliniciansForDate, getSlotRowsForClinicianDate } from './huddle';
import { getWeekDayDetail, classifyStaffRole, rowSessionOf, getUrgentTypeSet } from './site-staffing';
import { predictDemand } from './demandPredictor';
import { eventDate } from './staff-plan';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SESSIONS = ['am', 'pm'];

// ───────────────────────────────────────────────────────────────────────
// Config

const WARD_ROUND_RE = /ward round|nursing home|care home/i;
// Things a GP does in a session that are neither urgent nor routine
// appointments but matter to the reviewer: teaching, clinics, school
// visits. "Clinician to book" must not match "clinic", hence the \b.
const ACTIVITY_RE = /teaching|supervis|tutorial|\bbaby\b|\bclinic\b|minor surg|coil|implant|school visit|medical student|msk inj|private exam/i;

// Slot types in the export that look like ward rounds / other activities.
export function suggestWardRoundTypes(huddleData) {
  return (huddleData?.allSlotTypes || []).filter((t) => WARD_ROUND_RE.test(String(t)));
}
export function suggestActivityTypes(huddleData) {
  return (huddleData?.allSlotTypes || []).filter((t) => ACTIVITY_RE.test(String(t)) && !WARD_ROUND_RE.test(String(t)));
}

// The effective config: what is saved, with the export filling any gap.
export function resolveWeekReviewConfig(huddleSettings, huddleData) {
  const saved = huddleSettings?.weekReview || {};
  const wardRoundTypes = Array.isArray(saved.wardRoundTypes) && saved.wardRoundTypes.length
    ? saved.wardRoundTypes : suggestWardRoundTypes(huddleData);
  const activityTypes = Array.isArray(saved.activityTypes) ? saved.activityTypes : suggestActivityTypes(huddleData);
  const wardRounds = (Array.isArray(saved.wardRounds) ? saved.wardRounds : [])
    .filter((r) => r && r.name)
    .map((r) => ({
      id: r.id || r.name,
      name: r.name,
      days: Array.isArray(r.days) ? r.days.filter((d) => WEEKDAYS.includes(d)) : [],
      session: r.session === 'am' || r.session === 'pm' ? r.session : 'any',
      usual: Array.isArray(r.usual) ? r.usual.filter(Boolean) : [],
    }));
  return { wardRoundTypes, activityTypes, wardRounds };
}

// ───────────────────────────────────────────────────────────────────────
// Helpers

export function mondayOf(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const wd = x.getDay();
  x.setDate(x.getDate() - ((wd + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

// Prefer the register's own spelling of a name; otherwise tidy the EMIS
// form ("COX, Darren (Dr)" -> "Darren Cox").
export function displayNameFor(csvName, clinicians) {
  const match = (clinicians || []).find((c) => matchesStaffMember(csvName, c));
  if (match?.name) return match.name;
  return titleCaseName(String(csvName || '').replace(/\s*\([^)]*\)\s*$/, '').trim()) || String(csvName || '');
}

function registerMatch(csvName, clinicians) {
  return (clinicians || []).find((c) => matchesStaffMember(csvName, c)) || null;
}

// Does this register person match one of the configured "usual" names
// for a ward round? Usual names are typed by the practice, so match them
// loosely against both the register name and the EMIS name.
function isUsual(csvName, register, usual) {
  if (!usual.length) return false;
  const disp = (register?.name || displayNameFor(csvName, [])).toLowerCase();
  const csv = String(csvName || '').toLowerCase();
  return usual.some((u) => {
    const x = String(u || '').toLowerCase().trim();
    if (!x) return false;
    if (disp.includes(x) || x.includes(disp)) return true;
    if (register && matchesStaffMember(x, register)) return true;
    // surname only
    const sur = x.split(/\s+/).pop();
    return sur && sur.length >= 3 && (disp.endsWith(sur) || csv.startsWith(sur + ','));
  });
}

// Slot counts per session for one EMIS clinician on one date, across all
// four stores. Blocked counts too: a blocked slot still means the person
// is set up on EMIS that day.
function sessionSlotTotals(huddleData, csvStr, idx) {
  const out = { am: 0, pm: 0 };
  for (const store of [huddleData.dateData, huddleData.bookedData, huddleData.embargoedData, huddleData.blockedData]) {
    for (const s of SESSIONS) {
      const slots = store?.[csvStr]?.[s]?.[idx];
      if (!slots) continue;
      out[s] += Object.values(slots).reduce((a, b) => a + (Number(b) || 0), 0);
    }
  }
  return out;
}

// Per clinician per session: which of a set of slot types they hold and
// how many. Reads the row list so the session comes from the row time.
function holdersOfTypes(huddleData, csvStr, typeSet, clinicians) {
  const out = []; // { name, display, register, session, count, types: {type: n} }
  if (!huddleData || !typeSet.size) return out;
  const names = getCliniciansForDate(huddleData, csvStr);
  for (const name of names) {
    const rows = getSlotRowsForClinicianDate(huddleData, csvStr, name) || [];
    const bySession = {};
    for (const r of rows) {
      if (!typeSet.has(r.slotType)) continue;
      const s = rowSessionOf(r.time) === 'am' ? 'am' : 'pm';
      if (!bySession[s]) bySession[s] = { count: 0, types: {} };
      bySession[s].count += Number(r.count) || 1;
      bySession[s].types[r.slotType] = (bySession[s].types[r.slotType] || 0) + (Number(r.count) || 1);
    }
    const register = registerMatch(name, clinicians);
    for (const [session, v] of Object.entries(bySession)) {
      out.push({ name, display: register?.name || displayNameFor(name, []), register, session, count: v.count, types: v.types });
    }
  }
  return out;
}

// Is a clinician away for a session on a date, by the plan? Session-aware
// absences, long-term absence, and a daily override that leaves them out.
function awayForSession(data, c, dateKey, dayName, session) {
  if (c.longTermAbsent) return 'Long-term absent';
  const override = data?.dailyOverrides?.[`${dateKey}-${dayName}`];
  if (override?.present) {
    const present = Array.isArray(override.present) ? override.present : Object.values(override.present);
    if (!present.includes(c.id)) return 'Marked out for the day';
    return null; // explicitly marked in - the override is the plan
  }
  const abs = Array.isArray(data?.plannedAbsences) ? data.plannedAbsences : [];
  for (const a of abs) {
    if (a.clinicianId !== c.id) continue;
    if (!(dateKey >= a.startDate && dateKey <= a.endDate)) continue;
    const covers = a.session === 'am' ? session === 'am' : a.session === 'pm' ? session === 'pm' : true;
    if (covers) return a.reason ? String(a.reason) : 'Absent';
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// One day

function assembleDay({ data, huddleData, dt, hs, config, sites, capacityStaffing, teamClin, predictionOptions, includeGroups }) {
  const dayName = DAY_NAMES[dt.getDay()];
  const iso = toLocalIso(dt);
  const csvStr = toHuddleDateStr(dt);
  const today = toLocalIso(new Date());
  const pred = predictDemand(dt, null, predictionOptions || undefined);
  const declared = data?.closedDays?.[iso] || null;
  const closed = !!pred?.isBankHoliday || !!declared;
  const closedReason = declared || (pred?.isBankHoliday ? 'Bank holiday' : null);
  const hasData = !!huddleData && getCliniciansForDate(huddleData, csvStr).length > 0;
  const flags = [];
  const flag = (kind, severity, text, extra = {}) => flags.push({ id: `${iso}:${kind}${extra.key ? ':' + extra.key : ''}`, kind, severity, day: dayName, iso, text, ...extra });

  const day = {
    dayName, dt, iso, csvStr, closed, closedReason, hasData,
    isPast: iso < today, isToday: iso === today,
    urgent: { am: null, pm: null },
    sites: [], duty: { am: null, pm: null },
    wardRounds: [], wardRoundHolders: [], activities: [],
    mismatches: { plannedNoEmis: [], emisButAway: [], unknownNames: [] },
    demand: { predicted: pred?.isBankHoliday ? null : (pred?.predicted ? Math.round(pred.predicted) : null), urgentTotal: null },
    flags,
  };

  if (closed) {
    if (hasData) flag('closed-with-slots', 'high', `${closedReason || 'Closed'} but EMIS still has slots that day`);
    return day;
  }
  if (!hasData) {
    flag('no-data', 'info', 'No EMIS export covers this day yet');
    return day;
  }

  // ── Urgent capacity against the target ──────────────────────────────
  // The saved urgent filter is what Today and the briefing count with; a
  // practice that keeps its urgent list in slotCategories instead gets the
  // same count from that. With neither, there is nothing to count against.
  const saved = hs.savedSlotFilters || {};
  const urgentSet = getUrgentTypeSet(hs);
  const urgentFilter = saved.urgent || (urgentSet.size ? Object.fromEntries([...urgentSet].map((t) => [t, true])) : null);
  const cap = urgentFilter ? getHuddleCapacity(huddleData, csvStr, hs, urgentFilter) : { am: { total: 0, embargoed: 0, booked: 0 }, pm: { total: 0, embargoed: 0, booked: 0 } };
  let urgentTotal = 0;
  for (const s of SESSIONS) {
    const slots = (cap[s].total || 0) + (cap[s].embargoed || 0) + (cap[s].booked || 0);
    const target = hs.expectedCapacity?.[dayName]?.[s] || 0;
    urgentTotal += slots;
    day.urgent[s] = { slots, target, band: getBand(slots, target), pct: target > 0 ? Math.round((slots / target) * 100) : null };
    if (target > 0 && slots < target * 0.8) {
      flag('urgent-short', slots < target * 0.5 ? 'high' : 'medium', `${s.toUpperCase()} urgent slots ${slots} against a target of ${target}`, { key: s, session: s });
    }
  }
  day.demand.urgentTotal = urgentTotal;
  if (day.demand.predicted != null && urgentTotal > 0 && day.demand.predicted > urgentTotal) {
    flag('demand-over', 'medium', `Predicted demand ${day.demand.predicted} is above the ${urgentTotal} urgent slots offered`);
  }

  // ── Duty doctor ─────────────────────────────────────────────────────
  const dutySlots = hs.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const dutyByName = {};
  if (hasDuty) {
    for (const s of SESSIONS) {
      const d = getDutyDoctor(huddleData, csvStr, s, dutySlots, teamClin);
      if (d?.name) {
        dutyByName[s] = d.name;
        day.duty[s] = { name: d.name, display: displayNameFor(d.name, teamClin), location: d.location || null };
      } else {
        flag('duty-missing', 'high', `No duty doctor found for the ${s.toUpperCase()} session`, { key: s, session: s });
      }
    }
  }

  // ── Clinicians per site per session ─────────────────────────────────
  if (sites.length) {
    day.sites = getWeekDayDetail(huddleData, csvStr, {
      sites, huddleSettings: hs, capacityStaffing, clinicians: teamClin, dutyByName, includeEmpty: true,
    });
    for (const e of day.sites) {
      for (const s of SESSIONS) {
        const sess = e.sessions?.[s];
        if (!sess) continue;
        if (sess.state === 'short') {
          flag('site-short', 'high', `${e.site.name} ${s.toUpperCase()}: ${sess.offering} offering appointments, minimum ${e.threshold}`, { key: `${e.site.name}:${s}`, session: s, site: e.site.name });
        } else if (sess.offering === 0 && sess.clins.length > 0) {
          flag('site-nobody-offering', 'medium', `${e.site.name} ${s.toUpperCase()}: ${sess.clins.length} here but nobody has bookable slots`, { key: `${e.site.name}:${s}`, session: s, site: e.site.name });
        }
      }
    }
  }

  // ── Ward rounds ─────────────────────────────────────────────────────
  const wardTypes = new Set(config.wardRoundTypes || []);
  const holders = holdersOfTypes(huddleData, csvStr, wardTypes, teamClin);
  day.wardRoundHolders = holders;
  const expected = config.wardRounds.filter((r) => r.days.includes(dayName));
  const claimed = new Set();
  // First pass: a round takes the holders who usually do it.
  const assigned = expected.map((r) => {
    const mine = holders.filter((h) => (r.session === 'any' || h.session === r.session) && isUsual(h.name, h.register, r.usual));
    mine.forEach((h) => claimed.add(h));
    return { ...r, holders: mine, expected: true };
  });
  // Second pass: an unclaimed holder goes to the only round still empty
  // in that session, if there is exactly one. Two empty rounds in one
  // session cannot be told apart, so they stay unclear.
  for (const h of holders) {
    if (claimed.has(h)) continue;
    const open = assigned.filter((r) => !r.holders.length && (r.session === 'any' || r.session === h.session));
    if (open.length === 1) { open[0].holders.push(h); open[0].inferred = true; claimed.add(h); }
  }
  for (const r of assigned) {
    if (!r.holders.length) {
      r.status = 'uncovered';
      flag('ward-uncovered', 'high', `${r.name} ward round has nobody with ward round slots${r.session !== 'any' ? ' in the ' + r.session.toUpperCase() : ''}`, { key: r.id, session: r.session === 'any' ? null : r.session });
    } else if (r.inferred) {
      r.status = 'inferred';
    } else {
      r.status = 'covered';
    }
    // Duty doing a round in the same session is two jobs at once.
    for (const h of r.holders) {
      if (dutyByName[h.session] === h.name) {
        flag('duty-clash', 'medium', `${h.display} is duty doctor and holds ${r.name} ward round slots in the ${h.session.toUpperCase()}`, { key: `${r.id}:${h.session}`, session: h.session });
      }
    }
  }
  day.wardRounds = assigned;
  day.unassignedWardRounds = holders.filter((h) => !claimed.has(h));
  if (day.unassignedWardRounds.length && expected.length) {
    flag('ward-unclear', 'info', `${day.unassignedWardRounds.map((h) => h.display).join(', ')} hold ward round slots not matched to a home`);
  }
  // Duty on an unconfigured round still clashes.
  for (const h of day.unassignedWardRounds) {
    if (dutyByName[h.session] === h.name) {
      flag('duty-clash', 'medium', `${h.display} is duty doctor and holds ward round slots in the ${h.session.toUpperCase()}`, { key: `x:${h.session}`, session: h.session });
    }
  }

  // ── Other activities ────────────────────────────────────────────────
  const actTypes = new Set(config.activityTypes || []);
  for (const h of holdersOfTypes(huddleData, csvStr, actTypes, teamClin)) {
    for (const [type, count] of Object.entries(h.types)) {
      day.activities.push({ type, session: h.session, name: h.name, display: h.display, count });
    }
  }
  day.activities.sort((a, b) => a.session.localeCompare(b.session) || a.type.localeCompare(b.type) || a.display.localeCompare(b.display));

  // ── Plan against EMIS ───────────────────────────────────────────────
  const csvNames = huddleData.clinicians || [];
  const counted = (c) => includeGroups.includes(classifyStaffRole(c.role));
  for (const c of teamClin) {
    if (!counted(c) || c.status === 'left' || c.status === 'administrative') continue;
    const scheduled = getScheduledSessions(data, c.id, dayName) || [];
    const idx = csvNames.findIndex((n) => matchesStaffMember(n, c));
    const totals = idx >= 0 ? sessionSlotTotals(huddleData, csvStr, idx) : { am: 0, pm: 0 };
    for (const s of SESSIONS) {
      const key = s === 'am' ? 'M' : 'A';
      const planned = scheduled.includes(key);
      const away = awayForSession(data, c, iso, dayName, s);
      const onEmis = totals[s] > 0;
      if (planned && !away && !onEmis) {
        day.mismatches.plannedNoEmis.push({ id: c.id, name: c.name, session: s });
        flag('plan-no-emis', 'high', `${c.name} is rota'd ${s.toUpperCase()} but has no EMIS slots`, { key: `${c.id}:${s}`, session: s });
      }
      if (planned && away && onEmis) {
        day.mismatches.emisButAway.push({ id: c.id, name: c.name, session: s, reason: away, slots: totals[s] });
        flag('emis-but-away', 'high', `${c.name} is away ${s.toUpperCase()} (${away.toLowerCase()}) but still has ${totals[s]} EMIS slots`, { key: `${c.id}:${s}`, session: s });
      }
    }
  }
  // EMIS names nobody on the register matches: locums, or new starters not
  // yet set up. Not a fault, but the reviewer should know who they are.
  for (const n of getCliniciansForDate(huddleData, csvStr)) {
    if (!registerMatch(n, teamClin)) day.mismatches.unknownNames.push(n);
  }
  if (day.mismatches.unknownNames.length) {
    flag('unknown-name', 'info', `Not on the register: ${day.mismatches.unknownNames.map((n) => displayNameFor(n, [])).join(', ')}`);
  }

  return day;
}

// ───────────────────────────────────────────────────────────────────────
// The week

const SEV_RANK = { high: 0, medium: 1, info: 2 };

export function assembleWeekReview({ data, huddleData, monday, predictionOptions = null, today = new Date() } = {}) {
  const mon = mondayOf(monday || today);
  const hs = data?.huddleSettings || {};
  const config = resolveWeekReviewConfig(hs, huddleData);
  const sites = data?.roomAllocation?.sites || data?.sites || [];
  const capacityStaffing = hs.capacityStaffing || data?.capacityStaffing || {};
  const includeGroups = Array.isArray(capacityStaffing.groups) && capacityStaffing.groups.length ? capacityStaffing.groups : ['gp'];
  const teamClin = (Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {})).filter((c) => c && c.status !== 'left');

  const days = WEEKDAYS.map((_, i) => {
    const dt = new Date(mon);
    dt.setDate(dt.getDate() + i);
    dt.setHours(12, 0, 0, 0);
    return assembleDay({ data, huddleData, dt, hs, config, sites, capacityStaffing, teamClin, predictionOptions, includeGroups });
  });

  // Staff plan events that start or end inside this week: a new starter,
  // a leaver, a change of sessions, leave beginning or ending.
  const monIso = toLocalIso(mon);
  const friIso = days[4].iso;
  const events = Array.isArray(data?.staffPlan?.events) ? data.staffPlan.events : [];
  const planned = Array.isArray(data?.staffPlan?.plannedPeople) ? data.staffPlan.plannedPeople : [];
  const who = (ref) => teamClin.find((c) => c.id === ref)?.name || planned.find((p) => p.id === ref)?.name || 'Someone';
  const staffChanges = [];
  for (const e of events) {
    const start = eventDate(e);
    const end = e.endDate || null;
    const startsHere = start >= monIso && start <= friIso;
    const endsHere = end && end >= monIso && end <= friIso;
    if (!startsHere && !endsHere) continue;
    const name = who(e.personRef);
    let text;
    if (e.type === 'join') text = `${name} starts${e.sessions != null ? ` on ${e.sessions} sessions` : ''}`;
    else if (e.type === 'leave') text = `${name} leaves`;
    else if (e.type === 'change') text = `${name} changes to ${e.sessions} sessions${e.fromSessions != null ? ` from ${e.fromSessions}` : ''}`;
    else if (startsHere) text = `${name} begins ${e.reason || e.type.replace(/_/g, ' ')}`;
    else text = `${name} returns from ${e.reason || e.type.replace(/_/g, ' ')}`;
    const when = startsHere ? start : end;
    staffChanges.push({ id: e.id || `${e.personRef}:${start}`, date: when, text, type: e.type });
    const d = days.find((x) => x.iso === when);
    if (d) d.flags.push({ id: `${when}:staff-change:${e.id || start}`, kind: 'staff-change', severity: 'info', day: d.dayName, iso: when, text });
  }
  staffChanges.sort((a, b) => a.date.localeCompare(b.date));

  const flags = days.flatMap((d) => d.flags).sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.iso.localeCompare(b.iso));
  const counts = { high: 0, medium: 0, info: 0 };
  for (const f of flags) counts[f.severity] = (counts[f.severity] || 0) + 1;

  return {
    monday: mon,
    mondayIso: monIso,
    fridayIso: friIso,
    label: `${mon.getDate()} ${mon.toLocaleDateString('en-GB', { month: 'short' })}`,
    days,
    flags,
    counts,
    staffChanges,
    config,
    sites,
    hasCsv: !!huddleData,
    hasData: days.some((d) => d.hasData),
    hasDutyConfig: !!(hs.dutyDoctorSlot && (!Array.isArray(hs.dutyDoctorSlot) || hs.dutyDoctorSlot.length > 0)),
    hasTargets: !!hs.expectedCapacity && Object.keys(hs.expectedCapacity).length > 0,
  };
}
