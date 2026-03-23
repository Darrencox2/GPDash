// Pure huddle computation functions — no React state, all params explicit

export function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

export function parseHuddleCSV(csvText) {
  const lines = csvText.split('\n').map(line => line.replace(/\r/g, ''));
  let headerRowIndex = -1, dataStartRowIndex = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].includes('Full Name of the Session Holder')) {
      headerRowIndex = i; dataStartRowIndex = i + 1; break;
    }
  }
  if (headerRowIndex === -1) throw new Error('Could not find clinician header row');

  const headerCells = parseCSVRow(lines[headerRowIndex]);
  const clinicians = headerCells.slice(5).filter(c => c && c.trim());

  let reportDate = null;
  for (let i = 0; i < headerRowIndex; i++) {
    if (lines[i].includes('Last Run:')) {
      const match = lines[i].match(/(\d{2}-[A-Za-z]{3}-\d{4})/);
      if (match) reportDate = match[1];
      break;
    }
  }

  const allSlotTypes = new Set();
  const dateData = {};
  const bookedData = {};
  const allDates = new Set();
  let currentDate = null, currentTime = null, currentSlotType = null;

  for (let i = dataStartRowIndex + 1; i < lines.length; i++) {
    const cells = parseCSVRow(lines[i]);
    if (cells.length < 5) continue;
    if (cells[0] && cells[0].trim()) currentDate = cells[0].trim();
    if (cells[1] && cells[1].trim()) currentTime = cells[1].trim();
    if (cells[2] && cells[2].trim()) currentSlotType = cells[2].trim();
    const slotType = currentSlotType || '';
    const availability = cells[3]?.trim() || '';
    if (!currentDate || !slotType) continue;
    allDates.add(currentDate);
    allSlotTypes.add(slotType);

    const isAvailable = availability === 'Available';
    const isBooked = availability === 'Booked';
    if (!isAvailable && !isBooked) continue;
    const session = currentTime?.includes('Before') ? 'am' : 'pm';
    const targetStore = isAvailable ? dateData : bookedData;
    if (!targetStore[currentDate]) targetStore[currentDate] = { am: {}, pm: {} };

    for (let j = 5; j < cells.length && (j - 5) < clinicians.length; j++) {
      const count = parseInt(cells[j], 10) || 0;
      if (count > 0) {
        const idx = j - 5;
        if (!targetStore[currentDate][session][idx]) targetStore[currentDate][session][idx] = {};
        targetStore[currentDate][session][idx][slotType] = (targetStore[currentDate][session][idx][slotType] || 0) + count;
      }
    }
  }

  const sortedDates = Array.from(allDates).sort((a, b) => parseHuddleDateStr(a) - parseHuddleDateStr(b));
  return { clinicians, allSlotTypes: Array.from(allSlotTypes), reportDate, dates: sortedDates, dateData, bookedData };
}

export function parseHuddleDateStr(d) {
  const [day, mon, year] = d.split('-');
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  return new Date(parseInt(year), months[mon], parseInt(day));
}

export function getHuddleCapacity(parsedData, dateStr, huddleSettings, slotOverrides = null) {
  if (!parsedData || !parsedData.dateData[dateStr]) {
    return { am: { total: 0, byClinician: [] }, pm: { total: 0, byClinician: [] }, bySlotType: [] };
  }
  const urgentSlots = huddleSettings?.slotCategories?.urgent || [];
  const includedClinicians = huddleSettings?.includedClinicians || [];
  const hasUrgentConfig = urgentSlots.length > 0;
  const dayData = parsedData.dateData[dateStr];
  const clinicians = parsedData.clinicians;

  const isSlotIncluded = (slotType) => {
    if (slotOverrides && slotOverrides[slotType] !== undefined) return slotOverrides[slotType];
    if (hasUrgentConfig) return urgentSlots.includes(slotType);
    return true;
  };

  const amByClinician = [], pmByClinician = [];
  let amTotal = 0, pmTotal = 0;
  const slotTypeTotals = {};

  ['am', 'pm'].forEach(session => {
    Object.entries(dayData[session] || {}).forEach(([idx, slots]) => {
      const clinicianName = clinicians[parseInt(idx)];
      if (includedClinicians.length > 0 && !includedClinicians.includes(clinicianName)) return;
      let clinicianTotal = 0;
      Object.entries(slots).forEach(([slotType, count]) => {
        if (!isSlotIncluded(slotType)) return;
        clinicianTotal += count;
        if (!slotTypeTotals[slotType]) slotTypeTotals[slotType] = { am: 0, pm: 0 };
        slotTypeTotals[slotType][session] += count;
      });
      if (clinicianTotal > 0) {
        const entry = { name: clinicianName, available: clinicianTotal };
        if (session === 'am') { amByClinician.push(entry); amTotal += clinicianTotal; }
        else { pmByClinician.push(entry); pmTotal += clinicianTotal; }
      }
    });
  });

  amByClinician.sort((a, b) => b.available - a.available);
  pmByClinician.sort((a, b) => b.available - a.available);
  const bySlotType = Object.entries(slotTypeTotals)
    .map(([name, counts]) => ({ name, am: counts.am, pm: counts.pm, total: counts.am + counts.pm }))
    .filter(s => s.total > 0).sort((a, b) => b.total - a.total);

  return { am: { total: amTotal, byClinician: amByClinician }, pm: { total: pmTotal, byClinician: pmByClinician }, bySlotType };
}

