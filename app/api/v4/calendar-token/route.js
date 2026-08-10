// /api/v4/calendar-token?practice=<id>&clinician=<id>
//
// Returns the calendar feed URL for a clinician. Allowed for the
// clinician themselves (linked_user_id) or an owner/admin of the
// practice - admins hand feed links to staff who have no login.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireUuid } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    // requireUuid returns an ERROR RESPONSE on bad input and null when
    // valid - assigning its return as the id meant a valid request
    // always looked parameterless and 400ed. Caught live: the endpoint
    // had never succeeded for anyone.
    const practiceId = url.searchParams.get('practice');
    const clinicianId = url.searchParams.get('clinician');
    const bad = requireUuid(practiceId, 'practice') || requireUuid(clinicianId, 'clinician');
    if (bad) return bad;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // RLS scopes this to practices the user belongs to.
    const { data: clinician, error } = await supabase
      .from('clinicians')
      .select('id, linked_user_id, calendar_token, practice_id')
      .eq('id', clinicianId)
      .eq('practice_id', practiceId)
      .maybeSingle();
    if (error || !clinician) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isSelf = clinician.linked_user_id === user.id;
    let isAdmin = false;
    if (!isSelf) {
      const { data: membership } = await supabase
        .from('practice_users')
        .select('role')
        .eq('practice_id', practiceId)
        .eq('user_id', user.id)
        .maybeSingle();
      isAdmin = ['owner', 'admin'].includes(membership?.role);
    }
    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const origin = url.origin;
    const httpsUrl = `${origin}/api/v4/calendar/${clinician.calendar_token}`;
    return NextResponse.json({
      url: httpsUrl,
      webcal: httpsUrl.replace(/^https?:/, 'webcal:'),
    });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
