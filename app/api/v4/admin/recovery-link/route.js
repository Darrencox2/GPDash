// /api/v4/admin/recovery-link
//
// Generates a Supabase password-recovery link WITHOUT sending an email,
// using auth.admin.generateLink (service role only). Exists because
// email delivery to nhs.net is unreliable (greylisting/quarantine) —
// a platform admin can hand the link to the user via any channel.
//
// Security:
//   - Caller must be authenticated and a platform admin (same guard as
//     suspend-user), otherwise 401/403.
//   - The link is returned to the admin once and never stored.
//   - The action is recorded via log_auth_event for the audit trail.
import { NextResponse } from 'next/server';
import { adminApiAalProblem } from '@/lib/admin-guard';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

async function requireAdminCaller() {
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

  // MFA gate - same bar as the /v4/admin pages (see lib/admin-guard.js).
  {
    const aalProblem = await adminApiAalProblem(supabase);
    if (aalProblem) return { error: aalProblem, status: 403 };
  }
  return { caller: user, supabase };
}

export async function POST(request) {
  const auth = await requireAdminCaller();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { caller, supabase } = auth;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const email = (body?.email || '').trim().toLowerCase();
  const redirectTo = body?.redirect_to;
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const adminClient = createAdminClient();
  if (!adminClient) return NextResponse.json({ error: 'Service role not configured' }, { status: 500 });

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Audit trail — same channel as email-based resets.
  await supabase.rpc('log_auth_event', {
    event_type: 'recovery_link_generated',
    email,
    details: `by admin ${caller.email}`,
  }).then(null, () => {});

  return NextResponse.json({ link: data?.properties?.action_link || null });
}
