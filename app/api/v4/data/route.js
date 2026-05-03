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
import { loadPracticeData, loadBuddyAllocations, adaptToV3Shape } from '@/lib/v4-data';

export const dynamic = 'force-dynamic';

// ─── GET: read everything ──────────────────────────────────────────────
export async function GET(request) {
  const url = new URL(request.url);
  const practiceId = url.searchParams.get('practice');
  if (!practiceId) {
    return NextResponse.json({ error: 'practice query param required' }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const v4Data = await loadPracticeData(supabase, practiceId);
  if (!v4Data?.practice) return NextResponse.json({ error: 'Practice not found or access denied' }, { status: 404 });

  // Adapt to v3 shape — covers clinicians, weeklyRota, plannedAbsences,
  // huddleSettings, settings, roomAllocation, closedDays, huddleCsvData, etc.
  const v3Shape = adaptToV3Shape(v4Data);

  // Load buddy allocations (v3's data.allocationHistory) — covers last 12 months
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const allocations = await loadBuddyAllocations(supabase, practiceId, cutoffStr, null);
  const allocationHistory = {};
  for (const a of allocations) {
    allocationHistory[a.date] = a.allocations;
  }
  v3Shape.allocationHistory = allocationHistory;

  // Load all rota notes for clinicians of this practice
  const clinicianIds = (v4Data.clinicians || []).map(c => c.id);
  let rotaNotesMap = {};
  if (clinicianIds.length > 0) {
    const { data: notes } = await supabase
      .from('rota_notes')
      .select('clinician_id, date, note')
      .in('clinician_id', clinicianIds);
    for (const n of (notes || [])) {
      if (!rotaNotesMap[n.clinician_id]) rotaNotesMap[n.clinician_id] = {};
      rotaNotesMap[n.clinician_id][n.date] = n.note;
    }
  }
  v3Shape.rotaNotes = rotaNotesMap;

  // Add a v4 marker so the client knows it's running in v4 mode
  v3Shape._v4 = { practiceId, practiceName: v4Data.practice.name, userId: user.id };

  return NextResponse.json(v3Shape);
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
  if (!practiceId) {
    return NextResponse.json({ error: 'practice query param required' }, { status: 400 });
  }

  const cookieStore = cookies();
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
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return NextResponse.json({ error: 'Write access requires admin or owner role' }, { status: 403 });
  }

  const newData = await request.json();
  if (!newData) return NextResponse.json({ error: 'Body required' }, { status: 400 });

  // Load current state from DB to diff against
  const v4Data = await loadPracticeData(supabase, practiceId);
  const oldData = adaptToV3Shape(v4Data);

  const errors = [];
  const ops = [];

  // ─── Mutation 1: weeklyRota → working_patterns ───────────────────────
  if (newData.weeklyRota) {
    const oldRota = oldData.weeklyRota || {};
    const newRota = newData.weeklyRota;
    // Build per-clinician new pattern
    const newPatternsByClinician = {};
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const day of dayNames) {
      for (const cid of (newRota[day] || [])) {
        if (!newPatternsByClinician[cid]) newPatternsByClinician[cid] = {};
        newPatternsByClinician[cid][day] = { am: 'in', pm: 'in' };
      }
    }
    // For each clinician with an existing pattern OR a new one, upsert
    const allClinicians = new Set([
      ...(v4Data.workingPatterns || []).map(wp => wp.clinician_id),
      ...Object.keys(newPatternsByClinician),
    ]);
    for (const cid of allClinicians) {
      const newPattern = newPatternsByClinician[cid] || {};
      const existing = (v4Data.workingPatterns || []).find(wp => wp.clinician_id === cid);
      if (existing) {
        // Compare patterns; if changed, update
        if (JSON.stringify(existing.pattern) !== JSON.stringify(newPattern)) {
          ops.push(supabase.from('working_patterns').update({ pattern: newPattern }).eq('id', existing.id));
        }
      } else if (Object.keys(newPattern).length > 0) {
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
    const csvChanged = JSON.stringify(newData.huddleCsvData) !== JSON.stringify(oldData.huddleCsvData);
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
            data: newData.huddleCsvData,
            upload_id: upload?.id || null,
          });
        })
      );
    }
  }

  // ─── Mutation 6: clinicians → clinicians table ───────────────────────
  // CSV upload sometimes adds new clinicians (source='csv'). Also field
  // edits (toggleBuddyCover, status changes, etc.) come through here.
  if (Array.isArray(newData.clinicians)) {
    const oldClins = oldData.clinicians || [];
    const newClins = newData.clinicians;
    const oldById = {};
    for (const c of oldClins) oldById[c.id] = c;

    for (const c of newClins) {
      const old = oldById[c.id];
      if (!old) {
        // New clinician (probably from CSV)
        // Skip auto-generated string IDs that look like 'csv-' or numeric — these
        // are v3-style IDs. We need a real UUID. For now, generate one and
        // store the v3 id as an alias. (Better: refactor v3 components to use
        // server-generated IDs.) For tonight, only persist clinicians that
        // already have a UUID-shaped id.
        if (typeof c.id === 'string' && c.id.length === 36 && c.id.includes('-')) {
          ops.push(supabase.from('clinicians').insert({
            id: c.id,
            practice_id: practiceId,
            name: c.name,
            title: c.title || null,
            initials: c.initials || null,
            role: c.role || null,
            group_id: c.group || 'admin',
            status: c.status || 'active',
            sessions: c.sessions || 0,
            buddy_cover: !!c.buddyCover,
            can_provide_cover: c.canProvideCover !== false,
            aliases: c.aliases || [],
          }));
        } else {
          // Skip — v3 client generated a non-UUID id; component needs updating
          errors.push(`Skipped new clinician '${c.name}' — non-UUID id (${c.id}). Add via Team Members instead.`);
        }
        continue;
      }
      // Existing clinician — diff fields and update if any changed
      const fieldsChanged = (
        c.name !== old.name ||
        c.title !== old.title ||
        c.initials !== old.initials ||
        c.role !== old.role ||
        c.group !== old.group ||
        c.status !== old.status ||
        (c.sessions || 0) !== (old.sessions || 0) ||
        !!c.buddyCover !== !!old.buddyCover ||
        (c.canProvideCover !== false) !== (old.canProvideCover !== false) ||
        JSON.stringify(c.aliases || []) !== JSON.stringify(old.aliases || [])
      );
      if (fieldsChanged) {
        ops.push(supabase.from('clinicians').update({
          name: c.name,
          title: c.title || null,
          initials: c.initials || null,
          role: c.role || null,
          group_id: c.group || 'admin',
          status: c.status || 'active',
          sessions: c.sessions || 0,
          buddy_cover: !!c.buddyCover,
          can_provide_cover: c.canProvideCover !== false,
          aliases: c.aliases || [],
        }).eq('id', c.id));
      }
    }

    // Detect deletions
    const newIds = new Set(newClins.map(c => c.id));
    for (const old of oldClins) {
      if (!newIds.has(old.id)) {
        ops.push(supabase.from('clinicians').delete().eq('id', old.id));
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
    const oldByKey = {};
    for (const a of oldAbs) oldByKey[keyOf(a)] = a;
    const newByKey = {};
    for (const a of newAbs) newByKey[keyOf(a)] = a;

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
        }));
      } else if (oldA.endDate !== newA.endDate || (oldA.reason || '') !== (newA.reason || '')) {
        // Match by clinician+startDate; update via the matching v4 row
        // Need to fetch existing absence row id
        ops.push(
          supabase.from('absences')
            .update({ end_date: newA.endDate, notes: newA.reason || null })
            .eq('clinician_id', newA.clinicianId)
            .eq('start_date', newA.startDate)
        );
      }
    }
    // Deletions
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
      if (r?.error) errors.push(r.error.message);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors, op_count: ops.length }, { status: 207 });
  }
  return NextResponse.json({ ok: true, op_count: ops.length });
}
