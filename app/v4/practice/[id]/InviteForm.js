'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { formStyles as f } from '../../_lib/auth-ui';

export default function InviteForm({ practiceId, canMakeOwner, canAssignLeadership }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    setLoading(true);

    const { error: err } = await supabase.rpc('invite_user_to_practice', {
      target_practice_id: practiceId,
      invitee_email: email.trim(),
      invitee_role: role,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setSuccess(`Invite created for ${email} - it is NOT emailed automatically. Copy the invite link from the pending invites card below and send it to them yourself.`);
    setEmail('');
    setRole('user');
    router.refresh();
  };

  // Role options. 'user' = read-mostly (can view + edit own rota notes).
  // 'admin' = practice operations. 'owner' = full control + ownership transfer.
  // 'clinician' and 'receptionist' from the legacy enum are not offered for
  // new invites — treat them as deprecated; the permissions code handles them
  // as user-level if they exist on legacy rows.
  const roleOptions = [
    'user',
    'admin',
    ...(canAssignLeadership ? ['practice_manager', 'partner'] : []),
    ...(canMakeOwner ? ['owner'] : []),
  ];

  const roleLabels = {
    user: 'User',
    admin: 'Admin',
    practice_manager: 'Practice manager',
    partner: 'Partner',
    owner: 'Owner',
  };

  const roleDescription = {
    user: 'Can view dashboard data and edit their own rota notes',
    admin: 'Practice operations: edit clinicians, working patterns, settings, invite staff. No access to confidential leadership areas',
    practice_manager: 'Leadership tier: full management plus confidential areas like Meetings',
    partner: 'Leadership tier: full management plus confidential areas like Meetings',
    owner: 'Full control including renaming the practice and transferring ownership',
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div style={f.errorBox}>{error}</div>}
      {success && <div style={f.successBox}>{success}</div>}

      <div style={f.field}>
        <label style={f.label}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={f.input}
          placeholder="teammate@practice.nhs.uk"
        />
      </div>

      <div style={f.field}>
        <label style={f.label}>Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ ...f.input, cursor: 'pointer' }}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>{roleLabels[r] || r}</option>
          ))}
        </select>
        <p className="text-caption text-mid mt-1.5">
          {roleDescription[role] || ''}
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
      >
        {loading ? 'Creating invite...' : 'Create invite'}
      </button>

      <p className="text-caption text-mid mt-3 text-center">
        Invitee creates an account with this email — they'll see a pending invite to accept.
      </p>
    </form>
  );
}
