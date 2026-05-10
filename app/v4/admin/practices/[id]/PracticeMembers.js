'use client';

// PracticeMembers — client-side member management for the platform admin's
// practice detail page. Mirror of UserActions but viewed from the practice
// side: list members, change roles inline, remove, and add an existing
// user from a search dropdown.
//
// All operations route through the same admin_set_user_membership /
// admin_remove_user_membership RPCs as the user-side flow — the
// operations are symmetric, only the entry point differs.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function PracticeMembers({ practice }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const showOk = (msg) => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };
  const showErr = (msg) => { setError(msg); setSuccess(''); };
  const refreshPage = () => router.refresh();

  // ─── Per-member: change role + remove ──────────────────────────────
  const changeRole = async (userId, newRole) => {
    setBusy(`role-${userId}`);
    const { error: err } = await supabase.rpc('admin_set_user_membership', {
      target_user_id: userId,
      target_practice_id: practice.id,
      new_role: newRole,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk('Role updated');
    refreshPage();
  };

  const removeMember = async (userId, email) => {
    if (!confirm(`Remove ${email} from ${practice.name}? They'll lose access immediately. Their account is unaffected.`)) return;
    setBusy(`remove-${userId}`);
    const { error: err } = await supabase.rpc('admin_remove_user_membership', {
      target_user_id: userId,
      target_practice_id: practice.id,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk('Member removed');
    refreshPage();
  };

  // ─── Add existing user ─────────────────────────────────────────────
  // Uses admin_list_users with a search query so we don't load the entire
  // user table into the dropdown. Debounced to avoid hammering the RPC
  // on every keystroke.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pickedUser, setPickedUser] = useState(null); // { id, email, name } | null
  const [pickRole, setPickRole] = useState('user');

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data, error: err } = await supabase.rpc('admin_list_users', { search_query: searchQuery.trim() });
      setSearching(false);
      if (err) { setSearchResults([]); return; }
      // Hide users who are already in this practice — adding them via this
      // form would just be a role change, which is better done inline above.
      const existingIds = new Set((practice.members || []).map(m => m.user_id));
      setSearchResults((data || []).filter(u => !existingIds.has(u.id)).slice(0, 8));
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMember = async () => {
    if (!pickedUser) { showErr('Pick a user first'); return; }
    setBusy('add');
    const { error: err } = await supabase.rpc('admin_set_user_membership', {
      target_user_id: pickedUser.id,
      target_practice_id: practice.id,
      new_role: pickRole,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk(`Added ${pickedUser.email}`);
    setPickedUser(null);
    setSearchQuery('');
    setSearchResults([]);
    refreshPage();
  };

  return (
    <>
      {error && <Banner kind="error">{error}</Banner>}
      {success && <Banner kind="success">{success}</Banner>}

      <div style={card}>
        <h3 style={cardHeader}>Members ({practice.members.length})</h3>

        {practice.members.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
            This practice has no members yet. Add one below.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {practice.members.map(m => (
              <div key={m.user_id} style={memberRow}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{m.email}</span>
                    {m.is_platform_admin && (
                      <span style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        background: 'rgba(34,211,238,0.15)',
                        color: '#67e8f9',
                        border: '1px solid rgba(34,211,238,0.3)',
                        borderRadius: 999,
                      }}>Platform admin</span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    {m.name && <span>{m.name} · </span>}
                    joined {new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {m.last_sign_in_at && (
                      <> · last seen {new Date(m.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value)}
                    disabled={busy === `role-${m.user_id}`}
                    style={selectStyle}
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                  </select>
                  <a
                    href={`/v4/admin/users/${m.user_id}`}
                    style={btnSubtle}
                    title="Open this user in the admin"
                  >
                    Open
                  </a>
                  <button
                    onClick={() => removeMember(m.user_id, m.email)}
                    disabled={busy === `remove-${m.user_id}`}
                    style={btnDangerSubtle}
                  >
                    {busy === `remove-${m.user_id}` ? '…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add an existing user */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Add an existing user</div>

          {pickedUser ? (
            // User has been picked — show a confirm row with role + add button
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0' }}>{pickedUser.email}</div>
                {pickedUser.name && <div style={{ fontSize: 11, color: '#64748b' }}>{pickedUser.name}</div>}
              </div>
              <select value={pickRole} onChange={(e) => setPickRole(e.target.value)} style={selectStyle}>
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
              <button onClick={addMember} disabled={busy === 'add'} style={btnPrimary}>
                {busy === 'add' ? 'Adding…' : 'Add to practice'}
              </button>
              <button
                onClick={() => { setPickedUser(null); setSearchQuery(''); setSearchResults([]); }}
                style={btnSubtle}
              >
                Cancel
              </button>
            </div>
          ) : (
            // Search-as-you-type
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email or name…"
                style={input}
              />
              {searching && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Searching…</div>}
              {searchResults.length > 0 && (
                <div style={{
                  marginTop: 8,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setPickedUser(u); setSearchResults([]); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 10px', background: 'transparent', border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: '#e2e8f0', fontSize: 13, cursor: 'pointer',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>{u.email}</div>
                      {u.name && <div style={{ fontSize: 11, color: '#64748b' }}>{u.name}</div>}
                    </button>
                  ))}
                </div>
              )}
              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                  No users match. They need to sign up first — then come back here.
                </div>
              )}
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                To invite someone who hasn't signed up yet, use the practice's own Users tab and send an email invite.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };
const cardHeader = { fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 12 };
const memberRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
  flexWrap: 'wrap', gap: 12,
};
const input = { width: '100%', padding: '8px 10px', fontSize: 13, color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' };
const selectStyle = { padding: '6px 10px', fontSize: 13, color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, outline: 'none', cursor: 'pointer' };
const btnPrimary = { padding: '8px 14px', fontSize: 13, fontWeight: 500, color: 'white', background: '#0891b2', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnSubtle = { padding: '6px 12px', fontSize: 12, color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' };
const btnDangerSubtle = { padding: '6px 10px', fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, cursor: 'pointer' };

function Banner({ kind, children }) {
  const palette = kind === 'error'
    ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', fg: '#fca5a5' }
    : { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', fg: '#6ee7b7' };
  return (
    <div style={{
      padding: '10px 14px',
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 8,
      color: palette.fg,
      fontSize: 13,
      marginBottom: 12,
    }}>{children}</div>
  );
}
