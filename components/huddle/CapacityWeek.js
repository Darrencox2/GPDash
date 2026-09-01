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
  // Who the pointer is on, and where to put the panel. Native title
  // tooltips are slow, unstyled, and land on top of the thing you are
  // reading; this one sits beside the column.
  const [peek, setPeek] = useState(null);              // { c, x, y, right }
  const activeRoles = roles && roles.length ? roles : configuredRoles;
  const widened = activeRoles.some((r) => !configuredRoles.includes(r));
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

  const weekLabel = `${monday.getDate()} ${monday.toLocaleDateString('en-GB', { month: 'short' })}`;
  const cols = days.length * sessionKeys.length;
  // Two sites over ten columns left the grid a thin strip across the top of
  // a tall page. Rows now claim a real height, which also gives the name
  // lists room to separate who is offering from who is not.
  const rowMin = Math.max(96, Math.min(190, Math.round(520 / Math.max(sites.length, 1))));
  const GRID = { display: 'grid', gridTemplateColumns: `142px repeat(${cols}, minmax(0, 1fr))`, gap: 4, minWidth: 142 + cols * 88 };

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
        {widened && (
          <span className="text-[11px]" style={{ color: '#fcd34d' }}>
            counting beyond the roles the minimums were set for
          </span>
        )}
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

      <div className="overflow-x-auto">
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
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const right = r.right + 250 < window.innerWidth;
                              setPeek({ c, x: right ? r.right + 8 : r.left - 8, y: r.top, right });
                            }}
                            onMouseLeave={() => setPeek(null)}
                            className="text-[11px] leading-tight truncate"
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
            <div className="flex items-start gap-1.5 pt-1.5">
              <span style={{ width: 8, height: 8, borderRadius: 999, border: '1px dashed rgba(255,255,255,0.35)', marginTop: 4, flex: 'none' }} />
              <div className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--meta)' }}>
                Rota projection
                <div className="font-normal">no export yet</div>
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

      {/* What that person is doing, beside the column rather than over it. */}
      {peek && (
        <div className="fixed z-50 pointer-events-none rounded-xl p-3 shadow-2xl"
          style={{
            left: peek.x, top: peek.y, width: 230,
            transform: peek.right ? 'none' : 'translateX(-100%)',
            background: 'var(--g-panel-strong)', border: '1px solid var(--g-border-2)',
          }}>
          <div className="text-xs font-semibold" style={{ color: peek.c.duty ? DUTY.fg : 'var(--g-text-hi)' }}>
            {displayName(peek.c.name, teamClin)}{peek.c.duty ? ' \u00b7 duty' : ''}
          </div>
          <div className="mt-1.5" style={{ fontSize: 11, color: 'var(--meta)', lineHeight: 1.7 }}>
            {[['Urgent', peek.c.urgent], ['Routine', peek.c.routine], ['Everything else', peek.c.other]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <span>{k}</span>
                <span className="font-mono-data" style={{ color: v > 0 ? 'var(--g-text-hi)' : 'var(--g-text-faint)', fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
          {!peek.c.offering && (
            <div className="mt-1.5 pt-1.5 text-[11px]" style={{ borderTop: '1px solid var(--g-border)', color: '#fcd34d' }}>
              Here, but nothing bookable this session{peek.c.other > 0 ? ' - their slots are types the urgent and routine lists do not cover' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
