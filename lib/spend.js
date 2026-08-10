// lib/spend.js
//
// Locum spend tracking. Pure functions, no React.
//
// Two spend sources (user spec, 2026-08):
//  1. Actual locums on the staff register - every EMIS session they work
//     is paid at that locum's rate. Straightforward: sessions x rate.
//  2. Regular GPs doing EXTRA sessions beyond their normal pattern -
//     effectively locum sessions too. The system flags candidates and the
//     user confirms/denies each one in a review queue (a swap is not an
//     extra). Decisions are stored so nothing is asked twice.
//
// SESSION SLOTS - the three-zone model with DELIBERATE buffer gaps.
// Duty sessions bleed across tidy boundaries (morning duty runs to 13:00,
// afternoon duty starts at 13:00), so hard borders would misclassify duty
// doctors. Instead: three zones of confidence, dead space between them.
//   Morning   = any appointment BEFORE 12:30
//   Afternoon = any appointment FROM 14:00 (before 18:30)
//   Evening   = any appointment FROM 18:30
// A session sitting entirely inside a buffer (e.g. only a 13:00 slot)
// trips nothing - agreed behaviour, watch for it in the review queue.

import { DAYS, matchesStaffMember, toHuddleDateStr } from './data';
import { SLOTS, SLOT_LABELS, classifySlotTime, getWorkedSlots, getEffectivePattern } from './session-patterns';
export { SLOTS, SLOT_LABELS, classifySlotTime, getWorkedSlots };
import { parseHuddleDateStr, getSlotRowsForClinicianDate, getCliniciansForDate } from './huddle';


// Role predicates. Locums are identified by role, same convention as the
// buddy-pool logic in lib/data.js.
export const isLocum = (c) => /locum/i.test(c?.role || '');
export const isRegularGP = (c) =>
  !isLocum(c) &&
  /(gp|doctor|registrar)/i.test(c?.role || '') &&
  !/gp assistant/i.test(c?.role || '');

