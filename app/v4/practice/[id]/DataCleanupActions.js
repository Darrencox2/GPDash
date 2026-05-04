'use client';

// DataCleanupActions — targeted clear-data buttons. Used to live at the
// bottom of the legacy Settings page; moved into the Practice → Danger zone
// tab where destructive actions belong.

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

const supabase = createClient();

export default function DataCleanupActions({ practiceId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function clearRoomHistory() {
    if (!confirm('Clear all room allocation history? This removes saved room assignments for past dates. Cannot be undone.')) return;
    setBusy('rooms');
    setError('');
    setResult(null);
    // Read current room_allocation, wipe history fields, write back
    const { data, error: readErr } = await supabase
      .from('practice_settings')
      .select('room_allocation')
      .eq('practice_id', practiceId)
      .maybeSingle();
    if (readErr) { setError(readErr.message); setBusy(null); return; }
    const ra = { ...(data?.room_allocation || {}), allocationHistory: {}, dailyOverrides: {} };
    const { error: writeErr } = await supabase
      .from('practice_settings')
      .update({ room_allocation: ra })
      .eq('practice_id', practiceId);
    setBusy(null);
    if (writeErr) { setError(writeErr.message); return; }
    setResult('✓ Room allocation history cleared.');
    router.refresh();
  }

  async function clearHuddleCsv() {
    if (!confirm('Clear the parsed huddle CSV data? Today and Capacity Planning will be empty until you re-upload. Cannot be undone.')) return;
    setBusy('csv');
    setError('');
    setResult(null);
    const { error: err } = await supabase
      .from('huddle_csv_data')
      .delete()
      .eq('practice_id', practiceId);
    setBusy(null);
    if (err) { setError(err.message); return; }
    setResult('✓ Huddle CSV data cleared. Re-upload on the Today page.');
    router.refresh();
  }

  async function clearBuddyHistory() {
    if (!confirm('Clear all buddy allocation history? Past buddy cover assignments will be removed. Cannot be undone.')) return;
    setBusy('buddy');
    setError('');
    setResult(null);
    const { data, error: readErr } = await supabase
      .from('practice_settings')
      .select('extras')
      .eq('practice_id', practiceId)
      .maybeSingle();
    if (readErr) { setError(readErr.message); setBusy(null); return; }
    const extras = { ...(data?.extras || {}), allocationHistory: {} };
    const { error: writeErr } = await supabase
      .from('practice_settings')
      .update({ extras })
      .eq('practice_id', practiceId);
    setBusy(null);
    if (writeErr) { setError(writeErr.message); return; }
    setResult('✓ Buddy allocation history cleared.');
    router.refresh();
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
        Clear specific datasets without deleting the whole practice. Each action is permanent.
      </p>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 10, borderRadius: 8, fontSize: 14, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', padding: 10, borderRadius: 8, fontSize: 14, marginBottom: 12 }}>
          {result}
        </div>
      )}

      <CleanupRow
        title="Room allocation history"
        description="Saved room assignments for past dates"
        busy={busy === 'rooms'}
        onClick={clearRoomHistory}
      />
      <CleanupRow
        title="Huddle CSV data"
        description="Parsed appointment data — Today and Capacity Planning will need a fresh upload"
        busy={busy === 'csv'}
        onClick={clearHuddleCsv}
      />
      <CleanupRow
        title="Buddy allocation history"
        description="Past buddy cover assignments"
        busy={busy === 'buddy'}
        onClick={clearBuddyHistory}
      />
    </div>
  );
}

function CleanupRow({ title, description, busy, onClick }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      marginBottom: 8,
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{
          padding: '8px 14px',
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          color: '#fbbf24',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
          flexShrink: 0,
        }}>
        {busy ? 'Clearing…' : 'Clear'}
      </button>
    </div>
  );
}
