'use client';
// Design check for the weekly template — capacity vs demand per day, plus
// the rule findings from lib/rota-design. Renders below the planner grid so
// the draft and its verdict sit on one screen.
import { useMemo, useState } from 'react';
import { WF_DAYS, WF_DAY_NAMES } from '@/lib/workforce';
import { designFindings, templateScore, DEFAULT_APPTS_PER_SESSION } from '@/lib/rota-design';

const SEV = {
  critical: { fg: 'var(--c-red)', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.4)', label: 'Critical' },
  warn:     { fg: 'var(--c-amber)', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.35)', label: 'Warning' },
  info:     { fg: 'var(--meta)', bg: 'var(--g-tile-2)', bd: 'var(--g-border-2)', label: 'Note' },
};

export default function RotaDesignPanel({ allocation, activities, viewWeek, includedIds, clinicians, demandSettings, listSize, dutyCapableIds, apptsPerSession, onApptsChange }) {
  const [showAll, setShowAll] = useState(false);
  const aps = apptsPerSession || DEFAULT_APPTS_PER_SESSION;
  const result = useMemo(() => designFindings({
    allocation, activities, week: viewWeek, includedIds, clinicians,
    demandSettings, listSize, apptsPerSession: aps,
    dutyCapableIds: dutyCapableIds instanceof Set ? dutyCapableIds : new Set(dutyCapableIds || []),
  }), [allocation, activities, viewWeek, includedIds, clinicians, demandSettings, listSize, aps, dutyCapableIds]);

  const score = templateScore(result);
  // Two values per band: an ink that flips with the theme, and the concrete
  // hex the border and tint are mixed from (a var() cannot take an alpha suffix).
  const scoreInk = score >= 85 ? 'var(--c-green-2)' : score >= 60 ? 'var(--c-amber-2)' : 'var(--c-red)';
  const scoreCol = score >= 85 ? '#34d399' : score >= 60 ? '#fbbf24' : '#fca5a5';
  const maxVal = Math.max(...WF_DAYS.map(d => Math.max(result.capacity.perDay[d].capacity, result.capacity.perDay[d].demand)), 1);
  const shown = showAll ? result.findings : result.findings.slice(0, 6);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-border)' }}>
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--g-tile)' }}>
        <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--g-text-hi)' }}>Design check</span>
        <span className="text-xs" style={{ color: 'var(--meta)' }}>week {String(viewWeek).toUpperCase()} template vs typical demand</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--meta)' }}>appts / clinical session</span>
          <input type="number" min={4} max={30} value={aps}
            onChange={(e) => onApptsChange && onApptsChange(Math.max(4, Math.min(30, parseInt(e.target.value) || DEFAULT_APPTS_PER_SESSION)))}
            className="w-14 text-center rounded-md text-sm py-0.5"
            style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }} />
          <span className="text-sm font-bold font-mono-data px-2 py-0.5 rounded-md" style={{ color: scoreInk, border: `1px solid ${scoreCol}55`, background: `${scoreCol}18` }}
            title="100 = duty covered every session, capacity meets demand every day, no design findings">
            {score}/100
          </span>
        </span>
      </div>

      {/* Capacity vs demand, per weekday, in appointments */}
      <div className="px-4 py-3 grid grid-cols-5 gap-2">
        {WF_DAYS.map((d) => {
          const day = result.capacity.perDay[d];
          const ok = day.capacity >= day.demand;
          const capPct = (day.capacity / maxVal) * 100;
          const demPct = (day.demand / maxVal) * 100;
          return (
            <div key={d} title={`${WF_DAY_NAMES[d]}: ~${day.capacity} appointments from ${day.effectiveSessions} effective clinical sessions (${day.heads} clinician-sessions before activities) vs ~${day.demand} expected requests`}>
              <div className="text-xs font-semibold mb-1" style={{ color: 'var(--g-text-hi)' }}>{WF_DAY_NAMES[d].slice(0, 3)}</div>
              <div className="relative rounded-md overflow-hidden" style={{ height: 42, background: 'var(--g-tile-2)' }}>
                <div className="absolute bottom-0 left-0 right-1/2 mr-px" style={{ height: `${capPct}%`, background: ok ? 'rgba(52,211,153,0.55)' : 'rgba(239,68,68,0.55)' }} />
                <div className="absolute bottom-0 left-1/2 right-0 ml-px" style={{ height: `${demPct}%`, background: 'rgba(148,163,184,0.35)' }} />
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xs font-bold font-mono-data" style={{ color: ok ? 'var(--c-green-2)' : 'var(--c-red)' }}>{day.capacity}</span>
                <span className="text-[11px] font-mono-data" style={{ color: 'var(--meta)' }}>vs {day.demand}</span>
              </div>
              <div className="text-[11px]" style={{ color: ok ? 'var(--meta)' : 'var(--c-red)' }}>{day.surplus >= 0 ? `+${day.surplus}` : day.surplus}</div>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-2 flex items-center gap-4 text-[11px]" style={{ color: 'var(--meta)' }}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(52,211,153,0.55)' }} />planned capacity</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(148,163,184,0.35)' }} />typical demand</span>
        <span className="ml-auto font-mono-data">week: {result.capacity.weekCapacity} planned vs {result.capacity.weekDemand} expected ({result.capacity.weekSurplus >= 0 ? '+' : ''}{result.capacity.weekSurplus})</span>
      </div>

      {/* Findings */}
      <div className="px-4 pb-4">
        {result.findings.length === 0 ? (
          <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.05)', color: 'var(--g-text-hi)' }}>
            <span style={{ color: 'var(--c-green-2)' }}>&#10003;</span> No design findings — duty covered, capacity meets demand.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {shown.map((f, i) => {
              const c = SEV[f.severity];
              return (
                <div key={i} className="rounded-lg px-3 py-1.5 text-sm flex items-center gap-2" style={{ background: c.bg, border: `1px solid ${c.bd}` }}>
                  <span className="text-[11px] font-bold uppercase flex-shrink-0" style={{ color: c.fg, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{c.label}</span>
                  <span style={{ color: 'var(--g-text-hi)' }}>{f.message}</span>
                </div>
              );
            })}
            {result.findings.length > 6 && (
              <button onClick={() => setShowAll(v => !v)} className="text-xs text-left mt-0.5" style={{ color: 'var(--link)' }}>
                {showAll ? 'Show fewer' : `Show all ${result.findings.length} findings`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
