'use client';

import { useState, useEffect, useRef } from 'react';
import { DAYS, getWeekStart, formatWeekRange, formatDate, getCurrentDay, generateBuddyAllocations, groupAllocationsByCovering, getDefaultData, DEFAULT_SETTINGS } from '@/lib/data';

const LOGO_URL = "/logo.png";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [data, setData] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => getCurrentDay());
  const [activeSection, setActiveSection] = useState('buddy-daily');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAddClinician, setShowAddClinician] = useState(false);
  const [newClinician, setNewClinician] = useState({ name: '', role: '', initials: '', sessions: 6 });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dataSaved, setDataSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState({ buddy: true, team: false, huddle: true });
  const hasSyncedRef = useRef(false);
  const [huddleData, setHuddleData] = useState(null); // Parsed CSV data for huddle
  const [huddleError, setHuddleError] = useState('');
  const [huddleDate, setHuddleDate] = useState(null); // Selected date in huddle view
  const [showHuddleSettings, setShowHuddleSettings] = useState(false);
  const [huddleMessages, setHuddleMessages] = useState([]); // Key messages / noticeboard
  const [newHuddleMessage, setNewHuddleMessage] = useState('');
  const [newHuddleAuthor, setNewHuddleAuthor] = useState('');
  const [huddleSlotOverrides, setHuddleSlotOverrides] = useState(null); // null = use settings defaults
  const [showSlotFilter, setShowSlotFilter] = useState(false);
  const [forwardSlotOverrides, setForwardSlotOverrides] = useState(null);
  const [showForwardSlotFilter, setShowForwardSlotFilter] = useState(false);
  const [forwardViewMode, setForwardViewMode] = useState('urgent'); // 'urgent' | 'routine' | 'all'
  const [selectedCell, setSelectedCell] = useState(null); // { dateStr, dayName, week } for popup
  const [newFilterName, setNewFilterName] = useState('');
  const [settingsChartFilter, setSettingsChartFilter] = useState('urgent'); // which filter to show in chart
  const fileInputRef = useRef(null);
  const huddleLoadedRef = useRef(false);

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

  // Load persisted huddle CSV data and messages from Redis
  useEffect(() => {
    if (data && !huddleLoadedRef.current) {
      huddleLoadedRef.current = true;
      if (data.huddleCsvData) {
        setHuddleData(data.huddleCsvData);
        // Set date to today if available, else first date
        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2,'0')}-${today.toLocaleString('en-GB',{month:'short'})}-${today.getFullYear()}`;
        const dates = data.huddleCsvData.dates || [];
        setHuddleDate(dates.includes(todayStr) ? todayStr : dates[0] || null);
      }
      if (data.huddleMessages) {
        setHuddleMessages(Array.isArray(data.huddleMessages) ? data.huddleMessages : Object.values(data.huddleMessages));
      }
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
    if (d.plannedAbsences && !Array.isArray(d.plannedAbsences)) d.plannedAbsences = Object.values(d.plannedAbsences);
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
      for (const key of Object.keys(d.allocationHistory)) {
        const entry = d.allocationHistory[key];
        if (entry) {
          if (entry.presentIds && !Array.isArray(entry.presentIds)) entry.presentIds = Object.values(entry.presentIds);
          if (entry.absentIds && !Array.isArray(entry.absentIds)) entry.absentIds = Object.values(entry.absentIds);
          if (entry.dayOffIds && !Array.isArray(entry.dayOffIds)) entry.dayOffIds = Object.values(entry.dayOffIds);
        }
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

  const ensureArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val);
  };

  // Parse EMIS huddle CSV - returns all dates' data
  const parseHuddleCSV = (csvText) => {
    const lines = csvText.split('\n').map(line => line.replace(/\r/g, ''));
    
    // Find the header row with clinician names
    let headerRowIndex = -1;
    let dataStartRowIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].includes('Full Name of the Session Holder')) {
        headerRowIndex = i;
        dataStartRowIndex = i + 1;
        break;
      }
    }
    if (headerRowIndex === -1) throw new Error('Could not find clinician header row');

    // Parse clinician names from header (column 5+ in new format)
    const headerCells = parseCSVRow(lines[headerRowIndex]);
    const clinicians = headerCells.slice(5).filter(c => c && c.trim());

    // Get report date from metadata
    let reportDate = null;
    for (let i = 0; i < headerRowIndex; i++) {
      if (lines[i].includes('Last Run:')) {
        const match = lines[i].match(/(\d{2}-[A-Za-z]{3}-\d{4})/);
        if (match) reportDate = match[1];
        break;
      }
    }

    // Parse all data, grouped by date
    const allSlotTypes = new Set();
    const dateData = {}; // { "24-Feb-2026": { am: { clinicianIdx: { slotType: count } }, pm: {...} } }
    const bookedData = {}; // Same structure but for Booked slots
    const allDates = new Set();
    
    let currentDate = null;
    let currentTime = null;

    for (let i = dataStartRowIndex + 1; i < lines.length; i++) {
      const cells = parseCSVRow(lines[i]);
      if (cells.length < 5) continue;

      // Column 0: Date, Column 1: Time, Column 2: Slot Type, Column 3: Availability
      if (cells[0] && cells[0].trim()) currentDate = cells[0].trim();
      if (cells[1] && cells[1].trim()) currentTime = cells[1].trim();
      
      const slotType = cells[2]?.trim() || '';
      const availability = cells[3]?.trim() || '';
      
      if (!currentDate || !slotType) continue;
      allDates.add(currentDate);
      allSlotTypes.add(slotType);

      // Only count "Available" or "Booked" slots
      const isAvailable = availability === 'Available';
      const isBooked = availability === 'Booked';
      if (!isAvailable && !isBooked) continue;

      // Determine AM or PM from time column
      const session = currentTime?.includes('Before') ? 'am' : 'pm';

      const targetStore = isAvailable ? dateData : bookedData;
      if (!targetStore[currentDate]) {
        targetStore[currentDate] = { am: {}, pm: {} };
      }

      // Count per clinician (columns 5+ in new format)
      for (let j = 5; j < cells.length && (j - 5) < clinicians.length; j++) {
        const count = parseInt(cells[j], 10) || 0;
        if (count > 0) {
          const clinicianIdx = j - 5;
          if (!targetStore[currentDate][session][clinicianIdx]) {
            targetStore[currentDate][session][clinicianIdx] = {};
          }
          targetStore[currentDate][session][clinicianIdx][slotType] = 
            (targetStore[currentDate][session][clinicianIdx][slotType] || 0) + count;
        }
      }
    }

    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort((a, b) => {
      const parseDate = (d) => {
        const [day, mon, year] = d.split('-');
        const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        return new Date(parseInt(year), months[mon], parseInt(day));
      };
      return parseDate(a) - parseDate(b);
    });

    return {
      clinicians,
      allSlotTypes: Array.from(allSlotTypes),
      reportDate,
      dates: sortedDates,
      dateData,
      bookedData
    };
  };

  // Get capacity for a specific date from parsed huddle data
  // slotOverrides: optional object { slotName: true/false } to override which slots count
  const getHuddleCapacity = (parsedData, dateStr, slotOverrides = null) => {
    if (!parsedData || !parsedData.dateData[dateStr]) {
      return { am: { total: 0, byClinician: [] }, pm: { total: 0, byClinician: [] }, bySlotType: [] };
    }

    const huddleSettings = data?.huddleSettings || {};
    const urgentSlots = huddleSettings?.slotCategories?.urgent || [];
    const includedClinicians = huddleSettings?.includedClinicians || [];
    const hasUrgentConfig = urgentSlots.length > 0;
    const dayData = parsedData.dateData[dateStr];
    const clinicians = parsedData.clinicians;

    // Build effective slot filter: start from urgent config, apply overrides
    const isSlotIncluded = (slotType) => {
      if (slotOverrides && slotOverrides[slotType] !== undefined) return slotOverrides[slotType];
      if (hasUrgentConfig) return urgentSlots.includes(slotType);
      return true; // no config = show all
    };

    const amByClinician = [];
    const pmByClinician = [];
    let amTotal = 0;
    let pmTotal = 0;
    const slotTypeTotals = {};

    ['am', 'pm'].forEach(session => {
      Object.entries(dayData[session] || {}).forEach(([idx, slots]) => {
        const clinicianName = clinicians[parseInt(idx)];
        // Filter by included clinicians if configured
        if (includedClinicians.length > 0 && !includedClinicians.includes(clinicianName)) return;

        let clinicianTotal = 0;
        Object.entries(slots).forEach(([slotType, count]) => {
          // Filter by slot inclusion (respects overrides)
          if (!isSlotIncluded(slotType)) return;
          clinicianTotal += count;
          if (!slotTypeTotals[slotType]) slotTypeTotals[slotType] = { am: 0, pm: 0 };
          slotTypeTotals[slotType][session] += count;
        });

        if (clinicianTotal > 0) {
          const entry = { name: clinicianName, available: clinicianTotal };
          if (session === 'am') {
            amByClinician.push(entry);
            amTotal += clinicianTotal;
          } else {
            pmByClinician.push(entry);
            pmTotal += clinicianTotal;
          }
        }
      });
    });

    // Sort by availability descending
    amByClinician.sort((a, b) => b.available - a.available);
    pmByClinician.sort((a, b) => b.available - a.available);

    const bySlotType = Object.entries(slotTypeTotals)
      .map(([name, counts]) => ({ name, am: counts.am, pm: counts.pm, total: counts.am + counts.pm }))
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total);

    return { am: { total: amTotal, byClinician: amByClinician }, pm: { total: pmTotal, byClinician: pmByClinician }, bySlotType };
  };

  // Helper to parse CSV row (handles quoted fields)
  const parseCSVRow = (row) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Get effective slot list for a given overrides state
  const getEffectiveSlots = (overrides) => {
    const urgentSlots = data?.huddleSettings?.slotCategories?.urgent || [];
    const allKnown = data?.huddleSettings?.knownSlotTypes || [];
    if (!overrides) {
      // Use settings default: urgent slots if configured, otherwise all
      return urgentSlots.length > 0 ? urgentSlots : allKnown;
    }
    return allKnown.filter(s => overrides[s] !== false && (overrides[s] === true || urgentSlots.includes(s)));
  };

  // Initialize slot overrides from settings defaults
  const initSlotOverrides = () => {
    const urgentSlots = data?.huddleSettings?.slotCategories?.urgent || [];
    const allKnown = data?.huddleSettings?.knownSlotTypes || [];
    const overrides = {};
    allKnown.forEach(s => { overrides[s] = urgentSlots.includes(s); });
    return overrides;
  };

  // Render slot filter panel
  const renderSlotFilter = (overrides, setOverrides, show, setShow) => (
    <div className="flex-shrink-0">
      <button onClick={() => { if (!show && !overrides) setOverrides(initSlotOverrides()); setShow(!show); }} className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${show ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
        🔧 Slot Filter {show ? '▼' : '▶'}
      </button>
      {show && overrides && (
        <div className="card p-4 mt-2 w-64 max-h-72 overflow-y-auto">
          <div className="text-xs font-medium text-slate-700 mb-2">Include in count:</div>
          <div className="space-y-1">
            {(data?.huddleSettings?.knownSlotTypes || []).sort().map(slot => (
              <label key={slot} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                <input type="checkbox" checked={!!overrides[slot]} onChange={e => setOverrides({ ...overrides, [slot]: e.target.checked })} className="rounded border-slate-300" />
                <span className="truncate" title={slot}>{slot.length > 28 ? slot.slice(0, 28) + '...' : slot}</span>
              </label>
            ))}
          </div>
          <button onClick={() => setOverrides(null)} className="mt-2 text-xs text-purple-600 hover:underline">Reset to defaults</button>
        </div>
      )}
    </div>
  );

  // Parse date string "DD-Mon-YYYY" to Date
  const parseHuddleDateStr = (d) => {
    const [day, mon, year] = d.split('-');
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    return new Date(parseInt(year), months[mon], parseInt(day));
  };

  // Group huddle dates by week (Mon-Fri) for the forward planning grid
  // Only returns current week + next 5 weeks (6 total)
  const getHuddleWeeks = () => {
    if (!huddleData) return [];
    const weeks = {};
    // Find current Monday
    const now = new Date();
    const currentDay = now.getDay();
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    currentMonday.setHours(0, 0, 0, 0);
    // End = 6 weeks from current Monday (current + 5 more)
    const endDate = new Date(currentMonday);
    endDate.setDate(endDate.getDate() + 6 * 7);

    huddleData.dates.forEach(dateStr => {
      const d = parseHuddleDateStr(dateStr);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return;
      // Skip if before current Monday or after 6 weeks
      if (d < currentMonday || d >= endDate) return;
      const monday = new Date(d);
      monday.setDate(monday.getDate() - (dayOfWeek - 1));
      const weekKey = monday.toISOString().split('T')[0];
      if (!weeks[weekKey]) weeks[weekKey] = { monday, dates: {} };
      const dayName = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][dayOfWeek];
      weeks[weekKey].dates[dayName] = dateStr;
    });
    return Object.values(weeks).sort((a, b) => a.monday - b.monday);
  };

  // Get capacity colour based on expected targets
  const getCapacityColour = (actual, dayName, session) => {
    const targets = data?.huddleSettings?.expectedCapacity || {};
    const expected = targets[dayName]?.[session];
    if (!expected || expected <= 0) return ''; // no target set
    const pct = (actual / expected) * 100;
    if (pct >= 100) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (pct >= 80) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  // Get total booked/available for a date using a given slot filter
  const getDateTotals = (parsedData, dateStr, slotOverrides = null) => {
    if (!parsedData) return { available: 0, booked: 0 };
    const huddleSettings = data?.huddleSettings || {};
    const urgentSlots = huddleSettings?.slotCategories?.urgent || [];
    const includedClinicians = huddleSettings?.includedClinicians || [];
    const hasUrgentConfig = urgentSlots.length > 0;
    const clinicians = parsedData.clinicians;

    const isSlotIncluded = (slotType) => {
      if (slotOverrides && slotOverrides[slotType] !== undefined) return slotOverrides[slotType];
      if (hasUrgentConfig) return urgentSlots.includes(slotType);
      return true;
    };

    let available = 0, booked = 0;
    ['am', 'pm'].forEach(session => {
      // Available
      const avail = parsedData.dateData?.[dateStr]?.[session] || {};
      Object.entries(avail).forEach(([idx, slots]) => {
        const cName = clinicians[parseInt(idx)];
        if (includedClinicians.length > 0 && !includedClinicians.includes(cName)) return;
        Object.entries(slots).forEach(([slotType, count]) => {
          if (isSlotIncluded(slotType)) available += count;
        });
      });
      // Booked
      const book = parsedData.bookedData?.[dateStr]?.[session] || {};
      Object.entries(book).forEach(([idx, slots]) => {
        const cName = clinicians[parseInt(idx)];
        if (includedClinicians.length > 0 && !includedClinicians.includes(cName)) return;
        Object.entries(slots).forEach(([slotType, count]) => {
          if (isSlotIncluded(slotType)) booked += count;
        });
      });
    });
    return { available, booked };
  };

  // Build slot overrides for a named filter
  const getFilterOverrides = (filterName) => {
    const hs = data?.huddleSettings || {};
    const allKnown = hs?.knownSlotTypes || [];
    const customFilters = hs?.customFilters || {};

    // Built-in filters
    if (filterName === 'urgent') {
      const urgent = hs?.slotCategories?.urgent || [];
      if (urgent.length === 0) return null;
      const o = {};
      allKnown.forEach(s => { o[s] = urgent.includes(s); });
      return o;
    }
    if (filterName === 'all') {
      const excluded = hs?.slotCategories?.excluded || [];
      const o = {};
      allKnown.forEach(s => { o[s] = !excluded.includes(s); });
      return o;
    }
    // Custom filter
    if (customFilters[filterName]) {
      const slots = customFilters[filterName];
      const o = {};
      allKnown.forEach(s => { o[s] = slots.includes(s); });
      return o;
    }
    return null;
  };

  // Get all filter names (built-in + custom)
  const getAllFilterNames = () => {
    const custom = Object.keys(data?.huddleSettings?.customFilters || {});
    return ['urgent', ...custom, 'all'];
  };

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

  const getTodayKey = () => new Date().toISOString().split('T')[0];
  const isPastDate = (dateKey) => dateKey < getTodayKey();
  const isToday = (dateKey) => dateKey === getTodayKey();
  const isClosedDay = (dateKey) => data?.closedDays?.[dateKey] !== undefined;
  const getClosedReason = (dateKey) => data?.closedDays?.[dateKey] || '';

  const toggleClosedDay = (dateKey, reason = 'Bank Holiday') => {
    if (isPastDate(dateKey)) return;
    const newClosedDays = { ...data.closedDays };
    if (newClosedDays[dateKey]) delete newClosedDays[dateKey];
    else newClosedDays[dateKey] = reason;
    saveData({ ...data, closedDays: newClosedDays });
  };

  const hasPlannedAbsence = (clinicianId, dateKey) => {
    const absences = ensureArray(data?.plannedAbsences);
    return absences.some(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate);
  };

  const getPlannedAbsenceReason = (clinicianId, dateKey) => {
    const absences = ensureArray(data?.plannedAbsences);
    const absence = absences.find(a => a.clinicianId === clinicianId && dateKey >= a.startDate && dateKey <= a.endDate);
    return absence?.reason || 'Leave';
  };

  const isAbsentOnWorkingDate = (cid, dateKey, dayName) => {
    const rota = ensureArray(data?.weeklyRota?.[dayName]);
    if (!rota.includes(cid)) return false;
    return hasPlannedAbsence(cid, dateKey);
  };

  const isAbsentUntilNextPresent = (cid, fromDateKey) => {
    const clinician = data?.clinicians?.find(c => c.id === cid);
    if (!clinician) return false;
    if (clinician.longTermAbsent) return true;
    
    const workingDays = DAYS.filter(day => ensureArray(data?.weeklyRota?.[day]).includes(cid));
    if (workingDays.length === 0) return false;
    
    const indexToDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const startDate = new Date(fromDateKey + 'T12:00:00');
    
    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() - i);
      const dayIndex = checkDate.getDay();
      const dayName = indexToDay[dayIndex];
      const checkDateKey = checkDate.toISOString().split('T')[0];
      if (dayIndex === 0 || dayIndex === 6) continue;
      if (workingDays.includes(dayName)) {
        if (isAbsentOnWorkingDate(cid, checkDateKey, dayName)) return true;
        break;
      }
    }
    
    for (let i = 0; i <= 28; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dayIndex = checkDate.getDay();
      const dayName = indexToDay[dayIndex];
      const checkDateKey = checkDate.toISOString().split('T')[0];
      if (dayIndex === 0 || dayIndex === 6) continue;
      if (workingDays.includes(dayName)) {
        if (isAbsentOnWorkingDate(cid, checkDateKey, dayName)) return true;
        return false;
      }
    }
    return false;
  };

  const getScheduledClinicians = (day) => {
    const rota = ensureArray(data?.weeklyRota?.[day]);
    return rota.filter(id => {
      const clinician = data?.clinicians?.find(c => c.id === id);
      return clinician && !clinician.longTermAbsent;
    });
  };

  const getScheduledForDay = (day) => {
    const dateKey = getDateKeyForDay(day);
    const dayKey = `${dateKey}-${day}`;
    if (data?.dailyOverrides?.[dayKey]?.scheduled) return ensureArray(data.dailyOverrides[dayKey].scheduled);
    return getScheduledClinicians(day);
  };

  const getPresentClinicians = (day) => {
    const dateKey = getDateKeyForDay(day);
    const dayKey = `${dateKey}-${day}`;
    if (data?.dailyOverrides?.[dayKey]?.present) return ensureArray(data.dailyOverrides[dayKey].present);
    const scheduled = getScheduledForDay(day);
    return scheduled.filter(id => {
      const clinician = data?.clinicians?.find(c => c.id === id);
      if (clinician?.longTermAbsent) return false;
      if (hasPlannedAbsence(id, dateKey)) return false;
      if (isAbsentUntilNextPresent(id, dateKey)) return false;
      return true;
    });
  };

  const getAbsentClinicians = (day) => {
    const scheduled = getScheduledForDay(day);
    const presentIds = getPresentClinicians(day);
    return scheduled.filter(id => !presentIds.includes(id));
  };

  const getDayOffClinicians = (day) => {
    const scheduled = getScheduledForDay(day);
    const allClinicians = ensureArray(data?.clinicians);
    return allClinicians.filter(c => !scheduled.includes(c.id) && !c.longTermAbsent).map(c => c.id);
  };

  const getClinicianStatus = (id, day) => {
    const presentIds = ensureArray(getPresentClinicians(day));
    const absentIds = ensureArray(getAbsentClinicians(day));
    if (presentIds.includes(id)) return 'present';
    if (absentIds.includes(id)) return 'absent';
    return 'dayoff';
  };

  const togglePresence = (id, day) => {
    const dateKey = getDateKeyForDay(day);
    if (isPastDate(dateKey)) return;
    const dayKey = `${dateKey}-${day}`;
    const scheduled = getScheduledForDay(day);
    const currentPresent = ensureArray(getPresentClinicians(day));
    const isCurrentlyPresent = currentPresent.includes(id);
    const isOnRota = scheduled.includes(id);
    
    let newPresent = isCurrentlyPresent ? currentPresent.filter(cid => cid !== id) : [...currentPresent, id];
    let newScheduled = scheduled;
    if (!isOnRota && !isCurrentlyPresent) newScheduled = [...scheduled, id];
    else if (!isOnRota && isCurrentlyPresent) newScheduled = scheduled.filter(cid => cid !== id);
    
    const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: newScheduled } };
    saveData({ ...data, dailyOverrides: newOverrides });
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
      const res = await fetch('/api/sync-teamnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-password': password },
        body: JSON.stringify({ url: data.teamnetUrl, clinicians: ensureArray(data.clinicians) })
      });
      const result = await res.json();
      if (result.error) {
        if (!silent) setSyncStatus(`Error: ${result.error}`);
      } else {
        const newAbsences = result.absences || [];
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
    const weekStart = selectedWeek.toISOString().split('T')[0];
    const weekEndDate = new Date(selectedWeek);
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];
    const weekAbsences = [];
    absences.forEach(a => {
      DAYS.forEach(day => {
        const dateKey = getDateKeyForDay(day);
        if (dateKey >= a.startDate && dateKey <= a.endDate && dateKey >= weekStart && dateKey <= weekEnd) {
          const clinician = getClinicianById(a.clinicianId);
          if (clinician) weekAbsences.push({ day, clinician, reason: a.reason });
        }
      });
    });
    return weekAbsences;
  };

  const handleGenerate = () => {
    const dateKey = getDateKey();
    const day = selectedDay;
    const presentIds = ensureArray(getPresentClinicians(day));
    const absentIds = ensureArray(getAbsentClinicians(day));
    const dayOffIds = ensureArray(getDayOffClinicians(day));
    const cliniciansList = ensureArray(data.clinicians);
    const { allocations, dayOffAllocations } = generateBuddyAllocations(cliniciansList, presentIds, absentIds, dayOffIds, data.settings || DEFAULT_SETTINGS);
    const newHistory = { ...data.allocationHistory, [dateKey]: { date: dateKey, day, allocations, dayOffAllocations, presentIds, absentIds, dayOffIds } };
    saveData({ ...data, allocationHistory: newHistory });
  };

  const handleCopyAllocations = () => {
    const dateKey = getDateKey();
    const date = new Date(dateKey + 'T12:00:00');
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const currentAlloc = getCurrentAllocations();
    if (!currentAlloc) return;
    const grouped = groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, currentAlloc.presentIds || []);
    let text = `BUDDY ALLOCATION\n${dateStr}\n\n`;
    const allPresentIds = ensureArray(currentAlloc.presentIds);
    const allPresentRows = allPresentIds.map(id => {
      const clinician = getClinicianById(id);
      const tasks = grouped[id] || { absent: [], dayOff: [] };
      const canCover = clinician?.canProvideCover !== false;
      const hasAllocs = tasks.absent.length > 0 || tasks.dayOff.length > 0;
      return { id, clinician, tasks, canCover, hasAllocs };
    }).filter(row => row.clinician);
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
      text += `${clinician.initials}: File ${fileStr} / View ${viewStr}\n`;
    });
    navigator.clipboard.writeText(text.trim());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const toggleRotaDay = (clinicianId, day) => {
    const currentRota = ensureArray(data.weeklyRota[day]);
    const newRota = currentRota.includes(clinicianId) ? currentRota.filter(id => id !== clinicianId) : [...currentRota, clinicianId];
    saveData({ ...data, weeklyRota: { ...data.weeklyRota, [day]: newRota } });
  };

  const addClinician = () => {
    if (!newClinician.name || !newClinician.initials) return;
    const newId = Math.max(0, ...ensureArray(data.clinicians).map(c => c.id)) + 1;
    const clinician = { id: newId, name: newClinician.name, initials: newClinician.initials.toUpperCase(), role: newClinician.role || 'GP', sessions: newClinician.sessions || 6, primaryBuddy: null, secondaryBuddy: null, longTermAbsent: false, canProvideCover: true };
    saveData({ ...data, clinicians: [...ensureArray(data.clinicians), clinician] });
    setNewClinician({ name: '', role: '', initials: '', sessions: 6 });
    setShowAddClinician(false);
  };

  const removeClinician = (id) => {
    if (!confirm('Remove this clinician?')) return;
    const newClinicians = ensureArray(data.clinicians).filter(c => c.id !== id);
    const newRota = { ...data.weeklyRota };
    DAYS.forEach(day => { newRota[day] = ensureArray(newRota[day]).filter(cid => cid !== id); });
    saveData({ ...data, clinicians: newClinicians, weeklyRota: newRota });
  };

  const updateClinicianField = (id, field, value) => {
    const newClinicians = ensureArray(data.clinicians).map(c => {
      if (c.id !== id) return c;
      let processedValue = value;
      if (field === 'sessions') processedValue = parseInt(value) || 6;
      if (field === 'primaryBuddy' || field === 'secondaryBuddy') processedValue = value ? parseInt(value) : null;
      return { ...c, [field]: processedValue };
    });
    saveData({ ...data, clinicians: newClinicians });
  };

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
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-4 text-sm" placeholder="Enter practice password" autoFocus />
            {passwordError && <p className="text-red-600 text-sm mb-4">{passwordError}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? 'Checking...' : 'Sign in'}</button>
          </form>
        </div>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen flex items-center justify-center"><div className="text-white/80">Loading...</div></div>;

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
  const displayClinicians = cliniciansList;

  const toggleMenu = (menu) => setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));

  return (
    <div className="min-h-screen flex">
      {copySuccess && <div className="fixed bottom-4 right-4 bg-white text-slate-900 px-3 py-2 rounded-md text-sm font-medium shadow-lg z-50">Copied to clipboard</div>}
      {dataSaved && <div className="fixed bottom-4 right-4 bg-emerald-500 text-white px-3 py-2 rounded-md text-sm font-medium shadow-lg z-50">Saved</div>}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gradient-to-b from-indigo-950 via-purple-900 to-violet-900 flex-shrink-0 transition-all duration-200`}>
        <div className="sticky top-0 h-screen flex flex-col">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-lg p-2 shadow-lg flex-shrink-0">
                <img src={LOGO_URL} alt="Practice" className="h-10" />
              </div>
              {sidebarOpen && <div className="min-w-0"><h1 className="text-base font-bold text-white truncate">W&B Family</h1><p className="text-xs text-purple-200 truncate">Practice</p></div>}
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-4">
            {/* Buddy System */}
            <div>
              <button onClick={() => toggleMenu('buddy')} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${expandedMenus.buddy ? 'text-white' : 'text-purple-200 hover:text-white'}`}>
                <span className="text-lg">📋</span>
                {sidebarOpen && <><span className="flex-1 text-left">Buddy System</span><span className="text-xs">{expandedMenus.buddy ? '▼' : '▶'}</span></>}
              </button>
              {expandedMenus.buddy && sidebarOpen && (
                <div className="ml-4 border-l border-white/10">
                  <button onClick={() => setActiveSection('buddy-daily')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'buddy-daily' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Daily</button>
                  <button onClick={() => setActiveSection('buddy-week')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'buddy-week' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Week View</button>
                </div>
              )}
            </div>
            {/* Huddle */}
            <div>
              <button onClick={() => toggleMenu('huddle')} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${expandedMenus.huddle ? 'text-white' : 'text-purple-200 hover:text-white'}`}>
                <span className="text-lg">📊</span>
                {sidebarOpen && <><span className="flex-1 text-left">Huddle</span><span className="text-xs">{expandedMenus.huddle ? '▼' : '▶'}</span></>}
              </button>
              {expandedMenus.huddle && sidebarOpen && (
                <div className="ml-4 border-l border-white/10">
                  <button onClick={() => setActiveSection('huddle-today')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'huddle-today' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Today</button>
                  <button onClick={() => setActiveSection('huddle-forward')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'huddle-forward' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Forward Planning</button>
                  <button onClick={() => setActiveSection('huddle-settings')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'huddle-settings' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Settings</button>
                </div>
              )}
            </div>
            {/* Team */}
            <div>
              <button onClick={() => toggleMenu('team')} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${expandedMenus.team ? 'text-white' : 'text-purple-200 hover:text-white'}`}>
                <span className="text-lg">👥</span>
                {sidebarOpen && <><span className="flex-1 text-left">Team</span><span className="text-xs">{expandedMenus.team ? '▼' : '▶'}</span></>}
              </button>
              {expandedMenus.team && sidebarOpen && (
                <div className="ml-4 border-l border-white/10">
                  <button onClick={() => setActiveSection('team-members')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'team-members' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Members</button>
                  <button onClick={() => setActiveSection('team-rota')} className={`w-full flex items-center gap-2 pl-6 pr-4 py-2 text-sm transition-colors ${activeSection === 'team-rota' ? 'text-white bg-white/10' : 'text-purple-300 hover:text-white hover:bg-white/5'}`}>Clinician Rota</button>
                </div>
              )}
            </div>
            {/* Settings */}
            <button onClick={() => setActiveSection('settings')} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${activeSection === 'settings' ? 'text-white bg-white/10' : 'text-purple-200 hover:text-white hover:bg-white/5'}`}>
              <span className="text-lg">⚙️</span>{sidebarOpen && <span>Settings</span>}
            </button>
          </nav>
          <div className="p-3 border-t border-white/10">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex items-center justify-center gap-2 py-2 text-purple-200 hover:text-white text-sm">{sidebarOpen ? '◀ Collapse' : '▶'}</button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen bg-slate-100">
        <div className="max-w-6xl mx-auto p-6">
          
          {/* BUDDY DAILY */}
          {activeSection === 'buddy-daily' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Daily Allocation</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {data.lastSyncTime ? `TeamNet synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'TeamNet not synced'}
                    {syncStatus && <span className="ml-2 text-emerald-600">{syncStatus}</span>}
                  </p>
                </div>
                {isGenerating ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 min-w-[160px]"><div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full animate-progress" /></div></div>
                    <button onClick={() => setIsGenerating(false)} className="btn-secondary text-xs py-1 px-2">Stop</button>
                  </div>
                ) : (
                  <button onClick={async () => {
                    setIsGenerating(true);
                    await new Promise(r => setTimeout(r, 50));
                    const currentData = data;
                    let generated = 0;
                    const newHistory = { ...currentData.allocationHistory };
                    const newOverrides = { ...currentData.dailyOverrides };
                    const today = new Date();
                    let stopped = false;
                    const clins = Array.isArray(currentData.clinicians) ? currentData.clinicians : Object.values(currentData.clinicians || {});
                    const plannedAbs = Array.isArray(currentData.plannedAbsences) ? currentData.plannedAbsences : Object.values(currentData.plannedAbsences || {});
                    
                    for (let i = 0; i < 28 && !stopped; i++) {
                      const checkDate = new Date(today);
                      checkDate.setDate(checkDate.getDate() + i);
                      const dayIndex = checkDate.getDay();
                      if (dayIndex === 0 || dayIndex === 6) continue;
                      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
                      const dateKey = checkDate.toISOString().split('T')[0];
                      const dayKey = `${dateKey}-${dayName}`;
                      if (currentData.closedDays?.[dateKey]) continue;
                      delete newOverrides[dayKey];
                      const rota = currentData.weeklyRota?.[dayName] || [];
                      const scheduled = Array.isArray(rota) ? rota : Object.values(rota);
                      const present = scheduled.filter(id => {
                        const c = clins.find(c => c.id === id);
                        if (c?.longTermAbsent) return false;
                        return !plannedAbs.some(a => a.clinicianId === id && dateKey >= a.startDate && dateKey <= a.endDate);
                      });
                      const absentIdsGen = scheduled.filter(id => !present.includes(id));
                      const dayOffIdsGen = clins.filter(c => !scheduled.includes(c.id) && !c.longTermAbsent).map(c => c.id);
                      
                      // Cascade logic
                      const cascadeAbsent = [];
                      const idxToDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                      for (const doId of dayOffIdsGen) {
                        const c = clins.find(c => c.id === doId);
                        if (!c) continue;
                        if (c.longTermAbsent) { cascadeAbsent.push(doId); continue; }
                        const wDays = DAYS.filter(d => { const r = currentData.weeklyRota?.[d] || []; return (Array.isArray(r) ? r : Object.values(r)).includes(doId); });
                        if (wDays.length === 0) continue;
                        const cd = new Date(dateKey + 'T12:00:00');
                        let shouldAbs = false;
                        for (let j = 1; j <= 14; j++) {
                          const pd = new Date(cd); pd.setDate(pd.getDate() - j);
                          const pdi = pd.getDay(); const pdn = idxToDay[pdi]; const pdk = pd.toISOString().split('T')[0];
                          if (pdi === 0 || pdi === 6) continue;
                          if (wDays.includes(pdn)) { if (plannedAbs.some(a => a.clinicianId === doId && pdk >= a.startDate && pdk <= a.endDate)) shouldAbs = true; break; }
                        }
                        if (!shouldAbs) {
                          for (let j = 1; j <= 14; j++) {
                            const fd = new Date(cd); fd.setDate(fd.getDate() + j);
                            const fdi = fd.getDay(); const fdn = idxToDay[fdi]; const fdk = fd.toISOString().split('T')[0];
                            if (fdi === 0 || fdi === 6) continue;
                            if (wDays.includes(fdn)) { if (plannedAbs.some(a => a.clinicianId === doId && fdk >= a.startDate && fdk <= a.endDate)) shouldAbs = true; break; }
                          }
                        }
                        if (shouldAbs) cascadeAbsent.push(doId);
                      }
                      const finalAbsent = [...absentIdsGen, ...cascadeAbsent];
                      const finalDayOff = dayOffIdsGen.filter(id => !cascadeAbsent.includes(id));
                      const { allocations, dayOffAllocations } = generateBuddyAllocations(clins, present, finalAbsent, finalDayOff, currentData.settings || DEFAULT_SETTINGS);
                      newHistory[dateKey] = { date: dateKey, day: dayName, allocations, dayOffAllocations, presentIds: present, absentIds: finalAbsent, dayOffIds: finalDayOff };
                      generated++;
                      await new Promise(r => setTimeout(r, 10));
                      if (!isGenerating) stopped = true;
                    }
                    if (generated > 0) {
                      const nd = { ...currentData, allocationHistory: newHistory, dailyOverrides: newOverrides };
                      setData(nd);
                      try { await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify(nd) }); } catch (err) { console.error(err); }
                      setDataVersion(v => v + 1);
                    }
                    setIsGenerating(false);
                    setSyncStatus(stopped ? `Stopped — ${generated} days` : `Done — ${generated} days`);
                    setTimeout(() => setSyncStatus(''), 4000);
                  }} className="btn-primary">Generate Next 4 Weeks</button>
                )}
              </div>

              {/* Week navigator */}
              <div className="card p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">◀</button>
                    <div className="text-sm font-medium text-slate-900 min-w-[180px] text-center">{formatWeekRange(selectedWeek)}</div>
                    <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">▶</button>
                    <button onClick={() => { setSelectedWeek(getWeekStart(new Date())); setSelectedDay(getCurrentDay()); }} className="ml-2 px-4 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 shadow-md">Today</button>
                  </div>
                  <div className="flex items-center gap-2">
                    {DAYS.map(day => {
                      const dk = getDateKeyForDay(day);
                      const closed = isClosedDay(dk);
                      const todayDate = isToday(dk);
                      return (
                        <button key={day} onClick={() => setSelectedDay(day)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative ${selectedDay === day ? 'bg-slate-900 text-white' : closed ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                          {day.slice(0, 3)}
                          {todayDate && <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full"></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {isClosedDay(getDateKey()) ? (
                <div className="card p-8 text-center">
                  <div className="text-2xl mb-2">🏠</div>
                  <div className="text-lg font-medium text-slate-900 mb-1">Practice Closed</div>
                  <div className="text-sm text-slate-500">{getClosedReason(getDateKey())}</div>
                  {!isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey())} className="mt-4 text-sm text-purple-600 hover:text-purple-800">Mark as open →</button>}
                </div>
              ) : (
                <>
                  {/* Attendance */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Attendance</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{formatDate(getDateKey())}{!isPastDate(getDateKey()) && ' — Click to toggle'}</p>
                      </div>
                      {!isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey(), 'Bank Holiday')} className="text-xs text-slate-400 hover:text-slate-600">Mark closed</button>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {displayClinicians.map(c => {
                        const status = getClinicianStatus(c.id, selectedDay);
                        const lta = c.longTermAbsent;
                        const hasPlanned = hasPlannedAbsence(c.id, getDateKey());
                        const plannedReason = getPlannedAbsenceReason(c.id, getDateKey());
                        const past = isPastDate(getDateKey());
                        const showInfo = lta || hasPlanned;
                        return (
                          <div key={c.id} className={`clinician-card ${status}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`initials-badge ${status}`}>{c.initials || '??'}</div>
                                <div>
                                  <div className="text-sm font-medium text-slate-900">{c.name}</div>
                                  <div className="text-xs text-slate-500">{c.role}</div>
                                  {showInfo && <div className="text-xs mt-0.5">{hasPlanned && <span className="text-blue-600">TeamNet: {plannedReason}</span>}{hasPlanned && lta && <span className="text-slate-400"> · </span>}{lta && <span className="text-amber-600">LTA</span>}</div>}
                                </div>
                              </div>
                              {past ? <span className="text-xs text-slate-400">{status === 'present' ? '✓' : status === 'absent' ? '✗' : '—'}</span> : <button onClick={() => togglePresence(c.id, selectedDay)} className={`toggle-btn ${status === 'present' ? 'on' : status === 'dayoff' ? 'dayoff' : 'off'}`} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Allocations */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">Buddy Allocations</h2>
                        <p className="text-sm text-slate-500 mt-0.5">Workload balanced across present clinicians</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasAllocations && <button onClick={handleCopyAllocations} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-md flex items-center gap-2">📋 Copy</button>}
                        {!isPastDate(getDateKey()) && <button onClick={handleGenerate} disabled={presentClinicians.length === 0} className="btn-primary">{hasAllocations ? 'Regenerate' : 'Generate'}</button>}
                      </div>
                    </div>
                    {!hasAllocations ? (
                      <div className="text-center py-8 text-slate-400">
                        <div className="text-2xl mb-2">📋</div>
                        <div className="text-sm">No allocations yet for {selectedDay}</div>
                        {presentClinicians.length > 0 && !isPastDate(getDateKey()) && <div className="text-xs mt-1">Click Generate to create buddy assignments</div>}
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Covering</th>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide"><span className="text-red-600">File & Action</span><span className="text-slate-400 font-normal ml-1">(absent)</span></th>
                                <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide"><span className="text-amber-600">View Only</span><span className="text-slate-400 font-normal ml-1">(day off)</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const rows = presentIds.map(id => {
                                  const c = getClinicianById(id);
                                  const t = groupedAllocations[id] || { absent: [], dayOff: [] };
                                  const can = c?.canProvideCover !== false;
                                  const has = t.absent.length > 0 || t.dayOff.length > 0;
                                  return { id, clinician: c, tasks: t, canCover: can, hasAllocs: has };
                                }).filter(r => r.clinician);
                                rows.sort((a, b) => {
                                  if (a.canCover && !b.canCover) return -1;
                                  if (!a.canCover && b.canCover) return 1;
                                  if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; }
                                  return 0;
                                });
                                return rows.map(({ clinician, tasks, canCover }) => (
                                  <tr key={clinician.id} className={`border-b border-slate-50 last:border-0 ${!canCover ? 'opacity-50' : ''}`}>
                                    <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="initials-badge present">{clinician.initials}</div><div><div className="text-sm font-medium text-slate-900">{clinician.name}</div><div className="text-xs text-slate-500">{clinician.role}</div></div></div></td>
                                    <td className="py-3 px-4">{tasks.absent.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.absent.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="status-tag absent">{x.initials}</span> : null; })}</div> : <span className="text-slate-300">—</span>}</td>
                                    <td className="py-3 px-4">{tasks.dayOff.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.dayOff.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="status-tag dayoff">{x.initials}</span> : null; })}</div> : <span className="text-slate-300">—</span>}</td>
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 flex gap-6 text-xs text-slate-500">
                          <span><strong className="text-emerald-600">{presentClinicians.length}</strong> present</span>
                          <span><strong className="text-red-600">{absentClinicians.length}</strong> absent</span>
                          <span><strong className="text-amber-600">{dayOffClinicians.length}</strong> day off</span>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* BUDDY WEEK VIEW */}
          {activeSection === 'buddy-week' && (
            <div className="space-y-6">
              <h1 className="text-xl font-bold text-slate-900">Week View</h1>
              <div className="card p-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">◀ Prev</button>
                    <div className="text-sm font-medium text-slate-900 min-w-[180px] text-center">{formatWeekRange(selectedWeek)}</div>
                    <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">Next ▶</button>
                    <button onClick={() => setSelectedWeek(getWeekStart(new Date()))} className="ml-2 px-4 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 shadow-md">Today</button>
                  </div>
                  <button onClick={() => {
                    const missing = DAYS.filter(d => { const dk = getDateKeyForDay(d); return !isClosedDay(dk) && !data?.allocationHistory?.[dk]; });
                    if (missing.length > 0) { alert(`Missing allocations for: ${missing.join(', ')}`); return; }
                    let s = `BUDDY ALLOCATIONS — ${formatWeekRange(selectedWeek)}\n${'='.repeat(50)}\n\n`;
                    DAYS.forEach(d => {
                      const dk = getDateKeyForDay(d);
                      const dt = new Date(dk + 'T12:00:00');
                      const ds = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
                      if (isClosedDay(dk)) { s += `${ds}\nPRACTICE CLOSED — ${getClosedReason(dk)}\n\n`; return; }
                      const e = data?.allocationHistory?.[dk];
                      if (!e) { s += `${ds}\nNo allocation generated\n\n`; return; }
                      s += `${ds}\n`;
                      const g = groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []);
                      const rows = (e.presentIds || []).map(id => { const c = getClinicianById(id); const t = g[id] || { absent: [], dayOff: [] }; return { clinician: c, tasks: t, canCover: c?.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 }; }).filter(r => r.clinician);
                      rows.sort((a, b) => { if (a.canCover && !b.canCover) return -1; if (!a.canCover && b.canCover) return 1; if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; } return 0; });
                      if (rows.length === 0) { s += `No clinicians present\n\n`; return; }
                      rows.forEach(({ clinician, tasks }) => { const f = tasks.absent.length > 0 ? tasks.absent.map(i => getClinicianById(i)?.initials || '??').join(', ') : '-'; const v = tasks.dayOff.length > 0 ? tasks.dayOff.map(i => getClinicianById(i)?.initials || '??').join(', ') : '-'; s += `${clinician.initials}: File ${f} / View ${v}\n`; });
                      s += '\n';
                    });
                    navigator.clipboard.writeText(s.trim());
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-md flex items-center gap-2">📋 Copy Week</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {DAYS.map(d => {
                  const dk = getDateKeyForDay(d);
                  const dt = new Date(dk + 'T12:00:00');
                  const closed = isClosedDay(dk);
                  const e = data?.allocationHistory?.[dk];
                  const has = !!e;
                  const g = has ? groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []) : {};
                  const hasA = has && Object.entries(g).some(([_, t]) => t.absent.length > 0 || t.dayOff.length > 0);
                  return (
                    <div key={d} className={`card overflow-hidden ${closed ? 'bg-slate-100' : ''}`}>
                      <div className={`px-4 py-3 border-b ${closed ? 'bg-slate-200 border-slate-300' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                          <div><div className="text-sm font-medium text-slate-900">{d}</div><div className="text-xs text-slate-500">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div></div>
                          <button onClick={() => toggleClosedDay(dk, 'Bank Holiday')} className={`text-xs px-2 py-1 rounded transition-colors ${closed ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{closed ? 'Closed' : 'Open'}</button>
                        </div>
                      </div>
                      <div className="p-4 min-h-[120px]">
                        {closed ? <div className="text-center text-slate-500 text-sm py-4"><div className="font-medium">Practice Closed</div><div className="text-xs mt-1">{getClosedReason(dk)}</div></div>
                        : !has ? <div className="text-center text-amber-600 text-sm py-4"><div className="font-medium">Not generated</div><div className="text-xs mt-1 text-slate-500">Go to Daily view</div></div>
                        : !hasA ? <div className="text-center text-emerald-600 text-sm py-4"><div className="font-medium">All present</div><div className="text-xs mt-1 text-slate-500">No cover needed</div></div>
                        : <div className="space-y-2 text-sm">{Object.entries(g).map(([bid, t]) => { if (t.absent.length === 0 && t.dayOff.length === 0) return null; const b = getClinicianById(parseInt(bid)); if (!b) return null; return (<div key={bid} className="flex items-start gap-2"><span className="font-medium text-slate-700 w-8">{b.initials}</span><div className="flex flex-wrap gap-1">{t.absent.map(i => { const x = getClinicianById(i); return x ? <span key={i} className="status-tag absent text-xs">{x.initials}</span> : null; })}{t.dayOff.map(i => { const x = getClinicianById(i); return x ? <span key={i} className="status-tag dayoff text-xs">{x.initials}</span> : null; })}</div></div>); })}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-6 text-xs text-slate-500 justify-center">
                <span className="flex items-center gap-1.5"><span className="status-tag absent">XX</span>File & Action (absent)</span>
                <span className="flex items-center gap-1.5"><span className="status-tag dayoff">XX</span>View Only (day off)</span>
              </div>

              <div className="card p-5">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">Planned Leave This Week</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{data.lastSyncTime ? `Last synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not yet synced'}</p>
                </div>
                {getWeekAbsences().length === 0 ? <div className="text-center py-6 text-slate-400 text-sm">{data.teamnetUrl ? 'No planned leave this week' : 'Set TeamNet URL in Settings to sync leave calendar'}</div>
                : <div className="grid grid-cols-5 gap-2">{DAYS.map(d => { const dk = getDateKeyForDay(d); const dt = new Date(dk + 'T12:00:00'); const da = getWeekAbsences().filter(a => a.day === d); return (<div key={d} className="border border-slate-200 rounded-lg overflow-hidden"><div className="bg-slate-50 px-3 py-2 border-b border-slate-200"><div className="text-xs font-medium text-slate-700">{d.slice(0, 3)}</div><div className="text-xs text-slate-400">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div></div><div className="p-2 min-h-[60px]">{da.length === 0 ? <div className="text-xs text-slate-300 text-center py-2">—</div> : <div className="space-y-1">{da.map((a, i) => { const cc = a.reason === 'Holiday' || a.reason === 'Annual Leave' ? 'bg-blue-100 text-blue-700' : a.reason === 'Training' || a.reason === 'Study' ? 'bg-amber-100 text-amber-700' : a.reason === 'Sick' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'; return <div key={i} className="flex items-center gap-1.5"><span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cc}`}>{a.clinician.initials}</span><span className="text-xs text-slate-400 truncate">{a.reason}</span></div>; })}</div>}</div></div>); })}</div>}
              </div>
            </div>
          )}

          {/* HUDDLE - TODAY */}
          {activeSection === 'huddle-today' && (
            <div className="space-y-6">
              {/* Header with upload */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Today's Huddle</h1>
                  {data?.huddleCsvUploadedAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Last report uploaded: {new Date(data.huddleCsvUploadedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setHuddleError('');
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const parsed = parseHuddleCSV(event.target.result);
                        setHuddleData(parsed);
                        const today = new Date();
                        const todayStr = `${String(today.getDate()).padStart(2,'0')}-${today.toLocaleString('en-GB',{month:'short'})}-${today.getFullYear()}`;
                        setHuddleDate(parsed.dates.includes(todayStr) ? todayStr : parsed.dates[0]);
                        const hs = data.huddleSettings || {};
                        const uploadTime = new Date().toISOString();
                        saveData({ ...data, huddleCsvData: parsed, huddleCsvUploadedAt: uploadTime, huddleSettings: { ...hs, knownClinicians: [...new Set([...(hs.knownClinicians||[]), ...parsed.clinicians])], knownSlotTypes: [...new Set([...(hs.knownSlotTypes||[]), ...parsed.allSlotTypes])], lastUploadDate: uploadTime } }, false);
                      } catch (err) { setHuddleError('Failed to parse CSV: ' + err.message); }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }} />
                  {(() => {
                    const isToday = (() => {
                      if (!data?.huddleCsvUploadedAt) return false;
                      const uploaded = new Date(data.huddleCsvUploadedAt);
                      const now = new Date();
                      return uploaded.toDateString() === now.toDateString();
                    })();
                    return (
                      <button onClick={() => fileInputRef.current?.click()} className={`px-4 py-2 rounded-md text-sm font-medium text-white shadow-sm transition-colors ${isToday ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}>
                        {isToday ? '✓ Upload Report' : '⚠ Upload Report'}
                      </button>
                    );
                  })()}
                </div>
              </div>

              {huddleError && <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm">{huddleError}</div>}

              {/* KEY MESSAGES - at the top */}
              <div className="card overflow-hidden">
                <div className="bg-blue-50 px-5 py-3 border-b border-blue-100">
                  <div className="text-sm font-semibold text-blue-900">📌 Key Messages</div>
                </div>
                <div className="p-4 space-y-3">
                  {huddleMessages.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-2">No messages. Add a message below.</p>
                  )}
                  {huddleMessages.map((msg, i) => (
                    <div key={msg.id || i} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800">{msg.text}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {msg.author && <span className="font-medium text-slate-500">{msg.author}</span>}
                          {msg.author && msg.addedAt && <span> · </span>}
                          {msg.addedAt && new Date(msg.addedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button onClick={() => {
                        const updated = huddleMessages.filter((_, idx) => idx !== i);
                        setHuddleMessages(updated);
                        saveData({ ...data, huddleMessages: updated }, false);
                      }} className="text-xs text-slate-400 hover:text-red-500 flex-shrink-0 p-1">✕</button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input type="text" value={newHuddleAuthor} onChange={e => setNewHuddleAuthor(e.target.value)} placeholder="Your name" className="w-32 px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" />
                    <input type="text" value={newHuddleMessage} onChange={e => setNewHuddleMessage(e.target.value)} onKeyDown={e => {
                      if (e.key === 'Enter' && newHuddleMessage.trim()) {
                        const updated = [...huddleMessages, { id: Date.now(), text: newHuddleMessage.trim(), author: newHuddleAuthor.trim() || null, addedAt: new Date().toISOString() }];
                        setHuddleMessages(updated);
                        saveData({ ...data, huddleMessages: updated }, false);
                        setNewHuddleMessage('');
                      }
                    }} placeholder="Add a message for the huddle..." className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" />
                    <button onClick={() => {
                      if (!newHuddleMessage.trim()) return;
                      const updated = [...huddleMessages, { id: Date.now(), text: newHuddleMessage.trim(), author: newHuddleAuthor.trim() || null, addedAt: new Date().toISOString() }];
                      setHuddleMessages(updated);
                      saveData({ ...data, huddleMessages: updated }, false);
                      setNewHuddleMessage('');
                    }} className="btn-primary text-sm">Add</button>
                  </div>
                </div>
              </div>

              {/* URGENT ON THE DAY */}
              {!huddleData ? (
                <div className="card p-12 text-center">
                  <div className="text-5xl mb-4">📊</div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload Appointment Report</h2>
                  <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload your EMIS appointment huddle dashboard CSV to see urgent capacity.</p>
                  <button onClick={() => fileInputRef.current?.click()} className="btn-primary">Select CSV File</button>
                </div>
              ) : (
                <>
                  {/* Section heading with slot filter */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Urgent on the Day</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Available urgent capacity for today</p>
                    </div>
                    {renderSlotFilter(huddleSlotOverrides, setHuddleSlotOverrides, showSlotFilter, setShowSlotFilter)}
                  </div>

                  {(() => {
                    const today = new Date();
                    const todayStr = `${String(today.getDate()).padStart(2,'0')}-${today.toLocaleString('en-GB',{month:'short'})}-${today.getFullYear()}`;
                    const displayDate = huddleData.dates.includes(todayStr) ? todayStr : huddleData.dates[0];
                    const capacity = getHuddleCapacity(huddleData, displayDate, huddleSlotOverrides);
                    const grandTotal = capacity.am.total + capacity.pm.total;
                    const isActuallyToday = displayDate === todayStr;
                    return (
                      <>
                        {!isActuallyToday && (
                          <div className="card p-3 bg-amber-50 border-amber-200 text-amber-800 text-sm flex items-center gap-2">
                            <span>⚠️</span>
                            <span>Today's date not found in report. Showing data for <strong>{displayDate}</strong>.</span>
                          </div>
                        )}

                        <div className="text-center py-4">
                          <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-blue-500">{grandTotal}</div>
                          <div className="text-sm text-slate-500 mt-1">urgent slots available{isActuallyToday ? ' today' : ` (${displayDate})`}</div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="card overflow-hidden">
                            <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-3">
                              <div className="flex items-center justify-between text-white">
                                <div><div className="text-lg font-bold">Morning</div><div className="text-xs opacity-90">08:00 – 13:00</div></div>
                                <div className="text-3xl font-bold">{capacity.am.total}</div>
                              </div>
                            </div>
                            <div className="p-4">
                              {capacity.am.byClinician.length > 0 ? (
                                <div className="space-y-2">{capacity.am.byClinician.map((c, i) => <div key={i} className="flex items-center justify-between"><span className="text-sm text-slate-700">{c.name}</span><span className="text-sm font-semibold text-amber-600">{c.available}</span></div>)}</div>
                              ) : <div className="text-center text-slate-400 text-sm py-4">No capacity</div>}
                            </div>
                          </div>
                          <div className="card overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-400 to-indigo-500 px-5 py-3">
                              <div className="flex items-center justify-between text-white">
                                <div><div className="text-lg font-bold">Afternoon</div><div className="text-xs opacity-90">13:00 – 18:30</div></div>
                                <div className="text-3xl font-bold">{capacity.pm.total}</div>
                              </div>
                            </div>
                            <div className="p-4">
                              {capacity.pm.byClinician.length > 0 ? (
                                <div className="space-y-2">{capacity.pm.byClinician.map((c, i) => <div key={i} className="flex items-center justify-between"><span className="text-sm text-slate-700">{c.name}</span><span className="text-sm font-semibold text-blue-600">{c.available}</span></div>)}</div>
                              ) : <div className="text-center text-slate-400 text-sm py-4">No capacity</div>}
                            </div>
                          </div>
                        </div>

                        {capacity.bySlotType.length > 0 && (
                          <div className="card overflow-hidden">
                            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                              <div className="text-sm font-semibold text-slate-900">Capacity by Slot Type</div>
                            </div>
                            <div className="p-4">
                              <table className="w-full text-sm">
                                <thead><tr className="text-xs text-slate-500 uppercase"><th className="text-left py-1 font-medium">Slot Type</th><th className="text-right py-1 font-medium w-16">AM</th><th className="text-right py-1 font-medium w-16">PM</th><th className="text-right py-1 font-medium w-16">Total</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                  {capacity.bySlotType.map((s, i) => <tr key={i}><td className="py-2 text-slate-700">{s.name}</td><td className="py-2 text-right text-amber-600 font-medium">{s.am || '–'}</td><td className="py-2 text-right text-blue-600 font-medium">{s.pm || '–'}</td><td className="py-2 text-right font-semibold text-slate-900">{s.total}</td></tr>)}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {(!data.huddleSettings?.slotCategories?.urgent?.length) && (
                          <div className="card p-4 bg-amber-50 border-amber-200">
                            <div className="flex items-start gap-3">
                              <span className="text-lg">⚠️</span>
                              <div>
                                <div className="text-sm font-medium text-amber-800">Configure Urgent Slot Types</div>
                                <p className="text-xs text-amber-700 mt-1">Go to Huddle → Settings to define which slot types count as urgent capacity.</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* HUDDLE - FORWARD PLANNING */}
          {activeSection === 'huddle-forward' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Urgent Capacity Planning</h1>
                  <p className="text-sm text-slate-500 mt-1">This week + next 5 weeks</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
                    {getAllFilterNames().map(f => (
                      <button key={f} onClick={() => { setForwardViewMode(f); setForwardSlotOverrides(null); }} className={`px-3 py-1.5 font-medium transition-colors border-r border-slate-200 last:border-r-0 capitalize ${forwardViewMode === f ? (f === 'urgent' ? 'bg-red-50 text-red-700' : f === 'all' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700') : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{f}</button>
                    ))}
                  </div>
                  {renderSlotFilter(forwardSlotOverrides, setForwardSlotOverrides, showForwardSlotFilter, setShowForwardSlotFilter)}
                </div>
              </div>

              {!huddleData ? (
                <div className="card p-12 text-center">
                  <div className="text-5xl mb-4">📅</div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-2">No Report Data</h2>
                  <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload a report on the Today page first.</p>
                  <button onClick={() => setActiveSection('huddle-today')} className="btn-primary">Go to Today</button>
                </div>
              ) : (
                <div className="flex gap-4">
                  {/* Table */}
                  <div className="flex-1 min-w-0">
                    {data?.huddleSettings?.expectedCapacity && Object.keys(data.huddleSettings.expectedCapacity).length > 0 && (
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-300"></span>≥100%</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-300"></span>80–99%</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 border border-red-300"></span>&lt;80%</span>
                      </div>
                    )}
                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-3 py-2 font-medium text-slate-600 sticky left-0 bg-slate-50 min-w-[90px]">Week</th>
                              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
                                <th key={d} className="text-center px-1 py-2 font-medium text-slate-600 min-w-[52px]">{d}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {getHuddleWeeks().map((week, wi) => {
                              const weekLabel = `${week.monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
                              const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
                              const viewOverrides = forwardSlotOverrides || getFilterOverrides(forwardViewMode);
                              return (
                                <tr key={wi} className={`border-b border-slate-100 ${wi % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                                  <td className="px-3 py-1 font-medium text-slate-700 sticky left-0 bg-white text-[11px] whitespace-nowrap">{weekLabel}</td>
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => {
                                    const dateStr = week.dates[d];
                                    if (!dateStr) return <td key={d} className="text-center px-1 py-1 text-slate-300">–</td>;
                                    const cap = getHuddleCapacity(huddleData, dateStr, viewOverrides);
                                    const amColour = getCapacityColour(cap.am.total, dayNames[d], 'am');
                                    const pmColour = getCapacityColour(cap.pm.total, dayNames[d], 'pm');
                                    const isSelected = selectedCell?.dateStr === dateStr;
                                    return (
                                      <td key={d} className={`px-1 py-1 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-purple-500 ring-inset rounded' : 'hover:bg-purple-50'}`} onClick={() => setSelectedCell(isSelected ? null : { dateStr, dayName: d, fullDay: dayNames[d] })}>
                                        <div className="flex flex-col items-center gap-0.5">
                                          <div className={`w-full text-center rounded-sm px-1 py-0.5 font-semibold ${amColour || 'text-slate-700'}`}>
                                            <span className="text-[9px] font-normal text-slate-400 mr-0.5">AM</span>{cap.am.total}
                                          </div>
                                          <div className={`w-full text-center rounded-sm px-1 py-0.5 font-semibold ${pmColour || 'text-slate-700'}`}>
                                            <span className="text-[9px] font-normal text-slate-400 mr-0.5">PM</span>{cap.pm.total}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {getHuddleWeeks().length === 0 && (
                      <div className="card p-8 text-center text-slate-400 text-sm mt-2">No data found for the current or upcoming weeks.</div>
                    )}
                  </div>

                  {/* Popup panel on right */}
                  {selectedCell && (() => {
                    const viewOverrides = forwardSlotOverrides || getFilterOverrides(forwardViewMode);
                    const cap = getHuddleCapacity(huddleData, selectedCell.dateStr, viewOverrides);
                    return (
                      <div className="w-72 flex-shrink-0">
                        <div className="card overflow-hidden sticky top-6">
                          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-3">
                            <div className="flex items-center justify-between text-white">
                              <div>
                                <div className="text-sm font-bold">{selectedCell.dayName} {selectedCell.dateStr}</div>
                                <div className="text-xs opacity-80">{cap.am.total + cap.pm.total} total slots</div>
                              </div>
                              <button onClick={() => setSelectedCell(null)} className="text-white/70 hover:text-white text-lg">✕</button>
                            </div>
                          </div>
                          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                            {/* AM */}
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-amber-600">Morning</span>
                                <span className="text-sm font-bold text-amber-600">{cap.am.total}</span>
                              </div>
                              {cap.am.byClinician.length > 0 ? cap.am.byClinician.map((c, i) => (
                                <div key={i} className="flex items-center justify-between py-0.5">
                                  <span className="text-xs text-slate-600 truncate mr-2">{c.name}</span>
                                  <span className="text-xs font-semibold text-amber-600 tabular-nums">{c.available}</span>
                                </div>
                              )) : <div className="text-xs text-slate-400">No capacity</div>}
                            </div>
                            {/* PM */}
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-blue-600">Afternoon</span>
                                <span className="text-sm font-bold text-blue-600">{cap.pm.total}</span>
                              </div>
                              {cap.pm.byClinician.length > 0 ? cap.pm.byClinician.map((c, i) => (
                                <div key={i} className="flex items-center justify-between py-0.5">
                                  <span className="text-xs text-slate-600 truncate mr-2">{c.name}</span>
                                  <span className="text-xs font-semibold text-blue-600 tabular-nums">{c.available}</span>
                                </div>
                              )) : <div className="text-xs text-slate-400">No capacity</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* HUDDLE - SETTINGS */}
          {activeSection === 'huddle-settings' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Huddle Settings</h1>
                <p className="text-sm text-slate-500 mt-1">Configure clinicians, slot filters, and capacity targets</p>
              </div>

              {(!data.huddleSettings?.knownClinicians?.length && !data.huddleSettings?.knownSlotTypes?.length) ? (
                <div className="card p-12 text-center">
                  <div className="text-5xl mb-4">⚙️</div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload a Report First</h2>
                  <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">Upload an EMIS report on the Today page. Once uploaded, clinician names and slot types will appear here for configuration.</p>
                  <button onClick={() => setActiveSection('huddle-today')} className="btn-primary">Go to Today</button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Clinician Groups */}
                  <div className="card p-5">
                    <h2 className="text-base font-semibold text-slate-900 mb-2">Clinicians to Include</h2>
                    <p className="text-xs text-slate-500 mb-3">Click to toggle inclusion. Drag to assign to groups.</p>
                    {['clinician', 'nursing', 'other'].map(group => {
                      const groupLabels = { clinician: '👨‍⚕️ Clinician Team', nursing: '👩‍⚕️ Nursing Team', other: '📋 Other' };
                      const groupClinicians = (data.huddleSettings?.clinicianGroups?.[group] || []);
                      return (
                        <div key={group} className="mb-3">
                          <div className="text-xs font-medium text-slate-600 mb-1">{groupLabels[group]}</div>
                          <div className="min-h-[40px] p-2 bg-white rounded border-2 border-dashed border-slate-200" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const n=e.dataTransfer.getData('clinician');if(!n)return;const hs={...data.huddleSettings},g={...hs.clinicianGroups};['clinician','nursing','other'].forEach(c=>{g[c]=(g[c]||[]).filter(x=>x!==n)});g[group]=[...(g[group]||[]),n];saveData({...data,huddleSettings:{...hs,clinicianGroups:g}})}}>
                            <div className="flex flex-wrap gap-1.5">
                              {groupClinicians.map(name => {
                                const isIncluded = (data.huddleSettings?.includedClinicians || []).includes(name);
                                return <div key={name} draggable onDragStart={e=>e.dataTransfer.setData('clinician',name)} onClick={()=>{const hs={...data.huddleSettings},inc=hs.includedClinicians||[];hs.includedClinicians=isIncluded?inc.filter(c=>c!==name):[...inc,name];saveData({...data,huddleSettings:hs})}} className={`px-2 py-1 rounded text-xs cursor-pointer transition-colors ${isIncluded?'bg-purple-100 text-purple-800 font-medium':'bg-slate-100 text-slate-500'}`}>{name}</div>;
                              })}
                              {groupClinicians.length === 0 && <span className="text-xs text-slate-400 italic">Drag here</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(() => {
                      const ungrouped = (data.huddleSettings?.knownClinicians || []).filter(c => !['clinician', 'nursing', 'other'].some(g => (data.huddleSettings?.clinicianGroups?.[g] || []).includes(c)));
                      if (ungrouped.length === 0) return null;
                      return <div className="mt-2"><div className="text-xs text-slate-500 mb-1">Ungrouped:</div><div className="flex flex-wrap gap-1.5">{ungrouped.map(n => <div key={n} draggable onDragStart={e=>e.dataTransfer.setData('clinician',n)} className="px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 cursor-move">{n}</div>)}</div></div>;
                    })()}
                  </div>

                  {/* Slot Type Filters - dynamic and editable */}
                  <div className="card p-5">
                    <h2 className="text-base font-semibold text-slate-900 mb-2">Slot Type Filters</h2>
                    <p className="text-xs text-slate-500 mb-4">Create named filters by dragging slot types. These filters appear across the app for switching views.</p>

                    {/* Built-in: Urgent */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded">🔴 Urgent</span>
                        <span className="text-[10px] text-slate-400">Built-in</span>
                      </div>
                      <div className="min-h-[36px] p-2 bg-red-50/50 rounded border-2 border-dashed border-red-200" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const s=e.dataTransfer.getData('slot');if(!s)return;const hs={...data.huddleSettings},cats={...hs.slotCategories};Object.keys(cats).forEach(c=>{cats[c]=(cats[c]||[]).filter(x=>x!==s)});const cf={...hs.customFilters||{}};Object.keys(cf).forEach(f=>{cf[f]=cf[f].filter(x=>x!==s)});cats.urgent=[...(cats.urgent||[]),s];saveData({...data,huddleSettings:{...hs,slotCategories:cats,customFilters:cf}})}}>
                        <div className="flex flex-wrap gap-1">
                          {(data.huddleSettings?.slotCategories?.urgent || []).map(s => <div key={s} draggable onDragStart={e=>e.dataTransfer.setData('slot',s)} className="px-2 py-0.5 rounded text-xs cursor-move bg-red-100 text-red-800 truncate max-w-[200px]" title={s}>{s}</div>)}
                          {(data.huddleSettings?.slotCategories?.urgent || []).length === 0 && <span className="text-xs text-slate-400 italic">Drag slot types here</span>}
                        </div>
                      </div>
                    </div>

                    {/* Custom filters */}
                    {Object.entries(data.huddleSettings?.customFilters || {}).map(([filterName, slots]) => (
                      <div key={filterName} className="mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">🔵 {filterName}</span>
                          <button onClick={() => {
                            const hs = {...data.huddleSettings};
                            const cf = {...hs.customFilters};
                            delete cf[filterName];
                            hs.customFilters = cf;
                            saveData({...data, huddleSettings: hs});
                          }} className="text-[10px] text-red-400 hover:text-red-600">Remove</button>
                        </div>
                        <div className="min-h-[36px] p-2 bg-blue-50/30 rounded border-2 border-dashed border-blue-200" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const s=e.dataTransfer.getData('slot');if(!s)return;const hs={...data.huddleSettings},cats={...hs.slotCategories};Object.keys(cats).forEach(c=>{cats[c]=(cats[c]||[]).filter(x=>x!==s)});const cf={...hs.customFilters||{}};Object.keys(cf).forEach(f=>{cf[f]=cf[f].filter(x=>x!==s)});cf[filterName]=[...(cf[filterName]||[]),s];saveData({...data,huddleSettings:{...hs,slotCategories:cats,customFilters:cf}})}}>
                          <div className="flex flex-wrap gap-1">
                            {slots.map(s => <div key={s} draggable onDragStart={e=>e.dataTransfer.setData('slot',s)} className="px-2 py-0.5 rounded text-xs cursor-move bg-blue-100 text-blue-800 truncate max-w-[200px]" title={s}>{s}</div>)}
                            {slots.length === 0 && <span className="text-xs text-slate-400 italic">Drag slot types here</span>}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Built-in: Excluded */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">⚪ Excluded</span>
                        <span className="text-[10px] text-slate-400">Not counted in any view</span>
                      </div>
                      <div className="min-h-[36px] p-2 bg-slate-50 rounded border-2 border-dashed border-slate-200" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const s=e.dataTransfer.getData('slot');if(!s)return;const hs={...data.huddleSettings},cats={...hs.slotCategories};Object.keys(cats).forEach(c=>{cats[c]=(cats[c]||[]).filter(x=>x!==s)});const cf={...hs.customFilters||{}};Object.keys(cf).forEach(f=>{cf[f]=cf[f].filter(x=>x!==s)});cats.excluded=[...(cats.excluded||[]),s];saveData({...data,huddleSettings:{...hs,slotCategories:cats,customFilters:cf}})}}>
                        <div className="flex flex-wrap gap-1">
                          {(data.huddleSettings?.slotCategories?.excluded || []).map(s => <div key={s} draggable onDragStart={e=>e.dataTransfer.setData('slot',s)} className="px-2 py-0.5 rounded text-xs cursor-move bg-white text-slate-500 border border-slate-200 truncate max-w-[200px]" title={s}>{s}</div>)}
                          {(data.huddleSettings?.slotCategories?.excluded || []).length === 0 && <span className="text-xs text-slate-400 italic">Drag slot types here</span>}
                        </div>
                      </div>
                    </div>

                    {/* Add new filter */}
                    <div className="flex gap-2 items-center pt-2 border-t border-slate-200">
                      <input type="text" value={newFilterName} onChange={e => setNewFilterName(e.target.value)} placeholder="New filter name..." className="flex-1 px-3 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500" onKeyDown={e => {
                        if (e.key === 'Enter' && newFilterName.trim()) {
                          const hs = {...data.huddleSettings};
                          if (!hs.customFilters) hs.customFilters = {};
                          hs.customFilters[newFilterName.trim()] = [];
                          saveData({...data, huddleSettings: hs});
                          setNewFilterName('');
                        }
                      }} />
                      <button onClick={() => {
                        if (!newFilterName.trim()) return;
                        const hs = {...data.huddleSettings};
                        if (!hs.customFilters) hs.customFilters = {};
                        hs.customFilters[newFilterName.trim()] = [];
                        saveData({...data, huddleSettings: hs});
                        setNewFilterName('');
                      }} className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700">+ Add Filter</button>
                    </div>

                    {/* Uncategorised */}
                    {(() => {
                      const allCategorised = [
                        ...(data.huddleSettings?.slotCategories?.urgent || []),
                        ...(data.huddleSettings?.slotCategories?.excluded || []),
                        ...Object.values(data.huddleSettings?.customFilters || {}).flat()
                      ];
                      const uncategorised = (data.huddleSettings?.knownSlotTypes || []).filter(s => !allCategorised.includes(s));
                      if (uncategorised.length === 0) return null;
                      return <div className="mt-4 pt-3 border-t border-slate-200"><div className="text-xs text-slate-500 mb-2">Uncategorised ({uncategorised.length}):</div><div className="max-h-32 overflow-y-auto"><div className="flex flex-wrap gap-1">{uncategorised.sort().map(s => <div key={s} draggable onDragStart={e=>e.dataTransfer.setData('slot',s)} className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 cursor-move truncate max-w-[200px]" title={s}>{s}</div>)}</div></div></div>;
                    })()}
                  </div>

                  {/* Expected Capacity Targets */}
                  <div className="card p-5">
                    <h2 className="text-base font-semibold text-slate-900 mb-2">Expected Capacity Targets</h2>
                    <p className="text-xs text-slate-500 mb-3">Set the expected number of urgent slots per session. Forward Planning will colour-code: green (≥100%), amber (80–99%), red (&lt;80%).</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 uppercase">
                            <th className="text-left py-2 font-medium w-24"></th>
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                              <th key={d} className="text-center py-2 font-medium px-2">{d.slice(0, 3)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {['am', 'pm'].map(session => (
                            <tr key={session} className="border-t border-slate-100">
                              <td className={`py-2 text-xs font-medium ${session === 'am' ? 'text-amber-600' : 'text-blue-600'}`}>{session === 'am' ? 'Morning' : 'Afternoon'}</td>
                              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => {
                                const val = data?.huddleSettings?.expectedCapacity?.[d]?.[session] || '';
                                return (
                                  <td key={d} className="text-center px-1 py-2">
                                    <input type="number" min="0" max="999" value={val} onChange={e => {
                                      const hs = { ...data.huddleSettings };
                                      if (!hs.expectedCapacity) hs.expectedCapacity = {};
                                      if (!hs.expectedCapacity[d]) hs.expectedCapacity[d] = {};
                                      hs.expectedCapacity[d][session] = parseInt(e.target.value) || 0;
                                      saveData({ ...data, huddleSettings: hs });
                                    }} placeholder="–" className="w-16 px-2 py-1 rounded border border-slate-200 text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Capacity Chart */}
                  {huddleData && (
                    <div className="card overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-semibold text-slate-900">Capacity Overview</h2>
                          <div className="flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
                            {getAllFilterNames().map(f => (
                              <button key={f} onClick={() => setSettingsChartFilter(f)} className={`px-2.5 py-1 font-medium transition-colors border-r border-slate-200 last:border-r-0 capitalize ${settingsChartFilter === f ? 'bg-purple-50 text-purple-700' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{f}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="p-5">
                        {(() => {
                          const chartOverrides = getFilterOverrides(settingsChartFilter);
                          // Get all weekday dates from current week onward
                          const now = new Date();
                          const currentDay = now.getDay();
                          const currentMonday = new Date(now);
                          currentMonday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
                          currentMonday.setHours(0, 0, 0, 0);
                          const chartDates = huddleData.dates.filter(d => {
                            const dt = parseHuddleDateStr(d);
                            return dt >= currentMonday && dt.getDay() !== 0 && dt.getDay() !== 6;
                          }).slice(0, 20); // max 20 days (4 weeks)

                          if (chartDates.length === 0) return <div className="text-sm text-slate-400 text-center py-8">No data available for chart.</div>;

                          const chartData = chartDates.map(d => {
                            const totals = getDateTotals(huddleData, d, chartOverrides);
                            return { date: d, ...totals };
                          });
                          const maxVal = Math.max(...chartData.map(d => d.available + d.booked), 1);

                          return (
                            <div>
                              {/* Legend */}
                              <div className="flex items-center gap-4 mb-4 text-xs text-slate-600">
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400"></span> Available</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300"></span> Booked</span>
                              </div>
                              {/* Stacked bar chart */}
                              <div className="flex items-end gap-1" style={{ height: '200px' }}>
                                {chartData.map((d, i) => {
                                  const totalH = ((d.available + d.booked) / maxVal) * 100;
                                  const availH = d.available + d.booked > 0 ? (d.available / (d.available + d.booked)) * 100 : 0;
                                  const bookedH = 100 - availH;
                                  const dt = parseHuddleDateStr(d.date);
                                  const dayLabel = ['', 'M', 'T', 'W', 'T', 'F'][dt.getDay()];
                                  const dateLabel = dt.getDate();
                                  const isMonday = dt.getDay() === 1;
                                  return (
                                    <div key={i} className={`flex-1 flex flex-col items-center ${isMonday && i > 0 ? 'ml-1 border-l border-slate-200 pl-1' : ''}`}>
                                      <div className="w-full relative" style={{ height: '170px' }}>
                                        <div className="absolute bottom-0 w-full rounded-t overflow-hidden transition-all" style={{ height: `${totalH}%` }}>
                                          <div className="w-full bg-slate-300 transition-all" style={{ height: `${bookedH}%` }}></div>
                                          <div className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all" style={{ height: `${availH}%` }}></div>
                                        </div>
                                      </div>
                                      <div className="text-[9px] text-slate-400 mt-1 font-medium">{dayLabel}</div>
                                      <div className="text-[9px] text-slate-500">{dateLabel}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TEAM MEMBERS */}
          {activeSection === 'team-members' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-slate-900">Team Members</h1><p className="text-sm text-slate-500 mt-1">Manage clinicians and buddy assignments</p></div><button onClick={() => setShowAddClinician(!showAddClinician)} className="btn-primary">Add Clinician</button></div>
              {showAddClinician && (
                <div className="card p-4 bg-slate-50 flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[180px]"><label className="block text-xs font-medium text-slate-600 mb-1">Name</label><input type="text" placeholder="Dr. Jane Smith" value={newClinician.name} onChange={e => setNewClinician(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
                  <div className="w-20"><label className="block text-xs font-medium text-slate-600 mb-1">Initials</label><input type="text" placeholder="JS" maxLength={4} value={newClinician.initials} onChange={e => setNewClinician(p => ({ ...p, initials: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center uppercase focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
                  <div className="w-20"><label className="block text-xs font-medium text-slate-600 mb-1">Sessions</label><input type="number" min="1" max="10" value={newClinician.sessions} onChange={e => setNewClinician(p => ({ ...p, sessions: parseInt(e.target.value) || 6 }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
                  <div className="flex-1 min-w-[180px]"><label className="block text-xs font-medium text-slate-600 mb-1">Role</label><input type="text" placeholder="GP Partner" value={newClinician.role} onChange={e => setNewClinician(p => ({ ...p, role: e.target.value }))} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /></div>
                  <button onClick={addClinician} className="btn-primary text-sm">Add</button>
                </div>
              )}
              <div className="space-y-2">
                {ensureArray(data.clinicians).map((c, idx) => {
                  const all = ensureArray(data.clinicians);
                  return (
                    <div key={c.id} className={`card p-4 transition-colors ${c.longTermAbsent ? 'border-amber-200 bg-amber-50/50' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <button onClick={() => { if (idx === 0) return; const nc = [...all]; [nc[idx - 1], nc[idx]] = [nc[idx], nc[idx - 1]]; saveData({ ...data, clinicians: nc }); }} disabled={idx === 0} className={`w-6 h-6 flex items-center justify-center rounded text-xs ${idx === 0 ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>▲</button>
                          <button onClick={() => { if (idx === all.length - 1) return; const nc = [...all]; [nc[idx], nc[idx + 1]] = [nc[idx + 1], nc[idx]]; saveData({ ...data, clinicians: nc }); }} disabled={idx === all.length - 1} className={`w-6 h-6 flex items-center justify-center rounded text-xs ${idx === all.length - 1 ? 'text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>▼</button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start gap-2.5 mb-3">
                            <div className={`initials-badge ${c.longTermAbsent ? 'bg-amber-100 text-amber-700' : 'neutral'}`}>{c.initials}</div>
                            <div><div className="text-sm font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.role}</div>{c.longTermAbsent && <div className="mt-1"><span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Long-term absent</span></div>}</div>
                          </div>
                          <div className="flex gap-4 flex-wrap items-end text-sm">
                            <div><label className="block text-xs text-slate-500 mb-1">Sessions/week</label><input type="number" min="1" max="10" value={c.sessions || 6} onChange={e => updateClinicianField(c.id, 'sessions', e.target.value)} className="w-14 px-2 py-1 rounded border border-slate-200 text-center text-sm" /></div>
                            <div><label className="block text-xs text-slate-500 mb-1">Primary buddy</label><select value={c.primaryBuddy || ''} onChange={e => updateClinicianField(c.id, 'primaryBuddy', e.target.value)} className="px-2 py-1 rounded border border-slate-200 text-sm"><option value="">None</option>{all.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>)}</select></div>
                            <div><label className="block text-xs text-slate-500 mb-1">Secondary buddy</label><select value={c.secondaryBuddy || ''} onChange={e => updateClinicianField(c.id, 'secondaryBuddy', e.target.value)} className="px-2 py-1 rounded border border-slate-200 text-sm"><option value="">None</option>{all.filter(x => x.id !== c.id && x.id !== c.primaryBuddy).map(x => <option key={x.id} value={x.id}>{x.initials} — {x.name}</option>)}</select></div>
                            <div><label className="block text-xs text-slate-500 mb-1">Can cover others</label><button onClick={() => updateClinicianField(c.id, 'canProvideCover', c.canProvideCover === false ? true : false)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${c.canProvideCover !== false ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.canProvideCover !== false ? 'Yes' : 'No'}</button></div>
                            <div><label className="block text-xs text-slate-500 mb-1">Long-term absent</label><button onClick={() => updateClinicianField(c.id, 'longTermAbsent', !c.longTermAbsent)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${c.longTermAbsent ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.longTermAbsent ? 'Yes' : 'No'}</button></div>
                          </div>
                        </div>
                        <button onClick={() => removeClinician(c.id)} className="text-xs text-slate-400 hover:text-red-600 transition-colors">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="card p-5 bg-slate-50 border-slate-200"><h3 className="text-sm font-medium text-slate-700 mb-2">How allocation works</h3><p className="text-sm text-slate-600 leading-relaxed">Sessions are used to balance workload fairly. When someone is absent (AL/sick), their buddy will file and action their results. Day off clinicians only need their results viewed for safety. Primary/secondary buddies are preferred when available. Clinicians with "Can cover others" set to No (e.g. trainees) will still have their results covered but won't be assigned to cover anyone else. Long-term absent clinicians are automatically marked absent each day until the flag is removed.</p></div>
            </div>
          )}

          {/* TEAM ROTA */}
          {activeSection === 'team-rota' && (
            <div className="space-y-6">
              <div><h1 className="text-xl font-bold text-slate-900">Clinician Rota</h1><p className="text-sm text-slate-500 mt-1">Standard weekly working pattern — click to toggle</p></div>
              <div className="card p-5">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-200"><th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Clinician</th>{DAYS.map(d => <th key={d} className="text-center py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-20">{d.slice(0, 3)}</th>)}</tr></thead>
                    <tbody>
                      {ensureArray(data.clinicians).map(c => (
                        <tr key={c.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="initials-badge neutral">{c.initials}</div><div><div className="text-sm font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.role}</div></div></div></td>
                          {DAYS.map(d => { const w = ensureArray(data.weeklyRota[d]).includes(c.id); return <td key={d} className="text-center py-3 px-3"><button onClick={() => toggleRotaDay(c.id, d)} className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors mx-auto text-sm ${w ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{w ? '✓' : '—'}</button></td>; })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100"></span>Working</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100"></span>Day off</span></div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeSection === 'settings' && (
            <div className="space-y-6">
              <div><h1 className="text-xl font-bold text-slate-900">Settings</h1><p className="text-sm text-slate-500 mt-1">Configure TeamNet sync and allocation weights</p></div>
              <div className="card p-5">
                <h2 className="text-base font-semibold text-slate-900 mb-4">TeamNet Calendar Sync</h2>
                <p className="text-sm text-slate-500 mb-4">Import planned absences from your TeamNet calendar. The app syncs automatically when you open it.</p>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">TeamNet Calendar URL</label><input type="url" value={data.teamnetUrl || ''} onChange={e => saveData({ ...data, teamnetUrl: e.target.value }, false)} onBlur={() => data.teamnetUrl && saveData(data)} placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..." className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" /></div>
                  <div className="flex items-center gap-3"><button onClick={() => syncTeamNet()} className="btn-primary">Sync Now</button>{syncStatus && <span className={`text-sm ${syncStatus.includes('Error') || syncStatus.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>{syncStatus}</span>}{data.lastSyncTime && <span className="text-xs text-slate-400">Last: {new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}</div>
                </div>
                {(ensureArray(data.plannedAbsences).length > 0) && (
                  <div className="mt-6 pt-4 border-t border-slate-200">
                    <h3 className="text-sm font-medium text-slate-900 mb-3">Upcoming Planned Absences</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {ensureArray(data.plannedAbsences).filter(a => a.endDate >= getTodayKey()).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 20).map((a, i) => {
                        const c = ensureArray(data.clinicians).find(c => c.id === a.clinicianId);
                        if (!c) return null;
                        const sd = new Date(a.startDate + 'T12:00:00');
                        const ed = new Date(a.endDate + 'T12:00:00');
                        const ds = a.startDate === a.endDate ? sd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : `${sd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${ed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
                        return <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm"><div><span className="font-medium">{c.initials}</span><span className="text-slate-500 ml-2">{ds}</span><span className="text-slate-400 ml-2">({a.reason})</span></div><button onClick={() => { const abs = ensureArray(data.plannedAbsences); saveData({ ...data, plannedAbsences: abs.filter((_, j) => j !== abs.indexOf(a)) }); }} className="text-xs text-red-500 hover:text-red-700">Remove</button></div>;
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="card p-5">
                <div className="flex items-center justify-between mb-5"><h2 className="text-base font-semibold text-slate-900">Workload Weights</h2>{settingsSaved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}</div>
                <p className="text-sm text-slate-500 mb-6">Adjust how workload is calculated when balancing buddy allocations.</p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><div><div className="text-sm font-medium text-slate-900">Absent (File & Action)</div><div className="text-xs text-slate-500 mt-0.5">Multiplier when covering absent clinician</div></div><div className="flex items-center gap-2"><input type="number" min="0.5" max="10" step="0.5" value={data.settings?.absentWeight || 2} onChange={e => updateSettings('absentWeight', e.target.value)} className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /><span className="text-sm text-slate-500">× sessions</span></div></div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"><div><div className="text-sm font-medium text-slate-900">Day Off (View Only)</div><div className="text-xs text-slate-500 mt-0.5">Multiplier when viewing day-off results</div></div><div className="flex items-center gap-2"><input type="number" min="0.5" max="10" step="0.5" value={data.settings?.dayOffWeight || 1} onChange={e => updateSettings('dayOffWeight', e.target.value)} className="w-20 px-3 py-2 rounded-md border border-slate-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" /><span className="text-sm text-slate-500">× sessions</span></div></div>
                </div>
              </div>
              <div className="card p-4 bg-slate-50 border-slate-200"><h3 className="text-xs font-medium text-slate-700 mb-1">How the algorithm works</h3><p className="text-xs text-slate-600 leading-relaxed"><strong>Round-robin first:</strong> Everyone gets 1 allocation before anyone gets 2. Primary buddy is tried first, then secondary, then any eligible clinician.<br/><br/><strong>Weighted tiebreaking:</strong> When multiple clinicians have same count, lowest weighted load wins. Load = (absent × {data.settings?.absentWeight || 2}) + (day-off × {data.settings?.dayOffWeight || 1}).</p></div>

              <div className="card p-5 border-red-200">
                <h2 className="text-base font-semibold text-red-700 mb-4">Danger Zone</h2>
                <p className="text-sm text-slate-500 mb-4">Reset all data to defaults. This will clear ALL clinicians, rotas, and history.</p>
                <button onClick={async () => { if (confirm('Delete ALL DATA and reset? Cannot be undone.')) { if (confirm('FINAL WARNING: Everything will be deleted. Continue?')) { const d = getDefaultData(); setData(d); try { await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify(d) }); alert('Reset successful. Refreshing...'); window.location.reload(); } catch (err) { alert('Reset failed: ' + err.message); } } } }} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium">Reset All Data</button>
              </div>
              <div className="card p-5">
                <button onClick={() => setShowHistory(!showHistory)} className="flex items-center justify-between w-full"><h2 className="text-base font-semibold text-slate-900">Allocation History</h2><span className="text-sm text-slate-500">{showHistory ? '▼' : '▶'}</span></button>
                {showHistory && (
                  <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                    {Object.entries(data.allocationHistory || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([dk, e]) => {
                      const g = groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []);
                      const has = Object.entries(g).some(([_, t]) => t.absent.length > 0 || t.dayOff.length > 0);
                      return <div key={dk} className="p-3 bg-slate-50 rounded-lg"><div className="text-sm font-medium text-slate-900">{formatDate(dk)}</div>{has ? <div className="mt-2 text-xs text-slate-600">{Object.entries(g).map(([bid, t]) => { if (t.absent.length === 0 && t.dayOff.length === 0) return null; const b = getClinicianById(parseInt(bid)); if (!b) return null; const as = t.absent.map(i => getClinicianById(i)?.initials || '??').join(', '); const ds = t.dayOff.map(i => getClinicianById(i)?.initials || '??').join(', '); return <div key={bid}>{b.initials} → {as}{ds ? ` (view: ${ds})` : ''}</div>; })}</div> : <div className="mt-1 text-xs text-slate-400">All present</div>}</div>;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <footer className="mt-8 pb-6"><div className="text-center text-xs text-slate-400">Winscombe & Banwell Family Practice</div></footer>
      </main>
    </div>
  );
}
