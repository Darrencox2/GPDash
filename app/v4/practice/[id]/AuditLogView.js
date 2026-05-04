'use client';

// AuditLogView — v4-native viewer for audit_events. Fetches recent events
// directly from supabase (RLS lets practice admins read their own events).
// Filter chips + simple list. The legacy components/AuditLog.js reads from
// the v3 in-memory blob and doesn't apply here.

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

// Visual metadata per event type. Default colour for anything unmapped.
const TYPE_META = {
  // Practice management
  practice_created: { label: 'Practice', colour: '#22d3ee' },
  practice_updated: { label: 'Practice', colour: '#22d3ee' },
  user_invited: { label: 'Users', colour: '#a78bfa' },
  invite_accepted: { label: 'Users', colour: '#a78bfa' },
  invite_revoked: { label: 'Users', colour: '#a78bfa' },
  user_role_changed: { label: 'Users', colour: '#a78bfa' },
  user_removed: { label: 'Users', colour: '#a78bfa' },
  // Clinicians
  clinician_added: { label: 'Clinician', colour: '#fbbf24' },
  clinician_updated: { label: 'Clinician', colour: '#fbbf24' },
  clinician_status_changed: { label: 'Clinician', colour: '#fbbf24' },
  clinician_deleted: { label: 'Clinician', colour: '#fbbf24' },
  // Patterns / absences
  working_pattern_changed: { label: 'Pattern', colour: '#60a5fa' },
  absence_added: { label: 'Absence', colour: '#60a5fa' },
  absence_updated: { label: 'Absence', colour: '#60a5fa' },
  absence_deleted: { label: 'Absence', colour: '#60a5fa' },
  daily_override_set: { label: 'Override', colour: '#60a5fa' },
  // CSV
  csv_uploaded: { label: 'CSV', colour: '#34d399' },
  // Buddy / rota
  buddy_allocations_generated: { label: 'Buddy', colour: '#a78bfa' },
  buddy_allocations_edited: { label: 'Buddy', colour: '#a78bfa' },
  rota_note_added: { label: 'Rota', colour: '#a78bfa' },
  rota_note_updated: { label: 'Rota', colour: '#a78bfa' },
  rota_note_deleted: { label: 'Rota', colour: '#a78bfa' },
  // Settings
  settings_changed: { label: 'Settings', colour: '#94a3b8' },
  // Catch-all
  other: { label: 'Other', colour: '#94a3b8' },
};

// Event type categories for the filter chips
const FILTER_GROUPS = [
  { id: 'all', label: 'All', types: null },
  { id: 'users', label: 'Users', types: ['user_invited', 'invite_accepted', 'invite_revoked', 'user_role_changed', 'user_removed'] },
  { id: 'clinicians', label: 'Clinicians', types: ['clinician_added', 'clinician_updated', 'clinician_status_changed', 'clinician_deleted'] },
  { id: 'absences', label: 'Absences', types: ['working_pattern_changed', 'absence_added', 'absence_updated', 'absence_deleted', 'daily_override_set'] },
  { id: 'csv', label: 'CSV', types: ['csv_uploaded'] },
  { id: 'buddy', label: 'Buddy / rota', types: ['buddy_allocations_generated', 'buddy_allocations_edited', 'rota_note_added', 'rota_note_updated', 'rota_note_deleted'] },
  { id: 'settings', label: 'Settings', types: ['settings_changed', 'practice_updated'] },
];

const PAGE_SIZE = 50;

export default function AuditLogView({ practiceId }) {
  const [filter, setFilter] = useState('all');
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState({}); // user_id → email
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const group = FILTER_GROUPS.find(g => g.id === filter);
        let q = supabase
          .from('audit_events')
          .select('id, event_type, description, details, occurred_at, user_id')
          .eq('practice_id', practiceId)
          .order('occurred_at', { ascending: false })
          .limit(PAGE_SIZE + 1); // grab one extra to know if there's more
        if (group?.types) q = q.in('event_type', group.types);
        const { data, error: err } = await q;
        if (err) throw err;
        if (cancelled) return;
        const more = (data || []).length > PAGE_SIZE;
        const trimmed = more ? data.slice(0, PAGE_SIZE) : (data || []);
        setEvents(trimmed);
        setHasMore(more);

        // Enrich with user emails (one query for all distinct user_ids)
        const userIds = [...new Set(trimmed.map(e => e.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: members } = await supabase
            .rpc('list_practice_members', { target_practice_id: practiceId });
          if (!cancelled && members) {
            const map = {};
            for (const m of members) {
              if (m.user_id) map[m.user_id] = m.email || m.name || m.user_id.slice(0, 8);
            }
            setUsers(map);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [practiceId, filter]);

  return (
    <div>
      {/* Filter chips */}
      <div style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}>
        {FILTER_GROUPS.map(g => (
          <button
            key={g.id}
            type="button"
            onClick={() => setFilter(g.id)}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              background: filter === g.id ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filter === g.id ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === g.id ? '#22d3ee' : '#94a3b8',
              borderRadius: 999,
              cursor: 'pointer',
            }}>
            {g.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 14, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ fontSize: 13, color: '#64748b', padding: 16 }}>Loading…</div>}

      {!loading && events.length === 0 && !error && (
        <div style={{ fontSize: 14, color: '#64748b', padding: 24, textAlign: 'center' }}>
          No events recorded yet for this filter.
        </div>
      )}

      {!loading && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map(e => <EventRow key={e.id} event={e} userLabel={users[e.user_id] || (e.user_id ? 'unknown user' : 'system')} />)}
        </div>
      )}

      {hasMore && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
          Showing the most recent {PAGE_SIZE} events. Older events still exist
          in the database — pagination UI coming if you need it.
        </div>
      )}
    </div>
  );
}

function EventRow({ event, userLabel }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[event.event_type] || TYPE_META.other;
  const hasDetails = event.details && Object.keys(event.details).length > 0;

  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(0,0,0,0.2)',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          padding: '2px 8px',
          background: `${meta.colour}20`,
          color: meta.colour,
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}>{meta.label}</span>
        <span style={{ fontSize: 14, color: '#e2e8f0', flex: 1, minWidth: 0 }}>
          {event.description || event.event_type}
        </span>
        <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>
          {formatRelativeTime(event.occurred_at)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: '#64748b' }}>
        <span>by {userLabel}</span>
        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            style={{
              background: 'none',
              border: 'none',
              color: '#22d3ee',
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}>
            {open ? 'hide details' : 'show details'}
          </button>
        )}
      </div>
      {open && hasDetails && (
        <pre style={{
          marginTop: 8,
          padding: 10,
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 4,
          fontSize: 12,
          color: '#94a3b8',
          fontFamily: 'ui-monospace, Menlo, monospace',
          overflowX: 'auto',
          margin: '8px 0 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>{JSON.stringify(event.details, null, 2)}</pre>
      )}
    </div>
  );
}

function formatRelativeTime(isoString) {
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
