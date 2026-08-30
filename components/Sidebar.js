'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GPDashLogo from './GPDashLogo';
import { APP_VERSION } from '@/lib/version';
import { canEditPracticeData, isLeadership } from '@/lib/permissions';

// Derive a 2-letter tile string from a practice name. Strips stop-words
// ("the", "and", "&") and common practice suffixes ("Family", "Practice",
// "Surgery", "Centre", "Clinic", "Medical", "Health") so initials reflect
// the distinctive part of the name:
//   "Winscombe & Banwell Family Practice" → "WB"
//   "Manor Park Surgery"                  → "MP"
//   "The Old Surgery"                     → "OL"
//   "Acme Medical Centre"                 → "AC"
function practiceInitials(name) {
  if (!name) return '?';
  const stop = new Set(['the', 'and', 'of', '&']);
  const skip = new Set(['family', 'medical', 'practice', 'surgery', 'centre', 'center', 'clinic', 'health']);
  const words = name.split(/\s+/).filter(w => {
    const lw = w.toLowerCase();
    return w && !stop.has(lw) && !skip.has(lw);
  });
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const NAV_ITEMS = [
  { id: 'huddle-today', section: null, label: 'Today', colour: '#10b981',
    icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { id: 'buddy-cover', section: null, label: 'Buddy cover', colour: '#a78bfa',
    icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },

  { id: '_planning', section: 'PLANNING' },
  { id: 'huddle-forward', section: 'PLANNING', label: 'Capacity planning', colour: '#818cf8',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z' },
  { id: 'reporting', section: 'PLANNING', label: 'Reporting', colour: '#a78bfa',
    icon: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { id: 'workforce-planner', section: 'PLANNING', label: 'Workforce planner', colour: '#c084fc',
    icon: 'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z' },
  { id: 'spend', section: 'PLANNING', label: 'Locum spend', colour: '#fbbf24', requires: 'admin',
    icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  // Rooms hidden from navigation until the module is further developed
  // (2026-06, module + routes remain intact - re-enable by uncommenting):
  // { id: 'room-dashboard', section: 'PLANNING', label: 'Rooms', colour: '#67e8f9',
  // icon: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z' },

  { id: '_personal', section: 'PERSONAL' },
  { id: 'huddle-rota', section: 'PERSONAL', label: 'My rota', colour: '#60a5fa',
    icon: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z' },
  // The old "Clinicians" entry (id: 'team-members') was removed in
  // v4.14.0 — all clinician editing lives in Practice → Clinicians now,
  // which has the same QuickSetupTable plus the working-days grid and
  // (incoming) side panel for deeper detail. One canonical home rather
  // than two slightly-different pages that drift apart.
  // Renamed from "Account" for clarity that it's the signed-in user's account
  { id: 'account', section: 'PERSONAL', label: 'My account', colour: '#22d3ee',
    icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },

  { id: '_admin', section: 'ADMIN' },
  // Renamed from "Practice settings" — single entry point for all
  // practice-wide config. Was previously split across "Settings" (buddy
  // cover defaults), "Practice settings" (members + integrations), etc.
  { id: '_leadership', section: 'LEADERSHIP', requires: 'leadership' },
  { id: 'meetings', section: 'LEADERSHIP', label: 'Meetings', colour: '#f0abfc', requires: 'leadership',
    icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z' },

  { id: 'practice-settings', section: 'ADMIN', label: 'Practice', colour: '#22d3ee', requires: 'admin', external: true,
    icon: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z' },
  { id: 'changelog', section: 'ADMIN', label: 'Changelog', colour: '#94a3b8',
    icon: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z' },
];

export default function Sidebar({ activeSection, setActiveSection, sidebarOpen, setSidebarOpen, data, onNavigate }) {
  // Theme toggle. The actual data-theme attribute is applied pre-paint by a
  // script in the root layout (reading localStorage) to avoid a flash; here we
  // just read the current value on mount and flip it on click.
  const [theme, setTheme] = useState('dark');
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }, []);
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('gpdash-theme', next);
    } catch (e) {}
  };
  const router = useRouter();
  const practiceSlug = data?._v4?.practiceSlug;
  const practiceName = data?._v4?.practiceName || null;
  const myRole = data?._v4?.myRole || null;
  const ROLE_LABELS = { owner: 'Owner', partner: 'Partner', practice_manager: 'Practice manager', admin: 'Admin', user: 'User', clinician: 'Clinician', receptionist: 'Receptionist' };
  const roleLabel = myRole ? (ROLE_LABELS[myRole] || (myRole.charAt(0).toUpperCase() + myRole.slice(1))) : null;
  const initials = practiceName ? practiceInitials(practiceName) : '';

  // Click handler logic:
  //   - If item.external (e.g. 'practice-settings'), navigate to a separate route
  //     regardless of which mode the sidebar is in
  //   - If onNavigate provided (sidebar is on a non-dashboard page), use it for
  //     all other items so they navigate to the dashboard with the right section
  //   - Otherwise (default — on dashboard) use setActiveSection for in-page state
  // On phones the drawer must start closed — both shells initialise
  // sidebarOpen=true, which on first load covered the page with the
  // nav and scrim on mobile.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleItemClick = (item) => {
    if (item.id === 'practice-settings' && practiceSlug) {
      router.push(`/v4/practice/${practiceSlug}`);
      if (window.innerWidth < 1024) setSidebarOpen(false);
      return;
    }
    if (onNavigate) {
      onNavigate(item.id);
      if (window.innerWidth < 1024) setSidebarOpen(false);
      return;
    }
    setActiveSection(item.id);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleVersionClick = () => {
    if (onNavigate) {
      onNavigate('changelog');
    } else {
      setActiveSection('changelog');
    }
  };

  // Role-aware nav: drop admin-only items if the user can't edit practice data,
  // then drop section dividers that no longer have any items below them.
  const canEdit = canEditPracticeData(data);
  const canLead = isLeadership(data);
  const filteredNav = (() => {
    const items = NAV_ITEMS.filter(item => {
      if (item.requires === 'admin' && !canEdit) return false;
      if (item.requires === 'leadership' && !canLead) return false;
      return true;
    });
    // Drop any section divider whose section has no following entries before
    // the next divider. Walk backwards: an empty section produces a divider
    // immediately followed by another divider (or end of list).
    const result = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const next = items[i + 1];
      const isDivider = item.id?.startsWith('_');
      const nextIsDivider = !next || next.id?.startsWith('_');
      if (isDivider && nextIsDivider) continue;  // empty section → skip
      result.push(item);
    }
    return result;
  })();

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-40 lg:z-auto
        ${sidebarOpen ? 'w-[252px]' : 'w-0 lg:w-14'}
        flex-shrink-0 transition-all duration-200 overflow-hidden
      `} style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>
        <div className="h-full flex flex-col w-[252px] lg:w-auto">
          {/* Logo */}
          <div className="px-3 pt-4 pb-2">
            {sidebarOpen ? (
              <GPDashLogo size="sidebar" />
            ) : (
              <div className="flex justify-center">
                <GPDashLogo size="sidebar-collapsed" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-1.5 py-3">
            {filteredNav.map(item => {
              // Section divider
              if (item.id.startsWith('_')) {
                if (!sidebarOpen) return <div key={item.id} className="mx-2 my-2" style={{height:1,background:'var(--sidebar-divider)'}} />;
                return (
                  <div key={item.id} className="flex items-center gap-2 mx-3 mt-4 mb-1.5">
                    <div className="flex-1 h-px" style={{background:'var(--sidebar-divider)'}} />
                    <span style={{fontSize:11,color:'#334155',letterSpacing:'1.5px'}}>{item.section}</span>
                    <div className="flex-1 h-px" style={{background:'var(--sidebar-divider)'}} />
                  </div>
                );
              }

              const isActive = activeSection === item.id;
              const activeStyle = isActive ? {
                background: `${item.colour}15`,
                borderLeft: `3px solid ${item.colour}`,
              } : {
                borderLeft: '3px solid transparent',
              };

              // Collapsed mode
              if (!sidebarOpen) {
                return (
                  <button key={item.id} onClick={() => handleItemClick(item)}
                    className="w-full flex justify-center py-2 rounded-lg mb-0.5 transition-colors hover:bg-white/5"
                    style={activeStyle} title={item.label}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isActive ? item.colour : item.colour} style={{opacity: isActive ? 1 : 0.5}}>
                      <path d={item.icon} />
                    </svg>
                    {item.badge && <div style={{position:'absolute',top:2,right:4,width:6,height:6,borderRadius:'50%',background:item.colour}} />}
                  </button>
                );
              }

              // Expanded mode
              return (
                <button key={item.id} onClick={() => handleItemClick(item)}
                  className="w-full flex items-center gap-2.5 rounded-lg mb-0.5 transition-colors hover:bg-white/5"
                  style={{...activeStyle, padding: '8px 10px'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={item.colour} style={{opacity: isActive ? 1 : 0.5, flexShrink: 0}}>
                    <path d={item.icon} />
                  </svg>
                  <span style={{fontSize:13, color: isActive ? 'var(--text-1)' : 'var(--text-3)', fontWeight: isActive ? 500 : 400}}>{item.label}</span>
                  {item.badge && <span style={{fontSize:11,padding:'1px 6px',borderRadius:'var(--r-md)',background:`${item.colour}20`,color:item.colour,marginLeft:'auto'}}>{item.badge}</span>}
                </button>
              );
            })}
          </nav>

          {/* Practice tile — identity anchor at the bottom. Avatar +
              name + role. Not clickable (yet) — sets up the slot for a
              future multi-practice switcher. When sidebar is collapsed,
              the avatar alone shows centred. */}
          {practiceName && (
            <div className="p-2.5" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
              {sidebarOpen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 6px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--r-md)',
                    background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 13, color: 'white', fontWeight: 500,
                    letterSpacing: 0.5,
                    fontFamily: "'Outfit', sans-serif",
                  }}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div style={{
                      fontSize: 15, color: 'var(--text-1)', fontWeight: 500,
                      lineHeight: 1.25,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }} title={practiceName}>
                      {practiceName}
                    </div>
                    {roleLabel && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                        {roleLabel}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }} title={practiceName}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--r-md)',
                    background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: 'white', fontWeight: 500,
                    letterSpacing: 0.5,
                    fontFamily: "'Outfit', sans-serif",
                  }}>{initials}</div>
                </div>
              )}
            </div>
          )}

          {/* Version (practice logo removed — will be re-added per-practice later) */}
          <div className="p-2.5" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
            <button onClick={handleVersionClick} className="block w-full text-center pb-1 hover:text-slate-400 transition-colors" style={{fontFamily:"'Space Mono',monospace",fontSize:sidebarOpen?12:10,color:'var(--text-3)'}}>{APP_VERSION}</button>
          </div>

          {/* Theme toggle */}
          <div className="p-1.5" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
            <button onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--text-3)' }}
              title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}>
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-6a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zM4.22 4.22a1 1 0 0 1 1.42 0l.7.7a1 1 0 1 1-1.41 1.42l-.71-.71a1 1 0 0 1 0-1.41zm12.73 12.73a1 1 0 0 1 1.41 0l.71.71a1 1 0 1 1-1.41 1.41l-.71-.7a1 1 0 0 1 0-1.42zM1 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H2a1 1 0 0 1-1-1zm18 0a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1zM4.22 19.78a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.7.71a1 1 0 0 1-1.42 0zM16.95 7.05a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.7.71a1 1 0 0 1-1.42 0z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
              )}
              {sidebarOpen && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
            </button>
          </div>

          {/* Collapse toggle */}
          <div className="p-1.5" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full flex items-center justify-center py-1.5 rounded-lg text-slate-400 hover:text-slate-400 hover:bg-white/5 text-xs transition-colors">
              {sidebarOpen ? '◂' : '▸'}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden bg-slate-900 text-white p-2 rounded-lg shadow-lg"
        style={{ display: sidebarOpen ? 'none' : 'flex' }}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </>
  );
}
