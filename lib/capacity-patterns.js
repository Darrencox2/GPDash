// Capacity pattern detection — pure functions, no React.
//
// Takes the precomputed `weeks` array used by the desktop calendar (each
// week has { days, label, ws, wU, wT, wR, wRA, wRE, wRB }), plus the
// huddle settings, the team clinician list, and the raw huddleData, and
// returns an array of pattern objects describing useful insights.
//
// Each pattern has the shape:
//   {
//     id:          unique string (used as React key)
//     severity:    'high' | 'medium' | 'info'
//     icon:        SVG path string (24x24 viewBox, stroke based)
//     iconColor:   hex string for the icon
//     title:       short headline
//     detail:      paragraph explaining what was found
//     evidence:    array of { label, value }   — bullet points of the data
//     suggestion:  paragraph with a recommended action
//     affectedDates: array of isoKey strings    — for click-through to drawer
//   }
//
// Patterns are sorted by severity ('high' first, then 'medium', then
// 'info') and within the same severity by their `id`. Callers can take
// the top N if space is constrained.
//
// All thresholds are deliberately conservative so we don't fire on noise.
// The detector returns no patterns when none reach threshold — better
// to say nothing than cry wolf.

import { matchesStaffMember } from './data';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Severity-rank → sort order. Lower number = higher in the list.
const SEV_RANK = { high: 0, medium: 1, info: 2 };

// ───────────────────────────────────────────────────────────────────────
// Helpers

