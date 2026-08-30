// ═══════════════════════════════════════════════════════════════════════════
// playwright.config.js — end-to-end tests
// ═══════════════════════════════════════════════════════════════════════════
//
// Scope: these are guard-rail tests, not a full regression suite. They cover
// the things that are (a) easy to break silently and (b) expensive to notice
// late — the security headers, the anonymous routing chain, and the shape of
// the one endpoint we serve without authentication.
//
// They deliberately do NOT sign in. Auth would need a seeded test practice in
// Supabase, and pointing a test runner at the live project is not something
// to do casually. Everything here passes against a bare `npm run dev`.
//
// Run:  npm run test:e2e            (headless, reuses a dev server if up)
//       npm run test:e2e:ui         (interactive picker)
//       PLAYWRIGHT_BASE_URL=https://preview.gpdash.net npm run test:e2e
//
// Note the browser is Chromium only — the practice runs desktop Chrome/Edge,
// and pulling WebKit + Firefox costs ~400MB for coverage we don't use.

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Only manage a dev server when pointed at localhost. Against a deployed
// URL, starting one locally would be pointless and would fight for :3000.
const isLocal = baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Pure-logic tests over lib/. No browser, no server - they import the
    // modules directly. Kept first so a logic regression surfaces before
    // anything spends time booting Chromium.
    { name: 'unit', testDir: './tests/unit' },
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
  ],

  // PW_UNIT=1 skips the dev server entirely - unit tests never touch it.
  ...(isLocal && process.env.PW_UNIT !== '1' ? {
    webServer: {
      command: 'npm run dev',
      url: baseURL,
      // Reuse the server you already have open in another terminal rather
      // than failing on a port clash. In CI there is never one to reuse.
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  } : {}),
});
