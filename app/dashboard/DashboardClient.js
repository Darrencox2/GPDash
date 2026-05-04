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

import { Suspense, lazy } from 'react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DAYS, getWeekStart, getCurrentDay, generateBuddyAllocations, getDefaultData, DEFAULT_SETTINGS, guessGroupFromRole, titleCaseName, toLocalIso, computeDayStatus } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';
import { ToastProvider, useToast, PageSkeleton } from '@/components/ui';
import Sidebar from '@/components/Sidebar';
import { canEditPracticeData, isPlatformAdmin } from '@/lib/permissions';
import { createClient } from '@/utils/supabase/client';

// Lazy-load section components — they're each 50–200KB with heavy
// dependencies. Loading them on demand cuts initial bundle dramatically
// and means the user doesn't pay for sections they never visit.
const BuddyDaily = lazy(() => import('@/components/buddy/BuddyDaily'));
const TeamMembers = lazy(() => import('@/components/buddy/TeamMembers'));
const TeamRota = lazy(() => import('@/components/buddy/TeamRota'));
const BuddySettings = lazy(() => import('@/components/buddy/BuddySettings'));
const HuddleToday = lazy(() => import('@/components/huddle/HuddleToday'));
const HuddleForward = lazy(() => import('@/components/huddle/HuddleForward'));
const WorkloadAudit = lazy(() => import('@/components/huddle/WorkloadAudit'));
const MyRota = lazy(() => import('@/components/huddle/MyRota'));
const RoomSettings = lazy(() => import('@/components/room/RoomSettings'));
const RoomDashboard = lazy(() => import('@/components/room/RoomDashboard'));
const Changelog = lazy(() => import('@/components/Changelog'));
const AccountSettings = lazy(() => import('@/components/AccountSettings'));
const PerfOverlay = lazy(() => import('@/components/PerfOverlay'));

// Static normalizer — same logic as the in-component one, but pulled to
// module scope so it can run at state-init time (before the component
// has rendered).
function normalizeDataStatic(d) {
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
}

export default function DashboardRoot({ initialData = null, initialPracticeId = null, serverTimings = null }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>Loading...</div>}>
      <ToastProvider>
        <DashboardContent initialData={initialData} initialPracticeId={initialPracticeId} serverTimings={serverTimings} />
      </ToastProvider>
    </Suspense>
  );
}

