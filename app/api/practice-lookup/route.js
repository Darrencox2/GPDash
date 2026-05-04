// /api/practice-lookup
//
// Given a UK postcode, returns the GP practices nearest to it with their
// list size from NHS Digital (via OpenPrescribing).
//
// Approach:
//   1. postcodes.io  → lat/lng for the postcode
//   2. OpenPrescribing /org_location/?org_type=practice → GeoJSON of all
//      UK GP practice coordinates (cached at module scope for 24h)
//   3. Haversine distance from input lat/lng to each practice; return
//      the 5 nearest
//   4. OpenPrescribing /org_details for each → list size + as-of date
//
// Tried previously: NHS Spine ORD REST API (HTTP 406 regardless of headers)
// and the NHS FHIR Organization endpoint (HTTP 403). Both block our
// requests. Geographic search via OpenPrescribing's GeoJSON is more
// reliable.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POSTCODES_IO_BASE = 'https://api.postcodes.io';
const OPENPRESCRIBING_BASE = 'https://openprescribing.net/api/1.0';
const MAX_PRACTICES = 5;
const PRACTICES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_HEADERS = {
  'User-Agent': 'GPDash/1.0',
  'Accept': 'application/json',
};

// Module-level cache for the all-practices GeoJSON. Persists for the
// lifetime of the serverless function instance.
let cachedPractices = null;
let cachedAt = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const postcodeRaw = (searchParams.get('postcode') || '').trim().toUpperCase();
  const currentPracticeId = searchParams.get('currentPracticeId') || null;
  if (!postcodeRaw) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 });
  }

  const debug = { steps: [] };

  try {
    // ─── 1. Geocode the postcode ────────────────────────────────────
    const coords = await geocodePostcode(postcodeRaw);
    debug.steps.push({ step: 'geocode', postcode: postcodeRaw, found: !!coords });
    if (!coords) {
      return NextResponse.json({
        practices: [],
        reason: 'postcode_not_recognised',
        debug,
      });
    }

    // ─── 2. Fetch all GP practice locations ─────────────────────────
    let allPractices;
    try {
      allPractices = await getAllPracticesGeoJSON();
      debug.steps.push({
        step: 'practices_loaded',
        count: allPractices.length,
        cached: (Date.now() - cachedAt) < 1000,
      });
    } catch (e) {
      debug.steps.push({ step: 'practices_load_failed', error: e.message });
      return NextResponse.json({
        practices: [],
        reason: 'openprescribing_unavailable',
        debug,
      });
    }

    // ─── 3. Find nearest N ───────────────────────────────────────────
    const nearest = allPractices
      .map(p => ({
        ...p,
        distanceKm: haversineKm(coords.lat, coords.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_PRACTICES);
    debug.steps.push({
      step: 'nearest_picked',
      count: nearest.length,
      furthestKm: nearest.length ? nearest[nearest.length - 1].distanceKm.toFixed(2) : null,
    });

    if (nearest.length === 0) {
      return NextResponse.json({
        practices: [],
        reason: 'no_practices_in_dataset',
        debug,
      });
    }

    // ─── 4. Check our DB for existing claims ────────────────────────
    const odsCodes = nearest.map(p => p.odsCode).filter(Boolean);
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

    // ─── 5. Enrich with list size + db flags ────────────────────────
    const enriched = await Promise.all(nearest.map(async (p) => {
      const existing = existingByOds.get(p.odsCode);
      const isMyself = existing && currentPracticeId && existing.id === currentPracticeId;
      const result = {
        odsCode: p.odsCode,
        name: p.name,
        status: 'Active',
        distanceKm: Number(p.distanceKm.toFixed(2)),
        listSize: null,
        listSizeAsOf: null,
        listSizeError: null,
        existsInDatabase: !!existing,
        unavailable: !!existing && !isMyself,
        isCurrentPractice: !!isMyself,
      };
      try {
        const url = `${OPENPRESCRIBING_BASE}/org_details/?org_type=practice&keys=total_list_size&org=${encodeURIComponent(p.odsCode)}&format=json`;
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
      source: 'openprescribing_geo',
      coords,
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

/**
 * Geocode a UK postcode to lat/lng using postcodes.io. Free, no auth.
 */
async function geocodePostcode(postcode) {
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d{1,2}[A-Z]?\d[A-Z]{2}$/.test(cleaned)) return null;
  try {
    const res = await fetch(
      `${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(cleaned)}`,
      { signal: AbortSignal.timeout(5000), headers: FETCH_HEADERS }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status !== 200 || !json.result) return null;
    return {
      lat: json.result.latitude,
      lng: json.result.longitude,
      postcode: json.result.postcode,
      adminDistrict: json.result.admin_district,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all UK GP practice locations as a flat array from OpenPrescribing.
 * Cached at module scope for 24h. The response is GeoJSON FeatureCollection.
 */
async function getAllPracticesGeoJSON() {
  if (cachedPractices && (Date.now() - cachedAt) < PRACTICES_CACHE_TTL_MS) {
    return cachedPractices;
  }
  const url = `${OPENPRESCRIBING_BASE}/org_location/?org_type=practice&format=json`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: FETCH_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`openprescribing_org_location_${res.status}`);
  }
  const json = await res.json();
  const features = json?.features || [];
  const practices = features.map(f => ({
    odsCode: f.properties?.code,
    name: f.properties?.name,
    lng: f.geometry?.coordinates?.[0],
    lat: f.geometry?.coordinates?.[1],
  })).filter(p => p.odsCode && p.lat != null && p.lng != null);
  cachedPractices = practices;
  cachedAt = Date.now();
  return practices;
}

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
