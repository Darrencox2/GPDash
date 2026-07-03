'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function AcceptInviteButton({ inviteId }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setError('');
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    setLoading(true);

    const { error: err } = await supabase.rpc('accept_invite', { invite_id: inviteId });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    router.refresh();
  };

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        onClick={handleAccept}
        disabled={loading}
        style={{
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          color: 'white',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          border: 'none',
          borderRadius: 'var(--r-sm)',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
          fontFamily: 'inherit',
        }}
      >
        {loading ? 'Accepting...' : 'Accept'}
      </button>
      {error && <span style={{ fontSize: 10, color: '#fca5a5' }}>{error}</span>}
    </div>
  );
}
