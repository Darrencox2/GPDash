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

  const debug = { steps: [] };

  try {
    const opUrl = `${OPENPRESCRIBING_BASE}/org_code/?q=${encodeURIComponent(query)}&exact=false&org_type=practice&format=json`;
    const opRes = await fetch(opUrl, {
      signal: AbortSignal.timeout(8000),
      headers: FETCH_HEADERS,
    });
    debug.steps.push({ step: 'op_search', status: opRes.status, query });
    if (!opRes.ok) {
      return NextResponse.json({
        practices: [],
        reason: 'openprescribing_unavailable',
        debug,
      });
    }
    const opJson = await opRes.json();
    if (!Array.isArray(opJson) || opJson.length === 0) {
      return NextResponse.json({
        practices: [],
        reason: 'no_practices_match',
        debug,
      });
    }

    const candidates = opJson
      .filter(o => o.code && o.name)
      .slice(0, MAX_PRACTICES);

    debug.steps.push({ step: 'candidates', count: candidates.length });

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
