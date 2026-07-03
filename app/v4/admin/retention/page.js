// /v4/admin/retention — admin view of the retention policy + manual
// cleanup trigger.
//
// Shows:
//   - The current retention windows for each table (sourced from
//     /lib/retention-policy.js — single source of truth shared with
//     the privacy notice and RoPA)
//   - The scheduled cron status (daily at 03:00 UTC)
//   - A "Dry-run cleanup now" button that hits the cleanup endpoint
//     with dry_run=true and shows the per-table counts
//   - A "Run cleanup now" button with typed-confirm friction for the
//     actual destructive action
//
// All trigger paths go through the same /api/cron/retention-cleanup
// route — the route accepts both the Vercel cron secret and a
// platform-admin session, so this UI just authenticates as the admin
// they already are.

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/lib/admin-guard';
import AdminNav from '../AdminNav';
import RetentionControls from './RetentionControls';
import { retentionSummary } from '@/lib/retention-policy';

export const dynamic = 'force-dynamic';

export default async function RetentionAdminPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div className="p-8 text-white">Configuration error.</div>;
  await requireAdmin(supabase, { returnTo: '/v4/admin/retention' });

  const summary = retentionSummary();

  // Fetch the most recent retention_cleanup_run audit entry so the
  // page can show "Last run: …" with the headline result.
  const { data: lastRun } = await supabase
    .from('platform_audit_events')
    .select('created_at, description, details')
    .eq('action', 'other')
    .ilike('description', 'Retention cleanup%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <AdminNav active="retention" />

        <div className="mb-6">
          <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 6, color: '#f1f5f9' }}>
            Data retention
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8', maxWidth: 720, lineHeight: 1.6 }}>
            How long GPDash keeps each category of personal data. Retention
            windows here are the binding policy — what the privacy notice
            says and what the scheduled cleanup job enforces. Update by
            editing <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 'var(--r-sm)', fontSize: 12 }}>lib/retention-policy.js</code>.
          </p>
        </div>

        {/* Schedule + last run card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--r-lg)',
          padding: 18,
          marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Schedule
            </div>
            <div className="text-body text-slate-300">
              Daily at <code className="text-cyan-300">03:00 UTC</code> via Vercel Cron — <code className="text-cyan-300">0 3 * * *</code>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Last run
            </div>
            <div className="text-body text-slate-300">
              {lastRun ? (
                <>
                  <span>{new Date(lastRun.created_at).toLocaleString('en-GB', { timeZone: 'UTC', timeZoneName: 'short' })}</span>
                  {' · '}
                  <span className="text-slate-400">{lastRun.description}</span>
                </>
              ) : (
                <span className="text-slate-500">No runs recorded yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Policy table */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--r-lg)',
          padding: 18,
          marginBottom: 18,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
            Retention windows
          </h2>
          <table className="w-full border-collapse text-body">
            <thead>
              <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Table</th>
                <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Description</th>
                <th style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>Keep for</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(row => (
                <tr key={row.name}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#67e8f9' }}>{row.name}</td>
                  <td className="px-2.5 py-2 text-slate-300">{row.description}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#f1f5f9', fontWeight: 500 }}>{row.retentionLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-meta text-slate-500 mt-3.5 leading-body">
            CSV operational data (huddle_csv_data) is pruned in-band by mergeHuddleData on every
            upload — 4 months rolling window — and isn&apos;t covered by this cron.
            Rate-limit counters are TTL&apos;d by Upstash directly (minutes).
            CSP violation reports live in Vercel logs (30 days, automatic eviction).
          </div>
        </div>

        {/* Manual run controls — interactive */}
        <RetentionControls lastRunResults={lastRun?.details?.results || null} />
      </div>
    </div>
  );
}
