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
import { toHuddleDateStr, toLocalIso, getScheduledSessions, matchesStaffMember, titleCaseName } from '@/lib/data';
import { getWeekDayDetail, classifyStaffRole } from '@/lib/site-staffing';
import { predictDemand } from '@/lib/demandPredictor';
import { ClosedDayInline } from '@/components/ui/ClosedDay';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Full names read far faster than initials when there is room for them.
// Prefer the register's own spelling; otherwise tidy the EMIS form
// ("COX, Darren (Dr)" -> "Darren Cox").
function displayName(csvName, clinicians) {
  const match = (clinicians || []).find((x) => matchesStaffMember(csvName, x));
  if (match?.name) return match.name;
  return titleCaseName(String(csvName || '').replace(/\s*\([^)]*\)\s*$/, '').trim()) || csvName;
}
const SESSION_LABELS = { am: 'AM', pm: 'PM', eve: 'EVE' };

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const wd = x.getDay();
  x.setDate(x.getDate() - ((wd + 6) % 7));
  return x;
}

export default function CapacityWeek({ data, hs, huddleData, sites, capacityStaffing, teamClin, initialOffset = 0 }) {
  // initialOffset lets the 6-week grid deep-link a specific week (the parent
  // remounts with key={offset}, so useState's one-shot init is safe here).
  const [offset, setOffset] = useState(initialOffset);
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
          includeEmpty: true,
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
            if (bySession[key]) bySession[key].push(c.name);
          }
        }
        if (bySession.M.length || bySession.A.length || bySession.E.length) projection = bySession;
      }
      // A closed day has nobody in it by definition. Saying "nobody here"
      // once per site invites the reader to hunt for a problem that is
      // not there.
      const pred = predictDemand(dt, null, undefined);
      const declared = data?.closedDays?.[iso] || null;
      const closed = !!pred?.isBankHoliday || !!declared;
      const closedReason = declared || (pred?.isBankHoliday ? 'Bank holiday' : null);
      return { dayName, dt, iso, csvStr, hasData, detail, projection, closed, closedReason, isToday: iso === todayIso };
    });
  }, [monday, huddleData, sites, hs, capacityStaffing, teamClin, data, todayIso]);

  // Name the trouble before anything else: every short session this week.
  const shortfalls = [];
  for (const d of days) {
    for (const siteEntry of d.detail) {
      for (const [k, s] of Object.entries(siteEntry.sessions || {})) {
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
        <span className="text-xs text-slate-400">w/c {weekLabel}</span>
        {shortfalls.length > 0 ? (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{background:'rgba(239,68,68,0.15)', border:'1px solid #ef444460', color:'#fca5a5'}}>
            {shortfalls.length} session{shortfalls.length === 1 ? '' : 's'} below minimum: {shortfalls.join(' \u00b7 ')}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">No sessions below minimum this week</span>
        )}
        <span className="ml-auto text-[11px] text-slate-400">&#9733; duty &nbsp;&#183;&nbsp; dimmed = no bookable slots &nbsp;&#183;&nbsp; U urgent / R routine slots</span>
      </div>

      {/* One row of days. Every configured site appears in every day, in
          the practice's own order, even when nobody is there - otherwise
          the sites shuffle between columns and the week cannot be read
          across. Colour is spent only on trouble: a session that meets
          its minimum is left plain, so the red and amber mean something. */}
      <div className="overflow-x-auto">
      <div className="grid grid-cols-5 gap-2" style={{minWidth: 760}}>
        {days.map((d) => (
          <div key={d.iso} className="rounded-xl p-2 flex flex-col gap-2"
            style={{background:'rgba(255,255,255,0.03)', border: d.isToday ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)'}}>
            <div className="text-center pb-1" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <span className="text-xs font-semibold" style={{color: d.isToday ? '#a5b4fc' : '#cbd5e1'}}>{d.dayName}</span>
              <span className="text-[11px] text-slate-400 ml-1.5">{d.dt.getDate()} {d.dt.toLocaleDateString('en-GB', { month: 'short' })}</span>
            </div>

            {d.closed && (
              <div className="py-3 flex justify-center"><ClosedDayInline label={d.closedReason || 'Closed'} /></div>
            )}

            {!d.closed && d.detail.map((siteEntry) => (
              <div key={siteEntry.site.name}>
                {/* Site identity lives here once - a dot and a name - not
                    as a stripe repeated on every session tile below. */}
                <div className="flex items-baseline gap-1.5 px-0.5 pb-1">
                  <span style={{width:7, height:7, borderRadius:999, background: siteEntry.site.colour || '#64748b', display:'inline-block'}} />
                  <span className="text-[11px] font-semibold text-slate-300 truncate" title={siteEntry.site.name}>{siteEntry.site.name}</span>
                  {siteEntry.threshold != null && <span className="text-[11px] text-slate-500 ml-auto">min {siteEntry.threshold}</span>}
                </div>

                {siteEntry.empty ? (
                  <div className="rounded-md px-2 py-1 text-[11px]"
                    style={{background:'rgba(255,255,255,0.02)', border:'1px dashed rgba(255,255,255,0.10)', color:'var(--meta)'}}>
                    Nobody here
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {['am', 'pm', 'eve'].filter((k) => siteEntry.sessions[k]).map((k) => {
                      const s = siteEntry.sessions[k];
                      const short = s.state === 'short';
                      const tight = s.state === 'tight';
                      const deficit = short && siteEntry.threshold != null ? siteEntry.threshold - s.offering : 0;
                      return (
                        <div key={k} className="rounded-md px-1.5 py-1"
                          style={{
                            background: short ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderLeft: short ? '3px solid #ef4444' : tight ? '3px solid #f59e0b' : '3px solid rgba(255,255,255,0.10)',
                          }}>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] font-bold" style={{color: short ? '#fca5a5' : tight ? '#fbbf24' : '#94a3b8'}}>{SESSION_LABELS[k]}</span>
                            <span className="text-[11px] font-bold font-mono-data" style={{color: short ? '#fca5a5' : '#cbd5e1'}}>
                              {s.offering}{deficit > 0 && <span> ({'\u2212'}{deficit})</span>}
                            </span>
                            <span className="ml-auto text-[11px] font-mono-data text-slate-500">{s.urgent}u {s.routine}r</span>
                          </div>
                          <div className="mt-0.5">
                            {s.clins.map((c, i) => (
                              <div key={c.name + i}
                                title={`${c.name}${c.duty ? ' — DUTY' : ''}\nUrgent ${c.urgent} · Routine ${c.routine} · Other ${c.other}${c.offering ? '' : '\nNo bookable slots this session'}`}
                                className="text-[11px] leading-tight truncate"
                                style={{color: c.duty ? '#fbbf24' : c.offering ? '#cbd5e1' : 'var(--meta)'}}>
                                {c.duty ? '\u2605 ' : ''}{displayName(c.name, teamClin)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {!d.closed && !d.hasData && d.projection && (
              <div className="rounded-lg p-1.5" style={{border:'1px dashed rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.02)'}}>
                <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Rota projection</div>
                {[['M', 'AM'], ['A', 'PM'], ['E', 'EVE']].filter(([k]) => d.projection[k].length).map(([k, label]) => (
                  <div key={k} className="flex items-start gap-1 mt-0.5">
                    <span className="text-[11px] font-bold text-slate-400 w-7 pt-0.5">{label}</span>
                    <span className="flex-1">
                      {d.projection[k].map((nm, i) => (
                        <div key={nm + i} className="text-[11px] leading-tight text-slate-400 truncate">{nm}</div>
                      ))}
                    </span>
                  </div>
                ))}
                <div className="text-[11px] text-slate-500 mt-1">Scheduled GPs from the rota &#8212; no EMIS export for this date yet</div>
              </div>
            )}

            {!d.closed && !d.hasData && !d.projection && (
              <div className="rounded-lg py-4 text-center text-[11px] text-slate-400" style={{background:'rgba(255,255,255,0.02)'}}>No data</div>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
