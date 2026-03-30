'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getHuddleCapacity, getDutyDoctor, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, DAYS, getWeekStart, toLocalIso } from '@/lib/data';

const ROLE_BG = { gp: 'rgba(99,102,241,0.15)', nursing: 'rgba(16,185,129,0.15)', allied: 'rgba(168,85,247,0.15)' };
const ROLE_TX = { gp: '#a5b4fc', nursing: '#6ee7b7', allied: '#c4b5fd' };

export default function MyRota({ data, huddleData, standalone, setActiveSection }) {
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative').sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.clinicians]);

  const [selectedId, setSelectedId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [search, setSearch] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const ref = useRef(null);

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
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setShowDrop(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);

  const select = c => { setSelectedId(c.id); setSearch(''); setShowDrop(false); window.location.hash = `rota-${c.initials}`; };
  const selected = clinicians.find(c => c.id === selectedId);
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const rc = selected ? { bg: ROLE_BG[selected.group] || ROLE_BG.allied, tx: ROLE_TX[selected.group] || ROLE_TX.allied } : { bg: ROLE_BG.allied, tx: ROLE_TX.allied };
  const navigateWeek = d => { const dt = new Date(weekStart); dt.setDate(dt.getDate() + d * 7); setWeekStart(dt); };
  const isThisWeek = weekStart.getTime() === getWeekStart(new Date()).getTime();
  const todayIso = toLocalIso(new Date());

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 5; i++) { const d = new Date(weekStart); d.setDate(d.getDate() + i); days.push({ date: d, dateStr: `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-GB',{month:'short'})}-${d.getFullYear()}`, isoKey: toLocalIso(d), dayName: DAYS[i], dayShort: DAYS[i].slice(0,3), dayNum: d.getDate(), monthStr: d.toLocaleString('en-GB',{month:'short'}) }); }
    return days;
  }, [weekStart]);

  // Planned absences for selected clinician
  const absences = useMemo(() => {
    if (!selected || !data?.plannedAbsences) return {};
    const abs = {};
    (Array.isArray(data.plannedAbsences) ? data.plannedAbsences : []).forEach(a => {
      if (a.clinicianId === selected.id) { weekDays.forEach(d => { if (d.isoKey >= a.startDate && d.isoKey <= a.endDate) abs[d.isoKey] = a.reason || 'Leave'; }); }
    });
    return abs;
  }, [selected, data?.plannedAbsences, weekDays]);

  const weekData = useMemo(() => {
    if (!selected || !huddleData) return weekDays.map(() => null);
    return weekDays.map(day => {
      if (!huddleData.dates?.includes(day.dateStr)) return null;
      const cap = getHuddleCapacity(huddleData, day.dateStr, {});
      const find = sess => (sess?.byClinician || []).find(c => matchesStaffMember(c.name, selected));
      const am = find(cap.am), pm = find(cap.pm);
      const amIn = am && ((am.available||0) + (am.embargoed||0) + (am.booked||0)) > 0;
      const pmIn = pm && ((pm.available||0) + (pm.embargoed||0) + (pm.booked||0)) > 0;
      let amDuty = false, pmDuty = false;
      if (hasDuty) { const ad = getDutyDoctor(huddleData, day.dateStr, 'am', dutySlots); const pd = getDutyDoctor(huddleData, day.dateStr, 'pm', dutySlots); if (ad && matchesStaffMember(ad.name, selected)) amDuty = true; if (pd && matchesStaffMember(pd.name, selected)) pmDuty = true; }
      return { amIn, pmIn, amLoc: am?.location, pmLoc: pm?.location, amDuty, pmDuty };
    });
  }, [selected, huddleData, weekDays, hs, dutySlots, hasDuty]);

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

  const weekLabel = `${weekDays[0].dayNum} ${weekDays[0].monthStr} – ${weekDays[4].dayNum} ${weekDays[4].monthStr} ${weekDays[4].date.getFullYear()}`;
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const directLink = selected && origin ? `${origin}#rota-${selected.initials}` : '';
  const filtered = search ? clinicians.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.initials.toLowerCase().includes(search.toLowerCase())) : clinicians;

  const Cell = ({ isIn, loc, duty, mobile }) => {
    if (!isIn) return <div style={{ background: '#1e293b', borderRadius: 8, minHeight: mobile ? 40 : 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 11, color: '#334155' }}>Not in</span></div>;
    const lc = loc ? LOCATION_COLOURS[loc] : null;
    const bg = lc?.bg || '#475569';
    return (
      <div style={{ background: bg, borderRadius: 8, minHeight: mobile ? 40 : 54, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 8px' }}>
        {duty && <svg width={mobile ? 12 : 14} height={mobile ? 12 : 14} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>}
        <span style={{ fontSize: mobile ? 12 : 13, fontWeight: 500, color: 'white' }}>{loc || 'In'}</span>
      </div>
    );
  };

  const inner = (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {selected && <div style={{ width: 48, height: 48, borderRadius: '50%', background: rc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500, color: rc.tx, border: `2px solid ${rc.tx}30`, flexShrink: 0 }}>{selected.initials}</div>}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#f1f5f9' }}>{selected?.name || 'Select clinician'}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{selected?.role}{selected?.sessions ? ` · ${selected.sessions} sessions` : ''}</div>
        </div>
        <div style={{ position: 'relative' }} ref={ref}>
          <div onClick={() => setShowDrop(!showDrop)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #334155', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Change</span>
          </div>
          {showDrop && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 280, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, zIndex: 50, maxHeight: 260, overflow: 'auto' }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #334155' }}>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." autoFocus style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#e2e8f0', outline: 'none' }} />
              </div>
              {filtered.map(c => (
                <button key={c.id} onClick={() => select(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: c.id === selectedId ? '#334155' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: ROLE_BG[c.group] || ROLE_BG.allied, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: ROLE_TX[c.group] || ROLE_TX.allied, flexShrink: 0 }}>{c.initials}</span>
                  <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: '#475569' }}>{c.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <button onClick={() => navigateWeek(-1)} style={{ padding: '4px 10px', fontSize: 14, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', cursor: 'pointer' }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{weekLabel}</span>
          {!isThisWeek && <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{ display: 'block', margin: '2px auto 0', fontSize: 10, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>This week</button>}
        </div>
        <button onClick={() => navigateWeek(1)} style={{ padding: '4px 10px', fontSize: 14, background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', cursor: 'pointer' }}>›</button>
      </div>

      {/* Key */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.entries(LOCATION_COLOURS).map(([name, lc]) => <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: lc.bg }} /><span style={{ fontSize: 11, color: '#64748b' }}>{name}</span></div>)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg><span style={{ fontSize: 11, color: '#64748b' }}>Duty doctor</span></div>
      </div>

      {/* Desktop grid */}
      <div>
        <div style={{ border: '1px solid #334155', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr 1fr', background: '#1e293b', borderBottom: '1px solid #334155' }}>
            <div style={{ padding: '8px 12px' }} />
            <div style={{ padding: 8, textAlign: 'center', fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AM</div>
            <div style={{ padding: 8, textAlign: 'center', fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PM</div>
          </div>
          {weekDays.map((day, di) => {
            const wd = weekData[di], covers = buddyCover[di];
            const absence = absences[day.isoKey];
            const isOff = (wd && !wd.amIn && !wd.pmIn) || (!wd && absence);
            const noData = !wd && !absence;
            const isToday = day.isoKey === todayIso;
            return (
              <div key={di} style={{ borderBottom: di < 4 ? '1px solid #334155' : 'none', background: '#0f172a' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr 1fr' }}>
                  <div style={{ padding: '8px 10px', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: isToday ? '3px solid #10b981' : '3px solid transparent' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: (isOff || noData) ? '#334155' : '#e2e8f0' }}>{day.dayShort}</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>{day.dayNum} {day.monthStr}</div>
                  </div>
                  {(isOff || noData) ? (
                    <div style={{ gridColumn: '2 / 4', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#475569' }}>{absence || ('Not in')}</span>
                      {absence && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>TeamNet</span>}
                    </div>
                  ) : (<>
                    <div style={{ padding: 4 }}><Cell isIn={wd?.amIn} loc={wd?.amLoc} duty={wd?.amDuty} /></div>
                    <div style={{ padding: 4 }}><Cell isIn={wd?.pmIn} loc={wd?.pmLoc} duty={wd?.pmDuty} /></div>
                  </>)}
                </div>
                {covers.length > 0 && (
                  <div style={{ padding: '2px 10px 8px', marginLeft: 76, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 500 }}>Covering:</span>
                    {covers.map((c, i) => <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: c.reason === 'Leave' ? '#f87171' : '#60a5fa', cursor: 'default' }} title={`${c.name} — ${c.reason}`}>{c.initials}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Direct link */}
      {selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <span style={{ fontSize: 12, color: '#a5b4fc', flex: 1 }}>{directLink}</span>
          <button onClick={() => { try { navigator.clipboard.writeText(directLink); } catch { const t = document.createElement('textarea'); t.value = directLink; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); } }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>Copy</button>
        </div>
      )}
    </>
  );

  // Standalone mode: dark bg already provided by parent
  if (standalone) return <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>{inner}</div>;

  // Embedded mode: wrap in dark gradient card
  return (
    <div className="max-w-2xl mx-auto">
      <div style={{ borderRadius: 16, padding: '1.5rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {inner}
      </div>
    </div>
  );
}
