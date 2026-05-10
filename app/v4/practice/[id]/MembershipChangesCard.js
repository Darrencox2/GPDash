'use client';

// MembershipChangesCard — surfaces the membership-related slice of
// audit_events for this practice. Calls list_practice_membership_changes
// on mount; renders a simple timeline grouped by date.
//
// Designed to answer questions like "did I change Sarah's role or did
// someone else?", "when was Tom invited?", "who removed Jane?" — without
// digging through the full audit log on the Details tab.

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Map enum → display info: icon glyph + colour + verb
const EVENT_DISPLAY = {
  user_invited:      { glyph: '✉', colour: '#a5b4fc', label: 'Invited' },
  invite_accepted:   { glyph: '✓', colour: '#34d399', label: 'Accepted invite' },
  invite_revoked:    { glyph: '⊘', colour: '#94a3b8', label: 'Revoked invite' },
  user_role_changed: { glyph: '↔', colour: '#67e8f9', label: 'Role changed' },
  user_removed:      { glyph: '−', colour: '#fca5a5', label: 'Removed' },
};

export default function MembershipChangesCard({ practiceId }) {
  const supabase = createClient();
  const [events, setEvents] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc('list_practice_membership_changes', {
        target_practice_id: practiceId,
        limit_count: 50,
      });
      if (cancelled) return;
      if (err) { setError(err.message); setEvents([]); return; }
      setEvents(Array.isArray(data) ? data : []);
    })();
    return () => { cancelled = true; };
  }, [practiceId, supabase]);

  // Card styling matches the rest of UsersTab
  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 20,
  };

  if (events === null) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Recent membership changes</h3>
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Recent membership changes</h3>
        <div style={{ fontSize: 12, color: '#fca5a5' }}>{error}</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Recent membership changes</h3>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>
          No membership changes recorded yet. Future role changes, invites, and member additions/removals will appear here.
        </p>
      </div>
    );
  }

  // Show the first 8 by default; "Show all" expands.
  const visible = expanded ? events : events.slice(0, 8);
  const hasMore = events.length > visible.length;

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>Recent membership changes</h3>
      <div>
        {visible.map(ev => <EventRow key={ev.id} ev={ev} />)}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 12,
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            color: '#cbd5e1',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Show all {events.length}
        </button>
      )}
    </div>
  );
}

function EventRow({ ev }) {
  const display = EVENT_DISPLAY[ev.event_type] || { glyph: '·', colour: '#94a3b8', label: ev.event_type };
  const when = formatRelativeTime(ev.occurred_at);
  // Description is the human-readable version emitted by log_audit_event.
  // Falls back to the actor name + label if description is missing.
  const text = ev.description || `${ev.actor_name} · ${display.label}`;
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      fontSize: 13,
      color: '#cbd5e1',
      lineHeight: 1.5,
    }}>
      <span style={{
        flex: '0 0 22px',
        height: 22,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)',
        color: display.colour,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        marginTop: 1,
      }}>{display.glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{text}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {ev.actor_name} · {when}
        </div>
      </div>
    </div>
  );
}

// Lightweight relative-time formatter — avoids pulling in dayjs/date-fns
// for one display string. "just now", "5m ago", "3h ago", "2d ago",
// then falls back to the locale date string for >= 7 days.
function formatRelativeTime(iso) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const titleStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: '#cbd5e1',
  marginBottom: 14,
};
