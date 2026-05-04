'use client';
import { useState } from 'react';
import { DAYS, matchesStaffMember, toLocalIso } from '@/lib/data';
import { getHuddleCapacity, parseHuddleDateStr } from '@/lib/huddle';

export default function TeamRota({ data, saveData, helpers, huddleData }) {
  const { ensureArray, toggleRotaDay } = helpers;
  const [generating, setGenerating] = useState(false);
  const [genReport, setGenReport] = useState(null);

  // Auto-generate weekly pattern from CSV history.
  //
  // CSV dates come in 'DD-Mon-YYYY' format (e.g. '03-May-2026') and the array
  // can contain future planning dates (CSV exports cover months ahead). We
  // need to:
  //   1. Parse them properly via parseHuddleDateStr (string compare doesn't
  //      give chronological order — '20-Sep-2033' sorts higher than '03-May-2026')
  //   2. Filter to PAST dates only (real history, not future plans)
  //   3. Take the most recent 12 weeks (~60 weekdays)
  //   4. Bucket by weekday and check appearances
  const autoGenerateFromCSV = () => {
    if (!huddleData?.dates?.length) {
      setGenReport({ error: 'No CSV data loaded — upload a CSV on the Today page first.' });
      return;
    }
    setGenerating(true);
    const hs = data.huddleSettings || {};
    const eligibleClinicians = ensureArray(data.clinicians)
      .filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');

    // Parse + filter + sort dates chronologically (oldest → newest)
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const datesWithObjs = huddleData.dates
      .map(ds => ({ ds, d: parseHuddleDateStr(ds) }))
      .filter(({ d }) => !isNaN(d) && d.getTime() <= todayMs)  // valid + past-or-today
      .sort((a, b) => a.d - b.d);                              // chronological

    // Take the most recent 12 weeks (~60 weekdays — but may include weekends)
    const recent = datesWithObjs.slice(-84);  // up to 12 weeks of daily data
    const recentDates = recent.map(r => r.ds);

    // Bucket dates by weekday
    const datesByDay = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
    for (const { ds, d } of recent) {
      const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
      if (datesByDay[dayName]) datesByDay[dayName].push(ds);
    }

    // Build a quick lookup: clinicianId → array of {start, end} absences (in ms)
    const absencesByClinician = {};
    for (const a of ensureArray(data.plannedAbsences)) {
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

    // For each clinician × weekday, count appearances
    const newRota = { ...data.weeklyRota };
    const summary = []; // { name, days: 'Mon/Tue/Thu', changed: bool }

    // Helpers for the fallback initials match. `csvNameInitialsAll` returns
    // EVERY plausible initials variant for a CSV name so a clinician
    // registered with 3-letter initials (e.g. JAG for Jane A Gomm) can still
    // be matched even when the CSV only carries first+last names.
    //
    // For "Gomm, Jane (Dr)" we yield: ['JG', 'JAG', 'GOMM']
    // For "Cox, Darren (Dr)" we yield: ['DC', 'DAC' ...] – simple cases
    //   only return one variant.
    const csvNameInitialsAll = (csvName) => {
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
      const first = parts[0];          // "Jane"
      const surname = parts[parts.length - 1]; // "Gomm"
      const variants = new Set();
      // Standard 2-letter: first-of-first + first-of-last → "JG"
      variants.add(((first[0] || '') + (surname[0] || '')).toUpperCase());
      // Surname expansion (Jane G[omm] → first-of-first + first 1, 2, 3 of surname)
      // e.g. JAG = first-of-first + first-of-A_lwaysThere + ?
      // Actually JAG comes from J(ane) + A + G(omm) or J(ane) + (Apparently middle name) + G(omm)
      // For middle name expansion, build surname-prefix variants of length 2,3:
      for (let n = 2; n <= 3; n++) {
        if (surname.length >= n) {
          variants.add(((first[0] || '') + surname.slice(0, n)).toUpperCase());
        }
      }
      // First-name prefix expansion: J + (first letter of surname) → JaG
      // also catches initials like "JaG" stored as JAG
      if (first.length >= 2) {
        variants.add(((first[0] || '') + (first[1] || '') + (surname[0] || '')).toUpperCase());
        if (first.length >= 3) {
          variants.add(((first[0] || '') + (first[1] || '') + (first[2] || '') + (surname[0] || '')).toUpperCase());
        }
      }
      // Surname only (rare but happens in some CSVs)
      variants.add(surname.toUpperCase());
      return Array.from(variants).filter(Boolean);
    };

    // Pre-compute every CSV name's possible initials, and an *ambiguity map*
    // that records which initials values appear for >1 distinct CSV name.
    // Any initials in this set can NOT be used by the fallback match — they
    // would silently pick the wrong person.
    const csvNamesSeen = new Set();
    const initialsToCsvNames = new Map(); // initials → Set<csvName>
    for (const dateStr of recentDates) {
      const cap = getHuddleCapacity(huddleData, dateStr, hs);
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

    // Build a "any byClinician name that matches this clinician" lookup so we
    // can debug which CSV names matched (or didn't) for diagnostic output
    const debugMatches = {}; // clinician.id -> Set of CSV names matched

    for (const c of eligibleClinicians) {
      const daysWorking = [];
      const matchedCsvNames = new Set();
      const cInitials = (c.initials || '').toUpperCase();

      // Collect per-day appearances, recording which dates they appeared on.
      // We need the dates (not just counts) for the fallback strategy below.
      const appearancesByDay = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
      const availableWeeksByDay = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0 };

      for (const day of DAYS) {
        const dates = datesByDay[day] || [];
        for (const dateStr of dates) {
          const dateMs = parseHuddleDateStr(dateStr).getTime();
          const onLeave = wasOnLeave(c.id, dateMs);
          if (!onLeave) availableWeeksByDay[day]++;

          const cap = getHuddleCapacity(huddleData, dateStr, hs);
          if (!cap) continue;

          // Try name-based match first (the proper way)
          let inAm = cap.am?.byClinician?.find(bc => matchesStaffMember(bc.name, c));
          let inPm = cap.pm?.byClinician?.find(bc => matchesStaffMember(bc.name, c));

          // Fallback: initials match. Only fires if name match failed AND
          // the clinician's registered initials aren't ambiguous in the CSV
          // (would map to multiple distinct CSV names — refuse rather than
          // silently pick the wrong one).
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

      // ─── PRIMARY DECISION: standard ≥50% threshold against leave-adjusted denominator ───
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

      // ─── FALLBACK: primary returned nothing → look at most recent activity ───
      // Useful when a clinician's history is sparse (long absence, recent return,
      // schedule change, parental leave etc) and the strict ratio fails.
      // Strategy: gather all dates this clinician appeared (any weekday, in
      // chronological order), take the most recent ~10 dates that span at most
      // 4 weeks, and consider those weekdays their pattern.
      let isFallback = false;
      if (daysWorking.length === 0 && matchedCsvNames.size > 0) {
        // They were matched in CSV but no weekday hit the threshold.
        // Gather all appearance entries flattened
        const allAppearances = [];
        for (const day of DAYS) {
          for (const a of appearancesByDay[day]) {
            allAppearances.push({ ...a, day });
          }
        }
        // Sort newest first
        allAppearances.sort((a, b) => b.dateMs - a.dateMs);
        if (allAppearances.length > 0) {
          // Take appearances from the most recent 4-week window
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
      debugMatches[c.id] = matchedCsvNames;

      // Apply: ensure this clinician is in newRota[day] for each day in daysWorking
      for (const day of DAYS) {
        const arr = ensureArray(newRota[day]);
        const isWorking = daysWorking.includes(day);
        const has = arr.includes(c.id);
        if (isWorking && !has) {
          newRota[day] = [...arr, c.id];
        } else if (!isWorking && has) {
          newRota[day] = arr.filter(x => x !== c.id);
        }
      }
      summary.push({
        name: c.name,
        initials: c.initials,
        days: daysWorking.map(d => d.slice(0,3)).join(' ') || '—',
        matchedAs: matchedCsvNames.size > 0 ? [...matchedCsvNames][0] : null,
        isFallback,
        // "Data incomplete" = no days could be inferred at all (neither primary
        // nor fallback). User needs to set this manually.
        incomplete: daysWorking.length === 0,
      });
    }

    saveData({ ...data, weeklyRota: newRota });
    // Build a list of clinicians whose initials clash with another CSV name
    // so the auto-generate report can warn the user. Even though we now
    // refuse the fallback in these cases, the user still wants to know.
    const ambiguityWarnings = [];
    for (const c of eligibleClinicians) {
      const cInit = (c.initials || '').toUpperCase();
      if (cInit && ambiguousInitials.has(cInit)) {
        const csvNames = Array.from(initialsToCsvNames.get(cInit) || []);
        ambiguityWarnings.push({ name: c.name, initials: cInit, csvNames });
      }
    }
    setGenReport({
      summary,
      weeksAnalysed: Math.min(12, Math.floor(recentDates.length / 5)),
      ambiguityWarnings,
    });
    setGenerating(false);
  };

  const buddyCoverClinicians = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clinician Rota</h1>
          <p className="text-sm text-slate-500 mt-1">Standard weekly working pattern. Click any cell to toggle. Includes everyone marked 'Buddy cover' on the Team page.</p>
        </div>
        <button
          onClick={autoGenerateFromCSV}
          disabled={generating || !huddleData?.dates?.length}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
          title={!huddleData?.dates?.length ? 'Upload a CSV first' : 'Detect from recent CSV data'}
        >
          {generating ? 'Analysing…' : '✨ Auto-generate from CSV'}
        </button>
      </div>

      {genReport?.error && (
        <div className="card p-3 bg-red-50 border border-red-200 text-sm text-red-800">{genReport.error}</div>
      )}
      {genReport?.summary && (() => {
        const incompleteSet = new Set(genReport.summary.filter(s => s.incomplete).map(s => s.initials || s.name));
        const incompleteCount = incompleteSet.size;
        const fallbackCount = genReport.summary.filter(s => s.isFallback).length;
        return (
          <div className="card p-4 bg-purple-50 border border-purple-200">
            <div className="text-sm font-medium text-purple-900 mb-2">Auto-generated pattern from {genReport.weeksAnalysed} weeks of CSV data</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
              {genReport.summary.map(s => (
                <div key={s.initials || s.name} className={`flex items-center gap-2 py-0.5 px-2 -mx-2 rounded ${s.incomplete ? 'bg-red-50' : s.isFallback ? 'bg-amber-50' : ''}`}>
                  <span className="font-mono font-semibold w-10 flex-shrink-0">{s.initials}</span>
                  <span className={`flex-shrink-0 ${s.incomplete ? 'text-red-700 font-medium' : 'text-slate-700'}`}>{s.days}</span>
                  {s.incomplete && <span className="text-red-600 text-[10px] font-semibold uppercase ml-auto">data incomplete</span>}
                  {!s.incomplete && s.isFallback && <span className="text-amber-700 text-[10px] italic ml-auto" title="Inferred from recent activity rather than the full window">recent activity only</span>}
                  {!s.incomplete && !s.isFallback && s.matchedAs && <span className="text-slate-400 text-[10px] truncate ml-auto" title={s.matchedAs}>= {s.matchedAs}</span>}
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              <p>
                <span className="font-medium text-slate-700">Standard rule:</span> a clinician is marked working a day if they appeared in CSV data for that weekday in at least 50% of weeks they weren't on planned leave.
              </p>
              {fallbackCount > 0 && (
                <p>
                  <span className="font-medium text-amber-700">Recent activity only ({fallbackCount}):</span> the standard rule found no days, so we inferred their pattern from the most recent 4 weeks of activity instead. Useful for clinicians returning from extended leave.
                </p>
              )}
              {incompleteCount > 0 && (
                <p>
                  <span className="font-medium text-red-700">Data incomplete ({incompleteCount}):</span> couldn't infer any working days at all (no CSV history, or name and initials don't match anything in the CSV). Set manually using the cells below.
                </p>
              )}
            </div>
            {genReport.ambiguityWarnings?.length > 0 && (
              <div className="mt-3 p-3 rounded bg-amber-100 border border-amber-300 text-xs text-amber-900">
                <p className="font-medium mb-1">Ambiguous initials detected — auto-match skipped for these clinicians:</p>
                <ul className="space-y-0.5 ml-4 list-disc">
                  {genReport.ambiguityWarnings.map(w => (
                    <li key={w.name}>
                      <span className="font-mono font-semibold">{w.initials}</span> — {w.name}: matches {w.csvNames.length} CSV names ({w.csvNames.join(', ')}). Use the alias field on the clinicians page to disambiguate, or set their initials to a unique value (e.g. {w.initials.length === 2 ? w.initials.replace(/^(\w)/, '$1A') : 'a longer string'}).
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      <div className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-200"><th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Clinician</th>{DAYS.map(d => <th key={d} className="text-center py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">{d.slice(0, 3)}</th>)}</tr></thead>
            <tbody>
              {buddyCoverClinicians.map(c => {
                const isIncomplete = genReport?.summary?.some(s => (s.initials === c.initials || s.name === c.name) && s.incomplete);
                return (
                  <tr key={c.id} className={`border-b border-slate-100 last:border-0 ${isIncomplete ? 'bg-red-50' : ''}`}>
                    <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="initials-badge neutral">{c.initials}</div><div><div className="text-sm font-medium text-slate-900 flex items-center gap-2">{c.name} {isIncomplete && <span className="text-[10px] font-semibold uppercase text-red-600 px-1.5 py-0.5 bg-red-100 rounded">Set manually</span>}</div><div className="text-xs text-slate-500">{c.role}</div></div></div></td>
                    {DAYS.map(d => { const w = ensureArray(data.weeklyRota[d]).includes(c.id); return <td key={d} className="text-center py-3 px-3"><button onClick={() => toggleRotaDay(c.id, d)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors mx-auto text-sm ${w ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{w ? '✓' : '—'}</button></td>; })}
                  </tr>
                );
              })}
              {buddyCoverClinicians.length === 0 && (
                <tr><td colSpan={DAYS.length + 1} className="text-center py-8 text-sm text-slate-500">
                  No clinicians marked for buddy cover. Go to Team → toggle 'Buddy cover' for the people you want included.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100"></span>Working</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100"></span>Day off</span></div>
      </div>
    </div>
  );
}
