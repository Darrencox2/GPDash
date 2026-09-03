// Unit tests for lib/rate-limit.js — the bucket definitions and the IP
// extraction behind every anonymous endpoint.
//
// The stakes: getRateLimitIp decides whose bucket a request lands in. Read the
// wrong header and every request shares one bucket (one script locks out the
// whole practice) or each request gets its own (the limiter does nothing at
// all, silently). x-forwarded-for is attacker-influenced on the way in, which
// is why only the first entry — the one Vercel writes — is trusted.
import { test, expect } from '@playwright/test';
import { getRateLimitIp, RATE_LIMITS } from '../../lib/rate-limit.js';

// Minimal stand-in for the bits of Request the function touches.
const req = (headers) => ({
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

test.describe('getRateLimitIp', () => {
  test('takes the client IP from x-forwarded-for', () => {
    expect(getRateLimitIp(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  test('takes the FIRST entry when proxies have appended their own', () => {
    // Later entries are the proxy chain. Using the last one would put every
    // request from behind the same proxy into a single bucket.
    expect(getRateLimitIp(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })))
      .toBe('203.0.113.7');
  });

  test('trims whitespace around the entry', () => {
    expect(getRateLimitIp(req({ 'x-forwarded-for': '  203.0.113.7  , 70.41.3.18' }))).toBe('203.0.113.7');
  });

  test('falls back to x-real-ip when there is no forwarded header', () => {
    expect(getRateLimitIp(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  test('prefers x-forwarded-for over x-real-ip', () => {
    expect(getRateLimitIp(req({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.4' })))
      .toBe('203.0.113.7');
  });

  test('an empty or comma-only forwarded header falls through rather than bucketing on ""', () => {
    // An empty identifier would collapse every such request into one shared
    // bucket keyed on the empty string.
    expect(getRateLimitIp(req({ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(getRateLimitIp(req({ 'x-forwarded-for': '  ,  ', 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  test('with no headers at all it returns a single named bucket', () => {
    // Local dev only. Everything shares 'unknown', which is deliberate: it is
    // obvious in a log, and it fails closed rather than handing each request a
    // fresh allowance.
    expect(getRateLimitIp(req({}))).toBe('unknown');
  });
});

test.describe('RATE_LIMITS', () => {
  test('every bucket has a distinct prefix', () => {
    // A shared prefix silently merges two endpoints' allowances, so the
    // tighter of the two stops being enforced.
    const prefixes = Object.values(RATE_LIMITS).map(c => c.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  test('every bucket is fully specified', () => {
    for (const [name, cfg] of Object.entries(RATE_LIMITS)) {
      expect(cfg.prefix, `${name}.prefix`).toMatch(/^rl:/);
      expect(typeof cfg.limit, `${name}.limit`).toBe('number');
      expect(cfg.limit, `${name}.limit`).toBeGreaterThan(0);
      expect(cfg.window, `${name}.window`).toMatch(/^\d+\s*[smhd]$/);
    }
  });

  test('the sensitive admin bucket stays tighter than the frequent one', () => {
    // Impersonation is the one that matters. If these ever invert, an
    // enumeration attempt gets the generous allowance.
    expect(RATE_LIMITS.adminSensitive.limit).toBeLessThan(RATE_LIMITS.adminFrequent.limit);
  });

  test('the one-shot import bucket is the tightest of all', () => {
    for (const [name, cfg] of Object.entries(RATE_LIMITS)) {
      if (name === 'import') continue;
      expect(RATE_LIMITS.import.limit, `import vs ${name}`).toBeLessThanOrEqual(cfg.limit);
    }
  });
});
