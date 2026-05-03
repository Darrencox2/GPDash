'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function ClinicianLinker({ practiceId, currentLinkedClinicianId, allClinicians, currentUserId }) {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState(currentLinkedClinicianId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const link = async () => {
    if (!selected) {
      setError('Pick a clinician');
      return;
    }
    setBusy(true); setError(''); setSuccess('');
    try {
      const { error: rpcErr } = await supabase.rpc('claim_clinician_as_self', {
        target_clinician_id: selected,
      });
      if (rpcErr) throw rpcErr;
      setSuccess('Linked. Refreshing...');
      router.refresh();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Link failed');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!confirm('Unlink your account from this clinician?')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      // Direct update — RLS allows admins or the linked user themselves
      const { error: updErr } = await supabase
        .from('clinicians')
        .update({ linked_user_id: null })
        .eq('id', currentLinkedClinicianId);
      if (updErr) throw updErr;
      setSelected('');
      setSuccess('Unlinked.');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Unlink failed');
    } finally {
      setBusy(false);
    }
  };

  // Filter: clinicians not linked, plus the one I'm currently linked to
  const options = (allClinicians || []).filter(c =>
    !c.linked_user_id || c.linked_user_id === currentUserId
  );

  return (
    <div>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
        Link your account to a clinician record so 'My Rota' knows whose rota to show
        and lets you save personal notes.
      </p>

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={busy}
        style={{
          width: '100%', padding: '10px 12px', fontSize: 13,
          background: 'rgba(15,23,42,0.7)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: '#e2e8f0',
          marginBottom: 10,
        }}
      >
        <option value="">— Select a clinician —</option>
        {options.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} {c.initials ? `(${c.initials})` : ''} {c.role ? `· ${c.role}` : ''}
            {c.linked_user_id === currentUserId ? ' — currently you' : ''}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={link}
          disabled={busy || !selected || selected === currentLinkedClinicianId}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            color: 'white',
            background: 'rgba(99,102,241,0.4)',
            border: '1px solid rgba(99,102,241,0.6)',
            borderRadius: 8,
            cursor: busy || !selected || selected === currentLinkedClinicianId ? 'not-allowed' : 'pointer',
            opacity: busy || !selected || selected === currentLinkedClinicianId ? 0.5 : 1,
          }}
        >Link this is me</button>

        {currentLinkedClinicianId && (
          <button
            onClick={unlink}
            disabled={busy}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              color: '#fca5a5',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >Unlink</button>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 10,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          padding: 8,
          fontSize: 12,
          color: '#fca5a5',
        }}>{error}</div>
      )}
      {success && (
        <div style={{
          marginTop: 10,
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 6,
          padding: 8,
          fontSize: 12,
          color: '#86efac',
        }}>{success}</div>
      )}
    </div>
  );
}
