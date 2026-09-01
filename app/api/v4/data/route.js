// /api/v4/data — returns the v3-shaped data object for a Supabase-authed user.
//
// GET  ?practice=UUID       → returns the data object as v3 expects it
// POST ?practice=UUID&op=...  → mutation endpoint (op-based for clarity)
//
// This is the bridge that lets the v3 app shell run unchanged on top of
// Postgres. The shape of the returned object matches what app/api/data
// returns when reading from Redis, so HuddleToday, MyRota, BuddyDaily
// etc. don't need to know the difference.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { loadPracticeData, loadBuddyAllocations, adaptToV3Shape, syncDailyOverrides, dailyOverridesFromRows } from '@/lib/v4-data';
import { requireUuid } from '@/lib/api-helpers';
import { trimHuddleWindow } from '@/lib/huddle-trim';

export const dynamic = 'force-dynamic';

// ─── GET: read everything in a single round-trip ──────────────────────
//
// ONE Promise.all containing every query plus auth check. No serial
// dependencies. Working patterns and absences use embedded foreign-key
// filters so they don't need to wait for a clinician-id pre-query.
export async function GET(request) {
  const t0 = Date.now();
  const url = new URL(request.url);
  const practiceId = url.searchParams.get('practice');
  const badUuid = requireUuid(practiceId, 'practice');
  if (badUuid) return badUuid;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  // Compute allocation cutoff (sync, no DB)
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // EVERYTHING in parallel — including auth.
  // Working patterns / absences / rota notes use embedded join filters
  // (clinicians!inner(practice_id)) so we don't need to pre-fetch IDs.
  const t1 = Date.now();
  const [
    { data: { user } },
    { data: practice },
    { data: clinicians },
    { data: workingPatterns },
    { data: absences },
    { data: settings },
    { data: huddleCsv },
    { data: allocations },
    { data: notes },
    { data: memberships },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('practices')
      .select('id, name, slug, ods_code, region, postcode, list_size, online_consult_tool, latitude, longitude, admin_district')
      .eq('id', practiceId)
      .maybeSingle(),
    supabase.from('clinicians')
      .select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, show_whos_in, aliases, linked_user_id')
      .eq('practice_id', practiceId)
      .order('name'),
    supabase.from('working_patterns')
      .select('id, clinician_id, effective_from, effective_to, pattern, clinicians!inner(practice_id)')
      .eq('clinicians.practice_id', practiceId)
      .is('effective_to', null),
    supabase.from('absences')
      .select('id, clinician_id, start_date, end_date, reason, notes, source, session, clinicians!inner(practice_id)')
      .eq('clinicians.practice_id', practiceId),
    supabase.from('practice_settings')
      .select('huddle_settings, buddy_settings, room_allocation, closed_days, teamnet_url, extras, demand_settings')
      .eq('practice_id', practiceId)
      .maybeSingle(),
    supabase.from('huddle_csv_data')
      .select('data, updated_at')
      .eq('practice_id', practiceId)
      .maybeSingle(),
    supabase.from('buddy_allocations')
      .select('date, allocations')
      .eq('practice_id', practiceId)
      .gte('date', cutoffStr),
    supabase.from('rota_notes')
      .select('clinician_id, date, note, clinicians!inner(practice_id)')
      .eq('clinicians.practice_id', practiceId),
    supabase.from('practice_users')
      .select('role, practices(id, name)'),  // RLS filters to current user automatically
  ]);
  const tQueries = Date.now();

  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!practice) return NextResponse.json({ error: 'Practice not found or access denied' }, { status: 404 });

  // Adapt — passes through the same shape as before
  const v4Data = {
    practice,
    clinicians: clinicians || [],
    workingPatterns: workingPatterns || [],
    absences: absences || [],
    settings: settings || null,
    huddleCsvData: huddleCsv?.data || null,
    huddleCsvUpdatedAt: huddleCsv?.updated_at || null,
    members: [],
  };
  const v3Shape = adaptToV3Shape(v4Data);

  // Inline allocations
  const allocationHistory = {};
  for (const a of (allocations || [])) {
    allocationHistory[a.date] = a.allocations;
  }
  v3Shape.allocationHistory = allocationHistory;

  // Inline notes
  const rotaNotesMap = {};
  for (const n of (notes || [])) {
    if (!rotaNotesMap[n.clinician_id]) rotaNotesMap[n.clinician_id] = {};
    rotaNotesMap[n.clinician_id][n.date] = n.note;
  }
  v3Shape.rotaNotes = rotaNotesMap;

  const myClinician = (clinicians || []).find(c => c.linked_user_id === user.id);

  v3Shape._v4 = {
    practiceId,
    practiceName: practice.name,
    practiceSlug: practice.slug,
    practiceListSize: practice.list_size,
    practiceOds: practice.ods_code,
    practicePostcode: practice.postcode,
    practiceLatitude: practice.latitude,
    practiceLongitude: practice.longitude,
    practiceAdminDistrict: practice.admin_district,
    practiceOnlineConsultTool: practice.online_consult_tool,
    demandSettings: settings?.demand_settings || null,
    userId: user.id,
    userEmail: user.email,
    linkedClinicianId: myClinician?.id || null,
    linkedClinicianName: myClinician?.name || null,
    // Inline practices list — saves an extra round-trip from the client
    practices: (memberships || []).map(m => ({
      id: m.practices?.id,
      name: m.practices?.name,
      role: m.role,
    })).filter(p => p.id),
  };

  const tEnd = Date.now();
  // Cache hint — let the browser cache the response for a few seconds
  // so navigation back/forward and rapid page reloads don't re-fetch.
  // Server-Timing header lets us see in DevTools where the time goes.
  return new NextResponse(JSON.stringify(v3Shape), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, max-age=10, stale-while-revalidate=60',
      'server-timing': `setup;dur=${t1 - t0},queries;dur=${tQueries - t1},shape;dur=${tEnd - tQueries},total;dur=${tEnd - t0}`,
    },
  });
}


