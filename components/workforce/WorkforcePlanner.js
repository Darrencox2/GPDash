'use client';
// components/workforce/WorkforcePlanner.js
//
// Workforce planner — interactive session allocator.
//
//   • Drag clinician chips across a Mon–Fri × AM/PM grid to plan sessions.
//   • Activities sit at the top of each cell; drop a clinician on one to
//     assign them (amber → green).
//   • Each session shows a live summary (working / general / demand / ratio)
//     and its header is colour-coded by the demand ratio.
//   • Role filter, session tracker and anomaly list live in floating popouts
//     so the grid has room to breathe.
//   • Everything auto-saves to practice_settings.workforce.
//   • Anomalies compare the planned allocation against the live contracted
//     working pattern (the same grid used elsewhere in GPdash).

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  buildContracted, cloneAllocation, pruneAllocation, detectAnomalies,
  allocatedCount, contractedCount, isIncluded, rolesInTeam, typicalWeekdayDemand,
  WF_DAYS, WF_DAY_NAMES, WF_SESSIONS, cellKey,
} from '@/lib/workforce';

const SESSION_LABEL = { am: 'AM', pm: 'PM' };
const ANOM_LABEL = {
  off_contract: 'Off contract',
  missing: 'Contracted but not allocated',
  unassigned_activity: 'Activity unassigned',
  total: 'Sessions ≠ contract',
};

// Demand-ratio colour bands (requests per general clinician per session).
// Tunable — these are sensible starting points.
const RATIO_TIGHT = 20, RATIO_SHORT = 28, RATIO_OVER = 12;
const RC = {
  blue:  { solid: '#0ea5e9', tint: 'rgba(14,165,233,0.16)', text: '#7dd3fc', label: 'Overstaffed' },
  green: { solid: '#10b981', tint: 'rgba(16,185,129,0.16)', text: '#6ee7b7', label: 'Good' },
  amber: { solid: '#f59e0b', tint: 'rgba(245,158,11,0.16)', text: '#fcd34d', label: 'Tight' },
  red:   { solid: '#ef4444', tint: 'rgba(239,68,68,0.18)', text: '#fca5a5', label: 'Short' },
};
function ratioColour(general, demandHalf) {
  if (general <= 0) return RC.red;
  const r = demandHalf / general;
  if (r < RATIO_OVER) return RC.blue;
  if (r <= RATIO_TIGHT) return RC.green;
  if (r <= RATIO_SHORT) return RC.amber;
  return RC.red;
}

