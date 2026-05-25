// /api/v4/account/delete-check
//
// Pre-flight for account deletion (GDPR Article 17). Returns blockers
// without actually doing anything destructive — so the UI can show a
// clear "you can't delete yet, here's what to do first" panel before
// the user types their email to confirm.
//
// Blockers we check (all DB-level constraints would also catch these,
// but surfacing them as actionable messages > letting the user hit a
// generic 500 mid-deletion):
//
//   1. Sole owner of a practice → must transfer ownership first.
//      The DB-level trigger refuses to remove the last owner; we
//      front-run that check so the UX is clear.
//
//   2. Sole platform admin → must promote another admin first. (Sole
//      check across the whole platform, not per-practice.)
//
// Returns:
//   {
//     can_delete: true,
//     blockers: []
//   }
// OR
//   {
//     can_delete: false,
//     blockers: [
//       { type: 'sole_owner', message: '...', practices: [{slug, name}] },
//       { type: 'sole_platform_admin', message: '...' }
//     ]
//   }

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = createAdminClient();
    const blockers = [];

    // ─── 1. Sole owner check ──────────────────────────────────────────
    // For each practice the user owns, count other owners. If 0, blocked.
    const { data: ownedPractices } = await admin
      .from('practice_users')
      .select('practice_id, practices!inner(slug, name)')
      .eq('user_id', user.id)
      .eq('role', 'owner');

    const soleOwnerPractices = [];
    for (const ow of (ownedPractices || [])) {
      const { count } = await admin
        .from('practice_users')
        .select('user_id', { count: 'exact', head: true })
        .eq('practice_id', ow.practice_id)
        .eq('role', 'owner')
        .neq('user_id', user.id);
      if ((count || 0) === 0) {
        soleOwnerPractices.push({
          slug: ow.practices.slug,
          name: ow.practices.name,
        });
      }
    }

    if (soleOwnerPractices.length > 0) {
      blockers.push({
        type: 'sole_owner',
        message: soleOwnerPractices.length === 1
          ? `You are the sole owner of ${soleOwnerPractices[0].name}. Promote another member to owner first, or contact support to transfer the practice to a new owner.`
          : `You are the sole owner of ${soleOwnerPractices.length} practices. Each one needs another owner before you can delete your account.`,
        practices: soleOwnerPractices,
        action: 'Visit Practice → Users for each practice and promote another member to owner.',
      });
    }

    // ─── 2. Sole platform admin check ─────────────────────────────────
    const { data: meAsAdmin } = await admin
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (meAsAdmin?.is_platform_admin) {
      const { count: otherAdmins } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_platform_admin', true)
        .neq('id', user.id);
      if ((otherAdmins || 0) === 0) {
        blockers.push({
          type: 'sole_platform_admin',
          message: 'You are the only platform admin. Removing your account would leave nobody able to administer the platform.',
          action: 'Promote another user to platform admin first via /v4/admin/users, then come back.',
        });
      }
    }

    return NextResponse.json({
      can_delete: blockers.length === 0,
      blockers,
    });
  } catch (err) {
    return serverError('Failed to run deletion pre-flight check', err);
  }
}
