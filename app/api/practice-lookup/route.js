// /api/practice-lookup
//
// Given a UK postcode, returns up to ~5 GP practices nearby with their
// list size from NHS Digital (via OpenPrescribing). Two-tier search:
//   1. Exact postcode (most precise)
//   2. Outward-code prefix (e.g. BS25) — used as fallback when exact misses
//
// Also filters out ODS codes that are ALREADY claimed by an existing
// practice in our database — except for the currentPracticeId (so when a
// practice re-runs setup, they can still re-pick themselves). Practices
// already in our DB are still returned, but with `existsInDatabase: true`
// and `unavailable: true` so the UI can show them disabled.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

const NHS_ORD_BASE = 'https://directory.spineservices.nhs.uk/ORD/2-0-0';
const OPENPRESCRIBING_BASE = 'https://openprescribing.net/api/1.0';
const GP_PRACTICE_ROLE_ID = 'RO177';
const MAX_PRACTICES = 5;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const postcodeRaw = (searchParams.get('postcode') || '').trim().toUpperCase();
  const postcodeNoSpace = postcodeRaw.replace(/\s+/g, '');
  const currentPracticeId = searchParams.get('currentPracticeId') || null;
  if (!postcodeNoSpace) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 });
  }

  try {
    // ─── 1. Find practices via two-tier search ──────────────────────
    let orgs = await fetchOrgsByPostcode(postcodeNoSpace);
    let searchedBy = 'exact';
    if (orgs.length === 0) {
      // Fall back to outward code (e.g. BS25 from BS25 1HZ). Most postcodes
      // have a 2-4 char outward code followed by digits and 2 letters.
      // Take everything before the last 3 chars.
      if (postcodeNoSpace.length > 3) {
        const outward = postcodeNoSpace.slice(0, -3);
        orgs = await fetchOrgsByPostcode(outward);
        searchedBy = 'outward_code';
      }
    }
    if (orgs.length === 0) {
      return NextResponse.json({ practices: [], reason: 'no_active_gp_practice_at_postcode', searchedBy });
    }

    // De-dupe (the outward search can include the exact postcode results too)
    const seen = new Set();
    orgs = orgs.filter(o => {
      if (seen.has(o.OrgId)) return false;
      seen.add(o.OrgId);
      return true;
    }).slice(0, MAX_PRACTICES);

    // ─── 2. Check which ODS codes already exist in our database ─────
    const odsCodes = orgs.map(o => o.OrgId).filter(Boolean);
    const existingByOds = new Map(); // ods → { id, name, slug }
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

    // ─── 3. Enrich with list size + database-existence flags ────────
    const enriched = await Promise.all(orgs.map(async (org) => {
      const odsCode = org.OrgId;
      const existing = existingByOds.get(odsCode);
      const isMyself = existing && currentPracticeId && existing.id === currentPracticeId;
      const result = {
        odsCode,
        name: org.Name,
        status: org.Status,
        listSize: null,
        listSizeAsOf: null,
        listSizeError: null,
        existsInDatabase: !!existing,
        unavailable: !!existing && !isMyself,
        isCurrentPractice: !!isMyself,
      };
      try {
        const opRes = await fetch(
          `${OPENPRESCRIBING_BASE}/org_details/?org_type=practice&keys=total_list_size&org=${encodeURIComponent(odsCode)}&format=json`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (opRes.ok) {
          const opJson = await opRes.json();
          const sorted = Array.isArray(opJson)
            ? [...opJson].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            : [];
          const latest = sorted.find(r => r.total_list_size != null);
          if (latest) {
            result.listSize = latest.total_list_size;
            result.listSizeAsOf = latest.date;
          } else {
            result.listSizeError = 'no_data_in_openprescribing';
          }
        } else {
          result.listSizeError = 'openprescribing_unavailable';
        }
      } catch (e) {
        result.listSizeError = 'lookup_failed';
      }
      return result;
    }));

    return NextResponse.json({ practices: enriched, searchedBy });
  } catch (e) {
    return NextResponse.json({ error: 'lookup failed', practices: [] }, { status: 500 });
  }
}

async function fetchOrgsByPostcode(postcode) {
  try {
    const url = `${NHS_ORD_BASE}/organisations?Postcode=${encodeURIComponent(postcode)}&PrimaryRoleId=${GP_PRACTICE_ROLE_ID}&Status=Active&Limit=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.Organisations || [];
  } catch {
    return [];
  }
}
