'use client';
// The reporting landing: last week against the week before, five tiles,
// each a door into the report that explains it.
import { useMemo } from 'react';
import { weeklyDigest } from '@/lib/reporting-digest';
import { PRESETS } from '@/lib/workload-report';

export default function WeeklyDigest({ slotData, sessionData, onOpenPreset }) {
  const d = useMemo(() => weeklyDigest({ slotFacts: slotData?.facts || [], sessionFacts: sessionData?.facts || [], hasDuty: !!sessionData?.hasDuty }), [slotData, sessionData]);
  if (!d) return null;
  return (
    <section aria-label="Last week at a glance" className="mb-6">
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, color: 'var(--g-text-hi)', margin: 0 }}>Last week</h2>
        <span className="text-xs" style={{ color: 'var(--meta)' }}>{d.weekLabel}{d.prevLabel ? ` against ${d.prevLabel}` : ''} · the most recent finished week in the export</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${d.tiles.length}, minmax(0, 1fr))` }}>
        {d.tiles.map((t) => {
          const preset = PRESETS.find((p) => p.id === t.presetId);
          const dv = t.delta?.value ?? null;
          const tone = dv == null || dv === 0 || t.upIsGood == null ? 'var(--meta)' : ((dv > 0) === t.upIsGood ? 'var(--state-ok)' : 'var(--state-short)');
          return (
            <button key={t.id} onClick={() => preset && onOpenPreset?.(preset)} title={preset ? `Open: ${preset.label}` : undefined}
              className="text-left rounded-xl p-4 transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--g-card)', border: '1px solid var(--g-border-2)', cursor: preset ? 'pointer' : 'default', minWidth: 0 }}>
              <div className="label-caps" style={{ color: 'var(--meta)' }}>{t.label}</div>
              <div className="font-mono-data" style={{ fontSize: 26, color: 'var(--g-text-hi)', marginTop: 4, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.display}</div>
              <div className="text-xs mt-1.5 flex items-baseline gap-1.5 flex-wrap" style={{ color: 'var(--meta)' }}>
                {t.delta ? <span className="font-mono-data" style={{ color: tone, fontWeight: 700 }}>{t.delta.display}</span> : null}
                <span>{t.delta ? `from ${t.prevDisplay}` : (t.prevDisplay !== '—' ? `was ${t.prevDisplay}` : '')}</span>
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--g-text-mid)' }}>{t.note}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