// ─── POST: full document save (compatibility with v3's saveData) ───────
//
// v3 calls saveData(data) which POSTs the entire data object back. We
// translate this into per-table updates against Postgres.
//
// This is intentionally a brute-force diff approach for now — it makes
// the v3 components work unchanged. Performance will be fine for typical
// use (small mutations) and we can optimise later by intercepting specific
// mutations in the client.
export async function POST(request) {
  const url = new URL(request.url);
  const practiceId = url.searchParams.get('practice');
  const badUuid = requireUuid(practiceId, 'practice');
  if (badUuid) return badUuid;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Check write access — admins/owners only
  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  const MANAGEMENT_ROLES = ['owner', 'partner', 'practice_manager', 'admin'];
  if (!membership || !MANAGEMENT_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Write access requires a management role' }, { status: 403 });
  }

  const newData = await request.json();
  if (!newData) return NextResponse.json({ error: 'Body required' }, { status: 400 });

  // FAST PATH: detect saves that only contain "delta" fields (overrides,
  // allocations, notes, settings, lastSyncTime). These are the high-frequency
  // saves — In/Out toggles, note edits, buddy generation, sync timestamp.
  // For these, we skip loading all practice data (no diff needed) and just
  // do targeted upserts.
  //
  // Slow path (load + diff) is only taken when the incoming body contains
  // structural changes: clinicians, weeklyRota, plannedAbsences, closedDays,
  // huddleCsvData, etc.
  const SLOW_PATH_KEYS = ['clinicians', 'weeklyRota', 'plannedAbsences', 'closedDays', 'huddleCsvData', 'huddleSettings', 'settings', 'roomAllocation', 'teamnetUrl', 'savedSlotFilters', 'expectedCapacity', 'huddleMessages'];
  const hasSlowPathData = SLOW_PATH_KEYS.some(k => newData[k] !== undefined);
  if (!hasSlowPathData) {
    return await handleFastPath(supabase, practiceId, user, newData);
  }

  // Only load CSV data when the incoming save actually contains CSV changes —
  // otherwise we're loading hundreds of KB just to throw it away. The presence
  // of `huddleCsvData` on the incoming body indicates a CSV upload happened.
  const needsCsv = newData.huddleCsvData != null;
  const v4Data = await loadPracticeData(supabase, practiceId, { skipCsv: !needsCsv });
  const oldData = adaptToV3Shape(v4Data);

  const errors = [];
  const ops = [];

  // ─── Mutation 1: weeklyRota → working_patterns ───────────────────────
  // v3-shape weeklyRota is a day-level list of clinician IDs per day
  // (Monday/Tuesday/...). v4 working_patterns has per-clinician AM/PM
  // granularity in a JSONB pattern keyed by SHORT day names
  // (mon/tue/wed/thu/fri).
  //
  // Two things this mutation has to get right:
  //
  //   1. Use SHORT keys when writing. Long keys (Monday/Tuesday/...)
  //      are unreadable by the adapter and WorkingDaysGrid — that was
  //      the v4.13.0-v4.18.1 bug. Every saveData call from the client
  //      bundles weeklyRota, this code ran, wrote long keys, and
  //      destroyed AM/PM granularity from the WorkingDaysGrid.
  //
  //   2. PRESERVE AM/PM granularity for days that didn't change. If
  //      the clinician was already in on Tuesday with {am:'in', pm:'off'},
  //      and the new weeklyRota still has them on Tuesday, don't
  //      overwrite that to {am:'in', pm:'in'} — we'd lose their
  //      half-day pattern. Compare day-sets, not stringified patterns.
  // ── Mutation 1b: sessionRota → working_patterns (AUTHORITATIVE) ──
  // The 3-session model. When the client sends sessionRota, it is the
  // full truth (M/A/E per weekday per clinician) and Mutation 1's lossy
  // day-level path is skipped so the two can never fight.
  const sessionRotaHandled = new Set();
  if (newData.sessionRota && typeof newData.sessionRota === 'object') {
    const LONG_TO_SHORT_S = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri' };
    const oldSR = oldData.sessionRota || {};
    for (const [cid, days] of Object.entries(newData.sessionRota)) {
      if (JSON.stringify(days) === JSON.stringify(oldSR[cid])) continue;
      sessionRotaHandled.add(cid);
      const pattern = {};
      for (const [longDay, shortDay] of Object.entries(LONG_TO_SHORT_S)) {
        const slots = Array.isArray(days?.[longDay]) ? days[longDay] : [];
        if (!slots.length) continue;
        // Preserve 'half' set in the working days grid: an array write
        // (binary editors) keeps a slot's existing half status.
        const oldDetail = oldData.sessionRotaDetail?.[cid]?.[longDay] || {};
        const keep = (slot, key) => (slots.includes(slot) ? (oldDetail[key] === 'half' ? 'half' : 'in') : 'off');
        pattern[shortDay] = { am: keep('M', 'am'), pm: keep('A', 'pm'), eve: keep('E', 'eve') };
      }
      if (Object.prototype.hasOwnProperty.call(oldSR, cid)) {
        ops.push(supabase.from('working_patterns').update({ pattern }).eq('clinician_id', cid));
      } else {
        ops.push(supabase.from('working_patterns').insert({
          clinician_id: cid,
          effective_from: '1970-01-01',
          effective_to: null,
          pattern,
        }));
      }
    }
  }

  // Runs whenever weeklyRota is present, skipping any clinician Mutation 1b
  // already wrote. It used to be fenced off entirely by `!newData.sessionRota`,
  // which silently discarded every day-level rota edit: saveData spreads the
  // whole data object, so sessionRota is ALWAYS present, 1b saw no session
  // change and wrote nothing, and 1 never ran. Three live controls -
  // DashboardClient.toggleRotaDay, TeamMembers day pills and TeamRota's
  // generated rota - appeared to save and did not. The per-clinician skip
  // below keeps the original promise that the two can never fight.
  if (newData.weeklyRota) {
    const newRota = newData.weeklyRota;
    const SHORT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const LONG_TO_SHORT = {
      Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri',
    };
    // Read legacy long-key patterns gracefully — same logic as
    // normalizeWorkingPattern in lib/v4-data.js but inlined here to
    // keep the API route self-contained.
    const normalize = (pattern) => {
      if (!pattern || typeof pattern !== 'object') return {};
      const out = {};
      for (const [k, v] of Object.entries(pattern)) {
        if (!v || typeof v !== 'object') continue;
        const short = LONG_TO_SHORT[k] || k.toLowerCase();
        if (SHORT_DAYS.includes(short)) {
          out[short] = { am: v.am === 'in' ? 'in' : 'off', pm: v.pm === 'in' ? 'in' : 'off' };
        }
      }
      return out;
    };

    // Build per-clinician new day-set (which days they're in per v3 rota)
    const newDaysByClinician = {};
    for (const [longDay, shortDay] of Object.entries(LONG_TO_SHORT)) {
      for (const cid of (newRota[longDay] || [])) {
        if (!newDaysByClinician[cid]) newDaysByClinician[cid] = new Set();
        newDaysByClinician[cid].add(shortDay);
      }
    }

    const allClinicians = new Set([
      ...(v4Data.workingPatterns || []).map(wp => wp.clinician_id),
      ...Object.keys(newDaysByClinician),
    ]);

    for (const cid of allClinicians) {
      // Mutation 1b is authoritative for anyone whose sessions changed.
      if (sessionRotaHandled.has(cid)) continue;
      const newDays = newDaysByClinician[cid] || new Set();
      const existing = (v4Data.workingPatterns || []).find(wp => wp.clinician_id === cid);

      if (existing) {
        // Compute existing day-set from the (possibly legacy-shaped) pattern
        const existingPattern = normalize(existing.pattern);
        const existingDays = new Set();
        for (const sd of SHORT_DAYS) {
          const day = existingPattern[sd];
          if (day?.am === 'in' || day?.pm === 'in') existingDays.add(sd);
        }
        // If the day-set hasn't changed, there's nothing to do — the
        // weeklyRota the client posted matches what working_patterns
        // already says. This is the common case for every saveData call.
        const sameSet = newDays.size === existingDays.size
          && [...newDays].every(d => existingDays.has(d));

        // Even when the day-set hasn't changed, if the pattern was
        // stored in legacy long-key shape, rewrite it as short-key
        // so the stored data self-heals over time.
        const hasLegacyKeys = existing.pattern && Object.keys(existing.pattern).some(k => k in LONG_TO_SHORT);

        if (sameSet && !hasLegacyKeys) continue;

        // Build the updated pattern: preserve AM/PM granularity for
        // days that are in both the old and new set; switch removed
        // days to both-off; default added days to both-in.
        const updatedPattern = {};
        for (const sd of SHORT_DAYS) {
          const wasIn = existingDays.has(sd);
          const willBeIn = newDays.has(sd);
          if (wasIn && willBeIn) {
            // Same day → preserve existing AM/PM exactly
            updatedPattern[sd] = existingPattern[sd] || { am: 'in', pm: 'in' };
          } else if (willBeIn) {
            // Newly added day → default to whole-day in (user can
            // refine to half-day via WorkingDaysGrid)
            updatedPattern[sd] = { am: 'in', pm: 'in' };
          }
          // Day removed → omit from pattern (treated as off everywhere
          // that reads working_patterns)
        }
        ops.push(supabase.from('working_patterns').update({ pattern: updatedPattern }).eq('id', existing.id));
      } else if (newDays.size > 0) {
        // No existing pattern for this clinician → INSERT
        const newPattern = {};
        for (const sd of SHORT_DAYS) {
          if (newDays.has(sd)) {
            newPattern[sd] = { am: 'in', pm: 'in' };
          }
        }
        ops.push(supabase.from('working_patterns').insert({
          clinician_id: cid,
          effective_from: '1970-01-01',
          effective_to: null,
          pattern: newPattern,
        }));
      }
    }
  }

  // ─── Mutation 2: rotaNotes → rota_notes (upsert/delete) ──────────────
  if (newData.rotaNotes) {
    const oldNotes = oldData.rotaNotes || {};
    const newNotes = newData.rotaNotes;
    const allCids = new Set([...Object.keys(oldNotes), ...Object.keys(newNotes)]);
    for (const cid of allCids) {
      const oldDates = oldNotes[cid] || {};
      const newDates = newNotes[cid] || {};
      const allDates = new Set([...Object.keys(oldDates), ...Object.keys(newDates)]);
      for (const date of allDates) {
        const oldText = (oldDates[date] || '').trim();
        const newText = (newDates[date] || '').trim();
        if (oldText === newText) continue;
        if (newText === '') {
          ops.push(supabase.from('rota_notes').delete().eq('clinician_id', cid).eq('date', date));
        } else {
          ops.push(supabase.from('rota_notes').upsert({ clinician_id: cid, date, note: newText }));
        }
      }
    }
  }

  // ─── Mutation 3: closedDays/huddleSettings/settings/etc → practice_settings ───
  // Coalesce into a single update if any setting changed
  const settingsUpdate = {};
  if (newData.huddleSettings && JSON.stringify(newData.huddleSettings) !== JSON.stringify(oldData.huddleSettings)) {
    settingsUpdate.huddle_settings = newData.huddleSettings;
  }
  if (newData.settings && JSON.stringify(newData.settings) !== JSON.stringify(oldData.settings)) {
    settingsUpdate.buddy_settings = newData.settings;
  }
  if (newData.roomAllocation && JSON.stringify(newData.roomAllocation) !== JSON.stringify(oldData.roomAllocation)) {
    settingsUpdate.room_allocation = newData.roomAllocation;
  }
  if (newData.closedDays && JSON.stringify(newData.closedDays) !== JSON.stringify(oldData.closedDays)) {
    settingsUpdate.closed_days = newData.closedDays;
  }
  if (newData.teamnetUrl !== oldData.teamnetUrl) {
    settingsUpdate.teamnet_url = newData.teamnetUrl || null;
  }

  // dailyOverrides + savedSlotFilters + expectedCapacity live in `extras` JSONB.
  // Read the current row so we don't clobber sibling keys.
  const oldExtras = v4Data.settings?.extras || {};
  let extrasChanged = false;
  const newExtras = { ...oldExtras };
  // daily_overrides is the record; the extras blob is still written beside
  // it as the recovery path. One sequenced promise, not a spread of racing
  // ops - see syncDailyOverrides.
  if (newData.dailyOverrides && JSON.stringify(newData.dailyOverrides) !== JSON.stringify(oldData.dailyOverrides || {})) {
    newExtras.dailyOverrides = newData.dailyOverrides;
    extrasChanged = true;
    ops.push(syncDailyOverrides(
      supabase,
      (v4Data.clinicians || []).map(c => c.id),
      oldData.dailyOverrides || {},
      newData.dailyOverrides,
    ));
  }
  if (newData.savedSlotFilters !== undefined && JSON.stringify(newData.savedSlotFilters) !== JSON.stringify(oldExtras.savedSlotFilters || null)) {
    newExtras.savedSlotFilters = newData.savedSlotFilters;
    extrasChanged = true;
  }
  if (newData.staffPlan !== undefined && JSON.stringify(newData.staffPlan) !== JSON.stringify(oldExtras.staffPlan || null)) {
    newExtras.staffPlan = newData.staffPlan;
    extrasChanged = true;
  }
  if (newData.expectedCapacity !== undefined && JSON.stringify(newData.expectedCapacity) !== JSON.stringify(oldExtras.expectedCapacity || null)) {
    newExtras.expectedCapacity = newData.expectedCapacity;
    extrasChanged = true;
  }
  if (newData.lastSyncTime && newData.lastSyncTime !== oldExtras.lastTeamnetSync) {
    newExtras.lastTeamnetSync = newData.lastSyncTime;
    extrasChanged = true;
  }
  // Noticeboard messages — short-lived, per-practice, fits in extras.
  // We treat undefined as "no change", so a save that doesn't include
  // huddleMessages won't wipe them. An empty array means "all cleared".
  if (newData.huddleMessages !== undefined &&
      JSON.stringify(newData.huddleMessages) !== JSON.stringify(oldExtras.huddleMessages || [])) {
    newExtras.huddleMessages = newData.huddleMessages;
    extrasChanged = true;
  }
  if (extrasChanged) {
    settingsUpdate.extras = newExtras;
  }

  if (Object.keys(settingsUpdate).length > 0) {
    ops.push(supabase.from('practice_settings').update(settingsUpdate).eq('practice_id', practiceId));
  }

  // ─── Mutation 4: allocationHistory → buddy_allocations ───────────────
  if (newData.allocationHistory) {
    const oldHistory = oldData.allocationHistory || {};
    const newHistory = newData.allocationHistory;
    for (const date of Object.keys(newHistory)) {
      const oldEntry = oldHistory[date];
      const newEntry = newHistory[date];
      if (!newEntry) continue;
      if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
        ops.push(supabase.from('buddy_allocations').upsert({
          practice_id: practiceId,
          date,
          allocations: newEntry,
        }));
      }
    }
  }

  // ─── Mutation 5: huddleCsvData → huddle_csv_data ─────────────────────
  // CSV uploads + auto-detected staff. The component sends the full
  // merged CSV data structure. We just upsert the row.
  if (newData.huddleCsvData) {
    // Server-side window enforcement (see lib/huddle-trim.js): trim BEFORE
    // both the change-comparison and the upsert. A stale session re-sending
    // an oversized blob now trims to the same content as what is stored, so
    // the comparison sees "unchanged" and the save becomes a no-op instead
    // of a clobber + phantom csv_uploads audit row.
    const incomingCsv = trimHuddleWindow(newData.huddleCsvData);
    const csvChanged = JSON.stringify(incomingCsv) !== JSON.stringify(trimHuddleWindow(oldData.huddleCsvData));
    if (csvChanged) {
      // Audit trail: insert csv_uploads row
      ops.push(
        supabase.from('csv_uploads').insert({
          practice_id: practiceId,
          uploaded_by: user.id,
          uploaded_at: new Date().toISOString(),
          filename: 'browser-upload',
          notes: 'Uploaded via Today page',
        }).select('id').single().then(({ data: upload, error: upErr }) => {
          if (upErr) return { error: upErr };
          // Then upsert the parsed data
          return supabase.from('huddle_csv_data').upsert({
            practice_id: practiceId,
            data: incomingCsv,
            upload_id: upload?.id || null,
          });
        })
      );
    }
  }

  // ─── Mutation 6: clinicians → clinicians table ───────────────────────
  // INSERTS ONLY. New clinicians (typically from CSV upload) are
  // inserted here. UPDATES and DELETES via this bulk endpoint are
  // DISABLED — they previously caused data loss when components on
  // other pages (e.g. the dashboard's HuddleToday auto-snapshot) fired
  // saveData({ ...data, ... }) with potentially-stale clinicians and
  // the server dutifully overwrote freshly-edited DB rows with the
  // stale incoming values. Existing clinician field edits MUST go
  // through direct supabase writes from the client (clinicians_update_admin
  // RLS policy authorises owner/admin to write). See QuickSetupTable
  // and BuddyCoverSettings for the pattern.
  if (Array.isArray(newData.clinicians)) {
    const oldClins = oldData.clinicians || [];
    const newClins = newData.clinicians;
    const oldById = {};
    for (const c of oldClins) oldById[c.id] = c;

    // Build a set of initials already taken by ACTIVE existing clinicians
    // so an INSERT doesn't collide with an existing row's initials.
    // Updates/deletes are skipped, so we don't need the "exclude rows in
    // this batch" logic any more.
    const takenInitials = new Set();
    for (const old of oldClins) {
      if (old.status === 'active' && old.initials) {
        takenInitials.add(String(old.initials).toLowerCase());
      }
    }
    const safeInitials = (requested, status) => {
      const v = (requested || '').trim();
      if (!v) return null;
      if (status && status !== 'active') return v;
      const key = v.toLowerCase();
      if (takenInitials.has(key)) return null;
      takenInitials.add(key);
      return v;
    };

    for (const c of newClins) {
      const old = oldById[c.id];
      if (old) continue; // Existing — updates handled via direct supabase writes
      // New clinician (typically from CSV upload). Insert if UUID-shaped.
      if (typeof c.id === 'string' && c.id.length === 36 && c.id.includes('-')) {
        ops.push(supabase.from('clinicians').insert({
          id: c.id,
          practice_id: practiceId,
          name: c.name,
          title: c.title || null,
          initials: safeInitials(c.initials, c.status || 'active'),
          role: c.role || null,
          group_id: c.group || 'admin',
          status: c.status || 'active',
          sessions: c.sessions || 0,
          buddy_cover: !!c.buddyCover,
          can_provide_cover: c.canProvideCover !== false,
          show_whos_in: c.showWhosIn !== false,
          aliases: c.aliases || [],
        }));
      } else {
        errors.push(`Skipped new clinician '${c.name}' — non-UUID id (${c.id}).`);
      }
    }
    // NB: deletions via missing-from-array are also disabled here.
    // Explicit clinician deletion should use direct supabase delete.
  }

  // ── Mutation 6b: wind-down markers + status flips → clinician rows ──
  // Targeted single-field updates, gated on actual change. The bulk
  // clinician path stays insert-only (stale-overwrite protection), but
  // status transitions must persist server-side: client-direct writes
  // proved fragile (schema-cache/RLS silences, DB showed zero stored
  // markers), and every transition already flows through this route.
  if (Array.isArray(newData.clinicians) && Array.isArray(oldData.clinicians)) {
    const oldById = Object.fromEntries(oldData.clinicians.map((c) => [c.id, c]));
    for (const nc of newData.clinicians) {
      const oc = oldById[nc.id];
      if (!oc) continue;
      const fields = {};
      // Only a save that KNOWS about the marker may change it. The loader
      // omits windDown entirely when the column is null, so a client whose
      // copy predates the transition has no key at all — and writing
      // `nc.windDown || null` for those wiped the marker moments after it
      // was set, then kept it wiped (no marker in the DB means no key in
      // the next load, so every later save cleared it again). An explicit
      // null still clears, which is how undo and the sweep work.
      if (Object.prototype.hasOwnProperty.call(nc, 'windDown')
        && JSON.stringify(nc.windDown || null) !== JSON.stringify(oc.windDown || null)) {
        fields.wind_down = nc.windDown || null;
      }
      if (nc.status && nc.status !== oc.status && ['active', 'left', 'administrative'].includes(nc.status)) {
        fields.status = nc.status;
      }
      if (Object.keys(fields).length) {
        ops.push(supabase.from('clinicians').update(fields).eq('id', nc.id));
      }
    }
  }

  // ─── Mutation 7: plannedAbsences → absences ──────────────────────────
  // v3 stores absences as a flat array; v4 stores them as rows. Diff by
  // (clinicianId, startDate) since v3 doesn't carry stable absence IDs.
  if (Array.isArray(newData.plannedAbsences)) {
    const oldAbs = oldData.plannedAbsences || [];
    const newAbs = newData.plannedAbsences;
    const keyOf = a => `${a.clinicianId}|${a.startDate}`;
    // TeamNet rows are owned by the sync API (delete-by-marker, then
    // re-insert). This diff must never touch them: an update from a stale
    // client rewrote notes and STRIPPED the marker, after which the sync
    // could not find its own rows to replace and duplicated the whole set
    // on every run - 184 duplicate rows before this guard existed. The
    // v3 loader maps reason from notes, so the marker shows up there.
    const isTeamnet = a => a?.source === 'teamnet' || String(a?.reason || '').startsWith('[teamnet]');
    const oldByKey = {};
    for (const a of oldAbs) { if (!isTeamnet(a)) oldByKey[keyOf(a)] = a; }
    const newByKey = {};
    for (const a of newAbs) { if (!isTeamnet(a)) newByKey[keyOf(a)] = a; }

    // Insertions and updates
    for (const k of Object.keys(newByKey)) {
      const newA = newByKey[k];
      const oldA = oldByKey[k];
      if (!oldA) {
        // Insert
        ops.push(supabase.from('absences').insert({
          clinician_id: newA.clinicianId,
          start_date: newA.startDate,
          end_date: newA.endDate,
          reason: 'other',
          notes: newA.reason || null,
          source: newA.source || null,
          session: newA.session || null,
        }));
      } else {
        // Fields a stale client cannot legitimately clear are only compared
        // and written when the incoming row actually carries them: the
        // loader omits source and session when null, so their absence means
        // "my copy predates this", not "clear it". That distinction is what
        // kept wiping wind-down provenance and half-day flags.
        const hasSession = Object.prototype.hasOwnProperty.call(newA, 'session');
        const changed = oldA.endDate !== newA.endDate
          || (oldA.reason || '') !== (newA.reason || '')
          || (hasSession && (oldA.session || null) !== (newA.session || null))
          || (newA.source && (oldA.source || null) !== newA.source);
        if (changed) {
          const patch = { end_date: newA.endDate, notes: newA.reason || null };
          if (hasSession) patch.session = newA.session || null;
          if (newA.source) patch.source = newA.source;
          ops.push(
            supabase.from('absences')
              .update(patch)
              .eq('clinician_id', newA.clinicianId)
              .eq('start_date', newA.startDate)
          );
        }
      }
    }
    // Deletions (teamnet rows are excluded above, so the sync's own rows
    // can never be mass-deleted or resurrected from a stale client copy)
    for (const k of Object.keys(oldByKey)) {
      if (!newByKey[k]) {
        const a = oldByKey[k];
        ops.push(
          supabase.from('absences')
            .delete()
            .eq('clinician_id', a.clinicianId)
            .eq('start_date', a.startDate)
        );
      }
    }
  }

  // Run all ops in parallel
  if (ops.length > 0) {
    const results = await Promise.all(ops.map(p => p.then ? p : Promise.resolve(p)));
    for (const r of results) {
      if (r?.error) {
        // Surface in server logs with full Postgres detail so it shows
        // up in Vercel's runtime logs. The client only sees `.message`,
        // which is sometimes terse — having `code` + `details` + `hint`
        // in the server log saves a debug round-trip.
        console.error('[/api/v4/data POST] op error:', {
          code: r.error.code,
          message: r.error.message,
          details: r.error.details,
          hint: r.error.hint,
        });
        const friendly = r.error.message
          + (r.error.details ? ` (${r.error.details})` : '')
          + (r.error.hint ? ` — ${r.error.hint}` : '');
        errors.push(friendly);
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors, op_count: ops.length }, { status: 207 });
  }
  return NextResponse.json({ ok: true, op_count: ops.length });
}


