'use client';
import { useState } from 'react';
import { DAYS } from '@/lib/data';
import { inferWeeklyRota } from '@/lib/auto-rota';

export default function TeamRota({ data, saveData, helpers, huddleData }) {
  const { ensureArray, toggleRotaDay } = helpers;
  const [generating, setGenerating] = useState(false);
  const [genReport, setGenReport] = useState(null);

  // Auto-generate weekly pattern from CSV history. The actual algorithm
  // lives in lib/auto-rota.js so it can also run automatically on first
  // CSV upload (see components/huddle/HuddleToday.js processCSV). Manual
  // button preserves the historic UX: only buddyCover-enabled clinicians
  // are touched.
  const autoGenerateFromCSV = () => {
    if (!huddleData?.dates?.length) {
      setGenReport({ error: 'No CSV data loaded — upload a CSV on the Today page first.' });
      return;
    }
    setGenerating(true);

    const result = inferWeeklyRota({
      huddleData,
      clinicians: ensureArray(data.clinicians),
      huddleSettings: data.huddleSettings || {},
      plannedAbsences: ensureArray(data.plannedAbsences),
      existingRota: data.weeklyRota || {},
      includeOnlyBuddyCover: true, // manual-button behaviour
    });

    if (result.error) {
      setGenReport({ error: result.error });
      setGenerating(false);
      return;
    }

    saveData({ ...data, weeklyRota: result.newRota });
    setGenReport({
      summary: result.summary,
      weeksAnalysed: result.weeksAnalysed,
      ambiguityWarnings: result.ambiguityWarnings,
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
