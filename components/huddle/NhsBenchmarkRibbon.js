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
        // Take the newest month that actually HAS data, not simply the newest
        // month. NHS Digital publishes a row for a month before the figures
        // land, so the latest row is routinely total=0, days_with_data=0.
        // Reading that row made yourPer1000 null and the ribbon then told
        // every practice to go and set a list size they had already set.
        const { data: ownRow, error: ownErr } = await supabase
          .from('nhs_oc_baseline')
          .select('total, days_with_data, list_size, pcn_code, month')
          .eq('ods_code', odsCode)
          .gt('days_with_data', 0)
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
                .select('practice_count, practices_with_list_size, avg_per_1000_per_day, avg_total_per_practice, avg_days_with_data')
                .eq('month', month)
                .eq('pcn_code', ownRow.pcn_code)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('nhs_oc_baseline_national_summary')
            .select('practice_count, practices_with_list_size, avg_per_1000_per_day, avg_total_per_practice, avg_days_with_data')
            .eq('month', month)
            .maybeSingle(),
        ]);

        const yourPer1000 = effectiveListSize && ownRow.days_with_data
          ? (ownRow.total / ownRow.days_with_data) / effectiveListSize * 1000
          : null;

        // When backfill is incomplete, the views' calibrated avg_per_1000_per_day
        // may be null. Fall back to an estimate computed from raw totals divided
        // by the typical UK GP practice list size (~9,665 patients per NHS Digital).
        const UK_AVG_LIST_SIZE = 9665;
        function calibratedOrEstimate(row) {
          if (!row) return { value: null, estimated: false };
          const calibrated = row.avg_per_1000_per_day != null ? Number(row.avg_per_1000_per_day) : null;
          if (calibrated != null) return { value: calibrated, estimated: false };
          if (row.avg_total_per_practice != null && Number(row.avg_days_with_data) > 0) {
            const rawPerDay = Number(row.avg_total_per_practice) / Number(row.avg_days_with_data);
            return { value: (rawPerDay / UK_AVG_LIST_SIZE) * 1000, estimated: true };
          }
          return { value: null, estimated: false };
        }
        const pcn = calibratedOrEstimate(pcnRow);
        const nat = calibratedOrEstimate(natRow);

        if (!cancelled) {
          setState({
            loading: false,
            month,
            yourPer1000,
            yourListSize: effectiveListSize,
            pcnPer1000: pcn.value,
            pcnEstimated: pcn.estimated,
            natPer1000: nat.value,
            natEstimated: nat.estimated,
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
        <span className="text-slate-400 text-meta">Loading NHS benchmarks…</span>
      </div>
    );
  }

  if (state.error === 'no-ods' || state.error === 'no-data') return null;
  if (state.error) return null;

  const { month, yourPer1000, yourListSize, pcnPer1000, pcnEstimated, natPer1000, natEstimated, pcnPracticeCount, pcnWithListSize, natWithListSize } = state;

  if (yourPer1000 == null) {
    // Say which of the two things is actually missing. The old copy asserted
    // the list size regardless, which was wrong whenever the NHS month was
    // simply empty — and sent people to a setting that was already correct.
    const missingListSize = !yourListSize;
    return (
      <div style={ribbonStyle()}>
        <span className="text-slate-400 text-meta">
          {missingListSize
            ? <>NHS demand benchmarks need your practice list size. <a href="/v4/practice" style={{ color: 'var(--link)' }}>Set it in Practice &rarr; Details</a>.</>
            : <>NHS demand benchmarks are not available yet for this practice &mdash; the latest published month has no figures in it.</>}
        </span>
      </div>
    );
  }

  const monthLabel = formatMonthYear(month);
  const pcnDelta = pcnPer1000 ? ((yourPer1000 - pcnPer1000) / pcnPer1000) * 100 : null;
  const natDelta = natPer1000 ? ((yourPer1000 - natPer1000) / natPer1000) * 100 : null;
  const pcnCoverage = pcnPracticeCount > 0 ? Math.round((pcnWithListSize / pcnPracticeCount) * 100) : 0;

  return (
    <div style={ribbonStyle()}>
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontSize: 11, color: 'var(--meta)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          NHS demand · {monthLabel}
        </span>
        <span className="text-slate-400">·</span>
        <Stat label="You" value={yourPer1000} colour="#a5f3fc" emphasised />
        {pcnPer1000 != null && (
          <>
            <span className="text-slate-400">·</span>
            <Stat
              label={`PCN avg${pcnPracticeCount ? ` (${pcnWithListSize}/${pcnPracticeCount})` : ''}`}
              value={pcnPer1000}
              delta={pcnDelta}
              estimated={pcnEstimated}
            />
          </>
        )}
        {natPer1000 != null && (
          <>
            <span className="text-slate-400">·</span>
            <Stat
              label={`National avg`}
              value={natPer1000}
              delta={natDelta}
              estimated={natEstimated}
            />
          </>
        )}
      </div>
      <div style={{ fontSize:11, color: 'var(--meta)', marginTop: 4 }}>
        Online consultation submissions per 1,000 patients per reporting weekday
        {yourListSize ? ` · your list: ${yourListSize.toLocaleString()}` : ''}
        {(pcnEstimated || natEstimated)
          ? ' · ~est figures use UK avg list size; refine via /v4/admin/nhs-data backfill'
          : pcnPer1000 != null && pcnCoverage < 80 && pcnCoverage > 0
            ? ` · PCN coverage ${pcnCoverage}% (list-size backfill in progress)`
            : ''}
      </div>
    </div>
  );
}

function Stat({ label, value, delta, colour, emphasised, estimated }) {
  const fmt = (n) => n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span className="text-caption text-slate-400">{label}:</span>
      <span style={{
        fontSize: emphasised ? 14 : 13,
        fontWeight: emphasised ? 600 : 500,
        color: colour || '#cbd5e1',
        fontFamily: "var(--font-mono)",
      }}>
        {fmt(value)}
      </span>
      <span style={{ fontSize:11, color: 'var(--meta)' }}>/1k</span>
      {estimated && (
        <span style={{ fontSize:11, color: '#fcd34d', fontStyle: 'italic' }} title="Estimated using UK average list size — refine by running the list-size backfill in /v4/admin/nhs-data">
          ~est
        </span>
      )}
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
    borderRadius: 'var(--r-md)',
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
