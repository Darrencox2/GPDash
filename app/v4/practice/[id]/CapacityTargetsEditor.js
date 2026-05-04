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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      <Card title="Urgent expected capacity" status={saving ? 'saving' : saved ? 'saved' : null}>
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
          Expected urgent slots per session. These targets colour-code the Today page and
          Capacity Planning view: <span style={{ color: '#34d399' }}>green</span> at ≥90%,
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
