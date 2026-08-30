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

// ─── Pattern key normalisation ────────────────────────────────────────
// working_patterns.pattern jsonb is supposed to use short lowercase day
// keys ('mon', 'tue', ...) per the migration comment. A bug in the
// /api/v4/data mutation 1 (fixed in v4.18.2) had been writing long
// day names ('Monday', 'Tuesday', ...) — which the adapter and the
// WorkingDaysGrid couldn't read. This helper accepts either shape and
// returns the canonical short-key form. Use it whenever reading a
// pattern out of the database; write only short keys.
const PATTERN_LONG_TO_SHORT = {
  Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri',
  Saturday: 'sat', Sunday: 'sun',
};
const SHORT_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export function normalizeWorkingPattern(pattern) {
  if (!pattern || typeof pattern !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(pattern)) {
    if (!v || typeof v !== 'object') continue;
    const short = PATTERN_LONG_TO_SHORT[k] || k.toLowerCase();
    if (SHORT_DAYS.has(short)) {
      // If both shapes exist (short and long) and we already have a
      // value for this day, keep the short-key one (it's the canonical).
      if (!(short in out) || k === short) {
        const tri = (x) => (x === 'in' ? 'in' : x === 'half' ? 'half' : 'off');
      out[short] = { am: tri(v.am), pm: tri(v.pm), eve: tri(v.eve) };
      }
    }
  }
  return out;
}

// ─── Identifier resolver ──────────────────────────────────────────────
//
// Resolves any user-facing identifier to a full practice row. Tries in order:
//   1. UUID (if it looks like one)
//   2. Slug   (if it matches the slug format)
//   3. ODS code (any other shortish alphanumeric string)
//
// Returns the practice row or null. Use this at route entry points where
// the URL contains [id] — slug, ods_code, and uuid all "just work".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,49}$/;

export async function resolvePracticeIdentifier(supabase, identifier) {
  if (!supabase || !identifier) return null;
  const id = String(identifier).trim();

  // Try UUID first — fastest path, indexed primary key
  if (UUID_RE.test(id)) {
    const { data } = await supabase
      .from('practices')
      .select('id, name, slug, ods_code, region, postcode, list_size, online_consult_tool, setup_completed_at, latitude, longitude, admin_district, buddy_cover_public')
      .eq('id', id)
      .maybeSingle();
    if (data) return data;
  }

  // Try slug (lowercase form)
  const lower = id.toLowerCase();
  if (SLUG_RE.test(lower)) {
    const { data } = await supabase
      .from('practices')
      .select('id, name, slug, ods_code, region, postcode, list_size, online_consult_tool, setup_completed_at, latitude, longitude, admin_district, buddy_cover_public')
      .eq('slug', lower)
      .maybeSingle();
    if (data) return data;
  }

  // Try ODS code (typically 6 chars, often uppercase)
  const upper = id.toUpperCase();
  const { data } = await supabase
    .from('practices')
    .select('id, name, slug, ods_code, region, postcode, list_size, online_consult_tool, setup_completed_at, latitude, longitude, admin_district, buddy_cover_public')
    .eq('ods_code', upper)
    .maybeSingle();
  return data || null;
}

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
      .select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, show_whos_in, aliases, linked_user_id, metadata, wind_down')
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
          .select('id, clinician_id, start_date, end_date, reason, notes, source, session')
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
    // daily_overrides is the v4 home for what v3 kept as a blob in
    // practice_settings.extras. Backfilled in migration
    // 20260830130000; the blob stays as the fallback below until this
    // table has been proven in production.
    clinicianIds.length > 0
      ? supabase.from('daily_overrides')
          .select('clinician_id, date, am, pm')
          .in('clinician_id', clinicianIds)
      : Promise.resolve({ data: [] }),
  ];

  const [
    { data: practice },
    { data: clinicians },
    { data: workingPatterns },
    { data: absences },
    { data: settings },
    { data: huddleCsv },
    { data: dailyOverrideRows },
  ] = await Promise.all(queries);

  return {
    practice: practice || null,
    clinicians: clinicians || [],
    workingPatterns: workingPatterns || [],
    absences: absences || [],
    settings: settings || null,
    huddleCsvData: huddleCsv?.data || null,
    huddleCsvUpdatedAt: huddleCsv?.updated_at || null,
    dailyOverrideRows: dailyOverrideRows || [],
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
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Rebuild the v3-shaped dailyOverrides map from daily_overrides rows.
//
// v3 stored, per day, an absolute { present, scheduled } pair; lib/data.js
// derives `absent = scheduled - present` from it. A row per clinician with
// am/pm 'in' or 'off' carries the same information:
//
//   'in'  -> present (and scheduled)
//   'off' -> scheduled only
//
// Verified against the real 22 days of production data before the backfill
// ran: the absent set every consumer derives is identical either way.
//
// Emitting the v3 shape rather than a new one is deliberate — 45 call sites
// across 12 files read this, and the point of the adapter is that the
// storage can move without any of them changing.
export function dailyOverridesFromRows(rows) {
  const out = {};
  for (const r of rows || []) {
    if (!r?.date || !r?.clinician_id) continue;
    const [y, m, d] = String(r.date).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) continue;
    const key = `${String(r.date).slice(0, 10)}-${DAY_NAMES[new Date(y, m - 1, d).getDay()]}`;
    if (!out[key]) out[key] = { present: [], scheduled: [] };
    out[key].scheduled.push(r.clinician_id);
    // Day-level v3 semantics: present if EITHER session says so. A future
    // per-session override narrows this without changing the storage.
    if (r.am === 'in' || r.pm === 'in') out[key].present.push(r.clinician_id);
  }
  return out;
}

