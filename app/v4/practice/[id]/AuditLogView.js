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
  practice_created: { label: 'Practice', colour: 'var(--c-cyan-3)' },
  practice_updated: { label: 'Practice', colour: 'var(--c-cyan-3)' },
  user_invited: { label: 'Users', colour: 'var(--c-violet)' },
  invite_accepted: { label: 'Users', colour: 'var(--c-violet)' },
  invite_revoked: { label: 'Users', colour: 'var(--c-violet)' },
  user_role_changed: { label: 'Users', colour: 'var(--c-violet)' },
  user_removed: { label: 'Users', colour: 'var(--c-violet)' },
  // Clinicians
  clinician_added: { label: 'Clinician', colour: 'var(--c-amber-2)' },
  clinician_updated: { label: 'Clinician', colour: 'var(--c-amber-2)' },
  clinician_status_changed: { label: 'Clinician', colour: 'var(--c-amber-2)' },
  clinician_deleted: { label: 'Clinician', colour: 'var(--c-amber-2)' },
  // Patterns / absences
  working_pattern_changed: { label: 'Pattern', colour: 'var(--c-blue-2)' },
  absence_added: { label: 'Absence', colour: 'var(--c-blue-2)' },
  absence_updated: { label: 'Absence', colour: 'var(--c-blue-2)' },
  absence_deleted: { label: 'Absence', colour: 'var(--c-blue-2)' },
  daily_override_set: { label: 'Override', colour: 'var(--c-blue-2)' },
  // CSV
  csv_uploaded: { label: 'CSV', colour: 'var(--c-green-2)' },
  // Buddy / rota
  buddy_allocations_generated: { label: 'Buddy', colour: 'var(--c-violet)' },
  buddy_allocations_edited: { label: 'Buddy', colour: 'var(--c-violet)' },
  rota_note_added: { label: 'Rota', colour: 'var(--c-violet)' },
  rota_note_updated: { label: 'Rota', colour: 'var(--c-violet)' },
  rota_note_deleted: { label: 'Rota', colour: 'var(--c-violet)' },
  // Settings
  settings_changed: { label: 'Settings', colour: 'var(--g-text-mid)' },
  // Catch-all
  other: { label: 'Other', colour: 'var(--g-text-mid)' },
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
              background: filter === g.id ? 'rgba(34,211,238,0.15)' : 'var(--g-tile)',
              border: `1px solid ${filter === g.id ? 'rgba(34,211,238,0.4)' : 'var(--g-border-2)'}`,
              color: filter === g.id ? 'var(--c-cyan-3)' : 'var(--g-text-mid)',
              borderRadius: 'var(--r-pill)',
              cursor: 'pointer',
            }}>
            {g.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--c-red)', padding: 12, borderRadius: 'var(--r-md)', fontSize: 14, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && <div className="text-body-sm text-mid p-4">Loading…</div>}

      {!loading && events.length === 0 && !error && (
        <div className="text-body text-mid p-6 text-center">
          No events recorded yet for this filter.
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="flex flex-col gap-1">
          {events.map(e => <EventRow key={e.id} event={e} userLabel={users[e.user_id] || (e.user_id ? 'unknown user' : 'system')} />)}
        </div>
      )}

      {hasMore && (
        <div className="mt-3 text-meta text-mid text-center">
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
      background: 'var(--g-field)',
      borderRadius: 'var(--r-sm)',
      border: '1px solid var(--g-tile)',
    }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span style={{
          padding: '2px 8px',
          background: `${meta.colour}20`,
          color: meta.colour,
          borderRadius: 'var(--r-sm)',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}>{meta.label}</span>
        <span className="text-body text-hi flex-1 min-w-0">
          {event.description || event.event_type}
        </span>
        <span style={{ fontSize: 12, color: 'var(--g-text-mid)', flexShrink: 0 }}>
          {formatRelativeTime(event.occurred_at)}
        </span>
      </div>
      <div className="flex items-center gap-2.5 mt-1 text-meta text-mid">
        <span>by {userLabel}</span>
        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--c-cyan-3)',
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
          background: 'var(--g-field)',
          borderRadius: 'var(--r-sm)',
          fontSize: 12,
          color: 'var(--g-text-mid)',
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
