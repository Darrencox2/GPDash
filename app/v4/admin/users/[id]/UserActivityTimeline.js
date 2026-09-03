'use client';

// UserActivityTimeline — recent activity for one user across all their
// practices. Pulls from both audit_events (practice-level actions like
// CSV uploads, settings changes) and auth_events (sign-ins, password
// resets, etc.) via admin_get_user_activity.
//
// Renders a simple chronological list with icon, what happened,
// where (which practice if applicable), and when.
//
// Designed for support workflows: "what has this person been doing
// lately?" Currently you'd open each practice's audit log separately —
// this is the cross-practice view.

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

// Map event types → small visual treatment. Anything unknown gets
// the default. Keeps the list scannable without overwhelming colour.
const EVENT_STYLE = {
  // Auth events
  signup:                  { icon: '✨', colour: '#a855f7', label: 'Signed up' },
  login:                   { icon: '→',  colour: 'var(--c-green-2)', label: 'Signed in' },
  logout:                  { icon: '←',  colour: 'var(--g-text-mid)', label: 'Signed out' },
  password_reset_requested:{ icon: '✉',  colour: 'var(--c-amber-2)', label: 'Password reset requested' },
  password_changed:        { icon: '⟲',  colour: 'var(--c-green-2)', label: 'Password changed' },
  failed_login:            { icon: '⚠',  colour: 'var(--c-red)', label: 'Failed sign-in' },
  account_locked:          { icon: '🔒', colour: 'var(--c-red)', label: 'Account locked' },
  mfa_enrolled:            { icon: '🔐', colour: 'var(--c-green-2)', label: 'MFA enrolled' },
  mfa_challenged:          { icon: '🔐', colour: 'var(--g-text-mid)', label: 'MFA challenged' },
  mfa_failed:              { icon: '⚠',  colour: 'var(--c-red)', label: 'MFA failed' },

  // Audit events (practice-level)
  csv_uploaded:            { icon: '↑',  colour: 'var(--c-cyan-3)', label: 'CSV uploaded' },
  settings_changed:        { icon: '⚙',  colour: 'var(--g-text-mid)', label: 'Settings changed' },
  member_added:            { icon: '+',  colour: 'var(--c-green-2)', label: 'Added a member' },
  member_removed:          { icon: '−',  colour: 'var(--c-amber-2)', label: 'Removed a member' },
  member_role_changed:     { icon: '⚙',  colour: 'var(--g-text-mid)', label: 'Changed member role' },
  invite_created:          { icon: '✉',  colour: 'var(--c-cyan)', label: 'Sent an invite' },
  invite_accepted:         { icon: '✓',  colour: 'var(--c-green-2)', label: 'Accepted an invite' },
  invite_revoked:          { icon: '✕',  colour: 'var(--g-text-mid)', label: 'Revoked an invite' },
  practice_created:        { icon: '★',  colour: '#a855f7', label: 'Created practice' },
  practice_updated:        { icon: '⚙',  colour: 'var(--g-text-mid)', label: 'Updated practice' },
  other:                   { icon: '·',  colour: 'var(--g-text-mid)', label: 'Activity' },
};

function styleFor(eventType) {
  return EVENT_STYLE[eventType] || { icon: '·', colour: '#64748b', label: eventType };
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = Date.now();
  const ageMs = now - d.getTime();
  const dayMs = 86400000;
  // Today / yesterday helpers, otherwise short date.
  if (ageMs < 60000) return 'just now';
  if (ageMs < 3600000) return `${Math.floor(ageMs / 60000)}m ago`;
  if (ageMs < dayMs) return `${Math.floor(ageMs / 3600000)}h ago`;
  if (ageMs < 7 * dayMs) return `${Math.floor(ageMs / dayMs)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UserActivityTimeline({ userId }) {
  const supabase = createClient();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc('admin_get_user_activity', {
        target_user_id: userId,
        limit_count: 100,
      });
      if (cancelled) return;
      if (err) { setError(err.message); return; }
      setEvents(Array.isArray(data) ? data : []);
    })();
    return () => { cancelled = true; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return <div className="text-meta text-red-300">Couldn't load activity: {error}</div>;
  }
  if (events === null) {
    return <div className="text-meta text-slate-400">Loading activity…</div>;
  }
  if (events.length === 0) {
    return <div className="text-meta text-slate-400">No recorded activity yet.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map(ev => {
        const s = styleFor(ev.event_type);
        return (
          <div
            key={ev.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 'var(--r-sm)',
            }}
          >
            <div style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              borderRadius: 'var(--r-pill)',
              background: 'rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: s.colour,
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}>{s.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-body-sm text-slate-300" style={{ lineHeight: 1.4 }}>
                {ev.description || s.label}
              </div>
              <div className="text-caption text-slate-400 mt-0.5">
                {formatTime(ev.occurred_at)}
                {ev.practice_name && (
                  <> · <span className="text-slate-400">{ev.practice_name}</span></>
                )}
                <> · <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize:11, opacity: 0.7 }}>{ev.event_type}</span></>
              </div>
            </div>
          </div>
        );
      })}
      {events.length === 100 && (
        <div className="text-caption text-slate-400 text-center p-2">
          Showing the 100 most recent events. Older events are still in the audit log.
        </div>
      )}
    </div>
  );
}
