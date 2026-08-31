'use client';
// Week detail view for capacity planning.
//
// Laid out as SITE ROWS x DAY COLUMNS, not five independent day columns.
// Sites used to sit at whatever height the sites above them happened to
// need, so Banwell started lower on a busy day than a quiet one and the
// week could not be read along a row. Here every site owns a row, and a
// grid row is a single height, so "is Banwell fine all week?" is one
// horizontal glance.
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
import { useState, useMemo, Fragment } from 'react';
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

  // The minimum is a property of the site, but it is carried on each day's
  // entry - so read it off whichever day actually reported one.
  const thresholdFor = (site) => {
    for (const d of days) {
      const e = d.detail.find((x) => x.site.name === site.name);
      if (e && e.threshold != null) return e.threshold;
    }
    return null;
  };

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
        <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <span style={{ width: 16, height: 4, borderRadius: 999, background: '#10b981', display: 'inline-block' }} />meets the minimum
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 9, height: 4, borderRadius: 999, background: '#ef4444', display: 'inline-block' }} />short
          </span>
          &#183; &#9733; duty &#183; dimmed = no bookable slots &#183; u urgent / r routine
        </span>
      </div>

      {/* One row of days. Every configured site appears in every day, in
          the practice's own order, even when nobody is there - otherwise
          the sites shuffle between columns and the week cannot be read
          across. Colour is spent only on trouble: a session that meets
          its minimum is left plain, so the red and amber mean something. */}
      {/* One row per site, one column per day. Colour is spent only on
          trouble: the bar under each session shows staffing against that
          site's minimum, filled green when comfortable, amber when exactly
          on it, and short in red when it is not met. */}
      <div className="overflow-x-auto">
      <div style={{ display: 'grid', gridTemplateColumns: `132px repeat(5, minmax(0, 1fr))`, gap: 6, minWidth: 880 }}>

        {/* header row */}
        <div />
        {days.map((d) => (
          <div key={`h-${d.iso}`} className="text-center pb-1.5"
            style={{ borderBottom: d.isToday ? '2px solid rgba(99,102,241,0.7)' : '1px solid rgba(255,255,255,0.10)' }}>
            <div className="text-xs font-semibold" style={{ color: d.isToday ? '#a5b4fc' : '#cbd5e1' }}>{d.dayName}</div>
            <div className="text-[11px]" style={{ color: 'var(--meta)' }}>
              {d.dt.getDate()} {d.dt.toLocaleDateString('en-GB', { month: 'short' })}
            </div>
            {d.closed && (
              <div className="text-[11px] mt-0.5" style={{ color: '#fbbf24' }}>{d.closedReason || 'Closed'}</div>
            )}
          </div>
        ))}

        {/* one row per configured site */}
        {sites.map((site) => (
          <Fragment key={site.name}>
            <div className="flex items-start gap-1.5 pt-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 999, background: site.colour || '#64748b', marginTop: 4, flex: 'none' }} />
              <div style={{ minWidth: 0 }}>
                <div className="text-[11px] font-semibold text-slate-300 leading-tight">{site.name}</div>
                {thresholdFor(site) != null && (
                  <div className="text-[11px]" style={{ color: 'var(--meta)' }}>min {thresholdFor(site)}</div>
                )}
              </div>
            </div>

            {days.map((d) => {
              const entry = d.detail.find((e) => e.site.name === site.name);
              const keys = entry ? ['am', 'pm', 'eve'].filter((k) => entry.sessions[k]) : [];
              return (
                <div key={`${site.name}-${d.iso}`} className="rounded-lg p-1"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {d.closed ? (
                    <div className="text-[11px] text-center py-2" style={{ color: 'var(--meta)' }}>&mdash;</div>
                  ) : keys.length === 0 ? (
                    <div className="text-[11px] text-center py-2" style={{ color: 'var(--meta)' }}>Nobody here</div>
                  ) : keys.map((k) => {
                    const ses = entry.sessions[k];
                    const min = entry.threshold;
                    const short = ses.state === 'short';
                    const deficit = short && min != null ? min - ses.offering : 0;
                    // Two states, not three. Amber for "exactly on the
                    // minimum" sounded right until it ran against real
                    // thresholds of 1 and 2, where being exactly on the
                    // minimum is the ordinary state - so amber fired on
                    // almost every session and the three genuine
                    // shortfalls stopped standing out. Met or short.
                    const fill = short ? '#ef4444' : '#10b981';
                    const pct = min ? Math.max(6, Math.min(100, (ses.offering / Math.max(min, ses.offering)) * 100)) : 100;
                    return (
                      <div key={k} className="rounded-md px-1.5 py-1 mb-1 last:mb-0"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-bold" style={{ color: 'var(--meta)' }}>{SESSION_LABELS[k]}</span>
                          <span className="text-[11px] font-bold font-mono-data" style={{ color: short ? '#fca5a5' : '#cbd5e1' }}>
                            {ses.offering}{deficit > 0 && <span> ({'\u2212'}{deficit})</span>}
                          </span>
                          <span className="ml-auto text-[11px] font-mono-data" style={{ color: 'var(--meta)' }}>{ses.urgent}u {ses.routine}r</span>
                        </div>
                        <div className="mt-0.5">
                          {ses.clins.map((c, i) => (
                            <div key={c.name + i}
                              title={`${c.name}${c.duty ? ' — DUTY' : ''}\nUrgent ${c.urgent} · Routine ${c.routine} · Other ${c.other}${c.offering ? '' : '\nNo bookable slots this session'}`}
                              className="text-[11px] leading-tight truncate"
                              style={{ color: c.duty ? '#fbbf24' : c.offering ? '#cbd5e1' : 'var(--meta)' }}>
                              {c.duty ? '\u2605 ' : ''}{displayName(c.name, teamClin)}
                            </div>
                          ))}
                        </div>
                        {min != null && (
                          <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.09)', marginTop: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: fill }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Fragment>
        ))}

        {/* rota projection, only when some day has no export yet */}
        {days.some((d) => !d.closed && !d.hasData) && (
          <Fragment>
            <div className="flex items-start gap-1.5 pt-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 999, border: '1px dashed rgba(255,255,255,0.35)', marginTop: 4, flex: 'none' }} />
              <div className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--meta)' }}>
                Rota projection
                <div className="font-normal">no export yet</div>
              </div>
            </div>
            {days.map((d) => (
              <div key={`proj-${d.iso}`} className="rounded-lg p-1"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)' }}>
                {d.closed || d.hasData || !d.projection ? (
                  <div className="text-[11px] text-center py-2" style={{ color: 'var(--meta)' }}>&mdash;</div>
                ) : (
                  [['M', 'AM'], ['A', 'PM'], ['E', 'EVE']].filter(([k]) => d.projection[k].length).map(([k, label]) => (
                    <div key={k} className="px-1 py-0.5">
                      <span className="text-[11px] font-bold" style={{ color: 'var(--meta)' }}>{label}</span>
                      {d.projection[k].map((nm, i) => (
                        <div key={nm + i} className="text-[11px] leading-tight truncate" style={{ color: 'var(--meta)' }}>
                          {displayName(nm, teamClin)}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            ))}
          </Fragment>
        )}
      </div>
      </div>
    </div>
  );
}
