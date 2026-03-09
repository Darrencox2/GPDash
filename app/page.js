'use client';

import { useState, useEffect } from 'react';
import { DAYS, getWeekStart, formatWeekRange, formatDate, getCurrentDay, generateBuddyAllocations, groupAllocationsByCovering, getDefaultData, DEFAULT_SETTINGS } from '@/lib/data';

// Practice logo
const LOGO_URL = "/logo.png";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [data, setData] = useState(null);
  const [dataVersion, setDataVersion] = useState(0); // Increment to force re-renders
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => getCurrentDay());
  const [activeTab, setActiveTab] = useState('allocate');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAddClinician, setShowAddClinician] = useState(false);
  const [newClinician, setNewClinician] = useState({ name: '', role: '', initials: '', sessions: 6 });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dataSaved, setDataSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Check for stored password on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('buddy_password');
    if (stored) {
      setPassword(stored);
      loadData(stored);
    }
  }, []);

  const loadData = async (pwd) => {
    setLoading(true);
    try {
      const res = await fetch('/api/data', {
        headers: { 'x-password': pwd }
      });
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
      // If API fails, use default data (for local dev)
      setData(getDefaultData());
      setIsAuthenticated(true);
    }
    setLoading(false);
  };

  // Normalize data to fix any arrays that got converted to objects
  const normalizeData = (d) => {
    if (!d) return d;
    
    // Fix clinicians array
    if (d.clinicians && !Array.isArray(d.clinicians)) {
      d.clinicians = Object.values(d.clinicians);
    }
    
    // Fix plannedAbsences array
    if (d.plannedAbsences && !Array.isArray(d.plannedAbsences)) {
      d.plannedAbsences = Object.values(d.plannedAbsences);
    }
    
    // Fix weeklyRota - each day should be an array
    if (d.weeklyRota) {
      for (const day of Object.keys(d.weeklyRota)) {
        if (d.weeklyRota[day] && !Array.isArray(d.weeklyRota[day])) {
          d.weeklyRota[day] = Object.values(d.weeklyRota[day]);
        }
      }
    }
    
    // Fix dailyOverrides - present and scheduled should be arrays
    if (d.dailyOverrides) {
      for (const key of Object.keys(d.dailyOverrides)) {
        const override = d.dailyOverrides[key];
        if (override) {
          if (override.present && !Array.isArray(override.present)) {
            override.present = Object.values(override.present);
          }
          if (override.scheduled && !Array.isArray(override.scheduled)) {
            override.scheduled = Object.values(override.scheduled);
          }
        }
      }
    }
    
    // Fix allocationHistory - presentIds, absentIds, dayOffIds should be arrays
    if (d.allocationHistory) {
      for (const key of Object.keys(d.allocationHistory)) {
        const entry = d.allocationHistory[key];
        if (entry) {
          if (entry.presentIds && !Array.isArray(entry.presentIds)) {
            entry.presentIds = Object.values(entry.presentIds);
          }
          if (entry.absentIds && !Array.isArray(entry.absentIds)) {
            entry.absentIds = Object.values(entry.absentIds);
          }
          if (entry.dayOffIds && !Array.isArray(entry.dayOffIds)) {
            entry.dayOffIds = Object.values(entry.dayOffIds);
          }
        }
      }
    }
    
    return d;
  };

  const saveData = async (newData, showIndicator = true) => {
    setData(newData);
    setDataVersion(v => v + 1); // Force re-render of all components
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-password': password 
        },
        body: JSON.stringify(newData)
      });
      if (showIndicator) {
        setDataSaved(true);
        setTimeout(() => setDataSaved(false), 1500);
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    loadData(password);
  };

  // Helper to ensure value is an array
  const ensureArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val);
  };

  // Helper to safely check if array includes item
  const safeIncludes = (arr, item) => {
    const list = ensureArray(arr);
    return list.includes(item);
  };

  // Helper functions
  const getDateKey = () => {
    const dayIndex = DAYS.indexOf(selectedDay);
    const date = new Date(selectedWeek);
    date.setDate(date.getDate() + dayIndex);
    return date.toISOString().split('T')[0];
  };

  const getDateKeyForDay = (day) => {
    const dayIndex = DAYS.indexOf(day);
    const date = new Date(selectedWeek);
    date.setDate(date.getDate() + dayIndex);
    return date.toISOString().split('T')[0];
  };

  const getTodayKey = () => {
    return new Date().toISOString().split('T')[0];
  };

  const isPastDate = (dateKey) => {
    return dateKey < getTodayKey();
  };

  const isToday = (dateKey) => {
    return dateKey === getTodayKey();
  };

  const isClosedDay = (dateKey) => {
    return data?.closedDays?.[dateKey] !== undefined;
  };

  const getClosedReason = (dateKey) => {
    return data?.closedDays?.[dateKey] || '';
  };

  const toggleClosedDay = (dateKey, reason = 'Bank Holiday') => {
    if (isPastDate(dateKey)) return; // Can't change past days
    const newClosedDays = { ...data.closedDays };
    if (newClosedDays[dateKey]) {
      delete newClosedDays[dateKey];
    } else {
      newClosedDays[dateKey] = reason;
    }
    saveData({ ...data, closedDays: newClosedDays });
  };

  // Check if clinician has a planned absence on a specific date
  const hasPlannedAbsence = (clinicianId, dateKey) => {
    const absences = data?.plannedAbsences || [];
    return absences.some(a => 
      a.clinicianId === clinicianId && 
      dateKey >= a.startDate && 
      dateKey <= a.endDate
    );
  };

  // Get planned absence reason for a clinician on a date
  const getPlannedAbsenceReason = (clinicianId, dateKey) => {
    const absences = data?.plannedAbsences || [];
    const absence = absences.find(a => 
      a.clinicianId === clinicianId && 
      dateKey >= a.startDate && 
      dateKey <= a.endDate
    );
    return absence?.reason || '';
  };

  const getScheduledClinicians = (day) => {
    return ensureArray(data?.weeklyRota?.[day]);
  };

  // Get long-term absent clinician IDs
  const getLongTermAbsentIds = () => {
    return data?.clinicians?.filter(c => c.longTermAbsent).map(c => c.id) || [];
  };

  // Get clinicians with planned absences for a specific date
  const getPlannedAbsentIds = (dateKey) => {
    const absences = data?.plannedAbsences || [];
    return absences
      .filter(a => dateKey >= a.startDate && dateKey <= a.endDate)
      .map(a => a.clinicianId);
  };

  const getPresentClinicians = (day) => {
    const dateKey = getDateKeyForDay(day);
    const overrideKey = `${dateKey}-${day}`;
    const override = data?.dailyOverrides?.[overrideKey];
    const scheduled = getScheduledClinicians(day);
    const longTermAbsentIds = getLongTermAbsentIds();
    const plannedAbsentIds = getPlannedAbsentIds(dateKey);
    
    // If there's a manual override, use it directly (user has explicitly set attendance)
    if (override?.present) {
      return ensureArray(override.present);
    }
    
    // No override - use scheduled minus long-term absent and planned absent
    return ensureArray(scheduled).filter(id => !longTermAbsentIds.includes(id) && !plannedAbsentIds.includes(id));
  };

  // Check if a clinician is absent on a specific working date
  const isAbsentOnWorkingDate = (cid, dateKey, dayName) => {
    const clinician = data?.clinicians?.find(c => c.id === cid);
    if (!clinician) return false;
    
    // Check long-term absent
    if (clinician.longTermAbsent) return true;
    
    // Check planned absences
    if (hasPlannedAbsence(cid, dateKey)) return true;
    
    // Check daily overrides
    const overrideKey = `${dateKey}-${dayName}`;
    const override = data?.dailyOverrides?.[overrideKey];
    
    if (override?.present) {
      return !ensureArray(override.present).includes(cid);
    }
    
    // No override - they're present by default on working days (unless LTA/planned, already checked)
    return false;
  };

  // Check if clinician should be marked absent on this day (Mon-Fri only, weekends ignored)
  // Rule: If there's ANY absent working day between their last present working day and their next present working day, today is absent
  const isAbsentUntilNextPresent = (cid, fromDateKey) => {
    const clinician = data?.clinicians?.find(c => c.id === cid);
    if (!clinician) return false;
    
    // If long-term absent, always absent
    if (clinician.longTermAbsent) return true;
    
    // Get their working days pattern (Mon-Fri only)
    const workingDays = DAYS.filter(day => {
      const rota = ensureArray(data?.weeklyRota?.[day]);
      return rota.includes(cid);
    });
    
    if (workingDays.length === 0) return false;
    
    const indexToDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const startDate = new Date(fromDateKey + 'T12:00:00');
    
    // First, look BACK to find the most recent working day (up to 7 days)
    // and check if it was absent
    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() - i);
      const dayIndex = checkDate.getDay();
      const dayName = indexToDay[dayIndex];
      const checkDateKey = checkDate.toISOString().split('T')[0];
      
      // Skip weekends
      if (dayIndex === 0 || dayIndex === 6) continue;
      
      if (workingDays.includes(dayName)) {
        // Found their most recent working day
        const wasAbsent = isAbsentOnWorkingDate(cid, checkDateKey, dayName);
        if (wasAbsent) {
          // Their last working day was absent - they're still in the absence period
          return true;
        }
        // Their last working day was present - break and check forward
        break;
      }
    }
    
    // Now scan FORWARD through weekdays to see if any upcoming working days are absent
    for (let i = 0; i <= 28; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dayIndex = checkDate.getDay();
      const dayName = indexToDay[dayIndex];
      const checkDateKey = checkDate.toISOString().split('T')[0];
      
      // Skip weekends
      if (dayIndex === 0 || dayIndex === 6) continue;
      
      if (workingDays.includes(dayName)) {
        const absentOnThisDay = isAbsentOnWorkingDate(cid, checkDateKey, dayName);
        
        if (absentOnThisDay) {
          // Found an upcoming absent working day - today is part of absence period
          return true;
        } else {
          // Found a present working day with no absent days before it
          return false;
        }
      }
    }
    
    return false;
  };

  const getAbsentClinicians = (day) => {
    const dateKey = getDateKeyForDay(day);
    const scheduled = ensureArray(getScheduledForDay(day));
    const present = ensureArray(getPresentClinicians(day));
    const scheduledAbsent = scheduled.filter(id => !present.includes(id));
    
    // Also include day-off clinicians who are absent until their next present working day
    const clinicians = ensureArray(data?.clinicians);
    const dayOffIds = clinicians.filter(c => !scheduled.includes(c.id)).map(c => c.id);
    const dayOffButAbsent = dayOffIds.filter(id => isAbsentUntilNextPresent(id, dateKey));
    
    return [...scheduledAbsent, ...dayOffButAbsent];
  };

  const getDayOffClinicians = (day) => {
    const dateKey = getDateKeyForDay(day);
    const scheduled = ensureArray(getScheduledForDay(day));
    const clinicians = ensureArray(data?.clinicians);
    const dayOffIds = clinicians.filter(c => !scheduled.includes(c.id)).map(c => c.id);
    
    // Exclude those who are absent until their next present working day
    return dayOffIds.filter(id => !isAbsentUntilNextPresent(id, dateKey));
  };

  // Get scheduled clinicians for a day, considering overrides
  const getScheduledForDay = (day) => {
    const dateKey = getDateKeyForDay(day);
    const overrideKey = `${dateKey}-${day}`;
    const override = data?.dailyOverrides?.[overrideKey];
    // If there's an override with a scheduled list, use it; otherwise use weekly rota
    if (override?.scheduled) {
      return ensureArray(override.scheduled);
    }
    return getScheduledClinicians(day);
  };

  const getClinicianStatus = (cid, day) => {
    const dateKey = getDateKeyForDay(day);
    const scheduled = ensureArray(getScheduledForDay(day));
    const present = ensureArray(getPresentClinicians(day));
    
    // If not scheduled, check if absent until next present working day
    if (!scheduled.includes(cid)) {
      if (isAbsentUntilNextPresent(cid, dateKey)) {
        return 'absent';
      }
      return 'dayoff';
    }
    if (present.includes(cid)) return 'present';
    return 'absent';
  };

  const getClinicianById = (id) => data?.clinicians?.find(c => c.id === id);

  const togglePresence = (cid, day) => {
    try {
      const dateKey = getDateKeyForDay(day);
      if (isPastDate(dateKey)) return; // Can't change past days
      
      const overrideKey = `${dateKey}-${day}`;
      
      // Get current present list, considering overrides
      let currentPresent = [...ensureArray(getPresentClinicians(day))];
      let currentScheduled = [...ensureArray(getScheduledForDay(day))];
      
      if (currentPresent.includes(cid)) {
        // Currently present -> make absent (or day off if not scheduled)
        currentPresent = currentPresent.filter(id => id !== cid);
      } else {
        // Currently absent/day off -> make present
        currentPresent.push(cid);
        // If they weren't scheduled, add them to scheduled for this override
        if (!currentScheduled.includes(cid)) {
          currentScheduled.push(cid);
        }
      }

      // Calculate new absent and day-off lists
      const clinicians = ensureArray(data.clinicians);
      const newAbsentIds = currentScheduled.filter(id => !currentPresent.includes(id));
      const newDayOffIds = clinicians
        .filter(c => !currentScheduled.includes(c.id) && !currentPresent.includes(c.id))
        .map(c => c.id);

      // Regenerate allocations for this day
      const { allocations, dayOffAllocations } = generateBuddyAllocations(
        clinicians,
        currentPresent,
        newAbsentIds,
        newDayOffIds,
        data.settings || {}
      );

      const historyEntry = {
        date: dateKey,
        day,
        allocations,
        dayOffAllocations,
        presentIds: currentPresent,
        absentIds: newAbsentIds,
        dayOffIds: newDayOffIds
      };

      const newData = {
        ...data,
        dailyOverrides: {
          ...data.dailyOverrides,
          [overrideKey]: { present: currentPresent, scheduled: currentScheduled }
        },
        allocationHistory: {
          ...data.allocationHistory,
          [dateKey]: historyEntry
        }
      };
      saveData(newData);
    } catch (err) {
      console.error('Toggle error:', err);
      alert('Toggle error: ' + err.message);
    }
  };

  const toggleRotaDay = (cid, day) => {
    const dayRota = ensureArray(data.weeklyRota[day]);
    const newRota = dayRota.includes(cid)
      ? dayRota.filter(id => id !== cid)
      : [...dayRota, cid];

    const newData = {
      ...data,
      weeklyRota: { ...data.weeklyRota, [day]: newRota }
    };
    saveData(newData);
  };

  const handleGenerate = () => {
    const dateKey = getDateKey();
    if (isPastDate(dateKey)) return; // Can't generate for past days
    
    const presentIds = getPresentClinicians(selectedDay);
    const absentIds = getAbsentClinicians(selectedDay);
    const dayOffIds = getDayOffClinicians(selectedDay);
    const settings = data.settings || DEFAULT_SETTINGS;
    const clinicians = ensureArray(data.clinicians);

    const { allocations, dayOffAllocations } = generateBuddyAllocations(
      clinicians, presentIds, absentIds, dayOffIds, settings
    );

    const historyEntry = {
      date: dateKey,
      day: selectedDay,
      timestamp: new Date().toISOString(),
      allocations,
      dayOffAllocations,
      presentIds,
      absentIds,
      dayOffIds,
      clinicianSnapshot: clinicians.reduce((acc, c) => {
        acc[c.id] = { name: c.name, initials: c.initials, role: c.role };
        return acc;
      }, {})
    };

    const newData = {
      ...data,
      allocationHistory: { ...data.allocationHistory, [dateKey]: historyEntry }
    };
    saveData(newData);
  };

  const getCurrentAllocations = () => {
    const dateKey = getDateKey();
    return data?.allocationHistory?.[dateKey] || null;
  };

  const copyToClipboard = async () => {
    const entry = getCurrentAllocations();
    if (!entry) return;

    const grouped = groupAllocationsByCovering(entry.allocations || {}, entry.dayOffAllocations || {}, entry.presentIds);
    const lines = [
      'BUDDY ALLOCATION',
      formatDate(entry.date),
      ''
    ];

    // Build list of all present clinicians with their allocation data, sorted
    const allPresentRows = presentIds.map(id => {
      const clinician = getClinicianById(id);
      const tasks = grouped[id] || { absent: [], dayOff: [] };
      const canCover = clinician?.canProvideCover !== false;
      const hasAllocs = tasks.absent.length > 0 || tasks.dayOff.length > 0;
      return { id, clinician, tasks, canCover, hasAllocs };
    }).filter(row => row.clinician);
    
    // Sort: can cover with allocations first, then can cover without, then cannot cover
    allPresentRows.sort((a, b) => {
      if (a.canCover && !b.canCover) return -1;
      if (!a.canCover && b.canCover) return 1;
      if (a.canCover && b.canCover) {
        if (a.hasAllocs && !b.hasAllocs) return -1;
        if (!a.hasAllocs && b.hasAllocs) return 1;
      }
      return 0;
    });

    allPresentRows.forEach(({ clinician, tasks }) => {
      const fileStr = tasks.absent.length > 0 ? tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
      const viewStr = tasks.dayOff.length > 0 ? tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
      
      lines.push(`${clinician.initials}: File ${fileStr} / View ${viewStr}`);
    });

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const resetDailyOverrides = () => {
    const dateKey = getDateKey();
    const overrideKey = `${dateKey}-${selectedDay}`;
    const newOverrides = { ...data.dailyOverrides };
    delete newOverrides[overrideKey];
    saveData({ ...data, dailyOverrides: newOverrides });
  };

  const addClinician = () => {
    if (!newClinician.name.trim()) return;

    const cliniciansList = ensureArray(data.clinicians);
    const newId = Math.max(...cliniciansList.map(c => c.id), 0) + 1;
    let initials = newClinician.initials.trim().toUpperCase();
    if (!initials) {
      const parts = newClinician.name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s*/i, '').trim().split(' ');
      initials = parts.map(p => p[0]?.toUpperCase() || '').join('');
    }

    const clinician = {
      id: newId,
      name: newClinician.name.trim(),
      initials,
      role: newClinician.role.trim() || 'Clinician',
      sessions: newClinician.sessions || 6,
      primaryBuddy: null,
      secondaryBuddy: null
    };

    const newRota = { ...data.weeklyRota };
    DAYS.forEach(day => {
      newRota[day] = [...ensureArray(newRota[day]), newId];
    });

    saveData({
      ...data,
      clinicians: [...cliniciansList, clinician],
      weeklyRota: newRota
    });

    setNewClinician({ name: '', role: '', initials: '', sessions: 6 });
    setShowAddClinician(false);
  };

  const removeClinician = (id) => {
    if (!confirm('Remove this clinician?')) return;

    const newRota = { ...data.weeklyRota };
    DAYS.forEach(day => {
      newRota[day] = ensureArray(newRota[day]).filter(cid => cid !== id);
    });

    saveData({
      ...data,
      clinicians: ensureArray(data.clinicians).filter(c => c.id !== id),
      weeklyRota: newRota
    });
  };

  // Sync TeamNet calendar
  const syncTeamNet = async () => {
    if (!data.teamnetUrl) {
      setSyncStatus('Please set TeamNet URL in Settings first');
      setTimeout(() => setSyncStatus(''), 3000);
      return;
    }
    setSyncStatus('Syncing...');
    try {
      const res = await fetch('/api/sync-teamnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-password': password },
        body: JSON.stringify({ url: data.teamnetUrl, clinicians: ensureArray(data.clinicians) })
      });
      const result = await res.json();
      if (result.error) {
        setSyncStatus(`Error: ${result.error}`);
      } else {
        const newAbsences = result.absences || [];
        saveData({ ...data, plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() });
        setSyncStatus(`Synced ${newAbsences.length} planned absences`);
      }
    } catch (err) {
      setSyncStatus('Sync failed - check URL');
    }
    setTimeout(() => setSyncStatus(''), 5000);
  };

  // Get planned absences for a specific week
  const getWeekAbsences = () => {
    const absences = ensureArray(data?.plannedAbsences);
    const cliniciansList = ensureArray(data?.clinicians);
    const weekAbsences = [];
    
    DAYS.forEach(day => {
      const dateKey = getDateKeyForDay(day);
      absences.forEach(absence => {
        if (dateKey >= absence.startDate && dateKey <= absence.endDate) {
          const clinician = cliniciansList.find(c => c.id === absence.clinicianId);
          if (clinician) {
            weekAbsences.push({
              day,
              dateKey,
              clinician,
              reason: absence.reason
            });
          }
        }
      });
    });
    
    return weekAbsences;
  };

  const updateClinicianField = (id, field, value) => {
    const newClinicians = ensureArray(data.clinicians).map(c => {
      if (c.id !== id) return c;
      if (field === 'primaryBuddy' || field === 'secondaryBuddy') {
        return { ...c, [field]: value === '' ? null : parseInt(value) };
      }
      if (field === 'sessions') {
        return { ...c, [field]: parseInt(value) || 1 };
      }
      if (field === 'longTermAbsent' || field === 'canProvideCover') {
        return { ...c, [field]: Boolean(value) };
      }
      return { ...c, [field]: value };
    });
    saveData({ ...data, clinicians: newClinicians });
  };

  // Update settings
  const updateSettings = (field, value) => {
    const newSettings = { ...data.settings, [field]: parseFloat(value) || 1 };
    saveData({ ...data, settings: newSettings });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <img src={LOGO_URL} alt="Practice Logo" className="h-16 mx-auto mb-6" />
            <h1 className="text-xl font-bold text-slate-900">Buddy System</h1>
            <p className="text-slate-500 text-sm mt-1">Clinical cover allocation</p>
          </div>

          <form onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-4 text-sm"
              placeholder="Enter practice password"
              autoFocus
            />
            {passwordError && (
              <p className="text-red-600 text-sm mb-4">{passwordError}</p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Checking...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/80">Loading...</div>
      </div>
    );
  }

  const currentAlloc = getCurrentAllocations();
  const presentIds = ensureArray(getPresentClinicians(selectedDay));
  const absentIds = ensureArray(getAbsentClinicians(selectedDay));
  const dayOffIds = ensureArray(getDayOffClinicians(selectedDay));
  const cliniciansList = ensureArray(data.clinicians);
  const presentClinicians = cliniciansList.filter(c => presentIds.includes(c.id));
  const absentClinicians = cliniciansList.filter(c => absentIds.includes(c.id));
  const dayOffClinicians = cliniciansList.filter(c => dayOffIds.includes(c.id));
  const hasAllocations = currentAlloc && (Object.keys(currentAlloc.allocations || {}).length > 0 || Object.keys(currentAlloc.dayOffAllocations || {}).length > 0);
  const groupedAllocations = currentAlloc ? groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, presentIds) : {};

  // Don't sort - keep clinicians in their original order so they don't jump around
  const displayClinicians = cliniciansList;

  return (
    <div className="min-h-screen">
      {copySuccess && (
        <div className="fixed bottom-4 right-4 bg-white text-slate-900 px-3 py-2 rounded-md text-sm font-medium shadow-lg z-50">
          Copied to clipboard
        </div>
      )}
      
      {dataSaved && (
        <div className="fixed bottom-4 right-4 bg-emerald-500 text-white px-3 py-2 rounded-md text-sm font-medium shadow-lg z-50">
          Saved
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-950 via-purple-900 to-violet-900 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-5">
            <div className="bg-white rounded-lg p-2.5 shadow-lg">
              <img src={LOGO_URL} alt="Winscombe & Banwell Family Practice" className="h-14" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Buddy System</h1>
              <p className="text-sm text-purple-200">Clinical cover allocation</p>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-indigo-950/90 backdrop-blur shadow-sm">
        <div className="max-w-5xl mx-auto px-4 flex">
          {[
            { id: 'allocate', label: 'Daily' },
            { id: 'week', label: 'Week View' },
            { id: 'rota', label: 'Rota' },
            { id: 'team', label: 'Team' },
            { id: 'settings', label: 'Settings' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-white'
                  : 'text-purple-300 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-4">
        {/* ALLOCATION TAB */}
        {activeTab === 'allocate' && (
          <div className="space-y-4">
            {/* Action Buttons */}
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      if (!data.teamnetUrl) {
                        setSyncStatus('Set TeamNet URL in Settings first');
                        setTimeout(() => setSyncStatus(''), 4000);
                        return;
                      }
                      setSyncStatus('Syncing...');
                      try {
                        const res = await fetch('/api/sync-teamnet', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'x-password': password },
                          body: JSON.stringify({ url: data.teamnetUrl, clinicians: ensureArray(data.clinicians) })
                        });
                        const result = await res.json();
                        if (result.error) {
                          setSyncStatus(`Error: ${result.error}`);
                        } else {
                          const newAbsences = result.absences || [];
                          saveData({ ...data, plannedAbsences: newAbsences, lastSyncTime: new Date().toISOString() });
                          setSyncStatus(`Done — ${newAbsences.length} absences synced`);
                        }
                      } catch (err) {
                        setSyncStatus('Sync failed');
                      }
                      setTimeout(() => setSyncStatus(''), 4000);
                    }}
                    className={(() => {
                      // Check if synced within last 7 days
                      if (data.lastSyncTime) {
                        const lastSync = new Date(data.lastSyncTime);
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        if (lastSync > weekAgo) {
                          return 'btn-success';
                        }
                      }
                      return 'btn-primary';
                    })()}
                  >
                    Sync with TeamNet
                  </button>
                  {isGenerating ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full w-1/3 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full animate-progress" />
                        </div>
                      </div>
                      <button
                        onClick={() => setIsGenerating(false)}
                        className="btn-secondary text-xs py-1 px-2"
                      >
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setIsGenerating(true);
                        
                        // Small delay to show the animation
                        await new Promise(r => setTimeout(r, 50));
                        
                        const currentData = data;
                        let generated = 0;
                        const newHistory = { ...currentData.allocationHistory };
                        const newOverrides = { ...currentData.dailyOverrides };
                        const today = new Date();
                        let stopped = false;
                        
                        // Ensure clinicians is an array
                        const cliniciansList = Array.isArray(currentData.clinicians) 
                          ? currentData.clinicians 
                          : Object.values(currentData.clinicians || {});
                        
                        // Generate for next 4 weeks
                        for (let weekOffset = 0; weekOffset < 4 && !stopped; weekOffset++) {
                          const weekStart = getWeekStart(new Date(today.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000));
                          
                          for (const day of DAYS) {
                            // Check if stopped (read from DOM to get current state)
                            if (!document.querySelector('.animate-progress')) {
                              stopped = true;
                              break;
                            }
                            
                            const dayIndex = DAYS.indexOf(day);
                            const dateObj = new Date(weekStart);
                            dateObj.setDate(dateObj.getDate() + dayIndex);
                            const dateKey = dateObj.toISOString().split('T')[0];
                            
                            if (isPastDate(dateKey)) continue;
                            if (currentData.closedDays?.[dateKey]) continue;
                            
                            // ALWAYS use the weekly rota - ignore any existing overrides
                            const scheduledRota = currentData.weeklyRota?.[day] || [];
                            const scheduled = Array.isArray(scheduledRota) ? [...scheduledRota] : Object.values(scheduledRota || {});
                            
                            // Start with everyone scheduled as present
                            let present = [...scheduled];
                            
                            // Apply long-term absent
                            const longTermAbsentIds = cliniciansList.filter(c => c.longTermAbsent).map(c => c.id);
                            
                            // Apply planned absences
                            const plannedAbsences = Array.isArray(currentData.plannedAbsences) 
                              ? currentData.plannedAbsences 
                              : Object.values(currentData.plannedAbsences || {});
                            const plannedAbsentIds = plannedAbsences
                              .filter(a => dateKey >= a.startDate && dateKey <= a.endDate)
                              .map(a => a.clinicianId);
                            
                            // Remove absent clinicians from present
                            present = present.filter(id => !longTermAbsentIds.includes(id) && !plannedAbsentIds.includes(id));
                            
                            // Absent = scheduled but not present
                            const absentIds = scheduled.filter(id => !present.includes(id));
                            
                            // Day off = not scheduled and not present (initially)
                            let dayOffIds = cliniciansList
                              .filter(c => !scheduled.includes(c.id) && !present.includes(c.id))
                              .map(c => c.id);
                            
                            // ABSENCE CASCADE: Check if day-off clinicians should be marked absent
                            // If they have an absence on any working day before their next present working day, they're absent today
                            const cascadeAbsentIds = [];
                            const indexToDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            
                            for (const dayOffId of dayOffIds) {
                              const clinician = cliniciansList.find(c => c.id === dayOffId);
                              if (!clinician) continue;
                              
                              // Skip if already long-term absent
                              if (clinician.longTermAbsent) {
                                cascadeAbsentIds.push(dayOffId);
                                continue;
                              }
                              
                              // Get their working days from rota
                              const workingDays = DAYS.filter(d => {
                                const rota = currentData.weeklyRota?.[d] || [];
                                const rotaArr = Array.isArray(rota) ? rota : Object.values(rota);
                                return rotaArr.includes(dayOffId);
                              });
                              
                              if (workingDays.length === 0) continue;
                              
                              const checkDate = new Date(dateKey + 'T12:00:00');
                              let shouldBeAbsent = false;
                              
                              // LOOK BACKWARD: Was their most recent working day an absence?
                              for (let i = 1; i <= 14; i++) {
                                const pastDate = new Date(checkDate);
                                pastDate.setDate(pastDate.getDate() - i);
                                const pastDayIndex = pastDate.getDay();
                                const pastDayName = indexToDay[pastDayIndex];
                                const pastDateKey = pastDate.toISOString().split('T')[0];
                                
                                // Skip weekends
                                if (pastDayIndex === 0 || pastDayIndex === 6) continue;
                                
                                // Is this one of their working days?
                                if (workingDays.includes(pastDayName)) {
                                  // Check if they had a planned absence on this day
                                  const hadAbsence = plannedAbsences.some(a => 
                                    a.clinicianId === dayOffId && 
                                    pastDateKey >= a.startDate && 
                                    pastDateKey <= a.endDate
                                  );
                                  
                                  if (hadAbsence) {
                                    // Their last working day was absent - they're still in absence period
                                    shouldBeAbsent = true;
                                  }
                                  // Stop at most recent working day
                                  break;
                                }
                              }
                              
                              // LOOK FORWARD: Is their next working day an absence?
                              if (!shouldBeAbsent) {
                                for (let i = 1; i <= 14; i++) {
                                  const futureDate = new Date(checkDate);
                                  futureDate.setDate(futureDate.getDate() + i);
                                  const futureDayIndex = futureDate.getDay();
                                  const futureDayName = indexToDay[futureDayIndex];
                                  const futureDateKey = futureDate.toISOString().split('T')[0];
                                  
                                  // Skip weekends
                                  if (futureDayIndex === 0 || futureDayIndex === 6) continue;
                                  
                                  // Is this one of their working days?
                                  if (workingDays.includes(futureDayName)) {
                                    // Check if they have a planned absence on this day
                                    const hasAbsence = plannedAbsences.some(a => 
                                      a.clinicianId === dayOffId && 
                                      futureDateKey >= a.startDate && 
                                      futureDateKey <= a.endDate
                                    );
                                    
                                    if (hasAbsence) {
                                      // They have an absence on their next working day - cascade
                                      shouldBeAbsent = true;
                                    }
                                    // Stop at first working day (whether absent or not)
                                    break;
                                  }
                                }
                              }
                              
                              if (shouldBeAbsent) {
                                cascadeAbsentIds.push(dayOffId);
                              }
                            }
                            
                            // Move cascade absent from dayOff to absent
                            const finalAbsentIds = [...absentIds, ...cascadeAbsentIds];
                            const finalDayOffIds = dayOffIds.filter(id => !cascadeAbsentIds.includes(id));
                            
                            const { allocations, dayOffAllocations } = generateBuddyAllocations(
                              cliniciansList,
                              present,
                              finalAbsentIds,
                              finalDayOffIds,
                              currentData.settings || {}
                            );
                            
                            // Clear any existing override for this day (reset to rota)
                            const overrideKey = `${dateKey}-${day}`;
                            delete newOverrides[overrideKey];
                            
                            newHistory[dateKey] = {
                              date: dateKey,
                              day,
                              allocations,
                              dayOffAllocations,
                              presentIds: present,
                              absentIds: finalAbsentIds,
                              dayOffIds: finalDayOffIds
                            };
                            generated++;
                          }
                          
                          // Yield to allow stop button to work
                          await new Promise(r => setTimeout(r, 10));
                        }
                        
                        // Save to server (even partial results if stopped)
                        if (generated > 0) {
                          const newData = { 
                            ...currentData, 
                            allocationHistory: newHistory,
                            dailyOverrides: newOverrides  // Include cleared overrides
                          };
                          setData(newData);
                          
                          try {
                            await fetch('/api/data', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'x-password': password },
                              body: JSON.stringify(newData)
                            });
                          } catch (err) {
                            console.error('Save failed:', err);
                          }
                          
                          setDataVersion(v => v + 1);
                        }
                        
                        setIsGenerating(false);
                        setSyncStatus(stopped ? `Stopped — ${generated} days` : `Done — ${generated} days`);
                        setTimeout(() => setSyncStatus(''), 4000);
                      }}
                      className="btn-primary"
                    >
                      Generate Next 4 Weeks
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {syncStatus && (
                    <span className={`text-sm font-medium ${syncStatus.includes('Error') || syncStatus.includes('failed') || syncStatus.includes('Set TeamNet') ? 'text-red-600' : 'text-emerald-600'}`}>
                      {syncStatus}
                    </span>
                  )}
                  {data.lastSyncTime && !syncStatus && (
                    <span className="text-xs text-slate-400">
                      Last sync: {new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Week & Day Selector */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
                    className="btn-secondary"
                  >
                    Prev
                  </button>
                  <div className="text-sm font-medium text-slate-900 min-w-[160px] text-center">
                    {formatWeekRange(selectedWeek)}
                  </div>
                  <button
                    onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
                    className="btn-secondary"
                  >
                    Next
                  </button>
                </div>
                <button
                  onClick={() => setSelectedWeek(getWeekStart(new Date()))}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Today
                </button>
              </div>

              <div className="flex gap-1">
                {DAYS.map(day => {
                  const dateKey = getDateKeyForDay(day);
                  const past = isPastDate(dateKey);
                  const today = isToday(dateKey);
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`day-pill flex-1 relative ${selectedDay === day ? 'active' : ''} ${past ? 'opacity-60' : ''}`}
                    >
                      {day}
                      {today && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Attendance */}
            {/* Closed Day or Attendance */}
            {isClosedDay(getDateKey()) ? (
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{selectedDay} — Practice Closed</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{getClosedReason(getDateKey())}</p>
                  </div>
                  {!isPastDate(getDateKey()) && (
                    <button 
                      onClick={() => toggleClosedDay(getDateKey())}
                      className="btn-secondary"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        {selectedDay} Attendance
                        {isPastDate(getDateKey()) && <span className="ml-2 text-xs text-slate-400 font-normal">(read only)</span>}
                        {isToday(getDateKey()) && <span className="ml-2 text-xs text-emerald-600 font-normal">(today)</span>}
                      </h2>
                    </div>
                    {!isPastDate(getDateKey()) && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleClosedDay(getDateKey(), 'Bank Holiday')}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Mark closed
                        </button>
                        <button onClick={resetDailyOverrides} className="text-xs text-slate-500 hover:text-slate-700">
                          Reset
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 mb-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Present ({presentClinicians.length})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-400"></span>
                      Absent ({absentClinicians.length})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                      Day off ({dayOffClinicians.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {displayClinicians.map(c => {
                      const status = getClinicianStatus(c.id, selectedDay);
                      const isLongTermAbsent = c.longTermAbsent;
                      const hasPlanned = hasPlannedAbsence(c.id, getDateKey());
                      const plannedReason = getPlannedAbsenceReason(c.id, getDateKey());
                      const pastDay = isPastDate(getDateKey());
                      const showInfoLine = isLongTermAbsent || hasPlanned;
                      return (
                        <div key={c.id} className={`clinician-card ${status}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`initials-badge ${status}`}>{c.initials || '??'}</div>
                              <div>
                                <div className="text-sm font-medium text-slate-900">{c.name}</div>
                                <div className="text-xs text-slate-500">{c.role}</div>
                                {showInfoLine && (
                                  <div className="text-xs mt-0.5">
                                    {hasPlanned && (
                                      <span className="text-blue-600">TeamNet: {plannedReason}</span>
                                    )}
                                    {hasPlanned && isLongTermAbsent && (
                                      <span className="text-slate-400"> · </span>
                                    )}
                                    {isLongTermAbsent && (
                                      <span className="text-amber-600">LTA</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {pastDay ? (
                              <span className="text-xs text-slate-400">
                                {status === 'present' ? '✓' : status === 'absent' ? '✗' : '—'}
                              </span>
                            ) : (
                              <button
                                onClick={() => togglePresence(c.id, selectedDay)}
                                className={`toggle-btn ${status === 'present' ? 'on' : status === 'dayoff' ? 'dayoff' : 'off'}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Generate */}
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Buddy Allocations</h2>
                      <p className="text-sm text-slate-500 mt-0.5">Workload balanced across present clinicians</p>
                    </div>
                    {!isPastDate(getDateKey()) && (
                      <button
                        onClick={handleGenerate}
                        disabled={presentClinicians.length === 0}
                        className="btn-primary"
                      >
                        {hasAllocations ? 'Regenerate' : 'Generate'}
                      </button>
                    )}
                  </div>

                  {hasAllocations ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                        <span className="text-sm font-medium text-slate-700">{formatDate(getDateKey())}</span>
                        <button onClick={copyToClipboard} className="text-sm text-slate-600 hover:text-slate-900">
                          Copy
                        </button>
                      </div>

                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Covering</th>
                            <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">File & Action</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">View Only</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Show all present clinicians, sorted: can cover with allocations, can cover without, cannot cover */}
                      {(() => {
                        // Build list of all present clinicians with their allocation data
                        const allPresentRows = presentIds.map(id => {
                          const clinician = getClinicianById(id);
                          const tasks = groupedAllocations[id] || { absent: [], dayOff: [] };
                          const canCover = clinician?.canProvideCover !== false;
                          const hasAllocs = tasks.absent.length > 0 || tasks.dayOff.length > 0;
                          return { id, clinician, tasks, canCover, hasAllocs };
                        }).filter(row => row.clinician);
                        
                        // Sort: can cover with allocations first, then can cover without, then cannot cover
                        allPresentRows.sort((a, b) => {
                          // Cannot cover goes to bottom
                          if (a.canCover && !b.canCover) return -1;
                          if (!a.canCover && b.canCover) return 1;
                          // Within can-cover group, those with allocations first
                          if (a.canCover && b.canCover) {
                            if (a.hasAllocs && !b.hasAllocs) return -1;
                            if (!a.hasAllocs && b.hasAllocs) return 1;
                          }
                          return 0;
                        });
                        
                        return allPresentRows.map(({ id, clinician, tasks, canCover, hasAllocs }) => {
                          const isGreyed = !canCover;
                          return (
                            <tr key={id} className={`border-b border-slate-100 last:border-0 ${isGreyed ? 'opacity-50' : ''}`}>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className={`initials-badge ${isGreyed ? 'neutral' : 'present'}`}>{clinician.initials}</div>
                                  <span className={`text-sm font-medium ${isGreyed ? 'text-slate-400' : 'text-slate-900'}`}>{clinician.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {tasks.absent.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {tasks.absent.map(absentId => {
                                      const c = getClinicianById(absentId);
                                      const isNonCoverer = c && c.canProvideCover === false;
                                      return c ? (
                                        <span key={absentId} className={`status-tag ${isNonCoverer ? 'non-coverer' : 'absent'}`}>{c.initials}</span>
                                      ) : null;
                                    })}
                                  </div>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="py-3 px-4">
                                {tasks.dayOff.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {tasks.dayOff.map(dayOffId => {
                                      const c = getClinicianById(dayOffId);
                                      const isNonCoverer = c && c.canProvideCover === false;
                                      return c ? (
                                        <span key={dayOffId} className={`status-tag ${isNonCoverer ? 'non-coverer' : 'dayoff'}`}>{c.initials}</span>
                                      ) : null;
                                    })}
                                  </div>
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (absentClinicians.length === 0 && dayOffClinicians.length === 0) ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm">Everyone's in today — no cover needed</p>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm">Click Generate to allocate buddies</p>
                </div>
              )}
                </div>
              </>
            )}
          </div>
        )}

        {/* WEEK VIEW TAB */}
        {activeTab === 'week' && (
          <div className="space-y-6">
            {/* Week Selector */}
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
                    className="btn-secondary py-1.5 px-3 text-sm"
                  >
                    Prev
                  </button>
                  <div className="text-sm font-medium text-slate-900 min-w-[180px] text-center">
                    {formatWeekRange(selectedWeek)}
                  </div>
                  <button
                    onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
                    className="btn-secondary py-1.5 px-3 text-sm"
                  >
                    Next
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedWeek(getWeekStart(new Date()))}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      // Check all days have allocations or are closed
                      const missingDays = DAYS.filter(day => {
                        const dateKey = getDateKeyForDay(day);
                        return !isClosedDay(dateKey) && !data?.allocationHistory?.[dateKey];
                      });
                      
                      if (missingDays.length > 0) {
                        alert(`Missing allocations for: ${missingDays.join(', ')}\n\nPlease generate allocations for these days first, or mark them as closed.`);
                        return;
                      }
                      
                      // Build week summary
                      let summary = `BUDDY ALLOCATIONS — ${formatWeekRange(selectedWeek)}\n${'='.repeat(50)}\n\n`;
                      
                      DAYS.forEach(day => {
                        const dateKey = getDateKeyForDay(day);
                        const date = new Date(dateKey + 'T12:00:00');
                        const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
                        
                        if (isClosedDay(dateKey)) {
                          summary += `${dateStr}\nPRACTICE CLOSED — ${getClosedReason(dateKey)}\n\n`;
                          return;
                        }
                        
                        const entry = data?.allocationHistory?.[dateKey];
                        if (!entry) {
                          summary += `${dateStr}\nNo allocation generated\n\n`;
                          return;
                        }
                        
                        summary += `${dateStr}\n`;
                        
                        const grouped = groupAllocationsByCovering(entry.allocations || {}, entry.dayOffAllocations || {}, entry.presentIds || []);
                        
                        // Build list of all present clinicians
                        const dayPresentIds = entry.presentIds || [];
                        const allPresentRows = dayPresentIds.map(id => {
                          const clinician = getClinicianById(id);
                          const tasks = grouped[id] || { absent: [], dayOff: [] };
                          const canCover = clinician?.canProvideCover !== false;
                          const hasAllocs = tasks.absent.length > 0 || tasks.dayOff.length > 0;
                          return { id, clinician, tasks, canCover, hasAllocs };
                        }).filter(row => row.clinician);
                        
                        // Sort
                        allPresentRows.sort((a, b) => {
                          if (a.canCover && !b.canCover) return -1;
                          if (!a.canCover && b.canCover) return 1;
                          if (a.canCover && b.canCover) {
                            if (a.hasAllocs && !b.hasAllocs) return -1;
                            if (!a.hasAllocs && b.hasAllocs) return 1;
                          }
                          return 0;
                        });
                        
                        if (allPresentRows.length === 0) {
                          summary += `No clinicians present\n\n`;
                          return;
                        }
                        
                        allPresentRows.forEach(({ clinician, tasks }) => {
                          const fileStr = tasks.absent.length > 0 ? tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
                          const viewStr = tasks.dayOff.length > 0 ? tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
                          
                          summary += `${clinician.initials}: File ${fileStr} / View ${viewStr}\n`;
                        });
                        
                        summary += '\n';
                      });
                      
                      navigator.clipboard.writeText(summary.trim());
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }}
                    className="btn-primary text-sm"
                  >
                    Copy Week
                  </button>
                </div>
              </div>
            </div>

            {/* Week Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {DAYS.map(day => {
                const dateKey = getDateKeyForDay(day);
                const date = new Date(dateKey + 'T12:00:00');
                const isClosed = isClosedDay(dateKey);
                const entry = data?.allocationHistory?.[dateKey];
                const hasEntry = !!entry;
                
                const grouped = hasEntry ? groupAllocationsByCovering(entry.allocations || {}, entry.dayOffAllocations || {}, entry.presentIds || []) : {};
                const hasAllocations = hasEntry && Object.entries(grouped).some(([_, tasks]) => tasks.absent.length > 0 || tasks.dayOff.length > 0);
                
                return (
                  <div key={day} className={`card overflow-hidden ${isClosed ? 'bg-slate-100' : ''}`}>
                    <div className={`px-4 py-3 border-b ${isClosed ? 'bg-slate-200 border-slate-300' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{day}</div>
                          <div className="text-xs text-slate-500">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                        </div>
                        <button
                          onClick={() => toggleClosedDay(dateKey, 'Bank Holiday')}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            isClosed 
                              ? 'bg-slate-700 text-white' 
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {isClosed ? 'Closed' : 'Open'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4 min-h-[120px]">
                      {isClosed ? (
                        <div className="text-center text-slate-500 text-sm py-4">
                          <div className="font-medium">Practice Closed</div>
                          <div className="text-xs mt-1">{getClosedReason(dateKey)}</div>
                        </div>
                      ) : !hasEntry ? (
                        <div className="text-center text-amber-600 text-sm py-4">
                          <div className="font-medium">Not generated</div>
                          <div className="text-xs mt-1 text-slate-500">Go to Daily tab</div>
                        </div>
                      ) : !hasAllocations ? (
                        <div className="text-center text-emerald-600 text-sm py-4">
                          <div className="font-medium">All present</div>
                          <div className="text-xs mt-1 text-slate-500">No cover needed</div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          {Object.entries(grouped).map(([buddyId, tasks]) => {
                            if (tasks.absent.length === 0 && tasks.dayOff.length === 0) return null;
                            const buddy = getClinicianById(parseInt(buddyId));
                            if (!buddy) return null;
                            
                            return (
                              <div key={buddyId} className="flex items-start gap-2">
                                <span className="font-medium text-slate-700 w-8">{buddy.initials}</span>
                                <div className="flex flex-wrap gap-1">
                                  {tasks.absent.map(id => {
                                    const c = getClinicianById(id);
                                    return c ? (
                                      <span key={id} className="status-tag absent text-xs">{c.initials}</span>
                                    ) : null;
                                  })}
                                  {tasks.dayOff.map(id => {
                                    const c = getClinicianById(id);
                                    return c ? (
                                      <span key={id} className="status-tag dayoff text-xs">{c.initials}</span>
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-6 text-xs text-slate-500 justify-center">
              <span className="flex items-center gap-1.5">
                <span className="status-tag absent">XX</span>
                File & Action (absent)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="status-tag dayoff">XX</span>
                View Only (day off)
              </span>
            </div>

            {/* Leave Calendar */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Planned Leave This Week</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.lastSyncTime 
                      ? `Last synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                      : 'Not yet synced'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {syncStatus && (
                    <span className={`text-xs ${syncStatus.includes('Error') || syncStatus.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>
                      {syncStatus}
                    </span>
                  )}
                  <button
                    onClick={syncTeamNet}
                    disabled={!data.teamnetUrl}
                    className={`btn-secondary text-sm ${!data.teamnetUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Sync TeamNet
                  </button>
                </div>
              </div>

              {/* Week leave grid */}
              {getWeekAbsences().length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  {data.teamnetUrl 
                    ? 'No planned leave this week'
                    : 'Set TeamNet URL in Settings to sync leave calendar'}
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {DAYS.map(day => {
                    const dateKey = getDateKeyForDay(day);
                    const date = new Date(dateKey + 'T12:00:00');
                    const dayAbsences = getWeekAbsences().filter(a => a.day === day);
                    
                    return (
                      <div key={day} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                          <div className="text-xs font-medium text-slate-700">{day.slice(0, 3)}</div>
                          <div className="text-xs text-slate-400">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                        </div>
                        <div className="p-2 min-h-[60px]">
                          {dayAbsences.length === 0 ? (
                            <div className="text-xs text-slate-300 text-center py-2">—</div>
                          ) : (
                            <div className="space-y-1">
                              {dayAbsences.map((a, idx) => {
                                const colorClass = 
                                  a.reason === 'Holiday' || a.reason === 'Annual Leave' 
                                    ? 'bg-blue-100 text-blue-700'
                                    : a.reason === 'Training' || a.reason === 'Study'
                                    ? 'bg-amber-100 text-amber-700'
                                    : a.reason === 'Sick'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-600';
                                return (
                                  <div key={idx} className="flex items-center gap-1.5">
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorClass}`}>
                                      {a.clinician.initials}
                                    </span>
                                    <span className="text-xs text-slate-400 truncate">{a.reason}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {!data.teamnetUrl && (
                <div className="mt-3 text-center">
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className="text-xs text-purple-600 hover:text-purple-800"
                  >
                    Configure TeamNet in Settings →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROTA TAB */}
        {activeTab === 'rota' && (
          <div className="card p-5">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-900">Weekly Rota</h2>
              <p className="text-sm text-slate-500 mt-0.5">Standard working pattern — click to toggle</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Clinician</th>
                    {DAYS.map(day => (
                      <th key={day} className="text-center py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">{day.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ensureArray(data.clinicians).map(c => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="initials-badge neutral">{c.initials}</div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.role}</div>
                          </div>
                        </div>
                      </td>
                      {DAYS.map(day => {
                        const isWorking = ensureArray(data.weeklyRota[day]).includes(c.id);
                        return (
                          <td key={day} className="text-center py-3 px-3">
                            <button
                              onClick={() => toggleRotaDay(c.id, day)}
                              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors mx-auto text-sm ${
                                isWorking
                                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              {isWorking ? '✓' : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-100"></span>
                Working
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-100"></span>
                Day off
              </span>
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-900">Team Members</h2>
                <button onClick={() => setShowAddClinician(!showAddClinician)} className="btn-secondary text-sm">
                  Add clinician
                </button>
              </div>

              {showAddClinician && (
                <div className="bg-slate-50 rounded-lg p-4 mb-5 flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                    <input
                      type="text"
                      placeholder="Dr. Jane Smith"
                      value={newClinician.name}
                      onChange={e => setNewClinician(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Initials</label>
                    <input
                      type="text"
                      placeholder="JS"
                      maxLength={4}
                      value={newClinician.initials}
                      onChange={e => setNewClinician(p => ({ ...p, initials: e.target.value.toUpperCase() }))}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center uppercase focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sessions</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={newClinician.sessions}
                      onChange={e => setNewClinician(p => ({ ...p, sessions: parseInt(e.target.value) || 6 }))}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                    <input
                      type="text"
                      placeholder="GP Partner"
                      value={newClinician.role}
                      onChange={e => setNewClinician(p => ({ ...p, role: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>
                  <button onClick={addClinician} className="btn-primary text-sm">Add</button>
                </div>
              )}

              <div className="space-y-2">
                {ensureArray(data.clinicians).map((c, index) => {
                  const allClinicians = ensureArray(data.clinicians);
                  return (
                  <div key={c.id} className={`p-4 rounded-lg border transition-colors ${c.longTermAbsent ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-start justify-between gap-4">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            if (index === 0) return;
                            const newClinicians = [...allClinicians];
                            [newClinicians[index - 1], newClinicians[index]] = [newClinicians[index], newClinicians[index - 1]];
                            saveData({ ...data, clinicians: newClinicians });
                          }}
                          disabled={index === 0}
                          className={`w-6 h-6 flex items-center justify-center rounded text-xs ${index === 0 ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => {
                            if (index === allClinicians.length - 1) return;
                            const newClinicians = [...allClinicians];
                            [newClinicians[index], newClinicians[index + 1]] = [newClinicians[index + 1], newClinicians[index]];
                            saveData({ ...data, clinicians: newClinicians });
                          }}
                          disabled={index === allClinicians.length - 1}
                          className={`w-6 h-6 flex items-center justify-center rounded text-xs ${index === allClinicians.length - 1 ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                        >
                          ▼
                        </button>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-start gap-2.5 mb-3">
                          <div className={`initials-badge ${c.longTermAbsent ? 'bg-amber-100 text-amber-700' : 'neutral'}`}>{c.initials}</div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{c.name}</div>
                            <div className="text-xs text-slate-500">{c.role}</div>
                            {c.longTermAbsent && (
                              <div className="mt-1">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Long-term absent</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-4 flex-wrap items-end text-sm">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Sessions/week</label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={c.sessions || 6}
                              onChange={e => updateClinicianField(c.id, 'sessions', e.target.value)}
                              className="w-14 px-2 py-1 rounded border border-slate-200 text-center text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Primary buddy</label>
                            <select
                              value={c.primaryBuddy || ''}
                              onChange={e => updateClinicianField(c.id, 'primaryBuddy', e.target.value)}
                              className="px-2 py-1 rounded border border-slate-200 text-sm"
                            >
                              <option value="">None</option>
                              {allClinicians.filter(x => x.id !== c.id).map(x => (
                                <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Secondary buddy</label>
                            <select
                              value={c.secondaryBuddy || ''}
                              onChange={e => updateClinicianField(c.id, 'secondaryBuddy', e.target.value)}
                              className="px-2 py-1 rounded border border-slate-200 text-sm"
                            >
                              <option value="">None</option>
                              {allClinicians.filter(x => x.id !== c.id && x.id !== c.primaryBuddy).map(x => (
                                <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Can cover others</label>
                            <button
                              onClick={() => updateClinicianField(c.id, 'canProvideCover', c.canProvideCover === false ? true : false)}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                c.canProvideCover !== false
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {c.canProvideCover !== false ? 'Yes' : 'No'}
                            </button>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Long-term absent</label>
                            <button
                              onClick={() => updateClinicianField(c.id, 'longTermAbsent', !c.longTermAbsent)}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                c.longTermAbsent 
                                  ? 'bg-amber-500 text-white' 
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {c.longTermAbsent ? 'Yes' : 'No'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => removeClinician(c.id)}
                        className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )})}
              </div>
            </div>

            <div className="card p-5 bg-slate-50 border-slate-200">
              <h3 className="text-sm font-medium text-slate-700 mb-2">How allocation works</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sessions are used to balance workload fairly. When someone is absent (AL/sick), their buddy will file and action their results. 
                Day off clinicians only need their results viewed for safety. Primary/secondary buddies are preferred when available.
                Clinicians with "Can cover others" set to No (e.g. trainees) will still have their results covered but won't be assigned to cover anyone else.
                Long-term absent clinicians are automatically marked absent each day until the flag is removed.
              </p>
            </div>
          </div>
        )}

        {/* AUDIT TAB */}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* TeamNet Calendar Sync */}
            <div className="card p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-4">TeamNet Calendar Sync</h2>
              <p className="text-sm text-slate-500 mb-4">
                Import planned absences from your TeamNet calendar. This will automatically mark clinicians as absent on their leave dates.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">TeamNet Calendar URL</label>
                  <input
                    type="url"
                    value={data.teamnetUrl || ''}
                    onChange={e => saveData({ ...data, teamnetUrl: e.target.value }, false)}
                    onBlur={() => data.teamnetUrl && saveData(data)}
                    placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..."
                    className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={syncTeamNet}
                    className="btn-primary"
                  >
                    Sync Now
                  </button>
                  {syncStatus && (
                    <span className={`text-sm ${syncStatus.includes('Error') || syncStatus.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>
                      {syncStatus}
                    </span>
                  )}
                  {data.lastSyncTime && (
                    <span className="text-xs text-slate-400">
                      Last: {new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Planned Absences List */}
              {(ensureArray(data.plannedAbsences).length > 0) && (
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">Upcoming Planned Absences</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {ensureArray(data.plannedAbsences)
                      .filter(a => a.endDate >= getTodayKey())
                      .sort((a, b) => a.startDate.localeCompare(b.startDate))
                      .slice(0, 20)
                      .map((absence, idx) => {
                        const clinician = ensureArray(data.clinicians).find(c => c.id === absence.clinicianId);
                        if (!clinician) return null;
                        const startDate = new Date(absence.startDate + 'T12:00:00');
                        const endDate = new Date(absence.endDate + 'T12:00:00');
                        const dateStr = absence.startDate === absence.endDate 
                          ? startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          : `${startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                            <div>
                              <span className="font-medium">{clinician.initials}</span>
                              <span className="text-slate-500 ml-2">{dateStr}</span>
                              <span className="text-slate-400 ml-2">({absence.reason})</span>
                            </div>
                            <button
                              onClick={() => {
                                const absences = ensureArray(data.plannedAbsences);
                                const newAbsences = absences.filter((_, i) => i !== absences.indexOf(absence));
                                saveData({ ...data, plannedAbsences: newAbsences });
                              }}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-900">Workload Weights</h2>
                {settingsSaved && (
                  <span className="text-xs text-emerald-600 font-medium">Saved</span>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-6">
                Adjust how workload is calculated when balancing buddy allocations. Higher weights mean more workload assigned to the covering clinician.
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Absent (File & Action)</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Multiplier applied when covering an absent clinician's results
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={data.settings?.absentWeight || 2}
                      onChange={e => updateSettings('absentWeight', e.target.value)}
                      className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                    <span className="text-sm text-slate-500">× sessions</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Day Off (View Only)</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Multiplier applied when viewing a day-off clinician's results
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={data.settings?.dayOffWeight || 1}
                      onChange={e => updateSettings('dayOffWeight', e.target.value)}
                      className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                    <span className="text-sm text-slate-500">× sessions</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card p-4 bg-slate-50 border-slate-200">
              <h3 className="text-xs font-medium text-slate-700 mb-1">How the algorithm works</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>Round-robin first:</strong> Everyone gets 1 allocation before anyone gets 2. 
                For each person needing cover, the system tries their <strong>primary buddy</strong> first (if they have the minimum allocation count), 
                then <strong>secondary buddy</strong>, then any eligible clinician with the minimum count.
                <br/><br/>
                <strong>Weighted tiebreaking:</strong> When multiple clinicians have the same allocation count, 
                the one with the lowest weighted load is chosen. Weighted load = (absent covered × {data.settings?.absentWeight || 2}) + (day-off covered × {data.settings?.dayOffWeight || 1}).
              </p>
            </div>

            {/* Danger Zone */}
            <div className="card p-5 border-red-200">
              <h2 className="text-base font-semibold text-red-700 mb-4">Danger Zone</h2>
              <p className="text-sm text-slate-500 mb-4">
                If the app is broken due to corrupted data, you can reset to defaults. This will clear ALL data including clinicians, rotas, and history.
              </p>
              <button
                onClick={async () => {
                  if (confirm('Are you sure? This will DELETE ALL DATA and reset to defaults. This cannot be undone.')) {
                    if (confirm('FINAL WARNING: All clinicians, rotas, allocations, and history will be permanently deleted. Continue?')) {
                      const defaultData = getDefaultData();
                      setData(defaultData);
                      try {
                        await fetch('/api/data', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'x-password': password },
                          body: JSON.stringify(defaultData)
                        });
                        alert('Data reset successfully. Please refresh the page.');
                        window.location.reload();
                      } catch (err) {
                        alert('Reset failed: ' + err.message);
                      }
                    }
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
              >
                Reset All Data
              </button>
            </div>

            {/* History Section */}
            <div className="card p-5">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center justify-between w-full"
              >
                <h2 className="text-base font-semibold text-slate-900">Allocation History</h2>
                <span className="text-sm text-slate-500">{showHistory ? '▼' : '▶'}</span>
              </button>
              
              {showHistory && (
                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                  {Object.entries(data.allocationHistory || {})
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 30)
                    .map(([dateKey, entry]) => {
                      const grouped = groupAllocationsByCovering(entry.allocations || {}, entry.dayOffAllocations || {}, entry.presentIds || []);
                      const hasAllocations = Object.entries(grouped).some(([_, tasks]) => tasks.absent.length > 0 || tasks.dayOff.length > 0);
                      
                      return (
                        <div key={dateKey} className="p-3 bg-slate-50 rounded-lg">
                          <div className="text-sm font-medium text-slate-900">{formatDate(dateKey)}</div>
                          {hasAllocations ? (
                            <div className="mt-2 text-xs text-slate-600">
                              {Object.entries(grouped).map(([buddyId, tasks]) => {
                                if (tasks.absent.length === 0 && tasks.dayOff.length === 0) return null;
                                const buddy = getClinicianById(parseInt(buddyId));
                                if (!buddy) return null;
                                const absentStr = tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(', ');
                                const dayOffStr = tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(', ');
                                return (
                                  <div key={buddyId}>
                                    {buddy.initials} → {absentStr}{dayOffStr ? ` (view: ${dayOffStr})` : ''}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-400">All present</div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-8">
        <div className="max-w-5xl mx-auto px-4 py-3 text-center text-xs text-white/50">
          Winscombe & Banwell Family Practice
        </div>
      </footer>
    </div>
  );
}
