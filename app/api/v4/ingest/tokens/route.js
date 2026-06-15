// /api/v4/ingest/tokens
//
// Manage per-practice ingest tokens (for Power Automate demand CSV ingest).
// Authenticated as a logged-in LEADERSHIP user (owner/partner/practice_manager)
// via the normal cookie session + RLS. Creating a token is access-granting, so
// it is leadership-only — enforced by the table's RLS policies.
//
//   GET    ?practice=<id>           -> list tokens (no secrets, just metadata)
//   POST   { practice_id, label }   -> create token, returns RAW token ONCE
//   DELETE ?id=<token_id>           -> revoke (delete) a token
//
// The raw token is shown exactly once at creation and never stored in plaintext
// (only its sha-256 hash is kept), mirroring how API keys work everywhere.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const practice = new URL(request.url).searchParams.get('practice');
    if (!practice) return NextResponse.json({ error: 'Missing practice' }, { status: 400 });

    // RLS restricts this to leadership of the practice.
    const { data, error } = await supabase
      .from('practice_ingest_tokens')
      .select('id, label, scope, enabled, created_at, last_used_at, last_used_count')
      .eq('practice_id', practice)
      .order('created_at', { ascending: false });
    if (error) return serverError('Could not list tokens', error);
    return NextResponse.json({ tokens: data || [] });
  } catch (err) {
    return serverError('Token list failed', err);
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const practiceId = body.practice_id;
    const label = (body.label || 'Power Automate').slice(0, 120);
    if (!practiceId) return NextResponse.json({ error: 'Missing practice_id' }, { status: 400 });

    // Generate a strong random token. Prefix makes it identifiable in logs.
    const raw = 'gpd_' + randomBytes(24).toString('base64url');
    const tokenHash = sha256Hex(raw);

    // Insert under the user's RLS session — the WITH CHECK policy enforces that
    // only leadership of this practice can create a token for it.
    const { data, error } = await supabase
      .from('practice_ingest_tokens')
      .insert({
        practice_id: practiceId,
        token_hash: tokenHash,
        label,
        scope: 'demand_ingest',
        created_by: user.id,
      })
      .select('id, label, created_at')
      .single();
    if (error) {
      // RLS denial surfaces as an error here.
      return NextResponse.json({ error: 'Not permitted to create a token for this practice' }, { status: 403 });
    }

    // Return the RAW token exactly once.
    return NextResponse.json({ id: data.id, label: data.label, token: raw, created_at: data.created_at });
  } catch (err) {
    return serverError('Token creation failed', err);
  }
}

export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // RLS restricts delete to leadership of the owning practice.
    const { error } = await supabase.from('practice_ingest_tokens').delete().eq('id', id);
    if (error) return serverError('Could not revoke token', error);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError('Token revoke failed', err);
  }
}
