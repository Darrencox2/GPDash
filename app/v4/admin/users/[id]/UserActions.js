'use client';

// UserActions — client-side controls used on /v4/admin/users/[id].
//
// One file because the actions are tightly related and share state (e.g.
// editing the user's profile and managing their memberships both refresh
// the page on success). Splitting would mean prop-drilling the same
// "did anything change?" callback four times.
//
// All operations route through admin_* RPCs which are platform-admin
// only at the DB level — the UI guard is a usability nicety, not the
// security boundary.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function UserActions({ user, allPractices }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(null); // which action is running, for spinners
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const showOk = (msg) => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };
  const showErr = (msg) => { setError(msg); setSuccess(''); };

  // Refresh server data after a mutation by re-running the page's server
  // component. Keeps the UI honest without forcing a full reload.
  const refreshPage = () => router.refresh();

  // ─── Profile editing ───────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftFirstName, setDraftFirstName] = useState(user.first_name || '');
  const [draftLastName, setDraftLastName] = useState(user.last_name || '');
  const [draftPlatformAdmin, setDraftPlatformAdmin] = useState(!!user.is_platform_admin);

  const saveProfile = async () => {
    setBusy('profile');
    const { error: err } = await supabase.rpc('admin_update_user_profile', {
      target_user_id: user.id,
      new_first_name: draftFirstName.trim() || null,
      new_last_name: draftLastName.trim() || null,
      new_is_platform_admin: draftPlatformAdmin,
      // Don't pass new_name explicitly — the RPC will recompute it from
      // first + last so display stays in sync. If we ever want a custom
      // display name (mononyms, non-Western order, etc.) we'd add a
      // separate "display name" field to the editor.
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk('Profile updated');
    setEditingProfile(false);
    refreshPage();
  };

  // ─── Membership add ────────────────────────────────────────────────
  const [pickPracticeId, setPickPracticeId] = useState('');
  const [pickRole, setPickRole] = useState('user');

  // Practices the user isn't already in — anything else would just be a
  // role change, handled below.
  const currentPracticeIds = new Set((user.memberships || []).map(m => m.practice_id));
  const addablePractices = allPractices.filter(p => !currentPracticeIds.has(p.id));

  const addMembership = async () => {
    if (!pickPracticeId) { showErr('Pick a practice first'); return; }
    setBusy('add-membership');
    const { error: err } = await supabase.rpc('admin_set_user_membership', {
      target_user_id: user.id,
      target_practice_id: pickPracticeId,
      new_role: pickRole,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk('Added to practice');
    setPickPracticeId('');
    refreshPage();
  };

  // ─── Per-membership actions: change role + remove ──────────────────
  const changeRole = async (practiceId, newRole) => {
    setBusy(`role-${practiceId}`);
    const { error: err } = await supabase.rpc('admin_set_user_membership', {
      target_user_id: user.id,
      target_practice_id: practiceId,
      new_role: newRole,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk('Role updated');
    refreshPage();
  };

  const removeMembership = async (practiceId, practiceName) => {
    if (!confirm(`Remove ${user.email} from ${practiceName}? They'll lose access immediately. The practice's data is unaffected.`)) return;
    setBusy(`remove-${practiceId}`);
    const { error: err } = await supabase.rpc('admin_remove_user_membership', {
      target_user_id: user.id,
      target_practice_id: practiceId,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    showOk('Membership removed');
    refreshPage();
  };

  // ─── Delete user ───────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const deleteWord = (user.email || '').split('@')[0]; // local-part — easy to type but not "yes"

  const deleteUser = async () => {
    if (deleteConfirm !== deleteWord) {
      showErr(`Type "${deleteWord}" to confirm`);
      return;
    }
    setBusy('delete');
    const { error: err } = await supabase.rpc('admin_delete_user', {
      target_user_id: user.id,
    });
    setBusy(null);
    if (err) { showErr(err.message); return; }
    // Send the admin back to the user list
    router.push('/v4/admin/users');
  };

  return (
    <>
      {/* Banner messages */}
      {error && <Banner kind="error">{error}</Banner>}
      {success && <Banner kind="success">{success}</Banner>}

      {/* Profile editing */}
      <div style={card}>
        <div style={cardTitleRow}>
          <h3 style={cardHeader}>Profile</h3>
          {!editingProfile && (
            <button onClick={() => setEditingProfile(true)} style={btnSubtle}>Edit</button>
          )}
        </div>
        {editingProfile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Forename">
                <input
                  type="text"
                  value={draftFirstName}
                  onChange={(e) => setDraftFirstName(e.target.value)}
                  style={input}
                />
              </Field>
              <Field label="Surname">
                <input
                  type="text"
                  value={draftLastName}
                  onChange={(e) => setDraftLastName(e.target.value)}
                  style={input}
                />
              </Field>
            </div>
            <Field label="Platform admin">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={draftPlatformAdmin}
                  onChange={(e) => setDraftPlatformAdmin(e.target.checked)}
                  style={{ accentColor: '#22d3ee' }}
                />
                Grant full platform-admin access
              </label>
              {draftPlatformAdmin && !user.is_platform_admin && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24' }}>
                  ⚠ Platform admins can manage every practice and every user. Make sure you trust this person.
                </div>
              )}
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveProfile} disabled={busy === 'profile'} style={btnPrimary}>
                {busy === 'profile' ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditingProfile(false);
                  setDraftFirstName(user.first_name || '');
                  setDraftLastName(user.last_name || '');
                  setDraftPlatformAdmin(!!user.is_platform_admin);
                }}
                style={btnSubtle}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <Row label="Forename">{user.first_name || <em style={{ color: '#475569' }}>not set</em>}</Row>
            <Row label="Surname">{user.last_name || <em style={{ color: '#475569' }}>not set</em>}</Row>
            <Row label="Display name">{user.name || <em style={{ color: '#475569' }}>not set</em>}</Row>
            <Row label="Platform admin">{user.is_platform_admin ? 'Yes' : 'No'}</Row>
          </>
        )}
      </div>

      {/* Memberships management */}
      <div style={card}>
        <h3 style={cardHeader}>Practice memberships ({user.memberships.length})</h3>

        {user.memberships.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
            Not a member of any practice yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {user.memberships.map(m => (
              <div
                key={m.practice_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{m.practice_name}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{m.practice_slug}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.practice_id, e.target.value)}
                    disabled={busy === `role-${m.practice_id}`}
                    style={selectStyle}
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                  </select>
                  <button
                    onClick={() => removeMembership(m.practice_id, m.practice_name)}
                    disabled={busy === `remove-${m.practice_id}`}
                    style={btnDangerSubtle}
                  >
                    {busy === `remove-${m.practice_id}` ? '…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add to a new practice */}
        {addablePractices.length > 0 ? (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Add to another practice</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={pickPracticeId}
                onChange={(e) => setPickPracticeId(e.target.value)}
                style={{ ...selectStyle, flex: '1 1 240px' }}
              >
                <option value="">Choose a practice…</option>
                {addablePractices.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={pickRole}
                onChange={(e) => setPickRole(e.target.value)}
                style={selectStyle}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
              <button
                onClick={addMembership}
                disabled={!pickPracticeId || busy === 'add-membership'}
                style={btnPrimary}
              >
                {busy === 'add-membership' ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, fontSize: 12, color: '#64748b' }}>
            User is already a member of every practice on the platform.
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div style={{ ...card, borderColor: 'rgba(239,68,68,0.2)' }}>
        <h3 style={{ ...cardHeader, color: '#fca5a5' }}>Danger zone</h3>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>
          Deleting this user signs them out, removes them from every practice, and unlinks them
          from any clinician records. The practice data itself is unaffected. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={`Type "${deleteWord}" to enable delete`}
            style={{ ...input, flex: '1 1 200px' }}
          />
          <button
            onClick={deleteUser}
            disabled={deleteConfirm !== deleteWord || busy === 'delete'}
            style={{
              ...btnDanger,
              opacity: deleteConfirm === deleteWord ? 1 : 0.4,
              cursor: deleteConfirm === deleteWord ? 'pointer' : 'not-allowed',
            }}
          >
            {busy === 'delete' ? 'Deleting…' : 'Delete user'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Inline styles ───────────────────────────────────────────────────
const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };
const cardHeader = { fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 12 };
const cardTitleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 };
const input = { width: '100%', padding: '8px 10px', fontSize: 13, color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' };
const selectStyle = { ...input, padding: '6px 10px', cursor: 'pointer', width: 'auto' };
const btnPrimary = { padding: '8px 14px', fontSize: 13, fontWeight: 500, color: 'white', background: '#0891b2', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnSubtle = { padding: '6px 12px', fontSize: 12, color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, cursor: 'pointer' };
const btnDanger = { padding: '8px 14px', fontSize: 13, fontWeight: 500, color: 'white', background: '#dc2626', border: 'none', borderRadius: 6 };
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

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', gap: 12 }}>
      <span style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ color: '#cbd5e1', fontSize: 13 }}>{children}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {children}
    </div>
  );
}
