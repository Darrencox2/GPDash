'use client';
import { DAYS, formatWeekRange, getWeekStart, getCurrentDay, groupAllocationsByCovering } from '@/lib/data';

export default function BuddyWeek({ data, selectedWeek, setSelectedWeek, toast, helpers }) {
  const { ensureArray, getDateKeyForDay, isClosedDay, getClosedReason, toggleClosedDay, getClinicianById, getWeekAbsences } = helpers;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Week View</h1>
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">◀ Prev</button>
            <div className="text-sm font-medium text-slate-900 min-w-[180px] text-center">{formatWeekRange(selectedWeek)}</div>
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">Next ▶</button>
            <button onClick={() => setSelectedWeek(getWeekStart(new Date()))} className="ml-2 px-4 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 shadow-md">Today</button>
          </div>
          <button onClick={() => {
            const missing = DAYS.filter(d => { const dk = getDateKeyForDay(d); return !isClosedDay(dk) && !data?.allocationHistory?.[dk]; });
            if (missing.length > 0) { alert(`Missing allocations for: ${missing.join(', ')}`); return; }
            let s = `BUDDY ALLOCATIONS — ${formatWeekRange(selectedWeek)}\n${'='.repeat(50)}\n\n`;
            DAYS.forEach(d => {
              const dk = getDateKeyForDay(d);
              const dt = new Date(dk + 'T12:00:00');
              const ds = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
              if (isClosedDay(dk)) { s += `${ds}\nPRACTICE CLOSED — ${getClosedReason(dk)}\n\n`; return; }
              const e = data?.allocationHistory?.[dk];
              if (!e) { s += `${ds}\nNo allocation generated\n\n`; return; }
              s += `${ds}\n`;
              const g = groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []);
              const rows = (e.presentIds || []).map(id => { const c = getClinicianById(id); const t = g[id] || { absent: [], dayOff: [] }; return { clinician: c, tasks: t, canCover: c?.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 }; }).filter(r => r.clinician);
              rows.sort((a, b) => { if (a.canCover && !b.canCover) return -1; if (!a.canCover && b.canCover) return 1; if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; } return 0; });
              if (rows.length === 0) { s += `No clinicians present\n\n`; return; }
              rows.forEach(({ clinician, tasks }) => { const f = tasks.absent.length > 0 ? tasks.absent.map(i => getClinicianById(i)?.initials || '??').join(', ') : '-'; const v = tasks.dayOff.length > 0 ? tasks.dayOff.map(i => getClinicianById(i)?.initials || '??').join(', ') : '-'; s += `${clinician.initials}: File ${f} / View ${v}\n`; });
              s += '\n';
            });
            navigator.clipboard.writeText(s.trim());
            toast('Copied to clipboard', 'success', 2000);
          }} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-md flex items-center gap-2">📋 Copy Week</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {DAYS.map(d => {
          const dk = getDateKeyForDay(d);
          const dt = new Date(dk + 'T12:00:00');
          const closed = isClosedDay(dk);
          const e = data?.allocationHistory?.[dk];
          const has = !!e;
          const g = has ? groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []) : {};
          return (
            <div key={d} className={`card overflow-hidden ${closed ? 'bg-slate-100' : ''}`}>
              <div className={`px-4 py-3 border-b ${closed ? 'bg-slate-200 border-slate-300' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div><div className="text-sm font-medium text-slate-900">{d}</div><div className="text-xs text-slate-500">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div></div>
                  <button onClick={() => toggleClosedDay(dk, 'Bank Holiday')} className={`text-xs px-2 py-1 rounded transition-colors ${closed ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{closed ? 'Closed' : 'Open'}</button>
                </div>
              </div>
              <div className="p-4 min-h-[120px]">
                {closed ? <div className="text-center text-slate-500 text-sm py-4"><div className="font-medium">Practice Closed</div><div className="text-xs mt-1">{getClosedReason(dk)}</div></div>
                : !has ? <div className="text-center text-amber-600 text-sm py-4"><div className="font-medium">Not generated</div><div className="text-xs mt-1 text-slate-500">Go to Daily view</div></div>
                : (() => {
                  const rows = (e.presentIds || []).map(bid => {
                    const b = getClinicianById(bid);
                    if (!b) return null;
                    const t = g[bid] || { absent: [], dayOff: [] };
                    const hasTasks = t.absent.length > 0 || t.dayOff.length > 0;
                    const isOv = (e.overriddenIds || []).includes(bid);
                    return { bid, b, t, hasTasks, isOv };
                  }).filter(Boolean).sort((a, b) => (b.hasTasks ? 1 : 0) - (a.hasTasks ? 1 : 0));
                  return <div className="space-y-1.5 text-sm">
                    {rows.map(({ bid, b, t, hasTasks, isOv }) => (
                      <div key={bid} className="flex items-center gap-2">
                        <span className={`font-medium w-8 ${hasTasks ? 'text-slate-700' : 'text-slate-400'}`} style={isOv ? {outline:'2px solid #f59e0b',outlineOffset:'1px',borderRadius:3} : undefined}>{b.initials}</span>
                        {hasTasks ? (
                          <div className="flex flex-wrap gap-1">
                            {t.absent.map(i => { const x = getClinicianById(i); return x ? <span key={i} className="status-tag absent text-xs">{x.initials}</span> : null; })}
                            {t.dayOff.map(i => { const x = getClinicianById(i); return x ? <span key={i} className="status-tag dayoff text-xs">{x.initials}</span> : null; })}
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </div>
                    ))}
                  </div>;
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-6 text-xs text-slate-500 justify-center flex-wrap">
        <span className="flex items-center gap-1.5"><span className="status-tag absent">XX</span>File & Action (absent)</span>
        <span className="flex items-center gap-1.5"><span className="status-tag dayoff">XX</span>View Only (day off)</span>
        <span className="flex items-center gap-1.5"><span style={{display:'inline-block',padding:'1px 4px',borderRadius:3,outline:'2px solid #f59e0b',outlineOffset:'1px',fontSize:11,fontWeight:500,color:'#64748b'}}>XX</span><span>Manually overridden</span></span>
      </div>

      <div className="card p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">Planned Leave This Week</h2>
          <p className="text-xs text-slate-500 mt-0.5">{data.lastSyncTime ? `Last synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not yet synced'}</p>
        </div>
        {getWeekAbsences().length === 0 ? <div className="text-center py-6 text-slate-400 text-sm">{data.teamnetUrl ? 'No planned leave this week' : 'Set TeamNet URL in Settings to sync leave calendar'}</div>
        : <div className="grid grid-cols-5 gap-2">{DAYS.map(d => { const dk = getDateKeyForDay(d); const dt = new Date(dk + 'T12:00:00'); const da = getWeekAbsences().filter(a => a.day === d); return (<div key={d} className="border border-slate-200 rounded-lg overflow-hidden"><div className="bg-slate-50 px-3 py-2 border-b border-slate-200"><div className="text-xs font-medium text-slate-700">{d.slice(0, 3)}</div><div className="text-xs text-slate-400">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div></div><div className="p-2 min-h-[60px]">{da.length === 0 ? <div className="text-xs text-slate-300 text-center py-2">—</div> : <div className="space-y-1">{da.map((a, i) => { const cc = a.reason === 'Holiday' || a.reason === 'Annual Leave' ? 'bg-blue-100 text-blue-700' : a.reason === 'Training' || a.reason === 'Study' ? 'bg-amber-100 text-amber-700' : a.reason === 'Sick' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'; return <div key={i} className="flex items-center gap-1.5"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cc}`}>{a.clinician.initials}</span><span className="text-xs text-slate-400 truncate">{a.reason}</span></div>; })}</div>}</div></div>); })}</div>}
      </div>
    </div>
  );
}
