'use client';
import { useState, useMemo } from 'react';
import { getHuddleCapacity, getDutyDoctor, parseHuddleDateStr } from '@/lib/huddle';
import { matchesStaffMember } from '@/lib/data';

export default function WorkloadAudit({ data, huddleData }) {
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const urgentOverrides = useMemo(() => hs?.savedSlotFilters?.urgent || null, [hs]);
  const [expandedDuty, setExpandedDuty] = useState(null);
  const [expandedSupport, setExpandedSupport] = useState(null);

  const allClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative');
  }, [data?.clinicians]);

  const audit = useMemo(() => {
    if (!huddleData?.dates || !hasDuty) return null;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const eightWeeksOut = new Date(today); eightWeeksOut.setDate(eightWeeksOut.getDate() + 56);
    const fmtDate = (d) => d ? `${d.getDate()} ${d.toLocaleString('en-GB',{month:'short'})} ${d.getFullYear()}` : '';

    // Reusable scanner: processes dates within a filter and returns clinician stats
    const scanDates = (dateFilter) => {
      const clinMap = {};
      const initClin = (id, name) => {
        if (!clinMap[id]) clinMap[id] = { id, name, sessions: 0, dutySessions: 0, supportSessions: 0, dutyDates: [], supportDates: [] };
      };
      let earliest = null, latest = null;

      huddleData.dates.forEach(dateStr => {
        const d = parseHuddleDateStr(dateStr);
        if (!d || d.getDay() === 0 || d.getDay() === 6) return;
        if (!dateFilter(d)) return;
        if (!earliest || d < earliest) earliest = d;
        if (!latest || d > latest) latest = d;

        const allCap = getHuddleCapacity(huddleData, dateStr, hs);
        const urgentCap = getHuddleCapacity(huddleData, dateStr, hs, urgentOverrides);

        ['am', 'pm'].forEach(session => {
          const allSessionData = allCap?.[session];
          if (!allSessionData?.byClinician?.length) return;

          const present = allSessionData.byClinician
            .map(c => {
              const matched = allClinicians.find(tc => matchesStaffMember(c.name, tc));
              const total = (c.available || 0) + (c.embargoed || 0) + (c.booked || 0);
              return matched && total > 0 ? { ...c, matched, total } : null;
            })
            .filter(Boolean);

          if (present.length === 0) return;

          present.forEach(c => {
            initClin(c.matched.id, c.matched.name);
            clinMap[c.matched.id].sessions++;
          });

          const dutyDoc = getDutyDoctor(huddleData, dateStr, session, dutySlots);
          if (dutyDoc) {
            const matched = allClinicians.find(tc => matchesStaffMember(dutyDoc.name, tc));
            if (matched) {
              initClin(matched.id, matched.name);
              clinMap[matched.id].dutySessions++;
              clinMap[matched.id].dutyDates.push({ date: dateStr, session });
            }

            const urgentSessionData = urgentCap?.[session];
            const urgentPresent = (urgentSessionData?.byClinician || [])
              .map(c => {
                const m = allClinicians.find(tc => matchesStaffMember(c.name, tc));
                const total = (c.available || 0) + (c.embargoed || 0) + (c.booked || 0);
                return m && total > 0 ? { ...c, matched: m, total } : null;
              })
              .filter(Boolean);

            const afterDuty = urgentPresent.filter(c =>
              !matchesStaffMember(c.name, matched || { name: dutyDoc.name }) &&
              !c.matched.name.toLowerCase().includes('balson')
            );
            if (afterDuty.length > 0) {
              const sorted = [...afterDuty].sort((a, b) => b.total - a.total);
              const top = sorted[0];
              const second = sorted[1] || null;
              if (top.total >= 5 && top.total >= ((second?.total || 0) + 2)) {
                initClin(top.matched.id, top.matched.name);
                clinMap[top.matched.id].supportSessions++;
                clinMap[top.matched.id].supportDates.push({ date: dateStr, session });
              }
            }
          }
        });
      });

      const clinicians = Object.values(clinMap)
        .filter(c => c.sessions > 0)
        .map(c => ({
          ...c,
          dutyRatio: c.sessions > 0 ? Math.round((c.dutySessions / c.sessions) * 100) / 100 : 0,
          supportRatio: c.sessions > 0 ? Math.round((c.supportSessions / c.sessions) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions);

      const dutyC = clinicians.filter(c => c.dutySessions > 0);
      const supportC = clinicians.filter(c => c.supportSessions > 0);
      const avgDutyRatio = dutyC.length > 0 ? Math.round((dutyC.reduce((s, c) => s + c.dutyRatio, 0) / dutyC.length) * 100) / 100 : 0;
      const avgSupportRatio = supportC.length > 0 ? Math.round((supportC.reduce((s, c) => s + c.supportRatio, 0) / supportC.length) * 100) / 100 : 0;

      return { clinicians, avgDutyRatio, avgSupportRatio, earliestDate: fmtDate(earliest), latestDate: fmtDate(latest) };
    };

    // Historical: before today
    const historical = scanDates(d => d < today);
    // Projected: all data up to 8 weeks out (historical + future)
    const projected = scanDates(d => d <= eightWeeksOut);

    // Build a lookup of projected ratios by clinician id
    const projectedMap = {};
    projected.clinicians.forEach(c => { projectedMap[c.id] = c; });

    return { ...historical, projected: projectedMap, projAvgDutyRatio: projected.avgDutyRatio, projAvgSupportRatio: projected.avgSupportRatio, projectedDate: fmtDate(eightWeeksOut) };
  }, [huddleData, hs, dutySlots, hasDuty, allClinicians, urgentOverrides]);

  if (!huddleData) return (
    <div className="card p-12 text-center"><div className="text-2xl mb-2">📊</div><h3 className="text-sm font-semibold text-slate-600 mb-1">No CSV data</h3><p className="text-xs text-slate-400">Upload a huddle CSV on the Today page to see workload audit.</p></div>
  );

  if (!hasDuty) return (
    <div className="card p-12 text-center"><div className="text-2xl mb-2">⭐</div><h3 className="text-sm font-semibold text-slate-600 mb-1">Duty doctor slot not configured</h3><p className="text-xs text-slate-400">Set a duty doctor slot type in the Today page filter to enable workload tracking.</p></div>
  );

  if (!audit) return null;

  const maxDutyRatio = Math.max(...audit.clinicians.map(c => c.dutyRatio), 0.01);
  const maxSupportRatio = Math.max(...audit.clinicians.map(c => c.supportRatio), 0.01);

  const RatioRow = ({ c, ratio, avg, max, colour, count, dates, expanded, onToggle, ratioKey }) => {
    const delta = ratio - avg;
    const absDelta = Math.abs(delta);
    const isHigh = delta > 0.03;
    const isLow = delta < -0.03;
    const proj = audit.projected[c.id];
    const projRatio = proj ? proj[ratioKey] : null;
    const projDelta = projRatio !== null && projRatio !== undefined ? projRatio - ratio : null;
    return (
      <div>
        <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors" onClick={onToggle}>
          <div className="w-32 text-xs font-medium text-slate-700 truncate text-right">{c.name}</div>
          <div className="flex-1 relative h-7 rounded-lg bg-slate-100 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 rounded-lg" style={{ width: `${(ratio / max) * 100}%`, background: isHigh ? '#ef4444' : isLow ? '#3b82f6' : colour, opacity: 0.75 }} />
            <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(avg / max) * 100}%`, background: '#1e293b', zIndex: 1 }} title={`Average: ${avg.toFixed(2)}`} />
            <div className="absolute inset-0 flex items-center px-2">
              <span className="text-[10px] font-bold text-white drop-shadow-sm" style={{marginLeft: `${Math.min((ratio / max) * 100 - 8, 92)}%`}}>{ratio.toFixed(2)}</span>
            </div>
          </div>
          <div className="w-16 text-right">
            {absDelta < 0.03 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-medium">Fair</span>
              : isHigh ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">+{delta.toFixed(2)}</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{delta.toFixed(2)}</span>}
          </div>
          <div className="w-14 text-[11px] text-slate-500 text-right font-medium">{count}/{c.sessions}</div>
          <div className="w-20 text-right">
            {projRatio !== null && projRatio !== undefined ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                background: projDelta > 0.02 ? '#fef2f2' : projDelta < -0.02 ? '#eff6ff' : '#f0fdf4',
                color: projDelta > 0.02 ? '#dc2626' : projDelta < -0.02 ? '#2563eb' : '#16a34a'
              }}>→ {projRatio.toFixed(2)}</span>
            ) : null}
          </div>
          <span className="text-[10px] text-slate-400 w-4">{expanded ? '▲' : '▼'}</span>
        </div>
        {expanded && dates && dates.length > 0 && (
          <div className="ml-36 mt-1 mb-2 flex flex-wrap gap-1">
            {dates.map((d, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{d.date} <span className="text-slate-400">{d.session.toUpperCase()}</span></span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Weekly urgent vs routine trend
  const weeklyTrend = useMemo(() => {
    if (!huddleData?.dates) return [];
    const urgentOv = hs?.savedSlotFilters?.urgent;
    const routineOv = hs?.savedSlotFilters?.routine;
    if (!urgentOv && !routineOv) return [];

    // Group dates into ISO weeks
    const weekMap = {};
    huddleData.dates.forEach(dateStr => {
      const d = parseHuddleDateStr(dateStr);
      if (!d || d.getDay() === 0 || d.getDay() === 6) return;
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      const weekKey = `${String(weekStart.getDate()).padStart(2,'0')}-${weekStart.toLocaleString('en-GB',{month:'short'})}`;
      if (!weekMap[weekKey]) weekMap[weekKey] = { weekKey, dates: [], weekStart };
      weekMap[weekKey].dates.push(dateStr);
    });

    return Object.values(weekMap).sort((a, b) => a.weekStart - b.weekStart).map(week => {
      let urgent = 0, routine = 0;
      week.dates.forEach(dateStr => {
        if (urgentOv) {
          const cap = getHuddleCapacity(huddleData, dateStr, hs, urgentOv);
          urgent += (cap.am.total||0) + (cap.pm.total||0) + (cap.am.embargoed||0) + (cap.pm.embargoed||0) + (cap.am.booked||0) + (cap.pm.booked||0);
        }
        if (routineOv) {
          const cap = getHuddleCapacity(huddleData, dateStr, hs, routineOv);
          routine += (cap.am.total||0) + (cap.pm.total||0) + (cap.am.embargoed||0) + (cap.pm.embargoed||0) + (cap.am.booked||0) + (cap.pm.booked||0);
        }
      });
      return { ...week, urgent, routine, total: urgent + routine };
    });
  }, [huddleData, hs]);

  const trendMax = Math.max(...weeklyTrend.map(w => w.total), 1);

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3">
          <div className="text-base font-semibold text-white">Workload Audit</div>
          <div className="text-[11px] text-white/60">{audit.earliestDate} — {audit.latestDate}</div>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-slate-700">Duty doctor ratio</div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">avg {audit.avgDutyRatio.toFixed(2)}</span>
          </div>
          <div className="text-xs text-slate-400 mb-4">Duty sessions ÷ total sessions worked. Black line = average. Everyone should be similar.</div>
          <div className="flex items-center gap-3 mb-1 px-1">
            <div className="w-32 text-[9px] text-slate-400 text-right">Clinician</div>
            <div className="flex-1 text-[9px] text-slate-400">Ratio</div>
            <div className="w-16 text-[9px] text-slate-400 text-right">vs avg</div>
            <div className="w-14 text-[9px] text-slate-400 text-right">count</div>
            <div className="w-20 text-[9px] text-slate-400 text-right">+8wk</div>
            <div className="w-4"></div>
          </div>
          <div className="space-y-2">
            {audit.clinicians.filter(c => c.dutySessions > 0).sort((a, b) => b.dutyRatio - a.dutyRatio).map(c => (
              <RatioRow key={c.id} c={c} ratio={c.dutyRatio} avg={audit.avgDutyRatio} max={maxDutyRatio} colour="#10b981" count={c.dutySessions} dates={c.dutyDates} expanded={expandedDuty === c.id} onToggle={() => setExpandedDuty(expandedDuty === c.id ? null : c.id)} ratioKey="dutyRatio" />
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-slate-700">Duty support ratio</div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">avg {audit.avgSupportRatio.toFixed(2)}</span>
          </div>
          <div className="text-xs text-slate-400 mb-4">Support sessions ÷ total sessions worked. Clinician with most urgent slots (excl. duty doctor).</div>
          <div className="flex items-center gap-3 mb-1 px-1">
            <div className="w-32 text-[9px] text-slate-400 text-right">Clinician</div>
            <div className="flex-1 text-[9px] text-slate-400">Ratio</div>
            <div className="w-16 text-[9px] text-slate-400 text-right">vs avg</div>
            <div className="w-14 text-[9px] text-slate-400 text-right">count</div>
            <div className="w-20 text-[9px] text-slate-400 text-right">+8wk</div>
            <div className="w-4"></div>
          </div>
          <div className="space-y-2">
            {audit.clinicians.filter(c => c.supportSessions > 0).sort((a, b) => b.supportRatio - a.supportRatio).map(c => (
              <RatioRow key={c.id} c={c} ratio={c.supportRatio} avg={audit.avgSupportRatio} max={maxSupportRatio} colour="#3b82f6" count={c.supportSessions} dates={c.supportDates} expanded={expandedSupport === c.id} onToggle={() => setExpandedSupport(expandedSupport === c.id ? null : c.id)} ratioKey="supportRatio" />
            ))}
          </div>
        </div>
      </div>

      {/* Weekly urgent vs routine trend */}
      {weeklyTrend.length > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 to-violet-600 px-5 py-3">
            <div className="text-base font-semibold text-white">Weekly capacity trend</div>
            <div className="text-[11px] text-white/60">Urgent vs routine slots offered per week (available + embargoed + booked)</div>
          </div>
          <div className="p-5">
            <div className="flex items-end gap-1" style={{height: 180}}>
              {weeklyTrend.map((w, i) => {
                const totalPct = (w.total / trendMax) * 100;
                const urgentPct = w.total > 0 ? (w.urgent / w.total) * 100 : 0;
                const routinePct = w.total > 0 ? (w.routine / w.total) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5 group relative">
                    <div className="w-full rounded-t-md overflow-hidden" style={{height: `${Math.max(totalPct, 4)}%`}}>
                      <div className="w-full h-full flex flex-col justify-end">
                        {w.routine > 0 && <div style={{height: `${routinePct}%`, background: '#10b981'}} />}
                        {w.urgent > 0 && <div style={{height: `${urgentPct}%`, background: '#ef4444'}} />}
                      </div>
                    </div>
                    <div className="text-[8px] text-slate-400 text-center leading-tight mt-0.5">{w.weekKey}</div>
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{background:'#1e293b',border:'1px solid #334155',minWidth:'110px'}}>
                      <div className="text-xs font-bold text-slate-200 mb-0.5">w/c {w.weekKey}</div>
                      <div className="space-y-0.5 text-[11px]">
                        <div className="flex justify-between gap-3"><span className="text-slate-400">Urgent</span><span className="font-semibold text-red-400">{w.urgent}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-400">Routine</span><span className="font-semibold text-emerald-400">{w.routine}</span></div>
                        <div className="flex justify-between gap-3 border-t border-slate-600 pt-0.5"><span className="text-slate-400">Total</span><span className="font-semibold text-slate-200">{w.total}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-400">Urgent %</span><span className="font-semibold text-red-400">{Math.round(urgentPct)}%</span></div>
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'4px solid #334155'}} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#ef4444'}} /><span className="text-xs text-slate-500">Urgent</span></div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}} /><span className="text-xs text-slate-500">Routine</span></div>
            </div>
          </div>

          {/* Urgent percentage trend */}
          {(() => {
            const urgPcts = weeklyTrend.map(w => w.total > 0 ? Math.round((w.urgent / w.total) * 100) : 0);
            const avgPct = urgPcts.length > 0 ? Math.round(urgPcts.reduce((s, p) => s + p, 0) / urgPcts.length) : 0;
            const maxPct = Math.max(...urgPcts, avgPct + 10, 60);
            const svgW = 600, svgH = 160, padL = 36, padR = 10, padT = 16, padB = 28;
            const cw = svgW - padL - padR, ch = svgH - padT - padB;
            const points = urgPcts.map((p, i) => {
              const x = padL + (urgPcts.length > 1 ? (i / (urgPcts.length - 1)) * cw : cw / 2);
              const y = padT + ch - (p / maxPct) * ch;
              return { x, y, pct: p };
            });
            const lineStr = points.map(p => `${p.x},${p.y}`).join(' ');
            const areaStr = lineStr + ` ${padL + cw},${padT + ch} ${padL},${padT + ch}`;
            const avgY = padT + ch - (avgPct / maxPct) * ch;
            const gridLines = [20, 40, 60].filter(v => v <= maxPct);

            return (
              <div className="p-5 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-sm font-semibold text-slate-700">Urgent capacity %</div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600">avg {avgPct}%</span>
                </div>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
                  {gridLines.map(v => {
                    const y = padT + ch - (v / maxPct) * ch;
                    return <g key={v}><line x1={padL} x2={padL + cw} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="0.5" /><text x={padL - 6} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{v}%</text></g>;
                  })}
                  <line x1={padL} x2={padL + cw} y1={avgY} y2={avgY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,3" />
                  <text x={padL + cw + 4} y={avgY + 4} fill="#94a3b8" fontSize="9">avg</text>
                  <polygon points={areaStr} fill="#ef4444" opacity="0.12" />
                  <polyline points={lineStr} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ef4444" />)}
                  {points.map((p, i) => <text key={`t${i}`} x={p.x} y={p.y - 8} textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="600">{p.pct}%</text>)}
                  {weeklyTrend.map((w, i) => {
                    const x = padL + (urgPcts.length > 1 ? (i / (urgPcts.length - 1)) * cw : cw / 2);
                    return <text key={`l${i}`} x={x} y={padT + ch + 16} textAnchor="middle" fill="#94a3b8" fontSize="9">{w.weekKey}</text>;
                  })}
                </svg>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#ef4444'}} /><span className="text-xs text-slate-500">Urgent %</span></div>
                  <div className="flex items-center gap-1"><div className="w-6 h-0.5" style={{background:'#94a3b8',backgroundImage:'repeating-linear-gradient(90deg,#94a3b8 0,#94a3b8 4px,transparent 4px,transparent 7px)'}} /><span className="text-xs text-slate-500">Average</span></div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
