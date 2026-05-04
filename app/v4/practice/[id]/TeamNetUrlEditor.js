'use client';

// TeamNetUrlEditor — calendar URL input + manual sync trigger.
// TeamNet calendar feeds planned absences which are used by Today, Capacity
// Planning AND Buddy cover — so it lives in Resources rather than buried in
// any single feature's settings.

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export default function TeamNetUrlEditor({ practiceId, initialUrl, lastSyncTime, plannedAbsenceCount }) {
  const [url, setUrl] = useState(initialUrl || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [error, setError] = useState('');

  async function saveUrl() {
    if (url === (initialUrl || '')) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('practice_settings')
      .update({ teamnet_url: url || null })
      .eq('practice_id', practiceId);
    setSaving(false);
    if (err) {
      setError(`Couldn't save: ${err.message}`);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function syncNow() {
    if (!url) {
      setError('Enter a TeamNet calendar URL first.');
      return;
    }
    setSyncing(true);
    setSyncStatus(null);
    setError('');
    try {
      const r = await fetch(`/api/v4/sync-teamnet?practice=${practiceId}`, {
        method: 'POST',
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      setSyncStatus(`Synced — imported ${json.imported || 0} absences`);
    } catch (err) {
      setSyncStatus(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 14, marginBottom: 12 }}>
          {error}
        </div>
      )}
      <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
        Calendar URL from TeamNet → Diary → Sync. Once set, the app pulls planned absences
        automatically when opened. These absences appear on Today, Capacity Planning, and Buddy cover.
      </p>

      <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
        TeamNet calendar URL
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={saveUrl}
        placeholder="https://teamnet.clarity.co.uk/Diary/Sync/..."
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          color: '#e2e8f0',
          fontSize: 15,
        }}
      />
      {saving && <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>Saving…</div>}
      {saved && <div style={{ marginTop: 6, fontSize: 13, color: '#34d399' }}>✓ Saved</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={syncNow}
          disabled={!url || syncing}
          style={{
            padding: '8px 16px',
            background: url && !syncing ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${url && !syncing ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: url && !syncing ? '#22d3ee' : '#64748b',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: url && !syncing ? 'pointer' : 'not-allowed',
          }}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        {lastSyncTime && (
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Last sync: {new Date(lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {plannedAbsenceCount > 0 && (
          <span style={{ fontSize: 13, color: '#94a3b8' }}>
            · {plannedAbsenceCount} upcoming absence{plannedAbsenceCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {syncStatus && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: syncStatus.startsWith('Sync failed') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
          border: `1px solid ${syncStatus.startsWith('Sync failed') ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
          color: syncStatus.startsWith('Sync failed') ? '#fca5a5' : '#34d399',
          borderRadius: 6,
          fontSize: 14,
        }}>
          {syncStatus}
        </div>
      )}
    </div>
  );
}
