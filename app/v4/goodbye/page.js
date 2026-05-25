// /v4/goodbye — landing page after successful account deletion.
// Public (no auth — the user no longer has an account).

import Link from 'next/link';

export const metadata = {
  title: 'Account deleted · GPDash',
  robots: { index: false, follow: false },
};

export default function GoodbyePage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{
        background: 'linear-gradient(180deg, #0b1224 0%, #111c33 100%)',
        color: '#e2e8f0',
      }}
    >
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.30)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-medium mb-3" style={{ color: '#f1f5f9' }}>
          Your account has been deleted
        </h1>

        <p className="text-sm leading-relaxed mb-2 text-slate-400">
          Your GPDash account, profile, MFA factors, and practice memberships
          have been permanently removed.
        </p>
        <p className="text-sm leading-relaxed mb-6 text-slate-400">
          Audit log entries you appeared in have been anonymised — they remain
          for the practice&apos;s integrity but no longer identify you.
        </p>

        <div
          className="text-xs text-slate-500 mb-6 px-4 py-3 rounded-lg leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          If you change your mind, you can create a new GPDash account at any
          time — but the old one cannot be restored.
        </div>

        <Link
          href="/"
          className="inline-block px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'rgba(34,211,238,0.15)',
            border: '1px solid rgba(34,211,238,0.30)',
            color: '#67e8f9',
          }}
        >
          Return to homepage
        </Link>
      </div>
    </main>
  );
}
