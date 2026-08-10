// lib/cover-regen.js
//
// Central buddy-cover regeneration for the next 4 weeks - the engine
// behind AUTO-regeneration: instead of the user pressing "generate next
// 4 weeks" after every change, the dashboard watches every cover input
// (statuses, wind-downs, presence overrides, absences, rota, closed
// days) and calls this when any of them change.
//
// Manual override preservation: regeneration used to overwrite entries
// wholesale, losing hand-made reassignments. Here each existing entry's
// manualOverrides are RE-APPLIED after regeneration when still valid
// (the chosen coverer is present that day and the covered person still
// needs that type of cover); overrides invalidated by the new reality
// are dropped from the entry - the audit trail keeps their record.
//
// Pure function: takes data, returns { changed, data, daysGenerated }.

import {
  DAYS, toLocalIso, computeDayStatus, generateBuddyAllocations, DEFAULT_SETTINGS,
} from './data';

const IDX_TO_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function reapplyOverrides(entry, prevOverrides) {
  // REALITY (proven by execution, not the modal's grouped view): the
  // generator's maps are FLAT - { absentId: covererId }.
  const kept = [];
  for (const ov of prevOverrides || []) {
    const field = ov.type === 'dayOff' ? 'dayOffAllocations' : 'allocations';
    const map = { ...(entry[field] || {}) };
    if (!(ov.absentId in map)) continue; // no longer needs this cover - drop
    if (!(entry.presentIds || []).includes(ov.toCovererId)) continue; // chosen coverer not in - drop
    map[ov.absentId] = ov.toCovererId;
    entry[field] = map;
    kept.push(ov);
  }
  if (kept.length) entry.manualOverrides = kept;
  return entry;
}

export function regenerateCoverWindow(data, { days = 28 } = {}) {
  const clins = (Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {}))
    .filter((c) => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newHistory = { ...(data.allocationHistory || {}) };
  let daysChanged = 0;

  // STABILITY RULE (proven necessary by execution): the allocation engine
  // breaks ties randomly, so regenerating an unchanged day reshuffles who
  // covers whom - disruptive when people have already seen their cover.
  // A day is regenerated ONLY when its own status inputs (present /
  // absent / dayOff / overrides) differ from what its stored entry was
  // built from; otherwise the stored allocation is kept verbatim. This
  // also makes the whole regeneration idempotent.
  const sig = (present, absent, dayOff, hasOverride, overriddenIds) =>
    JSON.stringify([present, absent, dayOff, !!hasOverride, overriddenIds || []]);

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dayIndex = d.getDay();
    if (dayIndex === 0 || dayIndex === 6) continue;
    const dayName = IDX_TO_DAY[dayIndex];
    if (!DAYS.includes(dayName)) continue;
    const dateKey = toLocalIso(d);
    if (data.closedDays?.[dateKey]) {
      if (newHistory[dateKey]) { delete newHistory[dateKey]; daysChanged += 1; }
      continue;
    }

    const status = computeDayStatus(data, dateKey, dayName);
    const wantSig = sig(status.present, status.absent, status.dayOff, status.hasOverride, status.overriddenIds);
    const prev = newHistory[dateKey];
    if (prev) {
      const prevSig = sig(prev.presentIds, prev.absentIds, prev.dayOffIds, prev.hasOverride, prev.overriddenIds);
      if (prevSig === wantSig) continue; // day unchanged - keep allocation verbatim
    }

    const { allocations, dayOffAllocations } = generateBuddyAllocations(
      clins, status.present, status.absent, status.dayOff, data.settings || DEFAULT_SETTINGS
    );
    let entry = {
      date: dateKey,
      day: dayName,
      allocations,
      dayOffAllocations,
      presentIds: status.present,
      absentIds: status.absent,
      dayOffIds: status.dayOff,
      hasOverride: status.hasOverride,
      overriddenIds: status.overriddenIds,
    };
    entry = reapplyOverrides(entry, prev?.manualOverrides);
    newHistory[dateKey] = entry;
    daysChanged += 1;
  }

  if (!daysChanged) return { changed: false, data, daysGenerated: 0 };
  return {
    changed: true,
    data: { ...data, allocationHistory: newHistory },
    daysGenerated: daysChanged,
  };
}

// The fingerprint of everything that can change cover. The dashboard
// watches this string; when it moves (after initial load), it regenerates.
// allocationHistory itself is deliberately EXCLUDED so regeneration never
// re-triggers itself.
export function coverInputsFingerprint(data) {
  if (!data) return '';
  const clins = (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {}))
    .map((c) => [c.id, c.status || '', c.buddyCover ? 1 : 0, c.windDown ? `${c.windDown.type}:${c.windDown.endDate}` : '']);
  return JSON.stringify({
    c: clins,
    r: data.weeklyRota || {},
    s: data.sessionRota || {},
    a: data.plannedAbsences || [],
    o: data.dailyOverrides || {},
    x: data.closedDays || {},
  });
}
