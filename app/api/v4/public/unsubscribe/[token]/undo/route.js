// /api/v4/public/unsubscribe/[token]/undo
//
// Reverses an opt-out, for the "changed your mind?" link shown immediately
// after unsubscribing. Same token, same authorisation model, same reason for
// being POST-only: a GET would be followed by mail scanners.
//
// Not linked from any email — only from the confirmation page — so it cannot
// be used to quietly resubscribe someone from a forwarded message.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError } from '@/lib/api-helpers';
import { resolveToken, undoUnsubscribe } from '@/lib/report-unsubscribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

    const resolved = await resolveToken(admin, token);
    if (!resolved) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    const result = await undoUnsubscribe(admin, resolved);
    return NextResponse.json({ ok: true, resumed: result.resumed });
  } catch (err) {
    return serverError('Could not undo the unsubscribe', err);
  }
}
