'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function ClaimClinicianForm({ clinicians }) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClaim = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError('');
    const { error: rpcErr } = await supabase.rpc('claim_clinician_as_self', {
      target_clinician_id: selectedId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setSubmitting(false);
      return;
    }
    // Refresh server component data
    router.refresh();
  };

  if (!clinicians || clinicians.length === 0) {
    return (
      <p style={{ fontSize: 13, color: '#94a3b8' }}>
        No unclaimed active clinicians available. Ask an admin to add you to the clinician list first.
      </p>
    );
  }

  return (
    <div>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: 13,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          color: '#e2e8f0',
          marginBottom: 12,
        }}
      >
        <option value="">— Select your clinician record —</option>
        {clinicians.map(c => (
          <option key={c.id} value={c.id} style={{ background: '#1e293b' }}>
            {c.name} ({c.initials || 'no initials'}){c.role ? ` — ${c.role}` : ''}
          </option>
        ))}
      </select>

      <button
        onClick={handleClaim}
        disabled={!selectedId || submitting}
        style={{
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: 'white',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          border: 'none',
          borderRadius: 8,
          cursor: submitting || !selectedId ? 'not-allowed' : 'pointer',
          opacity: submitting || !selectedId ? 0.5 : 1,
        }}
      >
        {submitting ? 'Linking…' : 'Link this clinician to me'}
      </button>

      {error && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          fontSize: 12,
          color: '#fca5a5',
        }}>{error}</div>
      )}
    </div>
  );
}
