'use client';

// /dashboard — the Supabase-authed clone of the v3 app shell.
//
// Visually identical to production gpdash.net (same Sidebar, same
// HuddleToday, same MyRota, etc.) but data flows through Supabase
// instead of the shared-password Redis blob.
//
// Auth flow:
// - Not signed in → redirect to /v4/login
// - Signed in but no practice selected → redirect to /v4/dashboard (practice picker)
// - Signed in with ?practice=UUID → load v3-shaped data from /api/v4/data
//
// Once data is loaded, this page is byte-for-byte the v3 shell — same
// Sidebar, same activeSection switching, same components. Components
// don't know they're talking to Postgres.

import { Suspense } from 'react';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DAYS, getWeekStart, getCurrentDay, generateBuddyAllocations, getDefaultData, DEFAULT_SETTINGS, guessGroupFromRole, titleCaseName, toLocalIso, computeDayStatus } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';
import { ToastProvider, useToast, PageSkeleton } from '@/components/ui';
import Sidebar from '@/components/Sidebar';
import BuddyDaily from '@/components/buddy/BuddyDaily';
import TeamMembers from '@/components/buddy/TeamMembers';
import TeamRota from '@/components/buddy/TeamRota';
import BuddySettings from '@/components/buddy/BuddySettings';
import HuddleToday from '@/components/huddle/HuddleToday';
import HuddleForward from '@/components/huddle/HuddleForward';
import WorkloadAudit from '@/components/huddle/WorkloadAudit';
import MyRota from '@/components/huddle/MyRota';
import RoomSettings from '@/components/room/RoomSettings';
import RoomDashboard from '@/components/room/RoomDashboard';
import Changelog from '@/components/Changelog';
import AccountSettings from '@/components/AccountSettings';
import { createClient } from '@/utils/supabase/client';

export default function DashboardRoot() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>Loading...</div>}>
      <ToastProvider>
        <DashboardContent />
      </ToastProvider>
    </Suspense>
  );
}

