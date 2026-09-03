'use client';

// CapacityTargetsEditor — urgent expected slots per session per weekday +
// routine weekly target. Lives in the Demand model tab on the Practice page
// because these targets calibrate what "enough" capacity looks like, which
// is conceptually the demand side.
//
// Persists into practice_settings.huddle_settings JSONB:
//   { expectedCapacity: { Monday: { am, pm }, Tuesday: ... }, routineWeeklyTarget }

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function CapacityTargetsEditor({ practiceId, initialHuddleSettings }) {
  const [hs, setHs] = useState(initialHuddleSettings || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function persist(newHs) {
    setHs(newHs);
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('practice_settings')
      .update({ huddle_settings: newHs })
      .eq('practice_id', practiceId);
    setSaving(false);
    if (err) {
      setError(`Couldn't save: ${err.message}`);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function updateExpected(day, session, value) {
    const newExpected = { ...(hs.expectedCapacity || {}) };
    if (!newExpected[day]) newExpected[day] = {};
    newExpected[day][session] = parseInt(value) || 0;
    persist({ ...hs, expectedCapacity: newExpected });
  }

  function updateRoutine(value) {
    persist({ ...hs, routineWeeklyTarget: parseInt(value) || 0 });
  }

  function updateConvRate(value) {
    const dc = hs.demandCapacity || {};
    persist({ ...hs, demandCapacity: { ...dc, conversionRate: parseFloat(value) } });
  }

  const convRate = hs?.demandCapacity?.conversionRate ?? 0.25;
  // Compute a sample target so users can see what the slider produces
  const sampleDemand = 130;
  const sampleTarget = Math.round(sampleDemand * convRate);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--c-red)', padding: 12, borderRadius: 'var(--r-md)', fontSize: 14 }}>
          {error}
        </div>
      )}

      <Card title="Today gauge target (demand-driven)" status={saving ? 'saving' : saved ? 'saved' : null}>
        <p className="text-body text-mid leading-body mb-3.5">
          The Today page urgent gauge target is calculated dynamically from
          today's predicted demand. This slider sets what proportion of
          requests typically need an urgent slot. The static table below is
          used as a fallback when there's no prediction available, and for
          Capacity Planning's weekly view.
        </p>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <label style={{ fontSize: 14, color: 'var(--g-text-hi)', minWidth: 130 }}>
            Demand → urgent ratio
          </label>
          <input
            type="range"
            min={0.05}
            max={0.60}
            step={0.01}
            value={convRate}
            onChange={(e) => updateConvRate(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--g-text-hi)',
            background: 'var(--g-field)',
            padding: '6px 14px',
            borderRadius: 'var(--r-sm)',
            minWidth: 64,
            textAlign: 'center',
            fontFamily: "var(--font-mono)",
          }}>
            {convRate.toFixed(2)}
          </span>
        </div>
        <p className="text-meta text-mid mt-2">
          Example: if today's predicted demand is {sampleDemand} requests
          and the ratio is {convRate.toFixed(2)}, the gauge target will be {sampleTarget} urgent
          slots ({sampleDemand} × {convRate.toFixed(2)}).
        </p>
      </Card>

      <Card title="Static capacity targets (capacity planning)" status={saving ? 'saving' : saved ? 'saved' : null}>
        <p className="text-body text-mid leading-body mb-3.5">
          Fixed expected slots per session per weekday. Used by Capacity Planning's
          weekly view, and as a fallback for Today's gauge when no prediction is
          available. Colour bands: <span className="text-emerald-400">green</span> at ≥90%,
          {' '}<span className="text-amber-400">amber</span> at 80–89%,
          {' '}<span className="text-red-400">red</span> below 80%.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--g-text-mid)', fontSize: 12, fontWeight: 600, width: 100 }}></th>
                {DAYS.map(d => (
                  <th key={d} className="text-center px-1 py-2 text-mid text-meta font-semibold">
                    {d.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['am', 'pm'].map(session => (
                <tr key={session} style={{ borderTop: '1px solid var(--g-tile)' }}>
                  <td style={{ padding: '10px 4px', fontSize: 13, fontWeight: 500, color: session === 'am' ? 'var(--c-amber-2)' : 'var(--c-blue-2)' }}>
                    {session === 'am' ? 'Morning' : 'Afternoon'}
                  </td>
                  {DAYS.map(d => (
                    <td key={d} className="text-center px-1 py-1.5">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={hs.expectedCapacity?.[d]?.[session] ?? ''}
                        onChange={(e) => updateExpected(d, session, e.target.value)}
                        placeholder="–"
                        style={{
                          width: 64,
                          padding: '6px 4px',
                          background: 'var(--g-field)',
                          border: '1px solid var(--g-line)',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--g-text-hi)',
                          fontSize: 14,
                          textAlign: 'center',
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Routine weekly target" status={saving ? 'saving' : saved ? 'saved' : null}>
        <p className="text-body text-mid leading-body mb-3.5">
          Total routine appointment slots you aim to offer per week. Used in
          Capacity Planning to colour-code the weekly routine totals.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-body text-hi">Target slots per week</label>
          <input
            type="number"
            min={0}
            max={9999}
            value={hs.routineWeeklyTarget || ''}
            onChange={(e) => updateRoutine(e.target.value)}
            placeholder="e.g. 200"
            style={{
              width: 100,
              padding: '8px 12px',
              background: 'var(--g-field)',
              border: '1px solid var(--g-line)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--g-text-hi)',
              fontSize: 15,
              textAlign: 'center',
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
      </Card>
    </div>
  );
}

function Card({ title, status, children }) {
  return (
    <div style={{
      background: 'var(--g-tile-2)',
      border: '1px solid var(--g-border-2)',
      borderRadius: 'var(--r-lg)',
      padding: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)' }}>{title}</h3>
        {status === 'saving' && <span className="text-body-sm text-mid">Saving…</span>}
        {status === 'saved' && <span className="text-body-sm text-emerald-400">✓ Saved</span>}
      </div>
      {children}
    </div>
  );
}
