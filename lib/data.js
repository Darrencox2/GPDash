// Staff groups
export const STAFF_GROUPS = {
  gp: { label: 'GP Team', roles: ['GP Partner', 'Associate Partner', 'Salaried GP', 'GP Registrar', 'Locum', 'Medical Student'] },
  nursing: { label: 'Nursing', roles: ['Practice Nurse', 'Nurse Associate', 'HCA'] },
  allied: { label: 'Allied Health', roles: ['ANP', 'Paramedic Practitioner', 'Pharmacist', 'Physiotherapist'] },
  admin: { label: 'Admin', roles: [] },
};

// Guess group from role
export function guessGroupFromRole(role) {
  if (!role) return 'admin';
  const r = role.toLowerCase();
  if (r.includes('gp') || r.includes('doctor') || r.includes('registrar') || r.includes('locum') || r.includes('medical student') || r.includes('associate partner')) return 'gp';
  if (r.includes('nurse') || r.includes('hca') || r.includes('health care')) return 'nursing';
  if (r.includes('anp') || r.includes('paramedic') || r.includes('pharmacist') || r.includes('physio')) return 'allied';
  return 'admin';
}

// Title-case a name: "PETER CHOATE" → "Peter Choate", "Katie PARKHOUSE" → "Katie Parkhouse"
export function titleCaseName(name) {
  if (!name) return name;
  let n = name.trim();
  // Handle "SURNAME, Firstname" format
  if (n.includes(',')) {
    const parts = n.split(',').map(s => s.trim());
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      n = parts[1] + ' ' + parts[0];
    }
  }
  // Fix any word that is ALL CAPS (length > 1) to title case, leave others alone
  n = n.split(/\s+/).map(w => {
    if (w.length > 1 && w === w.toUpperCase() && !w.match(/^(DR\.?|MR\.?|MRS\.?|MS\.?)$/i)) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    return w;
  }).join(' ');
  return n;
}

// ── Name normalisation & matching ─────────────────────────────────
// Handles: "COX, Darren" → "darren cox", "Dr. Darren Cox" → "darren cox", "PETER CHOATE (GP Partner)" → "peter choate"
export function normalizeName(name) {
  if (!name) return '';
  let n = name.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  // Handle "SURNAME, Firstname" format
  if (n.includes(',')) {
    const parts = n.split(',').map(s => s.trim());
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      n = parts[1] + ' ' + parts[0];
    }
  }
  // Strip titles
  n = n.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|miss|prof\.?)\s*/i, '');
  // Strip non-alpha except spaces/hyphens/apostrophes
  n = n.replace(/[^a-zA-Z\s'-]/g, '').trim().toLowerCase();
  return n;
}

export function matchesStaffMember(csvName, staffMember) {
  const csvNorm = normalizeName(csvName);
  const regNorm = normalizeName(staffMember.name);
  if (!csvNorm || !regNorm) return false;
  // Exact match
  if (csvNorm === regNorm) return true;
  // One contains the other (but only if both have 2+ words — avoid "Smith" matching "John Smith")
  const csvWords = csvNorm.split(/\s+/);
  const regWords = regNorm.split(/\s+/);
  if (csvWords.length >= 2 && regWords.length >= 2) {
    if (csvNorm.includes(regNorm) || regNorm.includes(csvNorm)) return true;
  }
  // Surname match (last word) — require first name match, not just initial
  const csvSurname = csvWords[csvWords.length - 1];
  const regSurname = regWords[regWords.length - 1];
  if (csvSurname && regSurname && csvSurname === regSurname && csvSurname.length >= 3) {
    const csvFirst = csvWords[0];
    const regFirst = regWords[0];
    // Must match full first name (not just initial) to avoid mixing up people with same surname
    if (csvFirst === regFirst) return true;
  }
  // Check aliases — require full name match or surname + first name match
  if (staffMember.aliases?.length > 0) {
    return staffMember.aliases.some(a => {
      const aNorm = normalizeName(a);
      if (aNorm === csvNorm) return true;
      const aWords = aNorm.split(/\s+/);
      const aFirst = aWords[0];
      const aSurname = aWords[aWords.length - 1];
      const csvFirst = csvWords[0];
      return aSurname && csvSurname && aSurname === csvSurname && aSurname.length >= 3 && aFirst === csvFirst;
    });
  }
  return false;
}

// Default clinicians data
export const DEFAULT_CLINICIANS = [
  { id: 1, name: 'Dr. Ruth Harrison', initials: 'RH', role: 'GP Partner', group: 'gp', sessions: 8, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 2, name: 'Dr. Trudi Mitchell', initials: 'TM', role: 'GP Partner', group: 'gp', sessions: 8, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 3, name: 'Dr. Katie Chen', initials: 'KC', role: 'GP Partner', group: 'gp', sessions: 6, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 4, name: 'Dr. Sarah Thompson', initials: 'ST', role: 'Salaried GP', group: 'gp', sessions: 6, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 5, name: 'Alex Morgan', initials: 'AM', role: 'ANP', group: 'allied', sessions: 8, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 6, name: 'Dr. James Wilson', initials: 'JW', role: 'Locum', group: 'gp', sessions: 4, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 7, name: 'Emma Clarke', initials: 'EC', role: 'Paramedic Practitioner', group: 'allied', sessions: 6, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
  { id: 8, name: 'Dr. Michael Roberts', initials: 'MR', role: 'GP Registrar', group: 'gp', sessions: 8, primaryBuddy: null, secondaryBuddy: null, status: 'active', canProvideCover: true, buddyCover: true, showWhosIn: true, source: 'manual', confirmed: true, aliases: [] },
];

export const DEFAULT_SETTINGS = {
  absentWeight: 2,              // Multiplier for absent clinicians (file & action)
  dayOffWeight: 1,              // Multiplier for day off clinicians (view only)
};

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function getDefaultData() {
  const defaultRota = {};
  DAYS.forEach(day => {
    defaultRota[day] = DEFAULT_CLINICIANS.map(c => c.id);
  });
  
  return {
    clinicians: DEFAULT_CLINICIANS,
    weeklyRota: defaultRota,
    dailyOverrides: {},
    allocationHistory: {},
    closedDays: {},  // e.g., { "2024-12-25": "Christmas Day" }
    plannedAbsences: [],  // e.g., [{ clinicianId: 1, startDate: "2024-03-15", endDate: "2024-03-22", reason: "Holiday", source: "teamnet" }]
    teamnetUrl: '',  // TeamNet calendar sync URL
    lastSyncTime: null,  // ISO timestamp of last TeamNet sync
    settings: DEFAULT_SETTINGS,
    huddleSettings: {
      // Clinician groups: maps clinician CSV names to groups
      clinicianGroups: {
        clinician: [],  // GPs, ANPs, etc.
        nursing: [],    // Practice nurses, HCAs
        other: []       // Admin, other staff
      },
      // Slot type categories: maps slot names to categories
      slotCategories: {
        urgent: [],     // Same-day/urgent slots to track
        routine: [],    // Routine bookable slots
        admin: [],      // Admin/non-patient slots
        excluded: []    // Slots to ignore in capacity
      },
      // Which clinicians to include in dashboard
      includedClinicians: [],
      // Last uploaded CSV data (for reference)
      lastUploadDate: null,
      knownSlotTypes: [],     // All slot types seen in uploads
      knownClinicians: []     // All clinician names seen in uploads
    }
  };
}

// Local date key (YYYY-MM-DD) — avoids UTC shift from toISOString()
export function toLocalIso(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatWeekRange(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4);
  const opts = { day: 'numeric', month: 'short' };
  return `${weekStart.toLocaleDateString('en-GB', opts)} - ${end.toLocaleDateString('en-GB', opts)} ${end.getFullYear()}`;
}

export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-GB', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
}

export function getCurrentDay() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[new Date().getDay()];
  return DAYS.includes(today) ? today : 'Monday';
}

