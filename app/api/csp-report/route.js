// ═══════════════════════════════════════════════════════════════════════════
// /api/csp-report — receive CSP violation reports from browsers
// ═══════════════════════════════════════════════════════════════════════════
//
// When a CSP directive blocks a resource, the browser can be configured to
// POST a JSON report to this endpoint. Two payload formats exist:
//
//   1. Legacy 'report-uri' (Content-Type: application/csp-report)
//      Body: { "csp-report": { "blocked-uri": "...", ... } }
//
//   2. Newer 'report-to' (Content-Type: application/reports+json)
//      Body: [ { "type": "csp-violation", "body": { ... } }, ... ]
//
// We accept both — modern browsers send the new format, older ones the
// legacy. Both get normalised and structure-logged so Vercel log search
// can find them.
//
// Why this exists:
//   1. Surface legitimate CSP misconfigurations we haven't anticipated
//      (e.g. a new font CDN, a third-party widget we added) before users
//      file bug reports about blank pages
//   2. Detect real attack attempts — if we see csp violations for
//      script-src with attacker-controlled origins, that's a signal
//   3. Tighten the CSP over time — start with a wider allowlist, watch
//      reports, narrow as confidence builds
//
// This endpoint is intentionally UNAUTHENTICATED — the browser fires
// reports without any user session. To prevent abuse we rate-limit
// aggressively and validate the payload shape before logging.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkRateLimit, getRateLimitIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Tight rate limit — browsers shouldn't report more than a handful of
// violations per page load. 30/min/IP catches debugging cases without
// allowing flood attacks.
const CSP_REPORT_LIMIT = { prefix: 'rl:csp-report', limit: 30, window: '60 s' };

export async function POST(request) {
  // Rate limit by IP — reports are unauthenticated so this is our only
  // defence against a flood. Fail-open on Redis issues (consistent
  // with the rest of our rate-limit helpers).
  const rl = await checkRateLimit(CSP_REPORT_LIMIT, `ip:${getRateLimitIp(request)}`);
  if (!rl.allowed) {
    // Return 204 even when rate-limited so misbehaving browsers don't
    // log a stream of failed retries. We're already dropping the data.
    return new NextResponse(null, { status: 204 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    // Browsers occasionally send malformed payloads. Just drop them
    // quietly — 204 No Content with no body.
    return new NextResponse(null, { status: 204 });
  }

  // Normalise both legacy ({ 'csp-report': {...} }) and modern (array of
  // { type, body }) shapes into a flat object we can log uniformly.
  let violations = [];
  if (Array.isArray(body)) {
    // Reports API format
    violations = body
      .filter(r => r?.type === 'csp-violation' && r?.body)
      .map(r => r.body);
  } else if (body?.['csp-report']) {
    // Legacy report-uri format
    violations = [body['csp-report']];
  } else if (body?.body) {
    // Single Reports API entry
    violations = [body.body];
  }

  for (const v of violations) {
    // Don't log every Chrome-extension violation — those happen because
    // installed extensions try to inject scripts. They're not real
    // issues with our app and would fill the logs. blocked-uri starting
    // with chrome-extension:// or moz-extension:// is the giveaway.
    const blocked = String(v?.['blocked-uri'] || v?.blockedURL || '');
    if (blocked.startsWith('chrome-extension://') ||
        blocked.startsWith('moz-extension://') ||
        blocked.startsWith('safari-extension://') ||
        blocked.startsWith('safari-web-extension://')) {
      continue;
    }
    // Structured log — Vercel can index/search these fields.
    // ALSO persisted below: a console.warn is where the open-meteo block
    // hid for months. Anything worth reporting is worth storing.
    console.warn('[csp-violation]', {
      documentUri: v?.['document-uri'] || v?.documentURL,
      blockedUri: blocked,
      violatedDirective: v?.['violated-directive'] || v?.effectiveDirective,
      sourceFile: v?.['source-file'] || v?.sourceFile,
      lineNumber: v?.['line-number'] || v?.lineNumber,
      sample: (v?.['script-sample'] || v?.sample || '').slice(0, 200),
      // userAgent helps diagnose browser-specific issues
      userAgent: request.headers.get('user-agent')?.slice(0, 200) || null,
    });

    // Persist to app_errors so it surfaces on /v4/admin/errors alongside
    // JS crashes. Best-effort: a reporting endpoint must never throw.
    try {
      const admin = createAdminClient();
      if (admin) {
        const directive = v?.['violated-directive'] || v?.effectiveDirective || 'unknown';
        await admin.from('app_errors').insert({
          source: 'csp',
          message: `CSP blocked ${blocked || 'a resource'} (${directive})`,
          stack: [
            v?.['source-file'] || v?.sourceFile,
            v?.['line-number'] || v?.lineNumber,
          ].filter(Boolean).join(':') || null,
          path: String(v?.['document-uri'] || v?.documentURL || '').slice(0, 500) || null,
          user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
        });
      }
    } catch (e) {
      console.warn('[csp-report] could not persist violation:', e?.message);
    }
  }

  // 204 No Content — the browser doesn't care about the response body
  // and we have nothing useful to say back.
  return new NextResponse(null, { status: 204 });
}
