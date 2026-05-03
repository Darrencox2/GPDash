// /api/v4/sync-teamnet — Supabase-authed TeamNet calendar sync.
// Uses the shared parser in lib/teamnet.js (no server-to-server fetch).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { parseTeamnetCalendar } from '@/lib/teamnet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

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
      description: `TeamNet sync — ${absences.length} absences`,
      details: { absence_count: absences.length },
    });
  } catch {
    // Don't fail the sync if audit log fails
  }

  return NextResponse.json({ absences });
}
