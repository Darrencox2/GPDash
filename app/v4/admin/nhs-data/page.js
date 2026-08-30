// /v4/admin/nhs-data — Platform admin page for managing the NHS OC
// baseline data uploads. Shows latest month present, freshness indicator,
// and the upload form for new monthly data.

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/lib/admin-guard';
import AdminNav from '../AdminNav';
import NhsDataUploader from './NhsDataUploader';
import ListSizeBackfill from './ListSizeBackfill';

export const dynamic = 'force-dynamic';

export default async function NhsDataAdminPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div className="p-8 text-white">Configuration error.</div>;

  await requireAdmin(supabase, { returnTo: '/v4/admin/nhs-data' });

  // Get all months we have data for (most recent first)
  const { data: monthsRaw } = await supabase
    .from('nhs_oc_baseline')
    .select('month, ingested_at')
    .order('month', { ascending: false });

  // Group by month (table has many rows per month)
  const monthsMap = new Map();
  for (const r of monthsRaw || []) {
    if (!monthsMap.has(r.month)) {
      monthsMap.set(r.month, { month: r.month, count: 0, ingested_at: r.ingested_at });
    }
    monthsMap.get(r.month).count++;
  }
  const months = Array.from(monthsMap.values());

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <AdminNav active="nhs-data" />

        <div style={{ marginBottom: 26 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600, color: 'white', marginBottom: 8, letterSpacing: -0.3 }}>
            NHS Online Consultation submissions data
          </h2>
          <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>
            Source dataset used to pre-seed demand predictions for new
            practices and to power PCN / national benchmarking. NHS England
            publishes a fresh month roughly 6 weeks after the month ends.
            Download from{' '}
            <a href="https://digital.nhs.uk/data-and-information/publications/statistical/submissions-via-online-consultation-systems-in-general-practice/" target="_blank" rel="noreferrer" className="text-cyan-400">
              digital.nhs.uk
            </a>{' '}
            and upload below.
          </p>
        </div>

        {/* Current data status */}
        <div style={{
          padding: 18,
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--r-lg)',
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 14, fontFamily: "'Outfit', sans-serif" }}>
            Months currently in the database
          </div>
          {months.length === 0 ? (
            <div className="text-body-sm text-slate-400">No data uploaded yet.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {months.map(m => (
                <div key={m.month} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", color: '#e2e8f0' }}>
                    {formatMonthYear(m.month)}
                  </div>
                  <div className="flex gap-4 text-slate-400">
                    <span>{m.count.toLocaleString()} practices</span>
                    <span>uploaded {formatRelativeDate(m.ingested_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Freshness reminder */}
        <FreshnessReminder months={months} />

        {/* Upload form */}
        <NhsDataUploader />

        {/* List size backfill */}
        <ListSizeBackfill />

        <div style={{
          marginTop: 36,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12,
          color: 'var(--meta)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <span>GPDash · Platform admin</span>
          <span>Only platform admins see this section.</span>
        </div>
      </div>
    </div>
  );
}

function formatMonthYear(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

function formatRelativeDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 60) return '1 month ago';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function FreshnessReminder({ months }) {
  if (months.length === 0) return null;
  const latest = months[0];
  // NHS publishes ~6 weeks after month-end. So if today is past
  // (latest_month + 2 months mid-month), the next month is likely available.
  const cutoff = new Date(latest.month);
  cutoff.setMonth(cutoff.getMonth() + 2);
  cutoff.setDate(15);
  if (new Date() < cutoff) return null;

  // Format the missing month
  const missing = new Date(latest.month);
  missing.setMonth(missing.getMonth() + 1);
  const missingLabel = missing.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(245, 158, 11, 0.07)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      borderRadius: 'var(--r-md)',
      fontSize: 13,
      color: '#fcd34d',
      lineHeight: 1.6,
      marginBottom: 18,
    }}>
      <div className="font-semibold mb-1.5 text-body">
        ⏰ {missingLabel} data is likely available now
      </div>
      <div>
        Your latest data is from {formatMonthYear(latest.month)}. NHS England typically
        publishes a new month 6 weeks after the month ends, so {missingLabel} should be
        ready to download. Practices set up after this data was last refreshed will be
        seeded from {formatMonthYear(latest.month)} until you upload the new month.
      </div>
    </div>
  );
}
