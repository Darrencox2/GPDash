'use client';
import { useState, useMemo, useEffect } from 'react';
import {
  buildFacts, buildSessionFacts, runReport, describeMeasure, isTimeDimension,
  PRESET_GROUPS, GROUP_BY_OPTIONS, groupByOptionsForGrain, RANGE_OPTIONS,
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
const KIND_OPTS = [
  { id: 'worked', label: 'Worked', colour: '#6366f1' },
  { id: 'duty', label: 'Duty', colour: '#ef4444' },
  { id: 'support', label: 'Support', colour: '#0ea5e9' },
];
const SESSION_OPTS = [
  { id: 'am', label: 'AM', colour: '#f59e0b' },
  { id: 'pm', label: 'PM', colour: '#6366f1' },
];

const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#a78bfa','#ec4899','#14b8a6','#f97316','#84cc16'];

// Multi-select chip group.
function ChipGroup({ options, selected, onChange, allLabel = 'Any', allowAll = true }) {
  const toggle = (id) => {
    const set = new Set(selected || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange(Array.from(set));
  };
  const noneSelected = !selected || selected.length === 0;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {allowAll && (
        <button onClick={() => onChange([])}
          className="text-[10px] px-2 py-1 rounded-md transition-colors"
          style={{ background: noneSelected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${noneSelected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`, color: noneSelected ? '#c7d2fe' : '#94a3b8' }}>
          {allLabel}
        </button>
      )}
      {options.map(o => {
        const on = (selected || []).includes(o.id);
        return (
          <button key={o.id} onClick={() => toggle(o.id)}
            className="text-[10px] px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            style={{ background: on ? `${o.colour}28` : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? `${o.colour}88` : 'rgba(255,255,255,0.08)'}`, color: on ? '#e2e8f0' : '#94a3b8' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.colour, opacity: on ? 1 : 0.4 }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Segmented({ options, value, onChange, disabledIds = [] }) {
  return (
    <div className="flex flex-wrap" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: 2, gap: 2 }}>
      {options.map(o => {
        const active = value === o.id;
        const disabled = disabledIds.includes(o.id);
        return (
          <button key={o.id} disabled={disabled} onClick={() => !disabled && onChange(o.id)}
            className="text-[11px] font-medium px-2.5 py-1 rounded transition-colors"
            style={{ background: active ? 'rgba(99,102,241,0.9)' : 'transparent', color: disabled ? '#475569' : active ? 'white' : '#94a3b8', cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PanelSection({ title, children }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

export default function WorkloadReportBuilder({ data, huddleData }) {
  const hs = data?.huddleSettings || {};
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left');
  }, [data?.clinicians]);

  const slotData = useMemo(() => buildFacts(huddleData, clinicians, hs), [huddleData, clinicians, hs]);
  const sessionData = useMemo(() => buildSessionFacts(huddleData, clinicians, hs), [huddleData, clinicians, hs]);

  // Config state.
  const [grain, setGrain] = useState('sessions');     // default to sessions so duty/support is front-and-centre
  const [num, setNum] = useState({ statuses: [], categories: [], kinds: ['duty'], sessions: [] });
  const [useDenom, setUseDenom] = useState(true);
  const [denom, setDenom] = useState({ statuses: ['available','embargoed','booked'], categories: [], kinds: ['worked'], sessions: [] });
  const [groupBy, setGroupBy] = useState('clinician');
  const [range, setRange] = useState('last8next8');
  const [chart, setChart] = useState('bars');

  const facts = grain === 'sessions' ? sessionData.facts : slotData.facts;
  const { dateMin, dateMax } = slotData;

  const config = useMemo(() => ({
    grain,
    num: grain === 'sessions' ? { kinds: num.kinds, sessions: num.sessions } : { statuses: num.statuses, categories: num.categories },
    denom: useDenom ? (grain === 'sessions' ? { kinds: denom.kinds, sessions: denom.sessions } : { statuses: denom.statuses, categories: denom.categories }) : null,
    groupBy, range,
  }), [grain, num, useDenom, denom, groupBy, range]);

  const result = useMemo(() => runReport(facts, config), [facts, config]);

  // When grain changes, make sure groupBy is still valid for it.
  useEffect(() => {
    const valid = groupByOptionsForGrain(grain).map(o => o.id);
    if (!valid.includes(groupBy)) setGroupBy('clinician');
  }, [grain]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (preset) => {
    const c = preset.config;
    setGrain(c.grain || 'slots');
    setNum({
      statuses: c.num?.statuses || [], categories: c.num?.categories || [],
      kinds: c.num?.kinds || ['worked'], sessions: c.num?.sessions || [],
    });
    setUseDenom(!!c.denom);
    if (c.denom) setDenom({
      statuses: c.denom.statuses || ['available','embargoed','booked'], categories: c.denom.categories || [],
      kinds: c.denom.kinds || ['worked'], sessions: c.denom.sessions || [],
    });
    setGroupBy(c.groupBy);
    setRange(c.range);
    setChart(c.chart || 'bars');
  };

  const timeOk = isTimeDimension(groupBy);
  const effectiveChart = (chart === 'trend' && !timeOk) ? 'bars' : chart;
  const isSession = grain === 'sessions';
  const groupByOpts = groupByOptionsForGrain(grain);

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
  // Only warn about missing duty config when the measure actually references
  // duty or support sessions — a plain "sessions worked" report is fine.
  const usesDutySupport = isSession && (
    (num.kinds || []).some(k => k === 'duty' || k === 'support') ||
    (useDenom && (denom.kinds || []).some(k => k === 'duty' || k === 'support'))
  );
  const dutyMissing = usesDutySupport && !sessionData.hasDuty;

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* MAIN — chart */}
      <div className="flex-1 min-w-0 w-full rounded-xl p-5" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-200">
              {describeMeasure(config)} by {groupByOpts.find(o => o.id === groupBy)?.label.toLowerCase()}
            </div>
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

        {dutyMissing ? (
          <p className="text-sm text-slate-400 text-center py-8">Duty doctor slot not configured. Set a duty slot type in the Today page filter to enable duty &amp; support session reports.</p>
        ) : result.groups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No data matches this measure and range. Try widening the date range or relaxing the filters.</p>
        ) : effectiveChart === 'table' ? (
          <TableView result={result} groupLabel={groupByOpts.find(o => o.id === groupBy)?.label} fmt={fmt} />
        ) : effectiveChart === 'trend' ? (
          <TrendView result={result} fmt={fmt} isRatio={result.isRatio} />
        ) : (
          <BarsView result={result} fmt={fmt} avg={avg} maxVal={maxVal} isRatio={result.isRatio} />
        )}
      </div>

      {/* RIGHT — controls */}
      <div className="w-full lg:w-80 lg:flex-shrink-0 rounded-xl p-4 space-y-5" style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Presets */}
        <PanelSection title="Quick reports">
          <div className="space-y-3">
            {PRESET_GROUPS.map(g => (
              <div key={g.group}>
                <div className="text-[9px] uppercase tracking-wide text-slate-600 mb-1">{g.group}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.presets.map(p => (
                    <button key={p.id} onClick={() => applyPreset(p)}
                      className="text-[10px] px-2 py-1 rounded-md transition-colors text-left"
                      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#c7d2fe' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PanelSection>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* Grain */}
        <PanelSection title="Count">
          <Segmented options={[{ id: 'slots', label: 'Slots' }, { id: 'sessions', label: 'Sessions' }]} value={grain} onChange={setGrain} />
          <p className="text-[9px] text-slate-600 leading-snug">
            {isSession
              ? 'A session = one clinician working an AM or PM. Use this for duty / support balance.'
              : 'A slot = one appointment slot. Use this for capacity, fill and slot-type analysis.'}
          </p>
        </PanelSection>

        {/* Numerator */}
        <PanelSection title="Measure — count…">
          {isSession ? (
            <>
              <div className="text-[9px] text-slate-600">Session type</div>
              <ChipGroup options={KIND_OPTS} selected={num.kinds} onChange={(v) => setNum(n => ({ ...n, kinds: v.length ? v : ['worked'] }))} allowAll={false} />
              <div className="text-[9px] text-slate-600 mt-1">Session (optional)</div>
              <ChipGroup options={SESSION_OPTS} selected={num.sessions} onChange={(v) => setNum(n => ({ ...n, sessions: v }))} allLabel="AM+PM" />
            </>
          ) : (
            <>
              <div className="text-[9px] text-slate-600">Status</div>
              <ChipGroup options={STATUS_OPTS} selected={num.statuses} onChange={(v) => setNum(n => ({ ...n, statuses: v }))} />
              <div className="text-[9px] text-slate-600 mt-1">Category</div>
              <ChipGroup options={CATEGORY_OPTS} selected={num.categories} onChange={(v) => setNum(n => ({ ...n, categories: v }))} />
            </>
          )}
        </PanelSection>

        {/* Denominator */}
        <PanelSection title="Percentage">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={useDenom} onChange={e => setUseDenom(e.target.checked)} className="accent-indigo-500" />
            <span className="text-[10px] text-slate-300">Show as a % (÷ denominator)</span>
          </label>
          {useDenom && (
            <div className="mt-1 pl-3 space-y-2" style={{ borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
              <div className="text-[9px] text-slate-600">…as a % of:</div>
              {isSession ? (
                <>
                  <ChipGroup options={KIND_OPTS} selected={denom.kinds} onChange={(v) => setDenom(d => ({ ...d, kinds: v.length ? v : ['worked'] }))} allowAll={false} />
                  <ChipGroup options={SESSION_OPTS} selected={denom.sessions} onChange={(v) => setDenom(d => ({ ...d, sessions: v }))} allLabel="AM+PM" />
                </>
              ) : (
                <>
                  <div className="text-[9px] text-slate-600">Status</div>
                  <ChipGroup options={STATUS_OPTS} selected={denom.statuses} onChange={(v) => setDenom(d => ({ ...d, statuses: v }))} />
                  <div className="text-[9px] text-slate-600">Category</div>
                  <ChipGroup options={CATEGORY_OPTS} selected={denom.categories} onChange={(v) => setDenom(d => ({ ...d, categories: v }))} />
                </>
              )}
            </div>
          )}
        </PanelSection>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* Group by */}
        <PanelSection title="Group by">
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
            className="w-full text-[11px] rounded-md px-2 py-1.5"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}>
            {groupByOpts.map(o => <option key={o.id} value={o.id} style={{ background: '#1e293b' }}>{o.label}</option>)}
          </select>
        </PanelSection>

        {/* Range */}
        <PanelSection title="Date range">
          <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        </PanelSection>

        {/* Chart */}
        <PanelSection title="Chart">
          <Segmented
            options={[{ id: 'bars', label: 'Bars' }, { id: 'trend', label: 'Trend' }, { id: 'table', label: 'Table' }]}
            value={chart} onChange={setChart} disabledIds={timeOk ? [] : ['trend']} />
        </PanelSection>
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
        return (
          <div key={g.key} className="flex items-center gap-3">
            <div className="w-32 lg:w-36 text-[11px] font-medium text-slate-300 truncate text-right" title={g.label}>{g.label}</div>
            <div className="flex-1 relative h-7 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-lg transition-all" style={{ width: `${Math.max(widthPct, 1)}%`, background: colour, opacity: 0.8 }} />
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

// ── Trend over time ─────────────────────────────────────────────────────
function TrendView({ result, fmt, isRatio }) {
  const groups = result.groups;
  const W = 720, H = 240, padL = 40, padR = 16, padT = 16, padB = 40;
  const maxVal = Math.max(...groups.map(g => g.value), isRatio ? 100 : 1);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (groups.length === 1 ? innerW / 2 : (i / (groups.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / maxVal) * innerH;
  const pathD = groups.map((g, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(g.value).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${x(groups.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: maxVal * f, yy: y(maxVal * f) }));
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }}>
        {gridLines.map((gl, i) => (
          <g key={i}>
            <line x1={padL} y1={gl.yy} x2={W - padR} y2={gl.yy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 6} y={gl.yy + 3} textAnchor="end" fill="#64748b" style={{ fontSize: 9 }}>{isRatio ? `${Math.round(gl.v)}%` : Math.round(gl.v)}</text>
          </g>
        ))}
        <path d={areaD} fill="rgba(99,102,241,0.15)" />
        <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {groups.map((g, i) => (
          <g key={g.key}>
            <circle cx={x(i)} cy={y(g.value)} r="3.5" fill="#818cf8" stroke="#1e293b" strokeWidth="1.5" />
            <text x={x(i)} y={y(g.value) - 9} textAnchor="middle" fill="#c7d2fe" style={{ fontSize: 9, fontWeight: 700 }}>{fmt(g.value)}</text>
            <text x={x(i)} y={H - padB + 16} textAnchor="middle" fill="#64748b" style={{ fontSize: 9 }} transform={groups.length > 8 ? `rotate(-35 ${x(i)} ${H - padB + 16})` : undefined}>{g.label.replace('w/c ', '')}</text>
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
            {result.isRatio && <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 px-3 text-right">Num</th>}
            {result.isRatio && <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 px-3 text-right">Denom</th>}
            <th className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 py-2 pl-3 text-right">{result.isRatio ? 'Percentage' : 'Count'}</th>
          </tr>
        </thead>
        <tbody>
          {result.groups.map((g) => (
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
