'use client';

// NhsBenchmarkRibbon — compact horizontal info bar showing this practice's
// monthly online-consult demand alongside its PCN average and the national
// average, NORMALISED to submissions per 1000 patients per reporting weekday
// (apples-to-apples comparison regardless of practice size).
//
// Data sources:
//   - nhs_oc_baseline                  (this practice's own row + list_size)
//   - nhs_oc_baseline_pcn_summary      (PCN per-1000 averages)
//   - nhs_oc_baseline_national_summary (national per-1000 averages)
//   - practices.list_size              (this practice's local list_size — preferred)
//
// If list_size is unknown for a practice, that practice doesn't contribute
// to the per-1000 averages but still shows in raw counts. The summary views
// surface practices_with_list_size so we can disclose backfill coverage.

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export default function NhsBenchmarkRibbon({ odsCode, listSize }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!odsCode) {
      setState({ loading: false, error: 'no-ods' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: ownRow, error: ownErr } = await supabase
          .from('nhs_oc_baseline')
          .select('total, days_with_data, list_size, pcn_code, month')
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
        const effectiveListSize = listSize || ownRow.list_size || null;

        const [{ data: pcnRow }, { data: natRow }] = await Promise.all([
          ownRow.pcn_code
            ? supabase
                .from('nhs_oc_baseline_pcn_summary')
                .select('practice_count, practices_with_list_size, avg_per_1000_per_day')
                .eq('month', month)
                .eq('pcn_code', ownRow.pcn_code)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('nhs_oc_baseline_national_summary')
            .select('practice_count, practices_with_list_size, avg_per_1000_per_day')
            .eq('month', month)
            .maybeSingle(),
        ]);

        const yourPer1000 = effectiveListSize && ownRow.days_with_data
          ? (ownRow.total / ownRow.days_with_data) / effectiveListSize * 1000
          : null;

        if (!cancelled) {
          setState({
            loading: false,
            month,
            yourPer1000,
            yourListSize: effectiveListSize,
            pcnPer1000: pcnRow?.avg_per_1000_per_day != null ? Number(pcnRow.avg_per_1000_per_day) : null,
            natPer1000: natRow?.avg_per_1000_per_day != null ? Number(natRow.avg_per_1000_per_day) : null,
            pcnPracticeCount: pcnRow?.practice_count || 0,
            pcnWithListSize: pcnRow?.practices_with_list_size || 0,
            natWithListSize: natRow?.practices_with_list_size || 0,
          });
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message || 'fetch-failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [odsCode, listSize]);

  if (state.loading) {
    return (
      <div style={ribbonStyle()}>
        <span style={{ color: '#64748b', fontSize: 12 }}>Loading NHS benchmarks…</span>
      </div>
    );
  }

  if (state.error === 'no-ods' || state.error === 'no-data') return null;
  if (state.error) return null;

  const { month, yourPer1000, yourListSize, pcnPer1000, natPer1000, pcnPracticeCount, pcnWithListSize, natWithListSize } = state;

  if (yourPer1000 == null) {
    return (
      <div style={ribbonStyle()}>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          NHS demand benchmarks need your practice list size to compute. Set it under
          Practice → Details.
        </span>
      </div>
    );
  }

  const monthLabel = formatMonthYear(month);
  const pcnDelta = pcnPer1000 ? ((yourPer1000 - pcnPer1000) / pcnPer1000) * 100 : null;
  const natDelta = natPer1000 ? ((yourPer1000 - natPer1000) / natPer1000) * 100 : null;
  const pcnCoverage = pcnPracticeCount > 0 ? Math.round((pcnWithListSize / pcnPracticeCount) * 100) : 0;
  const natCoverage = natWithListSize > 0 ? `${(natWithListSize / 1000).toFixed(1)}k` : '0';

  return (
    <div style={ribbonStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          NHS demand · {monthLabel}
        </span>
        <span style={{ color: '#475569' }}>·</span>
        <Stat label="You" value={yourPer1000} colour="#a5f3fc" emphasised />
        {pcnPer1000 != null && (
          <>
            <span style={{ color: '#475569' }}>·</span>
            <Stat
              label={`PCN avg${pcnPracticeCount ? ` (${pcnWithListSize}/${pcnPracticeCount})` : ''}`}
              value={pcnPer1000}
              delta={pcnDelta}
            />
          </>
        )}
        {natPer1000 != null && (
          <>
            <span style={{ color: '#475569' }}>·</span>
            <Stat
              label={`National avg (${natCoverage})`}
              value={natPer1000}
              delta={natDelta}
            />
          </>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
        Online consultation submissions per 1,000 patients per reporting weekday
        {yourListSize ? ` · your list: ${yourListSize.toLocaleString()}` : ''}
        {pcnPer1000 != null && pcnCoverage < 80 && pcnCoverage > 0
          ? ` · PCN coverage ${pcnCoverage}% (list-size backfill in progress)`
          : ''}
      </div>
    </div>
  );
}

function Stat({ label, value, delta, colour, emphasised }) {
  const fmt = (n) => n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}:</span>
      <span style={{
        fontSize: emphasised ? 14 : 13,
        fontWeight: emphasised ? 600 : 500,
        color: colour || '#cbd5e1',
        fontFamily: "'Space Mono', monospace",
      }}>
        {fmt(value)}
      </span>
      <span style={{ fontSize: 10, color: '#64748b' }}>/1k</span>
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
