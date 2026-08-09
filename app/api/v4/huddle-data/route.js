// /api/v4/huddle-data?practice=<id>
//
// Serves ONLY the huddle CSV dataset for a practice. Split out of the
// dashboard page payload because the blob (the practice's entire appointment
// dataset) was being serialised into the server-rendered page, so phones
// downloaded megabytes before the dashboard could hydrate — the main cause of
// the long black screen on app launch. The dashboard now paints first and
// fetches this in parallel; the Today section fills in when it arrives.
//
// Auth: normal cookie session; RLS on huddle_csv_data scopes rows to the
// user's practices, and we additionally filter by the requested practice.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const practice = new URL(request.url).searchParams.get('practice');
    if (!practice) return NextResponse.json({ error: 'Missing practice' }, { status: 400 });

    const { data, error } = await supabase
      .from('huddle_csv_data')
      .select('data, updated_at')
      .eq('practice_id', practice)
      .maybeSingle();
    if (error) return serverError('Could not load huddle data', error);

    let row = data;
    if (!row) {
      // Resilience: the RLS-scoped read can transiently miss (observed
      // live - the client fell back to the full data GET which had the
      // CSV). Verify membership explicitly, then re-read with the
      // service client so a session/RLS hiccup cannot blank the board.
      const { data: member } = await supabase
        .from('practice_users')
        .select('user_id')
        .eq('practice_id', practice)
        .eq('user_id', user.id)
        .maybeSingle();
      if (member) {
        const admin = createAdminClient();
        const { data: adminRow } = await admin
          .from('huddle_csv_data')
          .select('data, updated_at')
          .eq('practice_id', practice)
          .maybeSingle();
        row = adminRow || null;
      }
    }

    return NextResponse.json({
      huddleCsvData: row?.data || null,
      huddleCsvUpdatedAt: row?.updated_at || null,
    });
  } catch (err) {
    return serverError('Huddle data fetch failed', err);
  }
}
