// /api/practice-lookup
//
// Given a UK postcode, returns up to ~5 GP practices in the area with
// their list size from NHS Digital (via OpenPrescribing).
//
// Postcode → practice resolution is best-effort. NHS ORD's Postcode
// parameter does a "contains" match on whatever postcode value is stored,
// which sometimes has a space ("BS25 1HZ") and sometimes doesn't ("BS251HZ").
// We try several variants in sequence:
//   1. Exact, with the space the user typed
//   2. Standard format with space
//   3. No spaces
//   4. Outward code with trailing space
//   5. Outward code only
//
// Stops at the first variant that returns at least one active GP practice.
//
// Also filters / flags ODS codes that are already claimed by another
// practice in our database.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

// Force Node runtime so fetch defaults are predictable.
export const runtime = 'nodejs';
// Don't cache — we want fresh API responses each lookup.
export const dynamic = 'force-dynamic';

// NHS Digital's FHIR Organization endpoint (the modern API — the older
// REST one at directory.spineservices.nhs.uk/ORD/2-0-0/ now returns HTTP 406
// regardless of headers, suggesting it's been deprecated).
const NHS_FHIR_BASE = 'https://directory.spineservices.nhs.uk/STU3';
const OPENPRESCRIBING_BASE = 'https://openprescribing.net/api/1.0';
const MAX_PRACTICES = 5;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const postcodeRaw = (searchParams.get('postcode') || '').trim().toUpperCase();
  const currentPracticeId = searchParams.get('currentPracticeId') || null;
  if (!postcodeRaw) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 });
  }

  const variants = buildPostcodeVariants(postcodeRaw);
  const debug = { triedVariants: [], errorsByVariant: {} };

  try {
    let orgs = [];
    let searchedBy = null;
    let source = null;

    // First: try NHS FHIR Organization search with each variant
    for (const v of variants) {
      const { orgs: result, error } = await fetchOrgsByPostcode(v);
      debug.triedVariants.push({ variant: v, source: 'nhs_fhir', count: result.length, error });
      if (error) debug.errorsByVariant[`fhir:${v}`] = error;
      if (result.length > 0) {
        orgs = result;
        searchedBy = v;
        source = 'nhs_fhir';
        break;
      }
    }

    // Fallback: if NHS ORD didn't return anything, try OpenPrescribing.
    // It searches by code/name/postcode area and is more lenient.
    if (orgs.length === 0) {
      const noSpace = postcodeRaw.replace(/\s+/g, '');
      const opQueries = [];
      // Try outward code first (broadest, most likely to hit)
      if (noSpace.length > 3) opQueries.push(noSpace.slice(0, -3));
      // Then full no-space form
      opQueries.push(noSpace);

      for (const q of opQueries) {
        const { orgs: result, error } = await fetchOrgsViaOpenPrescribing(q);
        debug.triedVariants.push({ variant: q, source: 'openprescribing', count: result.length, error });
        if (error) debug.errorsByVariant[`op:${q}`] = error;
        if (result.length > 0) {
          orgs = result;
          searchedBy = q;
          source = 'openprescribing';
          break;
        }
      }
    }

    if (orgs.length === 0) {
      return NextResponse.json({
        practices: [],
        reason: 'no_active_gp_practice_at_postcode',
        debug,
      });
    }

    const seen = new Set();
    orgs = orgs.filter(o => {
      if (seen.has(o.OrgId)) return false;
      seen.add(o.OrgId);
      return true;
    }).slice(0, MAX_PRACTICES);

    const odsCodes = orgs.map(o => o.OrgId).filter(Boolean);
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

    return NextResponse.json({ practices: enriched, searchedBy, source, debug });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'lookup failed', practices: [], debug }, { status: 500 });
  }
}

function buildPostcodeVariants(postcodeRaw) {
  const variants = [];
  const seen = new Set();
  const add = (v) => {
    if (!v || seen.has(v)) return;
    seen.add(v);
    variants.push(v);
  };

  const noSpace = postcodeRaw.replace(/\s+/g, '');

  // 1. Whatever the user typed
  add(postcodeRaw);
  // 2. Standard formatted "AA9A 9AA" with one space before last 3 chars
  if (noSpace.length >= 5) {
    add(noSpace.slice(0, -3) + ' ' + noSpace.slice(-3));
  }
  // 3. No-space form
  add(noSpace);
  // 4. Outward code with trailing space (helps NHS ORD prefix matching)
  if (noSpace.length > 3) {
    const outward = noSpace.slice(0, -3);
    add(outward + ' ');
    add(outward);
  }
  return variants;
}

async function fetchOrgsByPostcode(postcode) {
  try {
    // FHIR R3 Organization search with postcode filter and GP practice role.
    // Role ID RO177 = GP Practice; FHIR uses the system+code form.
    const url = `${NHS_FHIR_BASE}/Organization?address-postalcode=${encodeURIComponent(postcode)}&active=true&_count=20`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'GPDash/1.0',
        'Accept': 'application/fhir+json, application/json',
      },
    });
    if (!res.ok) {
      return { orgs: [], error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    // FHIR Bundle: { resourceType: 'Bundle', entry: [{ resource: Organization }, ...] }
    const entries = json?.entry || [];
    const orgs = entries
      .map(e => fhirOrganizationToOrd(e.resource))
      .filter(o => o && o.OrgId);
    // Filter to GP practices only — FHIR returns all organisation types
    const practices = orgs.filter(o => o.IsGpPractice);
    return { orgs: practices, error: null };
  } catch (e) {
    return { orgs: [], error: e?.message || 'fetch_failed' };
  }
}

/**
 * Convert a FHIR Organization resource into the simpler shape the rest of
 * this file uses (matching what NHS ORD's old REST API returned).
 */
function fhirOrganizationToOrd(org) {
  if (!org) return null;
  // ODS code is in identifier with system https://fhir.nhs.uk/Id/ods-organization-code
  const odsId = (org.identifier || []).find(i =>
    i.system?.includes('ods-organization-code') || i.system?.endsWith('/ods-org-code')
  );
  // Active status
  const isActive = org.active !== false;
  // GP practice detection: check the type / role coding for RO177 or
  // "GP PRACTICE" textual match. FHIR uses extension or type.coding.
  const types = (org.type || []).flatMap(t => t.coding || []);
  const isGpPractice = types.some(c =>
    c.code === 'RO177' || (c.display || '').toUpperCase().includes('GP PRACTICE')
  );
  return {
    OrgId: odsId?.value || org.id,
    Name: org.name,
    Status: isActive ? 'Active' : 'Inactive',
    IsGpPractice: isGpPractice,
  };
}

async function fetchOrgsViaOpenPrescribing(query) {
  try {
    const url = `${OPENPRESCRIBING_BASE}/org_code/?q=${encodeURIComponent(query)}&exact=false&format=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'GPDash/1.0 (+https://gpdash.net)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      return { orgs: [], error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (!Array.isArray(json)) return { orgs: [], error: null };
    const practices = json
      .filter(o => o.code && o.code.length <= 7 && o.name)
      .map(o => ({
        OrgId: o.code,
        Name: o.name,
        Status: 'Active',
      }));
    return { orgs: practices, error: null };
  } catch (e) {
    return { orgs: [], error: e?.message || 'fetch_failed' };
  }
}
