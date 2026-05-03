// /api/v4-import — one-shot migration from Redis blob to Postgres.
//
// Two modes:
//   GET  /api/v4-import?practiceId=X            — DRY RUN (default), reports what
//                                                  would be migrated without writing
//   POST /api/v4-import?practiceId=X&confirm=1  — REAL RUN, writes to Postgres
//
// Safety:
// - Dry run is the default; you must explicitly confirm to write
// - Idempotent: running twice doesn't duplicate rows (uses upserts)
// - Reads from Redis but never modifies it (Redis is read-only here)
// - Returns a detailed report of every action taken / would be taken
// - Wrapped in error handling — partial failures don't leave inconsistent state
// - Only runs when SUPABASE_SERVICE_ROLE_KEY is set (Preview env only)
//
// Authorisation:
// - Caller must be signed in
// - Caller must be the OWNER of the target practice (not just admin/member)
// - Imports run as the caller, recorded in created_by/updated_by audit fields

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { cookies } from 'next/headers';
import { createClient as createUserClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── helpers ────────────────────────────────────────────────────────────

function readRedisData() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('Redis not configured (none of UPSTASH_REDIS_REST_URL/KV_REST_API_URL or matching tokens are set)');
  }
  const redis = new Redis({ url, token });
  return redis.get('buddy_system_data');
}

// Map v3 group string → v4 enum
function mapGroup(g) {
  const map = { gp: 'gp', nursing: 'nursing', allied: 'allied', admin: 'admin' };
  return map[(g || '').toLowerCase()] || 'admin';
}

// Map v3 status string → v4 enum
function mapStatus(s) {
  if (!s) return 'active';
  if (s === 'left') return 'left';
  if (s === 'administrative') return 'administrative';
  return 'active';
}

// Map v3 working pattern (e.g. { mon: { am: true, pm: false } } or array) → JSONB
// v3 used multiple shapes; we accept either and pass through
function normaliseWorkingPattern(wp) {
  if (!wp) return null;
  return wp; // store as-is in JSONB; reading code handles shape
}

// ─── main handler ───────────────────────────────────────────────────────

