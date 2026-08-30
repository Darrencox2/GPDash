// ═══════════════════════════════════════════════════════════════════════════
// lib/rate-limit.js — per-IP / per-user API rate limiting
// ═══════════════════════════════════════════════════════════════════════════
//
// Why this exists: Supabase rate-limits its auth endpoints, and Vercel
// has its own platform-level rate limits at the edge. Neither protects
// our own API routes from being spammed by an authenticated user with
// a script. A single misconfigured client (or hostile one) could pound
// /api/v4-import with a hundred req/sec and rack up real Postgres pain.
//
// This module exposes a tiny wrapper around @upstash/ratelimit that:
//   1. Lazily initialises the limiters (no Redis round-trip at import time)
//   2. Falls back to "allow + warn" if Redis isn't configured (so local
//      dev without Upstash env vars still works)
//   3. Returns the standard X-RateLimit-* headers so clients can back off
//      politely instead of just retrying blindly
//
// Algorithm: sliding window. More accurate than fixed window (no burst at
// the boundary) but slightly more Redis work per request. For our QPS
// that's fine.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Redis client (singleton) ──────────────────────────────────────────
// Reuse one Redis client across requests in the same lambda instance.
// @upstash/redis is HTTP-based so there's no connection pool to worry
// about — but the object construction does some env parsing we'd rather
// not repeat per request.
let redisInstance = null;
function getRedis() {
  if (redisInstance) return redisInstance;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redisInstance = new Redis({ url, token });
  return redisInstance;
}

// ─── Limiter cache ─────────────────────────────────────────────────────
// One Ratelimit instance per (prefix, limit, window) tuple. We cache
// them because Ratelimit constructs internal sliding-window helpers
// that we don't need to rebuild per request.
const limiterCache = new Map();

function getLimiter(prefix, limit, window) {
  const cacheKey = `${prefix}:${limit}:${window}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const redis = getRedis();
  if (!redis) return null;

  const limiter = new Ratelimit({
    redis,
    prefix,
    limiter: Ratelimit.slidingWindow(limit, window),
    // analytics:true sends extra Redis traffic for the Upstash dashboard.
    // We don't currently use those dashboards so keep it off — saves
    // ~1 Redis op per request.
    analytics: false,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

// ─── Standard limit configurations ─────────────────────────────────────
// Each entry is an endpoint category with its own bucket. Sized for the
// expected legitimate usage of each endpoint × 2-3× headroom; anything
// past that is almost certainly script abuse.
export const RATE_LIMITS = {
  // Heavy one-shot data import (v3 → v4 migration). Legitimate use is
  // maybe once per practice ever — 3/min is more than enough.
  import: { prefix: 'rl:import', limit: 3, window: '60 s' },

  // Per-practice external sync (TeamNet calendar fetch + DB writes).
  // Legitimate use: manual "Sync now" click + the daily cron. 10/min
  // is comfortable headroom over normal use.
  practiceSync: { prefix: 'rl:practice-sync', limit: 10, window: '60 s' },

  // Per-practice compute (demand seeding from NHS baseline). One call
  // per setup. 20/min is plenty.
  practiceCompute: { prefix: 'rl:practice-compute', limit: 20, window: '60 s' },

  // Public unauthenticated proxy to OpenPrescribing search. Used during
  // practice creation when picking your practice by name — the user
  // types and we debounce a search per few keystrokes. 60/min is
  // generous for typing-as-you-go (which would already be debounced
  // client-side) but stops a script enumerating their entire dataset.
  publicLookup: { prefix: 'rl:lookup', limit: 60, window: '60 s' },

  // Admin sensitive operations (impersonation). Even legit admin use
  // is rare; 10/min stops anything that looks like enumeration.
  adminSensitive: { prefix: 'rl:admin-sensitive', limit: 10, window: '60 s' },

  // Admin frequent operations (generate-link for users). An admin might
  // batch-generate links for 20 users at a time. 30/min allows that
  // burst without making them wait.
  adminFrequent: { prefix: 'rl:admin-frequent', limit: 30, window: '60 s' },
};

// ─── IP extraction ─────────────────────────────────────────────────────
// For anonymous routes, the only stable identifier is the IP. Vercel
// strips the original client IP into x-forwarded-for; first entry is
// the real client (subsequent entries are intermediate proxies).
//
// Falls back to a literal string if nothing's set — local dev sees
// 'unknown' for all requests, which means they all share a bucket.
// In prod, both Vercel and any sane reverse proxy will set
// x-forwarded-for, so this fallback should never trigger in practice.
export function getRateLimitIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

// ─── Main entry point ──────────────────────────────────────────────────
// Returns an object describing whether the request is allowed plus the
// standard X-RateLimit-* response headers. Caller decides what to do
// with a denied request (typically: return 429 with Retry-After header).
//
// Fails OPEN if Redis is unavailable — we'd rather serve legitimate
// users than block everyone during a Redis outage. The console.warn
// surfaces the situation; if you don't trust the env, watch your logs.

// ─── Visibility for the fail-open path ─────────────────────────────────
// Deduped per prefix per hour so a busy endpoint cannot flood app_errors,
// and entirely best-effort: reporting must never break the request it is
// reporting on, least of all inside a rate limiter.
const reportedAt = new Map();
function reportDisabled(prefix, detail) {
  try {
    const now = Date.now();
    if (now - (reportedAt.get(prefix) || 0) < 3600_000) return;
    reportedAt.set(prefix, now);
    import('@/utils/supabase/admin')
      .then(({ createAdminClient }) => {
        const admin = createAdminClient();
        if (!admin) return;
        return admin.from('app_errors').insert({
          source: 'ratelimit',
          message: `Rate limiting is NOT active for ${prefix}` + (detail ? ` (${detail})` : ' — Redis not configured'),
          path: prefix,
        });
      })
      .catch(() => {});
  } catch { /* never throw from the limiter */ }
}

export async function checkRateLimit(limiterConfig, identifier) {
  const limiter = getLimiter(limiterConfig.prefix, limiterConfig.limit, limiterConfig.window);
  if (!limiter) {
    console.warn(`[rate-limit] Redis not configured — allowing request to ${limiterConfig.prefix}`);
    // A console.warn is how the blocked weather API hid for months. Failing
    // open is the right call, but doing it INVISIBLY is not: this surfaces on
    // /v4/admin/errors so "is rate limiting actually on?" is answerable.
    reportDisabled(limiterConfig.prefix);
    return { allowed: true, headers: {}, retryAfterSeconds: null, configured: false };
  }
  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    const headers = {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(reset),
    };
    if (success) return { allowed: true, headers, retryAfterSeconds: null, configured: true };
    // Compute Retry-After in seconds. `reset` from @upstash/ratelimit is
    // a unix-ms timestamp of when the window slides far enough that this
    // request would succeed.
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { allowed: false, headers, retryAfterSeconds, configured: true };
  } catch (e) {
    // Redis blip / network issue. Fail open with a warning — same
    // rationale as the "not configured" branch above.
    console.warn(`[rate-limit] Limit check failed for ${limiterConfig.prefix}: ${e?.message || 'unknown error'} — allowing request`);
    reportDisabled(limiterConfig.prefix, e?.message);
    return { allowed: true, headers: {}, retryAfterSeconds: null, configured: false };
  }
}
