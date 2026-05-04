// /v4/admin/nhs-data — Platform admin page for managing the NHS OC
// baseline data uploads. Shows latest month present, freshness indicator,
// and the upload form for new monthly data.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import AdminNav from '../AdminNav';
import NhsDataUploader from './NhsDataUploader';

export const dynamic = 'force-dynamic';

export default async function NhsDataAdminPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) redirect('/v4/dashboard');

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
      padding: 32,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <AdminNav active="nhs-data" />

        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: 'white', marginBottom: 6 }}>
            NHS Online Consultation submissions data
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
            Source dataset used to pre-seed demand predictions for new
            practices and to power PCN / national benchmarking. NHS England
            publishes a fresh month roughly 6 weeks after the month ends.
            Download from{' '}
            <a href="https://digital.nhs.uk/data-and-information/publications/statistical/submissions-via-online-consultation-systems-in-general-practice/" target="_blank" rel="noreferrer" style={{ color: '#22d3ee' }}>
              digital.nhs.uk
            </a>{' '}
            and upload below.
          </p>
        </div>

        {/* Current data status */}
        <div style={{
          padding: 16,
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 12 }}>
            Months currently in the database
          </div>
          {months.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No data uploaded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {months.map(m => (
                <div key={m.month} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6,
                  fontSize: 12,
                }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", color: '#e2e8f0' }}>
                    {formatMonthYear(m.month)}
                  </div>
                  <div style={{ display: 'flex', gap: 16, color: '#64748b' }}>
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
      padding: '12px 14px',
      background: 'rgba(245, 158, 11, 0.07)',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      borderRadius: 10,
      fontSize: 12,
      color: '#fcd34d',
      lineHeight: 1.5,
      marginBottom: 16,
    }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>
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
