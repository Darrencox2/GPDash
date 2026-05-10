'use client';

// Small reusable "value with a copy button" component. Used in the admin
// user-detail page next to the email and user ID — the platform admin
// regularly needs to paste these into Supabase auth dashboard / Stripe /
// support tools. Currently they triple-click and curse.
//
// Renders the value as-is (no styling assumptions — caller wraps in
// whatever font/size they want via children) plus a copy button that
// briefly turns green on success.

import { useState } from 'react';

export default function CopyableValue({ children, value, title }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Older browsers / insecure origins — fall back to a textarea
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {children}
      <button
        onClick={copy}
        title={copied ? 'Copied' : (title || 'Copy to clipboard')}
        aria-label={title || 'Copy'}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 2,
          cursor: 'pointer',
          color: copied ? '#34d399' : '#64748b',
          display: 'inline-flex',
          alignItems: 'center',
          transition: 'color 0.15s',
        }}
        onMouseOver={(e) => { if (!copied) e.currentTarget.style.color = '#cbd5e1'; }}
        onMouseOut={(e) => { if (!copied) e.currentTarget.style.color = '#64748b'; }}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </span>
  );
}
