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
import { parseHuddleDateStr, getSlotRowsForClinicianDate, getCliniciansForDate } from './huddle';

export const SLOTS = ['M', 'A', 'E'];
export const SLOT_LABELS = { M: 'Morning', A: 'Afternoon', E: 'Evening' };

const M_END = 12 * 60 + 30;   // before 12:30 -> morning
const A_START = 14 * 60;      // from 14:00  -> afternoon
const E_START = 18 * 60 + 30; // from 18:30  -> evening

export function classifySlotTime(timeStr) {
  if (!timeStr) return null;
  const t = String(timeStr).toLowerCase();
  if (t.includes('before')) return 'M'; // EMIS "Before noon" block
  if (t.includes('after')) return 'A';  // EMIS "After noon" block
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (mins < M_END) return 'M';
  if (mins >= E_START) return 'E';
  if (mins >= A_START) return 'A';
  return null; // deliberate buffer zone
}

// Which of M/A/E a clinician actually worked on a date, judged from
// appointment times in the CSV. Excluded slot types are ignored.
export function getWorkedSlots(huddleData, csvDateStr, csvName, huddleSettings = {}) {
  const rows = getSlotRowsForClinicianDate(huddleData, csvDateStr, csvName) || [];
  const excluded = new Set(huddleSettings?.slotCategories?.excluded || []);
  const worked = new Set();
  for (const r of rows) {
    if (excluded.has(r.slotType)) continue;
    const slot = classifySlotTime(r.time);
    if (slot) worked.add(slot);
  }
  return worked;
}

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

// Infer a regular GP's expected weekly pattern at M/A/E granularity from
// history. Adapts the auto-generate-working-days idea (lib/auto-rota.js)
// to three slots. A slot is EXPECTED on a weekday when the GP worked it in
// >=60% of that weekday's observed CSV dates (min 2 occurrences). This is
// recomputed from history rather than stored, so it self-updates as
// patterns genuinely change.
export function inferSlotPattern(huddleData, clinician, huddleSettings = {}, { todayMs = Date.now() } = {}) {
  const past = csvDates(huddleData, { upToMs: todayMs }).filter(({ d }) => d.getTime() < todayMs);
  const seen = {};   // dayName -> dates observed
  const worked = {}; // dayName -> { M: n, A: n, E: n }
  for (const { ds, dayName } of past) {
    const names = getCliniciansForDate(huddleData, ds);
    if (!names.length) continue;
    (seen[dayName] = seen[dayName] || []).push(ds);
    const csvName = names.find((n) => matchesStaffMember(n, clinician));
    if (!csvName) continue;
    const slots = getWorkedSlots(huddleData, ds, csvName, huddleSettings);
    const w = (worked[dayName] = worked[dayName] || { M: 0, A: 0, E: 0 });
    slots.forEach((sl) => { w[sl] += 1; });
  }
  const pattern = {};
  for (const dayName of DAYS) {
    const obs = (seen[dayName] || []).length;
    const w = worked[dayName] || { M: 0, A: 0, E: 0 };
    pattern[dayName] = SLOTS.filter((sl) => obs >= 2 && w[sl] >= 2 && w[sl] / obs >= 0.6);
  }
  return pattern;
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
    const pattern = inferSlotPattern(huddleData, gp, hs);
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
  const gpDefault = Number(rates.gpExtraDefault) || 0;
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
    let sessions = 0;
    for (const { ds } of monthDates) {
      const names = getCliniciansForDate(huddleData, ds);
      const csvName = names.find((n) => matchesStaffMember(n, lc));
      if (!csvName) continue;
      sessions += getWorkedSlots(huddleData, ds, csvName, hs).size;
    }
    if (!sessions) continue;
    const rate = Number(locumRates[lc.id]) || 0;
    locumLines.push({ id: lc.id, name: lc.name, sessions, rate, total: sessions * rate, rateMissing: !rate });
  }

  const extraLines = [];
  for (const [key, dec] of Object.entries(decisions)) {
    if (dec?.verdict !== 'extra') continue;
    const [clinicianId, iso, slot] = key.split('|');
    if (!iso?.startsWith(month)) continue;
    const c = byId[clinicianId];
    if (!c) continue;
    const rate = Number(gpRates[clinicianId]) || gpDefault;
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