function DashboardContent({ initialData, initialPracticeId, serverTimings }) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const practiceId = searchParams.get('practice') || initialPracticeId;
  const supabase = createClient();

  // Hydrate state from server-provided initial data. This means first paint
  // shows a fully-populated dashboard with no loading spinner.
  const [authChecked, setAuthChecked] = useState(!!initialData);
  const [data, setData] = useState(() => initialData ? normalizeDataStatic(initialData) : null);
  const [allPractices, setAllPractices] = useState(() => initialData?._v4?.practices || []);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(!initialData);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => getCurrentDay());
  const [activeSection, setActiveSection] = useState('huddle-today');
  const [syncStatus, setSyncStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [huddleData, setHuddleData] = useState(() => initialData?.huddleCsvData || null);
  const [huddleMessages, setHuddleMessages] = useState([]);
  const huddleLoadedRef = useRef(false);
  const lastSentCsvRef = useRef(initialData?.huddleCsvData || null);  // tracks the last CSV reference we sent to the server, for save-time bandwidth optimisation

  // Single load effect: fetch data immediately. The API endpoint handles
  // auth and returns 401 if not signed in; we redirect on that.
  // No client-side auth round-trip — saves ~300-500ms on cold loads.
  // SKIPPED entirely when initialData was provided by the server component.
  useEffect(() => {
    if (initialData) return;  // already hydrated from SSR
    if (!practiceId) {
      router.replace('/v4/dashboard');
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`);
        if (cancelled) return;

        if (res.status === 401) {
          router.replace('/v4/login');
          return;
        }
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
        setAuthChecked(true);
        if (json._v4?.practices) {
          setAllPractices(json._v4.practices);
        }
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
                  body: JSON.stringify({ plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() }),
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
  }, [practiceId, router, toast, initialData]);

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

  // ─── saveData — debounced, optimistic ──────────────────────────────
  // Rapid In/Out toggles, note edits etc. used to fire one fetch per
  // click. With network latency that meant 500ms+ per action. Now:
  //
  //   1. setData() updates UI immediately (already optimistic)
  //   2. The actual POST is debounced 250ms — multiple saves coalesce
  //   3. The "latest" data wins because we save state.dataRef.current
  //      at flush time, so we always POST the freshest data
  //
  // This means clicking In/Out 5 times rapidly = 1 network round-trip
  // instead of 5. Save still happens within ~300ms of the last click.
  const pendingSaveRef = useRef({ timer: null, latestData: null, showIndicator: false, pendingResolves: [] });

  const flushSave = useCallback(async () => {
    const pending = pendingSaveRef.current;
    if (!pending.latestData) return;
    const dataToSend = pending.latestData;
    const showIndicator = pending.showIndicator;
    const resolves = pending.pendingResolves;
    pending.latestData = null;
    pending.showIndicator = false;
    pending.pendingResolves = [];
    pending.timer = null;

    // Strip huddleCsvData from the wire body unless it actually changed
    const csvChanged = dataToSend.huddleCsvData && dataToSend.huddleCsvData !== lastSentCsvRef.current;
    const bodyToSend = csvChanged ? dataToSend : { ...dataToSend, huddleCsvData: undefined };
    if (csvChanged) lastSentCsvRef.current = dataToSend.huddleCsvData;

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
      resolves.forEach(r => r(result));
    } catch (err) {
      console.error('Save failed:', err);
      toast('Save failed', 'error');
      resolves.forEach(r => r({ error: err.message }));
    }
  }, [practiceId, toast]);

  const saveData = useCallback((newData, showIndicator = true) => {
    // Pre-process: assign UUIDs to any new clinicians (v3 components use Date.now())
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

    // Optimistic local update
    setData(newData);
    setDataVersion(v => v + 1);

    // Schedule debounced flush
    const pending = pendingSaveRef.current;
    pending.latestData = newData;
    pending.showIndicator = pending.showIndicator || showIndicator;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => { flushSave(); }, 250);

    // Return a promise in case caller wants to await; resolves when flush completes
    return new Promise((resolve) => { pending.pendingResolves.push(resolve); });
  }, [flushSave]);

  // Flush any pending save when the user navigates away (or component unmounts)
  useEffect(() => {
    const onBeforeUnload = (e) => {
      const pending = pendingSaveRef.current;
      if (pending.timer) {
        clearTimeout(pending.timer);
        // We can't await the fetch on beforeunload reliably, so use sendBeacon
        // (fire-and-forget, browser keeps it alive after page unload).
        try {
          const dataToSend = pending.latestData;
          if (dataToSend) {
            const csvChanged = dataToSend.huddleCsvData && dataToSend.huddleCsvData !== lastSentCsvRef.current;
            const bodyToSend = csvChanged ? dataToSend : { ...dataToSend, huddleCsvData: undefined };
            const blob = new Blob([JSON.stringify(bodyToSend)], { type: 'application/json' });
            navigator.sendBeacon(`/api/v4/data?practice=${encodeURIComponent(practiceId)}`, blob);
          }
        } catch {}
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Component unmounting — flush immediately
      const pending = pendingSaveRef.current;
      if (pending.timer) {
        clearTimeout(pending.timer);
        flushSave();
      }
    };
  }, [practiceId, flushSave]);

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
  if (loading && !data) {
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
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} data={data} />
      <main className={`flex-1 min-h-screen min-w-0 ${'bg-[#0f172a]'}`}>
        <div className="max-w-6xl mx-auto p-4 lg:p-6 animate-in">
          {/* Practice setup banner — shown to admins/owners when setup_completed_at is null */}
          {!data._v4?.setupCompletedAt && canEditPracticeData(data) && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                <strong style={{ color: '#67e8f9' }}>Finish practice setup</strong>
                {' · '}Add your postcode, list size and consultation tool so demand
                predictions calibrate to your practice.
              </div>
              <a
                href={`/v4/practice/${data._v4?.practiceSlug || practiceId}/setup`}
                style={{
                  fontSize: 12, fontWeight: 500,
                  color: 'white', background: '#0891b2',
                  padding: '6px 12px', borderRadius: 6,
                  textDecoration: 'none',
                }}
              >Open setup →</a>
            </div>
          )}
          <Suspense fallback={<div className="text-sm text-slate-500 py-12 text-center">Loading…</div>}>
          {activeSection === 'buddy-cover' && <BuddyDaily data={data} saveData={saveData} password={password} toast={toast} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} selectedDay={selectedDay} setSelectedDay={setSelectedDay} syncStatus={syncStatus} setSyncStatus={setSyncStatus} isGenerating={isGenerating} setIsGenerating={setIsGenerating} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'huddle-today' && <HuddleToday data={data} saveData={saveData} toast={toast} huddleData={huddleData} setHuddleData={setHuddleData} huddleMessages={huddleMessages} setHuddleMessages={setHuddleMessages} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-rota' && <MyRota data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-forward' && <HuddleForward data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'workload-audit' && <WorkloadAudit data={data} huddleData={huddleData} />}
          {activeSection === 'qof-tracker' && <div className="card p-12 text-center"><div className="text-3xl mb-3">📋</div><h2 className="text-lg font-semibold text-slate-900">QOF Tracker</h2><p className="text-sm text-slate-500 mt-2">Coming soon — track QOF indicators and achievement rates.</p></div>}
          {activeSection === 'team-members' && <TeamMembers data={data} saveData={saveData} toast={toast} setActiveSection={setActiveSection} />}
          {activeSection === 'team-rota' && <TeamRota data={data} saveData={saveData} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'settings' && <BuddySettings data={data} saveData={saveData} password={password} syncStatus={syncStatus} setSyncStatus={setSyncStatus} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'changelog' && <Changelog />}
          {activeSection === 'account' && <AccountSettings data={data} />}
          {activeSection === 'room-settings' && <RoomSettings data={data} saveData={saveData} toast={toast} huddleData={huddleData} />}
          {activeSection === 'room-dashboard' && <RoomDashboard data={data} saveData={saveData} huddleData={huddleData} toast={toast} />}
          </Suspense>
        </div>
        <footer className="mt-8 pb-6">
          <div className="text-center text-xs text-slate-400">
            GPDash — {data._v4?.practiceName || 'Practice'} · v4 Postgres
            {canEditPracticeData(data) && (
              <>
                {' · '}
                <a href={`/v4/practice/${data._v4?.practiceSlug || practiceId}`} style={{ color: '#94a3b8', textDecoration: 'underline' }}>Manage practice</a>
              </>
            )}
            {isPlatformAdmin(data) && (
              <>
                {' · '}
                <a href="/v4/admin" style={{ color: '#22d3ee', textDecoration: 'underline' }}>Platform admin</a>
              </>
            )}
            {' · '}
            {allPractices.length > 1 ? (
              <select
                value={practiceId}
                onChange={(e) => {
                  const p = allPractices.find(x => x.id === e.target.value);
                  router.push(`/p/${p?.slug || e.target.value}`);
                }}
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
      {searchParams.get('debug') === 'perf' && (
        <Suspense fallback={null}>
          <PerfOverlay serverTimings={serverTimings} />
        </Suspense>
      )}
    </div>
  );
}