const DAY_KEY_FROM_NUM = [null, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', null];

// Build past dates (with CSV data, weekdays only), oldest first, as
// { ds, d, dayName, iso } - shared by pattern inference and detection.
function csvDates(huddleData, { upToMs = Date.now(), lookbackDays = 120 } = {}) {
  const cutoff = upToMs - lookbackDays * 86400000;
  return (huddleData?.dates || [])
    .map((ds) => ({ ds, d: parseHuddleDateStr(ds) }))
    .filter(({ d }) => d && !isNaN(d) && DAY_KEY_FROM_NUM[d.getDay()])
    .filter(({ d }) => d.getTime() >= cutoff)
    .sort((a, b) => a.d - b.d)
    .map((x) => ({ ...x, dayName: DAY_KEY_FROM_NUM[x.d.getDay()] }));
}


export const decisionKey = (clinicianId, isoDate, slot) => `${clinicianId}|${isoDate}|${slot}`;

const isoOf = (d) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Find candidate extra sessions: regular GPs working a slot outside their
// expected pattern. Includes swap context - if the GP's total slots that
// week match their expected weekly total, it is probably a swap, and the
// review card says so. Already-decided candidates are filtered out.
export function findCandidateExtras({ huddleData, data, monthsBack = 3 }) {
  if (!huddleData?.dates?.length) return [];
  const hs = data?.huddleSettings || {};
  const decisions = data?.spendDecisions || {};
  const gps = (Array.isArray(data?.clinicians) ? data.clinicians : [])
    .filter((c) => c.status !== 'left' && c.status !== 'administrative')
    .filter(isRegularGP);
  if (!gps.length) return [];

  const todayMs = new Date().setHours(23, 59, 59, 999);
  const fromMs = new Date(new Date().getFullYear(), new Date().getMonth() - monthsBack, 1).getTime();
  const dates = csvDates(huddleData, { upToMs: todayMs, lookbackDays: 400 })
    .filter(({ d }) => d.getTime() >= fromMs && d.getTime() <= todayMs);

  const out = [];
  for (const gp of gps) {
    // Effective pattern from the SHARED engine (lib/session-patterns.js):
    // inference plus any manual pins from the working days grid, so what
    // gets flagged here is exactly the pattern visible in the grid.
    const eff = getEffectivePattern(huddleData, gp, hs, { data });
    const pattern = Object.fromEntries(DAYS.map((day) => [day, eff[day].slots]));
    const expectedWeekly = DAYS.reduce((s, day) => s + pattern[day].length, 0);
    if (expectedWeekly === 0) continue; // no baseline - cannot judge "extra"

    // Group this GP's actual slots by ISO week (Mon-based)
    const byWeek = {};
    for (const { ds, d, dayName } of dates) {
      const names = getCliniciansForDate(huddleData, ds);
      const csvName = names.find((n) => matchesStaffMember(n, gp));
      if (!csvName) continue;
      const slots = getWorkedSlots(huddleData, ds, csvName, hs);
      if (!slots.size) continue;
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const wk = isoOf(monday);
      (byWeek[wk] = byWeek[wk] || []).push({ d, dayName, slots });
    }

    for (const [wk, daysArr] of Object.entries(byWeek)) {
      const weekTotal = daysArr.reduce((s, x) => s + x.slots.size, 0);
      const likelySwap = weekTotal === expectedWeekly;
      for (const { d, dayName, slots } of daysArr) {
        for (const slot of slots) {
          if (pattern[dayName].includes(slot)) continue; // normal work
          const iso = isoOf(d);
          const key = decisionKey(gp.id, iso, slot);
          if (decisions[key]) continue; // already reviewed
          out.push({
            key,
            clinicianId: gp.id,
            name: gp.name,
            date: iso,
            dayName,
            slot,
            slotLabel: SLOT_LABELS[slot],
            weekOf: wk,
            weekTotal,
            expectedWeekly,
            likelySwap,
            expectedThatDay: pattern[dayName],
          });
        }
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Effective-dated rates. A rate entry is either a plain number (legacy -
// applies to all time) or an array of { from: 'YYYY-MM-DD', rate } steps.
// Changing a rate must never silently rewrite history: past months keep
// the rate that was in force at the time.
export function rateForDate(entry, isoDate) {
  if (entry == null) return 0;
  if (typeof entry === 'number') return entry;
  if (!Array.isArray(entry)) return Number(entry) || 0;
  let best = 0;
  let bestFrom = '';
  for (const step of entry) {
    if (!step?.from || !(step.from <= isoDate)) continue;
    if (step.from >= bestFrom) { bestFrom = step.from; best = Number(step.rate) || 0; }
  }
  // Before the first dated step, use the earliest step's rate (covers
  // history from before rates were effective-dated).
  if (!bestFrom && entry.length) {
    const sorted = [...entry].sort((a, b) => (a.from < b.from ? -1 : 1));
    best = Number(sorted[0]?.rate) || 0;
  }
  return best;
}

export function currentRate(entry) {
  return rateForDate(entry, '9999-12-31');
}

// Append a dated rate step (replacing any step already dated today).
export function withRateStep(entry, rate, fromIso) {
  const steps = Array.isArray(entry) ? entry.filter((st) => st.from !== fromIso)
    : (typeof entry === 'number' && entry > 0 ? [{ from: '1970-01-01', rate: entry }] : []);
  if (rate > 0 || steps.length) steps.push({ from: fromIso, rate: Number(rate) || 0 });
  return steps;
}

// EMIS names the register cannot classify: either no register match at
// all, or matched to an entry with a blank role (so locum vs GP is
// unknowable). These are very often ad-hoc locums - the biggest hole in
// the spend number. lookbackDays keeps it to recent, actionable names.
export function findUnclassifiedNames({ huddleData, data, lookbackDays = 60 }) {
  if (!huddleData?.dates?.length) return [];
  const clinicians = Array.isArray(data?.clinicians) ? data.clinicians : [];
  const cutoff = Date.now() - lookbackDays * 86400000;
  const seen = {};
  for (const ds of huddleData.dates) {
    const d = parseHuddleDateStr(ds);
    if (!d || isNaN(d) || d.getTime() < cutoff || d.getTime() > Date.now()) continue;
    for (const name of getCliniciansForDate(huddleData, ds)) {
      const match = clinicians.find((c) => matchesStaffMember(name, c));
      if (match && (match.role || '').trim()) continue; // classifiable
      const key = name;
      if (!seen[key]) seen[key] = { csvName: name, dates: 0, status: match ? 'noRole' : 'unknown', registerName: match?.name || null };
      seen[key].dates += 1;
    }
  }
  return Object.values(seen).sort((a, b) => b.dates - a.dates);
}

// Monthly rollup. month = 'YYYY-MM'.
// Locum spend: every M/A/E slot a locum worked that month x their rate.
// Extras spend: confirmed extra decisions in that month x the GP's extra
// rate (per-GP override, else the practice-wide default).
// Totals are computed live - the review queue is the human control, so a
// month needs no separate sign-off.
export function computeMonthlySpend({ huddleData, data, month }) {
  const hs = data?.huddleSettings || {};
  const rates = data?.spendRates || {};
  const locumRates = rates.locums || {};
  const gpRates = rates.gpExtra || {};
  const decisions = data?.spendDecisions || {};
  const clinicians = Array.isArray(data?.clinicians) ? data.clinicians : [];
  const byId = Object.fromEntries(clinicians.map((c) => [c.id, c]));

  const locums = clinicians.filter((c) => c.status !== 'left' && isLocum(c));
  const [yy, mm] = month.split('-').map(Number);
  const monthDates = (huddleData?.dates || [])
    .map((ds) => ({ ds, d: parseHuddleDateStr(ds) }))
    .filter(({ d }) => d && !isNaN(d) && d.getFullYear() === yy && d.getMonth() + 1 === mm && d.getTime() <= Date.now());

  const locumLines = [];
  for (const lc of locums) {
    // Group sessions by the rate in force on each date. A mid-month rate
    // change therefore produces two exact lines, never a blended average.
    const byRate = new Map();
    for (const { ds, d } of monthDates) {
      const names = getCliniciansForDate(huddleData, ds);
      const csvName = names.find((n) => matchesStaffMember(n, lc));
      if (!csvName) continue;
      const n = getWorkedSlots(huddleData, ds, csvName, hs).size;
      if (!n) continue;
      const rate = rateForDate(locumRates[lc.id], isoOf(d));
      byRate.set(rate, (byRate.get(rate) || 0) + n);
    }
    for (const [rate, sessions] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      locumLines.push({ id: lc.id, name: lc.name, sessions, rate, total: sessions * rate, rateMissing: !rate });
    }
  }
  locumLines.sort((a, b) => a.name.localeCompare(b.name) || a.rate - b.rate);

  const extraLines = [];
  for (const [key, dec] of Object.entries(decisions)) {
    if (dec?.verdict !== 'extra') continue;
    const [clinicianId, iso, slot] = key.split('|');
    if (!iso?.startsWith(month)) continue;
    const c = byId[clinicianId];
    if (!c) continue;
    const rate = rateForDate(gpRates[clinicianId], iso) || rateForDate(rates.gpExtraDefault, iso);
    extraLines.push({ id: clinicianId, name: c.name, date: iso, slot, slotLabel: SLOT_LABELS[slot] || slot, rate, total: rate, rateMissing: !rate });
  }
  extraLines.sort((a, b) => (a.date < b.date ? 1 : -1));

  const locumTotal = locumLines.reduce((s, l) => s + l.total, 0);
  const extraTotal = extraLines.reduce((s, l) => s + l.total, 0);
  return { locumLines, extraLines, locumTotal, extraTotal, grandTotal: locumTotal + extraTotal };
}

// Recent months list for the picker: current month back to the oldest CSV
// date, capped at 12.
export function availableMonths(huddleData) {
  const months = new Set();
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  for (const ds of huddleData?.dates || []) {
    const d = parseHuddleDateStr(ds);
    if (d && !isNaN(d) && d.getTime() <= Date.now()) {
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }
  return Array.from(months).sort().reverse().slice(0, 12);
}

export { toHuddleDateStr };


// Human-readable history of an effective-dated rate entry, newest first.
export function describeRateHistory(entry) {
  if (entry == null) return [];
  if (typeof entry === 'number') return entry > 0 ? [`\u00a3${entry} (all time)`] : [];
  if (!Array.isArray(entry)) return [];
  return [...entry]
    .sort((a, b) => (a.from < b.from ? 1 : -1))
    .map((st) => `\u00a3${Number(st.rate) || 0} from ${st.from === '1970-01-01' ? 'the start' : new Date(st.from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);
}
