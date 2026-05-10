// /api/v4/admin/generate-link
//
// Platform-admin endpoint that generates a one-time sign-in link for a
// user who's stuck in the "email_unconfirmed" state (or just lost their
// confirmation email).
//
// Returns the action_link as JSON for the admin to copy and forward to
// the user via whatever channel they're already using (Slack, text,
// re-typing the email…). Avoids needing email infrastructure for now;
// once we have Resend or similar wired in we can also auto-send.
//
// Two layers of auth:
//   1. The CALLER must be a platform admin — verified via cookie session
//      against profiles.is_platform_admin.
//   2. The actual link generation uses the service-role admin client
//      because Supabase's auth.admin API requires it.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // 1. Auth check — must be a platform admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden: platform admin only' }, { status: 403 });
  }

  // 2. Read body — { email, type? }
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const email = (body?.email || '').trim().toLowerCase();
  // 'magiclink' = ordinary sign-in link
  // 'recovery' = password reset link (alternative to PasswordResetButton's
  //              client-side flow when the admin needs to copy the URL)
  // 'signup'   = confirmation link for unconfirmed accounts
  const type = body?.type || 'magiclink';
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
  if (!['magiclink', 'recovery', 'signup'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  // 3. Use the service-role admin client to generate the link
  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({
      error: 'Service role key not configured. Add SUPABASE_SERVICE_ROLE_KEY to env.',
    }, { status: 500 });
  }

  // generateLink wants the redirect_to to point at our app so the link
  // lands the user back on /v4/dashboard signed in.
  const origin = request.headers.get('origin')
    || `https://${request.headers.get('host')}`
    || '';
  const { data, error } = await adminClient.auth.admin.generateLink({
    type,
    email,
    options: {
      redirectTo: `${origin}/auth/callback?next=/v4/dashboard`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // The action_link is the user-clickable URL. Hashed token info also
  // exists in data.properties but we don't expose those — just the URL.
  return NextResponse.json({
    actionLink: data?.properties?.action_link || null,
    emailSent: false, // We don't auto-send yet
  });
}
