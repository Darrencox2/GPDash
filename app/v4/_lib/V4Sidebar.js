'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import GPDashLogo from '@/components/GPDashLogo';
import { APP_VERSION } from '@/lib/version';

// v4 sidebar — Next.js Link based navigation. Mirrors the v3 sidebar styling
// but routes to actual URLs instead of toggling activeSection state.

const NAV_ITEMS = (practiceId) => [
  { href: `/v4/practice/${practiceId}/today`, label: 'Today', colour: '#10b981',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { href: null, label: 'Buddy cover', colour: '#a78bfa', disabled: true,
    icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },

  { section: 'PLANNING' },
  { href: `/v4/practice/${practiceId}/forward`, label: 'Capacity planning', colour: '#818cf8',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z' },

  { section: 'PERSONAL' },
  { href: `/v4/practice/${practiceId}/my-rota`, label: 'My rota', colour: '#60a5fa',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z' },
  { href: `/v4/practice/${practiceId}/whos-in`, label: "Who's in / out", colour: '#34d399',
    icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },

  { section: 'ADMIN' },
  { href: `/v4/practice/${practiceId}`, label: 'Team', colour: '#fbbf24',
    icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { href: `/v4/practice/${practiceId}/team-rota`, label: 'Working patterns', colour: '#fbbf24',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm4 4h2v2H9v-2zm4 0h2v2h-2v-2zm-4 4h2v2H9v-2zm4 0h2v2h-2v-2z' },
  { href: `/v4/practice/${practiceId}/data`, label: 'Diagnostics', colour: '#a78bfa',
    icon: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z' },
  { href: '/v4/dashboard', label: 'All practices', colour: '#94a3b8',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z' },
];

export default function V4Sidebar({ practiceId, practiceName }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  const items = NAV_ITEMS(practiceId);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        width: open ? 240 : 56,
        flexShrink: 0,
        background: 'linear-gradient(to bottom, #0f172a, #0f172a, #1e293b)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        transition: 'width 0.2s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo + practice name */}
        <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: open ? 'space-between' : 'center' }}>
          {open ? (
            <>
              <GPDashLogo size="sidebar" />
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                title="Collapse sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => setOpen(true)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
              title="Expand sidebar"
            >
              <GPDashLogo size="sidebar-collapsed" />
            </button>
          )}
        </div>

        {open && practiceName && (
          <div style={{ padding: '0 12px 12px', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {practiceName}
          </div>
        )}

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {items.map((item, i) => {
            if (item.section) {
              if (!open) return <div key={i} style={{ height: 12 }} />;
              return (
                <div key={i} style={{
                  fontSize: 10,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontWeight: 600,
                  padding: '12px 8px 4px',
                }}>
                  {item.section}
                </div>
              );
            }

            const isActive = item.href && pathname === item.href;
            const content = (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 8,
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: isActive ? 'white' : '#cbd5e1',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                whiteSpace: 'nowrap',
                opacity: item.disabled ? 0.4 : 1,
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={item.colour} style={{ flexShrink: 0 }}>
                  <path d={item.icon} />
                </svg>
                {open && <span>{item.label}</span>}
                {open && item.disabled && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#64748b' }}>soon</span>}
              </div>
            );

            return item.href && !item.disabled ? (
              <Link key={i} href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
                {content}
              </Link>
            ) : (
              <div key={i}>{content}</div>
            );
          })}
        </nav>

        {/* Footer */}
        {open && (
          <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 10, color: '#475569' }}>
            v{APP_VERSION} · v4 preview
          </div>
        )}
      </aside>
    </>
  );
}
