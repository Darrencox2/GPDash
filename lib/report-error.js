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

  // A failed chunk fetch often surfaces outside React, where no error
  // boundary will ever see it — a lazy import during navigation, for
  // instance. Reload once so the tab picks up the current build; the
  // sessionStorage guard stops a genuinely missing file looping forever.
  const recoverIfStale = (err) => {
    try {
      const s = `${err?.name || ''} ${err?.message || ''}`;
      if (!/ChunkLoadError|Loading chunk \d+ failed|Failed to load chunk|Importing a module script failed|error loading dynamically imported module/i.test(s)) return false;
      const KEY = 'gpdash-stale-reload';
      if (sessionStorage.getItem(KEY)) return false;
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    } catch { return false; }
  };

  window.addEventListener('error', (e) => {
    const err = e?.error || e?.message;
    if (recoverIfStale(e?.error)) return;
    reportError(err, { source: 'unhandled' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (recoverIfStale(e?.reason)) return;
    reportError(e?.reason, { source: 'unhandled' });
  });

  // A clean load means the tab is current — clear the guard so a future
  // stale build can recover again.
  window.addEventListener('load', () => {
    try { setTimeout(() => sessionStorage.removeItem('gpdash-stale-reload'), 4000); } catch {}
  });
}