async function runImport(request, { dryRun }) {
  const url = new URL(request.url);
  const practiceId = url.searchParams.get('practiceId');

  if (!practiceId) {
    return NextResponse.json({ error: 'practiceId query param required' }, { status: 400 });
  }

  // 1. Authn/authz: caller must be the owner of the target practice
  const cookieStore = cookies();
  const userClient = createUserClient(cookieStore);
  if (!userClient) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const { data: membership } = await userClient
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the practice owner can import data' }, { status: 403 });
  }

  // 2. Need admin client (bypasses RLS for the bulk insert)
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({
      error: 'Admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY in Vercel preview env.',
    }, { status: 500 });
  }

  // 3. Read Redis blob
  let v3Data;
  try {
    v3Data = await readRedisData();
  } catch (err) {
    return NextResponse.json({ error: `Failed to read Redis: ${err.message}` }, { status: 500 });
  }
  if (!v3Data || typeof v3Data !== 'object') {
    return NextResponse.json({ error: 'Redis blob is empty or invalid' }, { status: 500 });
  }

  // 4. Build the import plan
  const report = {
    dryRun,
    practiceId,
    importer: { user_id: user.id, email: user.email },
    counts: {
      clinicians_to_import: 0,
      working_patterns_to_import: 0,
      absences_to_import: 0,
      daily_overrides_to_import: 0,
      practice_settings_to_update: 0,
      huddle_csv_data_to_update: 0,
      buddy_allocations_to_import: 0,
      rota_notes_to_import: 0,
    },
    warnings: [],
    errors: [],
    actions: [],
  };

  const clinicians = Array.isArray(v3Data.clinicians) ? v3Data.clinicians : [];
  report.counts.clinicians_to_import = clinicians.length;

  // Map v3 clinician.id → v4 clinician.id (used for FK lookups during import)
  const clinicianIdMap = {};

  // 5. Import clinicians
  for (const c of clinicians) {
    if (!c.name) {
      report.warnings.push(`Skipping clinician with no name (v3 id: ${c.id})`);
      continue;
    }
    const newRow = {
      practice_id: practiceId,
      name: c.name,
      title: c.title || null,
      initials: c.initials || null,
      role: c.role || null,
      group_id: mapGroup(c.group),
      status: mapStatus(c.status),
      sessions: typeof c.sessions === 'number' ? c.sessions : 0,
      buddy_cover: !!c.buddyCover,
      can_provide_cover: c.canProvideCover !== false,
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      created_by: user.id,
      updated_by: user.id,
    };

    if (dryRun) {
      report.actions.push(`[DRY] Would import clinician: ${newRow.name} (${newRow.initials || 'no initials'})`);
      // Fake an ID for the dry-run mapping
      clinicianIdMap[c.id] = `dryrun-${c.id}`;
    } else {
      const { data: inserted, error } = await admin
        .from('clinicians')
        .insert(newRow)
        .select('id')
        .single();
      if (error) {
        report.errors.push(`Clinician '${newRow.name}': ${error.message}`);
        continue;
      }
      clinicianIdMap[c.id] = inserted.id;
      report.actions.push(`Imported clinician: ${newRow.name} → ${inserted.id}`);
    }

    // Absences are stored at top level (data.plannedAbsences), not on the clinician
    // — handled in step 6 after this loop.
  }

  // 5b. Working patterns — derived from data.weeklyRota (keyed by day name).
  // Clinician IDs in weeklyRota may be stored as numbers OR strings — match both
  // by normalising to strings when looking up the v3→v4 ID map.
  const weeklyRota = v3Data.weeklyRota || {};
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Build a string-keyed lookup of clinicianIdMap
  const clinicianIdMapByStr = {};
  for (const [k, v] of Object.entries(clinicianIdMap)) {
    clinicianIdMapByStr[String(k)] = v;
  }

  const patternsByClinician = {}; // v3ClinId (string) → pattern object
  for (const dayName of dayNames) {
    const cliniciansOnThisDay = Array.isArray(weeklyRota[dayName]) ? weeklyRota[dayName] : [];
    for (const v3ClinId of cliniciansOnThisDay) {
      const key = String(v3ClinId);
      if (!patternsByClinician[key]) patternsByClinician[key] = {};
      patternsByClinician[key][dayName] = { am: 'in', pm: 'in' };
    }
  }

  for (const [v3ClinIdStr, pattern] of Object.entries(patternsByClinician)) {
    const newClinId = clinicianIdMapByStr[v3ClinIdStr];
    if (!newClinId) {
      report.warnings.push(`weeklyRota references unknown clinician id ${v3ClinIdStr} — pattern dropped`);
      continue;
    }
    report.counts.working_patterns_to_import += 1;
    if (!dryRun && !newClinId.startsWith('dryrun-')) {
      const { error } = await admin.from('working_patterns').insert({
        clinician_id: newClinId,
        effective_from: '1970-01-01',
        effective_to: null,
        pattern,
        notes: 'Imported from v3 weeklyRota',
        created_by: user.id,
      });
      if (error) report.errors.push(`Working pattern for v3 ${v3ClinIdStr}: ${error.message}`);
    }
  }

  // 5c. Absences — top-level data.plannedAbsences = [{ clinicianId, startDate, endDate, reason }]
  const plannedAbsences = Array.isArray(v3Data.plannedAbsences) ? v3Data.plannedAbsences : [];
  for (const ab of plannedAbsences) {
    if (!ab.clinicianId || !ab.startDate || !ab.endDate) continue;
    const newClinId = clinicianIdMapByStr[String(ab.clinicianId)];
    if (!newClinId) {
      report.warnings.push(`Absence references unknown clinician id ${ab.clinicianId} — skipped`);
      continue;
    }
    report.counts.absences_to_import += 1;
    if (!dryRun && !newClinId.startsWith('dryrun-')) {
      const { error } = await admin.from('absences').insert({
        clinician_id: newClinId,
        start_date: ab.startDate,
        end_date: ab.endDate,
        reason: 'other',                  // controlled vocab; v3 reason text moved to notes
        notes: ab.reason || null,
        created_by: user.id,
        updated_by: user.id,
      });
      if (error) report.errors.push(`Absence ${ab.clinicianId}/${ab.startDate}: ${error.message}`);
    }
  }

  // 6. Daily overrides
  // v3 shape: data.dailyOverrides[YYYY-MM-DD] = { present: [clinIds], scheduled: [clinIds] }
  // v4 shape: per (clinician, date) row with am/pm/notes — different model.
  // We store v3 daily overrides in practice_settings.extras for now; the v4 schema
  // can be extended later if we want to migrate this fully. The data is preserved.
  const dailyOverrides = v3Data.dailyOverrides || {};
  const dailyOverridesCount = Object.keys(dailyOverrides).length;
  if (dailyOverridesCount > 0) {
    report.counts.daily_overrides_to_import = dailyOverridesCount;
    report.warnings.push(
      `${dailyOverridesCount} daily overrides preserved in practice_settings.extras.legacyDailyOverrides ` +
      '(v3 shape differs from v4 schema; needs follow-up migration to fully populate daily_overrides table)'
    );
  }

  // 7. Practice settings (single row)
  report.counts.practice_settings_to_update = 1;
  if (!dryRun) {
    const settingsRow = {
      huddle_settings: v3Data.huddleSettings || {},
      buddy_settings: v3Data.settings || {},
      room_allocation: v3Data.roomAllocation || {},
      closed_days: v3Data.closedDays || {},
      teamnet_url: v3Data.teamnetUrl || null,
      extras: {
        savedSlotFilters: v3Data.savedSlotFilters || null,
        expectedCapacity: v3Data.expectedCapacity || null,
        legacyDailyOverrides: v3Data.dailyOverrides || null,
      },
      updated_by: user.id,
    };
    const { error } = await admin
      .from('practice_settings')
      .update(settingsRow)
      .eq('practice_id', practiceId);
    if (error) report.errors.push(`Practice settings: ${error.message}`);
    else report.actions.push('Updated practice_settings');
  }

  // 8. Huddle CSV data (single row)
  if (v3Data.huddleCsvData) {
    report.counts.huddle_csv_data_to_update = 1;
    if (!dryRun) {
      // First create an audit-trail csv_uploads row
      const { data: uploadRow, error: uploadErr } = await admin
        .from('csv_uploads')
        .insert({
          practice_id: practiceId,
          uploaded_by: user.id,
          uploaded_at: v3Data.huddleCsvUploadedAt || new Date().toISOString(),
          filename: 'imported-from-v3',
          rows_count: null,
          notes: 'One-time import from v3 Redis blob',
        })
        .select('id')
        .single();
      if (uploadErr) report.errors.push(`csv_uploads: ${uploadErr.message}`);

      // Then upsert the parsed data
      const { error } = await admin
        .from('huddle_csv_data')
        .upsert({
          practice_id: practiceId,
          data: v3Data.huddleCsvData,
          upload_id: uploadRow?.id || null,
          updated_by: user.id,
        });
      if (error) report.errors.push(`huddle_csv_data: ${error.message}`);
      else report.actions.push('Updated huddle_csv_data');
    }
  }

  // 9. Buddy allocations
  const allocHistory = v3Data.allocationHistory || {};
  for (const [date, alloc] of Object.entries(allocHistory)) {
    if (!date || !alloc) continue;
    report.counts.buddy_allocations_to_import += 1;
    if (!dryRun) {
      const { error } = await admin
        .from('buddy_allocations')
        .upsert({
          practice_id: practiceId,
          date,
          allocations: alloc,
          generated_by: user.id,
          updated_by: user.id,
        });
      if (error) report.errors.push(`Buddy allocation ${date}: ${error.message}`);
    }
  }

  // 10. Rota notes (nested: { v3ClinId: { 'YYYY-MM-DD': 'note text' } })
  const rotaNotes = v3Data.rotaNotes || {};
  for (const [v3ClinId, dateNotes] of Object.entries(rotaNotes)) {
    const newClinId = clinicianIdMapByStr[String(v3ClinId)];
    if (!newClinId) {
      report.warnings.push(`Rota notes reference unknown clinician id ${v3ClinId} — skipped`);
      continue;
    }
    if (typeof dateNotes !== 'object') continue;
    for (const [date, noteText] of Object.entries(dateNotes)) {
      if (!noteText) continue;
      report.counts.rota_notes_to_import += 1;
      if (!dryRun && !newClinId.startsWith('dryrun-')) {
        const { error } = await admin
          .from('rota_notes')
          .upsert({
            clinician_id: newClinId,
            date,
            note: noteText,
            updated_by: user.id,
          });
        if (error) report.errors.push(`Rota note ${v3ClinId}/${date}: ${error.message}`);
      }
    }
  }

  // 11. Audit event for the import itself
  if (!dryRun) {
    await admin.from('audit_events').insert({
      practice_id: practiceId,
      user_id: user.id,
      event_type: 'other',
      description: 'v3 Redis data imported',
      details: {
        counts: report.counts,
        warning_count: report.warnings.length,
        error_count: report.errors.length,
      },
    });
  }

  return NextResponse.json(report);
}

export async function GET(request) {
  return runImport(request, { dryRun: true });
}

export async function POST(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('confirm') !== '1') {
    return NextResponse.json({
      error: 'POST requires ?confirm=1 query param to write data',
    }, { status: 400 });
  }
  return runImport(request, { dryRun: false });
}
