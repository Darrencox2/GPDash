// /api/v4/public/unsubscribe/[token]
//
// Performs the opt-out. Public and unauthenticated by necessity: the people
// who most need this link — a PCN or ICB contact on a practice's report —
// have no GPDash account. Possession of the token IS the authorisation, and
// a token only ever removes the one recipient it was issued to.
//
// POST only. That is not a formality:
//
//   - Mail scanners, link prefetchers and Outlook Safe Links follow GET
//     links in email. A GET that unsubscribes would let a corporate scanner
//     silently remove people who never clicked anything.
//   - RFC 8058 one-click, which is what Gmail and Outlook call from their
//     own native Unsubscribe button, is defined as a POST to the
//     List-Unsubscribe-Post URL. So POST is exactly right for both callers.
//
// The human-facing confirmation page lives at /r/unsubscribe/[token] and
// posts here.
//
// Body (optional): { scope: 'schedule' | 'practice' }.
// RFC 8058 clients send `List-Unsubscribe=One-Click` as form data and no
// scope, which correctly defaults to this schedule only.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError } from '@/lib/api-helpers';
import { resolveToken, applyUnsubscribe } from '@/lib/report-unsubscribe';
import { getSiteUrl } from '@/lib/site-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

    let scope = 'schedule';
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      if (body?.scope === 'practice') scope = 'practice';
    }
    // Form-encoded bodies are the RFC 8058 one-click case; they carry
    // List-Unsubscribe=One-Click and never a scope, so the default stands.

    const resolved = await resolveToken(admin, token);
    if (!resolved) {
      // Deliberately the same answer for an unknown token, a deleted
      // schedule and a malformed one: this endpoint must not confirm
      // whether a given token ever existed.
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    const result = await applyUnsubscribe(admin, resolved, scope, getSiteUrl());
    return NextResponse.json({
      ok: true,
      alreadyOff: result.alreadyOff,
      scope: result.scope,
      paused: result.paused,
    });
  } catch (err) {
    return serverError('Could not process the unsubscribe request', err);
  }
}

// A GET here means something followed the one-click URL that should not
// have. Say so plainly and point at the page a person can actually use,
// rather than acting on it.
export async function GET(request, { params }) {
  const { token } = await params;
  return NextResponse.redirect(`${getSiteUrl()}/r/unsubscribe/${encodeURIComponent(token)}`, 302);
}
