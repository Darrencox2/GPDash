'use client';

// DemandComparisonPanel — runs the predictor over a list of dated
// actuals and shows how well the model predicted them.
//
// Two callers today:
//
//   1. Post-upload (DemandUpload) — passes the PRE-upload demand_settings
//      so the comparison is genuine ("how well did your existing model
//      predict the new data?") rather than incestuous ("how well does the
//      model fit data it was just re-fit to?").
//
//   2. Persistent recent-accuracy card (RecentAccuracyCard) — passes the
//      CURRENT demand_settings as an at-a-glance "is the model still
//      tracking my practice?" view.
//
// First-time path: when settings has no baseline (no prior calibration),
// surfaces an explanatory message. Caller can also opt to hide the panel
// entirely via the `firstTimeMode` prop.

import { useMemo } from 'react';
import { predictDemand } from '@/lib/demandPredictor';

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function DemandComparisonPanel({
  uploadedRows,
  settings,
  // Legacy alias for backwards compat — older callers passed preUploadSettings
  preUploadSettings,
  schoolHolidayRanges,
  listSize,
  title = 'Model accuracy on this batch',
  firstTimeMode = 'message', // 'message' shows explanatory text; 'hide' renders nothing
}) {
  const effectiveSettings = settings || preUploadSettings || null;
  const analysis = useMemo(() => {
    if (!effectiveSettings || typeof effectiveSettings.baseline !== 'number') {
      return { firstTime: true };
    }
    if (!Array.isArray(uploadedRows) || uploadedRows.length === 0) {
      return { empty: true };
    }

    // Filter out weekends / bank holidays — predictor returns 0/closed
    // and including them swamps the error metrics with zero-actual,
    // zero-predicted days that don't tell us anything about model fit.
    const points = [];
    for (const row of uploadedRows) {
      const date = row.date;
      const actual = Number(row.count) || 0;
      const out = predictDemand(date, null, {
        demandSettings: effectiveSettings,
        schoolHolidayRanges,
        listSize,
      });
      if (out.isWeekend || out.isBankHoliday) continue;
      const predicted = Math.max(0, Math.round(out.predicted));
      const error = actual - predicted;
      // dayOfWeekIndex matches predictor: 0=Mon..4=Fri
      const d = new Date(date + 'T00:00:00');
      const dow = (d.getDay() + 6) % 7;
      points.push({
        date,
        actual,
        predicted,
        error,
        absError: Math.abs(error),
        pctError: predicted > 0 ? (error / predicted) * 100 : null,
        dow,
        factors: out.factors,
      });
    }

    if (points.length === 0) {
      return { empty: true };
    }

    // Aggregate stats
    const n = points.length;
    const mae = sum(points.map(p => p.absError)) / n;
    const meanError = sum(points.map(p => p.error)) / n;
    const meanActual = sum(points.map(p => p.actual)) / n;
    const mapeValues = points.map(p => p.pctError).filter(v => v !== null);
    const mape = mapeValues.length > 0 ? sum(mapeValues.map(Math.abs)) / mapeValues.length : null;

    // Day-of-week bias: mean signed error per weekday
    const dowBias = DOW_NAMES.map((label, idx) => {
      const inDow = points.filter(p => p.dow === idx);
      if (inDow.length === 0) return { label, count: 0, meanError: null, meanActual: null };
      return {
        label,
        count: inDow.length,
        meanError: sum(inDow.map(p => p.error)) / inDow.length,
        meanActual: sum(inDow.map(p => p.actual)) / inDow.length,
      };
    });

    // Top outliers (largest absolute error)
    const outliers = [...points]
      .sort((a, b) => b.absError - a.absError)
      .slice(0, 5);

    return {
      points,
      n,
      mae,
      meanError,
      meanActual,
      mape,
      dowBias,
      outliers,
    };
  }, [uploadedRows, effectiveSettings, schoolHolidayRanges, listSize]);

  if (analysis.firstTime) {
    if (firstTimeMode === 'hide') return null;
    return (
      <div style={{ marginTop: 12, padding: 12, background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.15)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--g-text-mid)' }}>
        This is the first calibration for your practice — there&apos;s no prior model to compare against.
        Once you upload another batch, you&apos;ll see how well the current model predicted it.
      </div>
    );
  }
  if (analysis.empty) return null;

  const { n, mae, meanError, mape, dowBias, outliers, points } = analysis;
  const biasDirection = meanError > 0 ? 'low' : meanError < 0 ? 'high' : 'on';
  const biasMag = Math.abs(meanError);

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--g-border)' }}>
      <div style={{ color: '#a78bfa', fontWeight: 500, marginBottom: 8 }}>
        {title}
      </div>

      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 4, marginBottom: 12 }}>
        <span className="text-mid">Days compared</span>
        <span>{n} weekday{n === 1 ? '' : 's'}</span>
        <span className="text-mid">Mean absolute error</span>
        <span>{mae.toFixed(1)} requests/day{mape != null && ` (${mape.toFixed(0)}% MAPE)`}</span>
        <span className="text-mid">Average bias</span>
        <span>
          {biasMag < 0.5
            ? 'Model was on target'
            : `Model ran ${biasDirection} by ${biasMag.toFixed(1)} requests/day on average`}
        </span>
      </div>

      {/* Chart: predicted vs actual */}
      <ComparisonChart points={points} />

      {/* Day-of-week bias */}
      <div className="mt-3">
        <div className="text-mid text-caption mb-1.5">Day-of-week bias (negative = predicted too high)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {dowBias.map(d => (
            <div key={d.label} style={{
              padding: 8,
              background: 'var(--g-tile-2)',
              border: '1px solid var(--g-border)',
              borderRadius: 'var(--r-sm)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: 'var(--g-text-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.label}</div>
              <div style={{ fontSize: 13, color: d.meanError == null ? 'var(--g-text-faint)' : (Math.abs(d.meanError) < 1 ? 'var(--g-text-mid)' : (d.meanError > 0 ? '#fcd34d' : '#67e8f9')), fontWeight: 500, marginTop: 2 }}>
                {d.meanError == null ? '—' : (d.meanError > 0 ? '+' : '') + d.meanError.toFixed(0)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--g-text-faint)', marginTop: 1 }}>{d.count} day{d.count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top outliers */}
      {outliers.length > 0 && (
        <details className="mt-3 text-caption text-mid">
          <summary className="cursor-pointer text-hi">
            Top {outliers.length} biggest misses (click for factor breakdown)
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {outliers.map((p, i) => (
              <div key={i} style={{
                padding: 8,
                background: 'var(--g-tile-2)',
                border: '1px solid var(--g-border)',
                borderRadius: 'var(--r-sm)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span className="text-hi font-medium">{formatDate(p.date)}</span>
                  <span style={{ color: p.error > 0 ? '#67e8f9' : '#fcd34d' }}>
                    {p.error > 0 ? '+' : ''}{p.error} ({p.error > 0 ? 'higher' : 'lower'} than predicted)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, color: 'var(--g-text-mid)', fontSize: 10, marginBottom: 4 }}>
                  <span>Predicted: <span className="text-hi">{p.predicted}</span></span>
                  <span>Actual: <span className="text-hi">{p.actual}</span></span>
                </div>
                <FactorBreakdown factors={p.factors} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ComparisonChart({ points }) {
  if (!points || points.length === 0) return null;

  const W = 600;
  const H = 160;
  const PAD_L = 32;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxY = Math.max(
    ...points.map(p => Math.max(p.actual, p.predicted))
  ) * 1.1;
  const yScale = (v) => PAD_T + innerH - (v / maxY) * innerH;
  const xScale = (i) => PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);

  const predPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.predicted)}`).join(' ');
  const actualPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.actual)}`).join(' ');

  // Y axis ticks — 0, mid, max
  const yTicks = [0, Math.round(maxY / 2), Math.round(maxY)];

  // X axis labels — first, middle, last
  const labelIndices = points.length <= 3
    ? points.map((_, i) => i)
    : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div style={{ background: 'var(--g-field)', borderRadius: 'var(--r-md)', padding: 8, border: '1px solid var(--g-tile)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Y gridlines */}
        {yTicks.map((y) => (
          <g key={y}>
            <line x1={PAD_L} y1={yScale(y)} x2={W - PAD_R} y2={yScale(y)} stroke="var(--g-tile)" strokeWidth="1" />
            <text x={PAD_L - 4} y={yScale(y) + 3} textAnchor="end" fontSize="9" style={{fill:'var(--g-text-mid)'}}>{y}</text>
          </g>
        ))}

        {/* Predicted (purple) */}
        <path d={predPath} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeOpacity="0.8" strokeLinejoin="round" />
        {/* Actual (cyan) */}
        <path d={actualPath} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Actual data points */}
        {points.map((p, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(p.actual)} r="2" fill="#22d3ee" />
        ))}

        {/* X labels */}
        {labelIndices.map(i => (
          <text key={i} x={xScale(i)} y={H - 6} textAnchor="middle" fontSize="9" style={{fill:'var(--g-text-mid)'}}>
            {shortDate(points[i].date)}
          </text>
        ))}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, color: 'var(--g-text-mid)', marginTop: 4 }}>
        <span className="flex items-center gap-1">
          <span style={{ width: 12, height: 2, background: '#a78bfa', display: 'inline-block' }} />
          Predicted
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 12, height: 2, background: '#22d3ee', display: 'inline-block' }} />
          Actual
        </span>
      </div>
    </div>
  );
}

function FactorBreakdown({ factors }) {
  if (!factors || typeof factors !== 'object') return null;
  const parts = [];
  if (factors.baseline != null) parts.push(`baseline ${Math.round(factors.baseline)}`);
  if (factors.dayOfWeek?.effect != null) parts.push(`${factors.dayOfWeek.day} ${fmtNum(factors.dayOfWeek.effect)}`);
  if (factors.month?.effect != null) parts.push(`month ${fmtNum(factors.month.effect)}`);
  if (factors.schoolHoliday) parts.push(`school hol ${fmtNum(factors.schoolHoliday.effect || 0)}`);
  if (factors.firstWeekBack) parts.push(`first week back ${fmtNum(factors.firstWeekBack.effect || 0)}`);
  if (factors.trend?.effect != null) parts.push(`trend ${fmtNum(factors.trend.effect)}`);
  if (parts.length === 0) return null;
  return <div style={{ color: 'var(--g-text-mid)', fontSize: 10, marginTop: 2 }}>{parts.join(' · ')}</div>;
}

function fmtNum(n) {
  if (n == null) return '—';
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : String(r);
}

function sum(arr) {
  return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function shortDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return iso; }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}
