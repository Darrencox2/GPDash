'use client';
// Week detail view for capacity planning.
//
// Designed around the question a GP actually asks about next week: can we
// function, session by session - who is offering appointments, who is
// duty, and where is it thin. So:
//   - one column per weekday, today ringed
//   - per site: session rows coloured PURELY by capacity state (site
//     identity is the edge stripe), each showing who is in (initials
//     chips, duty starred, non-offering dimmed) and urgent/routine totals
//   - shortfalls named in a summary strip up top, so the eye lands on
//     trouble before anything else
//   - days beyond the EMIS export fall back to the session rota, clearly
//     marked as a projection rather than actuals
import { useState, useMemo } from 'react';
import { getCliniciansForDate, getDutyDoctor } from '@/lib/huddle';
import { toHuddleDateStr, toLocalIso, getScheduledSessions } from '@/lib/data';
import { getWeekDayDetail, classifyStaffRole, STATE_COLOURS, initialsFor } from '@/lib/site-staffing';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SESSION_LABELS = { am: 'AM', pm: 'PM', eve: 'EVE' };

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const wd = x.getDay();
  x.setDate(x.getDate() - ((wd + 6) % 7));
  return x;
}

export default function CapacityWeek({ data, hs, huddleData, sites, capacityStaffing, teamClin }) {
  const [offset, setOffset] = useState(0);
  const monday = useMemo(() => {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + offset * 7);
    return m;
  }, [offset]);
  const todayIso = toLocalIso(new Date());

  const days = useMemo(() => {
    const dutySlots = hs?.dutyDoctorSlot;
    return DAY_NAMES.map((dayName, i) => {
      const dt = new Date(monday);
      dt.setDate(dt.getDate() + i);
      const iso = toLocalIso(dt);
      const csvStr = toHuddleDateStr(dt);
      const hasData = huddleData ? getCliniciansForDate(huddleData, csvStr).length > 0 : false;
      let detail = [];
      if (hasData) {
        const dutyByName = {};
        if (dutySlots) {
          for (const sess of ['am', 'pm']) {
            const duty = getDutyDoctor(huddleData, csvStr, sess, dutySlots, teamClin);
            if (duty?.name) dutyByName[sess] = duty.name;
          }
        }
        detail = getWeekDayDetail(huddleData, csvStr, {
          sites, huddleSettings: hs, capacityStaffing, clinicians: teamClin, dutyByName,
        });
      }
      // Rota projection for days without export data: which GPs are
      // scheduled per session. No sites, no slot counts - the rota does
      // not know those, and pretending otherwise would be invented data.
      let projection = null;
      if (!hasData) {
        const bySession = { M: [], A: [], E: [] };
        for (const c of teamClin || []) {
          if (classifyStaffRole(c.role) !== 'gp') continue;
          const sess = getScheduledSessions(data, c.id, dayName) || [];
          for (const s of sess) {
            const key = String(s).toUpperCase().charAt(0);
            if (bySession[key]) bySession[key].push(initialsFor(c.name, teamClin));
          }
        }
        if (bySession.M.length || bySession.A.length || bySession.E.length) projection = bySession;
      }
      return { dayName, dt, iso, csvStr, hasData, detail, projection, isToday: iso === todayIso };
    });
  }, [monday, huddleData, sites, hs, capacityStaffing, teamClin, data, todayIso]);

  // Name the trouble before anything else: every short session this week.
  const shortfalls = [];
  for (const d of days) {
    for (const siteEntry of d.detail) {
      for (const [k, s] of Object.entries(siteEntry.sessions)) {
        if (s.state === 'short') {
          shortfalls.push(`${d.dayName.slice(0, 3)} ${SESSION_LABELS[k]} ${siteEntry.site.name.split(' ')[0]} \u2212${siteEntry.threshold - s.offering}`);
        }
      }
    }
  }

  const weekLabel = `${monday.getDate()} ${monday.toLocaleDateString('en-GB', { month: 'short' })}`;

  return (
    <div className="p-4">
      {/* Nav + attention strip */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 1)} className="px-2 py-1 rounded-md text-slate-400 hover:text-white" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)'}}>&#8249;</button>
          <button onClick={() => setOffset(0)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{background: offset === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color: offset === 0 ? '#a5b4fc' : '#94a3b8'}}>This week</button>
          <button onClick={() => setOffset(o => o + 1)} className="px-2 py-1 rounded-md text-slate-400 hover:text-white" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)'}}>&#8250;</button>
        </div>
        <span className="text-xs text-slate-500">w/c {weekLabel}</span>
        {shortfalls.length > 0 ? (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{background:'rgba(239,68,68,0.15)', border:'1px solid #ef444460', color:'#fca5a5'}}>
            {shortfalls.length} session{shortfalls.length === 1 ? '' : 's'} below minimum: {shortfalls.join(' \u00b7 ')}
          </span>
        ) : (
          <span className="text-[11px] text-slate-500">No sessions below minimum this week</span>
        )}
        <span className="ml-auto text-[10px] text-slate-600">&#9733; duty &nbsp;&#183;&nbsp; dimmed = no bookable slots &nbsp;&#183;&nbsp; U urgent / R routine slots</span>
      </div>

      <div className="grid grid-cols-5 gap-2" style={{minWidth: 900}}>
        {days.map((d) => (
          <div key={d.iso} className="rounded-xl p-2 flex flex-col gap-2"
            style={{background:'rgba(255,255,255,0.03)', border: d.isToday ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)'}}>
            <div className="text-center">
              <span className="text-xs font-semibold" style={{color: d.isToday ? '#a5b4fc' : '#cbd5e1'}}>{d.dayName.slice(0, 3)}</span>
              <span className="text-[10px] text-slate-500 ml-1.5">{d.dt.getDate()} {d.dt.toLocaleDateString('en-GB', { month: 'short' })}</span>
            </div>

            {d.detail.map((siteEntry) => (
              <div key={siteEntry.site.name} className="rounded-lg overflow-hidden" style={{borderLeft:`3px solid ${siteEntry.site.colour || '#64748b'}`, background:'rgba(0,0,0,0.15)'}}>
                <div className="px-2 pt-1.5 text-[10px] font-semibold text-slate-300 truncate" title={siteEntry.site.name}>
                  {siteEntry.site.name}
                  {siteEntry.threshold != null && <span className="text-slate-600 font-normal"> &#183; min {siteEntry.threshold}</span>}
                </div>
                <div className="p-1.5 flex flex-col gap-1">
                  {['am', 'pm', 'eve'].filter((k) => siteEntry.sessions[k]).map((k) => {
                    const s = siteEntry.sessions[k];
                    const C = STATE_COLOURS[s.state] || STATE_COLOURS.none;
                    return (
                      <div key={k} className="rounded-md px-1.5 py-1" style={{background: C.bg, border:`1px solid ${C.bd}`}}>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold w-6" style={{color: C.fg}}>{SESSION_LABELS[k]}</span>
                          <span className="text-[10px] font-bold font-mono-data" style={{color: C.fg}}>
                            {s.offering}
                            {s.state === 'short' && siteEntry.threshold != null && <span> ({'\u2212'}{siteEntry.threshold - s.offering})</span>}
                          </span>
                          <span className="ml-auto text-[9px] font-mono-data text-slate-400">U{s.urgent} R{s.routine}</span>
                        </div>
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {s.clins.map((c, i) => (
                            <span key={c.name + i}
                              title={`${c.name}${c.duty ? ' \u2014 DUTY' : ''}\nUrgent ${c.urgent} \u00b7 Routine ${c.routine} \u00b7 Other ${c.other}${c.offering ? '' : '\nNo bookable slots this session'}`}
                              className="px-1 py-0.5 rounded text-[9px] font-semibold cursor-default"
                              style={c.duty
                                ? {background:'rgba(245,158,11,0.25)', border:'1px solid #f59e0b80', color:'#fbbf24'}
                                : {background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color: c.offering ? '#cbd5e1' : '#64748b'}}>
                              {c.duty ? '\u2605 ' : ''}{c.initials}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {!d.hasData && d.projection && (
              <div className="rounded-lg p-1.5" style={{border:'1px dashed rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.02)'}}>
                <div className="text-[9px] font-semibold text-slate-500 uppercase mb-1">Rota projection</div>
                {[['M', 'AM'], ['A', 'PM'], ['E', 'EVE']].filter(([k]) => d.projection[k].length).map(([k, label]) => (
                  <div key={k} className="flex items-start gap-1 mt-0.5">
                    <span className="text-[9px] font-bold text-slate-500 w-6 pt-0.5">{label}</span>
                    <span className="flex flex-wrap gap-0.5">
                      {d.projection[k].map((ini, i) => (
                        <span key={ini + i} className="px-1 py-0.5 rounded text-[9px] font-semibold" style={{background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#94a3b8'}}>{ini}</span>
                      ))}
                    </span>
                  </div>
                ))}
                <div className="text-[8px] text-slate-600 mt-1">Scheduled GPs from the rota &#8212; no EMIS export for this date yet</div>
              </div>
            )}

            {!d.hasData && !d.projection && (
              <div className="rounded-lg py-4 text-center text-[10px] text-slate-600" style={{background:'rgba(255,255,255,0.02)'}}>No data</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
