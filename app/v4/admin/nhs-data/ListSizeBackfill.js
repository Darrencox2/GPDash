'use client';

// ListSizeBackfill — button to backfill nhs_oc_baseline.list_size from
// OpenPrescribing. Calls /api/admin/backfill-nhs-list-sizes in batches and
// shows progress. Each batch handles up to 500 rows; longer than that hits
// Vercel's 60s function timeout.

import { useState, useEffect } from 'react';

export default function ListSizeBackfill() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [autoLoop, setAutoLoop] = useState(false);

  // Initial status check on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Just call once with limit=0 to get status — no, the endpoint runs
        // a batch. For initial state, just leave it null and let the user
        // click "Run a batch" to see status.
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  async function runBatch() {
    setRunning(true);
    setError('');
    try {
      const r = await fetch('/api/admin/backfill-nhs-list-sizes?limit=300', { method: 'POST' });
      // The endpoint may emit Vercel's HTML error page if it times out;
      // try-parse so we report a useful message instead of "Unexpected token A".
      const text = await r.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        if (r.status === 504 || /timed?\s*out|gateway/i.test(text)) {
          throw new Error('Server hit the 60s function timeout. The batch size has been reduced — try again. The progress so far has been saved (refresh to see).');
        }
        throw new Error(`Server returned a non-JSON response (HTTP ${r.status}). First 120 chars: ${text.slice(0, 120)}`);
      }
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setProgress(json);
      // Only auto-chain when there was forward progress (avoid runaway loops
      // on persistent errors). batch>0 means we processed at least one ODS.
      if (autoLoop && !json.done && json.batch > 0) {
        setTimeout(() => runBatch(), 1500);
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const pct = progress && progress.total > 0
    ? Math.round(((progress.total - progress.remaining) / progress.total) * 100)
    : null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: 18,
      marginTop: 16,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
        Practice list size backfill
      </h3>
      <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
        The NHS OC submissions data doesn't include practice list sizes, but we
        need them to compute fair per-1000-patient demand benchmarks. This button
        fetches list sizes from OpenPrescribing for any practices in
        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 3, fontSize: 12, margin: '0 4px' }}>nhs_oc_baseline</code>
        that don't have one yet. Idempotent — safe to re-run.
      </p>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          onClick={runBatch}
          disabled={running}
          style={{
            padding: '8px 16px',
            background: running ? 'rgba(255,255,255,0.04)' : 'rgba(34,211,238,0.15)',
            border: `1px solid ${running ? 'rgba(255,255,255,0.1)' : 'rgba(34,211,238,0.4)'}`,
            color: running ? '#64748b' : '#22d3ee',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: running ? 'wait' : 'pointer',
          }}
        >
          {running ? 'Running…' : 'Run a batch (300 practices)'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoLoop}
            onChange={(e) => setAutoLoop(e.target.checked)}
            style={{ accentColor: '#22d3ee' }}
          />
          Auto-loop until done (~10 min total)
        </label>
      </div>

      {progress && (
        <div style={{
          padding: 12,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
          fontSize: 13,
          color: '#cbd5e1',
          lineHeight: 1.7,
        }}>
          {pct != null && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Overall progress: {pct}% ({(progress.total - progress.remaining).toLocaleString()} of {progress.total.toLocaleString()} rows backfilled)
              </div>
              <div style={{
                width: '100%',
                height: 8,
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #06b6d4, #0891b2)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
          {progress.done ? (
            <div style={{ color: '#34d399', fontWeight: 500 }}>
              ✓ Backfill complete. All {progress.total?.toLocaleString() || ''} rows have list sizes.
            </div>
          ) : (
            <>
              <div>Last batch: <strong>{progress.batch}</strong> practices fetched
                {progress.elapsedMs != null ? ` in ${(progress.elapsedMs / 1000).toFixed(1)}s` : ''}
                {progress.timedOut && (
                  <span style={{ color: '#fbbf24', fontStyle: 'italic', marginLeft: 8 }}>
                    (stopped before 60s timeout — auto-loop will continue)
                  </span>
                )}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                ✓ {progress.updated} updated · {progress.skipped} skipped (no list size in OpenPrescribing) · {progress.errors} errors
              </div>
              {progress.errorSamples?.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>Show error samples</summary>
                  <pre style={{ marginTop: 4, fontSize: 11, color: '#fca5a5', fontFamily: 'ui-monospace, monospace' }}>
                    {JSON.stringify(progress.errorSamples, null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
