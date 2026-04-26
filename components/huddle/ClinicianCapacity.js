'use client';
import { useState, useMemo } from 'react';
import { getHuddleCapacity, getSiteColour, getCliniciansForDate } from '@/lib/huddle';
import { matchesStaffMember, toHuddleDateStr } from '@/lib/data';

export default function ClinicianCapacity({ data, huddleData, routineOverrides }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const hs = data?.huddleSettings || {};
  const sites = data?.roomAllocation?.sites || [];
  const siteCol = (name) => getSiteColour(name, sites);

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const clinicians = useMemo(() => ensureArray(data?.clinicians).filter(c => c.status !== 'left' && c.status !== 'administrative'), [data?.clinicians]);
  const selected = clinicians.find(c => c.id === selectedId);

  // Build 28 days of per-clinician routine data
  const clinicianData = useMemo(() => {
    if (!huddleData) return {};
    const result = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 28; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const dateStr = toHuddleDateStr(d);
      const cap = getHuddleCapacity(huddleData, dateStr, hs, routineOverrides);
      if (!cap) continue;

      const dayName = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const isoKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const weekNum = Math.floor(i / 7);
      const locMap = {};
      try {
        const locs = huddleData?.locationData?.[dateStr];
        if (locs) Object.entries(locs).forEach(([idx, locData]) => {
          const name = huddleData.clinicians[parseInt(idx)];
          if (name) {
            let maxLoc = null, maxCount = 0;
            Object.entries(locData).forEach(([loc, count]) => { if (count > maxCount) { maxLoc = loc; maxCount = count; } });
            if (maxLoc) locMap[name] = maxLoc;
          }
        });
      } catch (e) {}

      ['am', 'pm'].forEach(session => {
        (cap[session]?.byClinician || []).forEach(c => {
          const matched = clinicians.find(tc => matchesStaffMember(c.name, tc));
          if (!matched) return;
          if (!result[matched.id]) result[matched.id] = { days: [], weeks: [0, 0, 0, 0], weeksEmb: [0, 0, 0, 0], total: 0, totalEmb: 0, totalBooked: 0, nextSlots: [] };
          const entry = result[matched.id];

          if (c.available > 0 || c.embargoed > 0) {
            const loc = locMap[c.name] || null;
            // Find slot types for this clinician on this date/session
            let slotTypes = [];
            try {
              const stores = [huddleData.dateData, huddleData.embargoedData];
              stores.forEach(store => {
                const sd = store?.[dateStr]?.[session];
                if (!sd) return;
                Object.entries(sd).forEach(([idx, slots]) => {
                  if (huddleData.clinicians[parseInt(idx)] !== c.name) return;
                  Object.entries(slots).forEach(([st, count]) => {
                    if (count > 0 && routineOverrides && routineOverrides[st]) slotTypes.push(st);
                    else if (count > 0 && !routineOverrides) slotTypes.push(st);
                  });
                });
              });
            } catch (e) {}
            const topSlotType = slotTypes[0] || 'Routine';

            if (entry.nextSlots.length < 6) {
              if (c.available > 0) entry.nextSlots.push({ date: d, dayName, session, loc, slotType: topSlotType, type: 'available', count: c.available });
              if (c.embargoed > 0) entry.nextSlots.push({ date: d, dayName, session, loc, slotType: topSlotType, type: 'embargoed', count: c.embargoed });
            }
          }

          entry.total += c.available || 0;
          entry.totalEmb += c.embargoed || 0;
          entry.totalBooked += c.booked || 0;
          if (weekNum < 4) {
            entry.weeks[weekNum] += c.available || 0;
            entry.weeksEmb[weekNum] += c.embargoed || 0;
          }
        });
      });
    }
    return result;
  }, [huddleData, hs, routineOverrides, clinicians]);

  // Compute practice averages and rankings
  const comparison = useMemo(() => {
    const entries = clinicians
      .map(c => {
        const d = clinicianData[c.id];
        return d ? { id: c.id, initials: c.initials, name: c.name, total: d.total, totalEmb: d.totalEmb, totalBooked: d.totalBooked } : null;
      })
      .filter(c => c && (c.total > 0 || c.totalEmb > 0 || c.totalBooked > 0))
      .sort((a, b) => b.total - a.total);
    const avg = entries.length > 0 ? Math.round(entries.reduce((s, c) => s + c.total, 0) / entries.length) : 0;
    const max = entries.length > 0 ? Math.max(...entries.map(c => c.total)) : 1;
    return { entries, avg, max };
  }, [clinicians, clinicianData]);

  const filtered = search.length > 0 ? clinicians.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.initials?.toLowerCase().includes(search.toLowerCase())) : [];
  const showList = search.length > 0 && !selected;

  const selectClinician = (c) => { setSelectedId(c.id); setSearch(c.name); };
  const clearSelection = () => { setSelectedId(null); setSearch(''); };

  const cd = selected ? clinicianData[selected.id] : null;
  const totalSlots = cd ? cd.total + cd.totalEmb + cd.totalBooked : 0;
  const bookingRate = totalSlots > 0 ? Math.round((cd.totalBooked / totalSlots) * 100) : 0;
  const rank = selected ? comparison.entries.findIndex(e => e.id === selected.id) + 1 : 0;
  const nextAvail = cd ? cd.nextSlots.filter(s => s.type === 'available').slice(0, 3) : [];
  const nextEmb = cd ? cd.nextSlots.filter(s => s.type === 'embargoed').slice(0, 3) : [];
  const nextAll = cd ? [...nextAvail, ...nextEmb].sort((a, b) => a.date - b.date).slice(0, 3) : [];

  // Weekly chart scale
  const weekMax = cd ? Math.max(...cd.weeks.map((w, i) => w + cd.weeksEmb[i]), 1) : 1;

  // Insight text
  const insight = useMemo(() => {
    if (!cd || !selected) return null;
    const parts = [];
    const diff = comparison.avg > 0 ? Math.round(((cd.total - comparison.avg) / comparison.avg) * 100) : 0;
    if (diff > 5) parts.push({ text: `+${diff}% above average`, colour: '#34d399' });
    else if (diff < -5) parts.push({ text: `${diff}% below average`, colour: '#f87171' });
    else parts.push({ text: 'Near average', colour: '#94a3b8' });

    parts.push({ text: `Booking rate ${bookingRate}%`, colour: bookingRate > 85 ? '#f87171' : bookingRate > 70 ? '#fbbf24' : '#34d399' });

    const minWeek = cd.weeks.indexOf(Math.min(...cd.weeks));
    if (cd.weeks[minWeek] < cd.total / 6) parts.push({ text: `Week ${minWeek + 1} has fewest slots`, colour: '#fbbf24' });

    if (nextAll.length > 0) {
      const first = nextAll[0];
      const isToday = first.date.toDateString() === new Date().toDateString();
      const isTomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return first.date.toDateString() === t.toDateString(); })();
      const when = isToday ? 'today' : isTomorrow ? 'tomorrow' : first.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      parts.push({ text: `Next slot: ${when}`, colour: first.type === 'available' ? '#34d399' : '#fbbf24' });
    }
    return parts;
  }, [cd, selected, comparison, bookingRate, nextAll]);

  if (!huddleData) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between" style={{ background: 'rgba(15,23,42,0.85)', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <div className="font-heading text-base font-medium text-slate-200">Clinician capacity</div>
          <div className="text-xs text-slate-600">Routine slots · 28-day forward view</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative px-4 pt-3 pb-2">
        <input
          type="text" value={search}
          onChange={e => { setSearch(e.target.value); if (selectedId) setSelectedId(null); }}
          placeholder="Search clinician..."
          className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
        />
        {selected && <button onClick={clearSelection} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>}

        {showList && filtered.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 rounded-lg overflow-hidden z-30 max-h-48 overflow-y-auto" style={{ background: '#1e293b', border: '1px solid #334155', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
            {filtered.map(c => {
              const d = clinicianData[c.id];
              return (
                <button key={c.id} onClick={() => selectClinician(c)} className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/5 transition-colors">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ fontFamily: "'Outfit',sans-serif", background: c.group === 'gp' ? '#3b82f6' : c.group === 'nursing' ? '#10b981' : '#a855f7' }}>{c.initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-500">{c.role}</div>
                  </div>
                  {d && <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-emerald-400" style={{ fontFamily: "'Space Mono',monospace" }}>{d.total}</div>
                    <div className="text-[10px] text-slate-600">available</div>
                  </div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && cd && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Clinician header */}
          <div className="flex items-center gap-3 pt-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ fontFamily: "'Outfit',sans-serif", background: selected.group === 'gp' ? '#3b82f6' : selected.group === 'nursing' ? '#10b981' : '#a855f7' }}>{selected.initials}</div>
            <div>
              <div className="text-sm font-medium text-slate-200">{selected.title ? `${selected.title} ${selected.name}` : selected.name}</div>
              <div className="text-xs text-slate-500">{selected.role}{selected.sessions ? ` · ${selected.sessions} sessions/week` : ''}</div>
            </div>
          </div>

          {/* 28-day summary */}
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">28-day summary</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="glass-inner rounded-xl p-3">
              <div className="text-[11px] text-slate-500 mb-1">Available</div>
              <div className="font-mono-data text-2xl font-bold text-emerald-400 leading-none">{cd.total}</div>
              <div className="text-[10px] text-slate-600 mt-1">routine slots</div>
            </div>
            <div className="glass-inner rounded-xl p-3">
              <div className="text-[11px] text-slate-500 mb-1">Embargoed</div>
              <div className="font-mono-data text-2xl font-bold text-amber-400 leading-none">{cd.totalEmb}</div>
              <div className="text-[10px] text-slate-600 mt-1">routine slots</div>
            </div>
            <div className="glass-inner rounded-xl p-3">
              <div className="text-[11px] text-slate-500 mb-1">Booking rate</div>
              <div className="font-mono-data text-2xl font-bold leading-none" style={{ color: bookingRate > 85 ? '#f87171' : bookingRate > 70 ? '#fbbf24' : '#60a5fa' }}>{bookingRate}%</div>
              <div className="text-[10px] text-slate-600 mt-1">{cd.totalBooked} of {totalSlots} filled</div>
            </div>
          </div>

          {/* Next 3 available */}
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Next available routine slots</div>
          <div className="space-y-1.5">
            {nextAll.length === 0 && <div className="text-sm text-slate-600 text-center py-4">No available slots in the next 28 days</div>}
            {nextAll.map((slot, i) => (
              <div key={i} className="glass-inner rounded-lg flex items-center gap-3 px-3 py-2.5">
                <div className="font-mono-data text-sm font-bold flex-shrink-0 w-5 text-center" style={{ color: slot.type === 'available' ? '#34d399' : '#fbbf24' }}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200">{slot.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                  <div className="text-xs text-slate-500">{slot.slotType} · {slot.session.toUpperCase()}{slot.loc ? ` · ${slot.loc}` : ''}</div>
                </div>
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{
                  background: slot.type === 'available' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: slot.type === 'available' ? '#34d399' : '#fbbf24'
                }}>{slot.type === 'available' ? 'Available' : 'Embargoed'}</span>
              </div>
            ))}
          </div>

          {/* Weekly availability */}
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Weekly availability</div>
          <div className="glass-inner rounded-xl p-3">
            <div className="flex gap-2 items-end" style={{ height: 56 }}>
              {cd.weeks.map((avail, i) => {
                const emb = cd.weeksEmb[i];
                const total = avail + emb;
                const h = weekMax > 0 ? (total / weekMax) * 100 : 0;
                const availH = total > 0 ? (avail / total) * h : 0;
                const embH = total > 0 ? (emb / total) * h : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center" style={{ height: '100%' }}>
                    <div className="flex-1" />
                    {embH > 0 && <div style={{ height: `${embH}%`, background: '#f59e0b', opacity: 0.6, width: '100%', borderRadius: '3px 3px 0 0' }} />}
                    {availH > 0 && <div style={{ height: `${availH}%`, background: '#10b981', width: '100%', borderRadius: embH > 0 ? 0 : '3px 3px 0 0' }} />}
                    <div className="text-[10px] text-slate-600 mt-1">Wk {i + 1}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 justify-center mt-2">
              <span className="flex items-center gap-1 text-[10px] text-slate-600"><span className="w-2 h-2 rounded-sm" style={{ background: '#10b981' }} />Available</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-600"><span className="w-2 h-2 rounded-sm" style={{ background: '#f59e0b', opacity: 0.6 }} />Embargoed</span>
            </div>
          </div>

          {/* Practice comparison */}
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Compared to practice</div>
          <div className="glass-inner rounded-xl p-3">
            {rank > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-slate-300">Ranked</span>
                <span className="font-mono-data text-lg font-bold text-emerald-400">{rank}{rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}</span>
                <span className="text-xs text-slate-500">of {comparison.entries.length} clinicians by routine availability</span>
              </div>
            )}
            <div className="space-y-0.5">
              {comparison.entries.map(e => {
                const isSel = e.id === selected.id;
                const aboveAvg = e.total >= comparison.avg;
                const barW = comparison.max > 0 ? (e.total / comparison.max) * 100 : 0;
                const avgW = comparison.max > 0 ? (comparison.avg / comparison.max) * 100 : 0;
                return (
                  <div key={e.id} className="flex items-center gap-2 py-1 px-2 rounded-md" style={{ background: isSel ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                    <span className="text-xs font-bold w-7 text-right flex-shrink-0" style={{ fontFamily: "'Outfit',sans-serif", color: isSel ? '#34d399' : '#64748b' }}>{e.initials}</span>
                    <div className="flex-1 h-4 rounded overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="h-full rounded" style={{ width: `${barW}%`, background: aboveAvg ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)' }} />
                      <div className="absolute top-0 bottom-0 w-px" style={{ left: `${avgW}%`, background: '#e2e8f0' }} />
                    </div>
                    <span className="text-xs font-bold w-7 text-right flex-shrink-0 font-mono-data" style={{ color: aboveAvg ? '#34d399' : '#fbbf24' }}>{e.total}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-600">
              <span className="flex items-center gap-1"><span className="w-2 h-px" style={{ background: '#e2e8f0' }} />Avg ({comparison.avg})</span>
              <span style={{ color: '#34d399' }}>Above avg</span>
              <span style={{ color: '#fbbf24' }}>Below avg</span>
            </div>
          </div>

          {/* Insight */}
          {insight && (
            <div className="rounded-lg px-3 py-2.5 flex flex-wrap gap-2" style={{ background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid #10b981' }}>
              {insight.map((p, i) => (
                <span key={i} className="text-xs" style={{ color: p.colour, fontWeight: 500 }}>{p.text}{i < insight.length - 1 ? ' · ' : ''}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selected && !showList && (
        <div className="py-8 px-4 text-center">
          <div className="text-sm text-slate-500">Search for a clinician to view their routine capacity</div>
        </div>
      )}
    </div>
  );
}
