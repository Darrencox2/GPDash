'use client';
import { useState } from 'react';
import GPDashLogo from './GPDashLogo';
import { APP_VERSION } from '@/lib/version';

const NAV_SECTIONS = [
  {
    id: 'today',
    iconPath: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
    label: 'Today',
    colour: 'teal',
    items: [],
  },
  {
    id: 'buddy',
    iconPath: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    label: 'Buddy Cover',
    colour: 'purple',
    items: [],
  },
  {
    id: 'capacity',
    iconPath: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
    label: 'Capacity',
    colour: 'indigo',
    items: [
      { id: 'huddle-forward', label: 'Forward Planning' },
      { id: 'workload-audit', label: 'Workload Audit' },
    ],
  },
  {
    id: 'rota-section',
    iconPath: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z',
    label: 'My Rota',
    colour: 'blue',
    items: [],
  },
  {
    id: 'team',
    iconPath: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    label: 'Team',
    colour: 'amber',
    items: [
      { id: 'team-members', label: 'Team Members' },
      { id: 'team-rota', label: 'Working Patterns' },
      { id: 'settings', label: 'Buddy Settings' },
    ],
  },
  {
    id: 'rooms',
    iconPath: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z',
    label: 'Rooms',
    colour: 'slate',
    items: [
      { id: 'room-dashboard', label: 'Allocation', badge: 'Testing' },
      { id: 'room-settings', label: 'Room Settings' },
    ],
  },
];

const ACCENT_COLOURS = {
  teal: { active: 'bg-teal-500/20 text-teal-200', hover: 'hover:bg-teal-500/10', dot: 'bg-teal-400' },
  purple: { active: 'bg-purple-500/20 text-purple-200', hover: 'hover:bg-purple-500/10', dot: 'bg-purple-400' },
  indigo: { active: 'bg-indigo-500/20 text-indigo-200', hover: 'hover:bg-indigo-500/10', dot: 'bg-indigo-400' },
  blue: { active: 'bg-blue-500/20 text-blue-200', hover: 'hover:bg-blue-500/10', dot: 'bg-blue-400' },
  amber: { active: 'bg-amber-500/20 text-amber-200', hover: 'hover:bg-amber-500/10', dot: 'bg-amber-400' },
  slate: { active: 'bg-white/10 text-white', hover: 'hover:bg-white/5', dot: 'bg-slate-400' },
};

export default function Sidebar({ activeSection, setActiveSection, sidebarOpen, setSidebarOpen }) {
  const [expandedMenus, setExpandedMenus] = useState({ capacity: false, team: false, rooms: false });

  const toggleMenu = (menu) => setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));

  // Map standalone section IDs to activeSection values
  const SECTION_MAP = { today: 'huddle-today', buddy: 'buddy-cover', 'rota-section': 'huddle-rota' };

  const isSectionActive = (sectionId) => {
    if (SECTION_MAP[sectionId]) return activeSection === SECTION_MAP[sectionId];
    const section = NAV_SECTIONS.find(s => s.id === sectionId);
    if (!section) return false;
    return section.items.some(item => item.id === activeSection);
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-40 lg:z-auto
        ${sidebarOpen ? 'w-60' : 'w-0 lg:w-16'} 
        bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
        flex-shrink-0 transition-all duration-200 overflow-hidden
        border-r border-white/5
      `}>
        <div className="h-full flex flex-col w-60 lg:w-auto">
          {/* Logo */}
          <div className="px-3 pt-3 pb-2">
            {sidebarOpen ? (
              <div className="flex flex-col items-center gap-0.5">
                <GPDashLogo size="sidebar" className="w-full max-w-[200px]" />
                <div className="w-full bg-white rounded-2xl p-2 flex items-center justify-center">
                  <img src="/logo.png" alt="Practice" className="h-12 w-auto object-contain" />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <GPDashLogo size="sidebar-collapsed" className="w-10 h-10" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {NAV_SECTIONS.map(section => {
              const accent = ACCENT_COLOURS[section.colour];
              const isActive = isSectionActive(section.id);

              if (section.items.length === 0) {
                return (
                  <button key={section.id} onClick={() => setActiveSection(SECTION_MAP[section.id] || section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? accent.active : `text-slate-400 ${accent.hover}`
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d={section.iconPath}/></svg>
                    {sidebarOpen && <span>{section.label}</span>}
                  </button>
                );
              }

              return (
                <div key={section.id}>
                  <button onClick={() => toggleMenu(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'text-white' : `text-slate-400 ${accent.hover}`
                    }`}>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d={section.iconPath}/></svg>
                    {sidebarOpen && (
                      <>
                        <span className="flex-1 text-left">{section.label}</span>
                        <span className="text-[10px] text-slate-500">{expandedMenus[section.id] ? '▾' : '›'}</span>
                      </>
                    )}
                  </button>
                  {expandedMenus[section.id] && sidebarOpen && (
                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                      {section.items.map(item => (
                        <button key={item.id} onClick={() => setActiveSection(item.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                            activeSection === item.id
                              ? `${accent.active} font-medium`
                              : `text-slate-500 hover:text-slate-300 ${accent.hover}`
                          }`}>
                          {item.label}
                          {item.badge && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400">{item.badge}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Version */}
          {sidebarOpen && <div className="px-4 py-1 text-center text-[10px] text-slate-600">{APP_VERSION}</div>}

          {/* Collapse toggle */}
          <div className="p-3 border-t border-white/5">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 text-xs transition-colors">
              {sidebarOpen ? '◂ Collapse' : '▸'}
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
