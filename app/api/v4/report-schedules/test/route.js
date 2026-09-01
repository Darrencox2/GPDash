// /api/v4/report-schedules/test
//
// "Send test to me now" from the schedule setup screen.
//
// This runs the SAME code path as the pg_cron dispatcher — same data
// load, same report engine, same renderer, same Resend call — via
// deliverSchedule(). That is the whole point: if the test email arrives
// and looks right, the Monday 08:00 send will too. A test that rendered
// from a lookalike path would prove nothing.
//
// Differences from a scheduled send, both deliberate:
//   - it goes only to the signed-in user, never to the schedule's
//     recipient list. Testing must not email the PCN manager.
//   - it does not touch next_send_at, last_status or last_error, so
//     testing cannot consume the next real run or rewrite the delivery
//     history the UI shows.
//
// The send is logged with kind='test' so the audit trail still records
// that practice data left the building, and who caused it.
//
// Accepts either an existing schedule id, or an unsaved draft — you can
// test the bundle before committing to a schedule, including the report
// order you are still fiddling with.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError, isUuid } from '@/lib/api-helpers';
import { deliverSchedule } from '@/lib/report-delivery';
import { getSiteUrl } from '@/lib/site-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!user.email) return NextResponse.json({ error: 'Your account has no email address to send a test to.' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const { scheduleId, practiceId, reportIds } = body;

    if (!isUuid(practiceId)) {
      return NextResponse.json({ error: 'A valid practiceId is required' }, { status: 400 });
    }

    // Authorisation is checked against the user's OWN session, under RLS,
    // before we touch the admin client. is_practice_admin mirrors who is
    // allowed to write schedules in the first place.
    const { data: allowed, error: guardErr } = await supabase
      .rpc('is_practice_admin', { target_practice_id: practiceId });
    if (guardErr) return serverError('Could not check your permissions', guardErr);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Only a practice administrator can send report emails.' },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Email sending is not configured for this deployment.' }, { status: 500 });
    }

    // Either an existing schedule, or a draft assembled from the request.
    let schedule;
    if (isUuid(scheduleId)) {
      const { data: row, error } = await admin
        .from('report_schedules').select('*').eq('id', scheduleId).maybeSingle();
      if (error) return serverError('Could not load the schedule', error);
      if (!row) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      // Do not trust the client's practiceId over the row's own.
      if (row.practice_id !== practiceId) {
        return NextResponse.json({ error: 'Schedule does not belong to that practice' }, { status: 403 });
      }
      schedule = row;
    } else {
      const ids = Array.isArray(reportIds) ? reportIds.filter(isUuid) : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Choose at least one saved report before testing it' }, { status: 400 });
      }
      // Confirm every report really is this practice's before rendering
      // it — the ids come from the browser.
      const { data: reps } = await admin
        .from('saved_reports').select('id').eq('practice_id', practiceId).in('id', ids);
      const owned = new Set((reps || []).map(r => r.id));
      if (ids.some(id => !owned.has(id))) {
        return NextResponse.json({ error: 'One of those reports does not belong to this practice' }, { status: 403 });
      }
      schedule = {
        id: null,
        practice_id: practiceId,
        _reportIds: ids,
        cadence: body.cadence || 'weekly',
        day_of_week: body.day_of_week ?? 1,
        day_of_month: body.day_of_month ?? null,
        week_of_month: body.week_of_month ?? null,
        anchor_date: body.anchor_date ?? null,
        send_hour: body.send_hour ?? 8,
        send_minute: body.send_minute ?? 0,
        recipients: [],
        layout: body.layout || {},
        subject: body.subject || '',
        intro: body.intro || '',
      };
    }

    schedule._triggeredBy = user.id;

    const outcome = await deliverSchedule(admin, schedule, {
      kind: 'test',
      overrideTo: user.email,
      siteUrl: getSiteUrl(),
    });

    if (outcome.status !== 'sent') {
      return NextResponse.json(
        { ok: false, status: outcome.status, error: outcome.error || 'The test email could not be sent.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, sentTo: user.email });
  } catch (err) {
    return serverError('Could not send the test email', err);
  }
}
