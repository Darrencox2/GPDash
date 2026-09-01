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
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { requireUuid, serverError } from '@/lib/api-helpers';

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

// The server fetches this URL itself, so it must not be talked into
// probing its own network: cloud metadata endpoints, localhost, RFC1918
// ranges. Calendar feeds live on the public internet over http(s).
function calendarUrlProblem(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return 'That is not a valid URL.'; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'The calendar URL must start with http or https.';
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '[::1]'
    || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) {
    return 'That address is not reachable from the server.';
  }
  const ip4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip4) {
    const [a, b] = [Number(ip4[1]), Number(ip4[2])];
    if (a === 127 || a === 10 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return 'That address is not reachable from the server.';
    }
  }
  return null;
}


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

  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Not a member of this practice' }, { status: 403 });
  // Same bar as writing practice data: the sync rewrites absence rows and
  // makes the server fetch a URL, neither of which is a viewer action.
  const MANAGEMENT_ROLES = ['owner', 'partner', 'practice_manager', 'admin'];
  if (!MANAGEMENT_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Syncing requires a management role' }, { status: 403 });
  }

  // Rate limit per-practice. Legitimate use: occasional manual "Sync now"
  // clicks + the daily cron — well below 10/min. Anything past that is
  // almost certainly a script firing in a loop. Key on practice so a
  // user with two practices doesn't burn through one bucket while
  // testing the other.
  const rl = await checkRateLimit(RATE_LIMITS.practiceSync, `practice:${practiceId}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Sync requested too frequently. Please wait before retrying.' },
      {
        status: 429,
        headers: {
          ...rl.headers,
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    );
  }

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
        .neq('status', 'left'),
    ]);

    const calUrl = settings?.teamnet_url;
    if (!calUrl) {
      return NextResponse.json({ error: 'No TeamNet URL set for this practice' }, { status: 400 });
    }

    let icsText;
    try {
      const urlProblem = calendarUrlProblem(calUrl);
      if (urlProblem) return NextResponse.json({ error: urlProblem }, { status: 400 });
      const r = await fetch(calUrl);
      if (!r.ok) {
        return NextResponse.json({ error: `Failed to fetch calendar (HTTP ${r.status})` }, { status: 502 });
      }
      icsText = await r.text();
    } catch (err) {
      return serverError(
        'Could not fetch the calendar. Check the URL and try again.',
        err,
        { status: 502, context: { practiceId, mode: 'full-sync' } }
      );
    }

    let absences;
    try {
      // Parser expects v3-shape clinicians (with id field). Our v4 rows match.
      absences = parseTeamnetCalendar(icsText, clinicians || []);
    } catch (err) {
      return serverError(
        'Could not parse the calendar — the format may be unsupported.',
        err,
        { status: 500, context: { practiceId, mode: 'full-sync' } }
      );
    }

    // Replace existing teamnet-sourced absences. Find them by the notes
    // marker OR by source='teamnet' - rows written before the source column
    // existed only have the marker, and belt-and-braces the other way.
    // Then bulk-insert the fresh set, stamped with BOTH, so provenance
    // survives whichever field a future reader keys on.
    const clinicianIds = (clinicians || []).map(c => c.id);
    let removed = 0;
    if (clinicianIds.length > 0) {
      const { count } = await supabase
        .from('absences')
        .delete({ count: 'exact' })
        .in('clinician_id', clinicianIds)
        .or(`notes.like.${TEAMNET_MARKER}*,source.eq.teamnet`);
      removed = count || 0;
    }

    let imported = 0;
    let skippedExisting = 0;
    if (absences.length > 0) {
      // History left this table with unmarked copies of synced rows (the
      // marker was being stripped by a separate bug, so every sync
      // re-inserted the whole calendar - 42% of the table was duplicates).
      // Never insert a row identical to one already there, whoever owns it.
      const { data: existing } = await supabase
        .from('absences')
        .select('clinician_id, start_date, end_date, reason, session')
        .in('clinician_id', clinicianIds);
      const have = new Set((existing || []).map(r =>
        `${r.clinician_id}|${r.start_date}|${r.end_date}|${r.reason || ''}|${r.session || ''}`));

      const rows = absences
        .map(a => ({
          clinician_id: a.clinicianId,
          start_date: a.startDate,
          end_date: a.endDate,
          reason: mapReasonToEnum(a.reason),
          notes: `${TEAMNET_MARKER} ${a.reason || ''}`.trim(),
          source: 'teamnet',
          created_by: user.id,
          updated_by: user.id,
        }))
        .filter(r => {
          const k = `${r.clinician_id}|${r.start_date}|${r.end_date}|${r.reason}|`;
          if (have.has(k)) { skippedExisting += 1; return false; }
          have.add(k);          // the feed itself can repeat an event
          return true;
        });
      if (rows.length > 0) {
        const { error: insErr, count } = await supabase
          .from('absences')
          .insert(rows, { count: 'exact' });
        if (insErr) {
          return NextResponse.json({ error: `Insert error: ${insErr.message}` }, { status: 500 });
        }
        imported = count || rows.length;
      }
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

    return NextResponse.json({
      imported,
      removed,
      // Diagnostics — let the UI explain a zero result without guessing:
      // how many calendar events were in the feed, and how many clinicians
      // we tried to match against. 0 events → URL/feed problem; events but
      // 0 clinicians → no team loaded; events + clinicians but 0 imported →
      // names in the calendar are not matching the clinician list.
      skippedExisting,
      eventsParsed: (icsText.match(/BEGIN:VEVENT/g) || []).length,
      cliniciansConsidered: (clinicians || []).length,
    });
  }

  // ─── PARSE-ONLY: legacy mode ───────────────────────────────────────
  const { url: calUrl, icsContent, clinicians } = body || {};

  let icsText;
  if (icsContent) {
    icsText = icsContent;
  } else if (calUrl) {
    try {
      const urlProblem = calendarUrlProblem(calUrl);
      if (urlProblem) return NextResponse.json({ error: urlProblem }, { status: 400 });
      const r = await fetch(calUrl);
      if (!r.ok) {
        return NextResponse.json({ error: `Failed to fetch calendar (HTTP ${r.status})` }, { status: 502 });
      }
      icsText = await r.text();
    } catch (err) {
      return serverError(
        'Could not fetch the calendar. Check the URL and try again.',
        err,
        { status: 502, context: { practiceId, mode: 'parse-only' } }
      );
    }
  } else {
    return NextResponse.json({ error: 'No ICS content or URL provided' }, { status: 400 });
  }

  let absences;
  try {
    absences = parseTeamnetCalendar(icsText, clinicians || []);
  } catch (err) {
    return serverError(
      'Could not parse the calendar — the format may be unsupported.',
      err,
      { status: 500, context: { practiceId, mode: 'parse-only' } }
    );
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
