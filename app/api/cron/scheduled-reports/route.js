// /api/cron/scheduled-reports
//
// Sends every report schedule that has come due. Woken by pg_cron every
// 15 minutes via net.http_post (see the migration
// 20260901120100_report_schedule_cron.sql for why the clock lives in
// Postgres and not in vercel.json).
//
// Two ways in, mirroring /api/cron/retention-cleanup:
//
//   1. The dispatcher, with `Authorization: Bearer ${CRON_SECRET}`. The
//      secret is held in Supabase Vault as gpdash_cron_secret and must
//      match CRON_SECRET in the Vercel environment.
//
//   2. A platform admin with a normal session, for ad-hoc runs and for
//      proving the pipeline works before trusting it.
//
// Body / query parameters:
//   - dry_run=true   List what WOULD be sent, send nothing. Safe anytime.
//   - limit=N        Cap sends this run (default 25, ceiling 100).
//
// Response:
//   { ok, dry_run, duration_ms, due, processed, results: [...] }
//
// FAILURE MODEL: one schedule's failure never aborts the run, and a
// failed send still advances next_send_at. A practice with a bad
// recipient address must not be retried every 15 minutes forever, and
// must not sit at the head of the queue blocking everyone behind it.
// The reason is recorded in report_send_log and on the schedule itself,
// which is what the Reporting UI shows.

import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError } from '@/lib/api-helpers';
import { deliverSchedule } from '@/lib/report-delivery';
import { getSiteUrl } from '@/lib/site-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorise() {
  const h = await headers();
  const auth = h.get('authorization') || h.get('Authorization');
  const expected = process.env.CRON_SECRET;
  if (auth && expected) {
    const provided = auth.replace(/^Bearer\s+/i, '').trim();
    if (provided && constantTimeEquals(provided, expected)) {
      return { ok: true, source: 'cron', actor: null };
    }
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return { error: 'Supabase not configured', status: 500 };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    return { error: 'Forbidden: platform admin only', status: 403 };
  }
  return { ok: true, source: 'manual', actor: user };
}

async function handle(request) {
  const startedAt = Date.now();
  try {
    const authResult = await authorise();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const dryRun = body.dry_run === true || url.searchParams.get('dry_run') === 'true';
    const requested = Number(body.limit ?? url.searchParams.get('limit') ?? NaN);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_LIMIT));

    const admin = createAdminClient();
    // Without the service-role key every send below would fail into its
    // own catch and the run would report ok:true with zero sends — which
    // looks exactly like a healthy quiet run. Fail loudly instead.
    if (!admin) {
      return NextResponse.json(
        { error: 'Service role key not configured; cannot send scheduled reports.' },
        { status: 500 },
      );
    }

    const now = new Date();
    const { data: due, error } = await admin
      .from('report_schedules')
      .select('*')
      .eq('active', true)
      .not('next_send_at', 'is', null)
      .lte('next_send_at', now.toISOString())
      .order('next_send_at', { ascending: true })
      .limit(limit);

    if (error) return serverError('Could not read report schedules', error);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        duration_ms: Date.now() - startedAt,
        due: due?.length || 0,
        processed: 0,
        results: (due || []).map(s => ({
          id: s.id,
          practice_id: s.practice_id,
          saved_report_id: s.saved_report_id,
          next_send_at: s.next_send_at,
          recipients: Array.isArray(s.recipients) ? s.recipients.length : 0,
        })),
      });
    }

    const siteUrl = getSiteUrl();
    const results = [];
    // Sequential on purpose. These are 15-minute-granularity emails, not
    // a latency-sensitive path, and Resend rate-limits bursts; a slow
    // correct run beats a fast throttled one.
    for (const schedule of due || []) {
      results.push(await deliverSchedule(admin, schedule, { kind: 'scheduled', siteUrl, now }));
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log('[scheduled-reports]', { due: due?.length || 0, sent, failed, source: authResult.source });

    return NextResponse.json({
      ok: true,
      dry_run: false,
      duration_ms: Date.now() - startedAt,
      due: due?.length || 0,
      processed: results.length,
      sent,
      failed,
      results,
    });
  } catch (err) {
    return serverError('Scheduled report run failed', err);
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
