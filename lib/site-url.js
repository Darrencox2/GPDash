// lib/site-url.js
//
// Returns the stable public URL of this GPDash deployment for use in
// links that LEAVE the browser (emails, share links, redirects) and
// then need to come back.
//
// The problem this solves: window.location.origin is whatever URL the
// user has in their browser bar. In Vercel that can be a transient
// per-deployment URL (e.g. gpdash-7xdj2-darrencox2.vercel.app) which
// stops resolving — DEPLOYMENT_NOT_FOUND — once newer deployments
// supersede it. Email arrives, user clicks the bake-in link a few
// hours later, gets a 404.
//
// Fix: prefer NEXT_PUBLIC_SITE_URL (a stable alias like preview.gpdash.net
// or gpdash.net, set in Vercel env vars). Fall back to window.location.
// origin only when the var isn't configured (local dev, mostly).
//
// Used for:
//   - emailRedirectTo on signUp / resetPasswordForEmail
//   - the copy-link URL on Pending Invites
//
// NOT used for:
//   - in-browser navigation, where window.location.origin is correct
//   - second-screen popups, which open the same tab/origin
//
// Env var setup (one-time per environment, in Vercel):
//   v4-rebuild branch  → NEXT_PUBLIC_SITE_URL = https://preview.gpdash.net
//   main branch        → NEXT_PUBLIC_SITE_URL = https://gpdash.net (when ready)

export function getSiteUrl() {
  // Prefer the configured stable URL — set this on Vercel.
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, ''); // strip trailing slash

  // Browser fallback. Used in dev (localhost) and as a safety net if
  // NEXT_PUBLIC_SITE_URL was forgotten — the link will at least work
  // until the deployment retires.
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // Server-side fallback for builds where neither env nor window is
  // available. Returning empty makes any callers' template strings
  // visibly broken (e.g. "/auth/callback?...") rather than silently
  // pointing at the wrong host.
  return '';
}
