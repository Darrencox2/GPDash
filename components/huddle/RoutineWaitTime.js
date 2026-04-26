'use client';
import { useMemo } from 'react';
import { getHuddleCapacity } from '@/lib/huddle';
import { matchesStaffMember, toHuddleDateStr } from '@/lib/data';

export default function RoutineWaitTime({ data, huddleData, routineOverrides }) {
  const hs = data?.huddleSettings || {};

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const gpClinicians = useMemo(() =>
    ensureArray(data?.clinicians).filter(c => c.status !== 'left' && c.status !== 'administrative' && c.group === 'gp'),
    [data?.clinicians]
  );

  const waits = useMemo(() => {
    if (!huddleData || gpClinicians.length === 0) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const slotsByDay = []; // { date, workingDayOffset, count }
    let workingDayOffset = 0;

    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      workingDayOffset++;
      const dateStr = toHuddleDateStr(d);
      if (!huddleData.dates?.includes(dateStr)) continue;

      const cap = getHuddleCapacity(huddleData, dateStr, hs, routineOverrides);
      let dayCount = 0;
      ['am', 'pm'].forEach(session => {
        (cap[session]?.byClinician || []).forEach(c => {
          // Only count GP clinicians
          const matched = gpClinicians.find(gc => matchesStaffMember(c.name, gc));
          if (matched) dayCount += c.available || 0;
        });
      });
      if (dayCount > 0) slotsByDay.push({ date: d, workingDayOffset, count: dayCount });
    }

    // Find when we hit cumulative 1st, 10th, 50th slot
    const find = (target) => {
      let cumulative = 0;
      for (const day of slotsByDay) {
        cumulative += day.count;
        if (cumulative >= target) return { days: day.workingDayOffset - 1, date: day.date };
      }
      return null;
    };

    return {
      next: find(1),
      tenth: find(10),
      fiftieth: find(50),
      total: slotsByDay.reduce((s, d) => s + d.count, 0),
    };
  }, [huddleData, hs, routineOverrides, gpClinicians]);

  if (!waits) return null;

  const formatWait = (w) => {
    if (!w) return { num: '—', label: 'none in 60d', colour: '#64748b' };
    const days = w.days;
    if (days === 0) return { num: 'Today', label: '', colour: '#34d399' };
    if (days === 1) return { num: '1', label: 'working day', colour: '#34d399' };
    return { num: `${days}`, label: 'working days', colour: days <= 3 ? '#34d399' : days <= 7 ? '#fbbf24' : '#f87171' };
  };

  const cards = [
    { title: 'Next available', wait: waits.next, sub: 'soonest GP slot' },
    { title: '10th appointment', wait: waits.tenth, sub: 'realistic booking' },
    { title: '50th appointment', wait: waits.fiftieth, sub: 'capacity health' },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-4 py-2.5" style={{ background: 'rgba(15,23,42,0.85)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-heading text-base font-medium text-slate-200">Routine GP wait times</div>
            <div className="text-[11px] text-slate-600">Working days until next available routine GP appointments</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/5">
        {cards.map((c, i) => {
          const f = formatWait(c.wait);
          return (
            <div key={i} className="p-3 sm:p-4 text-center">
              <div className="text-[10px] sm:text-xs text-slate-500 mb-1">{c.title}</div>
              <div className="font-mono-data text-2xl sm:text-3xl font-bold leading-none" style={{ color: f.colour }}>{f.num}</div>
              <div className="text-[10px] text-slate-600 mt-1">{f.label || c.sub}</div>
              {c.wait?.date && <div className="text-[10px] text-slate-500 mt-0.5">{c.wait.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
