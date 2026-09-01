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

import { getHuddleCapacity, getDutyDoctor, getCliniciansForDate, getNDayAvailability, getBand, getClinicianSessionLocations, getSiteColour } from '@/lib/huddle';
import { computeDayStatus, groupAllocationsByCovering, toLocalIso, toHuddleDateStr, matchesStaffMember } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Absence reasons are stored as the picker's values ('annual_leave'), as
// free text from older entries, or as a wind-down label. Show all three
// as readable English rather than making the huddle decode snake_case.
//
// The leaving wind-down is NOT working notice: the person has gone, and
// cover continues only so their outstanding results and letters get
// reviewed by someone. Label it for what it is.
const REASON_LABELS = {
  unwell: 'Off sick', sick: 'Off sick', annual_leave: 'Holiday', training: 'Training',
  study_leave: 'Study leave', parental_leave: 'Parental leave',
  compassionate: 'Compassionate leave', other: 'Absent',
  long_term_absence: 'Long-term sick', 'leaving_-_wind_down_cover': 'Left — results wind-down',
};
const ACRONYMS = { cpd: 'CPD', gp: 'GP', anp: 'ANP', hca: 'HCA', it: 'IT', tarp: 'TARP' };
export function labelReason(raw) {
  if (!raw) return 'Absent';
  const key = String(raw).toLowerCase().replace(/\s+/g, '_');
  if (REASON_LABELS[key]) return REASON_LABELS[key];
  // Free text and older values: sentence case, but never flatten an
  // acronym - "Training/CPD" must not come out as "Training/Cpd".
  return String(raw).replace(/_/g, ' ').trim()
    .split(/(\s+|\/)/)
    .map((part, i) => {
      const w = part.toLowerCase();
      if (ACRONYMS[w]) return ACRONYMS[w];
      if (/^\s+$/.test(part) || part === '/') return part;
      return i === 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part.toLowerCase();
    })
    .join('');
}

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

  // ── Who is where ─────────────────────────────────────────────────────
  // EMIS knows the site because it knows where the slots are. Split-site
  // clinicians carry a different site per session; everyone else gets one.
  const sites = data?.roomAllocation?.sites || [];
  const sessionLocs = huddleData ? getClinicianSessionLocations(huddleData, csvStr) : {};
  const locOf = (c) => {
    for (const [csvName, locs] of Object.entries(sessionLocs)) {
      if (matchesStaffMember(csvName, c)) return locs;
    }
    return null;
  };
  const presentWithSite = (status.present || []).map(nameOf).filter(Boolean).map((c) => {
    const l = locOf(c);
    const split = !!(l && l.am && l.pm && l.am !== l.pm);
    return { ...c, site: l ? (l.am || l.pm) : null, siteAm: l?.am || null, sitePm: l?.pm || null, split };
  });
  // Group by site, in the practice's own site order, unplaced last.
  const siteOrder = sites.map(x => x.name);
  const rank = (name) => {
    if (!name) return 999;
    const i = siteOrder.findIndex(sn => sn === name || sn.toLowerCase().startsWith(String(name).toLowerCase()) || String(name).toLowerCase().startsWith(sn.toLowerCase()));
    return i < 0 ? 998 : i;
  };
  const bySite = {};
  for (const p of presentWithSite) {
    const key = p.site || '';
    if (!bySite[key]) bySite[key] = [];
    bySite[key].push(p);
  }
  const teamBySite = Object.entries(bySite)
    .map(([site, members]) => ({
      site: site || null,
      colour: site ? getSiteColour(site, sites) : '#64748b',
      members: members.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .sort((a, b) => rank(a.site) - rank(b.site));

  // ── Why each absent person is away ───────────────────────────────────
  const absList = Array.isArray(data?.plannedAbsences) ? data.plannedAbsences : [];
  const reasonOf = (id) => {
    const hit = absList.find(a => a.clinicianId === id && dateKey >= a.startDate && dateKey <= a.endDate);
    if (hit) return labelReason(hit.reason);
    const c = clinicians.find(x => x.id === id);
    const wd = c?.windDown;
    if (wd && dateKey >= wd.startDate && dateKey <= wd.endDate) return wd.type === 'sick' ? 'Long-term sick' : 'Left — results wind-down';
    return 'Absent';
  };

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
    const rDay = routineDays.find(x => x.date === cStr);
    const oTarget = (hs.expectedCapacity?.[DAY_NAMES[dow]]?.am || 0) + (hs.expectedCapacity?.[DAY_NAMES[dow]]?.pm || 0);
    outlook.push({
      date: new Date(cursor), dayName: DAY_NAMES[dow],
      predicted: p?.isBankHoliday ? null : (p?.predicted ? Math.round(p.predicted) : null),
      isBankHoliday: !!p?.isBankHoliday,
      urgentSlots,
      routineSlots: rDay ? (rDay.available ?? null) : null,
      target: oTarget,
      // Same banding the rest of the site uses, so a colour means the
      // same thing here as it does on Today.
      band: oTarget > 0 && urgentSlots != null ? getBand(urgentSlots, oTarget) : null,
    });
  }

  return {
    dateKey, dayName, date: d, closed,
    closedReason: pred?.isBankHoliday ? 'Bank holiday' : (data?.closedDays?.[dateKey] || (d.getDay() % 6 === 0 ? 'Weekend' : null)),
    predicted: pred?.predicted ? Math.round(pred.predicted) : null,
    duty: { am: dutyName('am'), pm: dutyName('pm') },
    urgent,
    present: presentWithSite,
    teamBySite,
    sites,
    absent: (status.absent || []).map(id => { const c = nameOf(id); return c ? { ...c, reason: reasonOf(id) } : null; }).filter(Boolean),
    dayOff: (status.dayOff || []).map(nameOf).filter(Boolean),
    coverPairs,
    inFromCsvCount: inFromCsv.length,
    notices: (huddleMessages || []).map(m => ({ text: m.text || m.message || String(m), author: m.author || null })),
    routineWait,
    outlook,
    hasCsv: !!huddleData,
  };
}
