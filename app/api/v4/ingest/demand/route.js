// /api/v4/ingest/demand
//
// Authenticated CSV ingest for external automation (e.g. Power Automate).
// Power Automate watches a SharePoint/OneDrive folder for the EMIS/demand
// export and POSTs the file here with a per-practice token. We parse it with
// the SAME parsers the manual upload uses, then upsert into demand_history —
// idempotent by (practice_id, date), so re-importing a day REPLACES it.
//
// Auth: a bearer token (X-Ingest-Token header or Authorization: Bearer ...).
// Tokens are stored hashed; we hash the incoming token and look it up. The
// token is scoped to exactly one practice and only this endpoint — it gives no
// access to confidential data. Uses the service-role client server-side.
//
// Replication: each practice gets its own token; the same flow template points
// every practice's folder at this one endpoint.
//
// Request:  POST  body = raw CSV bytes (text/csv or application/octet-stream)
//           optional ?filename=... to help format detection
// Response: 200 { ok, source, rows, date_range } | 4xx/5xx { error }

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { parseDemandFile } from '@/lib/demand-parsers';
import { checkRateLimit, getRateLimitIp } from '@/lib/rate-limit';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT = { prefix: 'rl:ingest-demand', limit: 30, window: '60 s' };
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB ceiling — EMIS demand exports are tiny

function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function jsonError(message, status) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request) {
  try {
    // Rate-limit by IP to bound abuse of the token endpoint.
    const ip = getRateLimitIp(request);
    const rl = await checkRateLimit(RATE_LIMIT, ip);
    if (rl && rl.allowed === false) {
      return jsonError('Too many requests, please slow down.', 429);
    }

    // ── Extract the token ──────────────────────────────────────────────
    const headerToken =
      request.headers.get('x-ingest-token') ||
      (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!headerToken) return jsonError('Missing ingest token', 401);

    const admin = createAdminClient();

    // ── Look up the token (by hash) ────────────────────────────────────
    const tokenHash = sha256Hex(headerToken);
    const { data: tokenRow, error: tokErr } = await admin
      .from('practice_ingest_tokens')
      .select('id, practice_id, enabled, scope')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (tokErr) return serverError('Token lookup failed', tokErr);
    if (!tokenRow || !tokenRow.enabled || tokenRow.scope !== 'demand_ingest') {
      return jsonError('Invalid or disabled token', 403);
    }
    const practiceId = tokenRow.practice_id;

    // ── Read the body (size-capped) ────────────────────────────────────
    const buf = await request.arrayBuffer();
    if (!buf || buf.byteLength === 0) return jsonError('Empty request body', 400);
    if (buf.byteLength > MAX_BYTES) return jsonError('File too large', 413);

    const url = new URL(request.url);
    const filename = url.searchParams.get('filename') || 'upload.csv';

    // Reconstruct a File so the existing parsers (which expect file.arrayBuffer
    // / file.text) work unchanged.
    const file = new File([buf], filename, { type: 'text/csv' });

    // ── Parse with the shared parsers ──────────────────────────────────
    let parsedResult;
    try {
      parsedResult = await parseDemandFile(file);
    } catch (e) {
      await logIngest(admin, practiceId, tokenRow.id, null, 'error', 0, 'Parse threw: ' + (e?.message || 'unknown'));
      return jsonError('Could not parse the file', 422);
    }
    const { source, parsed } = parsedResult;
    if (!source || !parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      const msg = parsed?.errors?.[0] || 'File format not recognised or no data rows';
      await logIngest(admin, practiceId, tokenRow.id, source, 'rejected', 0, msg);
      return jsonError(msg, 422);
    }

    // ── Idempotent upsert into demand_history (one row per practice+date) ─
    const records = parsed.rows.map((r) => ({
      practice_id: practiceId,
      date: r.date,
      request_count: r.count,
      source,
    }));
    const chunkSize = 500;
    let upserted = 0;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { error: upErr } = await admin
        .from('demand_history')
        .upsert(chunk, { onConflict: 'practice_id,date' });
      if (upErr) {
        await logIngest(admin, practiceId, tokenRow.id, source, 'error', upserted, 'Upsert failed: ' + upErr.message);
        return serverError('Could not store the data', upErr);
      }
      upserted += chunk.length;
    }

    // Date range for the response/log.
    const dates = records.map((r) => r.date).sort();
    const dateRange = { from: dates[0], to: dates[dates.length - 1] };

    // ── Audit + token bookkeeping ──────────────────────────────────────
    await logIngest(admin, practiceId, tokenRow.id, source, 'ok', upserted, `${upserted} rows ${dateRange.from}..${dateRange.to}`);
    await admin
      .from('practice_ingest_tokens')
      .update({ last_used_at: new Date().toISOString(), last_used_count: upserted })
      .eq('id', tokenRow.id);

    // NOTE: recalibration of the demand model is intentionally NOT done here —
    // it runs on next dashboard load / manual recalibrate. Keeping ingest fast
    // and side-effect-light makes the automated path robust; the data is in.
    return NextResponse.json({
      ok: true,
      source,
      rows: upserted,
      date_range: dateRange,
    });
  } catch (err) {
    return serverError('Ingest failed', err);
  }
}

async function logIngest(admin, practiceId, tokenId, source, status, rows, message) {
  try {
    await admin.from('demand_ingest_log').insert({
      practice_id: practiceId,
      token_id: tokenId,
      source: source || null,
      status,
      rows_ingested: rows || 0,
      message: (message || '').slice(0, 500),
    });
  } catch { /* logging must never break the response */ }
}
