'use client';

// DashboardShell — wraps non-dashboard pages (practice management, setup
// wizard, admin) with the same sidebar + footer chrome as the dashboard.
//
// Sidebar items in this shell are NAVIGATIONAL — clicking goes to the
// dashboard at the relevant section via URL. The 'practice-settings' item
// is the current page so it stays put (and is highlighted via activeSection).
//
// Server-rendered pages call:
//   <DashboardShell shellData={...} activeSection="practice-settings">
//     {children}
//   </DashboardShell>
//
// shellData needs a minimal _v4 shape: practiceSlug, practiceName, myRole,
// isPlatformAdmin. Used for sidebar role gating + footer links.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import { canEditPracticeData, isPlatformAdmin } from '@/lib/permissions';

export default function DashboardShell({ shellData, activeSection, children }) {
  const router = useRouter();
  const supabase = createClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const practiceSlug = shellData?._v4?.practiceSlug;
  const practiceName = shellData?._v4?.practiceName || 'Practice';

  // When sidebar items are clicked, navigate to the dashboard at that section
  const onNavigate = (itemId) => {
    if (!practiceSlug) return;
    if (itemId === 'changelog' || itemId === 'account') {
      // These are dashboard-internal sections — go to dashboard with section param
      router.push(`/p/${practiceSlug}?section=${itemId}`);
    } else {
      router.push(`/p/${practiceSlug}?section=${itemId}`);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/v4/login');
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0f172a' }}>
      <Sidebar
        activeSection={activeSection}
        setActiveSection={() => {}}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        data={shellData}
        onNavigate={onNavigate}
      />
      <main className="flex-1 min-h-screen min-w-0" style={{ background: '#0f172a', color: '#e2e8f0' }}>
        <div className="max-w-6xl mx-auto p-4 lg:p-6">
          {children}
        </div>
        <footer className="mt-8 pb-6">
          <div className="text-center text-xs" style={{ color: '#64748b' }}>
            GPDash — {practiceName} · v4 Postgres
            {isPlatformAdmin(shellData) && (
              <>
                {' · '}
                <a href="/v4/admin" style={{ color: '#22d3ee', textDecoration: 'underline' }}>Platform admin</a>
              </>
            )}
            {' · '}
            <a href="/v4/dashboard" style={{ color: '#94a3b8', textDecoration: 'underline' }}>Switch practice</a>
            {' · '}
            <button
              onClick={signOut}
              style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
            >Sign out</button>
          </div>
        </footer>
      </main>
    </div>
  );
}
