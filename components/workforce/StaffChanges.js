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
import {
  monthKey, monthLabel, addMonths, aprilStart, monthRange,
  derivePeople, totalsByMonth, per1000ByMonth, planSummary,
  suggestedEventsFromWindDowns, eventTransitionKey, monthEndDate,
} from '@/lib/staff-plan';

const ROLE_FILTER_KEY = 'gpdash-staff-changes-roles';
const EV_STYLE = {
  join:       { bg: 'rgba(52,211,153,0.16)', bd: 'rgba(52,211,153,0.5)', fg: '#34d399' },
  leave:      { bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.5)', fg: '#fca5a5' },
  temp_leave: { bg: 'rgba(245,158,11,0.13)', bd: 'rgba(245,158,11,0.45)', fg: '#fbbf24' },
  change:     { bg: 'rgba(129,140,248,0.15)', bd: 'rgba(129,140,248,0.5)', fg: '#a5b4fc' },
};

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
  const [editor, setEditor] = useState(null);          // { personRef, month }
  const [addOpen, setAddOpen] = useState(false);
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
  const suggestions = useMemo(() => suggestedEventsFromWindDowns(realPeople, plan.events), [realPeople, plan.events]);

  const savePlan = (next) => saveData({ ...data, staffPlan: { ...next, savedAt: new Date().toISOString() } });
  const addEvent = (ev, opts = {}) => {
    const event = { id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...ev };
    let payload = { ...data, staffPlan: { ...plan, events: [...(plan.events || []), event], savedAt: new Date().toISOString() } };
    // Real person going away or leaving? Route through the same transition
    // the buddy board uses, so wind-down + absence + audit stay in step.
    const tKey = eventTransitionKey(event);
    const isReal = realPeople.some(p => p.id === event.personRef);
    if (tKey && isReal && !opts.skipSync) {
      const untilDate = event.type === 'temp_leave' ? monthEndDate(event.toMonth || event.month) : monthEndDate(event.month);
      const startDate = `${event.month}-01`;
      try { payload = applyTransition(payload, event.personRef, tKey, { untilDate, startDate, by: data?._v4?.linkedClinicianName || data?._v4?.userEmail || null }); }
      catch { /* the plan event still records even if the sync cannot */ }
    }
    saveData(payload);
    setEditor(null);
  };
  const removeEvent = (id) => savePlan({ ...plan, events: (plan.events || []).filter(e => e.id !== id) });
  const addPlannedPerson = () => {
    if (!newPerson.name.trim()) return;
    const id = `plan-${Date.now()}`;
    savePlan({ ...plan, plannedPeople: [...(plan.plannedPeople || []), { id, name: newPerson.name.trim(), role: newPerson.role, group: 'gp' }] });
    setAddOpen(false); setNewPerson({ name: '', role: 'Salaried GP' });
  };
  const removePlannedPerson = (id) => savePlan({
    ...plan,
    plannedPeople: (plan.plannedPeople || []).filter(p => p.id !== id),
    events: (plan.events || []).filter(e => e.personRef !== id),
  });

  // ── chart geometry ──────────────────────────────────────────────────
  const series = per1000 ? months.map(mk => perK[mk]) : months.map(mk => totals[mk]);
  const nums = series.filter(v => v != null);
  const lo = Math.min(...nums, 0) === 0 && Math.min(...nums) > 20 ? Math.min(...nums) - 5 : Math.max(0, Math.min(...nums) - 5);
  const hi = Math.max(...nums, 1) + 5;
  const W = 1000, H = 150, PL = 36, PR = 26, PT = 14, PB = 20;
  const X = (i) => PL + (W - PL - PR) * i / (months.length - 1);
  const Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo || 1));
  let path = '';
  series.forEach((v, i) => {
    if (v == null) return;
    path += path === '' ? `M ${X(i)} ${Y(v)}` : ` L ${X(i)} ${Y(series[i - 1] ?? v)} L ${X(i)} ${Y(v)}`;
  });
  const area = path ? `${path} L ${X(months.length - 1)} ${Y(lo)} L ${X(0)} ${Y(lo)} Z` : '';
  const eventDots = (plan.events || [])
    .filter(e => months.includes(e.month))
    .map(e => ({ i: months.indexOf(e.month), v: series[months.indexOf(e.month)], type: e.type }))
    .filter(d => d.v != null);

  const cellEvents = (personRef, mk) => (plan.events || []).filter(e => e.personRef === personRef && (e.month === mk || (e.type === 'temp_leave' && mk > e.month && mk <= (e.toMonth || e.month))));

  const S = { chip: (t) => ({ ...{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 5, whiteSpace: 'nowrap' }, background: EV_STYLE[t].bg, border: `1px solid ${EV_STYLE[t].bd}`, color: EV_STYLE[t].fg }) };

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

      {/* summary chips + chart */}
      <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--g-panel-2)', border: '1px solid var(--g-border)' }}>
        <div className="flex gap-2.5 flex-wrap mb-2">
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
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Total weekly sessions across the year">
          <defs><linearGradient id="scg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(99,102,241,0.35)" /><stop offset="1" stopColor="rgba(99,102,241,0.02)" /></linearGradient></defs>
          {area && <path d={area} fill="url(#scg)" />}
          {path && <path d={path} fill="none" stroke="#818cf8" strokeWidth="2" />}
          {months.includes(todayMk) && (
            <line x1={X(months.indexOf(todayMk))} x2={X(months.indexOf(todayMk))} y1={PT} y2={H - PB} stroke="rgba(52,211,153,0.5)" strokeDasharray="3 3" />
          )}
          {eventDots.map((d, i) => <circle key={i} cx={X(d.i)} cy={Y(d.v)} r="3.5" fill={EV_STYLE[d.type].fg} stroke="var(--g-ink)" strokeWidth="1.5" />)}
          {months.map((mk, i) => (
            <text key={mk} x={X(i)} y={H - 5} fontSize="9" fill={mk === todayMk ? '#34d399' : 'var(--meta)'} fontFamily="var(--font-mono)" textAnchor="middle">
              {monthLabel(mk)}{mk.endsWith('-04') ? ` ${mk.slice(2, 4)}` : ''}
            </text>
          ))}
        </svg>
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
            <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, 1fr)' }}>
              <div className="px-3 py-1.5 text-[11px] uppercase" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em' }}>Staff · sess/wk</div>
              {months.map(mk => (
                <div key={mk} className="text-center py-1.5 text-[11px]" style={{ borderLeft: '1px solid var(--g-border)', fontFamily: 'var(--font-mono)', color: mk === todayMk ? '#34d399' : 'var(--meta)' }}>{monthLabel(mk)}</div>
              ))}
            </div>
            {people.map(p => {
              const gone = perPerson[p.id]?.[months[months.length - 1]] === 0 && (plan.events || []).some(e => e.personRef === p.id && e.type === 'leave');
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, 1fr)', borderTop: p.kind === 'planned' ? '1px dashed var(--g-border-2)' : '1px solid var(--g-border)' }}>
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
                        className="min-h-[26px] flex items-center justify-center px-0.5"
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
              <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, 1fr)', borderTop: '1px solid var(--g-border)' }}>
                <div className="px-3 py-1.5">
                  <button onClick={() => setAddOpen(true)} className="text-xs" style={{ color: 'var(--link)' }}>＋ Add person…</button>
                </div>
                {months.map(mk => <div key={mk} style={{ borderLeft: '1px solid var(--g-border)' }} />)}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(13, 1fr)', borderTop: '2px solid var(--g-border-2)', background: 'rgba(99,102,241,0.05)' }}>
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

      {/* cell editor */}
      {editor && (
        <CellEditor editor={editor} onClose={() => setEditor(null)} onAdd={addEvent} onRemove={removeEvent}
          existing={cellEvents(editor.personRef, editor.month).filter(e => e.month === editor.month)} months={months} />
      )}
      {/* add person */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setAddOpen(false)}>
          <div className="rounded-xl p-4 w-80" style={{ background: 'var(--g-surface-2)', border: '1px solid var(--g-border-2)' }} onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--g-text-hi)' }}>Add a planned person</div>
            <input autoFocus value={newPerson.name} onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Dr Locum, New salaried GP?" className="w-full rounded-md px-2.5 py-1.5 text-sm mb-2"
              style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }} />
            <input value={newPerson.role} onChange={e => setNewPerson(p => ({ ...p, role: e.target.value }))}
              placeholder="Role" className="w-full rounded-md px-2.5 py-1.5 text-sm mb-3"
              style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAddOpen(false)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--meta)' }}>Cancel</button>
              <button onClick={addPlannedPerson} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>Add</button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--meta)' }}>Planned people are drawn italic. Give them a join event to add their sessions.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CellEditor({ editor, onClose, onAdd, onRemove, existing, months }) {
  const [mode, setMode] = useState(null);
  const [sessions, setSessions] = useState(4);
  const [toMonth, setToMonth] = useState(addMonths(editor.month, 2));
  const [reason, setReason] = useState('maternity');
  const base = { personRef: editor.personRef, month: editor.month };
  const pretty = `${monthLabel(editor.month)} ${editor.month.slice(0, 4)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-4 w-96" style={{ background: 'var(--g-surface-2)', border: '1px solid var(--g-border-2)' }} onClick={e => e.stopPropagation()}>
        <div className="text-[11px] mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--meta)' }}>{editor.personName.toUpperCase()} · {pretty.toUpperCase()}</div>
        {existing.length > 0 && (
          <div className="mb-3">
            {existing.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-sm py-1" style={{ color: 'var(--g-text-hi)' }}>
                <span>{e.type === 'temp_leave' ? `Away (${e.reason || '—'}) until ${monthLabel(e.toMonth || e.month)}` : e.type === 'change' ? `Sessions → ${e.sessions}` : e.type === 'join' ? `Joins on ${e.sessions} sessions` : 'Leaves'}</span>
                <button onClick={() => { onRemove(e.id); onClose(); }} className="ml-auto text-xs" style={{ color: '#fca5a5' }}>remove</button>
              </div>
            ))}
          </div>
        )}
        {!mode && (
          <div className="flex flex-col gap-1.5">
            {[
              ['join', '▶ Joins', 'sets sessions from this month'],
              ['leave', '■ Leaves', 'sessions end this month'],
              ['temp_leave', '⏸ Temporary leave', 'maternity / sick / sabbatical'],
              ['change', '± Change sessions', 'new weekly total from this month'],
            ].map(([m, label, hint]) => (
              <button key={m} onClick={() => (m === 'leave' ? onAdd({ ...base, type: 'leave' }) : setMode(m))}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>
                {label} <span style={{ color: 'var(--meta)' }}>— {hint}</span>
              </button>
            ))}
          </div>
        )}
        {(mode === 'join' || mode === 'change') && (
          <div className="flex items-center gap-2">
            <label className="text-sm" style={{ color: 'var(--g-text-hi)' }}>{mode === 'join' ? 'Joins on' : 'New total'}</label>
            <input type="number" min="0.5" max="12" step="0.5" value={sessions} onChange={e => setSessions(parseFloat(e.target.value) || 0)}
              className="w-16 text-center rounded-md py-1 text-sm" style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }} />
            <span className="text-sm" style={{ color: 'var(--meta)' }}>sessions/wk</span>
            <button onClick={() => onAdd({ ...base, type: mode, sessions })} className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>Add</button>
          </div>
        )}
        {mode === 'temp_leave' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--g-text-hi)' }}>
              Until
              <select value={toMonth} onChange={e => setToMonth(e.target.value)} className="rounded-md py-1 px-2 text-sm" style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>
                {monthRange(editor.month, 18).map(mk => <option key={mk} value={mk}>{monthLabel(mk)} {mk.slice(0, 4)}</option>)}
              </select>
              <select value={reason} onChange={e => setReason(e.target.value)} className="rounded-md py-1 px-2 text-sm" style={{ background: 'var(--g-field)', border: '1px solid var(--g-border-2)', color: 'var(--g-text-hi)' }}>
                {['maternity', 'sick', 'sabbatical', 'other'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button onClick={() => onAdd({ ...base, type: 'temp_leave', toMonth, reason })} className="self-end px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}
