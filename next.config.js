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
//   style-src                  — same-origin + inline (we use style={{...}} pervasively)
//      'unsafe-inline'           + Google Fonts stylesheet
//      fonts.googleapis.com
//   font-src                   — Google Fonts files (gstatic) + data: URIs
//      fonts.gstatic.com         (Next.js inlines some small fonts as data URIs)
//      data:
//   img-src 'self' data: blob: — own images + base64 + Blob URLs (file previews)
//   connect-src                — XHR/fetch destinations: own origin (API routes),
//      *.supabase.co             Supabase auth/db/realtime (any project subdomain),
//      api.postcodes.io          and postcodes.io (UK postcode lookup used in
//                                the practice details step)
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
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co https://api.postcodes.io",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Apply to every route — pages, API endpoints, static assets.
        // Headers like CSP have no effect on JSON responses but the others
        // (HSTS, X-Content-Type-Options) still apply usefully.
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
