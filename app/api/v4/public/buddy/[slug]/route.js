// /api/v4/public/buddy/[slug]
//
// Public (no-auth) endpoint that serves the data needed to render the
// buddy cover page for a practice. Gated by practices.buddy_cover_public:
// returns 404 if the practice doesn't exist OR has not opted in, so
// the existence of a practice can't be probed by hammering slugs.
//
// Data is the same v3-shape the authenticated dashboard receives,
// minus huddle CSV / demand history which the buddy view doesn't need.
//
// Rate-limited per IP to bound enumeration attempts.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadPracticeData, adaptToV3Shape } from '@/lib/v4-data';
import { checkRateLimit } from '@/lib/rate-limit';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 120/min/IP allows for office settings where several staff might click
// through simultaneously without throttling them.
const RATE_LIMIT = { prefix: 'rl:public-buddy', limit: 120, window: '60 s' };

export async function GET(request, ctx) {
  try {
    const params = await ctx.params;
    const slug = params?.slug;
    if (!slug || typeof slug !== 'string' || slug.length > 64) {
      return new NextResponse(null, { status: 404 });
    }

    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = await checkRateLimit(RATE_LIMIT, `ip:${ip}`);
    // NOTE: checkRateLimit returns { allowed } - this line previously read
    // rl.success (always undefined), which made the route return 429 on
    // EVERY request since it was written. The public board never worked.
    if (rl && !rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: { ...rl.headers, 'Retry-After': String(rl.retryAfterSeconds ?? 60) },
      }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
    }

    const admin = createAdminClient();
    if (!admin) {
      // Will only happen if SUPABASE_SERVICE_ROLE_KEY isn't set in this
      // environment. Return 503 so the UI can show something more
      // informative than a bare 500.
      return NextResponse.json({ error: 'Service not configured — public buddy access unavailable on this environment.' }, { status: 503 });
    }

    // 1. Resolve the practice + check the public flag. Use admin client
    // intentionally — we don't want this gated by any signed-in user's
    // RLS; the public flag IS the access control.
    const { data: practice, error: pErr } = await admin
      .from('practices')
      .select('id, slug, name, buddy_cover_public')
      .eq('slug', slug)
      .maybeSingle();

    if (pErr) return serverError('Failed to look up practice', pErr);

    // 404 whether the practice doesn't exist OR public access is off —
    // don't leak which.
    if (!practice || !practice.buddy_cover_public) {
      return new NextResponse(null, { status: 404 });
    }

    // 2. Load the v4 data + adapt to v3 shape (the BuddyCoverView
    // component expects v3 shape). skipCsv=true because the buddy view
    // doesn't need huddle CSV data and it's the largest chunk.
    const v4Data = await loadPracticeData(admin, practice.id, { skipCsv: true });
    if (!v4Data) {
      return new NextResponse(null, { status: 404 });
    }

    const v3Shape = adaptToV3Shape(v4Data);

    // 3. allocation_history isn't part of adaptToV3Shape (it's loaded
    // separately by the dashboard). Fetch the ±14-day window the buddy
    // view actually uses.
    const fromDk = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDk   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Allocations live in buddy_allocations (date + whole-entry jsonb) -
    // this route previously read a nonexistent allocation_history table,
    // silently getting nothing, so the public board always said
    // "no allocations yet" regardless of reality.
    const { data: historyRows } = await admin
      .from('buddy_allocations')
      .select('date, allocations')
      .eq('practice_id', practice.id)
      .gte('date', fromDk)
      .lte('date', toDk);

    const allocationHistory = {};
    for (const row of (historyRows || [])) {
      allocationHistory[row.date] = row.allocations || {};
    }

    // 4. Build the public response. Strip fields the buddy view doesn't
    // need so the public surface area is minimal.
    return NextResponse.json({
      ok: true,
      practiceName: practice.name,
      practiceSlug: practice.slug,
      clinicians: v3Shape.clinicians,
      weeklyRota: v3Shape.weeklyRota,
      plannedAbsences: v3Shape.plannedAbsences,
      settings: v3Shape.settings,        // buddy weights
      closedDays: v3Shape.closedDays,
      dailyOverrides: v3Shape.dailyOverrides,
      allocationHistory,
    }, {
      headers: {
        // Brief edge cache — auto-refresh polls every 2 minutes anyway.
        'Cache-Control': 'public, max-age=30, s-maxage=30',
      },
    });
  } catch (err) {
    return serverError('Public buddy lookup failed', err);
  }
}
