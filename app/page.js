'use client';

import { useState, useEffect, useRef } from 'react';
import { DAYS, getWeekStart, formatWeekRange, formatDate, getCurrentDay, generateBuddyAllocations, groupAllocationsByCovering, getDefaultData, DEFAULT_SETTINGS, guessGroupFromRole, titleCaseName, toLocalIso, computeDayStatus } from '@/lib/data';
import { ToastProvider, useToast, PageSkeleton } from '@/components/ui';
import Sidebar from '@/components/Sidebar';
import LoginScreen from '@/components/LoginScreen';
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

export default function Home() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const toast = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rotaOnly, setRotaOnly] = useState(() => typeof window !== 'undefined' && window.location.hash.startsWith('#rota-'));
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [data, setData] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => getCurrentDay());
  const [activeSection, setActiveSection] = useState(() => typeof window !== 'undefined' && window.location.hash.startsWith('#rota-') ? 'huddle-rota' : 'huddle-today');
  const [syncStatus, setSyncStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const hasSyncedRef = useRef(false);
  const [huddleData, setHuddleData] = useState(null);
  const [huddleMessages, setHuddleMessages] = useState([]);
  const huddleLoadedRef = useRef(false);

  // Hash routing for direct rota links (e.g. gpdash.net#rota-TM)
  useEffect(() => {
    if (!rotaOnly) return;
    // Fetch read-only data without password
    fetch('/api/data?rota=1').then(r => r.json()).then(d => {
      if (d.clinicians) { setData(normalizeData(d)); setIsAuthenticated(true); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('buddy_password');
    if (stored) {
      setPassword(stored);
      loadData(stored);
    }
  }, []);

  useEffect(() => {
    if (data && data.teamnetUrl && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncTeamNet(true);
    }
  }, [data?.teamnetUrl]);

  useEffect(() => {
    if (data && !huddleLoadedRef.current) {
      huddleLoadedRef.current = true;
      if (data.huddleCsvData) setHuddleData(data.huddleCsvData);
      if (data.huddleMessages) setHuddleMessages(Array.isArray(data.huddleMessages) ? data.huddleMessages : Object.values(data.huddleMessages));
    }
  }, [data]);

  const loadData = async (pwd) => {
    setLoading(true);
    try {
      const res = await fetch('/api/data', { headers: { 'x-password': pwd } });
      if (res.status === 401) {
        setPasswordError('Incorrect password');
        setIsAuthenticated(false);
        sessionStorage.removeItem('buddy_password');
      } else {
        const json = await res.json();
        setData(normalizeData(json));
        setIsAuthenticated(true);
        sessionStorage.setItem('buddy_password', pwd);
        setPasswordError('');
      }
    } catch (err) {
      setData(getDefaultData());
      setIsAuthenticated(true);
    }
    setLoading(false);
  };

  const normalizeData = (d) => {
    if (!d) return d;
    if (d.clinicians && !Array.isArray(d.clinicians)) d.clinicians = Object.values(d.clinicians);
    // Backfill new staff register fields on existing clinicians
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
    // Clean up past absences — remove any that ended more than 1 day ago
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
        const override = d.dailyOverrides[key];
        if (override) {
          if (override.present && !Array.isArray(override.present)) override.present = Object.values(override.present);
          if (override.scheduled && !Array.isArray(override.scheduled)) override.scheduled = Object.values(override.scheduled);
        }
      }
    }
    if (d.allocationHistory) {
      const pruneDate = new Date();
      pruneDate.setMonth(pruneDate.getMonth() - 12);
      const pruneKey = toLocalIso(pruneDate);
      for (const key of Object.keys(d.allocationHistory)) {
        if (key < pruneKey) { delete d.allocationHistory[key]; continue; }
        const entry = d.allocationHistory[key];
        if (entry) {
          if (entry.presentIds && !Array.isArray(entry.presentIds)) entry.presentIds = Object.values(entry.presentIds);
          if (entry.absentIds && !Array.isArray(entry.absentIds)) entry.absentIds = Object.values(entry.absentIds);
          if (entry.dayOffIds && !Array.isArray(entry.dayOffIds)) entry.dayOffIds = Object.values(entry.dayOffIds);
        }
      }
    }
    // Prune predictionHistory older than 12 months
    if (d.predictionHistory) {
      const pruneDate = new Date();
      pruneDate.setMonth(pruneDate.getMonth() - 12);
      const pruneKey = toLocalIso(pruneDate);
      for (const key of Object.keys(d.predictionHistory)) {
        if (key < pruneKey) delete d.predictionHistory[key];
      }
    }
    return d;
  };

  const saveData = async (newData, showIndicator = true) => {
    setData(newData);
    setDataVersion(v => v + 1);
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-password': password },
        body: JSON.stringify(newData)
      });
      if (showIndicator) toast('Saved', 'success', 1500);
    } catch (err) {
      console.error('Save failed:', err);
      toast('Save failed', 'error');
    }
  };

  const handleLogin = (e) => { e.preventDefault(); loadData(password); };
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };

  const getDateKey = () => { const dayIndex = DAYS.indexOf(selectedDay); const date = new Date(selectedWeek); date.setDate(date.getDate() + dayIndex); return toLocalIso(date); };
  const getDateKeyForDay = (day) => { const dayIndex = DAYS.indexOf(day); const date = new Date(selectedWeek); date.setDate(date.getDate() + dayIndex); return toLocalIso(date); };
  const getTodayKey = () => toLocalIso(new Date());
  const isPastDate = (dateKey) => dateKey < getTodayKey();
  const isToday = (dateKey) => dateKey === getTodayKey();
  const isClosedDay = (dateKey) => data?.closedDays?.[dateKey] !== undefined;
  const getClosedReason = (dateKey) => data?.closedDays?.[dateKey] || '';
  const toggleClosedDay = (dateKey, reason = 'Bank Holiday') => { if (isPastDate(dateKey)) return; const newClosedDays = { ...data.closedDays }; if (newClosedDays[dateKey]) delete newClosedDays[dateKey]; else newClosedDays[dateKey] = reason; saveData({ ...data, closedDays: newClosedDays }); };

  const hasPlannedAbsence = (clinicianId, dateKey) => ensureArray(data?.plannedAbsences).some(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate);
  const getPlannedAbsenceReason = (clinicianId, dateKey) => { const absence = ensureArray(data?.plannedAbsences).find(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate); return absence?.reason || 'Leave'; };

  const getScheduledForDay = (day) => { const dateKey = getDateKeyForDay(day); const dayKey = `${dateKey}-${day}`; if (data?.dailyOverrides?.[dayKey]?.scheduled) return ensureArray(data.dailyOverrides[dayKey].scheduled); const rota = ensureArray(data?.weeklyRota?.[day]); return rota.filter(id => { const c = data?.clinicians?.find(c => c.id === id); return c && !c.longTermAbsent; }); };
  // Cache computeDayStatus per dateKey to avoid repeated cascade computation
  const dayStatusCache = useRef({});
  const getCachedDayStatus = (dateKey, day) => {
    const cacheKey = `${dateKey}-${day}-${dataVersion}`;
    if (!dayStatusCache.current[cacheKey]) {
      dayStatusCache.current = { [cacheKey]: computeDayStatus(data, dateKey, day) };
    }
    return dayStatusCache.current[cacheKey] || computeDayStatus(data, dateKey, day);
  };

  const getPresentClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).present;
  const getAbsentClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).absent;
  const getDayOffClinicians = (day) => getCachedDayStatus(getDateKeyForDay(day), day).dayOff;
  const getClinicianStatus = (id, day) => { const s = getCachedDayStatus(getDateKeyForDay(day), day); if (s.present.includes(id)) return 'present'; if (s.absent.includes(id)) return 'absent'; return 'dayoff'; };

  const togglePresence = (id, day, targetStatus) => {
    const dateKey = getDateKeyForDay(day); if (isPastDate(dateKey)) return;
    const dayKey = `${dateKey}-${day}`; const scheduled = getScheduledForDay(day); const currentPresent = ensureArray(getPresentClinicians(day));
    const currentStatus = getClinicianStatus(id, day);

    // If targetStatus provided, go directly there; otherwise cycle: present → dayoff → absent → present
    const next = targetStatus || (currentStatus === 'present' ? 'dayoff' : currentStatus === 'dayoff' ? 'absent' : 'present');

    let newPresent = [...currentPresent];
    let newScheduled = [...scheduled];

    if (next === 'present') {
      if (!newPresent.includes(id)) newPresent.push(id);
      if (!newScheduled.includes(id)) newScheduled.push(id);
    } else if (next === 'absent') {
      newPresent = newPresent.filter(cid => cid !== id);
      if (!newScheduled.includes(id)) newScheduled.push(id);
    } else { // dayoff
      newPresent = newPresent.filter(cid => cid !== id);
      newScheduled = newScheduled.filter(cid => cid !== id);
    }

    const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: newScheduled } };
    // Auto-regenerate buddy allocations with updated presence
    const clins = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
    const absentIds = newScheduled.filter(sid => !newPresent.includes(sid));
    const dayOffIds = clins.filter(c => !newScheduled.includes(c.id) && !c.longTermAbsent).map(c => c.id);
    const { allocations, dayOffAllocations } = generateBuddyAllocations(clins, newPresent, absentIds, dayOffIds, data.settings || DEFAULT_SETTINGS);
    // Compute natural present to detect overrides
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
    if (!data?.teamnetUrl) { if (!silent) { setSyncStatus('Set TeamNet URL in Settings first'); setTimeout(() => setSyncStatus(''), 4000); } return; }
    if (!silent) setSyncStatus('Syncing...');
    try {
      const res = await fetch('/api/sync-teamnet', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify({ url: data.teamnetUrl, clinicians: ensureArray(data.clinicians) }) });
      const result = await res.json();
      if (result.error) { if (!silent) setSyncStatus(`Error: ${result.error}`); }
      else { const newAbsences = result.absences || []; saveData({ ...data, plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() }, false); if (!silent) setSyncStatus(`Synced — ${newAbsences.length} absences`); }
    } catch (err) { if (!silent) setSyncStatus('Sync failed'); }
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
  const updateClinicianField = (id, field, value) => { const newClinicians = ensureArray(data.clinicians).map(c => { if (c.id !== id) return c; let pv = value; if (field === 'sessions') pv = parseInt(value) || 6; if (field === 'primaryBuddy' || field === 'secondaryBuddy') pv = value ? parseInt(value) : null; return { ...c, [field]: pv }; }); saveData({ ...data, clinicians: newClinicians }); };

  if (!isAuthenticated && !rotaOnly) return <LoginScreen password={password} setPassword={setPassword} onLogin={handleLogin} loading={loading} error={passwordError} />;
  if (!data) return <div className="min-h-screen flex items-center justify-center" style={{ background: rotaOnly ? 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)' : '#f1f5f9' }}><PageSkeleton /></div>;

  // Standalone rota view — no sidebar, read-only
  if (rotaOnly) return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      <div className="max-w-2xl mx-auto py-6 px-4">
        <MyRota data={data} huddleData={huddleData} standalone />
      </div>
    </div>
  );

  // Shared helpers object passed to child components
  const helpers = { ensureArray, getDateKey, getDateKeyForDay, getTodayKey, isPastDate, isToday, isClosedDay, getClosedReason, toggleClosedDay, hasPlannedAbsence, getPlannedAbsenceReason, getPresentClinicians, getAbsentClinicians, getDayOffClinicians, getClinicianStatus, togglePresence, getCurrentAllocations, getClinicianById, getWeekAbsences, syncTeamNet, toggleRotaDay, removeClinician, updateClinicianField, dataVersion, setDataVersion, setData };

  return (
    <div className={`min-h-screen flex ${activeSection === 'huddle-today' || activeSection === 'buddy-cover' ? 'bg-[#0f172a]' : 'bg-slate-100'}`}>
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <main className={`flex-1 min-h-screen min-w-0 ${activeSection === 'huddle-today' || activeSection === 'buddy-cover' ? 'bg-[#0f172a]' : ''}`}>
        <div className="max-w-6xl mx-auto p-4 lg:p-6 animate-in">
          {activeSection === 'buddy-cover' && <BuddyDaily data={data} saveData={saveData} password={password} toast={toast} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} selectedDay={selectedDay} setSelectedDay={setSelectedDay} syncStatus={syncStatus} setSyncStatus={setSyncStatus} isGenerating={isGenerating} setIsGenerating={setIsGenerating} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'huddle-today' && <HuddleToday data={data} saveData={saveData} toast={toast} huddleData={huddleData} setHuddleData={setHuddleData} huddleMessages={huddleMessages} setHuddleMessages={setHuddleMessages} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-rota' && <MyRota data={data} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'huddle-forward' && <HuddleForward data={data} saveData={saveData} huddleData={huddleData} setActiveSection={setActiveSection} />}
          {activeSection === 'workload-audit' && <WorkloadAudit data={data} huddleData={huddleData} />}
          {activeSection === 'qof-tracker' && <div className="card p-12 text-center"><div className="text-3xl mb-3">📋</div><h2 className="text-lg font-semibold text-slate-900">QOF Tracker</h2><p className="text-sm text-slate-500 mt-2">Coming soon — track QOF indicators and achievement rates.</p></div>}
          {activeSection === 'team-members' && <TeamMembers data={data} saveData={saveData} toast={toast} />}
          {activeSection === 'team-rota' && <TeamRota data={data} saveData={saveData} helpers={helpers} />}
          {activeSection === 'settings' && <BuddySettings data={data} saveData={saveData} password={password} syncStatus={syncStatus} setSyncStatus={setSyncStatus} helpers={helpers} huddleData={huddleData} />}
          {activeSection === 'changelog' && <Changelog />}
          {activeSection === 'room-settings' && <RoomSettings data={data} saveData={saveData} toast={toast} huddleData={huddleData} />}
          {activeSection === 'room-dashboard' && <RoomDashboard data={data} saveData={saveData} huddleData={huddleData} toast={toast} />}
        </div>
        <footer className="mt-8 pb-6"><div className="text-center text-xs text-slate-400">GPDash — Practice Dashboard</div></footer>
      </main>
    </div>
  );
}