// Fast path: handles "delta" saves (no diff needed). Used when the
// incoming body only contains: dailyOverrides, allocationHistory,
// rotaNotes, lastSyncTime, savedSlotFilters, expectedCapacity.
//
// We don't need to read the full practice data to compute these —
// they're either upserts (allocations, notes) or whole-blob writes
// (overrides into extras JSONB).
async function handleFastPath(supabase, practiceId, user, newData) {
  const ops = [];
  const errors = [];

  // ─── allocationHistory → buddy_allocations ─────────────────────────
  if (newData.allocationHistory) {
    for (const date of Object.keys(newData.allocationHistory)) {
      const entry = newData.allocationHistory[date];
      if (!entry) continue;
      ops.push(supabase.from('buddy_allocations').upsert({
        practice_id: practiceId,
        date,
        allocations: entry,
      }));
    }
  }

  // ─── rotaNotes → rota_notes table ─────────────────────────────────
  if (newData.rotaNotes) {
    for (const cid of Object.keys(newData.rotaNotes)) {
      const dates = newData.rotaNotes[cid] || {};
      for (const date of Object.keys(dates)) {
        const note = (dates[date] || '').trim();
        if (note === '') {
          ops.push(supabase.from('rota_notes').delete().eq('clinician_id', cid).eq('date', date));
        } else {
          ops.push(supabase.from('rota_notes').upsert({ clinician_id: cid, date, note }));
        }
      }
    }
  }

  // ─── dailyOverrides → daily_overrides table ───────────────────────
  // Deliberately OUTSIDE the extras branch below: overrides no longer live
  // in extras, so gating them on an extras read would silently drop every
  // In/Out toggle — the exact failure this release is fixing elsewhere.
  if (newData.dailyOverrides !== undefined) {
    const { data: clinRows } = await supabase.from('clinicians').select('id').eq('practice_id', practiceId);
    const clinIds = (clinRows || []).map(c => c.id);
    const { data: curRows } = clinIds.length
      ? await supabase.from('daily_overrides').select('clinician_id, date, am, pm').in('clinician_id', clinIds)
      : { data: [] };
    ops.push(syncDailyOverrides(
      supabase,
      clinIds,
      dailyOverridesFromRows(curRows || []),
      newData.dailyOverrides,
    ));
  }

  // ─── lastSyncTime + filters → practice_settings.extras ────────────
  // For these we need to read current extras (so we don't clobber sibling
  // keys), but only the extras column — much lighter than loadPracticeData.
  const needsExtrasRead = newData.dailyOverrides !== undefined ||
                          newData.staffPlan !== undefined ||
                          newData.lastSyncTime !== undefined ||
                          newData.savedSlotFilters !== undefined ||
                          newData.expectedCapacity !== undefined;
  if (needsExtrasRead) {
    const { data: settingsRow } = await supabase.from('practice_settings')
      .select('extras')
      .eq('practice_id', practiceId)
      .maybeSingle();
    const oldExtras = settingsRow?.extras || {};
    let changed = false;
    const newExtras = { ...oldExtras };
    if (newData.dailyOverrides !== undefined) { newExtras.dailyOverrides = newData.dailyOverrides; changed = true; }
    if (newData.staffPlan !== undefined) { newExtras.staffPlan = newData.staffPlan; changed = true; }
    if (newData.lastSyncTime !== undefined) { newExtras.lastTeamnetSync = newData.lastSyncTime; changed = true; }
    if (newData.savedSlotFilters !== undefined) { newExtras.savedSlotFilters = newData.savedSlotFilters; changed = true; }
    if (newData.expectedCapacity !== undefined) { newExtras.expectedCapacity = newData.expectedCapacity; changed = true; }
    if (changed) {
      ops.push(supabase.from('practice_settings').update({ extras: newExtras }).eq('practice_id', practiceId));
    }
  }

  if (ops.length > 0) {
    const results = await Promise.all(ops.map(p => p.then ? p : Promise.resolve(p)));
    for (const r of results) if (r?.error) errors.push(r.error.message);
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors, op_count: ops.length }, { status: 207 });
  }
  return NextResponse.json({ ok: true, op_count: ops.length, fastPath: true });
}
