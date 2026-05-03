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

    // For each clinician × weekday, count appearances
    const newRota = { ...data.weeklyRota };
    const summary = []; // { name, days: 'Mon/Tue/Thu', changed: bool }

    // Helper: compute initials from a CSV name like "COX, Darren (Dr)" → "DC"
    // Used as a fallback when matchesStaffMember() fails (name format mismatch)
    const csvNameInitials = (csvName) => {
      if (!csvName) return '';
      const cleaned = csvName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
      // "SURNAME, Firstname" → reorder to "Firstname Surname"
      let parts;
      if (cleaned.includes(',')) {
        const [surname, first] = cleaned.split(',').map(s => s.trim());
        parts = [first, surname].filter(Boolean);
      } else {
        parts = cleaned.split(/\s+/);
      }
      // Take first letter of first part + first letter of last part (handles "Anna Mary Smith" → AS)
      if (parts.length === 0) return '';
      if (parts.length === 1) return parts[0][0]?.toUpperCase() || '';
      return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase();
    };

    // Build a "any byClinician name that matches this clinician" lookup so we
    // can debug which CSV names matched (or didn't) for diagnostic output
    const debugMatches = {}; // clinician.id -> Set of CSV names matched

    for (const c of eligibleClinicians) {
      const daysWorking = [];
      const matchedCsvNames = new Set();
      const cInitials = (c.initials || '').toUpperCase();

      for (const day of DAYS) {
        const dates = datesByDay[day] || [];
        if (dates.length === 0) continue;
        let appeared = 0;
        for (const dateStr of dates) {
          const cap = getHuddleCapacity(huddleData, dateStr, hs);
          if (!cap) continue;

          // Try name-based match first (the proper way)
          let inAm = cap.am?.byClinician?.find(bc => matchesStaffMember(bc.name, c));
          let inPm = cap.pm?.byClinician?.find(bc => matchesStaffMember(bc.name, c));

          // Fallback: initials match. Only fires if name match failed AND
          // the clinician has initials AND the CSV name's derived initials match
          if (!inAm && cInitials) {
            inAm = cap.am?.byClinician?.find(bc => csvNameInitials(bc.name) === cInitials);
          }
          if (!inPm && cInitials) {
            inPm = cap.pm?.byClinician?.find(bc => csvNameInitials(bc.name) === cInitials);
          }

          if (inAm) matchedCsvNames.add(inAm.name);
          if (inPm) matchedCsvNames.add(inPm.name);

          const hasAny = (inAm && (inAm.available > 0 || inAm.booked > 0 || inAm.embargoed > 0))
                      || (inPm && (inPm.available > 0 || inPm.booked > 0 || inPm.embargoed > 0));
          if (hasAny) appeared++;
        }
        if (appeared >= dates.length / 2) {
          daysWorking.push(day);
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
      });
    }

    saveData({ ...data, weeklyRota: newRota });
    setGenReport({ summary, weeksAnalysed: Math.min(12, Math.floor(recentDates.length / 5)) });
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
      {genReport?.summary && (
        <div className="card p-4 bg-purple-50 border border-purple-200">
          <div className="text-sm font-medium text-purple-900 mb-2">Auto-generated pattern from {genReport.weeksAnalysed} weeks of CSV data</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
            {genReport.summary.map(s => (
              <div key={s.initials || s.name} className="flex items-center gap-2 py-0.5">
                <span className="font-mono font-semibold w-10 flex-shrink-0">{s.initials}</span>
                <span className="text-slate-700 flex-shrink-0">{s.days}</span>
                {!s.matchedAs && <span className="text-amber-600 text-[10px] italic ml-auto">no CSV match</span>}
                {s.matchedAs && <span className="text-slate-400 text-[10px] truncate ml-auto" title={s.matchedAs}>= {s.matchedAs}</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">A clinician is marked as working a day if they appeared in CSV data for that weekday at least 50% of recent weeks. Clinicians showing 'no CSV match' couldn't be found in the CSV — usually because the name in the CSV doesn't match their record. Edit cells manually below for those.</p>
        </div>
      )}

      <div className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-200"><th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Clinician</th>{DAYS.map(d => <th key={d} className="text-center py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">{d.slice(0, 3)}</th>)}</tr></thead>
            <tbody>
              {buddyCoverClinicians.map(c => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="initials-badge neutral">{c.initials}</div><div><div className="text-sm font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.role}</div></div></div></td>
                  {DAYS.map(d => { const w = ensureArray(data.weeklyRota[d]).includes(c.id); return <td key={d} className="text-center py-3 px-3"><button onClick={() => toggleRotaDay(c.id, d)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors mx-auto text-sm ${w ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{w ? '✓' : '—'}</button></td>; })}
                </tr>
              ))}
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
