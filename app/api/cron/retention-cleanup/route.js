// /api/cron/retention-cleanup
//
// Scheduled cleanup of personal data past its retention window. Run by
// Vercel cron daily at 03:00 UTC (well outside any plausible user
// activity in the UK / EEA so concurrent edits aren't blocked by
// DELETE locks).
//
// Two ways in:
//
//   1. Vercel cron (production path). Vercel injects an
//      `Authorization: Bearer ${CRON_SECRET}` header on cron-triggered
//      requests. We verify it before doing anything destructive. The
//      env var CRON_SECRET must be set in Vercel project settings.
//
//   2. Platform admin manual trigger (testing / ad-hoc cleanup). When
//      the cron header is absent, falls back to standard auth: must
//      be a signed-in platform admin. Useful for kicking off a run
//      from the admin UI or for first-time verification.
//
// Body parameters (both via JSON POST and query string):
//   - dry_run=true    Returns counts of rows that WOULD be deleted,
//                     without deleting them. Safe to call anytime.
//   - max_rows=N      Override per-table deletion cap (default 5000).
//                     Hard floor at 1, hard ceiling at 50000.
//
// Response:
//   {
//     ok: true,
//     dry_run: boolean,
//     duration_ms: number,
//     results: [
//       {
//         table: 'auth_events',
//         keep_days: 365,
//         cutoff: '2025-05-25T03:00:00Z',
//         rows_to_delete: 142,
//         rows_deleted: 142,        // 0 if dry_run
//         capped: false,
//       },
//       ...
//     ],
//     total_deleted: number,
//   }
//
// Every run — even dry runs — is logged to platform_audit_events with
// action='retention_cleanup_run' and the full per-table result set as
// details. So the audit trail itself documents the data minimisation
// activity (GDPR accountability principle, Art 5(2)).
//
// Failure mode: if any single table delete fails, the others continue,
// and the failed table's row gets {error: msg} in the result. We never
// abort the whole run partway through — the goal is steady-state data
// minimisation, not transactional all-or-nothing.

import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { RETENTION_POLICY, PER_TABLE_MAX_DELETIONS_PER_RUN, cutoffFor } from '@/lib/retention-policy';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;  // cleanup can take a while on large tables

async function authorise(request) {
  // ─── 1. Cron path: Bearer ${CRON_SECRET} ─────────────────────────
  const h = await headers();
  const auth = h.get('authorization') || h.get('Authorization');
  const expected = process.env.CRON_SECRET;
  if (auth && expected) {
    const provided = auth.replace(/^Bearer\s+/i, '').trim();
    if (provided && constantTimeEquals(provided, expected)) {
      return { ok: true, source: 'cron', actor: null };
    }
  }

  // ─── 2. Platform admin path: standard session check ──────────────
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

// Constant-time string comparison — avoids timing attacks on the secret.
function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(request) {
  try {
    const authResult = await authorise(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    // Parse params from either body (POST) or query string (GET-via-cron).
    const url = new URL(request.url);
    let body = {};
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}));
    }
    const dryRun = body.dry_run === true || url.searchParams.get('dry_run') === 'true';
    const requestedMax = Number(body.max_rows ?? url.searchParams.get('max_rows') ?? NaN);
    const maxRows = Math.min(
      50000,
      Math.max(1, Number.isFinite(requestedMax) ? requestedMax : PER_TABLE_MAX_DELETIONS_PER_RUN)
    );

    const admin = createAdminClient();
    const startTime = Date.now();
    const now = new Date();
    const results = [];
    let totalDeleted = 0;

    for (const policy of Object.values(RETENTION_POLICY)) {
      const cutoff = cutoffFor(policy, now);
      const result = {
        table: policy.table,
        keep_days: policy.keepDays,
        cutoff,
        rows_to_delete: 0,
        rows_deleted: 0,
        capped: false,
      };

      try {
        // 1. Count rows that would be deleted (for visibility — also
        //    determines whether we hit the cap).
        let countQuery = admin
          .from(policy.table)
          .select('id', { count: 'exact', head: true })
          .lt(policy.timestampColumn, cutoff);

        // practice_invites needs an extra filter (only delete invites
        // that are terminally finished — revoked or past their expiry).
        if (policy.customWhere) {
          countQuery = countQuery.or(policy.customWhere);
        }

        const { count, error: countErr } = await countQuery;
        if (countErr) throw countErr;

        result.rows_to_delete = count || 0;
        if ((count || 0) > maxRows) result.capped = true;

        if (!dryRun && (count || 0) > 0) {
          // Find the IDs to delete — up to maxRows. We delete in two
          // phases (select IDs, then delete by ID) instead of a bare
          // DELETE-WHERE so we can: (a) respect the cap atomically,
          // (b) return an accurate deletion count, and (c) avoid any
          // racy slippage where rows that don't match the cutoff at
          // SELECT time start matching by DELETE time.
          let selectQuery = admin
            .from(policy.table)
            .select('id')
            .lt(policy.timestampColumn, cutoff)
            .order(policy.timestampColumn, { ascending: true })
            .limit(maxRows);

          if (policy.customWhere) {
            selectQuery = selectQuery.or(policy.customWhere);
          }

          const { data: idsRows, error: selErr } = await selectQuery;
          if (selErr) throw selErr;

          if (idsRows && idsRows.length > 0) {
            const ids = idsRows.map(r => r.id);
            const { error: delErr, count: deletedCount } = await admin
              .from(policy.table)
              .delete({ count: 'exact' })
              .in('id', ids);
            if (delErr) throw delErr;
            result.rows_deleted = deletedCount ?? ids.length;
          }
        }
      } catch (e) {
        result.error = e?.message || String(e);
      }

      results.push(result);
      totalDeleted += result.rows_deleted;
    }

    const durationMs = Date.now() - startTime;

    // Log the run to platform_audit_events. Even dry runs are logged —
    // the audit trail documents the data minimisation activity for
    // GDPR Art 5(2) accountability.
    try {
      await admin.rpc('log_platform_audit_event', {
        p_action: 'other',
        p_target_user_id: null,
        p_target_email: null,
        p_description: dryRun
          ? `Retention cleanup dry run (${totalDeleted === 0 ? 'no rows past retention' : 'would delete rows'})`
          : `Retention cleanup: deleted ${totalDeleted} rows past retention`,
        p_details: {
          source: authResult.source,
          dry_run: dryRun,
          duration_ms: durationMs,
          results,
          total_deleted: totalDeleted,
        },
        p_ip_address: (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        p_user_agent: (await headers()).get('user-agent') || null,
      });
    } catch (e) {
      console.warn('[cron/retention-cleanup] audit log write failed:', e?.message);
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      duration_ms: durationMs,
      results,
      total_deleted: totalDeleted,
    });
  } catch (err) {
    return serverError('Retention cleanup failed', err);
  }
}

// Vercel cron triggers a GET (not POST) when configured via vercel.json.
// We accept both GET (cron) and POST (manual platform admin trigger).
export const GET = handle;
export const POST = handle;
