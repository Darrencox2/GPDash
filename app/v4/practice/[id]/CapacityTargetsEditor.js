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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      <Card title="Today gauge target (demand-driven)" status={saving ? 'saving' : saved ? 'saved' : null}>
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
          The Today page urgent gauge target is calculated dynamically from
          today's predicted demand. This slider sets what proportion of
          requests typically need an urgent slot. The static table below is
          used as a fallback when there's no prediction available, and for
          Capacity Planning's weekly view.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ fontSize: 14, color: '#cbd5e1', minWidth: 130 }}>
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
            color: '#e2e8f0',
            background: 'rgba(0,0,0,0.3)',
            padding: '6px 14px',
            borderRadius: 6,
            minWidth: 64,
            textAlign: 'center',
            fontFamily: "'Space Mono', monospace",
          }}>
            {convRate.toFixed(2)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          Example: if today's predicted demand is {sampleDemand} requests
          and the ratio is {convRate.toFixed(2)}, the gauge target will be {sampleTarget} urgent
          slots ({sampleDemand} × {convRate.toFixed(2)}).
        </p>
      </Card>

      <Card title="Static capacity targets (capacity planning)" status={saving ? 'saving' : saved ? 'saved' : null}>
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
          Fixed expected slots per session per weekday. Used by Capacity Planning's
          weekly view, and as a fallback for Today's gauge when no prediction is
          available. Colour bands: <span style={{ color: '#34d399' }}>green</span> at ≥90%,
          {' '}<span style={{ color: '#fbbf24' }}>amber</span> at 80–89%,
          {' '}<span style={{ color: '#f87171' }}>red</span> below 80%.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: '#64748b', fontSize: 12, fontWeight: 600, width: 100 }}></th>
                {DAYS.map(d => (
                  <th key={d} style={{ textAlign: 'center', padding: '8px 4px', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                    {d.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['am', 'pm'].map(session => (
                <tr key={session} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 4px', fontSize: 13, fontWeight: 500, color: session === 'am' ? '#fbbf24' : '#60a5fa' }}>
                    {session === 'am' ? 'Morning' : 'Afternoon'}
                  </td>
                  {DAYS.map(d => (
                    <td key={d} style={{ textAlign: 'center', padding: '6px 4px' }}>
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
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          color: '#e2e8f0',
                          fontSize: 14,
                          textAlign: 'center',
                          fontFamily: "'Space Mono', monospace",
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
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
          Total routine appointment slots you aim to offer per week. Used in
          Capacity Planning to colour-code the weekly routine totals.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, color: '#cbd5e1' }}>Target slots per week</label>
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
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#e2e8f0',
              fontSize: 15,
              textAlign: 'center',
              fontFamily: "'Space Mono', monospace",
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
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#cbd5e1' }}>{title}</h3>
        {status === 'saving' && <span style={{ fontSize: 13, color: '#64748b' }}>Saving…</span>}
        {status === 'saved' && <span style={{ fontSize: 13, color: '#34d399' }}>✓ Saved</span>}
      </div>
      {children}
    </div>
  );
}
