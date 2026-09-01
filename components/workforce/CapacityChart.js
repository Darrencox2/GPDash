'use client';
// ═══════════════════════════════════════════════════════════════════════════
// CapacityChart — the line above the Staff Changes grid
// ═══════════════════════════════════════════════════════════════════════════
// Two views of the same measure (total sessions a week for whoever the role
// filter leaves in), and a ribbon naming the person behind every step:
//
//   level — where capacity sits, on a scale with numbers on it
//   delta — the same series minus today, so "how far down am I in November"
//           is one glance and zero is a fact rather than a choice
//
// It renders INSIDE the grid's scroll container, on the grid's own column
// track (200px gutter + 13 equal months), so a step in the line sits directly
// above the month square that caused it. Everything the eye must read stays
// HTML at real pixels; only the marks are SVG.
import { useEffect, useMemo, useRef, useState } from 'react';
import { monthLabel, monthFraction } from '@/lib/staff-plan';

// Shared with the grid below, so a chip means the same thing in both places.
export const EVENT_TONE = {
  join:       { bg: 'rgba(52,211,153,0.16)', bd: 'rgba(52,211,153,0.5)', fg: '#34d399' },
  return:     { bg: 'rgba(52,211,153,0.10)', bd: 'rgba(52,211,153,0.35)', fg: '#6ee7b7' },
  leave:      { bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.5)', fg: '#fca5a5' },
  temp_leave: { bg: 'rgba(245,158,11,0.13)', bd: 'rgba(245,158,11,0.45)', fg: '#fbbf24' },
  change:     { bg: 'rgba(129,140,248,0.15)', bd: 'rgba(129,140,248,0.5)', fg: '#a5b4fc' },
};
const GRID_COLS = '200px repeat(13, minmax(0, 1fr))';
const H = 186;            // plot height; month names come from the grid header
const PT = 16, PB = 10;
const CHIP_W = 74;        // ribbon chips are packed into lanes at this width
const MINUS = '\u2212';   // a real minus, matching the chips
const GROUP_ROWS = [['gp', 'GPs'], ['nursing', 'Nursing'], ['hca', 'HCAs'], ['other', 'Other']];

