'use client';
import { useState, useEffect, useMemo } from 'react';
import { DAYS, groupAllocationsByCovering, DEFAULT_SETTINGS, toLocalIso, computeDayStatus } from '@/lib/data';
import { APP_VERSION } from '@/lib/version';

export default function PublicBuddyCover() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/data?buddy=1');
      const d = await res.json();
      setData(d);
      setLastRefresh(new Date());
    } catch (e) { console.error('Failed to fetch buddy data:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 120000); return () => clearInterval(t); }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)'}}>
      <div className="text-slate-500 text-sm">Loading buddy cover...</div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)'}}>
      <div className="text-red-400 text-sm">Unable to load data</div>
    </div>
  );

  return <BuddyCoverView data={data} lastRefresh={lastRefresh} onRefresh={fetchData} />;
}

function BuddyCoverView({ data, lastRefresh, onRefresh }) {
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const dateKey = toLocalIso(today);
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  const dateDisplay = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const cliniciansList = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
  const getClinicianById = (id) => ensureArray(data.clinicians).find(c => c.id === id);

  // Check if practice is closed
  const isClosed = data.closedDays?.[dateKey];
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  // Compute today's status
  const status = useMemo(() => {
    if (isClosed || isWeekend) return null;
    return computeDayStatus(data, dateKey, dayName);
  }, [data, dateKey, dayName, isClosed, isWeekend]);

  // Get allocations
  const alloc = data.allocationHistory?.[dateKey];
  const hasAlloc = alloc && (Object.keys(alloc.allocations || {}).length > 0 || Object.keys(alloc.dayOffAllocations || {}).length > 0);
  const grouped = hasAlloc ? groupAllocationsByCovering(alloc.allocations || {}, alloc.dayOffAllocations || {}, alloc.presentIds || []) : {};

  // Build rows
  const rows = useMemo(() => {
    if (!hasAlloc) return [];
    return ensureArray(alloc.presentIds).map(id => {
      const c = getClinicianById(id);
      const t = grouped[id] || { absent: [], dayOff: [] };
      return c ? { id, clinician: c, tasks: t, canCover: c.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 } : null;
    }).filter(Boolean).sort((a, b) => {
      if (a.canCover && !b.canCover) return -1;
      if (!a.canCover && b.canCover) return 1;
      if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; }
      return 0;
    });
  }, [hasAlloc, alloc, grouped]);

  // Absent and day-off clinicians
  const absentClinicians = useMemo(() => {
    if (!status) return [];
    return ensureArray(status.absent).map(id => getClinicianById(id)).filter(Boolean);
  }, [status]);

  const dayOffClinicians = useMemo(() => {
    if (!status) return [];
    return ensureArray(status.dayOff).map(id => getClinicianById(id)).filter(Boolean);
  }, [status]);

  const presentCount = status ? ensureArray(status.present).length : 0;

  return (
    <div className="min-h-screen" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',fontFamily:"'DM Sans', system-ui, sans-serif"}}>
      <div className="max-w-3xl mx-auto p-4 lg:p-8 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{fontFamily:"'Outfit',sans-serif"}}>Buddy Cover</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-sm">{dateDisplay}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && <span className="text-xs text-slate-600">Updated {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={onRefresh} className="rounded-lg text-xs text-slate-500 hover:text-white hover:bg-white/10 transition-colors" style={{border:'1px solid rgba(255,255,255,0.08)',padding:'6px 12px'}}>Refresh</button>
          </div>
        </div>

        {/* Closed / Weekend */}
        {(isClosed || isWeekend) && (
          <div className="rounded-xl p-10 text-center" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="text-3xl mb-3">🏠</div>
            <div className="text-lg font-medium text-white" style={{fontFamily:"'Outfit',sans-serif"}}>Practice Closed</div>
            <div className="text-sm text-slate-500 mt-1">{isClosed ? (typeof isClosed === 'string' ? isClosed : 'Closed') : 'Weekend'}</div>
          </div>
        )}

        {/* No allocations */}
        {!isClosed && !isWeekend && !hasAlloc && (
          <div className="rounded-xl p-10 text-center" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="text-3xl mb-3">📋</div>
            <div className="text-lg font-medium text-white" style={{fontFamily:"'Outfit',sans-serif"}}>No Allocations Yet</div>
            <div className="text-sm text-slate-500 mt-1">Buddy cover for today has not been generated yet</div>
          </div>
        )}

        {/* Today's summary */}
        {!isClosed && !isWeekend && status && (
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl p-4" style={{background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.15)'}}>
              <div className="text-sm text-slate-500">Present</div>
              <div className="text-3xl font-bold text-emerald-400" style={{fontFamily:"'Space Mono',monospace"}}>{presentCount}</div>
            </div>
            <div className="flex-1 rounded-xl p-4" style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.15)'}}>
              <div className="text-sm text-slate-500">Absent</div>
              <div className="text-3xl font-bold text-red-400" style={{fontFamily:"'Space Mono',monospace"}}>{absentClinicians.length}</div>
            </div>
            <div className="flex-1 rounded-xl p-4" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.15)'}}>
              <div className="text-sm text-slate-500">Day Off</div>
              <div className="text-3xl font-bold text-amber-400" style={{fontFamily:"'Space Mono',monospace"}}>{dayOffClinicians.length}</div>
            </div>
          </div>
        )}

        {/* Absent / Day Off names */}
        {(absentClinicians.length > 0 || dayOffClinicians.length > 0) && (
          <div className="flex gap-3 flex-wrap">
            {absentClinicians.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-600 uppercase tracking-wider">Absent:</span>
                {absentClinicians.map(c => (
                  <span key={c.id} className="rounded-md font-bold text-white text-sm" style={{background:'#ef4444',padding:'3px 10px'}}>{c.initials}</span>
                ))}
              </div>
            )}
            {dayOffClinicians.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-600 uppercase tracking-wider">Day off:</span>
                {dayOffClinicians.map(c => (
                  <span key={c.id} className="rounded-md font-bold text-white text-sm" style={{background:'#f59e0b',padding:'3px 10px'}}>{c.initials}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Allocations */}
        {hasAlloc && (
          <div className="rounded-xl overflow-hidden" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="flex items-center justify-between" style={{background:'rgba(15,23,42,0.85)',padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div>
                <h2 className="text-base font-semibold text-white" style={{fontFamily:"'Outfit',sans-serif"}}>Buddy Allocations</h2>
                <p className="text-xs text-slate-500 mt-0.5">Who is covering for whom today</p>
              </div>
            </div>
            <div className="p-5">
              <table className="w-full">
                <thead>
                  <tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Covering</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide"><span className="text-red-400">File & Action</span><span className="text-slate-600 font-normal ml-1">(absent)</span></th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide"><span className="text-amber-400">View Only</span><span className="text-slate-600 font-normal ml-1">(day off)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ clinician, tasks, canCover }) => (
                    <tr key={clinician.id} className={!canCover ? 'opacity-50' : ''} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{background:'#10b981',fontFamily:"'Outfit',sans-serif"}}>{clinician.initials}</div>
                          <div>
                            <div className="text-sm font-medium text-slate-200">{clinician.name}</div>
                            <div className="text-xs text-slate-500">{clinician.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {tasks.absent.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">{tasks.absent.map(id => {
                            const x = getClinicianById(id);
                            return x ? <span key={id} className="inline-flex items-center justify-center rounded-md text-sm font-bold text-white" style={{padding:'4px 10px',background:'#ef4444',minWidth:36}}>{x.initials}</span> : null;
                          })}</div>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        {tasks.dayOff.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">{tasks.dayOff.map(id => {
                            const x = getClinicianById(id);
                            return x ? <span key={id} className="inline-flex items-center justify-center rounded-md text-sm font-bold text-white" style={{padding:'4px 10px',background:'#f59e0b',minWidth:36}}>{x.initials}</span> : null;
                          })}</div>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Key */}
              <div className="mt-5 pt-4 flex gap-5 text-xs text-slate-500 flex-wrap" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <span className="flex items-center gap-1.5"><span className="rounded-md text-xs font-bold text-white" style={{background:'#10b981',padding:'2px 6px'}}>XX</span>Covering</span>
                <span className="flex items-center gap-1.5"><span className="rounded-md text-xs font-bold text-white" style={{background:'#ef4444',padding:'2px 6px'}}>XX</span>File & action (absent)</span>
                <span className="flex items-center gap-1.5"><span className="rounded-md text-xs font-bold text-white" style={{background:'#f59e0b',padding:'2px 6px'}}>XX</span>View only (day off)</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-700 pt-4">
          <span>GPDash {APP_VERSION} · Auto-refreshes every 2 minutes</span>
        </div>
      </div>
    </div>
  );
}
