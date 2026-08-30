// Client-side crash reporting.
//
// One job: get an error to /api/v4/client-error without ever becoming a
// second error. Every failure path here is swallowed on purpose — an error
// reporter that throws is worse than no reporter at all.

import { APP_VERSION } from '@/lib/version';

// Same message repeatedly (a render loop) should not write a row per frame.
const seen = new Map();
const DEDUPE_MS = 60_000;

export function reportError(error, { source = 'client', componentStack = null, practiceId = null } = {}) {
  try {
    if (typeof window === 'undefined') return;
    const message = String(error?.message || error || '').slice(0, 2000);
    if (!message) return;

    const now = Date.now();
    const last = seen.get(message);
    if (last && now - last < DEDUPE_MS) return;
    seen.set(message, now);

    const payload = JSON.stringify({
      source,
      message,
      stack: error?.stack ? String(error.stack).slice(0, 8000) : null,
      componentStack: componentStack ? String(componentStack).slice(0, 8000) : null,
      path: window.location?.pathname || null,
      appVersion: APP_VERSION,
      practiceId,
    });

    // sendBeacon survives the page being torn down by the crash. Fetch is the
    // fallback where it is unavailable or refuses the payload.
    const sent = navigator.sendBeacon?.(
      '/api/v4/client-error',
      new Blob([payload], { type: 'application/json' })
    );
    if (!sent) {
      fetch('/api/v4/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* never let reporting break the app */ }
}

// Catches what React error boundaries cannot: errors outside render, and
// rejected promises with no handler. Mounted once, from ErrorReporter.
export function installGlobalErrorReporting() {
  if (typeof window === 'undefined' || window.__gpdashErrorHooked) return;
  window.__gpdashErrorHooked = true;
  window.addEventListener('error', (e) => reportError(e?.error || e?.message, { source: 'unhandled' }));
  window.addEventListener('unhandledrejection', (e) => reportError(e?.reason, { source: 'unhandled' }));
}