// Ticks a person would choose: 4-ish round numbers covering the data.
function niceTicks(lo, hi) {
  const span = Math.max(hi - lo, 1);
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const first = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = first; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export default function CapacityChart({
  months, todayMk, timeline, per1000, listSizeAt, view, onViewChange,
}) {
  const plotRef = useRef(null);
  const [W, setW] = useState(760);
  const [hover, setHover] = useState(null);      // month index under the pointer
  const [openRibbon, setOpenRibbon] = useState(false);

  // The plot is a grid cell, so its width is whatever the track gives it.
  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(node);
    setW(Math.max(320, node.clientWidth));
    return () => ro.disconnect();
  }, []);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const steps = timeline.steps;

  // Per 1,000 patients divides by the list size in force on that date; the
  // NHS-published sizes are sparse, so listSizeAt carries the last one on.
  const val = useMemo(() => (v, date) => {
    if (!per1000) return v;
    const size = listSizeAt?.(date);
    return size ? Math.round((v / (size / 1000)) * 10) / 10 : null;
  }, [per1000, listSizeAt]);

  const { nowValue, nowGroups } = useMemo(() => {
    let at = steps[0];
    for (const s of steps) if (s.date <= todayIso) at = s;
    return { nowValue: at?.value ?? 0, nowGroups: at?.byGroup || {} };
  }, [steps, todayIso]);

  const series = useMemo(
    () => steps.map((s) => ({ ...s, v: val(s.value, s.date) })).filter((s) => s.v != null),
    [steps, val]
  );
  const isDelta = view === 'delta';
  const base = isDelta ? val(nowValue, todayIso) ?? 0 : 0;
  const plotted = series.map((s) => ({ ...s, y: s.v - base }));

  const vals = plotted.map((s) => s.y);
  const rawLo = Math.min(...vals, isDelta ? 0 : Infinity);
  const rawHi = Math.max(...vals, isDelta ? 0 : -Infinity);
  const pad = Math.max((rawHi - rawLo) * 0.22, per1000 ? 0.3 : 2);
  const lo = rawLo - pad, hi = rawHi + pad;

  const X = (x) => (W * x) / 13;
  const Y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo || 1));
  const todayX = X(monthFraction(todayIso, months));
  const unit = per1000 ? '/1k' : '/wk';

  // Step-after: a value holds until the next breakpoint.
  const linePath = (() => {
    if (!plotted.length) return '';
    let d = `M ${X(plotted[0].x)} ${Y(plotted[0].y)}`;
    for (let i = 1; i < plotted.length; i++) d += ` L ${X(plotted[i].x)} ${Y(plotted[i - 1].y)} L ${X(plotted[i].x)} ${Y(plotted[i].y)}`;
    return `${d} L ${X(13)} ${Y(plotted[plotted.length - 1].y)}`;
  })();
  const areaPath = linePath ? `${linePath} L ${X(13)} ${Y(0)} L ${X(plotted[0].x)} ${Y(0)} Z` : '';

  const valueAt = (date) => {
    let v = plotted[0];
    for (const s of plotted) if (s.date <= date) v = s;
    return v;
  };
  const low = plotted.reduce((a, b) => (b.y < a.y ? b : a), plotted[0] || { y: 0, x: 0 });
  const endY = plotted.length ? plotted[plotted.length - 1].y : 0;

  // Ribbon: chips packed into lanes so two people moving days apart both show.
  const lanes = (() => {
    const ends = [];
    return timeline.marks.map((m) => {
      const left = Math.max(0, Math.min(W - CHIP_W, X(m.x) - CHIP_W / 2));
      let lane = ends.findIndex((r) => r <= left - 3);
      if (lane < 0) { lane = ends.length; ends.push(0); }
      ends[lane] = left + CHIP_W;
      return { m, left, lane };
    });
  })();
  const laneCount = lanes.reduce((n, l) => Math.max(n, l.lane + 1), 0);

  const hoverInfo = hover == null ? null : {
    mk: months[hover],
    marks: timeline.marks.filter((m) => m.date.slice(0, 7) === months[hover]),
    start: valueAt(`${months[hover]}-01`),
    end: valueAt(`${months[hover]}-31`),
  };

  return (
    <div>
      {/* ── chart row: gutter carries the reading, plot sits on the months ── */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--g-border)' }}>
        <div className="px-3 py-2 flex flex-col justify-center gap-1.5" style={{ borderRight: '1px solid var(--g-border)' }}>
          <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--g-border-2)' }}>
            {[['level', 'Sessions'], ['delta', 'vs today']].map(([k, label]) => (
              <button key={k} onClick={() => onViewChange(k)} aria-pressed={view === k}
                className="flex-1 px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: view === k ? 'var(--accent-soft)' : 'transparent',
                  color: view === k ? 'var(--accent-text)' : 'var(--meta)',
                }}>{label}</button>
            ))}
          </div>
          {/* The split today, which the line itself cannot show: it is what
              says a dip is GPs rather than the practice as a whole. */}
          <div className="font-mono-data" style={{ fontSize: 11, color: 'var(--meta)', lineHeight: 1.6 }}>
            {GROUP_ROWS.filter(([k]) => nowGroups[k]).map(([k, label]) => (
              <div key={k} className="flex justify-between gap-2">
                <span>{label}</span>
                <span style={{ color: 'var(--g-text-hi)', fontWeight: 700 }}>{val(nowGroups[k], todayIso) ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div ref={plotRef} style={{ gridColumn: '2 / -1', position: 'relative' }}
          onMouseLeave={() => setHover(null)}>
          <svg width={W} height={H} style={{ display: 'block' }} role="img"
            aria-label={isDelta
              ? `Sessions a week above or below today's ${val(nowValue, todayIso)}, across ${monthLabel(months[0])} to ${monthLabel(months[12])}`
              : `Total sessions a week from ${monthLabel(months[0])} to ${monthLabel(months[12])}, currently ${val(nowValue, todayIso)}`}>
            <defs>
              <clipPath id="cc-up"><rect x="0" y="0" width={W} height={Math.max(Y(0), 0)} /></clipPath>
              <clipPath id="cc-down"><rect x="0" y={Y(0)} width={W} height={Math.max(H - Y(0), 0)} /></clipPath>
              <clipPath id="cc-past"><rect x="0" y="0" width={Math.max(todayX, 0)} height={H} /></clipPath>
              <clipPath id="cc-future"><rect x={todayX} y="0" width={Math.max(W - todayX, 0)} height={H} /></clipPath>
            </defs>

            {/* month bands, so the eye can drop from a step to its square */}
            {months.map((mk, i) => (
              <rect key={mk} x={X(i)} y="0" width={X(1)} height={H}
                fill={hover === i ? 'rgba(255,255,255,0.055)' : mk === todayMk ? 'rgba(52,211,153,0.05)' : 'transparent'} />
            ))}
            {months.map((mk, i) => i === 0 ? null : (
              <line key={mk} x1={X(i)} x2={X(i)} y1="0" y2={H} stroke="var(--g-border)" />
            ))}

            {niceTicks(lo, hi).map((t) => (
              <g key={t}>
                <line x1="0" x2={W} y1={Y(t)} y2={Y(t)} stroke="var(--g-border-2)" />
                <text x="4" y={Y(t) - 3} fontSize="10" fill="var(--meta)" fontFamily="var(--font-mono)"
                  stroke="var(--g-panel-2)" strokeWidth="3" paintOrder="stroke">
                  {isDelta && t > 0 ? `+${t}` : String(t).replace('-', MINUS)}
                </text>
              </g>
            ))}

            {isDelta ? (
              <>
                <path d={areaPath} fill="rgba(52,211,153,0.22)" clipPath="url(#cc-up)" />
                <path d={areaPath} fill="rgba(239,68,68,0.22)" clipPath="url(#cc-down)" />
                <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--meta)" strokeWidth="1.5" />
              </>
            ) : null}

            <path d={linePath} fill="none" strokeWidth="2.5" strokeLinejoin="round"
              stroke={isDelta ? 'var(--g-text-hi)' : 'var(--accent-2)'} clipPath="url(#cc-past)" />
            <path d={linePath} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="5 4"
              stroke={isDelta ? 'var(--g-text-hi)' : 'var(--accent-2)'} clipPath="url(#cc-future)" />

            <line x1={todayX} x2={todayX} y1="0" y2={H} stroke="rgba(52,211,153,0.5)" />
            <text x={todayX + 5} y={PT - 4} fontSize="10" fill="var(--link)" fontFamily="var(--font-mono)">today</text>

            {/* one dot per step, so a return is as visible as a departure */}
            {timeline.marks.map((m, i) => {
              const at = valueAt(m.date);
              if (!at) return null;
              return <circle key={i} cx={X(m.x)} cy={Y(at.y)} r="3.5"
                fill={(EVENT_TONE[m.type] || EVENT_TONE.change).fg} stroke="var(--g-panel-2)" strokeWidth="1.5" />;
            })}

            {/* two direct labels only: the low point and where the year ends */}
            {plotted.length > 1 && low && low.y < endY && (
              <text x={Math.min(X(low.x) + 6, W - 46)} y={Y(low.y) + 15} fontSize="11" fontWeight="700"
                fill="var(--c-amber)" fontFamily="var(--font-mono)"
                stroke="var(--g-panel-2)" strokeWidth="3" paintOrder="stroke">
                {isDelta && low.y > 0 ? '+' : ''}{String(low.y).replace('-', MINUS)}
              </text>
            )}
            <text x={W - 4} y={Y(endY) - 8} fontSize="12" fontWeight="700" textAnchor="end"
              fill="var(--g-text-hi)" fontFamily="var(--font-mono)"
              stroke="var(--g-panel-2)" strokeWidth="3.5" paintOrder="stroke">
              {isDelta && endY > 0 ? '+' : ''}{String(endY).replace('-', MINUS)}{unit}
            </text>

            {months.map((mk, i) => (
              <rect key={mk} x={X(i)} y="0" width={X(1)} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)} style={{ cursor: 'crosshair' }} />
            ))}
          </svg>

          {hoverInfo && (
            <div className="rounded-lg px-2.5 py-2 text-xs" style={{
              position: 'absolute', top: 6, pointerEvents: 'none', zIndex: 5, width: 178,
              left: Math.max(4, Math.min(W - 182, X(hover) + X(0.5) - 89)),
              background: 'var(--g-panel-strong)', border: '1px solid var(--g-border-2)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            }}>
              <div className="text-[10px] uppercase" style={{ color: 'var(--meta)', fontFamily: 'var(--font-mono)', letterSpacing: '0.07em' }}>
                {monthLabel(hoverInfo.mk)} {hoverInfo.mk.slice(0, 4)}
              </div>
              <div className="font-mono-data font-bold" style={{ fontSize: 15, color: 'var(--g-text-hi)' }}>
                {hoverInfo.end ? `${isDelta && hoverInfo.end.y > 0 ? '+' : ''}${String(hoverInfo.end.y).replace('-', MINUS)}` : '—'}
                <span className="text-[11px] font-normal" style={{ color: 'var(--meta)' }}> {unit}</span>
              </div>
              {hoverInfo.start && hoverInfo.end && hoverInfo.start.y !== hoverInfo.end.y && (
                <div className="text-[11px]" style={{ color: 'var(--meta)' }}>from {hoverInfo.start.y} at the start of the month</div>
              )}
              {hoverInfo.marks.map((m, i) => (
                <div key={i} className="text-[11px] mt-1" style={{ color: (EVENT_TONE[m.type] || EVENT_TONE.change).fg }}>
                  {m.name}{m.code ? ` · ${m.code}` : ''} <b style={{ fontFamily: 'var(--font-mono)' }}>{m.delta > 0 ? '+' : MINUS}{Math.abs(m.delta)}</b>
                  <span style={{ color: 'var(--meta)' }}> · {Number(m.date.slice(8, 10))} {monthLabel(m.date.slice(0, 7))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── the ribbon: folded away until asked for ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--g-border)' }}>
        <div className="px-3 py-1.5" style={{ borderRight: '1px solid var(--g-border)' }}>
          <button onClick={() => setOpenRibbon((v) => !v)} aria-expanded={openRibbon}
            className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--meta)' }}>
            <span style={{ display: 'inline-block', transform: openRibbon ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
            What moves the line
            <span className="font-mono-data" style={{ color: 'var(--g-text-faint)' }}>{timeline.marks.length}</span>
          </button>
        </div>
        <div style={{ gridColumn: '2 / -1', position: 'relative', minHeight: 26, height: openRibbon ? laneCount * 30 + 8 : 26 }}>
          {openRibbon ? lanes.map(({ m, left, lane }, i) => {
            const tone = EVENT_TONE[m.type] || EVENT_TONE.change;
            return (
              <div key={i} title={`${m.name} · ${Number(m.date.slice(8, 10))} ${monthLabel(m.date.slice(0, 7))} ${m.date.slice(0, 4)}`}
                style={{
                  position: 'absolute', left, top: lane * 30 + 4, width: CHIP_W,
                  background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg,
                  borderRadius: 6, padding: '2px 3px 3px', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                <span style={{ display: 'block', fontSize: 9.5, lineHeight: 1.25, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.tag}{m.code ? ` ${m.code}` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>
                  {m.delta > 0 ? '+' : MINUS}{Math.abs(m.delta)}
                </span>
              </div>
            );
          }) : (
            <div className="px-3 py-1.5 text-[11px]" style={{ color: 'var(--g-text-faint)' }}>
              {timeline.marks.length === 0 ? 'Nothing recorded in this year' : 'Every join, leave, absence and session change, on the day it lands'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
