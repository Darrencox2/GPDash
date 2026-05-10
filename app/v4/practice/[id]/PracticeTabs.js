'use client';

// PracticeTabs — client-side tab navigation for the Practice page.
// Tab state is held in URL query (?tab=details|users|buddy-cover|demand|integrations|danger)
// so refresh and bookmarking work.

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { id: 'details', label: 'Details', requires: 'view' },
  { id: 'users', label: 'Users', requires: 'view' },
  { id: 'clinicians', label: 'Clinicians', requires: 'admin' },
  { id: 'buddy-cover', label: 'Buddy cover', requires: 'admin' },
  { id: 'demand', label: 'Demand model', requires: 'admin' },
  { id: 'resources', label: 'Resources', requires: 'view' },
  { id: 'activity', label: 'Activity', requires: 'admin' },
  { id: 'danger', label: 'Danger zone', requires: 'platform_admin' },
];

export default function PracticeTabs({ canManage, isPlatformAdmin, children }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || 'details');

  // Sync URL → state on browser back/forward
  useEffect(() => {
    if (urlTab && urlTab !== activeTab) setActiveTab(urlTab);
  }, [urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter tabs by role
  const visibleTabs = TABS.filter(t => {
    if (t.requires === 'platform_admin') return isPlatformAdmin;
    if (t.requires === 'admin') return canManage;
    return true;
  });

  function pickTab(tabId) {
    setActiveTab(tabId);
    // Update URL without full page reload
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Find which tab is active (must be in visible list)
  const effectiveTab = visibleTabs.find(t => t.id === activeTab)?.id || visibleTabs[0]?.id || 'details';

  // children is { details: ReactNode, users: ReactNode, ... } keyed by tab id
  const tabContent = children?.[effectiveTab] || null;

  return (
    <div>
      {/* Tab nav */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        {visibleTabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickTab(t.id)}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: t.id === effectiveTab ? 600 : 400,
              color: t.id === effectiveTab ? (t.id === 'danger' ? '#fca5a5' : '#22d3ee') : '#94a3b8',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${t.id === effectiveTab ? (t.id === 'danger' ? '#fca5a5' : '#22d3ee') : 'transparent'}`,
              marginBottom: -1,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabContent}
    </div>
  );
}
