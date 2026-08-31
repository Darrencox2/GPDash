// /api/v4/lookup-practice-postcode
//
// Given an ODS code, returns the practice's postcode from NHS ODS, which
// holds the practice's own registered address.
//
// Used by the setup wizard immediately after a practice is picked, so the
// postcode field auto-fills (no manual entry needed in the common case).
//
// Fallback, if ODS has no postcode for the code:
//   1. Query OpenPrescribing's org_location for lat/lng
//   2. Reverse-geocode via postcodes.io to find the nearest postcode
//
// That chain used to be the primary path, and the order was deliberately
// inverted: reverse-geocoding answers "which postcode is nearest this map
// pin", which can be the building next door, whereas ODS answers "what is
// this practice's postcode". ODS is also the only one of the two currently
// reachable — OpenPrescribing sits behind a Cloudflare challenge and 403s
// every server-side request — but accuracy is the reason for the order, so
// it should stand even once OpenPrescribing recovers.
//
// Returns null postcode if both fail — caller should fall back to asking
// the user to enter manually.

import { NextResponse } from 'next/server';
import { getPracticeByOdsCode } from '@/lib/nhs-ods';
import { checkRateLimit, RATE_LIMITS, getRateLimitIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENPRESCRIBING_BASE = 'https://openprescribing.net/api/1.0';
const POSTCODES_IO_BASE = 'https://api.postcodes.io';
const FETCH_HEADERS = {
  'User-Agent': 'GPDash/1.0',
  'Accept': 'application/json',
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ods = (searchParams.get('ods') || '').trim().toUpperCase();
  if (!ods || !/^[A-Z0-9]{3,10}$/.test(ods)) {
    return NextResponse.json({ error: 'invalid_ods', message: 'Provide ?ods=L82085' }, { status: 400 });
  }

  // Anonymous endpoint. Rate-limit by IP — this proxies external services
  // (NHS ODS, and OpenPrescribing + postcodes.io behind it), so we want to
  // fail-fast on abuse rather than push it through.
  const rl = await checkRateLimit(RATE_LIMITS.publicLookup, `ip:${getRateLimitIp(request)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', postcode: null },
      {
        status: 429,
        headers: {
          ...rl.headers,
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    );
  }

  const debug = { steps: [] };

  // ─── Fallback: OpenPrescribing lat/lng → postcodes.io reverse-geocode ───
  // Every bailout returns rather than throwing, so a dead upstream degrades
  // to "no postcode" instead of a 500. `reason` names where ODS gave up, so
  // the two sources can be told apart in the response.
  const reverseGeocodeFallback = async (odsReason) => {
    const bail = (reason, extra = {}) =>
      NextResponse.json({ postcode: null, reason, odsError: odsReason, debug, ...extra }, { status: 200 });

    // Query by ODS code (q parameter). Without q, the endpoint returns
    // empty — we tested this. With q=ODS, we expect a single feature back.
    const locUrl = `${OPENPRESCRIBING_BASE}/org_location/?q=${encodeURIComponent(ods)}&org_type=practice`;
    let locRes;
    try {
      locRes = await fetch(locUrl, { signal: AbortSignal.timeout(8000), headers: FETCH_HEADERS });
    } catch (e) {
      debug.steps.push({ step: 'op_location_fetch_failed', error: e.message });
      return bail('op_location_unavailable');
    }

    const locStep = { step: 'op_location', url: locUrl, status: locRes.status, ok: locRes.ok };
    if (!locRes.ok) {
      debug.steps.push(locStep);
      return bail('op_location_unavailable');
    }

    let locJson;
    try {
      const text = await locRes.text();
      locStep.bodyLength = text.length;
      locStep.bodyPreview = text.slice(0, 200);
      locJson = JSON.parse(text);
    } catch (e) {
      locStep.parseError = e.message;
      debug.steps.push(locStep);
      return bail('op_location_unavailable');
    }

    // GeoJSON FeatureCollection with .features array
    const features = locJson?.features || [];
    locStep.featureCount = features.length;
    debug.steps.push(locStep);
    if (features.length === 0) return bail('no_location_for_ods');

    // Pick the first feature matching this ODS exactly
    const match = features.find(f => f?.properties?.code === ods) || features[0];
    const coords = match?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      debug.steps.push({ step: 'no_coords_in_feature' });
      return bail('no_coords');
    }
    const [lng, lat] = coords;
    debug.steps.push({ step: 'coords_extracted', lat, lng });

    const reverseUrl = `${POSTCODES_IO_BASE}/postcodes?lon=${lng}&lat=${lat}&limit=1`;
    let reverseRes;
    try {
      reverseRes = await fetch(reverseUrl, { signal: AbortSignal.timeout(5000), headers: FETCH_HEADERS });
    } catch (e) {
      debug.steps.push({ step: 'postcodes_io_fetch_failed', error: e.message });
      return bail('reverse_geocode_failed', { lat, lng });
    }
    if (!reverseRes.ok) {
      debug.steps.push({ step: 'postcodes_io', status: reverseRes.status, ok: false });
      return bail('reverse_geocode_failed', { lat, lng });
    }

    const reverseJson = await reverseRes.json();
    debug.steps.push({ step: 'postcodes_io', resultCount: reverseJson?.result?.length || 0 });

    const nearest = reverseJson?.result?.[0];
    if (!nearest) return bail('no_nearby_postcode', { lat, lng });

    return NextResponse.json({
      postcode: nearest.postcode,
      // Named so callers can tell an exact postcode from a nearest-neighbour
      // guess — this one is the nearest postcode to the practice's map pin.
      source: 'openprescribing_reverse_geocode',
      adminDistrict: nearest.admin_district,
      region: nearest.region,
      country: nearest.country,
      lat,
      lng,
      debug,
    });
  };

  try {
    // ─── Primary: NHS ODS ────────────────────────────────────────────────
    const { practice, error, url } = await getPracticeByOdsCode(ods);
    debug.steps.push({ step: 'ods', url, found: !!practice, error: error || null });

    if (practice?.postcode) {
      return NextResponse.json({
        postcode: practice.postcode,
        source: 'nhs_ods',
        adminDistrict: practice.town || null,
        region: practice.county || null,
        country: practice.country || null,
        debug,
      });
    }

    return await reverseGeocodeFallback(error || 'no_postcode_in_ods');
  } catch (e) {
    return NextResponse.json({
      postcode: null,
      error: e?.message || 'lookup_failed',
      debug,
    }, { status: 500 });
  }
}