function pct(num, denom) {
  if (denom <= 0) return 0;
  return Math.round((num / denom) * 100);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function fmtDate(d) {
  return `${d.dayShort} ${d.dayNum} ${d.monthStr}`;
}

// Get all days flat that have urgent data (excludes BHs, no-data, weekend filler).
function allDataDays(weeks) {
  return weeks.flatMap(w => w.days).filter(d => d.hasData && !d.isBH);
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 1: Weekday consistently short on urgent capacity.
// Threshold: at least 4 instances of that weekday with data, and >=60%
// of them are below 80% of target.

function weekdayShortagePatterns(weeks) {
  const patterns = [];
  const days = allDataDays(weeks).filter(d => (d.amT + d.pmT) > 0);
  const byWeekday = {};
  for (const d of days) {
    if (!byWeekday[d.dayName]) byWeekday[d.dayName] = [];
    byWeekday[d.dayName].push(d);
  }
  for (const [dayName, list] of Object.entries(byWeekday)) {
    if (list.length < 4) continue;
    const shortfalls = list.filter(d => (d.amS + d.pmS) < (d.amT + d.pmT) * 0.8);
    if (shortfalls.length / list.length < 0.6) continue;
    const avgSupplied = avg(list.map(d => d.amS + d.pmS));
    const avgTarget = avg(list.map(d => d.amT + d.pmT));
    const avgShortfall = Math.round(avgTarget - avgSupplied);
    // Also work out whether the shortage is AM, PM, or both.
    const amRatio = avg(list.map(d => d.amT > 0 ? d.amS / d.amT : 1));
    const pmRatio = avg(list.map(d => d.pmT > 0 ? d.pmS / d.pmT : 1));
    let session = 'sessions';
    if (amRatio < 0.8 && pmRatio >= 0.85) session = 'AM sessions';
    else if (pmRatio < 0.8 && amRatio >= 0.85) session = 'PM sessions';
    patterns.push({
      id: `weekday-short-${dayName}`,
      severity: shortfalls.length / list.length >= 0.75 ? 'high' : 'medium',
      icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
      iconColor: '#ef4444',
      title: `${dayName}s consistently short on urgent capacity`,
      detail: `${dayName} sessions have been below 80% of the urgent capacity target on ${shortfalls.length} of the last ${list.length} ${dayName}s in the data. Average shortfall: ${avgShortfall} slot${avgShortfall===1?'':'s'} per ${dayName} (supplied ${Math.round(avgSupplied)} vs target ${Math.round(avgTarget)}). The shortage shows up most clearly in the ${session === 'sessions' ? 'whole day — both AM and PM are running below target' : session.replace(' sessions', '')}.`,
      evidence: shortfalls.slice(0, 6).map(d => ({
        label: fmtDate(d),
        value: `${d.amS + d.pmS}/${d.amT + d.pmT} (${pct(d.amS + d.pmS, d.amT + d.pmT)}%)`
      })),
      suggestion: session === 'sessions'
        ? `Consider adding capacity across ${dayName}s — either a longer session for existing clinicians or an additional clinician slot. If demand is concentrated, splitting the work across AM and PM rather than adding to just one half will spread the load.`
        : `The shortage is concentrated in ${session.replace(' sessions','')} — look at whether existing clinician sessions could be extended into that part of the day, or whether one of the routine slots in that window could be converted to urgent.`,
      affectedDates: shortfalls.map(d => d.isoKey)
    });
  }
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 2: Routine target streaks (below or above).
// Threshold: 3+ consecutive weeks below target by >5%, or 3+ consecutive
// weeks above target by >10%.

function routineStreakPatterns(weeks, rTarget) {
  if (rTarget <= 0) return [];
  const patterns = [];
  // Build the run sequences. We only care about weeks where wR is set
  // (i.e. the week had any routine data) AND only consider past + current
  // weeks as a streak — future weeks have advance bookings only and would
  // skew the streak.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ws = weeks.filter(w => w.wR > 0 && w.ws <= today);
  if (ws.length < 3) return [];

  // Below streak — booked is below 95% of target
  let belowRun = [];
  for (const w of ws) {
    if (w.wRB < rTarget * 0.95) belowRun.push(w);
    else break; // streak broken
  }
  // Actually we want to scan more carefully — look for streaks anywhere
  // in the data, not just from the start. Simpler: scan trailing run.
  belowRun = [];
  for (let i = ws.length - 1; i >= 0; i--) {
    if (ws[i].wRB < rTarget * 0.95) belowRun.unshift(ws[i]);
    else break;
  }
  if (belowRun.length >= 3) {
    const avgGap = Math.round(avg(belowRun.map(w => rTarget - w.wRB)));
    patterns.push({
      id: 'routine-streak-below',
      severity: belowRun.length >= 5 ? 'high' : 'medium',
      icon: 'M3 17l6-6 4 4 8-8M14 7h7v7',
      iconColor: '#f59e0b',
      title: `Routine has missed weekly target for ${belowRun.length} weeks running`,
      detail: `Booked routine bookings have been below the ${rTarget}/week target for ${belowRun.length} consecutive weeks now. The shortfall is averaging ${avgGap} slot${avgGap===1?'':'s'} per week. This could indicate the target is set too aggressively for current demand, that routine slots are being converted to urgent, or that the routine offering needs review.`,
      evidence: belowRun.map(w => ({
        label: `Wk of ${w.label}`,
        value: `${w.wRB} / ${rTarget} (${pct(w.wRB, rTarget)}%)`
      })),
      suggestion: `Two angles to consider: (1) Is the ${rTarget}/week target still the right number? If practice demand has shifted toward more urgent and less routine, the target may need to come down. (2) Are routine slots being effectively offered? If embargoed/blocked slots are eating routine capacity before patients can book them, that would explain a persistent gap.`,
      affectedDates: belowRun.flatMap(w => w.days.filter(d => d.hasData && !d.isBH).map(d => d.isoKey))
    });
  }

  // Above streak — booked is above 110% of target
  let aboveRun = [];
  for (let i = ws.length - 1; i >= 0; i--) {
    if (ws[i].wRB > rTarget * 1.1) aboveRun.unshift(ws[i]);
    else break;
  }
  if (aboveRun.length >= 3) {
    const avgOver = Math.round(avg(aboveRun.map(w => w.wRB - rTarget)));
    patterns.push({
      id: 'routine-streak-above',
      severity: 'info',
      icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
      iconColor: '#10b981',
      title: `Routine running consistently above target`,
      detail: `Booked routine has been over the ${rTarget}/week target for ${aboveRun.length} consecutive weeks, averaging ${avgOver} slots above target. This is positive — capacity is meeting and exceeding what was planned — but it can also indicate the target is set conservatively relative to current demand.`,
      evidence: aboveRun.map(w => ({
        label: `Wk of ${w.label}`,
        value: `${w.wRB} / ${rTarget} (${pct(w.wRB, rTarget)}%)`
      })),
      suggestion: `Consider raising the weekly routine target to reflect current performance. A target that is consistently exceeded loses its value as a planning signal. Setting it 5–10% above recent average gives a stretch target that still feels achievable.`,
      affectedDates: aboveRun.flatMap(w => w.days.filter(d => d.hasData && !d.isBH).map(d => d.isoKey))
    });
  }

  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 3: Mismatched capacity in a single week — routine over target
// while urgent under target (rebalancing opportunity).

function mismatchedWeekPatterns(weeks, rTarget) {
  const patterns = [];
  for (const w of weeks) {
    if (rTarget <= 0 || w.wT <= 0 || w.wR <= 0) continue;
    const routineRatio = w.wRB / rTarget;
    const urgentRatio = w.wU / w.wT;
    if (routineRatio > 1.1 && urgentRatio < 0.8) {
      patterns.push({
        id: `mismatched-${w.label.replace(/\s+/g,'-')}`,
        severity: 'medium',
        icon: 'M3 3h18v18H3zM3 9h18M9 21V9',
        iconColor: '#a78bfa',
        title: `Week of ${w.label}: routine over target while urgent runs short`,
        detail: `This week shows opposite signals on the two capacity types. Routine bookings are at ${w.wRB} (${pct(w.wRB, rTarget)}% of the ${rTarget}/week target) while urgent supply is at ${w.wU} (${pct(w.wU, w.wT)}% of the ${w.wT} weekly urgent target). The capacity exists in the schedule but is allocated to the wrong type of slot for what the demand looks like.`,
        evidence: w.days.filter(d => d.hasData && !d.isBH).map(d => ({
          label: fmtDate(d),
          value: `urgent ${d.amS + d.pmS}/${d.amT + d.pmT} · routine ${d.rA + d.rE + d.rB}`
        })),
        suggestion: `Consider converting some routine slots in this week to urgent. The days where urgent is most under-target are the best candidates — look at the day breakdown above. Even shifting 4–6 slots from routine to urgent across the week would close most of the urgent gap without putting routine below target.`,
        affectedDates: w.days.filter(d => d.hasData && !d.isBH && (d.amS + d.pmS) < (d.amT + d.pmT) * 0.8).map(d => d.isoKey)
      });
    }
  }
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 4: Single clinician carries a disproportionate share of urgent
// capacity on a specific weekday. Bus-factor risk.

function singleClinicianPatterns(weeks, teamClin, hs) {
  const patterns = [];
  const days = allDataDays(weeks).filter(d => d.uCap);
  const byWeekday = {};
  for (const d of days) {
    if (!byWeekday[d.dayName]) byWeekday[d.dayName] = [];
    byWeekday[d.dayName].push(d);
  }
  for (const [dayName, list] of Object.entries(byWeekday)) {
    if (list.length < 3) continue;
    // Sum urgent slot supply per clinician across all instances of this weekday.
    const perClin = {};
    let totalSlots = 0;
    for (const d of list) {
      const allClin = [
        ...((d.uCap?.am?.byClinician) || []),
        ...((d.uCap?.pm?.byClinician) || [])
      ];
      for (const c of allClin) {
        const slots = (c.available || 0) + (c.embargoed || 0) + (c.booked || 0);
        if (slots <= 0) continue;
        if (!perClin[c.name]) perClin[c.name] = 0;
        perClin[c.name] += slots;
        totalSlots += slots;
      }
    }
    if (totalSlots < 20) continue;  // not enough data
    const sorted = Object.entries(perClin).sort((a,b) => b[1] - a[1]);
    if (!sorted.length) continue;
    const [topName, topSlots] = sorted[0];
    const topPct = (topSlots / totalSlots) * 100;
    if (topPct < 40) continue;
    // Friendly name resolution
    const matched = teamClin.find(tc => matchesStaffMember(topName, tc));
    const displayName = matched?.name || topName;
    const nextName = sorted[1] ? (teamClin.find(tc => matchesStaffMember(sorted[1][0], tc))?.name || sorted[1][0]) : null;
    const nextPct = sorted[1] ? (sorted[1][1] / totalSlots) * 100 : 0;
    patterns.push({
      id: `single-clinician-${dayName}`,
      severity: topPct >= 55 ? 'high' : 'medium',
      icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
      iconColor: '#f59e0b',
      title: `${displayName} carries ${Math.round(topPct)}% of urgent ${dayName} capacity`,
      detail: `Across the ${list.length} ${dayName}s in the data, ${displayName} provides ${topSlots} of the ${totalSlots} urgent slots offered — ${Math.round(topPct)}% of the total. ${nextName ? `The next biggest contributor is ${nextName} with ${Math.round(nextPct)}% (${sorted[1][1]} slots).` : 'No other clinician contributes more than a handful of slots.'} This concentration creates a bus-factor risk: an unexpected absence on a ${dayName} would have an outsized effect on urgent capacity that day.`,
      evidence: sorted.slice(0, 5).map(([name, slots]) => ({
        label: teamClin.find(tc => matchesStaffMember(name, tc))?.name || name,
        value: `${slots} slots (${pct(slots, totalSlots)}%)`
      })),
      suggestion: `Worth thinking about a backup arrangement for ${dayName}s. If ${displayName} is the regular ${dayName} clinician, agreeing in advance who covers in their absence (and ideally rotating part of that coverage routinely so the backup is current with practice patterns) reduces the impact of a sick day or unplanned leave.`,
      affectedDates: list.map(d => d.isoKey)
    });
  }
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 5: AM/PM imbalance on a specific weekday — one half consistently
// runs short while the other runs over.

function amPmImbalancePatterns(weeks) {
  const patterns = [];
  const days = allDataDays(weeks).filter(d => d.amT > 0 && d.pmT > 0);
  const byWeekday = {};
  for (const d of days) {
    if (!byWeekday[d.dayName]) byWeekday[d.dayName] = [];
    byWeekday[d.dayName].push(d);
  }
  for (const [dayName, list] of Object.entries(byWeekday)) {
    if (list.length < 3) continue;
    const amRatio = avg(list.map(d => d.amS / d.amT));
    const pmRatio = avg(list.map(d => d.pmS / d.pmT));
    const diff = Math.abs(amRatio - pmRatio);
    // Only flag when one half is genuinely short AND the gap is meaningful
    if (diff < 0.25) continue;
    const shortHalf = amRatio < pmRatio ? 'AM' : 'PM';
    const longHalf  = amRatio < pmRatio ? 'PM' : 'AM';
    const shortRatio = Math.min(amRatio, pmRatio);
    const longRatio  = Math.max(amRatio, pmRatio);
    if (shortRatio >= 0.85) continue;  // both halves are basically fine
    patterns.push({
      id: `am-pm-imbalance-${dayName}`,
      severity: shortRatio < 0.65 ? 'medium' : 'info',
      icon: 'M12 3v18M3 12h18',
      iconColor: '#0ea5e9',
      title: `${dayName} ${shortHalf}s run short while ${longHalf}s run hot`,
      detail: `Looking across the ${list.length} ${dayName}s in the data, urgent supply averages ${Math.round(longRatio * 100)}% of target in the ${longHalf} but only ${Math.round(shortRatio * 100)}% in the ${shortHalf}. The total daily capacity may be roughly right, but it is unevenly distributed across the day.`,
      evidence: list.slice(0, 6).map(d => ({
        label: fmtDate(d),
        value: `AM ${d.amS}/${d.amT} (${pct(d.amS, d.amT)}%) · PM ${d.pmS}/${d.pmT} (${pct(d.pmS, d.pmT)}%)`
      })),
      suggestion: `Within-day rebalancing is usually cheaper than adding capacity. Consider whether one of the ${longHalf} clinician sessions could shift earlier/later into the ${shortHalf} on ${dayName}s, or whether a session that currently straddles lunch could be moved entirely into the ${shortHalf}.`,
      affectedDates: list.map(d => d.isoKey)
    });
  }
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 6: A single upcoming day that stands out — high predicted
// demand AND low urgent coverage.

function worstUpcomingDayPatterns(weeks) {
  const patterns = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = allDataDays(weeks).filter(d => d.date >= today && d.predicted && (d.amT + d.pmT) > 0);
  if (!upcoming.length) return [];
  // Score each day by demand × undercover risk
  const scored = upcoming.map(d => {
    const u = d.amS + d.pmS;
    const t = d.amT + d.pmT;
    const cov = t > 0 ? u / t : 1;
    const score = d.predicted * Math.max(0, 1 - cov);
    return { d, score, cov };
  }).filter(x => x.cov < 0.85);
  if (!scored.length) return [];
  scored.sort((a,b) => b.score - a.score);
  const top = scored[0];
  const d = top.d;
  const drivers = [];
  const f = d.pred?.factors || {};
  if (f.dayOfWeek?.effect) drivers.push(`${f.dayOfWeek.day || dayName} ${f.dayOfWeek.effect > 0 ? '+' : ''}${Math.round(f.dayOfWeek.effect)}`);
  if (f.schoolHoliday) drivers.push(`school holiday ${f.schoolHoliday > 0 ? '+' : ''}${Math.round(f.schoolHoliday)}`);
  if (f.firstWeekBack) drivers.push(`first week back ${f.firstWeekBack > 0 ? '+' : ''}${Math.round(f.firstWeekBack)}`);
  if (f.nearBankHoliday?.effect) drivers.push(`near bank holiday ${f.nearBankHoliday.effect > 0 ? '+' : ''}${Math.round(f.nearBankHoliday.effect)}`);
  if (f.weather?.effect) drivers.push(`${f.weather.label || 'weather'} ${f.weather.effect > 0 ? '+' : ''}${Math.round(f.weather.effect)}`);
  patterns.push({
    id: `worst-day-${d.isoKey}`,
    severity: top.cov < 0.65 ? 'high' : 'medium',
    icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
    iconColor: '#ef4444',
    title: `Watch out: ${fmtDate(d)} — high demand, low cover`,
    detail: `This is the day in the next six weeks most at risk of being under-resourced. Predicted demand: ${d.predicted} (${d.dc.label} for a ${d.dayName}). Urgent capacity: ${d.amS + d.pmS}/${d.amT + d.pmT} (${pct(d.amS + d.pmS, d.amT + d.pmT)}% of target). ${drivers.length ? `Demand drivers: ${drivers.slice(0, 3).join(', ')}.` : ''}`,
    evidence: [
      { label: 'Predicted demand', value: `${d.predicted} (${d.dc.label})` },
      { label: 'AM urgent', value: `${d.amS}/${d.amT} (${pct(d.amS, d.amT)}%)` },
      { label: 'PM urgent', value: `${d.pmS}/${d.pmT} (${pct(d.pmS, d.pmT)}%)` },
      ...(drivers.length ? [{ label: 'Why predicted high', value: drivers.slice(0, 3).join(' · ') }] : [])
    ],
    suggestion: `With ${Math.max(0, Math.ceil((d.date - today) / (1000 * 60 * 60 * 24)))} day${Math.ceil((d.date - today) / (1000 * 60 * 60 * 24))===1?'':'s'} of lead time, there is room to act. Options include extending an existing session on the day, converting routine slots to urgent, or arranging additional cover. Click through to the day's detail to see who is rota'd on.`,
    affectedDates: [d.isoKey]
  });
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 7: Bank holiday rebound — the day after a BH typically has
// elevated demand. Detect upcoming days where this driver is active.

function bankHolidayReboundPatterns(weeks) {
  const patterns = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = allDataDays(weeks).filter(d => d.date >= today && d.pred?.factors?.nearBankHoliday);
  const affected = upcoming.filter(d => {
    const nbh = d.pred.factors.nearBankHoliday;
    return nbh && nbh.daysAway <= 2 && nbh.effect > 5;
  });
  if (!affected.length) return [];
  // Group by which BH they relate to (different BHs may not have the same daysAway)
  patterns.push({
    id: 'bh-rebound',
    severity: affected.some(d => (d.amS + d.pmS) < (d.amT + d.pmT) * 0.85) ? 'medium' : 'info',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    iconColor: '#f59e0b',
    title: `Bank holiday rebound expected on ${affected.length} upcoming day${affected.length===1?'':'s'}`,
    detail: `Demand routinely spikes around bank holidays, especially the day before and the day after. The prediction model is forecasting elevated demand on the days listed below — the lift attributed to the nearest bank holiday is shown alongside.`,
    evidence: affected.slice(0, 6).map(d => ({
      label: fmtDate(d),
      value: `predicted ${d.predicted} · BH effect +${Math.round(d.pred.factors.nearBankHoliday.effect)} (${d.pred.factors.nearBankHoliday.daysAway}d away)`
    })),
    suggestion: `Bank-holiday-adjacent days are predictable — they happen on the same dates every year. Worth pre-emptively checking that urgent capacity is at or above its usual level on these days, and that no one has booked annual leave that would compound the pressure.`,
    affectedDates: affected.map(d => d.isoKey)
  });
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Pattern 8: Routine slots over-embargoed (embargoed % is high).

function embargoOverloadPatterns(weeks) {
  const patterns = [];
  for (const w of weeks) {
    if (w.wR <= 0) continue;
    const embPct = (w.wRE / w.wR) * 100;
    if (embPct < 30) continue;
    patterns.push({
      id: `embargo-${w.label.replace(/\s+/g,'-')}`,
      severity: embPct >= 45 ? 'medium' : 'info',
      icon: 'M16 11V7a4 4 0 00-8 0v4M5 11h14l1 10H4l1-10z',
      iconColor: '#f59e0b',
      title: `Week of ${w.label}: ${Math.round(embPct)}% of routine slots embargoed`,
      detail: `Embargoed routine slots are blocked from booking — typically reserved for specific scenarios (follow-ups, post-procedure, reception-only booking, etc). When the embargoed proportion gets high, it can mean useful capacity is being held back from patients who might benefit from it. ${w.wRE} of ${w.wR} routine slots are embargoed this week.`,
      evidence: [
        { label: 'Available', value: `${w.wRA} slots` },
        { label: 'Embargoed', value: `${w.wRE} slots (${Math.round(embPct)}%)` },
        { label: 'Booked', value: `${w.wRB} slots` }
      ],
      suggestion: `Worth a quick review of which slot types are embargoed and why. Embargoes that made sense historically may have outlived their original reason. Releasing some of the embargoed capacity (or shortening the embargo window so slots open up closer to the day) can free up usable routine capacity without changing the rota.`,
      affectedDates: w.days.filter(d => d.hasData && !d.isBH).map(d => d.isoKey)
    });
  }
  return patterns;
}

// ───────────────────────────────────────────────────────────────────────
// Main entry point.

export function detectPatterns(weeks, hs, teamClin, huddleData) {
  const rTarget = hs?.routineWeeklyTarget || 0;
  const all = [
    ...weekdayShortagePatterns(weeks),
    ...routineStreakPatterns(weeks, rTarget),
    ...mismatchedWeekPatterns(weeks, rTarget),
    ...singleClinicianPatterns(weeks, teamClin, hs),
    ...amPmImbalancePatterns(weeks),
    ...worstUpcomingDayPatterns(weeks),
    ...bankHolidayReboundPatterns(weeks),
    ...embargoOverloadPatterns(weeks),
  ];
  // Sort by severity then by id.
  all.sort((a, b) => {
    const sa = SEV_RANK[a.severity] ?? 9;
    const sb = SEV_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
  return all;
}
