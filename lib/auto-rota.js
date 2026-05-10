// ═══════════════════════════════════════════════════════════════════════════
// lib/auto-rota.js — infer weekly working patterns from CSV appointment history
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure function (no React, no state, no side-effects) that takes:
//   - The parsed huddle CSV data (which dates and per-clinician slot counts)
//   - The clinician list
//   - Settings + planned absences (so leave doesn't drag down the ratio)
//   - The existing weeklyRota (returned untouched for clinicians not eligible)
//
// Returns a new weeklyRota object plus a per-clinician summary.
//
// Used in two places:
//
//   1. components/buddy/TeamRota.js — manual "Auto-generate" button. The
//      filter excludes clinicians without buddyCover=true, matching the
//      historic UX where the rota grid only shows buddy-cover participants.
//
//   2. components/huddle/HuddleToday.js processCSV — automatic baseline
//      generation on the FIRST CSV upload for a fresh practice. Uses the
//      permissive filter (every active, non-admin clinician with CSV
//      activity) so a new practice gets working patterns out of the box
//      without having to first toggle buddyCover on for everyone.
//
// Algorithm overview:
//   1. Filter dates to past-only, take most recent 12 weeks (~84 daily rows)
//   2. Bucket dates by weekday (Mon/Tue/Wed/Thu/Fri)
//   3. For each clinician × weekday: count how many of those dates the
//      clinician appeared in the CSV (matched by name or by initials, with
//      ambiguity guards on initials so we don't pick the wrong person when
//      two CSV names share initials)
//   4. PRIMARY decision: ratio ≥50% of the leave-adjusted weeks → working
//   5. FALLBACK if primary returns nothing: take the most recent 4-week
//      window of any appearance → working those weekdays
//
// The algorithm is deliberately conservative — when in doubt, leave the
// clinician out and let the user fix manually. Ambiguous initials matches
// are refused outright rather than guessed.
// ═══════════════════════════════════════════════════════════════════════════

import { DAYS, matchesStaffMember } from './data';
import { getHuddleCapacity, parseHuddleDateStr } from './huddle';


// ─── Initials variant generation ────────────────────────────────────────
// CSV names like "Gomm, Jane (Dr)" can plausibly map to initials JG, JAG,
// JaneG, GOMM (in various clinician systems). We yield every variant the
// CSV name *could* produce so the fallback initials match has a chance,
// but with the ambiguity guard below we never silently pick the wrong
// clinician.
function csvNameInitialsAll(csvName) {
  if (!csvName) return [];
  const cleaned = csvName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  let parts;
  if (cleaned.includes(',')) {
    const [surname, first] = cleaned.split(',').map(s => s.trim());
    parts = [first, surname].filter(Boolean);
  } else {
    parts = cleaned.split(/\s+/);
  }
  if (parts.length === 0) return [];
  if (parts.length === 1) {
    const single = parts[0][0]?.toUpperCase() || '';
    return single ? [single] : [];
  }
  const first = parts[0];
  const surname = parts[parts.length - 1];
  const variants = new Set();
  // Standard 2-letter: first-of-first + first-of-last → "JG"
  variants.add(((first[0] || '') + (surname[0] || '')).toUpperCase());
  // Surname expansion (Jane G + 2/3 of surname) → "JGo", "JGom"
  for (let n = 2; n <= 3; n++) {
    if (surname.length >= n) {
      variants.add(((first[0] || '') + surname.slice(0, n)).toUpperCase());
    }
  }
  // First-name prefix expansion: J + first letter of surname extended
  if (first.length >= 2) {
    variants.add(((first[0] || '') + (first[1] || '') + (surname[0] || '')).toUpperCase());
    if (first.length >= 3) {
      variants.add(((first[0] || '') + (first[1] || '') + (first[2] || '') + (surname[0] || '')).toUpperCase());
    }
  }
  // Surname only (rare)
  variants.add(surname.toUpperCase());
  return Array.from(variants).filter(Boolean);
}


/**
 * Infer weekly working patterns from CSV appointment history.
 *
 * @param {Object} args
 * @param {Object} args.huddleData         Parsed CSV data ({ dates, ... })
 * @param {Array}  args.clinicians         Full clinician list
 * @param {Object} [args.huddleSettings]   For getHuddleCapacity slot-type filtering
 * @param {Array}  [args.plannedAbsences]  So leave doesn't drag down the ratio
 * @param {Object} [args.existingRota]     Returned untouched for ineligible clinicians
 * @param {boolean}[args.includeOnlyBuddyCover=true]
 *   If true (default), only clinicians with buddyCover=true are considered.
 *   Pass false on first-time auto-generation to capture everyone with CSV activity.
 *
 * @returns {Object}
 *   - newRota:          Updated weeklyRota object
 *   - summary:          [{ clinicianId, name, initials, days, matchedAs, isFallback, incomplete }]
 *   - weeksAnalysed:    integer, useful for reporting
 *   - ambiguityWarnings:[{ name, initials, csvNames }] for warning the user
 *   - error:            string if data was insufficient (no dates, etc.)
 */