function initials(name) {
  if (!name) return '??';
  const parts = String(name).replace(/\(.*?\)/g, '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function WorkforcePlanner({ data, toast }) {
  const supabase = useMemo(() => createClient(), []);
  const v4 = data?._v4 || {};
  const practiceId = v4.practiceId;
  const listSize = v4.practiceListSize;
  const demandSettings = v4.demandSettings;

  const clinicians = useMemo(() => {
    const raw = data?.clinicians;
    const arr = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
    return arr.filter(c => c && c.status !== 'left');
  }, [data?.clinicians]);
  const byId = useMemo(() => { const m = {}; for (const c of clinicians) m[c.id] = c; return m; }, [clinicians]);
  const allRoles = useMemo(() => rolesInTeam(clinicians), [clinicians]);
  const demand = useMemo(() => typicalWeekdayDemand(demandSettings, listSize), [demandSettings, listSize]);

  const [patternById, setPatternById] = useState(null);
  const [includedRoles, setIncludedRoles] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // 'saved'|'saving'|'error'
  const [dragOver, setDragOver] = useState(null);
  const [panel, setPanel] = useState({ roles: false, sessions: false, anomalies: false });
  const dragRef = useRef(null);

  // ─── Load working patterns ─────────────────────────────────────────
  useEffect(() => {
    if (!practiceId) { setError('No practice selected.'); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      const res = await supabase.from('working_patterns')
        .select('clinician_id, pattern, clinicians!inner(practice_id)')
        .eq('clinicians.practice_id', practiceId).is('effective_to', null);
      if (cancelled) return;
      if (res.error) { setError(res.error.message); setLoading(false); return; }
      const pat = {};
      for (const r of res.data || []) pat[r.clinician_id] = r.pattern || {};
      setPatternById(pat); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [practiceId, supabase]);

  // ─── Initialise from saved config (once) ───────────────────────────
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current || !patternById || clinicians.length === 0) return;
    initRef.current = true;
    (async () => {
      const { data: row } = await supabase.from('practice_settings').select('workforce')
        .eq('practice_id', practiceId).maybeSingle();
      const wf = row?.workforce || {};
      const validIds = clinicians.map(c => c.id);
      setIncludedRoles(Array.isArray(wf.includedRoles) ? wf.includedRoles : null);
      setActivities(Array.isArray(wf.activities) ? wf.activities : []);
      setAllocation(wf.allocation ? pruneAllocation(wf.allocation, validIds) : buildContracted(clinicians, patternById));
    })();
  }, [patternById, clinicians, practiceId, supabase]);

  // ─── Anomalies ─────────────────────────────────────────────────────
  const anomalies = useMemo(() => {
    if (!allocation || !patternById) return { items: [], cellCount: {}, clinMismatch: {} };
    return detectAnomalies({ allocation, patternById, activities, clinicians, includedRoles });
  }, [allocation, patternById, activities, clinicians, includedRoles]);

  // ─── Mutators ──────────────────────────────────────────────────────
  const markDirty = () => { setDirty(true); setSaveState('saving'); };

  const moveToCell = useCallback((clinId, fromDay, fromSession, fromActivityId, toDay, toSession) => {
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      if (fromDay) next[fromDay][fromSession] = next[fromDay][fromSession].filter(id => id !== clinId);
      if (!next[toDay][toSession].includes(clinId)) next[toDay][toSession].push(clinId);
      return next;
    });
    if (fromActivityId) setActivities(prev => prev.map(a => a.id === fromActivityId ? { ...a, assignedClinicianId: null } : a));
    markDirty();
  }, []);

  const assignToActivity = useCallback((clinId, fromDay, fromSession, fromActivityId, activity) => {
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      if (fromDay && !(fromDay === activity.day && fromSession === activity.session)) {
        next[fromDay][fromSession] = next[fromDay][fromSession].filter(id => id !== clinId);
      }
      if (!next[activity.day][activity.session].includes(clinId)) next[activity.day][activity.session].push(clinId);
      return next;
    });
    setActivities(prev => prev.map(a => {
      if (a.id === activity.id) return { ...a, assignedClinicianId: clinId };
      if (a.id === fromActivityId) return { ...a, assignedClinicianId: null };
      return a;
    }));
    markDirty();
  }, []);

  const addActivity = (day, session) => { setActivities(prev => [...prev, { id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, day, session, label: '', assignedClinicianId: null }]); markDirty(); };
  const renameActivity = (id, label) => { setActivities(prev => prev.map(a => a.id === id ? { ...a, label } : a)); markDirty(); };
  const releaseActivity = (id) => { setActivities(prev => prev.map(a => a.id === id ? { ...a, assignedClinicianId: null } : a)); markDirty(); };
  const deleteActivity = (id) => { setActivities(prev => prev.filter(a => a.id !== id)); markDirty(); };

  const toggleRole = (role) => {
    setIncludedRoles(prev => {
      const base = prev == null ? [...allRoles] : [...prev];
      const i = base.indexOf(role); if (i >= 0) base.splice(i, 1); else base.push(role);
      return base;
    });
    markDirty();
  };

  const resetToContract = () => { setAllocation(buildContracted(clinicians, patternById)); markDirty(); toast?.('Allocation reset to contracted pattern', 'success'); };

  // ─── Auto-save (debounced) ─────────────────────────────────────────
  const save = useCallback(async () => {
    if (!practiceId || !allocation) return;
    const blob = { includedRoles, allocation, activities };
    const { error: err } = await supabase.from('practice_settings')
      .upsert({ practice_id: practiceId, workforce: blob }, { onConflict: 'practice_id' });
    if (err) { setSaveState('error'); toast?.(`Couldn't save: ${err.message}`, 'error'); return; }
    setSaveState('saved'); setDirty(false);
  }, [practiceId, includedRoles, allocation, activities, supabase, toast]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { save(); }, 700);
    return () => clearTimeout(t);
  }, [dirty, includedRoles, allocation, activities, save]);

  // ─── DnD ───────────────────────────────────────────────────────────
  const onChipDragStart = (clinId, fromDay, fromSession, fromActivityId) => (e) => {
    dragRef.current = { clinId, fromDay, fromSession, fromActivityId: fromActivityId || null };
    try { e.dataTransfer.setData('text/plain', clinId); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  };
  const onCellDrop = (day, session) => (e) => { e.preventDefault(); setDragOver(null); const d = dragRef.current; dragRef.current = null; if (d) moveToCell(d.clinId, d.fromDay, d.fromSession, d.fromActivityId, day, session); };
  const onActivityDrop = (activity) => (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(null); const d = dragRef.current; dragRef.current = null; if (d) assignToActivity(d.clinId, d.fromDay, d.fromSession, d.fromActivityId, activity); };
  const allow = (key) => (e) => { e.preventDefault(); if (dragOver !== key) setDragOver(key); };

  // ─── Render ────────────────────────────────────────────────────────
  if (loading || !allocation) return <div style={S.card}><p style={S.muted}>{error || 'Loading roster…'}</p></div>;

  const included = clinicians.filter(c => isIncluded(c, includedRoles));
  const includedIds = new Set(included.map(c => c.id));
  const tracker = included.map(c => ({
    c, allocated: allocatedCount(allocation, c.id), contracted: contractedCount(patternById, c.id),
    activityLabels: activities.filter(a => a.assignedClinicianId === c.id).map(a => a.label || 'Activity'),
  })).sort((a, b) => b.allocated - a.allocated || a.c.name.localeCompare(b.c.name));
  const anomCount = anomalies.items.length;
  const togglePanel = (k) => setPanel(p => ({ ...p, [k]: !p[k] }));

  const Chip = ({ clinId, day, session, activityId, onContract }) => {
    const c = byId[clinId]; if (!c) return null;
    const off = onContract === false;
    return (
      <div draggable onDragStart={onChipDragStart(clinId, day, session, activityId)} title={`${c.name}${c.role ? ' · ' + c.role : ''}${off ? ' · off contract' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 11px 4px 4px', borderRadius: 999, cursor: 'grab',
          background: off ? 'rgba(239,68,68,0.18)' : 'rgba(99,102,241,0.18)', border: `1px solid ${off ? '#ef4444' : 'rgba(129,140,248,0.5)'}`, maxWidth: 170 }}>
        <span style={{ width: 28, height: 28, borderRadius: 999, background: off ? '#ef4444' : '#6366f1', color: '#fff', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(c.name)}</span>
        <span style={{ fontSize: 13.5, color: off ? '#fecaca' : '#c7d2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name.split(' ')[0]}</span>
      </div>
    );
  };

  const tabBtn = (on) => ({ ...S.btnGhost, background: on ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? '#818cf8' : 'rgba(255,255,255,0.12)'}`, color: on ? '#c7d2fe' : '#e2e8f0' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 600, color: '#f1f5f9', fontFamily: "'Outfit', sans-serif" }}>Workforce planner</h2>
          <p style={{ margin: '6px 0 0', fontSize: 15, color: '#94a3b8', maxWidth: 680, lineHeight: 1.55 }}>
            Drag clinicians across the week to plan sessions and allocate activities. Each session is colour-coded by how
            its demand compares to the clinicians left for general work.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: saveState === 'error' ? '#f87171' : saveState === 'saving' ? '#fbbf24' : '#34d399', minWidth: 58 }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : '✓ Saved'}
          </span>
          <button onClick={() => togglePanel('roles')} style={tabBtn(panel.roles)}>Roles</button>
          <button onClick={() => togglePanel('sessions')} style={tabBtn(panel.sessions)}>Sessions</button>
          <button onClick={() => togglePanel('anomalies')} style={tabBtn(panel.anomalies)}>Anomalies{anomCount ? ` (${anomCount})` : ''}</button>
          <button onClick={resetToContract} style={S.btnGhost}>Reset to contract</button>
        </div>
      </div>

      {/* Anomaly banner */}
      <div style={{ ...S.card, padding: '10px 14px', borderColor: anomCount ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)', background: anomCount ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)' }}>
        <span style={{ fontSize: 15.5, color: anomCount ? '#fbbf24' : '#34d399', fontWeight: 500 }}>
          {anomCount ? `⚠ ${anomCount} anomal${anomCount === 1 ? 'y' : 'ies'} vs contracted pattern` : '✓ Allocation matches the contracted pattern'}
        </span>
      </div>

      {/* Grid (full width) */}
      <div style={{ ...S.card, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, minmax(170px, 1fr))', gap: 9 }}>
          <div />
          {WF_DAYS.map(day => (
            <div key={day} style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#cbd5e1', paddingBottom: 4 }}>
              {WF_DAY_NAMES[day].slice(0, 3)}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b', marginLeft: 6 }}>~{demand[day] || 0}/day</span>
            </div>
          ))}
          {WF_SESSIONS.map(session => (
            <FragmentRow key={session}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>{SESSION_LABEL[session]}</div>
              {WF_DAYS.map(day => {
                const key = cellKey(day, session);
                const all = (allocation[day][session] || []).filter(id => includedIds.has(id));
                const cellActs = activities.filter(a => a.day === day && a.session === session);
                const assignedIds = new Set(cellActs.map(a => a.assignedClinicianId).filter(Boolean));
                const free = all.filter(id => !assignedIds.has(id));
                const anomN = anomalies.cellCount[key] || 0;
                const over = dragOver === key;
                const demandHalf = Math.round((demand[day] || 0) / 2);
                const ratio = free.length > 0 ? demandHalf / free.length : null;
                const rc = ratioColour(free.length, demandHalf);
                return (
                  <div key={day} onDragOver={allow(key)} onDrop={onCellDrop(day, session)}
                    style={{ minHeight: 150, borderRadius: 12, position: 'relative', overflow: 'hidden',
                      background: over ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${over ? '#818cf8' : anomN ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
                      display: 'flex', flexDirection: 'column' }}>
                    {/* coloured header strip */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: rc.tint, borderBottom: `2px solid ${rc.solid}` }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: rc.text }}>{rc.label}{anomN ? <span style={{ color: '#ef4444', marginLeft: 5 }}>⚠{anomN}</span> : null}</span>
                      <button onClick={() => addActivity(day, session)} title="Add activity" style={{ background: 'none', border: 'none', color: rc.text, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}>+</button>
                    </div>
                    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      {/* activities at top */}
                      {cellActs.map(a => {
                        const akey = `act_${a.id}`; const aover = dragOver === akey; const assigned = a.assignedClinicianId;
                        return (
                          <div key={a.id} onDragOver={allow(akey)} onDrop={onActivityDrop(a)}
                            style={{ borderRadius: 9, padding: 8, border: `1px dashed ${assigned ? '#10b981' : '#f59e0b'}`,
                              background: aover ? 'rgba(99,102,241,0.15)' : assigned ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                              display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input value={a.label} placeholder="activity…" onChange={e => renameActivity(a.id, e.target.value)}
                                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: assigned ? '#6ee7b7' : '#fcd34d', fontSize: 13, fontFamily: 'inherit', padding: 0, outline: 'none' }} />
                              {assigned && <button onClick={() => releaseActivity(a.id)} title="Release" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: 0 }}>↩</button>}
                              <button onClick={() => deleteActivity(a.id)} title="Delete activity" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 15, padding: 0 }}>×</button>
                            </div>
                            {assigned ? <Chip clinId={assigned} day={day} session={session} activityId={a.id} onContract={patternById[assigned]?.[day]?.[session] === 'in'} />
                              : <span style={{ fontSize: 12, color: '#fbbf24' }}>needs a clinician</span>}
                          </div>
                        );
                      })}
                      {/* general work chips */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {free.map(id => <Chip key={id} clinId={id} day={day} session={session} onContract={patternById[id]?.[day]?.[session] === 'in'} />)}
                      </div>
                      {/* summary */}
                      <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 11.5, color: '#94a3b8', fontFamily: "'Space Mono', monospace", borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {all.length} working · {free.length} general · demand ~{demandHalf} · ratio {ratio != null ? ratio.toFixed(1) : '–'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </FragmentRow>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          {[['Overstaffed', RC.blue.solid], ['Good', RC.green.solid], ['Tight', RC.amber.solid], ['Short', RC.red.solid]].map(([l, col]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#94a3b8' }}><span style={{ width: 14, height: 14, borderRadius: 4, background: col }} />{l}</div>
          ))}
        </div>
      </div>

      {/* Floating popouts */}
      {(panel.roles || panel.sessions || panel.anomalies) && (
        <div style={{ position: 'fixed', top: 90, right: 24, width: 312, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 60 }}>
          {panel.roles && (
            <Popout title="Include roles" onClose={() => togglePanel('roles')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allRoles.map(role => {
                  const on = includedRoles == null || includedRoles.includes(role);
                  return (
                    <button key={role} onClick={() => toggleRole(role)} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? '#818cf8' : 'rgba(255,255,255,0.12)'}`, background: on ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)', color: on ? '#c7d2fe' : '#64748b' }}>{on ? '✓ ' : ''}{role}</button>
                  );
                })}
              </div>
            </Popout>
          )}
          {panel.sessions && (
            <Popout title="Sessions worked" onClose={() => togglePanel('sessions')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tracker.map(({ c, allocated, contracted, activityLabels }) => {
                  const mismatch = allocated !== contracted;
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
                      <span style={{ fontSize: 14, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}{activityLabels.length > 0 && <span style={{ color: '#6ee7b7', fontSize: 12, marginLeft: 6 }}>{activityLabels.join(', ')}</span>}
                      </span>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13.5, color: mismatch ? '#f87171' : '#94a3b8', flexShrink: 0 }}>{allocated}/{contracted}</span>
                    </div>
                  );
                })}
                {tracker.length === 0 && <span style={S.muted}>No clinicians in the selected roles.</span>}
              </div>
            </Popout>
          )}
          {panel.anomalies && (
            <Popout title={`Anomalies (${anomCount})`} onClose={() => togglePanel('anomalies')}>
              {anomCount === 0 ? <span style={S.muted}>No anomalies — allocation matches the contract.</span> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {anomalies.items.map((it, i) => (
                    <div key={i} style={{ fontSize: 13.5, color: '#cbd5e1', lineHeight: 1.4 }}>
                      <span style={{ color: it.type === 'unassigned_activity' ? '#fbbf24' : '#f87171' }}>•</span>{' '}
                      {it.type === 'unassigned_activity' ? <>{ANOM_LABEL[it.type]}: {it.label || 'Activity'} ({WF_DAY_NAMES[it.day].slice(0, 3)} {SESSION_LABEL[it.session]})</>
                        : it.type === 'total' ? <>{byId[it.clinicianId]?.name}: {ANOM_LABEL[it.type]} ({it.allocated} vs {it.contracted})</>
                          : <>{byId[it.clinicianId]?.name}: {ANOM_LABEL[it.type]} ({WF_DAY_NAMES[it.day].slice(0, 3)} {SESSION_LABEL[it.session]})</>}
                    </div>
                  ))}
                </div>
              )}
            </Popout>
          )}
        </div>
      )}
    </div>
  );
}

function FragmentRow({ children }) { return <>{children}</>; }

function Popout({ title, onClose, children }) {
  return (
    <div style={{ ...S.card, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: 'rgba(20,28,46,0.97)', backdropFilter: 'blur(8px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      {children}
    </div>
  );
}

const S = {
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 },
  muted: { fontSize: 13, color: '#94a3b8', margin: 0 },
  btnGhost: { background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' },
};
