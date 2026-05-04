'use client';

// ViewOnlyBanner — small status bar shown at the top of the dashboard for
// 'user' role members. Tells them they're in view-only mode and how to
// request changes (ask an admin). Admins and owners see nothing.

import { canEditPracticeData, isPlatformAdmin, roleLabel } from '@/lib/permissions';

export default function ViewOnlyBanner({ data }) {
  // Hide for admins/owners and platform admins
  if (canEditPracticeData(data)) return null;
  // Hide if there's no role at all (shouldn't happen normally — defensive)
  if (!data?._v4?.myRole) return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(8, 145, 178, 0.15), rgba(8, 145, 178, 0.05))',
      border: '1px solid rgba(8, 145, 178, 0.3)',
      borderRadius: 8,
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
      fontSize: 13,
      color: '#cffafe',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1l3 6 6 .75-4.5 4.25L17 18l-5-3-5 3 .5-6L3 7.75 9 7l3-6z" />
      </svg>
      <div style={{ flex: 1 }}>
        <strong style={{ color: '#67e8f9' }}>View only</strong>
        <span style={{ marginLeft: 8, color: '#94a3b8' }}>
          You're signed in as a {roleLabel(data).toLowerCase()}. To change practice data, ask an admin.
        </span>
      </div>
    </div>
  );
}
