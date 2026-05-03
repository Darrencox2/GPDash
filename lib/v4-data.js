// v4 data layer — server-side helpers to fetch practice data from Postgres.
//
// Goal: minimise the amount of code that needs to change when porting v3
// features. v3 components read from a single `data` object; v4 components
// can do the same via the loaders here.
//
// Shape goal: the returned object should look enough like v3's `data` that
// existing components can be ported with mostly-mechanical changes.
//
// Usage in server components:
//   const data = await loadPracticeData(supabase, practiceId);
//   // data.clinicians, data.workingPatterns, etc.
//
// All functions take a Supabase client (so RLS is respected) and a practice ID.

// ─── Top-level: load everything for a practice ─────────────────────────
//
// Single call that fetches all the data a typical page would need.
// Parallel queries — should complete in <500ms even for a busy practice.
// Loads everything a dashboard render needs.
//
// Performance notes:
// - All 6 queries fire in parallel via Promise.all
// - Every query is filtered by practice_id (RLS still applies, but the
//   filter avoids RLS scanning the whole table on shared infrastructure)
// - Members list is NOT loaded here — fetched only by the practice
//   management page since it's a heavy RPC that joins to auth.users
// - CSV data is loaded but the dashboard caches it after the first load
export async function loadPracticeData(supabase, practiceId, opts = {}) {
  if (!supabase || !practiceId) return null;

  const skipCsv = opts.skipCsv === true;

  // Get the clinician IDs for this practice first — we need them to filter
  // working_patterns and absences (which join to clinicians, not directly
  // to practices).
  const { data: clinicianRows } = await supabase.from('clinicians')
    .select('id')
    .eq('practice_id', practiceId);
  const clinicianIds = (clinicianRows || []).map(r => r.id);

  const queries = [
    supabase.from('practices')
      .select('id, name, ods_code, region, created_at')
      .eq('id', practiceId)
      .maybeSingle(),
    supabase.from('clinicians')
      .select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, aliases, linked_user_id')
      .eq('practice_id', practiceId)
      .order('name'),
    clinicianIds.length > 0
      ? supabase.from('working_patterns')
          .select('id, clinician_id, effective_from, effective_to, pattern')
          .in('clinician_id', clinicianIds)
          .is('effective_to', null)
      : Promise.resolve({ data: [] }),
    clinicianIds.length > 0
      ? supabase.from('absences')
          .select('id, clinician_id, start_date, end_date, reason, notes')
          .in('clinician_id', clinicianIds)
      : Promise.resolve({ data: [] }),
    supabase.from('practice_settings')
      .select('huddle_settings, buddy_settings, room_allocation, closed_days, teamnet_url, extras')
      .eq('practice_id', practiceId)
      .maybeSingle(),
    skipCsv
      ? Promise.resolve({ data: null })
      : supabase.from('huddle_csv_data')
          .select('data, updated_at')
          .eq('practice_id', practiceId)
          .maybeSingle(),
  ];

  const [
    { data: practice },
    { data: clinicians },
    { data: workingPatterns },
    { data: absences },
    { data: settings },
    { data: huddleCsv },
  ] = await Promise.all(queries);

  return {
    practice: practice || null,
    clinicians: clinicians || [],
    workingPatterns: workingPatterns || [],
    absences: absences || [],
    settings: settings || null,
    huddleCsvData: huddleCsv?.data || null,
    huddleCsvUpdatedAt: huddleCsv?.updated_at || null,
    // members no longer loaded here — call list_practice_members RPC directly
    // from /v4/practice/[id] when needed
    members: [],
  };
}


// ─── Lightweight: just clinicians ─────────────────────────────────────
export async function loadClinicians(supabase, practiceId) {
  if (!supabase || !practiceId) return [];
  const { data } = await supabase.from('clinicians')
    .select('*')
    .eq('practice_id', practiceId)
    .order('name');
  return data || [];
}


// ─── Buddy allocations for a date range ────────────────────────────────
export async function loadBuddyAllocations(supabase, practiceId, fromDate, toDate) {
  if (!supabase || !practiceId) return [];
  let q = supabase.from('buddy_allocations')
    .select('date, allocations, generated_at')
    .eq('practice_id', practiceId)
    .order('date', { ascending: false });
  if (fromDate) q = q.gte('date', fromDate);
  if (toDate) q = q.lte('date', toDate);
  const { data } = await q;
  return data || [];
}


