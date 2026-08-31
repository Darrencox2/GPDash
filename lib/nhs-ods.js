// lib/nhs-ods.js — NHS ODS (Organisation Data Service) ORD API client.
//
// Used as the fallback for practice lookup when OpenPrescribing is
// unavailable. OpenPrescribing sat behind a Cloudflare challenge returning
// 403 to every server-side request, which stranded new-practice sign-up on
// "Enter manually" — ODS is the upstream source of truth for practice
// identity anyway, so it makes a better safety net than a cache would.
//
// Free, public, no API key, no registration. Verified returning HTTP 200
// with or without an Accept header (an earlier note in practice-lookup
// about "HTTP 406" referred to a different NHS endpoint, not this one).
//
// What ODS gives us: code, name, status, postcode, full address.
// What it does NOT give us: list size. Callers wanting patient numbers
// fall back to the nhs_oc_baseline table.

const ODS_BASE = 'https://directory.spineservices.nhs.uk/ORD/2-0-0';

// RO177 = PRESCRIBING COST CENTRE. This is the role that identifies a GP
// practice in the same code space OpenPrescribing uses (L81021 etc), so
// results stay interchangeable with the OpenPrescribing path.
//
// Do NOT switch this to RO76 ("GP PRACTICE"). RO76 exists only as a
// SECONDARY role on these records, so PrimaryRoleId=RO76 returns an empty
// list. Without the filter a name search also returns schools, care homes
// and CCG sites that happen to share the name.
const GP_PRACTICE_ROLE = 'RO177';

const FETCH_HEADERS = {
  'User-Agent': 'GPDash/1.0',
  'Accept': 'application/json',
};

// ODS codes are alphanumeric, 5-6 chars for practices (L81021, A81015).
// Used to decide whether a typed query is worth a direct code lookup —
// deliberately loose, since a miss just costs one 404.
export function looksLikeOdsCode(query) {
  return /^[A-Za-z0-9]{5,6}$/.test((query || '').trim());
}

// Shared shape with the OpenPrescribing candidates ({ code, name }) so the
// enrichment path downstream does not care which source produced a row.
function toCandidate(org) {
  if (!org || !org.OrgId || !org.Name) return null;
  return {
    code: org.OrgId,
    name: org.Name,
    postcode: org.PostCode || null,
    status: org.Status || null,
  };
}

// Name substring search, active GP practices only. Matches mid-name, not
// just prefixes ("health centre" finds "CROSSFELL HEALTH CENTRE").
export async function searchPracticesByName(name, { limit = 10, timeoutMs = 8000 } = {}) {
  const q = (name || '').trim();
  if (q.length < 2) return { practices: [], error: 'query_too_short' };

  const url = `${ODS_BASE}/organisations?Name=${encodeURIComponent(q)}`
    + `&PrimaryRoleId=${GP_PRACTICE_ROLE}&Status=Active&Limit=${encodeURIComponent(limit)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: FETCH_HEADERS });
    if (!res.ok) return { practices: [], error: `ods_${res.status}`, url };
    const json = await res.json();
    const practices = (json?.Organisations || []).map(toCandidate).filter(Boolean).slice(0, limit);
    return { practices, url };
  } catch (e) {
    return { practices: [], error: e?.message || 'ods_fetch_failed', url };
  }
}

// Single practice by ODS code. The name-search endpoint does NOT match on
// code (?Name=L81021 returns nothing), so a code lookup has to go through
// the per-organisation detail endpoint, which 404s cleanly on a bad code.
export async function getPracticeByOdsCode(code, { timeoutMs = 8000 } = {}) {
  const ods = (code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(ods)) return { practice: null, error: 'invalid_ods' };

  const url = `${ODS_BASE}/organisations/${encodeURIComponent(ods)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: FETCH_HEADERS });
    if (res.status === 404) return { practice: null, error: 'not_found', url };
    if (!res.ok) return { practice: null, error: `ods_${res.status}`, url };

    const org = (await res.json())?.Organisation;
    if (!org) return { practice: null, error: 'empty_response', url };

    // The detail endpoint nests things differently from the search endpoint:
    // the code lives in OrgId.extension and the postcode under GeoLoc.Location.
    const roles = org.Roles?.Role || [];
    const isGpPractice = (Array.isArray(roles) ? roles : [roles])
      .some(r => r?.id === GP_PRACTICE_ROLE);
    if (!isGpPractice) return { practice: null, error: 'not_a_gp_practice', url };

    const loc = org.GeoLoc?.Location || {};
    return {
      practice: {
        code: org.OrgId?.extension || ods,
        name: org.Name || null,
        postcode: loc.PostCode || null,
        status: org.Status || null,
        addressLine1: loc.AddrLn1 || null,
        town: loc.Town || null,
        county: loc.County || null,
        country: loc.Country || null,
      },
      url,
    };
  } catch (e) {
    return { practice: null, error: e?.message || 'ods_fetch_failed', url };
  }
}
