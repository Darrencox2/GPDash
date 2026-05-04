'use client';

// AdminNav — top nav bar shown across the /v4/admin/* pages. Tabs for
// Practices, Users, plus a way back to the regular dashboard.

import Link from 'next/link';

export default function AdminNav({ active }) {
  const tabs = [
    { id: 'practices', label: 'Practices', href: '/v4/admin' },
    { id: 'users', label: 'Users', href: '/v4/admin/users' },
  ];

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500, marginBottom: 4 }}>
            ⚡ Platform admin
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'white' }}>
            GPDash administration
          </h1>
        </div>
        <Link href="/v4/dashboard" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
          ← Back to my practices
        </Link>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(t => (
          <Link
            key={t.id}
            href={t.href}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: active === t.id ? 600 : 400,
              color: active === t.id ? '#22d3ee' : '#94a3b8',
              textDecoration: 'none',
              borderBottom: `2px solid ${active === t.id ? '#22d3ee' : 'transparent'}`,
              marginBottom: -1,
            }}>
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
