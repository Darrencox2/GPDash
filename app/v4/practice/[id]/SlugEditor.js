'use client';

// SlugEditor — lets practice owners/admins customise their URL slug.
// Slug is the user-facing identifier in /p/[slug] URLs and also the
// path parameter on /v4/practice/[id] (which accepts both UUID and slug).
//
// Validation matches the DB constraint: lowercase a-z 0-9 and dashes,
// 1-50 chars, no leading/trailing dash. Live preview of the URL,
// live availability check (debounced) so the user sees "already taken"
// before they click Save instead of after.
//
// On successful save we navigate to /v4/practice/<new-slug> with the
// existing query string preserved. Without that, the browser stays on
// the OLD slug URL which now 404s because the slug it points to no
// longer matches anything in the DB.

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;

export default function SlugEditor({ practiceId, currentSlug, canEdit }) {
  const router = useRouter();
  const [value, setValue] = useState(currentSlug || '');
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  // Live availability check state. 'idle' means we haven't asked yet,
  // 'checking' is in-flight, 'available' / 'taken' are settled answers.
  const [avail, setAvail] = useState({ state: 'idle' });
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();
  const checkTimer = useRef(null);

  const normalise = (raw) => raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const isValid = SLUG_RE.test(value);
  const isDirty = value !== currentSlug;

  // ─── Live availability check ────────────────────────────────────────
  // Fires 300ms after the user stops typing, only when the slug looks
  // valid and is different from the current one. We exclude the current
  // practice's ID so "save unchanged" doesn't flag itself as taken.
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!isDirty || !isValid) {
      setAvail({ state: 'idle' });
      return;
    }
    setAvail({ state: 'checking' });
    checkTimer.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_slug_available', {
        candidate_slug: value,
        exclude_practice_id: practiceId,
      });
      if (error) {
        // Don't block save on a check error — surface the failure but
        // let the DB unique index catch the conflict if there is one.
        setAvail({ state: 'error', message: error.message });
        return;
      }
      setAvail({ state: data?.available ? 'available' : 'taken' });
    }, 300);
    return () => clearTimeout(checkTimer.current);
  }, [value, isDirty, isValid, practiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!isValid) {
      setStatus({ kind: 'error', message: 'Slug must be 1-50 chars, lowercase letters, digits, and dashes only.' });
      return;
    }
    if (avail.state === 'taken') {
      setStatus({ kind: 'error', message: 'That URL is already taken by another practice.' });
      return;
    }
    setStatus({ kind: 'saving', message: 'Saving…' });
    const { data, error } = await supabase
      .from('practices')
      .update({ slug: value })
      .eq('id', practiceId)
      .select('id, slug');

    if (error) {
      if (error.code === '23505') {
        setStatus({ kind: 'error', message: 'That URL is already taken. Try another.' });
        setAvail({ state: 'taken' });
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
    // Navigate to the new URL preserving query string. The previous
    // implementation called router.refresh() which leaves the URL
    // pointing at the OLD slug — the page then re-fetches and 404s
    // because nothing in the DB matches that slug any more.
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      startTransition(() => router.replace(`/v4/practice/${value}${search}`));
    }
  };

  if (!canEdit) {
    return (
      <div style={{ fontSize: 13, color: '#94a3b8' }}>
        URL: <code style={{ color: '#22d3ee' }}>/p/{currentSlug}</code>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Only owners and admins can change this.</div>
      </div>
    );
  }

  // Decide whether to allow saving. Block if format invalid, not dirty,
  // currently saving, or live-check says taken.
  const saveBlocked = !isDirty || !isValid || status.kind === 'saving' || isPending || avail.state === 'taken';

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
          disabled={saveBlocked}
          style={{
            padding: '6px 14px',
            background: !saveBlocked ? '#0891b2' : 'rgba(255,255,255,0.06)',
            color: !saveBlocked ? 'white' : '#64748b',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            cursor: !saveBlocked ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}>
          {status.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Live availability hint — only shown when the slug is dirty and
          valid (no point asking "is the existing slug available?"). */}
      {isDirty && isValid && (
        <div style={{
          fontSize: 11,
          marginTop: 6,
          color: avail.state === 'available' ? '#34d399'
            : avail.state === 'taken' ? '#fca5a5'
            : avail.state === 'checking' ? '#94a3b8'
            : '#64748b',
        }}>
          {avail.state === 'checking' && 'Checking availability…'}
          {avail.state === 'available' && '✓ Available'}
          {avail.state === 'taken' && '✕ Already taken — try another'}
          {avail.state === 'error' && 'Couldn\'t check — Save will still verify'}
        </div>
      )}

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
