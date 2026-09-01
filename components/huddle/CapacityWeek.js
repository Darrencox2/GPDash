'use client';
// Week detail view for capacity planning.
//
// Laid out as SITE ROWS x SESSION COLUMNS: Mon AM, Mon PM, Tue AM, Tue PM
// and so on, reading left to right the way the week is actually worked.
// Sessions used to be stacked inside a day cell, which made a day a
// variable-height block and buried the session - the unit that is actually
// staffed, covered and short.
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
import StaffFilter, { staffRoleOptions } from '@/components/ui/StaffFilter';
import { getRoutineTypeSet, getUrgentTypeSet } from '@/lib/site-staffing';

// The house purple, as the Today page uses it for its own accents.
const DUTY = { bg: 'rgba(139,92,246,0.16)', bd: 'rgba(139,92,246,0.45)', fg: '#c4b5fd' };

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
  // Which staff count towards the session. Defaults to whatever site
  // staffing is configured with, so the view opens agreeing with the
  // minimums; widening it is a question ("what if nursing counted?")
  // rather than a silent change, so the header says when it differs.
  const configuredGroups = useMemo(() => (
    Array.isArray(capacityStaffing?.groups) && capacityStaffing.groups.length ? capacityStaffing.groups : ['gp']
  ), [capacityStaffing?.groups]);
  // Every role on the register is selectable; the configured groups are the
  // starting point, so the view opens agreeing with the minimums it draws
  // against, and widening past them says so.
  const roleOptions = useMemo(() => staffRoleOptions(teamClin || []), [teamClin]);
  const configuredRoles = useMemo(
    () => roleOptions.filter((o) => configuredGroups.includes(o.group)).map((o) => o.id),
    [roleOptions, configuredGroups]
  );
  const [roles, setRoles] = useState(null);            // null = follow the config
  // Who the pointer is on. Native title tooltips are slow, unstyled, and
  // land on top of the thing you are reading; the strip above the grid is
  // always there, and pointing at a name fills it. It is deliberately
  // sticky - it keeps the last person you pointed at rather than emptying
  // the moment the pointer drifts, which is what made the floating
  // version feel unreliable.
  const [peek, setPeek] = useState(null);              // { c, site, day, session }
  const activeRoles = roles && roles.length ? roles : configuredRoles;
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
          includeEmpty: true, includeRoles: activeRoles,
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
  }, [monday, huddleData, sites, hs, capacityStaffing, activeRoles, teamClin, data, todayIso]);

  // Which sessions the week actually uses. Evenings are rare, so a fixed
  // three-per-day would spend a third of the width on empty columns.
  const sessionKeys = useMemo(() => {
    const used = new Set(['am', 'pm']);
    for (const d of days) for (const e of d.detail) for (const k of Object.keys(e.sessions || {})) used.add(k);
    for (const d of days) if (d.projection?.E?.length) used.add('eve');
    return ['am', 'pm', 'eve'].filter((k) => used.has(k));
  }, [days]);

  // The minimum is a property of the site, but it is carried on each day's
  // entry - so read it off whichever day actually reported one.
  const thresholdFor = (site) => {
    for (const d of days) {
      const e = d.detail.find((x) => x.site.name === site.name);
      if (e && e.threshold != null) return e.threshold;
    }
    return null;
  };

  const routineSet = useMemo(() => getRoutineTypeSet(hs), [hs]);
  const urgentSet = useMemo(() => getUrgentTypeSet(hs), [hs]);

  const weekLabel = `${monday.getDate()} ${monday.toLocaleDateString('en-GB', { month: 'short' })}`;
  const cols = days.length * sessionKeys.length;
  // Two sites over ten columns left the grid a thin strip across the top of
  // a tall page. Rows now claim a real height, which also gives the name
  // lists room to separate who is offering from who is not.
  const rowMin = Math.max(104, Math.min(200, Math.round(560 / Math.max(sites.length, 1))));
  // No minWidth: the week must fit the page. A horizontal scrollbar hides
  // Friday behind an edge, and Friday is the session people plan for.
  const GRID = { display: 'grid', gridTemplateColumns: `132px repeat(${cols}, minmax(0, 1fr))`, gap: 3 };

  // ── the detail strip ──────────────────────────────────────────────────
  // It used to be a column down the right, which cost the grid 250px and
  // pushed Friday PM behind a horizontal scrollbar. Above the grid it is
  // full width, always present, and covers nothing: pointing at a name
  // fills it with what that person is actually booked to do, by slot type.
  const types = peek ? Object.entries(peek.c.types || {}).sort((a, b) => b[1] - a[1]) : [];
  const detailPanel = (
    <div className="rounded-xl px-3 py-2 mb-3 flex items-center gap-4 flex-wrap"
      style={{ background: 'var(--g-tile-2)', border: '1px solid var(--g-border)', minHeight: 58 }}>
      {!peek ? (
        <div className="text-[12px]" style={{ color: 'var(--g-text-faint)' }}>
          <span className="text-[11px] uppercase mr-2" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em' }}>Clinician detail</span>
          Point at any name below to see the slot types they are running that session.
        </div>
      ) : (
        <>
          <div style={{ minWidth: 190 }}>
            <div className="text-[11px] uppercase" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em' }}>
              {peek.day} {peek.session} · {peek.site}
            </div>
            <div className="text-[14px] font-semibold leading-tight flex items-center gap-2" style={{ color: peek.c.duty ? DUTY.fg : 'var(--g-text-hi)' }}>
              {displayName(peek.c.name, teamClin)}
              {peek.c.duty && (
                <span className="text-[10px] font-bold rounded px-1.5"
                  style={{ background: DUTY.bg, border: `1px solid ${DUTY.bd}`, color: DUTY.fg }}>duty</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap flex-1" style={{ minWidth: 0, borderLeft: '1px solid var(--g-border)', paddingLeft: 12 }}>
            {types.map(([type, n]) => {
              const kind = urgentSet.has(type) ? 'urgent' : routineSet.has(type) ? 'routine' : 'other';
              const col = kind === 'urgent' ? '#fca5a5' : kind === 'routine' ? '#86efac' : 'var(--g-text-faint)';
              return (
                <span key={type} className="text-[11.5px] rounded px-1.5 py-0.5 flex items-baseline gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: kind === 'other' ? 'var(--meta)' : 'var(--g-text-hi)' }}>
                  {type}
                  <span className="font-mono-data font-bold" style={{ color: col }}>{n}</span>
                </span>
              );
            })}
            {!types.length && <span className="text-[12px]" style={{ color: 'var(--g-text-faint)' }}>No slots recorded.</span>}
          </div>
          <div className="text-right" style={{ flex: 'none' }}>
            <div className="text-[11px]" style={{ color: 'var(--meta)' }}>bookable</div>
            <div className="font-mono-data text-[15px] font-bold leading-tight" style={{ color: peek.c.offering ? '#86efac' : '#fcd34d' }}>
              {peek.c.urgent + peek.c.routine}
            </div>
          </div>
          {!peek.c.offering && (
            <div className="text-[11px]" style={{ color: '#fcd34d', maxWidth: 220, lineHeight: 1.4, flex: 'none' }}>
              Here, but nothing bookable{peek.c.other > 0 ? ' - none of these types are on the urgent or routine lists' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="p-4">
      {/* Nav + filter. The red shortfall banner that used to sit here is
          gone: every short session already carries a red bar and a deficit
          in the grid, so the banner was the same alarm twice, louder. */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 1)} className="px-2 py-1 rounded-md text-slate-400 hover:text-white" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)'}}>&#8249;</button>
          <button onClick={() => setOffset(0)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold" style={{background: offset === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color: offset === 0 ? '#a5b4fc' : '#94a3b8'}}>This week</button>
          <button onClick={() => setOffset(o => o + 1)} className="px-2 py-1 rounded-md text-slate-400 hover:text-white" style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)'}}>&#8250;</button>
        </div>
        <span className="text-xs text-slate-400">w/c {weekLabel}</span>
        <StaffFilter options={roleOptions} selected={roles || configuredRoles}
          onChange={(next) => setRoles(next.length ? next : configuredRoles)}
          allLabel="Counting all staff" width={230} hintLabel="people" />
        <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <span style={{ width: 16, height: 4, borderRadius: 999, background: '#10b981', display: 'inline-block' }} />meets the minimum
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 9, height: 4, borderRadius: 999, background: '#ef4444', display: 'inline-block' }} />short
          </span>
          <span className="px-1 rounded" style={{ background: DUTY.bg, border: `1px solid ${DUTY.bd}`, color: DUTY.fg }}>duty</span>
          &#183; dimmed = no bookable slots
        </span>
      </div>

      {detailPanel}

      <div style={GRID}>

        {/* day header, each spanning its own sessions */}
        <div />
        {days.map((d) => (
          <div key={`d-${d.iso}`} className="text-center pb-1"
            style={{ gridColumn: `span ${sessionKeys.length}`, borderBottom: d.isToday ? '2px solid rgba(99,102,241,0.7)' : '1px solid rgba(255,255,255,0.10)' }}>
            <div className="text-xs font-semibold" style={{ color: d.isToday ? '#a5b4fc' : '#cbd5e1' }}>
              {d.dayName} <span className="font-normal" style={{ color: 'var(--meta)' }}>{d.dt.getDate()} {d.dt.toLocaleDateString('en-GB', { month: 'short' })}</span>
            </div>
            {d.closed && <div className="text-[11px]" style={{ color: '#fbbf24' }}>{d.closedReason || 'Closed'}</div>}
          </div>
        ))}

        {/* session header, the column the grid is actually keyed on */}
        <div />
        {days.map((d) => sessionKeys.map((k) => (
          <div key={`s-${d.iso}-${k}`} className="text-center text-[11px] font-bold pb-1"
            style={{ color: d.isToday ? '#a5b4fc' : 'var(--meta)', fontFamily: 'var(--font-mono)' }}>
            {SESSION_LABELS[k]}
          </div>
        )))}

        {/* one row per configured site */}
        {sites.map((site) => (
          <Fragment key={site.name}>
            <div className="flex items-stretch gap-2 py-1">
              {/* The site's colour as a full-height strip: a dot this small
                  was doing almost nothing to tie a row to its site. */}
              <span style={{ width: 5, borderRadius: 3, background: site.colour || '#64748b', flex: 'none' }} />
              <div className="min-w-0 pt-1">
                <div className="text-[13px] font-semibold leading-tight" style={{ color: '#e2e8f0' }}>{site.name}</div>
                {thresholdFor(site) != null && (
                  <div className="text-[11px]" style={{ color: 'var(--meta)' }}>min {thresholdFor(site)}</div>
                )}
              </div>
            </div>
            {days.map((d) => {
              // A closed day is one statement across its sessions, not the
              // same dash repeated per column.
              if (d.closed) {
                return (
                  <div key={`${site.name}-${d.iso}-closed`} className="rounded-lg text-[11px] text-center py-2"
                    style={{ gridColumn: `span ${sessionKeys.length}`, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--meta)' }}>
                    &mdash;
                  </div>
                );
              }
              const entry = d.detail.find((e) => e.site.name === site.name);
              return sessionKeys.map((k) => {
                const ses = entry?.sessions?.[k];
                const min = entry?.threshold ?? null;
                if (!ses) {
                  return (
                    <div key={`${site.name}-${d.iso}-${k}`} className="rounded-lg text-[11px] text-center py-2"
                      style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--g-text-faint)' }}>
                      &ndash;
                    </div>
                  );
                }
                const short = ses.state === 'short';
                const deficit = short && min != null ? min - ses.offering : 0;
                const fill = short ? '#ef4444' : '#10b981';
                const pct = min ? Math.max(6, Math.min(100, (ses.offering / Math.max(min, ses.offering)) * 100)) : 100;
                // The engine returns anyone offering first, so the first
                // non-offering name is where the quiet half begins.
                const firstDim = ses.clins.findIndex((c) => !c.offering);
                return (
                  <div key={`${site.name}-${d.iso}-${k}`} className="rounded-lg px-1.5 py-1 flex flex-col"
                    style={{ minHeight: rowMin, background: short ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.025)', border: `1px solid ${short ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.07)'}` }}>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[11px] font-bold font-mono-data" style={{ color: short ? '#fca5a5' : '#cbd5e1' }}>
                        {ses.offering}{deficit > 0 && <span> ({'\u2212'}{deficit})</span>}
                      </span>
                      <span className="ml-auto text-[11px] font-mono-data" style={{ color: 'var(--g-text-faint)' }}>{ses.urgent}u {ses.routine}r</span>
                    </div>
                    <div className="mt-0.5 flex-1">
                      {ses.clins.map((c, i) => (
                        <Fragment key={c.name + i}>
                          {i === firstDim && i > 0 && (
                            <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', margin: '3px 0 2px' }} />
                          )}
                          <div
                            onMouseEnter={() => setPeek({ c, site: site.name, day: d.dayName, session: SESSION_LABELS[k] })}
                            className="text-[12.5px] leading-snug"
                            style={c.duty
                              ? { background: DUTY.bg, border: `1px solid ${DUTY.bd}`, color: DUTY.fg, borderRadius: 4, padding: '0 3px', fontWeight: 700, cursor: 'default' }
                              : c.offering
                                ? { color: '#e2e8f0', cursor: 'default' }
                                // Was --meta against #cbd5e1 - barely a
                                // difference. Faint ink, and struck through,
                                // so "offering nothing" reads without colour.
                                : { color: 'var(--g-text-faint)', fontStyle: 'italic', textDecoration: 'line-through', textDecorationThickness: '1px', cursor: 'default' }}>
                            {displayName(c.name, teamClin)}
                          </div>
                        </Fragment>
                      ))}
                    </div>
                    {min != null && (
                      <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.09)', marginTop: 4, overflow: 'hidden', flex: 'none' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: fill }} />
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </Fragment>
        ))}

        {/* rota projection, only when some day has no export yet */}
        {days.some((d) => !d.closed && !d.hasData) && (
          <Fragment>
            <div className="flex items-stretch gap-2 py-1">
              <span style={{ width: 5, borderRadius: 3, border: '1px dashed rgba(255,255,255,0.3)', flex: 'none' }} />
              <div className="text-[12px] font-semibold leading-tight pt-1" style={{ color: 'var(--meta)' }}>
                Rota projection
                <div className="font-normal text-[11px]">no export yet</div>
              </div>
            </div>
            {days.map((d) => {
              if (d.closed || d.hasData || !d.projection) {
                return (
                  <div key={`proj-${d.iso}`} className="rounded-lg text-[11px] text-center py-2"
                    style={{ gridColumn: `span ${sessionKeys.length}`, background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.10)', color: 'var(--g-text-faint)' }}>
                    &mdash;
                  </div>
                );
              }
              const KEY = { am: 'M', pm: 'A', eve: 'E' };
              return sessionKeys.map((k) => (
                <div key={`proj-${d.iso}-${k}`} className="rounded-lg px-1.5 py-1"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)' }}>
                  {(d.projection[KEY[k]] || []).map((nm, i) => (
                    <div key={nm + i} className="text-[11px] leading-tight truncate" style={{ color: 'var(--meta)' }}>
                      {displayName(nm, teamClin)}
                    </div>
                  ))}
                </div>
              ));
            })}
          </Fragment>
        )}
      </div>
    </div>
  );
}
