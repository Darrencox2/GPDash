// /api/admin/backfill-nhs-list-sizes — populate list_size on nhs_oc_baseline
// rows by hitting OpenPrescribing's org_code endpoint for each unique ODS.
//
// Run by platform admins via /v4/admin/nhs-data. Idempotent — only updates
// rows where list_size is currently null. Designed to be re-runnable and
// resumable; if it times out, just hit it again (or use auto-loop).
//
// Throughput: parallelizes 5 concurrent fetches to OpenPrescribing. Each
// invocation breaks out when approaching the Vercel 60s ceiling so we
// always return valid JSON to the client (rather than letting Vercel
// emit its HTML timeout page).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_BATCH = 300;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 50_000; // Leave 10s headroom under Vercel's 60s

export async function POST(request) {
  const startedAt = Date.now();
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Platform admin only' }, { status: 403 });
  }

  const url = new URL(request.url);
  const batchSize = Math.min(parseInt(url.searchParams.get('limit') || DEFAULT_BATCH), 2000);

  const { data: needBackfill, error: queryErr } = await supabase
    .from('nhs_oc_baseline')
    .select('ods_code')
    .is('list_size', null)
    .order('ods_code')
    .limit(batchSize);

  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 });

  if (!needBackfill || needBackfill.length === 0) {
    const { count: remaining } = await supabase
      .from('nhs_oc_baseline')
      .select('id', { count: 'exact', head: true })
      .is('list_size', null);
    const { count: total } = await supabase
      .from('nhs_oc_baseline')
      .select('id', { count: 'exact', head: true });
    return NextResponse.json({
      done: true,
      message: 'No rows need backfill.',
      remaining: remaining || 0,
      total: total || 0,
    });
  }

  const uniqueOds = [...new Set(needBackfill.map(r => r.ods_code))];
  const results = { updated: 0, skipped: 0, errors: 0, fetched: 0 };
  const errorSamples = [];
  let timedOut = false;

  // Process in concurrent chunks; check time budget between chunks
  let cursor = 0;
  while (cursor < uniqueOds.length) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    const chunk = uniqueOds.slice(cursor, cursor + CONCURRENCY);
    cursor += chunk.length;

    await Promise.all(chunk.map(async (ods) => {
      try {
        // OpenPrescribing org_details endpoint returns list size by month.
        // The org_code endpoint we previously used was just a name/code
        // lookup and never carried list_size — that's why every fetch
        // came back as 'skipped'.
        // Response shape: [{ row_id, row_name, date, total_list_size }, ...]
        // We take the most recent month's value.
        const r = await fetch(
          `https://openprescribing.net/api/1.0/org_details/?org_type=practice&org=${encodeURIComponent(ods)}&keys=total_list_size&format=json`,
          { headers: { 'User-Agent': 'GPDash-backfill/1.0 (admin@gpdash.net)' } }
        );
        results.fetched++;

        if (!r.ok) {
          results.errors++;
          if (errorSamples.length < 5) errorSamples.push({ ods, status: r.status });
          return;
        }

        const arr = await r.json();
        // Pick the latest month with a non-null list size
        let listSize = null;
        if (Array.isArray(arr) && arr.length > 0) {
          // Sort by date desc and take first non-null
          const sorted = [...arr].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          for (const row of sorted) {
            if (typeof row.total_list_size === 'number' && row.total_list_size > 0) {
              listSize = row.total_list_size;
              break;
            }
          }
        }

        if (typeof listSize !== 'number' || listSize <= 0) {
          results.skipped++;
          return;
        }

        const { error: updErr } = await supabase
          .from('nhs_oc_baseline')
          .update({ list_size: listSize })
          .eq('ods_code', ods);

        if (updErr) {
          results.errors++;
          if (errorSamples.length < 5) errorSamples.push({ ods, error: updErr.message });
        } else {
          results.updated++;
        }
      } catch (err) {
        results.errors++;
        if (errorSamples.length < 5) errorSamples.push({ ods, error: err.message });
      }
    }));
  }

  const { count: remaining } = await supabase
    .from('nhs_oc_baseline')
    .select('id', { count: 'exact', head: true })
    .is('list_size', null);
  const { count: total } = await supabase
    .from('nhs_oc_baseline')
    .select('id', { count: 'exact', head: true });

  return NextResponse.json({
    batch: cursor,
    requested: uniqueOds.length,
    timedOut,
    elapsedMs: Date.now() - startedAt,
    ...results,
    errorSamples,
    remaining: remaining || 0,
    total: total || 0,
    done: (remaining || 0) === 0,
  });
}
