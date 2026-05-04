// /api/admin/upload-nhs-oc-baseline
//
// Accepts uploaded NHS OC submissions data and inserts it into
// nhs_oc_baseline. Two upload formats supported:
//   - 'csv': raw CSV text in the body (one or both regions concatenated)
//   - 'csvs': array of CSV strings (multipart-style, sent as JSON)
//
// Platform admin only.
//
// The cron version (Phase 2, deferred) would fetch the ZIP from
// digital.nhs.uk directly. For now, the admin downloads the ZIP, extracts
// the two CSVs, and pastes/uploads them via the admin UI.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { parseNhsOcBaseline } from '@/lib/nhs-oc-ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Increase body size limit — the two CSVs combined can be ~150MB. We'll
// receive them as multipart form-data.
export const maxDuration = 60;

export async function POST(request) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return NextResponse.json({ error: 'no_supabase_client' }, { status: 500 });
  }

  // Auth: must be platform admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { data: adminCheck } = await supabase.rpc('is_platform_admin');
  if (adminCheck !== true) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  // Parse the form data — expect 'month' and 'csv1' (+ optional 'csv2')
  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return NextResponse.json({ error: 'invalid_form_data', detail: e.message }, { status: 400 });
  }

  const monthIso = formData.get('month'); // e.g. '2026-04-01'
  if (!monthIso || !/^\d{4}-\d{2}-\d{2}$/.test(monthIso)) {
    return NextResponse.json({ error: 'invalid_month_format', message: 'Expected YYYY-MM-01 e.g. 2026-04-01' }, { status: 400 });
  }

  const files = formData.getAll('csv').filter(f => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'no_csv_files', message: 'Attach one or both region CSV files (csv field)' }, { status: 400 });
  }

  // Read each file as text
  const csvTexts = [];
  for (const file of files) {
    if (file.size > 200 * 1024 * 1024) { // 200MB hard cap
      return NextResponse.json({ error: 'file_too_large', message: `${file.name} exceeds 200MB` }, { status: 400 });
    }
    const text = await file.text();
    csvTexts.push(text);
  }

  // Parse + aggregate
  const t0 = Date.now();
  const { rows, totalRowsParsed } = parseNhsOcBaseline(monthIso, csvTexts);
  const parseElapsedMs = Date.now() - t0;

  if (rows.length === 0) {
    return NextResponse.json({ error: 'no_rows_parsed', message: 'CSV files contained no parseable rows', totalRowsParsed }, { status: 400 });
  }

  // Bulk upsert to Supabase. Chunk into batches to stay under request size limits.
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error: upsertErr } = await supabase
      .from('nhs_oc_baseline')
      .upsert(chunk, { onConflict: 'ods_code,month' });
    if (upsertErr) {
      return NextResponse.json({
        error: 'upsert_failed',
        detail: upsertErr.message,
        partialUpserted: upserted,
      }, { status: 500 });
    }
    upserted += chunk.length;
  }

  return NextResponse.json({
    success: true,
    monthIso,
    totalRowsParsed,
    practicesUpserted: upserted,
    parseElapsedMs,
  });
}

// GET: Return current ingestion status (latest month + freshness indicator)
export async function GET() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return NextResponse.json({ error: 'no_supabase_client' }, { status: 500 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { data: adminCheck } = await supabase.rpc('is_platform_admin');
  if (adminCheck !== true) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }

  // Latest month present in the table + how many practices it covers
  const { data: latestRow } = await supabase
    .from('nhs_oc_baseline')
    .select('month, ingested_at')
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count } = await supabase
    .from('nhs_oc_baseline')
    .select('*', { count: 'exact', head: true })
    .eq('month', latestRow?.month);

  // What's the next month we'd expect data for?
  // NHS publishes Submissions data ~6 weeks after the month ends. So if
  // we have March 2026, April 2026 should be available around mid-June 2026.
  let nextExpectedMonth = null;
  let dataIsStale = false;
  if (latestRow?.month) {
    const next = new Date(latestRow.month);
    next.setMonth(next.getMonth() + 1);
    nextExpectedMonth = next.toISOString().slice(0, 10);
    // Stale if the LATEST month we have is more than ~6 weeks behind today
    const sixWeeksAfterMonthEnd = new Date(latestRow.month);
    sixWeeksAfterMonthEnd.setMonth(sixWeeksAfterMonthEnd.getMonth() + 2);
    sixWeeksAfterMonthEnd.setDate(15);
    if (new Date() > sixWeeksAfterMonthEnd) {
      dataIsStale = true;
    }
  }

  return NextResponse.json({
    latestMonth: latestRow?.month || null,
    latestIngestedAt: latestRow?.ingested_at || null,
    practicesInLatestMonth: count || 0,
    nextExpectedMonth,
    dataIsStale,
  });
}
