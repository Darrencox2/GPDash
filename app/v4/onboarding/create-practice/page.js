'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f } from '../../_lib/auth-ui';

export default function CreatePracticePage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [odsCode, setOdsCode] = useState('');
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    if (!name.trim()) {
      setError('Practice name is required.');
      return;
    }
    setLoading(true);

    const { data, error: err } = await supabase.rpc('create_practice_with_owner', {
      practice_name: name.trim(),
      ods_code: odsCode.trim() || null,
      region: region.trim() || null,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // data is the new practice's UUID
    router.push('/v4/dashboard');
    router.refresh();
  };

  return (
    <AuthCard
      title="Set up your practice"
      subtitle="You'll be the practice owner — you can invite teammates next"
    >
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}

        <div style={f.field}>
          <label style={f.label}>Practice name *</label>
          <input
            type="text"
            required
            autoComplete="organization"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={f.input}
            placeholder="Winscombe & Banwell Family Practice"
          />
        </div>

        <div style={f.field}>
          <label style={f.label}>ODS code <span style={{ color: '#475569' }}>(optional)</span></label>
          <input
            type="text"
            value={odsCode}
            onChange={(e) => setOdsCode(e.target.value.toUpperCase())}
            style={f.input}
            placeholder="L83012"
            maxLength={10}
          />
        </div>

        <div style={f.field}>
          <label style={f.label}>Region <span style={{ color: '#475569' }}>(optional)</span></label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={f.input}
            placeholder="South West"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
        >
          {loading ? 'Creating...' : 'Create practice'}
        </button>
      </form>
    </AuthCard>
  );
}
