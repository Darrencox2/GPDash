// lib/workforce.js
//
// Pure engine for the Workforce planner — the interactive session allocator.
// No React, no I/O, so it can be unit-tested and reused.
//
// Model:
//   • Contracted baseline = working_patterns (each clinician's 'in'/'off' per
//     weekday AM/PM). This is the same "working week grid" used elsewhere in
//     GPdash, read live — the single source of truth.
//   • Allocation = the planned grid the user drags people around in:
//        allocation[day][session] = [clinicianId, ...]
//     Initialised from the contracted baseline; the user re-rosters on top.
//   • Activities = things needing a body in a given cell:
//        { id, day, session, label, assignedClinicianId|null }
//     Assigning a clinician to an activity does not remove them from the
//     session (they are still working it) — it just marks what they are doing.
//   • Anomalies = where the planned allocation drifts from the contract, or an
//     activity is still unassigned.

export const WF_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WF_DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
export const WF_SESSIONS = ['am', 'pm'];

export function cellKey(day, session) { return `${day}_${session}`; }

// Is a clinician included given the role filter? null/empty filter = everyone.
export function isIncluded(clin, includedRoles) {
  if (!includedRoles || includedRoles.length === 0) return true;
  return includedRoles.includes(clin?.role || '__none__');
}

// Distinct roles present in the team (for the role filter UI).
export function rolesInTeam(clinicians) {
  const seen = new Set();
  for (const c of clinicians || []) seen.add(c?.role || 'No role');
  return [...seen].sort();
}

function isContracted(patternById, id, day, session) {
  const cell = patternById?.[id]?.[day];
  return !!(cell && cell[session] === 'in');
}

// Build the contracted baseline allocation from working patterns.
export function buildContracted(clinicians, patternById) {
  const grid = {};
  for (const day of WF_DAYS) {
    grid[day] = { am: [], pm: [] };
    for (const s of WF_SESSIONS) {
      for (const c of clinicians || []) {
        if (isContracted(patternById, c.id, day, s)) grid[day][s].push(c.id);
      }
    }
  }
  return grid;
}

// Deep clone an allocation grid.
export function cloneAllocation(grid) {
  const out = {};
  for (const day of WF_DAYS) {
    out[day] = { am: [...(grid?.[day]?.am || [])], pm: [...(grid?.[day]?.pm || [])] };
  }
  return out;
}

// Drop any allocated ids that are not in the current clinician set (e.g. a
// saved plan referencing someone who has since left).
export function pruneAllocation(grid, validIds) {
  const ok = new Set(validIds);
  const out = {};
  for (const day of WF_DAYS) {
    out[day] = {
      am: (grid?.[day]?.am || []).filter(id => ok.has(id)),
      pm: (grid?.[day]?.pm || []).filter(id => ok.has(id)),
    };
  }
  return out;
}

export function contractedCount(patternById, id) {
  let n = 0;
  for (const day of WF_DAYS) for (const s of WF_SESSIONS) if (isContracted(patternById, id, day, s)) n++;
  return n;
}

export function allocatedCount(allocation, id) {
  let n = 0;
  for (const day of WF_DAYS) for (const s of WF_SESSIONS) if ((allocation?.[day]?.[s] || []).includes(id)) n++;
  return n;
}

// Compare planned allocation against the contracted baseline + activity state.
// Returns { items, cellCount, clinMismatch } where:
//   items[]      — { type, ... } one per anomaly
//   cellCount    — { 'day_session': n } anomalies touching that cell
//   clinMismatch — { clinicianId: true } clinicians with any mismatch
// Anomaly types: 'off_contract', 'missing', 'unassigned_activity', 'total'.
export function detectAnomalies({ allocation, patternById, activities, clinicians, includedRoles }) {
  const included = (clinicians || []).filter(c => isIncluded(c, includedRoles));
  const includedIds = new Set(included.map(c => c.id));
  const items = [];
  const cellCount = {};
  const clinMismatch = {};
  const bump = (day, s) => { const k = cellKey(day, s); cellCount[k] = (cellCount[k] || 0) + 1; };

  for (const day of WF_DAYS) {
    for (const s of WF_SESSIONS) {
      const alloc = (allocation?.[day]?.[s] || []).filter(id => includedIds.has(id));
      // Allocated to a session they are not contracted for.
      for (const id of alloc) {
        if (!isContracted(patternById, id, day, s)) {
          items.push({ type: 'off_contract', clinicianId: id, day, session: s });
          bump(day, s); clinMismatch[id] = true;
        }
      }
      // Contracted for the session but not allocated.
      for (const c of included) {
        if (isContracted(patternById, c.id, day, s) && !alloc.includes(c.id)) {
          items.push({ type: 'missing', clinicianId: c.id, day, session: s });
          bump(day, s); clinMismatch[c.id] = true;
        }
      }
    }
  }
  // Activities still needing a body.
  for (const a of activities || []) {
    if (!a.assignedClinicianId) {
      items.push({ type: 'unassigned_activity', activityId: a.id, day: a.day, session: a.session, label: a.label });
      bump(a.day, a.session);
    }
  }
  // Total sessions allocated ≠ contracted total.
  for (const c of included) {
    const ac = allocatedCount(allocation, c.id);
    const cc = contractedCount(patternById, c.id);
    if (ac !== cc) { items.push({ type: 'total', clinicianId: c.id, allocated: ac, contracted: cc }); clinMismatch[c.id] = true; }
  }
  return { items, cellCount, clinMismatch };
}
