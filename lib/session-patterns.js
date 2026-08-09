// lib/session-patterns.js
//
// THE single source of truth for "when does this clinician usually work"
// at Morning / Afternoon / Evening granularity. Consumed by the working
// days grid (Practice -> Clinicians), the locum spend tracker, and the
// buddy pages - one definition, so what spend flags as "outside their
// pattern" is literally the pattern visible and correctable in the grid.
//
// Model (user spec): AUTO-GENERATED from EMIS history, with manual
// corrections ("pins") on top, and uncertainty made visible.
//  - Inference: a slot is ON for a weekday when worked in >=60% of that
//    weekday's observed CSV dates (min 2 occurrences).
//  - Confidence: 'confident' when the history speaks clearly (>=80% or
//    <=20% with 3+ observations), 'uncertain' otherwise - the grid shows
//    amber for uncertain so the eye goes where a correction may be needed.
//  - Pins: stored per clinician/day/slot in
//    huddleSettings.sessionPatternOverrides (persisted settings path), as
//    'on' | 'off'. A pinned slot ignores inference entirely.

import { DAYS, matchesStaffMember } from './data';
import { parseHuddleDateStr, getCliniciansForDate, getSlotRowsForClinicianDate } from './huddle';
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

const DAY_FROM_NUM = [null, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', null];

// Raw inference with per-slot statistics.
// Returns { [dayName]: { [slot]: { ratio, obs, on, confidence } } }
export function inferPatternStats(huddleData, clinician, huddleSettings = {}, {
  todayMs = Date.now(), lookbackDays = 120,
} = {}) {
  const stats = {};
  for (const day of DAYS) {
    stats[day] = {};
    for (const sl of SLOTS) stats[day][sl] = { ratio: 0, obs: 0, on: false, confidence: 'uncertain' };
  }
  if (!huddleData?.dates?.length || !clinician) return stats;

  const cutoff = todayMs - lookbackDays * 86400000;
  const seen = {};
  const worked = {};
  for (const ds of huddleData.dates) {
    const d = parseHuddleDateStr(ds);
    if (!d || isNaN(d)) continue;
    const t = d.getTime();
    if (t < cutoff || t >= todayMs) continue;
    const dayName = DAY_FROM_NUM[d.getDay()];
    if (!dayName) continue;
    const names = getCliniciansForDate(huddleData, ds);
    if (!names.length) continue;
    seen[dayName] = (seen[dayName] || 0) + 1;
    const csvName = names.find((n) => matchesStaffMember(n, clinician));
    if (!csvName) continue;
    const slots = getWorkedSlots(huddleData, ds, csvName, huddleSettings);
    const w = (worked[dayName] = worked[dayName] || { M: 0, A: 0, E: 0 });
    slots.forEach((sl) => { w[sl] += 1; });
  }

  for (const day of DAYS) {
    const obs = seen[day] || 0;
    for (const sl of SLOTS) {
      const hits = worked[day]?.[sl] || 0;
      const ratio = obs > 0 ? hits / obs : 0;
      const on = obs >= 2 && hits >= 2 && ratio >= 0.6;
      // Clear history either way -> confident; middling or thin -> uncertain
      const decisive = obs >= 3 && (ratio >= 0.8 || ratio <= 0.2);
      stats[day][sl] = { ratio, obs, on, confidence: decisive ? 'confident' : 'uncertain' };
    }
  }
  return stats;
}

// Pins from settings: hs.sessionPatternOverrides[clinicianId][day][slot] = 'on'|'off'
export function getPatternPins(huddleSettings, clinicianId) {
  return huddleSettings?.sessionPatternOverrides?.[clinicianId] || {};
}

// The effective pattern: inference with pins applied.
// Returns { [dayName]: { slots: ['M','A'], detail: { [slot]: {
//   on, source: 'inferred'|'pinned', confidence: 'confident'|'uncertain'|null,
//   ratio, obs } } } }
// Pinned slots have confidence null - a human decided, no uncertainty.
export function getEffectivePattern(huddleData, clinician, huddleSettings = {}, opts = {}) {
  const stats = inferPatternStats(huddleData, clinician, huddleSettings, opts);
  const pins = getPatternPins(huddleSettings, clinician?.id);
  const out = {};
  for (const day of DAYS) {
    const detail = {};
    for (const sl of SLOTS) {
      const pin = pins?.[day]?.[sl];
      if (pin === 'on' || pin === 'off') {
        detail[sl] = { on: pin === 'on', source: 'pinned', confidence: null, ratio: stats[day][sl].ratio, obs: stats[day][sl].obs };
      } else {
        const st = stats[day][sl];
        detail[sl] = { on: st.on, source: 'inferred', confidence: st.confidence, ratio: st.ratio, obs: st.obs };
      }
    }
    out[day] = { slots: SLOTS.filter((sl) => detail[sl].on), detail };
  }
  return out;
}

// Cycle a pin: inferred -> pinned-on -> pinned-off -> inferred.
// Returns the new sessionPatternOverrides object for huddleSettings.
export function cyclePatternPin(huddleSettings, clinicianId, day, slot) {
  const all = { ...(huddleSettings?.sessionPatternOverrides || {}) };
  const mine = { ...(all[clinicianId] || {}) };
  const dayPins = { ...(mine[day] || {}) };
  const cur = dayPins[slot];
  if (cur === 'on') dayPins[slot] = 'off';
  else if (cur === 'off') delete dayPins[slot];
  else dayPins[slot] = 'on';
  if (Object.keys(dayPins).length) mine[day] = dayPins; else delete mine[day];
  if (Object.keys(mine).length) all[clinicianId] = mine; else delete all[clinicianId];
  return all;
}

// Compact label for a day's pattern, e.g. "AM + PM", "AM only", "Not in".
export function patternDayLabel(dayPattern) {
  const slots = dayPattern?.slots || [];
  if (!slots.length) return 'Not in';
  const names = { M: 'AM', A: 'PM', E: 'Eve' };
  return slots.map((sl) => names[sl]).join(' + ') + (slots.length === 1 ? ' only' : '');
}
