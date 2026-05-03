// /api/v4/sync-teamnet — Supabase-authed wrapper around the existing
// TeamNet calendar sync logic. Keeps the same behaviour (parse ICS,
// match against clinicians, return absences) but auth is via Supabase.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

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

  // Verify membership
  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Not a member of this practice' }, { status: 403 });

  // Internally call the existing TeamNet sync logic.
  // Easiest: forward the request body to the existing /api/sync-teamnet
  // with the v3 password header. Server-to-server fetch on the same origin.
  // (This avoids duplicating the ICS-parsing logic.)
  try {
    const body = await request.json();
    const internalUrl = new URL('/api/sync-teamnet', request.url);
    const res = await fetch(internalUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-password': process.env.APP_PASSWORD || '',
      },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) return NextResponse.json(result, { status: res.status });

    // Audit log
    await supabase.rpc('log_audit_event', {
      target_practice_id: practiceId,
      event_type: 'other',
      description: `TeamNet sync — ${result.absences?.length || 0} absences`,
      details: { absence_count: result.absences?.length || 0 },
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Sync failed: ${err.message}` }, { status: 500 });
  }
}