// Push a v3-shaped dailyOverrides map into the daily_overrides table.
//
// v3 semantics are absolute per day — `present` replaces the day rather
// than patching it — so each CHANGED day is replaced wholesale: delete that
// date's rows for this practice, then insert the new set. Untouched days are
// left alone, which keeps a routine In/Out toggle to one day's worth of work.
//
// Returns an array of pending queries for the caller to await alongside its
// other ops. Rows are scoped to clinicianIds so a stale id in the payload
// cannot write against another practice.
export async function syncDailyOverrides(supabase, clinicianIds, oldMap, newMap) {
  const ids = new Set(clinicianIds || []);
  if (!ids.size) return { error: null };

  const dateOf = (key) => String(key).slice(0, 10);
  const changed = new Set();
  for (const key of new Set([...Object.keys(oldMap || {}), ...Object.keys(newMap || {})])) {
    if (JSON.stringify(oldMap?.[key] || null) !== JSON.stringify(newMap?.[key] || null)) {
      const d = dateOf(key);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) changed.add(d);
    }
  }
  if (!changed.size) return { error: null };

  const scoped = [...ids];
  // Deletes must COMPLETE before the upsert. They used to be queued into the
  // caller's Promise.all alongside it, which is unordered - a delete landing
  // after the upsert silently emptied the table.
  for (const date of changed) {
    const { error } = await supabase.from('daily_overrides').delete().eq('date', date).in('clinician_id', scoped);
    if (error) return { error };
  }

  const rows = [];
  for (const [key, val] of Object.entries(newMap || {})) {
    const date = dateOf(key);
    if (!changed.has(date)) continue;
    const present = new Set(val?.present || []);
    const scheduled = new Set(val?.scheduled || []);
    for (const cid of new Set([...present, ...scheduled])) {
      if (!ids.has(cid)) continue;
      const state = present.has(cid) ? 'in' : 'off';
      rows.push({ clinician_id: cid, date, am: state, pm: state });
    }
  }
  if (rows.length) {
    const { error } = await supabase.from('daily_overrides').upsert(rows, { onConflict: 'clinician_id,date' });
    if (error) return { error };
  }
  return { error: null };
}