function DashboardContent() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const practiceId = searchParams.get('practice');
  const supabase = createClient();

  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState(null);
  const [allPractices, setAllPractices] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => getCurrentDay());
  const [activeSection, setActiveSection] = useState('huddle-today');
  const [syncStatus, setSyncStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [huddleData, setHuddleData] = useState(null);
  const [huddleMessages, setHuddleMessages] = useState([]);
  const huddleLoadedRef = useRef(false);
  const lastSentCsvRef = useRef(null);  // tracks the last CSV reference we sent to the server, for save-time bandwidth optimisation

  // 1. Auth check + practice selection check
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace('/v4/login');
        return;
      }
      if (!practiceId) {
        router.replace('/v4/dashboard');
        return;
      }

      // Fetch all practices the user is a member of
      const { data: memberships } = await supabase
        .from('practice_users')
        .select('role, practices(id, name)')
        .eq('user_id', user.id);
      if (!cancelled && memberships) {
        setAllPractices(memberships.map(m => ({
          id: m.practices?.id,
          name: m.practices?.name,
          role: m.role,
        })).filter(p => p.id));
      }

      setAuthChecked(true);
    }
    checkAuth();
    return () => { cancelled = true; };
  }, [practiceId, router, supabase]);

  // 2. Once auth checked, load practice data
  useEffect(() => {
    if (!authChecked || !practiceId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast(err.error || `Failed to load data (${res.status})`, 'error', 4000);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        const normalised = normalizeData(json);
        setData(normalised);
        if (json.huddleCsvData) {
          setHuddleData(json.huddleCsvData);
          lastSentCsvRef.current = json.huddleCsvData;  // baseline for diff
        }

        // If the user is linked to a clinician AND no rota hash is set, set
        // it now so MyRota will default to "me"
        if (normalised._v4?.linkedClinicianId && typeof window !== 'undefined') {
          const me = normalised.clinicians?.find(c => c.id === normalised._v4.linkedClinicianId);
          if (me?.initials && !window.location.hash.startsWith('#rota-')) {
            window.location.hash = `rota-${me.initials}`;
          }
        }

        // Background TeamNet sync — fires if a calendar URL is set and the
        // last sync was more than 6 hours ago (or never). Doesn't block the UI.
        if (normalised.teamnetUrl) {
          const last = normalised.lastSyncTime ? new Date(normalised.lastSyncTime).getTime() : 0;
          const hours = (Date.now() - last) / 3_600_000;
          if (hours > 6) {
            // Fire and forget — sync runs in the background and updates state when done
            (async () => {
              try {
                const r = await fetch(`/api/v4/sync-teamnet?practice=${encodeURIComponent(practiceId)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: normalised.teamnetUrl, clinicians: normalised.clinicians }),
                });
                const result = await r.json().catch(() => ({}));
                if (!r.ok || result.error) return;  // silent on error
                const newAbsences = result.absences || [];
                // Update state + persist new absences via saveData (writes to DB)
                setData(prev => prev ? { ...prev, plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() } : prev);
                // Persist quietly without a toast
                fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...normalised, plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() }),
                }).catch(() => {});
              } catch {
                // background sync errors are silent
              }
            })();
          }
        }
      } catch (err) {
        if (!cancelled) toast('Failed to load data', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [authChecked, practiceId, toast]);

  // ─── Same normalization logic as v3 ──────────────────────────────
  const normalizeData = (d) => {
    if (!d) return d;
    if (d.clinicians && !Array.isArray(d.clinicians)) d.clinicians = Object.values(d.clinicians);
    if (d.clinicians && Array.isArray(d.clinicians)) {
      d.clinicians = d.clinicians.map(c => ({
        ...c,
        name: titleCaseName(c.name) || c.name,
        group: c.group || guessGroupFromRole(c.role),
        status: c.longTermAbsent ? 'longTermAbsent' : (c.status || 'active'),
        longTermAbsent: c.status === 'longTermAbsent' || c.longTermAbsent || false,
        buddyCover: c.buddyCover !== undefined ? c.buddyCover : true,
        showWhosIn: c.showWhosIn !== undefined ? c.showWhosIn : true,
        source: c.source || 'manual',
        confirmed: c.confirmed !== undefined ? c.confirmed : true,
        aliases: c.aliases || [],
      }));
    }
    if (d.plannedAbsences && !Array.isArray(d.plannedAbsences)) d.plannedAbsences = Object.values(d.plannedAbsences);
    if (Array.isArray(d.plannedAbsences)) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const cutoff = toLocalIso(yesterday);
      d.plannedAbsences = d.plannedAbsences.filter(a => a.endDate >= cutoff);
    }
    if (d.weeklyRota) {
      for (const day of Object.keys(d.weeklyRota)) {
        if (d.weeklyRota[day] && !Array.isArray(d.weeklyRota[day])) d.weeklyRota[day] = Object.values(d.weeklyRota[day]);
      }
    }
    if (d.dailyOverrides) {
      for (const key of Object.keys(d.dailyOverrides)) {
        const o = d.dailyOverrides[key];
        if (o) {
          if (o.present && !Array.isArray(o.present)) o.present = Object.values(o.present);
          if (o.scheduled && !Array.isArray(o.scheduled)) o.scheduled = Object.values(o.scheduled);
        }
      }
    }
    return d;
  };

  // ─── saveData → POSTs to /api/v4/data ─────────────────────────────
  const saveData = async (newData, showIndicator = true) => {
    // Pre-process: any clinician with a non-UUID id gets a fresh UUID,
    // and we update all references in weeklyRota / dailyOverrides /
    // plannedAbsences to point at the new id. v3 components used
    // numeric IDs (Date.now()); v4 needs UUIDs.
    const isUuid = (v) => typeof v === 'string' && v.length === 36 && v.split('-').length === 5;
    const idMap = {};
    if (Array.isArray(newData.clinicians)) {
      newData.clinicians = newData.clinicians.map(c => {
        if (isUuid(c.id)) return c;
        const newId = crypto.randomUUID();
        idMap[c.id] = newId;
        return { ...c, id: newId };
      });
    }
    if (Object.keys(idMap).length > 0) {
      // Patch references
      if (newData.weeklyRota) {
        for (const day of Object.keys(newData.weeklyRota)) {
          newData.weeklyRota[day] = (newData.weeklyRota[day] || []).map(id => idMap[id] || id);
        }
      }
      if (Array.isArray(newData.plannedAbsences)) {
        newData.plannedAbsences = newData.plannedAbsences.map(a =>
          idMap[a.clinicianId] ? { ...a, clinicianId: idMap[a.clinicianId] } : a
        );
      }
      if (newData.dailyOverrides) {
        for (const k of Object.keys(newData.dailyOverrides)) {
          const o = newData.dailyOverrides[k];
          if (o?.present) o.present = o.present.map(id => idMap[id] || id);
          if (o?.scheduled) o.scheduled = o.scheduled.map(id => idMap[id] || id);
        }
      }
    }

    setData(newData);
    setDataVersion(v => v + 1);

    // Strip huddleCsvData from the wire body unless it actually changed.
    // CSV data can be hundreds of KB; sending it on every save (including
    // routine In/Out toggles) thrashes bandwidth. We compare reference
    // identity against the last-known data — if the user uploaded a new CSV,
    // setData() will have replaced the reference; otherwise it's the same
    // object and we can omit it from the wire payload.
    const currentCsvRef = lastSentCsvRef.current;
    const csvChanged = newData.huddleCsvData && newData.huddleCsvData !== currentCsvRef;
    const bodyToSend = csvChanged ? newData : { ...newData, huddleCsvData: undefined };
    if (csvChanged) {
      lastSentCsvRef.current = newData.huddleCsvData;
    }

    try {
      const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSend),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(result.error || 'Save failed', 'error');
      } else if (result.errors?.length) {
        toast(`Partial save: ${result.errors.length} errors`, 'error');
      } else if (showIndicator) {
        toast('Saved', 'success', 1500);
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast('Save failed', 'error');
    }
  };

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };

  // All of these helpers are copied verbatim from v3 — the data shape is identical
  const getDateKey = () => { const dayIndex = DAYS.indexOf(selectedDay); const date = new Date(selectedWeek); date.setDate(date.getDate() + dayIndex); return toLocalIso(date); };
  const getDateKeyForDay = (day) => { const dayIndex = DAYS.indexOf(day); const date = new Date(selectedWeek); date.setDate(date.getDate() + dayIndex); return toLocalIso(date); };
  const getTodayKey = () => toLocalIso(new Date());
  const isPastDate = (dateKey) => dateKey < getTodayKey();
  const isToday = (dateKey) => dateKey === getTodayKey();
  const isClosedDay = (dateKey) => {
    // Manual entry in data.closedDays still wins
    if (data?.closedDays?.[dateKey] !== undefined) return true;
    // Auto-detect bank holidays from the demand predictor
    try {
      const d = new Date(dateKey + 'T12:00:00');
      const pred = predictDemand(d, null);
      if (pred?.isBankHoliday) return true;
    } catch {}
    return false;
  };
  const getClosedReason = (dateKey) => {
    if (data?.closedDays?.[dateKey] !== undefined) return data.closedDays[dateKey];
    try {
      const d = new Date(dateKey + 'T12:00:00');
      const pred = predictDemand(d, null);
      if (pred?.isBankHoliday) return 'Bank Holiday';
    } catch {}
    return '';
  };
  const toggleClosedDay = (dateKey, reason = 'Bank Holiday') => { if (isPastDate(dateKey)) return; const newClosedDays = { ...data.closedDays }; if (newClosedDays[dateKey]) delete newClosedDays[dateKey]; else newClosedDays[dateKey] = reason; saveData({ ...data, closedDays: newClosedDays }); };
  const hasPlannedAbsence = (clinicianId, dateKey) => ensureArray(data?.plannedAbsences).some(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate);
  const getPlannedAbsenceReason = (clinicianId, dateKey) => { const absence = ensureArray(data?.plannedAbsences).find(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate); return absence?.reason || 'Leave'; };
  const getScheduledForDay = (day) => { const dateKey = getDateKeyForDay(day); const dayKey = `${dateKey}-${day}`; if (data?.dailyOverrides?.[dayKey]?.scheduled) return ensureArray(data.dailyOverrides[dayKey].scheduled); const rota = ensureArray(data?.weeklyRota?.[day]); return rota.filter(id => { const c = data?.clinicians?.find(c => c.id === id); return c && !c.longTermAbsent; }); };
  // Cache day-status computations keyed by (dateKey, day, dataVersion).
  // The previous implementation reset the entire cache on every miss,
  // making it useless. Now we accumulate but evict stale entries (those
  // from a previous dataVersion) to bound memory.
  const dayStatusCache = useRef({ version: 0, entries: {} });
  const getCachedDayStatus = (dateKey, day) => {
    const cache = dayStatusCache.current;
    if (cache.version !== dataVersion) {
      // dataVersion bumped — drop stale entries
      cache.version = dataVersion;
      cache.entries = {};
    }
    const cacheKey = `${dateKey}-${day}`;
    if (cache.entries[cacheKey] === undefined) {
      cache.entries[cacheKey] = computeDayStatus(data, dateKey, day);
    }
    return cache.entries[cacheKey];
  };
  const getPresentClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).present;
  const getAbsentClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).absent;
  const getDayOffClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).dayOff;
  const getClinicianStatus = (id, day) => { const s = getCachedDayStatus(getDateKeyForDay(day), day); if (s.present.includes(id)) return 'present'; if (s.absent.includes(id)) return 'absent'; return 'dayoff'; };

  const togglePresence = (id, day, targetStatus) => {
    const dateKey = getDateKeyForDay(day); if (isPastDate(dateKey)) return;
    const dayKey = `${dateKey}-${day}`; const scheduled = getScheduledForDay(day); const currentPresent = ensureArray(getPresentClinicians(day));
    const currentStatus = getClinicianStatus(id, day);
    const next = targetStatus || (currentStatus === 'present' ? 'dayoff' : currentStatus === 'dayoff' ? 'absent' : 'present');
    let newPresent = [...currentPresent];
    let newScheduled = [...scheduled];
    if (next === 'present') { if (!newPresent.includes(id)) newPresent.push(id); if (!newScheduled.includes(id)) newScheduled.push(id); }
    else if (next === 'absent') { newPresent = newPresent.filter(cid => cid !== id); if (!newScheduled.includes(id)) newScheduled.push(id); }
    else { newPresent = newPresent.filter(cid => cid !== id); newScheduled = newScheduled.filter(cid => cid !== id); }
    const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: newScheduled } };
    const clins = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
    const absentIds = newScheduled.filter(sid => !newPresent.includes(sid));
    const dayOffIds = clins.filter(c => !newScheduled.includes(c.id) && !c.longTermAbsent).map(c => c.id);
    const { allocations, dayOffAllocations } = generateBuddyAllocations(clins, newPresent, absentIds, dayOffIds, data.settings || DEFAULT_SETTINGS);
    const plannedAbs = ensureArray(data.plannedAbsences);
    const rota = ensureArray(data.weeklyRota?.[day]);
    const naturalPresent = new Set(rota.filter(rid => { const c = clins.find(c => c.id === rid); return c && !c.longTermAbsent && !plannedAbs.some(a => a.clinicianId === rid && dateKey >= a.startDate && dateKey <= a.endDate); }));
    const overrideSet = new Set(newPresent);
    const overriddenIds = [];
    overrideSet.forEach(oid => { if (!naturalPresent.has(oid)) overriddenIds.push(oid); });
    naturalPresent.forEach(nid => { if (!overrideSet.has(nid)) overriddenIds.push(nid); });
    const newHistory = { ...data.allocationHistory, [dateKey]: { date: dateKey, day, allocations, dayOffAllocations, presentIds: newPresent, absentIds, dayOffIds, hasOverride: overriddenIds.length > 0, overriddenIds } };
    saveData({ ...data, dailyOverrides: newOverrides, allocationHistory: newHistory });
  };

  const getCurrentAllocations = () => data?.allocationHistory?.[getDateKey()] || null;
  const getClinicianById = (id) => ensureArray(data?.clinicians).find(c => c.id === id);

  const syncTeamNet = async (silent = false) => {
    if (!data?.teamnetUrl) {
      if (!silent) { setSyncStatus('Set TeamNet URL in Settings first'); setTimeout(() => setSyncStatus(''), 4000); }
      return;
    }
    if (!silent) setSyncStatus('Syncing...');
    try {
      const res = await fetch(`/api/v4/sync-teamnet?practice=${encodeURIComponent(practiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data.teamnetUrl, clinicians: ensureArray(data.clinicians) }),
      });
      const result = await res.json();
      if (result.error) {
        if (!silent) setSyncStatus(`Error: ${result.error}`);
      } else {
        const newAbsences = result.absences || [];
        // Merge — replace plannedAbsences with synced ones (matches v3 behaviour)
        saveData({ ...data, plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() }, false);
        if (!silent) setSyncStatus(`Synced — ${newAbsences.length} absences`);
      }
    } catch (err) {
      if (!silent) setSyncStatus('Sync failed');
    }
    if (!silent) setTimeout(() => setSyncStatus(''), 4000);
  };

  const getWeekAbsences = () => {
    const absences = ensureArray(data?.plannedAbsences);
    const weekStart = toLocalIso(selectedWeek);
    const weekEndDate = new Date(selectedWeek); weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = toLocalIso(weekEndDate);
    const weekAbsences = [];
    absences.forEach(a => { DAYS.forEach(day => { const dateKey = getDateKeyForDay(day); if (dateKey >= a.startDate && dateKey <= a.endDate && dateKey >= weekStart && dateKey <= weekEnd) { const clinician = getClinicianById(a.clinicianId); if (clinician) weekAbsences.push({ day, clinician, reason: a.reason }); } }); });
    return weekAbsences;
  };

  const toggleRotaDay = (clinicianId, day) => { const currentRota = ensureArray(data.weeklyRota[day]); const newRota = currentRota.includes(clinicianId) ? currentRota.filter(id => id !== clinicianId) : [...currentRota, clinicianId]; saveData({ ...data, weeklyRota: { ...data.weeklyRota, [day]: newRota } }); };
  const removeClinician = (id) => { if (!confirm('Remove this clinician?')) return; const newClinicians = ensureArray(data.clinicians).filter(c => c.id !== id); const newRota = { ...data.weeklyRota }; DAYS.forEach(day => { newRota[day] = ensureArray(newRota[day]).filter(cid => cid !== id); }); saveData({ ...data, clinicians: newClinicians, weeklyRota: newRota }); };
  const updateClinicianField = (id, field, value) => { const newClinicians = ensureArray(data.clinicians).map(c => { if (c.id !== id) return c; let pv = value; if (field === 'sessions') pv = parseInt(value) || 6; if (field === 'primaryBuddy' || field === 'secondaryBuddy') pv = value ? (/^\d+$/.test(String(value)) ? parseInt(value) : value) : null; return { ...c, [field]: pv }; }); saveData({ ...data, clinicians: newClinicians }); };

  // Loading state
  if (!authChecked || (loading && !data)) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}><PageSkeleton /></div>;
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a', color: '#94a3b8', fontSize: 14 }}>No data loaded.</div>;
  }

  const helpers = { ensureArray, getDateKey, getDateKeyForDay, getTodayKey, isPastDate, isToday, isClosedDay, getClosedReason, toggleClosedDay, hasPlannedAbsence, getPlannedAbsenceReason, getPresentClinicians, getAbsentClinicians, getDayOffClinicians, getClinicianStatus, togglePresence, getCurrentAllocations, getClinicianById, getWeekAbsences, syncTeamNet, toggleRotaDay, removeClinician, updateClinicianField, dataVersion, setDataVersion, setData };

  // password is empty in v4 — components that look at it will get '' (BuddyDaily uses it for sync-teamnet which we've stubbed)
  const password = '';

  return (
    <div className={`min-h-screen flex ${'bg-[#0f172a]'}`}>
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <main className={`flex-1 min-h-screen min-w-0 ${'bg-[#0f172a]'}`}>
        <div className="max-w-6xl mx-auto p-4 lg:p-6 animate-in">
          {activeSection === 'buddy-cover' && <BuddyDaily data={data} saveData={saveData} password={password} toast={toast} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} selectedDay={selectedDay} setSelectedDay={setSelectedDay} syncStatus={syncStatus} setSyncStatus={setSyncStatus} isGenerating={isGenerating} setIsGenerating={setIsGenerating} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'huddle-today' && <HuddleToday data={data} saveData={saveData} toast={toast} huddleData={huddleData} setHuddleData={setHuddleData} huddleMessages={huddleMessages} setHuddleMessages={setHuddleMessages} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-rota' && <MyRota data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-forward' && <HuddleForward data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'workload-audit' && <WorkloadAudit data={data} huddleData={huddleData} />}
          {activeSection === 'qof-tracker' && <div className="card p-12 text-center"><div className="text-3xl mb-3">📋</div><h2 className="text-lg font-semibold text-slate-900">QOF Tracker</h2><p className="text-sm text-slate-500 mt-2">Coming soon — track QOF indicators and achievement rates.</p></div>}
          {activeSection === 'team-members' && <TeamMembers data={data} saveData={saveData} toast={toast} />}
          {activeSection === 'team-rota' && <TeamRota data={data} saveData={saveData} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'settings' && <BuddySettings data={data} saveData={saveData} password={password} syncStatus={syncStatus} setSyncStatus={setSyncStatus} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'changelog' && <Changelog />}
          {activeSection === 'account' && <AccountSettings data={data} />}
          {activeSection === 'room-settings' && <RoomSettings data={data} saveData={saveData} toast={toast} huddleData={huddleData} />}
          {activeSection === 'room-dashboard' && <RoomDashboard data={data} saveData={saveData} huddleData={huddleData} toast={toast} />}
        </div>
        <footer className="mt-8 pb-6">
          <div className="text-center text-xs text-slate-400">
            GPDash — {data._v4?.practiceName || 'Practice'} · v4 Postgres
            {' · '}
            <a href={`/v4/practice/${practiceId}`} style={{ color: '#94a3b8', textDecoration: 'underline' }}>Manage practice</a>
            {' · '}
            {allPractices.length > 1 ? (
              <select
                value={practiceId}
                onChange={(e) => router.push(`/dashboard?practice=${e.target.value}`)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(148,163,184,0.3)',
                  color: '#94a3b8',
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {allPractices.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0f172a', color: '#e2e8f0' }}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            ) : (
              <a href="/v4/dashboard" style={{ color: '#94a3b8', textDecoration: 'underline' }}>Switch practice</a>
            )}
            {' · '}
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/v4/login'); }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
            >Sign out</button>
          </div>
        </footer>
      </main>
    </div>
  );
}