export function getDateTotals(parsedData, dateStr, huddleSettings, slotOverrides = null) {
  if (!parsedData) return { available: 0, booked: 0 };
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
    const avail = parsedData.dateData?.[dateStr]?.[session] || {};
    Object.entries(avail).forEach(([idx, slots]) => {
      const cName = clinicians[parseInt(idx)];
      if (includedClinicians.length > 0 && !includedClinicians.includes(cName)) return;
      Object.entries(slots).forEach(([st, count]) => { if (isSlotIncluded(st)) available += count; });
    });
    const book = parsedData.bookedData?.[dateStr]?.[session] || {};
    Object.entries(book).forEach(([idx, slots]) => {
      const cName = clinicians[parseInt(idx)];
      if (includedClinicians.length > 0 && !includedClinicians.includes(cName)) return;
      Object.entries(slots).forEach(([st, count]) => { if (isSlotIncluded(st)) booked += count; });
    });
  });
  return { available, booked };
}

export function getCapacityColour(actual, dayName, session, viewMode, expectedCapacity) {
  if (actual === 0) return 'bg-slate-100 text-slate-400 border-slate-200';
  if (viewMode === 'urgent' && expectedCapacity) {
    const expected = expectedCapacity[dayName]?.[session];
    if (expected && expected > 0) {
      const pct = (actual / expected) * 100;
      if (pct >= 100) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      if (pct >= 80) return 'bg-amber-100 text-amber-800 border-amber-200';
      return 'bg-red-100 text-red-800 border-red-200';
    }
  }
  return '';
}

