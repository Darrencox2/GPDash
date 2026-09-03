// ═══════════════════════════════════════════════════════════════════════════
// next.config.js — Next.js configuration + HTTP security headers
// ═══════════════════════════════════════════════════════════════════════════
//
// Every response from the app ships with the headers below. They're our
// front-line depth defence against XSS, clickjacking, MIME sniffing, data
// exfiltration via referrers, and browser feature abuse. RLS + Supabase
// auth do the heavy lifting for data isolation; these headers cover the
// remaining browser-level attack surface.
//
// Tested against the v4 wizard flow + dashboard on preview.gpdash.net.
// If you add a new external host (analytics, CDN, embed), update the CSP
// `connect-src` / `img-src` / `script-src` accordingly — without it, the
// browser will block the request and console-log a CSP violation.
//
// CSP allowlist rationale:
//   default-src 'self'         — everything not overridden defaults to same-origin
//   script-src 'self'          — only our own JS; 'unsafe-inline' is required
//      'unsafe-inline'           by Next.js 14 for the hydration bootstrap script
//                                inline in the streamed RSC payload. Could be
//                                tightened with per-request nonces via middleware
//                                but that's a heavier lift; this is still a major
//                                step up from no CSP at all.
//      'unsafe-eval'             DEV ONLY (see isDev below) — React Refresh
//                                needs eval() for hot updates. Never emitted
//                                in a production build.
//   style-src                  — same-origin + inline (we use style={{...}} pervasively)
//      'unsafe-inline'           + Bunny Fonts stylesheet (privacy-respecting
//      fonts.bunny.net           Google Fonts drop-in — no IP tracking, EU-hosted,
//                                GDPR-compliant)
//   font-src                   — Bunny Fonts files + data: URIs (Next.js
//      fonts.bunny.net           inlines some small fonts as data URIs)
//      data:
//   img-src 'self' data: blob: — own images + base64 + Blob URLs (file previews)
//   connect-src                — XHR/fetch destinations: own origin (API routes),
//      *.supabase.co             Supabase auth/db/realtime (any project subdomain),
//      api.postcodes.io          postcodes.io (UK postcode lookup used in
//      api.open-meteo.com        the practice details step), and open-meteo,
//                                which lib/demandPredictor.js calls for the
//                                forecast. That last one was MISSING until
//                                v4.121.0: every weather fetch was blocked by
//                                this header, the predictor silently ran
//                                weather-free, and the violation reports went
//                                to a console.warn nobody read.
//   frame-src 'none'           — we never embed iframes
//   frame-ancestors 'none'     — and we never get embedded (clickjacking)
//   base-uri 'self'            — block <base href> injection attacks
//   form-action 'self'         — block form-redirect exfil to external hosts
//   object-src 'none'          — block <object>, <embed>, plugin loaders
//   upgrade-insecure-requests  — auto-rewrite any stray http:// references to https
//
// HSTS notes:
//   max-age=63072000 = 2 years (Chrome HSTS preload list requirement is 1+ years)
//   includeSubDomains = required for preload-list eligibility
//   preload = signals intent to be added to the HSTS preload list at
//             https://hstspreload.org/. Doing so means the browser refuses
//             plain-http connections to gpdash.net even on first visit.

// Dev-only CSP relaxation: `next dev` compiles with React Refresh, which
// evaluates hot-update modules via eval() — blocked outright by a CSP
// without 'unsafe-eval', so the dashboard renders once and then dies on
// the first edit. NODE_ENV is 'development' only under `next dev`;
// `next build` (local gate and Vercel alike) sets 'production', so the
// shipped header is byte-identical to what it was before this flag.
const isDev = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  // ─── HSTS ─────────────────────────────────────────────────────────────
  // Tells the browser: never make a plaintext request to this host again,
  // for the next 2 years. Eligible for the HSTS preload list once we're
  // confident the cert + redirect setup is correct.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },

  // ─── MIME sniffing ────────────────────────────────────────────────────
  // Prevents browsers guessing at content types (a CSS file being interpreted
  // as JS, an upload being treated as HTML, etc).
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },

  // ─── Clickjacking (legacy header for older browsers) ──────────────────
  // Modern browsers respect CSP frame-ancestors instead, but X-Frame-Options
  // is still honoured by IE11 and old Android browsers. No cost to both.
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },

  // ─── Referrer policy ──────────────────────────────────────────────────
  // When a user follows a link from gpdash.net to an external site, send
  // only the origin (no path) cross-origin. Same-origin navigations send
  // the full referrer as normal. This stops practice slugs, public tokens,
  // and query-string state leaking via the Referer header.
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },

  // ─── Permissions policy ───────────────────────────────────────────────
  // Disable every browser API we don't use. If a malicious script ever
  // does sneak through (or a future dep tries to phone home with one of
  // these), the browser refuses outright. interest-cohort disables FLoC
  // (now retired but the header is still respected by some forks).
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'interest-cohort=()',
      'payment=()',
      'usb=()',
      'accelerometer=()',
      'gyroscope=()',
      'magnetometer=()',
      'midi=()',
      'serial=()',
      'bluetooth=()',
    ].join(', '),
  },

  // ─── Content Security Policy ──────────────────────────────────────────
  // See comment block at top of file for per-directive rationale.
  //
  // Reporting: any directive violation triggers a POST to /api/csp-report.
  // We use both `report-uri` (legacy, broader browser support) and the
  // newer Reports API via the Report-To header (set separately below).
  // Modern browsers prefer Report-To if both are present.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (isDev ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
      "font-src 'self' https://fonts.bunny.net data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co https://api.postcodes.io https://api.open-meteo.com",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
      "report-uri /api/csp-report",
      "report-to csp-endpoint",
    ].join('; '),
  },

  // ─── Report-To header ─────────────────────────────────────────────────
  // Configures the newer Reports API. The 'group' name matches the
  // 'report-to' directive in the CSP above. max_age is in seconds —
  // browser remembers the endpoint for 24h between requests.
  {
    key: 'Report-To',
    value: JSON.stringify({
      group: 'csp-endpoint',
      max_age: 86400,
      endpoints: [{ url: '/api/csp-report' }],
    }),
  },

  // ─── Cross-origin isolation ───────────────────────────────────────────
  // COOP/CORP — prevent other origins from accessing our windows or our
  // resources cross-origin in unintended ways. We don't have any
  // intentional cross-origin embeds, so the strictest setting is fine.
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
];

// ─── The one intentional cross-origin embed ───────────────────────────
// /signature.png is Darren's email-signature card. It is loaded by mail
// clients from an origin that is by definition not ours, so the blanket
// CORP: same-origin above would let a browser-based client refuse to
// render it. This asset — and only this asset — opts out.
//
// Emitting CORP twice for one response is worse than either value alone
// (browsers see a duplicate header and block), so the blanket rule below
// excludes this path rather than relying on override precedence, which
// Next does not document.
const signatureHeaders = [
  ...securityHeaders.filter((h) => h.key !== 'Cross-Origin-Resource-Policy'),
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'cross-origin',
  },
  {
    // Immutable content at a stable URL — let mail proxies cache it hard.
    key: 'Cache-Control',
    value: 'public, max-age=31536000, immutable',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/signature.png',
        headers: signatureHeaders,
      },
      {
        // Apply to every other route — pages, API endpoints, static assets.
        // Headers like CSP have no effect on JSON responses but the others
        // (HSTS, X-Content-Type-Options) still apply usefully.
        source: '/((?!signature\\.png$).*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
