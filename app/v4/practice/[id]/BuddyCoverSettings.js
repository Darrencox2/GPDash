'use client';

// BuddyCoverSettings — workload-weight sliders for the buddy-cover algorithm.
// Persists into practice_settings.buddy_settings JSONB.
//
// Other things that used to live in the legacy "Settings" page have moved
// elsewhere: TeamNet → Resources tab, capacity targets → Capacity Planning,
// data cleanup → Danger zone tab. This page is now genuinely buddy-specific.

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export default function BuddyCoverSettings({ practiceId, initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || {});
  const [savingField, setSavingField] = useState(null);
  const [savedField, setSavedField] = useState(null);
  const [error, setError] = useState('');

  async function saveSetting(field, value) {
    const newSettings = { ...settings, [field]: value };
    setSettings(newSettings);
    // Both sliders share the same status row on the parent Card (it's a
    // "Workload weights" group, not per-slider). Use the group's id as
    // the saving/saved key so the tick shows up regardless of which one
    // the user dragged.
    setSavingField('weights');
    setError('');
    const { error: err } = await supabase
      .from('practice_settings')
      .update({ buddy_settings: newSettings })
      .eq('practice_id', practiceId);
    setSavingField(null);
    if (err) {
      setError(`Couldn't save: ${err.message}`);
      return;
    }
    setSavedField('weights');
    setTimeout(() => setSavedField(null), 1500);
  }

  const absentWeight = settings.absentWeight ?? 2;
  const dayOffWeight = settings.dayOffWeight ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      <Card title="Workload weights" status={fieldStatus('weights', savingField, savedField)}>
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 18 }}>
          Adjust how workload is calculated when balancing buddy cover allocations.
          Higher values make that type of cover count more towards a clinician's load.
        </p>

        <Slider
          label="Absent (File & Action)"
          description="Multiplier when covering an absent clinician's slots"
          value={absentWeight}
          min={0.5}
          max={10}
          step={0.5}
          onChange={(v) => saveSetting('absentWeight', v)}
        />

        <Slider
          label="Day off (View Only)"
          description="Multiplier when viewing a day-off colleague's results"
          value={dayOffWeight}
          min={0.5}
          max={10}
          step={0.5}
          onChange={(v) => saveSetting('dayOffWeight', v)}
        />
      </Card>

      <Card title="How the algorithm works">
        <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>
          <strong style={{ color: 'white' }}>Round-robin first.</strong> Everyone gets one allocation
          before anyone gets two. Primary buddy is tried first, then secondary, then any eligible
          clinician.
        </p>
        <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7, marginTop: 12 }}>
          <strong style={{ color: 'white' }}>Weighted tiebreaking.</strong> When multiple clinicians
          have the same allocation count, the lowest weighted load wins.
        </p>
        <div style={{
          marginTop: 14,
          padding: 12,
          background: 'rgba(0,0,0,0.25)',
          borderRadius: 8,
          fontSize: 14,
          color: '#a5b4fc',
          fontFamily: 'ui-monospace, Menlo, monospace',
        }}>
          load = (absent × {absentWeight}) + (day-off × {dayOffWeight})
        </div>
      </Card>
    </div>
  );
}

function Slider({ label, description, value, min, max, step, onChange }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      background: 'rgba(0,0,0,0.2)',
      borderRadius: 8,
      marginBottom: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>{label}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          style={{
            width: 70,
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 15,
            fontWeight: 600,
            textAlign: 'center',
          }}
        />
        <span style={{ fontSize: 13, color: '#64748b' }}>× sessions</span>
      </div>
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

function fieldStatus(field, savingField, savedField) {
  if (savingField === field) return 'saving';
  if (savedField === field) return 'saved';
  return null;
}
