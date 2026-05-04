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

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    debug.steps.push({ step: 'op_search', usedUrl, candidatesFound: candidates.length });

    if (candidates.length === 0) {
      return NextResponse.json({
        practices: [],
        reason: 'no_practices_match',
        debug,
      });
    }

    const odsCodes = candidates.map(o => o.code);
    const existingByOds = new Map();
    if (odsCodes.length > 0) {
      const cookieStore = cookies();
      const supabase = createClient(cookieStore);
      if (supabase) {
        const { data: existing } = await supabase
          .from('practices')
          .select('id, name, slug, ods_code')
          .in('ods_code', odsCodes);
        for (const p of existing || []) {
          if (p.ods_code) existingByOds.set(p.ods_code, p);
        }
      }
    }

    const enriched = await Promise.all(candidates.map(async (c) => {
      const existing = existingByOds.get(c.code);
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
      };
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
      return result;
    }));

    return NextResponse.json({
      practices: enriched,
      source: 'openprescribing_name_search',
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
