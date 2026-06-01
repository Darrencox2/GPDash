// lib/workforce.js
//
// Pure engine for the Workforce planner. Turns the practice's roster
// (working_patterns), demand model (demand_settings) and a small config blob
// into a per-session capacity-vs-demand model. No React, no I/O — so it can
// be unit-tested and reused.
//
// The calculation chain, per session (each weekday split AM/PM):
//
//   rostered − deductions − holiday allowance = net clinical capacity
//
//   • rostered   — clinicians whose working pattern has them in that block
//   • deductions — named "other activities" (teaching, admin, branch visits)
//                  that take a specific clinician out of a specific session
//   • holiday    — a flat allowance of `maxOff` clinicians per session (the
//                  practice's own cap on how many it lets off at once),
//                  toggleable
//
//   demand ratio (per day) = demand for that day ÷ net clinical sessions
//                            that day  — the equalisation metric
//
// Demand by weekday comes from the practice's calibrated demand model
// (baseline + day-of-week effects), NOT hardcoded — so each practice sees its
// own shape. A single weekly-total override rescales the weekday split.

import { BASELINE, DOW_EFFECTS } from '@/lib/demandPredictor';

export const WF_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WF_DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
export const WF_SESSIONS = ['am', 'pm'];
const WINSCOMBE_LIST_SIZE = 11000; // reference list size behind BASELINE/DOW_EFFECTS

// ─── Demand ────────────────────────────────────────────────────────────────

// Typical demand for each weekday, derived from the practice's demand model.
// Uses the calibrated per-practice baseline + dow effects when available,
// otherwise scales the reference (Winscombe) figures by relative list size.
// Returns { mon, tue, wed, thu, fri } of requests/day and the weekly total.
export function typicalWeekdayDemand(demandSettings, listSize) {
  const ds = demandSettings || null;
  const hasCalibrated = ds && typeof ds.baseline === 'number'
    && Array.isArray(ds.dowEffects) && ds.dowEffects.length === 5;

  let base, effects;
  if (hasCalibrated) {
    base = ds.baseline;
    effects = ds.dowEffects;
  } else {
    // Scale the reference model by list size (same approach as predictDemand's
    // fallback). Clamp the scale so tiny/huge inputs stay sane.
    const scale = listSize && listSize > 0
      ? Math.max(0.2, Math.min(4, listSize / WINSCOMBE_LIST_SIZE))
      : 1;
    base = BASELINE * scale;
    effects = DOW_EFFECTS.map(v => v * scale);
  }

  const perDay = {};
  WF_DAYS.forEach((d, i) => {
    perDay[d] = Math.max(0, Math.round(base + effects[i]));
  });
  perDay.weeklyTotal = WF_DAYS.reduce((s, d) => s + perDay[d], 0);
  return perDay;
}

// Apply an optional weekly-total override: keep each weekday's *share* of the
// model but rescale to hit the requested total. null/0 → use the model total.
export function applyWeeklyTotal(perDay, weeklyTotal) {
  const modelTotal = perDay.weeklyTotal || 0;
  if (!weeklyTotal || weeklyTotal <= 0 || modelTotal <= 0) {
    const out = {}; WF_DAYS.forEach(d => { out[d] = perDay[d]; });
    out.weeklyTotal = modelTotal;
    return out;
  }
  const factor = weeklyTotal / modelTotal;
  const out = {};
  WF_DAYS.forEach(d => { out[d] = Math.max(0, Math.round(perDay[d] * factor)); });
  out.weeklyTotal = WF_DAYS.reduce((s, d) => s + out[d], 0);
  return out;
}

// ─── Roster + capacity ───────────────────────────────────────────────────

function inBlock(pattern, day, session) {
  const cell = pattern && pattern[day];
  return !!(cell && cell[session] === 'in');
}

// Sum the deduction amounts that hit a given day/session. A deduction with
// session 'both' counts against both AM and PM.
function deductionAmount(deductions, day, session) {
  let total = 0;
  for (const d of deductions || []) {
    if (d.day !== day) continue;
    if (d.session === session || d.session === 'both') {
      total += Number(d.amount) || 0;
    }
  }
  return total;
}

// Build the full model.
//   clinicians   : [{ id, name, role, status }]
//   patternById  : { [clinicianId]: { mon:{am,pm}, ... } }
//   config       : { maxOff, holidayOn, weeklyTotal, dutyEligibleIds[], deductions[] }
//   demandSettings, listSize : for the demand model
//
// Returns { grid, perDay, demand, totals } where grid[day][session] holds the
// per-session breakdown and perDay[day] holds the day-level demand ratio.
export function buildWorkforceModel({ clinicians, patternById, config, demandSettings, listSize }) {
  const cfg = config || {};
  const maxOff = Number.isFinite(cfg.maxOff) ? cfg.maxOff : 2;
  const holidayOn = cfg.holidayOn !== false; // default on
  const dutySet = new Set(cfg.dutyEligibleIds || []);
  const deductions = cfg.deductions || [];

  const active = (clinicians || []).filter(c => c && c.status !== 'left');

  const demandModel = typicalWeekdayDemand(demandSettings, listSize);
  const demand = applyWeeklyTotal(demandModel, cfg.weeklyTotal);

  const grid = {};
  const perDay = {};

  for (const day of WF_DAYS) {
    grid[day] = {};
    let netSessionsForDay = 0;

    for (const session of WF_SESSIONS) {
      const rosteredClin = active.filter(c => inBlock(patternById[c.id], day, session));
      const rostered = rosteredClin.length;
      const ded = deductionAmount(deductions, day, session);
      const holiday = holidayOn ? maxOff : 0;
      const net = Math.max(0, rostered - ded - holiday);
      const dutyRostered = rosteredClin.filter(c => dutySet.has(c.id)).length;

      grid[day][session] = {
        rostered,
        rosteredClinicians: rosteredClin.map(c => ({ id: c.id, name: c.name, role: c.role, duty: dutySet.has(c.id) })),
        deductions: deductions
          .filter(d => d.day === day && (d.session === session || d.session === 'both'))
          .map(d => ({ ...d })),
        deductionTotal: ded,
        holiday,
        net,
        dutyRostered,
      };
      netSessionsForDay += net;
    }

    const dayDemand = demand[day] || 0;
    perDay[day] = {
      demand: dayDemand,
      netSessions: netSessionsForDay,
      // Requests per net clinical session. Higher = more stretched. Guard /0.
      demandRatio: netSessionsForDay > 0 ? dayDemand / netSessionsForDay : null,
    };
  }

  // Totals across the week (useful for headline cards).
  const totals = WF_DAYS.reduce((acc, day) => {
    for (const session of WF_SESSIONS) {
      acc.rostered += grid[day][session].rostered;
      acc.net += grid[day][session].net;
    }
    acc.demand += perDay[day].demand;
    return acc;
  }, { rostered: 0, net: 0, demand: 0 });

  return { grid, perDay, demand, totals, demandModelTotal: demandModel.weeklyTotal };
}

// Pull the raw value for a chosen metric out of a grid cell, for the heatmap.
export function metricValue(cell, dayInfo, metric) {
  switch (metric) {
    case 'net': return cell.net;
    case 'rostered': return cell.rostered;
    case 'duty': return cell.dutyRostered;
    case 'ratio': return dayInfo?.demandRatio ?? null; // day-level
    default: return cell.net;
  }
}
