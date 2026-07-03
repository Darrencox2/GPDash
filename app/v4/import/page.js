'use client';
import { useState } from 'react';
import { confirmDialog } from '@/components/ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BrandHeader from '../_lib/BrandHeader';

export const dynamic = 'force-dynamic';

export default function V4ImportPage() {
  const router = useRouter();
  const [practiceId, setPracticeId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dryRun = async () => {
    setError('');
    setReport(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v4-import?practiceId=${encodeURIComponent(practiceId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setReport(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const realRun = async () => {
    if (!(await confirmDialog({ message: 'Really write data to Postgres? This is a one-shot operation.', danger: true }))) return;
    setError('');
    setReport(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v4-import?practiceId=${encodeURIComponent(practiceId)}&confirm=1`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setReport(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 32, fontFamily: 'inherit', color: '#e2e8f0' }}>
      <div className="mb-[18px]">
        <BrandHeader subtitle="v3 → v4 import" />
      </div>
      <Link href="/v4/dashboard" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
        ← Dashboard
      </Link>
      <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'white', marginTop: 8, marginBottom: 6 }}>
        Import v3 data
      </h1>
      <p className="text-body-sm text-slate-400 mb-6">
        One-shot import of the existing Redis blob into the new Postgres tables.
        Always run a <strong>dry run first</strong>.
      </p>

      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--r-md)', padding: 14, marginBottom: 16, fontSize: 12, color: '#fcd34d' }}>
        ⚠ Read these before running:
        <ul className="mt-1.5 ml-5">
          <li>Only the practice owner can import</li>
          <li>Dry run reports what would happen, makes no changes</li>
          <li>Real run is idempotent — safe to retry on errors</li>
          <li>Import bypasses RLS via service_role key (server-side only)</li>
          <li>v3 Redis is read-only here — never modified by this import</li>
        </ul>
      </div>

      <div className="mb-4">
        <label className="block text-meta text-slate-400 mb-1.5">
          Target practice ID
        </label>
        <input
          type="text"
          value={practiceId}
          onChange={(e) => setPracticeId(e.target.value)}
          placeholder="e.g. 32556810-ba90-4a1e-abbf-e5cb9cbc6c1e"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 13,
            color: '#e2e8f0',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--r-md)',
            fontFamily: 'monospace',
          }}
        />
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={dryRun}
          disabled={loading || !practiceId}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            color: 'white',
            background: 'rgba(99,102,241,0.4)',
            border: '1px solid rgba(99,102,241,0.6)',
            borderRadius: 'var(--r-md)',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading || !practiceId ? 0.5 : 1,
          }}
        >
          {loading ? 'Running...' : 'Dry run'}
        </button>
        <button
          onClick={realRun}
          disabled={loading || !practiceId || !report}
          title={!report ? 'Run a dry run first' : ''}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            color: 'white',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            border: 'none',
            borderRadius: 'var(--r-md)',
            cursor: loading || !report ? 'not-allowed' : 'pointer',
            opacity: loading || !practiceId || !report ? 0.4 : 1,
          }}
        >
          Real import (writes to Postgres)
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--r-md)', padding: 12, fontSize: 13, color: '#fca5a5', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {report && (
        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--r-lg)', padding: 20, marginTop: 16 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 600, color: report.dryRun ? '#fbbf24' : '#34d399', marginBottom: 12 }}>
            {report.dryRun ? 'Dry run report' : 'Import complete'}
          </h2>

          <h3 style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Counts</h3>
          {Object.entries(report.counts).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
              <span className="text-slate-400">{k.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
            </div>
          ))}

          {report.warnings.length > 0 && (
            <>
              <h3 style={{ fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Warnings ({report.warnings.length})</h3>
              {report.warnings.slice(0, 20).map((w, i) => (
                <div key={i} style={{ fontSize: 11, color: '#fcd34d', padding: '2px 0' }}>{w}</div>
              ))}
            </>
          )}

          {report.errors.length > 0 && (
            <>
              <h3 style={{ fontSize: 11, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Errors ({report.errors.length})</h3>
              {report.errors.slice(0, 20).map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: '#fca5a5', padding: '2px 0' }}>{e}</div>
              ))}
            </>
          )}

          {report.diagnostic && (
            <>
              <h3 style={{ fontSize: 11, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Diagnostic — weeklyRota</h3>
              <div style={{ fontSize: 11, color: '#cbd5e1', padding: '4px 0' }}>
                <div>Total clinicians: <strong>{report.diagnostic.clinicians_total}</strong></div>
                <div>Active clinicians (not left/admin): <strong>{report.diagnostic.clinicians_with_status_active}</strong></div>
                <div>Unique clinicians in weeklyRota: <strong>{report.diagnostic.weeklyRota_unique_clinician_count}</strong></div>
                <div className="mt-2">Per day:</div>
                {Object.entries(report.diagnostic.weeklyRota_per_day).map(([day, info]) => (
                  <div key={day} className="ml-3">
                    {day}: {info.count} clinicians
                  </div>
                ))}
              </div>
            </>
          )}

          {report.actions.length > 0 && (
            <>
              <h3 style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Sample actions ({report.actions.length} total)</h3>
              {report.actions.slice(0, 10).map((a, i) => (
                <div key={i} style={{ fontSize: 11, color: '#cbd5e1', padding: '2px 0', fontFamily: 'monospace' }}>{a}</div>
              ))}
              {report.actions.length > 10 && (
                <div style={{ fontSize: 11, color: '#64748b', padding: '4px 0' }}>... and {report.actions.length - 10} more</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
