'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getHuddleCapacity, getDutyDoctor, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, DAYS, getWeekStart, toLocalIso } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';

const GROUP_META = {
  gp: { label: 'Clinicians', bg: 'rgba(99,102,241,0.15)', tx: '#a5b4fc', dot: '#6366f1' },
  nursing: { label: 'Nursing', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7', dot: '#10b981' },
  allied: { label: 'Allied Health', bg: 'rgba(168,85,247,0.15)', tx: '#c4b5fd', dot: '#8b5cf6' },
};

export default function MyRota({ data, huddleData, standalone, setActiveSection }) {
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative').sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.clinicians]);

  const [selectedId, setSelectedId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (clinicians.length === 0) return;
    const hash = window.location.hash;
    if (hash.startsWith('#rota-')) {
      const init = hash.slice(6).toUpperCase();
      const m = clinicians.find(c => c.initials === init);
      if (m) { setSelectedId(m.id); return; }
    }
    if (!selectedId) setSelectedId(clinicians[0].id);
  }, [clinicians]);

  const select = c => { setSelectedId(c.id); setSearch(''); window.location.hash = `rota-${c.initials}`; };
  const selected = clinicians.find(c => c.id === selectedId);
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const gm = selected ? GROUP_META[selected.group] || GROUP_META.allied : GROUP_META.allied;
  const navigateWeek = d => { const dt = new Date(weekStart); dt.setDate(dt.getDate() + d * 7); setWeekStart(dt); };
  const isThisWeek = weekStart.getTime() === getWeekStart(new Date()).getTime();
  const todayIso = toLocalIso(new Date());
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 5; i++) { const d = new Date(weekStart); d.setDate(d.getDate() + i); const pred = predictDemand(d, null); days.push({ date: d, dateStr: `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-GB',{month:'short'})}-${d.getFullYear()}`, isoKey: toLocalIso(d), dayName: DAYS[i], dayShort: DAYS[i].slice(0,3), dayNum: d.getDate(), monthStr: d.toLocaleString('en-GB',{month:'short'}), isBH: pred?.isBankHoliday || false }); }
    return days;
  }, [weekStart]);

  const weekLabel = useMemo(() => { const s = weekDays[0], e = weekDays[4]; return `${s.dayNum} ${s.monthStr} — ${e.dayNum} ${e.monthStr} ${e.date.getFullYear()}`; }, [weekDays]);

  const weekData = useMemo(() => {
    if (!selected || !huddleData) return weekDays.map(() => null);
    return weekDays.map(day => {
      const cap = huddleData.dates?.includes(day.dateStr) ? getHuddleCapacity(huddleData, day.dateStr, hs) : null;
      if (!cap) return null;
      const am = cap.am?.byClinician?.find(c => matchesStaffMember(c.name, selected));
      const pm = cap.pm?.byClinician?.find(c => matchesStaffMember(c.name, selected));
      const amIn = am && (am.available > 0 || am.embargoed > 0 || am.booked > 0);
      const pmIn = pm && (pm.available > 0 || pm.embargoed > 0 || pm.booked > 0);
      const amDuty = hasDuty ? getDutyDoctor(huddleData, day.dateStr, 'am', dutySlots) : null;
      const pmDuty = hasDuty ? getDutyDoctor(huddleData, day.dateStr, 'pm', dutySlots) : null;
      return { amIn, pmIn, amLoc: am?.location, pmLoc: pm?.location, amDuty: amDuty && matchesStaffMember(amDuty.name, selected), pmDuty: pmDuty && matchesStaffMember(pmDuty.name, selected) };
    });
  }, [selected, huddleData, weekDays, hs, hasDuty, dutySlots]);

  const absences = useMemo(() => { const m = {}; if (!selected) return m; (data.plannedAbsences || []).forEach(a => { if (a.clinicianId === selected.id) weekDays.forEach(d => { if (d.isoKey >= a.startDate && d.isoKey <= a.endDate) m[d.isoKey] = a.reason || 'Leave'; }); }); return m; }, [selected, data.plannedAbsences, weekDays]);

  const buddyCover = useMemo(() => {
    if (!selected || !data?.allocationHistory) return weekDays.map(() => []);
    return weekDays.map(day => {
      const alloc = data.allocationHistory[day.isoKey]; if (!alloc) return [];
      const covers = [];
      Object.entries(alloc.allocations || {}).forEach(([aid, bid]) => { if (parseInt(bid) === selected.id) { const c = clinicians.find(cl => cl.id === parseInt(aid)); if (c) covers.push({ ...c, reason: 'Leave' }); } });
      Object.entries(alloc.dayOffAllocations || {}).forEach(([did, bid]) => { if (parseInt(bid) === selected.id) { const c = clinicians.find(cl => cl.id === parseInt(did)); if (c) covers.push({ ...c, reason: 'Day off' }); } });
      return covers;
    });
  }, [selected, data?.allocationHistory, weekDays, clinicians]);

  const directLink = selected && origin ? `${origin}#rota-${selected.initials}` : '';
  const filtered = search ? clinicians.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.initials.toLowerCase().includes(search.toLowerCase())) : clinicians;
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(c => { const g = c.group || 'allied'; if (!groups[g]) groups[g] = []; groups[g].push(c); });
    return groups;
  }, [filtered]);

  const Cell = ({ isIn, loc, duty }) => {
    if (!isIn) return <div className="rounded-lg flex items-center justify-center" style={{ background: '#1e293b', minHeight: 56 }}><span className="text-xs text-slate-700">Not in</span></div>;
    const lc = loc ? LOCATION_COLOURS[loc] : null;
    return (
      <div className="rounded-lg flex items-center justify-center gap-2 px-3" style={{ background: lc?.bg || '#475569', minHeight: 56 }}>
        {duty && <svg width={14} height={14} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>}
        <span className="text-sm font-medium text-white">{loc || 'In'}</span>
      </div>
    );
  };

  const content = (
    <div className="flex gap-0 min-h-[400px]" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', borderRadius: 16, overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif"}}>
      {/* LEFT — Clinician sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 flex flex-col">
        <div className="p-3 border-b border-white/5">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full text-xs rounded-lg px-3 py-2 outline-none" style={{background:'#0f172a',border:'1px solid #334155',color:'#e2e8f0'}} />
        </div>
        <div className="flex-1 overflow-y-auto" style={{maxHeight: 500}}>
          {['gp','nursing','allied'].map(g => {
            const members = grouped[g];
            if (!members?.length) return null;
            const meta = GROUP_META[g];
            return (
              <div key={g}>
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5" style={{color: meta.tx}}><span className="w-1.5 h-1.5 rounded-full" style={{background: meta.dot}}/>{meta.label}</div>
                {members.map(c => (
                  <button key={c.id} onClick={() => select(c)} className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors" style={{background: c.id === selectedId ? 'rgba(255,255,255,0.08)' : 'transparent'}}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{background: GROUP_META[c.group]?.bg || meta.bg, color: GROUP_META[c.group]?.tx || meta.tx}}>{c.initials}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{c.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT — Rota view */}
      <div className="flex-1 p-5">
        {/* Selected clinician header */}
        {selected && (
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold" style={{background: gm.bg, color: gm.tx, border: `2px solid ${gm.tx}30`}}>{selected.initials}</div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-100">{selected.name}</div>
              <div className="text-sm text-slate-400">{selected.role}{selected.sessions ? ` · ${selected.sessions} sessions` : ''}</div>
            </div>
          </div>
        )}

        {/* Week nav */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigateWeek(-1)} className="px-3 py-1.5 rounded-lg text-sm" style={{background:'#1e293b',border:'1px solid #334155',color:'#94a3b8',cursor:'pointer'}}>‹</button>
          <div className="flex-1 text-center">
            <span className="text-sm font-medium text-slate-200">{weekLabel}</span>
            {!isThisWeek && <button onClick={() => setWeekStart(getWeekStart(new Date()))} className="block mx-auto mt-0.5 text-[10px]" style={{color:'#818cf8',background:'none',border:'none',cursor:'pointer'}}>This week</button>}
          </div>
          <button onClick={() => navigateWeek(1)} className="px-3 py-1.5 rounded-lg text-sm" style={{background:'#1e293b',border:'1px solid #334155',color:'#94a3b8',cursor:'pointer'}}>›</button>
        </div>

        {/* Key */}
        <div className="flex gap-4 mb-4 flex-wrap">
          {Object.entries(LOCATION_COLOURS).map(([name, lc]) => <div key={name} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{background:lc.bg}}/><span className="text-xs text-slate-500">{name}</span></div>)}
          {hasDuty && <div className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg><span className="text-xs text-slate-500">Duty</span></div>}
        </div>

        {/* Week grid */}
        <div className="rounded-xl overflow-hidden" style={{border:'1px solid #334155'}}>
          <div className="grid" style={{gridTemplateColumns:'100px 1fr 1fr',background:'#1e293b',borderBottom:'1px solid #334155'}}>
            <div className="py-2.5 px-4"/>
            <div className="py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">AM</div>
            <div className="py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">PM</div>
          </div>
          {weekDays.map((day, di) => {
            const wd = weekData[di], covers = buddyCover[di];
            const absence = absences[day.isoKey];
            const isOff = (wd && !wd.amIn && !wd.pmIn) || (!wd && absence);
            const noData = !wd && !absence;
            const isToday = day.isoKey === todayIso;
            return (
              <div key={di} style={{borderBottom: di < 4 ? '1px solid #334155' : 'none', background:'#0f172a'}}>
                <div className="grid" style={{gridTemplateColumns:'100px 1fr 1fr'}}>
                  <div className="py-3 px-4 flex flex-col justify-center" style={{borderRight:'1px solid #1e293b', borderLeft: isToday ? '3px solid #10b981' : '3px solid transparent'}}>
                    <div className="text-base font-semibold" style={{color: (isOff || noData || day.isBH) ? '#334155' : '#e2e8f0'}}>{day.dayShort}</div>
                    <div className="text-xs text-slate-600">{day.dayNum} {day.monthStr}</div>
                  </div>
                  {day.isBH ? (
                    <div className="col-span-2 py-4 px-5 flex items-center"><span className="text-sm font-medium text-amber-400">Bank holiday</span></div>
                  ) : (isOff || noData) ? (
                    <div className="col-span-2 py-4 px-5 flex items-center gap-3">
                      <span className="text-sm text-slate-600">{absence || 'Not in'}</span>
                      {absence && <span className="text-[10px] px-2 py-0.5 rounded" style={{background:'rgba(251,191,36,0.1)',color:'#fbbf24',border:'1px solid rgba(251,191,36,0.2)'}}>TeamNet</span>}
                    </div>
                  ) : (<>
                    <div className="p-1.5"><Cell isIn={wd?.amIn} loc={wd?.amLoc} duty={wd?.amDuty} /></div>
                    <div className="p-1.5"><Cell isIn={wd?.pmIn} loc={wd?.pmLoc} duty={wd?.pmDuty} /></div>
                  </>)}
                </div>
                {covers.length > 0 && (
                  <div className="flex items-center gap-2 px-4 pb-2" style={{marginLeft:100}}>
                    <span className="text-[10px] text-slate-600 font-medium">Covering:</span>
                    {covers.map((c, i) => <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{background:'#1e293b',border:'1px solid #334155',color: c.reason==='Leave'?'#f87171':'#60a5fa'}} title={`${c.name} — ${c.reason}`}>{c.initials}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Direct link */}
        {selected && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg" style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.15)'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            <span className="text-xs flex-1 truncate" style={{color:'#a5b4fc'}}>{directLink}</span>
            <button onClick={() => { try { navigator.clipboard.writeText(directLink); } catch { const t = document.createElement('textarea'); t.value = directLink; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); } }} className="text-[11px] px-2.5 py-1 rounded-md" style={{background:'rgba(99,102,241,0.15)',color:'#a5b4fc',border:'1px solid rgba(99,102,241,0.2)',cursor:'pointer'}}>Copy</button>
          </div>
        )}
      </div>
    </div>
  );

  if (standalone) return content;
  return <div className="mx-auto" style={{maxWidth:960}}>{content}</div>;
}
