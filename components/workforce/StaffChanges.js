'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Staff Changes — the shape of the team across the year
// ═══════════════════════════════════════════════════════════════════════════
// People down the left (live from the register), months along the bottom
// (April-anchored, pageable), events in the squares, the capacity line on
// top. Only events + planned people persist; see lib/staff-plan.js.
import { useMemo, useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { canEditPracticeData } from '@/lib/permissions';
import MultiSelect from '@/components/ui/MultiSelect';
import { applyTransition } from '@/lib/status-transitions';
import { logEvent } from '@/lib/data';
import { classifyStaffRole } from '@/lib/site-staffing';
import {
  monthKey, monthLabel, addMonths, aprilStart, monthRange,
  derivePeople, totalsByMonth, per1000ByMonth, planSummary,
  suggestedEventsFromWindDowns, eventTransitionKey, monthEndDate, capacityTimeline,
} from '@/lib/staff-plan';
import CapacityChart, { EVENT_TONE } from '@/components/workforce/CapacityChart';

const ROLE_FILTER_KEY = 'gpdash-staff-changes-roles';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
// One line describing an event, used for the audit trail, the running
// list and the cell tooltip - so all three always say the same thing.
export function eventTitle(e) {
  if (!e) return '';
  // Events recorded before exact dates existed only know their month, so
  // fall back to the month rather than printing "from  to ".
  const monthWord = (mk) => (mk ? `${monthLabel(mk)} ${mk.slice(0, 4)}` : 'an unknown date');
  const from = e.startDate ? fmtDate(e.startDate) : monthWord(e.month);
  const to = e.endDate ? fmtDate(e.endDate) : monthWord(e.toMonth || e.month);
  switch (e.type) {
    case 'join': return `Joins on ${e.sessions} sessions a week from ${from}`;
    case 'leave': return `Leaves ${e.startDate ? 'on ' : 'in '}${e.startDate ? fmtDate(e.endDate || e.startDate) : monthWord(e.month)}`;
    case 'temp_leave': return `${(e.reason || 'away').charAt(0).toUpperCase()}${(e.reason || 'away').slice(1)} from ${from} to ${to}`;
    case 'change': return `Sessions change to ${e.sessions} a week from ${from}`;
    default: return e.type;
  }
}
const EV_STYLE = EVENT_TONE;

export default function StaffChanges({ data, saveData }) {
  const canEdit = canEditPracticeData(data);
  const todayMk = monthKey(new Date());
  const [viewStart, setViewStart] = useState(() => aprilStart());
  // Roles are the real job titles from the register, not the four coarse
  // groups - "GPs and ANPs" is one tick each, which grouping could not do.
  // The choice is a per-viewer preference, so it lives in localStorage.
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    try { const raw = localStorage.getItem(ROLE_FILTER_KEY); if (raw) setRoles(JSON.parse(raw) || []); } catch { /* no stored preference */ }
  }, []);
  const setRolesPersisted = (next) => {
    setRoles(next);
    try { localStorage.setItem(ROLE_FILTER_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };
  const [per1000, setPer1000] = useState(false);
  const [chartView, setChartView] = useState('level');
  const [editor, setEditor] = useState(null);          // { personRef, month }
  const [addOpen, setAddOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(null);
  const [newPerson, setNewPerson] = useState({ name: '', role: 'Salaried GP' });
  const [listSizeByMonth, setListSizeByMonth] = useState(null);

  const plan = data?.staffPlan || { plannedPeople: [], events: [] };
  const months = useMemo(() => monthRange(viewStart, 13), [viewStart]);

  // NHS-published monthly list sizes for the per-1,000 view (sparse; the
  // engine carries the nearest earlier value forward).
  useEffect(() => {
    const ods = data?._v4?.practiceOds;
    if (!ods) return;
    let dead = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows } = await supabase.from('nhs_oc_baseline')
          .select('month, list_size').eq('ods_code', ods).not('list_size', 'is', null);
        if (!dead && rows) setListSizeByMonth(Object.fromEntries(rows.map(r => [monthKey(r.month), r.list_size])));
      } catch { /* per-1000 falls back to the registered size */ }
    })();
    return () => { dead = true; };
  }, [data?._v4?.practiceOds]);

  const realPeople = useMemo(() => derivePeople(data), [data]);
  const allPeople = useMemo(() => {
    const planned = (plan.plannedPeople || []).map(p => ({ ...p, kind: 'planned', sessions: 0, group: p.group || 'gp', role: p.role || 'Planned' }));
    return [...realPeople, ...planned];
  }, [realPeople, plan.plannedPeople]);

  // Role options, each showing how many sessions a week it carries — the
  // number is what makes a role worth ticking or leaving out.
  const roleOptions = useMemo(() => {
    const acc = {};
    for (const p of allPeople) {
      const r = p.role || 'Unspecified';
      if (!acc[r]) acc[r] = { id: r, label: r, sessions: 0, group: p.group, n: 0 };
      acc[r].sessions += p.sessions || 0;
      acc[r].n += 1;
    }
    return Object.values(acc)
      .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
      .map(o => ({ ...o, hint: `${o.n} · ${o.sessions}` }));
  }, [allPeople]);

  const rolePresets = useMemo(() => {
    const inGroup = (g) => roleOptions.filter(o => o.group === g).map(o => o.id);
    return [
      { label: 'GPs', ids: inGroup('gp') },
      { label: 'GPs + nursing', ids: [...inGroup('gp'), ...inGroup('nursing')] },
      { label: 'Everyone', ids: [] },
    ];
  }, [roleOptions]);

  const people = useMemo(
    () => (roles.length === 0 ? allPeople : allPeople.filter(p => roles.includes(p.role || 'Unspecified'))),
    [allPeople, roles]
  );

  const { perPerson, totals } = useMemo(() => totalsByMonth(people, plan.events, months), [people, plan.events, months]);
  const perK = useMemo(() => per1000ByMonth(totals, months, listSizeByMonth, data?._v4?.practiceListSize), [totals, months, listSizeByMonth, data?._v4?.practiceListSize]);
  const summary = useMemo(() => planSummary(totals, months, todayMk), [totals, months, todayMk]);
  // The chart walks the same events by DATE rather than by month, so a leave
  // starting on the 28th only drops the line on the 28th.
  const timeline = useMemo(() => capacityTimeline(people, plan.events, months), [people, plan.events, months]);
  // The published sizes are sparse; the nearest earlier one carries forward,
  // and the registered size is the final fallback.
  const listSizeAt = useMemo(() => {
    const sizes = listSizeByMonth || {};
    const keys = Object.keys(sizes).sort();
    return (date) => {
      const mk = String(date).slice(0, 7);
      let best = null;
      for (const k of keys) { if (k > mk) break; best = k; }
      return best ? sizes[best] : (data?._v4?.practiceListSize || null);
    };
  }, [listSizeByMonth, data?._v4?.practiceListSize]);
  const suggestions = useMemo(() => suggestedEventsFromWindDowns(realPeople, plan.events), [realPeople, plan.events]);

  const whoAmI = data?._v4?.linkedClinicianName || data?._v4?.userEmail || 'someone';
  const nameOfRef = (ref) => allPeople.find(p => p.id === ref)?.name || ref;
  const savePlan = (next, auditLine = null) => {
    let payload = { ...data, staffPlan: { ...next, savedAt: new Date().toISOString() } };
    if (auditLine) payload = logEvent(payload, 'staff', auditLine);
    saveData(payload);
  };

  const addEvent = (ev, opts = {}) => {
    // Dates are the real record; the month is only where the square sits.
    const startDate = ev.startDate || `${ev.month}-01`;
    const endDate = ev.endDate || (ev.type === 'temp_leave' ? monthEndDate(ev.toMonth || ev.month) : monthEndDate(ev.month));
    const event = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...ev, startDate,
      ...(ev.type === 'temp_leave' || ev.type === 'leave' ? { endDate } : {}),
      by: whoAmI, at: new Date().toISOString(),
    };
    let payload = { ...data, staffPlan: { ...plan, events: [...(plan.events || []), event], savedAt: new Date().toISOString() } };

    // Real person going away or leaving? Route through the same transition
    // the buddy board uses, so wind-down + absence + audit stay in step.
    const tKey = eventTransitionKey(event);
    const isReal = realPeople.some(p => p.id === event.personRef);
    if (tKey && isReal && !opts.skipSync) {
      try {
        const before = (payload.plannedAbsences || []).length;
        payload = applyTransition(payload, event.personRef, tKey, { untilDate: endDate, startDate, by: whoAmI });
        // Remember which absence this event created so removing the event
        // can take it back out of the buddy board again.
        const created = (payload.plannedAbsences || [])[before];
        if (created?.id) {
          event.absenceId = created.id;
          payload.staffPlan = { ...payload.staffPlan, events: payload.staffPlan.events.map(e => e.id === event.id ? event : e) };
        }
      } catch { /* the plan event still records even if the sync cannot */ }
    }
    payload = logEvent(payload, 'staff', `${eventTitle(event)} for ${nameOfRef(event.personRef)} added in staff changes by ${whoAmI}`);
    saveData(payload);
    setEditor(null);
  };

  // Removing has to undo everything the event switched on, or the buddy
  // board keeps covering someone whose leave was deleted here.
  const removeEvent = (id) => {
    const ev = (plan.events || []).find(e => e.id === id);
    if (!ev) return;
    let payload = { ...data, staffPlan: { ...plan, events: (plan.events || []).filter(e => e.id !== id), savedAt: new Date().toISOString() } };
    if (ev.absenceId) {
      payload.plannedAbsences = (payload.plannedAbsences || []).filter(a => a.id !== ev.absenceId);
    }
    // Clear the wind-down marker only if it is the one this event set -
    // never stamp on a marker somebody set by hand on the buddy board.
    if (ev.absenceId && (ev.type === 'leave' || ev.type === 'temp_leave')) {
      const clins = Array.isArray(payload.clinicians) ? payload.clinicians : Object.values(payload.clinicians || {});
      payload.clinicians = clins.map(c => {
        if (c.id !== ev.personRef || !c.windDown) return c;
        const sameSpan = c.windDown.startDate === ev.startDate && c.windDown.endDate === ev.endDate;
        if (!sameSpan) return c;
        const { windDown, ...rest } = c;
        return rest;
      });
    }
    payload = logEvent(payload, 'staff', `${eventTitle(ev)} for ${nameOfRef(ev.personRef)} removed in staff changes by ${whoAmI}${ev.absenceId ? ' - buddy cover updated' : ''}`);
    saveData(payload);
  };

  const addPlannedPerson = () => {
    const name = newPerson.name.trim();
    if (!name) return;
    const id = `plan-${Date.now()}`;
    const role = newPerson.role.trim() || 'Planned';
    // If a role filter is on and the new person would not match it, they
    // would be added and instantly hidden - which reads exactly like
    // nothing happening. Widen the filter to include them.
    if (roles.length > 0 && !roles.includes(role)) setRolesPersisted([...roles, role]);
    savePlan(
      { ...plan, plannedPeople: [...(plan.plannedPeople || []), { id, name, role, group: classifyStaffRole(role) }] },
      `${name} (${role}) added as a planned person in staff changes by ${whoAmI}`
    );
    setAddOpen(false); setNewPerson({ name: '', role: 'Salaried GP' });
    // Planned people join the bottom of a long grid, well below the fold,
    // so adding one looked like nothing happening at all. Take the eye
    // there and hold it for a moment.
    setJustAdded(id);
    setTimeout(() => {
      document.getElementById(`sc-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    setTimeout(() => setJustAdded(null), 2600);
  };
  const removePlannedPerson = (id) => savePlan({
    ...plan,
    plannedPeople: (plan.plannedPeople || []).filter(p => p.id !== id),
    events: (plan.events || []).filter(e => e.personRef !== id),
  }, `${nameOfRef(id)} removed from staff changes by ${whoAmI}`);

  // Newest first, each labelled by where it sits relative to today.
  const runningChanges = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (plan.events || [])
      .map(ev => {
        const from = ev.startDate || `${ev.month}-01`;
        const to = ev.endDate || (ev.type === 'temp_leave' ? monthEndDate(ev.toMonth || ev.month) : from);
        const state = today < from ? 'upcoming' : (today <= to ? 'active' : 'past');
        return { ev, state, from };
      })
      .sort((a, b) => (b.ev.at || b.from).localeCompare(a.ev.at || a.from));
  }, [plan.events]);

  const cellEvents = (personRef, mk) => (plan.events || []).filter(e => e.personRef === personRef && (e.month === mk || (e.type === 'temp_leave' && mk > e.month && mk <= (e.toMonth || e.month))));

  const S = { chip: (t) => ({
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 5,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
    background: EV_STYLE[t].bg, border: `1px solid ${EV_STYLE[t].bd}`, color: EV_STYLE[t].fg,
  }) };

  return (
    <div>
      <h1 className="sr-only">Staff changes</h1>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 600, color: 'var(--g-text-hi)', margin: 0 }}>Staff changes</h2>
        <MultiSelect label="Roles" options={roleOptions} selected={roles} onChange={setRolesPersisted}
          allLabel="Everyone" presets={rolePresets} width={230} hintLabel="people · sess/wk" />
        {roles.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--meta)' }}>
            {people.length} of {allPeople.length} people
          </span>
        )}
        <button onClick={() => setPer1000(v => !v)} aria-pressed={per1000}
          className="px-2.5 py-1 rounded-md text-xs font-semibold ml-auto"
          style={{ background: per1000 ? 'var(--accent-soft)' : 'var(--g-tile)', color: per1000 ? 'var(--accent-text)' : 'var(--meta)', border: `1px solid ${per1000 ? 'var(--accent)' : 'var(--g-border-2)'}` }}
          title="Divide the line by the practice list size — NHS-published monthly sizes where known, the registered size otherwise">
          per 1,000 patients
        </button>
      </div>

      {/* wind-down suggestions */}
      {canEdit && suggestions.length > 0 && (
        <div className="mb-3 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap" style={{ border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.06)' }}>
          <span className="text-xs" style={{ color: '#fcd34d' }}>Already recorded on the buddy board:</span>
          {suggestions.map((sg, i) => (
            <button key={i} onClick={() => addEvent(sg, { skipSync: true })}
              className="text-xs px-2 py-1 rounded-md" style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>
              {sg.personName}: {sg.type === 'leave' ? `leaves ${monthLabel(sg.month)}` : `away ${monthLabel(sg.month)}–${monthLabel(sg.toMonth)}`} · <span style={{ color: 'var(--link)' }}>add</span>
            </button>
          ))}
        </div>
      )}

      {/* headline numbers; the chart itself sits on the grid's columns below */}
      <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-border)' }}>
        <div className="flex gap-2.5 flex-wrap">
          {[
            ['Now', per1000 ? perK[todayMk] : summary.now, 'var(--g-text-hi)'],
            [`End of view`, per1000 ? perK[months[months.length - 1]] : summary.end, summary.endDelta < 0 ? '#fca5a5' : '#34d399', summary.endDelta !== 0 ? `${summary.endDelta > 0 ? '+' : ''}${per1000 ? '' : summary.endDelta}` : ''],
            [`Low point · ${monthLabel(summary.lowMk)}`, per1000 ? perK[summary.lowMk] : summary.low, '#fbbf24'],
            ['Planned changes', (plan.events || []).length, 'var(--g-text-hi)'],
          ].map(([label, val, col, extra], i) => (
            <div key={i} className="rounded-lg px-3 py-1.5" style={{ background: 'var(--g-tile-2)', border: '1px solid var(--g-border)' }}>
              <div className="text-[11px] uppercase" style={{ color: 'var(--meta)', letterSpacing: '0.06em' }}>{label}</div>
              <div className="font-mono-data text-lg font-bold" style={{ color: col }}>{val ?? '—'}{extra ? <span className="text-xs"> {extra}</span> : null}<span className="text-[11px] font-normal" style={{ color: 'var(--meta)' }}> {per1000 ? '/1k' : '/wk'}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* timeline grid */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-border)' }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--g-tile)' }}>
          <button aria-label="Previous year" onClick={() => setViewStart(addMonths(viewStart, -12))} className="px-2 py-0.5 rounded-md text-sm" style={{ border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>◀</button>
          <span className="text-sm font-semibold" style={{ color: 'var(--g-text-hi)' }}>{monthLabel(viewStart)} {viewStart.slice(0, 4)} – {monthLabel(addMonths(viewStart, 12))} {addMonths(viewStart, 12).slice(0, 4)}</span>
          <button aria-label="Next year" onClick={() => setViewStart(addMonths(viewStart, 12))} className="px-2 py-0.5 rounded-md text-sm" style={{ border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>▶</button>
          {viewStart !== aprilStart() && (
            <button onClick={() => setViewStart(aprilStart())} className="text-xs font-medium" style={{ color: 'var(--link)' }}>This year</button>
          )}
          <span className="ml-auto text-[11px]" style={{ color: 'var(--meta)' }}>
            <span style={S.chip('join')}>joins</span> <span style={S.chip('leave')}>leaves</span> <span style={S.chip('temp_leave')}>away</span> <span style={S.chip('change')}>±sessions</span>
            {canEdit ? ' · click a square' : ' · view only'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 1000 }}>
            {/* Inside the same scroll box and on the same column track as the
                grid, so a step in the line sits over the square that caused
                it and the two scroll together. */}
            <CapacityChart months={months} todayMk={todayMk} timeline={timeline}
              per1000={per1000} listSizeAt={listSizeAt} view={chartView} onViewChange={setChartView} />
            <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, minmax(0, 1fr))' }}>
              <div className="px-3 py-1.5 text-[11px] uppercase" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em' }}>Staff · sess/wk</div>
              {months.map(mk => (
                <div key={mk} className="text-center py-1.5 text-[11px]" style={{ borderLeft: '1px solid var(--g-border)', fontFamily: 'var(--font-mono)', color: mk === todayMk ? '#34d399' : 'var(--meta)' }}>{monthLabel(mk)}</div>
              ))}
            </div>
            {people.map(p => {
              const gone = perPerson[p.id]?.[months[months.length - 1]] === 0 && (plan.events || []).some(e => e.personRef === p.id && e.type === 'leave');
              return (
                <div key={p.id} id={`sc-row-${p.id}`}
                  style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, minmax(0, 1fr))',
                    borderTop: p.kind === 'planned' ? '1px dashed var(--g-border-2)' : '1px solid var(--g-border)',
                    background: justAdded === p.id ? 'rgba(52,211,153,0.16)' : undefined,
                    transition: 'background 0.6s ease' }}>
                  <div className="px-3 py-1 flex items-baseline gap-2 min-w-0">
                    <span className="text-[11px] font-bold" style={{ fontFamily: 'var(--font-mono)', color: p.kind === 'planned' ? 'var(--ok, #34d399)' : '#fff' }}>{p.initials || '＋'}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--g-text-hi)', fontStyle: p.kind === 'planned' ? 'italic' : 'normal' }}>{p.name}</span>
                    {p.kind === 'planned' && canEdit && (
                      <button aria-label={`Remove ${p.name}`} onClick={() => removePlannedPerson(p.id)} className="text-[11px]" style={{ color: 'var(--meta)' }}>✕</button>
                    )}
                    <span className="ml-auto text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--meta)' }}>{p.kind === 'planned' ? '—' : p.sessions}</span>
                  </div>
                  {months.map(mk => {
                    const evs = cellEvents(p.id, mk);
                    const inSpan = evs.some(e => e.type === 'temp_leave' && e.month !== mk);
                    const starts = evs.filter(e => e.month === mk);
                    return (
                      <button key={mk} disabled={!canEdit}
                        onClick={() => canEdit && setEditor({ personRef: p.id, month: mk, personName: p.name, isPlanned: p.kind === 'planned' })}
                        aria-label={`${p.name}, ${monthLabel(mk)} ${mk.slice(0, 4)}`}
                        className="min-h-[26px] flex items-center justify-center px-0.5 overflow-hidden"
                        title={starts.map(e => eventTitle(e)).join(' · ') || undefined}
                        style={{ borderLeft: '1px solid var(--g-border)', background: mk === todayMk ? 'rgba(52,211,153,0.05)' : 'transparent', cursor: canEdit ? 'pointer' : 'default', opacity: gone && perPerson[p.id]?.[mk] === 0 && !starts.length ? 0.4 : 1 }}>
                        {starts.map(e => (
                          <span key={e.id} style={S.chip(e.type)} title={`${e.note || e.type}${canEdit ? ' — click cell to edit' : ''}`}>
                            {e.type === 'join' ? `▶ ${e.sessions ?? ''}` : e.type === 'leave' ? '■ leaves' : e.type === 'temp_leave' ? `⏸ ${e.reason || 'away'}` : `${e.sessions}`}
                          </span>
                        ))}
                        {inSpan && !starts.length && <span style={{ display: 'block', width: '100%', height: 4, background: 'rgba(245,158,11,0.35)', borderTop: '1px solid rgba(245,158,11,0.55)', borderBottom: '1px solid rgba(245,158,11,0.55)' }} />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {canEdit && (
              <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, minmax(0, 1fr))', borderTop: '1px solid var(--g-border)' }}>
                <div className="px-3 py-1.5">
                  <button onClick={() => setAddOpen(true)} className="text-xs" style={{ color: 'var(--link)' }}>＋ Add person…</button>
                </div>
                {months.map(mk => <div key={mk} style={{ borderLeft: '1px solid var(--g-border)' }} />)}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, minmax(0, 1fr))', borderTop: '2px solid var(--g-border-2)', background: 'rgba(99,102,241,0.05)' }}>
              <div className="px-3 py-1.5 text-xs font-bold" style={{ color: 'var(--g-text-hi)' }}>TOTAL {per1000 ? '/1k patients' : '/ week'}</div>
              {months.map(mk => (
                <div key={mk} className="text-center py-1.5 text-[11px] font-bold" style={{ borderLeft: '1px solid var(--g-border)', fontFamily: 'var(--font-mono)', color: 'var(--g-text-hi)' }}>
                  {per1000 ? (perK[mk] ?? '—') : totals[mk]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Running changes ────────────────────────────────────────────
          Every change on one list, newest first, so there is one place to
          answer "what has been recorded, by whom, and is it still to
          come". Removing here undoes the buddy-board side too. */}
      <div className="rounded-xl mt-3" style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-border)' }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--g-tile)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--g-text-hi)', margin: 0 }}>Running changes</h3>
          <span className="text-[11px]" style={{ color: 'var(--meta)' }}>{runningChanges.length} recorded</span>
          <span className="ml-auto text-[11px]" style={{ color: 'var(--meta)' }}>Leave and temporary leave also drive buddy cover</span>
        </div>
        {runningChanges.length === 0 ? (
          <div className="px-4 py-5 text-sm text-center" style={{ color: 'var(--meta)' }}>
            Nothing recorded yet. Click a square in the grid above to add a join, a leave, temporary leave or a session change.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--g-border)' }}>
            {runningChanges.map(({ ev, state }) => (
              <div key={ev.id} className="flex items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid var(--g-border)' }}>
                <span style={S.chip(ev.type)}>{ev.type === 'temp_leave' ? 'away' : ev.type === 'change' ? '±sess' : ev.type}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--g-text-hi)', minWidth: 150 }}>{nameOfRef(ev.personRef)}</span>
                <span className="text-sm flex-1 min-w-0" style={{ color: 'var(--g-text-hi)' }}>{eventTitle(ev)}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded" style={{
                  color: state === 'active' ? '#fbbf24' : state === 'upcoming' ? 'var(--link)' : 'var(--meta)',
                  border: `1px solid ${state === 'active' ? 'rgba(245,158,11,0.45)' : state === 'upcoming' ? 'rgba(52,211,153,0.35)' : 'var(--g-border-2)'}`,
                }}>{state}</span>
                {ev.absenceId && <span className="text-[11px]" title="Pushed to the buddy board" style={{ color: 'var(--link)' }}>buddy</span>}
                <span className="text-[11px] hidden lg:inline" style={{ color: 'var(--meta)', minWidth: 120 }}>
                  {ev.by ? `by ${ev.by}` : ''}
                </span>
                {canEdit && (
                  <button onClick={() => removeEvent(ev.id)} className="text-xs shrink-0" style={{ color: '#fca5a5' }}>remove</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* cell editor */}
      {editor && (
        <CellEditor editor={editor} onClose={() => setEditor(null)} onAdd={addEvent} onRemove={removeEvent}
          existing={cellEvents(editor.personRef, editor.month).filter(e => e.month === editor.month)} months={months} />
      )}
      {/* add person */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setAddOpen(false)}>
          <form className="rounded-xl p-4 w-80" style={{ background: 'var(--g-surface-2)', border: '1px solid var(--g-border-2)' }}
            onClick={e => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); addPlannedPerson(); }}>
            {/* A form, not loose inputs: pressing Enter after typing a name
                did nothing at all, which read as the button being broken. */}
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--g-text-hi)' }}>Add a planned person</div>
            <input autoFocus value={newPerson.name} onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Dr Locum, New salaried GP?" className="w-full rounded-md px-2.5 py-1.5 text-sm mb-2"
              style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }} />
            <input value={newPerson.role} list="staff-changes-roles" onChange={e => setNewPerson(p => ({ ...p, role: e.target.value }))}
              placeholder="Role" className="w-full rounded-md px-2.5 py-1.5 text-sm mb-3"
              style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }} />
            <datalist id="staff-changes-roles">
              {roleOptions.map(o => <option key={o.id} value={o.id} />)}
            </datalist>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setAddOpen(false)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--meta)' }}>Cancel</button>
              <button type="submit" disabled={!newPerson.name.trim()}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}>Add</button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--meta)' }}>Planned people are drawn italic. Give them a join event to add their sessions.</p>
          </form>
        </div>
      )}
    </div>
  );
}

function CellEditor({ editor, onClose, onAdd, onRemove, existing }) {
  const [mode, setMode] = useState(null);
  const [sessions, setSessions] = useState(4);
  const [reason, setReason] = useState('maternity');
  // Exact dates, not just the month. The buddy board covers people day by
  // day, so "October" is not enough to know who needs cover on the 3rd.
  const firstOfMonth = `${editor.month}-01`;
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(monthEndDate(addMonths(editor.month, 2)));
  const base = { personRef: editor.personRef, month: editor.month };
  const pretty = `${monthLabel(editor.month)} ${editor.month.slice(0, 4)}`;
  const dateInput = {
    background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)',
    borderRadius: 6, padding: '4px 8px', fontSize: 13, colorScheme: 'dark',
  };
  const endsBeforeStart = endDate && startDate && endDate < startDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-4 w-[420px]" style={{ background: 'var(--g-surface-2)', border: '1px solid var(--g-border-2)' }} onClick={e => e.stopPropagation()}>
        <div className="text-[11px] mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--meta)' }}>{editor.personName.toUpperCase()} · {pretty.toUpperCase()}</div>

        {existing.length > 0 && (
          <div className="mb-3">
            {existing.map(e => (
              <div key={e.id} className="flex items-start gap-2 text-sm py-1" style={{ color: 'var(--g-text-hi)' }}>
                <span className="flex-1">
                  {eventTitle(e)}
                  {e.by && <span className="block text-[11px]" style={{ color: 'var(--meta)' }}>added by {e.by}</span>}
                </span>
                <button onClick={() => { onRemove(e.id); onClose(); }} className="text-xs shrink-0" style={{ color: '#fca5a5' }}>remove</button>
              </div>
            ))}
          </div>
        )}

        {!mode && (
          <div className="flex flex-col gap-1.5">
            {[
              ['join', '▶ Joins', 'sets sessions from a date'],
              ['leave', '■ Leaves', 'last working day'],
              ['temp_leave', '⏸ Temporary leave', 'maternity, sickness, sabbatical'],
              ['change', '± Change sessions', 'new weekly total from a date'],
            ].map(([m, label, hint]) => (
              <button key={m} onClick={() => setMode(m)}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>
                {label} <span style={{ color: 'var(--meta)' }}>— {hint}</span>
              </button>
            ))}
          </div>
        )}

        {mode && (
          <div className="flex flex-col gap-2.5">
            {(mode === 'join' || mode === 'change') && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm" style={{ color: 'var(--g-text-hi)' }}>{mode === 'join' ? 'Joins on' : 'New total'}</label>
                <input type="number" min="0.5" max="12" step="0.5" value={sessions}
                  onChange={e => setSessions(parseFloat(e.target.value) || 0)}
                  className="w-16 text-center" style={dateInput} />
                <span className="text-sm" style={{ color: 'var(--meta)' }}>sessions/wk from</span>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={dateInput} />
              </div>
            )}

            {mode === 'leave' && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm" style={{ color: 'var(--g-text-hi)' }}>Last working day</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={dateInput} />
              </div>
            )}

            {mode === 'temp_leave' && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={reason} onChange={e => setReason(e.target.value)} style={dateInput}>
                    {['maternity', 'paternity', 'sickness', 'sabbatical', 'other'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <span className="text-sm" style={{ color: 'var(--meta)' }}>from</span>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={dateInput} />
                  <span className="text-sm" style={{ color: 'var(--meta)' }}>to</span>
                  <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={dateInput} />
                </div>
                {endsBeforeStart && <div className="text-xs" style={{ color: '#fca5a5' }}>The end date is before the start date.</div>}
              </>
            )}

            <p className="text-[11px]" style={{ color: 'var(--meta)' }}>
              {mode === 'leave' || mode === 'temp_leave'
                ? 'These exact dates are pushed to the buddy board, so cover is arranged for the right days.'
                : 'Sessions step from this date; the graph and totals follow.'}
            </p>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setMode(null)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--meta)' }}>Back</button>
              <button
                disabled={mode === 'temp_leave' && endsBeforeStart}
                onClick={() => {
                  const month = monthKey(startDate);
                  if (mode === 'temp_leave') {
                    onAdd({ ...base, month, toMonth: monthKey(endDate), type: 'temp_leave', reason, startDate, endDate });
                  } else if (mode === 'leave') {
                    onAdd({ ...base, month, type: 'leave', startDate, endDate: startDate });
                  } else {
                    onAdd({ ...base, month, type: mode, sessions, startDate });
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}>Add</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
