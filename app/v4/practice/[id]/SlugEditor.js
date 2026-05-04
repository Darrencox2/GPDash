'use client';

// SlugEditor — lets practice owners/admins customise their URL slug.
// Slug is the user-facing identifier in /p/[slug] URLs.
//
// Validation matches the DB constraint: lowercase a-z 0-9 and dashes,
// 1-50 chars, no leading/trailing dash. Live preview of the URL,
// debounced auto-save on valid input.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;

export default function SlugEditor({ practiceId, currentSlug, canEdit }) {
  const router = useRouter();
  const [value, setValue] = useState(currentSlug || '');
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  const normalise = (raw) => raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const isValid = SLUG_RE.test(value);
  const isDirty = value !== currentSlug;

  const save = async () => {
    if (!isValid) {
      setStatus({ kind: 'error', message: 'Slug must be 1-50 chars, lowercase letters, digits, and dashes only.' });
      return;
    }
    setStatus({ kind: 'saving', message: 'Saving…' });
    // .select() forces the API to return the updated row(s). If RLS blocks
    // the update we'll get an empty array back rather than a silent success.
    const { data, error } = await supabase
      .from('practices')
      .update({ slug: value })
      .eq('id', practiceId)
      .select('id, slug');

    if (error) {
      if (error.code === '23505') {
        setStatus({ kind: 'error', message: 'That slug is already taken. Try another.' });
      } else if (error.code === '23514') {
        setStatus({ kind: 'error', message: 'Invalid slug format. Use lowercase letters, digits, and dashes only.' });
      } else {
        setStatus({ kind: 'error', message: error.message || 'Save failed.' });
      }
      return;
    }
    if (!data || data.length === 0) {
      setStatus({ kind: 'error', message: 'Save was blocked — only owners and admins can change the practice URL.' });
      return;
    }
    setStatus({ kind: 'saved', message: 'Saved.' });
    // Refresh the server component so any links on this page pick up the new slug
    startTransition(() => router.refresh());
  };

  if (!canEdit) {
    return (
      <div style={{ fontSize: 13, color: '#94a3b8' }}>
        URL: <code style={{ color: '#22d3ee' }}>/p/{currentSlug}</code>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Only owners and admins can change this.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
        URL: <code style={{ color: '#22d3ee' }}>/p/{value || '…'}</code>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(normalise(e.target.value)); setStatus({ kind: 'idle', message: '' }); }}
          placeholder="winscombe"
          maxLength={50}
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: 13,
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}
        />
        <button
          onClick={save}
          disabled={!isDirty || !isValid || status.kind === 'saving' || isPending}
          style={{
            padding: '6px 14px',
            background: isDirty && isValid ? '#0891b2' : 'rgba(255,255,255,0.06)',
            color: isDirty && isValid ? 'white' : '#64748b',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            cursor: isDirty && isValid ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}>
          {status.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {status.message && (
        <div style={{
          fontSize: 11,
          marginTop: 6,
          color: status.kind === 'error' ? '#fca5a5' : status.kind === 'saved' ? '#34d399' : '#94a3b8',
        }}>{status.message}</div>
      )}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
        Lowercase letters, digits, and dashes. Must be unique across all practices.
      </div>
    </div>
  );
}
