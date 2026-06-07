'use client';
// components/workforce/WorkforcePlanner.js
//
// Workforce planner — interactive session allocator.
//
//   • Drag clinicians across a Mon–Fri × AM/PM grid (mouse or touch).
//   • Activities sit at the top of each cell (Style 3 cards); each has a
//     duration (½ / 1 session / full day) and can repeat every week or on
//     alternate weeks (A / B). Click one to edit.
//   • Option-C session summary: three metric cards (working / general /
//     demand) relatively shaded across the week, plus a ratio-coloured footer.
//   • Clinicians popout doubles as a bench (drag on/off the grid), a session
//     tally, a working-days viewer, and staff add/remove (planner-only
//     overlay that never touches the live records, with a divergence note).
//   • Editable ratio thresholds + role filter in Settings.
//   • Totals strip under the grid. Everything auto-saves.

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  buildContracted, cloneAllocation, pruneAllocation, detectAnomalies,
  allocatedCount, contractedCount, isIncluded, rolesInTeam, typicalWeekdayDemand,
  activityFraction, activityHitsSession, activityInWeek,
  WF_DAYS, WF_DAY_NAMES, WF_SESSIONS, cellKey,
} from '@/lib/workforce';

const SESSION_LABEL = { am: 'AM', pm: 'PM' };
const DEFAULT_THRESHOLDS = { over: 12, tight: 20, short: 28 };
const ANOM_LABEL = { off_contract: 'Off contract', missing: 'Contracted but not allocated', unassigned_activity: 'Activity unassigned', total: 'Sessions ≠ contract' };

