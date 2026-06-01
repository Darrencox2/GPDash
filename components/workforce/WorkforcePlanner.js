'use client';
// components/workforce/WorkforcePlanner.js
//
// Workforce planner — interactive session allocator.
//
//   • Role filter      → choose which roles appear in the grid
//   • Grid             → Mon–Fri × AM/PM, each cell holds draggable clinician
//                        chips for whoever is working that session
//   • Activities       → per-cell "+ activity" creates an amber box; drop a
//                        clinician on it to assign (turns green)
//   • Drag & drop      → move clinicians between cells to re-roster
//   • Session tracker  → live count of sessions worked per clinician, against
//                        their contracted total
//   • Anomaly flag     → compares the planned allocation against the live
//                        working_patterns contract (off-contract, missing,
//                        unassigned activity, total mismatch) — banner +
//                        per-cell badge + side list
//
// Contracted baseline is read live from working_patterns (the same grid used
// elsewhere in GPdash), so there is no separate baseline to keep in sync.
// State persists to practice_settings.workforce.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  buildContracted, cloneAllocation, pruneAllocation, detectAnomalies,
  allocatedCount, contractedCount, isIncluded, rolesInTeam, demandModel,
  WF_DAYS, WF_DAY_NAMES, WF_SESSIONS, cellKey,
} from '@/lib/workforce';

const SESSION_LABEL = { am: 'AM', pm: 'PM' };

