'use client';
import { useMemo } from 'react';
import { getHuddleCapacity, getDutyDoctor, parseHuddleDateStr } from '@/lib/huddle';
import { matchesStaffMember } from '@/lib/data';

export default function WorkloadAudit({ data, huddleData }) {
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const urgentOverrides = useMemo(() => {
    const saved = hs?.savedSlotFilters?.urgent;
    if (saved) return saved;
    return null;
  }, [hs]);

  const allClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative');
  }, [data?.clinicians]);

  const audit = useMemo(() => {
    if (!huddleData?.dates || !hasDuty) return null;

    const clinMap = {}; // { clinicianId: { name, sessions, dutySessions, supportSessions } }
    const initClin = (id, name) => {
      if (!clinMap[id]) clinMap[id] = { id, name, sessions: 0, dutySessions: 0, supportSessions: 0 };
    };

    let totalSessions = 0;
    const weekSet = new Set();

    huddleData.dates.forEach(dateStr => {
      const d = parseHuddleDateStr(dateStr);
      if (!d || d.getDay() === 0 || d.getDay() === 6) return;

      // Track weeks for per-week calculation
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekSet.add(weekStart.toISOString().split('T')[0]);

      const cap = getHuddleCapacity(huddleData, dateStr, hs, urgentOverrides);
      if (!cap) return;

      ['am', 'pm'].forEach(session => {
        const sessionData = cap[session];
        if (!sessionData?.byClinician?.length) return;

        // Find who's present this session
        const present = sessionData.byClinician
          .map(c => {
            const matched = allClinicians.find(tc => matchesStaffMember(c.name, tc));
            const total = (c.available || 0) + (c.embargoed || 0) + (c.booked || 0);
            return matched && total > 0 ? { ...c, matched, total } : null;
          })
          .filter(Boolean);

        if (present.length === 0) return;
        totalSessions++;

        // Record presence
        present.forEach(c => {
          initClin(c.matched.id, c.matched.name);
          clinMap[c.matched.id].sessions++;
        });

        // Duty doctor
        const dutyDoc = getDutyDoctor(huddleData, dateStr, session, dutySlots);
        if (dutyDoc) {
          const matched = allClinicians.find(tc => matchesStaffMember(dutyDoc.name, tc));
          if (matched) {
            initClin(matched.id, matched.name);
            clinMap[matched.id].dutySessions++;
          }

          // Duty support = most urgent slots after removing duty doctor
          const afterDuty = present.filter(c => !matchesStaffMember(c.name, matched || { name: dutyDoc.name }));
          if (afterDuty.length > 0) {
            const support = afterDuty.reduce((best, c) => c.total > best.total ? c : best, afterDuty[0]);
            initClin(support.matched.id, support.matched.name);
            clinMap[support.matched.id].supportSessions++;
          }
        }
      });
    });

    const weeks = weekSet.size || 1;
    const clinicians = Object.values(clinMap)
      .filter(c => c.sessions > 0)
      .map(c => {
        const sessionsPerWeek = c.sessions / weeks;
        const shareOfTotal = c.sessions / (totalSessions || 1);
        const expectedDuty = shareOfTotal * Object.values(clinMap).reduce((s, x) => s + x.dutySessions, 0);
        const expectedSupport = shareOfTotal * Object.values(clinMap).reduce((s, x) => s + x.supportSessions, 0);
        const dutyDelta = c.dutySessions - expectedDuty;
        const supportDelta = c.supportSessions - expectedSupport;
        return { ...c, sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10, expectedDuty: Math.round(expectedDuty * 10) / 10, expectedSupport: Math.round(expectedSupport * 10) / 10, dutyDelta: Math.round(dutyDelta * 10) / 10, supportDelta: Math.round(supportDelta * 10) / 10 };
      })
      .sort((a, b) => b.sessions - a.sessions);

    return { clinicians, weeks, totalSessions, totalDates: huddleData.dates.length };
  }, [huddleData, hs, dutySlots, hasDuty, allClinicians, urgentOverrides]);

  if (!huddleData) return (
    <div className="card p-12 text-center"><div className="text-2xl mb-2">📊</div><h3 className="text-sm font-semibold text-slate-600 mb-1">No CSV data</h3><p className="text-xs text-slate-400">Upload a huddle CSV on the Today page to see workload audit.</p></div>
  );

  if (!hasDuty) return (
    <div className="card p-12 text-center"><div className="text-2xl mb-2">⭐</div><h3 className="text-sm font-semibold text-slate-600 mb-1">Duty doctor slot not configured</h3><p className="text-xs text-slate-400">Set a duty doctor slot type in the Today page filter to enable workload tracking.</p></div>
  );

  if (!audit) return null;

  const DeltaBar = ({ actual, expected, delta, colour }) => {
    const max = Math.max(actual, expected, 1);
    const actualPct = (actual / max) * 100;
    const expectedPct = (expected / max) * 100;
    return (
      <div className="relative h-4 rounded bg-slate-100 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: `${Math.min(actualPct, 100)}%`, background: delta > 1 ? '#ef4444' : delta < -1 ? '#3b82f6' : colour, opacity: 0.8 }} />
        <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${Math.min(expectedPct, 100)}%`, background: '#1e293b' }} title={`Expected: ${expected}`} />
      </div>
    );
  };

  const DeltaBadge = ({ delta }) => {
    if (Math.abs(delta) < 0.5) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-medium">On track</span>;
    if (delta > 0) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">+{delta} ahead</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{delta} behind</span>;
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3">
          <div className="text-base font-semibold text-white">Workload Audit</div>
          <div className="text-[11px] text-white/60">Duty and duty support distribution across {audit.weeks} weeks · {audit.totalSessions} sessions</div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          <div className="flex flex-col items-center py-3">
            <div className="text-lg font-bold text-slate-900">{audit.clinicians.length}</div>
            <div className="text-[10px] text-slate-400">Clinicians</div>
          </div>
          <div className="flex flex-col items-center py-3">
            <div className="text-lg font-bold text-red-600">{audit.clinicians.reduce((s, c) => s + c.dutySessions, 0)}</div>
            <div className="text-[10px] text-slate-400">Duty sessions</div>
          </div>
          <div className="flex flex-col items-center py-3">
            <div className="text-lg font-bold text-blue-600">{audit.clinicians.reduce((s, c) => s + c.supportSessions, 0)}</div>
            <div className="text-[10px] text-slate-400">Support sessions</div>
          </div>
        </div>

        {/* Duty doctor distribution */}
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-700 mb-1">Duty doctor</div>
          <div className="text-xs text-slate-400 mb-3">Red = ahead of fair share · Blue = behind · Black line = expected</div>
          <div className="space-y-2">
            {audit.clinicians.filter(c => c.dutySessions > 0 || c.expectedDuty > 0.5).sort((a, b) => b.dutyDelta - a.dutyDelta).map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-28 text-xs font-medium text-slate-700 truncate text-right">{c.name}</div>
                <div className="flex-1"><DeltaBar actual={c.dutySessions} expected={c.expectedDuty} delta={c.dutyDelta} colour="#10b981" /></div>
                <div className="w-12 text-xs font-bold text-slate-700 text-center">{c.dutySessions}</div>
                <div className="w-20"><DeltaBadge delta={c.dutyDelta} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Duty support distribution */}
        <div className="p-5 border-t border-slate-100">
          <div className="text-sm font-semibold text-slate-700 mb-1">Duty support</div>
          <div className="text-xs text-slate-400 mb-3">Clinician with the most urgent slots each session (excluding duty doctor)</div>
          <div className="space-y-2">
            {audit.clinicians.filter(c => c.supportSessions > 0 || c.expectedSupport > 0.5).sort((a, b) => b.supportDelta - a.supportDelta).map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-28 text-xs font-medium text-slate-700 truncate text-right">{c.name}</div>
                <div className="flex-1"><DeltaBar actual={c.supportSessions} expected={c.expectedSupport} delta={c.supportDelta} colour="#3b82f6" /></div>
                <div className="w-12 text-xs font-bold text-slate-700 text-center">{c.supportSessions}</div>
                <div className="w-20"><DeltaBadge delta={c.supportDelta} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions per week breakdown */}
        <div className="p-5 border-t border-slate-100">
          <div className="text-sm font-semibold text-slate-700 mb-1">Sessions per week</div>
          <div className="text-xs text-slate-400 mb-3">Average sessions worked per clinician per week over the data period</div>
          <div className="space-y-2">
            {audit.clinicians.map(c => {
              const maxSPW = Math.max(...audit.clinicians.map(x => x.sessionsPerWeek), 1);
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-28 text-xs font-medium text-slate-700 truncate text-right">{c.name}</div>
                  <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${(c.sessionsPerWeek / maxSPW) * 100}%`, background: '#8b5cf6', opacity: 0.7 }} />
                  </div>
                  <div className="w-12 text-xs font-bold text-slate-700 text-center">{c.sessionsPerWeek}</div>
                  <div className="w-20 text-[10px] text-slate-400">{c.sessions} total</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
