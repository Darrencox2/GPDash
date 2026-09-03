'use client';

// AdminNav — top nav bar shown across the /v4/admin/* pages. Tabs for
// Practices, Users, NHS data, plus a way back to the regular dashboard.
//
// Visual lead with the GPDash logo + "Platform admin" pill so the
// section feels like a deliberate part of the product rather than
// a stripped-down internal tool. Type sizing and contrast bumped for
// long-session readability — admin pages are scanned not glanced at.

import Link from 'next/link';
import GPDashLogo from '@/components/GPDashLogo';

export default function AdminNav({ active }) {
  const tabs = [
    { id: 'practices', label: 'Practices', href: '/v4/admin' },
    { id: 'users', label: 'Users', href: '/v4/admin/users' },
    { id: 'nhs-data', label: 'NHS data', href: '/v4/admin/nhs-data' },
    { id: 'retention', label: 'Retention', href: '/v4/admin/retention' },
    { id: 'errors', label: 'Errors', href: '/v4/admin/errors' },
  ];

  return (
    <div className="mb-8">
      {/* Header row: logo on the left, "back to my practices" on the right */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div className="flex items-center gap-3.5 flex-wrap">
          <GPDashLogo size="large" />
          {/* Pill marker that this isn't the regular app */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            background: 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.3)',
            borderRadius: 'var(--r-pill)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--c-cyan)',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}>
            <span className="text-meta">⚡</span>
            Platform admin
          </div>
        </div>
        <Link
          href="/v4/dashboard"
          style={{
            fontSize: 13,
            color: 'var(--g-text-soft)',
            textDecoration: 'none',
            padding: '7px 14px',
            borderRadius: 'var(--r-md)',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          ← Back to my practices
        </Link>
      </div>

      {/* Heading: clear hierarchy, generous size */}
      <h1 style={{
        fontFamily: "var(--font-heading)",
        fontSize: 30,
        fontWeight: 600,
        color: 'var(--g-text-max)',
        marginBottom: 6,
        letterSpacing: -0.5,
      }}>
        Administration
      </h1>
      <p style={{
        fontSize: 14,
        color: 'var(--g-text-mid)',
        marginBottom: 22,
        lineHeight: 1.6,
        maxWidth: 720,
      }}>
        Platform-level oversight: every practice, every user, every NHS data import.
        For day-to-day work in a single practice, click <em style={{ color: 'var(--g-text-soft)', fontStyle: 'normal', fontWeight: 500 }}>Open</em> on its row.
      </p>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {tabs.map(t => (
          <Link
            key={t.id}
            href={t.href}
            style={{
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: active === t.id ? 600 : 500,
              color: active === t.id ? 'var(--c-cyan-3)' : 'var(--g-text-soft)',
              textDecoration: 'none',
              borderBottom: `2px solid ${active === t.id ? '#22d3ee' : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s',
            }}>
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