export function getGradientColour(value, allValues) {
  if (value === 0) return 'bg-slate-100 text-slate-400 border-slate-200';
  if (!allValues || allValues.length === 0) return '';
  const nonZero = allValues.filter(v => v > 0);
  if (nonZero.length < 2) return 'bg-amber-50 text-amber-800 border-amber-200';
  const min = Math.min(...nonZero), max = Math.max(...nonZero);
  if (min === max) return 'bg-amber-50 text-amber-800 border-amber-200';
  const pct = (value - min) / (max - min);
  if (pct >= 0.66) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (pct >= 0.33) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

export function getFilterOverrides(filterName, huddleSettings) {
  const hs = huddleSettings || {};
  const allKnown = hs?.knownSlotTypes || [];
  const customFilters = hs?.customFilters || {};
  if (filterName === 'urgent') {
    const urgent = hs?.slotCategories?.urgent || [];
    if (urgent.length === 0) return null;
    const o = {}; allKnown.forEach(s => { o[s] = urgent.includes(s); }); return o;
  }
  if (filterName === 'all') {
    const excluded = hs?.slotCategories?.excluded || [];
    const o = {}; allKnown.forEach(s => { o[s] = !excluded.includes(s); }); return o;
  }
  if (customFilters[filterName]) {
    const slots = customFilters[filterName];
    const o = {}; allKnown.forEach(s => { o[s] = slots.includes(s); }); return o;
  }
  return null;
}

export function getAllFilterNames(huddleSettings) {
  const custom = Object.keys(huddleSettings?.customFilters || {});
  return ['urgent', ...custom, 'all'];
}

export function getMergedFilterOverrides(filterNames, huddleSettings) {
  if (!filterNames || filterNames.length === 0) return null;
  if (filterNames.includes('all')) return getFilterOverrides('all', huddleSettings);
  const allKnown = huddleSettings?.knownSlotTypes || [];
  const merged = {}; allKnown.forEach(s => { merged[s] = false; });
  filterNames.forEach(f => {
    const o = getFilterOverrides(f, huddleSettings);
    if (o) allKnown.forEach(s => { if (o[s]) merged[s] = true; });
  });
  return merged;
}

export function initSlotOverrides(huddleSettings) {
  const urgentSlots = huddleSettings?.slotCategories?.urgent || [];
  const allKnown = huddleSettings?.knownSlotTypes || [];
  const overrides = {}; allKnown.forEach(s => { overrides[s] = urgentSlots.includes(s); }); return overrides;
}

export function getHuddleWeeks(huddleData) {
  if (!huddleData) return [];
  const weeks = {};
  const now = new Date();
  const currentDay = now.getDay();
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
  currentMonday.setHours(0, 0, 0, 0);
  const endDate = new Date(currentMonday);
  endDate.setDate(endDate.getDate() + 6 * 7);

  huddleData.dates.forEach(dateStr => {
    const d = parseHuddleDateStr(dateStr);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;
    if (d < currentMonday || d >= endDate) return;
    const monday = new Date(d);
    monday.setDate(monday.getDate() - (dayOfWeek - 1));
    const weekKey = monday.toISOString().split('T')[0];
    if (!weeks[weekKey]) weeks[weekKey] = { monday, dates: {} };
    weeks[weekKey].dates[['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][dayOfWeek]] = dateStr;
  });
  return Object.values(weeks).sort((a, b) => a.monday - b.monday);
}

export function getTodayDateStr() {
  const today = new Date();
  return `${String(today.getDate()).padStart(2,'0')}-${today.toLocaleString('en-GB',{month:'short'})}-${today.getFullYear()}`;
}

// Get next 7 weekdays of availability for a specific slot filter
export function get7DayAvailability(huddleData, huddleSettings, filterName) {
  if (!huddleData) return [];
  const overrides = getFilterOverrides(filterName, huddleSettings);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results = [];

  for (let i = 0; i < 10 && results.length < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
    const dateStr = `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-GB',{month:'short'})}-${d.getFullYear()}`;
    if (!huddleData.dates.includes(dateStr)) {
      results.push({ date: dateStr, dayName: ['','Mon','Tue','Wed','Thu','Fri'][d.getDay()], available: null, booked: null });
      continue;
    }
    const cap = getHuddleCapacity(huddleData, dateStr, huddleSettings, overrides);
    const totals = getDateTotals(huddleData, dateStr, huddleSettings, overrides);
    results.push({ date: dateStr, dayName: ['','Mon','Tue','Wed','Thu','Fri'][d.getDay()], available: cap.am.total + cap.pm.total, booked: totals.booked });
  }
  return results;
}

// Calculate historical averages for expected capacity targets (urgent slots)
export function calculateHistoricalTargets(huddleData, huddleSettings) {
  if (!huddleData) return {};
  const weeks = getHuddleWeeks(huddleData);
  const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };
  const totals = {};
  ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach(d => { totals[d] = { am: [], pm: [] }; });

  weeks.forEach(week => {
    ['Mon','Tue','Wed','Thu','Fri'].forEach(d => {
      const dateStr = week.dates[d];
      if (!dateStr) return;
      const cap = getHuddleCapacity(huddleData, dateStr, huddleSettings);
      if (cap.am.total > 0 || cap.pm.total > 0) {
        totals[dayNames[d]].am.push(cap.am.total);
        totals[dayNames[d]].pm.push(cap.pm.total);
      }
    });
  });

  const targets = {};
  ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach(d => {
    const amVals = totals[d].am, pmVals = totals[d].pm;
    if (amVals.length > 0 || pmVals.length > 0) {
      targets[d] = {
        am: amVals.length > 0 ? Math.round(amVals.reduce((a, b) => a + b, 0) / amVals.length) : 0,
        pm: pmVals.length > 0 ? Math.round(pmVals.reduce((a, b) => a + b, 0) / pmVals.length) : 0
      };
    }
  });
  return targets;
}
