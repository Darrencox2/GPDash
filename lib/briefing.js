// ═══════════════════════════════════════════════════════════════════════════
// lib/briefing.js — assemble the morning briefing for one day
// ═══════════════════════════════════════════════════════════════════════════
//
// One pure function that gathers what the 8am huddle actually reads out:
// who is duty, what urgent capacity looks like against target, who is in
// and who is covered, today's notices, the routine wait, and the pressure
// outlook for the days ahead. The component renders it; a print stylesheet
// turns it into the sheet that gets handed round.
//
// Everything comes from engines that already exist — this file only
// composes, so it stays testable with plain fixtures.

import { getHuddleCapacity, getDutyDoctor, getCliniciansForDate, getNDayAvailability, getBand } from '@/lib/huddle';
import { computeDayStatus, groupAllocationsByCovering, toLocalIso, toHuddleDateStr, matchesStaffMember } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function assembleBriefing({ data, huddleData, huddleMessages, date = new Date(), predictionOptions = null }) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const dateKey = toLocalIso(d);
  const dayName = DAY_NAMES[d.getDay()];
  const csvStr = toHuddleDateStr(d);
  const hs = data?.huddleSettings || {};
  const clinicians = Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {});
  const nameOf = (id) => clinicians.find(c => c.id === id) || null;

  const pred = predictDemand(d, null, predictionOptions || undefined);
  const closed = !!pred?.isBankHoliday || d.getDay() === 0 || d.getDay() === 6
    || !!(data?.closedDays && data.closedDays[dateKey]);

  // ── Duty ─────────────────────────────────────────────────────────────
  const dutySlots = hs.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const dutyName = (session) => {
    if (!hasDuty || !huddleData) return null;
    const duty = getDutyDoctor(huddleData, csvStr, session, dutySlots, clinicians);
    if (!duty) return null;
    const m = clinicians.find(c => matchesStaffMember(duty.name, c));
    return { name: m?.name || duty.name, location: duty.location || null };
  };

  // ── Urgent capacity vs target ────────────────────────────────────────
  const saved = hs.savedSlotFilters || {};
  const cap = huddleData ? getHuddleCapacity(huddleData, csvStr, hs, saved.urgent || null) : null;
  const urgent = { am: null, pm: null };
  for (const s of ['am', 'pm']) {
    const slots = cap ? (cap[s].total || 0) + (cap[s].embargoed || 0) + (cap[s].booked || 0) : 0;
    const target = hs.expectedCapacity?.[dayName]?.[s] || 0;
    urgent[s] = { slots, target, band: getBand(slots, target) };
  }

  // ── Who is in / absent / covered ─────────────────────────────────────
  const status = computeDayStatus(data || {}, dateKey, dayName);
  const entry = data?.allocationHistory?.[dateKey];
  const covering = entry ? groupAllocationsByCovering(entry.allocations || {}, entry.dayOffAllocations || {}, entry.presentIds || []) : {};
  const coverPairs = Object.entries(covering)
    .map(([coverId, t]) => ({
      coverer: nameOf(coverId),
      absent: (t.absent || []).map(nameOf).filter(Boolean),
      dayOff: (t.dayOff || []).map(nameOf).filter(Boolean),
    }))
    .filter(p => p.coverer && (p.absent.length || p.dayOff.length));

  // EMIS view of who actually has slots today (may differ from the plan).
  const inFromCsv = huddleData ? getCliniciansForDate(huddleData, csvStr) : [];

  // ── Routine wait ─────────────────────────────────────────────────────
  const routineDays = huddleData ? getNDayAvailability(huddleData, hs, 28, saved.routine || null) : [];
  const firstOpen = routineDays.find(x => !x.isWeekend && (x.available || 0) > 0);
  const routineWait = firstOpen
    ? { days: routineDays.indexOf(firstOpen), date: firstOpen.date, available: firstOpen.available }
    : null;

  // ── Outlook: the next 5 weekdays ─────────────────────────────────────
  const outlook = [];
  const cursor = new Date(d);
  while (outlook.length < 5) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) continue;
    const p = predictDemand(new Date(cursor), null, predictionOptions || undefined);
    const cStr = toHuddleDateStr(cursor);
    const c = huddleData ? getHuddleCapacity(huddleData, cStr, hs, saved.urgent || null) : null;
    const urgentSlots = c ? (c.am.total || 0) + (c.am.embargoed || 0) + (c.am.booked || 0) + (c.pm.total || 0) + (c.pm.embargoed || 0) + (c.pm.booked || 0) : null;
    outlook.push({
      date: new Date(cursor), dayName: DAY_NAMES[dow],
      predicted: p?.isBankHoliday ? null : (p?.predicted ? Math.round(p.predicted) : null),
      isBankHoliday: !!p?.isBankHoliday,
      urgentSlots,
    });
  }

  return {
    dateKey, dayName, date: d, closed,
    closedReason: pred?.isBankHoliday ? 'Bank holiday' : (data?.closedDays?.[dateKey] || (d.getDay() % 6 === 0 ? 'Weekend' : null)),
    predicted: pred?.predicted ? Math.round(pred.predicted) : null,
    duty: { am: dutyName('am'), pm: dutyName('pm') },
    urgent,
    present: (status.present || []).map(nameOf).filter(Boolean),
    absent: (status.absent || []).map(nameOf).filter(Boolean),
    dayOff: (status.dayOff || []).map(nameOf).filter(Boolean),
    coverPairs,
    inFromCsvCount: inFromCsv.length,
    notices: (huddleMessages || []).map(m => ({ text: m.text || m.message || String(m), author: m.author || null })),
    routineWait,
    outlook,
    hasCsv: !!huddleData,
  };
}
