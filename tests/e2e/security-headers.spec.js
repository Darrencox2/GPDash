// Security headers are set in next.config.js and apply to every response.
// They are invisible in normal use, so a regression would ship unnoticed —
// which is exactly what these assertions are for.
import { test, expect } from '@playwright/test';

// Directives that must hold in EVERY environment. 'unsafe-eval' is
// deliberately absent from this list: it is dev-only (see next.config.js
// isDev) and asserting either way here would fail in one environment or
// the other. The prod-only assertion lives in its own test below.
const REQUIRED_CSP = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

test.describe('security headers', () => {
  test('CSP is present with the non-negotiable directives', async ({ request }) => {
    const res = await request.get('/v4/login');
    const csp = res.headers()['content-security-policy'];
    expect(csp, 'CSP header missing entirely').toBeTruthy();

    for (const directive of REQUIRED_CSP) {
      expect(csp, `missing directive: ${directive}`).toContain(directive);
    }
    // script-src always allows our own JS plus the inline hydration
    // bootstrap Next.js streams into the RSC payload.
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  test("'unsafe-eval' never reaches a production build", async ({ request }) => {
    const res = await request.get('/v4/login');
    const csp = res.headers()['content-security-policy'] || '';

    // A dev server compiles with React Refresh, which needs eval(). A
    // production build must not. Detect which we are talking to from the
    // server itself rather than trusting an env var.
    //
    // The original probe was /_next/static/chunks/webpack.js. Next 16 with
    // Turbopack hashes every chunk name, so that 404s in dev too — the test
    // silently took the production branch and failed against a dev server.
    // These two are checked together so one framework change cannot repeat
    // that: a false negative here inverts the assertion, which is the worst
    // possible failure mode for this test.
    const probes = await Promise.all([
      // Path literally contains "development" — only a dev server serves it.
      request.get('/_next/static/development/_buildManifest.js').catch(() => null),
      // Dev-only error overlay endpoint; rejects a bare GET but exists.
      request.get('/__nextjs_original-stack-frames').catch(() => null),
    ]);
    const isDevServer = probes.some((r) => r && r.status() !== 404);

    if (isDevServer) {
      expect(csp, "dev needs 'unsafe-eval' or fast refresh dies").toContain("'unsafe-eval'");
    } else {
      expect(csp, "'unsafe-eval' must never ship to production").not.toContain("'unsafe-eval'");
    }
  });

  test('transport and sniffing protections are set', async ({ request }) => {
    const res = await request.get('/v4/login');
    const h = res.headers();

    expect(h['strict-transport-security']).toContain('max-age=');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBeTruthy();
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['cross-origin-resource-policy']).toBe('same-origin');
  });
});
