'use client';

// UsersTab — practice-level member management UI.
//
// Replaces the previous read-only list with:
//   - Stats strip (total, owners, admins, users, pending invites)
//   - Differentiated role badges (owner = amber, admin = cyan, user = slate)
//   - "You" indicator on the current user's row
//   - Linked clinician column with an Unlinked warning
//   - Inline role dropdown + Remove button per row, with permission checks
//
// Permission rules (mirroring the RPCs):
//   Owner: change/remove anyone except self
//   Admin: change/remove anyone except owners and self
//   User : no actions
// Self-row never shows actions (use Leave Practice in Push C).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import LeavePracticeButton from './LeavePracticeButton';

const ROLE_STYLES = {
  owner: {
    background: 'rgba(251,191,36,0.15)',
    color: '#fcd34d',
    border: '1px solid rgba(251,191,36,0.35)',
  },
  admin: {
    background: 'rgba(34,211,238,0.15)',
    color: '#67e8f9',
    border: '1px solid rgba(34,211,238,0.3)',
  },
  user: {
    background: 'rgba(148,163,184,0.12)',
    color: '#cbd5e1',
    border: '1px solid rgba(148,163,184,0.25)',
  },
};

export default function UsersTab({
  members,
  invites,
  practiceId,
  practiceName,         // for confirm dialogs (Leave / Transfer)
  canManage,            // owner OR admin (true means show invite form)
  myMembership,         // {role} for the signed-in user, or null
  myUserId,             // for the "you" highlight
  isPlatformAdmin,
  InviteForm,           // injected so we don't duplicate the form
  bulkInviteButton,     // injected: <BulkInviteButton />
  pendingInviteList,    // injected: <PendingInvitesCard />
  transferOwnershipButton, // injected: <TransferOwnershipButton /> (owner only)
  membershipChangesCard,   // injected: <MembershipChangesCard />
  helpfulFooter,        // injected: the "link clinician" banner
}) {
  const myRole = myMembership?.role || (isPlatformAdmin ? 'owner' : null);

  // ─── Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let owners = 0, admins = 0, users = 0, unlinked = 0, nonClinical = 0;
    for (const m of members) {
      if (m.role === 'owner') owners++;
      else if (m.role === 'admin') admins++;
      else users++;
      if (m.marked_non_clinical) nonClinical++;
      // "Unlinked" only counts people who haven't said they're not a
      // clinician AND aren't actually linked. Non-clinical staff aren't
      // a problem to surface.
      else if (!m.linked_clinician_id) unlinked++;
    }
    return { total: members.length, owners, admins, users, unlinked, nonClinical, invites: invites.length };
  }, [members, invites]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Team members">
        {/* Stats strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <Stat label="Members" value={stats.total} />
          <Stat label="Owners" value={stats.owners} colour="#fcd34d" />
          <Stat label="Admins" value={stats.admins} colour="#67e8f9" />
          <Stat label="Users" value={stats.users} colour="#cbd5e1" />
          {stats.unlinked > 0 && <Stat label="Unlinked" value={stats.unlinked} colour="#fbbf24" tooltip="Clinicians who haven't linked themselves to their record yet — their personal rota will be empty until they do. Non-clinical staff (practice managers, reception, etc.) don't count toward this." />}
          {stats.nonClinical > 0 && <Stat label="Non-clinical" value={stats.nonClinical} colour="#94a3b8" tooltip="Members who explicitly aren't clinicians at this practice (practice managers, reception, IT, finance, etc.)." />}
          {stats.invites > 0 && <Stat label="Pending invites" value={stats.invites} colour="#a5b4fc" />}
        </div>

        {members.length === 0 ? (
          <p style={{ fontSize: 14, color: '#64748b' }}>No members yet.</p>
        ) : (
          members.map(m => (
            <MemberRow
              key={m.user_id}
              member={m}
              practiceId={practiceId}
              practiceName={practiceName}
              myRole={myRole}
              myUserId={myUserId}
              isPlatformAdmin={isPlatformAdmin}
              totalOwners={stats.owners}
            />
          ))
        )}
      </Card>

      {/* Pending invites list */}
      {pendingInviteList}

      {canManage && (
        <Card title="Invite a member">
          <div style={{ marginBottom: InviteForm ? 14 : 0 }}>{InviteForm}</div>
          {/* Bulk invite — opens the paste-and-parse modal. Lives next to
              the single-invite form because they're complementary: one
              email at a time vs many at once. */}
          {bulkInviteButton && (
            <div style={{
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', flex: '1 1 240px' }}>
                Got a list? Paste a bunch at once — Outlook contacts, comma-separated, anything.
              </div>
              {bulkInviteButton}
            </div>
          )}
        </Card>
      )}

      {/* Transfer ownership — owner-only. Distinct card so it stays
          discoverable but doesn't clutter the main member list. */}
      {transferOwnershipButton && (
        <Card title="Transfer ownership">
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 }}>
            Step down from owner and promote another member to owner in one action.
            Useful when the practice changes hands or you're stepping back from administration.
            Required if you (as the only owner) want to leave the practice.
          </p>
          {transferOwnershipButton}
        </Card>
      )}

      {/* Membership change history — visible to all members, helps
          answer "did I do that or did someone else?" questions. */}
      {membershipChangesCard}

      {helpfulFooter}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────