const ANOM_LABEL = {
  off_contract: 'Off contract',
  missing: 'Contracted but not allocated',
  unassigned_activity: 'Activity unassigned',
  total: 'Sessions ≠ contract',
};

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

  const byId = useMemo(() => {
    const m = {}; for (const c of clinicians) m[c.id] = c; return m;
  }, [clinicians]);

  const [patternById, setPatternById] = useState(null);
  const [includedRoles, setIncludedRoles] = useState(null); // null = all
  const [allocation, setAllocation] = useState(null);
  const [activities, setActivities] = useState([]);
  const [showDemand, setShowDemand] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(null); // cellKey or `act_<id>`
  const dragRef = useRef(null); // { clinId, fromDay, fromSession, fromActivityId }

  const allRoles = useMemo(() => rolesInTeam(clinicians), [clinicians]);

  // ─── Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!practiceId) { setError('No practice selected.'); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      const patternsRes = await supabase.from('working_patterns')
        .select('clinician_id, pattern, clinicians!inner(practice_id)')
        .eq('clinicians.practice_id', practiceId).is('effective_to', null);
      if (cancelled) return;
      if (patternsRes.error) { setError(patternsRes.error.message); setLoading(false); return; }
      const pat = {};
      for (const r of patternsRes.data || []) pat[r.clinician_id] = r.pattern || {};
      setPatternById(pat);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [practiceId, supabase]);

  // Initialise allocation/activities/roles once patterns + clinicians are ready.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current || !patternById || clinicians.length === 0) return;
    initRef.current = true;
    (async () => {
      const { data: row } = await supabase.from('practice_settings').select('workforce')
        .eq('practice_id', practiceId).maybeSingle();
      const wf = row?.workforce || {};
      const validIds = clinicians.map(c => c.id);
      const contracted = buildContracted(clinicians, patternById);
      setIncludedRoles(Array.isArray(wf.includedRoles) ? wf.includedRoles : null);
      setActivities(Array.isArray(wf.activities) ? wf.activities : []);
      if (typeof wf.showDemand === 'boolean') setShowDemand(wf.showDemand);
      setAllocation(wf.allocation ? pruneAllocation(wf.allocation, validIds) : contracted);
    })();
  }, [patternById, clinicians, practiceId, supabase]);

  // ─── Anomalies ─────────────────────────────────────────────────────
  const anomalies = useMemo(() => {
    if (!allocation || !patternById) return { items: [], cellCount: {}, clinMismatch: {} };
    return detectAnomalies({ allocation, patternById, activities, clinicians, includedRoles });
  }, [allocation, patternById, activities, clinicians, includedRoles]);

  // ─── Mutators ──────────────────────────────────────────────────────
  const markDirty = () => setDirty(true);

  const moveToCell = useCallback((clinId, fromDay, fromSession, fromActivityId, toDay, toSession) => {
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      if (fromDay) next[fromDay][fromSession] = next[fromDay][fromSession].filter(id => id !== clinId);
      if (!next[toDay][toSession].includes(clinId)) next[toDay][toSession].push(clinId);
      return next;
    });
    if (fromActivityId) {
      setActivities(prev => prev.map(a => a.id === fromActivityId ? { ...a, assignedClinicianId: null } : a));
    }
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

  const addActivity = (day, session) => {
    setActivities(prev => [...prev, {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      day, session, label: '', assignedClinicianId: null,
    }]);
    markDirty();
  };
  const renameActivity = (id, label) => { setActivities(prev => prev.map(a => a.id === id ? { ...a, label } : a)); markDirty(); };
  const releaseActivity = (id) => { setActivities(prev => prev.map(a => a.id === id ? { ...a, assignedClinicianId: null } : a)); markDirty(); };
  const deleteActivity = (id) => { setActivities(prev => prev.filter(a => a.id !== id)); markDirty(); };

  const toggleRole = (role) => {
    setIncludedRoles(prev => {
      const base = prev == null ? [...allRoles] : [...prev];
      const i = base.indexOf(role);
      if (i >= 0) base.splice(i, 1); else base.push(role);
      return base;
    });
    markDirty();
  };

  const resetToContract = () => {
    setAllocation(buildContracted(clinicians, patternById));
    markDirty();
    toast?.('Allocation reset to contracted pattern', 'success');
  };

  const save = async () => {
    if (!practiceId) return;
    setSaving(true);
    const blob = { includedRoles, allocation, activities, showDemand };
    const { error: err } = await supabase.from('practice_settings')
      .upsert({ practice_id: practiceId, workforce: blob }, { onConflict: 'practice_id' });
    setSaving(false);
    if (err) { toast?.(`Couldn't save: ${err.message}`, 'error'); return; }
    setDirty(false);
    toast?.('Workforce plan saved', 'success');
  };

  // ─── DnD helpers ───────────────────────────────────────────────────
  const onChipDragStart = (clinId, fromDay, fromSession, fromActivityId) => (e) => {
    dragRef.current = { clinId, fromDay, fromSession, fromActivityId: fromActivityId || null };
    try { e.dataTransfer.setData('text/plain', clinId); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  };
  const onCellDrop = (day, session) => (e) => {
    e.preventDefault(); setDragOver(null);
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    moveToCell(d.clinId, d.fromDay, d.fromSession, d.fromActivityId, day, session);
  };
  const onActivityDrop = (activity) => (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null);
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    assignToActivity(d.clinId, d.fromDay, d.fromSession, d.fromActivityId, activity);
  };
  const allow = (key) => (e) => { e.preventDefault(); if (dragOver !== key) setDragOver(key); };

  // ─── Render ────────────────────────────────────────────────────────
  if (loading || !allocation) return <div style={S.card}><p style={S.muted}>{error || 'Loading roster…'}</p></div>;

  const included = clinicians.filter(c => isIncluded(c, includedRoles));
  const includedIds = new Set(included.map(c => c.id));

  const tracker = included.map(c => ({
    c,
    allocated: allocatedCount(allocation, c.id),
    contracted: contractedCount(patternById, c.id),
    activityLabels: activities.filter(a => a.assignedClinicianId === c.id).map(a => a.label || 'Activity'),
  })).sort((a, b) => b.allocated - a.allocated || a.c.name.localeCompare(b.c.name));

  const cleanCount = anomalies.items.length;

  // Demand overlay: per-day demand vs contracted capacity (the contracting target).
  const dm = demandModel({ allocation, includedIds, demandSettings, listSize });
  const ratios = WF_DAYS.map(d => dm.perDay[d].ratio).filter(r => r != null);
  const rMin = ratios.length ? Math.min(...ratios) : 0;
  const rMax = ratios.length ? Math.max(...ratios) : 1;
  const ratioColour = (r) => {
    if (r == null) return '#64748b';
    if (rMax <= rMin) return '#0ea5e9';
    const t = (r - rMin) / (rMax - rMin);
    return t <= 0.34 ? '#10b981' : t <= 0.67 ? '#f59e0b' : '#ef4444';
  };
  const peakDay = WF_DAYS.reduce((a, b) => dm.perDay[b].demand > dm.perDay[a].demand ? b : a, WF_DAYS[0]);
  const stretchedDay = ratios.length
    ? WF_DAYS.reduce((a, b) => ((dm.perDay[b].ratio ?? -1) > (dm.perDay[a].ratio ?? -1) ? b : a), WF_DAYS[0])
    : null;

  const Chip = ({ clinId, day, session, activityId, onContract }) => {
    const c = byId[clinId];
    if (!c) return null;
    const off = onContract === false;
    return (
      <div draggable onDragStart={onChipDragStart(clinId, day, session, activityId)} title={`${c.name}${c.role ? ' · ' + c.role : ''}${off ? ' · off contract' : ''}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 3px', borderRadius: 999, cursor: 'grab',
          background: off ? 'rgba(239,68,68,0.18)' : 'rgba(99,102,241,0.18)',
          border: `1px solid ${off ? '#ef4444' : 'rgba(129,140,248,0.5)'}`, maxWidth: 132,
        }}>
        <span style={{ width: 20, height: 20, borderRadius: 999, background: off ? '#ef4444' : '#6366f1', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(c.name)}</span>
        <span style={{ fontSize: 11, color: off ? '#fecaca' : '#c7d2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name.split(' ')[0]}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#f1f5f9', fontFamily: "'Outfit', sans-serif" }}>Workforce planner</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8', maxWidth: 640, lineHeight: 1.5 }}>
            Drag clinicians across the week to plan sessions and allocate activities. Drift from the contracted working
            pattern is flagged as an anomaly.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={resetToContract} style={S.btnGhost}>Reset to contract</button>
          <button onClick={save} disabled={!dirty || saving} style={{ ...S.btnPrimary, opacity: dirty && !saving ? 1 : 0.45, cursor: dirty && !saving ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Anomaly banner */}
      <div style={{ ...S.card, padding: '10px 14px', borderColor: cleanCount ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)', background: cleanCount ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)' }}>
        <span style={{ fontSize: 13, color: cleanCount ? '#fbbf24' : '#34d399', fontWeight: 500 }}>
          {cleanCount ? `⚠ ${cleanCount} anomal${cleanCount === 1 ? 'y' : 'ies'} vs contracted pattern` : '✓ Allocation matches the contracted pattern'}
        </span>
      </div>

      {/* Role filter */}
      <div style={{ ...S.card, padding: 12 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Include roles</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allRoles.map(role => {
            const on = includedRoles == null || includedRoles.includes(role);
            return (
              <button key={role} onClick={() => toggleRole(role)} style={{
                padding: '5px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${on ? '#818cf8' : 'rgba(255,255,255,0.12)'}`,
                background: on ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                color: on ? '#c7d2fe' : '#64748b',
              }}>{on ? '✓ ' : ''}{role}</button>
            );
          })}
        </div>
      </div>

      {/* Grid + side panel */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ ...S.card, flex: '1 1 560px', minWidth: 320, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => { setShowDemand(v => !v); markDirty(); }} style={{
              padding: '5px 11px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${showDemand ? '#818cf8' : 'rgba(255,255,255,0.12)'}`,
              background: showDemand ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
              color: showDemand ? '#c7d2fe' : '#94a3b8',
            }}>{showDemand ? '✓ ' : ''}Demand overlay</button>
            {showDemand && (
              <span style={{ fontSize: 11, color: '#94a3b8', flex: '1 1 240px', textAlign: 'right' }}>
                Demand peaks {WF_DAY_NAMES[peakDay]} ({dm.perDay[peakDay].demand}/day){stretchedDay ? <>; cover thinnest vs demand on <span style={{ color: ratioColour(dm.perDay[stretchedDay].ratio) }}>{WF_DAY_NAMES[stretchedDay]}</span></> : null}. Number per day is requests per contracted session.
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(5, minmax(120px, 1fr))', gap: 6 }}>
            <div />
            {WF_DAYS.map(day => {
              const info = dm.perDay[day];
              return (
                <div key={day} style={{ textAlign: 'center', paddingBottom: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{WF_DAY_NAMES[day].slice(0, 3)}</div>
                  {showDemand && (
                    <div style={{ fontSize: 10, marginTop: 1 }}>
                      <span style={{ color: '#64748b' }}>{info.demand} req</span>
                      {info.ratio != null && <span style={{ color: ratioColour(info.ratio), marginLeft: 4, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{info.ratio.toFixed(0)}/s</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {WF_SESSIONS.map(session => (
              <FragmentRow key={session}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{SESSION_LABEL[session]}</div>
                {WF_DAYS.map(day => {
                  const key = cellKey(day, session);
                  const all = (allocation[day][session] || []).filter(id => includedIds.has(id));
                  const cellActs = activities.filter(a => a.day === day && a.session === session);
                  const assignedIds = new Set(cellActs.map(a => a.assignedClinicianId).filter(Boolean));
                  const free = all.filter(id => !assignedIds.has(id));
                  const anomN = anomalies.cellCount[key] || 0;
                  const over = dragOver === key;
                  return (
                    <div key={day} onDragOver={allow(key)} onDrop={onCellDrop(day, session)}
                      style={{
                        minHeight: 86, borderRadius: 10, padding: 6, position: 'relative',
                        background: over ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${over ? '#818cf8' : anomN ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
                        display: 'flex', flexDirection: 'column', gap: 4,
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: '#64748b' }}>
                          {all.length}{anomN ? <span style={{ color: '#ef4444', marginLeft: 4 }}>⚠{anomN}</span> : null}
                        </span>
                        <button onClick={() => addActivity(day, session)} title="Add activity" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>+</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {free.map(id => <Chip key={id} clinId={id} day={day} session={session} onContract={patternById[id]?.[day]?.[session] === 'in'} />)}
                      </div>
                      {cellActs.map(a => {
                        const akey = `act_${a.id}`;
                        const aover = dragOver === akey;
                        const assigned = a.assignedClinicianId;
                        return (
                          <div key={a.id} onDragOver={allow(akey)} onDrop={onActivityDrop(a)}
                            style={{
                              borderRadius: 8, padding: 5, border: `1px dashed ${assigned ? '#10b981' : '#f59e0b'}`,
                              background: aover ? 'rgba(99,102,241,0.15)' : assigned ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                              display: 'flex', flexDirection: 'column', gap: 4,
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input value={a.label} placeholder="activity…" onChange={e => renameActivity(a.id, e.target.value)}
                                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: assigned ? '#6ee7b7' : '#fcd34d', fontSize: 10.5, fontFamily: 'inherit', padding: 0, outline: 'none' }} />
                              {assigned && <button onClick={() => releaseActivity(a.id)} title="Release" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: 0 }}>↩</button>}
                              <button onClick={() => deleteActivity(a.id)} title="Delete activity" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: 0 }}>×</button>
                            </div>
                            {assigned ? <Chip clinId={assigned} day={day} session={session} activityId={a.id} onContract={patternById[assigned]?.[day]?.[session] === 'in'} />
                              : <span style={{ fontSize: 9.5, color: '#fbbf24' }}>needs a clinician</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </FragmentRow>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
            {[['On contract', 'rgba(99,102,241,0.6)'], ['Off contract', '#ef4444'], ['Activity unassigned', '#f59e0b'], ['Activity assigned', '#10b981']].map(([l, col]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}><span style={{ width: 11, height: 11, borderRadius: 3, background: col }} />{l}</div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {anomalies.items.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Anomalies ({anomalies.items.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
                {anomalies.items.map((it, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.35 }}>
                    <span style={{ color: it.type === 'unassigned_activity' ? '#fbbf24' : '#f87171' }}>•</span>{' '}
                    {it.type === 'unassigned_activity'
                      ? <>{ANOM_LABEL[it.type]}: {it.label || 'Activity'} ({WF_DAY_NAMES[it.day].slice(0, 3)} {SESSION_LABEL[it.session]})</>
                      : it.type === 'total'
                        ? <>{byId[it.clinicianId]?.name}: {ANOM_LABEL[it.type]} ({it.allocated} vs {it.contracted})</>
                        : <>{byId[it.clinicianId]?.name}: {ANOM_LABEL[it.type]} ({WF_DAY_NAMES[it.day].slice(0, 3)} {SESSION_LABEL[it.session]})</>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={S.card}>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Sessions worked</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
              {tracker.map(({ c, allocated, contracted, activityLabels }) => {
                const mismatch = allocated !== contracted;
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
                    <span style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                      {activityLabels.length > 0 && <span style={{ color: '#6ee7b7', fontSize: 10, marginLeft: 5 }}>{activityLabels.join(', ')}</span>}
                    </span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11.5, color: mismatch ? '#f87171' : '#94a3b8', flexShrink: 0 }}>{allocated}/{contracted}</span>
                  </div>
                );
              })}
              {tracker.length === 0 && <span style={S.muted}>No clinicians in the selected roles.</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ children }) { return <>{children}</>; }

const S = {
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 },
  muted: { fontSize: 13, color: '#94a3b8', margin: 0 },
  btnPrimary: { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
};
