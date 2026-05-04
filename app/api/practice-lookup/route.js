// /api/practice-lookup
//
// Given a UK postcode, returns the GP practice(s) at that postcode along
// with their estimated list size from NHS Digital (via OpenPrescribing).
//
// Combines two free public sources:
//   1. NHS ORD (Spine Directory) — postcode → ODS code(s) for GP practices
//   2. OpenPrescribing — ODS code → total_list_size with as-of date
//
// We do this server-side to avoid CORS issues and to keep API endpoints
// hidden from the client. The route is read-only and doesn't write to our
// database — caller (the setup form) decides whether to use the result.

import { NextResponse } from 'next/server';

const NHS_ORD_BASE = 'https://directory.spineservices.nhs.uk/ORD/2-0-0';
const OPENPRESCRIBING_BASE = 'https://openprescribing.net/api/1.0';
const GP_PRACTICE_ROLE_ID = 'RO177'; // ODS PrimaryRoleId for GP Practice

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const postcode = (searchParams.get('postcode') || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!postcode) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 });
  }

  try {
    // ─── 1. Find practices at this postcode ───────────────────────
    // ORD wants postcode without the space (e.g. "BS251HZ")
    const ordRes = await fetch(
      `${NHS_ORD_BASE}/organisations?Postcode=${encodeURIComponent(postcode)}&PrimaryRoleId=${GP_PRACTICE_ROLE_ID}&Status=Active`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!ordRes.ok) {
      return NextResponse.json({ error: 'NHS directory unavailable', practices: [] });
    }
    const ordJson = await ordRes.json();
    const orgs = ordJson?.Organisations || [];
    if (orgs.length === 0) {
      // No active GP practice found. Could be a residential postcode or
      // a practice that's been closed/merged. Caller will let user enter
      // list size manually.
      return NextResponse.json({ practices: [], reason: 'no_active_gp_practice_at_postcode' });
    }

    // ─── 2. For each practice, fetch list size from OpenPrescribing ──
    // OpenPrescribing's org_details returns total_list_size keyed by month;
    // we take the most recent. Some practices won't have data (e.g. very new),
    // so we tolerate failures per practice.
    const enriched = await Promise.all(orgs.slice(0, 5).map(async (org) => {
      const odsCode = org.OrgId;
      const result = {
        odsCode,
        name: org.Name,
        status: org.Status,
        listSize: null,
        listSizeAsOf: null,
        listSizeError: null,
      };
      try {
        const opRes = await fetch(
          `${OPENPRESCRIBING_BASE}/org_details/?org_type=practice&keys=total_list_size&org=${encodeURIComponent(odsCode)}&format=json`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!opRes.ok) {
          result.listSizeError = 'openprescribing_unavailable';
          return result;
        }
        const opJson = await opRes.json();
        // Response is an array of monthly snapshots: [{ date, row_id, row_name, total_list_size }, ...]
        // Sort newest-first and pick the first with a non-null list size.
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
      } catch (e) {
        result.listSizeError = 'lookup_failed';
      }
      return result;
    }));

    return NextResponse.json({ practices: enriched });
  } catch (e) {
    return NextResponse.json({ error: 'lookup failed', practices: [] }, { status: 500 });
  }
}
