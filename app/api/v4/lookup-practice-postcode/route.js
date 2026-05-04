// /api/v4/lookup-practice-postcode
//
// Given an ODS code, returns the practice's postcode by:
//   1. Querying OpenPrescribing's org_location for lat/lng
//   2. Reverse-geocoding via postcodes.io to find the nearest postcode
//
// Used by the setup wizard immediately after a practice is picked, so the
// postcode field auto-fills (no manual entry needed in the common case).
//
// Returns null postcode if either step fails — caller should fall back to
// asking the user to enter manually.

import { NextResponse } from 'next/server';

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

  const debug = { steps: [] };

  try {
    // ─── Step 1: Get lat/lng from OpenPrescribing org_location ──────────
    // Query by ODS code (q parameter). Without q, the endpoint returns
    // empty — we tested this. With q=ODS, we expect a single feature back.
    const locUrl = `${OPENPRESCRIBING_BASE}/org_location/?q=${encodeURIComponent(ods)}&org_type=practice`;
    let locRes;
    try {
      locRes = await fetch(locUrl, {
        signal: AbortSignal.timeout(8000),
        headers: FETCH_HEADERS,
      });
    } catch (e) {
      debug.steps.push({ step: 'op_location_fetch_failed', error: e.message });
      return NextResponse.json({ postcode: null, debug }, { status: 200 });
    }

    const locStep = { step: 'op_location', url: locUrl, status: locRes.status, ok: locRes.ok };
    if (!locRes.ok) {
      debug.steps.push(locStep);
      return NextResponse.json({ postcode: null, debug }, { status: 200 });
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
      return NextResponse.json({ postcode: null, debug }, { status: 200 });
    }

    // GeoJSON FeatureCollection with .features array
    const features = locJson?.features || [];
    locStep.featureCount = features.length;
    debug.steps.push(locStep);

    if (features.length === 0) {
      return NextResponse.json({ postcode: null, reason: 'no_location_for_ods', debug });
    }

    // Pick the first feature matching this ODS exactly
    const match = features.find(f => f?.properties?.code === ods) || features[0];
    const coords = match?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      debug.steps.push({ step: 'no_coords_in_feature' });
      return NextResponse.json({ postcode: null, reason: 'no_coords', debug });
    }
    const [lng, lat] = coords;
    debug.steps.push({ step: 'coords_extracted', lat, lng });

    // ─── Step 2: Reverse-geocode via postcodes.io ──────────────────────
    const reverseUrl = `${POSTCODES_IO_BASE}/postcodes?lon=${lng}&lat=${lat}&limit=1`;
    let reverseRes;
    try {
      reverseRes = await fetch(reverseUrl, {
        signal: AbortSignal.timeout(5000),
        headers: FETCH_HEADERS,
      });
    } catch (e) {
      debug.steps.push({ step: 'postcodes_io_fetch_failed', error: e.message });
      return NextResponse.json({ postcode: null, debug, lat, lng }, { status: 200 });
    }

    if (!reverseRes.ok) {
      debug.steps.push({ step: 'postcodes_io', status: reverseRes.status, ok: false });
      return NextResponse.json({ postcode: null, debug, lat, lng }, { status: 200 });
    }

    const reverseJson = await reverseRes.json();
    debug.steps.push({ step: 'postcodes_io', resultCount: reverseJson?.result?.length || 0 });

    const nearest = reverseJson?.result?.[0];
    if (!nearest) {
      return NextResponse.json({ postcode: null, reason: 'no_nearby_postcode', debug, lat, lng });
    }

    return NextResponse.json({
      postcode: nearest.postcode,
      adminDistrict: nearest.admin_district,
      region: nearest.region,
      country: nearest.country,
      lat,
      lng,
      debug,
    });
  } catch (e) {
    return NextResponse.json({
      postcode: null,
      error: e?.message || 'lookup_failed',
      debug,
    }, { status: 500 });
  }
}