export function generateBuddyAllocations(clinicians, presentIds, absentIds, dayOffIds, settings = DEFAULT_SETTINGS) {
  // Ensure all inputs are arrays
  const ensureArray = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val);
  };
  
  const cliniciansList = ensureArray(clinicians);
  const presentList = ensureArray(presentIds);
  const absentList = ensureArray(absentIds);
  const dayOffList = ensureArray(dayOffIds);
  
  const presentClinicians = cliniciansList.filter(c => presentList.includes(c.id));
  const absentClinicians = cliniciansList.filter(c => absentList.includes(c.id));
  const dayOffClinicians = cliniciansList.filter(c => dayOffList.includes(c.id));

  // Only clinicians who can provide cover are eligible to be assigned as buddies
  const eligibleCoverers = presentClinicians.filter(c => c.canProvideCover !== false);

  const absentWeight = settings?.absentWeight || 2;
  const dayOffWeight = settings?.dayOffWeight || 1;

  if (eligibleCoverers.length === 0) {
    return { allocations: {}, dayOffAllocations: {} };
  }

  const allocations = {};
  const dayOffAllocations = {};
  
  // Track allocations per coverer: count and weighted load
  const allocationCount = {};
  const weightedLoad = {};
  eligibleCoverers.forEach(c => {
    allocationCount[c.id] = 0;
    weightedLoad[c.id] = 0;
  });

  function getClinicianById(id) {
    return cliniciansList.find(c => c.id === id);
  }

  function isEligibleCoverer(id) {
    const c = getClinicianById(id);
    return c && c.canProvideCover !== false && presentList.includes(id);
  }

  function assignAllocation(clinician, buddyId, isAbsent) {
    if (isAbsent) {
      allocations[clinician.id] = buddyId;
    } else {
      dayOffAllocations[clinician.id] = buddyId;
    }
    allocationCount[buddyId] = (allocationCount[buddyId] || 0) + 1;
    const weight = isAbsent ? absentWeight : dayOffWeight;
    weightedLoad[buddyId] = (weightedLoad[buddyId] || 0) + weight;
  }

  function isAllocated(clinicianId) {
    return allocations[clinicianId] !== undefined || dayOffAllocations[clinicianId] !== undefined;
  }

  // Find the best coverer among those with minimum allocation count
  function findBestAvailable(forClinician) {
    const available = eligibleCoverers.filter(p => p.id !== forClinician.id);
    if (available.length === 0) return null;
    
    // Find the minimum allocation count
    const minCount = Math.min(...available.map(c => allocationCount[c.id] || 0));
    
    // Get all clinicians with that minimum count
    const candidates = available.filter(c => (allocationCount[c.id] || 0) === minCount);
    
    if (candidates.length === 1) {
      return candidates[0].id;
    }
    
    // If multiple candidates with same count, use weighted load for tiebreaking
    const minLoad = Math.min(...candidates.map(c => weightedLoad[c.id] || 0));
    const lowestLoadCandidates = candidates.filter(c => (weightedLoad[c.id] || 0) === minLoad);
    return lowestLoadCandidates[Math.floor(Math.random() * lowestLoadCandidates.length)].id;
  }

  // Combine absent and day-off into a single list
  // Absent clinicians have higher priority so they come first
  const toAllocate = [
    ...absentClinicians.map(c => ({ clinician: c, isAbsent: true })),
    ...dayOffClinicians.map(c => ({ clinician: c, isAbsent: false }))
  ];

  // Sort by: absent first, then by sessions descending
  toAllocate.sort((a, b) => {
    if (a.isAbsent !== b.isAbsent) return a.isAbsent ? -1 : 1;
    return (b.clinician.sessions || 6) - (a.clinician.sessions || 6);
  });

  // ROUND 1: Assign primary buddies where possible (only if buddy has 0 allocations)
  for (const { clinician, isAbsent } of toAllocate) {
    if (isAllocated(clinician.id)) continue;
    
    const primaryBuddy = clinician.primaryBuddy;
    if (primaryBuddy && isEligibleCoverer(primaryBuddy)) {
      const count = allocationCount[primaryBuddy] || 0;
      if (count === 0) {
        assignAllocation(clinician, primaryBuddy, isAbsent);
      }
    }
  }

  // ROUND 2: Assign secondary buddies where possible (only if buddy has 0 allocations)
  for (const { clinician, isAbsent } of toAllocate) {
    if (isAllocated(clinician.id)) continue;
    
    const secondaryBuddy = clinician.secondaryBuddy;
    if (secondaryBuddy && isEligibleCoverer(secondaryBuddy)) {
      const count = allocationCount[secondaryBuddy] || 0;
      if (count === 0) {
        assignAllocation(clinician, secondaryBuddy, isAbsent);
      }
    }
  }

  // ROUND 3: Assign remaining to least allocated (respecting round-robin, using weights for tiebreaking)
  for (const { clinician, isAbsent } of toAllocate) {
    if (isAllocated(clinician.id)) continue;
    
    // Get current minimum count
    const availableCoverers = eligibleCoverers.filter(c => c.id !== clinician.id);
    if (availableCoverers.length === 0) continue;
    
    const minCount = Math.min(...availableCoverers.map(c => allocationCount[c.id] || 0));
    
    // Try primary buddy if at minimum count
    if (clinician.primaryBuddy && isEligibleCoverer(clinician.primaryBuddy)) {
      if ((allocationCount[clinician.primaryBuddy] || 0) === minCount) {
        assignAllocation(clinician, clinician.primaryBuddy, isAbsent);
        continue;
      }
    }
    
    // Try secondary buddy if at minimum count
    if (clinician.secondaryBuddy && isEligibleCoverer(clinician.secondaryBuddy)) {
      if ((allocationCount[clinician.secondaryBuddy] || 0) === minCount) {
        assignAllocation(clinician, clinician.secondaryBuddy, isAbsent);
        continue;
      }
    }
    
    // Fall back to any available with minimum count
    const best = findBestAvailable(clinician);
    if (best) {
      assignAllocation(clinician, best, isAbsent);
    }
  }

  return { allocations, dayOffAllocations };
}

export function groupAllocationsByCovering(allocations, dayOffAllocations, presentIds) {
  const grouped = {};
  
  // Ensure presentIds is an array
  const presentList = !presentIds ? [] : (Array.isArray(presentIds) ? presentIds : Object.values(presentIds));
  
  presentList.forEach(id => {
    grouped[id] = { absent: [], dayOff: [] };
  });
  
  Object.entries(allocations || {}).forEach(([absentId, buddyId]) => {
    if (!grouped[buddyId]) grouped[buddyId] = { absent: [], dayOff: [] };
    grouped[buddyId].absent.push(parseInt(absentId));
  });
  
  Object.entries(dayOffAllocations || {}).forEach(([dayOffId, buddyId]) => {
    if (!grouped[buddyId]) grouped[buddyId] = { absent: [], dayOff: [] };
    grouped[buddyId].dayOff.push(parseInt(dayOffId));
  });
  
  return grouped;
}
