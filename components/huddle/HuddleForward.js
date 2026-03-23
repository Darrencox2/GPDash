'use client';
import { useState } from 'react';
import { SectionHeading } from '@/components/ui';
import { getHuddleCapacity, getDateTotals, getHuddleWeeks, getCapacityColour, getGradientColour, getFilterOverrides, getAllFilterNames, getMergedFilterOverrides, parseHuddleDateStr } from '@/lib/huddle';
import SlotFilter from './SlotFilter';

const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function HuddleForward({ data, saveData, huddleData, setActiveSection }) {
  const [viewMode, setViewMode] = useState('urgent');
  const [slotOverrides, setSlotOverrides] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [chartFilters, setChartFilters] = useState(['urgent']);
  const hs = data?.huddleSettings || {};
  const filterNames = getAllFilterNames(hs);

  if (!huddleData) {
    return (
      <div className="space-y-6 animate-in">
        <SectionHeading title="Urgent Capacity Planning" subtitle="This week + next 5 weeks" />
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📅</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No Report Data</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload a report on the Today page first.</p>
          <button onClick={() => setActiveSection('huddle-today')} className="btn-primary">Go to Today</button>
        </div>
      </div>
    );
  }

  const weeks = getHuddleWeeks(huddleData);
  const viewOverrides = slotOverrides || getFilterOverrides(viewMode, hs);

  // Pre-compute all values for gradient colouring
  const allVals = [];
  const weekData = weeks.map(week => {
    const days = {};
    DAYS_SHORT.forEach(d => {
      const dateStr = week.dates[d];
      if (!dateStr) { days[d] = null; return; }
      const cap = getHuddleCapacity(huddleData, dateStr, hs, viewOverrides);
      days[d] = cap;
      if (cap.am.total > 0) allVals.push(cap.am.total);
      if (cap.pm.total > 0) allVals.push(cap.pm.total);
    });
    return { week, days };
  });

  // Summary stats
  let totalSlots = 0, dayCount = 0, lowDays = 0;
  weekData.forEach(({ week, days }) => {
    DAYS_SHORT.forEach(d => {
      const cap = days[d];
      if (!cap) return;
      const total = cap.am.total + cap.pm.total;
      if (total === 0) return;
      totalSlots += total; dayCount++;
      if (viewMode === 'urgent') {
        const exp = (hs.expectedCapacity?.[DAY_NAMES[d]]?.am || 0) + (hs.expectedCapacity?.[DAY_NAMES[d]]?.pm || 0);
        if (exp > 0 && total < exp * 0.8) lowDays++;
      }
    });
  });
  const avgPerDay = dayCount > 0 ? Math.round(totalSlots / dayCount) : 0;

  return (
    <div className="space-y-4 animate-in">
      <SectionHeading title="Urgent Capacity Planning" subtitle="This week + next 5 weeks">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {filterNames.map(f => (
            <button key={f} onClick={() => { setViewMode(f); setSlotOverrides(null); }}
              className={`px-3 py-1.5 font-medium transition-colors border-r border-slate-200 last:border-r-0 capitalize ${viewMode === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{f}</button>
          ))}
        </div>
        <SlotFilter overrides={slotOverrides} setOverrides={setSlotOverrides} show={showFilter} setShow={setShowFilter} huddleSettings={hs} />
      </SectionHeading>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-3 text-center"><div className="text-2xl font-bold text-slate-900">{totalSlots}</div><div className="text-[11px] text-slate-500">Total slots ({weeks.length}wk)</div></div>
        <div className="card p-3 text-center"><div className="text-2xl font-bold text-slate-900">{avgPerDay}</div><div className="text-[11px] text-slate-500">Avg per day</div></div>
        <div className="card p-3 text-center"><div className={`text-2xl font-bold ${lowDays > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{lowDays}</div><div className="text-[11px] text-slate-500">{viewMode === 'urgent' ? 'Days below target' : 'Low capacity days'}</div></div>
      </div>

      {/* Colour key */}
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-300" />{viewMode === 'urgent' ? '≥100% target' : 'High'}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-300" />{viewMode === 'urgent' ? '80–99%' : 'Medium'}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 border border-red-300" />{viewMode === 'urgent' ? '<80%' : 'Low'}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200" />Closed</span>
      </div>

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-medium text-slate-600 sticky left-0 bg-slate-50 min-w-[90px]">Week</th>
                {DAYS_SHORT.map(d => <th key={d} className="text-center px-1 py-2 font-medium text-slate-600 min-w-[52px]">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {weekData.map(({ week, days }, wi) => {
                const weekLabel = week.monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                return (
                  <tr key={wi} className={`border-b border-slate-100 ${wi % 2 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-3 py-1 font-medium text-slate-700 sticky left-0 bg-white text-[11px] whitespace-nowrap">{weekLabel}</td>
                    {DAYS_SHORT.map(d => {
                      const cap = days[d];
                      if (!cap) return <td key={d} className="text-center px-1 py-1 text-slate-300">–</td>;
                      const dateStr = week.dates[d];
                      const amC = viewMode === 'urgent' ? getCapacityColour(cap.am.total, DAY_NAMES[d], 'am', 'urgent', hs.expectedCapacity) : getGradientColour(cap.am.total, allVals);
                      const pmC = viewMode === 'urgent' ? getCapacityColour(cap.pm.total, DAY_NAMES[d], 'pm', 'urgent', hs.expectedCapacity) : getGradientColour(cap.pm.total, allVals);
                      const isSel = selectedCell?.dateStr === dateStr;
                      return (
                        <td key={d} className={`px-1 py-1 cursor-pointer transition-all ${isSel ? 'ring-2 ring-slate-900 ring-inset rounded' : 'hover:bg-slate-100'}`}
                          onClick={() => setSelectedCell(isSel ? null : { dateStr, dayName: d })}>
                          <div className="flex flex-col items-center gap-0.5">
                            <div className={`w-full text-center rounded-sm px-1 py-0.5 font-semibold border ${amC || 'text-slate-700 border-transparent'}`}><span className="text-[9px] font-normal text-slate-400 mr-0.5">AM</span>{cap.am.total}{cap.am.embargoed > 0 && <span className="text-[9px] font-normal text-amber-500">+{cap.am.embargoed}</span>}</div>
                            <div className={`w-full text-center rounded-sm px-1 py-0.5 font-semibold border ${pmC || 'text-slate-700 border-transparent'}`}><span className="text-[9px] font-normal text-slate-400 mr-0.5">PM</span>{cap.pm.total}{cap.pm.embargoed > 0 && <span className="text-[9px] font-normal text-amber-500">+{cap.pm.embargoed}</span>}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fixed popup panel */}
      {selectedCell && (() => {
        const cap = getHuddleCapacity(huddleData, selectedCell.dateStr, hs, viewOverrides);
        return (
          <div className="fixed right-4 top-20 z-30 w-72 shadow-xl">
            <div className="card overflow-hidden border-slate-300">
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3">
                <div className="flex items-center justify-between text-white">
                  <div><div className="text-sm font-bold">{selectedCell.dayName} {selectedCell.dateStr}</div><div className="text-xs opacity-80">{cap.am.total + cap.pm.total} available{(cap.am.embargoed||0) + (cap.pm.embargoed||0) > 0 ? `, ${(cap.am.embargoed||0) + (cap.pm.embargoed||0)} embargoed` : ''}</div></div>
                  <button onClick={() => setSelectedCell(null)} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
                </div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                {[{ label: 'Morning', data: cap.am, colour: 'text-amber-600' }, { label: 'Afternoon', data: cap.pm, colour: 'text-blue-600' }].map(s => (
                  <div key={s.label} className="p-3">
                    <div className="flex items-center justify-between mb-2"><span className={`text-xs font-semibold ${s.colour}`}>{s.label}</span><div className="flex items-center gap-2"><span className={`text-sm font-bold ${s.colour}`}>{s.data.total}</span>{(s.data.embargoed||0) > 0 && <span className="text-xs text-amber-500">+{s.data.embargoed}</span>}</div></div>
                    {s.data.byClinician.length > 0 ? s.data.byClinician.map((c, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5"><span className="text-xs text-slate-600 truncate mr-2">{c.name}</span><div className="flex items-center gap-1"><span className={`text-xs font-semibold ${s.colour} tabular-nums`}>{c.available}</span>{c.embargoed > 0 && <span className="text-[10px] text-amber-500">+{c.embargoed}</span>}</div></div>
                    )) : <div className="text-xs text-slate-400">No capacity</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Chart */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Capacity Overview — Available vs Booked</h2>
            <div className="flex flex-wrap gap-1">
              {filterNames.map(f => {
                const isActive = chartFilters.includes(f);
                return (
                  <button key={f} onClick={() => {
                    if (f === 'all') { setChartFilters(['all']); return; }
                    let next = chartFilters.filter(x => x !== 'all');
                    next = isActive ? next.filter(x => x !== f) : [...next, f];
                    if (next.length === 0) next = ['urgent'];
                    setChartFilters(next);
                  }} className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="p-5">
          {(() => {
            const merged = getMergedFilterOverrides(chartFilters, hs);
            const nowDate = new Date(), cDay = nowDate.getDay();
            const cMon = new Date(nowDate); cMon.setDate(nowDate.getDate() - (cDay === 0 ? 6 : cDay - 1)); cMon.setHours(0,0,0,0);
            const endD = new Date(cMon); endD.setDate(endD.getDate() + 28);
            const chartDates = huddleData.dates.filter(d => { const dt = parseHuddleDateStr(d); return dt >= cMon && dt < endD && dt.getDay() !== 0 && dt.getDay() !== 6; });
            if (chartDates.length === 0) return <div className="text-sm text-slate-400 text-center py-8">No data available.</div>;
            const chartData = chartDates.map(d => ({ date: d, ...getDateTotals(huddleData, d, hs, merged) }));
            const maxVal = Math.max(...chartData.map(d => d.available + (d.embargoed || 0) + d.booked), 1);
            return (
              <div>
                <div className="flex items-center gap-5 mb-4 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-500 to-emerald-400" /> Available</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gradient-to-t from-amber-400 to-amber-300" /> Embargoed</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gradient-to-t from-slate-400 to-slate-300" /> Booked</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{chartFilters.join(' + ')}</span>
                </div>
                <div className="flex items-end gap-[3px]" style={{ height: '220px' }}>
                  {chartData.map((d, i) => {
                    const emb = d.embargoed || 0;
                    const total = d.available + emb + d.booked;
                    const barH = Math.round((total / maxVal) * 180);
                    const bookedH = total > 0 ? Math.round((d.booked / total) * barH) : 0;
                    const embH = total > 0 ? Math.round((emb / total) * barH) : 0;
                    const availH = barH - bookedH - embH;
                    const dt = parseHuddleDateStr(d.date);
                    const dayL = ['','M','T','W','T','F'][dt.getDay()], dateL = dt.getDate(), isMon = dt.getDay() === 1;
                    return (
                      <div key={i} className={`flex-1 flex flex-col items-center justify-end ${isMon && i > 0 ? 'ml-1.5 border-l border-slate-200 pl-1.5' : ''}`}>
                        <div className="text-[9px] text-slate-500 mb-1 font-semibold tabular-nums">{total > 0 ? total : ''}</div>
                        <div className="w-full flex flex-col justify-end">
                          {availH > 0 && <div className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-sm" style={{ height: `${availH}px` }} />}
                          {embH > 0 && <div className={`w-full bg-gradient-to-t from-amber-400 to-amber-300 ${availH === 0 ? 'rounded-t-sm' : ''}`} style={{ height: `${embH}px` }} />}
                          {bookedH > 0 && <div className={`w-full bg-gradient-to-t from-slate-400 to-slate-300 ${availH === 0 && embH === 0 ? 'rounded-t-sm' : ''}`} style={{ height: `${bookedH}px` }} />}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-1.5 font-semibold">{dayL}</div>
                        <div className="text-[9px] text-slate-500 leading-none">{dateL}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
