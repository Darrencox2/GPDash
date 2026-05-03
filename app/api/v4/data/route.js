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