// ─── Rota notes for a clinician ────────────────────────────────────────
export async function loadRotaNotes(supabase, clinicianId, fromDate, toDate) {
  if (!supabase || !clinicianId) return [];
  let q = supabase.from('rota_notes')
    .select('date, note, updated_at')
    .eq('clinician_id', clinicianId)
    .order('date');
  if (fromDate) q = q.gte('date', fromDate);
  if (toDate) q = q.lte('date', toDate);
  const { data } = await q;
  return data || [];
}


// ─── Helper: which clinician (if any) is linked to the current user? ───
export async function getMyClinician(supabase, practiceId, userId) {
  if (!supabase || !practiceId || !userId) return null;
  const { data } = await supabase.from('clinicians')
    .select('*')
    .eq('practice_id', practiceId)
    .eq('linked_user_id', userId)
    .maybeSingle();
  return data || null;
}


// ─── v3-shape adapter ────────────────────────────────────────────────
// For components being ported from v3, this transforms the v4 data into
// something that looks like the v3 `data` object. Reduces the porting effort.
//
// v3 shape (selected fields):
//   data.clinicians = [{ id, name, initials, role, group, status, sessions, buddyCover, ... }]
//   data.weeklyRota = { Monday: [clinicId, ...], Tuesday: [...] }
//   data.plannedAbsences = [{ clinicianId, startDate, endDate, reason }]
//   data.huddleSettings = {...}
//   data.settings = {...}            // buddy settings in v4
//   data.roomAllocation = {...}
//   data.huddleCsvData = {...}
//   data.savedSlotFilters = ...
//   data.expectedCapacity = ...
export function adaptToV3Shape(v4Data) {
  if (!v4Data) return null;

  // Convert clinicians: v4 uses snake_case, v3 used camelCase
  const clinicians = (v4Data.clinicians || []).map(c => ({
    id: c.id,
    name: c.name,
    title: c.title,
    initials: c.initials,
    role: c.role,
    group: c.group_id,
    status: c.status,
    sessions: c.sessions,
    buddyCover: c.buddy_cover,
    canProvideCover: c.can_provide_cover,
    aliases: c.aliases || [],
    linkedUserId: c.linked_user_id,
  }));

  // Build weeklyRota from working patterns
  const weeklyRota = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  for (const wp of v4Data.workingPatterns || []) {
    const pattern = wp.pattern || {};
    for (const day of Object.keys(weeklyRota)) {
      if (pattern[day]?.am === 'in' || pattern[day]?.pm === 'in') {
        weeklyRota[day].push(wp.clinician_id);
      }
    }
  }

  // Build plannedAbsences in v3 shape
  const plannedAbsences = (v4Data.absences || []).map(a => ({
    clinicianId: a.clinician_id,
    startDate: a.start_date,
    endDate: a.end_date,
    reason: a.notes || a.reason || '',
  }));

  const settings = v4Data.settings || {};

  return {
    clinicians,
    weeklyRota,
    plannedAbsences,
    huddleSettings: settings.huddle_settings || {},
    settings: settings.buddy_settings || {},
    roomAllocation: settings.room_allocation || {},
    closedDays: settings.closed_days || {},
    teamnetUrl: settings.teamnet_url || null,
    huddleCsvData: v4Data.huddleCsvData,
    huddleCsvUploadedAt: v4Data.huddleCsvUpdatedAt,
    savedSlotFilters: settings.extras?.savedSlotFilters || null,
    expectedCapacity: settings.extras?.expectedCapacity || null,
    lastSyncTime: settings.extras?.lastTeamnetSync || null,
    // Daily overrides: stored as a v3-shape blob in practice_settings.extras.
    // (v4 has a daily_overrides table but its shape is per-clinician AM/PM,
    // while v3 stores per-day { present: [], scheduled: [] }. Easier to keep
    // them as a blob until we redesign that part of the model.)
    dailyOverrides: settings.extras?.dailyOverrides || {},
    allocationHistory: {},  // load via loadBuddyAllocations() when needed
    rotaNotes: {},           // load via loadRotaNotes() when needed
    auditLog: [],            // load via separate query when needed
  };
}
