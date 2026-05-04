'use client';

// NhsBenchmarkRibbon — compact horizontal info bar showing this practice's
// monthly online-consult demand alongside its PCN average and the national
// average. Sits at the top of the Today page as context: "are we busier or
// quieter than peers".
//
// Data sources (all populated from NHS England's monthly online-consultation
// submissions data — see /v4/admin/nhs-data):
//   - nhs_oc_baseline                  (this practice's own row)
//   - nhs_oc_baseline_pcn_summary      (PCN-level aggregates)
//   - nhs_oc_baseline_national_summary (national aggregates)
//
// All comparisons use submissions-per-day-with-data (i.e. average per
// reporting weekday) which makes practices that didn't report every day
// comparable. List-size normalisation is a future improvement.

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export default function NhsBenchmarkRibbon({ odsCode }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!odsCode) {
      setState({ loading: false, error: 'no-ods' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 1. Get this practice's row (latest month)
        const { data: ownRow, error: ownErr } = await supabase
          .from('nhs_oc_baseline')
          .select('total, days_with_data, pcn_code, month')
          .eq('ods_code', odsCode)
          .order('month', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ownErr) throw ownErr;
        if (!ownRow) {
          if (!cancelled) setState({ loading: false, error: 'no-data' });
          return;
        }

        const month = ownRow.month;

        // 2 + 3 in parallel: PCN summary for this month + national summary for this month
        const [{ data: pcnRow }, { data: natRow }] = await Promise.all([
          ownRow.pcn_code
            ? supabase
                .from('nhs_oc_baseline_pcn_summary')
                .select('practice_count, avg_total_per_practice, avg_days_with_data')
                .eq('month', month)
                .eq('pcn_code', ownRow.pcn_code)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('nhs_oc_baseline_national_summary')
            .select('practice_count, avg_total_per_practice')
            .eq('month', month)
            .maybeSingle(),
        ]);

        // Convert totals → per-day metrics (use days_with_data so partial
        // reporters compare fairly).
        const yourPerDay = ownRow.total / Math.max(1, ownRow.days_with_data);
        const pcnPerDay = pcnRow
          ? pcnRow.avg_total_per_practice / Math.max(1, pcnRow.avg_days_with_data || 23)
          : null;
        // We don't have avg_days_with_data on the national view, so assume
        // 23 reporting weekdays per month (typical March).
        const natPerDay = natRow
          ? natRow.avg_total_per_practice / 23
          : null;

        if (!cancelled) {
          setState({
            loading: false,
            month,
            yourPerDay,
            pcnPerDay,
            natPerDay,
            pcnPracticeCount: pcnRow?.practice_count || 0,
            natPracticeCount: natRow?.practice_count || 0,
          });
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message || 'fetch-failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [odsCode]);

  if (state.loading) {
    return (
      <div style={ribbonStyle()}>
        <span style={{ color: '#64748b', fontSize: 12 }}>Loading NHS benchmarks…</span>
      </div>
    );
  }

  // Errors: stay quiet rather than shouting. The ribbon is contextual; if
  // there's no data for this practice (e.g. brand new practice not in the
  // last NHS baseline), just show a friendly hint rather than a red banner.
  if (state.error === 'no-ods') {
    return null; // setup not done — don't pollute the page
  }
  if (state.error === 'no-data') {
    return (
      <div style={ribbonStyle()}>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          NHS demand benchmarks unavailable for this practice (ODS not in latest NHS England data).
        </span>
      </div>
    );
  }
  if (state.error) {
    return null; // silent on transient errors
  }

  const { month, yourPerDay, pcnPerDay, natPerDay, pcnPracticeCount } = state;
  const monthLabel = formatMonthYear(month);
  const pcnDelta = pcnPerDay ? ((yourPerDay - pcnPerDay) / pcnPerDay) * 100 : null;
  const natDelta = natPerDay ? ((yourPerDay - natPerDay) / natPerDay) * 100 : null;

  return (
    <div style={ribbonStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          NHS demand · {monthLabel}
        </span>
        <span style={{ color: '#475569' }}>·</span>
        <Stat label="You" value={yourPerDay} colour="#a5f3fc" emphasised />
        {pcnPerDay != null && (
          <>
            <span style={{ color: '#475569' }}>·</span>
            <Stat
              label={`PCN avg${pcnPracticeCount ? ` (${pcnPracticeCount})` : ''}`}
              value={pcnPerDay}
              delta={pcnDelta}
            />
          </>
        )}
        {natPerDay != null && (
          <>
            <span style={{ color: '#475569' }}>·</span>
            <Stat
              label="National avg"
              value={natPerDay}
              delta={natDelta}
            />
          </>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
        Submissions per reporting weekday (online consultations)
      </div>
    </div>
  );
}

function Stat({ label, value, delta, colour, emphasised }) {
  const fmt = (n) => Math.round(n).toLocaleString();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}:</span>
      <span style={{
        fontSize: emphasised ? 14 : 13,
        fontWeight: emphasised ? 600 : 500,
        color: colour || '#cbd5e1',
        fontFamily: "'Space Mono', monospace",
      }}>
        {fmt(value)}/day
      </span>
      {delta != null && Math.abs(delta) >= 1 && (
        <span style={{
          fontSize: 11,
          color: delta > 0 ? '#fcd34d' : '#7dd3fc',
          fontWeight: 500,
        }}>
          ({delta > 0 ? '+' : ''}{Math.round(delta)}%)
        </span>
      )}
    </span>
  );
}

function ribbonStyle() {
  return {
    background: 'rgba(34, 211, 238, 0.05)',
    border: '1px solid rgba(34, 211, 238, 0.15)',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 12,
  };
}

function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