export function inferWeeklyRota({
  huddleData,
  clinicians,
  huddleSettings = {},
  plannedAbsences = [],
  existingRota = {},
  includeOnlyBuddyCover = true,
}) {
  if (!huddleData?.dates?.length) {
    return { error: 'No CSV data', newRota: existingRota, summary: [], weeksAnalysed: 0, ambiguityWarnings: [] };
  }

  const eligibleClinicians = (clinicians || []).filter(c => {
    if (c.status === 'left' || c.status === 'administrative') return false;
    if (includeOnlyBuddyCover && !c.buddyCover) return false;
    return true;
  });

  if (eligibleClinicians.length === 0) {
    return { error: 'No eligible clinicians', newRota: existingRota, summary: [], weeksAnalysed: 0, ambiguityWarnings: [] };
  }

  // Parse + filter + sort dates chronologically. CSV dates can include
  // future planning dates (EMIS exports cover months ahead) — we only
  // want PAST dates because that's the actual history.
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const datesWithObjs = huddleData.dates
    .map(ds => ({ ds, d: parseHuddleDateStr(ds) }))
    .filter(({ d }) => d && !isNaN(d) && d.getTime() <= todayMs)
    .sort((a, b) => a.d - b.d);

  // Most recent 12 weeks (~60 weekdays — but may include weekends in the slice)
  const recent = datesWithObjs.slice(-84);
  const recentDates = recent.map(r => r.ds);

  // Bucket dates by weekday name
  const datesByDay = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  for (const { ds, d } of recent) {
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
    if (datesByDay[dayName]) datesByDay[dayName].push(ds);
  }

  // Quick lookup: clinicianId → array of {start, end} absences (in ms)
  const absencesByClinician = {};
  for (const a of (plannedAbsences || [])) {
    if (!a.clinicianId || !a.startDate || !a.endDate) continue;
    const start = new Date(a.startDate + 'T00:00:00').getTime();
    const end = new Date(a.endDate + 'T23:59:59').getTime();
    if (!absencesByClinician[a.clinicianId]) absencesByClinician[a.clinicianId] = [];
    absencesByClinician[a.clinicianId].push({ start, end });
  }
  const wasOnLeave = (clinicianId, dateMs) => {
    const list = absencesByClinician[clinicianId];
    if (!list) return false;
    for (const a of list) {
      if (dateMs >= a.start && dateMs <= a.end) return true;
    }
    return false;
  };

  // Pre-compute every CSV name's possible initials, and an *ambiguity map*
  // that records which initials values appear for >1 distinct CSV name.
  // Any initials in this set can NOT be used by the fallback match — they
  // would silently pick the wrong person.
  const csvNamesSeen = new Set();
  const initialsToCsvNames = new Map();
  for (const dateStr of recentDates) {
    const cap = getHuddleCapacity(huddleData, dateStr, huddleSettings);
    const allByClin = [...(cap?.am?.byClinician || []), ...(cap?.pm?.byClinician || [])];
    for (const bc of allByClin) {
      if (!bc?.name || csvNamesSeen.has(bc.name)) continue;
      csvNamesSeen.add(bc.name);
      for (const v of csvNameInitialsAll(bc.name)) {
        if (!initialsToCsvNames.has(v)) initialsToCsvNames.set(v, new Set());
        initialsToCsvNames.get(v).add(bc.name);
      }
    }
  }
  const ambiguousInitials = new Set();
  for (const [init, names] of initialsToCsvNames) {
    if (names.size > 1) ambiguousInitials.add(init);
  }

  // Start from the existing rota — clinicians not in eligibleClinicians keep
  // their current entries untouched.
  const newRota = { ...existingRota };
  const summary = [];

  for (const c of eligibleClinicians) {
    const daysWorking = [];
    const matchedCsvNames = new Set();
    const cInitials = (c.initials || '').toUpperCase();

    const appearancesByDay = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
    const availableWeeksByDay = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0 };

    for (const day of DAYS) {
      const dates = datesByDay[day] || [];
      for (const dateStr of dates) {
        const dateMs = parseHuddleDateStr(dateStr).getTime();
        const onLeave = wasOnLeave(c.id, dateMs);
        if (!onLeave) availableWeeksByDay[day]++;

        const cap = getHuddleCapacity(huddleData, dateStr, huddleSettings);
        if (!cap) continue;

        // Name match first (the proper way), then initials fallback —
        // but only if the clinician's initials don't clash with another
        // CSV name (refuse rather than guess).
        let inAm = cap.am?.byClinician?.find(bc => matchesStaffMember(bc.name, c));
        let inPm = cap.pm?.byClinician?.find(bc => matchesStaffMember(bc.name, c));

        const cInitialsUsable = cInitials && !ambiguousInitials.has(cInitials);
        if (!inAm && cInitialsUsable) {
          inAm = cap.am?.byClinician?.find(bc => csvNameInitialsAll(bc.name).includes(cInitials));
        }
        if (!inPm && cInitialsUsable) {
          inPm = cap.pm?.byClinician?.find(bc => csvNameInitialsAll(bc.name).includes(cInitials));
        }

        if (inAm) matchedCsvNames.add(inAm.name);
        if (inPm) matchedCsvNames.add(inPm.name);

        const hasAny = (inAm && (inAm.available > 0 || inAm.booked > 0 || inAm.embargoed > 0))
                    || (inPm && (inPm.available > 0 || inPm.booked > 0 || inPm.embargoed > 0));
        if (hasAny) appearancesByDay[day].push({ dateStr, dateMs });
      }
    }

    // PRIMARY: ≥50% threshold against leave-adjusted denominator
    for (const day of DAYS) {
      const dates = datesByDay[day] || [];
      if (dates.length === 0) continue;
      const appeared = appearancesByDay[day].length;
      const availableWeeks = availableWeeksByDay[day];
      const denominator = availableWeeks > 0 ? availableWeeks : dates.length;
      const ratio = appeared / denominator;
      const heavilyOnLeave = (dates.length - availableWeeks) > dates.length / 2;
      if (ratio >= 0.5 || (heavilyOnLeave && appeared >= 1)) {
        daysWorking.push(day);
      }
    }

    // FALLBACK: primary empty → take the most recent 4-week window of any appearance
    let isFallback = false;
    if (daysWorking.length === 0 && matchedCsvNames.size > 0) {
      const allAppearances = [];
      for (const day of DAYS) {
        for (const a of appearancesByDay[day]) {
          allAppearances.push({ ...a, day });
        }
      }
      allAppearances.sort((a, b) => b.dateMs - a.dateMs);
      if (allAppearances.length > 0) {
        const cutoff = allAppearances[0].dateMs - (4 * 7 * 86400_000);
        const recentSet = new Set();
        for (const a of allAppearances) {
          if (a.dateMs < cutoff) break;
          recentSet.add(a.day);
        }
        if (recentSet.size > 0) {
          for (const day of DAYS) {
            if (recentSet.has(day)) daysWorking.push(day);
          }
          isFallback = true;
        }
      }
    }

    // Apply: ensure clinician.id is in newRota[day] for each day in daysWorking
    for (const day of DAYS) {
      const arr = Array.isArray(newRota[day]) ? newRota[day] : [];
      const isWorking = daysWorking.includes(day);
      const has = arr.includes(c.id);
      if (isWorking && !has) {
        newRota[day] = [...arr, c.id];
      } else if (!isWorking && has) {
        newRota[day] = arr.filter(x => x !== c.id);
      } else if (!arr.length && newRota[day] === undefined) {
        // Ensure the day key exists so downstream code doesn't trip on undefined
        newRota[day] = arr;
      }
    }

    summary.push({
      clinicianId: c.id,
      name: c.name,
      initials: c.initials,
      days: daysWorking.map(d => d.slice(0, 3)).join(' ') || '—',
      matchedAs: matchedCsvNames.size > 0 ? [...matchedCsvNames][0] : null,
      isFallback,
      incomplete: daysWorking.length === 0,
    });
  }

  // Ambiguity warnings — clinicians whose initials clash with another CSV
  // name. We refused to use those initials for matching, but the user
  // should know so they can disambiguate.
  const ambiguityWarnings = [];
  for (const c of eligibleClinicians) {
    const cInit = (c.initials || '').toUpperCase();
    if (cInit && ambiguousInitials.has(cInit)) {
      ambiguityWarnings.push({
        name: c.name,
        initials: cInit,
        csvNames: Array.from(initialsToCsvNames.get(cInit) || []),
      });
    }
  }

  return {
    newRota,
    summary,
    weeksAnalysed: Math.min(12, Math.floor(recentDates.length / 5)),
    ambiguityWarnings,
  };
}
