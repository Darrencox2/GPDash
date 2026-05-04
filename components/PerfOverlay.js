'use client';

// PerfOverlay — debug overlay showing where load time goes.
// Activated by adding ?debug=perf to any URL.
//
// Server-Timing headers get stripped by Vercel, so we pass timings as a
// prop from the server component instead. Client-side timings come from
// the Performance API (Navigation Timing + Paint Timing).

import { useEffect, useState } from 'react';

export default function PerfOverlay({ serverTimings }) {
  const [clientTimings, setClientTimings] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Wait one tick for Performance API to settle
    const collect = () => {
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const fp = paints.find(p => p.name === 'first-paint');
        const fcp = paints.find(p => p.name === 'first-contentful-paint');

        // LCP fires async; observe it
        let lcp = null;
        try {
          const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
          if (lcpEntries.length) lcp = lcpEntries[lcpEntries.length - 1].startTime;
        } catch {}

        // Approximate "hydration done" — the time we're running this effect
        const hydratedAt = performance.now();

        setClientTimings({
          ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
          download: nav ? Math.round(nav.responseEnd - nav.responseStart) : null,
          domInteractive: nav ? Math.round(nav.domInteractive - nav.responseEnd) : null,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.responseEnd) : null,
          loadEvent: nav ? Math.round(nav.loadEventEnd - nav.responseEnd) : null,
          firstPaint: fp ? Math.round(fp.startTime) : null,
          firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
          largestContentfulPaint: lcp ? Math.round(lcp) : null,
          hydrated: Math.round(hydratedAt),
          totalNavToHydrated: nav ? Math.round(hydratedAt - 0) : null,  // performance.now() is relative to navigationStart
          transferSize: nav?.transferSize || null,
          encodedBodySize: nav?.encodedBodySize || null,
          decodedBodySize: nav?.decodedBodySize || null,
        });
      } catch (e) {
        setClientTimings({ error: String(e) });
      }
    };

    // Wait for load event so all metrics are settled
    if (document.readyState === 'complete') {
      setTimeout(collect, 50);
    } else {
      window.addEventListener('load', () => setTimeout(collect, 50), { once: true });
    }
  }, []);

  const region = serverTimings?.region || 'unknown';
  const isCold = serverTimings?.coldStart;

  const allMetrics = {
    'SERVER (in-function timings)': {
      'Region': region,
      'Cold start': isCold ? 'YES (first hit)' : 'no (warm)',
      'Auth + 9 queries (parallel)': serverTimings?.queries != null ? `${serverTimings.queries} ms` : '—',
      'Shape transform': serverTimings?.shape != null ? `${serverTimings.shape} ms` : '—',
      'Total server time': serverTimings?.total != null ? `${serverTimings.total} ms` : '—',
    },
    'NETWORK': {
      'TTFB (server work + transit)': clientTimings?.ttfb != null ? `${clientTimings.ttfb} ms` : '—',
      'Response download': clientTimings?.download != null ? `${clientTimings.download} ms` : '—',
      'HTML size (transferred)': clientTimings?.transferSize ? `${(clientTimings.transferSize / 1024).toFixed(1)} KB` : '—',
      'HTML size (decoded)': clientTimings?.decodedBodySize ? `${(clientTimings.decodedBodySize / 1024).toFixed(1)} KB` : '—',
    },
    'BROWSER (after HTML arrives)': {
      'DOM interactive': clientTimings?.domInteractive != null ? `${clientTimings.domInteractive} ms` : '—',
      'DOM content loaded': clientTimings?.domContentLoaded != null ? `${clientTimings.domContentLoaded} ms` : '—',
      'First paint': clientTimings?.firstPaint != null ? `${clientTimings.firstPaint} ms` : '—',
      'First contentful paint': clientTimings?.firstContentfulPaint != null ? `${clientTimings.firstContentfulPaint} ms` : '—',
      'Largest contentful paint': clientTimings?.largestContentfulPaint != null ? `${clientTimings.largestContentfulPaint} ms` : '—',
      'Load event done': clientTimings?.loadEvent != null ? `${clientTimings.loadEvent} ms` : '—',
      'React hydrated (effect ran)': clientTimings?.hydrated != null ? `${clientTimings.hydrated} ms` : '—',
    },
  };

  const copyAll = () => {
    let text = `GPDash perf debug — ${new Date().toISOString()}\n`;
    text += `URL: ${window.location.href}\n\n`;
    for (const [section, metrics] of Object.entries(allMetrics)) {
      text += `${section}\n`;
      for (const [k, v] of Object.entries(metrics)) text += `  ${k}: ${v}\n`;
      text += '\n';
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
          background: 'rgba(15,23,42,0.95)', color: '#22d3ee',
          border: '1px solid rgba(34,211,238,0.4)', borderRadius: 6,
          padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer',
        }}>⚡ perf</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
      width: 360, maxHeight: '70vh', overflow: 'auto',
      background: 'rgba(15,23,42,0.97)', color: '#e2e8f0',
      border: '1px solid rgba(34,211,238,0.4)', borderRadius: 8,
      padding: 12, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11,
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: '#22d3ee', fontWeight: 600, fontSize: 12 }}>⚡ Perf debug</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={copyAll} style={{ background: copied ? '#10b981' : '#1e293b', color: copied ? 'white' : '#cbd5e1', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? '✓ copied' : 'copy all'}
          </button>
          <button onClick={() => setCollapsed(true)} style={{ background: '#1e293b', color: '#cbd5e1', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
            hide
          </button>
        </div>
      </div>

      {Object.entries(allMetrics).map(([section, metrics]) => (
        <div key={section} style={{ marginBottom: 10 }}>
          <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{section}</div>
          {Object.entries(metrics).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
              <span style={{ color: '#94a3b8' }}>{k}</span>
              <span style={{ color: highlightFor(v), fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 6, padding: 8, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 4, color: '#94a3b8', fontSize: 10, lineHeight: 1.4 }}>
        <strong style={{ color: '#22d3ee' }}>Hint:</strong> TTFB &gt; ~400 ms usually means cold start or slow server. DOM ready &gt; ~1000 ms means JS bundle is heavy.
      </div>
    </div>
  );
}

function highlightFor(v) {
  if (typeof v !== 'string') return '#e2e8f0';
  const m = v.match(/^(\d+)\s*ms/);
  if (!m) return '#e2e8f0';
  const ms = parseInt(m[1]);
  if (ms < 100) return '#10b981';
  if (ms < 400) return '#84cc16';
  if (ms < 1000) return '#f59e0b';
  return '#ef4444';
}