export function adaptToV3Shape(v4Data) {
  if (!v4Data) return null;

  // Convert clinicians: v4 uses snake_case, v3 used camelCase. Metadata
  // jsonb (added in migration 033) holds v3-era extras — buddy
  // preferences, room preferences, notes — and gets unwrapped here so
  // the buddy-cover engine and side panel see flat fields.
  const clinicians = (v4Data.clinicians || []).map(c => {
    const meta = c.metadata || {};
    return {
      id: c.id,
      name: c.name,
      title: c.title,
      initials: c.initials,
      role: c.role,
      group: c.group_id,
      status: c.status,
      sessions: c.sessions,
      buddyCover: c.buddy_cover,
      ...(c.wind_down ? { windDown: c.wind_down } : {}),
      canProvideCover: c.can_provide_cover,
      showWhosIn: c.show_whos_in !== false, // default true if column missing pre-041
      aliases: c.aliases || [],
      linkedUserId: c.linked_user_id,
      primaryBuddy: meta.primaryBuddy || null,
      secondaryBuddy: meta.secondaryBuddy || null,
      roomPreferences: meta.roomPreferences || {},
      notes: meta.notes || '',
    };
  });

  // Build weeklyRota from working patterns. The pattern jsonb uses
  // short lowercase day keys (mon/tue/wed/thu/fri) — matches the
  // schema's intent ("mon-am-in, mon-pm-off" per the migration comment)
  // and what inferAmPmPatterns + WorkingDaysGrid write. The v3-shape
  // weeklyRota uses long day names (Monday/Tuesday/...), so we map
  // between the two here.
  //
  // normalizeWorkingPattern handles legacy long-key shapes that the API
  // mutation 1 had been writing (bug fixed in v4.18.2) — we read either
  // shape transparently so users with malformed historical data still
  // see correct results until the next write rewrites the row.
  const DAY_KEY_MAP = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday',
  };
  const weeklyRota = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  // sessionRota: THE authoritative 3-session model (M/A/E per weekday per
  // clinician), read straight from working_patterns am/pm/eve. weeklyRota
  // below is now just the lossy day-level DERIVED view kept for readers
  // that only need "in at all that day".
  const sessionRota = {};
  const sessionRotaDetail = {};
  for (const wp of v4Data.workingPatterns || []) {
    const pattern = normalizeWorkingPattern(wp.pattern);
    const mine = {};
    for (const [shortKey, longKey] of Object.entries(DAY_KEY_MAP)) {
      const day = pattern[shortKey];
      const slots = [];
      // 'half' counts as working (any-session rule) - halves exist for
      // accurate session COUNTS, not for presence.
      if (day?.am === 'in' || day?.am === 'half') slots.push('M');
      if (day?.pm === 'in' || day?.pm === 'half') slots.push('A');
      if (day?.eve === 'in' || day?.eve === 'half') slots.push('E');
      mine[longKey] = slots;
      if (slots.length) weeklyRota[longKey].push(wp.clinician_id);
      (sessionRotaDetail[wp.clinician_id] = sessionRotaDetail[wp.clinician_id] || {})[longKey] = day || {};
    }
    sessionRota[wp.clinician_id] = mine;
  }

  // Build plannedAbsences in v3 shape
  const plannedAbsences = (v4Data.absences || []).map(a => ({
    id: a.id,
    clinicianId: a.clinician_id,
    startDate: a.start_date,
    endDate: a.end_date,
    reason: a.notes || a.reason || '',
    ...(a.source ? { source: a.source } : {}),
    ...(a.session ? { session: a.session } : {}),
  }));

  const settings = v4Data.settings || {};

  return {
    clinicians,
    weeklyRota,
    sessionRota,
    sessionRotaDetail,
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
    // Table first, blob as fallback. The fallback is NOT ceremony: an
    // ordering bug in the override writer emptied this table in testing, and
    // the blob was the only reason nothing was lost. It stays until the
    // writer has been proven in production for a real release.
    dailyOverrides: (v4Data.dailyOverrideRows && v4Data.dailyOverrideRows.length)
      ? dailyOverridesFromRows(v4Data.dailyOverrideRows)
      : (settings.extras?.dailyOverrides || {}),
    huddleMessages: settings.extras?.huddleMessages || [],
    allocationHistory: {},  // load via loadBuddyAllocations() when needed
    rotaNotes: {},           // load via loadRotaNotes() when needed
    auditLog: [],            // load via separate query when needed
  };
}
