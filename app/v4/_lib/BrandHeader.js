// app/v4/_lib/BrandHeader.js
//
// Server-component-safe logo header used across v4 pages so every page
// the user visits is unmistakably GPDash. Pure SVG + text, no hooks,
// no client-only state — works in both server and client components.
//
// Usage:
//   <BrandHeader />                      → small header with logo + wordmark
//   <BrandHeader subtitle="Sign up" />   → adds a subtle right-side label
//   <BrandHeader compact />              → just the icon, no wordmark
//
// All v4 pages should render this near the top of their layout. The
// AuthCard component (login/signup/reset) has its own inline copy
// because it sits inside a centered card; everywhere else uses this.

import Link from 'next/link';

export default function BrandHeader({ subtitle, compact = false, href = '/v4' }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        textDecoration: 'none',
      }}
    >
      <svg width="34" height="34" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="36" height="36" rx="7.6" fill="#1e293b" stroke="#334155" strokeWidth="0.5"/>
        <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
        <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
        <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
        <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
        <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
        <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
        <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
        <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
        <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
      </svg>
      {!compact && (
        <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, fontFamily: "'Space Mono', monospace" }}>
          <span style={{ fontSize: 17, fontWeight: 400, color: '#10b981', opacity: 0.4 }}>[</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>GP</span>
          <span style={{ fontSize: 17, fontWeight: 400, color: '#10b981', opacity: 0.4 }}>]</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 200, color: '#10b981', letterSpacing: '3px', marginLeft: 2 }}>DASH</span>
        </div>
      )}
      {subtitle && (
        <span style={{ fontSize: 12, color: '#475569', marginLeft: 8, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          {subtitle}
        </span>
      )}
    </Link>
  );
}
