'use client';

// RetentionControls — interactive dry-run + run-now panel for the
// retention admin page. Server component above provides the static
// policy table + last-run summary; this handles the live interaction.

import { useState } from 'react';

export default function RetentionControls({ lastRunResults }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(lastRunResults);
  const [resultsMeta, setResultsMeta] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const runCleanup = async (dryRun) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cron/retention-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Cleanup failed (${res.status})`);
      } else {
        setResults(json.results || []);
        setResultsMeta({
          dry_run: json.dry_run,
          total_deleted: json.total_deleted,
          duration_ms: json.duration_ms,
        });
        setConfirming(false);
        setConfirmText('');
      }
    } catch (e) {
      setError(e?.message || 'Cleanup request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 'var(--r-lg)',
      padding: 18,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-text-pale)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
        Manual run
      </h2>

      <div className="flex gap-2.5 flex-wrap mb-4">
        <button
          onClick={() => runCleanup(true)}
          disabled={busy}
          style={{
            padding: '8px 14px',
            background: 'rgba(34,211,238,0.12)',
            border: '1px solid rgba(34,211,238,0.30)',
            color: 'var(--c-cyan)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            fontWeight: 500,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Running…' : 'Dry run — count only'}
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            style={{
              padding: '8px 14px',
              background: 'white',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Run cleanup now…
          </button>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 10px',
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: 'var(--r-md)',
          }}>
            <span className="text-meta text-red-300">
              Type <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 5px', borderRadius: 'var(--r-sm)' }}>RUN</code> to confirm:
            </span>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
              style={{
                padding: '5px 8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--g-text-pale)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13,
                width: 90,
              }}
            />
            <button
              onClick={() => runCleanup(false)}
              disabled={confirmText !== 'RUN' || busy}
              style={{
                padding: '6px 12px',
                background: confirmText === 'RUN' ? '#b91c1c' : '#64748b',
                color: 'var(--g-text-max)',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                fontWeight: 500,
                cursor: confirmText === 'RUN' ? 'pointer' : 'not-allowed',
              }}
            >
              Delete
            </button>
            <button
              onClick={() => { setConfirming(false); setConfirmText(''); }}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--g-text-soft)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.30)',
          color: 'var(--c-red)',
          padding: 12,
          borderRadius: 'var(--r-md)',
          fontSize: 13,
          marginBottom: 14,
        }}>
          {error}
        </div>
      )}

      {resultsMeta && (
        <div className="text-meta text-slate-400 mb-2.5">
          {resultsMeta.dry_run ? 'Dry run' : 'Cleanup run'} · {resultsMeta.duration_ms}ms · {resultsMeta.total_deleted} total {resultsMeta.dry_run ? 'would be deleted' : 'deleted'}
        </div>
      )}

      {results && results.length > 0 && (
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--g-text-mid)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Table</th>
              <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Cutoff</th>
              <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>Past retention</th>
              <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>Deleted</th>
              <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--c-cyan)' }}>{r.table}</td>
                <td style={{ padding: '8px 10px', color: 'var(--g-text-soft)', fontFamily: 'monospace', fontSize: 11 }}>
                  {r.cutoff ? new Date(r.cutoff).toISOString().slice(0, 10) : '—'}
                </td>
                <td className="px-2.5 py-2 text-right text-slate-300">{r.rows_to_delete ?? '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: r.rows_deleted > 0 ? 'var(--c-red-2)' : 'var(--g-text-soft)' }}>{r.rows_deleted ?? 0}</td>
                <td className="px-2.5 py-2 text-caption">
                  {r.error
                    ? <span className="text-red-300">{r.error}</span>
                    : r.capped
                    ? <span className="text-amber-400">capped at {r.rows_deleted || r.rows_to_delete}</span>
                    : <span className="text-slate-400">ok</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="text-caption text-slate-400 mt-3.5 leading-body">
        Each run is logged to <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 'var(--r-sm)' }}>platform_audit_events</code> with the full per-table result set for GDPR Art 5(2) accountability — including dry runs.
        Hard cap of 5000 rows deleted per table per run as a safety net.
      </div>
    </div>
  );
}
