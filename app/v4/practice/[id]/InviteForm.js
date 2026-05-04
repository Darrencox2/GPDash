'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { formStyles as f } from '../../_lib/auth-ui';

export default function InviteForm({ practiceId, canMakeOwner }) {
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

    setSuccess(`Invite sent to ${email}.`);
    setEmail('');
    setRole('user');
    router.refresh();
  };

  // Role options. 'user' = read-mostly (can view + edit own rota notes).
  // 'admin' = practice operations. 'owner' = full control + ownership transfer.
  // 'clinician' and 'receptionist' from the legacy enum are not offered for
  // new invites — treat them as deprecated; the permissions code handles them
  // as user-level if they exist on legacy rows.
  const roleOptions = canMakeOwner
    ? ['user', 'admin', 'owner']
    : ['user', 'admin'];

  const roleDescription = {
    user: 'Can view dashboard data and edit their own rota notes',
    admin: 'Can edit clinicians, working patterns, settings, and invite users',
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
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          {roleDescription[role] || ''}
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
      >
        {loading ? 'Sending invite...' : 'Send invite'}
      </button>

      <p style={{ fontSize: 11, color: '#64748b', marginTop: 12, textAlign: 'center' }}>
        Invitee creates an account with this email — they'll see a pending invite to accept.
      </p>
    </form>
  );
}
