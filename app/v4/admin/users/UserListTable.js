'use client';

// UserListTable — client-side table with stats row, filter chips,
// sortable columns, and orphan highlighting.
//
// Server still fetches via admin_list_users(search_query) and passes
// the full array down. Search query stays a server-driven URL param
// (preserves bookmarkability and SSR), but filtering and sorting are
// client-side because they're cheap operations on an array of, what,
// hundreds of rows at most.
//
// Filter "orphan" = a user with zero practice memberships AND not a
// platform admin. They signed up but never finished onboarding (or
// were removed from every practice), and are good candidates for
// follow-up or deletion.

import { useMemo, useState } from 'react';
import Link from 'next/link';

const DAY_MS = 86400000;

function isOrphan(u) {
  // Platform admins legitimately have no memberships sometimes
  return Number(u.membership_count) === 0 && !u.is_platform_admin;
}

function isActive30d(u) {
  if (!u.last_sign_in_at) return false;
  return Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * DAY_MS;
}

const FILTERS = [
  { id: 'all',     label: 'All',                test: () => true },
  { id: 'active',  label: 'Active (30d)',       test: isActive30d },
  { id: 'dormant', label: 'Dormant',            test: u => u.last_sign_in_at && !isActive30d(u) },
  { id: 'never',   label: 'Never signed in',    test: u => !u.last_sign_in_at },
  { id: 'unconfirmed', label: 'Email unconfirmed', test: u => !u.email_confirmed_at },
  { id: 'admins',  label: 'Platform admins',    test: u => u.is_platform_admin },
  { id: 'suspended', label: 'Suspended',        test: u => u.is_suspended },
  { id: 'orphans', label: 'Orphans',            test: isOrphan },
];

// Sortable columns. Each maps a row → comparable key. Nulls sort last
// regardless of direction (so "never signed in" doesn't dominate
// the top of the table when sorting by last sign-in).
const COLS = {
  email:      { label: 'Email',         get: u => (u.email || '').toLowerCase(),   align: 'left' },
  name:       { label: 'Name',          get: u => (u.name || '').toLowerCase(),    align: 'left' },
  role:       { label: 'Role',          get: u => u.is_platform_admin ? 1 : 0,     align: 'left' },
  practices:  { label: 'Practices',     get: u => Number(u.membership_count || 0), align: 'right' },
  created:    { label: 'Created',       get: u => new Date(u.created_at).getTime(), align: 'left' },
  last:       { label: 'Last sign-in',  get: u => u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null, align: 'left' },
};

export default function UserListTable({ users }) {
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');

  // ─── Stats — computed once from the full unfiltered list ─────────────
  const stats = useMemo(() => {
    const total = users.length;
    let active = 0, never = 0, admins = 0, orphans = 0, unconfirmed = 0, suspended = 0;
    for (const u of users) {
      if (isActive30d(u)) active++;
      if (!u.last_sign_in_at) never++;
      if (u.is_platform_admin) admins++;
      if (isOrphan(u)) orphans++;
      if (!u.email_confirmed_at) unconfirmed++;
      if (u.is_suspended) suspended++;
    }
    return { total, active, never, admins, orphans, unconfirmed, suspended };
  }, [users]);

  // ─── Apply filter then sort ──────────────────────────────────────────
  const visible = useMemo(() => {
    const filt = FILTERS.find(f => f.id === filter)?.test || (() => true);
    const filtered = users.filter(filt);
    const col = COLS[sortKey];
    if (!col) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      // Nulls always last regardless of direction
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [users, filter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18, marginBottom: 18 }}>
        <Stat label="Total"           value={stats.total} />
        <Stat label="Active (30d)"    value={stats.active} colour="#34d399" />
        <Stat label="Never signed in" value={stats.never} colour="#94a3b8" />
        <Stat label="Email unconfirmed" value={stats.unconfirmed} colour="#fbbf24" />
        <Stat label="Platform admins" value={stats.admins} colour="#67e8f9" />
        <Stat label="Suspended"       value={stats.suspended} colour="#fbbf24" />
        <Stat label="Orphans"         value={stats.orphans} colour="#fbbf24" tooltip="Users with no practice memberships who aren't platform admins — they signed up but never finished onboarding (or were removed from every practice)." />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: filter === f.id ? 'white' : '#cbd5e1',
              background: filter === f.id ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)',
              border: filter === f.id ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left' }}>
              <SortableTh col="email"     label="Email"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh col="name"      label="Name"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh col="role"      label="Role"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh col="practices" label="Practices"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <SortableTh col="created"   label="Created"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh col="last"      label="Last sign-in" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                No users match this filter.
              </td></tr>
            )}
            {visible.map(u => (
              <UserRow key={u.id} user={u} />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
        Showing {visible.length} of {users.length} users
      </div>
    </div>
  );
}

function UserRow({ user: u }) {
  const orphan = isOrphan(u);
  const suspended = !!u.is_suspended;
  return (
    <tr style={{
      borderTop: '1px solid rgba(255,255,255,0.04)',
      // Subtle tint on rows that need attention. Suspended takes
      // precedence over orphan because it's a stronger signal.
      background: suspended ? 'rgba(245,158,11,0.06)'
        : orphan ? 'rgba(251,191,36,0.04)'
        : undefined,
      opacity: suspended ? 0.85 : 1,
    }}>
      <td style={{ ...td, color: '#e2e8f0' }}>
        {u.email}
        {!u.email_confirmed_at && (
          <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 999 }}>
            unconfirmed
          </span>
        )}
      </td>
      <td style={{ ...td, color: '#cbd5e1' }}>{u.name || '—'}</td>
      <td style={td}>
        {suspended ? (
          <span style={{ fontSize: 12, padding: '3px 10px', background: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 999, fontWeight: 600 }}>Suspended</span>
        ) : u.is_platform_admin ? (
          <span style={{ fontSize: 12, padding: '3px 10px', background: 'rgba(34,211,238,0.15)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 999, fontWeight: 600 }}>Platform admin</span>
        ) : orphan ? (
          <span style={{ fontSize: 12, padding: '3px 10px', background: 'rgba(251,191,36,0.12)', color: '#fcd34d', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 999 }} title="No practice memberships — never finished onboarding">Orphan</span>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
        )}
      </td>
      <td style={{ ...td, textAlign: 'right', color: '#e2e8f0' }}>{u.membership_count}</td>
      <td style={{ ...td, color: '#94a3b8', fontSize: 13 }}>
        {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      <td style={{ ...td, color: '#94a3b8', fontSize: 13 }}>
        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        <Link href={`/v4/admin/users/${u.id}`} style={{ color: '#22d3ee', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Open →</Link>
      </td>
    </tr>
  );
}

function Stat({ label, value, colour, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        flex: '0 1 auto',
        minWidth: 130,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '12px 16px',
        cursor: tooltip ? 'help' : 'default',
      }}
    >
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: colour || '#e2e8f0', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SortableTh({ col, label, sortKey, sortDir, onClick, align }) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onClick(col)}
      style={{
        ...th,
        textAlign: align || 'left',
        cursor: 'pointer',
        userSelect: 'none',
        color: active ? '#e2e8f0' : '#94a3b8',
      }}
    >
      {label}
      <span style={{ marginLeft: 6, fontSize: 10, color: active ? '#22d3ee' : '#64748b' }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '◇'}
      </span>
    </th>
  );
}

const th = { padding: '12px 16px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94a3b8' };
const td = { padding: '12px 16px', fontSize: 14 };

