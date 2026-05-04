// /api/admin/backfill-nhs-list-sizes — populate list_size on nhs_oc_baseline
// rows by hitting OpenPrescribing's org_code endpoint for each unique ODS.
//
// Run by platform admins via /v4/admin/nhs-data. Idempotent — only updates
// rows where list_size is currently null. Designed to be re-runnable and
// resumable; if it times out, just hit it again.
//
// Throughput: OpenPrescribing has no documented rate limit but politely
// throttle to ~10 req/sec to avoid being noisy. With ~6,000 unique ODS codes
// this takes roughly 10 minutes but each request handles one practice → it's
// chunked by ?limit=N so a single invocation only does N before returning.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hobby/pro limit; we chunk to fit

const DEFAULT_BATCH = 500;
const REQ_DELAY_MS = 100; // ~10 req/sec

export async function POST(request) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Platform admin gate
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

  // Find ods_codes that need a list_size (latest month per practice; we only
  // ever populate ONE row per practice — they don't change frequently)
  const { data: needBackfill, error: queryErr } = await supabase
    .from('nhs_oc_baseline')
    .select('ods_code')
    .is('list_size', null)
    .order('ods_code')
    .limit(batchSize);

  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 });

  if (!needBackfill || needBackfill.length === 0) {
    // Done
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

  // Deduplicate ods codes (each row is per-month; we want one fetch per practice)
  const uniqueOds = [...new Set(needBackfill.map(r => r.ods_code))];

  const results = { updated: 0, skipped: 0, errors: 0, fetched: 0 };
  const errorSamples = [];

  for (const ods of uniqueOds) {
    try {
      // OpenPrescribing org_code endpoint — list size in `total_list_size`
      const r = await fetch(
        `https://openprescribing.net/api/1.0/org_code/?q=${encodeURIComponent(ods)}&format=json&exact=true&org_type=practice`,
        { headers: { 'User-Agent': 'GPDash-backfill/1.0 (admin@gpdash.net)' } }
      );
      results.fetched++;

      if (!r.ok) {
        results.errors++;
        if (errorSamples.length < 5) errorSamples.push({ ods, status: r.status });
        await sleep(REQ_DELAY_MS);
        continue;
      }

      const arr = await r.json();
      const match = Array.isArray(arr) ? arr.find(p => p.code === ods) : null;
      const listSize = match?.total_list_size;

      if (typeof listSize !== 'number' || listSize <= 0) {
        results.skipped++;
        await sleep(REQ_DELAY_MS);
        continue;
      }

      // Update ALL months for this practice in one query
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
    await sleep(REQ_DELAY_MS);
  }

  // Final counts so the admin UI can show progress
  const { count: remaining } = await supabase
    .from('nhs_oc_baseline')
    .select('id', { count: 'exact', head: true })
    .is('list_size', null);
  const { count: total } = await supabase
    .from('nhs_oc_baseline')
    .select('id', { count: 'exact', head: true });

  return NextResponse.json({
    batch: uniqueOds.length,
    ...results,
    errorSamples,
    remaining: remaining || 0,
    total: total || 0,
    done: (remaining || 0) === 0,
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
