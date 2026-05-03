'use client';
import { useState } from 'react';
import { DAYS, matchesStaffMember, toLocalIso } from '@/lib/data';
import { getHuddleCapacity } from '@/lib/huddle';

export default function TeamRota({ data, saveData, helpers, huddleData }) {
  const { ensureArray, toggleRotaDay } = helpers;
  const [generating, setGenerating] = useState(false);
  const [genReport, setGenReport] = useState(null);

  // Auto-generate weekly pattern from CSV history.
  // For each buddy-cover clinician, look at the last 12 weeks of CSV data:
  // - Count, per weekday, how many of those weeks they appeared with at least one slot
  // - If they appeared ≥ 50% of weeks for a given weekday → mark as working that day
  const autoGenerateFromCSV = () => {
    if (!huddleData?.dates?.length) {
      setGenReport({ error: 'No CSV data loaded — upload a CSV on the Today page first.' });
      return;
    }
    setGenerating(true);
    const hs = data.huddleSettings || {};
    const eligibleClinicians = ensureArray(data.clinicians)
      .filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');

    // Take the most recent 12 weeks of CSV dates
    const today = toLocalIso(new Date());
    const sortedDates = [...huddleData.dates]
      .filter(d => d <= today)              // ignore future-only dates
      .sort();                               // ascending
    const recentDates = sortedDates.slice(-60);  // ~12 weeks of weekdays

    // Bucket dates by weekday: { Monday: [date, date, ...], Tuesday: [...] }
    const datesByDay = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
    for (const dateStr of recentDates) {
      const d = new Date(dateStr + 'T12:00:00');
      const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
      if (datesByDay[dayName]) datesByDay[dayName].push(dateStr);
    }

    // For each clinician × weekday, count appearances
    const newRota = { ...data.weeklyRota };
    const summary = []; // { name, days: 'Mon/Tue/Thu', changed: bool }
    for (const c of eligibleClinicians) {
      const daysWorking = [];
      for (const day of DAYS) {
        const dates = datesByDay[day] || [];
        if (dates.length === 0) continue;
        let appeared = 0;
        for (const dateStr of dates) {
          const cap = getHuddleCapacity(huddleData, dateStr, hs);
          if (!cap) continue;
          // Did they have any slots that day (AM or PM)?
          const inAm = cap.am?.byClinician?.find(bc => matchesStaffMember(bc.name, c));
          const inPm = cap.pm?.byClinician?.find(bc => matchesStaffMember(bc.name, c));
          const hasAny = (inAm && (inAm.available > 0 || inAm.booked > 0 || inAm.embargoed > 0))
                      || (inPm && (inPm.available > 0 || inPm.booked > 0 || inPm.embargoed > 0));
          if (hasAny) appeared++;
        }
        if (appeared >= dates.length / 2) {
          daysWorking.push(day);
        }
      }
      // Apply: ensure this clinician is in newRota[day] for each day in daysWorking
      // (and removed from days NOT in daysWorking)
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
      summary.push({ name: c.name, initials: c.initials, days: daysWorking.map(d => d.slice(0,3)).join(' ') || '—' });
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-700">
            {genReport.summary.map(s => (
              <div key={s.initials || s.name} className="flex items-center gap-2">
                <span className="font-mono font-semibold w-10">{s.initials}</span>
                <span className="text-slate-500">{s.days}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">A clinician is marked as working a day if they appeared in CSV data for that weekday at least 50% of recent weeks. You can still tweak individual cells below.</p>
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
