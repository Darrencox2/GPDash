'use client';

// UserSearch — search input on the admin users page. Updates the URL
// with ?q= on submit so the server can re-fetch with the filter.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UserSearch({ initialSearch }) {
  const router = useRouter();
  const [value, setValue] = useState(initialSearch || '');

  const submit = (e) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/v4/admin/users?q=${encodeURIComponent(q)}` : '/v4/admin/users');
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by email or name..."
        style={{
          flex: 1,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          color: '#e2e8f0',
          fontSize: 13,
        }}
      />
      <button type="submit" style={{
        padding: '8px 16px',
        background: '#0891b2',
        color: 'white',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}>Search</button>
      {initialSearch && (
        <button type="button" onClick={() => { setValue(''); router.push('/v4/admin/users'); }} style={{
          padding: '8px 12px',
          background: 'transparent',
          color: '#94a3b8',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          fontSize: 13,
          cursor: 'pointer',
        }}>Clear</button>
      )}
    </form>
  );
}
