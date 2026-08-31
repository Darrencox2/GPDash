// /api/practice-lookup
//
// Practice search by NAME using OpenPrescribing's org_code endpoint.
// Returns matching GP practices with their list size from NHS Digital.
//
// Background: we tried postcode-based lookup via:
//   - NHS Spine ORD REST API → HTTP 406 regardless of headers
//   - NHS FHIR Organization endpoint → HTTP 403 (requires API key)
//   - OpenPrescribing org_location → returns empty without `q` parameter
//
// None work without registration. Pivoting to name-search via
// OpenPrescribing's org_code endpoint, which is free, public, and proven
// to work. Trade-off: user types their practice name instead of relying
// on geographic match.
//
// UPDATE: OpenPrescribing later went behind a Cloudflare challenge and
// began returning 403 to every server-side request, which left new-practice
// sign-up with no working lookup at all. So there is now a fallback to the
// NHS ODS ORD API (lib/nhs-ods.js) whenever OpenPrescribing yields nothing.
// ODS has no list size, so in that mode patient numbers come from the
// nhs_oc_baseline table instead. OpenPrescribing stays PRIMARY so that
// behaviour is unchanged whenever it is healthy.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { searchPracticesByName, getPracticeByOdsCode, looksLikeOdsCode } from '@/lib/nhs-ods';
import { checkRateLimit, RATE_LIMITS, getRateLimitIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Give the function room to try the query variants + list-size enrichment
// against a slow upstream without the platform killing it mid-flight (which
// would surface as an HTML 504 and a generic client error). The client caps
// its own wait at 12s and shows a retry message, so this is just a ceiling.
export const maxDuration = 30;

const OPENPRESCRIBING_BASE = 'https://openprescribing.net/api/1.0';
const MAX_PRACTICES = 10;
const FETCH_HEADERS = {
  'User-Agent': 'GPDash/1.0',
  'Accept': 'application/json',
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const currentPracticeId = searchParams.get('currentPracticeId') || null;
  if (!query || query.length < 2) {
    return NextResponse.json({ practices: [], reason: 'query_too_short' });
  }

  // Anonymous endpoint (called during practice creation before sign-in).
  // Rate-limit by IP so we don't end up DoS-ing OpenPrescribing on
  // behalf of a script. 60/min is generous for legitimate type-to-search
  // even without client-side debouncing.
  const rl = await checkRateLimit(RATE_LIMITS.publicLookup, `ip:${getRateLimitIp(request)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many lookup requests. Please slow down.' },
      {
        status: 429,
        headers: {
          ...rl.headers,
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    );
  }

  const debug = { steps: [], attempts: [] };

  try {
    // Try multiple URL variants in case org_type=practice doesn't filter
    // properly on this endpoint. The org_code endpoint behaves slightly
    // differently than documented. ALL must include format=json — without
    // it Django REST framework serves HTML (its browsable API page) by
    // default, regardless of the Accept header we send.
    const queries = [
      // 1. Simplest: just query
      `${OPENPRESCRIBING_BASE}/org_code/?q=${encodeURIComponent(query)}&format=json`,
      // 2. With exact=false
      `${OPENPRESCRIBING_BASE}/org_code/?q=${encodeURIComponent(query)}&exact=false&format=json`,
      // 3. With org_type filter
      `${OPENPRESCRIBING_BASE}/org_code/?q=${encodeURIComponent(query)}&exact=false&org_type=practice&format=json`,
    ];

    let candidates = [];
    let usedUrl = null;
    // Did OpenPrescribing answer us at all? A single 2xx is enough to call
    // it healthy. If every variant 403s or times out we skip the per-practice
    // org_details calls entirely rather than burning 10 x 5s on a dead host.
    let opReachable = false;
    for (const opUrl of queries) {
      try {
        const opRes = await fetch(opUrl, {
          signal: AbortSignal.timeout(8000),
          headers: FETCH_HEADERS,
        });
        const attempt = {
          url: opUrl,
          status: opRes.status,
          ok: opRes.ok,
          contentType: opRes.headers.get('content-type'),
        };
        let bodyText = '';
        if (opRes.ok) {
          opReachable = true;
          // Read as text first so we can inspect malformed responses
          bodyText = await opRes.text();
          attempt.bodyLength = bodyText.length;
          attempt.bodyPreview = bodyText.slice(0, 300);
          try {
            const parsed = JSON.parse(bodyText);
            const arr = Array.isArray(parsed) ? parsed : [];
            // Filter to GP practices: codes are typically 6 chars and look
            // like LXXXXX or similar — but we won't be too strict here, just
            // check it has both code and name
            const matched = arr.filter(o => o && o.code && o.name);
            attempt.matchCount = matched.length;
            if (matched.length > 0) {
              candidates = matched.slice(0, MAX_PRACTICES);
              usedUrl = opUrl;
              debug.attempts.push(attempt);
              break;
            }
          } catch (e) {
            attempt.parseError = e.message;
          }
        } else {
          // Capture the error body too
          try { attempt.errorBody = (await opRes.text()).slice(0, 200); } catch {}
        }
        debug.attempts.push(attempt);
      } catch (e) {
        debug.attempts.push({ url: opUrl, fetchError: e?.message || 'fetch_failed' });
      }
    }

    debug.steps.push({ step: 'op_search', usedUrl, candidatesFound: candidates.length, opReachable });

    // ─── Fallback: NHS ODS ────────────────────────────────────────────────
    // Reached both when OpenPrescribing is down and when it is up but simply
    // has no match. ODS is the upstream source of truth for practice identity,
    // so a hit here is at least as trustworthy as the primary path.
    let source = 'openprescribing_name_search';
    if (candidates.length === 0) {
      source = 'nhs_ods_fallback';

      // ODS name search does not match on code (?Name=L81021 returns nothing),
      // so a code-shaped query has to go to the per-organisation endpoint.
      if (looksLikeOdsCode(query)) {
        const { practice, error, url } = await getPracticeByOdsCode(query);
        debug.steps.push({ step: 'ods_by_code', url, found: !!practice, error: error || null });
        if (practice) candidates = [practice];
      }

      if (candidates.length === 0) {
        const { practices, error, url } = await searchPracticesByName(query, { limit: MAX_PRACTICES });
        debug.steps.push({ step: 'ods_by_name', url, found: practices.length, error: error || null });
        candidates = practices;
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        practices: [],
        reason: 'no_practices_match',
        debug,
      });
    }

    const odsCodes = candidates.map(o => o.code);
    const existingByOds = new Map();
    // PCN / ICB / region from nhs_oc_baseline — used by the UI to
    // disambiguate practices that share a name (e.g. three different
    // "Horizon Health Centre"s in three regions). The baseline table
    // has a row per practice per month, so we also pick the latest
    // month per ODS to avoid duplicates.
    const nhsContextByOds = new Map();
    // Baseline list size per ODS, used when OpenPrescribing cannot supply one.
    const baselineListSizeByOds = new Map();
    if (odsCodes.length > 0) {
      // Both reads use the service-role client, for the same reason.
      //
      // nhs_oc_baseline grants SELECT to `authenticated` only, and `practices`
      // is member-scoped — but this route is anonymous by design (it runs
      // before sign-in during practice creation), so under RLS both come back
      // empty with no error. That silently made every practice look brand new
      // and every PCN/ICB/region blank.
      //
      // Nothing user-scoped leaks: the baseline is public NHS reference data,
      // and the practices read is reduced to booleans below — the row itself
      // is never returned. "Is this ODS code already on GPDash" is already
      // public via the check_practice_exists_by_ods RPC, which the sign-up
      // page calls anonymously and which deliberately bypasses RLS. The route
      // is IP rate-limited.
      const admin = createAdminClient();

      const [existingRes, nhsRes] = await Promise.all([
        admin
          ? admin.from('practices').select('id, ods_code').in('ods_code', odsCodes)
          : Promise.resolve({ data: [] }),
        admin
          ? admin
              .from('nhs_oc_baseline')
              .select('ods_code, pcn_name, icb_name, region_name, list_size, month')
              .in('ods_code', odsCodes)
              .order('month', { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);
      debug.steps.push({
        step: 'supabase_read',
        adminClient: !!admin,
        existing: (existingRes.data || []).length,
        baselineRows: (nhsRes.data || []).length,
      });

      for (const p of existingRes.data || []) {
        if (p.ods_code) existingByOds.set(p.ods_code, p);
      }
      // Take the latest row per ODS — query is sorted desc so the
      // first one we see for a given ODS is the most recent.
      for (const row of nhsRes.data || []) {
        if (!row.ods_code) continue;
        if (!nhsContextByOds.has(row.ods_code)) {
          nhsContextByOds.set(row.ods_code, {
            pcnName: row.pcn_name,
            icbName: row.icb_name,
            regionName: row.region_name,
          });
        }
        // List size is tracked separately: the most recent month for a
        // practice can carry a null list_size while an earlier one has a
        // real figure, so take the latest month that actually has a number.
        if (row.list_size != null && !baselineListSizeByOds.has(row.ods_code)) {
          baselineListSizeByOds.set(row.ods_code, { listSize: row.list_size, asOf: row.month });
        }
      }
    }

    const enriched = await Promise.all(candidates.map(async (c) => {
      const existing = existingByOds.get(c.code);
      const nhsContext = nhsContextByOds.get(c.code);
      const isMyself = existing && currentPracticeId && existing.id === currentPracticeId;
      const result = {
        odsCode: c.code,
        name: c.name,
        status: 'Active',
        listSize: null,
        listSizeAsOf: null,
        listSizeError: null,
        existsInDatabase: !!existing,
        unavailable: !!existing && !isMyself,
        isCurrentPractice: !!isMyself,
        // NHS organisational context — null if we don't have a baseline
        // row for this ODS (very small practices and recently-coded
        // practices may be missing).
        pcnName: nhsContext?.pcnName || null,
        icbName: nhsContext?.icbName || null,
        regionName: nhsContext?.regionName || null,
        // Present only on the ODS path — lets the client skip the separate
        // postcode round-trip when we already know the answer.
        postcode: c.postcode || null,
      };
      // Only ask OpenPrescribing for a list size if it answered the search.
      // When it is down, 10 candidates x a 5s timeout is 5s of dead wait for
      // a result we already know we cannot get.
      if (opReachable) {
        try {
          const url = `${OPENPRESCRIBING_BASE}/org_details/?org_type=practice&keys=total_list_size&org=${encodeURIComponent(c.code)}&format=json`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            headers: FETCH_HEADERS,
          });
          if (res.ok) {
            const json = await res.json();
            const sorted = Array.isArray(json)
              ? [...json].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              : [];
            const latest = sorted.find(r => r.total_list_size != null);
            if (latest) {
              result.listSize = latest.total_list_size;
              result.listSizeAsOf = latest.date;
            } else {
              result.listSizeError = 'no_data_in_openprescribing';
            }
          } else {
            result.listSizeError = `openprescribing_${res.status}`;
          }
        } catch (e) {
          result.listSizeError = 'lookup_failed';
        }
      } else {
        result.listSizeError = 'openprescribing_unavailable';
      }

      // Baseline fallback — covers both a dead OpenPrescribing and a practice
      // it simply has no figures for. Clears the error when it succeeds so the
      // UI shows a number rather than a warning.
      if (result.listSize == null) {
        const baseline = baselineListSizeByOds.get(c.code);
        if (baseline) {
          result.listSize = baseline.listSize;
          result.listSizeAsOf = baseline.asOf;
          result.listSizeSource = 'nhs_oc_baseline';
          result.listSizeError = null;
        }
      }
      return result;
    }));

    return NextResponse.json({
      practices: enriched,
      source,
      debug,
    });
  } catch (e) {
    return NextResponse.json({
      error: e?.message || 'lookup failed',
      practices: [],
      debug,
    }, { status: 500 });
  }
}
