'use client';
import { useMemo } from 'react';
import { getHuddleCapacity, getDutyDoctor, parseHuddleDateStr } from '@/lib/huddle';
import { matchesStaffMember } from '@/lib/data';

export default function WorkloadAudit({ data, huddleData }) {
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const urgentOverrides = useMemo(() => hs?.savedSlotFilters?.urgent || null, [hs]);

  const allClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative');
  }, [data?.clinicians]);

  const audit = useMemo(() => {
    if (!huddleData?.dates || !hasDuty) return null;

    const clinMap = {};
    const initClin = (id, name) => {
      if (!clinMap[id]) clinMap[id] = { id, name, sessions: 0, dutySessions: 0, supportSessions: 0 };
    };

    huddleData.dates.forEach(dateStr => {
      const d = parseHuddleDateStr(dateStr);
      if (!d || d.getDay() === 0 || d.getDay() === 6) return;

      const cap = getHuddleCapacity(huddleData, dateStr, hs, urgentOverrides);
      if (!cap) return;

      ['am', 'pm'].forEach(session => {
        const sessionData = cap[session];
        if (!sessionData?.byClinician?.length) return;

        const present = sessionData.byClinician
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
          }

          const afterDuty = present.filter(c =>
            !matchesStaffMember(c.name, matched || { name: dutyDoc.name }) &&
            !c.matched.name.toLowerCase().includes('balson')
          );
          if (afterDuty.length > 0) {
            const support = afterDuty.reduce((best, c) => c.total > best.total ? c : best, afterDuty[0]);
            initClin(support.matched.id, support.matched.name);
            clinMap[support.matched.id].supportSessions++;
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

    const dutyClinicans = clinicians.filter(c => c.dutySessions > 0);
    const supportClinicians = clinicians.filter(c => c.supportSessions > 0);
    const avgDutyRatio = dutyClinicans.length > 0 ? Math.round((dutyClinicans.reduce((s, c) => s + c.dutyRatio, 0) / dutyClinicans.length) * 100) / 100 : 0;
    const avgSupportRatio = supportClinicians.length > 0 ? Math.round((supportClinicians.reduce((s, c) => s + c.supportRatio, 0) / supportClinicians.length) * 100) / 100 : 0;

    return { clinicians, avgDutyRatio, avgSupportRatio };
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

  const RatioRow = ({ c, ratio, avg, max, colour }) => {
    const delta = ratio - avg;
    const absDelta = Math.abs(delta);
    const isHigh = delta > 0.03;
    const isLow = delta < -0.03;
    return (
      <div className="flex items-center gap-3">
        <div className="w-32 text-xs font-medium text-slate-700 truncate text-right">{c.name}</div>
        <div className="flex-1 relative h-5 rounded bg-slate-100 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 rounded" style={{ width: `${(ratio / max) * 100}%`, background: isHigh ? '#ef4444' : isLow ? '#3b82f6' : colour, opacity: 0.75 }} />
          <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(avg / max) * 100}%`, background: '#1e293b' }} title={`Average: ${avg.toFixed(2)}`} />
        </div>
        <div className="w-10 text-sm font-bold text-slate-800 text-center">{ratio.toFixed(2)}</div>
        <div className="w-16 text-right">
          {absDelta < 0.03 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-medium">Fair</span>
            : isHigh ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">+{delta.toFixed(2)}</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{delta.toFixed(2)}</span>}
        </div>
        <div className="w-16 text-[10px] text-slate-400 text-right">{ratio === c.dutyRatio ? c.dutySessions : c.supportSessions}/{c.sessions}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3">
          <div className="text-base font-semibold text-white">Workload Audit</div>
          <div className="text-[11px] text-white/60">Duty and support ratios from CSV history</div>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-slate-700">Duty doctor ratio</div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">avg {audit.avgDutyRatio.toFixed(2)}</span>
          </div>
          <div className="text-xs text-slate-400 mb-3">Duty sessions ÷ total sessions worked. Black line = average. Everyone should be similar.</div>
          <div className="space-y-1.5">
            {audit.clinicians.filter(c => c.dutySessions > 0 || c.sessions >= 5).sort((a, b) => b.dutyRatio - a.dutyRatio).map(c => (
              <RatioRow key={c.id} c={c} ratio={c.dutyRatio} avg={audit.avgDutyRatio} max={maxDutyRatio} colour="#10b981" />
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold text-slate-700">Duty support ratio</div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">avg {audit.avgSupportRatio.toFixed(2)}</span>
          </div>
          <div className="text-xs text-slate-400 mb-3">Support sessions ÷ total sessions worked. Clinician with most urgent slots (excl. duty doctor).</div>
          <div className="space-y-1.5">
            {audit.clinicians.filter(c => c.supportSessions > 0 || c.sessions >= 5).sort((a, b) => b.supportRatio - a.supportRatio).map(c => (
              <RatioRow key={c.id} c={c} ratio={c.supportRatio} avg={audit.avgSupportRatio} max={maxSupportRatio} colour="#3b82f6" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