const RC = {
  blue:  { solid: '#0ea5e9', tint: 'rgba(14,165,233,0.16)', text: '#7dd3fc', label: 'Overstaffed' },
  green: { solid: '#10b981', tint: 'rgba(16,185,129,0.16)', text: '#6ee7b7', label: 'Good' },
  amber: { solid: '#f59e0b', tint: 'rgba(245,158,11,0.16)', text: '#fcd34d', label: 'Tight' },
  red:   { solid: '#ef4444', tint: 'rgba(239,68,68,0.18)', text: '#fca5a5', label: 'Short' },
};
function ratioColour(general, demandHalf, th) {
  if (general <= 0) return RC.red;
  const r = demandHalf / general;
  if (r < th.over) return RC.blue;
  if (r <= th.tight) return RC.green;
  if (r <= th.short) return RC.amber;
  return RC.red;
}
// Relative shade across the week: t=0 → red, 0.5 → amber, 1 → green.
function scaleTint(t) {
  if (t == null || Number.isNaN(t)) return 'var(--surface)';
  const stops = [[239, 68, 68], [245, 158, 11], [16, 185, 129]];
  const seg = t <= 0.5 ? 0 : 1; const lt = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = stops[seg], b = stops[seg + 1];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * lt));
  return `rgba(${c[0]},${c[1]},${c[2]},0.42)`;
}
function initials(name) {
  if (!name) return '??';
  const p = String(name).replace(/\(.*?\)/g, '').trim().split(/\s+/);
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function patternEmpty(pat) {
  for (const d of WF_DAYS) for (const s of WF_SESSIONS) if (pat?.[d]?.[s] === 'in') return false;
  return true;
}
const fmt = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
const CURRENT_ID = 'sc_current';
const COMMON_ROLES = ['GP', 'GP Partner', 'Salaried GP', 'GP Registrar', 'ANP', 'Nurse', 'Practice Nurse', 'Pharmacist', 'Paramedic', 'Physician Associate', 'HCA', 'Other'];
function normalizeActivities(arr) {
  return (Array.isArray(arr) ? arr : []).map(a => ({ duration: 'one', week: 'all', assignedClinicianId: null, ...a, week: a.week || 'all', duration: a.duration || 'one' }));
}
function healAlloc(alloc, acts) {
  for (const a of acts || []) {
    if (!a.assignedClinicianId) continue;
    const occ = a.duration === 'fullday' ? ['am', 'pm'] : [a.session];
    for (const s of occ) if (alloc?.[a.day] && !alloc[a.day][s].includes(a.assignedClinicianId)) alloc[a.day][s].push(a.assignedClinicianId);
  }
  return alloc;
}
// Count every clinician-session placed on the grid (a full-day activity person counts in both
// AM and PM since they occupy both), excluding any removed/invalid ids. Activity assignees are
// included because they sit in the allocation like anyone else.
function totalSessions(data, realClinicians) {
  if (!data?.allocation) return 0;
  const removed = new Set(data.removedIds || []);
  const validReal = new Set(realClinicians.filter(c => !removed.has(c.id)).map(c => c.id));
  const added = new Set((data.addedStaff || []).map(a => a.id));
  const ok = (id) => validReal.has(id) || added.has(id);
  let n = 0;
  for (const day of WF_DAYS) for (const s of WF_SESSIONS) n += (data.allocation?.[day]?.[s] || []).filter(ok).length;
  return n;
}

export default function WorkforcePlanner({ data, toast }) {
  const supabase = useMemo(() => createClient(), []);
  const v4 = data?._v4 || {};
  const practiceId = v4.practiceId;
  const listSize = v4.practiceListSize;
  const demandSettings = v4.demandSettings;

  const realClinicians = useMemo(() => {
    const raw = data?.clinicians;
    const arr = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
    return arr.filter(c => c && c.status !== 'left');
  }, [data?.clinicians]);

  const [patternById, setPatternById] = useState(null);
  const [includedRoles, setIncludedRoles] = useState(null);
  const [allocation, setAllocation] = useState(null);
  const [activities, setActivities] = useState([]);
  const [addedStaff, setAddedStaff] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [contractOverrides, setContractOverrides] = useState({});
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [holidayAllowance, setHolidayAllowance] = useState(2);
  const [holidayOn, setHolidayOn] = useState(false);
  const [dutyCapableIds, setDutyCapableIds] = useState([]);
  const [viewWeek, setViewWeek] = useState('a');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [panel, setPanel] = useState({ clinicians: false, anomalies: false, settings: false, scenarios: false, audit: false });
  const [auditLog, setAuditLog] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [activeScenarioId, setActiveScenarioId] = useState(CURRENT_ID);
  const [scenarioName, setScenarioName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedClin, setExpandedClin] = useState(null);

  const demand = useMemo(() => typicalWeekdayDemand(demandSettings, listSize), [demandSettings, listSize]);

  // Effective roster = (real − removed) + added.
  const effClinicians = useMemo(() => {
    const removed = new Set(removedIds);
    const real = realClinicians.filter(c => !removed.has(c.id));
    return [...real, ...addedStaff.map(a => ({ ...a, _added: true }))];
  }, [realClinicians, removedIds, addedStaff]);
  const byId = useMemo(() => { const m = {}; for (const c of effClinicians) m[c.id] = c; return m; }, [effClinicians]);
  const byIdRef = useRef({}); byIdRef.current = byId;
  const nameOf = useCallback((id) => byIdRef.current[id]?.name || 'Someone', []);
  const logAction = useCallback((text) => { if (text) setAuditLog(prev => [...prev, { t: Date.now(), text }].slice(-300)); }, []);
  const effPattern = useMemo(() => {
    const m = {};
    for (const c of realClinicians) m[c.id] = contractOverrides[c.id] || patternById?.[c.id] || {};
    for (const a of addedStaff) m[a.id] = a.pattern || {};
    return m;
  }, [patternById, addedStaff, contractOverrides, realClinicians]);
  const additiveIds = useMemo(() => new Set(addedStaff.filter(a => patternEmpty(a.pattern)).map(a => a.id)), [addedStaff]);
  const allRoles = useMemo(() => rolesInTeam(effClinicians), [effClinicians]);

  // ─── Load ──────────────────────────────────────────────────────────
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
      const pat = {}; for (const r of res.data || []) pat[r.clinician_id] = r.pattern || {};
      setPatternById(pat); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [practiceId, supabase]);

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current || !patternById || realClinicians.length === 0) return;
    initRef.current = true;
    (async () => {
      const { data: row } = await supabase.from('practice_settings').select('workforce').eq('practice_id', practiceId).maybeSingle();
      const wf = row?.workforce || {};

      // Build the data shape for one scenario from raw fields, healing + defaulting.
      const shape = (src) => {
        const overrides = (src.contractOverrides && typeof src.contractOverrides === 'object') ? src.contractOverrides : {};
        const added = Array.isArray(src.addedStaff) ? src.addedStaff : [];
        const removed = Array.isArray(src.removedIds) ? src.removedIds : [];
        const acts = normalizeActivities(src.activities);
        const eff = {}; for (const c of realClinicians) eff[c.id] = overrides[c.id] || patternById[c.id] || {}; for (const a of added) eff[a.id] = a.pattern || {};
        const effClin = [...realClinicians.filter(c => !removed.includes(c.id)), ...added];
        const vIds = [...effClin.map(c => c.id)];
        const alloc = src.allocation ? pruneAllocation(src.allocation, vIds) : buildContracted(effClin, eff);
        return { allocation: healAlloc(alloc, acts), activities: acts, contractOverrides: overrides, addedStaff: added, removedIds: removed, includedRoles: Array.isArray(src.includedRoles) ? src.includedRoles : null, thresholds: { ...DEFAULT_THRESHOLDS, ...(src.thresholds || {}) }, holidayAllowance: Number.isFinite(src.holidayAllowance) ? src.holidayAllowance : 2, auditLog: Array.isArray(src.auditLog) ? src.auditLog : [] };
      };

      let list = [];
      const rawScenarios = Array.isArray(wf.scenarios) ? wf.scenarios : [];
      const hasNewShape = rawScenarios.some(s => s && s.pinned);
      if (hasNewShape) {
        // Already migrated: normalise each scenario's data through shape().
        list = rawScenarios.map(s => ({ id: s.id, name: s.name, pinned: !!s.pinned, data: shape(s.data || {}) }));
        if (!list.some(s => s.pinned)) list.unshift({ id: CURRENT_ID, name: 'Current', pinned: true, data: shape(wf) });
      } else {
        // Legacy: top-level fields are the Current plan; old scenarios (if any) become alternates.
        list = [{ id: CURRENT_ID, name: 'Current', pinned: true, data: shape(wf) }];
        for (const s of rawScenarios) if (s && s.data) list.push({ id: s.id || `sc_${Math.random().toString(36).slice(2, 8)}`, name: s.name || 'Scenario', pinned: false, data: shape(s.data) });
      }

      // Seed a starting audit entry where a scenario has none, so the log always begins with its origin.
      for (const s of list) {
        if (!Array.isArray(s.data.auditLog) || s.data.auditLog.length === 0) {
          s.data.auditLog = [{ t: Date.now(), text: s.pinned ? 'Started from your live working patterns' : 'Starting point' }];
        }
      }

      const current = list.find(s => s.pinned) || list[0];
      setScenarios(list);
      setActiveScenarioId(current.id);
      setDutyCapableIds(Array.isArray(wf.dutyCapableIds) ? wf.dutyCapableIds : []);
      const d = current.data;
      setAllocation(d.allocation); setActivities(d.activities); setContractOverrides(d.contractOverrides);
      setAddedStaff(d.addedStaff); setRemovedIds(d.removedIds); setIncludedRoles(d.includedRoles); setThresholds(d.thresholds); setHolidayAllowance(d.holidayAllowance ?? 2); setAuditLog(d.auditLog || []);
    })();
  }, [patternById, realClinicians, practiceId, supabase]);

  // ─── Auto-save ─────────────────────────────────────────────────────
  const markDirty = () => { setDirty(true); setSaveState('saving'); };
  const snapshotWorking = useCallback(() => ({
    allocation: cloneAllocation(allocation), activities: JSON.parse(JSON.stringify(activities)),
    contractOverrides: JSON.parse(JSON.stringify(contractOverrides)), addedStaff: JSON.parse(JSON.stringify(addedStaff)),
    removedIds: [...removedIds], includedRoles: includedRoles ? [...includedRoles] : null, thresholds: { ...thresholds }, holidayAllowance, auditLog: [...auditLog],
  }), [allocation, activities, contractOverrides, addedStaff, removedIds, includedRoles, thresholds, holidayAllowance, auditLog]);
  const save = useCallback(async () => {
    if (!practiceId || !allocation) return;
    const merged = scenarios.map(s => s.id === activeScenarioId ? { ...s, data: snapshotWorking() } : s);
    const blob = { scenarios: merged, activeScenarioId, dutyCapableIds };
    const { error: err } = await supabase.from('practice_settings').upsert({ practice_id: practiceId, workforce: blob }, { onConflict: 'practice_id' });
    if (err) { setSaveState('error'); toast?.(`Couldn't save: ${err.message}`, 'error'); return; }
    setSaveState('saved'); setDirty(false);
  }, [practiceId, allocation, scenarios, activeScenarioId, dutyCapableIds, snapshotWorking, supabase, toast]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(), 700);
    return () => clearTimeout(t);
  }, [dirty, allocation, activities, addedStaff, removedIds, thresholds, contractOverrides, includedRoles, holidayAllowance, dutyCapableIds, auditLog, scenarios, activeScenarioId, save]);

  // ─── Mutators ──────────────────────────────────────────────────────
  const moveToCell = useCallback((info, toDay, toSession) => {
    const { clinId, fromDay, fromSession, fromActivityId } = info;
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      if (fromDay) next[fromDay][fromSession] = next[fromDay][fromSession].filter(id => id !== clinId);
      if (!next[toDay][toSession].includes(clinId)) next[toDay][toSession].push(clinId);
      return next;
    });
    if (fromActivityId) setActivities(prev => prev.map(a => a.id === fromActivityId ? { ...a, assignedClinicianId: null } : a));
    logAction(`Moved ${nameOf(clinId)} to ${WF_DAY_NAMES[toDay].slice(0, 3)} ${SESSION_LABEL[toSession]}`);
    markDirty();
  }, [logAction, nameOf]);
  const benchClinician = useCallback((info) => {
    const { clinId, fromDay, fromSession, fromActivityId } = info;
    if (fromDay) setAllocation(prev => { const next = cloneAllocation(prev); next[fromDay][fromSession] = next[fromDay][fromSession].filter(id => id !== clinId); return next; });
    if (fromActivityId) setActivities(prev => prev.map(a => a.id === fromActivityId ? { ...a, assignedClinicianId: null } : a));
    if (fromDay) logAction(`Took ${nameOf(clinId)} off ${WF_DAY_NAMES[fromDay].slice(0, 3)} ${SESSION_LABEL[fromSession]}`);
    markDirty();
  }, [logAction, nameOf]);
  const assignToActivity = useCallback((info, activity) => {
    const { clinId, fromDay, fromSession, fromActivityId } = info;
    const occupies = activity.duration === 'fullday' ? ['am', 'pm'] : [activity.session];
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      // Only pull them out of the source cell if it isn't one of the cells this activity occupies.
      if (fromDay && !(fromDay === activity.day && occupies.includes(fromSession))) next[fromDay][fromSession] = next[fromDay][fromSession].filter(id => id !== clinId);
      for (const s of occupies) if (!next[activity.day][s].includes(clinId)) next[activity.day][s].push(clinId);
      return next;
    });
    setActivities(prev => prev.map(a => a.id === activity.id ? { ...a, assignedClinicianId: clinId } : (a.id === fromActivityId ? { ...a, assignedClinicianId: null } : a)));
    logAction(`Assigned ${nameOf(clinId)} to ${activity.label || 'an activity'} (${WF_DAY_NAMES[activity.day].slice(0, 3)} ${SESSION_LABEL[activity.session]})`);
    markDirty();
  }, [logAction, nameOf]);

  const addActivity = (day, session) => {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setActivities(prev => [...prev, { id, day, session, label: '', duration: 'one', week: 'all', assignedClinicianId: null }]);
    setEditingId(id); markDirty();
  };
  const updateActivity = (id, patch) => { setActivities(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a)); markDirty(); };
  const deleteActivity = (id) => { const a = activities.find(x => x.id === id); setActivities(prev => prev.filter(a => a.id !== id)); setEditingId(null); logAction(`Removed activity "${a?.label || 'Activity'}"`); markDirty(); };

  const toggleRole = (role) => { setIncludedRoles(prev => { const base = prev == null ? [...allRoles] : [...prev]; const i = base.indexOf(role); if (i >= 0) base.splice(i, 1); else base.push(role); return base; }); markDirty(); };
  const setThreshold = (k, v) => { setThresholds(prev => ({ ...prev, [k]: Math.max(0, parseFloat(v) || 0) })); markDirty(); };
  const resetToContract = () => {
    const live = realClinicians.filter(c => !removedIds.includes(c.id));
    const eff = {};
    for (const c of live) eff[c.id] = patternById?.[c.id] || {};
    for (const a of addedStaff) eff[a.id] = a.pattern || {};
    setContractOverrides({});
    setAllocation(buildContracted([...live, ...addedStaff], eff));
    logAction('Reset the plan and contracts back to your working patterns');
    markDirty(); toast?.('Reset to your working patterns', 'success');
  };

  // Contract editing (planner-only overlay; never touches working_patterns).
  const togglePattern = (id, day, session) => {
    const c = byId[id]; const isAdded = !!c?._added;
    const cur = effPattern[id] || {};
    const nextVal = cur?.[day]?.[session] === 'in' ? 'off' : 'in';
    const nextPat = { ...cur, [day]: { ...(cur[day] || { am: 'off', pm: 'off' }), [session]: nextVal } };
    if (isAdded) setAddedStaff(prev => prev.map(a => a.id === id ? { ...a, pattern: nextPat } : a));
    else setContractOverrides(prev => ({ ...prev, [id]: nextPat }));
    // Keep the allocation in step with the contract edit: ticking a session on rosters them
    // there, ticking it off takes them out of that session entirely (and off the counts).
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      if (nextVal === 'in') { if (!next[day][session].includes(id)) next[day][session].push(id); }
      else next[day][session] = next[day][session].filter(x => x !== id);
      return next;
    });
    if (nextVal === 'off') setActivities(prev => prev.map(a => (a.day === day && a.assignedClinicianId === id && (a.duration === 'fullday' || a.session === session)) ? { ...a, assignedClinicianId: null } : a));
    logAction(`${nextVal === 'in' ? 'Added' : 'Removed'} ${nameOf(id)} contract ${WF_DAY_NAMES[day].slice(0, 3)} ${SESSION_LABEL[session]}`);
    markDirty();
  };
  const allocatedPattern = (id) => {
    const p = {};
    for (const d of WF_DAYS) p[d] = { am: (allocation?.[d]?.am || []).includes(id) ? 'in' : 'off', pm: (allocation?.[d]?.pm || []).includes(id) ? 'in' : 'off' };
    return p;
  };
  const acceptAllocAsContract = (id) => {
    const pat = allocatedPattern(id); const c = byId[id];
    if (c?._added) setAddedStaff(prev => prev.map(a => a.id === id ? { ...a, pattern: pat } : a));
    else setContractOverrides(prev => ({ ...prev, [id]: pat }));
    logAction(`Set ${nameOf(id)} contract to their current allocation`); markDirty();
  };
  const resetContractToEmis = (id) => {
    const c = byId[id];
    if (c?._added) setAddedStaff(prev => prev.map(a => a.id === id ? { ...a, pattern: {} } : a));
    else setContractOverrides(prev => { const n = { ...prev }; delete n[id]; return n; });
    logAction(`Reset ${nameOf(id)} contract to EMIS`); markDirty();
  };
  const acceptAllAsContract = () => {
    const ov = {}; const addPat = {};
    for (const c of effClinicians) { if (c._added) addPat[c.id] = allocatedPattern(c.id); else ov[c.id] = allocatedPattern(c.id); }
    setContractOverrides(ov);
    setAddedStaff(prev => prev.map(a => ({ ...a, pattern: addPat[a.id] || a.pattern })));
    logAction('Accepted the whole plan as the contract'); markDirty(); toast?.('Current plan accepted as the contract', 'success');
  };
  const resetAllContractsToEmis = () => { setContractOverrides({}); logAction('Reset all contracts to EMIS'); markDirty(); toast?.('Contracts reset to EMIS position', 'success'); };
  const contractEdited = (id) => byId[id]?._added ? false : !!contractOverrides[id];
  const dutySet = useMemo(() => new Set(dutyCapableIds), [dutyCapableIds]);
  const toggleDuty = (id) => { setDutyCapableIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); markDirty(); };

  // ─── Scenarios (Current is pinned; one scenario is always active) ──
  const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios.find(s => s.pinned) || scenarios[0];
  const activeName = activeScenario?.name || 'Current';
  const loadData = (d) => {
    setAllocation(healAlloc(cloneAllocation(d.allocation), d.activities)); setActivities(normalizeActivities(d.activities));
    setContractOverrides(d.contractOverrides || {}); setAddedStaff(d.addedStaff || []); setRemovedIds(d.removedIds || []);
    setIncludedRoles(d.includedRoles ?? null); setThresholds({ ...DEFAULT_THRESHOLDS, ...(d.thresholds || {}) }); setHolidayAllowance(d.holidayAllowance ?? 2); setAuditLog(Array.isArray(d.auditLog) ? d.auditLog : []);
  };
  const saveAsNewScenario = () => {
    const name = scenarioName.trim(); if (!name) return;
    const id = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snap = { ...snapshotWorking(), auditLog: [{ t: Date.now(), text: `Started from ${activeName}` }] };
    // Freeze the working state into the current active scenario, add the new one, and switch to it.
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, data: snapshotWorking() } : s).concat([{ id, name, pinned: false, data: snap }]));
    setActiveScenarioId(id); setAuditLog(snap.auditLog); setScenarioName(''); markDirty();
    toast?.(`Saved "${name}" — now editing it. ${activeName} is untouched.`, 'success');
  };
  const switchScenario = (id) => {
    if (id === activeScenarioId) return;
    const target = scenarios.find(s => s.id === id); if (!target) return;
    setScenarios(prev => prev.map(s => s.id === activeScenarioId ? { ...s, data: snapshotWorking() } : s));
    setActiveScenarioId(id); loadData(target.data); markDirty();
    toast?.(`Now editing "${target.name}"`, 'success');
  };
  const deleteScenario = (id) => {
    const sc = scenarios.find(s => s.id === id); if (!sc || sc.pinned) return;
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (id === activeScenarioId) { const cur = scenarios.find(s => s.pinned); if (cur) { setActiveScenarioId(cur.id); loadData(cur.data); } }
    markDirty();
  };

  const addStaff = (name, role, pattern) => {
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setAddedStaff(prev => [...prev, { id, name, role, pattern }]);
    setAllocation(prev => {
      const next = cloneAllocation(prev);
      for (const d of WF_DAYS) for (const s of WF_SESSIONS) if (pattern?.[d]?.[s] === 'in') next[d][s].push(id);
      return next;
    });
    // If a role filter is active and does not include this role, the new person would be hidden — keep them visible.
    setIncludedRoles(prev => (prev && !prev.includes(role)) ? [...prev, role] : prev);
    markDirty(); setAddOpen(false); logAction(`Added ${name} (${role})`);
  };
  const removeReal = (id) => { logAction(`Marked ${nameOf(id)} as leaving`); setRemovedIds(prev => [...new Set([...prev, id])]); markDirty(); };
  const restoreReal = (id) => { logAction(`Restored ${nameOf(id)}`); setRemovedIds(prev => prev.filter(x => x !== id)); markDirty(); };
  const deleteAdded = (id) => {
    logAction(`Deleted ${nameOf(id)}`);
    setAddedStaff(prev => prev.filter(a => a.id !== id));
    setAllocation(prev => { const next = cloneAllocation(prev); for (const d of WF_DAYS) for (const s of WF_SESSIONS) next[d][s] = next[d][s].filter(x => x !== id); return next; });
    setActivities(prev => prev.map(a => a.assignedClinicianId === id ? { ...a, assignedClinicianId: null } : a));
    markDirty();
  };

  // ─── Pointer drag (mouse + touch) ──────────────────────────────────
  const dragData = useRef(null);
  const [ghost, setGhost] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const startDrag = (info) => (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    dragData.current = info;
    const move = (ev) => {
      const x = ev.clientX, y = ev.clientY;
      setGhost({ x, y, name: byId[info.clinId]?.name || '' });
      const el = document.elementFromPoint(x, y);
      const drop = el && el.closest && el.closest('[data-drop]');
      setOverKey(drop ? drop.getAttribute('data-drop') : null);
      if (ev.cancelable) ev.preventDefault();
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const drop = el && el.closest && el.closest('[data-drop]');
      const target = drop ? drop.getAttribute('data-drop') : null;
      const info2 = dragData.current; dragData.current = null; setGhost(null); setOverKey(null);
      if (!info2 || !target) return;
      if (target === 'bench') benchClinician(info2);
      else if (target.startsWith('cell:')) { const [, d, s] = target.split(':'); moveToCell(info2, d, s); }
      else if (target.startsWith('act:')) { const a = activities.find(x => x.id === target.slice(4)); if (a) assignToActivity(info2, a); }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
  };

  // ─── Per-cell model ────────────────────────────────────────────────
  const includedEffIds = useMemo(() => new Set(effClinicians.filter(c => isIncluded(c, includedRoles)).map(c => c.id)), [effClinicians, includedRoles]);
  const grid = useMemo(() => {
    const g = {};
    if (!allocation) return g;
    for (const day of WF_DAYS) {
      g[day] = {};
      for (const s of WF_SESSIONS) {
        const allIds = (allocation[day][s] || []).filter(id => includedEffIds.has(id));
        const acts = activities.filter(a => a.day === day && activityInWeek(a, viewWeek) && activityHitsSession(a, s));
        const consumed = {};
        for (const a of acts) if (a.assignedClinicianId) consumed[a.assignedClinicianId] = (consumed[a.assignedClinicianId] || 0) + activityFraction(a);
        const assignedSet = new Set(acts.map(a => a.assignedClinicianId).filter(Boolean));
        const general = allIds.reduce((sum, id) => sum + Math.max(0, 1 - Math.min(1, consumed[id] || 0)), 0);
        const freeIds = allIds.filter(id => !assignedSet.has(id) || (consumed[id] || 0) < 1);
        const demandHalf = Math.round((demand[day] || 0) / 2);
        const cut = holidayOn ? holidayAllowance : 0;
        const working = Math.max(0, allIds.length - cut);
        const generalAdj = Math.max(0, general - cut);
        const duty = Math.max(0, allIds.filter(id => dutySet.has(id) && !assignedSet.has(id)).length - cut);
        g[day][s] = { allIds, acts, general: generalAdj, freeIds, working, duty, demandHalf, ratio: generalAdj > 0 ? demandHalf / generalAdj : null };
      }
    }
    return g;
  }, [allocation, activities, viewWeek, includedEffIds, demand, holidayOn, holidayAllowance, dutySet]);

  const scale = useMemo(() => {
    let gMin = Infinity, gMax = -Infinity, dMin = Infinity, dMax = -Infinity;
    for (const day of WF_DAYS) for (const s of WF_SESSIONS) {
      const c = grid[day]?.[s]; if (!c) continue;
      gMin = Math.min(gMin, c.general); gMax = Math.max(gMax, c.general);
      dMin = Math.min(dMin, c.demandHalf); dMax = Math.max(dMax, c.demandHalf);
    }
    return { gMin, gMax, dMin, dMax };
  }, [grid]);
  const genT = (v) => scale.gMax > scale.gMin ? (v - scale.gMin) / (scale.gMax - scale.gMin) : 0.5;
  const demT = (v) => scale.dMax > scale.dMin ? 1 - (v - scale.dMin) / (scale.dMax - scale.dMin) : 0.5;

  const anomalies = useMemo(() => {
    if (!allocation || !patternById) return { items: [], cellCount: {}, clinMismatch: {} };
    return detectAnomalies({ allocation, patternById: effPattern, activities, clinicians: effClinicians, includedRoles, additiveIds });
  }, [allocation, patternById, effPattern, activities, effClinicians, includedRoles, additiveIds]);

  // ─── Render ────────────────────────────────────────────────────────
  if (loading || !allocation) return <div style={S.card}><p style={S.muted}>{error || 'Loading roster…'}</p></div>;

  const included = effClinicians.filter(c => isIncluded(c, includedRoles));
  const tracker = included.map(c => ({ c, allocated: allocatedCount(allocation, c.id), contracted: contractedCount(effPattern, c.id) }))
    .sort((a, b) => b.allocated - a.allocated || a.c.name.localeCompare(b.c.name));
  const anomCount = anomalies.items.length;
  const editedCount = Object.keys(contractOverrides).filter(id => realClinicians.some(c => c.id === id)).length;
  const diverged = addedStaff.length + removedIds.length + editedCount;
  const togglePanel = (k) => setPanel(p => ({ ...p, [k]: !p[k] }));
  const totalCount = totalSessions({ allocation, addedStaff, removedIds }, realClinicians);
  const pinnedScenario = scenarios.find(s => s.pinned);
  const onCurrent = pinnedScenario ? activeScenarioId === pinnedScenario.id : true;
  const currentTotal = onCurrent ? totalCount : (pinnedScenario ? totalSessions(pinnedScenario.data, realClinicians) : totalCount);
  const totalDelta = totalCount - currentTotal;
  const tabBtn = (on) => ({ ...S.btnGhost, background: on ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)', border: `1px solid ${on ? 'var(--accent-2)' : 'var(--border-2)'}`, color: on ? 'var(--accent-text)' : 'var(--text-1)' });

  const Chip = ({ clinId, day, session, activityId }) => {
    const c = byId[clinId]; if (!c) return null;
    const off = !additiveIds.has(clinId) && effPattern[clinId]?.[day]?.[session] !== 'in';
    const lit = expandedClin === clinId;
    const dimmed = expandedClin && !lit;
    return (
      <div onPointerDown={startDrag({ clinId, fromDay: day, fromSession: session, fromActivityId: activityId || null })}
        title={`${c.name}${c.role ? ' · ' + c.role : ''}${c._added ? ' · added' : ''}${off ? ' · off contract' : ''}`}
        style={{ touchAction: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '4px 11px 4px 4px', borderRadius: 999, cursor: 'grab', width: '100%', boxSizing: 'border-box',
          opacity: dimmed ? 0.3 : 1, boxShadow: lit ? '0 0 0 2px var(--accent-2)' : 'none', transition: 'opacity 0.12s',
          background: off ? 'rgba(239,68,68,0.18)' : 'var(--accent-soft)', border: `1px ${c._added ? 'dashed' : 'solid'} ${off ? '#ef4444' : 'rgba(129,140,248,0.5)'}` }}>
        <span style={{ width: 26, height: 26, borderRadius: 999, background: off ? '#ef4444' : 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: dutySet.has(clinId) ? '0 0 0 2px rgba(248,113,113,0.6)' : 'none' }}>{initials(c.name)}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: off ? '#fecaca' : 'var(--accent-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', maxWidth: 1360, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 25, fontWeight: 600, color: 'var(--text-1)', fontFamily: "'Outfit', sans-serif" }}>Workforce planner</h2>
          <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--text-3)', maxWidth: 680, lineHeight: 1.55 }}>
            Drag clinicians across the week, allocate activities, and see where each session sits against demand. Use it to plan recruitment: spot the gaps against demand and work out how many sessions, and which role, to hire.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-4)', maxWidth: 680, lineHeight: 1.5 }}>
            The base contract comes from your live working patterns (set in Buddy Cover / staff settings). Changes here are a planning overlay and never affect them — to change the underlying contract, edit it under{' '}
            <a href={`/v4/practice/${data?._v4?.practiceSlug || practiceId}?tab=clinicians`} style={{ color: 'var(--accent-2)', textDecoration: 'underline' }}>Manage practice → Clinicians</a>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: saveState === 'error' ? '#f87171' : saveState === 'saving' ? '#fbbf24' : '#34d399', minWidth: 58 }}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : '✓ Saved'}</span>
          <button onClick={() => togglePanel('clinicians')} style={tabBtn(panel.clinicians)}>Clinicians</button>
          <button onClick={() => togglePanel('anomalies')} style={tabBtn(panel.anomalies)}>Anomalies{anomCount ? ` (${anomCount})` : ''}</button>
          <button onClick={() => togglePanel('audit')} style={tabBtn(panel.audit)}>Audit</button>
          <button onClick={() => togglePanel('settings')} style={tabBtn(panel.settings)}>Settings</button>
          <button onClick={() => togglePanel('scenarios')} style={tabBtn(panel.scenarios)}>Scenarios · {activeName}</button>
          <button onClick={resetToContract} style={S.btnGhost}>Reset to working patterns</button>
        </div>
      </div>

      {/* Headline: total sessions + comparison to Current */}
      <div style={{ ...S.card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>{totalCount}</span>
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>total sessions / week</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>Every clinician-session on the grid, including those on activities · editing {activeName}</div>
        </div>
        {!onCurrent && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: totalDelta < 0 ? '#f87171' : totalDelta > 0 ? '#38bdf8' : 'var(--text-3)' }}>
              {totalDelta > 0 ? '+' : ''}{totalDelta} vs Current
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 2 }}>Current has {currentTotal} · this scenario has {totalCount}</div>
          </div>
        )}
      </div>

      {/* Banners */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...S.card, padding: '10px 14px', flex: '1 1 320px', borderColor: anomCount ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)', background: anomCount ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)' }}>
          <span style={{ fontSize: 15, color: anomCount ? '#fbbf24' : '#34d399', fontWeight: 500 }}>{anomCount ? `⚠ ${anomCount} anomal${anomCount === 1 ? 'y' : 'ies'} vs contracted pattern` : '✓ Allocation matches the contracted pattern'}</span>
        </div>
        {diverged > 0 && (
          <div style={{ ...S.card, padding: '10px 14px', flex: '1 1 240px', borderColor: 'rgba(129,140,248,0.5)', background: 'rgba(99,102,241,0.08)' }}>
            <span style={{ fontSize: 14, color: 'var(--accent-text)' }}>Planner differs from live records: {[addedStaff.length > 0 ? `+${addedStaff.length} added` : '', removedIds.length > 0 ? `−${removedIds.length} removed` : '', editedCount > 0 ? `${editedCount} contract${editedCount === 1 ? '' : 's'} edited` : ''].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </div>

      {/* Week toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Showing</span>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--g-field)', borderRadius: 8 }}>
          {['a', 'b'].map(w => <button key={w} onClick={() => setViewWeek(w)} style={{ ...S.toggle, background: viewWeek === w ? 'var(--accent)' : 'transparent', color: viewWeek === w ? '#fff' : 'var(--text-3)' }}>Week {w.toUpperCase()}</button>)}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>only activities alternate — staff work the same each week</span>
        <button onClick={() => setHolidayOn(v => !v)} title={`Reduce each session by ${holidayAllowance} to model maximum staff on holiday`}
          style={{ ...S.btnGhost, marginLeft: 'auto', background: holidayOn ? 'rgba(245,158,11,0.2)' : 'var(--surface-2)', border: `1px solid ${holidayOn ? '#f59e0b' : 'var(--border-2)'}`, color: holidayOn ? '#fcd34d' : 'var(--text-1)' }}>
          {holidayOn ? `✓ Holiday cover (−${holidayAllowance}/session)` : 'Holiday cover'}
        </button>
        {expandedClin && byId[expandedClin] && (
          <span style={{ fontSize: 12.5, color: 'var(--accent-text)', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(129,140,248,0.4)', borderRadius: 999, padding: '4px 10px', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            Highlighting {byId[expandedClin].name}
            <button onClick={() => setExpandedClin(null)} style={{ ...S.linkBtn, color: 'var(--accent-text)' }}>clear</button>
          </span>
        )}
      </div>

      {/* Grid */}
      <div style={{ ...S.card, overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, minmax(180px, 1fr))', gap: 9 }}>
          <div />
          {WF_DAYS.map(day => (<div key={day} style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text-2)', paddingBottom: 4 }}>{WF_DAY_NAMES[day].slice(0, 3)}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-4)', marginLeft: 6 }}>~{demand[day] || 0}</span></div>))}

          {WF_SESSIONS.map(session => (
            <FragmentRow key={session}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-3)' }}>{SESSION_LABEL[session]}</div>
              {WF_DAYS.map(day => {
                const cd = grid[day][session];
                const anomN = anomalies.cellCount[cellKey(day, session)] || 0;
                const over = overKey === `cell:${day}:${session}`;
                const rc = ratioColour(cd.general, cd.demandHalf, thresholds);
                return (
                  <div key={day} data-drop={`cell:${day}:${session}`}
                    style={{ minHeight: 168, borderRadius: 12, position: 'relative', overflow: 'hidden',
                      background: over ? 'rgba(99,102,241,0.14)' : 'var(--surface)',
                      border: `1px solid ${over ? 'var(--accent-2)' : anomN ? 'rgba(239,68,68,0.45)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: rc.tint, borderBottom: `2px solid ${rc.solid}` }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: rc.text }}>{rc.label}{anomN ? <span style={{ color: '#ef4444', marginLeft: 5 }}>⚠{anomN}</span> : null}</span>
                      <button onClick={() => addActivity(day, session)} title="Add activity" style={{ background: 'none', border: 'none', color: rc.text, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>+</button>
                    </div>
                    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      {cd.acts.map(a => {
                        const aover = overKey === `act:${a.id}`; const assigned = a.assignedClinicianId;
                        const durLbl = a.duration === 'quarter' ? '¼ sess' : a.duration === 'half' ? '½ sess' : a.duration === 'fullday' ? 'full day' : '1 sess';
                        return (
                          <div key={a.id} data-drop={`act:${a.id}`} onClick={() => setEditingId(a.id)}
                            style={{ borderRadius: 9, padding: '6px 8px', cursor: 'pointer', border: aover ? '1px solid var(--accent-2)' : `1px solid ${assigned ? 'rgba(56,189,248,0.35)' : 'rgba(245,158,11,0.3)'}`,
                              background: assigned ? 'rgba(56,189,248,0.16)' : 'rgba(245,158,11,0.14)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, color: assigned ? '#7dd3fc' : '#fcd34d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label || 'Activity'}</span>
                              <span style={{ fontSize: 10, color: assigned ? '#7dd3fc' : '#fcd34d', flexShrink: 0 }}>{durLbl}{(a.week || 'all') !== 'all' ? ` · Wk ${(a.week || 'all').toUpperCase()}` : ''}</span>
                            </div>
                            <div style={{ marginTop: 5 }} onPointerDown={e => e.stopPropagation()}>
                              {assigned ? <Chip clinId={assigned} day={day} session={session} activityId={a.id} /> : <span style={{ fontSize: 12, color: '#fbbf24' }}>Drop a clinician</span>}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{cd.freeIds.map(id => <Chip key={id} clinId={id} day={day} session={session} />)}</div>
                      {/* Option C summary */}
                      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 6 }}>
                          <Metric label="working" value={cd.working} bg="var(--surface)" />
                          <Metric label="general" value={fmt(cd.general)} bg={scaleTint(genT(cd.general))} />
                          <Metric label="demand" value={`~${cd.demandHalf}`} bg={scaleTint(demT(cd.demandHalf))} />
                          <Metric label="duty" value={cd.duty} bg="rgba(248,113,113,0.16)" />
                        </div>
                        <div style={{ background: rc.tint, color: rc.text, borderRadius: 7, padding: '4px 8px', fontSize: 12, fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                          <span>{rc.label}</span><span>{cd.ratio != null ? `${cd.ratio.toFixed(1)} / clin` : '–'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </FragmentRow>
          ))}

          {/* Totals strip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-4)', paddingTop: 6 }}>Total</div>
          {WF_DAYS.map(day => {
            const w = grid[day].am.working + grid[day].pm.working;
            const g = grid[day].am.general + grid[day].pm.general;
            return (<div key={day} style={{ textAlign: 'center', paddingTop: 6, fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'var(--text-3)' }}>{w} working<br /><span style={{ color: 'var(--text-4)' }}>{fmt(g)} general</span></div>);
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          {[['Overstaffed', RC.blue.solid], ['Good', RC.green.solid], ['Tight', RC.amber.solid], ['Short', RC.red.solid]].map(([l, col]) => (<div key={l} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-3)' }}><span style={{ width: 14, height: 14, borderRadius: 4, background: col }} />{l}</div>))}
          <span style={{ fontSize: 12.5, color: 'var(--text-4)', marginLeft: 'auto' }}>Cards shade red→green across the week · ratio header is absolute</span>
        </div>
      </div>

      {/* Floating popouts */}
      {(panel.clinicians || panel.anomalies || panel.settings || panel.scenarios || panel.audit) && (
        <div data-drop={panel.clinicians ? 'bench' : undefined} style={{ position: 'fixed', top: 90, right: 24, width: 320, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 60 }}>
          {panel.clinicians && (
            <Popout title="Clinicians" onClose={() => togglePanel('clinicians')} highlight={overKey === 'bench'}>
              <button onClick={() => setAddOpen(true)} style={{ ...S.btnGhost, width: '100%', marginBottom: 10 }}>+ Add person</button>
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '0 0 10px' }}>Drag a name onto the grid to roster them; drag a chip here to bench them. Tap D to mark someone duty-capable (red ring).</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {tracker.map(({ c, allocated, contracted }) => {
                  const mismatch = !additiveIds.has(c.id) && allocated !== contracted;
                  const open = expandedClin === c.id;
                  return (
                    <div key={c.id} style={{ borderRadius: 8, background: open ? 'var(--surface)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
                        <span onPointerDown={startDrag({ clinId: c.id, fromDay: null, fromSession: null, fromActivityId: null })} title="Drag onto the grid" style={{ touchAction: 'none', cursor: 'grab', width: 24, height: 24, borderRadius: 999, background: c._added ? 'transparent' : 'var(--accent)', border: c._added ? '1px dashed var(--accent-2)' : 'none', color: c._added ? 'var(--accent-text)' : '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: dutySet.has(c.id) ? '0 0 0 2px rgba(248,113,113,0.6)' : 'none' }}>{initials(c.name)}</span>
                        <span onClick={() => setExpandedClin(open ? null : c.id)} style={{ flex: 1, fontSize: 13.5, color: 'var(--text-1)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}{c._added && <span style={{ color: 'var(--accent-2)', fontSize: 10, marginLeft: 5 }}>new</span>}{contractEdited(c.id) && <span style={{ color: '#fbbf24', fontSize: 10, marginLeft: 5 }}>edited</span>}</span>
                        <button onClick={() => toggleDuty(c.id)} title={dutySet.has(c.id) ? 'Duty-capable — click to unset' : 'Mark as duty-capable'}
                          style={{ width: 22, height: 22, borderRadius: 999, cursor: 'pointer', fontSize: 10, fontWeight: 700, flexShrink: 0, fontFamily: 'inherit',
                            background: dutySet.has(c.id) ? 'rgba(248,113,113,0.18)' : 'transparent', border: `1px solid ${dutySet.has(c.id) ? 'rgba(248,113,113,0.7)' : 'var(--border-2)'}`, color: dutySet.has(c.id) ? '#fca5a5' : 'var(--text-4)' }}>D</button>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12.5, color: mismatch ? '#f87171' : 'var(--text-3)' }}>{allocated}{!additiveIds.has(c.id) ? `/${contracted}` : ''}</span>
                        {c._added ? <button onClick={() => deleteAdded(c.id)} title="Delete" style={S.xBtn}>×</button> : <button onClick={() => removeReal(c.id)} title="Mark as leaving" style={S.xBtn}>×</button>}
                      </div>
                      {open && (
                        <div style={{ padding: '4px 6px 10px 38px' }}>
                          <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '0 0 5px' }}>Tick a clinician's contracted sessions:</p>
                          <MiniWeek pattern={effPattern[c.id]} onToggle={(d, s) => togglePattern(c.id, d, s)} />
                          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                            <button onClick={() => acceptAllocAsContract(c.id)} style={S.linkBtn} title="Set their contract to where they're currently allocated">Use allocation</button>
                            {!c._added && contractEdited(c.id) && <button onClick={() => resetContractToEmis(c.id)} style={S.linkBtn} title="Revert to the EMIS working pattern">Reset to EMIS</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {removedIds.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '0 0 5px' }}>Removed (leaving)</p>
                  {removedIds.map(id => { const c = realClinicians.find(x => x.id === id); if (!c) return null; return (<div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px' }}><span style={{ fontSize: 13, color: 'var(--text-4)', textDecoration: 'line-through' }}>{c.name}</span><button onClick={() => restoreReal(id)} style={S.linkBtn}>undo</button></div>); })}
                </div>
              )}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0 }}>Contracts (planner overlay — never changes EMIS)</p>
                <button onClick={acceptAllAsContract} style={{ ...S.btnGhost, width: '100%', fontSize: 12.5 }}>Accept whole plan as contract</button>
                {editedCount > 0 && <button onClick={resetAllContractsToEmis} style={{ ...S.btnGhost, width: '100%', fontSize: 12.5 }}>Reset all contracts to EMIS</button>}
              </div>
            </Popout>
          )}
          {panel.anomalies && (
            <Popout title={`Anomalies (${anomCount})`} onClose={() => togglePanel('anomalies')}>
              {anomCount === 0 ? <span style={S.muted}>No anomalies — allocation matches the contract.</span> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {anomalies.items.map((it, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
                      <span style={{ color: it.type === 'unassigned_activity' ? '#fbbf24' : '#f87171' }}>•</span>{' '}
                      {it.type === 'unassigned_activity' ? <>{ANOM_LABEL[it.type]}: {it.label || 'Activity'} ({WF_DAY_NAMES[it.day].slice(0, 3)} {SESSION_LABEL[it.session]}{it.week !== 'all' ? ` Wk ${it.week.toUpperCase()}` : ''})</>
                        : it.type === 'total' ? <>{byId[it.clinicianId]?.name}: {ANOM_LABEL[it.type]} ({it.allocated} vs {it.contracted})</>
                          : <>{byId[it.clinicianId]?.name}: {ANOM_LABEL[it.type]} ({WF_DAY_NAMES[it.day].slice(0, 3)} {SESSION_LABEL[it.session]})</>}
                    </div>
                  ))}
                </div>
              )}
            </Popout>
          )}
          {panel.settings && (
            <Popout title="Settings" onClose={() => togglePanel('settings')}>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Include roles</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {allRoles.map(role => { const on = includedRoles == null || includedRoles.includes(role); return (<button key={role} onClick={() => toggleRole(role)} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent-2)' : 'var(--border-2)'}`, background: on ? 'var(--accent-soft)' : 'var(--surface)', color: on ? 'var(--accent-text)' : 'var(--text-4)' }}>{on ? '✓ ' : ''}{role}</button>); })}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Ratio thresholds (requests / general clinician)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ThRow label="Overstaffed below" value={thresholds.over} onChange={v => setThreshold('over', v)} colour={RC.blue.solid} />
                <ThRow label="Tight above" value={thresholds.tight} onChange={v => setThreshold('tight', v)} colour={RC.amber.solid} />
                <ThRow label="Short above" value={thresholds.short} onChange={v => setThreshold('short', v)} colour={RC.red.solid} />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '16px 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Holiday cover</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: '#f59e0b', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>Staff allowed off per day</span>
                <input type="number" min={0} value={holidayAllowance} onChange={e => { setHolidayAllowance(Math.max(0, parseInt(e.target.value, 10) || 0)); markDirty(); }} style={{ width: 60, ...S.numInput }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-4)', margin: '6px 0 0' }}>The Holiday cover toggle on the grid reduces each session by this many to show capacity when the most staff are away.</p>
            </Popout>
          )}
          {panel.scenarios && (
            <Popout title="Scenarios" onClose={() => togglePanel('scenarios')}>
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '0 0 10px' }}>Current is your live plan and loads by default. Save a copy to explore a what-if (for example losing a clinician), then switch back to Current any time.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {scenarios.map(sc => {
                  const active = sc.id === activeScenarioId;
                  return (
                    <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: active ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${active ? 'var(--accent-2)' : 'transparent'}` }}>
                      <span style={{ flex: 1, fontSize: 13.5, color: active ? 'var(--accent-text)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}{sc.pinned && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>live</span>}{active && <span style={{ fontSize: 10, color: 'var(--accent-2)', marginLeft: 6 }}>editing</span>}</span>
                      {!active && <button onClick={() => switchScenario(sc.id)} style={S.linkBtn}>edit</button>}
                      {!sc.pinned && <button onClick={() => deleteScenario(sc.id)} title="Delete" style={S.xBtn}>×</button>}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '0 0 5px' }}>Save current plan as a new scenario</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={scenarioName} placeholder="e.g. If Dr X leaves" onChange={e => setScenarioName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveAsNewScenario(); }} style={{ ...S.input, flex: 1 }} />
                <button disabled={!scenarioName.trim()} onClick={saveAsNewScenario} style={{ ...S.btnGhost, background: scenarioName.trim() ? 'var(--accent)' : 'rgba(99,102,241,0.4)', border: 'none', color: '#fff' }}>Save</button>
              </div>
            </Popout>
          )}
          {panel.audit && (
            <Popout title={`Audit · ${activeName}`} onClose={() => togglePanel('audit')}>
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', margin: '0 0 10px' }}>Every change made to reach this scenario, starting from its origin. Newest at the top.</p>
              {auditLog.length === 0 ? <span style={S.muted}>No changes recorded yet.</span> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[...auditLog].reverse().map((e, i) => {
                    const start = i === auditLog.length - 1;
                    return (
                      <div key={`${e.t}-${i}`} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: i === auditLog.length - 1 ? 'none' : '1px solid var(--surface-2)' }}>
                        <span style={{ flexShrink: 0, width: 56, fontSize: 11, color: 'var(--text-4)', fontFamily: "'Space Mono', monospace" }}>{e.t ? new Date(e.t).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : ''}</span>
                        <span style={{ fontSize: 13, color: start ? 'var(--text-3)' : 'var(--text-1)', fontStyle: start ? 'italic' : 'normal', lineHeight: 1.4 }}>{e.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Popout>
          )}
        </div>
      )}
      {editingId && (() => {
        const a = activities.find(x => x.id === editingId); if (!a) return null;
        return (
          <Modal onClose={() => setEditingId(null)}>
            <input type="text" value={a.label} placeholder="Activity name (e.g. Duty doctor)" autoFocus onChange={e => updateActivity(a.id, { label: e.target.value })} style={S.input} />
            <p style={S.modalLabel}>Duration</p>
            <Segmented options={[['quarter', '¼'], ['half', '½'], ['one', '1 sess'], ['fullday', 'Full day']]} value={a.duration} onChange={v => updateActivity(a.id, { duration: v })} />
            <p style={S.modalLabel}>Repeats</p>
            <Segmented options={[['all', 'Every week'], ['a', 'Week A'], ['b', 'Week B']]} value={a.week} onChange={v => updateActivity(a.id, { week: v })} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button onClick={() => deleteActivity(a.id)} style={{ ...S.btnGhost, color: '#f87171', borderColor: 'rgba(239,68,68,0.4)' }}>Delete</button>
              <button onClick={() => setEditingId(null)} style={{ ...S.btnGhost, background: 'var(--accent)', border: 'none', color: '#fff' }}>Done</button>
            </div>
          </Modal>
        );
      })()}

      {/* Add staff modal */}
      {addOpen && <AddStaffModal roles={Array.from(new Set([...COMMON_ROLES, ...allRoles]))} onClose={() => setAddOpen(false)} onAdd={addStaff} />}

      {/* Drag ghost */}
      {ghost && <div style={{ position: 'fixed', left: ghost.x + 10, top: ghost.y + 10, pointerEvents: 'none', zIndex: 200, background: 'var(--accent)', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}>{ghost.name.split(' ')[0]}</div>}
    </div>
  );
}

function FragmentRow({ children }) { return <>{children}</>; }
function Metric({ label, value, bg }) {
  return (<div style={{ background: bg, borderRadius: 7, padding: '5px 4px', textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'Space Mono', monospace" }}>{value}</div><div style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div></div>);
}
function MiniWeek({ pattern, onToggle }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(5, 18px)', gap: 3, alignItems: 'center' }}>
      <span />{WF_DAYS.map(d => <span key={d} style={{ fontSize: 9, color: 'var(--text-4)', textAlign: 'center' }}>{WF_DAY_NAMES[d][0]}</span>)}
      {WF_SESSIONS.map(s => (<FragmentRow key={s}><span style={{ fontSize: 9, color: 'var(--text-4)' }}>{SESSION_LABEL[s]}</span>{WF_DAYS.map(d => { const on = pattern?.[d]?.[s] === 'in'; return <span key={d} onClick={onToggle ? () => onToggle(d, s) : undefined} style={{ width: 16, height: 16, borderRadius: 3, background: on ? 'var(--accent)' : 'var(--border)', cursor: onToggle ? 'pointer' : 'default', border: onToggle ? '1px solid var(--border-2)' : 'none' }} />; })}</FragmentRow>))}
    </div>
  );
}
function Segmented({ options, value, onChange }) {
  return (<div style={{ display: 'flex', gap: 4 }}>{options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} style={{ flex: 1, padding: '7px 4px', fontSize: 12.5, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${value === v ? 'var(--accent-2)' : 'var(--border-2)'}`, background: value === v ? 'rgba(99,102,241,0.2)' : 'var(--surface)', color: value === v ? 'var(--accent-text)' : 'var(--text-3)' }}>{l}</button>)}</div>);
}
function ThRow({ label, value, onChange, colour }) {
  return (<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: colour, flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>{label}</span><input type="number" min={0} value={value} onChange={e => onChange(e.target.value)} style={{ width: 60, ...S.numInput }} /></div>);
}
function Popout({ title, onClose, children, highlight }) {
  return (
    <div style={{ ...S.card, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: 'var(--panel)', border: `1px solid ${highlight ? 'var(--accent-2)' : 'var(--border-2)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</span>
        <button onClick={onClose} style={S.xBtn}>×</button>
      </div>
      {children}
    </div>
  );
}
function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: 360, maxWidth: '94vw', background: 'var(--panel)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>{children}</div>
    </div>
  );
}
function AddStaffModal({ roles, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState(roles[0] || 'GP');
  const [pattern, setPattern] = useState(() => { const p = {}; for (const d of WF_DAYS) p[d] = { am: 'off', pm: 'off' }; return p; });
  const toggle = (d, s) => setPattern(prev => ({ ...prev, [d]: { ...prev[d], [s]: prev[d][s] === 'in' ? 'off' : 'in' } }));
  return (
    <Modal onClose={onClose}>
      <p style={{ ...S.modalLabel, marginTop: 0 }}>Name</p>
      <input type="text" value={name} placeholder="e.g. Dr Locum" autoFocus onChange={e => setName(e.target.value)} style={S.input} />
      <p style={S.modalLabel}>Role</p>
      <select value={role} onChange={e => setRole(e.target.value)} style={{ ...S.input, appearance: 'auto' }}>
        {roles.map(r => <option key={r} value={r} style={{ background: 'var(--surface-solid)' }}>{r}</option>)}
      </select>
      <p style={S.modalLabel}>Contracted sessions <span style={{ color: 'var(--text-4)', textTransform: 'none', letterSpacing: 0 }}>(leave blank for ad-hoc / locum)</span></p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(5, 1fr)', gap: 4, alignItems: 'center', marginBottom: 6 }}>
        <span />{WF_DAYS.map(d => <span key={d} style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{WF_DAY_NAMES[d].slice(0, 3)}</span>)}
        {WF_SESSIONS.map(s => (<FragmentRow key={s}><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{SESSION_LABEL[s]}</span>{WF_DAYS.map(d => { const on = pattern[d][s] === 'in'; return <button key={d} onClick={() => toggle(d, s)} style={{ height: 26, borderRadius: 6, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent-2)' : 'var(--border-2)'}`, background: on ? 'var(--accent)' : 'var(--surface)' }} />; })}</FragmentRow>))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={S.btnGhost}>Cancel</button>
        <button disabled={!name.trim()} onClick={() => onAdd(name.trim(), role.trim() || 'Other', pattern)} style={{ ...S.btnGhost, background: name.trim() ? 'var(--accent)' : 'rgba(99,102,241,0.4)', border: 'none', color: '#fff' }}>Add</button>
      </div>
    </Modal>
  );
}

const S = {
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  muted: { fontSize: 13, color: 'var(--text-3)', margin: 0 },
  btnGhost: { background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' },
  toggle: { border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  xBtn: { background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '0 2px' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent-2)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 },
  input: { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text-1)', padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  numInput: { background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 6, color: 'var(--text-1)', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' },
  modalLabel: { fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '12px 0 6px' },
};
