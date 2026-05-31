'use client';
import { useState, useMemo } from 'react';
import {
  buildFacts, runReport, describeMeasure, isTimeDimension,
  PRESETS, GROUP_BY_OPTIONS, RANGE_OPTIONS,
} from '@/lib/workload-report';

const STATUS_OPTS = [
  { id: 'available', label: 'Available', colour: '#10b981' },
  { id: 'embargoed', label: 'Embargoed', colour: '#f59e0b' },
  { id: 'booked', label: 'Booked', colour: '#ef4444' },
];
const CATEGORY_OPTS = [
  { id: 'urgent', label: 'Urgent', colour: '#ef4444' },
  { id: 'routine', label: 'Routine', colour: '#10b981' },
  { id: 'other', label: 'Other', colour: '#64748b' },
];

// A small multi-select chip group.
function ChipGroup({ options, selected, onChange, allLabel = 'Any' }) {
  const toggle = (id) => {
    const set = new Set(selected || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange(Array.from(set));
  };
  const noneSelected = !selected || selected.length === 0;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={() => onChange([])}
        className="text-[10px] px-2 py-1 rounded-md transition-colors"
        style={{
          background: noneSelected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${noneSelected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
          color: noneSelected ? '#c7d2fe' : '#94a3b8',
        }}>
        {allLabel}
      </button>
      {options.map(o => {
        const on = (selected || []).includes(o.id);
        return (
          <button key={o.id} onClick={() => toggle(o.id)}
            className="text-[10px] px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            style={{
              background: on ? `${o.colour}28` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${on ? `${o.colour}88` : 'rgba(255,255,255,0.08)'}`,
              color: on ? '#e2e8f0' : '#94a3b8',
            }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.colour, opacity: on ? 1 : 0.4 }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Segmented control.
function Segmented({ options, value, onChange, disabledIds = [] }) {
  return (
    <div className="flex" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: 2, gap: 2 }}>
      {options.map(o => {
        const active = value === o.id;
        const disabled = disabledIds.includes(o.id);
        return (
          <button key={o.id} disabled={disabled}
            onClick={() => !disabled && onChange(o.id)}
            className="text-[11px] font-medium px-2.5 py-1 rounded transition-colors"
            style={{
              background: active ? 'rgba(99,102,241,0.9)' : 'transparent',
              color: disabled ? '#475569' : active ? 'white' : '#94a3b8',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Palette for grouped bars / trend.
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a78bfa','#ec4899','#14b8a6','#f97316','#84cc16'];

export default function WorkloadReportBuilder({ data, huddleData }) {
  const hs = data?.huddleSettings || {};
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left');
  }, [data?.clinicians]);

  const { facts, dateMin, dateMax } = useMemo(
    () => buildFacts(huddleData, clinicians, hs),
    [huddleData, clinicians, hs]
  );

  // Report config state.
  const [num, setNum] = useState({ statuses: ['available','embargoed','booked'], categories: [] });
  const [useDenom, setUseDenom] = useState(false);
  const [denom, setDenom] = useState({ statuses: ['available','embargoed','booked'], categories: [] });
  const [groupBy, setGroupBy] = useState('clinician');
  const [range, setRange] = useState('last8next8');
  const [chart, setChart] = useState('bars');

  const config = useMemo(() => ({
    num: { statuses: num.statuses, categories: num.categories },
    denom: useDenom ? { statuses: denom.statuses, categories: denom.categories } : null,
    groupBy, range,
  }), [num, useDenom, denom, groupBy, range]);

  const result = useMemo(() => runReport(facts, config), [facts, config]);

  const applyPreset = (preset) => {
    const c = preset.config;
    setNum({ statuses: c.num.statuses || [], categories: c.num.categories || [] });
    setUseDenom(!!c.denom);
    if (c.denom) setDenom({ statuses: c.denom.statuses || [], categories: c.denom.categories || [] });
    setGroupBy(c.groupBy);
    setRange(c.range);
    setChart(c.chart || 'bars');
  };

  const timeOk = isTimeDimension(groupBy);
  // If chart is trend but groupBy isn't time, fall back to bars for render.
  const effectiveChart = (chart === 'trend' && !timeOk) ? 'bars' : chart;

  if (!huddleData) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-2xl mb-2">📊</div>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">No CSV data</h3>
        <p className="text-xs text-slate-400">Upload a huddle CSV on the Today page to build reports.</p>
      </div>
    );
  }

  const fmt = (v) => result.isRatio ? `${v.toFixed(1)}%` : `${Math.round(v)}`;
  const avg = result.groups.length ? result.groups.reduce((s, g) => s + g.value, 0) / result.groups.length : 0;
  const maxVal = Math.max(...result.groups.map(g => g.value), result.isRatio ? 100 : 1);

  return (
    <div className="space-y-4">
      {/* Quick reports */}
      <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Quick reports</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p)}
              className="text-[11px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#c7d2fe' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Builder controls */}
      <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Measure: numerator */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Measure — count slots that are…</div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-slate-500 w-16">Status</span>
              <ChipGroup options={STATUS_OPTS} selected={num.statuses} onChange={(v) => setNum(n => ({ ...n, statuses: v }))} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-slate-500 w-16">Category</span>
              <ChipGroup options={CATEGORY_OPTS} selected={num.categories} onChange={(v) => setNum(n => ({ ...n, categories: v }))} />
            </div>
          </div>
        </div>

        {/* Denominator toggle */}
        <div className="pt-1">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={useDenom} onChange={e => setUseDenom(e.target.checked)} className="accent-indigo-500" />
            <span className="text-[11px] text-slate-300">Show as a percentage (÷ a denominator)</span>
          </label>
          {useDenom && (
            <div className="mt-2 pl-6 space-y-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
              <div className="text-[10px] text-slate-500">…as a % of slots that are:</div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] text-slate-500 w-16">Status</span>
                <ChipGroup options={STATUS_OPTS} selected={denom.statuses} onChange={(v) => setDenom(d => ({ ...d, statuses: v }))} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] text-slate-500 w-16">Category</span>
                <ChipGroup options={CATEGORY_OPTS} selected={denom.categories} onChange={(v) => setDenom(d => ({ ...d, categories: v }))} />
              </div>
            </div>
          )}
        </div>

        {/* Group by + range + chart */}
        <div className="flex items-end gap-4 flex-wrap pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 mt-3">Group by</div>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
              className="text-[11px] rounded-md px-2 py-1.5"
              style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}>
              {GROUP_BY_OPTIONS.map(o => <option key={o.id} value={o.id} style={{ background: '#1e293b' }}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Date range</div>
            <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Chart</div>
            <Segmented
              options={[{ id: 'bars', label: 'Bars' }, { id: 'trend', label: 'Trend' }, { id: 'table', label: 'Table' }]}
              value={chart} onChange={setChart}
              disabledIds={timeOk ? [] : ['trend']}
            />
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-xl p-5" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-200">{describeMeasure(config)} by {GROUP_BY_OPTIONS.find(o => o.id === groupBy)?.label.toLowerCase()}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {RANGE_OPTIONS.find(o => o.id === range)?.label}
              {dateMin && dateMax ? ` · data spans ${dateMin.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}–${dateMax.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Total / overall</div>
            <div className="text-lg font-bold text-indigo-300">{fmt(result.totalValue)}</div>
          </div>
        </div>

        {result.groups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No data matches this measure and range. Try widening the date range or relaxing the status/category filters.</p>
        ) : effectiveChart === 'table' ? (
          <TableView result={result} groupLabel={GROUP_BY_OPTIONS.find(o => o.id === groupBy)?.label} fmt={fmt} />
        ) : effectiveChart === 'trend' ? (
          <TrendView result={result} fmt={fmt} isRatio={result.isRatio} />
        ) : (
          <BarsView result={result} fmt={fmt} avg={avg} maxVal={maxVal} isRatio={result.isRatio} />
        )}
      </div>
    </div>
  );
}

// ── Horizontal ranked bars ──────────────────────────────────────────────
function BarsView({ result, fmt, avg, maxVal, isRatio }) {
  return (
    <div className="space-y-1.5">
      {result.groups.map((g, i) => {
        const widthPct = (g.value / maxVal) * 100;
        const colour = PALETTE[i % PALETTE.length];
        const aboveAvg = g.value > avg * 1.05;
        return (
          <div key={g.key} className="flex items-center gap-3">
            <div className="w-36 text-[11px] font-medium text-slate-300 truncate text-right" title={g.label}>{g.label}</div>
            <div className="flex-1 relative h-7 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-lg transition-all" style={{ width: `${Math.max(widthPct, 1)}%`, background: colour, opacity: 0.8 }} />
              {/* average marker */}
              <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${(avg / maxVal) * 100}%`, background: 'rgba(255,255,255,0.45)' }} title={`Average ${fmt(avg)}`} />
              <div className="absolute inset-0 flex items-center px-2.5">
                <span className="text-[11px] font-bold text-white drop-shadow">{fmt(g.value)}</span>
                {isRatio && <span className="text-[9px] text-white/70 ml-2">{g.numerator}/{g.denominator}</span>}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-2 pt-2 mt-1 text-[10px] text-slate-500" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="inline-block w-0.5 h-3 align-middle" style={{ background: 'rgba(255,255,255,0.45)' }} />
        <span>Average line at {fmt(avg)} · {result.groups.length} group{result.groups.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

// ── Trend over time (week / day of week) ────────────────────────────────
function TrendView({ result, fmt, isRatio }) {
  const groups = result.groups;
  const W = 720, H = 220, padL = 40, padR = 16, padT = 16, padB = 36;
  const maxVal = Math.max(...groups.map(g => g.value), isRatio ? 100 : 1);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (groups.length === 1 ? innerW / 2 : (i / (groups.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / maxVal) * innerH;
  const pathD = groups.map((g, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(g.value).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${x(groups.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: maxVal * f, yy: y(maxVal * f) }));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }}>
        {/* gridlines */}
        {gridLines.map((gl, i) => (
          <g key={i}>
            <line x1={padL} y1={gl.yy} x2={W - padR} y2={gl.yy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 6} y={gl.yy + 3} textAnchor="end" fill="#64748b" style={{ fontSize: 9 }}>{isRatio ? `${Math.round(gl.v)}%` : Math.round(gl.v)}</text>
          </g>
        ))}
        {/* area + line */}
        <path d={areaD} fill="rgba(99,102,241,0.15)" />
        <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* points + x labels */}
        {groups.map((g, i) => (
          <g key={g.key}>
            <circle cx={x(i)} cy={y(g.value)} r="3.5" fill="#818cf8" stroke="#1e293b" strokeWidth="1.5" />
            <text x={x(i)} y={y(g.value) - 9} textAnchor="middle" fill="#c7d2fe" style={{ fontSize: 9, fontWeight: 700 }}>{fmt(g.value)}</text>
            <text x={x(i)} y={H - padB + 16} textAnchor="middle" fill="#64748b" style={{ fontSize: 9 }}>{g.label.replace('w/c ', '')}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Data table ──────────────────────────────────────────────────────────
function TableView({ result, groupLabel, fmt }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 pr-4">{groupLabel}</th>
            {result.isRatio && <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 px-3 text-right">Numerator</th>}
            {result.isRatio && <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 px-3 text-right">Denominator</th>}
            <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 pl-3 text-right">{result.isRatio ? 'Percentage' : 'Count'}</th>
          </tr>
        </thead>
        <tbody>
          {result.groups.map((g, i) => (
            <tr key={g.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td className="text-[12px] text-slate-200 py-2 pr-4">{g.label}</td>
              {result.isRatio && <td className="text-[12px] text-slate-400 py-2 px-3 text-right tabular-nums">{g.numerator}</td>}
              {result.isRatio && <td className="text-[12px] text-slate-400 py-2 px-3 text-right tabular-nums">{g.denominator}</td>}
              <td className="text-[12px] font-bold text-indigo-300 py-2 pl-3 text-right tabular-nums">{fmt(g.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <td className="text-[11px] font-semibold text-slate-300 py-2 pr-4">Total / overall</td>
            {result.isRatio && <td className="text-[11px] text-slate-300 py-2 px-3 text-right tabular-nums">{result.totalNum}</td>}
            {result.isRatio && <td className="text-[11px] text-slate-300 py-2 px-3 text-right tabular-nums">{result.totalDenom}</td>}
            <td className="text-[12px] font-bold text-indigo-200 py-2 pl-3 text-right tabular-nums">{fmt(result.totalValue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
