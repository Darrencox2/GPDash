// Room allocation helpers
import { toLocalIso } from './data';

export const GRID_SIZES = {
  small: { cols: 12, rows: 10, label: 'Small (up to 40 rooms)' },
  medium: { cols: 16, rows: 12, label: 'Medium (up to 80 rooms)' },
  large: { cols: 20, rows: 16, label: 'Large (up to 150 rooms)' },
};

export const DEFAULT_ROOM_TYPES = [
  { id: 'clinician', label: 'Clinician', colour: '#8b5cf6' },
  { id: 'nurse_general', label: 'Nurse General', colour: '#10b981' },
  { id: 'nurse_procedure', label: 'Nurse Procedure', colour: '#0ea5e9' },
  { id: 'phlebotomy', label: 'Phlebotomy', colour: '#f59e0b' },
  { id: 'admin', label: 'Admin', colour: '#64748b' },
];

export function getRoomTypes(ra) {
  return ra?.roomTypes || DEFAULT_ROOM_TYPES;
}

export const SITE_COLOUR_PRESETS = [
  '#8c64c3', '#46ac64', '#eb8232', '#3b82f6', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

// Map clinician role/group to room types
export function getRoomTypesForClinician(clinician) {
  const g = clinician.group || 'admin';
  const r = (clinician.role || '').toLowerCase();
  if (g === 'gp') return ['clinician'];
  if (g === 'nursing') {
    if (r.includes('hca') || r.includes('phlebotom')) return ['phlebotomy', 'nurse_general'];
    if (r.includes('procedure')) return ['nurse_procedure'];
    return ['nurse_general', 'nurse_procedure'];
  }
  if (g === 'allied') return ['clinician', 'nurse_general'];
  return ['admin'];
}

// Check if a recurring booking applies to a given date
export function matchesRecurrence(recurrence, dateStr) {
  if (!recurrence) return false;
  const date = new Date(dateStr + 'T12:00:00');
  const dow = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  if (recurrence.startDate && dateStr < recurrence.startDate) return false;
  if (recurrence.endDate && dateStr > recurrence.endDate) return false;

  switch (recurrence.frequency) {
    case 'daily':
      return dow >= 1 && dow <= 5; // weekdays only
    case 'weekly':
      return dow === recurrence.day;
    case 'biweekly': {
      if (dow !== recurrence.day) return false;
      if (!recurrence.startDate) return true;
      const start = new Date(recurrence.startDate + 'T12:00:00');
      const diffMs = date.getTime() - start.getTime();
      const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks % 2 === 0;
    }
    case 'monthly_day':
      return dow === recurrence.day && getNthWeekday(date) === recurrence.nth;
    case 'monthly_date':
      return date.getDate() === recurrence.dateOfMonth;
    case 'first_working':
      return isFirstWorkingDay(date);
    case 'last_working':
      return isLastWorkingDay(date);
    default:
      return false;
  }
}

function getNthWeekday(date) {
  const d = date.getDate();
  return Math.ceil(d / 7);
}

function isFirstWorkingDay(date) {
  const y = date.getFullYear(), m = date.getMonth();
  for (let d = 1; d <= 7; d++) {
    const check = new Date(y, m, d);
    const dow = check.getDay();
    if (dow >= 1 && dow <= 5) return check.getDate() === date.getDate();
  }
  return false;
}

function isLastWorkingDay(date) {
  const y = date.getFullYear(), m = date.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  for (let d = lastDay; d >= lastDay - 7; d--) {
    const check = new Date(y, m, d);
    const dow = check.getDay();
    if (dow >= 1 && dow <= 5) return check.getDate() === date.getDate();
  }
  return false;
}

// Auto-allocate rooms for a session
export function autoAllocateRooms(site, session, cliniciansAtSite, recurringBookings, adHocBookings, dateStr, allClinicians, priorityOrder, dailyOverrides) {
  if (!site || !site.rooms) return { assignments: {}, conflicts: [], flags: [] };
  const clinicalRooms = site.rooms.filter(r => r.isClinical !== false);
  const assignments = {}; // roomId -> { clinicianId/bookingId, name, type, isOverride }
  const flags = []; // { clinicianId, message }
  const conflicts = []; // { name, message }

  // Check for daily overrides first — but filter out people no longer present
  const overrideKey = `${dateStr}-${session}`;
  const override = dailyOverrides?.[site.id]?.[overrideKey];
  if (override) {
    const presentIds = new Set(cliniciansAtSite.map(c => c.id));
    // Also include recurring/ad-hoc booking IDs
    recurringBookings.forEach(rb => { if (rb.siteId === site.id && rb.session === session && matchesRecurrence(rb.recurrence, dateStr)) presentIds.add(`rec_${rb.id}`); });
    adHocBookings.forEach(ab => { if (ab.siteId === site.id && ab.session === session && ab.date === dateStr && !ab.removed) presentIds.add(`adhoc_${ab.id}`); });
    const filtered = {};
    Object.entries(override).forEach(([roomId, assignment]) => {
      if (assignment && presentIds.has(assignment.id)) filtered[roomId] = assignment;
    });
    return { assignments: filtered, conflicts: [], flags: Object.entries(filtered).filter(([_, v]) => v?.isOverride).map(([_, v]) => ({ name: v.name, message: 'Manually assigned' })) };
  }

  // Collect all people needing rooms
  const needsRoom = [];

  // CSV clinicians
  cliniciansAtSite.forEach(c => {
    const clin = allClinicians.find(cl => cl.id === c.id);
    if (!clin) return;
    needsRoom.push({ id: c.id, name: clin.name, initials: clin.initials, types: getRoomTypesForClinician(clin), preferredRoom: clin.roomPreferences?.[site.id]?.preferred, secondaryRoom: clin.roomPreferences?.[site.id]?.secondary, source: 'csv', priority: priorityOrder.indexOf(c.id) });
  });

  // Recurring bookings for today
  recurringBookings.forEach(rb => {
    if (rb.siteId !== site.id || rb.session !== session) return;
    if (!matchesRecurrence(rb.recurrence, dateStr)) return;
    needsRoom.push({ id: `rec_${rb.id}`, name: rb.name, initials: rb.name.slice(0, 2).toUpperCase(), types: rb.roomTypes || [], preferredRoom: rb.preferredRoom, secondaryRoom: null, source: 'recurring', priority: 9999 });
  });

  // Ad hoc bookings for today
  adHocBookings.forEach(ab => {
    if (ab.siteId !== site.id || ab.session !== session || ab.date !== dateStr) return;
    if (ab.removed) return;
    needsRoom.push({ id: `adhoc_${ab.id}`, name: ab.name, initials: ab.name.slice(0, 2).toUpperCase(), types: ab.roomTypes || [], preferredRoom: ab.preferredRoom, secondaryRoom: null, source: 'adhoc', priority: 9998 });
  });

  // Sort by priority (lower = higher priority)
  needsRoom.sort((a, b) => {
    const ap = a.priority >= 0 ? a.priority : 9999;
    const bp = b.priority >= 0 ? b.priority : 9999;
    return ap - bp;
  });

  const usedRooms = new Set();

  // Pass 1: preferred rooms
  needsRoom.forEach(person => {
    if (person.preferredRoom && !usedRooms.has(person.preferredRoom)) {
      const room = clinicalRooms.find(r => r.id === person.preferredRoom);
      if (room) {
        assignments[room.id] = { id: person.id, name: person.name, initials: person.initials, source: person.source, isPreferred: true };
        usedRooms.add(room.id);
        person.assigned = true;
      }
    }
  });

  // Pass 2: secondary rooms
  needsRoom.filter(p => !p.assigned).forEach(person => {
    if (person.secondaryRoom && !usedRooms.has(person.secondaryRoom)) {
      const room = clinicalRooms.find(r => r.id === person.secondaryRoom);
      if (room) {
        const blocker = person.preferredRoom ? Object.entries(assignments).find(([rid]) => rid === person.preferredRoom)?.[1] : null;
        assignments[room.id] = { id: person.id, name: person.name, initials: person.initials, source: person.source, isPreferred: false };
        usedRooms.add(room.id);
        person.assigned = true;
        const prefRoomName = clinicalRooms.find(r => r.id === person.preferredRoom)?.name || 'preferred room';
        flags.push({ name: person.name, message: `In secondary room (${room.name}) — ${prefRoomName} taken by ${blocker?.name || 'another clinician'}` });
      }
    }
  });

  // Pass 3: any suitable room by type
  needsRoom.filter(p => !p.assigned).forEach(person => {
    const available = clinicalRooms.filter(r => !usedRooms.has(r.id) && person.types.some(t => (r.types || []).includes(t)));
    if (available.length > 0) {
      const room = available[0];
      const blocker = person.preferredRoom ? Object.entries(assignments).find(([rid]) => rid === person.preferredRoom)?.[1] : null;
      const secBlocker = person.secondaryRoom ? Object.entries(assignments).find(([rid]) => rid === person.secondaryRoom)?.[1] : null;
      assignments[room.id] = { id: person.id, name: person.name, initials: person.initials, source: person.source, isPreferred: false };
      usedRooms.add(room.id);
      person.assigned = true;
      let reason = `Assigned to ${room.name}`;
      if (blocker) reason += ` — preferred room taken by ${blocker.name}`;
      if (secBlocker) reason += `, secondary by ${secBlocker.name}`;
      flags.push({ name: person.name, message: reason });
    }
  });

  // Pass 4: unassigned = conflicts
  needsRoom.filter(p => !p.assigned).forEach(person => {
    conflicts.push({ id: person.id, name: person.name, initials: person.initials, source: person.source, types: person.types, message: 'No suitable room available' });
  });

  return { assignments, conflicts, flags };
}

export const RECURRENCE_LABELS = {
  daily: 'Every weekday',
  weekly: 'Every week',
  biweekly: 'Every other week',
  monthly_day: 'Monthly (by weekday)',
  monthly_date: 'Monthly (by date)',
  first_working: 'First working day of month',
  last_working: 'Last working day of month',
};

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeRecurrence(rec) {
  if (!rec) return '';
  switch (rec.frequency) {
    case 'daily': return 'Every weekday';
    case 'weekly': return `Every ${DAY_LABELS[rec.day]}`;
    case 'biweekly': return `Every other ${DAY_LABELS[rec.day]}`;
    case 'monthly_day': {
      const nth = ['', '1st', '2nd', '3rd', '4th', '5th'][rec.nth] || '';
      return `${nth} ${DAY_LABELS[rec.day]} of each month`;
    }
    case 'monthly_date': return `${rec.dateOfMonth}${ordSuffix(rec.dateOfMonth)} of each month`;
    case 'first_working': return 'First working day of each month';
    case 'last_working': return 'Last working day of each month';
    default: return rec.frequency;
  }
}

function ordSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
