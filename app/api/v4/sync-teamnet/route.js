// /api/v4/sync-teamnet — Supabase-authed TeamNet calendar sync.
//
// Two modes (chosen by request body shape):
//
//  1. PARSE-ONLY (legacy): caller passes { url, clinicians } in body. We fetch
//     the calendar, parse, return { absences: [...] }. The caller persists.
//     This is what DashboardClient uses on cold-load (it has the in-memory
//     blob and writes via /api/v4/data).
//
//  2. FULL-SYNC (new): caller passes empty body. We fetch teamnet_url +
//     clinicians from the DB, fetch + parse the calendar, replace teamnet
//     absences in the absences table, update last sync time, return
//     { imported, removed }. This is what the standalone TeamNet editor on
//     the Practice page uses.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { parseTeamnetCalendar } from '@/lib/teamnet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Maps TeamNet free-text reason → absence_reason enum. Anything we don't
// recognise becomes 'other' with the original text preserved in notes.
// Order matters — check specific reasons before generic 'leave'.
function mapReasonToEnum(raw) {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('maternit') || lower.includes('paternit') || lower.includes('parental')) return 'parental_leave';
  if (lower.includes('compassion') || lower.includes('bereave')) return 'compassionate';
  if (lower.includes('study')) return 'study_leave';
  if (lower.includes('train') || lower.includes('course')) return 'training';
  if (lower.includes('sick') || lower.includes('unwell') || lower.includes('illness')) return 'unwell';
  if (lower.includes('annual') || lower.includes('holiday') || lower.includes('leave')) return 'annual_leave';
  return 'other';
}

// Marker used to tag teamnet-sourced absences so we can clear them on resync
// without disturbing manually-entered absences. Stored as a notes prefix.
const TEAMNET_MARKER = '[teamnet]';

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

  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Not a member of this practice' }, { status: 403 });

  // Try to parse body — empty body is allowed (signals full-sync mode).
  let body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fullSync = !body?.url && !body?.icsContent;

  // ─── FULL-SYNC: fetch URL + clinicians from DB, write absences ───
  if (fullSync) {
    const [{ data: settings }, { data: clinicians }] = await Promise.all([
      supabase
        .from('practice_settings')
        .select('teamnet_url, extras')
        .eq('practice_id', practiceId)
        .maybeSingle(),
      supabase
        .from('clinicians')
        .select('id, name, initials')
        .eq('practice_id', practiceId)
        .eq('status', 'active'),
    ]);

    const calUrl = settings?.teamnet_url;
    if (!calUrl) {
      return NextResponse.json({ error: 'No TeamNet URL set for this practice' }, { status: 400 });
    }

    let icsText;
    try {
      const r = await fetch(calUrl);
      if (!r.ok) {
        return NextResponse.json({ error: `Failed to fetch calendar (HTTP ${r.status})` }, { status: 502 });
      }
      icsText = await r.text();
    } catch (err) {
      return NextResponse.json({ error: `Calendar fetch error: ${err.message}` }, { status: 502 });
    }

    let absences;
    try {
      // Parser expects v3-shape clinicians (with id field). Our v4 rows match.
      absences = parseTeamnetCalendar(icsText, clinicians || []);
    } catch (err) {
      return NextResponse.json({ error: `Parse error: ${err.message}` }, { status: 500 });
    }

    // Replace existing teamnet-sourced absences. Find them by:
    //   notes LIKE '[teamnet]%' AND clinician belongs to this practice.
    // Then bulk-insert the fresh set.
    const clinicianIds = (clinicians || []).map(c => c.id);
    let removed = 0;
    if (clinicianIds.length > 0) {
      const { count } = await supabase
        .from('absences')
        .delete({ count: 'exact' })
        .in('clinician_id', clinicianIds)
        .like('notes', `${TEAMNET_MARKER}%`);
      removed = count || 0;
    }

    let imported = 0;
    if (absences.length > 0) {
      const rows = absences.map(a => ({
        clinician_id: a.clinicianId,
        start_date: a.startDate,
        end_date: a.endDate,
        reason: mapReasonToEnum(a.reason),
        notes: `${TEAMNET_MARKER} ${a.reason || ''}`.trim(),
        created_by: user.id,
        updated_by: user.id,
      }));
      const { error: insErr, count } = await supabase
        .from('absences')
        .insert(rows, { count: 'exact' });
      if (insErr) {
        return NextResponse.json({ error: `Insert error: ${insErr.message}` }, { status: 500 });
      }
      imported = count || rows.length;
    }

    // Update last sync time in extras
    const newExtras = { ...(settings?.extras || {}), lastTeamnetSync: new Date().toISOString() };
    await supabase
      .from('practice_settings')
      .update({ extras: newExtras })
      .eq('practice_id', practiceId);

    // Best-effort audit log
    try {
      await supabase.rpc('log_audit_event', {
        target_practice_id: practiceId,
        event_type: 'other',
        description: `TeamNet sync — ${imported} absences imported, ${removed} replaced`,
        details: { imported, removed },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ imported, removed });
  }

  // ─── PARSE-ONLY: legacy mode ───────────────────────────────────────
  const { url: calUrl, icsContent, clinicians } = body || {};

  let icsText;
  if (icsContent) {
    icsText = icsContent;
  } else if (calUrl) {
    try {
      const r = await fetch(calUrl);
      if (!r.ok) {
        return NextResponse.json({ error: `Failed to fetch calendar (HTTP ${r.status})` }, { status: 502 });
      }
      icsText = await r.text();
    } catch (err) {
      return NextResponse.json({ error: `Calendar fetch error: ${err.message}` }, { status: 502 });
    }
  } else {
    return NextResponse.json({ error: 'No ICS content or URL provided' }, { status: 400 });
  }

  let absences;
  try {
    absences = parseTeamnetCalendar(icsText, clinicians || []);
  } catch (err) {
    return NextResponse.json({ error: `Parse error: ${err.message}` }, { status: 500 });
  }

  try {
    await supabase.rpc('log_audit_event', {
      target_practice_id: practiceId,
      event_type: 'other',
      description: `TeamNet sync — ${absences.length} absences (parse-only)`,
      details: { absence_count: absences.length },
    });
  } catch {
    // Don't fail the sync if audit log fails
  }

  return NextResponse.json({ absences });
}