function MemberRow({ member: m, practiceId, practiceName, myRole, myUserId, isPlatformAdmin, totalOwners }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(null); // 'role' | 'remove' | null
  const [error, setError] = useState('');
  const [pendingRole, setPendingRole] = useState(m.role);

  const isMe = m.user_id === myUserId;
  // Permission to act on THIS row
  const canActOnTarget = useMemo(() => {
    if (isMe) return false; // self uses Leave Practice (Push C)
    if (isPlatformAdmin) return true;
    if (myRole === 'owner') return true; // owners can act on anyone except themselves
    if (myRole === 'admin') return m.role !== 'owner'; // admins can't touch owners
    return false;
  }, [isMe, isPlatformAdmin, myRole, m.role]);

  // Promotion to owner allowed only if caller is an owner (or platform admin)
  const canPromoteToOwner = isPlatformAdmin || myRole === 'owner';

  // Demoting last owner is blocked at DB level too, but show this in UI
  const wouldBeLastOwner = m.role === 'owner' && totalOwners === 1;

  const submitRoleChange = async (newRole) => {
    if (newRole === m.role) return;
    setBusy('role');
    setError('');
    const { error: err } = await supabase.rpc('set_practice_member_role', {
      target_practice_id: practiceId,
      target_user_id: m.user_id,
      new_role: newRole,
    });
    setBusy(null);
    if (err) {
      setError(err.message);
      setPendingRole(m.role); // revert
      return;
    }
    router.refresh();
  };

  const remove = async () => {
    const label = m.name || m.email;
    if (!confirm(`Remove ${label} from the practice?\n\nTheir personal data (notes, rota links) is preserved on their account, but they'll lose access to this practice immediately.`)) return;
    setBusy('remove');
    setError('');
    const { error: err } = await supabase.rpc('remove_practice_member', {
      target_practice_id: practiceId,
      target_user_id: m.user_id,
    });
    setBusy(null);
    if (err) { setError(err.message); return; }
    router.refresh();
  };

  return (
    <div style={{
      padding: '14px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      // Subtle highlight on the "you" row
      background: isMe ? 'rgba(34,211,238,0.04)' : undefined,
      marginLeft: isMe ? -16 : 0,
      marginRight: isMe ? -16 : 0,
      paddingLeft: isMe ? 16 : 0,
      paddingRight: isMe ? 16 : 0,
      borderRadius: isMe ? 6 : 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: '#e2e8f0', fontWeight: isMe ? 600 : 400 }}>
              {m.email || '—'}
            </span>
            {isMe && <span style={{ fontSize: 10, padding: '1px 7px', background: 'rgba(34,211,238,0.18)', color: '#67e8f9', borderRadius: 999, fontWeight: 600, letterSpacing: 0.4 }}>YOU</span>}
          </div>
          {m.name && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{m.name}</div>}
          {/* Clinician-link status. Three states:
               (a) Linked to a clinician record  → slate "Linked to X"
               (b) Marked as non-clinical here   → slate "Non-clinical"
                   (no warning — they shouldn't be guilt-tripped)
               (c) Neither linked nor marked     → amber "Not linked"
                   warning + an action depending on viewer:
                     - self  : "I'm not a clinician" button
                     - admin : "Mark non-clinical" button
                     - other : just the warning
          */}
          <ClinicianLinkStatus
            member={m}
            practiceId={practiceId}
            isMe={isMe}
            canActOnTarget={canActOnTarget}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Role: dropdown if I can change it, badge otherwise */}
          {canActOnTarget && !wouldBeLastOwner ? (
            <select
              value={pendingRole}
              disabled={busy === 'role'}
              onChange={(e) => { setPendingRole(e.target.value); submitRoleChange(e.target.value); }}
              style={{
                ...ROLE_STYLES[m.role],
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 999,
                fontWeight: 600,
                cursor: busy === 'role' ? 'wait' : 'pointer',
                opacity: busy === 'role' ? 0.6 : 1,
                appearance: 'none',
                paddingRight: 24,
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 10 10\'%3E%3Cpath fill=\'%2394a3b8\' d=\'M5 7L1 3h8z\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
              }}
            >
              {canPromoteToOwner && <option value="owner">Owner</option>}
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          ) : (
            <RoleBadge role={m.role} />
          )}

          {canActOnTarget && (
            <button
              onClick={remove}
              disabled={busy === 'remove'}
              title="Remove from practice"
              aria-label="Remove member"
              style={{
                padding: '4px 8px',
                fontSize: 11,
                color: '#fca5a5',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
                cursor: busy === 'remove' ? 'wait' : 'pointer',
                opacity: busy === 'remove' ? 0.6 : 1,
              }}
            >
              {busy === 'remove' ? '…' : 'Remove'}
            </button>
          )}

          {/* Leave button on the self-row only. Owners can only leave
              if they're not the last owner (button stays visible but
              disabled with explanation). */}
          {isMe && (
            <LeavePracticeButton
              practiceId={practiceId}
              practiceName={practiceName}
              myRole={m.role}
              totalOwners={totalOwners}
            />
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#fca5a5', padding: '6px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.user;
  return (
    <span style={{
      ...s,
      fontSize: 12,
      padding: '4px 12px',
      borderRadius: 999,
      fontWeight: 600,
      textTransform: 'capitalize',
    }}>{role}</span>
  );
}

// Clinician-link status row + inline actions. Three states (linked,
// marked non-clinical, unlinked) with different actions per viewer.
function ClinicianLinkStatus({ member: m, practiceId, isMe, canActOnTarget }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setNonClinical = async (marked) => {
    if (marked && !confirm(isMe
      ? "Mark yourself as non-clinical for this practice?\n\nThis hides the 'Not linked to a clinician' warning. You can switch back later from Account settings."
      : `Mark ${m.name || m.email} as non-clinical?\n\nThis hides the 'Not linked' warning on their row. They can change it themselves from Account settings.`
    )) return;
    if (!marked && !confirm(isMe
      ? "Unmark yourself as non-clinical?\n\nThe 'Not linked' warning will reappear until you link a clinician record."
      : `Unmark ${m.name || m.email} as non-clinical?`
    )) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('set_member_non_clinical_flag', {
      target_practice_id: practiceId,
      target_user_id: m.user_id,
      marked,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  };

  // Linked → just show the link.
  if (m.linked_clinician_id) {
    return (
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
        <span style={{ color: '#94a3b8' }}>
          Linked to <span style={{ color: '#cbd5e1' }}>{m.linked_clinician_name}</span>
        </span>
      </div>
    );
  }

  // Marked non-clinical → slate badge, no warning. Self or admin can undo.
  if (m.marked_non_clinical) {
    return (
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: '#94a3b8' }}>Non-clinical</span>
        {(isMe || canActOnTarget) && (
          <button
            onClick={() => setNonClinical(false)}
            disabled={busy}
            style={tinyLinkBtn}
            title="They are clinical after all — remove the non-clinical flag"
          >
            {busy ? '…' : 'Undo'}
          </button>
        )}
        {error && <span style={{ color: '#fca5a5' }}>{error}</span>}
      </div>
    );
  }

  // Unlinked and not marked → amber warning + action by viewer
  return (
    <div style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: '#fbbf24', opacity: 0.9 }} title="This member's account isn't linked to any clinician record. If they're a clinician, their personal rota will be empty until they link via Account → 'Your clinician record'. If they're not clinical, click the button to suppress this warning.">
        ⚠ Not linked to a clinician
      </span>
      {isMe ? (
        <button
          onClick={() => setNonClinical(true)}
          disabled={busy}
          style={tinyActionBtn}
          title="I'm not a clinician — I'm here as practice manager / reception / IT / etc."
        >
          {busy ? '…' : "I'm not a clinician"}
        </button>
      ) : canActOnTarget ? (
        <button
          onClick={() => setNonClinical(true)}
          disabled={busy}
          style={tinyActionBtn}
          title="Mark as non-clinical (e.g. practice manager, reception, IT) — suppresses this warning"
        >
          {busy ? '…' : 'Mark non-clinical'}
        </button>
      ) : null}
      {error && <span style={{ color: '#fca5a5' }}>{error}</span>}
    </div>
  );
}

const tinyActionBtn = {
  padding: '2px 8px',
  fontSize: 11,
  color: '#cbd5e1',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const tinyLinkBtn = {
  padding: '0 4px',
  fontSize: 11,
  color: '#94a3b8',
  background: 'transparent',
  border: 'none',
  textDecoration: 'underline',
  cursor: 'pointer',
};


function Stat({ label, value, colour, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        padding: '6px 12px',
        cursor: tooltip ? 'help' : 'default',
      }}
    >
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: colour || '#e2e8f0', fontFamily: "'Outfit', sans-serif", lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// Tiny Card wrapper — duplicated from page.js because that one is server-rendered
// and uses inline styles. Keeping the visual identical.
function Card({ title, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: 20,
    }}>
      {title && <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: '#cbd5e1', marginBottom: 14 }}>{title}</h3>}
      {children}
    </div>
  );
}
