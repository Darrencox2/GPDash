// /api/v4/client-error
//
// Receives a crash report from the browser and stores one row in app_errors.
//
// Why this exists: before it, a section crash showed "screenshot this box for
// Darren" and a swallowed server error went to a console.warn nobody reads.
// The retention-cleanup bug fixed in v4.117.2 had been reporting success
// while doing nothing, and nothing raised a hand. This is the hand.
//
// Deliberately small and self-hosted — no third-party error service, so no
// clinical estate data leaves Supabase.
//
// Accepts unauthenticated posts (a crash can happen on the login page) but
// attaches the user id when there is a session. Rate-limited per IP so a
// crash loop cannot write a million rows.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkRateLimit, getRateLimitIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A crash loop in one browser tab can fire fast. 20/min/IP keeps a genuine
// burst (several sections failing on one bad payload) while capping abuse.
const RATE_LIMIT = { prefix: 'rl:client-error', limit: 20, window: '60 s' };

const clamp = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);

export async function POST(request) {
  try {
    const rl = await checkRateLimit(RATE_LIMIT, `ip:${getRateLimitIp(request)}`);
    if (rl && !rl.allowed) {
      // 204 rather than 429: the caller is an error handler and must never
      // turn a report into a second error. Silently dropping is correct here.
      return new NextResponse(null, { status: 204 });
    }

    const body = await request.json().catch(() => null);
    const message = clamp(body?.message, 2000);
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

    const admin = createAdminClient();
    if (!admin) {
      // Nothing useful to do, and the caller is already handling an error.
      console.warn('[client-error] service role key not configured — report dropped');
      return new NextResponse(null, { status: 204 });
    }

    // Best-effort identity. An unauthenticated crash is still worth storing.
    let userId = null;
    try {
      const supabase = createClient(await cookies());
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || null;
      }
    } catch { /* identity is a nice-to-have, never a reason to drop the report */ }

    const source = ['client', 'boundary', 'unhandled'].includes(body?.source)
      ? body.source : 'client';

    const { error } = await admin.from('app_errors').insert({
      user_id: userId,
      practice_id: clamp(body?.practiceId, 36),
      source,
      message,
      stack: clamp(body?.stack, 8000),
      component_stack: clamp(body?.componentStack, 8000),
      path: clamp(body?.path, 500),
      app_version: clamp(body?.appVersion, 40),
      user_agent: clamp(request.headers.get('user-agent'), 500),
    });
    if (error) {
      console.warn('[client-error] insert failed:', error.message);
      return new NextResponse(null, { status: 204 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.warn('[client-error] handler failed:', e?.message);
    return new NextResponse(null, { status: 204 });
  }
}
